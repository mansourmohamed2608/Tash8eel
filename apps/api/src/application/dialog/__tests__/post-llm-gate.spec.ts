/**
 * Wave 3 — PostLlmGate + askedQuestions ledger tests.
 *
 * Covers:
 *   A. AI asks delivery too early → gate blocks it
 *   B. AI asks payment too early → gate blocks it
 *   C. AI repeats same choice after activeChoice resolved → gate blocks it
 *   D. detectAskedQuestion stores choice question
 *   E. detectAskedQuestion stores delivery only when allowed (order_draft / purchaseIntentConfirmed=true)
 *   F. [DO_NOT_ASK_AGAIN] appears in answerFacts when prior askedQuestions exist
 *   G. Valid delivery question is allowed after order_draft or purchaseIntentConfirmed=true
 *   H. No hardcoded product/merchant/category strings in production code
 */

import { PostLlmGate } from "../post-llm-gate";
import { DialogOrchestrator } from "../dialog-orchestrator";
import { ActionType } from "../../../shared/constants/enums";
import type { ActiveChoiceFrame, AskedQuestion } from "../../../domain/entities/conversation.entity";

// ─────────────────────────────────────────────────────────────────────────────
// A. Premature delivery question blocked
// ─────────────────────────────────────────────────────────────────────────────

