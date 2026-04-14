"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { portalApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import {
  AlertOctagon,
  AlertTriangle,
  Clock3,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Zap,
} from "lucide-react";

type FeedSeverity = "high" | "medium" | "low";
type PlannerRunStatus = "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED";
type PlannerRunStatusFilter = "ALL" | PlannerRunStatus;
type PlannerTriggerType = "EVENT" | "SCHEDULED" | "ON_DEMAND" | "ESCALATION";
type PlannerTriggerTypeFilter = "ALL" | PlannerTriggerType;
type ExecutionRecommendedAction =
  | "MONITOR"
  | "REPLAY_RUN"
  | "REVIEW_PENDING_APPROVALS"
  | "ADJUST_TRIGGER_BUDGET"
  | "RETRY_CONNECTOR_DLQ"
  | "EXECUTE_DELIVERY_ESCALATIONS";
type DeliveryBreachRemediationState =
  | "PENDING_ACK"
  | "ACKNOWLEDGED"
  | "ESCALATION_REQUIRED"
  | "RECOVERED";

type DeliveryBreachEscalationLevel = "L0" | "L1" | "L2" | "L3";

interface FeedItem {
  id: string;
  category: string;
  severity: FeedSeverity;
  title: string;
  message: string;
  referenceId: string;
  createdAt: string;
}

interface PlannerRun {
  id: string;
  trigger_type: string;
  trigger_key: string;
  run_status: PlannerRunStatus;
  reason: string | null;
  started_at: string;
}

interface DeliverySlaBreachRemediation {
  state: DeliveryBreachRemediationState;
  escalationLevel: DeliveryBreachEscalationLevel;
  escalationRequired: boolean;
  recommendedAction: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  alreadyEscalated: boolean;
}

interface DeliverySlaBreachItem {
  breachEventId: string;
  orderId: string;
  orderNumber: string;
  branchId: string | null;
  slaType: string;
  minutesDelta: number;
  reason: string | null;
  observedAt: string;
  remediation: DeliverySlaBreachRemediation;
}

interface CommandCenterOverview {
  planner: {
    totalRuns24h: number;
    failedRuns24h: number;
    skippedRuns24h: number;
  };
  approvals: {
    pending: number;
  };
  connectors: {
    runtimePending: number;
    dlqOpen: number;
  };
  delivery: {
    recentEvents24h: number;
  };
  policy: {
    simulations7d: number;
  };
}

interface RuntimeHealth {
  pendingQueue: number;
  retryQueue: number;
  dlqOpen: number;
  processingLagSeconds: number;
  oldestPendingAt: string | null;
}

interface ExecutionVisibilityItem {
  runId: string;
  runStatus: PlannerRunStatus;
  triggerType: PlannerTriggerType;
  triggerKey: string;
  startedAt: string;
  completedAt: string | null;
  reason: string | null;
  replaySafeNow: boolean;
  recommendedAction: ExecutionRecommendedAction;
  replayGate: {
    allowed: boolean;
    reason: string | null;
    gateType: string;
    usedAiCallsToday: number;
    usedTokensToday: number;
    budgetAiCallsDaily: number;
    budgetTokensDaily: number;
  };
  domainTruth: {
    pendingApprovalsForTrigger: number;
    pendingApprovalsGlobal: number;
    connectorDlqOpen: number;
    connectorRuntimePending: number;
    deliveryBreaches24h: number;
  };
  triage: {
    ackStatus: string;
    note: string;
    acknowledgedBy: string | null;
    acknowledgedAt: string | null;
    recommendedAction: string;
  } | null;
}

interface ExecutionVisibilitySnapshot {
  items: ExecutionVisibilityItem[];
  total: number;
  limit: number;
  offset: number;
  domainTruthSummary: {
    pendingApprovalsGlobal: number;
    connectorDlqOpen: number;
    connectorRuntimePending: number;
    deliveryBreaches24h: number;
  };
}

interface PlannerRunDrilldownSnapshot {
  run: {
    id: string;
    triggerType: PlannerTriggerType;
    triggerKey: string;
    requestedBy: string | null;
    runStatus: PlannerRunStatus;
    reason: string | null;
    contextDigest: Record<string, unknown>;
    costTokens: number;
    costAiCalls: number;
    correlationId: string | null;
    error: string | null;
    startedAt: string;
    completedAt: string | null;
    createdAt: string;
  };
  replaySafety: {
    replaySafeNow: boolean;
    gate: ExecutionVisibilityItem["replayGate"];
  };
  recommendedNextAction: ExecutionRecommendedAction;
  correlatedEvidence: {
    approvals: Array<{
      actionId: string;
      intent: string;
      source: string;
      status: string;
      actorRole: string | null;
      actorId: string | null;
      updatedAt: string;
      pendingAt: string | null;
      executedAt: string | null;
      deniedAt: string | null;
    }>;
    replayAttempts: Array<{
      id: string;
      runStatus: PlannerRunStatus;
      reason: string | null;
      startedAt: string;
      correlationId: string | null;
      replayOfRunId: string | null;
    }>;
    connectorRuntime: Array<{
      id: string;
      eventType: string;
      status: string;
      attemptCount: number;
      maxAttempts: number;
      lastError: string | null;
      nextRetryAt: string | null;
      updatedAt: string;
    }>;
    connectorDlq: Array<{
      id: string;
      eventType: string;
      status: string;
      lastError: string | null;
      movedToDlqAt: string;
      replayedAt: string | null;
      replayCount: number;
    }>;
    deliveryBreaches: Array<{
      id: string;
      orderId: string | null;
      orderNumber: string;
      slaType: string;
      status: string;
      observedAt: string;
      minutesDelta: number;
      reason: string | null;
    }>;
    replayConsumptions: Array<{
      id: string;
      sourceRunId: string;
      replayRunId: string | null;
      previewTokenHash: string;
      previewContextHash: string;
      operatorNote: string;
      consumedBy: string | null;
      consumedAt: string;
      createdAt: string;
      updatedAt: string;
    }>;
    triageAcks: Array<{
      id: string;
      runId: string;
      recommendedAction: string;
      ackStatus: string;
      ackNote: string;
      ackedBy: string | null;
      ackedAt: string;
      metadata: Record<string, unknown>;
      createdAt: string;
    }>;
  };
  stats: {
    pendingApprovals: number;
    replayAttempts: number;
    connectorRuntimeRows: number;
    connectorDlqOpen: number;
    deliveryActiveBreaches: number;
    replayTokenConsumptions: number;
    triageAcknowledgements: number;
  };
}

interface PlannerRunReplayPreviewSnapshot {
  sourceRun: {
    id: string;
    triggerType: PlannerTriggerType;
    triggerKey: string;
    runStatus: PlannerRunStatus;
    reason: string | null;
    startedAt: string;
    completedAt: string | null;
    createdAt: string;
  };
  confirmationRequired: boolean;
  allowedToReplayNow: boolean;
  predictedReplayRunStatus: PlannerRunStatus;
  budgetGate: ExecutionVisibilityItem["replayGate"];
  safetySummary: {
    pendingApprovalsForTrigger: number;
    replayAttemptsForSource: number;
    latestReplayAt: string | null;
    connectorDlqOpenForTrigger: number;
  };
  operatorNotePolicy: {
    required: boolean;
    minLength: number;
    maxLength: number;
  };
  binding: {
    previewToken: string | null;
    previewTokenExpiresAt: string | null;
    previewContextHash: string;
  };
  blockingReasons: string[];
  previewGeneratedAt: string;
}

interface PendingApprovalHandoffItem {
  actionId: string;
  intent: string;
  source: string;
  status: string;
  actorRole: string | null;
  actorId: string | null;
  previewSummary: string | null;
  riskTier: "low" | "medium" | "high" | "critical";
  updatedAt: string;
}

interface DrilldownTimelineEntry {
  id: string;
  category: "RUN" | "REPLAY" | "APPROVAL" | "CONNECTOR" | "DELIVERY" | "TRIAGE";
  title: string;
  detail: string;
  timestamp: string;
}

interface CommandCenterSnapshot {
  overview: CommandCenterOverview;
  feed: FeedItem[];
  runs: PlannerRun[];
  runtimeHealth: RuntimeHealth;
  breaches: DeliverySlaBreachItem[];
  executionVisibility: ExecutionVisibilitySnapshot;
}

const plannerRunStatuses: PlannerRunStatus[] = [
  "STARTED",
  "COMPLETED",
  "FAILED",
  "SKIPPED",
];
const plannerTriggerTypes: PlannerTriggerType[] = [
  "EVENT",
  "SCHEDULED",
  "ON_DEMAND",
  "ESCALATION",
];
const REPLAY_NOTE_MIN_LENGTH = 8;
const REPLAY_NOTE_MAX_LENGTH = 240;
const TRIAGE_NOTE_MIN_LENGTH = 8;
const TRIAGE_NOTE_MAX_LENGTH = 240;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const toSafeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toSafeString = (value: unknown, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
};

const toOptionalString = (value: unknown) => {
  const normalized = toSafeString(value, "");
  return normalized.length > 0 ? normalized : null;
};

const normalizeFeedSeverity = (value: unknown): FeedSeverity => {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "low";
};

const normalizePlannerRunStatus = (value: unknown): PlannerRunStatus => {
  if (
    value === "STARTED" ||
    value === "COMPLETED" ||
    value === "FAILED" ||
    value === "SKIPPED"
  ) {
    return value;
  }
  return "FAILED";
};

const normalizePlannerTriggerType = (value: unknown): PlannerTriggerType => {
  if (
    value === "EVENT" ||
    value === "SCHEDULED" ||
    value === "ON_DEMAND" ||
    value === "ESCALATION"
  ) {
    return value;
  }
  return "ON_DEMAND";
};

const normalizeExecutionRecommendedAction = (
  value: unknown,
): ExecutionRecommendedAction => {
  if (
    value === "MONITOR" ||
    value === "REPLAY_RUN" ||
    value === "REVIEW_PENDING_APPROVALS" ||
    value === "ADJUST_TRIGGER_BUDGET" ||
    value === "RETRY_CONNECTOR_DLQ" ||
    value === "EXECUTE_DELIVERY_ESCALATIONS"
  ) {
    return value;
  }
  return "MONITOR";
};

const normalizeBreachRemediationState = (
  value: unknown,
): DeliveryBreachRemediationState => {
  if (
    value === "PENDING_ACK" ||
    value === "ACKNOWLEDGED" ||
    value === "ESCALATION_REQUIRED" ||
    value === "RECOVERED"
  ) {
    return value;
  }
  return "PENDING_ACK";
};

const normalizeBreachEscalationLevel = (
  value: unknown,
): DeliveryBreachEscalationLevel => {
  if (value === "L0" || value === "L1" || value === "L2" || value === "L3") {
    return value;
  }
  return "L0";
};

const parseRunStatusFilter = (value: string): PlannerRunStatusFilter => {
  if (value === "ALL") return "ALL";
  return plannerRunStatuses.includes(value as PlannerRunStatus)
    ? (value as PlannerRunStatus)
    : "ALL";
};

const parseTriggerTypeFilter = (value: string): PlannerTriggerTypeFilter => {
  if (value === "ALL") return "ALL";
  return plannerTriggerTypes.includes(value as PlannerTriggerType)
    ? (value as PlannerTriggerType)
    : "ALL";
};

const safeIsoDate = (value: unknown) => {
  const normalized = toSafeString(value, "");
  if (!normalized) return "";
  const epoch = new Date(normalized).getTime();
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : "";
};

