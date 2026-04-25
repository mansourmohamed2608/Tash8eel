import { Inject, Injectable, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { DialogPlaybookService } from "./dialog-playbook.service";
import { UNIVERSAL_SLOTS, UniversalSlotKey } from "./universal-slots";

export interface CustomSlotDefinition {
  key: string;
  labelAr?: string;
  type: "text" | "enum" | "number" | "boolean";
  enumValues?: string[];
  appliesToBusinessTypes?: string[];
  importance: "high" | "medium" | "low";
  /**
   * Free-text promptSeed copied from the merchant's playbook nextQuestionTemplates.
   * Used in the memory brief as "Suggested next step" for this slot.
   */
  promptSeed?: string;
}

export interface MerchantMemorySchema {
  merchantId: string;
  businessTypes: string[];
  universalSlots: readonly UniversalSlotKey[];
  customSlots: CustomSlotDefinition[];
  /**
   * Keywords per businessType used by BusinessContextClassifier.
   * Derived from merchant catalog categories, KB chunks, and playbook data.
   */
  businessTypeKeywords: Record<string, string[]>;
  /** The raw slot_graph forwarded to SlotPlan (unchanged). */
  rawSlotGraph?: unknown;
}

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  schema: MerchantMemorySchema;
  expiresAt: number;
}

@Injectable()
export class MerchantMemorySchemaService {
  private readonly logger = new Logger(MerchantMemorySchemaService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly playbookService: DialogPlaybookService,
  ) {}

  async load(merchantId: string): Promise<MerchantMemorySchema> {
    const cached = this.cache.get(merchantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.schema;
    }
    const schema = await this.buildSchema(merchantId);
    this.cache.set(merchantId, {
      schema,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return schema;
  }

  invalidate(merchantId: string): void {
    this.cache.delete(merchantId);
  }

  private async buildSchema(merchantId: string): Promise<MerchantMemorySchema> {
    const [playbook, kbTypes, catalogCategories] = await Promise.all([
      this.playbookService.getForMerchant(merchantId).catch(() => null),
      this.loadKbBusinessTypes(merchantId),
      this.loadCatalogCategories(merchantId),
    ]);

    const businessTypes = Array.from(
      new Set([...kbTypes, ...catalogCategories.map((c) => c.businessType).filter((x): x is string => !!x)]),
    ).filter(Boolean);

    const customSlots = this.deriveCustomSlots(playbook);
    const businessTypeKeywords = await this.buildKeywordMap(
      merchantId,
      businessTypes,
      catalogCategories,
    );

    return {
      merchantId,
      businessTypes,
      universalSlots: UNIVERSAL_SLOTS,
      customSlots,
      businessTypeKeywords,
      rawSlotGraph: playbook?.slotGraph,
    };
  }

  private deriveCustomSlots(
    playbook: Awaited<ReturnType<DialogPlaybookService["getForMerchant"]>> | null,
  ): CustomSlotDefinition[] {
    if (!playbook || !Array.isArray(playbook.slotGraph)) return [];
    const templates = playbook.nextQuestionTemplates || {};
    const universalKeySet = new Set<string>(UNIVERSAL_SLOTS);
    const result: CustomSlotDefinition[] = [];
    for (const node of playbook.slotGraph) {
      if (!node || typeof node !== "object") continue;
      const key = (node as { key?: unknown }).key;
      if (typeof key !== "string" || key.length === 0) continue;
      if (universalKeySet.has(key)) continue;
      const required = (node as { required?: unknown }).required === true;
      result.push({
        key,
        labelAr: undefined,
        type: "text",
        importance: required ? "high" : "medium",
        promptSeed: typeof templates[key] === "string" ? templates[key] : undefined,
      });
    }
    return result;
  }

  private async loadKbBusinessTypes(merchantId: string): Promise<string[]> {
    try {
      const res = await this.pool.query<{ business_type: string | null }>(
        `SELECT DISTINCT business_type FROM merchant_kb_chunks
         WHERE merchant_id = $1 AND business_type IS NOT NULL AND business_type <> ''`,
        [merchantId],
      );
      return res.rows.map((r) => r.business_type).filter((x): x is string => !!x);
    } catch (err) {
      this.logger.warn({
        message: "loadKbBusinessTypes failed",
        err: (err as Error).message,
      });
      return [];
    }
  }

  private async loadCatalogCategories(
    merchantId: string,
  ): Promise<{ category: string | null; tags: string[]; businessType?: string }[]> {
    try {
      const res = await this.pool.query<{
        category: string | null;
        tags: string[] | null;
      }>(
        `SELECT category, tags FROM catalog_items
         WHERE merchant_id = $1 AND is_available = true`,
        [merchantId],
      );
      return res.rows.map((r) => {
        const tags = Array.isArray(r.tags) ? r.tags.map(String) : [];
        const btTag = tags.find((t) => t.startsWith("business_type:"));
        const businessType = btTag ? btTag.slice("business_type:".length) : undefined;
        return { category: r.category, tags, businessType };
      });
    } catch (err) {
      this.logger.warn({
        message: "loadCatalogCategories failed",
        err: (err as Error).message,
      });
      return [];
    }
  }

  private async buildKeywordMap(
    merchantId: string,
    businessTypes: string[],
    catalogRows: { category: string | null; tags: string[]; businessType?: string }[],
  ): Promise<Record<string, string[]>> {
    if (businessTypes.length === 0) return {};
    const map: Record<string, Set<string>> = {};
    for (const bt of businessTypes) map[bt] = new Set<string>();

    // Catalog-derived keywords: category + tag tokens (minus the business_type: prefix).
    for (const row of catalogRows) {
      const bt = row.businessType;
      if (!bt || !map[bt]) continue;
      if (row.category) {
        for (const tok of this.tokenize(row.category)) map[bt].add(tok);
      }
      for (const tag of row.tags) {
        if (tag.startsWith("business_type:")) continue;
        for (const tok of this.tokenize(tag)) map[bt].add(tok);
      }
    }

    // KB-derived keywords: pull representative tokens from each business_type's chunks.
    try {
      const res = await this.pool.query<{
        business_type: string;
        category: string | null;
        content: string | null;
      }>(
        `SELECT business_type, category, content FROM merchant_kb_chunks
         WHERE merchant_id = $1 AND business_type IS NOT NULL AND business_type <> ''`,
        [merchantId],
      );
      for (const row of res.rows) {
        const bt = row.business_type;
        if (!map[bt]) map[bt] = new Set<string>();
        if (row.category) {
          for (const tok of this.tokenize(row.category)) map[bt].add(tok);
        }
        if (row.content) {
          const tokens = this.tokenize(row.content).slice(0, 30);
          for (const tok of tokens) map[bt].add(tok);
        }
      }
    } catch (err) {
      this.logger.warn({
        message: "buildKeywordMap KB query failed",
        err: (err as Error).message,
      });
    }

    const out: Record<string, string[]> = {};
    for (const [bt, set] of Object.entries(map)) {
      out[bt] = Array.from(set).filter((t) => t.length >= 3).slice(0, 200);
    }
    return out;
  }

  private tokenize(text: string): string[] {
    return String(text)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[ً-ْ]/g, "") // strip Arabic diacritics
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t && t.length >= 2);
  }
}
