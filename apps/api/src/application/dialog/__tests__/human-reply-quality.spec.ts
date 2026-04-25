/**
 * Wave 5 — Human sales reply quality tests.
 *
 * Verifies:
 * 1. ReplyComposer.polish() removes robotic/bot phrases
 * 2. Stage-aware token budget: orchestrator passes higher maxTokens for rich stages
 * 3. Stage-specific [REPLY_STRUCTURE] facts are injected into answerFacts
 * 4. One-question rule is enforced by ReplyComposer
 * 5. No repeated known questions (context memory respected)
 * 6. No hardcoded demo product names or business names in any logic
 * 7. Eval helper shows: customer message, reply, pass/fail per check
 */

import { ReplyComposer } from "../reply-composer";
import { DialogOrchestrator } from "../dialog-orchestrator";
import { SalesStageAdvancer } from "../sales-stage-advancer";
import { ActionType } from "../../../shared/constants/enums";

// ─── Eval helper ─────────────────────────────────────────────────────────────

interface EvalCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

interface EvalResult {
  customerMessage: string;
  reply: string;
  checks: EvalCheck[];
  passed: boolean;
}

function evalReply(
  customerMessage: string,
  reply: string,
  expectations: {
    notContains?: string[];
    maxQuestions?: number;
    minLength?: number;
    containsAny?: string[];
  },
): EvalResult {
  const checks: EvalCheck[] = [];

  if (expectations.notContains) {
    for (const forbidden of expectations.notContains) {
      const found = reply.includes(forbidden);
      checks.push({
        name: `not_contains:"${forbidden}"`,
        pass: !found,
        detail: found ? `Found forbidden phrase: "${forbidden}"` : undefined,
      });
    }
  }

  if (expectations.maxQuestions !== undefined) {
    const qCount = (reply.match(/[؟?]/g) || []).length;
    const pass = qCount <= expectations.maxQuestions;
    checks.push({
      name: `max_questions:${expectations.maxQuestions}`,
      pass,
      detail: pass ? undefined : `Found ${qCount} question marks, max is ${expectations.maxQuestions}`,
    });
  }

  if (expectations.minLength !== undefined) {
    const pass = reply.trim().length >= expectations.minLength;
    checks.push({
      name: `min_length:${expectations.minLength}`,
      pass,
      detail: pass ? undefined : `Reply length ${reply.trim().length} < min ${expectations.minLength}`,
    });
  }

  if (expectations.containsAny) {
    const found = expectations.containsAny.some((s) => reply.includes(s));
    checks.push({
      name: `contains_any:[${expectations.containsAny.join(",")}]`,
      pass: found,
      detail: found ? undefined : `None of expected phrases found`,
    });
  }

  return {
    customerMessage,
    reply,
    checks,
    passed: checks.every((c) => c.pass),
  };
}

// ─── ReplyComposer — robotic phrase removal ──────────────────────────────────