function timeAgo(value?: string | null) {
  if (!value) return "-";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "-";
  const diffMs = Math.max(0, Date.now() - timestamp);
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

function formatLag(seconds?: number | null) {
  const safeSeconds = Math.max(0, toSafeNumber(seconds, 0));
  if (safeSeconds < 60) return `${safeSeconds}ث`;
  const minutes = Math.floor(safeSeconds / 60);
  if (minutes < 60) return `${minutes}د`;
  const hours = Math.floor(minutes / 60);
  return `${hours}س`;
}

function parseCommandCenterOverview(value: unknown): CommandCenterOverview {
  const source = asRecord(value);
  const planner = asRecord(source.planner);
  const approvals = asRecord(source.approvals);
  const connectors = asRecord(source.connectors);
  const delivery = asRecord(source.delivery);
  const policy = asRecord(source.policy);

  return {
    planner: {
      totalRuns24h: toSafeNumber(planner.totalRuns24h, 0),
      failedRuns24h: toSafeNumber(planner.failedRuns24h, 0),
      skippedRuns24h: toSafeNumber(planner.skippedRuns24h, 0),
    },
    approvals: {
      pending: toSafeNumber(approvals.pending, 0),
    },
    connectors: {
      runtimePending: toSafeNumber(connectors.runtimePending, 0),
      dlqOpen: toSafeNumber(connectors.dlqOpen, 0),
    },
    delivery: {
      recentEvents24h: toSafeNumber(delivery.recentEvents24h, 0),
    },
    policy: {
      simulations7d: toSafeNumber(policy.simulations7d, 0),
    },
  };
}

function parseRuntimeHealth(value: unknown): RuntimeHealth {
  const source = asRecord(value);
  return {
    pendingQueue: toSafeNumber(source.pendingQueue, 0),
    retryQueue: toSafeNumber(source.retryQueue, 0),
    dlqOpen: toSafeNumber(source.dlqOpen, 0),
    processingLagSeconds: toSafeNumber(source.processingLagSeconds, 0),
    oldestPendingAt: toOptionalString(source.oldestPendingAt),
  };
}

function parseFeedItems(value: unknown): FeedItem[] {
  const source = asRecord(value);
  const list = Array.isArray(source.items)
    ? source.items
    : Array.isArray(value)
      ? value
      : [];

  return list
    .map((entry, index) => {
      const row = asRecord(entry);
      const title = toSafeString(row.title, "تنبيه تشغيلي");
      const message = toSafeString(row.message, "لا يوجد وصف إضافي.");
      return {
        id: toSafeString(row.id, `feed-${index + 1}`),
        category: toSafeString(row.category, "unknown"),
        severity: normalizeFeedSeverity(row.severity),
        title,
        message,
        referenceId: toSafeString(row.referenceId, "-"),
        createdAt: safeIsoDate(row.createdAt),
      } as FeedItem;
    })
    .slice(0, 25);
}

function parsePlannerRuns(value: unknown): PlannerRun[] {
  const source = asRecord(value);
  const list = Array.isArray(source.runs)
    ? source.runs
    : Array.isArray(value)
      ? value
      : [];

  return list
    .map((entry, index) => {
      const row = asRecord(entry);
      return {
        id: toSafeString(row.id, `run-${index + 1}`),
        trigger_type: toSafeString(row.trigger_type, "UNKNOWN"),
        trigger_key: toSafeString(row.trigger_key, "-"),
        run_status: normalizePlannerRunStatus(row.run_status),
        reason: toOptionalString(row.reason),
        started_at: safeIsoDate(row.started_at),
      } as PlannerRun;
    })
    .slice(0, 20);
}

function parseDeliverySlaBreaches(value: unknown): DeliverySlaBreachItem[] {
  const source = asRecord(value);
  const list = Array.isArray(source.items)
    ? source.items
    : Array.isArray(value)
      ? value
      : [];

  return list
    .map((entry, index) => {
      const row = asRecord(entry);
      const remediation = asRecord(row.remediation);
      return {
        breachEventId: toSafeString(row.breachEventId, `breach-${index + 1}`),
        orderId: toSafeString(row.orderId, ""),
        orderNumber: toSafeString(row.orderNumber, "-"),
        branchId: toOptionalString(row.branchId),
        slaType: toSafeString(row.slaType, "unknown"),
        minutesDelta: toSafeNumber(row.minutesDelta, 0),
        reason: toOptionalString(row.reason),
        observedAt: safeIsoDate(row.observedAt),
        remediation: {
          state: normalizeBreachRemediationState(remediation.state),
          escalationLevel: normalizeBreachEscalationLevel(
            remediation.escalationLevel,
          ),
          escalationRequired: remediation.escalationRequired === true,
          recommendedAction: toSafeString(
            remediation.recommendedAction,
            "MONITOR",
          ),
          acknowledgedAt: toOptionalString(remediation.acknowledgedAt),
          acknowledgedBy: toOptionalString(remediation.acknowledgedBy),
          alreadyEscalated: remediation.alreadyEscalated === true,
        },
      } as DeliverySlaBreachItem;
    })
    .slice(0, 12);
}

function parseExecutionVisibility(value: unknown): ExecutionVisibilitySnapshot {
  const source = asRecord(value);
  const list = Array.isArray(source.items) ? source.items : [];
  const summary = asRecord(source.domainTruthSummary);

  const items = list
    .map((entry) => {
      const row = asRecord(entry);
      const replayGate = asRecord(row.replayGate);
      const domainTruth = asRecord(row.domainTruth);
      const triage = asRecord(row.triage);

      return {
        runId: toSafeString(row.runId, "-"),
        runStatus: normalizePlannerRunStatus(row.runStatus),
        triggerType: normalizePlannerTriggerType(row.triggerType),
        triggerKey: toSafeString(row.triggerKey, "-"),
        startedAt: safeIsoDate(row.startedAt),
        completedAt: toOptionalString(row.completedAt),
        reason: toOptionalString(row.reason),
        replaySafeNow: row.replaySafeNow === true,
        recommendedAction: normalizeExecutionRecommendedAction(
          row.recommendedAction,
        ),
        replayGate: {
          allowed: replayGate.allowed === true,
          reason: toOptionalString(replayGate.reason),
          gateType: toSafeString(replayGate.gateType, "enforced"),
          usedAiCallsToday: toSafeNumber(replayGate.usedAiCallsToday, 0),
          usedTokensToday: toSafeNumber(replayGate.usedTokensToday, 0),
          budgetAiCallsDaily: toSafeNumber(replayGate.budgetAiCallsDaily, 0),
          budgetTokensDaily: toSafeNumber(replayGate.budgetTokensDaily, 0),
        },
        domainTruth: {
          pendingApprovalsForTrigger: toSafeNumber(
            domainTruth.pendingApprovalsForTrigger,
            0,
          ),
          pendingApprovalsGlobal: toSafeNumber(
            domainTruth.pendingApprovalsGlobal,
            0,
          ),
          connectorDlqOpen: toSafeNumber(domainTruth.connectorDlqOpen, 0),
          connectorRuntimePending: toSafeNumber(
            domainTruth.connectorRuntimePending,
            0,
          ),
          deliveryBreaches24h: toSafeNumber(domainTruth.deliveryBreaches24h, 0),
        },
        triage: Object.keys(triage).length
          ? {
              ackStatus: toSafeString(triage.ackStatus, "acknowledged"),
              note: toSafeString(triage.note, ""),
              acknowledgedBy: toOptionalString(triage.acknowledgedBy),
              acknowledgedAt: toOptionalString(
                safeIsoDate(triage.acknowledgedAt),
              ),
              recommendedAction: toSafeString(
                triage.recommendedAction,
                "MONITOR",
              ),
            }
          : null,
      } as ExecutionVisibilityItem;
    })
    .slice(0, 20);

  return {
    items,
    total: toSafeNumber(source.total, items.length),
    limit: toSafeNumber(source.limit, 20),
    offset: toSafeNumber(source.offset, 0),
    domainTruthSummary: {
      pendingApprovalsGlobal: toSafeNumber(summary.pendingApprovalsGlobal, 0),
      connectorDlqOpen: toSafeNumber(summary.connectorDlqOpen, 0),
      connectorRuntimePending: toSafeNumber(summary.connectorRuntimePending, 0),
      deliveryBreaches24h: toSafeNumber(summary.deliveryBreaches24h, 0),
    },
  };
}

function parsePlannerRunDrilldown(
  value: unknown,
): PlannerRunDrilldownSnapshot | null {
  const source = asRecord(value);
  const run = asRecord(source.run);
  if (!Object.keys(run).length) {
    return null;
  }

  const replaySafety = asRecord(source.replaySafety);
  const gate = asRecord(replaySafety.gate);
  const evidence = asRecord(source.correlatedEvidence);
  const stats = asRecord(source.stats);

  const approvalsRaw = Array.isArray(evidence.approvals)
    ? evidence.approvals
    : [];
  const replayAttemptsRaw = Array.isArray(evidence.replayAttempts)
    ? evidence.replayAttempts
    : [];
  const connectorRuntimeRaw = Array.isArray(evidence.connectorRuntime)
    ? evidence.connectorRuntime
    : [];
  const connectorDlqRaw = Array.isArray(evidence.connectorDlq)
    ? evidence.connectorDlq
    : [];
  const deliveryBreachesRaw = Array.isArray(evidence.deliveryBreaches)
    ? evidence.deliveryBreaches
    : [];
  const replayConsumptionsRaw = Array.isArray(evidence.replayConsumptions)
    ? evidence.replayConsumptions
    : [];
  const triageAcksRaw = Array.isArray(evidence.triageAcks)
    ? evidence.triageAcks
    : [];

  return {
    run: {
      id: toSafeString(run.id, "-"),
      triggerType: normalizePlannerTriggerType(
        run.triggerType ?? run.trigger_type,
      ),
      triggerKey: toSafeString(run.triggerKey ?? run.trigger_key, "-"),
      requestedBy: toOptionalString(run.requestedBy ?? run.requested_by),
      runStatus: normalizePlannerRunStatus(run.runStatus ?? run.run_status),
      reason: toOptionalString(run.reason),
      contextDigest: asRecord(run.contextDigest ?? run.context_digest),
      costTokens: toSafeNumber(run.costTokens ?? run.cost_tokens, 0),
      costAiCalls: toSafeNumber(run.costAiCalls ?? run.cost_ai_calls, 0),
      correlationId: toOptionalString(run.correlationId ?? run.correlation_id),
      error: toOptionalString(run.error),
      startedAt: safeIsoDate(run.startedAt ?? run.started_at),
      completedAt: toOptionalString(run.completedAt ?? run.completed_at),
      createdAt: safeIsoDate(run.createdAt ?? run.created_at),
    },
    replaySafety: {
      replaySafeNow: replaySafety.replaySafeNow === true,
      gate: {
        allowed: gate.allowed === true,
        reason: toOptionalString(gate.reason),
        gateType: toSafeString(gate.gateType, "enforced"),
        usedAiCallsToday: toSafeNumber(gate.usedAiCallsToday, 0),
        usedTokensToday: toSafeNumber(gate.usedTokensToday, 0),
        budgetAiCallsDaily: toSafeNumber(gate.budgetAiCallsDaily, 0),
        budgetTokensDaily: toSafeNumber(gate.budgetTokensDaily, 0),
      },
    },
    recommendedNextAction: normalizeExecutionRecommendedAction(
      source.recommendedNextAction,
    ),
    correlatedEvidence: {
      approvals: approvalsRaw.map((entry) => {
        const row = asRecord(entry);
        return {
          actionId: toSafeString(row.actionId ?? row.action_id, "-"),
          intent: toSafeString(row.intent, "-"),
          source: toSafeString(row.source, "unknown"),
          status: toSafeString(row.status, "unknown"),
          actorRole: toOptionalString(row.actorRole ?? row.actor_role),
          actorId: toOptionalString(row.actorId ?? row.actor_id),
          updatedAt: safeIsoDate(row.updatedAt ?? row.updated_at),
          pendingAt: toOptionalString(row.pendingAt ?? row.pending_at),
          executedAt: toOptionalString(row.executedAt ?? row.executed_at),
          deniedAt: toOptionalString(row.deniedAt ?? row.denied_at),
        };
      }),
      replayAttempts: replayAttemptsRaw.map((entry) => {
        const row = asRecord(entry);
        return {
          id: toSafeString(row.id, "-"),
          runStatus: normalizePlannerRunStatus(row.runStatus ?? row.run_status),
          reason: toOptionalString(row.reason),
          startedAt: safeIsoDate(row.startedAt ?? row.started_at),
          correlationId: toOptionalString(
            row.correlationId ?? row.correlation_id,
          ),
          replayOfRunId: toOptionalString(
            row.replayOfRunId ?? row.replay_of_run_id,
          ),
        };
      }),
      connectorRuntime: connectorRuntimeRaw.map((entry) => {
        const row = asRecord(entry);
        return {
          id: toSafeString(row.id, "-"),
          eventType: toSafeString(row.eventType ?? row.event_type, "unknown"),
          status: toSafeString(row.status, "unknown"),
          attemptCount: toSafeNumber(row.attemptCount ?? row.attempt_count, 0),
          maxAttempts: toSafeNumber(row.maxAttempts ?? row.max_attempts, 0),
          lastError: toOptionalString(row.lastError ?? row.last_error),
          nextRetryAt: toOptionalString(row.nextRetryAt ?? row.next_retry_at),
          updatedAt: safeIsoDate(row.updatedAt ?? row.updated_at),
        };
      }),
      connectorDlq: connectorDlqRaw.map((entry) => {
        const row = asRecord(entry);
        return {
          id: toSafeString(row.id, "-"),
          eventType: toSafeString(row.eventType ?? row.event_type, "unknown"),
          status: toSafeString(row.status, "unknown"),
          lastError: toOptionalString(row.lastError ?? row.last_error),
          movedToDlqAt: safeIsoDate(row.movedToDlqAt ?? row.moved_to_dlq_at),
          replayedAt: toOptionalString(row.replayedAt ?? row.replayed_at),
          replayCount: toSafeNumber(row.replayCount ?? row.replay_count, 0),
        };
      }),
      deliveryBreaches: deliveryBreachesRaw.map((entry) => {
        const row = asRecord(entry);
        return {
          id: toSafeString(row.id, "-"),
          orderId: toOptionalString(row.orderId ?? row.order_id),
          orderNumber: toSafeString(row.orderNumber ?? row.order_number, "-"),
          slaType: toSafeString(row.slaType ?? row.sla_type, "unknown"),
          status: toSafeString(row.status, "unknown"),
          observedAt: safeIsoDate(row.observedAt ?? row.observed_at),
          minutesDelta: toSafeNumber(row.minutesDelta ?? row.minutes_delta, 0),
          reason: toOptionalString(row.reason),
        };
      }),
      replayConsumptions: replayConsumptionsRaw.map((entry) => {
        const row = asRecord(entry);
        return {
          id: toSafeString(row.id, "-"),
          sourceRunId: toSafeString(row.sourceRunId ?? row.source_run_id, "-"),
          replayRunId: toOptionalString(row.replayRunId ?? row.replay_run_id),
          previewTokenHash: toSafeString(
            row.previewTokenHash ?? row.preview_token_hash,
            "",
          ),
          previewContextHash: toSafeString(
            row.previewContextHash ?? row.preview_context_hash,
            "",
          ),
          operatorNote: toSafeString(row.operatorNote ?? row.operator_note, ""),
          consumedBy: toOptionalString(row.consumedBy ?? row.consumed_by),
          consumedAt: safeIsoDate(row.consumedAt ?? row.consumed_at),
          createdAt: safeIsoDate(row.createdAt ?? row.created_at),
          updatedAt: safeIsoDate(row.updatedAt ?? row.updated_at),
        };
      }),
      triageAcks: triageAcksRaw.map((entry) => {
        const row = asRecord(entry);
        return {
          id: toSafeString(row.id, "-"),
          runId: toSafeString(row.runId ?? row.run_id, "-"),
          recommendedAction: toSafeString(
            row.recommendedAction ?? row.recommended_action,
            "MONITOR",
          ),
          ackStatus: toSafeString(
            row.ackStatus ?? row.ack_status,
            "acknowledged",
          ),
          ackNote: toSafeString(row.ackNote ?? row.ack_note, ""),
          ackedBy: toOptionalString(row.ackedBy ?? row.acked_by),
          ackedAt: safeIsoDate(row.ackedAt ?? row.acked_at),
          metadata: asRecord(row.metadata),
          createdAt: safeIsoDate(row.createdAt ?? row.created_at),
        };
      }),
    },
    stats: {
      pendingApprovals: toSafeNumber(stats.pendingApprovals, 0),
      replayAttempts: toSafeNumber(stats.replayAttempts, 0),
      connectorRuntimeRows: toSafeNumber(stats.connectorRuntimeRows, 0),
      connectorDlqOpen: toSafeNumber(stats.connectorDlqOpen, 0),
      deliveryActiveBreaches: toSafeNumber(stats.deliveryActiveBreaches, 0),
      replayTokenConsumptions: toSafeNumber(stats.replayTokenConsumptions, 0),
      triageAcknowledgements: toSafeNumber(stats.triageAcknowledgements, 0),
    },
  };
}

function parsePlannerRunReplayPreview(
  value: unknown,
): PlannerRunReplayPreviewSnapshot | null {
  const source = asRecord(value);
  const run = asRecord(source.sourceRun);
  const budgetGate = asRecord(source.budgetGate);
  const safetySummary = asRecord(source.safetySummary);
  const operatorNotePolicy = asRecord(source.operatorNotePolicy);
  const binding = asRecord(source.binding);

  if (!Object.keys(run).length) {
    return null;
  }

  const blockingReasonsRaw = Array.isArray(source.blockingReasons)
    ? source.blockingReasons
    : [];

  return {
    sourceRun: {
      id: toSafeString(run.id, "-"),
      triggerType: normalizePlannerTriggerType(
        run.triggerType ?? run.trigger_type,
      ),
      triggerKey: toSafeString(run.triggerKey ?? run.trigger_key, "-"),
      runStatus: normalizePlannerRunStatus(run.runStatus ?? run.run_status),
      reason: toOptionalString(run.reason),
      startedAt: safeIsoDate(run.startedAt ?? run.started_at),
      completedAt: toOptionalString(run.completedAt ?? run.completed_at),
      createdAt: safeIsoDate(run.createdAt ?? run.created_at),
    },
    confirmationRequired: source.confirmationRequired !== false,
    allowedToReplayNow: source.allowedToReplayNow === true,
    predictedReplayRunStatus: normalizePlannerRunStatus(
      source.predictedReplayRunStatus,
    ),
    budgetGate: {
      allowed: budgetGate.allowed === true,
      reason: toOptionalString(budgetGate.reason),
      gateType: toSafeString(budgetGate.gateType, "enforced"),
      usedAiCallsToday: toSafeNumber(budgetGate.usedAiCallsToday, 0),
      usedTokensToday: toSafeNumber(budgetGate.usedTokensToday, 0),
      budgetAiCallsDaily: toSafeNumber(budgetGate.budgetAiCallsDaily, 0),
      budgetTokensDaily: toSafeNumber(budgetGate.budgetTokensDaily, 0),
    },
    safetySummary: {
      pendingApprovalsForTrigger: toSafeNumber(
        safetySummary.pendingApprovalsForTrigger,
        0,
      ),
      replayAttemptsForSource: toSafeNumber(
        safetySummary.replayAttemptsForSource,
        0,
      ),
      latestReplayAt: toOptionalString(safetySummary.latestReplayAt),
      connectorDlqOpenForTrigger: toSafeNumber(
        safetySummary.connectorDlqOpenForTrigger,
        0,
      ),
    },
    operatorNotePolicy: {
      required: operatorNotePolicy.required !== false,
      minLength: Math.max(
        REPLAY_NOTE_MIN_LENGTH,
        toSafeNumber(operatorNotePolicy.minLength, REPLAY_NOTE_MIN_LENGTH),
      ),
      maxLength: Math.max(
        REPLAY_NOTE_MAX_LENGTH,
        toSafeNumber(operatorNotePolicy.maxLength, REPLAY_NOTE_MAX_LENGTH),
      ),
    },
    binding: {
      previewToken: toOptionalString(binding.previewToken),
      previewTokenExpiresAt: toOptionalString(
        safeIsoDate(binding.previewTokenExpiresAt),
      ),
      previewContextHash: toSafeString(binding.previewContextHash, ""),
    },
    blockingReasons: blockingReasonsRaw
      .map((entry) => toSafeString(entry, ""))
      .filter((entry) => entry.length > 0),
    previewGeneratedAt: safeIsoDate(source.previewGeneratedAt),
  };
}

function parsePendingApprovalsHandoff(
  value: unknown,
): PendingApprovalHandoffItem[] {
  const source = asRecord(value);
  const approvals = Array.isArray(source.approvals) ? source.approvals : [];

  return approvals
    .map((entry, index) => {
      const row = asRecord(entry);
      const timeline = asRecord(row.timeline);
      const riskTier = toSafeString(row.riskTier, "low").toLowerCase();

      return {
        actionId: toSafeString(row.actionId, `approval-${index + 1}`),
        intent: toSafeString(row.intent, "UNKNOWN"),
        source: toSafeString(row.source, "unknown"),
        status: toSafeString(row.status, "unknown"),
        actorRole: toOptionalString(row.actorRole),
        actorId: toOptionalString(row.actorId),
        previewSummary: toOptionalString(row.previewSummary),
        riskTier:
          riskTier === "critical" ||
          riskTier === "high" ||
          riskTier === "medium" ||
          riskTier === "low"
            ? riskTier
            : "low",
        updatedAt: safeIsoDate(timeline.updatedAt),
      } as PendingApprovalHandoffItem;
    })
    .slice(0, 30);
}

function buildDrilldownTimeline(
  drilldown: PlannerRunDrilldownSnapshot | null,
): DrilldownTimelineEntry[] {
  if (!drilldown) return [];

  const entries: DrilldownTimelineEntry[] = [
    {
      id: `run-${drilldown.run.id}`,
      category: "RUN",
      title: `تشغيل ${drilldown.run.runStatus}`,
      detail: `${drilldown.run.triggerType} • ${drilldown.run.triggerKey}`,
      timestamp: drilldown.run.startedAt,
    },
  ];

  for (const row of drilldown.correlatedEvidence.replayAttempts) {
    entries.push({
      id: `replay-${row.id}`,
      category: "REPLAY",
      title: `محاولة replay ${row.runStatus}`,
      detail: row.reason || "بدون سبب مسجل",
      timestamp: row.startedAt,
    });
  }

  for (const row of drilldown.correlatedEvidence.replayConsumptions) {
    entries.push({
      id: `replay-consumed-${row.id}`,
      category: "REPLAY",
      title: "استهلاك replay preview token",
      detail: `${row.consumedBy || "operator"} • ${row.operatorNote}`,
      timestamp: row.consumedAt,
    });
  }

  for (const row of drilldown.correlatedEvidence.approvals) {
    entries.push({
      id: `approval-${row.actionId}`,
      category: "APPROVAL",
      title: `Approval ${row.status}`,
      detail: `${row.intent} • ${row.source}`,
      timestamp: row.updatedAt,
    });
  }

  for (const row of drilldown.correlatedEvidence.connectorRuntime) {
    entries.push({
      id: `runtime-${row.id}`,
      category: "CONNECTOR",
      title: `Connector runtime ${row.status}`,
      detail: `${row.eventType} • محاولات ${row.attemptCount}/${row.maxAttempts}`,
      timestamp: row.updatedAt,
    });
  }

  for (const row of drilldown.correlatedEvidence.connectorDlq) {
    entries.push({
      id: `dlq-${row.id}`,
      category: "CONNECTOR",
      title: `Connector DLQ ${row.status}`,
      detail: `${row.eventType} • ${row.lastError || "بدون خطأ مسجل"}`,
      timestamp: row.movedToDlqAt,
    });
  }

  for (const row of drilldown.correlatedEvidence.deliveryBreaches) {
    entries.push({
      id: `delivery-${row.id}`,
      category: "DELIVERY",
      title: `Delivery SLA ${row.status}`,
      detail: `${row.orderNumber} • ${row.slaType} • Δ ${row.minutesDelta} دقيقة`,
      timestamp: row.observedAt,
    });
  }

  for (const row of drilldown.correlatedEvidence.triageAcks) {
    entries.push({
      id: `triage-${row.id}`,
      category: "TRIAGE",
      title: `Triage ${row.ackStatus}`,
      detail: `${row.recommendedAction} • ${row.ackNote}`,
      timestamp: row.ackedAt,
    });
  }

  return entries
    .filter((entry) => Boolean(entry.timestamp))
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() -
        new Date(left.timestamp).getTime(),
    )
    .slice(0, 40);
}

