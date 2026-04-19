import { Merchant } from "../../domain/entities/merchant.entity";
import { Message } from "../../domain/entities/message.entity";

export interface ReplyIntent {
  acknowledgement?: string;
  answer?: string;
  nextQuestion?: string;
  closing?: string;
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

const HUMAN_PROMISE_PATTERNS = [
  /هحوّ?لك\s+ل[^\n.؟!]*/gi,
  /هيتواصل\s+معاك\s+[^\n.؟!]*/gi,
  /ه\s*بعت\s+الموضوع\s+ل[^\n.؟!]*/gi,
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

    for (const pattern of STIFF_OPENERS) {
      text = text.replace(pattern, "").trim();
    }

    for (const pattern of BOT_WORD_PATTERNS) {
      text = text.replace(pattern, "").trim();
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