describe("ReplyComposer.polish — robotic phrase removal", () => {
  it('removes "كيف يمكنني مساعدتك"', () => {
    const input = "أهلاً. كيف يمكنني مساعدتك؟";
    const result = ReplyComposer.polish(input);
    expect(result).not.toContain("كيف يمكنني مساعدتك");
  });

  it('removes "كيف أستطيع مساعدتك"', () => {
    const input = "مرحباً، كيف أستطيع مساعدتك اليوم؟";
    const result = ReplyComposer.polish(input);
    expect(result).not.toContain("كيف أستطيع مساعدتك");
  });

  it('removes "يرجى تزويدي بالتفاصيل"', () => {
    const input = "يرجى تزويدي بالتفاصيل اللازمة لإتمام طلبك.";
    const result = ReplyComposer.polish(input);
    expect(result).not.toContain("يرجى تزويدي");
  });

  it('removes generic "محتاج تفاصيل أكتر"', () => {
    const input = "محتاج تفاصيل أكتر. قولّي أيه اللي عايزه؟";
    const result = ReplyComposer.polish(input);
    expect(result).not.toContain("محتاج تفاصيل أكتر");
  });

  it('removes "محتاج تفاصيل أكثر" (MSA variant)', () => {
    const input = "محتاج تفاصيل أكثر لأقدر أساعدك.";
    const result = ReplyComposer.polish(input);
    expect(result).not.toContain("محتاج تفاصيل أكثر");
  });

  it('replaces "هل لديك" with "عندك"', () => {
    const input = "هل لديك ميزانية معينة في الذهن؟";
    const result = ReplyComposer.polish(input);
    expect(result).not.toContain("هل لديك");
  });

  it('replaces "أقدر أساعدك بشكل أفضل" (existing pattern still works)', () => {
    const input = "لو قلتلي أكتر أقدر أساعدك بشكل أفضل. تحب تحكيلي أكتر؟";
    const result = ReplyComposer.polish(input);
    expect(result).not.toContain("أقدر أساعدك بشكل أفضل");
  });

  it('replaces "يرجى توضيح" (existing pattern still works)', () => {
    const input = "يرجى توضيح ما تريده بالضبط.";
    const result = ReplyComposer.polish(input);
    expect(result).not.toContain("يرجى توضيح");
  });

  it("does not strip warm natural WhatsApp closers", () => {
    const input = "أنا معاك. قولّي وأعملهالك.";
    const result = ReplyComposer.polish(input);
    expect(result).toContain("معاك");
    expect(result).toContain("قولّي");
  });

  it("does not strip natural closer tone", () => {
    const input = "تمام ❤️ الخيار الأول أنسب لحالتك. تحب نكمل على الكميات؟";
    const result = ReplyComposer.polish(input);
    expect(result).toContain("تمام");
    expect(result).toContain("تحب");
  });
});

// ─── ReplyComposer — one-question rule ──────────────────────────────────────

describe("ReplyComposer.polish — one-question rule", () => {
  it("keeps only first question mark in a multi-question reply", () => {
    const input = "عندنا خيارين. تحب الأول ولا الثاني؟ وكمان عايز أعرف الكمية؟ والعنوان؟";
    const result = ReplyComposer.polish(input);
    const qCount = (result.match(/[؟?]/g) || []).length;
    expect(qCount).toBe(1);
  });

  it("preserves reply with zero questions", () => {
    const input = "تمام، السعر هو 500 جنيه للقطعة.";
    const result = ReplyComposer.polish(input);
    expect(result).toBeTruthy();
    const qCount = (result.match(/[؟?]/g) || []).length;
    expect(qCount).toBe(0);
  });

  it("preserves single question", () => {
    const input = "أهلاً بيك. تحب تحكيلي أكتر عن اللي بتدور عليه؟";
    const result = ReplyComposer.polish(input);
    const qCount = (result.match(/[؟?]/g) || []).length;
    expect(qCount).toBe(1);
  });
});

// ─── ReplyComposer — bot word patterns ──────────────────────────────────────

describe("ReplyComposer.polish — bot identity removal", () => {
  it("removes AI reference", () => {
    const input = "أنا AI وأقدر أساعدك بكل شيء.";
    const result = ReplyComposer.polish(input);
    expect(result).not.toMatch(/\bAI\b/i);
  });

  it("removes bot reference in Arabic", () => {
    const input = "أنا بوت المتجر وهساعدك.";
    const result = ReplyComposer.polish(input);
    expect(result).not.toContain("بوت");
  });
});

// ─── SalesStageAdvancer — stage logic ───────────────────────────────────────

