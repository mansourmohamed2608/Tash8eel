import { Merchant } from "../../domain/entities/merchant.entity";
import { Message } from "../../domain/entities/message.entity";
import { DialogIntent } from "./intent-classifier";

export interface ReplyIntent {
  intent?: DialogIntent;
  acknowledgement?: string;
  answer?: string;
  answerFacts?: string[];
  nextQuestion?: string;
  closing?: string;
  mediaWillBeAttached?: boolean;
  constraintAxes?: string[];
  slotPlan?: { nextSlot: string | null; promptSeed?: string };
  forbiddenClaims?: string[];
  salesStage?: string;
}

export interface ReplyComposerOptions {
  merchant?: Merchant;
  recentMessages?: Message[];
  signature?: string;
}

const BOT_WORD_PATTERNS = [
  /\bAI\b/gi,
  /\bbot\b/gi,
  /ذكاء\s*اصطناعي/gi,
  /مساعد\s*ذكي/gi,
  /بوت/gi,
  /نظام\s*آلي/gi,
];

const STIFF_OPENERS = [
  /^بكل\s+سرور[،,\s]*/i,
  /^سعيد\s+بمساعدتك[،,\s]*/i,
  /^أنا\s+هنا\s+بس\s+لمساعدتك[^\n.؟!]*[.؟!\s]*/i,
];

const STIFF_PHRASES: Array<[RegExp, string]> = [
  [/أقدر\s+أساعدك(?:\s+بشكل\s+أفضل)?/gi, "أساعدك"],
  [/ممكن\s+تساعدني(?:\s+وتقول\s+لي)?/gi, "قولّي"],
  [/ممكن\s+تخبرني/gi, "قولّي"],
  [/ممكن\s+تخبريني/gi, "قولّي"],
  [/يرجى\s+تزويدي[^\n.؟!]*/gi, "قولّي"],
  [/يرجى(?:\s+توضيح)?/gi, "قولّي"],
  [/هل\s+تريد/gi, "تحب"],
  [/هل\s+ترغب/gi, "تحب"],
  [/هل\s+لديك/gi, "عندك"],
  [/هل\s+(?:يمكنك|بإمكانك|تستطيع)\s+(?:إخباري|إعلامي|توضيح)[^\n.؟!]*/gi, "قولّي"],
  [/كيف\s+يمكنني\s+مساعدتك[؟?]?/gi, "قولّي"],
  [/كيف\s+أستطيع\s+مساعدتك[؟?]?/gi, "قولّي"],
  [/ممكن\s+تزودني[^\n.؟!]*/gi, "قولّي"],
  [/محتاج\s+(?:إلى\s+)?تفاصيل\s+(?:أكتر|أكثر)[.،؟!]?\s*/gi, ""],
  [/الرجاء/gi, "لو سمحت"],
  [/استمتع\s+بالمشاهدة[!！.\s]*/gi, ""],
];

const HUMAN_PROMISE_PATTERNS = [
  /هحوّ?لك\s+ل[^\n.؟!]*/gi,
  /هيتواصل\s+معاك\s+[^\n.؟!]*/gi,
  /هيتواصلوا\s+معاك\s+[^\n.؟!]*/gi,
  /ه\s*بعت\s+الموضوع\s+ل[^\n.؟!]*/gi,
  /هتابع\s+موضوعك\s+مع\s+[^\n.؟!]*/gi,
  /الفريق\s+المختص[^\n.؟!]*/gi,
  /زميل\s+هيرد\s+عليك[^\n.؟!]*/gi,
  /أحد\s+الزملاء\s+[^\n.؟!]*/gi,
];

export class ReplyComposer {
  static compose(intent: ReplyIntent, options: ReplyComposerOptions = {}): string {
    const parts = [
      intent.acknowledgement,
      intent.answer,
      intent.nextQuestion,
      intent.closing,
    ].filter((part): part is string => !!String(part || "").trim());

    return this.polish(parts.join(" "), options);
  }

  static polish(reply: string, options: ReplyComposerOptions = {}): string {
    let text = String(reply || "").replace(/\s+/g, " ").trim();
    if (!text) return text;

    for (const pattern of BOT_WORD_PATTERNS) {
      text = text.replace(pattern, "").trim();
    }

    text = text.replace(/^أنا[.،,\s]+/i, "").trim();

    for (let i = 0; i < 3; i += 1) {
    for (const pattern of STIFF_OPENERS) {
        text = text.replace(pattern, "").trim();
      }
    }

    for (const [pattern, replacement] of STIFF_PHRASES) {
      text = text.replace(pattern, replacement).trim();
    }

    for (const pattern of HUMAN_PROMISE_PATTERNS) {
      text = text.replace(pattern, "أنا معاك هنا").trim();
    }

    text = this.keepOneQuestion(text);
    text = this.removeRepeatedOpener(text, options.recentMessages || []);

    const config = (options.merchant?.config || {}) as Record<string, any>;
    const cadence = config.cadence || {};
    const signature = String(options.signature || cadence.signature || "").trim();
    if (signature && !text.includes(signature) && text.length < 240) {
      // Keep signatures rare and short; do not append to every long answer.
      const shouldSign = /شكوى|مشكلة|استبدال|استرجاع/i.test(text);
      if (shouldSign) text = `${text} ${signature}`;
    }

    return text.replace(/\s+([؟!،.])/g, "$1").trim();
  }

  private static keepOneQuestion(text: string): string {
    const firstArabic = text.indexOf("؟");
    const firstAscii = text.indexOf("?");
    const candidates = [firstArabic, firstAscii].filter((idx) => idx >= 0);
    if (candidates.length === 0) return text;

    const first = Math.min(...candidates);
    const before = text.slice(0, first + 1);
    const after = text
      .slice(first + 1)
      .replace(/[؟?]+/g, ".")
      .replace(/\s+\./g, ".");
    return `${before}${after}`.replace(/\s+/g, " ").trim();
  }

  private static removeRepeatedOpener(text: string, recentMessages: Message[]): string {
    const opener = text.split(/[.؟!]/)[0]?.trim();
    if (!opener || opener.length > 45) return text;

    const recentAssistantText = recentMessages
      .filter((message) => String(message.direction || "").toLowerCase() === "outbound")
      .slice(-3)
      .map((message) => String((message as any).text || (message as any).content || ""));

    const repeated = recentAssistantText.some((message) =>
      message.trim().startsWith(opener),
    );
    if (!repeated) return text;

    return text.slice(opener.length).replace(/^[\s.؟!،,]+/, "").trim() || text;
  }
}