export function sanitizeCommandCenterPayload(payload: {
  overviewResp: unknown;
  feedResp: unknown;
  runsResp: unknown;
  runtimeResp: unknown;
  breachesResp: unknown;
  executionResp?: unknown;
}): CommandCenterSnapshot {
  return {
    overview: parseCommandCenterOverview(payload.overviewResp),
    feed: parseFeedItems(payload.feedResp),
    runs: parsePlannerRuns(payload.runsResp),
    runtimeHealth: parseRuntimeHealth(payload.runtimeResp),
    breaches: parseDeliverySlaBreaches(payload.breachesResp),
    executionVisibility: parseExecutionVisibility(payload.executionResp),
  };
}

const severityBadgeClass: Record<FeedSeverity, string> = {
  high: "border-[color:rgba(239,68,68,0.35)] bg-[color:rgba(239,68,68,0.12)] text-red-700",
  medium:
    "border-[color:rgba(245,158,11,0.35)] bg-[color:rgba(245,158,11,0.12)] text-amber-700",
  low: "border-[color:rgba(59,130,246,0.32)] bg-[color:rgba(59,130,246,0.12)] text-blue-700",
};

const runStatusBadgeClass: Record<PlannerRunStatus, string> = {
  STARTED:
    "border-[color:rgba(59,130,246,0.32)] bg-[color:rgba(59,130,246,0.12)] text-blue-700",
  COMPLETED:
    "border-[color:rgba(34,197,94,0.32)] bg-[color:rgba(34,197,94,0.12)] text-emerald-700",
  FAILED:
    "border-[color:rgba(239,68,68,0.35)] bg-[color:rgba(239,68,68,0.12)] text-red-700",
  SKIPPED:
    "border-[color:rgba(245,158,11,0.35)] bg-[color:rgba(245,158,11,0.12)] text-amber-700",
};

