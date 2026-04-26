import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Merchant } from "../../domain/entities/merchant.entity";
import { Conversation } from "../../domain/entities/conversation.entity";
import { Message } from "../../domain/entities/message.entity";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { ConversationStateLoaderV2 } from "./conversation-state-loader";
import { MessageUnderstandingV2Service } from "./message-understanding";
import { SalesPolicyV2 } from "./sales-policy";
import { EmotionPolicyV2 } from "./emotion-policy";
import { HumanOperatorPolicyV2 } from "./human-operator-policy";
import { SalesStateReducerV2 } from "./sales-state-reducer";
import { RagContextBuilderServiceV2 } from "./rag-context-builder.service";
import { ReplyPlannerV2 } from "./reply-planner";
import { ReplyRendererServiceV2 } from "./reply-renderer.service";
import { ReplyValidatorV2 } from "./reply-validator";
import { StatePersisterV2 } from "./state-persister";
import {
  hasFixtureLikeRagFacts,
  RuntimeContextBuilderV2,
} from "./runtime-context-builder";
import { AiV2TraceLogger } from "./ai-v2-trace-logger";
import { buildInboxLlmResultFromV2 } from "./ai-v2-llm-bridge";
import { ActionExecutorV2 } from "./action-executor";
import {
  AiV2RenderOutput,
  AiV2RunResult,
  EMPTY_RAG_CONTEXT_V2,
  MessageUnderstandingV2,
  ReplyPlanV2,
  RuntimeContextV2,
  ToolActionResultV2,
} from "./ai-v2.types";

export interface AiV2RunParams {
  merchant: Merchant;
  conversation: Conversation;
  recentMessages: Message[];
  catalogItems: CatalogItem[];
  customerMessage: string;
  channel?: "whatsapp" | "messenger" | "instagram";
  correlationId?: string;
  llmOptions?: { model?: string; maxTokens?: number };
}

@Injectable()
export class AiV2Service {
  private readonly logger = new Logger(AiV2Service.name);

  constructor(
    private readonly understandingSvc: MessageUnderstandingV2Service,
    private readonly ragBuilder: RagContextBuilderServiceV2,
    private readonly renderer: ReplyRendererServiceV2,
    private readonly actionExecutor: ActionExecutorV2,
    private readonly config: ConfigService,
  ) {}

