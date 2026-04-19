import { Merchant } from "../../domain/entities/merchant.entity";

export interface DeEscalationResult {
  reply: string;
  reasoning: string;
}

const HUMAN_PROMISE_PATTERNS = [
  /ه\s*بعت|هبعتها|ه\s*وصل|هوصل/i,
  /هيتواصل|حد\s+هيكلمك|هيرد\s+عليك\s+حد/i,
  /هحوّ?لك|تحويلك|أحوّ?لك/i,
  /زميل|أحد\s+الزملاء|المسؤول\s+هيتواصل/i,
];

export class DeEscalator {
  static compose(customerMessage: string, merchant: Merchant): DeEscalationResult {
    const normalized = String(customerMessage || "").trim();
    const merchantName = String(merchant?.name || "المتجر").trim();
    const config = (merchant?.config || {}) as Record<string, any>;
    const agentAvailability = config.agent_availability || {};
    const backup = String(agentAvailability.backup || "none").toLowerCase();

    const hasComplaint = /شكوى|مشكلة|مشكل[هة]|متضايق|زعلان|غلط|حقوق/i.test(
      normalized,
    );
    const hasHumanDemand =
      /مسؤول|موظف|بشري|مدير|اكلم|أكلم|supervisor|manager|human/i.test(
        normalized,
      );

    const ack = hasComplaint
      ? "أيوة معاك، احكيلي اللي حصل بالظبط."
      : hasHumanDemand
        ? "أيوة معاك، أنا سامعك."
        : `معاك من ${merchantName}.`;

    const nextNeed = hasComplaint
      ? "قولّي المشكلة حصلت في طلب إيه أو مع أي منتج، ونحلّها سوا."
      : "قولّي محتاج إيه بالظبط وأنا أتابع معاك خطوة بخطوة.";

    // Even if a merchant has a queue/backup configured, the inbox reply should
    // not invent a transfer. The channel can route operationally elsewhere, but
    // customer copy stays as the person currently handling the conversation.
    const suffix =
      backup === "queue" || backup === "voicemail"
        ? "أنا معاك هنا دلوقتي."
        : "";

    return {
      reply: [ack, nextNeed, suffix].filter(Boolean).join(" "),
      reasoning: "dialog_deescalator:human_in_character",
    };
  }

  static containsHumanPromise(reply: string): boolean {
    return HUMAN_PROMISE_PATTERNS.some((pattern) => pattern.test(reply || ""));
  }
}