const remediationBadgeClass: Record<DeliveryBreachRemediationState, string> = {
  PENDING_ACK:
    "border-[color:rgba(245,158,11,0.35)] bg-[color:rgba(245,158,11,0.12)] text-amber-700",
  ACKNOWLEDGED:
    "border-[color:rgba(59,130,246,0.32)] bg-[color:rgba(59,130,246,0.12)] text-blue-700",
  ESCALATION_REQUIRED:
    "border-[color:rgba(239,68,68,0.35)] bg-[color:rgba(239,68,68,0.12)] text-red-700",
  RECOVERED:
    "border-[color:rgba(34,197,94,0.32)] bg-[color:rgba(34,197,94,0.12)] text-emerald-700",
};

const executionActionLabel: Record<ExecutionRecommendedAction, string> = {
  MONITOR: "مراقبة",
  REPLAY_RUN: "إعادة تشغيل",
  REVIEW_PENDING_APPROVALS: "مراجعة الموافقات",
  ADJUST_TRIGGER_BUDGET: "ضبط الميزانية",
  RETRY_CONNECTOR_DLQ: "إعادة DLQ",
  EXECUTE_DELIVERY_ESCALATIONS: "تنفيذ التصعيدات",
};

const executionActionBadgeClass: Record<ExecutionRecommendedAction, string> = {
  MONITOR:
    "border-[color:rgba(59,130,246,0.32)] bg-[color:rgba(59,130,246,0.12)] text-blue-700",
  REPLAY_RUN:
    "border-[color:rgba(34,197,94,0.32)] bg-[color:rgba(34,197,94,0.12)] text-emerald-700",
  REVIEW_PENDING_APPROVALS:
    "border-[color:rgba(245,158,11,0.35)] bg-[color:rgba(245,158,11,0.12)] text-amber-700",
  ADJUST_TRIGGER_BUDGET:
    "border-[color:rgba(239,68,68,0.35)] bg-[color:rgba(239,68,68,0.12)] text-red-700",
  RETRY_CONNECTOR_DLQ:
    "border-[color:rgba(249,115,22,0.35)] bg-[color:rgba(249,115,22,0.12)] text-orange-700",
  EXECUTE_DELIVERY_ESCALATIONS:
    "border-[color:rgba(220,38,38,0.35)] bg-[color:rgba(220,38,38,0.12)] text-red-700",
};

