import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import {
  AiV2RenderOutput,
  MessageUnderstandingV2,
  ReplyPlanV2,
  RuntimeContextV2,
  ToolActionResultV2,
} from "./ai-v2.types";
import { AI_V2_RENDER_JSON_SCHEMA } from "./reply-v2-schema";
import { withRetry, withTimeout } from "../../shared/utils/helpers";
import { isLocalTestMode } from "./message-understanding";

export interface ReplyRendererInputV2 {
  runtimeContext: RuntimeContextV2;
  understanding: MessageUnderstandingV2;
  plan: ReplyPlanV2;
  validatorRules: string[];
  toolResults: ToolActionResultV2[];
}

@Injectable()
export class ReplyRendererServiceV2 {
  private readonly logger = new Logger(ReplyRendererServiceV2.name);
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

  async render(
    input: ReplyRendererInputV2,
    options?: { model?: string; maxTokens?: number },
  ): Promise<{
    output: AiV2RenderOutput;
    tokensUsed: number;
    usedOpenAI: boolean;
  } | null> {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) {
      if (isLocalTestMode(this.config)) {
        return {
          output: buildLocalMockRender(input),
          tokensUsed: 0,
          usedOpenAI: false,
        };
      }
      return null;
    }

    try {
      const response = await withTimeout(
        withRetry(
          () =>
            this.client.beta.chat.completions.parse({
              model:
                (options?.model as any) ||
                this.config.get<string>("OPENAI_MODEL", "gpt-4o-mini"),
              temperature: 0.45,
              max_tokens: options?.maxTokens ?? 420,
              messages: [
                {
                  role: "system",
                  content: [
                    "You are ReplyRendererV2 for a merchant WhatsApp operator.",
                    "Write tone only; business truth must come only from allowed facts and successful tool results.",
                    "Use customerSafeFacts for customer-facing names, descriptions, prices, availability, and visible SKUs.",
                    "Never show fact IDs, catalogItemId, database IDs, raw SKUs, source labels, tool names, action names, local mode, demo mode, fixture, test, internal, or scope wording.",
                    "Never claim an order, payment, refund, return, or status is complete unless a successful tool result proves it.",
                    "Return structured JSON only.",
                  ].join(" "),
                },
                {
                  role: "user",
                  content: JSON.stringify(buildRendererPayload(input), null, 2),
                },
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
      return {
        output: {
          customer_reply: String(parsed.customer_reply),
          state_patch: {},
          used_fact_ids: Array.isArray(parsed.used_fact_ids)
            ? parsed.used_fact_ids.map(String)
            : [],
          risk_flags: Array.isArray(parsed.risk_flags)
            ? parsed.risk_flags.map(String)
            : [],
          confidence: Number(parsed.confidence ?? 0.7),
        },
        tokensUsed: (response as any).usage?.total_tokens ?? 0,
        usedOpenAI: true,
      };
    } catch (error: any) {
      this.logger.warn({
        msg: "ai_v2_renderer_llm_failed",
        name: String(error?.name || "OpenAIError"),
        code: error?.code ? String(error.code) : undefined,
        message: sanitizeErrorMessage(error?.message),
      });
      return null;
    }
  }
}

function buildRendererPayload(input: ReplyRendererInputV2) {
  const ctx = input.runtimeContext;
  return {
    currentCustomerMessage: ctx.currentCustomerMessage,
    last20Messages: ctx.last20Messages,
    olderSummary: ctx.olderSummary || null,
    aiV2State: {
      salesStage: ctx.aiV2State.salesStage,
      dialogTurnSeq: ctx.aiV2State.dialogTurnSeq,
      activeQuestion: ctx.activeQuestion || null,
      selectedItems: ctx.selectedItems,
      orderDraft: ctx.orderDraft || null,
      complaintState: ctx.complaintState || null,
      knownFacts: ctx.knownFacts,
    },
    customerSafeFacts: ctx.customerSafeFacts,
    understanding: input.understanding,
    plan: {
      nextBestAction: input.plan.nextBestAction,
      answerFirst: input.plan.answerFirst,
      allowedToAskDelivery: input.plan.allowedToAskDelivery,
      allowedToAskPayment: input.plan.allowedToAskPayment,
      maxQuestions: input.plan.maxQuestions,
      allowedFactIds: input.plan.allowedFactIds,
      selectedItemsSummary: input.plan.selectedItemsSummary,
      orderDraftSummary: input.plan.orderDraftSummary,
      complaintSummary: input.plan.complaintSummary,
      activeQuestionSummary: input.plan.activeQuestionSummary,
      doNotGreetAgain: input.plan.doNotGreetAgain,
      offTopicRedirectRequired: input.plan.offTopicRedirectRequired,
      rendererInstructions: input.plan.rendererInstructions,
    },
    toolAvailability: input.toolResults.map((result) => ({
      capability: safeCapabilityName(result.actionName),
      available: result.available,
      attempted: result.attempted,
      success: result.success,
      errorCode: result.errorCode,
      resultFactIds: result.resultFactIds,
      safeMessage: result.safeMessage,
    })),
    validatorRules: input.validatorRules,
  };
}

function buildLocalMockRender(input: ReplyRendererInputV2): AiV2RenderOutput {
  const allowedFacts = new Set(input.plan.allowedFactIds);
  const firstCatalog = input.runtimeContext.customerSafeFacts.catalogFacts.find(
    (fact) => allowedFacts.has(fact.id),
  );
  const phone = input.runtimeContext.merchantFacts.find(
    (fact) => fact.type === "phone" && allowedFacts.has(fact.id),
  );
  const address = input.runtimeContext.merchantFacts.find(
    (fact) => fact.type === "address" && allowedFacts.has(fact.id),
  );
  const payment = input.runtimeContext.merchantFacts.find(
    (fact) => fact.type === "payment_method" && allowedFacts.has(fact.id),
  );

  let reply = "تمام، أقدر أساعدك في تفاصيل المتجر والمنتجات والطلبات هنا.";
  const tags = input.understanding.intentTags;

  if (input.plan.offTopicRedirectRequired) {
    reply =
      "أقدر أساعدك في أسئلة المتجر والمنتجات والطلبات فقط. ابعتلي طلبك من المتجر.";
  } else if (
    tags.includes("greeting") &&
    input.runtimeContext.aiV2State.salesStage === "greeting"
  ) {
    reply = "وعليكم السلام، أهلاً بيك. أقدر أساعدك في المنتجات أو الطلبات.";
  } else if (tags.includes("location_question")) {
    reply = address
      ? `العنوان المسجل للمتجر: ${address.value}.`
      : "العنوان غير متاح عندي في بيانات المتجر حالياً.";
  } else if (tags.includes("contact_question")) {
    reply = phone
      ? `رقم التواصل المتاح هو ${phone.value}.`
      : "رقم التواصل غير متاح عندي في بيانات المتجر حالياً.";
  } else if (tags.includes("delivery_question")) {
    reply = "معلومات التوصيل غير متاحة عندي بشكل مؤكد حالياً.";
  } else if (tags.includes("payment_question")) {
    reply = payment
      ? `طريقة الدفع المتاحة حسب بيانات المتجر: ${payment.value}.`
      : "طرق الدفع غير متاحة عندي في بيانات المتجر حالياً.";
  } else if (tags.includes("order_status_question")) {
    reply =
      "مش متاح عندي تأكيد حالة الطلب بدون أداة متابعة الطلب. ابعت رقم الطلب عشان أراجع المتاح.";
  } else if (input.runtimeContext.aiV2State.salesStage === "complaint") {
    reply = "حقك علينا. ابعت رقم الطلب وتفاصيل المشكلة عشان أسجلها بدقة.";
  } else if (input.plan.nextBestAction === "ask_quantity") {
    reply = "تمام، الكمية المطلوبة كام؟";
  } else if (input.plan.nextBestAction === "ask_delivery") {
    reply = "تمام، سجلت الكمية. تحب التوصيل يكون لأي منطقة أو عنوان؟";
  } else if (
    input.plan.nextBestAction === "clarify" &&
    input.runtimeContext.orderDraft?.missingFields.includes("item")
  ) {
    reply = "تمام، نكمل الطلب. ابعت اسم المنتج اللي تحب تطلبه.";
  } else if (tags.includes("price_question") && firstCatalog) {
    reply =
      firstCatalog.price != null
        ? `${firstCatalog.name} سعره ${firstCatalog.price}.`
        : `السعر غير متاح عندي حالياً لـ ${firstCatalog.name}.`;
  } else if (
    (tags.includes("product_question") ||
      tags.includes("recommendation_request")) &&
    firstCatalog
  ) {
    reply = `المتاح عندي ضمن المنتجات: ${firstCatalog.name}${firstCatalog.price != null ? ` بسعر ${firstCatalog.price}` : ""}. تحب تعرف تفاصيله؟`;
  } else if (tags.includes("buying_intent")) {
    reply = "تمام، نبدأ نجمع تفاصيل الطلب. الكمية المطلوبة كام؟";
  }

  return {
    customer_reply: reply,
    state_patch: {},
    used_fact_ids: collectUsedFactIds(reply, input.runtimeContext),
    risk_flags: [],
    confidence: 0.72,
  };
}

function collectUsedFactIds(reply: string, ctx: RuntimeContextV2): string[] {
  const ids: string[] = [];
  for (const fact of ctx.merchantFacts) {
    if (reply.includes(fact.value)) ids.push(fact.id);
  }
  for (const fact of ctx.ragFacts.catalogFacts) {
    if (reply.includes(fact.customerFacingName)) ids.push(fact.id);
  }
  return ids;
}

function safeCapabilityName(actionName: string): string {
  const map: Record<string, string> = {
    searchCatalog: "catalog_search",
    getCatalogItem: "catalog_item_lookup",
    calculateQuote: "quote_calculation",
    createDraftOrder: "order_collection",
    updateDraftOrder: "order_collection_update",
    getMerchantPaymentSettings: "payment_settings_lookup",
    searchPublicKB: "public_knowledge_lookup",
    getBusinessRules: "business_rule_lookup",
    getOrderStatus: "order_status_lookup",
    recordComplaintNote: "complaint_collection",
    recordCustomerFeedback: "feedback_collection",
    attachProductMedia: "product_media_lookup",
    verifyPaymentProof: "payment_proof_check",
  };
  return map[actionName] || "backend_capability";
}

function sanitizeErrorMessage(message: unknown): string | undefined {
  if (!message) return undefined;
  return String(message)
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted_openai_key]")
    .slice(0, 240);
}
