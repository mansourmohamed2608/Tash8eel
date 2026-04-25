#!/usr/bin/env ts-node
/**
 * test-ai-reply.ts
 *
 * End-to-end proof harness for the demo-merchant AI reply path.
 *
 * For each of the three business verticals (painter, gifts, decor), this
 * script sends the user-specified test messages through the SAME production
 * reply pipeline used by /v1/inbox/message and prints, per case:
 *
 *   - the customer message
 *   - KbRetrievalService.searchChunks() snapshot
 *     (count, titles, source_types)
 *   - InboxService.processMessage() full result
 *     (reply text, action, media attachments, routing, model used)
 *   - PASS / FAIL verdict
 *
 * Pass criteria per case:
 *   - non-empty replyText
 *   - replyText is grounded: at least one KB chunk retrieved (the retrieval
 *     service is also what the production path uses; if it returns 0 rows
 *     for a message a real human would use, our KB is not being used)
 *
 * Run: npm run test:ai-reply -w apps/api
 */

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { InboxService } from "../application/services/inbox.service";
import { KbRetrievalService } from "../application/llm/kb-retrieval.service";

const MERCHANT_ID = "demo-merchant";

interface TestCase {
  vertical: "painter_wall_art" | "gifts_chocolate_perfume" | "decor_planters";
  label: string;
  senderId: string;
  text: string;
}

const TEST_CASES: TestCase[] = [
  // ── Painter ───────────────────────────────────────────────────────────────
  {
    vertical: "painter_wall_art",
    label: "painter: reference image request",
    senderId: "+201000000001",
    text: "ممكن تعملي تابلوه زي الصورة دي؟",
  },
  {
    vertical: "painter_wall_art",
    label: "painter: price for 100x150 with colors",
    senderId: "+201000000001",
    text: "عايزاه 100x150 وفيه ألوان بيج ودهبي",
  },
  {
    vertical: "painter_wall_art",
    label: "painter: wall photo scenario",
    senderId: "+201000000002",
    text: "ينفع أبعتلك صورة الحيطة وتشوفي المقاس المناسب؟",
  },
  {
    vertical: "painter_wall_art",
    label: "painter: delivery and deposit",
    senderId: "+201000000002",
    text: "السعر كام والتسليم امتى؟",
  },

  // ── Gifts ─────────────────────────────────────────────────────────────────
  {
    vertical: "gifts_chocolate_perfume",
    label: "gifts: perfume giveaway prices (English)",
    senderId: "+201000000003",
    text: "Can you please let me know prices for perfumes giveaways?",
  },
  {
    vertical: "gifts_chocolate_perfume",
    label: "gifts: quantity around 200",
    senderId: "+201000000003",
    text: "Around 200",
  },
  {
    vertical: "gifts_chocolate_perfume",
    label: "gifts: chocolate plain vs nuts",
    senderId: "+201000000004",
    text: "عايزة شوكليت ساده ولا بندق؟",
  },
  {
    vertical: "gifts_chocolate_perfume",
    label: "gifts: reference screenshot",
    senderId: "+201000000004",
    text: "ممكن أبعتلك screenshot؟",
  },

  // ── Decor / planters ──────────────────────────────────────────────────────
  {
    vertical: "decor_planters",
    label: "decor: price / availability",
    senderId: "+201000000005",
    text: "السعر كام؟",
  },
  {
    vertical: "decor_planters",
    label: "decor: same shape in black",
    senderId: "+201000000005",
    text: "عايز نفس الشكل ده بس لون اسود",
  },
  {
    vertical: "decor_planters",
    label: "decor: pot with plant?",
    senderId: "+201000000006",
    text: "هوا ده بوت بس ولا مع النبات؟",
  },
  {
    vertical: "decor_planters",
    label: "decor: delivery to Masr El-Gedida",
    senderId: "+201000000006",
    text: "التوصيل لمصر الجديدة بكام؟",
  },
  {
    vertical: "decor_planters",
    label: "decor: wall/space photo intent",
    senderId: "+201000000007",
    text: "ممكن ابعتلك صورة المكان وتقوليلي يناسبه ايه؟",
  },
];

function truncate(s: string, n: number): string {
  if (!s) return "(empty)";
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= n ? flat : flat.slice(0, n) + "…";
}