  async run(params: AiV2RunParams): Promise<AiV2RunResult> {
    const start = Date.now();
    const loaded = ConversationStateLoaderV2.load({
      conversation: params.conversation,
      recentMessages: params.recentMessages,
      customerMessage: params.customerMessage,
      channel: params.channel,
    });

    const baseState = SalesStateReducerV2.buildBaseState(loaded);
    const initialRuntimeContext = RuntimeContextBuilderV2.build({
      merchant: params.merchant,
      loaded,
      salesState: baseState,
      rag: EMPTY_RAG_CONTEXT_V2,
    });

    const understanding = await this.understandingSvc.analyze(
      params.customerMessage,
      initialRuntimeContext,
    );

    const { stage, nextBestAction } = SalesPolicyV2.decide({
      loaded,
      understanding,
    });
    const emotion = EmotionPolicyV2.decide({
      understanding,
      stage,
      priorCustomerEmotion: loaded.priorAiV2?.customerEmotion,
    });
    HumanOperatorPolicyV2.decide({
      merchant: params.merchant,
      understanding,
      emotion,
      nextBestAction,
    });

    let salesState = SalesStateReducerV2.reduce({
      loaded,
      understanding,
      nextBestAction,
      stage,
      customerEmotion: emotion.customerEmotion,
    });

    const rag = await this.ragBuilder.build({
      merchantId: params.merchant.id,
      merchant: {
        whatsappNumber: params.merchant.whatsappNumber,
        address: params.merchant.address,
        workingHours: params.merchant.workingHours,
        name: params.merchant.name,
      },
      customerMessage: params.customerMessage,
      catalogItems: params.catalogItems,
      businessType: extractBusinessType(params.conversation.context),
    });
    const fixtureFactDetected = hasFixtureLikeRagFacts(rag);
    if (
      fixtureFactDetected &&
      String(
        this.config.get<string>("NODE_ENV") || process.env.NODE_ENV || "",
      ).toLowerCase() === "production"
    ) {
      this.logger.error({
        msg: "ai_v2_fixture_facts_blocked_in_production",
        merchantId: params.merchant.id,
        catalogFactIds: rag.catalogFacts
          .filter((fact) => fact.isFixture)
          .map((fact) => fact.catalogItemId)
          .slice(0, 20),
      });
    }

    let runtimeContext = RuntimeContextBuilderV2.build({
      merchant: params.merchant,
      loaded,
      salesState,
      rag,
    });
    let plan = ReplyPlannerV2.plan({ runtimeContext, understanding });

    salesState = SalesStateReducerV2.applyPlan(salesState, plan);
    runtimeContext = RuntimeContextBuilderV2.build({
      merchant: params.merchant,
      loaded,
      salesState,
      rag,
    });
    plan = ReplyPlannerV2.plan({ runtimeContext, understanding });

    const toolResults = await this.actionExecutor.execute({
      runtimeContext,
      plan,
    });
    plan = withToolStatuses(plan, toolResults);

    const rendered = await this.renderer.render(
      {
        runtimeContext,
        understanding,
        plan,
        validatorRules: plan.mustNotInvent,
        toolResults,
      },
      params.llmOptions,
    );

    const renderOut =
      rendered?.output || buildEmergencyRenderOutput(understanding, plan);
    const validation = ReplyValidatorV2.validate({
      render: renderOut,
      runtimeContext,
      understanding,
      plan,
      toolResults,
    });

    const tokensUsed = rendered?.tokensUsed ?? 0;
    const rendererUsedOpenAI = Boolean(rendered?.usedOpenAI);
    const fallbackUsed = understanding.fallbackUsed || !rendered;

    const persisted = SalesStateReducerV2.toPersisted({
      ...salesState,
      lastRecommendationHash:
        stage === "recommendation"
          ? currentRecommendationHash(plan) || salesState.lastRecommendationHash
          : salesState.lastRecommendationHash,
      lastComplaintSummary: understanding.intentTags.includes("complaint")
        ? params.customerMessage.slice(0, 200)
        : salesState.lastComplaintSummary,
      lastFeedbackSummary:
        understanding.intentTags.includes("feedback_positive") ||
        understanding.intentTags.includes("feedback_negative")
          ? params.customerMessage.slice(0, 200)
          : salesState.lastFeedbackSummary,
    });
    const contextPatch = StatePersisterV2.buildContextPatch(persisted);

    this.safeTrace({
      params,
      loaded,
      runtimeContext,
      understanding,
      plan,
      toolResults,
      validationFailures: validation.failures,
      fallbackUsed,
      tokensUsed,
      rendererUsedOpenAI,
      fixtureFactDetected,
      latencyMs: Date.now() - start,
    });

    const llmResultAdapter = buildInboxLlmResultFromV2({
      replyText: validation.replyText,
      reasoning: `ai_v2:${plan.nextBestAction}|${stage}`,
      isGreeting:
        understanding.intentTags.includes("greeting") && stage === "greeting",
      tokensUsed,
      llmUsed: understanding.usedOpenAI || rendererUsedOpenAI,
    });

    return {
      replyText: validation.replyText,
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
        toolResults,
        validationFailures: validation.failures,
        usedFactIds: renderOut.used_fact_ids || [],
        fallbackUsed,
      },
      tokensUsed,
      llmUsed: understanding.usedOpenAI || rendererUsedOpenAI,
    };
  }

  private safeTrace(input: {
    params: AiV2RunParams;
    loaded: ReturnType<typeof ConversationStateLoaderV2.load>;
    runtimeContext: RuntimeContextV2;
    understanding: MessageUnderstandingV2;
    plan: ReplyPlanV2;
    toolResults: ToolActionResultV2[];
    validationFailures: string[];
    fallbackUsed: boolean;
    tokensUsed: number;
    rendererUsedOpenAI: boolean;
    fixtureFactDetected: boolean;
    latencyMs: number;
  }) {
    try {
      AiV2TraceLogger.logTurn({
        correlationId: input.params.correlationId,
        merchantId: input.params.merchant.id,
        conversationId: input.params.conversation.id,
        aiReplyEngine: "v2",
        nodeEnv: String(
          this.config.get<string>("NODE_ENV") || process.env.NODE_ENV || "",
        ),
        localTestMode:
          String(
            this.config.get<string>("AI_V2_LOCAL_TEST_MODE") || "",
          ).toLowerCase() === "true",
        usedOpenAI: {
          understanding: input.understanding.usedOpenAI,
          renderer: input.rendererUsedOpenAI,
        },
        understanding: {
          domain: input.understanding.domain,
          intentTags: input.understanding.intentTags,
        },
        stageBefore:
          (input.loaded.priorAiV2?.salesStage as string | undefined) ||
          (input.loaded.priorAiV2?.stage as string | undefined) ||
          "unknown",
        stageAfter: input.runtimeContext.aiV2State.salesStage,
        nextBestAction: input.plan.nextBestAction,
        toolResults: input.toolResults,
        activeQuestionKind: input.runtimeContext.activeQuestion?.kind ?? null,
        selectedItemsCount: input.runtimeContext.selectedItems.length,
        orderDraft: input.runtimeContext.orderDraft
          ? {
              status: input.runtimeContext.orderDraft.status,
              missingFieldsCount:
                input.runtimeContext.orderDraft.missingFields.length,
            }
          : null,
        complaintState: input.runtimeContext.complaintState
          ? { status: input.runtimeContext.complaintState.status }
          : null,
        merchantFactIds: input.runtimeContext.merchantFacts.map(
          (fact) => fact.id,
        ),
        merchantFactSources: input.runtimeContext.merchantFacts.map((fact) => ({
          id: fact.id,
          type: fact.type,
          source: fact.source,
        })),
        merchantPhoneSource:
          input.runtimeContext.merchantFacts.find(
            (fact) => fact.type === "phone",
          )?.source || null,
        catalogFactSummaries: input.runtimeContext.ragFacts.catalogFacts.map(
          (fact) => ({
            id: fact.id,
            title: fact.customerFacingName,
            customerVisibleSku: fact.customerVisibleSku === true,
            fixture: fact.isFixture === true,
          }),
        ),
        fixtureFactDetected: input.fixtureFactDetected,
        ragCounts: {
          catalogFacts: input.runtimeContext.ragFacts.catalogFacts.length,
          kbFacts: input.runtimeContext.ragFacts.kbFacts.length,
        },
        validationFailures: input.validationFailures,
        fallbackUsed: input.fallbackUsed,
        understandingError: input.understanding.errorCode
          ? { code: input.understanding.errorCode }
          : undefined,
        rendererError: input.rendererUsedOpenAI
          ? undefined
          : { code: input.fallbackUsed ? "RENDERER_UNAVAILABLE" : undefined },
        tokensUsed: input.tokensUsed,
        latencyMs: input.latencyMs,
      });
    } catch (error: any) {
      this.logger.debug({
        msg: "ai_v2_trace_failed",
        name: String(error?.name || "Error"),
      });
    }
  }
}

