import { CopilotIntent } from "./copilot-schema";
import { CopilotRiskTier } from "./copilot-risk-policy";

export interface PlannerCompensationMetadata {
  strategy: "none" | "reverse_operation" | "manual_followup";
  requiresManagerReview: boolean;
  runbookHints: string[];
}

export interface PlannerActionContract {
  intent: CopilotIntent;
  destructive: boolean;
  riskTier: CopilotRiskTier;
  preconditions: string[];
  compensationHints: string[];
  compensation: PlannerCompensationMetadata;
}

export interface PlannerOperationalSnapshot {
  todayOrders: number;
  todayRevenue: number;
  openConversations: number;
  pendingApprovals: number;
}

export interface PlannerPosSnapshot {
  openRegisters: number;
  activeDrafts: number;
  todayCashierOrders: number;
  todayCashierRevenue: number;
  openRegistersByBranch: Array<{
    registerId: string;
    branchId: string;
    openedAt: string;
  }>;
  activeDraftsByBranch: Array<{
    branchId: string;
    draftsCount: number;
  }>;
}

export interface PlannerForecastRunSnapshot {
  forecastType: string;
  status: string;
  itemsComputed: number;
  computedAt: string;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface PlannerForecastSnapshot {
  enabled: boolean;
  latestRuns: PlannerForecastRunSnapshot[];
  riskSignals: {
    lowConfidencePredictions: number;
    staleRuns: number;
    highUrgencyReplenishments: number;
  };
}

export interface PlannerContextContract {
  merchantId: string;
  generatedAt: string;
  operational: PlannerOperationalSnapshot;
  pos: PlannerPosSnapshot;
  forecast: PlannerForecastSnapshot;
  actionRegistry: PlannerActionContract[];
}

export interface PlannerExecutionContextDigest {
  generatedAt: string;
  pendingApprovals: number;
  openRegisters: number;
  forecastRiskSignals: {
    lowConfidencePredictions: number;
    staleRuns: number;
    highUrgencyReplenishments: number;
  };
}

export interface PlannerExecutionDecision {
  allowed: boolean;
  escalationRequired: boolean;
  reasons: string[];
  advisories: string[];
  contextDigest: PlannerExecutionContextDigest;
}
