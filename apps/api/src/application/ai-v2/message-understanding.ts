import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import {
  CustomerEmotionV2,
  CustomerLanguageV2,
  IntentTagV2,
  MessageUnderstandingV2,
  RuntimeContextV2,
  UnderstandingDomainV2,
} from "./ai-v2.types";

const INTENT_TAGS: IntentTagV2[] = [
  "greeting",
  "small_talk",
  "product_question",
  "recommendation_request",
  "price_question",
  "availability_question",
  "offer_discount_question",
  "buying_intent",
  "selection_answer",
  "quantity_answer",
  "objection_price",
  "complaint",
  "angry_escalation",
  "manager_request",
  "feedback_positive",
  "feedback_negative",
  "order_status_question",
  "payment_question",
  "delivery_question",
  "contact_question",
  "location_question",
  "policy_question",
  "support_question",
  "off_topic_general",
  "vague_followup",
];

const TAG_SET = new Set<string>(INTENT_TAGS);

@Injectable()
export class MessageUnderstandingV2Service {
  private readonly logger = new Logger(MessageUnderstandingV2Service.name);
  private readonly client: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.get<string>("OPENAI_API_KEY") || "",
    });
  }

  async analyze(
    text: string,
    runtimeContext?: RuntimeContextV2,
  ): Promise<MessageUnderstandingV2> {
    assertLocalModeNotProduction(this.config);

    const customerText = String(text || "").trim();
    const localMode = isLocalTestMode(this.config);
    const apiKey = this.config.get<string>("OPENAI_API_KEY");

    if (apiKey) {
      const llm = await this.tryAnalyzeWithLlm(customerText, runtimeContext);
      if (llm)
        return repairActiveQuestionAnswer(llm, customerText, runtimeContext);
    }

    if (localMode) {
      return repairActiveQuestionAnswer(
        buildLocalMockUnderstanding(customerText, runtimeContext),
        customerText,
        runtimeContext,
      );
    }

    return repairActiveQuestionAnswer(
      buildTinyFallbackUnderstanding(customerText),
      customerText,
      runtimeContext,
    );
  }

  private async tryAnalyzeWithLlm(
    customerText: string,
    runtimeContext?: RuntimeContextV2,
  ): Promise<MessageUnderstandingV2 | null> {
    try {
      const response = await this.client.beta.chat.completions.parse({
        model: this.config.get<string>("OPENAI_MODEL", "gpt-4o-mini"),
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: [
              "You are MessageUnderstandingV2 for a merchant WhatsApp operations assistant.",
              "Classify only the customer's merchant-related intent.",
              "Do not answer the customer. Return structured JSON only.",
              "Use activeQuestion, aiV2State, last20Messages, merchantFacts, and ragFacts to resolve short replies.",
              "If the message asks unrelated general knowledge, set domain=off_topic_general and include off_topic_general.",
              "Never infer merchant facts that are not present in runtimeContext.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                customerMessage: customerText,
                runtimeContext: runtimeContext || null,
              },
              null,
              2,
            ),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: UNDERSTANDING_JSON_SCHEMA as any,
        },
      });

      const parsed =
        (response as any).choices?.[0]?.message?.parsed ||
        (response as any).parsed;
      if (!parsed) return null;
      return normalizeUnderstanding(parsed, {
        usedOpenAI: true,
        fallbackUsed: false,
        defaultLanguage: detectLanguage(customerText),
      });
    } catch (error: any) {
      this.logger.warn({
        msg: "ai_v2_understanding_llm_failed",
        name: String(error?.name || "OpenAIError"),
        code: error?.code ? String(error.code) : undefined,
        message: sanitizeErrorMessage(error?.message),
      });
      return null;
    }
  }
}

export function isLocalTestMode(config: ConfigService): boolean {
  return (
    String(config.get<string>("AI_V2_LOCAL_TEST_MODE") || "").toLowerCase() ===
    "true"
  );
}

