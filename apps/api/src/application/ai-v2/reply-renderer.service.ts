import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { Merchant } from "../../domain/entities/merchant.entity";
import { AiV2RenderOutput } from "./ai-v2.types";
import { RagContextV2 } from "./ai-v2.types";
import { ReplyPlanV2 } from "./ai-v2.types";
import { AI_V2_RENDER_JSON_SCHEMA } from "./reply-v2-schema";
import { withRetry, withTimeout } from "../../shared/utils/helpers";

export interface ReplyRendererInputV2 {
  merchant: Merchant;
  customerMessage: string;
  memoryBrief: string;
  plan: ReplyPlanV2;
  rag: RagContextV2;
}

@Injectable()
export class ReplyRendererServiceV2 {
  private readonly client: OpenAI;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.get<string>("OPENAI_API_KEY") || "",
    });
    this.timeoutMs = Number(
      this.config.get<string>("OPENAI_TIMEOUT_MS", "20000"),
    );
  }

  /**
   * Renders a human WhatsApp reply; returns null if API key missing or call fails.
   */
  async render(
    input: ReplyRendererInputV2,
    options?: { model?: string; maxTokens?: number },
  ): Promise<{ output: AiV2RenderOutput; tokensUsed: number } | null> {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) return null;

    const factsBlock = buildFactsForPrompt(
      input.rag,
      input.plan.allowedFactIds,
    );
    const system = buildSystemPrompt(input.merchant, input.plan);
    const user = JSON.stringify(
      {
        customerMessage: input.customerMessage,
        memoryBrief: input.memoryBrief,
        plan: {
          nextBestAction: input.plan.nextBestAction,
          operatorMode: input.plan.operator.mode,
          toneDialect: input.plan.operator.toneDialect,
          warmth: input.plan.operator.warmth,
          emojiBudget: input.plan.operator.emojiBudget,
          emotion: input.plan.emotion,
          plannerNotes: input.plan.plannerNotes,
        },
        facts: factsBlock,
        rules: [
          "Write one short WhatsApp message; at most one question mark.",
          "Do not mention AI, bot, or system.",
          "Use only prices and product names from facts when citing products.",
          "If price is missing for an item, say the price is not available — do not invent.",
          "Do not ask for address, delivery location, or payment unless plan allows checkout language (wave1: avoid payment/address entirely).",
          "used_fact_ids must only list ids from facts list.",
          "Match customer language (ar/en/mixed) naturally.",
        ],
      },
      null,
      2,
    );

    try {
      const response = await withTimeout(
        withRetry(
          () =>
            this.client.beta.chat.completions.parse({
              model: (options?.model as any) || "gpt-4o-mini",
              temperature: 0.65,
              max_tokens: options?.maxTokens ?? 380,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
              response_format: {
                type: "json_schema",
                json_schema:
                  AI_V2_RENDER_JSON_SCHEMA as unknown as OpenAI.ResponseFormatJSONSchema["json_schema"],
              },
            }),
          { maxRetries: 1, initialDelayMs: 400 },
        ),
        Math.min(this.timeoutMs, 20000),
        "ai_v2_render_timeout",
      );

      const parsed =
        (response as any).choices?.[0]?.message?.parsed ||
        (response as any).parsed;
      if (!parsed?.customer_reply) return null;

      const output: AiV2RenderOutput = {
        customer_reply: String(parsed.customer_reply),
        state_patch: {},
        used_fact_ids: Array.isArray(parsed.used_fact_ids)
          ? parsed.used_fact_ids.map(String)
          : [],
        risk_flags: Array.isArray(parsed.risk_flags)
          ? parsed.risk_flags.map(String)
          : [],
        confidence: Number(parsed.confidence ?? 0.7),
      };

      const tokensUsed = (response as any).usage?.total_tokens ?? 0;
      return { output, tokensUsed };
    } catch {
      return null;
    }
  }
}

function buildSystemPrompt(merchant: Merchant, plan: ReplyPlanV2): string {
  return `You are a real human from team ${merchant.name} replying on WhatsApp.
Merchant mode: ${plan.operator.mode}. Next action: ${plan.nextBestAction.type} (${plan.nextBestAction.reason}).
Be warm, concise, and natural. Dialect hint: ${plan.operator.toneDialect}.`;
}

function buildFactsForPrompt(
  rag: RagContextV2,
  allowedIds: string[],
): Array<{ id: string; text: string }> {
  const allowed = new Set(allowedIds);
  const out: Array<{ id: string; text: string }> = [];
  for (const c of rag.catalogFacts) {
    const id = `cat:${c.catalogItemId}`;
    if (!allowed.has(id)) continue;
    const pricePart =
      c.price != null ? `price=${c.price}` : "price=UNAVAILABLE";
    out.push({
      id,
      text: `Product: ${c.name}; ${pricePart}; availability=${c.availability || "unknown"}`,
    });
  }
  for (const k of rag.kbFacts) {
    const id = `kb:${k.chunkId}`;
    if (!allowed.has(id)) continue;
    out.push({ id, text: k.text.slice(0, 900) });
  }
  return out;
}
