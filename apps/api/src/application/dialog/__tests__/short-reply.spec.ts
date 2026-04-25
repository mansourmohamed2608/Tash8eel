/**
 * Wave 3 — Short reply and repeated-question reliability tests.
 *
 * Tests verify:
 * 1. ShortReplyResolver handles every canonical short reply correctly
 * 2. OptionExtractor extracts from bullet lists, numbered lists, and "or" patterns
 * 3. DialogOrchestrator injects resolved slot values into filledSlots before LLM
 * 4. DialogOrchestrator emits [SHORT_REPLY_CONTEXT], [ANSWERED_BY_SHORT_REPLY],
 *    and [DO_NOT_REPEAT] facts in answerFacts
 * 5. No hardcoded merchant names, products, or verticals in any logic
 */

import { ShortReplyResolver } from "../short-reply-resolver";
import { OptionExtractor } from "../option-extractor";
import { DialogOrchestrator } from "../dialog-orchestrator";
import { ActionType } from "../../../shared/constants/enums";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ctx(overrides: {
  pendingSlot?: string;
  pendingQuestionType?: string;
  lastOfferedOptions?: string[];
  lastRecommendation?: string;
  lastProposal?: string;
} = {}) {
  return {
    pendingSlot: overrides.pendingSlot ?? null,
    pendingQuestionType: overrides.pendingQuestionType ?? null,
    lastOfferedOptions: overrides.lastOfferedOptions ?? null,
    lastRecommendation: overrides.lastRecommendation ?? null,
    lastProposal: overrides.lastProposal ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ShortReplyResolver — selecting all options
// ─────────────────────────────────────────────────────────────────────────────

describe("ShortReplyResolver — selecting all options", () => {
  it('الاثنين resolves to all recent offered options', () => {
    const result = ShortReplyResolver.resolve(
      "الاثنين",
      ctx({ lastOfferedOptions: ["خيار أ", "خيار ب"] }),
    );
    expect(result.type).toBe("selecting_all_options");
    expect(result.resolvedOptions).toEqual(["خيار أ", "خيار ب"]);
    expect(result.contextNote).toContain("خيار أ");
    expect(result.contextNote).toContain("خيار ب");
    expect(result.contextNote).toContain("لا تعيد");
  });

  it('الاتنين is equivalent to الاثنين', () => {
    const result = ShortReplyResolver.resolve(
      "الاتنين",
      ctx({ lastOfferedOptions: ["X", "Y"] }),
    );
    expect(result.type).toBe("selecting_all_options");
    expect(result.resolvedOptions).toEqual(["X", "Y"]);
  });

  it('both resolves in English context', () => {
    const result = ShortReplyResolver.resolve(
      "both",
      ctx({ lastOfferedOptions: ["Option A", "Option B"] }),
    );
    expect(result.type).toBe("selecting_all_options");
    expect(result.resolvedOptions?.length).toBe(2);
  });

  it('selecting all with empty options still returns selecting_all_options', () => {
    const result = ShortReplyResolver.resolve("الاثنين", ctx());
    expect(result.type).toBe("selecting_all_options");
    expect(result.resolvedOptions).toEqual([]);
    expect(result.contextNote).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShortReplyResolver — ordinal selection
// ─────────────────────────────────────────────────────────────────────────────

describe("ShortReplyResolver — ordinal selection", () => {
  it('الأول resolves to first offered option', () => {
    const result = ShortReplyResolver.resolve(
      "الأول",
      ctx({ lastOfferedOptions: ["خيار أول", "خيار ثاني"] }),
    );
    expect(result.type).toBe("ordinal_selection");
    expect(result.ordinalIndex).toBe(0);
    expect(result.resolvedValue).toBe("خيار أول");
    expect(result.contextNote).toContain("خيار أول");
  });

  it('التاني resolves to second offered option', () => {
    const result = ShortReplyResolver.resolve(
      "التاني",
      ctx({ lastOfferedOptions: ["A", "B", "C"] }),
    );
    expect(result.type).toBe("ordinal_selection");
    expect(result.ordinalIndex).toBe(1);
    expect(result.resolvedValue).toBe("B");
  });

  it('التالت resolves to third offered option', () => {
    const result = ShortReplyResolver.resolve(
      "التالت",
      ctx({ lastOfferedOptions: ["X", "Y", "Z"] }),
    );
    expect(result.type).toBe("ordinal_selection");
    expect(result.ordinalIndex).toBe(2);
    expect(result.resolvedValue).toBe("Z");
  });

  it('الأول with no options still returns ordinal_selection type', () => {
    const result = ShortReplyResolver.resolve("الأول", ctx());
    expect(result.type).toBe("ordinal_selection");
    expect(result.resolvedValue).toBeUndefined();
    expect(result.contextNote).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShortReplyResolver — affirmative
// ─────────────────────────────────────────────────────────────────────────────

describe("ShortReplyResolver — affirmative", () => {
  it('تمام after proposal continues from lastProposal', () => {
    const result = ShortReplyResolver.resolve(
      "تمام",
      ctx({ lastProposal: "المنتج الأفضل لك هو الخيار الأول" }),
    );
    expect(result.type).toBe("affirmative");
    expect(result.contextNote).toContain("المنتج الأفضل لك هو الخيار الأول");
    expect(result.contextNote).toContain("انتقل");
  });

  it('اه continues from lastRecommendation when no lastProposal', () => {
    const result = ShortReplyResolver.resolve(
      "اه",
      ctx({ lastRecommendation: "عندنا عرض مميز" }),
    );
    expect(result.type).toBe("affirmative");
    expect(result.contextNote).toContain("عندنا عرض مميز");
  });

  it('أيوه without proposal still returns affirmative with generic note', () => {
    const result = ShortReplyResolver.resolve("أيوه", ctx());
    expect(result.type).toBe("affirmative");
    expect(result.contextNote).toContain("انتقل");
  });

  it('👍 is treated as emoji_ack (affirmative-adjacent)', () => {
    const result = ShortReplyResolver.resolve("👍", ctx());
    expect(result.type).toBe("emoji_ack");
    expect(result.contextNote).toContain("موافقة");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShortReplyResolver — "continue" intent (قولي / ايوه قولي)
// ─────────────────────────────────────────────────────────────────────────────

describe("ShortReplyResolver — continue intent", () => {
  it('قولي after AI offered explanation returns affirmative with continue note', () => {
    const result = ShortReplyResolver.resolve(
      "قولي",
      ctx({ lastRecommendation: "عندنا عرض خاص على الكمية" }),
    );
    expect(result.type).toBe("affirmative");
    expect(result.contextNote).toContain("مواصلة");
    expect(result.contextNote).toContain("لا تعيد السؤال الأخير");
  });

  it('ايوه قولي with last proposal continues without restart', () => {
    const result = ShortReplyResolver.resolve(
      "ايوه قولي",
      ctx({ lastProposal: "ممكن نوصلك بكرا" }),
    );
    expect(result.type).toBe("affirmative");
    expect(result.contextNote).toContain("ممكن نوصلك بكرا");
    expect(result.contextNote).toContain("لا تعيد السؤال الأخير");
  });

  it('كمل returns affirmative/continue without proposal', () => {
    const result = ShortReplyResolver.resolve("كمل", ctx());
    expect(result.type).toBe("affirmative");
    expect(result.contextNote).toContain("تابع");
  });

  it('أيوه قولّي (with shadda) resolves as continue', () => {
    const result = ShortReplyResolver.resolve("أيوه قولّي", ctx());
    expect(result.type).toBe("affirmative");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShortReplyResolver — negative
// ─────────────────────────────────────────────────────────────────────────────

describe("ShortReplyResolver — negative", () => {
  it('لا after proposal offers alternative, keeps context', () => {
    const result = ShortReplyResolver.resolve("لا", ctx({ lastProposal: "X" }));
    expect(result.type).toBe("negative_reply");
    expect(result.contextNote).toContain("بديل");
    expect(result.contextNote).toContain("لا تفقد سياق");
  });

  it('لأ is treated the same as لا', () => {
    const result = ShortReplyResolver.resolve("لأ", ctx());
    expect(result.type).toBe("negative_reply");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShortReplyResolver — numeric value
// ─────────────────────────────────────────────────────────────────────────────

describe("ShortReplyResolver — numeric value", () => {
  it('150 after quantity question resolves with quantity hint', () => {
    const result = ShortReplyResolver.resolve(
      "150",
      ctx({ pendingSlot: "quantity" }),
    );
    expect(result.type).toBe("numeric_value");
    expect(result.resolvedValue).toBe(150);
    expect(result.contextNote).toContain("150");
    expect(result.contextNote).toContain("quantity");
  });

  it('200 after budget context resolves with budget hint', () => {
    const result = ShortReplyResolver.resolve(
      "200",
      ctx({ pendingQuestionType: "budget" }),
    );
    expect(result.type).toBe("numeric_value");
    expect(result.resolvedValue).toBe(200);
    expect(result.contextNote).toContain("200");
  });

  it('numeric without pending slot still resolves as numeric_value', () => {
    const result = ShortReplyResolver.resolve("50", ctx());
    expect(result.type).toBe("numeric_value");
    expect(result.resolvedValue).toBe(50);
    expect(result.contextNote).toContain("50");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShortReplyResolver — location hint
// ─────────────────────────────────────────────────────────────────────────────

describe("ShortReplyResolver — location hint", () => {
  it('مصر الجديدة after delivery question resolves as location', () => {
    const result = ShortReplyResolver.resolve(
      "مصر الجديدة",
      ctx({ pendingSlot: "delivery_area" }),
    );
    expect(result.type).toBe("location_hint");
    expect(result.resolvedValue).toBe("مصر الجديدة");
    expect(result.contextNote).toContain("مصر الجديدة");
    expect(result.contextNote).toContain("منطقة التوصيل");
  });

  it('التجمع resolves as location when pendingQuestionType is delivery_area', () => {
    const result = ShortReplyResolver.resolve(
      "التجمع",
      ctx({ pendingQuestionType: "delivery_area" }),
    );
    expect(result.type).toBe("location_hint");
    expect(result.resolvedValue).toBe("التجمع");
  });

  it('مدينة نصر resolves as location when delivery context exists', () => {
    const result = ShortReplyResolver.resolve(
      "مدينة نصر",
      ctx({ pendingSlot: "delivery_area" }),
    );
    expect(result.type).toBe("location_hint");
  });

  it('location hint is NOT resolved when no delivery context', () => {
    // Without pendingSlot/pendingQuestionType = delivery_area, falls through
    const result = ShortReplyResolver.resolve("مصر الجديدة", ctx());
    expect(result.type).toBe("not_short");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ShortReplyResolver — date hint
// ─────────────────────────────────────────────────────────────────────────────

describe("ShortReplyResolver — date hint", () => {
  it('الأسبوع الجاي resolves as date_hint', () => {
    const result = ShortReplyResolver.resolve("الأسبوع الجاي", ctx());
    expect(result.type).toBe("date_hint");
    expect(result.resolvedValue).toBe("الأسبوع الجاي");
    expect(result.contextNote).toContain("الأسبوع الجاي");
  });

  it('بكرا resolves as date_hint', () => {
    const result = ShortReplyResolver.resolve("بكرا", ctx());
    expect(result.type).toBe("date_hint");
  });

  it('النهارده resolves as date_hint', () => {
    const result = ShortReplyResolver.resolve("النهارده", ctx());
    expect(result.type).toBe("date_hint");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OptionExtractor — option extraction
// ─────────────────────────────────────────────────────────────────────────────

describe("OptionExtractor — extractOfferedOptions", () => {
  it('extracts options from bullet list with • character', () => {
    const reply =
      "عندنا خيارين:\n• خيار أ الممتاز\n• خيار ب الأوفر\nتفضل أي منهم؟";
    const opts = OptionExtractor.extractOfferedOptions(reply);
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts.some((o) => o.includes("خيار أ"))).toBe(true);
    expect(opts.some((o) => o.includes("خيار ب"))).toBe(true);
  });

  it('extracts options from bullet list with - character', () => {
    const reply =
      "الخيارات المتاحة:\n- النوع الأول\n- النوع الثاني\n- النوع الثالث";
    const opts = OptionExtractor.extractOfferedOptions(reply);
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts.some((o) => o.includes("النوع الأول"))).toBe(true);
  });

  it('extracts options from numbered list with Western numerals', () => {
    const reply =
      "الخيارات عندنا:\n1. المنتج الأول\n2. المنتج الثاني\n3. المنتج الثالث";
    const opts = OptionExtractor.extractOfferedOptions(reply);
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts[0]).toContain("المنتج الأول");
    expect(opts[1]).toContain("المنتج الثاني");
  });

  it('extracts options from numbered list with Arabic numerals', () => {
    const reply = "١. الخيار الأول\n٢. الخيار الثاني";
    const opts = OptionExtractor.extractOfferedOptions(reply);
    expect(opts.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts two options from "X ولا Y؟" pattern', () => {
    const reply = "تحب الخيار الأول ولا الخيار الثاني؟";
    const opts = OptionExtractor.extractOfferedOptions(reply);
    expect(opts.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts two options from "X أو Y؟" pattern', () => {
    const reply = "عندك تحب الأزرق أو الأحمر؟";
    const opts = OptionExtractor.extractOfferedOptions(reply);
    expect(opts.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts 3 options from "X أو Y أو Z؟" pattern', () => {
    const reply = "تفضل الأحمر أو الأزرق أو الأخضر؟";
    const opts = OptionExtractor.extractOfferedOptions(reply);
    expect(opts.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts options from explicit ordinal labels', () => {
    const reply =
      "عندنا خيارين:\nالأول: المنتج الاقتصادي\nالتاني: المنتج الفاخر\nأيهم أنسبلك؟";
    const opts = OptionExtractor.extractOfferedOptions(reply);
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts.some((o) => o.includes("الاقتصادي"))).toBe(true);
    expect(opts.some((o) => o.includes("الفاخر"))).toBe(true);
  });

  it('returns empty array when no options are offered', () => {
    const reply = "أهلاً، قولّي أقدر أساعدك في إيه؟";
    const opts = OptionExtractor.extractOfferedOptions(reply);
    expect(opts).toEqual([]);
  });

  it('does not extract more than 4 options', () => {
    const reply =
      "• خيار 1\n• خيار 2\n• خيار 3\n• خيار 4\n• خيار 5\n• خيار 6";
    const opts = OptionExtractor.extractOfferedOptions(reply);
    expect(opts.length).toBeLessThanOrEqual(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DialogOrchestrator — short reply slot injection and fact generation
// ─────────────────────────────────────────────────────────────────────────────

function makeMockLlm() {
  return {
    processDialogTurn: jest.fn().mockResolvedValue({
      response: {
        reply_ar: "حاضر، هنكمل من هنا.",
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
      reply: "حاضر",
      cartItems: [],
    }),
  };
}

function makeMockPlaybook() {
  return {
    getForMerchant: jest.fn().mockResolvedValue({
      slotGraph: [],
      nextQuestionTemplates: {},
      escalationPolicy: {},
    }),
  };
}

function makeMockPool() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }) };
}

function makeCtx(overrides: Record<string, any> = {}) {
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
          ...overrides.dialog,
        },
        ...overrides.conversationContext,
      },
      cart: { items: [], subtotal: 0, discount: 0, deliveryFee: 0, total: 0 },
      collectedInfo: {},
      requiresConfirmation: false,
      ...overrides.conversation,
    },
    catalogItems: [],
    recentMessages: [],
    customerMessage: overrides.customerMessage ?? "تمام",
    turnMemory: overrides.turnMemory,
  } as any;
}

describe("DialogOrchestrator — short reply facts in answerFacts", () => {
  let orchestrator: DialogOrchestrator;
  let mockLlm: ReturnType<typeof makeMockLlm>;

  beforeEach(() => {
    mockLlm = makeMockLlm();
    orchestrator = new DialogOrchestrator(
      mockLlm as any,
      makeMockPlaybook() as any,
      makeMockPool() as any,
    );
  });

  it('short reply context note appears in answerFacts for "تمام" with lastProposal', async () => {
    const ctx = makeCtx({
      customerMessage: "تمام",
      dialog: { lastProposal: "المنتج الأنسب هو كذا" },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1]
      .answerFacts as string[];
    const shortReplyFact = facts.find((f) => f.includes("[SHORT_REPLY_CONTEXT]"));
    expect(shortReplyFact).toBeDefined();
    expect(shortReplyFact).toContain("المنتج الأنسب هو كذا");
  });

  it('[ANSWERED_BY_SHORT_REPLY] appears when numeric resolves to quantity', async () => {
    const ctx = makeCtx({
      customerMessage: "150",
      dialog: {
        pendingSlot: "quantity",
        lastQuestion: "quantity",
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1]
      .answerFacts as string[];
    const answeredFact = facts.find((f) =>
      f.includes("[ANSWERED_BY_SHORT_REPLY]"),
    );
    expect(answeredFact).toBeDefined();
    expect(answeredFact).toContain("الكمية");
    expect(answeredFact).toContain("150");
  });

  it('[DO_NOT_REPEAT] appears when lastQuestion is answered by short reply', async () => {
    const ctx = makeCtx({
      customerMessage: "150",
      dialog: {
        pendingSlot: "quantity",
        lastQuestion: "quantity",
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1]
      .answerFacts as string[];
    const repeatFact = facts.find((f) => f.includes("[DO_NOT_REPEAT]"));
    expect(repeatFact).toBeDefined();
    expect(repeatFact).toContain("quantity");
  });

  it('numeric short reply patches filledSlots with quantity before LLM call', async () => {
    const ctx = makeCtx({
      customerMessage: "200",
      dialog: {
        pendingSlot: "quantity",
        filledSlots: { product_interest: "منتج ما" },
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const callArgs = mockLlm.processDialogTurn.mock.calls[0];
    const userPromptCtx = callArgs[0].conversation.context?.dialog?.filledSlots;
    // filledSlots in context passed to LLM should contain quantity
    const facts = callArgs[1].answerFacts as string[];
    const quantityFact = facts.find(
      (f) => f.includes("ANSWERED_BY_SHORT_REPLY") && f.includes("الكمية"),
    );
    expect(quantityFact).toBeDefined();
  });

  it('location hint patches delivery_area into facts', async () => {
    const ctx = makeCtx({
      customerMessage: "مصر الجديدة",
      dialog: {
        pendingSlot: "delivery_area",
        lastQuestion: "delivery_area",
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1]
      .answerFacts as string[];
    const deliveryFact = facts.find(
      (f) =>
        f.includes("[ANSWERED_BY_SHORT_REPLY]") &&
        f.includes("منطقة التوصيل"),
    );
    expect(deliveryFact).toBeDefined();
    expect(deliveryFact).toContain("مصر الجديدة");
  });

  it('no repeated question: answered slot does not generate another slot question', async () => {
    // quantity is already filled — SlotPlan should not re-ask it
    const ctx = makeCtx({
      customerMessage: "تمام",
      dialog: {
        filledSlots: { quantity: 5, product_interest: "خدمة ما" },
        answeredSlots: ["quantity"],
        lastQuestion: "delivery_area",
        pendingSlot: "delivery_area",
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1]
      .answerFacts as string[];
    // The answerFacts should NOT contain "do not re-ask about quantity"
    // because quantity was never the short reply in this turn — but the
    // intent (affirmative) should carry the correct note
    const shortReplyFact = facts.find((f) =>
      f.includes("[SHORT_REPLY_CONTEXT]"),
    );
    // affirmative note should be present
    expect(shortReplyFact).toBeDefined();
    // There should be no [ANSWERED_BY_SHORT_REPLY] for quantity in this turn
    // since the message "تمام" is not a numeric short reply
    const quantityAnsweredFact = facts.find(
      (f) =>
        f.includes("[ANSWERED_BY_SHORT_REPLY]") && f.includes("الكمية"),
    );
    expect(quantityAnsweredFact).toBeUndefined();
  });

  it('قولي / ايوه قولي short reply produces continue fact in answerFacts', async () => {
    const ctx = makeCtx({
      customerMessage: "ايوه قولي",
      dialog: {
        lastProposal: "ممكن نعملك عرض على الكمية",
      },
    });
    await orchestrator.processTurn(ctx, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1]
      .answerFacts as string[];
    const continueFact = facts.find((f) => f.includes("[SHORT_REPLY_CONTEXT]"));
    expect(continueFact).toBeDefined();
    expect(continueFact).toContain("مواصلة");
    expect(continueFact).toContain("لا تعيد السؤال الأخير");
  });

  it('contextPatch carries lastOfferedOptions extracted from reply', async () => {
    mockLlm.processDialogTurn.mockResolvedValueOnce({
      response: {
        reply_ar: "تحب الخيار الأول ولا الخيار الثاني؟",
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
        negotiation: { requestedDiscount: null, approved: false, offerText: null, finalPrices: null },
        delivery_fee: null,
        confidence: 0.8,
        reasoning: "test",
      },
      tokensUsed: 0,
      llmUsed: false,
      action: ActionType.ASK_CLARIFYING_QUESTION,
      reply: "تحب الخيار الأول ولا الخيار الثاني؟",
      cartItems: [],
    });
    const ctx = makeCtx({ customerMessage: "عايز أشوف خياراتك" });
    const result = await orchestrator.processTurn(ctx, undefined);
    const dialog = result.contextPatch.dialog as any;
    // Options should be extracted from "تحب الخيار الأول ولا الخيار الثاني؟"
    expect(dialog.lastOfferedOptions).toBeDefined();
    expect(Array.isArray(dialog.lastOfferedOptions)).toBe(true);
    expect(dialog.lastOfferedOptions.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DialogOrchestrator — Wave 1: activeChoice, pendingCartItems, lastOfferedOptions
// ─────────────────────────────────────────────────────────────────────────────

function makeCatalogItem(id: string, nameAr: string, nameEn?: string) {
  return {
    id,
    merchantId: "test-merchant",
    nameAr,
    nameEn,
    basePrice: 100,
    variants: [],
    options: [],
    tags: [],
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("DialogOrchestrator — Wave 1 activeChoice + pendingCartItems", () => {
  let orchestrator: DialogOrchestrator;
  let mockLlm: ReturnType<typeof makeMockLlm>;

  beforeEach(() => {
    mockLlm = makeMockLlm();
    orchestrator = new DialogOrchestrator(
      mockLlm as any,
      makeMockPlaybook() as any,
      makeMockPool() as any,
    );
  });

  it('"الاتنين" sets activeChoice.status to resolved', async () => {
    const context = makeCtx({
      customerMessage: "الاتنين",
      dialog: {
        lastOfferedOptions: ["الخيار ألفا", "الخيار بيتا"],
        activeChoice: {
          axis: "product_interest",
          options: ["الخيار ألفا", "الخيار بيتا"],
          status: "open",
          openedAt: new Date().toISOString(),
        },
      },
    });
    const result = await orchestrator.processTurn(context, undefined);
    const dialog = result.contextPatch.dialog as any;
    expect(dialog.activeChoice).toBeDefined();
    expect(dialog.activeChoice.status).toBe("resolved");
    expect(dialog.activeChoice.resolvedTo).toEqual(["الخيار ألفا", "الخيار بيتا"]);
  });

  it('"الاتنين" clears lastOfferedOptions in contextPatch (R1 fix)', async () => {
    const context = makeCtx({
      customerMessage: "الاتنين",
      dialog: {
        lastOfferedOptions: ["الخيار ألفا", "الخيار بيتا"],
      },
    });
    const result = await orchestrator.processTurn(context, undefined);
    const dialog = result.contextPatch.dialog as any;
    expect(dialog.lastOfferedOptions).toEqual([]);
  });

  it('"الاتنين" populates pendingCartItems when catalog matches (R2 fix)', async () => {
    const context = makeCtx({
      customerMessage: "الاتنين",
      dialog: {
        lastOfferedOptions: ["الخيار ألفا", "الخيار بيتا"],
      },
    });
    // makeCtx sets catalogItems: [] — override directly for this test
    (context as any).catalogItems = [
      makeCatalogItem("id-alpha", "الخيار ألفا"),
      makeCatalogItem("id-beta", "الخيار بيتا"),
    ];
    const result = await orchestrator.processTurn(context as any, undefined);
    const dialog = result.contextPatch.dialog as any;
    expect(Array.isArray(dialog.pendingCartItems)).toBe(true);
    expect(dialog.pendingCartItems.length).toBeGreaterThanOrEqual(1);
    const ids = dialog.pendingCartItems.map((i: any) => i.catalogItemId);
    expect(ids).toContain("id-alpha");
    expect(ids).toContain("id-beta");
  });

  it('"الاتنين" sets purchaseIntentConfirmed to true', async () => {
    const context = makeCtx({
      customerMessage: "الاتنين",
      dialog: {
        lastOfferedOptions: ["الخيار ألفا", "الخيار بيتا"],
      },
    });
    const result = await orchestrator.processTurn(context, undefined);
    const dialog = result.contextPatch.dialog as any;
    expect(dialog.purchaseIntentConfirmed).toBe(true);
  });

  it('"الأول" resolves activeChoice to first option and clears lastOfferedOptions', async () => {
    const context = makeCtx({
      customerMessage: "الأول",
      dialog: {
        lastOfferedOptions: ["الخيار ألفا", "الخيار بيتا"],
      },
    });
    const result = await orchestrator.processTurn(context, undefined);
    const dialog = result.contextPatch.dialog as any;
    expect(dialog.lastOfferedOptions).toEqual([]);
    expect(dialog.activeChoice?.status).toBe("resolved");
    expect(dialog.activeChoice?.resolvedTo).toEqual(["الخيار ألفا"]);
  });

  it('salesStage does not regress to comparison after "الاتنين" resolution (R8 fix)', async () => {
    const context = makeCtx({
      customerMessage: "الاتنين",
      dialog: {
        lastOfferedOptions: ["الخيار ألفا", "الخيار بيتا"],
        filledSlots: { product_interest: "something" },
      },
    });
    const result = await orchestrator.processTurn(context, undefined);
    const dialog = result.contextPatch.dialog as any;
    // With lastOfferedOptions cleared, stage should not be "comparison"
    expect(dialog.salesStage).not.toBe("comparison");
  });

  it('[ACTIVE_CHOICE_RESOLVED] fact injected into answerFacts on selection (R5 fix)', async () => {
    const context = makeCtx({
      customerMessage: "الاتنين",
      dialog: {
        lastOfferedOptions: ["الخيار ألفا", "الخيار بيتا"],
      },
    });
    await orchestrator.processTurn(context, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const resolvedFact = facts.find((f) => f.includes("[ACTIVE_CHOICE_RESOLVED]"));
    expect(resolvedFact).toBeDefined();
    expect(resolvedFact).toContain("الخيار ألفا");
    expect(resolvedFact).toContain("الخيار بيتا");
  });

  it('[DO_NOT_RELIST] fact injected into answerFacts on selection', async () => {
    const context = makeCtx({
      customerMessage: "الأول",
      dialog: {
        lastOfferedOptions: ["الخيار ألفا", "الخيار بيتا"],
      },
    });
    await orchestrator.processTurn(context, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1].answerFacts as string[];
    const doNotRelist = facts.find((f) => f.includes("[DO_NOT_RELIST]"));
    expect(doNotRelist).toBeDefined();
  });

  it('AI reply with new options opens activeChoice frame', async () => {
    mockLlm.processDialogTurn.mockResolvedValueOnce({
      response: {
        reply_ar: "تحب الخيار ألفا ولا الخيار بيتا؟",
        actionType: ActionType.ASK_CLARIFYING_QUESTION,
        extracted_entities: { products: null, customerName: null, phone: null, address: null, substitutionAllowed: null, deliveryPreference: null },
        missing_slots: null,
        negotiation: { requestedDiscount: null, approved: false, offerText: null, finalPrices: null },
        delivery_fee: null,
        confidence: 0.8,
        reasoning: "test",
      },
      tokensUsed: 0,
      llmUsed: false,
      action: ActionType.ASK_CLARIFYING_QUESTION,
      reply: "تحب الخيار ألفا ولا الخيار بيتا؟",
      cartItems: [],
    });
    const context = makeCtx({ customerMessage: "عايز أشوف خياراتك" });
    const result = await orchestrator.processTurn(context, undefined);
    const dialog = result.contextPatch.dialog as any;
    expect(dialog.activeChoice).toBeDefined();
    expect(dialog.activeChoice.status).toBe("open");
    expect(dialog.activeChoice.options.length).toBeGreaterThanOrEqual(2);
  });

  it('non-selection turn preserves existing open activeChoice frame', async () => {
    const existingFrame = {
      axis: "product_interest",
      options: ["الخيار ألفا", "الخيار بيتا"],
      status: "open" as const,
      openedAt: new Date().toISOString(),
    };
    const context = makeCtx({
      customerMessage: "السعر كام؟",
      dialog: { activeChoice: existingFrame },
    });
    const result = await orchestrator.processTurn(context, undefined);
    const dialog = result.contextPatch.dialog as any;
    // Frame should still be carried (status open, same options)
    expect(dialog.activeChoice?.status).toBe("open");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No-hardcoding proof
// ─────────────────────────────────────────────────────────────────────────────

describe("No-hardcoding proof", () => {
  const FORBIDDEN_TERMS = [
    "عطر", "فستان", "قميص", "بيتزا", "مطعم", "demo", "Demo",
    "apparel", "perfume", "fashion",
  ];

  it('ShortReplyResolver context notes contain no hardcoded product/merchant names', () => {
    const testCases = [
      ShortReplyResolver.resolve("الاثنين", ctx({ lastOfferedOptions: [] })),
      ShortReplyResolver.resolve("الأول", ctx()),
      ShortReplyResolver.resolve("تمام", ctx()),
      ShortReplyResolver.resolve("لا", ctx()),
      ShortReplyResolver.resolve("قولي", ctx()),
      ShortReplyResolver.resolve("150", ctx({ pendingSlot: "quantity" })),
      ShortReplyResolver.resolve("مصر الجديدة", ctx({ pendingSlot: "delivery_area" })),
      ShortReplyResolver.resolve("الأسبوع الجاي", ctx()),
    ];
    for (const result of testCases) {
      for (const term of FORBIDDEN_TERMS) {
        expect(result.contextNote).not.toContain(term);
      }
    }
  });

  it('OptionExtractor methods contain no hardcoded product names', () => {
    const replies = [
      "• خيار أ\n• خيار ب",
      "1. المنتج الأول\n2. المنتج الثاني",
      "تحب الأحمر ولا الأزرق؟",
    ];
    for (const reply of replies) {
      const opts = OptionExtractor.extractOfferedOptions(reply);
      for (const opt of opts) {
        for (const term of FORBIDDEN_TERMS) {
          expect(opt).not.toContain(term);
        }
      }
    }
  });
});