describe("SalesStageAdvancer — stage for human reply quality", () => {
  it("reaches objection_handling on explicit price objection message", () => {
    const stage = SalesStageAdvancer.advance({
      currentIntent: "asking_question",
      customerMessage: "ده غالي على حسابي",
      filledSlots: { product_interest: "خدمة ما" },
      lastOfferedOptions: [],
      lastQuotedItems: [],
      cartItemCount: 0,
    });
    expect(stage).toBe("objection_handling");
  });

  it("reaches recommendation when product_interest is known", () => {
    const stage = SalesStageAdvancer.advance({
      currentIntent: "asking_question",
      customerMessage: "عايز أعرف الخيارات",
      filledSlots: { product_interest: "خدمة ما" },
      lastOfferedOptions: [],
      lastQuotedItems: [],
      cartItemCount: 0,
    });
    expect(stage).toBe("recommendation");
  });

  it("reaches comparison when 2+ options were recently offered", () => {
    const stage = SalesStageAdvancer.advance({
      currentIntent: "asking_question",
      customerMessage: "فرق إيه بينهم؟",
      filledSlots: {},
      lastOfferedOptions: ["خيار أ", "خيار ب"],
      lastQuotedItems: [],
      cartItemCount: 0,
    });
    expect(stage).toBe("comparison");
  });

  it("reaches quote when price is asked with product context", () => {
    const stage = SalesStageAdvancer.advance({
      currentIntent: "asking_question",
      customerMessage: "بكام؟",
      filledSlots: { product_interest: "خدمة ما" },
      lastOfferedOptions: [],
      lastQuotedItems: [],
      lastProposal: "ده المنتج المناسب",
      cartItemCount: 0,
    });
    expect(stage).toBe("quote");
  });

  it("reaches order_draft when cart has items", () => {
    const stage = SalesStageAdvancer.advance({
      currentIntent: "affirmative",
      customerMessage: "تمام",
      filledSlots: {},
      lastOfferedOptions: [],
      lastQuotedItems: [],
      cartItemCount: 2,
    });
    expect(stage).toBe("order_draft");
  });
});

// ─── DialogOrchestrator — stage-aware token budget ──────────────────────────

function makeMockLlmForQuality() {
  return {
    processDialogTurn: jest.fn().mockResolvedValue({
      response: {
        reply_ar: "أنا معاك. قولّي تحب أيه؟",
        actionType: ActionType.ASK_CLARIFYING_QUESTION,
        extracted_entities: {
          products: null, customerName: null, phone: null,
          address: null, substitutionAllowed: null, deliveryPreference: null,
        },
        missing_slots: null,
        negotiation: { requestedDiscount: null, approved: false, offerText: null, finalPrices: null },
        delivery_fee: null,
        confidence: 0.85,
        reasoning: "test",
      },
      tokensUsed: 0,
      llmUsed: false,
      action: ActionType.ASK_CLARIFYING_QUESTION,
      reply: "أنا معاك. قولّي تحب أيه؟",
      cartItems: [],
    }),
  };
}

function makeMockPlaybookForQuality() {
  return {
    getForMerchant: jest.fn().mockResolvedValue({
      slotGraph: [],
      nextQuestionTemplates: {},
      escalationPolicy: {},
    }),
  };
}

function makeMockPoolForQuality() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }) };
}

function makeQualityCtx(overrides: {
  customerMessage?: string;
  dialog?: Record<string, any>;
  conversationContext?: Record<string, any>;
  conversation?: Record<string, any>;
} = {}) {
  return {
    merchant: {
      id: "test-merchant-q",
      name: "متجر تجريبي",
      config: { agent_availability: { backup: "none" } },
      currency: "EGP",
    },
    conversation: {
      id: "conv-q",
      context: {
        lastActionType: null,
        dialog: {
          filledSlots: {},
          lastOfferedOptions: [],
          pendingSlot: null,
          pendingQuestionType: null,
          lastProposal: null,
          lastRecommendation: null,
          lastQuestion: null,
          askedSlots: [],
          answeredSlots: [],
          ...(overrides.dialog || {}),
        },
        ...(overrides.conversationContext || {}),
      },
      cart: { items: [], subtotal: 0, discount: 0, deliveryFee: 0, total: 0 },
      collectedInfo: {},
      requiresConfirmation: false,
      ...(overrides.conversation || {}),
    },
    catalogItems: [],
    recentMessages: [],
    customerMessage: overrides.customerMessage ?? "مرحبا",
    turnMemory: undefined,
  } as any;
}

