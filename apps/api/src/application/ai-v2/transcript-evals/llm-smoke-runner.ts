import { ConfigService } from "@nestjs/config";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { ActionExecutorV2 } from "../action-executor";
import { AiV2Service } from "../ai-v2.service";
import {
  EMPTY_RAG_CONTEXT_V2,
  MessageUnderstandingV2,
  RuntimeContextV2,
} from "../ai-v2.types";
import {
  fixtureCatalog,
  fixtureConversation,
  fixtureMerchant,
  fixtureRecentMessages,
} from "../local-test-fixtures";
import { MessageUnderstandingV2Service } from "../message-understanding";
import { RagContextBuilderServiceV2 } from "../rag-context-builder.service";
import { ReplyPlannerV2 } from "../reply-planner";
import { ReplyRendererServiceV2 } from "../reply-renderer.service";
import { ReplyValidatorV2 } from "../reply-validator";
import { RuntimeContextBuilderV2 } from "../runtime-context-builder";
import { SalesStateReducerV2 } from "../sales-state-reducer";
import { ToolRegistryV2 } from "../tool-registry";
import { ConversationStateLoaderV2 } from "../conversation-state-loader";

interface SmokeResult {
  name: string;
  pass: boolean;
  failures: string[];
  reply?: string;
}

interface LlmSmokeScenario {
  name: string;
  message: string;
  priorAiV2State?: Record<string, unknown>;
  recentMessages?: any[];
  catalogItems?: any[];
  assert: (
    reply: string,
    understanding: MessageUnderstandingV2,
    failures: string[],
  ) => void;
}

const HALLUCINATED_FACT_RE =
  /(?:010[1-9]\d{7}|012[1-9]\d{7}|011[1-9]\d{7}|015[1-9]\d{7}|فودافون\s*كاش|vodafone\s*cash|instapay|انستاباي|خصم\s*\d+|discount\s*\d+|free\s+shipping|شحن\s+مجاني|refund\s+within|استرجاع\s+خلال|العنوان\s+هو)/iu;
const INTERNAL_REPLY_LEAK_RE =
  /\b(?:BAG-001|PERF-RED-22|cat:[A-Za-z0-9:_-]+|mf:phone|fixture|test\s+data|source\s*:|internal|local\s+mode|demo\s+mode|AI_V2_LOCAL_TEST_MODE)\b/iu;

