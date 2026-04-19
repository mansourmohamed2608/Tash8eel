import { DeEscalator } from "../de-escalator";
import { ConstraintNegotiator } from "../constraint-negotiator";
import { ReplyComposer } from "../reply-composer";
import { SlotPlan } from "../slot-plan";
import { IntentClassifier } from "../intent-classifier";
import { MediaComposer } from "../media-composer";
import { DialogOrchestrator } from "../dialog-orchestrator";
import { ActionType } from "../../../shared/constants/enums";

const merchant: any = {
  id: "test-merchant",
  name: "متجر تجريبي",
  config: {
    agent_availability: { backup: "none" },
    cadence: { signature: "فريق المتجر" },
  },
};

describe("dialog core", () => {
  it("does not promise a human when no human backup exists", () => {
    const result = DeEscalator.compose("عايز أكلم مسؤول عندي مشكلة", merchant);
    expect(result.reply).toContain("أيوة معاك");
    expect(result.reply).not.toMatch(/هحوّ?لك|هيتواصل|زميل|مسؤول\s+هيرد/);
  });

  it("names multiple infeasibility axes", () => {
    const result = ConstraintNegotiator.compose(
      "عايز حاجة فوتوريال 200x300 بعد ساعتين من صورة مش واضحة",
      merchant,
    );
    expect(result?.axes.length).toBeGreaterThanOrEqual(2);
    expect(result?.reply).toMatch(/الميعاد|المقاس|وضوح الصورة/);
  });

  it("treats rush personalization as a constraint conflict", () => {
    const result = ConstraintNegotiator.compose(
      "عايز حفر اسم على علبة الهدية ويتسلم النهارده",
      merchant,
    );
    expect(result?.axes).toEqual(
      expect.arrayContaining(["deadline", "personalization"]),
    );
  });

  it("keeps one question and strips system wording", () => {
    const reply = ReplyComposer.polish(
      "أنا AI. بكل سرور، أقدر أساعدك. تحب مقاس إيه؟ وميزانيتك كام؟",
    );
    expect(reply).not.toMatch(/AI|بكل سرور/);
    expect((reply.match(/[؟?]/g) || []).length).toBeLessThanOrEqual(1);
  });

  it("removes stiff customer-service phrasing from human dialog replies", () => {
    const reply = ReplyComposer.polish(
      "يرجى توضيح الطلب. ممكن تساعدني وتقول لي التفاصيل؟ أقدر أساعدك بشكل أفضل.",
    );

    expect(reply).not.toMatch(
      /يرجى|ممكن\s+تساعدني|أقدر\s+أساعدك\s+بشكل\s+أفضل|أنا\s+AI|بوت/,
    );
  });

  it("does not re-ask filled slots", () => {
    const plan = SlotPlan.chooseNext({
      slotGraph: [{ key: "occasion" }, { key: "budget" }],
      filledSlots: { occasion: "عيد ميلاد" },
    });
    expect(plan.nextSlot).toBe("budget");
  });

  it("classifies media requests generically", () => {
    const result = IntentClassifier.classify("ممكن تبعتلي صورة العطر ده؟");
    expect(result.intent).toBe("media_request");
  });

  it("selects media for a mentioned item request", async () => {
    const pool: any = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            url: "https://example.com/a.jpg",
            caption_ar: "صورة المنتج",
            caption_en: null,
            fallback_text: "الصورة غير متاحة",
          },
        ],
      }),
    };

    const media = await MediaComposer.compose({
      pool,
      merchantId: "test-merchant",
      channel: "whatsapp",
      customerMessage: "ابعتلي صورة عطر عود شرقي 100 مل",
      catalogItems: [
        {
          id: "00000000-0000-4000-c000-000000000001",
          merchantId: "test-merchant",
          sku: "PER-OUD-100",
          nameAr: "عطر عود شرقي 100 مل",
          basePrice: 1450,
          variants: [],
          options: [],
          tags: [],
          isAvailable: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    expect(media).toHaveLength(1);
    expect(media[0].caption).toBe("صورة المنتج");
  });

  it("orchestrates media requests without cart/order mutation", async () => {
    const llmService: any = {
      processMessage: jest.fn(),
      composeDialogReply: jest.fn(),
      processDialogTurn: jest.fn().mockResolvedValue({
        response: {
          actionType: ActionType.CREATE_ORDER,
          reply_ar: "أهي صور العطر مرفقة، تحب أقولك تفاصيل الرائحة؟",
          reasoning: "mock_order_overreach",
        },
        tokensUsed: 11,
        llmUsed: true,
        action: ActionType.CREATE_ORDER,
        reply: "أهي صور العطر مرفقة، تحب أقولك تفاصيل الرائحة؟",
        cartItems: [{ name: "عطر عود شرقي 100 مل", quantity: 1 }],
      }),
    };
    const playbookService: any = {
      getForMerchant: jest.fn().mockResolvedValue({
        slotGraph: [{ key: "occasion" }, { key: "budget" }],
        constraintDims: [],
        nextQuestionTemplates: { occasion: "اسأل عن المناسبة" },
        intentExamples: {},
        slotExtractors: {},
        version: 1,
      }),
    };
    const pool: any = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            url: "https://example.com/oud.jpg",
            caption_ar: "عطر عود شرقي 100 مل",
            caption_en: null,
            fallback_text: "صورة عطر عود شرقي 100 مل",
          },
        ],
      }),
    };
    const orchestrator = new DialogOrchestrator(
      llmService,
      playbookService,
      pool,
    );

    const result = await orchestrator.processTurn(
      {
        merchant,
        conversation: { context: {} },
        catalogItems: [
          {
            id: "00000000-0000-4000-c000-000000000001",
            merchantId: "test-merchant",
            sku: "PER-OUD-100",
            nameAr: "عطر عود شرقي 100 مل",
            basePrice: 1450,
            variants: [],
            options: [],
            tags: [],
            isAvailable: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        recentMessages: [],
        customerMessage: "ممكن تبعتلي صورة عطر عود شرقي 100 مل؟",
      } as any,
      { model: "gpt-4o-mini" },
      { channel: "whatsapp" },
    );

    expect(result.llmResult.action).toBe(ActionType.ASK_CLARIFYING_QUESTION);
    expect(result.llmResult.cartItems).toEqual([]);
    expect(result.mediaAttachments).toHaveLength(1);
    expect(llmService.processMessage).not.toHaveBeenCalled();
    expect(llmService.composeDialogReply).not.toHaveBeenCalled();
    expect(llmService.processDialogTurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        intent: "media_request",
        mediaWillBeAttached: true,
      }),
      expect.objectContaining({ model: "gpt-4o-mini" }),
    );
  });

  it("orchestrates human-demand turns as in-chat handling, not fake handoff", async () => {
    const llmService: any = {
      processDialogTurn: jest.fn().mockResolvedValue({
        response: {
          actionType: ActionType.ASK_CLARIFYING_QUESTION,
          reply_ar: "أيوة معاك، احكيلي اللي حصل بالظبط؟",
          reasoning: "mock",
        },
        tokensUsed: 5,
        llmUsed: true,
        action: ActionType.ASK_CLARIFYING_QUESTION,
        reply: "أيوة معاك، احكيلي اللي حصل بالظبط؟",
        cartItems: [],
      }),
    };
    const playbookService: any = {
      getForMerchant: jest.fn().mockResolvedValue({
        slotGraph: [],
        constraintDims: [],
        nextQuestionTemplates: {},
        intentExamples: {},
        slotExtractors: {},
        version: 1,
      }),
    };
    const pool: any = { query: jest.fn() };
    const orchestrator = new DialogOrchestrator(
      llmService,
      playbookService,
      pool,
    );

    const result = await orchestrator.processTurn(
      {
        merchant,
        conversation: { context: {} },
        catalogItems: [],
        recentMessages: [],
        customerMessage: "عندي شكوى وعايز أكلم مسؤول بشري حالاً",
      } as any,
      { model: "gpt-4o-mini" },
      { channel: "whatsapp" },
    );

    expect(result.replyText).not.toMatch(/هحوّ?لك|هيتواصل|زميل|مسؤول\s+هيرد/);
    expect(llmService.processDialogTurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        intent: "venting",
        forbiddenClaims: expect.arrayContaining([
          "do not invent a human transfer",
        ]),
      }),
      expect.anything(),
    );
  });

  it("orchestrates infeasible turns with constraint-only question intent", async () => {
    const llmService: any = {
      processDialogTurn: jest.fn().mockResolvedValue({
        response: {
          actionType: ActionType.CREATE_ORDER,
          reply_ar:
            "فيه قيود محتاجة تتظبط: الميعاد، المقاس، ووضوح الصورة. تحب نعدّل أنهي واحد؟",
          reasoning: "mock_order_overreach",
        },
        tokensUsed: 7,
        llmUsed: true,
        action: ActionType.CREATE_ORDER,
        reply:
          "فيه قيود محتاجة تتظبط: الميعاد، المقاس، ووضوح الصورة. تحب نعدّل أنهي واحد؟",
        cartItems: [{ name: "لوحة كبيرة", quantity: 1 }],
      }),
    };
    const playbookService: any = {
      getForMerchant: jest.fn().mockResolvedValue({
        slotGraph: [{ key: "occasion" }],
        constraintDims: [],
        nextQuestionTemplates: { occasion: "اسأل عن المناسبة" },
        intentExamples: {},
        slotExtractors: {},
        version: 1,
      }),
    };
    const orchestrator = new DialogOrchestrator(
      llmService,
      playbookService,
      { query: jest.fn() } as any,
    );

    const result = await orchestrator.processTurn(
      {
        merchant,
        conversation: { context: {} },
        catalogItems: [],
        recentMessages: [],
        customerMessage:
          "عايز لوحة فوتوريالية 200x300 تتسلم بعد ساعتين من صورة مش واضحة جداً",
      } as any,
      { model: "gpt-4o-mini" },
      { channel: "whatsapp" },
    );

    expect(result.llmResult.action).toBe(ActionType.ASK_CLARIFYING_QUESTION);
    expect(llmService.processDialogTurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        intent: "infeasible_request",
        constraintAxes: expect.arrayContaining([
          "الميعاد",
          "المقاس",
          "وضوح الصورة الأصلية",
        ]),
        slotPlan: expect.objectContaining({ nextSlot: null }),
      }),
      expect.anything(),
    );
  });
});
