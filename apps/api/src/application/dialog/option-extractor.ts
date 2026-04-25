/**
 * Extracts offered options from an assistant reply text.
 * Called after each AI turn to populate lastOfferedOptions, pendingSlot, and
 * pendingQuestionType for the next turn's short-reply resolution.
 *
 * Pure static utility — no NestJS dependencies, no merchant-specific logic.
 * Options are detected from surface patterns in the Arabic/English reply.
 */

export class OptionExtractor {
  /**
   * Extract the discrete options that were offered in the reply.
   * Returns an empty array when no clear offer is detected.
   *
   * Sources tried in order:
   *   A — "X ولا Y؟" or "X أو Y؟" or "X أو Y أو Z؟" (choice question)
   *   B — numbered lists (Arabic/Western numerals, ., -, ))
   *   C — explicit ordinal labels "الأول: … التاني: …"
   *   D — bullet lists (•  –  —  *  -  ▪  ○)
   */
  static extractOfferedOptions(replyText: string): string[] {
    const text = String(replyText || "").trim();
    if (!text) return [];

    // Pattern A: question containing "ولا" / "أو" / "or" separators
    // Find the sentence that ends with ؟ or ? and contains at least one separator
    const questionMatch =
      /([^؟\n]{6,200}?(?:ولا|أو|or)[^؟\n]{3,})[؟?]/i.exec(text);
    if (questionMatch) {
      const qText = questionMatch[1];
      const parts = qText
        .split(/\s+(?:ولا|أو|or)\s+/i)
        .map((s) =>
          s
            .replace(/^[^a-zA-Z؀-ۿ\d]+/, "")
            .replace(/[^a-zA-Z؀-ۿ\d\s\-,،]+$/, "")
            .trim(),
        )
        .filter((s) => s.length >= 2 && s.length <= 80);
      if (parts.length >= 2) return parts.slice(0, 4);
    }

    // Pattern B: numbered list — Arabic or Western numerals followed by . - )
    let m: RegExpExecArray | null;
    const numberedPattern =
      /(?:^|\n)\s*(?:[١٢٣٤٥٦٧٨٩]|[1-9])[.\-\)]\s*([^\n،.]{2,80})/gm;
    const numbered: string[] = [];
    while ((m = numberedPattern.exec(text)) !== null) {
      const item = m[1].trim();
      if (item.length >= 2) numbered.push(item);
    }
    if (numbered.length >= 2) return numbered.slice(0, 4);

    // Pattern C: explicit ordinal labels "الأول: ..." / "التاني: ..."
    // Use [: \t]+ (colon or horizontal space only) — \s would include \n and
    // incorrectly match "النوع الأول\n" as a label followed by the next line.
    const label1 = /(?:الأول|الاول|الخيار\s+الأول)[: \t]+([^،\n.]{2,80})/i.exec(
      text,
    );
    const label2 =
      /(?:الثاني|التاني|الخيار\s+التاني|الخيار\s+الثاني)[: \t]+([^،\n.]{2,80})/i.exec(
        text,
      );
    if (label1 && label2) {
      const opts = [label1[1].trim(), label2[1].trim()];
      const label3 =
        /(?:الثالث|التالت|الخيار\s+التالت|الخيار\s+الثالث)[: \t]+([^،\n.]{2,80})/i.exec(
          text,
        );
      if (label3) opts.push(label3[1].trim());
      return opts.slice(0, 4);
    }

    // Pattern D: bullet lists — lines starting with •  –  —  *  -  ▪  ○
    const bulletPattern =
      /(?:^|\n)\s*[•\-\–\—\*▪○]\s+([^\n،.]{2,80})/gm;
    const bulleted: string[] = [];
    while ((m = bulletPattern.exec(text)) !== null) {
      const item = m[1].trim();
      if (item.length >= 2) bulleted.push(item);
    }
    if (bulleted.length >= 2) return bulleted.slice(0, 4);

    return [];
  }

  /**
   * Infer what type of question was pending in the reply.
   * Used for `pendingQuestionType` in the next turn's dialog context.
   */
  static detectPendingQuestionType(replyText: string): string | undefined {
    const t = String(replyText || "").toLowerCase();
    if (/(?:كميه|كمية|عدد|كم\s+قطعة|كم\s+حاجة|كم\s+وحدة|كم\s+كيلو)/i.test(t))
      return "quantity";
    if (
      /(?:منطقة|محافظة|توصيل\s+لفين|بتوصل\s+فين|تبعت\s+فين|العنوان|ادرس|address)/i.test(
        t,
      )
    )
      return "delivery_area";
    if (
      /(?:موعد|متى|تاريخ|وقت|امتى|deadline|بتحتاجه\s+امتى|التسليم\s+امتى)/i.test(
        t,
      )
    )
      return "deadline";
    if (/(?:هتاخد|هتختار|أي\s+خيار|تختار|بتفضل|تفضل\s+إيه)/i.test(t))
      return "option_choice";
    if (/(?:تأكيد|توكيد|موافق|تأكد|confirm)/i.test(t)) return "confirmation";
    return undefined;
  }

  /**
   * Infer which universal slot the reply is asking about.
   * Used for `pendingSlot` in the next turn's dialog context.
   */
  static detectPendingSlot(replyText: string): string | undefined {
    const t = String(replyText || "").toLowerCase();
    if (/(?:كمية|كميه|كم\s+قطعة|كم\s+حاجة|كم\s+وحدة)/i.test(t))
      return "quantity";
    if (
      /(?:منطقة\s+التوصيل|التوصيل\s+لفين|بتوصل\s+فين|العنوان)/i.test(t)
    )
      return "delivery_area";
    if (/(?:موعد\s+التسليم|تاريخ\s+التسليم|محتاجه\s+امتى)/i.test(t))
      return "deadline";
    if (/(?:ميزانية|حدود\s+السعر|بكام\s+تقريباً)/i.test(t)) return "budget";
    return undefined;
  }

  /**
   * Extract the last suggested product or proposal from the reply.
   * Used for `lastProposal` so affirmative replies can reference it.
   */
  static extractLastProposal(replyText: string): string | undefined {
    const text = String(replyText || "").trim();
    if (!text) return undefined;

    const proposalPattern =
      /(?:بنصحك\s+بـ?|بنصحك\s+تاخد|أنسبلك|ينفعك|أقترح\s+عليك|بقترحلك)\s+([^،.\n؟?]{4,60})/i;
    const m = proposalPattern.exec(text);
    if (m) return m[1].trim();

    return undefined;
  }
}
