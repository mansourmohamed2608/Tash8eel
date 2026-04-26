/**
 * Extracts product/options the customer explicitly contrasts in one message
 * (e.g. "بختار بين X و Y") so short-reply resolution can target them.
 * Merchant-agnostic — no catalog names required.
 */

export interface CustomerOptionExtraction {
  options: string[];
}

export class CustomerOptionExtractor {
  static extract(message: string): CustomerOptionExtraction {
    const text = String(message || "").trim();
    if (!text) return { options: [] };

    const between =
      text.match(
        /(?:بين|بين\s+)(.+?)\s+(?:و|أو|او)\s+(.+?)(?:\.|،|,|$|\?|؟)/i,
      ) ||
      text.match(
        /(?:بختار|اختار|أختار)\s+(?:بين\s+)?(.+?)\s+(?:و|أو|او)\s+(.+?)(?:\.|،|,|$|\?|؟)/i,
      );

    if (between) {
      const a = between[1]?.replace(/^["']|["']$/g, "").trim();
      const b = between[2]?.replace(/^["']|["']$/g, "").trim();
      if (a && b && a.length > 0 && b.length > 0) {
        return { options: [a, b] };
      }
    }

    return { options: [] };
  }
}