export function assertLocalModeNotProduction(config: ConfigService): void {
  const localMode = isLocalTestMode(config);
  const nodeEnv = String(
    config.get<string>("NODE_ENV") || process.env.NODE_ENV || "",
  );
  if (localMode && nodeEnv.toLowerCase() === "production") {
    throw new Error("AI_V2_LOCAL_TEST_MODE cannot be enabled in production");
  }
}

function normalizeUnderstanding(
  raw: any,
  opts: {
    usedOpenAI: boolean;
    fallbackUsed: boolean;
    defaultLanguage: CustomerLanguageV2;
  },
): MessageUnderstandingV2 {
  const domain = normalizeDomain(raw?.domain);
  const tags = normalizeTags(raw?.intentTags, domain);
  const emotion = normalizeEmotion(raw?.customerEmotion);

  return {
    domain,
    language: normalizeLanguage(raw?.language, opts.defaultLanguage),
    intentTags: tags,
    customerGoal:
      typeof raw?.customerGoal === "string" && raw.customerGoal.trim()
        ? raw.customerGoal.trim().slice(0, 240)
        : null,
    customerEmotion: emotion,
    mentionedItems: Array.isArray(raw?.mentionedItems)
      ? raw.mentionedItems
          .map(String)
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [],
    mentionedPreferences:
      raw?.mentionedPreferences &&
      typeof raw.mentionedPreferences === "object" &&
      !Array.isArray(raw.mentionedPreferences)
        ? raw.mentionedPreferences
        : {},
    answerToActiveQuestion: normalizeActiveQuestionAnswer(
      raw?.answerToActiveQuestion,
    ),
    buyingSignal: Boolean(raw?.buyingSignal),
    needsStoreAnswer: Boolean(
      raw?.needsStoreAnswer ?? domain !== "off_topic_general",
    ),
    shouldGreet: Boolean(raw?.shouldGreet),
    reason: String(raw?.reason || "structured_understanding").slice(0, 240),
    confidence: clamp(Number(raw?.confidence ?? 0.82), 0, 1),
    usedOpenAI: opts.usedOpenAI,
    fallbackUsed: opts.fallbackUsed,
  };
}

function normalizeDomain(value: unknown): UnderstandingDomainV2 {
  if (
    value === "store_related" ||
    value === "small_talk" ||
    value === "off_topic_general"
  ) {
    return value;
  }
  return "store_related";
}

function normalizeTags(
  value: unknown,
  domain: UnderstandingDomainV2,
): IntentTagV2[] {
  const tags = Array.isArray(value)
    ? (value
        .map(String)
        .map((t) => (t === "objection" ? "objection_price" : t))
        .filter((t) => TAG_SET.has(t)) as IntentTagV2[])
    : [];
  if (domain === "off_topic_general" && !tags.includes("off_topic_general")) {
    tags.push("off_topic_general");
  }
  return Array.from(new Set(tags));
}

function normalizeLanguage(
  value: unknown,
  fallback: CustomerLanguageV2,
): CustomerLanguageV2 {
  if (value === "ar" || value === "en" || value === "mixed") return value;
  return fallback;
}

function normalizeEmotion(value: unknown): CustomerEmotionV2 {
  const allowed: CustomerEmotionV2[] = [
    "neutral",
    "interested",
    "hesitant",
    "confused",
    "frustrated",
    "angry",
    "happy",
    "complaining",
  ];
  return allowed.includes(value as CustomerEmotionV2)
    ? (value as CustomerEmotionV2)
    : "neutral";
}

function normalizeActiveQuestionAnswer(
  value: unknown,
): MessageUnderstandingV2["answerToActiveQuestion"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.kind !== "string") return null;
  const normalizedValue =
    record.kind === "quantity" &&
    (typeof record.value === "string" || typeof record.value === "number")
      ? (normalizeQuantityValue(record.value) ?? record.value)
      : record.value;
  return {
    kind: record.kind,
    value: normalizedValue,
    confidence: clamp(Number(record.confidence ?? 0.5), 0, 1),
  };
}

