/**
 * Sales stage injection tests (Wave 2).
 *
 * Verifies:
 * 1. SalesStageAdvancer derives stages correctly from conversation context
 * 2. Stage instruction is injected into replyIntent.answerFacts
 * 3. Stages progress forward — no regression to discovery when context is known
 * 4. No hardcoded merchant names, products, or verticals in derivation logic
 */

import { SalesStageAdvancer, SalesStageInput } from "../sales-stage-advancer";
import { DialogOrchestrator } from "../dialog-orchestrator";
import { ActionType } from "../../../shared/constants/enums";

// ---------------------------------------------------------------------------
// SalesStageAdvancer unit tests (pure function — no DB, no async)
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<SalesStageInput> = {}): SalesStageInput {
  return {
    currentIntent: "asking_question",
    customerMessage: "",
    filledSlots: {},
    lastOfferedOptions: [],
    lastQuotedItems: [],
    lastRecommendation: undefined,
    lastProposal: undefined,
    cartItemCount: 0,
    requiresConfirmation: false,
    lastActionType: undefined,
    ...overrides,
  };
}

describe("SalesStageAdvancer", () => {
  describe("stage derivation", () => {
    it("returns discovery when no context exists", () => {
      expect(SalesStageAdvancer.advance(makeInput())).toBe("discovery");
    });

    it("returns qualification when at least one slot is known", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({ filledSlots: { budget: 500 } }),
      );
      expect(stage).toBe("qualification");
    });

    it("warm lead with product_interest reaches recommendation stage", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          filledSlots: { product_interest: "هدية" },
          currentIntent: "specifying",
        }),
      );
      expect(stage).toBe("recommendation");
    });

    it("product_interest + prior proposal keeps recommendation stage", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          filledSlots: { product_interest: "خدمة تنظيف" },
          lastProposal: "عرضنا عليك الخيار الأول",
          currentIntent: "asking_question",
        }),
      );
      expect(stage).toBe("recommendation");
    });

    it("comparison question triggers comparison stage (two options offered)", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          lastOfferedOptions: ["الخيار الأول", "الخيار الثاني"],
          currentIntent: "asking_question",
        }),
      );
      expect(stage).toBe("comparison");
    });

    it("single offered option does not trigger comparison stage", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          lastOfferedOptions: ["الخيار الأول"],
          currentIntent: "asking_question",
        }),
      );
      // With no product_interest, goes to qualification or discovery
      expect(stage).not.toBe("comparison");
    });

    it("price question triggers quote stage when product is known", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          customerMessage: "بكام السعر؟",
          filledSlots: { product_interest: "قميص" },
          currentIntent: "asking_question",
        }),
      );
      expect(stage).toBe("quote");
    });

    it("price question without product context does NOT trigger quote stage", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          customerMessage: "بكام السعر؟",
          filledSlots: {},
          currentIntent: "asking_question",
        }),
      );
      expect(stage).not.toBe("quote");
    });

    it("budget objection triggers objection_handling stage", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          customerMessage: "ده غالي عليا",
          filledSlots: { product_interest: "تصميم" },
          currentIntent: "asking_question",
        }),
      );
      expect(stage).toBe("objection_handling");
    });

    it("negative_reply intent triggers objection_handling stage", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          currentIntent: "negative_reply",
          filledSlots: { product_interest: "شنطة" },
        }),
      );
      expect(stage).toBe("objection_handling");
    });

    it("cart items advance stage to order_draft", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          cartItemCount: 2,
          currentIntent: "affirmative",
        }),
      );
      expect(stage).toBe("order_draft");
    });

    it("requiresConfirmation overrides cart and advances to confirmation", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          cartItemCount: 2,
          requiresConfirmation: true,
        }),
      );
      expect(stage).toBe("confirmation");
    });

    it("completed order action returns order_created", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          lastActionType: "ORDER_CONFIRMED",
        }),
      );
      expect(stage).toBe("order_created");
    });

    it("known details prevent regression to discovery", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          filledSlots: {
            budget: 1000,
            quantity: 50,
            delivery_area: "المعادي",
          },
          currentIntent: "asking_question",
        }),
      );
      expect(stage).not.toBe("discovery");
    });

    it("quoted items trigger quote stage", () => {
      const stage = SalesStageAdvancer.advance(
        makeInput({
          lastQuotedItems: ["منتج أ × 3 — إجمالي 900 جنيه"],
          currentIntent: "asking_question",
        }),
      );
      expect(stage).toBe("quote");
    });
  });

  describe("stage instructions", () => {
    it("getStageInstructionAr returns Arabic instruction for every stage", () => {
      const stages = [
        "discovery",
        "qualification",
        "recommendation",
        "comparison",
        "objection_handling",
        "quote",
        "order_draft",
        "confirmation",
        "order_created",
        "payment_or_delivery_next_step",
        "followup",
      ] as const;

      for (const stage of stages) {
        const instruction = SalesStageAdvancer.getStageInstructionAr(stage);
        expect(typeof instruction).toBe("string");
        expect(instruction.length).toBeGreaterThan(10);
        // Instructions must be in Arabic
        expect(instruction).toMatch(/[؀-ۿ]/);
      }
    });

    it("recommendation instruction mentions presenting options and one question", () => {
      const instruction = SalesStageAdvancer.getStageInstructionAr("recommendation");
      expect(instruction).toMatch(/خيار|توصية|مناسب/);
      expect(instruction).toMatch(/سؤال/);
    });

    it("comparison instruction mentions comparing and recommending the best", () => {
      const instruction = SalesStageAdvancer.getStageInstructionAr("comparison");
      expect(instruction).toMatch(/قارن|مقارنة/);
    });

    it("quote instruction mentions showing price clearly", () => {
      const instruction = SalesStageAdvancer.getStageInstructionAr("quote");
      expect(instruction).toMatch(/سعر|إجمالي/);
    });

    it("objection_handling instruction does not ask discovery questions", () => {
      const instruction = SalesStageAdvancer.getStageInstructionAr("objection_handling");
      expect(instruction).toMatch(/اعتراض|بديل/);
      expect(instruction).not.toMatch(/استكشاف/);
    });

    it("instructions contain no hardcoded product names or merchant names", () => {
      const stages = [
        "discovery",
        "qualification",
        "recommendation",
        "comparison",
        "objection_handling",
        "quote",
        "order_draft",
        "confirmation",
        "order_created",
        "payment_or_delivery_next_step",
        "followup",
      ] as const;
      const hardcodedTerms = [
        "عطر",
        "فستان",
        "قميص",
        "بيتزا",
        "مطعم",
        "demo",
        "Demo",
        "شركة",
      ];
      for (const stage of stages) {
        const instruction = SalesStageAdvancer.getStageInstructionAr(stage);
        for (const term of hardcodedTerms) {
          expect(instruction).not.toContain(term);
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// DialogOrchestrator integration: stage injection into answerFacts
// ---------------------------------------------------------------------------

function makeMockLlmService() {
  return {
    processDialogTurn: jest.fn().mockResolvedValue({
      response: {
        reply_ar: "أهلاً، قولّي أقدر أساعدك في إيه؟",
        actionType: ActionType.ASK_CLARIFYING_QUESTION,
        extracted_entities: {
          products: null,
          customerName: null,
          phone: null,
          address: null,
          substitutionAllowed: null,
          deliveryPreference: null,
        },
        missing_slots: null,
        negotiation: {
          requestedDiscount: null,
          approved: false,
          offerText: null,
          finalPrices: null,
        },
        delivery_fee: null,
        confidence: 0.8,
        reasoning: "test",
      },
      tokensUsed: 0,
      llmUsed: false,
      action: ActionType.ASK_CLARIFYING_QUESTION,
      reply: "أهلاً",
      cartItems: [],
    }),
  };
}

function makeMockPlaybookService() {
  return {
    getForMerchant: jest.fn().mockResolvedValue({
      slotGraph: [],
      nextQuestionTemplates: {},
      escalationPolicy: {},
    }),
  };
}

function makeMockPool() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
  };
}

function makeMinimalContext(overrides: Record<string, any> = {}) {
  return {
    merchant: {
      id: "test-merchant",
      name: "متجر تجريبي",
      config: { agent_availability: { backup: "none" } },
      currency: "EGP",
    },
    conversation: {
      id: "conv-1",
      context: {
        lastActionType: null,
        dialog: {},
        ...overrides.conversationContext,
      },
      cart: { items: [], subtotal: 0, discount: 0, deliveryFee: 0, total: 0 },
      collectedInfo: {},
      requiresConfirmation: false,
      ...overrides.conversation,
    },
    catalogItems: [],
    recentMessages: [],
    customerMessage: overrides.customerMessage ?? "أهلاً",
    turnMemory: overrides.turnMemory,
  } as any;
}

describe("DialogOrchestrator — sales stage injection", () => {
  let orchestrator: DialogOrchestrator;
  let mockLlm: ReturnType<typeof makeMockLlmService>;

  beforeEach(() => {
    mockLlm = makeMockLlmService();
    orchestrator = new DialogOrchestrator(
      mockLlm as any,
      makeMockPlaybookService() as any,
      makeMockPool() as any,
    );
  });

  it("answerFacts includes [SALES_STAGE: discovery] for a blank conversation", async () => {
    const result = await orchestrator.processTurn(
      makeMinimalContext({ customerMessage: "أهلاً" }),
      undefined,
    );
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const stageEntry = facts.find((f) => f.includes("[SALES_STAGE:"));
    expect(stageEntry).toBeDefined();
    expect(stageEntry).toContain("discovery");
  });

  it("answerFacts includes [SALES_STAGE: recommendation] when product_interest is filled", async () => {
    const ctx = makeMinimalContext({
      customerMessage: "عندكم منتجات للهدايا؟",
      turnMemory: {
        universalSlots: { product_interest: "هدايا" },
        customSlots: {},
        slotConfidence: {},
        stillMissingImportant: [],
      },
      conversationContext: {
        dialog: { filledSlots: { product_interest: "هدايا" } },
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const stageEntry = facts.find((f) => f.includes("[SALES_STAGE:"));
    expect(stageEntry).toBeDefined();
    expect(stageEntry).toContain("recommendation");
  });

  it("answerFacts includes [SALES_STAGE: comparison] when two options were offered", async () => {
    const ctx = makeMinimalContext({
      customerMessage: "مش عارف أختار",
      conversationContext: {
        dialog: {
          filledSlots: {},
          lastOfferedOptions: ["الخيار الأول", "الخيار الثاني"],
        },
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const stageEntry = facts.find((f) => f.includes("[SALES_STAGE:"));
    expect(stageEntry).toBeDefined();
    expect(stageEntry).toContain("comparison");
  });

  it("answerFacts includes [SALES_STAGE: quote] when price is asked with known product", async () => {
    const ctx = makeMinimalContext({
      customerMessage: "بكام السعر؟",
      conversationContext: {
        dialog: { filledSlots: { product_interest: "خدمة" } },
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const stageEntry = facts.find((f) => f.includes("[SALES_STAGE:"));
    expect(stageEntry).toBeDefined();
    expect(stageEntry).toContain("quote");
  });

  it("answerFacts includes [SALES_STAGE: objection_handling] for price objection", async () => {
    const ctx = makeMinimalContext({
      customerMessage: "ده غالي عليا",
      conversationContext: {
        dialog: { filledSlots: { product_interest: "منتج" } },
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const stageEntry = facts.find((f) => f.includes("[SALES_STAGE:"));
    expect(stageEntry).toBeDefined();
    expect(stageEntry).toContain("objection_handling");
  });

  it("contextPatch.dialog includes salesStage", async () => {
    const result = await orchestrator.processTurn(
      makeMinimalContext({ customerMessage: "أهلاً" }),
      undefined,
    );
    expect((result.contextPatch.dialog as any)?.salesStage).toBeDefined();
    expect(typeof (result.contextPatch.dialog as any)?.salesStage).toBe("string");
  });

  it("stage is not discovery when multiple slots are filled", async () => {
    const ctx = makeMinimalContext({
      customerMessage: "تمام",
      conversationContext: {
        dialog: {
          filledSlots: {
            product_interest: "شيء ما",
            quantity: 5,
            budget: 1000,
          },
        },
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const patch = (await mockLlm.processDialogTurn.mock.calls[0][1]).answerFacts as string[];
    const stageEntry = patch.find((f: string) => f.includes("[SALES_STAGE:"));
    expect(stageEntry).not.toContain("discovery");
  });
});