interface CaseResult {
  label: string;
  vertical: string;
  message: string;
  kbChunksRetrieved: number;
  kbTitles: string[];
  replyText: string;
  action: string;
  mediaAttachments: number;
  modelUsed?: string;
  pass: boolean;
  failReason?: string;
}

async function runCase(
  inbox: InboxService,
  kbSvc: KbRetrievalService,
  testCase: TestCase,
): Promise<CaseResult> {
  // 1. Diagnostic: KB retrieval snapshot (same service the prod path uses)
  const kbChunks = await kbSvc.searchChunks(MERCHANT_ID, testCase.text, {
    limit: 8,
  });

  // 2. Real production path
  const response = await inbox.processMessage({
    merchantId: MERCHANT_ID,
    senderId: testCase.senderId,
    channel: "whatsapp",
    text: testCase.text,
    correlationId: `test-ai-reply-${Date.now()}`,
  });

  const replyText = String(response.replyText || "");
  const nonEmpty = replyText.trim().length > 0;
  const grounded = kbChunks.length > 0;

  const pass = nonEmpty && grounded;
  let failReason: string | undefined;
  if (!nonEmpty) failReason = "empty replyText";
  else if (!grounded)
    failReason =
      "KbRetrievalService returned 0 chunks (KB likely empty or not embedded)";

  return {
    label: testCase.label,
    vertical: testCase.vertical,
    message: testCase.text,
    kbChunksRetrieved: kbChunks.length,
    kbTitles: kbChunks.map((c) => `[${c.sourceType}] ${c.title}`),
    replyText,
    action: String((response as any).action || ""),
    mediaAttachments: response.mediaAttachments?.length ?? 0,
    modelUsed: response.modelUsed,
    pass,
    failReason,
  };
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });

  try {
    const inbox = app.get(InboxService);
    const kbSvc = app.get(KbRetrievalService);

    console.log("\n════════════════════════════════════════════════════════");
    console.log(`AI reply proof for merchant="${MERCHANT_ID}"`);
    console.log(`Using InboxService.processMessage() — production path`);
    console.log("════════════════════════════════════════════════════════\n");

    const results: CaseResult[] = [];
    for (const tc of TEST_CASES) {
      process.stdout.write(
        `▶ [${tc.vertical}] ${tc.label}\n   customer: ${tc.text}\n`,
      );
      try {
        const r = await runCase(inbox, kbSvc, tc);
        results.push(r);

        console.log(
          `   KB retrieved (${r.kbChunksRetrieved}): ${r.kbTitles.slice(0, 4).join(" | ") || "(none)"}`,
        );
        console.log(
          `   action=${r.action || "-"}, media=${r.mediaAttachments}, model=${r.modelUsed || "-"}`,
        );
        console.log(`   reply: ${truncate(r.replyText, 300)}`);
        console.log(
          r.pass ? `   ✅ PASS` : `   ❌ FAIL — ${r.failReason ?? "unknown"}`,
        );
        console.log("");
      } catch (err: any) {
        console.error(`   ❌ ERROR — ${err.message || err}\n`);
        results.push({
          label: tc.label,
          vertical: tc.vertical,
          message: tc.text,
          kbChunksRetrieved: 0,
          kbTitles: [],
          replyText: "",
          action: "",
          mediaAttachments: 0,
          pass: false,
          failReason: `exception: ${err.message || err}`,
        });
      }
    }

    // ── Summary ────────────────────────────────────────────────────────────
    const passCount = results.filter((r) => r.pass).length;
    const failCount = results.length - passCount;

    console.log("════════════════════════════════════════════════════════");
    console.log(`Summary: ${passCount}/${results.length} passed`);
    console.log("════════════════════════════════════════════════════════");

    const byVertical = new Map<string, { pass: number; fail: number }>();
    for (const r of results) {
      const row = byVertical.get(r.vertical) ?? { pass: 0, fail: 0 };
      if (r.pass) row.pass++;
      else row.fail++;
      byVertical.set(r.vertical, row);
    }
    for (const [v, row] of byVertical.entries()) {
      console.log(`  ${v}: ${row.pass} pass, ${row.fail} fail`);
    }

    if (failCount > 0) {
      console.log("\nFailed cases:");
      for (const r of results.filter((r) => !r.pass)) {
        console.log(`  • [${r.vertical}] ${r.label} — ${r.failReason}`);
      }
    }

    process.exitCode = failCount === 0 ? 0 : 1;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("test-ai-reply failed:", err);
  process.exit(1);
});
