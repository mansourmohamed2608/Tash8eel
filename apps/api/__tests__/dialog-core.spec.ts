import { DeEscalator } from "../de-escalator";
import { ConstraintNegotiator } from "../constraint-negotiator";
import { ReplyComposer } from "../reply-composer";
import { SlotPlan } from "../slot-plan";
import { IntentClassifier } from "../intent-classifier";
import { MediaComposer } from "../media-composer";

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

  it("keeps one question and strips system wording", () => {
    const reply = ReplyComposer.polish(
      "أنا AI. بكل سرور، أقدر أساعدك. تحب مقاس إيه؟ وميزانيتك كام؟",
    );
    expect(reply).not.toMatch(/AI|بكل سرور/);
    expect((reply.match(/[؟?]/g) || []).length).toBeLessThanOrEqual(1);
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
});
