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
import { ReplyPlannerV2 } from "../reply-planner";
import type { TranscriptScenarioJson } from "../transcript-evals/runner";
import { runTranscriptScenario } from "../transcript-evals/runner";
import type {
  AiSalesState,
  RagContextV2,
  ReplyPlanV2,
  NextBestActionV2,
} from "../ai-v2.types";
import { ConversationStateLoaderV2 } from "../conversation-state-loader";

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

  it("runs transcript scenarios (planner + deterministic fallback)", () => {
    for (const s of scenarios) {
      const r = runTranscriptScenario(s);
      expect(r.pass).toBe(true);
    }
  });

  it("shouldUseAiReplyEngineV2 respects env and merchant override", () => {
    const merchant = {
      id: "m1",
      config: {},
    } as unknown as Merchant;
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

  it("SalesStateReducerV2 bumps dialogTurnSeq", () => {
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
    const u = new MessageUnderstandingV2Service().analyze("hello");
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
    const state = baseState("support");
    const plan = basePlan();
    const rag: RagContextV2 = {
      catalogFacts: [],
      kbFacts: [],
      offerFacts: [],
      businessRuleFacts: [],
      unavailableFacts: [],
      confidence: 0.5,
    };
    const bad = {
      customer_reply: "سؤال؟ وسؤال تاني؟",
      state_patch: {},
      used_fact_ids: [],
      risk_flags: [],
      confidence: 0.5,
    };
    const v = ReplyValidatorV2.validate({
      render: bad,
      plan,
      state,
      rag,
      allowedFactIds: [],
    });
    expect(v.failures.some((f) => f.includes("question"))).toBe(true);
    expect((v.replyText.match(/[؟?]/g) || []).length).toBeLessThanOrEqual(1);
  });
});

function baseState(stage: AiSalesState["stage"]): AiSalesState {
  return {
    engineVersion: 2,
    dialogTurnSeq: 1,
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
  const nba: NextBestActionV2 = { type: "answer_question", reason: "test" };
  return ReplyPlannerV2.plan({
    nextBestAction: nba,
    stage: "support",
    operator: {
      mode: "helpful_answer",
      toneDialect: "egyptian",
      warmth: 0.7,
      emojiBudget: 1,
    },
    emotion: {
      customerEmotion: "neutral",
      empathyFirst: false,
      sellingSuppressed: false,
      toneNotes: [],
    },
    rag: {
      catalogFacts: [],
      kbFacts: [],
      offerFacts: [],
      businessRuleFacts: [],
      unavailableFacts: [],
      confidence: 0.5,
    },
  });
}
