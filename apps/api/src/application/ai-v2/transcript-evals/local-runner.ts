import { ConfigService } from "@nestjs/config";
import { AiV2Service } from "../ai-v2.service";
import { MessageUnderstandingV2Service } from "../message-understanding";
import { RagContextBuilderServiceV2 } from "../rag-context-builder.service";
import { ReplyRendererServiceV2 } from "../reply-renderer.service";
import { ToolRegistryV2 } from "../tool-registry";
import { ActionExecutorV2 } from "../action-executor";
import scenarios from "./scenarios.json";
import {
  fixtureCatalog,
  fixtureConversation,
  fixtureMerchant,
  fixtureRecentMessages,
} from "../local-test-fixtures";
import type { TranscriptScenarioJson } from "./runner";
import type { Merchant } from "../../../domain/entities/merchant.entity";
import type { Conversation } from "../../../domain/entities/conversation.entity";
import type { Message } from "../../../domain/entities/message.entity";

export interface LocalTranscriptRunResult {
  scenarioId: string;
  pass: boolean;
  failures: string[];
  finalReply: string;
  validationFailures: string[];
  llmUsed: boolean;
}

/**
 * Local runner (no Meta, no DB). Intended for:
 * - `AI_V2_LOCAL_TEST_MODE=true` (required)
 * - deterministic mock path when OPENAI_API_KEY is missing
 * - optional real LLM path when OPENAI_API_KEY is present
 */
export async function runAiV2LocalTranscriptEvals(opts?: {
  withPhone?: boolean;
  withAddress?: boolean;
  withWorkingHours?: boolean;
}): Promise<LocalTranscriptRunResult[]> {
  const config = new ConfigService(process.env as any);
  const localMode = String(
    process.env.AI_V2_LOCAL_TEST_MODE || "",
  ).toLowerCase();
  if (localMode !== "true") {
    throw new Error(
      "AI_V2_LOCAL_TEST_MODE must be true to run local transcript evals",
    );
  }

  const baseMerchant = fixtureMerchant({
    withPhone: opts?.withPhone ?? true,
    withAddress: opts?.withAddress ?? true,
    withWorkingHours: opts?.withWorkingHours ?? true,
  });
  const catalogItems = fixtureCatalog();

  const understanding = new MessageUnderstandingV2Service(config);
  const ragBuilder = new RagContextBuilderServiceV2({
    async hasStructuredKb() {
      return false;
    },
    async searchChunks() {
      return [];
    },
  } as any);
  const renderer = new ReplyRendererServiceV2(config);
  const toolRegistry = new ToolRegistryV2();
  const actionExecutor = new ActionExecutorV2(toolRegistry);
  const ai = new AiV2Service(
    understanding,
    ragBuilder,
    renderer,
    actionExecutor,
    config,
  );

  const list = (scenarios as unknown as TranscriptScenarioJson[]) || [];
  const results: LocalTranscriptRunResult[] = [];

  for (const scenario of list) {
    const merchant = scenario.id.includes("phone_missing")
      ? fixtureMerchant({
          withPhone: false,
          withAddress: true,
          withWorkingHours: true,
        })
      : scenario.id.includes("address_missing")
        ? fixtureMerchant({
            withPhone: true,
            withAddress: false,
            withWorkingHours: true,
          })
        : baseMerchant;
    const conversation = fixtureConversation({
      olderSummary: "Older summary is available for memory tests.",
    });
    const turns =
      Array.isArray(scenario.turns) && scenario.turns.length > 0
        ? scenario.turns.map((t) => t.customer)
        : scenario.customerMessage
          ? [scenario.customerMessage]
          : [];

    const run = await runScenario({
      merchant,
      conversation,
      catalogItems,
      initialRecentMessages: [],
      turns,
      ai,
    });

    const failures: string[] = [];
    if (scenario.expect?.stage && run.detectedStage !== scenario.expect.stage) {
      failures.push(
        `stage_want_${scenario.expect.stage}_got_${run.detectedStage}`,
      );
    }
    for (const f of run.validationFailures) {
      if (f === "off_topic_general_redirect_required") continue;
      failures.push(`validator:${f}`);
    }
    failures.push(...assertScenarioBehavior(scenario, run));

    results.push({
      scenarioId: scenario.id,
      pass: failures.length === 0,
      failures,
      finalReply: run.finalReply,
      validationFailures: run.validationFailures,
      llmUsed: run.llmUsed,
    });
  }

  return results;
}

