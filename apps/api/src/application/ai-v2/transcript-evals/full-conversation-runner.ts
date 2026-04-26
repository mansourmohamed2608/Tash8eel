import { ConfigService } from "@nestjs/config";
import { ActionExecutorV2 } from "../action-executor";
import { AiV2Service } from "../ai-v2.service";
import { MessageUnderstandingV2Service } from "../message-understanding";
import { RagContextBuilderServiceV2 } from "../rag-context-builder.service";
import { ReplyRendererServiceV2 } from "../reply-renderer.service";
import { ToolRegistryV2 } from "../tool-registry";
import {
  fixtureConversation,
  fixtureMerchant,
  fixtureRecentMessages,
} from "../local-test-fixtures";
import type { CatalogItem } from "../../../domain/entities/catalog.entity";
import type { Conversation } from "../../../domain/entities/conversation.entity";
import type { Message } from "../../../domain/entities/message.entity";
import type { Merchant } from "../../../domain/entities/merchant.entity";

export interface FullConversationTurn {
  customer: string;
  assistant: string;
  validationFailures: string[];
}

export interface FullConversationResult {
  transcript: FullConversationTurn[];
  finalState: any;
  orderDraftQuantityIs200: boolean;
  complaintStatePreserved: boolean;
  internalLeakageDetected: boolean;
  forbiddenCompletionClaimDetected: boolean;
}

const INTERNAL_LEAK_RE =
  /\b(?:BAG-001|cat:[A-Za-z0-9:_-]+|mf:phone|source\s*:|fixture|test\s+data|internal|local\s+mode|AI_V2_LOCAL_TEST_MODE|demo\s+mode)\b/iu;
const FORBIDDEN_COMPLETION_RE =
  /(?:تم\s+(?:إنشاء|تأكيد|تسجيل)\s+(?:ال)?(?:طلب|اوردر|الأوردر)|order\s+(?:created|confirmed|completed)|طلبك\s+(?:في الطريق|اتشحن|وصل|جاهز)|payment\s+(?:verified|confirmed))/iu;

export async function runAiV2FullConversationTranscript(): Promise<FullConversationResult> {
  const config = new ConfigService({
    AI_V2_LOCAL_TEST_MODE: "true",
    OPENAI_API_KEY: "",
    NODE_ENV: "test",
    AI_REPLY_ENGINE: "v2",
  } as any);
  const understanding = new MessageUnderstandingV2Service(config);
  const ragBuilder = new RagContextBuilderServiceV2({
    async hasStructuredKb() {
      return false;
    },
    async searchChunks() {
      return [];
    },
    async getAllRules() {
      return {};
    },
  } as any);
  const renderer = new ReplyRendererServiceV2(config);
  const ai = new AiV2Service(
    understanding,
    ragBuilder,
    renderer,
    new ActionExecutorV2(new ToolRegistryV2()),
    config,
  );

  const merchant = fixtureMerchant({ withPhone: true }) as Merchant;
  const conversation = fixtureConversation({
    olderSummary: "Customer is chatting on WhatsApp with the store.",
  });
  const catalogItems = fixtureCatalogForConversation();
  const customerTurns = [
    "السلام عليكم",
    "عندكم هدايا عيد ميلاد؟",
    "عايز اعمل اوردر",
    "200",
    "فين الاوردر؟",
    "المنتج مش زي الصور",
    "ميسي بيلعب فين؟",
  ];

  const transcript: FullConversationTurn[] = [];
  let recentMessages: Message[] = [];
  let finalState: any = null;

  for (const customer of customerTurns) {
    const result = await ai.run({
      merchant,
      conversation: conversation as Conversation,
      recentMessages,
      catalogItems,
      customerMessage: customer,
      channel: "whatsapp",
      correlationId: "full-conversation-test",
      llmOptions: { model: "gpt-4o-mini", maxTokens: 380 },
    });

    (conversation.context as any) = {
      ...(conversation.context || {}),
      ...(result.contextPatch || {}),
    };
    finalState = (conversation.context as any).aiV2;
    transcript.push({
      customer,
      assistant: result.replyText,
      validationFailures: result.debug.validationFailures || [],
    });

    const now = new Date();
    recentMessages = recentMessages.concat(
      fixtureRecentMessages([
        { role: "customer", text: customer },
        { role: "assistant", text: result.replyText },
      ]).map(
        (message) => ({ ...message, createdAt: now, updatedAt: now }) as any,
      ),
    );
  }

  const assistantText = transcript.map((turn) => turn.assistant).join("\n");
  const failures = transcript.flatMap((turn) => turn.validationFailures);
  return {
    transcript,
    finalState,
    orderDraftQuantityIs200: finalState?.orderDraft?.quantity === 200,
    complaintStatePreserved: Boolean(finalState?.complaintState),
    internalLeakageDetected:
      INTERNAL_LEAK_RE.test(assistantText) ||
      failures.some((failure) => failure.startsWith("internal_")),
    forbiddenCompletionClaimDetected:
      FORBIDDEN_COMPLETION_RE.test(assistantText),
  };
}

function fixtureCatalogForConversation(): CatalogItem[] {
  return [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      merchantId: "m_local_fixture",
      sku: "BAG-001",
      nameAr: "هدية عيد ميلاد فاخرة",
      descriptionAr: "باقة مناسبة للهدايا",
      basePrice: 120,
      variants: [],
      options: [],
      tags: ["gift", "birthday"],
      isAvailable: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "perf-visible",
      merchantId: "m_local_fixture",
      sku: "PERF-RED-22",
      nameAr: "عطر أحمر",
      basePrice: 220,
      variants: [],
      options: [],
      tags: ["customerVisibleSku:true"],
      isAvailable: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      customerVisibleSku: true,
    } as CatalogItem,
  ];
}

if (require.main === module) {
  runAiV2FullConversationTranscript()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
      if (
        !result.orderDraftQuantityIs200 ||
        !result.complaintStatePreserved ||
        result.internalLeakageDetected ||
        result.forbiddenCompletionClaimDetected
      ) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(String(error?.stack || error?.message || error));
      process.exitCode = 1;
    });
}
