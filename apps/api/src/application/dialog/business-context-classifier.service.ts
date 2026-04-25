import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { MerchantMemorySchema } from "./merchant-memory-schema.service";

export interface BusinessContextClassification {
  businessType?: string;
  confidence: number;
  switched: boolean;
  reason:
    | "rule"
    | "llm"
    | "sticky"
    | "no_signal"
    | "single_value"
    | "no_schema";
}

export interface BusinessContextClassifierParams {
  text: string;
  priorBusinessType?: string;
  schema: MerchantMemorySchema;
}

const STICKY_CONFIDENCE = 0.6;
const FLIP_CONFIDENCE = 0.8;
const LLM_TIMEOUT_MS = 2_000;
const LLM_MAX_TOKENS = 100;

@Injectable()
export class BusinessContextClassifierService {
  private readonly logger = new Logger(BusinessContextClassifierService.name);
  private readonly client: OpenAI | null;
  private readonly isTestMode: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY") || "";
    this.isTestMode =
      !apiKey ||
      apiKey.startsWith("sk-test-") ||
      apiKey.startsWith("sk-dummy-") ||
      apiKey.includes("dummy");
    this.client = this.isTestMode ? null : new OpenAI({ apiKey });
  }

  async classify(
    params: BusinessContextClassifierParams,
  ): Promise<BusinessContextClassification> {
    const { text, priorBusinessType, schema } = params;
    const candidates = schema.businessTypes || [];

    if (candidates.length === 0) {
      return {
        businessType: priorBusinessType,
        confidence: priorBusinessType ? 0.4 : 0,
        switched: false,
        reason: "no_schema",
      };
    }

    if (candidates.length === 1) {
      const only = candidates[0];
      return {
        businessType: only,
        confidence: 1,
        switched: priorBusinessType !== undefined && priorBusinessType !== only,
        reason: "single_value",
      };
    }

    const normalizedText = this.normalize(text);
    const scores = new Map<string, number>();
    for (const bt of candidates) {
      const kws = schema.businessTypeKeywords[bt] || [];
      let hits = 0;
      for (const kw of kws) {
        const nk = this.normalize(kw);
        if (!nk || nk.length < 3) continue;
        if (normalizedText.includes(nk)) hits += 1;
      }
      scores.set(bt, hits);
    }

    let topBt: string | undefined;
    let topHits = 0;
    for (const [bt, hits] of scores.entries()) {
      if (hits > topHits) {
        topHits = hits;
        topBt = bt;
      }
    }
    const ruleConfidence = Math.min(1, topHits * 0.4);

    if (priorBusinessType) {
      if (topBt === priorBusinessType) {
        return {
          businessType: priorBusinessType,
          confidence: 0.9,
          switched: false,
          reason: "sticky",
        };
      }
      if (!topBt || ruleConfidence < FLIP_CONFIDENCE) {
        return {
          businessType: priorBusinessType,
          confidence: 0.7,
          switched: false,
          reason: "sticky",
        };
      }
      return {
        businessType: topBt,
        confidence: ruleConfidence,
        switched: true,
        reason: "rule",
      };
    }

    if (topBt && ruleConfidence >= STICKY_CONFIDENCE) {
      return {
        businessType: topBt,
        confidence: ruleConfidence,
        switched: false,
        reason: "rule",
      };
    }

    const llm = await this.classifyViaLlm(text, candidates);
    if (llm && llm.confidence >= 0.5 && candidates.includes(llm.businessType)) {
      return {
        businessType: llm.businessType,
        confidence: llm.confidence,
        switched: false,
        reason: "llm",
      };
    }

    return {
      businessType: undefined,
      confidence: 0,
      switched: false,
      reason: "no_signal",
    };
  }

  private async classifyViaLlm(
    text: string,
    candidates: string[],
  ): Promise<{ businessType: string; confidence: number } | null> {
    if (!this.client) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
      try {
        const response = await this.client.chat.completions.create(
          {
            model: "gpt-4o-mini",
            max_tokens: LLM_MAX_TOKENS,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "You classify an Arabic/English customer message into exactly one of the allowed business_type values. Output JSON {\"businessType\": string, \"confidence\": number 0..1}. If no signal, set businessType to \"\" and confidence to 0.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  allowed_business_types: candidates,
                  message: text,
                }),
              },
            ],
          },
          { signal: controller.signal as AbortSignal },
        );
        const raw = response.choices?.[0]?.message?.content || "";
        const parsed = JSON.parse(raw);
        const bt = typeof parsed?.businessType === "string" ? parsed.businessType : "";
        const conf =
          typeof parsed?.confidence === "number" ? parsed.confidence : 0;
        if (!bt) return null;
        return { businessType: bt, confidence: conf };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      this.logger.warn({
        message: "BusinessContextClassifier LLM fallback failed",
        err: (err as Error).message,
      });
      return null;
    }
  }

  private normalize(text: string): string {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[ً-ْ]/g, "")
      .replace(/[إأآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/\s+/g, " ")
      .trim();
  }
}