export async function runAiV2RealLlmSmokeTests(): Promise<SmokeResult[]> {
  loadLocalEnvFiles();
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log("SKIPPED_REAL_LLM_TESTS_NO_OPENAI_API_KEY");
    return [];
  }

  // Ensure this command validates the real path, not the local mock fallback.
  process.env.AI_V2_LOCAL_TEST_MODE = "false";

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      openAiKey: "present",
      openAiKeyLength: apiKey.length,
      model,
    }),
  );

  const config = new ConfigService(process.env as any);
  const understanding = new MessageUnderstandingV2Service(config);
  const ragBuilder = new RagContextBuilderServiceV2({
    async hasStructuredKb() {
      return false;
    },
    async searchChunks() {
      return [];
    },
    async getAllRules() {
      return {};
    },
  } as any);
  const renderer = new ReplyRendererServiceV2(config);
  const registry = new ToolRegistryV2();
  const actionExecutor = new ActionExecutorV2(registry);
  const ai = new AiV2Service(
    understanding,
    ragBuilder,
    renderer,
    actionExecutor,
    config,
  );

  const results: SmokeResult[] = [];
  results.push(
    await runStructuredUnderstandingAndRendererSmoke({
      understanding,
      renderer,
      actionExecutor,
      model,
    }),
  );

  const scenarios: LlmSmokeScenario[] = [
    {
      name: "active quantity answer resolves",
      message: "200",
      priorAiV2State: {
        dialogTurnSeq: 4,
        salesStage: "order_draft",
        stage: "order_draft",
        activeQuestion: {
          kind: "quantity",
          text: "quantity",
          askedAt: new Date().toISOString(),
        },
        selectedItems: [
          { label: "منتج عام A", confidence: 0.8, source: "customer" },
        ],
        orderDraft: {
          items: [{ label: "منتج عام A", source: "customer" }],
          status: "collecting",
          missingFields: ["quantity", "delivery"],
        },
      },
      recentMessages: fixtureRecentMessages([
        { role: "customer", text: "عايز اعمل اوردر" },
        { role: "assistant", text: "تمام، الكمية المطلوبة كام؟" },
      ]),
      assert: (_reply, u, failures) => {
        if (u.answerToActiveQuestion?.kind !== "quantity") {
          failures.push("quantity_active_question_not_resolved");
        }
        if (u.answerToActiveQuestion?.value !== 200) {
          failures.push("quantity_active_question_value_not_200");
        }
      },
    },
    {
      name: "renderer hides internal catalog identifiers",
      message: "عندكم هدايا عيد ميلاد؟",
      catalogItems: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          nameAr: "هدية عيد ميلاد فاخرة",
          basePrice: 120,
          sku: "BAG-001",
          isActive: true,
          isAvailable: true,
          variants: [],
          options: [],
          tags: ["gift"],
        },
      ],
      assert: (reply, _u, failures) => {
        if (INTERNAL_REPLY_LEAK_RE.test(reply)) {
          failures.push("internal_catalog_identifier_leaked");
        }
      },
    },
    {
      name: "unsupported order creation is collection only",
      message: "عايز اعمل اوردر",
      assert: (reply, _u, failures) => {
        if (
          /تم\s+(?:إنشاء|تأكيد|تسجيل)|order\s+(?:created|confirmed)/iu.test(
            reply,
          )
        ) {
          failures.push("unsupported_order_creation_claimed");
        }
      },
    },
    {
      name: "order status unavailable is not invented",
      message: "فين الاوردر؟",
      assert: (reply, _u, failures) => {
        if (/في الطريق|اتشحن|وصل|جاهز|shipped|delivered|ready/iu.test(reply)) {
          failures.push("invented_order_status");
        }
      },
    },
    {
      name: "product details hide raw catalog id",
      message: "تفاصيل هدية عيد ميلاد فاخرة؟",
      catalogItems: [
        {
          id: "cat-db-raw-123",
          nameAr: "هدية عيد ميلاد فاخرة",
          basePrice: 120,
          sku: "BAG-001",
          isActive: true,
          isAvailable: true,
          variants: [],
          options: [],
          tags: ["gift"],
        },
      ],
      assert: (reply, _u, failures) => {
        if (
          INTERNAL_REPLY_LEAK_RE.test(reply) ||
          /cat-db-raw-123/i.test(reply)
        ) {
          failures.push("raw_catalog_id_or_sku_leaked");
        }
      },
    },
    {
      name: "off-topic is redirected",
      message: "اشرحلي JavaScript closures بسرعة",
      assert: (
        reply: string,
        u: MessageUnderstandingV2,
        failures: string[],
      ) => {
        if (
          u.domain !== "off_topic_general" &&
          !u.intentTags.includes("off_topic_general")
        ) {
          failures.push("understanding_did_not_mark_off_topic");
        }
        if (/javascript|closures|function scope|scope chain/i.test(reply)) {
          failures.push("off_topic_factual_answer_returned");
        }
      },
    },
    {
      name: "store gift question is store related",
      message: "محتاج هدية من منتجاتكم، ترشحلي إيه؟",
      assert: (
        reply: string,
        u: MessageUnderstandingV2,
        failures: string[],
      ) => {
        if (u.domain !== "store_related") {
          failures.push(`expected_store_related_got_${u.domain}`);
        }
        if (
          !u.intentTags.some((tag) =>
            ["product_question", "recommendation_request"].includes(tag),
          )
        ) {
          failures.push("store_question_missing_product_or_recommendation_tag");
        }
        assertArabicStoreTone(reply, failures);
      },
    },
    {
      name: "merchant facts only for phone address payment",
      message: "رقمكم وعنوانكم وطرق الدفع إيه؟",
      assert: (
        reply: string,
        _u: MessageUnderstandingV2,
        failures: string[],
      ) => {
        assertNoHallucinatedBusinessFacts(reply, failures, {
          allowedPhone: "+201000000000",
          allowedAddress: "Store address (available in chat only)",
          allowedPayment: "Cash on delivery",
        });
      },
    },
    {
      name: "mixed English Arabic price question works",
      message: "Do you have منتج عام A and how much?",
      assert: (
        reply: string,
        u: MessageUnderstandingV2,
        failures: string[],
      ) => {
        if (u.domain !== "store_related") {
          failures.push(`expected_store_related_mixed_got_${u.domain}`);
        }
        assertNoHallucinatedBusinessFacts(reply, failures, {
          allowedPrices: ["120"],
        });
      },
    },
    {
      name: "prior context prevents repeated greeting",
      message: "اهلا",
      priorAiV2State: {
        dialogTurnSeq: 3,
        salesStage: "selection",
        stage: "selection",
        selectedItems: [
          { label: "منتج عام A", confidence: 0.8, source: "customer" },
        ],
        orderDraft: {
          items: [{ label: "منتج عام A", source: "customer" }],
          status: "collecting",
          missingFields: ["quantity"],
        },
      },
      recentMessages: fixtureRecentMessages([
        { role: "customer", text: "عايز منتج عام A" },
        { role: "assistant", text: "تمام، تحب كام قطعة؟" },
      ]),
      assert: (
        reply: string,
        _u: MessageUnderstandingV2,
        failures: string[],
      ) => {
        if (/^(?:أهلاً|اهلا|مرحبا|السلام عليكم|hi|hello|hey)\b/iu.test(reply)) {
          failures.push("repeated_greeting_with_prior_context");
        }
      },
    },
  ];

  for (const scenario of scenarios) {
    results.push(
      await runAiScenario({
        ai,
        model,
        name: scenario.name,
        message: scenario.message,
        priorAiV2State: scenario.priorAiV2State,
        recentMessages: scenario.recentMessages,
        catalogItems: scenario.catalogItems,
        assert: scenario.assert,
      }),
    );
  }

  return results;
}

