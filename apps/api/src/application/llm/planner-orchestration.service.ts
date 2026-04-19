import { Injectable, Optional } from "@nestjs/common";
import { PendingAction } from "./copilot-schema";
import { PlannerContextAssemblerService } from "./planner-context-assembler.service";
import { CopilotActionRegistryService } from "./copilot-action-registry.service";
import { PlannerExecutionDecision } from "./planner-context.contract";
import { ControlPlaneGovernanceService } from "./control-plane-governance.service";

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
    const context = await this.plannerContextAssembler.assemble(merchantId);
    const preconditions = await this.actionRegistry.evaluatePreconditions(
      merchantId,
      pendingAction.command,
    );

    const reasons = [...preconditions.failures];
    const advisories = [...preconditions.advisories];
    const actionDefinition = preconditions.action;
    const triggerType = this.mapSourceToTriggerType(pendingAction.source);
    const triggerKey = pendingAction.intent;

    if (this.controlPlaneGovernance) {
      const budgetGate = await this.controlPlaneGovernance.checkTriggerBudget({
        merchantId,
        triggerType,
        triggerKey,
        requestedAiCalls: 1,
        requestedTokens: 0,
      });

      if (!budgetGate.allowed) {
        reasons.push(
          budgetGate.reason ||
            "Planner trigger budget denied execution for this action",
        );
      }
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
        actionDefinition.riskTier === "critical",
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
  ): "EVENT" | "SCHEDULED" | "ON_DEMAND" | "ESCALATION" {
    const normalized = String(source || "").toLowerCase();
    if (normalized.includes("schedule") || normalized.includes("cron")) {
      return "SCHEDULED";
    }
    if (normalized.includes("event") || normalized.includes("webhook")) {
      return "EVENT";
    }
    if (normalized.includes("escalation")) {
      return "ESCALATION";
    }
    return "ON_DEMAND";
  }
}