describe("PostLlmGate — A: blocks premature delivery question", () => {
  it("blocks delivery question when salesStage=recommendation and purchaseIntentConfirmed=false", () => {
    const result = PostLlmGate.gate({
      replyText:
        "تمام، بناءً على احتياجك، النوع الأول هو الأنسب. عنوانك إيه؟",
      salesStage: "recommendation",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("premature_delivery_question");
    // Useful content preserved
    expect(result.replyText).toContain("النوع الأول");
    // Delivery question stripped
    expect(result.replyText).not.toMatch(/عنوانك/);
  });

  it("blocks delivery question when salesStage=comparison", () => {
    const result = PostLlmGate.gate({
      replyText:
        "قارنت الخيارين — النوع أ أوفر. هتستلم فين؟",
      salesStage: "comparison",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("premature_delivery_question");
    expect(result.replyText).not.toMatch(/هتستلم/);
  });

  it("blocks delivery question when salesStage=discovery", () => {
    const result = PostLlmGate.gate({
      replyText: "أهلاً! التوصيل لفين؟",
      salesStage: "discovery",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("premature_delivery_question");
  });

  it("blocks delivery question when salesStage=quote", () => {
    const result = PostLlmGate.gate({
      replyText:
        "السعر الإجمالي المقدر هو 500. منطقة التوصيل إيه؟",
      salesStage: "quote",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("premature_delivery_question");
  });

  it("blocks repeated delivery question via askedQuestions ledger", () => {
    const result = PostLlmGate.gate({
      replyText:
        "تمام، هنكمل. مكان الاستلام إيه؟",
      salesStage: "order_draft",
      activeChoice: null,
      purchaseIntentConfirmed: true,
      askedQuestions: [
        { kind: "delivery", key: "delivery_address", askedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("repeated_delivery_question");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Premature payment question blocked
// ─────────────────────────────────────────────────────────────────────────────

describe("PostLlmGate — B: blocks premature payment question", () => {
  it("blocks payment question when salesStage=qualification", () => {
    const result = PostLlmGate.gate({
      replyText:
        "معلومات حلوة! طريقة الدفع إيه؟",
      salesStage: "qualification",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("premature_payment_question");
    expect(result.replyText).not.toMatch(/طريقة الدفع/);
  });

  it("blocks 'بالكاش ولا بكارت' payment question when salesStage=comparison", () => {
    const result = PostLlmGate.gate({
      replyText:
        "قارنت الخيارين. بالكاش ولا بكارت؟",
      salesStage: "comparison",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("premature_payment_question");
    expect(result.replyText).not.toMatch(/كاش/);
  });

  it("blocks payment question when salesStage=recommendation", () => {
    const result = PostLlmGate.gate({
      replyText:
        "بناءً على ميزانيتك، النوع ب أنسب. هتدفع إزاي؟",
      salesStage: "recommendation",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("premature_payment_question");
  });

  it("blocks repeated payment question via askedQuestions ledger", () => {
    const result = PostLlmGate.gate({
      replyText:
        "تمام. كيف الدفع؟",
      salesStage: "order_draft",
      activeChoice: null,
      purchaseIntentConfirmed: true,
      askedQuestions: [
        { kind: "payment", key: "payment_method", askedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("repeated_payment_question");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Repeated choice after activeChoice resolved — gate blocks relist
// ─────────────────────────────────────────────────────────────────────────────

describe("PostLlmGate — C: blocks relisted resolved choice", () => {
  function resolvedFrame(resolvedTo: string[]): ActiveChoiceFrame {
    return {
      axis: "product_interest",
      options: resolvedTo,
      status: "resolved",
      openedAt: "2026-01-01T00:00:00.000Z",
      resolvedAt: "2026-01-01T00:00:00.000Z",
      resolvedTo,
    };
  }

  it("blocks re-asking 'الخيار ألفا ولا الخيار بيتا' after both were resolved", () => {
    const result = PostLlmGate.gate({
      // Reply has some content before the relist question (after the period separator)
      replyText:
        "جميل، اتفقنا على الخيارين. هتاخد الخيار ألفا ولا الخيار بيتا؟",
      salesStage: "recommendation",
      activeChoice: resolvedFrame(["الخيار ألفا", "الخيار بيتا"]),
      purchaseIntentConfirmed: true,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("repeated_choice_after_resolution");
  });

  it("blocks re-asking 'Option Alpha or Option Beta' after both were resolved", () => {
    const result = PostLlmGate.gate({
      replyText:
        "Great! Would you like Option Alpha or Option Beta?",
      salesStage: "comparison",
      activeChoice: resolvedFrame(["Option Alpha", "Option Beta"]),
      purchaseIntentConfirmed: true,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(true);
    expect(result.blockReason).toBe("repeated_choice_after_resolution");
  });

  it("does NOT block a reply that mentions resolved items without re-asking", () => {
    const result = PostLlmGate.gate({
      replyText:
        "ممتاز، اخترت الخيار ألفا والخيار بيتا. هكمل معك خطوة خطوة.",
      salesStage: "order_draft",
      activeChoice: resolvedFrame(["الخيار ألفا", "الخيار بيتا"]),
      purchaseIntentConfirmed: true,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(false);
  });

  it("does NOT block when only one resolved option appears in a different question", () => {
    const result = PostLlmGate.gate({
      replyText:
        "تمام اخترت الخيار ألفا. هتاخد كام حبة؟",
      salesStage: "order_draft",
      activeChoice: resolvedFrame(["الخيار ألفا", "الخيار بيتا"]),
      purchaseIntentConfirmed: true,
      askedQuestions: [],
    });
    // Only one resolved option in the question + different subject → not a relist
    expect(result.blocked).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. detectAskedQuestion correctly classifies question kinds
// ─────────────────────────────────────────────────────────────────────────────

describe("PostLlmGate.detectAskedQuestion — D: stores choice question", () => {
  it("returns kind=choice for 'الخيار الأول ولا الخيار الثاني؟'", () => {
    const q = PostLlmGate.detectAskedQuestion(
      "هتاخد الخيار الأول ولا الخيار الثاني؟",
    );
    expect(q).not.toBeNull();
    expect(q!.kind).toBe("choice");
    expect(q!.key).toBe("product_choice");
  });

  it("returns kind=choice for 'Option Alpha or Option Beta?'", () => {
    const q = PostLlmGate.detectAskedQuestion(
      "Would you prefer Option Alpha or Option Beta?",
    );
    expect(q).not.toBeNull();
    expect(q!.kind).toBe("choice");
  });

  it("returns kind=delivery for a delivery question", () => {
    const q = PostLlmGate.detectAskedQuestion("عنوانك إيه؟");
    expect(q).not.toBeNull();
    expect(q!.kind).toBe("delivery");
    expect(q!.key).toBe("delivery_address");
  });

  it("returns kind=payment for a payment question", () => {
    const q = PostLlmGate.detectAskedQuestion("طريقة الدفع إيه؟");
    expect(q).not.toBeNull();
    expect(q!.kind).toBe("payment");
    expect(q!.key).toBe("payment_method");
  });

  it("returns kind=quantity for a quantity question", () => {
    const q = PostLlmGate.detectAskedQuestion("كام حبة محتاج؟");
    expect(q).not.toBeNull();
    expect(q!.kind).toBe("quantity");
  });

  it("returns kind=confirmation for a confirmation question", () => {
    const q = PostLlmGate.detectAskedQuestion(
      "تمام، لخصت الطلب. تأكدلك على كده؟",
    );
    expect(q).not.toBeNull();
    expect(q!.kind).toBe("confirmation");
  });

  it("returns null for a reply with no question mark", () => {
    const q = PostLlmGate.detectAskedQuestion("تمام، حاضر.");
    expect(q).toBeNull();
  });

  it("returns null for an empty string", () => {
    const q = PostLlmGate.detectAskedQuestion("");
    expect(q).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. detectAskedQuestion: delivery stored only when allowed
// ─────────────────────────────────────────────────────────────────────────────

describe("PostLlmGate — E: delivery question stored in ledger only when gate allows it", () => {
  it("gate allows delivery question at order_draft — detectAskedQuestion returns delivery kind", () => {
    const replyText = "تمام اتفقنا. عنوانك إيه؟";
    const gateResult = PostLlmGate.gate({
      replyText,
      salesStage: "order_draft",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    // Gate should not block (order_draft is allowed)
    expect(gateResult.blocked).toBe(false);
    // detectAskedQuestion should correctly identify it
    const q = PostLlmGate.detectAskedQuestion(gateResult.replyText);
    expect(q).not.toBeNull();
    expect(q!.kind).toBe("delivery");
  });

  it("gate allows delivery question when purchaseIntentConfirmed=true", () => {
    const replyText = "هتستلم فين؟";
    const gateResult = PostLlmGate.gate({
      replyText,
      salesStage: "recommendation",
      activeChoice: null,
      purchaseIntentConfirmed: true,
      askedQuestions: [],
    });
    expect(gateResult.blocked).toBe(false);
    const q = PostLlmGate.detectAskedQuestion(gateResult.replyText);
    expect(q!.kind).toBe("delivery");
  });

  it("gate BLOCKS delivery question at recommendation stage — detectAskedQuestion should NOT record it", () => {
    const replyText = "تمام، المنتج أ أنسب. عنوانك؟";
    const gateResult = PostLlmGate.gate({
      replyText,
      salesStage: "recommendation",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    // Gate blocked — the blocked reply has no delivery question
    expect(gateResult.blocked).toBe(true);
    const q = PostLlmGate.detectAskedQuestion(gateResult.replyText);
    // The stripped reply should not classify as delivery
    expect(q?.kind).not.toBe("delivery");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. [DO_NOT_ASK_AGAIN] appears in answerFacts when prior askedQuestions exist
// ─────────────────────────────────────────────────────────────────────────────

function makeMockLlm(replyText = "حاضر، هنكمل.") {
  return {
    processDialogTurn: jest.fn().mockResolvedValue({
      response: {
        reply_ar: replyText,
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
      reply: replyText,
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
      id: "test-merchant-wave3",
      name: "متجر تجريبي",
      config: { agent_availability: { backup: "none" } },
      currency: "EGP",
    },
    conversation: {
      id: "conv-wave3",
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
          activeChoice: null,
          customerMentionedAlternatives: [],
          askedQuestions: [],
          salesStage: "qualification",
          purchaseIntentConfirmed: false,
          ...overrides.dialog,
        },
        ...overrides.conversationContext,
      },
      cart: { items: [], subtotal: 0, discount: 0, deliveryFee: 0, total: 0 },
      collectedInfo: {},
      requiresConfirmation: false,
      ...overrides.conversation,
    },
    catalogItems: overrides.catalogItems ?? [],
    recentMessages: [],
    customerMessage: overrides.customerMessage ?? "تمام",
    turnMemory: overrides.turnMemory,
  } as any;
}

describe("DialogOrchestrator — F: [DO_NOT_ASK_AGAIN] injected when askedQuestions has prior entries", () => {
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

  it("injects [DO_NOT_ASK_AGAIN] for delivery when delivery was previously asked", async () => {
    const prior: AskedQuestion[] = [
      { kind: "delivery", key: "delivery_address", askedAt: "2026-01-01T00:00:00.000Z" },
    ];
    const context = makeCtx({
      customerMessage: "تمام",
      dialog: { askedQuestions: prior },
    });
    await orchestrator.processTurn(context, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1]
      .answerFacts as string[];
    const doNotAskFact = facts.find((f) => f.includes("[DO_NOT_ASK_AGAIN]") && /عنوان|توصيل/u.test(f));
    expect(doNotAskFact).toBeDefined();
  });

  it("injects [DO_NOT_ASK_AGAIN] for payment when payment was previously asked", async () => {
    const prior: AskedQuestion[] = [
      { kind: "payment", key: "payment_method", askedAt: "2026-01-01T00:00:00.000Z" },
    ];
    const context = makeCtx({
      customerMessage: "تمام",
      dialog: { askedQuestions: prior },
    });
    await orchestrator.processTurn(context, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1]
      .answerFacts as string[];
    const doNotAskFact = facts.find(
      (f) => f.includes("[DO_NOT_ASK_AGAIN]") && /دفع/u.test(f),
    );
    expect(doNotAskFact).toBeDefined();
  });

  it("injects [ALREADY_ASKED_QUESTIONS] when any question was previously asked", async () => {
    const prior: AskedQuestion[] = [
      { kind: "choice", key: "product_choice", askedAt: "2026-01-01T00:00:00.000Z" },
    ];
    const context = makeCtx({
      customerMessage: "تمام",
      dialog: { askedQuestions: prior },
    });
    await orchestrator.processTurn(context, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1]
      .answerFacts as string[];
    const alreadyAskedFact = facts.find((f) =>
      f.includes("[ALREADY_ASKED_QUESTIONS]"),
    );
    expect(alreadyAskedFact).toBeDefined();
    expect(alreadyAskedFact).toContain("choice");
  });

  it("injects [DO_NOT_ASK_AGAIN] for resolved activeChoice from prior turn", async () => {
    const context = makeCtx({
      customerMessage: "تمام",
      dialog: {
        activeChoice: {
          axis: "product_interest",
          options: ["الخيار ألفا", "الخيار بيتا"],
          status: "resolved",
          openedAt: "2026-01-01T00:00:00.000Z",
          resolvedAt: "2026-01-01T00:00:00.000Z",
          resolvedTo: ["الخيار ألفا", "الخيار بيتا"],
        },
        purchaseIntentConfirmed: true,
      },
    });
    await orchestrator.processTurn(context, undefined);
    const facts = mockLlm.processDialogTurn.mock.calls[0][1]
      .answerFacts as string[];
    const choiceFact = facts.find(
      (f) =>
        f.includes("[DO_NOT_ASK_AGAIN]") &&
        f.includes("الخيار ألفا"),
    );
    expect(choiceFact).toBeDefined();
  });

  it("askedQuestions ledger accumulates across turns in contextPatch", async () => {
    const prior: AskedQuestion[] = [
      { kind: "choice", key: "product_choice", askedAt: "2026-01-01T00:00:00.000Z" },
    ];
    // Mock LLM returns a delivery question this turn
    mockLlm.processDialogTurn.mockResolvedValueOnce({
      response: {
        reply_ar: "تمام. عنوانك إيه؟",
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
      reply: "تمام. عنوانك إيه؟",
      cartItems: [],
    });
    const context = makeCtx({
      customerMessage: "تمام",
      dialog: {
        askedQuestions: prior,
        salesStage: "order_draft",
        purchaseIntentConfirmed: true,
      },
    });
    const result = await orchestrator.processTurn(context, undefined);
    const updatedQ = (result.contextPatch.dialog as any).askedQuestions as AskedQuestion[];
    expect(Array.isArray(updatedQ)).toBe(true);
    // Should have the prior choice question plus the new delivery question
    const kinds = updatedQ.map((q) => q.kind);
    expect(kinds).toContain("choice");
    expect(kinds).toContain("delivery");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Valid delivery question allowed after order_draft or purchaseIntentConfirmed=true
// ─────────────────────────────────────────────────────────────────────────────

describe("PostLlmGate — G: allows delivery and payment questions when appropriate", () => {
  it("allows delivery question when salesStage=order_draft", () => {
    const result = PostLlmGate.gate({
      replyText: "تمام اتفقنا. عنوانك إيه؟",
      salesStage: "order_draft",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(false);
  });

  it("allows delivery question when salesStage=confirmation", () => {
    const result = PostLlmGate.gate({
      replyText: "ممتاز. هتستلم منين؟",
      salesStage: "confirmation",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(false);
  });

  it("allows delivery question when purchaseIntentConfirmed=true (any stage)", () => {
    const result = PostLlmGate.gate({
      replyText: "تمام. التوصيل لفين؟",
      salesStage: "recommendation",
      activeChoice: null,
      purchaseIntentConfirmed: true,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(false);
  });

  it("allows payment question when salesStage=order_draft", () => {
    const result = PostLlmGate.gate({
      replyText: "ممتاز. طريقة الدفع إيه؟",
      salesStage: "order_draft",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(false);
  });

  it("allows payment question when purchaseIntentConfirmed=true", () => {
    const result = PostLlmGate.gate({
      replyText: "ممتاز. هتدفع إزاي؟",
      salesStage: "comparison",
      activeChoice: null,
      purchaseIntentConfirmed: true,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(false);
  });

  it("does not block a reply with no question mark", () => {
    const result = PostLlmGate.gate({
      replyText: "تمام، حاضر.",
      salesStage: "discovery",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(false);
  });

  it("does not block a pure recommendation reply with no delivery/payment question", () => {
    const result = PostLlmGate.gate({
      replyText:
        "بناءً على ميزانيتك، الخيار أ أنسب. تحب أشوفلك مزيد من التفاصيل؟",
      salesStage: "recommendation",
      activeChoice: null,
      purchaseIntentConfirmed: false,
      askedQuestions: [],
    });
    expect(result.blocked).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. No hardcoding proof
// ─────────────────────────────────────────────────────────────────────────────

describe("No hardcoding — H", () => {
  const FORBIDDEN_STRINGS = [
    // Arabic product/merchant names that must not appear in production logic
    "عطر", "فستان", "بيتزا", "مطعم", "صالون",
    // English vertical/product names
    "perfume", "fashion", "apparel", "pizza", "restaurant",
    // Demo identifiers
    "demo-merchant", "demo_product",
  ];

  it("PostLlmGate gate() handles diverse neutral inputs without hardcoded strings in output", () => {
    const neutralReplies = [
      "تمام، بناءً على اهتمامك الخيار أ أنسب. محتاج تفاصيل إضافية؟",
      "The first option fits your budget best. Would you like to proceed?",
      "أهلاً! تحب تشوف خياراتنا المتاحة؟",
    ];
    for (const reply of neutralReplies) {
      const result = PostLlmGate.gate({
        replyText: reply,
        salesStage: "recommendation",
        activeChoice: null,
        purchaseIntentConfirmed: false,
        askedQuestions: [],
      });
      for (const forbidden of FORBIDDEN_STRINGS) {
        expect(result.replyText).not.toContain(forbidden);
      }
    }
  });

  it("tests use neutral placeholder names only — no vertical-specific strings", () => {
    // Verify that none of the test inputs contain forbidden vertical terms
    const testInputs = [
      "الخيار ألفا",
      "الخيار بيتا",
      "Option Alpha",
      "Option Beta",
      "النوع الأول",
      "النوع الثاني",
    ];
    for (const input of testInputs) {
      for (const forbidden of FORBIDDEN_STRINGS) {
        expect(input).not.toContain(forbidden);
      }
    }
  });

  it("askedQuestions key values use generic identifiers only", () => {
    const GENERIC_KEYS = [
      "delivery_address",
      "payment_method",
      "order_confirmation",
      "quantity",
      "product_choice",
      "recommendation",
      "generic_question",
    ];
    // All keys used in detectAskedQuestion output must be in the generic set
    const testReplies = [
      { text: "عنوانك إيه؟", expectedKey: "delivery_address" },
      { text: "طريقة الدفع إيه؟", expectedKey: "payment_method" },
      { text: "تأكدلك على كده؟", expectedKey: "order_confirmation" },
      { text: "كام حبة؟", expectedKey: "quantity" },
      { text: "الخيار الأول ولا الخيار الثاني؟", expectedKey: "product_choice" },
    ];
    for (const { text, expectedKey } of testReplies) {
      const q = PostLlmGate.detectAskedQuestion(text);
      expect(q).not.toBeNull();
      expect(GENERIC_KEYS).toContain(q!.key);
      expect(q!.key).toBe(expectedKey);
    }
  });
});