function repairActiveQuestionAnswer(
  understanding: MessageUnderstandingV2,
  customerText: string,
  runtimeContext?: RuntimeContextV2,
): MessageUnderstandingV2 {
  const active = runtimeContext?.activeQuestion;
  if (active?.kind !== "quantity") return understanding;
  const quantity = normalizeQuantityValue(customerText);
  const llmQuantity = normalizeQuantityValue(
    understanding.answerToActiveQuestion?.value,
  );
  const value = typeof quantity === "number" ? quantity : llmQuantity;
  if (typeof value !== "number") return understanding;

  const intentTags = understanding.intentTags.includes("quantity_answer")
    ? understanding.intentTags
    : [...understanding.intentTags, "quantity_answer"];
  const repairedTags: IntentTagV2[] = intentTags.filter(
    (tag): tag is IntentTagV2 => tag !== "support_question",
  );
  return {
    ...understanding,
    domain: "store_related",
    intentTags: repairedTags,
    mentionedItems: understanding.mentionedItems.filter(
      (item) => normalizeQuantityValue(item) !== value,
    ),
    answerToActiveQuestion: {
      kind: "quantity",
      value,
      confidence: Math.max(
        understanding.answerToActiveQuestion?.confidence ?? 0,
        0.92,
      ),
    },
    needsStoreAnswer: true,
    reason: `${understanding.reason}|active_quantity_resolved`,
  };
}

function normalizeQuantityValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,5})$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildTinyFallbackUnderstanding(text: string): MessageUnderstandingV2 {
  const trimmed = String(text || "").trim();
  const language = detectLanguage(trimmed);
  return {
    domain: "store_related",
    language,
    intentTags: trimmed ? ["support_question"] : ["vague_followup"],
    customerGoal: null,
    customerEmotion: "neutral",
    mentionedItems: [],
    mentionedPreferences: {},
    answerToActiveQuestion: null,
    buyingSignal: false,
    needsStoreAnswer: true,
    shouldGreet: false,
    reason: "tiny_low_confidence_fallback",
    confidence: 0.2,
    usedOpenAI: false,
    fallbackUsed: true,
    errorCode: "UNDERSTANDING_LLM_UNAVAILABLE",
  };
}

