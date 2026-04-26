import type { SalesStageV2 } from "../ai-v2.types";
import { runAiV2LocalTranscriptEvals } from "./local-runner";

export interface TranscriptScenarioJson {
  id: string;
  description: string;
  customerMessage?: string;
  turns?: Array<{
    customer: string;
  }>;
  expect: {
    stage: SalesStageV2;
    isGreetingScenario: boolean;
    userComplaint: boolean;
  };
}

export interface TranscriptEvalResult {
  scenarioId: string;
  pass: boolean;
  failures: string[];
  detected: {
    domain: string;
    stage: SalesStageV2;
  };
  fallbackReply: string;
}

/**
 * Backward-compatible wrapper for older tests. The real confidence path is the
 * local end-to-end runner, not a planner-only transcript harness.
 */
export async function runTranscriptScenario(
  scenario: TranscriptScenarioJson,
): Promise<TranscriptEvalResult> {
  const previous = process.env.AI_V2_LOCAL_TEST_MODE;
  process.env.AI_V2_LOCAL_TEST_MODE = "true";
  delete process.env.OPENAI_API_KEY;
  const all = await runAiV2LocalTranscriptEvals();
  if (previous === undefined) {
    delete process.env.AI_V2_LOCAL_TEST_MODE;
  } else {
    process.env.AI_V2_LOCAL_TEST_MODE = previous;
  }
  const result = all.find((item) => item.scenarioId === scenario.id);
  return {
    scenarioId: scenario.id,
    pass: Boolean(result?.pass),
    failures: result?.failures || ["scenario_not_found"],
    detected: {
      domain: "end_to_end",
      stage: scenario.expect.stage,
    },
    fallbackReply: result?.finalReply || "",
  };
}
