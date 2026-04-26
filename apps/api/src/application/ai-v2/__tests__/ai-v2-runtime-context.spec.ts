import { RuntimeContextBuilderV2 } from "../runtime-context-builder";
import { ConversationStateLoaderV2 } from "../conversation-state-loader";
import {
  fixtureCatalog,
  fixtureConversation,
  fixtureMerchant,
  fixtureRecentMessages,
} from "../local-test-fixtures";
import { SalesStateReducerV2 } from "../sales-state-reducer";
import { SalesPolicyV2 } from "../sales-policy";
import { EmotionPolicyV2 } from "../emotion-policy";
import { ConfigService } from "@nestjs/config";
import { MessageUnderstandingV2Service } from "../message-understanding";
import type { RagContextV2 } from "../ai-v2.types";

describe("AI v2 RuntimeContextV2", () => {
  it("includes last20Messages, olderSummary, aiV2 state, merchantFacts, and RAG facts", async () => {
    process.env.AI_V2_LOCAL_TEST_MODE = "true";
    delete process.env.OPENAI_API_KEY;

    const merchant = fixtureMerchant({
      withPhone: true,
      withAddress: true,
      withWorkingHours: true,
    });
    (merchant as any).knowledgeBase = {
      businessInfo: {
        policies: {
          paymentMethods: ["Cash"],
          returnPolicy: "Return within 7 days",
          deliveryInfo: "Delivery within 48h",
        },
      },
    };
    const conversation = fixtureConversation({
      olderSummary: "older summary here",
    });
    const recentMessages = fixtureRecentMessages(
      Array.from({ length: 22 }).map((_, i) => ({
        role: i % 2 === 0 ? ("customer" as const) : ("assistant" as const),
        text: `t${i + 1}`,
      })),
    );
    const loaded = ConversationStateLoaderV2.load({
      conversation,
      recentMessages,
      customerMessage: "latest",
      channel: "whatsapp",
    });

    const u = await new MessageUnderstandingV2Service(
      new ConfigService({ AI_V2_LOCAL_TEST_MODE: "true" } as any),
    ).analyze("latest");
    const decision = SalesPolicyV2.decide({ loaded, understanding: u });
    const emotion = EmotionPolicyV2.decide({
      understanding: u,
      stage: decision.stage,
    });
    const state = SalesStateReducerV2.reduce({
      loaded,
      understanding: u,
      nextBestAction: decision.nextBestAction,
      stage: decision.stage,
      customerEmotion: emotion.customerEmotion,
    });

    const rag: RagContextV2 = {
      catalogFacts: fixtureCatalog()
        .slice(0, 2)
        .map((c: any, idx) => ({
          catalogItemId: c.id,
          name: c.nameAr,
          description: undefined,
          price: idx === 0 ? 100 : undefined,
          availability: "available",
          customerFacingName: c.nameAr,
          customerFacingDescription: undefined,
          customerFacingPrice: idx === 0 ? 100 : undefined,
          customerFacingAvailability: "available",
          customerVisibleSku: false,
          sourceLabel: undefined,
          isFixture: false,
          confidence: 0.8,
          source: "catalog",
        })),
      kbFacts: [
        {
          chunkId: "kb1",
          text: "public kb",
          visibility: "public",
          confidence: 0.8,
          source: "kb" as const,
        },
      ],
      offerFacts: [],
      businessRuleFacts: [],
      unavailableFacts: [],
      confidence: 0.6,
    };

    const ctx = RuntimeContextBuilderV2.build({
      merchant: merchant as any,
      loaded,
      salesState: state,
      rag,
    });
    expect(ctx.currentCustomerMessage).toBe("latest");
    expect(ctx.last20Messages.length).toBe(20);
    expect(ctx.olderSummary).toBe("older summary here");
    expect(ctx.aiV2State.engineVersion).toBe(2);
    expect(Array.isArray(ctx.merchantFacts)).toBe(true);
    expect(ctx.merchantFacts.some((f) => f.type === "merchant_name")).toBe(
      true,
    );
    expect(ctx.merchantFacts.some((f) => f.type === "phone")).toBe(true);
    expect(ctx.merchantFacts.some((f) => f.type === "address")).toBe(true);
    expect(ctx.merchantFacts.some((f) => f.type === "working_hours")).toBe(
      true,
    );
    expect(ctx.merchantFacts.some((f) => f.type === "payment_method")).toBe(
      true,
    );
    expect(ctx.merchantFacts.some((f) => f.type === "return_rule")).toBe(true);
    expect(ctx.merchantFacts.some((f) => f.type === "delivery_rule")).toBe(
      true,
    );

    expect(ctx.ragFacts.catalogFacts.length).toBeGreaterThan(0);
    expect(ctx.customerSafeFacts.catalogFacts[0].name).toBe("منتج عام A");
    expect(ctx.ragFacts.kbFacts.length).toBeGreaterThan(0);
    expect(ctx.taskRules.doNotInventFacts).toBe(true);
  });
});
