import { Injectable, Optional } from "@nestjs/common";
import { CopilotIntent, PendingAction } from "./copilot-schema";
import { PlannerContextAssemblerService } from "./planner-context-assembler.service";
import {
  ActionPreconditionResult,
  CopilotActionRegistryService,
} from "./copilot-action-registry.service";
import {
  PlannerContextContract,
  PlannerExecutionDecision,
} from "./planner-context.contract";
import { ControlPlaneGovernanceService } from "./control-plane-governance.service";

type PlannerTriggerType = "EVENT" | "SCHEDULED" | "ON_DEMAND" | "ESCALATION";

const DETERMINISTIC_BOUNDARY_INTENTS = new Set<CopilotIntent>([
  "ADD_EXPENSE",
  "UPDATE_STOCK",
  "CREATE_PAYMENT_LINK",
  "APPROVE_PAYMENT_PROOF",
  "CLOSE_MONTH",
  "IMPORT_SUPPLIER_CSV",
]);

@Injectable()
export class PlannerOrchestrationService {
  constructor(
    private readonly plannerContextAssembler: PlannerContextAssemblerService,
    private readonly actionRegistry: CopilotActionRegistryService,
    @Optional()
    private readonly controlPlaneGovernance?: ControlPlaneGovernanceService,
  ) {}

  async evaluatePendingAction(
    merchantId: string,
    pendingAction: PendingAction,
  ): Promise<PlannerExecutionDecision> {
    const { context, fallbackApplied: contextFallbackApplied } =
      await this.resolvePlannerContext(merchantId);
    const { preconditions, fallbackApplied: preconditionFallbackApplied } =
      await this.resolvePreconditions(merchantId, pendingAction);

    const reasons = [...preconditions.failures];
    const advisories = [...preconditions.advisories];
    const actionDefinition = preconditions.action;
    const triggerType = this.mapSourceToTriggerType(pendingAction.source);
    const triggerKey = pendingAction.intent;

    if (contextFallbackApplied) {
      advisories.push(
        "Planner context degraded; deterministic fallback snapshot was used",
      );
    }

    if (preconditionFallbackApplied) {
      advisories.push(
        "Planner preconditions degraded; deterministic fallback checks were used",
      );
    }

    if (this.isAlwaysOnLoopSource(pendingAction.source)) {
      reasons.push(
        "Continuous loop trigger sources are blocked; use event, scheduled, on-demand, or escalation execution",
      );
    }

    if (this.isDeterministicBoundaryIntent(pendingAction.intent)) {
      this.applyDeterministicBoundaryTriggerGuard(
        pendingAction.intent,
        triggerType,
        reasons,
      );
    }

    if (
      contextFallbackApplied &&
      this.isDeterministicBoundaryIntent(pendingAction.intent)
    ) {
      reasons.push(
        "Deterministic source snapshots are unavailable for this boundary action; execution is deferred",
      );
    }

    if (preconditionFallbackApplied && actionDefinition.destructive) {
      reasons.push(
        "Deterministic fallback blocked destructive action because precondition checks are unavailable",
      );
    }

    let governanceFallbackApplied = false;

    if (this.controlPlaneGovernance) {
      try {
        const budgetGate = await this.controlPlaneGovernance.checkTriggerBudget(
          {
            merchantId,
            triggerType,
            triggerKey,
            requestedAiCalls: 1,
            requestedTokens: 0,
          },
        );

        if (!budgetGate.allowed) {
          reasons.push(
            budgetGate.reason ||
              "Planner trigger budget denied execution for this action",
          );
        }
      } catch {
        governanceFallbackApplied = true;
        advisories.push(
          "Planner governance budget check unavailable; deterministic fallback policy applied",
        );
      }
    }

    if (governanceFallbackApplied && actionDefinition.destructive) {
      reasons.push(
        "Deterministic fallback blocked destructive action because governance budget state is unavailable",
      );
    }

    if (
      actionDefinition.riskTier === "critical" &&
      context.operational.pendingApprovals >= 5
    ) {
      reasons.push(
        "Critical action blocked because approval backlog is above safety threshold",
      );
    }

    if (
      pendingAction.intent === "CLOSE_MONTH" &&
      context.pos.openRegisters > 0
    ) {
      reasons.push(
        "Cannot close month while POS register sessions are still open",
      );
    }

    if (
      pendingAction.intent === "CREATE_ORDER" &&
      context.pos.openRegisters === 0
    ) {
      advisories.push(
        "No open register session detected; order execution should be reconciled manually",
      );
    }

    if (
      pendingAction.intent === "UPDATE_STOCK" &&
      context.forecast.riskSignals.highUrgencyReplenishments > 0
    ) {
      advisories.push(
        "Forecast reports urgent replenishment demand; review stock action against forecast recommendations",
      );
    }

    const decision: PlannerExecutionDecision = {
      allowed: reasons.length === 0,
      escalationRequired:
        actionDefinition.compensation.requiresManagerReview ||
        actionDefinition.riskTier === "critical" ||
        triggerType === "ESCALATION",
      reasons,
      advisories,
      contextDigest: {
        generatedAt: context.generatedAt,
        pendingApprovals: context.operational.pendingApprovals,
        openRegisters: context.pos.openRegisters,
        forecastRiskSignals: {
          lowConfidencePredictions:
            context.forecast.riskSignals.lowConfidencePredictions,
          staleRuns: context.forecast.riskSignals.staleRuns,
          highUrgencyReplenishments:
            context.forecast.riskSignals.highUrgencyReplenishments,
        },
      },
    };

    if (this.controlPlaneGovernance) {
      try {
        await this.controlPlaneGovernance.recordPlannerRun({
          merchantId,
          triggerType,
          triggerKey,
          requestedBy: undefined,
          runStatus: decision.allowed ? "COMPLETED" : "SKIPPED",
          reason: decision.allowed
            ? "Planner evaluation completed"
            : decision.reasons.join(" | "),
          contextDigest: decision.contextDigest,
          costAiCalls: 0,
          costTokens: 0,
        });
      } catch {
        // Non-blocking: planner guard logic remains deterministic even if ledger storage is unavailable.
      }
    }

    return decision;
  }

