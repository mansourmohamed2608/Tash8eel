/**
 * OrderAssembler — pure function, no NestJS dependencies, merchant-agnostic.
 *
 * Maps resolved option text strings (from ShortReplyResolver) to catalog item
 * IDs using fuzzy Arabic/English normalization. Does not hardcode any product
 * names, categories, or verticals. Matching is purely data-driven against the
 * catalog passed in.
 */

import { CatalogItem } from "../../domain/entities/catalog.entity";

export interface AssembledCartItem {
  catalogItemId: string;
  sourceText: string;
  variantKey?: string;
}

export class OrderAssembler {
  /**
   * Match each resolved text label against the catalog and return the best
   * catalog item ID for each. Items with no catalog match are omitted so the
   * caller can surface them as unresolved to the LLM.
   *
   * Matching order: exact substring (normalized) → word-token overlap.
   */
  static assemble(
    resolvedTexts: string[],
    catalogItems: CatalogItem[],
  ): AssembledCartItem[] {
    const results: AssembledCartItem[] = [];
    const usedIds = new Set<string>();

    for (const text of resolvedTexts) {
      if (!text) continue;
      const normalizedText = this.normalize(text);

      let best: CatalogItem | undefined;
      let bestScore = 0;

      for (const item of catalogItems) {
        if (usedIds.has(item.id)) continue;

        const candidates = [item.sku, item.nameAr, item.nameEn, item.name]
          .filter(Boolean)
          .map((v) => this.normalize(String(v)));

        let score = 0;
        for (const c of candidates) {
          if (c.length < 2) continue;
          // Exact substring match (either direction)
          if (c === normalizedText) { score = Math.max(score, 100); break; }
          if (c.includes(normalizedText) && normalizedText.length >= 3) score = Math.max(score, 80);
          if (normalizedText.includes(c) && c.length >= 3) score = Math.max(score, 70);
          // Token overlap
          const overlap = this.tokenOverlap(normalizedText, c);
          if (overlap > 0) score = Math.max(score, overlap * 10);
        }

        if (score > bestScore) {
          bestScore = score;
          best = item;
        }
      }

      if (best && bestScore >= 10) {
        usedIds.add(best.id);
        results.push({ catalogItemId: best.id, sourceText: text });
      }
    }

    return results;
  }

  private static normalize(value: string): string {
    return String(value || "")
      .toLowerCase()
      .replace(/[اأإآ]/g, "ا")
      .replace(/[ىي]/g, "ي")
      .replace(/[ة]/g, "ه")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private static tokenOverlap(a: string, b: string): number {
    const tokensA = new Set(a.split(" ").filter((t) => t.length >= 2));
    const tokensB = new Set(b.split(" ").filter((t) => t.length >= 2));
    let count = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) count++;
    }
    return count;
  }
}