export default function MerchantCommandCenterPage() {
  const { toast } = useToast();
  const [overview, setOverview] = useState<CommandCenterOverview | null>(null);
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth | null>(
    null,
  );
  const [executionVisibility, setExecutionVisibility] =
    useState<ExecutionVisibilitySnapshot | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [runs, setRuns] = useState<PlannerRun[]>([]);
  const [deliveryBreaches, setDeliveryBreaches] = useState<
    DeliverySlaBreachItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [replayingRunId, setReplayingRunId] = useState<string | null>(null);
  const [replayPreviewRunId, setReplayPreviewRunId] = useState<string | null>(
    null,
  );
  const [replayPreviewOpen, setReplayPreviewOpen] = useState(false);
  const [replayPreviewLoading, setReplayPreviewLoading] = useState(false);
  const [replayPreview, setReplayPreview] =
    useState<PlannerRunReplayPreviewSnapshot | null>(null);
  const [replayOperatorNoteDraft, setReplayOperatorNoteDraft] = useState("");
  const [approvalsHandoffOpen, setApprovalsHandoffOpen] = useState(false);
  const [approvalsHandoffLoading, setApprovalsHandoffLoading] = useState(false);
  const [approvalsHandoffIntent, setApprovalsHandoffIntent] = useState<
    string | null
  >(null);
  const [approvalsHandoffItems, setApprovalsHandoffItems] = useState<
    PendingApprovalHandoffItem[]
  >([]);
  const [drilldownRunId, setDrilldownRunId] = useState<string | null>(null);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldown, setDrilldown] =
    useState<PlannerRunDrilldownSnapshot | null>(null);
  const [triageAckNoteDraft, setTriageAckNoteDraft] = useState("");
  const [submittingTriageAckStatus, setSubmittingTriageAckStatus] = useState<
    "acknowledged" | "deferred" | null
  >(null);
  const [retryingDlq, setRetryingDlq] = useState(false);
  const [escalatingBreachId, setEscalatingBreachId] = useState<string | null>(
    null,
  );
  const [acknowledgingBreachId, setAcknowledgingBreachId] = useState<
    string | null
  >(null);
  const [escalatingOpenBreaches, setEscalatingOpenBreaches] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const [statusFilter, setStatusFilter] =
    useState<PlannerRunStatusFilter>("ALL");
  const [triggerTypeFilter, setTriggerTypeFilter] =
    useState<PlannerTriggerTypeFilter>("ALL");
  const [triggerKeyDraft, setTriggerKeyDraft] = useState("");
  const [triggerKeyFilter, setTriggerKeyFilter] = useState("");
  const drilldownTimeline = useMemo(
    () => buildDrilldownTimeline(drilldown),
    [drilldown],
  );

  const hasAnyData = Boolean(
    overview ||
    runtimeHealth ||
    feed.length ||
    runs.length ||
    deliveryBreaches.length ||
    (executionVisibility?.items.length || 0) > 0,
  );
  const hasActiveFilters =
    statusFilter !== "ALL" ||
    triggerTypeFilter !== "ALL" ||
    triggerKeyFilter.length > 0;

  const loadCommandCenter = useCallback(async () => {
    const isInitialLoad = !hasLoadedOnceRef.current;
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [
        overviewResp,
        feedResp,
        runsResp,
        runtimeResp,
        breachesResp,
        executionResp,
      ] = await Promise.all([
        portalApi.getControlPlaneCommandCenterOverview(),
        portalApi.getControlPlaneCommandCenterFeed(25),
        portalApi.getControlPlanePlannerRuns({
          limit: 20,
          offset: 0,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          triggerType:
            triggerTypeFilter === "ALL" ? undefined : triggerTypeFilter,
          triggerKey: triggerKeyFilter || undefined,
        }),
        portalApi.getErpRuntimeHealth(),
        portalApi.getDeliverySlaBreaches({
          limit: 8,
          offset: 0,
          includeRecovered: false,
        }),
        portalApi.getControlPlaneExecutionVisibility({
          limit: 12,
          offset: 0,
          status: statusFilter === "ALL" ? undefined : statusFilter,
          triggerType:
            triggerTypeFilter === "ALL" ? undefined : triggerTypeFilter,
          triggerKey: triggerKeyFilter || undefined,
        }),
      ]);

      const snapshot = sanitizeCommandCenterPayload({
        overviewResp,
        feedResp,
        runsResp,
        runtimeResp,
        breachesResp,
        executionResp,
      });

      setOverview(snapshot.overview);
      setFeed(snapshot.feed);
      setRuns(snapshot.runs);
      setRuntimeHealth(snapshot.runtimeHealth);
      setDeliveryBreaches(snapshot.breaches);
      setExecutionVisibility(snapshot.executionVisibility);
      setLoadError(null);
      setLastUpdatedAt(new Date().toISOString());
      hasLoadedOnceRef.current = true;
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "حاول مرة أخرى بعد لحظات.";
      setLoadError(description);
      toast({
        title: "تعذر تحميل غرفة القيادة",
        description,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, triggerTypeFilter, triggerKeyFilter, toast]);

  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  const loadPlannerRunDrilldown = useCallback(
    async (runId: string) => {
      setDrilldownLoading(true);
      try {
        const response =
          await portalApi.getControlPlanePlannerRunDrilldown(runId);
        const parsed = parsePlannerRunDrilldown(response);
        if (!parsed) {
          throw new Error("تعذر قراءة تفاصيل التشغيل المطلوبة.");
        }
        setDrilldown(parsed);
      } catch (error) {
        const description =
          error instanceof Error ? error.message : "تعذر تحميل تفاصيل التشغيل.";
        toast({
          title: "فشل تحميل drilldown",
          description,
          variant: "destructive",
        });
      } finally {
        setDrilldownLoading(false);
      }
    },
    [toast],
  );

  const openPlannerRunDrilldown = async (runId: string) => {
    setDrilldownRunId(runId);
    setTriageAckNoteDraft("");
    setDrilldownOpen(true);
    await loadPlannerRunDrilldown(runId);
  };

  const closePlannerRunDrilldown = () => {
    setDrilldownOpen(false);
    setDrilldown(null);
    setDrilldownRunId(null);
    setTriageAckNoteDraft("");
    setSubmittingTriageAckStatus(null);
  };

  const loadReplayPreview = useCallback(
    async (runId: string) => {
      setReplayPreviewLoading(true);
      try {
        const response =
          await portalApi.getControlPlanePlannerRunReplayPreview(runId);
        const parsed = parsePlannerRunReplayPreview(response);
        if (!parsed) {
          throw new Error("تعذر قراءة معاينة إعادة التشغيل.");
        }
        setReplayPreview(parsed);
      } catch (error) {
        const description =
          error instanceof Error
            ? error.message
            : "تعذر تحميل معاينة إعادة التشغيل.";
        toast({
          title: "فشل معاينة إعادة التشغيل",
          description,
          variant: "destructive",
        });
      } finally {
        setReplayPreviewLoading(false);
      }
    },
    [toast],
  );

  const openReplayPreview = async (runId: string) => {
    setReplayPreviewRunId(runId);
    setReplayOperatorNoteDraft("");
    setReplayPreviewOpen(true);
    await loadReplayPreview(runId);
  };

  const closeReplayPreview = () => {
    setReplayPreviewOpen(false);
    setReplayPreview(null);
    setReplayPreviewRunId(null);
    setReplayOperatorNoteDraft("");
  };

  const loadPendingApprovalsHandoff = useCallback(
    async (intent?: string) => {
      setApprovalsHandoffLoading(true);
      try {
        const response = await portalApi.getControlPlaneCopilotApprovals({
          status: "pending",
          intent: intent || undefined,
          limit: 30,
          offset: 0,
        });

        setApprovalsHandoffItems(parsePendingApprovalsHandoff(response));
      } catch (error) {
        setApprovalsHandoffItems([]);
        toast({
          title: "فشل تحميل الموافقات المعلقة",
          description:
            error instanceof Error
              ? error.message
              : "تعذر تحميل قائمة الموافقات المرتبطة.",
          variant: "destructive",
        });
      } finally {
        setApprovalsHandoffLoading(false);
      }
    },
    [toast],
  );

  const openApprovalsHandoff = async (intent?: string | null) => {
    const normalizedIntent = toSafeString(intent, "").toUpperCase();
    setApprovalsHandoffIntent(normalizedIntent || null);
    setApprovalsHandoffOpen(true);
    await loadPendingApprovalsHandoff(normalizedIntent || undefined);
  };

  const closeApprovalsHandoff = () => {
    setApprovalsHandoffOpen(false);
    setApprovalsHandoffIntent(null);
    setApprovalsHandoffItems([]);
  };

  const handleDrilldownRecommendedAction = async () => {
    if (!drilldown) return;

    const action = drilldown.recommendedNextAction;
    if (action === "REPLAY_RUN") {
      await openReplayPreview(drilldown.run.id);
      return;
    }

    if (action === "RETRY_CONNECTOR_DLQ") {
      await handleRetryOpenDlq();
      await loadPlannerRunDrilldown(drilldown.run.id);
      return;
    }

    if (action === "EXECUTE_DELIVERY_ESCALATIONS") {
      await handleExecuteOpenSlaEscalations();
      await loadPlannerRunDrilldown(drilldown.run.id);
      return;
    }

    if (action === "REVIEW_PENDING_APPROVALS") {
      await openApprovalsHandoff(drilldown.run.triggerKey);
      return;
    }

    if (action === "ADJUST_TRIGGER_BUDGET") {
      setTriggerTypeFilter(drilldown.run.triggerType);
      setTriggerKeyDraft(drilldown.run.triggerKey);
      setTriggerKeyFilter(drilldown.run.triggerKey);
      toast({
        title: "ضبط ميزانية المشغل",
        description:
          drilldown.replaySafety.gate.reason ||
          "تم تطبيق trigger لتسهيل مراجعة الميزانية.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "لا إجراء فوري",
      description: "الحالة الحالية مستقرة وتتطلب مراقبة فقط.",
    });
  };

  const handleReplay = async (
    runId: string,
    previewToken?: string | null,
    replayNote?: string,
  ) => {
    const safePreviewToken = String(previewToken || "").trim();
    if (!safePreviewToken) {
      toast({
        title: "رمز المعاينة مفقود",
        description: "أعد تحميل معاينة إعادة التشغيل قبل التأكيد.",
        variant: "destructive",
      });
      return;
    }

    const safeReplayNote = String(replayNote || "").trim();
    if (safeReplayNote.length < replayNotePolicy.minLength) {
      toast({
        title: "ملاحظة المشغل مطلوبة",
        description: `يرجى إدخال سبب إعادة التشغيل بحد أدنى ${replayNotePolicy.minLength} أحرف.`,
        variant: "destructive",
      });
      return;
    }
    if (safeReplayNote.length > replayNotePolicy.maxLength) {
      toast({
        title: "ملاحظة المشغل طويلة",
        description: `ملاحظة التشغيل يجب ألا تتجاوز ${replayNotePolicy.maxLength} حرفاً.`,
        variant: "destructive",
      });
      return;
    }

    setReplayingRunId(runId);
    try {
      const replay = await portalApi.replayControlPlanePlannerRun(runId, {
        reason: safeReplayNote,
        confirmReplay: true,
        previewToken: safePreviewToken,
      });
      if (replay?.allowed === false) {
        toast({
          title: "تم منع إعادة التشغيل",
          description: replay?.gateReason || "تجاوز ميزانية المشغل.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "تم إنشاء إعادة التشغيل",
          description: "أضيفت إعادة تشغيل جديدة إلى سجل المشغل.",
        });
      }
      closeReplayPreview();
      await loadCommandCenter();
      if (drilldownOpen && drilldown?.run.id === runId) {
        await loadPlannerRunDrilldown(runId);
      }
    } catch (error) {
      toast({
        title: "فشل إعادة التشغيل",
        description:
          error instanceof Error
            ? error.message
            : "تعذر إعادة تشغيل هذا السجل حالياً.",
        variant: "destructive",
      });
    } finally {
      setReplayingRunId(null);
    }
  };

  const handleAcknowledgeRunTriage = async (
    ackStatus: "acknowledged" | "deferred",
  ) => {
    if (!drilldown) return;

    if (!triageAckNoteValid) {
      toast({
        title: "ملاحظة المتابعة مطلوبة",
        description: `أدخل ملاحظة بين ${TRIAGE_NOTE_MIN_LENGTH} و${TRIAGE_NOTE_MAX_LENGTH} حرفاً قبل حفظ المتابعة.`,
        variant: "destructive",
      });
      return;
    }

    setSubmittingTriageAckStatus(ackStatus);
    try {
      await portalApi.acknowledgeControlPlanePlannerRunTriage(
        drilldown.run.id,
        {
          recommendedAction: drilldown.recommendedNextAction,
          ackStatus,
          note: triageAckNote,
          metadata: {
            surface: "command-center-drilldown",
          },
        },
      );

      toast({
        title: "تم حفظ متابعة المشغل",
        description:
          ackStatus === "acknowledged"
            ? "تم تسجيل المتابعة البشرية على هذا السجل."
            : "تم تسجيل تأجيل المتابعة مع الملاحظة.",
      });

      setTriageAckNoteDraft("");
      await loadCommandCenter();
      await loadPlannerRunDrilldown(drilldown.run.id);
    } catch (error) {
      toast({
        title: "فشل حفظ المتابعة",
        description:
          error instanceof Error
            ? error.message
            : "تعذر تسجيل متابعة المشغل حالياً.",
        variant: "destructive",
      });
    } finally {
      setSubmittingTriageAckStatus(null);
    }
  };

  const handleRetryOpenDlq = async () => {
    setRetryingDlq(true);
    try {
      const result = await portalApi.retryOpenErpRuntimeDlq({ limit: 25 });
      toast({
        title: "تم تشغيل إعادة DLQ",
        description: `تمت إعادة ${result?.retriedCount || 0} عنصر من DLQ.`,
      });
      await loadCommandCenter();
    } catch (error) {
      toast({
        title: "فشل إعادة DLQ",
        description:
          error instanceof Error
            ? error.message
            : "تعذر إعادة عناصر DLQ المفتوحة.",
        variant: "destructive",
      });
    } finally {
      setRetryingDlq(false);
    }
  };

  const handleExecuteSlaEscalation = async (breachEventId: string) => {
    setEscalatingBreachId(breachEventId);
    try {
      const result = await portalApi.executeDeliverySlaEscalation(
        breachEventId,
        {
          escalatedBy: "portal:command-center",
        },
      );

      if (result?.executed) {
        toast({
          title: "تم تنفيذ التصعيد",
          description: `تم تنفيذ تصعيد الحدث ${breachEventId}.`,
        });
      } else {
        toast({
          title: "تم تخطي التنفيذ",
          description:
            result?.skippedReason || "هذا الحدث لا يحتاج تصعيداً الآن.",
        });
      }

      await loadCommandCenter();
    } catch (error) {
      toast({
        title: "فشل تنفيذ التصعيد",
        description:
          error instanceof Error ? error.message : "تعذر تنفيذ التصعيد حالياً.",
        variant: "destructive",
      });
    } finally {
      setEscalatingBreachId(null);
    }
  };

  const handleAcknowledgeSlaBreach = async (breachEventId: string) => {
    setAcknowledgingBreachId(breachEventId);
    try {
      await portalApi.acknowledgeDeliverySlaBreach(breachEventId, {
        acknowledgedBy: "portal:command-center",
      });
      toast({
        title: "تم تسجيل الإقرار",
        description: `تم إقرار حدث SLA رقم ${breachEventId}.`,
      });
      await loadCommandCenter();
    } catch (error) {
      toast({
        title: "فشل الإقرار",
        description:
          error instanceof Error ? error.message : "تعذر إقرار الحدث حالياً.",
        variant: "destructive",
      });
    } finally {
      setAcknowledgingBreachId(null);
    }
  };

  const handleExecuteOpenSlaEscalations = async () => {
    setEscalatingOpenBreaches(true);
    try {
      const result = await portalApi.executeOpenDeliverySlaEscalations({
        limit: 25,
        escalatedBy: "portal:command-center",
      });

      toast({
        title: "تنفيذ تصعيدات SLA المفتوحة",
        description: `تم التصعيد: ${result?.escalatedCount || 0} • مسبقاً: ${result?.alreadyEscalatedCount || 0} • متخطى: ${result?.skippedCount || 0}`,
      });

      await loadCommandCenter();
    } catch (error) {
      toast({
        title: "فشل تنفيذ التصعيدات المفتوحة",
        description:
          error instanceof Error
            ? error.message
            : "تعذر تشغيل تنفيذ التصعيدات المفتوحة.",
        variant: "destructive",
      });
    } finally {
      setEscalatingOpenBreaches(false);
    }
  };

  const failedRuns24h = overview?.planner.failedRuns24h ?? 0;
  const skippedRuns24h = overview?.planner.skippedRuns24h ?? 0;
  const totalRuns24h = overview?.planner.totalRuns24h ?? 0;
  const escalationRequiredBreaches = useMemo(
    () =>
      deliveryBreaches.filter(
        (item) => item.remediation.state === "ESCALATION_REQUIRED",
      ).length,
    [deliveryBreaches],
  );
  const failureRate =
    totalRuns24h > 0 ? Math.round((failedRuns24h / totalRuns24h) * 100) : 0;
  const skipRate =
    totalRuns24h > 0 ? Math.round((skippedRuns24h / totalRuns24h) * 100) : 0;
  const criticalFeedCount = useMemo(
    () => feed.filter((item) => item.severity === "high").length,
    [feed],
  );
  const executionItems = executionVisibility?.items || [];
  const latestDrilldownTriageAck =
    drilldown?.correlatedEvidence.triageAcks[0] || null;
  const triageAckNote = triageAckNoteDraft.trim();
  const triageAckNoteLength = triageAckNote.length;
  const triageAckNoteValid =
    triageAckNoteLength >= TRIAGE_NOTE_MIN_LENGTH &&
    triageAckNoteLength <= TRIAGE_NOTE_MAX_LENGTH;
  const replayNotePolicy = replayPreview?.operatorNotePolicy || {
    required: true,
    minLength: REPLAY_NOTE_MIN_LENGTH,
    maxLength: REPLAY_NOTE_MAX_LENGTH,
  };
  const replayOperatorNote = replayOperatorNoteDraft.trim();
  const replayNoteLength = replayOperatorNote.length;
  const replayNoteMeetsMin = replayNoteLength >= replayNotePolicy.minLength;
  const replayNoteWithinMax = replayNoteLength <= replayNotePolicy.maxLength;
  const replayNoteValid = replayNotePolicy.required
    ? replayNoteMeetsMin && replayNoteWithinMax
    : replayNoteWithinMax;

  const summaryPills = useMemo(
    () => [
      {
        label: "فشل المشغل 24س",
        value: failedRuns24h,
        hint:
          totalRuns24h > 0
            ? `${failureRate}% من إجمالي التشغيلات`
            : "لا توجد تشغيلات مرصودة",
        icon: AlertTriangle,
      },
      {
        label: "تشغيلات متخطاة 24س",
        value: skippedRuns24h,
        hint:
          totalRuns24h > 0
            ? `${skipRate}% من إجمالي التشغيلات`
            : "لا توجد تشغيلات مرصودة",
        icon: Clock3,
      },
      {
        label: "موافقات معلقة",
        value: overview?.approvals.pending ?? 0,
        hint: "تحتاج مراجعة بشرية",
        icon: ShieldCheck,
      },
      {
        label: "DLQ مفتوح",
        value: runtimeHealth?.dlqOpen ?? overview?.connectors.dlqOpen ?? 0,
        hint: "رسائل فشلت في المعالجة",
        icon: AlertOctagon,
      },
      {
        label: "صف انتظار قيد المعالجة",
        value:
          runtimeHealth?.pendingQueue ??
          overview?.connectors.runtimePending ??
          0,
        hint: runtimeHealth
          ? `زمن التأخير ${formatLag(runtimeHealth.processingLagSeconds)}`
          : "لا توجد بيانات تأخير",
        icon: Zap,
      },
      {
        label: "تصعيد SLA مطلوب",
        value: escalationRequiredBreaches,
        hint: "حالات تأخير تحتاج إجراء تنفيذي",
        icon: AlertOctagon,
      },
      {
        label: "محاكاة سياسات 7 أيام",
        value: overview?.policy.simulations7d ?? 0,
        hint: "مؤشر جودة الحوكمة",
        icon: RefreshCw,
      },
    ],
    [
      failureRate,
      failedRuns24h,
      overview,
      runtimeHealth,
      escalationRequiredBreaches,
      skipRate,
      skippedRuns24h,
      totalRuns24h,
    ],
  );

  const triageItems = useMemo(() => {
    const items: Array<{
      id: string;
      severity: FeedSeverity;
      title: string;
      detail: string;
      action?:
        | "filterFailed"
        | "filterSkipped"
        | "retryDlq"
        | "clearFilters"
        | "executeOpenEscalations";
      actionLabel?: string;
    }> = [];

    if (escalationRequiredBreaches > 0) {
      items.push({
        id: "delivery-escalations",
        severity: "high",
        title: "تصعيدات SLA مطلوبة",
        detail: `${escalationRequiredBreaches} حالة بحاجة لتنفيذ تصعيد مباشر.`,
        action: "executeOpenEscalations",
        actionLabel: "تنفيذ التصعيدات",
      });
    }

    if (failedRuns24h > 0) {
      items.push({
        id: "failed-runs",
        severity: "high",
        title: "تشغيلات فاشلة تحتاج متابعة",
        detail: `${failedRuns24h} تشغيل فاشل خلال 24 ساعة.`,
        action: "filterFailed",
        actionLabel: "عرض الفشل",
      });
    }

    const dlqOpen = runtimeHealth?.dlqOpen ?? overview?.connectors.dlqOpen ?? 0;
    if (dlqOpen > 0) {
      items.push({
        id: "open-dlq",
        severity: "high",
        title: "صف DLQ يحتاج معالجة",
        detail: `${dlqOpen} عنصر متوقف في DLQ.`,
        action: "retryDlq",
        actionLabel: "إعادة DLQ",
      });
    }

    if (skippedRuns24h > 0) {
      items.push({
        id: "skipped-runs",
        severity: "medium",
        title: "تشغيلات متخطاة",
        detail: `${skippedRuns24h} تشغيل متخطى خلال 24 ساعة.`,
        action: "filterSkipped",
        actionLabel: "عرض المتخطى",
      });
    }

    const pendingApprovals = overview?.approvals.pending ?? 0;
    if (pendingApprovals > 0) {
      items.push({
        id: "pending-approvals",
        severity: "medium",
        title: "موافقات بشرية معلقة",
        detail: `${pendingApprovals} موافقة بانتظار قرار تشغيلي.`,
      });
    }

    if (criticalFeedCount > 0) {
      items.push({
        id: "critical-feed",
        severity: "high",
        title: "تنبيهات حرجة في الخلاصة",
        detail: `${criticalFeedCount} تنبيه حرج يحتاج متابعة فورية.`,
      });
    }

    if (items.length === 0) {
      items.push({
        id: "all-clear",
        severity: "low",
        title: "لا توجد أولويات حرجة الآن",
        detail: "تدفق التشغيلات مستقر ضمن البيانات المتاحة.",
        action: hasActiveFilters ? "clearFilters" : undefined,
        actionLabel: hasActiveFilters ? "إزالة الفلاتر" : undefined,
      });
    }

    return items;
  }, [
    criticalFeedCount,
    failedRuns24h,
    hasActiveFilters,
    overview,
    runtimeHealth,
    escalationRequiredBreaches,
    skippedRuns24h,
  ]);

  const handleTriageAction = async (
    action?:
      | "filterFailed"
      | "filterSkipped"
      | "retryDlq"
      | "clearFilters"
      | "executeOpenEscalations",
  ) => {
    if (!action) return;
    if (action === "filterFailed") {
      setStatusFilter("FAILED");
      return;
    }
    if (action === "filterSkipped") {
      setStatusFilter("SKIPPED");
      return;
    }
    if (action === "clearFilters") {
      setStatusFilter("ALL");
      setTriggerTypeFilter("ALL");
      setTriggerKeyDraft("");
      setTriggerKeyFilter("");
      return;
    }
    if (action === "retryDlq") {
      await handleRetryOpenDlq();
      return;
    }
    if (action === "executeOpenEscalations") {
      await handleExecuteOpenSlaEscalations();
    }
  };

  const handleExecutionRecommendedAction = async (
    item: ExecutionVisibilityItem,
  ) => {
    if (item.recommendedAction === "REPLAY_RUN") {
      await openReplayPreview(item.runId);
      return;
    }

    if (item.recommendedAction === "RETRY_CONNECTOR_DLQ") {
      await handleRetryOpenDlq();
      return;
    }

    if (item.recommendedAction === "EXECUTE_DELIVERY_ESCALATIONS") {
      await handleExecuteOpenSlaEscalations();
      return;
    }

    if (item.recommendedAction === "REVIEW_PENDING_APPROVALS") {
      await openApprovalsHandoff(item.triggerKey);
      return;
    }

    if (item.recommendedAction === "ADJUST_TRIGGER_BUDGET") {
      setTriggerTypeFilter(item.triggerType);
      setTriggerKeyDraft(item.triggerKey);
      setTriggerKeyFilter(item.triggerKey);
      toast({
        title: "تحقق من ميزانية المشغل",
        description:
          item.replayGate.reason ||
          "هذه العملية محجوبة بميزانية المشغل الحالية.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "حالة مستقرة",
      description: "لا يوجد إجراء فوري مطلوب لهذا التشغيل.",
    });
  };

  return (
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      <PageHeader
        title="غرفة القيادة"
        description="تشغيل مباشر للذكاء التشغيلي: فشل المشغل، موافقات قيد الانتظار، وصحة الموصلات."
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void loadCommandCenter()}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="ml-2 h-4 w-4" />
            )}
            تحديث مباشر
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleRetryOpenDlq()}
            disabled={retryingDlq}
          >
            {retryingDlq ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="ml-2 h-4 w-4" />
            )}
            إعادة DLQ المفتوح
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {loading && !hasAnyData
            ? "جاري تحميل بيانات غرفة القيادة..."
            : `آخر تحديث: ${timeAgo(lastUpdatedAt)}${runtimeHealth ? ` • زمن معالجة الصف: ${formatLag(runtimeHealth.processingLagSeconds)}` : ""}`}
        </p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-[color:rgba(239,68,68,0.35)] bg-[color:rgba(239,68,68,0.08)] p-3">
          <p className="text-sm font-medium text-red-700">
            تعذر مزامنة بيانات غرفة القيادة
          </p>
          <p className="mt-1 text-xs text-red-700/80">{loadError}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void loadCommandCenter()}
          >
            إعادة المحاولة
          </Button>
        </div>
      ) : null}

      <Card className="border-[var(--border-default)]">
        <CardHeader>
          <CardTitle>أولويات الآن</CardTitle>
          <CardDescription>
            قائمة تدخل سريعة قبل مراجعة تفاصيل السجل.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && !hasAnyData ? (
            <div className="text-sm text-muted-foreground">
              جاري تحضير الأولويات...
            </div>
          ) : (
            triageItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        severityBadgeClass[item.severity],
                      )}
                    >
                      {item.severity === "high"
                        ? "حرج"
                        : item.severity === "medium"
                          ? "متوسط"
                          : "منخفض"}
                    </Badge>
                    <p className="text-sm font-semibold">{item.title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>

                {item.action ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleTriageAction(item.action)}
                  >
                    {item.actionLabel || "تنفيذ"}
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaryPills.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border-[var(--border-default)]">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold">{item.value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {item.hint}
                  </p>
                </div>
                <span className="rounded-lg bg-[var(--bg-surface-2)] p-2 text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-[var(--border-default)]">
        <CardHeader>
          <CardTitle>رؤية التنفيذ عبر النطاقات</CardTitle>
          <CardDescription>
            ربط سجل المشغل بحالة الميزانيات والموافقات وصحة الموصلات وسياق
            التنفيذ الآمن.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs">
              موافقات عامة:{" "}
              {executionVisibility?.domainTruthSummary.pendingApprovalsGlobal ||
                0}
            </Badge>
            <Badge variant="outline" className="text-xs">
              DLQ مفتوح:{" "}
              {executionVisibility?.domainTruthSummary.connectorDlqOpen || 0}
            </Badge>
            <Badge variant="outline" className="text-xs">
              انتظار الموصلات:{" "}
              {executionVisibility?.domainTruthSummary
                .connectorRuntimePending || 0}
            </Badge>
            <Badge variant="outline" className="text-xs">
              خروقات SLA 24س:{" "}
              {executionVisibility?.domainTruthSummary.deliveryBreaches24h || 0}
            </Badge>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">
              جاري تحميل رؤية التنفيذ...
            </div>
          ) : executionItems.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--border-default)] p-4 text-sm text-muted-foreground">
              لا توجد تشغيلات كافية لرؤية التنفيذ ضمن الفلاتر الحالية.
            </div>
          ) : (
            executionItems.map((item) => (
              <div
                key={`execution-${item.runId}`}
                className="flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        runStatusBadgeClass[item.runStatus],
                      )}
                    >
                      {item.runStatus}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        executionActionBadgeClass[item.recommendedAction],
                      )}
                    >
                      {executionActionLabel[item.recommendedAction]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {item.triggerType}
                    </span>
                    <span className="text-xs font-mono">{item.triggerKey}</span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {item.reason || "بدون سبب مسجل"} • {timeAgo(item.startedAt)}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    آمان الإعادة: {item.replayGate.allowed ? "مسموح" : "مقيد"}
                    {item.replayGate.reason
                      ? ` • ${item.replayGate.reason}`
                      : ""}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    موافقات مرتبطة:{" "}
                    {item.domainTruth.pendingApprovalsForTrigger} • DLQ:{" "}
                    {item.domainTruth.connectorDlqOpen} • SLA:{" "}
                    {item.domainTruth.deliveryBreaches24h}
                  </p>

                  {item.triage ? (
                    <p className="text-xs text-muted-foreground">
                      متابعة بشرية: {item.triage.ackStatus} •{" "}
                      {item.triage.note || "بدون ملاحظة"}
                      {item.triage.acknowledgedAt
                        ? ` • ${timeAgo(item.triage.acknowledgedAt)}`
                        : ""}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void openPlannerRunDrilldown(item.runId)}
                    disabled={drilldownLoading && drilldownRunId === item.runId}
                  >
                    {drilldownLoading && drilldownRunId === item.runId ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : null}
                    تفاصيل التشغيل
                  </Button>

                  {item.recommendedAction !== "MONITOR" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void handleExecutionRecommendedAction(item)
                      }
                      disabled={
                        (item.recommendedAction === "REPLAY_RUN" &&
                          !item.replaySafeNow) ||
                        (item.recommendedAction === "REPLAY_RUN" &&
                          replayPreviewLoading &&
                          replayPreviewRunId === item.runId) ||
                        replayingRunId === item.runId
                      }
                    >
                      {item.recommendedAction === "REPLAY_RUN" &&
                      replayingRunId === item.runId ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {executionActionLabel[item.recommendedAction]}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-[var(--border-default)]">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>طابور تصعيد SLA للتوصيل</CardTitle>
              <CardDescription>
                تنفيذ تصعيدات التأخير الحرجة من نفس غرفة القيادة.
              </CardDescription>
            </div>

            <Button
              variant="outline"
              onClick={() => void handleExecuteOpenSlaEscalations()}
              disabled={
                escalatingOpenBreaches ||
                deliveryBreaches.length === 0 ||
                escalationRequiredBreaches === 0
              }
            >
              {escalatingOpenBreaches ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <AlertOctagon className="ml-2 h-4 w-4" />
              )}
              تصعيد الكل المفتوح
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">
              جاري تحميل طابور التصعيد...
            </div>
          ) : deliveryBreaches.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--border-default)] p-4 text-sm text-muted-foreground">
              لا توجد حالات SLA مفتوحة حالياً.
            </div>
          ) : (
            deliveryBreaches.map((breach) => (
              <div
                key={breach.breachEventId}
                className="flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        remediationBadgeClass[breach.remediation.state],
                      )}
                    >
                      {breach.remediation.state}
                    </Badge>
                    <Badge variant="outline" className="text-[11px]">
                      {breach.remediation.escalationLevel}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {breach.orderNumber} • {breach.slaType}
                    </span>
                  </div>

                  <p className="text-sm font-semibold">
                    {breach.reason || "تأخير تشغيلي بدون سبب مسجل"}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    Δ {breach.minutesDelta} دقيقة • آخر رصد{" "}
                    {timeAgo(breach.observedAt)}
                    {breach.remediation.acknowledgedAt
                      ? ` • مُقَر بواسطة ${breach.remediation.acknowledgedBy || "-"}`
                      : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void handleExecuteSlaEscalation(breach.breachEventId)
                    }
                    disabled={
                      escalatingBreachId === breach.breachEventId ||
                      breach.remediation.state !== "ESCALATION_REQUIRED"
                    }
                  >
                    {escalatingBreachId === breach.breachEventId ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="ml-2 h-4 w-4" />
                    )}
                    تصعيد الآن
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void handleAcknowledgeSlaBreach(breach.breachEventId)
                    }
                    disabled={
                      acknowledgingBreachId === breach.breachEventId ||
                      Boolean(breach.remediation.acknowledgedAt)
                    }
                  >
                    {acknowledgingBreachId === breach.breachEventId ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="ml-2 h-4 w-4" />
                    )}
                    إقرار
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2 border-[var(--border-default)]">
          <CardHeader>
            <CardTitle>خلاصة التنبيهات</CardTitle>
            <CardDescription>
              آخر العناصر من مشغل الذكاء والموصلات.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-sm text-muted-foreground">
                جاري التحميل...
              </div>
            ) : feed.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                لا توجد تنبيهات حالياً.
              </div>
            ) : (
              feed.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        severityBadgeClass[item.severity],
                      )}
                    >
                      {item.severity === "high"
                        ? "حرج"
                        : item.severity === "medium"
                          ? "متوسط"
                          : "منخفض"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.message}
                  </p>
                  {item.referenceId !== "-" ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      مرجع المتابعة:{" "}
                      <span className="font-mono">{item.referenceId}</span>
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-3 border-[var(--border-default)]">
          <CardHeader>
            <CardTitle>سجل المشغل</CardTitle>
            <CardDescription>
              تشغيلات planner مع إمكانية إعادة المحاولة.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={statusFilter === "FAILED" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("FAILED")}
              >
                فشل ({failedRuns24h})
              </Button>
              <Button
                variant={statusFilter === "SKIPPED" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("SKIPPED")}
              >
                متخطى ({skippedRuns24h})
              </Button>
              <Button
                variant={statusFilter === "COMPLETED" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("COMPLETED")}
              >
                مكتمل
              </Button>
              {hasActiveFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleTriageAction("clearFilters")}
                >
                  مسح كل الفلاتر
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(parseRunStatusFilter(event.target.value))
                }
              >
                <option value="ALL">كل الحالات</option>
                <option value="FAILED">FAILED</option>
                <option value="SKIPPED">SKIPPED</option>
                <option value="STARTED">STARTED</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>

              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={triggerTypeFilter}
                onChange={(event) =>
                  setTriggerTypeFilter(
                    parseTriggerTypeFilter(event.target.value),
                  )
                }
              >
                <option value="ALL">كل أنواع المشغلات</option>
                <option value="ON_DEMAND">ON_DEMAND</option>
                <option value="EVENT">EVENT</option>
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="ESCALATION">ESCALATION</option>
              </select>

              <Input
                placeholder="فلتر trigger key"
                value={triggerKeyDraft}
                onChange={(event) => setTriggerKeyDraft(event.target.value)}
              />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setTriggerKeyFilter(triggerKeyDraft.trim())}
                >
                  تطبيق
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setTriggerKeyDraft("");
                    setTriggerKeyFilter("");
                  }}
                >
                  مسح
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="text-sm text-muted-foreground">
                  جاري تحميل السجل...
                </div>
              ) : runs.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--border-default)] p-4 text-sm text-muted-foreground">
                  لا توجد تشغيلات مطابقة للفلاتر الحالية.
                  {hasActiveFilters ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mr-2"
                      onClick={() => void handleTriageAction("clearFilters")}
                    >
                      إزالة الفلاتر
                    </Button>
                  ) : null}
                </div>
              ) : (
                runs.map((run) => (
                  <div
                    key={run.id}
                    className="flex flex-col gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            runStatusBadgeClass[run.run_status],
                          )}
                        >
                          {run.run_status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {run.trigger_type}
                        </span>
                        <span className="text-xs text-muted-foreground">/</span>
                        <span className="text-xs font-mono">
                          {run.trigger_key}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {run.reason || "بدون سبب مسجل"} •{" "}
                        {timeAgo(run.started_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void openPlannerRunDrilldown(run.id)}
                        disabled={drilldownLoading && drilldownRunId === run.id}
                      >
                        {drilldownLoading && drilldownRunId === run.id ? (
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        ) : null}
                        تفاصيل التشغيل
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void openReplayPreview(run.id)}
                        disabled={
                          replayingRunId === run.id ||
                          (replayPreviewLoading &&
                            replayPreviewRunId === run.id) ||
                          !["FAILED", "SKIPPED"].includes(run.run_status)
                        }
                      >
                        {replayingRunId === run.id ||
                        (replayPreviewLoading &&
                          replayPreviewRunId === run.id) ? (
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="ml-2 h-4 w-4" />
                        )}
                        إعادة تشغيل
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={replayPreviewOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeReplayPreview();
          }
        }}
      >
        <DialogContent className="w-[min(calc(100%-20px),760px)] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>معاينة إعادة التشغيل قبل التنفيذ</DialogTitle>
            <DialogDescription>
              Dry-run سلامة التشغيل: مراجعة gate والقيود التشغيلية قبل تأكيد
              إعادة التشغيل الفعلية.
            </DialogDescription>
          </DialogHeader>

          {replayPreviewLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري توليد معاينة إعادة التشغيل...
            </div>
          ) : !replayPreview ? (
            <div className="space-y-3 rounded-lg border border-[var(--border-default)] p-4">
              <p className="text-sm text-muted-foreground">
                تعذر تحميل المعاينة في الوقت الحالي.
              </p>
              {replayPreviewRunId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadReplayPreview(replayPreviewRunId)}
                >
                  إعادة المحاولة
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px]",
                      runStatusBadgeClass[replayPreview.sourceRun.runStatus],
                    )}
                  >
                    {replayPreview.sourceRun.runStatus}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px]",
                      replayPreview.allowedToReplayNow
                        ? "border-[color:rgba(34,197,94,0.32)] bg-[color:rgba(34,197,94,0.12)] text-emerald-700"
                        : "border-[color:rgba(239,68,68,0.35)] bg-[color:rgba(239,68,68,0.12)] text-red-700",
                    )}
                  >
                    {replayPreview.allowedToReplayNow
                      ? "قابل للإعادة الآن"
                      : "غير قابل للإعادة الآن"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {replayPreview.sourceRun.triggerType}
                  </span>
                  <span className="text-xs font-mono">
                    {replayPreview.sourceRun.triggerKey}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    #{replayPreview.sourceRun.id}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  الحالة المتوقعة بعد التنفيذ:{" "}
                  {replayPreview.predictedReplayRunStatus}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {replayPreview.sourceRun.reason || "بدون سبب مسجل"} •{" "}
                  {timeAgo(replayPreview.sourceRun.startedAt)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">
                    موافقات معلقة:{" "}
                    {replayPreview.safetySummary.pendingApprovalsForTrigger}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    replay سابق:{" "}
                    {replayPreview.safetySummary.replayAttemptsForSource}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    DLQ مفتوح:{" "}
                    {replayPreview.safetySummary.connectorDlqOpenForTrigger}
                  </Badge>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  gate: {replayPreview.budgetGate.gateType} • AI calls:{" "}
                  {replayPreview.budgetGate.usedAiCallsToday}/
                  {replayPreview.budgetGate.budgetAiCallsDaily} • tokens:{" "}
                  {replayPreview.budgetGate.usedTokensToday}/
                  {replayPreview.budgetGate.budgetTokensDaily}
                  {replayPreview.budgetGate.reason
                    ? ` • ${replayPreview.budgetGate.reason}`
                    : ""}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  binding hash:{" "}
                  {replayPreview.binding.previewContextHash.slice(0, 16) || "-"}
                  {replayPreview.binding.previewTokenExpiresAt
                    ? ` • صلاحية الرمز ${timeAgo(replayPreview.binding.previewTokenExpiresAt)}`
                    : " • صلاحية الرمز غير متاحة"}
                </p>

                {replayPreview.blockingReasons.length > 0 ? (
                  <div className="mt-3 rounded-md border border-[color:rgba(239,68,68,0.35)] bg-[color:rgba(239,68,68,0.08)] p-3">
                    <p className="text-xs font-semibold text-red-700">
                      أسباب المنع
                    </p>
                    <div className="mt-1 space-y-1">
                      {replayPreview.blockingReasons.map((reason, index) => (
                        <p
                          key={`block-${index + 1}`}
                          className="text-xs text-red-700/90"
                        >
                          • {reason}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 rounded-md border border-[var(--border-default)] bg-white p-3">
                  <p className="text-xs font-semibold text-foreground">
                    ملاحظة المشغل لإعادة التشغيل (إلزامية)
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    تُحفظ مع بيانات replay للتدقيق. الحد الأدنى{" "}
                    {replayNotePolicy.minLength} والحد الأقصى{" "}
                    {replayNotePolicy.maxLength} حرفاً.
                  </p>
                  <Textarea
                    className="mt-2 min-h-[88px]"
                    value={replayOperatorNoteDraft}
                    onChange={(event) =>
                      setReplayOperatorNoteDraft(event.target.value)
                    }
                    maxLength={replayNotePolicy.maxLength}
                    placeholder="اشرح سبب إعادة التشغيل وما الذي تحققته قبل التنفيذ..."
                  />
                  <p
                    className={cn(
                      "mt-2 text-[11px]",
                      replayNoteValid || replayNoteLength === 0
                        ? "text-muted-foreground"
                        : "text-red-700",
                    )}
                  >
                    {replayNoteLength}/{replayNotePolicy.maxLength}
                    {replayNoteLength > 0 && !replayNoteMeetsMin
                      ? ` • أدخل ${replayNotePolicy.minLength - replayNoteLength} أحرف إضافية على الأقل`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void handleReplay(
                      replayPreview.sourceRun.id,
                      replayPreview.binding.previewToken,
                      replayOperatorNote,
                    )
                  }
                  disabled={
                    replayingRunId === replayPreview.sourceRun.id ||
                    !replayPreview.binding.previewToken ||
                    !replayPreview.allowedToReplayNow ||
                    !replayNoteValid
                  }
                >
                  {replayingRunId === replayPreview.sourceRun.id ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : null}
                  تأكيد إعادة التشغيل الآن
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void loadReplayPreview(replayPreview.sourceRun.id)
                  }
                  disabled={replayPreviewLoading}
                >
                  تحديث المعاينة
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={approvalsHandoffOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeApprovalsHandoff();
          }
        }}
      >
        <DialogContent className="w-[min(calc(100%-20px),860px)] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>handoff الموافقات المعلقة</DialogTitle>
            <DialogDescription>
              مسار تشغيلي مباشر للموافقات المرتبطة بتوصية
              REVIEW_PENDING_APPROVALS.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              فلتر الحالة: pending
            </Badge>
            <Badge variant="outline" className="text-xs">
              intent: {approvalsHandoffIntent || "ALL"}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void loadPendingApprovalsHandoff(
                  approvalsHandoffIntent || undefined,
                )
              }
              disabled={approvalsHandoffLoading}
            >
              {approvalsHandoffLoading ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : null}
              تحديث القائمة
            </Button>
          </div>

          {approvalsHandoffLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري تحميل الموافقات...
            </div>
          ) : approvalsHandoffItems.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--border-default)] p-4 text-sm text-muted-foreground">
              لا توجد موافقات pending ضمن الفلتر الحالي.
            </div>
          ) : (
            <div className="space-y-2">
              {approvalsHandoffItems.map((approval) => (
                <div
                  key={approval.actionId}
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[11px]">
                      {approval.status}
                    </Badge>
                    <Badge variant="outline" className="text-[11px]">
                      {approval.riskTier}
                    </Badge>
                    <span className="text-xs font-mono">{approval.intent}</span>
                    <span className="text-xs text-muted-foreground">
                      #{approval.actionId}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {approval.source} • {timeAgo(approval.updatedAt)}
                    {approval.actorRole ? ` • ${approval.actorRole}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {approval.previewSummary || "بدون ملخص معاينة محفوظ"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={drilldownOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePlannerRunDrilldown();
          }
        }}
      >
        <DialogContent className="w-[min(calc(100%-20px),980px)] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل تشغيل المشغل</DialogTitle>
            <DialogDescription>
              ربط السجل المحدد مع الأدلة التشغيلية عبر approvals وreplay
              وconnector وdelivery.
            </DialogDescription>
          </DialogHeader>

          {drilldownLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري تحميل drilldown...
            </div>
          ) : !drilldown ? (
            <div className="space-y-3 rounded-lg border border-[var(--border-default)] p-4">
              <p className="text-sm text-muted-foreground">
                تعذر تحميل التفاصيل أو أن السجل غير متاح حالياً.
              </p>
              {drilldownRunId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadPlannerRunDrilldown(drilldownRunId)}
                >
                  إعادة التحميل
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px]",
                      runStatusBadgeClass[drilldown.run.runStatus],
                    )}
                  >
                    {drilldown.run.runStatus}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px]",
                      executionActionBadgeClass[
                        drilldown.recommendedNextAction
                      ],
                    )}
                  >
                    {executionActionLabel[drilldown.recommendedNextAction]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {drilldown.run.triggerType}
                  </span>
                  <span className="text-xs font-mono">
                    {drilldown.run.triggerKey}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    #{drilldown.run.id}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  {drilldown.run.reason || "بدون سبب مسجل"} •{" "}
                  {timeAgo(drilldown.run.startedAt)}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">
                    replay:{" "}
                    {drilldown.replaySafety.replaySafeNow ? "مسموح" : "مقيد"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    موافقات معلقة: {drilldown.stats.pendingApprovals}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    DLQ مفتوح: {drilldown.stats.connectorDlqOpen}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    خروقات SLA: {drilldown.stats.deliveryActiveBreaches}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    replay tokens: {drilldown.stats.replayTokenConsumptions}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    triage: {drilldown.stats.triageAcknowledgements}
                  </Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void handleDrilldownRecommendedAction()}
                    disabled={
                      drilldown.recommendedNextAction === "MONITOR" ||
                      (drilldown.recommendedNextAction === "REPLAY_RUN" &&
                        !drilldown.replaySafety.replaySafeNow) ||
                      replayingRunId === drilldown.run.id
                    }
                  >
                    {drilldown.recommendedNextAction === "REPLAY_RUN" &&
                    replayingRunId === drilldown.run.id ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {executionActionLabel[drilldown.recommendedNextAction]}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void loadPlannerRunDrilldown(drilldown.run.id)
                    }
                    disabled={drilldownLoading}
                  >
                    تحديث الأدلة
                  </Button>
                </div>

                <p className="mt-3 text-xs text-muted-foreground">
                  gate: {drilldown.replaySafety.gate.gateType} • AI calls:{" "}
                  {drilldown.replaySafety.gate.usedAiCallsToday}/
                  {drilldown.replaySafety.gate.budgetAiCallsDaily} • tokens:{" "}
                  {drilldown.replaySafety.gate.usedTokensToday}/
                  {drilldown.replaySafety.gate.budgetTokensDaily}
                  {drilldown.replaySafety.gate.reason
                    ? ` • ${drilldown.replaySafety.gate.reason}`
                    : ""}
                </p>

                <div className="mt-3 rounded-md border border-[var(--border-default)] bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-foreground">
                      متابعة التوصية التشغيلية
                    </p>
                    {latestDrilldownTriageAck ? (
                      <Badge variant="outline" className="text-[11px]">
                        آخر متابعة: {latestDrilldownTriageAck.ackStatus}
                      </Badge>
                    ) : null}
                  </div>

                  {latestDrilldownTriageAck ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {latestDrilldownTriageAck.ackNote || "بدون ملاحظة"}
                      {latestDrilldownTriageAck.ackedAt
                        ? ` • ${timeAgo(latestDrilldownTriageAck.ackedAt)}`
                        : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      لا توجد متابعة بشرية مسجلة حتى الآن.
                    </p>
                  )}

                  <Textarea
                    className="mt-2 min-h-[78px]"
                    value={triageAckNoteDraft}
                    onChange={(event) =>
                      setTriageAckNoteDraft(event.target.value)
                    }
                    maxLength={TRIAGE_NOTE_MAX_LENGTH}
                    placeholder="دوّن قرارك التشغيلي وما الذي تم التحقق منه..."
                  />

                  <p
                    className={cn(
                      "mt-2 text-[11px]",
                      triageAckNoteLength === 0 || triageAckNoteValid
                        ? "text-muted-foreground"
                        : "text-red-700",
                    )}
                  >
                    {triageAckNoteLength}/{TRIAGE_NOTE_MAX_LENGTH}
                    {triageAckNoteLength > 0 &&
                    triageAckNoteLength < TRIAGE_NOTE_MIN_LENGTH
                      ? ` • أدخل ${TRIAGE_NOTE_MIN_LENGTH - triageAckNoteLength} أحرف إضافية`
                      : ""}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void handleAcknowledgeRunTriage("acknowledged")
                      }
                      disabled={
                        drilldown.recommendedNextAction === "MONITOR" ||
                        submittingTriageAckStatus !== null ||
                        !triageAckNoteValid
                      }
                    >
                      {submittingTriageAckStatus === "acknowledged" ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : null}
                      تسجيل متابعة
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void handleAcknowledgeRunTriage("deferred")
                      }
                      disabled={
                        drilldown.recommendedNextAction === "MONITOR" ||
                        submittingTriageAckStatus !== null ||
                        !triageAckNoteValid
                      }
                    >
                      {submittingTriageAckStatus === "deferred" ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : null}
                      تسجيل تأجيل
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border-default)] p-3">
                <p className="mb-2 text-sm font-semibold">
                  الخط الزمني المترابط
                </p>
                {drilldownTimeline.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    لا توجد أحداث مترابطة لعرضها.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {drilldownTimeline.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {entry.category}
                          </Badge>
                          <p className="text-xs font-medium">{entry.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {timeAgo(entry.timestamp)}
                          </p>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {entry.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <p className="mb-2 text-sm font-semibold">
                    الموافقات المرتبطة
                  </p>
                  {drilldown.correlatedEvidence.approvals.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      لا توجد موافقات مرتبطة.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {drilldown.correlatedEvidence.approvals.map((row) => (
                        <div
                          key={row.actionId}
                          className="rounded-md bg-[var(--bg-surface-2)] p-2"
                        >
                          <p className="text-xs font-medium">
                            {row.intent} • {row.status}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {row.source} • {timeAgo(row.updatedAt)}
                            {row.actorRole ? ` • ${row.actorRole}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <p className="mb-2 text-sm font-semibold">سجل replay</p>
                  {drilldown.correlatedEvidence.replayAttempts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      لا توجد محاولات replay بعد.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {drilldown.correlatedEvidence.replayAttempts.map(
                        (row) => (
                          <div
                            key={row.id}
                            className="rounded-md bg-[var(--bg-surface-2)] p-2"
                          >
                            <p className="text-xs font-medium">
                              {row.runStatus} • #{row.id}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {row.reason || "بدون سبب"} •{" "}
                              {timeAgo(row.startedAt)}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <p className="mb-2 text-sm font-semibold">
                    Connector runtime
                  </p>
                  {drilldown.correlatedEvidence.connectorRuntime.length ===
                  0 ? (
                    <p className="text-xs text-muted-foreground">
                      لا توجد أحداث runtime مرتبطة.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {drilldown.correlatedEvidence.connectorRuntime.map(
                        (row) => (
                          <div
                            key={row.id}
                            className="rounded-md bg-[var(--bg-surface-2)] p-2"
                          >
                            <p className="text-xs font-medium">
                              {row.eventType} • {row.status}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              محاولة {row.attemptCount}/{row.maxAttempts}
                              {row.lastError ? ` • ${row.lastError}` : ""}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <p className="mb-2 text-sm font-semibold">Connector DLQ</p>
                  {drilldown.correlatedEvidence.connectorDlq.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      لا توجد عناصر DLQ مرتبطة.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {drilldown.correlatedEvidence.connectorDlq.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-md bg-[var(--bg-surface-2)] p-2"
                        >
                          <p className="text-xs font-medium">
                            {row.eventType} • {row.status}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {row.lastError || "بدون خطأ مسجل"} •{" "}
                            {timeAgo(row.movedToDlqAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <p className="mb-2 text-sm font-semibold">
                    Replay token consumption
                  </p>
                  {drilldown.correlatedEvidence.replayConsumptions.length ===
                  0 ? (
                    <p className="text-xs text-muted-foreground">
                      لا توجد عمليات استهلاك token مسجلة.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {drilldown.correlatedEvidence.replayConsumptions.map(
                        (row) => (
                          <div
                            key={row.id}
                            className="rounded-md bg-[var(--bg-surface-2)] p-2"
                          >
                            <p className="text-xs font-medium">
                              token {row.previewTokenHash.slice(0, 12)}... •{" "}
                              {timeAgo(row.consumedAt)}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {row.operatorNote || "بدون ملاحظة"}
                              {row.replayRunId
                                ? ` • replay #${row.replayRunId}`
                                : ""}
                              {row.consumedBy ? ` • ${row.consumedBy}` : ""}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-[var(--border-default)] p-3">
                  <p className="mb-2 text-sm font-semibold">
                    Triage acknowledgements
                  </p>
                  {drilldown.correlatedEvidence.triageAcks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      لا توجد متابعات بشرية مسجلة.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {drilldown.correlatedEvidence.triageAcks.map((row) => (
                        <div
                          key={row.id}
                          className="rounded-md bg-[var(--bg-surface-2)] p-2"
                        >
                          <p className="text-xs font-medium">
                            {row.ackStatus} • {row.recommendedAction}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {row.ackNote || "بدون ملاحظة"}
                            {row.ackedBy ? ` • ${row.ackedBy}` : ""}
                            {row.ackedAt ? ` • ${timeAgo(row.ackedAt)}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border-default)] p-3">
                <p className="mb-2 text-sm font-semibold">
                  Delivery SLA evidence
                </p>
                {drilldown.correlatedEvidence.deliveryBreaches.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    لا توجد خروقات delivery مرتبطة.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {drilldown.correlatedEvidence.deliveryBreaches.map(
                      (row) => (
                        <div
                          key={row.id}
                          className="rounded-md bg-[var(--bg-surface-2)] p-2"
                        >
                          <p className="text-xs font-medium">
                            {row.orderNumber} • {row.slaType} • {row.status}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Δ {row.minutesDelta} دقيقة •{" "}
                            {row.reason || "بدون سبب"} •{" "}
                            {timeAgo(row.observedAt)}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
