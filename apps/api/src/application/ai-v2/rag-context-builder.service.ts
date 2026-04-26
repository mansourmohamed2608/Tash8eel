import { Injectable } from "@nestjs/common";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { KbRetrievalService } from "../llm/kb-retrieval.service";
import { Merchant } from "../../domain/entities/merchant.entity";
import {
  BusinessRuleFactV2,
  CatalogFactV2,
  KbFactV2,
  RagContextV2,
} from "./ai-v2.types";

export interface RagContextBuilderInputV2 {
  merchantId: string;
  merchant?: Pick<
    Merchant,
    "whatsappNumber" | "address" | "workingHours" | "name"
  >;
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
    const allRules = await this.loadBusinessRules(input.merchantId);
    for (const [ruleType, rules] of Object.entries(allRules)) {
      for (const rule of rules.slice(0, 5)) {
        businessRuleFacts.push({
          key: `${ruleType}:${rule.ruleName}`,
          value: [rule.ruleDescription, rule.condition, rule.action]
            .filter(Boolean)
            .join(" | ")
            .slice(0, 600),
          source: "kb",
        });
      }
    }

    // Merchant settings facts: only include customer-visible values.
    // These are not offers/policies and must never be invented.
    // We expose them through KB-like facts so validator can allow them by id.
    const settingsFacts: KbFactV2[] = [];
    if (input.merchant?.whatsappNumber) {
      settingsFacts.push({
        chunkId: "ms:whatsappNumber",
        text: `رقم واتساب المتجر: ${String(input.merchant.whatsappNumber)}`,
        visibility: "public" as const,
        confidence: 0.95,
        source: "kb" as const,
      });
    } else {
      unavailableFacts.push("merchant_whatsapp_number_missing");
    }
    if (input.merchant?.address) {
      settingsFacts.push({
        chunkId: "ms:address",
        text: `عنوان المتجر: ${String(input.merchant.address)}`,
        visibility: "public" as const,
        confidence: 0.9,
        source: "kb" as const,
      });
    } else {
      unavailableFacts.push("merchant_address_missing");
    }
    if (input.merchant?.workingHours) {
      settingsFacts.push({
        chunkId: "ms:workingHours",
        text: `مواعيد العمل: ${JSON.stringify(input.merchant.workingHours)}`,
        visibility: "public" as const,
        confidence: 0.8,
        source: "kb" as const,
      });
    }

    const confidence =
      catalogFacts.length > 0 || kbFacts.length > 0 || settingsFacts.length > 0
        ? 0.78
        : 0.45;

    return {
      catalogFacts,
      kbFacts: [...settingsFacts, ...kbFacts],
      offerFacts: [],
      businessRuleFacts,
      unavailableFacts,
      confidence,
    };
  }

  private async loadBusinessRules(merchantId: string): Promise<
    Record<
      string,
      Array<{
        ruleName: string;
        ruleDescription?: string;
        condition?: string;
        action?: string;
      }>
    >
  > {
    const svc = this.kbRetrieval as any;
    if (typeof svc.getAllRules !== "function") return {};
    try {
      return (await svc.getAllRules(merchantId)) || {};
    } catch {
      return {};
    }
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
      const rawName = item.nameAr || item.name || item.nameEn || "item";
      const rawDescription =
        item.descriptionAr || item.description || item.descriptionEn;
      const customerVisibleSku = isCustomerVisibleSku(item);
      const customerFacingName = customerSafeDisplayText(rawName, {
        fallback: "منتج متاح",
        allowSkuLike: customerVisibleSku,
      });
      const customerFacingDescription = rawDescription
        ? customerSafeDisplayText(rawDescription, {
            fallback: "",
            allowSkuLike: customerVisibleSku,
          })
        : undefined;
      if (!hasPrice) {
        unavailableFacts.push(`price_missing:${item.id}`);
      }
      return {
        catalogItemId: item.id,
        sku: item.sku,
        name: rawName,
        description: rawDescription,
        price: hasPrice ? item.basePrice : undefined,
        availability: item.isAvailable ? "available" : "unavailable",
        customerFacingName,
        customerFacingDescription: customerFacingDescription || undefined,
        customerFacingPrice: hasPrice ? item.basePrice : undefined,
        customerFacingAvailability: item.isAvailable
          ? "available"
          : "unavailable",
        customerVisibleSku,
        sourceLabel: extractSourceLabel(item),
        isFixture: isFixtureLikeCatalogItem(item),
        confidence: Math.max(0.4, 0.85 - idx * 0.05),
        source: "catalog",
      };
    });
  }
}

function isCustomerVisibleSku(item: CatalogItem): boolean {
  const record = item as unknown as Record<string, unknown>;
  if (record.customerVisibleSku === true) return true;
  const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
  return tags.some((tag) =>
    /^(customer[_-]?visible[_-]?sku|customerVisibleSku)(?::true)?$/i.test(
      tag.trim(),
    ),
  );
}

function extractSourceLabel(item: CatalogItem): string | undefined {
  const record = item as unknown as Record<string, unknown>;
  if (typeof record.sourceLabel === "string" && record.sourceLabel.trim()) {
    return record.sourceLabel.trim().slice(0, 80);
  }
  const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
  const sourceTag = tags.find((tag) => /^source[:=_-]/i.test(tag.trim()));
  return sourceTag?.trim().slice(0, 80);
}

function isFixtureLikeCatalogItem(item: CatalogItem): boolean {
  const haystack = [
    item.id,
    item.sku,
    item.nameAr,
    item.nameEn,
    item.category,
    ...((Array.isArray(item.tags) ? item.tags : []) as string[]),
    extractSourceLabel(item),
  ]
    .filter(Boolean)
    .join(" ");
  return /\b(?:fixture|test[_-]?data|local[_-]?fixture|source[:=_-]?demo)\b/i.test(
    haystack,
  );
}

function customerSafeDisplayText(
  value: string,
  opts: { fallback: string; allowSkuLike: boolean },
): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return opts.fallback;
  if (containsInternalSourceMarker(trimmed)) return opts.fallback;
  if (!opts.allowSkuLike && isMostlyInternalCode(trimmed)) return opts.fallback;
  return trimmed.slice(0, 240);
}

function containsInternalSourceMarker(value: string): boolean {
  return /\b(?:fixture|test\s+data|internal|local\s+mode|demo\s+mode|source\s*:)\b/i.test(
    value,
  );
}

function isMostlyInternalCode(value: string): boolean {
  const trimmed = value.trim();
  if (/^(?:cat|kb|mf|br|offer):[A-Za-z0-9:_-]+$/i.test(trimmed)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return /^[A-Z0-9]{2,}(?:-[A-Z0-9]{2,}){1,4}$/.test(trimmed);
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