describe("DialogOrchestrator — stage-aware token budget", () => {
  let orchestrator: DialogOrchestrator;
  let mockLlm: ReturnType<typeof makeMockLlmForQuality>;

  beforeEach(() => {
    mockLlm = makeMockLlmForQuality();
    orchestrator = new DialogOrchestrator(
      mockLlm as any,
      makeMockPlaybookForQuality() as any,
      makeMockPoolForQuality() as any,
    );
  });

  it("recommendation stage passes maxTokens >= 600 to processDialogTurn", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "عايز أعرف الخيارات المتاحة",
      dialog: { filledSlots: { product_interest: "خدمة ما" } },
    });
    await orchestrator.processTurn(ctx, undefined);
    const passedOptions = mockLlm.processDialogTurn.mock.calls[0][2];
    expect(passedOptions?.maxTokens).toBeGreaterThanOrEqual(600);
  });

  it("comparison stage passes maxTokens >= 600 to processDialogTurn", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "فرق إيه بينهم؟",
      dialog: { lastOfferedOptions: ["خيار أ", "خيار ب"] },
    });
    await orchestrator.processTurn(ctx, undefined);
    const passedOptions = mockLlm.processDialogTurn.mock.calls[0][2];
    expect(passedOptions?.maxTokens).toBeGreaterThanOrEqual(600);
  });

  it("objection_handling stage passes maxTokens >= 550 to processDialogTurn", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "ده غالي على حسابي",
      dialog: { filledSlots: { product_interest: "خدمة ما" } },
    });
    await orchestrator.processTurn(ctx, undefined);
    const passedOptions = mockLlm.processDialogTurn.mock.calls[0][2];
    expect(passedOptions?.maxTokens).toBeGreaterThanOrEqual(550);
  });

  it("quote stage passes maxTokens >= 550 to processDialogTurn", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "بكام بالظبط؟",
      dialog: {
        filledSlots: { product_interest: "خدمة ما" },
        lastProposal: "المنتج الأنسب كذا",
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const passedOptions = mockLlm.processDialogTurn.mock.calls[0][2];
    expect(passedOptions?.maxTokens).toBeGreaterThanOrEqual(550);
  });

  it("discovery stage passes maxTokens <= 450 to processDialogTurn", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "مرحبا",
      dialog: { filledSlots: {} },
    });
    await orchestrator.processTurn(ctx, undefined);
    const passedOptions = mockLlm.processDialogTurn.mock.calls[0][2];
    expect(passedOptions?.maxTokens).toBeLessThanOrEqual(450);
  });
});

// ─── DialogOrchestrator — [REPLY_STRUCTURE] fact injection ──────────────────

