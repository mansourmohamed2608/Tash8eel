import * as fs from "fs";
import * as path from "path";
import { SalesStateReducerV2 } from "../sales-state-reducer";
import { ReplyValidatorV2 } from "../reply-validator";
import { shouldUseAiReplyEngineV2 } from "../ai-reply-engine-flag";
import { Merchant } from "../../../domain/entities/merchant.entity";
import { Conversation } from "../../../domain/entities/conversation.entity";
import { ConversationState } from "../../../shared/constants/enums";
import { MessageUnderstandingV2Service } from "../message-understanding";
import { SalesPolicyV2 } from "../sales-policy";
import { EmotionPolicyV2 } from "../emotion-policy";
import { ActionExecutorV2 } from "../action-executor";
import { ToolRegistryV2 } from "../tool-registry";
import { ReplyRendererServiceV2 } from "../reply-renderer.service";
import type { TranscriptScenarioJson } from "../transcript-evals/runner";
import { runTranscriptScenario } from "../transcript-evals/runner";
import type {
  AiSalesState,
  MessageUnderstandingV2,
  ReplyPlanV2,
  RuntimeContextV2,
  ToolActionResultV2,
} from "../ai-v2.types";
import { ConversationStateLoaderV2 } from "../conversation-state-loader";
import { ConfigService } from "@nestjs/config";

