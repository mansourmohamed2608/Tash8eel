import { Injectable } from "@nestjs/common";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { KbRetrievalService } from "../llm/kb-retrieval.service";
import {
  BusinessRuleFactV2,
  CatalogFactV2,
  KbFactV2,
  RagContextV2,
} from "./ai-v2.types";

export interface RagContextBuilderInputV2 {
  merchantId: string;
  customerMessage: string;
  catalogItems: CatalogItem[];
  businessType?: string;
}

/**
 * Builds typed RAG facts for v2. Does not assign sales stage or next actions.
 */
@Injectable()
export class RagContextBuilderServiceV2 {
  constructor(private readonly kbRetrieval: KbRetrievalService) {}

  async build(input: RagContextBuilderInputV2): Promise<RagContextV2> {
    const unavailableFacts: string[] = [];
    const catalogFacts = this.buildCatalogFacts(
      input.customerMessage,
      input.catalogItems,
      unavailableFacts,
    );

    let kbFacts: KbFactV2[] = [];
    const structured = await this.kbRetrieval.hasStructuredKb(input.merchantId);
    if (structured) {
      const chunks = await this.kbRetrieval.searchChunks(
        input.merchantId,
        input.customerMessage,
        {
          limit: 8,
          businessType: input.businessType,
          customerVisibleOnly: true,
        },
      );
      kbFacts = chunks.map((c) => ({
        chunkId: c.id,
        text: `${c.title}\n${c.content}`.slice(0, 1200),
        visibility: "public" as const,
        confidence: c.confidenceLevel === "high" ? 0.9 : 0.65,
        source: "kb" as const,
      }));
    } else {
      unavailableFacts.push("structured_kb_chunks_absent");
    }

    const businessRuleFacts: BusinessRuleFactV2[] = [];

    const confidence =
      catalogFacts.length > 0 || kbFacts.length > 0 ? 0.75 : 0.45;

    return {
      catalogFacts,
      kbFacts,
      offerFacts: [],
      businessRuleFacts,
      unavailableFacts,
      confidence,
    };
  }

  private buildCatalogFacts(
    message: string,
    items: CatalogItem[],
    unavailableFacts: string[],
  ): CatalogFactV2[] {
    const active = items.filter((i) => i.isActive !== false);
    if (active.length === 0) {
      unavailableFacts.push("no_active_catalog_items");
      return [];
    }

    const scored = active
      .map((item) => ({
        item,
        score: scoreCatalogRelevance(message, item),
      }))
      .sort((a, b) => b.score - a.score);

    const picked = scored.filter((s) => s.score > 0).slice(0, 8);
    const sourceList = picked.length > 0 ? picked : scored.slice(0, 5);

    return sourceList.map(({ item }, idx) => {
      const hasPrice = typeof item.basePrice === "number" && item.basePrice > 0;
      if (!hasPrice) {
        unavailableFacts.push(`price_missing:${item.id}`);
      }
      return {
        catalogItemId: item.id,
        name: item.nameAr || item.name || item.nameEn || "item",
        price: hasPrice ? item.basePrice : undefined,
        availability: item.isAvailable ? "available" : "unavailable",
        confidence: Math.max(0.4, 0.85 - idx * 0.05),
        source: "catalog",
      };
    });
  }
}

function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

function tokens(text: string): Set<string> {
  const n = normalizeArabic(text);
  const parts = n.split(/[\s,.،؛؟!؟'"()\[\]{}]+/).filter((p) => p.length > 1);
  return new Set(parts);
}

function scoreCatalogRelevance(message: string, item: CatalogItem): number {
  const bag = tokens(message);
  if (bag.size === 0) return 0;
  let score = 0;
  const name = normalizeArabic(item.nameAr || item.name || "");
  for (const w of name.split(/\s+/)) {
    if (w.length > 1 && bag.has(w)) score += 2;
  }
  const tags = (item.tags || []).map(normalizeArabic);
  for (const t of tags) {
    if (t && bag.has(t)) score += 1.5;
  }
  const cat = item.category ? normalizeArabic(item.category) : "";
  if (cat && bag.has(cat)) score += 1;
  return score;
}
