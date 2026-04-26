import type { SalesStageV2 } from "../ai-v2.types";
import { MessageUnderstandingV2Service } from "../message-understanding";
import { SalesPolicyV2 } from "../sales-policy";
import { ConversationStateLoaderV2 } from "../conversation-state-loader";
import { Conversation } from "../../../domain/entities/conversation.entity";
import { ConversationState } from "../../../shared/constants/enums";
import {
  empathyIfComplaint,
  greetingNoAggressiveCatalogPitch,
  maxOneQuestion,
  noDeliveryKeywordsUnlessStage,
  noInternalKbMarkers,
  noPaymentKeywordsUnlessStage,
} from "./assertions";

export interface TranscriptScenarioJson {
  id: string;
  description: string;
  customerMessage: string;
  expect: {
    stage: SalesStageV2;
    isGreetingScenario: boolean;
    userComplaint: boolean;
  };
}

export interface TranscriptEvalResult {
  scenarioId: string;
  pass: boolean;
  failures: string[];
  detected: {
    coarseIntent: string;
    stage: SalesStageV2;
  };
  /** Deterministic fallback reply used when OpenAI is unavailable in CI */
  fallbackReply: string;
}

const understandingSvc = new MessageUnderstandingV2Service();

/**
 * Runs planner-level checks for a scenario (no live LLM).
 */
export function runTranscriptScenario(
  scenario: TranscriptScenarioJson,
): TranscriptEvalResult {
  const conversation = minimalConversation();
  const loaded = ConversationStateLoaderV2.load({
    conversation,
    recentMessages: [],
    customerMessage: scenario.customerMessage,
    channel: "whatsapp",
  });
  const u = understandingSvc.analyze(scenario.customerMessage);
  const { stage } = SalesPolicyV2.decide({ loaded, understanding: u });

  const failures: string[] = [];
  if (stage !== scenario.expect.stage) {
    failures.push(`stage_want_${scenario.expect.stage}_got_${stage}`);
  }

  const fallbackReply = pickFallback(u.coarseIntent, stage);

  if (!maxOneQuestion(fallbackReply)) {
    failures.push("fallback_more_than_one_question");
  }
  if (!noPaymentKeywordsUnlessStage(stage, fallbackReply)) {
    failures.push("early_payment_language");
  }
  if (!noDeliveryKeywordsUnlessStage(stage, fallbackReply)) {
    failures.push("early_delivery_language");
  }
  if (!noInternalKbMarkers(fallbackReply)) {
    failures.push("internal_kb_markers");
  }
  if (
    !empathyIfComplaint(scenario.expect.userComplaint, fallbackReply) &&
    scenario.expect.userComplaint
  ) {
    failures.push("missing_empathy");
  }
  if (
    !greetingNoAggressiveCatalogPitch(
      scenario.expect.isGreetingScenario,
      fallbackReply,
    )
  ) {
    failures.push("greeting_too_heavy");
  }

  return {
    scenarioId: scenario.id,
    pass: failures.length === 0,
    failures,
    detected: { coarseIntent: u.coarseIntent, stage },
    fallbackReply,
  };
}

function minimalConversation(): Conversation {
  return {
    id: "eval-conv",
    merchantId: "eval-merchant",
    senderId: "eval-sender",
    state: ConversationState.GREETING,
    context: {},
    cart: { items: [], total: 0, subtotal: 0, discount: 0, deliveryFee: 0 },
    collectedInfo: {},
    missingSlots: [],
    followupCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Conversation;
}

function pickFallback(coarse: string, stage: SalesStageV2): string {
  if (coarse === "complaint") {
    return "حقك علينا، وأسفين لو فيه إزعاج. اكتب لي بالظبط إيه اللي حصل وهنتابع معاك خطوة بخطوة.";
  }
  if (coarse === "greeting") {
    return "وعليكم السلام ورحمة الله 😊 أهلاً بيك، تحب أساعدك في حاجة معينة؟";
  }
  if (coarse === "feedback_positive") {
    return "مبسوطين إنك راضي 😊 لو حابب نكمل في طلب أو استفسار، قولّي.";
  }
  if (stage === "support") {
    return "تمام، خليني أجاوبك بدقة — اكتب سؤالك باختصار وهرد عليك فورًا.";
  }
  return "معاك، قولّي تحب نعمل إيه؟";
}