function withToolStatuses(
  plan: ReplyPlanV2,
  results: ToolActionResultV2[],
): ReplyPlanV2 {
  return {
    ...plan,
    toolActions: plan.toolActions.map((action) => {
      const result = results.find((r) => r.actionName === action.actionName);
      if (!result) return action;
      return {
        ...action,
        status: !result.available
          ? "not_available"
          : result.success
            ? "done"
            : result.attempted
              ? "failed"
              : action.status,
      };
    }),
  };
}

function buildEmergencyRenderOutput(
  understanding: MessageUnderstandingV2,
  plan: ReplyPlanV2,
): AiV2RenderOutput {
  const reply = plan.offTopicRedirectRequired
    ? "أقدر أساعدك في أسئلة المتجر والمنتجات والطلبات فقط. ابعتلي طلبك من المتجر."
    : understanding.intentTags.includes("complaint")
      ? "حقك علينا. ابعت رقم الطلب وتفاصيل المشكلة عشان أسجلها بدقة."
      : "معاك. ابعتلي تفاصيل طلبك أو سؤالك عن المتجر.";
  return {
    customer_reply: reply,
    state_patch: {},
    used_fact_ids: [],
    risk_flags: ["emergency_fallback"],
    confidence: 0.3,
  };
}

function currentRecommendationHash(plan: ReplyPlanV2): string | null {
  return (
    plan.forbiddenRepeats
      .find((item) => item.startsWith("recommendation_hash:"))
      ?.replace("recommendation_hash:", "") || null
  );
}

function extractBusinessType(context: unknown): string | undefined {
  const record =
    context && typeof context === "object" && !Array.isArray(context)
      ? (context as Record<string, unknown>)
      : {};
  return typeof record.businessType === "string"
    ? record.businessType
    : undefined;
}