function loadLocalEnvFiles(): void {
  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
  const apiRoot = path.resolve(__dirname, "..", "..", "..", "..");
  for (const filePath of [
    path.join(repoRoot, ".env"),
    path.join(repoRoot, ".env.test"),
    path.join(apiRoot, ".env"),
    path.join(apiRoot, ".env.test"),
  ]) {
    if (fs.existsSync(filePath)) {
      dotenv.config({
        path: filePath,
        quiet: true,
        override: !String(process.env.OPENAI_API_KEY || "").trim(),
      });
    }
  }
}

async function runStructuredUnderstandingAndRendererSmoke(input: {
  understanding: MessageUnderstandingV2Service;
  renderer: ReplyRendererServiceV2;
  actionExecutor: ActionExecutorV2;
  model: string;
}): Promise<SmokeResult> {
  const failures: string[] = [];
  const runtimeContext = await buildRuntimeContext({
    message: "كم سعر منتج عام A؟",
    priorAiV2State: { dialogTurnSeq: 1, salesStage: "quote", stage: "quote" },
  });
  const understanding = await input.understanding.analyze(
    "كم سعر منتج عام A؟",
    runtimeContext,
  );
  assertStructuredUnderstanding(understanding, failures);
  const plan = ReplyPlannerV2.plan({ runtimeContext, understanding });
  const toolResults = await input.actionExecutor.execute({
    runtimeContext,
    plan,
  });
  const rendered = await input.renderer.render(
    {
      runtimeContext,
      understanding,
      plan,
      validatorRules: plan.mustNotInvent,
      toolResults,
    },
    { model: input.model, maxTokens: 360 },
  );

  if (!rendered?.usedOpenAI) failures.push("renderer_did_not_use_openai");
  if (!rendered?.output?.customer_reply) {
    failures.push("renderer_structured_output_missing_customer_reply");
  } else {
    const validation = ReplyValidatorV2.validate({
      render: rendered.output,
      runtimeContext,
      understanding,
      plan,
      toolResults,
    });
    assertReplyBasics(validation.replyText, failures);
    if (validation.failures.length > 0) {
      failures.push(
        ...validation.failures.map((failure) => `validator:${failure}`),
      );
    }
  }

  return {
    name: "structured understanding and renderer",
    pass: failures.length === 0,
    failures,
    reply: rendered?.output?.customer_reply,
  };
}

async function runAiScenario(input: {
  ai: AiV2Service;
  model: string;
  name: string;
  message: string;
  priorAiV2State?: Record<string, unknown>;
  recentMessages?: any[];
  catalogItems?: any[];
  assert: (
    reply: string,
    understanding: MessageUnderstandingV2,
    failures: string[],
  ) => void;
}): Promise<SmokeResult> {
  const failures: string[] = [];
  const merchant = fixtureMerchant() as any;
  merchant.knowledgeBase = {
    businessInfo: {
      policies: {
        paymentMethods: ["Cash on delivery"],
      },
    },
  };
  const conversation = fixtureConversation({
    aiV2State: input.priorAiV2State,
    olderSummary: "Customer already started an order in this conversation.",
  });
  const result = await input.ai.run({
    merchant,
    conversation,
    recentMessages: input.recentMessages || [],
    catalogItems: input.catalogItems || fixtureCatalog(),
    customerMessage: input.message,
    channel: "whatsapp",
    llmOptions: { model: input.model, maxTokens: 380 },
  });

  const understanding = result.debug.understanding;
  assertStructuredUnderstanding(understanding, failures);
  if (!result.llmUsed) failures.push("ai_v2_did_not_use_openai");
  if (result.debug.fallbackUsed) failures.push("fallback_used");
  assertReplyBasics(result.replyText, failures);
  assertNoHallucinatedBusinessFacts(result.replyText, failures, {
    allowedPhone: "+201000000000",
    allowedAddress: "Store address (available in chat only)",
    allowedPayment: "Cash on delivery",
    allowedPrices: [
      "99",
      "120",
      "180",
      "250",
      String((result.contextPatch as any)?.aiV2?.orderDraft?.quantity || ""),
    ].filter(Boolean),
  });
  if (result.debug.validationFailures.length > 0) {
    failures.push(
      ...result.debug.validationFailures
        .filter((failure) => failure !== "off_topic_general_redirect_required")
        .filter((failure) => failure !== "more_than_one_question")
        .map((failure) => `validator:${failure}`),
    );
  }
  input.assert(result.replyText, understanding, failures);

  return {
    name: input.name,
    pass: failures.length === 0,
    failures,
    reply: result.replyText,
  };
}

