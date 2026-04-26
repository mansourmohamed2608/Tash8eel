import {
  AiSalesState,
  AiV2RenderOutput,
  RagContextV2,
  SalesStageV2,
} from "./ai-v2.types";
import { ReplyPlanV2 } from "./ai-v2.types";

const DELIVERY_RE =
  /(?:عنوانك?|عنوان\s+التوصيل|هتستلم\s+(?:فين|منين)|توصيل\s+(?:لفين|لأين)|delivery\s+(?:address|location)|your\s+address|deliver\s+to)/iu;
const PAYMENT_RE =
  /(?:طريقة\s+(?:الدفع|السداد)|تدفع\s+(?:إزاي|ازاي)|payment\s+(?:method|type)|how\s+(?:will|would)\s+you\s+pay)/iu;
const INTERNAL_MARKERS =
  /\[internal\]|visibility:\s*internal|kb\s*internal|staff_only|INTERNAL_ONLY/i;

export interface ReplyValidationResultV2 {
  ok: boolean;
  replyText: string;
  failures: string[];
}

/**
 * Validates v2 renderer output against business and safety rules.
 */
export class ReplyValidatorV2 {
  static validate(input: {
    render: AiV2RenderOutput;
    plan: ReplyPlanV2;
    state: AiSalesState;
    rag: RagContextV2;
    allowedFactIds: string[];
  }): ReplyValidationResultV2 {
    const failures: string[] = [];
    let replyText = String(input.render.customer_reply || "").trim();

    if (!replyText) {
      failures.push("empty_reply");
      replyText = fallbackReply(
        input.state.stage,
        input.plan.emotion.empathyFirst,
      );
    }

    if (INTERNAL_MARKERS.test(replyText)) {
      failures.push("possible_internal_kb_leakage");
      replyText = stripInternal(replyText);
    }

    const questions = replyText.match(/[؟?]/g) || [];
    if (questions.length > 1) {
      failures.push("more_than_one_question");
      replyText = keepFirstQuestionOnly(replyText);
    }

    const stageAllowsPayment = input.state.stage === "checkout";
    const stageAllowsDeliveryAsk =
      input.state.stage === "order_draft" || input.state.stage === "checkout";
    if (!stageAllowsPayment && PAYMENT_RE.test(replyText)) {
      failures.push("payment_language_before_checkout");
      replyText = stripPaymentSentences(replyText);
    }
    if (!stageAllowsDeliveryAsk && DELIVERY_RE.test(replyText)) {
      failures.push("delivery_language_before_order_draft");
      replyText = stripDeliverySentences(replyText);
    }

    if (
      input.state.customerEmotion === "complaining" ||
      input.state.customerEmotion === "frustrated"
    ) {
      const ok = /حقك|معلش|اسف|آسف|اسفين|مبسوطين|فاهم|معاك|خليني|هن/i.test(
        replyText.slice(0, 120),
      );
      if (!ok) failures.push("complaint_missing_empathy_opener");
    }

    const allowed = new Set(input.allowedFactIds);
    for (const id of input.render.used_fact_ids || []) {
      if (!allowed.has(id)) {
        failures.push(`used_fact_not_allowed:${id}`);
      }
    }

    if (
      input.state.lastRecommendationHash &&
      input.plan.plannerNotes.includes("recHash=") &&
      input.state.stage === "recommendation"
    ) {
      /* reserved for anti-repeat wave 3 */
    }

    return { ok: failures.length === 0, replyText, failures };
  }
}

function fallbackReply(stage: SalesStageV2, empathy: boolean): string {
  if (stage === "complaint" && empathy) {
    return "حقك علينا، وأسفين لو حصل إزعاج. قولّي بالظبط إيه اللي حصل؟";
  }
  if (stage === "greeting") {
    return "أهلاً بيك، تحب أساعدك في إيه؟";
  }
  return "معاك، قولّي تحب نعمل إيه بالظبط؟";
}

function stripInternal(text: string): string {
  return text.replace(INTERNAL_MARKERS, "").trim();
}

function keepFirstQuestionOnly(text: string): string {
  const marks: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "؟" || text[i] === "?") marks.push(i);
  }
  if (marks.length <= 1) return text;
  const cut = marks[1];
  return text
    .slice(0, cut)
    .replace(/[\s,،.!؟?\n]+$/, "")
    .trim();
}

function stripPaymentSentences(text: string): string {
  return text
    .replace(PAYMENT_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripDeliverySentences(text: string): string {
  return text
    .replace(DELIVERY_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
