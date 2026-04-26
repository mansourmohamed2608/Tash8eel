/**
 * post-llm-gate.ts — Wave 3
 *
 * Pure deterministic gate that inspects an LLM reply AFTER generation and:
 *   1. Blocks/rewrites premature delivery/payment questions when
 *      salesStage < order_draft and purchaseIntentConfirmed = false.
 *   2. Blocks relisting the same choice options after activeChoice is resolved.
 *   3. Blocks any question kind already recorded in the askedQuestions ledger.
 *   4. Detects the main kind of question asked this turn for the ledger.
 *
 * Generic — no product names, no merchant names, no vertical-specific logic.
 */

import type { SalesStage } from "./sales-stage-advancer";
import type {
  ActiveChoiceFrame,
  AskedQuestion,
} from "../../domain/entities/conversation.entity";

export type { AskedQuestion };

export interface PostLlmGateInput {
  replyText: string;
  salesStage: SalesStage;
  activeChoice?: ActiveChoiceFrame | null;
  purchaseIntentConfirmed: boolean;
  askedQuestions?: AskedQuestion[];
  lastOfferedOptions?: string[];
  pendingCartItems?: unknown[];
}

export interface PostLlmGateOutput {
  replyText: string;
  blocked: boolean;
  blockReason?: string;
}

// Stages where delivery/payment/final-order questions are premature
const STAGES_BEFORE_ORDER_DRAFT = new Set<SalesStage>([
  "discovery",
  "qualification",
  "recommendation",
  "comparison",
  "objection_handling",
  "quote",
]);

// Generic Arabic + English delivery/address question keywords.
// No product names, no merchant names, no vertical-specific terms.
const DELIVERY_QUESTION_KW =
  /(?:عنوانك?|عنوان\s+التوصيل|هتستلم\s+(?:فين|منين)|تستلم\s+(?:فين|منين)|التوصيل\s+(?:لفين|لأين|لإين)|توصيل\s+(?:لفين|لأين)|منطقة\s+(?:التوصيل|الاستلام)|مكان\s+(?:التسليم|الاستلام|الاستلامك)|يوصل\s+(?:لفين|لأين)|delivery\s+(?:address|location|area)|your\s+address|ship\s+to|deliver\s+to|where.*deliver)/iu;

// Generic Arabic + English payment question keywords.
const PAYMENT_QUESTION_KW =
  /(?:طريقة\s+(?:الدفع|السداد)|بالكاش\s+ولا\s+بكارت|بكاش\s+ولا\s+(?:بكارت|كارت)|تدفع\s+(?:إزاي|ازاي)|هتدفع\s+(?:إزاي|ازاي)|كيف\s+(?:الدفع|ستدفع|تدفع)|payment\s+(?:method|type)|how\s+(?:will|would)\s+you\s+(?:like\s+to\s+)?pay|cash\s+or\s+(?:card|online))/iu;

/**
 * Walk backwards from the last question mark in `text` and extract
 * the question sentence plus its starting index.
 */
function findLastQuestion(
  text: string,
): { sentence: string; startIndex: number } | null {
  if (!text || !/[؟?]/.test(text)) return null;

  let lastQPos = -1;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === "؟" || text[i] === "?") {
      lastQPos = i;
      break;
    }
  }
  if (lastQPos < 0) return null;

  // Walk backwards to find sentence start
  let startIndex = lastQPos;
  while (startIndex > 0) {
    const ch = text[startIndex - 1];
    if (
      ch === "\n" ||
      ch === "." ||
      ch === "!" ||
      ch === "؟" ||
      ch === "?"
    ) {
      break;
    }
    startIndex--;
  }

  const sentence = text.slice(startIndex, lastQPos + 1).trim();
  if (sentence.length < 3) return null;
  return { sentence, startIndex };
}

/**
 * Strip the question sentence that starts at `startIndex` from `text`.
 * Trims trailing punctuation/whitespace from the remaining content.
 */
function stripQuestion(text: string, startIndex: number): string {
  return text
    .slice(0, startIndex)
    .replace(/[\s,،.!؟?\n]+$/, "")
    .trim();
}

