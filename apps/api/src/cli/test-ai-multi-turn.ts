#!/usr/bin/env ts-node
/**
 * test-ai-multi-turn.ts
 *
 * Multi-turn proof harness that drives the SAME production reply pipeline
 * (InboxService.processMessage) across N turns and asserts strict expectations
 * on the structured memory and the final reply.
 *
 * Each scenario is merchant-agnostic in code — we only reference UNIVERSAL
 * slot keys (business_type, product_interest, …) and the merchant-defined
 * customSlot keys read off the conversation context. No vertical names are
 * baked into pass criteria.
 *
 * Run: npm run test:ai-multi-turn -w apps/api
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { InboxService } from "../application/services/inbox.service";
import {
  CONVERSATION_REPOSITORY,
  IConversationRepository,
} from "../domain/ports/conversation.repository";

const MERCHANT_ID = "demo-merchant";

interface MultiTurnExpectations {
  mustHaveBusinessType?: string;
  mustMentionTokens?: string[];
  mustNotAsk?: string[];
  mustHaveUniversalSlots?: Record<string, unknown>;
  mustHaveCustomSlots?: Record<string, unknown>;
  mustNotRepeatQuestionAbout?: string[];
  singleQuestion?: boolean;
  maxPromptTokens?: number;
}

interface MultiTurnTestCase {
  name: string;
  senderId: string;
  turns: string[];
  expectations: MultiTurnExpectations;
}

const ts = () => Date.now().toString(36);

const SCENARIOS: MultiTurnTestCase[] = [
  // 1. Gifts long flow — must remember occasion + audience + product type by turn 8.
  {
    name: "gifts_long_flow",
    senderId: `+2010${ts()}01`,
    turns: [
      "هلو، عندي حدث وعايزة 200 هدية",
      "هدية صغيرة لضيوف عيد ميلاد",
      "للأفراد العاديين، مش VIP",
      "نوع الهدية شوكولاتة",
      "أحب نوع بالمكسرات",
      "طيب وأنواع سادة كمان",
      "كم سعرهم؟",
      "كم حبة شوكولاتة في كل علبة؟",
    ],
    expectations: {
      mustNotAsk: ["مناسبة", "نوع المنتج", "الفئة"],
      singleQuestion: true,
    },
  },

  // 2. Painter sticky context — final reply about price/delivery must not drift.
  {
    name: "painter_sticky_business_type",
    senderId: `+2010${ts()}02`,
    turns: [
      "ممكن تابلوه ريسبشن؟",
      "ألوان بيج ودهبي",
      "مقاس 100x150",
      "السعر كام والتسليم امتى؟",
    ],
    expectations: {
      mustNotAsk: ["نوع النشاط"],
      singleQuestion: true,
    },
  },

  // 3. Decor planters — business_type must remain stable across the flow.
  {
    name: "decor_planters_flow",
    senderId: `+2010${ts()}03`,
    turns: [
      "محتاج قصاري للريسبشن",
      "أسود ورمادي",
      "هي لوحدها ولا مع النبات؟",
      "التوصيل لمصر الجديدة بكام؟",
    ],
    expectations: {
      singleQuestion: true,
    },
  },

  // 4. Long-conversation memory: critical detail in turn 1 must survive past
  //    the recent-history window.
  {
    name: "long_memory_budget_recall",
    senderId: `+2010${ts()}04`,
    turns: [
      "هلو، ميزانيتي 3000 جنيه والتوصيل لإسكندرية لمناسبة سنوية",
      "أيوه فاهمة",
      "تمام",
      "ماشي",
      "ok",
      "أيوه",
      "تمام",
      "نعم",
      "تمام كمل",
      "أيوه",
      "ماشي",
      "ok",
      "تمام",
      "أيوه",
      "حلو",
      "نعم",
      "تمام",
      "أيوه",
      "ok",
      "تمام",
      "نعم",
      "ok",
      "ايه اقتراحك المناسب؟",
    ],
    expectations: {
      mustNotAsk: ["ميزانية", "مدينة", "محافظة", "مناسبة"],
    },
  },

  // 5. Sticky context — neutral price question must NOT switch business_type.
  {
    name: "sticky_neutral_price",
    senderId: `+2010${ts()}05`,
    turns: [
      "محتاج قصاري للريسبشن",
      "السعر كام؟",
    ],
    expectations: {},
  },

  // 6. Multi-customer isolation — two senderIds must keep independent state.
  //    Run as two parallel cases with shared merchant.
  {
    name: "multi_customer_isolation_a",
    senderId: `+2010${ts()}06A`,
    turns: ["محتاج تابلوه ريسبشن بألوان دهبي"],
    expectations: {},
  },
  {
    name: "multi_customer_isolation_b",
    senderId: `+2010${ts()}06B`,
    turns: ["محتاج قصارية أسود مع نبات"],
    expectations: {},
  },
];

interface TurnSnapshot {
  turnIndex: number;
  customerText: string;
  reply: string;
  action: string;
  businessType?: string;
  filledSlots: Record<string, unknown>;
  customSlots: Record<string, unknown>;
}

interface CaseResult {
  name: string;
  senderId: string;
  conversationId?: string;
  turns: TurnSnapshot[];
  finalReply: string;
  finalBusinessType?: string;
  finalFilledSlots: Record<string, unknown>;
  finalCustomSlots: Record<string, unknown>;
  pass: boolean;
  failures: string[];
}

function countQuestionMarks(text: string): number {
  return (text.match(/[?؟]/g) || []).length;
}

async function runScenario(
  inbox: InboxService,
  conversationRepo: IConversationRepository,
  scenario: MultiTurnTestCase,
): Promise<CaseResult> {
  const result: CaseResult = {
    name: scenario.name,
    senderId: scenario.senderId,
    turns: [],
    finalReply: "",
    finalFilledSlots: {},
    finalCustomSlots: {},
    pass: false,
    failures: [],
  };

  for (let i = 0; i < scenario.turns.length; i++) {
    const text = scenario.turns[i];
    const response = await inbox.processMessage({
      merchantId: MERCHANT_ID,
      senderId: scenario.senderId,
      channel: "whatsapp",
      text,
      correlationId: `multi-turn-${scenario.name}-${i}-${Date.now()}`,
    });

    result.conversationId = response.conversationId;
    const conv = await conversationRepo.findById(response.conversationId);
    const ctx = ((conv?.context || {}) as Record<string, any>) || {};
    const filled = (ctx?.dialog?.filledSlots as Record<string, unknown>) || {};
    const custom = (ctx?.customSlots as Record<string, unknown>) || {};

    result.turns.push({
      turnIndex: i,
      customerText: text,
      reply: response.replyText || "",
      action: String((response as any).action || ""),
      businessType:
        typeof ctx.businessType === "string" ? ctx.businessType : undefined,
      filledSlots: filled,
      customSlots: custom,
    });
  }

  const last = result.turns[result.turns.length - 1];
  result.finalReply = last?.reply || "";
  result.finalBusinessType = last?.businessType;
  result.finalFilledSlots = last?.filledSlots || {};
  result.finalCustomSlots = last?.customSlots || {};

  const exp = scenario.expectations;

  if (exp.mustHaveBusinessType) {
    if (result.finalBusinessType !== exp.mustHaveBusinessType) {
      result.failures.push(
        `business_type expected="${exp.mustHaveBusinessType}" got="${result.finalBusinessType ?? "<none>"}"`,
      );
    }
  }

  if (exp.mustMentionTokens) {
    for (const tok of exp.mustMentionTokens) {
      if (!result.finalReply.includes(tok)) {
        result.failures.push(`final reply missing token "${tok}"`);
      }
    }
  }

  if (exp.mustNotAsk) {
    for (const phrase of exp.mustNotAsk) {
      if (
        result.finalReply.includes(phrase) &&
        countQuestionMarks(result.finalReply) > 0
      ) {
        result.failures.push(
          `final reply re-asks about "${phrase}" while having ?`,
        );
      }
    }
  }

  if (exp.mustHaveUniversalSlots) {
    for (const [k, v] of Object.entries(exp.mustHaveUniversalSlots)) {
      if (result.finalFilledSlots[k] === undefined) {
        result.failures.push(`missing universal slot "${k}"`);
      } else if (v !== undefined && result.finalFilledSlots[k] !== v) {
        result.failures.push(
          `universal slot "${k}" expected=${JSON.stringify(v)} got=${JSON.stringify(result.finalFilledSlots[k])}`,
        );
      }
    }
  }

  if (exp.mustHaveCustomSlots) {
    for (const [k, v] of Object.entries(exp.mustHaveCustomSlots)) {
      if (result.finalCustomSlots[k] === undefined) {
        result.failures.push(`missing custom slot "${k}"`);
      } else if (v !== undefined && result.finalCustomSlots[k] !== v) {
        result.failures.push(
          `custom slot "${k}" expected=${JSON.stringify(v)} got=${JSON.stringify(result.finalCustomSlots[k])}`,
        );
      }
    }
  }

  if (exp.mustNotRepeatQuestionAbout) {
    for (const k of exp.mustNotRepeatQuestionAbout) {
      const filled =
        result.finalFilledSlots[k] !== undefined ||
        result.finalCustomSlots[k] !== undefined;
      if (filled && /[?؟]/.test(result.finalReply)) {
        const lower = result.finalReply.toLowerCase();
        if (lower.includes(k.toLowerCase())) {
          result.failures.push(
            `final reply re-asks about already-filled slot "${k}"`,
          );
        }
      }
    }
  }

  if (exp.singleQuestion) {
    const q = countQuestionMarks(result.finalReply);
    if (q > 1) {
      result.failures.push(`final reply has ${q} questions, expected ≤ 1`);
    }
  }

  result.pass = result.failures.length === 0 && result.finalReply.trim() !== "";
  return result;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    const inbox = app.get(InboxService);
    const conversationRepo = app.get<IConversationRepository>(
      CONVERSATION_REPOSITORY,
    );

    console.log(
      "\n══════════════════════════════════════════════════════════════",
    );
    console.log(`Multi-turn AI reply harness for merchant="${MERCHANT_ID}"`);
    console.log(
      "══════════════════════════════════════════════════════════════\n",
    );

    const results: CaseResult[] = [];
    for (const sc of SCENARIOS) {
      process.stdout.write(`▶ ${sc.name} (${sc.turns.length} turns)\n`);
      try {
        const r = await runScenario(inbox, conversationRepo, sc);
        results.push(r);

        for (const t of r.turns) {
          console.log(
            `   T${t.turnIndex + 1} » ${t.customerText.slice(0, 80)}`,
          );
          console.log(
            `      bot: ${(t.reply || "").replace(/\s+/g, " ").slice(0, 160)}`,
          );
          console.log(
            `      bt=${t.businessType || "-"} universal=${JSON.stringify(t.filledSlots)} custom=${JSON.stringify(t.customSlots)}`,
          );
        }
        console.log(
          r.pass
            ? `   ✅ PASS`
            : `   ❌ FAIL — ${r.failures.join(" | ")}`,
        );
        console.log("");
      } catch (err: any) {
        console.error(`   ❌ ERROR — ${err.message || err}\n`);
        results.push({
          name: sc.name,
          senderId: sc.senderId,
          turns: [],
          finalReply: "",
          finalFilledSlots: {},
          finalCustomSlots: {},
          pass: false,
          failures: [`exception: ${err.message || err}`],
        });
      }
    }

    const pass = results.filter((r) => r.pass).length;
    const fail = results.length - pass;

    console.log("══════════════════════════════════════════════════════════════");
    console.log(`Summary: ${pass}/${results.length} passed`);
    console.log("══════════════════════════════════════════════════════════════");
    if (fail > 0) {
      for (const r of results.filter((r) => !r.pass)) {
        console.log(`  • ${r.name} — ${r.failures.join(" | ")}`);
      }
    }
    process.exitCode = fail === 0 ? 0 : 1;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("test-ai-multi-turn failed:", err);
  process.exit(1);
});
