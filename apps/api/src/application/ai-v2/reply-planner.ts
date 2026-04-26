import { createHash } from "crypto";
import {
  RagContextV2,
  ReplyPlanV2,
  NextBestActionV2,
  SalesStageV2,
} from "./ai-v2.types";
import { EmotionPolicyOutputV2 } from "./ai-v2.types";
import { HumanOperatorPolicyOutputV2 } from "./ai-v2.types";

/**
 * Combines policies into a reply plan and allowed fact ids for the renderer.
 */
export class ReplyPlannerV2 {
  static plan(input: {
    nextBestAction: NextBestActionV2;
    stage: SalesStageV2;
    operator: HumanOperatorPolicyOutputV2;
    emotion: EmotionPolicyOutputV2;
    rag: RagContextV2;
  }): ReplyPlanV2 {
    const allowedFactIds: string[] = [];
    for (const c of input.rag.catalogFacts) {
      allowedFactIds.push(`cat:${c.catalogItemId}`);
    }
    for (const k of input.rag.kbFacts) {
      allowedFactIds.push(`kb:${k.chunkId}`);
    }

    const recHash = recommendationHashFromCatalog(input.rag);

    const plannerNotes = [
      `stage=${input.stage}`,
      `nba=${input.nextBestAction.type}`,
      `mode=${input.operator.mode}`,
      `emotion=${input.emotion.customerEmotion}`,
      input.emotion.sellingSuppressed ? "selling_suppressed" : "selling_ok",
    ].join("; ");

    return {
      nextBestAction: input.nextBestAction,
      operator: input.operator,
      emotion: input.emotion,
      allowedFactIds,
      plannerNotes: `${plannerNotes}; recHash=${recHash || "none"}`,
    };
  }
}

export function recommendationHashFromCatalog(rag: RagContextV2): string {
  const top = rag.catalogFacts
    .slice(0, 5)
    .map((c) => c.catalogItemId)
    .join("|");
  if (!top) return "";
  return createHash("sha256").update(top).digest("hex").slice(0, 16);
}