export class PostLlmGate {
  /**
   * Inspect an LLM-generated reply and block or rewrite premature/repeated
   * questions. Returns `{ replyText, blocked, blockReason }`.
   *
   * When `blocked = true`, `replyText` is the cleaned version without the
   * offending question (and the useful answer content is preserved).
   */
  static gate(input: PostLlmGateInput): PostLlmGateOutput {
    const {
      salesStage,
      activeChoice,
      purchaseIntentConfirmed,
      askedQuestions = [],
      lastOfferedOptions: _lastOfferedOptions = [],
    } = input;
    let { replyText } = input;

    if (!replyText) return { replyText, blocked: false };

    // Is this a stage where delivery/payment/final-order questions are premature?
    const isPrematureStage =
      STAGES_BEFORE_ORDER_DRAFT.has(salesStage) && !purchaseIntentConfirmed;

    const lastQ = findLastQuestion(replyText);

    if (lastQ) {
      // 1. Block premature delivery question
      if (isPrematureStage && DELIVERY_QUESTION_KW.test(lastQ.sentence)) {
        const stripped = stripQuestion(replyText, lastQ.startIndex);
        if (stripped.length >= 2) {
          return {
            replyText: stripped,
            blocked: true,
            blockReason: "premature_delivery_question",
          };
        }
      }

      // 2. Block premature payment question
      if (isPrematureStage && PAYMENT_QUESTION_KW.test(lastQ.sentence)) {
        const stripped = stripQuestion(replyText, lastQ.startIndex);
        if (stripped.length >= 2) {
          return {
            replyText: stripped,
            blocked: true,
            blockReason: "premature_payment_question",
          };
        }
      }

      // 3. Block repeated delivery question (already in ledger)
      const deliveryAsked = askedQuestions.some((q) => q.kind === "delivery");
      if (deliveryAsked && DELIVERY_QUESTION_KW.test(lastQ.sentence)) {
        const stripped = stripQuestion(replyText, lastQ.startIndex);
        if (stripped.length >= 2) {
          return {
            replyText: stripped,
            blocked: true,
            blockReason: "repeated_delivery_question",
          };
        }
      }

      // 4. Block repeated payment question (already in ledger)
      const paymentAsked = askedQuestions.some((q) => q.kind === "payment");
      if (paymentAsked && PAYMENT_QUESTION_KW.test(lastQ.sentence)) {
        const stripped = stripQuestion(replyText, lastQ.startIndex);
        if (stripped.length >= 2) {
          return {
            replyText: stripped,
            blocked: true,
            blockReason: "repeated_payment_question",
          };
        }
      }

      // 5. Block relisted resolved choice — requires BOTH resolved option names
      //    AND a choice connector in the same question sentence.
      if (
        activeChoice?.status === "resolved" &&
        activeChoice.resolvedTo?.length
      ) {
        const resolvedOpts = activeChoice.resolvedTo;
        const allInQuestion = resolvedOpts.every((opt) =>
          lastQ.sentence.includes(opt),
        );
        const isChoiceConnector =
          /\s+(?:ولا|أو|أم|or)\s+/u.test(lastQ.sentence);
        if (allInQuestion && isChoiceConnector) {
          const stripped = stripQuestion(replyText, lastQ.startIndex);
          if (stripped.length >= 2) {
            return {
              replyText: stripped,
              blocked: true,
              blockReason: "repeated_choice_after_resolution",
            };
          }
        }
      }
    }

    return { replyText, blocked: false };
  }

  /**
   * Detect the main kind of question asked in a reply text for the ledger.
   * Returns `null` if the reply contains no question.
   * Generic — no product/merchant/category names.
   */
  static detectAskedQuestion(replyText: string): AskedQuestion | null {
    if (!replyText || !/[؟?]/.test(replyText)) return null;

    const now = new Date().toISOString();

    if (DELIVERY_QUESTION_KW.test(replyText)) {
      return { kind: "delivery", key: "delivery_address", askedAt: now };
    }
    if (PAYMENT_QUESTION_KW.test(replyText)) {
      return { kind: "payment", key: "payment_method", askedAt: now };
    }
    if (
      /(?:تأكد\s+(?:كده|الطلب)|أكدلي|تأكيد\s+(?:الطلب|كده)|موافق\s+على|confirm|تأكدلك)/i.test(
        replyText,
      )
    ) {
      return { kind: "confirmation", key: "order_confirmation", askedAt: now };
    }
    if (
      /(?:كمية|كام\s+(?:حبة|قطعة|كيلو|طن)|عدد\s+(?:القطع|الوحدات)|quantity|how\s+many)/i.test(
        replyText,
      )
    ) {
      return { kind: "quantity", key: "quantity", askedAt: now };
    }
    // Choice question: "X ولا Y؟" / "X or Y?" as the main question
    if (/[^\n؟?]{3,}\s+(?:ولا|أو|أم|or)\s+[^\n؟?]{3,}[؟?]/.test(replyText)) {
      return { kind: "choice", key: "product_choice", askedAt: now };
    }
    if (
      /(?:أنسب|أفضل\s+(?:خيار|اختيار)|ترشيح|توصية|اقتراح|recommend|suggest)/i.test(
        replyText,
      )
    ) {
      return { kind: "recommendation", key: "recommendation", askedAt: now };
    }

    return { kind: "other", key: "generic_question", askedAt: now };
  }
}