describe("AI Reply Engine v2 — core", () => {
  const scenariosPath = path.join(
    __dirname,
    "..",
    "transcript-evals",
    "scenarios.json",
  );
  const scenarios: TranscriptScenarioJson[] = JSON.parse(
    fs.readFileSync(scenariosPath, "utf-8"),
  );

  it("runs transcript scenarios (planner + deterministic fallback)", async () => {
    for (const s of scenarios) {
      const r = await runTranscriptScenario(s);
      expect(r.pass).toBe(true);
    }
  });

  it("shouldUseAiReplyEngineV2 respects env and merchant override", () => {
    const merchant = {
      id: "m1",
      config: {},
    } as unknown as Merchant;
    expect(shouldUseAiReplyEngineV2(merchant, undefined)).toBe(false);
    expect(shouldUseAiReplyEngineV2(merchant, "v1")).toBe(false);
    expect(shouldUseAiReplyEngineV2(merchant, "v2")).toBe(true);
    expect(
      shouldUseAiReplyEngineV2(
        { ...merchant, config: { aiReplyEngine: "v2" } } as unknown as Merchant,
        "v1",
      ),
    ).toBe(true);
    expect(
      shouldUseAiReplyEngineV2(
        { ...merchant, config: { aiReplyEngine: "v1" } } as unknown as Merchant,
        "v2",
      ),
    ).toBe(false);
  });

  it("rejects AI_V2_LOCAL_TEST_MODE in production", async () => {
    const service = new MessageUnderstandingV2Service(
      new ConfigService({
        AI_V2_LOCAL_TEST_MODE: "true",
        NODE_ENV: "production",
      } as any),
    );
    await expect(service.analyze("hello")).rejects.toThrow(
      "AI_V2_LOCAL_TEST_MODE cannot be enabled in production",
    );
  });

  it("SalesStateReducerV2 bumps dialogTurnSeq", async () => {
    const loaded = ConversationStateLoaderV2.load({
      conversation: {
        id: "c1",
        merchantId: "m1",
        senderId: "s1",
        state: ConversationState.GREETING,
        context: { aiV2: { dialogTurnSeq: 3, engineVersion: 2 } },
        cart: {
          items: [],
          total: 0,
          subtotal: 0,
          discount: 0,
          deliveryFee: 0,
        },
        collectedInfo: {},
        missingSlots: [],
        followupCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Conversation,
      recentMessages: [],
      customerMessage: "hello",
    });
    const u = await new MessageUnderstandingV2Service(
      new ConfigService({ AI_V2_LOCAL_TEST_MODE: "true" } as any),
    ).analyze("hello");
    const { stage, nextBestAction } = SalesPolicyV2.decide({
      loaded,
      understanding: u,
    });
    const emotion = EmotionPolicyV2.decide({
      understanding: u,
      stage,
    });
    const state = SalesStateReducerV2.reduce({
      loaded,
      understanding: u,
      nextBestAction,
      stage,
      customerEmotion: emotion.customerEmotion,
    });
    expect(state.dialogTurnSeq).toBe(4);
    expect(state.engineVersion).toBe(2);
  });

  it("ReplyValidatorV2 enforces one question and payment gating", () => {
    const runtimeContext = baseRuntimeContext("support");
    const plan = basePlan();
    const bad = {
      customer_reply: "سؤال؟ وسؤال تاني؟",
      state_patch: {},
      used_fact_ids: [],
      risk_flags: [],
      confidence: 0.5,
    };
    const v = ReplyValidatorV2.validate({
      render: bad,
      runtimeContext,
      understanding: baseUnderstanding(["support_question"]),
      plan,
      toolResults: [],
    });
    expect(v.failures.some((f) => f.includes("question"))).toBe(true);
    expect((v.replyText.match(/[؟?]/g) || []).length).toBeLessThanOrEqual(1);
  });

  it("ReplyValidatorV2 blocks phone hallucinations when not in facts", () => {
    const runtimeContext = baseRuntimeContext("support");
    const plan = basePlan();
    const bad = {
      customer_reply: "تقدر تتواصل على 010-12345678",
      state_patch: {},
      used_fact_ids: [],
      risk_flags: [],
      confidence: 0.5,
    };
    const v = ReplyValidatorV2.validate({
      render: bad,
      runtimeContext,
      understanding: baseUnderstanding(["contact_question"]),
      plan,
      toolResults: [],
    });
    expect(v.failures.some((f) => f.includes("phone"))).toBe(true);
    expect(v.replyText).not.toContain("010-12345678");
  });

  it("ToolRegistryV2 marks unsupported backend actions unavailable", async () => {
    const registry = new ToolRegistryV2();
    const result = await registry.execute({
      actionName: "createDraftOrder",
      runtimeContext: baseRuntimeContext("order_draft"),
    });
    expect(result).toEqual(
      expect.objectContaining({
        actionName: "createDraftOrder",
        available: false,
        attempted: false,
        success: false,
        resultFactIds: [],
        errorCode: "CREATE_DRAFT_ORDER_TOOL_NOT_WIRED",
      }),
    );
    expect(result.safeMessage).toContain("cannot create");
  });

  it("ActionExecutorV2 returns safe failed tool results", async () => {
    const registry = {
      execute: jest.fn().mockRejectedValue(new Error("boom")),
    } as unknown as ToolRegistryV2;
    const executor = new ActionExecutorV2(registry);
    const results = await executor.execute({
      runtimeContext: baseRuntimeContext("order_draft"),
      plan: {
        ...basePlan(),
        toolActions: [
          {
            actionName: "createDraftOrder",
            reason: "test",
            status: "needed",
          },
        ],
      },
    });
    expect(results[0]).toEqual(
      expect.objectContaining({
        actionName: "createDraftOrder",
        available: true,
        attempted: true,
        success: false,
        resultFactIds: [],
        errorCode: "TOOL_EXECUTION_FAILED",
      }),
    );
    expect(results[0].safeMessage).toContain("could not complete");
  });

  it("fact-backed tool result IDs are available to the renderer input", async () => {
    const renderer = new ReplyRendererServiceV2(
      new ConfigService({ AI_V2_LOCAL_TEST_MODE: "true" } as any),
    );
    const runtimeContext = {
      ...baseRuntimeContext("recommendation"),
      ragFacts: {
        ...baseRuntimeContext("recommendation").ragFacts,
        catalogFacts: [
          {
            id: "cat:c1",
            type: "catalog",
            catalogItemId: "c1",
            name: "منتج عام A",
            price: 120,
            availability: "available",
            description: null,
            category: null,
            confidence: 0.9,
          },
        ],
      },
    } as RuntimeContextV2;
    const plan = {
      ...basePlan(),
      allowedFactIds: ["cat:c1"],
      toolActions: [
        { actionName: "searchCatalog", reason: "test", status: "done" },
      ],
    } as ReplyPlanV2;
    const toolResults: ToolActionResultV2[] = [
      successfulTool("searchCatalog", ["cat:c1"]),
    ];
    const rendered = await renderer.render({
      runtimeContext,
      understanding: baseUnderstanding(["product_question"]),
      plan,
      validatorRules: plan.mustNotInvent,
      toolResults,
    });
    expect(rendered?.output.used_fact_ids).toContain("cat:c1");
  });

  it("ReplyValidatorV2 blocks unsupported action completion claims", () => {
    const cases: Array<{
      reply: string;
      expectedFailure: string;
      tools?: ToolActionResultV2[];
      tags?: any[];
    }> = [
      {
        reply: "تم إنشاء الطلب.",
        expectedFailure: "order_created_claim_without_createDraftOrder_success",
      },
      {
        reply: "تم تحديث الطلب.",
        expectedFailure: "order_updated_claim_without_updateDraftOrder_success",
      },
      {
        reply: "تم تأكيد الدفع.",
        expectedFailure:
          "payment_proof_verification_claim_without_tool_success",
      },
      {
        reply: "طلبك في الطريق.",
        expectedFailure: "unsupported_order_status_claim",
        tags: ["order_status_question"],
      },
      {
        reply: "تم استرجاع المبلغ.",
        expectedFailure: "refund_return_completion_without_tool_success",
      },
      {
        reply: "تم تسجيل الشكوى.",
        expectedFailure: "complaint_recorded_claim_without_tool_success",
        tags: ["complaint"],
      },
    ];

    for (const item of cases) {
      const v = ReplyValidatorV2.validate({
        render: {
          customer_reply: item.reply,
          state_patch: {},
          used_fact_ids: [],
          risk_flags: [],
          confidence: 0.5,
        },
        runtimeContext: baseRuntimeContext("support"),
        understanding: baseUnderstanding(item.tags || ["support_question"]),
        plan: basePlan(),
        toolResults: item.tools || [],
      });
      expect(v.failures).toContain(item.expectedFailure);
      expect(v.replyText).not.toBe(item.reply);
    }
  });

  it("ReplyValidatorV2 allows order-created claims only after successful createDraftOrder", () => {
    const v = ReplyValidatorV2.validate({
      render: {
        customer_reply: "تم إنشاء الطلب.",
        state_patch: {},
        used_fact_ids: [],
        risk_flags: [],
        confidence: 0.9,
      },
      runtimeContext: baseRuntimeContext("order_draft"),
      understanding: baseUnderstanding(["buying_intent"]),
      plan: basePlan(),
      toolResults: [successfulTool("createDraftOrder", ["order:o1"])],
    });
    expect(v.failures).not.toContain(
      "order_created_claim_without_createDraftOrder_success",
    );
    expect(v.failures).not.toContain("completion_claim_without_tool_success");
  });

  it("ReplyValidatorV2 blocks unavailable payment verification and invented status", () => {
    const v = ReplyValidatorV2.validate({
      render: {
        customer_reply: "الدفع اتأكد وطلبك في الطريق.",
        state_patch: {},
        used_fact_ids: [],
        risk_flags: [],
        confidence: 0.7,
      },
      runtimeContext: baseRuntimeContext("support"),
      understanding: baseUnderstanding([
        "payment_question",
        "order_status_question",
      ]),
      plan: basePlan(),
      toolResults: [
        {
          actionName: "verifyPaymentProof",
          available: false,
          attempted: false,
          success: false,
          resultFactIds: [],
          safeMessage: "AI v2 cannot verify payment proof yet.",
          errorCode: "PAYMENT_PROOF_TOOL_NOT_WIRED",
        },
      ],
    });
    expect(v.failures).toContain(
      "payment_proof_verification_claim_without_tool_success",
    );
    expect(v.failures).toContain("unsupported_order_status_claim");
  });

  it("ReplyValidatorV2 blocks disallowed fact IDs and rewrites", () => {
    const v = ReplyValidatorV2.validate({
      render: {
        customer_reply: "منتج غير مسموح سعره 999.",
        state_patch: {},
        used_fact_ids: ["cat:not_allowed"],
        risk_flags: [],
        confidence: 0.7,
      },
      runtimeContext: baseRuntimeContext("support"),
      understanding: baseUnderstanding(["product_question", "price_question"]),
      plan: basePlan(),
      toolResults: [],
    });
    expect(v.failures).toContain("used_fact_not_allowed:cat:not_allowed");
    expect(v.replyText).not.toContain("999");
  });

  it("SalesStateReducerV2 preserves order, complaint, question, and selection state across turns", () => {
    const prior = {
      dialogTurnSeq: 7,
      salesStage: "order_draft",
      stage: "order_draft",
      selectedItems: [
        {
          label: "منتج عام A",
          catalogItemId: "c1",
          confidence: 0.8,
          source: "customer",
        },
      ],
      activeQuestion: {
        kind: "quantity",
        text: "quantity",
        askedAt: new Date().toISOString(),
      },
      orderDraft: {
        items: [
          { label: "منتج عام A", catalogItemId: "c1", source: "customer" },
        ],
        status: "collecting",
        missingFields: ["quantity"],
      },
      complaintState: {
        status: "collecting_details",
        kind: "other",
        requestedByCustomer: true,
        requiredFields: ["order_number", "details"],
        providedFields: ["details"],
      },
    };

    const supportState = reduceWithPrior(
      prior,
      ["support_question"],
      "support",
    );
    expect(supportState.orderDraft).toBeDefined();
    expect(supportState.complaintState).toBeDefined();
    expect(supportState.activeQuestion).toBeDefined();
    expect(supportState.selectedItems).toHaveLength(1);

    const complaintState = reduceWithPrior(prior, ["complaint"], "complaint");
    expect(complaintState.salesStage).toBe("complaint");
    expect(complaintState.orderDraft).toBeDefined();
    expect(complaintState.complaintState).toBeDefined();

    const greetingState = reduceWithPrior(prior, ["greeting"], "selection");
    expect(greetingState.orderDraft).toBeDefined();
    expect(greetingState.selectedItems).toHaveLength(1);
  });
});

function baseState(stage: AiSalesState["stage"]): AiSalesState {
  return {
    version: 2,
    engineVersion: 2,
    dialogTurnSeq: 1,
    salesStage: stage,
    stage,
    language: "ar",
    customerEmotion: "neutral",
    knownFacts: {},
    selectedItems: [],
    answeredQuestions: [],
    missingFields: [],
    nextBestAction: { type: "answer_question", reason: "test" },
  };
}

function basePlan(): ReplyPlanV2 {
  return {
    nextBestAction: "support_answer",
    answerFirst: true,
    allowedToAskDelivery: false,
    allowedToAskPayment: false,
    maxQuestions: 1,
    mustNotInvent: ["phone", "address", "payment_method", "price"],
    allowedFactIds: [],
    selectedItemsSummary: null,
    orderDraftSummary: null,
    complaintSummary: null,
    activeQuestionSummary: null,
    forbiddenRepeats: [],
    doNotGreetAgain: true,
    offTopicRedirectRequired: false,
    toolActions: [],
    rendererInstructions: [],
  };
}

function baseRuntimeContext(stage: AiSalesState["stage"]): RuntimeContextV2 {
  const state = baseState(stage);
  return {
    currentCustomerMessage: "test",
    last20Messages: [],
    olderSummary: null,
    aiV2State: state,
    merchantFacts: [],
    ragFacts: {
      catalogFacts: [],
      kbFacts: [],
      offerFacts: [],
      businessRuleFacts: [],
    },
    activeQuestion: null,
    selectedItems: [],
    orderDraft: null,
    complaintState: null,
    answeredQuestions: [],
    knownFacts: {},
    lastRecommendationSummary: null,
    lastRecommendationHash: null,
    taskRules: {
      answerAsHumanStoreOwner: true,
      answerCustomerQuestionFirst: true,
      doNotInventFacts: true,
      doNotAnswerOffTopicGeneralKnowledge: true,
      askOneUsefulQuestionMax: true,
      doNotGreetEveryTurn: true,
      doNotResetConversation: true,
      useMerchantFactsOnlyForPhoneAddressPaymentOffersPricesPolicies: true,
      requireToolSuccessBeforeCompletionClaims: true,
    },
  };
}

function baseUnderstanding(intentTags: any[]) {
  return {
    domain: "store_related",
    language: "ar",
    intentTags,
    customerGoal: null,
    customerEmotion: "neutral",
    mentionedItems: [],
    mentionedPreferences: {},
    answerToActiveQuestion: null,
    buyingSignal: false,
    needsStoreAnswer: true,
    shouldGreet: false,
    reason: "test",
    confidence: 0.8,
    usedOpenAI: false,
    fallbackUsed: false,
  } as any;
}

function successfulTool(
  actionName: ToolActionResultV2["actionName"],
  resultFactIds: string[] = [],
): ToolActionResultV2 {
  return {
    actionName,
    available: true,
    attempted: true,
    success: true,
    resultFactIds,
    safeMessage: "ok",
    errorCode: null,
  };
}

function reduceWithPrior(
  priorAiV2: Record<string, unknown>,
  intentTags: any[],
  stage: AiSalesState["stage"],
): AiSalesState {
  const loaded = ConversationStateLoaderV2.load({
    conversation: {
      id: "c1",
      merchantId: "m1",
      senderId: "s1",
      state: ConversationState.GREETING,
      context: { aiV2: priorAiV2 },
      cart: {
        items: [],
        total: 0,
        subtotal: 0,
        discount: 0,
        deliveryFee: 0,
      },
      collectedInfo: {},
      missingSlots: [],
      followupCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Conversation,
    recentMessages: [],
    customerMessage: "test",
  });
  return SalesStateReducerV2.reduce({
    loaded,
    understanding: baseUnderstanding(intentTags) as MessageUnderstandingV2,
    nextBestAction: { type: "answer_question", reason: "test" },
    stage,
    customerEmotion: "neutral",
  });
}