  async evaluateCommand(
    merchantId: string,
    command: PendingAction["command"],
    source: PendingAction["source"] = "portal",
  ): Promise<PlannerExecutionDecision> {
    const now = Date.now();
    return this.evaluatePendingAction(merchantId, {
      id: `command-${command.intent}-${now}`,
      merchantId,
      intent: command.intent,
      command,
      createdAt: new Date(now),
      expiresAt: new Date(now + 5 * 60 * 1000),
      status: "pending",
      source,
    });
  }

  private mapSourceToTriggerType(
    source: PendingAction["source"],
  ): PlannerTriggerType {
    const normalized = String(source || "").toLowerCase();
    if (
      normalized.includes("schedule") ||
      normalized.includes("cron") ||
      normalized.includes("timer")
    ) {
      return "SCHEDULED";
    }
    if (
      normalized.includes("event") ||
      normalized.includes("webhook") ||
      normalized.includes("signal")
    ) {
      return "EVENT";
    }
    if (normalized.includes("escalation")) {
      return "ESCALATION";
    }
    return "ON_DEMAND";
  }

  private async resolvePlannerContext(merchantId: string): Promise<{
    context: PlannerContextContract;
    fallbackApplied: boolean;
  }> {
    try {
      return {
        context: await this.plannerContextAssembler.assemble(merchantId),
        fallbackApplied: false,
      };
    } catch {
      return {
        context: {
          merchantId,
          generatedAt: new Date().toISOString(),
          operational: {
            todayOrders: 0,
            todayRevenue: 0,
            openConversations: 0,
            pendingApprovals: 0,
          },
          pos: {
            openRegisters: 0,
            activeDrafts: 0,
            todayCashierOrders: 0,
            todayCashierRevenue: 0,
            openRegistersByBranch: [],
            activeDraftsByBranch: [],
          },
          forecast: {
            enabled: false,
            latestRuns: [],
            riskSignals: {
              lowConfidencePredictions: 0,
              staleRuns: 0,
              highUrgencyReplenishments: 0,
            },
          },
          actionRegistry: this.actionRegistry.listDefinitions(),
        },
        fallbackApplied: true,
      };
    }
  }

  private async resolvePreconditions(
    merchantId: string,
    pendingAction: PendingAction,
  ): Promise<{
    preconditions: ActionPreconditionResult;
    fallbackApplied: boolean;
  }> {
    try {
      return {
        preconditions: await this.actionRegistry.evaluatePreconditions(
          merchantId,
          pendingAction.command,
        ),
        fallbackApplied: false,
      };
    } catch {
      const fallbackAction = this.actionRegistry.getDefinition(
        pendingAction.intent,
      );
      return {
        preconditions: {
          ok: true,
          failures: [],
          advisories: [
            "Precondition engine unavailable; fallback policy constrained evaluation to deterministic checks",
          ],
          action: fallbackAction,
        },
        fallbackApplied: true,
      };
    }
  }

  private isAlwaysOnLoopSource(source: PendingAction["source"]): boolean {
    const normalized = String(source || "").toLowerCase();
    if (!normalized) {
      return false;
    }

    return ["loop", "always", "daemon", "poll", "watch", "heartbeat"].some(
      (fragment) => normalized.includes(fragment),
    );
  }

  private isDeterministicBoundaryIntent(
    intent: PendingAction["intent"],
  ): boolean {
    return DETERMINISTIC_BOUNDARY_INTENTS.has(intent as CopilotIntent);
  }

  private applyDeterministicBoundaryTriggerGuard(
    intent: PendingAction["intent"],
    triggerType: PlannerTriggerType,
    reasons: string[],
  ): void {
    if (triggerType === "ON_DEMAND" || triggerType === "ESCALATION") {
      return;
    }

    reasons.push(
      `Deterministic boundary action ${intent} requires on-demand or escalation trigger, received ${triggerType}`,
    );
  }
}