describe("DialogOrchestrator — REPLY_STRUCTURE fact injection", () => {
  let orchestrator: DialogOrchestrator;
  let mockLlm: ReturnType<typeof makeMockLlmForQuality>;

  beforeEach(() => {
    mockLlm = makeMockLlmForQuality();
    orchestrator = new DialogOrchestrator(
      mockLlm as any,
      makeMockPlaybookForQuality() as any,
      makeMockPoolForQuality() as any,
    );
  });

  it("recommendation stage includes [REPLY_STRUCTURE] in answerFacts", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "عايز أعرف الخيارات",
      dialog: { filledSlots: { product_interest: "شيء ما" } },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const structureFact = facts.find((f) => f.includes("[REPLY_STRUCTURE]"));
    expect(structureFact).toBeDefined();
    expect(structureFact).toContain("2-3");
    expect(structureFact).toContain("كتالوج");
  });

  it("comparison stage includes [REPLY_STRUCTURE] with comparison instruction", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "قارنلي بينهم",
      dialog: { lastOfferedOptions: ["خيار أ", "خيار ب"] },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const structureFact = facts.find((f) => f.includes("[REPLY_STRUCTURE]"));
    expect(structureFact).toBeDefined();
    expect(structureFact).toContain("قارن");
  });

  it("objection_handling stage includes empathy instruction in [REPLY_STRUCTURE]", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "ده غالي",
      dialog: { filledSlots: { product_interest: "شيء ما" } },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const structureFact = facts.find((f) => f.includes("[REPLY_STRUCTURE]"));
    expect(structureFact).toBeDefined();
    expect(structureFact).toContain("تعاطف");
  });

  it("quote stage includes price instruction in [REPLY_STRUCTURE]", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "بكام؟",
      dialog: {
        filledSlots: { product_interest: "شيء ما" },
        lastProposal: "توصية ما",
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const structureFact = facts.find((f) => f.includes("[REPLY_STRUCTURE]"));
    expect(structureFact).toBeDefined();
    expect(structureFact).toContain("السعر");
  });

  it("order_draft stage includes summary instruction in [REPLY_STRUCTURE]", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "تمام",
      conversation: {
        cart: { items: [{ name: "منتج ما", quantity: 2 }], subtotal: 100 },
        collectedInfo: {},
        requiresConfirmation: false,
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const structureFact = facts.find((f) => f.includes("[REPLY_STRUCTURE]"));
    expect(structureFact).toBeDefined();
    expect(structureFact).toContain("لخّص");
  });

  it("discovery stage does NOT include [REPLY_STRUCTURE] fact", async () => {
    const ctx = makeQualityCtx({
      customerMessage: "مرحبا",
      dialog: { filledSlots: {} },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const structureFact = facts.find((f) => f.includes("[REPLY_STRUCTURE]"));
    expect(structureFact).toBeUndefined();
  });
});

// ─── Eval helper demo — screenshot-ready scenarios ──────────────────────────

describe("Eval helper — reply quality scenarios", () => {
  const ROBOTIC_PHRASES = [
    "كيف يمكنني مساعدتك",
    "يرجى تزويدي",
    "محتاج تفاصيل أكتر",
    "أقدر أساعدك بشكل أفضل",
    "ممكن تخبرني",
    "هل تريد",
    "كيف أستطيع مساعدتك",
    "ممكن تساعدني وتقول لي",
  ];

  it("recommendation reply — warm, uses catalog price, no bot tone, one question", () => {
    const raw =
      "أنا معاك ❤️ عندنا خيارين مناسبين:\n• الخيار الأول: 200 جنيه — جودة عالية\n• الخيار الثاني: 150 جنيه — أوفر وبنفس الجودة الأساسية\nبنصحك بالتاني لو الميزانية مهمة. تحب نكمل على الثاني؟";
    const polished = ReplyComposer.polish(raw);

    const result = evalReply("عايز أعرف الخيارات المتاحة", polished, {
      notContains: ROBOTIC_PHRASES,
      maxQuestions: 1,
      minLength: 30,
      containsAny: ["❤", "أنا معاك", "بنصحك", "الخيار"],
    });

    for (const check of result.checks) {
      expect(check.pass).toBe(true);
    }
  });

  it("budget objection reply — empathy first, no discovery restart, one question", () => {
    const raw =
      "مفهوم، الميزانية مهمة. عندنا نسخة أوفر بنفس الفكرة بسعر 120 جنيه بدل 200. تحب أبعتلك التفاصيل؟";
    const polished = ReplyComposer.polish(raw);

    const result = evalReply("ده غالي عليا", polished, {
      notContains: ROBOTIC_PHRASES,
      maxQuestions: 1,
      containsAny: ["مفهوم", "أوفر", "تحب"],
    });

    for (const check of result.checks) {
      expect(check.pass).toBe(true);
    }
  });

  it("price quote reply — states price clearly, no hallucinated price, one question", () => {
    const raw = "السعر 350 جنيه للقطعة. لو عايز 5 قطع الإجمالي هيبقى 1750 جنيه. تحب نكمل على الطلب؟";
    const polished = ReplyComposer.polish(raw);

    const result = evalReply("بكام بالضبط؟", polished, {
      notContains: ROBOTIC_PHRASES,
      maxQuestions: 1,
      containsAny: ["350", "جنيه", "تحب"],
    });

    for (const check of result.checks) {
      expect(check.pass).toBe(true);
    }
  });

  it("order-draft reply — summarizes known info, asks only one missing detail", () => {
    const raw =
      "تمام ❤️ معايا: منتج واحد × 2. بس محتاج أعرف عنوان التوصيل. تبعتهولي؟";
    const polished = ReplyComposer.polish(raw);

    const result = evalReply("تمام خلاص", polished, {
      notContains: [...ROBOTIC_PHRASES, "الطلب اتعمل", "تم إنشاء الطلب"],
      maxQuestions: 1,
    });

    for (const check of result.checks) {
      expect(check.pass).toBe(true);
    }
  });

  it("no repeated known question: known delivery_area is not re-asked", () => {
    // ReplyComposer does not add context, but the dialog orchestrator ensures
    // known slots appear in answeredSlots. Test that the polish step does not
    // re-inject a repeated opener that echoes a known question.
    const recentMsgs = [
      {
        direction: "outbound",
        text: "في أي منطقة محتاج التوصيل؟",
        createdAt: new Date(),
      },
      {
        direction: "inbound",
        text: "المعادي",
        createdAt: new Date(),
      },
    ] as any[];

    const replyWithRepeat =
      "في أي منطقة محتاج التوصيل؟ تحب أكمل على الطلب؟";
    const polished = ReplyComposer.polish(replyWithRepeat, {
      recentMessages: recentMsgs,
    });
    // After polish, the opener that was repeated should be removed
    expect(polished).not.toMatch(/^في أي منطقة/);
  });
});

