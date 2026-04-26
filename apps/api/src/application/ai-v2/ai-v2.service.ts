import { Injectable, Logger } from "@nestjs/common";
import { Merchant } from "../../domain/entities/merchant.entity";
import { Conversation } from "../../domain/entities/conversation.entity";
import { Message } from "../../domain/entities/message.entity";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { AiV2RunResult } from "./ai-v2.types";
import { ConversationStateLoaderV2 } from "./conversation-state-loader";
import { MessageUnderstandingV2Service } from "./message-understanding";
import { SalesPolicyV2 } from "./sales-policy";
import { EmotionPolicyV2 } from "./emotion-policy";
import { HumanOperatorPolicyV2 } from "./human-operator-policy";
import { SalesStateReducerV2 } from "./sales-state-reducer";
import { RagContextBuilderServiceV2 } from "./rag-context-builder.service";
import { ReplyPlannerV2, recommendationHashFromCatalog } from "./reply-planner";
import { ReplyRendererServiceV2 } from "./reply-renderer.service";
import { ReplyValidatorV2 } from "./reply-validator";
import { StatePersisterV2 } from "./state-persister";
import { CustomerMemoryV2 } from "./customer-memory";
import { buildInboxLlmResultFromV2 } from "./ai-v2-llm-bridge";
import { ReplyComposer } from "../dialog/reply-composer";
import type {
  AiSalesState,
  MessageUnderstandingV2,
  EmotionPolicyOutputV2,
  SalesStageV2,
} from "./ai-v2.types";

export interface AiV2RunParams {
  merchant: Merchant;
  conversation: Conversation;
  recentMessages: Message[];
  catalogItems: CatalogItem[];
  customerMessage: string;
  channel?: "whatsapp" | "messenger" | "instagram";
  llmOptions?: { model?: string; maxTokens?: number };
}

@Injectable()
export class AiV2Service {
  private readonly logger = new Logger(AiV2Service.name);

  constructor(
    private readonly understandingSvc: MessageUnderstandingV2Service,
    private readonly ragBuilder: RagContextBuilderServiceV2,
    private readonly renderer: ReplyRendererServiceV2,
  ) {}

  async run(params: AiV2RunParams): Promise<AiV2RunResult> {
    const loaded = ConversationStateLoaderV2.load({
      conversation: params.conversation,
      recentMessages: params.recentMessages,
      customerMessage: params.customerMessage,
      channel: params.channel,
    });

    const understanding = this.understandingSvc.analyze(params.customerMessage);
    const priorEmotion = loaded.priorAiV2?.customerEmotion as
      | AiSalesState["customerEmotion"]
      | undefined;

    const { stage, nextBestAction } = SalesPolicyV2.decide({
      loaded,
      understanding,
    });

    const emotion = EmotionPolicyV2.decide({
      understanding,
      stage,
      priorCustomerEmotion: priorEmotion,
    });

    const operator = HumanOperatorPolicyV2.decide({
      merchant: params.merchant,
      understanding,
      emotion,
      nextBestAction,
    });

    const ctxRecord = (params.conversation.context || {}) as Record<
      string,
      unknown
    >;
    const businessType =
      typeof ctxRecord.businessType === "string"
        ? ctxRecord.businessType
        : undefined;

    const rag = await this.ragBuilder.build({
      merchantId: params.merchant.id,
      customerMessage: params.customerMessage,
      catalogItems: params.catalogItems,
      businessType,
    });

    const plan = ReplyPlannerV2.plan({
      nextBestAction,
      stage,
      operator,
      emotion,
      rag,
    });

    const recHash = recommendationHashFromCatalog(rag);
    const salesState = SalesStateReducerV2.reduce({
      loaded,
      understanding,
      nextBestAction,
      stage,
      customerEmotion: emotion.customerEmotion,
    });
    if (recHash) {
      salesState.lastRecommendationHash = recHash;
    }

    const memoryBrief = CustomerMemoryV2.buildBrief(loaded);

    const rendered = await this.renderer.render(
      {
        merchant: params.merchant,
        customerMessage: params.customerMessage,
        memoryBrief,
        plan,
        rag,
      },
      params.llmOptions,
    );

    let replyText: string;
    let tokensUsed = 0;
    let llmUsed = false;
    let renderOut = rendered?.output;
    let validationFailures: string[] = [];

    if (!renderOut) {
      replyText = deterministicFallback(understanding, emotion, stage);
      this.logger.warn({
        msg: "ai_v2_render_fallback",
        stage,
        reason: "no_llm",
      });
    } else {
      const validated = ReplyValidatorV2.validate({
        render: renderOut,
        plan,
        state: salesState,
        rag,
        allowedFactIds: plan.allowedFactIds,
      });
      validationFailures = validated.failures;
      replyText = ReplyComposer.polish(validated.replyText, {
        merchant: params.merchant,
        recentMessages: params.recentMessages,
      });
      tokensUsed = rendered?.tokensUsed ?? 0;
      llmUsed = true;
      if (!validated.ok) {
        this.logger.warn({
          msg: "ai_v2_validator_adjusted",
          failures: validated.failures,
        });
      }
    }

    const isGreeting = understanding.coarseIntent === "greeting";
    const llmResultAdapter = buildInboxLlmResultFromV2({
      replyText,
      reasoning: `ai_v2:${nextBestAction.type}|${stage}`,
      isGreeting,
      tokensUsed,
      llmUsed,
    });

    const persisted = SalesStateReducerV2.toPersisted({
      ...salesState,
      lastComplaintSummary:
        understanding.coarseIntent === "complaint"
          ? params.customerMessage.slice(0, 200)
          : salesState.lastComplaintSummary,
      lastFeedbackSummary:
        understanding.coarseIntent === "feedback_positive" ||
        understanding.coarseIntent === "feedback_negative"
          ? params.customerMessage.slice(0, 200)
          : salesState.lastFeedbackSummary,
    });

    const contextPatch = StatePersisterV2.buildContextPatch(persisted);

    return {
      replyText,
      llmResultAdapter,
      contextPatch: contextPatch as Record<string, unknown>,
      mediaAttachments: [],
      debug: {
        understanding,
        ragSummary: {
          catalogCount: rag.catalogFacts.length,
          kbCount: rag.kbFacts.length,
        },
        plan,
        validationFailures,
        usedFactIds: renderOut?.used_fact_ids || [],
      },
      tokensUsed,
      llmUsed,
    };
  }
}

function deterministicFallback(
  understanding: MessageUnderstandingV2,
  emotion: EmotionPolicyOutputV2,
  stage: SalesStageV2,
): string {
  if (emotion.empathyFirst && understanding.coarseIntent === "complaint") {
    return "حقك علينا، وأسفين لو فيه إزعاج. اكتب لي بالظبط إيه اللي حصل وهنتابع معاك خطوة بخطوة.";
  }
  if (understanding.coarseIntent === "greeting") {
    return "وعليكم السلام ورحمة الله 😊 أهلاً بيك، تحب أساعدك في حاجة معينة؟";
  }
  if (understanding.coarseIntent === "feedback_positive") {
    return "مبسوطين إنك راضي 😊 لو حابب نكمل في طلب أو استفسار، قولّي.";
  }
  if (stage === "support") {
    return "تمام، خليني أجاوبك بدقة — اكتب سؤالك باختصار وهرد عليك فورًا.";
  }
  return "معاك، قولّي تحب نعمل إيه؟";
}