async function runScenario(input: {
  merchant: Merchant;
  conversation: Conversation;
  catalogItems: any[];
  initialRecentMessages: Message[];
  turns: string[];
  ai: AiV2Service;
}): Promise<{
  finalReply: string;
  detectedStage: string;
  validationFailures: string[];
  llmUsed: boolean;
  finalState: any;
}> {
  let recentMessages: Message[] = [...input.initialRecentMessages];
  let finalReply = "";
  let detectedStage = "greeting";
  let validationFailures: string[] = [];
  let llmUsed = false;
  let finalState: any = null;

  for (const customerMessage of input.turns) {
    const res = await input.ai.run({
      merchant: input.merchant,
      conversation: input.conversation,
      recentMessages,
      catalogItems: input.catalogItems,
      customerMessage,
      channel: "whatsapp",
      llmOptions: { model: "gpt-4o-mini", maxTokens: 380 },
    });

    // Apply state persistence patch
    (input.conversation.context as any) = {
      ...(input.conversation.context || {}),
      ...(res.contextPatch || {}),
    };

    finalReply = res.replyText;
    validationFailures = res.debug.validationFailures || [];
    llmUsed = res.llmUsed;
    finalState = (input.conversation.context as any)?.aiV2 || null;
    detectedStage =
      finalState?.salesStage || finalState?.stage || detectedStage;

    // Append messages for next turn memory (verbatim)
    const now = new Date();
    recentMessages = recentMessages.concat(
      fixtureRecentMessages([
        { role: "customer", text: customerMessage },
        { role: "assistant", text: finalReply },
      ]).map((m) => ({ ...m, createdAt: now, updatedAt: now }) as any),
    );
  }

  return { finalReply, detectedStage, validationFailures, llmUsed, finalState };
}

function assertScenarioBehavior(
  scenario: TranscriptScenarioJson,
  run: {
    finalReply: string;
    validationFailures: string[];
    finalState: any;
  },
): string[] {
  const failures: string[] = [];
  const reply = run.finalReply || "";
  if ((reply.match(/[؟?]/g) || []).length > 1) {
    failures.push("reply_more_than_one_question");
  }
  if (
    /order\s+(created|confirmed|completed)|تم\s+(إنشاء|تأكيد)|payment\s+(verified|confirmed)|الدفع\s+اتأكد/i.test(
      reply,
    )
  ) {
    failures.push("fake_tool_completion_claim");
  }
  if (
    /\[internal\]|staff_only|INTERNAL_ONLY|private_only|fixture|test\s+data|source\s*:|AI_V2_LOCAL_TEST_MODE|local\s+mode|demo\s+mode|cat:[A-Za-z0-9:_-]+|mf:phone|BAG-001|PERF-RED-22/i.test(
      reply,
    )
  ) {
    failures.push("internal_kb_leakage");
  }
  if (
    scenario.id.includes("off_topic") &&
    /ماتش|javascript|python|سياسة|رياضة/i.test(reply)
  ) {
    failures.push("off_topic_factual_answer");
  }
  if (
    scenario.id.includes("phone_missing") &&
    /\+?\d[\d\s\-()]{6,}\d/.test(reply)
  ) {
    failures.push("invented_phone");
  }
  if (
    scenario.id.includes("address_missing") &&
    !/غير متاح|مش متاح|not available/i.test(reply)
  ) {
    failures.push("invented_address_or_missing_unavailable_message");
  }
  if (
    scenario.id === "support_mid_order_preserve_draft" &&
    !run.finalState?.orderDraft
  ) {
    failures.push("orderDraft_reset_on_support");
  }
  if (scenario.id === "complaint_mid_order_preserve_draft") {
    if (!run.finalState?.orderDraft)
      failures.push("orderDraft_reset_on_complaint");
    if (!run.finalState?.complaintState)
      failures.push("complaintState_not_persisted");
  }
  if (
    scenario.id === "repeated_greeting_does_not_reset" &&
    /^أهلاً|^اهلا|^مرحبا/i.test(reply)
  ) {
    failures.push("repeated_greeting");
  }
  if (scenario.id === "order_quantity_200_progression") {
    if (run.finalState?.orderDraft?.quantity !== 200) {
      failures.push("orderDraft_quantity_not_200");
    }
    if (run.finalState?.activeQuestion?.kind === "quantity") {
      failures.push("quantity_question_repeated");
    }
    if (/الكمية المطلوبة كام|كام\s+(?:قطعة|واحدة)|كم\s+عدد/u.test(reply)) {
      failures.push("reply_repeated_quantity_question");
    }
  }
  return failures;
}

// CLI entrypoint for `npm run test:ai-v2-local`
if (require.main === module) {
  runAiV2LocalTranscriptEvals()
    .then((results) => {
      const failed = results.filter((r) => !r.pass);
      // Keep output compact and deterministic for CI logs
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            total: results.length,
            passed: results.length - failed.length,
            failed: failed.length,
            failures: failed.map((f) => ({
              scenarioId: f.scenarioId,
              failures: f.failures,
            })),
          },
          null,
          2,
        ),
      );
      if (failed.length > 0) process.exitCode = 1;
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(String(err?.stack || err?.message || err));
      process.exitCode = 1;
    });
}