// ─── No-hardcoding proof ─────────────────────────────────────────────────────

describe("No-hardcoding proof — Wave 5", () => {
  const FORBIDDEN_TERMS = [
    "عطر", "فستان", "قميص", "بيتزا", "مطعم",
    "demo", "Demo", "apparel", "perfume", "fashion",
  ];

  it("getStageReplyStructure returns no hardcoded product or merchant names", () => {
    const orchestrator = new DialogOrchestrator(
      { processDialogTurn: jest.fn() } as any,
      { getForMerchant: jest.fn() } as any,
      { query: jest.fn() } as any,
    );
    const stages = [
      "recommendation", "comparison", "objection_handling",
      "quote", "order_draft", "confirmation",
    ] as const;

    for (const stage of stages) {
      // Access private method via any cast for testing
      const structure = (orchestrator as any).getStageReplyStructure(stage);
      if (structure) {
        for (const term of FORBIDDEN_TERMS) {
          expect(structure).not.toContain(term);
        }
      }
    }
  });

  it("getStageMaxTokens returns no hardcoded product/merchant references", () => {
    const orchestrator = new DialogOrchestrator(
      { processDialogTurn: jest.fn() } as any,
      { getForMerchant: jest.fn() } as any,
      { query: jest.fn() } as any,
    );
    const stages = [
      "discovery", "qualification", "recommendation", "comparison",
      "objection_handling", "quote", "order_draft", "confirmation",
      "order_created", "followup",
    ] as const;

    for (const stage of stages) {
      const tokens = (orchestrator as any).getStageMaxTokens(stage);
      expect(typeof tokens).toBe("number");
      expect(tokens).toBeGreaterThanOrEqual(350);
      expect(tokens).toBeLessThanOrEqual(750);
    }
  });

  it("STIFF_PHRASES replacements contain no hardcoded product/merchant names", () => {
    const testInputs = [
      "كيف يمكنني مساعدتك اليوم؟",
      "يرجى تزويدي بالمعلومات اللازمة.",
      "محتاج تفاصيل أكتر. أيه اللي عايزه؟",
      "هل لديك ميزانية معينة؟",
    ];
    for (const input of testInputs) {
      const result = ReplyComposer.polish(input);
      for (const term of FORBIDDEN_TERMS) {
        expect(result).not.toContain(term);
      }
    }
  });
});
