import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { UsageGuardService } from "../services/usage-guard.service";
import {
  CustomSlotDefinition,
  MerchantMemorySchema,
} from "./merchant-memory-schema.service";
import {
  UNIVERSAL_SLOTS,
  UniversalSlotKey,
} from "./universal-slots";

export interface SlotExtractorParams {
  merchantId: string;
  text: string;
  businessType?: string;
  priorUniversalSlots: Record<string, unknown>;
  priorCustomSlots: Record<string, unknown>;
  schema: MerchantMemorySchema;
}

export interface SlotExtractorResult {
  universalSlots: Record<string, unknown>;
  customSlots: Record<string, unknown>;
  newlyFilled: string[];
  confidence: Record<string, number>;
  stillMissingImportant: string[];
  tokensUsed: number;
}

const LLM_TIMEOUT_MS = 4_000;
const LLM_MAX_TOKENS = 240;
const HIGH_CONFIDENCE = 0.8;

@Injectable()
export class SlotExtractorService {
  private readonly logger = new Logger(SlotExtractorService.name);
  private readonly client: OpenAI | null;
  private readonly isTestMode: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly usageGuard: UsageGuardService,
  ) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY") || "";
    this.isTestMode =
      !apiKey ||
      apiKey.startsWith("sk-test-") ||
      apiKey.startsWith("sk-dummy-") ||
      apiKey.includes("dummy");
    this.client = this.isTestMode ? null : new OpenAI({ apiKey });
  }

  async extract(params: SlotExtractorParams): Promise<SlotExtractorResult> {
    const failOpen = (): SlotExtractorResult => ({
      universalSlots: { ...params.priorUniversalSlots },
      customSlots: { ...params.priorCustomSlots },
      newlyFilled: [],
      confidence: {},
      stillMissingImportant: this.computeMissingImportant(
        params.schema,
        params.businessType,
        params.priorCustomSlots,
        params.priorUniversalSlots,
      ),
      tokensUsed: 0,
    });

    if (!this.client) return failOpen();

    try {
      const quota = await this.usageGuard.consume(
        params.merchantId,
        "AI_CALLS",
        1,
        { metadata: { source: "SLOT_EXTRACTION" } },
      );
      if (!quota.allowed) return failOpen();
    } catch (err) {
      this.logger.warn({
        message: "SlotExtractor quota guard failed; skipping extractor",
        err: (err as Error).message,
      });
      return failOpen();
    }

    const applicable = this.applicableCustomSlots(
      params.schema.customSlots,
      params.businessType,
    );
    const schemaJson = this.buildJsonSchema(applicable, params.schema);
    const systemPrompt = this.buildSystemPrompt(
      applicable,
      params.businessType,
      params.schema,
    );
    const userPrompt = this.buildUserPrompt(params);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    let rawContent = "";
    let tokensUsed = 0;
    try {
      const response = await this.client.chat.completions.create(
        {
          model: "gpt-4o-mini",
          max_tokens: LLM_MAX_TOKENS,
          temperature: 0.2,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "slot_extraction",
              schema: schemaJson,
              strict: false,
            },
          },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        },
        { signal: controller.signal as AbortSignal },
      );
      rawContent = response.choices?.[0]?.message?.content || "";
      tokensUsed = response.usage?.total_tokens || 0;
    } catch (err) {
      this.logger.warn({
        message: "SlotExtractor LLM call failed; keeping prior slots",
        err: (err as Error).message,
      });
      return failOpen();
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent || "{}");
    } catch {
      return failOpen();
    }

    const extracted = this.normalizeExtracted(parsed);
    const mergedUniversal = this.mergeSlots(
      params.priorUniversalSlots,
      extracted.universal,
    );
    const mergedCustom = this.mergeSlots(
      params.priorCustomSlots,
      extracted.custom,
    );
    const newlyFilled = this.computeNewlyFilled(
      params.priorUniversalSlots,
      params.priorCustomSlots,
      mergedUniversal.slots,
      mergedCustom.slots,
    );
    const confidence = { ...mergedUniversal.confidence, ...mergedCustom.confidence };
    const stillMissingImportant = this.computeMissingImportant(
      params.schema,
      params.businessType,
      mergedCustom.slots,
      mergedUniversal.slots,
    );

    return {
      universalSlots: mergedUniversal.slots,
      customSlots: mergedCustom.slots,
      newlyFilled,
      confidence,
      stillMissingImportant,
      tokensUsed,
    };
  }

  private applicableCustomSlots(
    all: CustomSlotDefinition[],
    businessType: string | undefined,
  ): CustomSlotDefinition[] {
    if (!businessType) {
      return all.filter(
        (s) => !s.appliesToBusinessTypes || s.appliesToBusinessTypes.length === 0,
      );
    }
    return all.filter(
      (s) =>
        !s.appliesToBusinessTypes ||
        s.appliesToBusinessTypes.length === 0 ||
        s.appliesToBusinessTypes.includes(businessType),
    );
  }

  private buildJsonSchema(
    customSlots: CustomSlotDefinition[],
    schema: MerchantMemorySchema,
  ): Record<string, unknown> {
    const universalProps: Record<string, unknown> = {};
    for (const key of UNIVERSAL_SLOTS) {
      universalProps[key] = {
        type: "object",
        properties: {
          value: { type: ["string", "number", "boolean"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["value", "confidence"],
        additionalProperties: false,
      };
    }

    const customProps: Record<string, unknown> = {};
    for (const s of customSlots) {
      const valueSchema: Record<string, unknown> =
        s.type === "number"
          ? { type: "number" }
          : s.type === "boolean"
            ? { type: "boolean" }
            : s.type === "enum" && Array.isArray(s.enumValues) && s.enumValues.length > 0
              ? { type: "string", enum: s.enumValues }
              : { type: "string" };
      customProps[s.key] = {
        type: "object",
        properties: {
          value: valueSchema,
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["value", "confidence"],
        additionalProperties: false,
      };
    }

    return {
      type: "object",
      properties: {
        universal: {
          type: "object",
          properties: universalProps,
          additionalProperties: false,
        },
        custom: {
          type: "object",
          properties: customProps,
          additionalProperties: false,
        },
        custom_attributes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              value: { type: ["string", "number", "boolean"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["key", "value", "confidence"],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    };
  }

  private buildSystemPrompt(
    customSlots: CustomSlotDefinition[],
    businessType: string | undefined,
    schema: MerchantMemorySchema,
  ): string {
    const lines = [
      "You extract sales conversation slots from a single customer message.",
      "Arabic and Egyptian dialect are common; handle both English and Arabic.",
      "Rules:",
      "- Only include a slot if the customer explicitly states it in this message.",
      "- For each included slot, emit {value, confidence in 0..1}. Omit slots not stated.",
      "- If a slot has an enum, the value MUST be one of the enum values.",
      "- If the message contradicts a known universal slot, emit the new value with confidence.",
      "- If you're unsure, omit the slot.",
    ];
    if (businessType) {
      lines.push(`Current inferred business_type: ${businessType}.`);
    }
    if (schema.businessTypes.length > 0) {
      lines.push(
        `Allowed business_type values (if extracted): ${schema.businessTypes.join(", ")}.`,
      );
    }
    if (customSlots.length > 0) {
      const desc = customSlots
        .map((s) => {
          const enumTxt =
            s.type === "enum" && s.enumValues?.length
              ? ` (one of: ${s.enumValues.join(", ")})`
              : "";
          return `- ${s.key}: type=${s.type}${enumTxt}${s.importance === "high" ? " [important]" : ""}`;
        })
        .join("\n");
      lines.push("Merchant-defined custom slots:");
      lines.push(desc);
    } else {
      lines.push(
        "No merchant-defined custom slots; you may still emit custom_attributes as free-form {key,value,confidence} for clear statements.",
      );
    }
    return lines.join("\n");
  }

  private buildUserPrompt(params: SlotExtractorParams): string {
    return JSON.stringify({
      message: params.text,
      prior_universal_slots: params.priorUniversalSlots,
      prior_custom_slots: params.priorCustomSlots,
      prior_business_type: params.businessType,
    });
  }

  private normalizeExtracted(parsed: unknown): {
    universal: Record<string, { value: unknown; confidence: number }>;
    custom: Record<string, { value: unknown; confidence: number }>;
  } {
    const p = (parsed || {}) as Record<string, unknown>;
    const universal = this.coerceSlotMap(p.universal);
    const custom = this.coerceSlotMap(p.custom);
    const attrs = p.custom_attributes;
    if (Array.isArray(attrs)) {
      for (const item of attrs) {
        if (!item || typeof item !== "object") continue;
        const k = (item as { key?: unknown }).key;
        const v = (item as { value?: unknown }).value;
        const c = (item as { confidence?: unknown }).confidence;
        if (typeof k !== "string" || k.length === 0) continue;
        if (v === undefined || v === null) continue;
        const conf = typeof c === "number" ? c : 0.6;
        if (!(k in custom)) custom[k] = { value: v, confidence: conf };
      }
    }
    return { universal, custom };
  }

  private coerceSlotMap(
    value: unknown,
  ): Record<string, { value: unknown; confidence: number }> {
    if (!value || typeof value !== "object") return {};
    const out: Record<string, { value: unknown; confidence: number }> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const val = (v as { value?: unknown }).value;
      const conf = (v as { confidence?: unknown }).confidence;
      if (val === undefined || val === null || val === "") continue;
      out[k] = {
        value: val,
        confidence: typeof conf === "number" ? conf : 0.6,
      };
    }
    return out;
  }

  private mergeSlots(
    prior: Record<string, unknown>,
    extracted: Record<string, { value: unknown; confidence: number }>,
  ): {
    slots: Record<string, unknown>;
    confidence: Record<string, number>;
  } {
    const slots = { ...prior };
    const confidence: Record<string, number> = {};
    for (const [k, { value, confidence: conf }] of Object.entries(extracted)) {
      if (slots[k] === undefined || slots[k] === null || slots[k] === "") {
        slots[k] = value;
        confidence[k] = conf;
      } else if (conf >= HIGH_CONFIDENCE && slots[k] !== value) {
        slots[k] = value;
        confidence[k] = conf;
      }
      // conf < HIGH and prior exists → keep prior (rule 3).
    }
    return { slots, confidence };
  }

  private computeNewlyFilled(
    priorU: Record<string, unknown>,
    priorC: Record<string, unknown>,
    mergedU: Record<string, unknown>,
    mergedC: Record<string, unknown>,
  ): string[] {
    const out: string[] = [];
    for (const k of Object.keys(mergedU)) {
      if (
        (priorU[k] === undefined || priorU[k] === null || priorU[k] === "") &&
        mergedU[k] !== undefined
      ) {
        out.push(k);
      }
    }
    for (const k of Object.keys(mergedC)) {
      if (
        (priorC[k] === undefined || priorC[k] === null || priorC[k] === "") &&
        mergedC[k] !== undefined
      ) {
        out.push(k);
      }
    }
    return out;
  }

  private computeMissingImportant(
    schema: MerchantMemorySchema,
    businessType: string | undefined,
    customSlots: Record<string, unknown>,
    universalSlots: Record<string, unknown>,
  ): string[] {
    const applicable = this.applicableCustomSlots(
      schema.customSlots,
      businessType,
    );
    const missing: string[] = [];
    for (const s of applicable) {
      if (s.importance !== "high") continue;
      const v = customSlots[s.key];
      if (v === undefined || v === null || v === "") missing.push(s.key);
    }
    // Universal signals that are typically needed to close a sale.
    const closingUniversals: UniversalSlotKey[] = ["quantity", "delivery_area"];
    for (const k of closingUniversals) {
      const v = universalSlots[k];
      if (v === undefined || v === null || v === "") missing.push(k);
    }
    return missing;
  }
}