function buildLocalMockUnderstanding(
  text: string,
  runtimeContext?: RuntimeContextV2,
): MessageUnderstandingV2 {
  const raw = String(text || "").trim();
  const normalized = raw.toLowerCase();
  const language = detectLanguage(raw);
  const tags: IntentTagV2[] = [];
  let domain: UnderstandingDomainV2 = "store_related";
  let emotion: CustomerEmotionV2 = "neutral";
  let answerToActiveQuestion: MessageUnderstandingV2["answerToActiveQuestion"] =
    null;

  const add = (...items: IntentTagV2[]) => {
    for (const item of items) {
      if (!tags.includes(item)) tags.push(item);
    }
  };

  if (
    /^(السلام عليكم|سلام|هاي|hi|hello|hey)(?:\s|$|[!.؟،,])/i.test(normalized)
  ) {
    add("greeting");
  }
  if (
    /ماتش|ميسي|javascript|python|programming|homework|politics|انتخابات/i.test(
      normalized,
    )
  ) {
    domain = "off_topic_general";
    add("off_topic_general");
  }
  if (
    /هدية|هدايا|بوكس|product|منتج|عندكم|متوفر|available|ورد/i.test(normalized)
  ) {
    domain = "store_related";
    remove(tags, "off_topic_general");
    add("product_question");
  }
  if (/ترشح|اقتراح|recommend|suggest|انسب|best/i.test(normalized)) {
    add("recommendation_request");
  }
  if (/بكام|سعر|price|how much/i.test(normalized)) add("price_question");
  if (/دفع|payment|دفعت|paid/i.test(normalized)) add("payment_question");
  if (/توصيل|delivery|شحن|بتوصل/i.test(normalized)) add("delivery_question");
  if (/رقم|واتساب|phone|call/i.test(normalized)) add("contact_question");
  if (/عنوان|مكانكم|لوكيشن|address|location/i.test(normalized)) {
    add("location_question", "contact_question");
  }
  if (/استرجاع|استبدال|ضمان|refund|return|policy/i.test(normalized)) {
    add("policy_question");
  }
  if (/فين\s+(طلبي|الطلب|الاوردر)|order status|track/i.test(normalized)) {
    add("order_status_question");
  }
  if (/اشتري|اطلب|اوردر|order|buy|checkout/i.test(normalized)) {
    add("buying_intent");
  }
  if (/غالي|expensive|too much/i.test(normalized)) add("objection_price");
  if (
    /شكوى|مشكلة|وحش|نصاب|اتأخر|تأخير|مش\s+زي\s+الصور|الصور|quality|wrong item|damaged/i.test(
      normalized,
    )
  ) {
    add("complaint");
    emotion = /نصاب|angry|بلاغ|هشتكي/i.test(normalized)
      ? "angry"
      : "complaining";
  }
  if (/مدير|manager|supervisor|مسؤول|مسئول/i.test(normalized)) {
    add("manager_request", "complaint");
    emotion = "angry";
  }
  if (
    /شكرا|thanks|ممتاز|حلو جدا|حلو جداً/i.test(normalized) &&
    !/مش|bad/i.test(normalized)
  ) {
    add("feedback_positive");
    emotion = "happy";
  }
  if (/الأول|الاول|first|option 1/i.test(normalized)) {
    add("selection_answer");
    answerToActiveQuestion = resolveActiveQuestion(
      "choice",
      "first",
      runtimeContext,
    );
  }
  if (/الثاني|التاني|second|option 2/i.test(normalized)) {
    add("selection_answer");
    answerToActiveQuestion = resolveActiveQuestion(
      "choice",
      "second",
      runtimeContext,
    );
  }
  if (/الاثنين|الاتنين|both|all/i.test(normalized)) {
    add("selection_answer");
    answerToActiveQuestion = resolveActiveQuestion(
      "choice",
      "both",
      runtimeContext,
    );
  }
  if (/^(تمام|ماشي|اه|أيوه|ايوه|نعم|yes|ok|okay|sure)$/i.test(normalized)) {
    answerToActiveQuestion = resolveActiveQuestion(
      runtimeContext?.activeQuestion?.kind || "confirmation",
      true,
      runtimeContext,
    );
  }
  if (/^(لا|لأ|no)$/i.test(normalized)) {
    answerToActiveQuestion = resolveActiveQuestion(
      runtimeContext?.activeQuestion?.kind || "confirmation",
      false,
      runtimeContext,
    );
  }
  const quantity = raw.match(/^\s*(\d{1,3})\s*$/)?.[1];
  if (quantity) {
    add("quantity_answer");
    answerToActiveQuestion = {
      kind: "quantity",
      value: Number(quantity),
      confidence: 0.9,
    };
  }
  if (/مش عارف|محتار|idk|dunno/i.test(normalized)) add("vague_followup");

  if (domain === "off_topic_general") {
    return normalizeUnderstanding(
      {
        domain,
        language,
        intentTags: tags,
        customerEmotion: emotion,
        needsStoreAnswer: false,
        shouldGreet: false,
        reason: "local_mock_off_topic",
        confidence: 0.74,
      },
      { usedOpenAI: false, fallbackUsed: false, defaultLanguage: language },
    );
  }

  if (tags.length === 0) add("support_question");

  return normalizeUnderstanding(
    {
      domain,
      language,
      intentTags: tags,
      customerEmotion: emotion,
      mentionedItems: extractMentionedItems(raw),
      mentionedPreferences: {},
      answerToActiveQuestion,
      buyingSignal: tags.includes("buying_intent"),
      needsStoreAnswer: tags.some(
        (tag) => tag !== "greeting" && tag !== "small_talk",
      ),
      shouldGreet:
        tags.includes("greeting") && !runtimeContext?.aiV2State?.dialogTurnSeq,
      reason: "local_mock_understanding",
      confidence: 0.76,
    },
    { usedOpenAI: false, fallbackUsed: false, defaultLanguage: language },
  );
}