async function buildRuntimeContext(input: {
  message: string;
  priorAiV2State?: Record<string, unknown>;
}): Promise<RuntimeContextV2> {
  const merchant = fixtureMerchant() as any;
  merchant.knowledgeBase = {
    businessInfo: { policies: { paymentMethods: ["Cash on delivery"] } },
  };
  const conversation = fixtureConversation({
    aiV2State: input.priorAiV2State,
    olderSummary: "Earlier customer context exists.",
  });
  const loaded = ConversationStateLoaderV2.load({
    conversation,
    recentMessages: fixtureRecentMessages([
      { role: "customer", text: "عايز منتج عام A" },
      { role: "assistant", text: "تمام، سعره متاح من بيانات المتجر." },
    ]),
    customerMessage: input.message,
    channel: "whatsapp",
  });
  const baseState = SalesStateReducerV2.buildBaseState(loaded);
  const ragBuilder = new RagContextBuilderServiceV2({
    async hasStructuredKb() {
      return false;
    },
    async searchChunks() {
      return [];
    },
    async getAllRules() {
      return {};
    },
  } as any);
  const rag = await ragBuilder.build({
    merchantId: merchant.id,
    merchant,
    customerMessage: input.message,
    catalogItems: fixtureCatalog(),
  });
  return RuntimeContextBuilderV2.build({
    merchant,
    loaded,
    salesState: baseState,
    rag: rag || EMPTY_RAG_CONTEXT_V2,
  });
}

function assertStructuredUnderstanding(
  understanding: MessageUnderstandingV2,
  failures: string[],
): void {
  if (!understanding || typeof understanding !== "object") {
    failures.push("understanding_structured_output_missing");
    return;
  }
  if (!understanding.usedOpenAI)
    failures.push("understanding_did_not_use_openai");
  if (understanding.fallbackUsed) failures.push("understanding_fallback_used");
  if (
    !["store_related", "off_topic_general", "ambiguous"].includes(
      understanding.domain,
    )
  ) {
    failures.push(
      `understanding_invalid_domain:${String(understanding.domain)}`,
    );
  }
  if (
    !Array.isArray(understanding.intentTags) ||
    understanding.intentTags.length === 0
  ) {
    failures.push("understanding_missing_intent_tags");
  }
  if (typeof understanding.confidence !== "number") {
    failures.push("understanding_missing_confidence");
  }
}

function assertReplyBasics(reply: string, failures: string[]): void {
  if (!reply || typeof reply !== "string") failures.push("empty_reply");
  if ((reply.match(/[؟?]/g) || []).length > 1) {
    failures.push("more_than_one_question");
  }
  if (INTERNAL_REPLY_LEAK_RE.test(reply)) {
    failures.push("internal_reply_leakage");
  }
}

function assertArabicStoreTone(reply: string, failures: string[]): void {
  if (!/[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهوي]/u.test(reply)) {
    failures.push("arabic_tone_missing");
  }
  if (/as an ai|language model|assistant/i.test(reply)) {
    failures.push("generic_ai_tone");
  }
}

function assertNoHallucinatedBusinessFacts(
  reply: string,
  failures: string[],
  allowed: {
    allowedPhone?: string;
    allowedAddress?: string;
    allowedPayment?: string;
    allowedPrices?: string[];
  },
): void {
  const cleaned = reply
    .replace(allowed.allowedPhone || "", "")
    .replace(allowed.allowedAddress || "", "")
    .replace(allowed.allowedPayment || "", "");
  if (HALLUCINATED_FACT_RE.test(cleaned)) {
    failures.push("hallucinated_business_fact");
  }
  const numbers = cleaned.match(/\b\d{2,7}(?:\.\d+)?\b/g) || [];
  const allowedPrices = new Set(allowed.allowedPrices || []);
  for (const number of numbers) {
    if (!allowedPrices.has(number)) {
      failures.push(`hallucinated_price_or_number:${number}`);
      return;
    }
  }
}

if (require.main === module) {
  runAiV2RealLlmSmokeTests()
    .then((results) => {
      if (results.length === 0) return;
      const failed = results.filter((result) => !result.pass);
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            total: results.length,
            passed: results.length - failed.length,
            failed: failed.length,
            failures: failed.map((result) => ({
              name: result.name,
              failures: result.failures,
            })),
          },
          null,
          2,
        ),
      );
      if (failed.length > 0) process.exitCode = 1;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(String(error?.stack || error?.message || error));
      process.exitCode = 1;
    });
}
