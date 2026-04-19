export interface SlotGraphNode {
  key: string;
  required?: boolean;
  when?: Record<string, unknown>;
}

export interface SlotPlanInput {
  slotGraph?: SlotGraphNode[];
  filledSlots?: Record<string, unknown>;
  lastAskedFor?: string | null;
}

export interface SlotPlanResult {
  nextSlot: string | null;
  whyThisSlot: string;
  promptSeed?: string;
}

export class SlotPlan {
  static chooseNext(input: SlotPlanInput): SlotPlanResult {
    const graph = Array.isArray(input.slotGraph) ? input.slotGraph : [];
    const filled = input.filledSlots || {};

    for (const node of graph) {
      if (!node?.key) continue;
      if (this.isFilled(filled[node.key])) continue;
      if (!this.conditionMatches(node.when, filled)) continue;
      return {
        nextSlot: node.key,
        whyThisSlot:
          input.lastAskedFor === node.key
            ? "waiting_for_previous_slot_answer"
            : "first_missing_required_slot",
        promptSeed: node.key,
      };
    }

    return {
      nextSlot: null,
      whyThisSlot: "all_configured_slots_filled_or_no_playbook",
    };
  }

  private static isFilled(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  private static conditionMatches(
    condition: Record<string, unknown> | undefined,
    filled: Record<string, unknown>,
  ): boolean {
    if (!condition || Object.keys(condition).length === 0) return true;
    return Object.entries(condition).every(([key, expected]) => {
      if (Array.isArray(expected)) return expected.includes(filled[key]);
      return filled[key] === expected;
    });
  }
}