function resolveActiveQuestion(
  kind: string,
  value: unknown,
  runtimeContext?: RuntimeContextV2,
): MessageUnderstandingV2["answerToActiveQuestion"] {
  if (!runtimeContext?.activeQuestion) {
    return { kind, value, confidence: 0.65 };
  }
  const active = runtimeContext.activeQuestion;
  let resolvedValue = value;
  if (active.kind === "choice" && typeof value === "string") {
    const options = active.options || [];
    if (value === "first")
      resolvedValue = options[0]?.catalogItemId || options[0]?.label || value;
    if (value === "second")
      resolvedValue = options[1]?.catalogItemId || options[1]?.label || value;
    if (value === "both") {
      resolvedValue = options
        .slice(0, 2)
        .map((o) => o.catalogItemId || o.label)
        .filter(Boolean);
    }
  }
  return { kind: active.kind, value: resolvedValue, confidence: 0.82 };
}

function extractMentionedItems(text: string): string[] {
  const stopwords = new Set([
    "السلام",
    "عليكم",
    "عندكم",
    "عايز",
    "عاوز",
    "اعمل",
    "اوردر",
    "الأوردر",
    "الاوردر",
    "فين",
    "كام",
    "ممكن",
    "تحب",
    "محتاج",
  ]);
  const cleaned = text
    .replace(/[؟?!.,،]/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(
      (x) =>
        x.length > 2 && !/^\d+$/.test(x) && !stopwords.has(x.toLowerCase()),
    );
  return cleaned.slice(0, 6);
}

function remove<T>(items: T[], value: T): void {
  const index = items.indexOf(value);
  if (index >= 0) items.splice(index, 1);
}

function detectLanguage(text: string): CustomerLanguageV2 {
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  const hasLatin = /[a-zA-Z]{2,}/.test(text);
  if (hasArabic && hasLatin) return "mixed";
  if (hasLatin) return "en";
  return "ar";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sanitizeErrorMessage(message: unknown): string | undefined {
  if (!message) return undefined;
  return String(message)
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted_openai_key]")
    .slice(0, 240);
}

const UNDERSTANDING_JSON_SCHEMA = {
  name: "MessageUnderstandingV2",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      domain: {
        type: "string",
        enum: ["store_related", "small_talk", "off_topic_general"],
      },
      language: { type: "string", enum: ["ar", "en", "mixed"] },
      intentTags: {
        type: "array",
        items: { type: "string", enum: INTENT_TAGS },
      },
      customerGoal: { type: ["string", "null"] },
      customerEmotion: {
        type: "string",
        enum: [
          "neutral",
          "interested",
          "hesitant",
          "confused",
          "frustrated",
          "angry",
          "happy",
          "complaining",
        ],
      },
      mentionedItems: { type: "array", items: { type: "string" } },
      mentionedPreferences: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      answerToActiveQuestion: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: { type: "string" },
              value: {
                anyOf: [
                  { type: "string" },
                  { type: "number" },
                  { type: "boolean" },
                  {
                    type: "array",
                    items: {
                      anyOf: [
                        { type: "string" },
                        { type: "number" },
                        { type: "boolean" },
                      ],
                    },
                  },
                  { type: "null" },
                ],
              },
              confidence: { type: "number" },
            },
            required: ["kind", "value", "confidence"],
          },
        ],
      },
      buyingSignal: { type: "boolean" },
      needsStoreAnswer: { type: "boolean" },
      shouldGreet: { type: "boolean" },
      reason: { type: "string" },
      confidence: { type: "number" },
    },
    required: [
      "domain",
      "language",
      "intentTags",
      "customerGoal",
      "customerEmotion",
      "mentionedItems",
      "mentionedPreferences",
      "answerToActiveQuestion",
      "buyingSignal",
      "needsStoreAnswer",
      "shouldGreet",
      "reason",
      "confidence",
    ],
  },
} as const;
