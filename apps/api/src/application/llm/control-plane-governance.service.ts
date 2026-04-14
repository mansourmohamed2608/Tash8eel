import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { Pool, PoolClient } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { evaluateCopilotActionRisk } from "./copilot-risk-policy";
import { CopilotIntent } from "./copilot-schema";

type TriggerType = "EVENT" | "SCHEDULED" | "ON_DEMAND" | "ESCALATION";
type PlannerRunStatus = "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED";
type ExecutionRecommendedAction =
  | "MONITOR"
  | "REPLAY_RUN"
  | "REVIEW_PENDING_APPROVALS"
  | "ADJUST_TRIGGER_BUDGET"
  | "RETRY_CONNECTOR_DLQ"
  | "EXECUTE_DELIVERY_ESCALATIONS";

const MAX_POLICY_DSL_BYTES = 256 * 1024;
const MAX_SIMULATION_INPUT_BYTES = 64 * 1024;
const MAX_PLANNER_CONTEXT_DIGEST_BYTES = 64 * 1024;
const MAX_TRIGGER_KEY_LENGTH = 120;
const MAX_BUDGET_AI_CALLS_DAILY = 500000;
const MAX_BUDGET_TOKENS_DAILY = 500000000;
const REPLAY_PREVIEW_TOKEN_TTL_MS = 5 * 60 * 1000;
const REPLAY_OPERATOR_NOTE_MIN_LENGTH = 8;
const REPLAY_OPERATOR_NOTE_MAX_LENGTH = 240;
const TRIAGE_ACK_NOTE_MIN_LENGTH = 8;
const TRIAGE_ACK_NOTE_MAX_LENGTH = 240;

type QueryExecutor = Pick<Pool, "query"> | Pick<PoolClient, "query">;
type TriageAckStatus = "acknowledged" | "deferred";

type ReplayPreviewTokenPayload = {
  v: 1;
  merchantId: string;
  runId: string;
  previewGeneratedAt: string;
  previewExpiresAt: string;
  previewContextHash: string;
};

type ReplayPreviewContext = {
  sourceRun: {
    id: string;
    triggerType: TriggerType;
    triggerKey: string;
    runStatus: PlannerRunStatus;
    reason: string | null;
    startedAt: Date;
    completedAt: Date | null;
    createdAt: Date;
    contextDigest: Record<string, any>;
  };
  budgetGate: {
    allowed: boolean;
    reason: string | null;
    gateType: string;
    usedAiCallsToday: number;
    usedTokensToday: number;
    budgetAiCallsDaily: number;
    budgetTokensDaily: number;
  };
  safetySummary: {
    pendingApprovalsForTrigger: number;
    replayAttemptsForSource: number;
    latestReplayAt: Date | null;
    connectorDlqOpenForTrigger: number;
  };
  replayEligibleByStatus: boolean;
  allowedToReplayNow: boolean;
  blockingReasons: string[];
  contextHash: string;
};

@Injectable()
export class ControlPlaneGovernanceService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listPolicySets(merchantId: string) {
    const rows = await this.pool.query(
      `SELECT
         id::text as id,
         name,
         version,
         status,
         policy_dsl,
         created_by,
         activated_at,
         created_at,
         updated_at
       FROM control_policy_sets
       WHERE merchant_id = $1
       ORDER BY updated_at DESC`,
      [merchantId],
    );

    return {
      sets: rows.rows,
      count: rows.rows.length,
    };
  }

  async createPolicySet(input: {
    merchantId: string;
    name: string;
    policyDsl?: Record<string, any>;
    createdBy?: string;
    status?: "DRAFT" | "ACTIVE";
  }) {
    const name = String(input.name || "").trim();
    if (!name) {
      throw new BadRequestException("name is required");
    }
    if (name.length > 120) {
      throw new BadRequestException("name must be 120 characters or fewer");
    }

    const status = String(input.status || "DRAFT").toUpperCase();
    if (!["DRAFT", "ACTIVE"].includes(status)) {
      throw new BadRequestException("status must be DRAFT or ACTIVE");
    }

    this.assertJsonWithinLimit(
      input.policyDsl,
      MAX_POLICY_DSL_BYTES,
      "policyDsl",
    );

    const versionRow = await this.pool.query<{ next_version: string }>(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version
       FROM control_policy_sets
       WHERE merchant_id = $1
         AND name = $2`,
      [input.merchantId, name],
    );
    const version = Number(versionRow.rows[0]?.next_version || 1);

    const created = await this.pool.query(
      `INSERT INTO control_policy_sets (
         merchant_id,
         name,
         version,
         status,
         policy_dsl,
         created_by,
         activated_at
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5::jsonb,
         $6,
         CASE WHEN $4 = 'ACTIVE' THEN NOW() ELSE NULL END
       )
       RETURNING
         id::text as id,
         name,
         version,
         status,
         policy_dsl,
         created_by,
         activated_at,
         created_at,
         updated_at`,
      [
        input.merchantId,
        name,
        version,
        status,
        JSON.stringify(input.policyDsl || {}),
        input.createdBy || null,
      ],
    );

    return created.rows[0];
  }

  async simulatePolicy(input: {
    merchantId: string;
    policySetId?: string;
    intent: CopilotIntent;
    triggerType?: TriggerType;
    triggerKey?: string;
    simulationInput?: Record<string, any>;
    createdBy?: string;
  }) {
    this.assertTriggerType(input.triggerType || "ON_DEMAND");

    const triggerKey = String(input.triggerKey || input.intent || "").trim();
    if (!triggerKey) {
      throw new BadRequestException("triggerKey is required");
    }
    if (triggerKey.length > MAX_TRIGGER_KEY_LENGTH) {
      throw new BadRequestException(
        `triggerKey must be ${MAX_TRIGGER_KEY_LENGTH} characters or fewer`,
      );
    }

    this.assertJsonWithinLimit(
      input.simulationInput,
      MAX_SIMULATION_INPUT_BYTES,
      "simulationInput",
    );

    const risk = evaluateCopilotActionRisk(input.intent);

    let policyDsl: Record<string, any> = {};
    let policySetId: string | null = null;

    if (input.policySetId) {
      const set = await this.pool.query<{
        id: string;
        policy_dsl: Record<string, any>;
      }>(
        `SELECT id::text as id, policy_dsl
         FROM control_policy_sets
         WHERE merchant_id = $1
           AND id::text = $2
         LIMIT 1`,
        [input.merchantId, input.policySetId],
      );

      if (!set.rows.length) {
        throw new NotFoundException("Policy set not found");
      }

      policySetId = set.rows[0].id;
      policyDsl = set.rows[0].policy_dsl || {};
    }

    const intentRules = Array.isArray(policyDsl.intentRules)
      ? policyDsl.intentRules
      : [];

    const matchedRule = intentRules.find(
      (rule: any) => String(rule?.intent || "").toUpperCase() === input.intent,
    );

    const allowByRule =
      matchedRule?.allow === false
        ? false
        : matchedRule?.requireApproval === true
          ? risk.requiresExplicitApproval
          : true;

    const budgetCheck = await this.checkTriggerBudget({
      merchantId: input.merchantId,
      triggerType: (input.triggerType || "ON_DEMAND") as TriggerType,
      triggerKey,
      requestedAiCalls: 1,
      requestedTokens: 0,
    });

    const allowed = allowByRule && budgetCheck.allowed;

    const simulationResult = {
      intent: input.intent,
      riskTier: risk.tier,
      requiresExplicitApproval: risk.requiresExplicitApproval,
      requiresManagerReview: risk.requiresManagerReview,
      matchedRule: matchedRule || null,
      budgetGate: budgetCheck,
      allowed,
      reasons: [
        ...(allowByRule ? [] : ["Blocked by policy rule"]),
        ...(budgetCheck.allowed
          ? []
          : [budgetCheck.reason || "Budget gate denied"]),
      ],
    };

    await this.pool.query(
      `INSERT INTO control_policy_simulations (
         merchant_id,
         policy_set_id,
         simulation_input,
         simulation_result,
         created_by
       ) VALUES ($1, $2::uuid, $3::jsonb, $4::jsonb, $5)`,
      [
        input.merchantId,
        policySetId,
        JSON.stringify(input.simulationInput || {}),
        JSON.stringify(simulationResult),
        input.createdBy || null,
      ],
    );

    return simulationResult;
  }

  async listTriggerBudgets(merchantId: string) {
    const rows = await this.pool.query(
      `SELECT
         id::text as id,
         trigger_type,
         trigger_key,
         budget_ai_calls_daily,
         budget_tokens_daily,
         enabled,
         config,
         created_at,
         updated_at
       FROM planner_trigger_policies
       WHERE merchant_id = $1
       ORDER BY trigger_type ASC, trigger_key ASC`,
      [merchantId],
    );

    return {
      budgets: rows.rows,
      count: rows.rows.length,
    };
  }

  async upsertTriggerBudget(input: {
    merchantId: string;
    triggerType: TriggerType;
    triggerKey: string;
    budgetAiCallsDaily?: number;
    budgetTokensDaily?: number;
    enabled?: boolean;
    config?: Record<string, any>;
  }) {
    const triggerType = String(input.triggerType || "").toUpperCase();
    this.assertTriggerType(triggerType);

    const triggerKey = String(input.triggerKey || "").trim();
    if (!triggerKey) {
      throw new BadRequestException("triggerKey is required");
    }
    if (triggerKey.length > MAX_TRIGGER_KEY_LENGTH) {
      throw new BadRequestException(
        `triggerKey must be ${MAX_TRIGGER_KEY_LENGTH} characters or fewer`,
      );
    }

    const budgetAiCallsDaily = Math.max(
      0,
      Number(input.budgetAiCallsDaily || 0),
    );
    const budgetTokensDaily = Math.max(0, Number(input.budgetTokensDaily || 0));
    if (budgetAiCallsDaily > MAX_BUDGET_AI_CALLS_DAILY) {
      throw new BadRequestException(
        `budgetAiCallsDaily cannot exceed ${MAX_BUDGET_AI_CALLS_DAILY}`,
      );
    }
    if (budgetTokensDaily > MAX_BUDGET_TOKENS_DAILY) {
      throw new BadRequestException(
        `budgetTokensDaily cannot exceed ${MAX_BUDGET_TOKENS_DAILY}`,
      );
    }

    this.assertJsonWithinLimit(
      input.config,
      MAX_SIMULATION_INPUT_BYTES,
      "config",
    );

    const row = await this.pool.query(
      `INSERT INTO planner_trigger_policies (
         merchant_id,
         trigger_type,
         trigger_key,
         budget_ai_calls_daily,
         budget_tokens_daily,
         enabled,
         config
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (merchant_id, trigger_type, trigger_key)
       DO UPDATE SET
         budget_ai_calls_daily = EXCLUDED.budget_ai_calls_daily,
         budget_tokens_daily = EXCLUDED.budget_tokens_daily,
         enabled = EXCLUDED.enabled,
         config = EXCLUDED.config,
         updated_at = NOW()
       RETURNING
         id::text as id,
         trigger_type,
         trigger_key,
         budget_ai_calls_daily,
         budget_tokens_daily,
         enabled,
         config,
         created_at,
         updated_at`,
      [
        input.merchantId,
        triggerType,
        triggerKey,
        budgetAiCallsDaily,
        budgetTokensDaily,
        input.enabled !== false,
        JSON.stringify(input.config || {}),
      ],
    );

    return row.rows[0];
  }

  async checkTriggerBudget(input: {
    merchantId: string;
    triggerType: TriggerType;
    triggerKey: string;
    requestedAiCalls?: number;
    requestedTokens?: number;
  }) {
    this.assertTriggerType(input.triggerType);
    const triggerKey = String(input.triggerKey || "").trim();
    if (!triggerKey) {
      throw new BadRequestException("triggerKey is required");
    }

    const policy = await this.pool.query<{
      budget_ai_calls_daily: number;
      budget_tokens_daily: number;
      enabled: boolean;
    }>(
      `SELECT budget_ai_calls_daily, budget_tokens_daily, enabled
       FROM planner_trigger_policies
       WHERE merchant_id = $1
         AND trigger_type = $2
         AND trigger_key = $3
       LIMIT 1`,
      [input.merchantId, input.triggerType, triggerKey],
    );

    if (!policy.rows.length) {
      return {
        allowed: true,
        reason: null,
        usedAiCallsToday: 0,
        usedTokensToday: 0,
        budgetAiCallsDaily: 0,
        budgetTokensDaily: 0,
        gateType: "no_policy",
      };
    }

    const cfg = policy.rows[0];
    if (!cfg.enabled) {
      return {
        allowed: false,
        reason: "Trigger policy is disabled",
        usedAiCallsToday: 0,
        usedTokensToday: 0,
        budgetAiCallsDaily: cfg.budget_ai_calls_daily,
        budgetTokensDaily: cfg.budget_tokens_daily,
        gateType: "disabled",
      };
    }

    const usage = await this.pool.query<{
      used_ai_calls: string;
      used_tokens: string;
    }>(
      `SELECT
         COALESCE(SUM(cost_ai_calls), 0)::text as used_ai_calls,
         COALESCE(SUM(cost_tokens), 0)::text as used_tokens
       FROM planner_run_ledger
       WHERE merchant_id = $1
         AND trigger_type = $2
         AND trigger_key = $3
         AND started_at >= date_trunc('day', NOW())`,
      [input.merchantId, input.triggerType, triggerKey],
    );

    const usedAiCalls = Number(usage.rows[0]?.used_ai_calls || 0);
    const usedTokens = Number(usage.rows[0]?.used_tokens || 0);
    const requestedAiCalls = Math.max(0, Number(input.requestedAiCalls || 0));
    const requestedTokens = Math.max(0, Number(input.requestedTokens || 0));

    const aiLimitExceeded =
      cfg.budget_ai_calls_daily > 0 &&
      usedAiCalls + requestedAiCalls > cfg.budget_ai_calls_daily;
    const tokenLimitExceeded =
      cfg.budget_tokens_daily > 0 &&
      usedTokens + requestedTokens > cfg.budget_tokens_daily;

    return {
      allowed: !aiLimitExceeded && !tokenLimitExceeded,
      reason: aiLimitExceeded
        ? "AI calls daily budget exceeded"
        : tokenLimitExceeded
          ? "Token daily budget exceeded"
          : null,
      usedAiCallsToday: usedAiCalls,
      usedTokensToday: usedTokens,
      budgetAiCallsDaily: cfg.budget_ai_calls_daily,
      budgetTokensDaily: cfg.budget_tokens_daily,
      gateType: "enforced",
    };
  }

  async recordPlannerRun(input: {
    merchantId: string;
    triggerType: TriggerType;
    triggerKey: string;
    requestedBy?: string;
    runStatus: "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED";
    reason?: string;
    contextDigest?: Record<string, any>;
    costTokens?: number;
    costAiCalls?: number;
    correlationId?: string;
    error?: string;
    db?: QueryExecutor;
  }) {
    this.assertTriggerType(input.triggerType);

    const triggerKey = String(input.triggerKey || "").trim();
    if (!triggerKey) {
      throw new BadRequestException("triggerKey is required");
    }
    if (triggerKey.length > MAX_TRIGGER_KEY_LENGTH) {
      throw new BadRequestException(
        `triggerKey must be ${MAX_TRIGGER_KEY_LENGTH} characters or fewer`,
      );
    }

    if (
      !["STARTED", "COMPLETED", "FAILED", "SKIPPED"].includes(input.runStatus)
    ) {
      throw new BadRequestException("runStatus is invalid");
    }

    this.assertJsonWithinLimit(
      input.contextDigest,
      MAX_PLANNER_CONTEXT_DIGEST_BYTES,
      "contextDigest",
    );

    const costTokens = Math.max(0, Number(input.costTokens || 0));
    const costAiCalls = Math.max(0, Number(input.costAiCalls || 0));
    if (costAiCalls > MAX_BUDGET_AI_CALLS_DAILY) {
      throw new BadRequestException("costAiCalls exceeds allowed bound");
    }
    if (costTokens > MAX_BUDGET_TOKENS_DAILY) {
      throw new BadRequestException("costTokens exceeds allowed bound");
    }

    const completedAt = input.runStatus === "STARTED" ? null : new Date();

    const db = input.db || this.pool;
    const row = await db.query<{ id: string }>(
      `INSERT INTO planner_run_ledger (
         merchant_id,
         trigger_type,
         trigger_key,
         requested_by,
         budget_snapshot,
         run_status,
         reason,
         context_digest,
         cost_tokens,
         cost_ai_calls,
         correlation_id,
         error,
         started_at,
         completed_at
       ) VALUES (
         $1,
         $2,
         $3,
         $4,
         $5::jsonb,
         $6,
         $7,
         $8::jsonb,
         $9,
         $10,
         $11,
         $12,
         NOW(),
         $13
       )
       RETURNING id::text as id`,
      [
        input.merchantId,
        input.triggerType,
        triggerKey,
        input.requestedBy || null,
        JSON.stringify({ triggerType: input.triggerType, triggerKey }),
        input.runStatus,
        input.reason || null,
        JSON.stringify(input.contextDigest || {}),
        costTokens,
        costAiCalls,
        input.correlationId || null,
        input.error || null,
        completedAt,
      ],
    );

    return { runId: row.rows[0].id };
  }

  async listPlannerRuns(
    merchantId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED";
      triggerType?: TriggerType;
      triggerKey?: string;
    },
  ) {
    const safeLimit = Math.max(1, Math.min(options?.limit ?? 50, 200));
    const safeOffset = Math.max(0, options?.offset ?? 0);

    const where: string[] = ["merchant_id = $1"];
    const values: any[] = [merchantId];

    if (options?.status) {
      values.push(String(options.status).toUpperCase());
      where.push(`run_status = $${values.length}`);
    }

    if (options?.triggerType) {
      this.assertTriggerType(options.triggerType);
      values.push(String(options.triggerType).toUpperCase());
      where.push(`trigger_type = $${values.length}`);
    }

    if (options?.triggerKey) {
      const normalizedTriggerKey = String(options.triggerKey).trim();
      if (normalizedTriggerKey.length > MAX_TRIGGER_KEY_LENGTH) {
        throw new BadRequestException(
          `triggerKey must be ${MAX_TRIGGER_KEY_LENGTH} characters or fewer`,
        );
      }
      values.push(normalizedTriggerKey);
      where.push(`trigger_key = $${values.length}`);
    }

    const whereSql = where.join(" AND ");
    values.push(safeLimit);
    values.push(safeOffset);

    const rows = await this.pool.query(
      `SELECT
         id::text as id,
         trigger_type,
         trigger_key,
         requested_by,
         run_status,
         reason,
         context_digest,
         cost_tokens,
         cost_ai_calls,
         correlation_id,
         error,
         started_at,
         completed_at,
         created_at
       FROM planner_run_ledger
       WHERE ${whereSql}
       ORDER BY started_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    const countValues = values.slice(0, values.length - 2);
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text as total
       FROM planner_run_ledger
       WHERE ${whereSql}`,
      countValues,
    );

    return {
      runs: rows.rows,
      limit: safeLimit,
      offset: safeOffset,
      total: Number(count.rows[0]?.total || 0),
    };
  }

  async getExecutionVisibility(
    merchantId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: PlannerRunStatus;
      triggerType?: TriggerType;
      triggerKey?: string;
    },
  ) {
    const runsResult = await this.listPlannerRuns(merchantId, options);

    const [approvalsByIntent, connectorHealth, deliveryHealth] =
      await Promise.all([
        this.pool.query<{
          intent_key: string;
          pending_count: string;
        }>(
          `SELECT
           UPPER(intent) as intent_key,
           COUNT(*)::text as pending_count
         FROM copilot_action_approvals
         WHERE merchant_id = $1
           AND status IN ('pending', 'confirmed', 'executing')
         GROUP BY UPPER(intent)`,
          [merchantId],
        ),
        this.pool.query<{
          dlq_open: string;
          runtime_pending: string;
        }>(
          `SELECT
           (SELECT COUNT(*)::text FROM connector_runtime_dlq d WHERE d.merchant_id = $1 AND d.status = 'OPEN') as dlq_open,
           (SELECT COUNT(*)::text FROM connector_runtime_events r WHERE r.merchant_id = $1 AND r.status IN ('PENDING','RETRY')) as runtime_pending`,
          [merchantId],
        ),
        this.pool.query<{ breached_24h: string }>(
          `SELECT COUNT(*)::text as breached_24h
         FROM delivery_sla_events
         WHERE merchant_id = $1
           AND status = 'BREACHED'
           AND observed_at >= NOW() - INTERVAL '24 hours'`,
          [merchantId],
        ),
      ]);

    const approvalMap = new Map<string, number>();
    let pendingApprovalsGlobal = 0;
    for (const row of approvalsByIntent.rows) {
      const key = String(row.intent_key || "")
        .trim()
        .toUpperCase();
      const count = Number(row.pending_count || 0);
      if (!key) continue;
      approvalMap.set(key, count);
      pendingApprovalsGlobal += count;
    }

    const connectorDlqOpen = Number(connectorHealth.rows[0]?.dlq_open || 0);
    const connectorRuntimePending = Number(
      connectorHealth.rows[0]?.runtime_pending || 0,
    );
    const deliveryBreaches24h = Number(
      deliveryHealth.rows[0]?.breached_24h || 0,
    );
    const runIds = (runsResult.runs as Array<Record<string, any>>)
      .map((row) => String(row.id || "").trim())
      .filter((row) => row.length > 0);

    const latestTriageByRunId = new Map<
      string,
      {
        ackStatus: string;
        note: string;
        acknowledgedBy: string | null;
        acknowledgedAt: Date | null;
        recommendedAction: string;
      }
    >();

    if (runIds.length > 0) {
      const triageRows = await this.pool.query<{
        run_id: string;
        ack_status: string;
        ack_note: string;
        acked_by: string | null;
        acked_at: Date | null;
        recommended_action: string;
      }>(
        `SELECT DISTINCT ON (run_id)
           run_id::text as run_id,
           ack_status,
           ack_note,
           acked_by,
           acked_at,
           recommended_action
         FROM control_plane_triage_acknowledgements
         WHERE merchant_id = $1
           AND run_id = ANY($2::uuid[])
         ORDER BY run_id, acked_at DESC`,
        [merchantId, runIds],
      );

      for (const row of triageRows.rows) {
        latestTriageByRunId.set(String(row.run_id || ""), {
          ackStatus: String(row.ack_status || "acknowledged"),
          note: String(row.ack_note || "").trim(),
          acknowledgedBy: row.acked_by || null,
          acknowledgedAt: row.acked_at || null,
          recommendedAction: String(row.recommended_action || "MONITOR"),
        });
      }
    }

    const budgetCache = new Map<
      string,
      {
        allowed: boolean;
        reason: string | null;
        gateType?: string;
        usedAiCallsToday?: number;
        usedTokensToday?: number;
        budgetAiCallsDaily?: number;
        budgetTokensDaily?: number;
      }
    >();

    const items = [];

    for (const run of runsResult.runs as Array<Record<string, any>>) {
      const runStatus = String(
        run.run_status || "FAILED",
      ).toUpperCase() as PlannerRunStatus;
      const triggerType = this.normalizeTriggerType(run.trigger_type);
      const triggerKey = String(run.trigger_key || "").trim();
      const triggerKeyUpper = triggerKey.toUpperCase();

      let replayGate: {
        allowed: boolean;
        reason: string | null;
        gateType: string;
        usedAiCallsToday: number;
        usedTokensToday: number;
        budgetAiCallsDaily: number;
        budgetTokensDaily: number;
      } = {
        allowed: false,
        reason: "Trigger key missing for budget validation",
        gateType: "missing_trigger",
        usedAiCallsToday: 0,
        usedTokensToday: 0,
        budgetAiCallsDaily: 0,
        budgetTokensDaily: 0,
      };

      if (triggerKey) {
        const budgetKey = `${triggerType}:${triggerKeyUpper}`;
        const cached = budgetCache.get(budgetKey);
        if (cached) {
          replayGate = {
            allowed: cached.allowed,
            reason: cached.reason,
            gateType: cached.gateType || "enforced",
            usedAiCallsToday: cached.usedAiCallsToday || 0,
            usedTokensToday: cached.usedTokensToday || 0,
            budgetAiCallsDaily: cached.budgetAiCallsDaily || 0,
            budgetTokensDaily: cached.budgetTokensDaily || 0,
          };
        } else {
          const computed = await this.checkTriggerBudget({
            merchantId,
            triggerType,
            triggerKey,
            requestedAiCalls: 1,
            requestedTokens: 0,
          });
          budgetCache.set(budgetKey, computed);
          replayGate = {
            allowed: computed.allowed,
            reason: computed.reason,
            gateType: computed.gateType || "enforced",
            usedAiCallsToday: computed.usedAiCallsToday,
            usedTokensToday: computed.usedTokensToday,
            budgetAiCallsDaily: computed.budgetAiCallsDaily,
            budgetTokensDaily: computed.budgetTokensDaily,
          };
        }
      }

      const pendingApprovalsForTrigger = approvalMap.get(triggerKeyUpper) || 0;
      const recommendedAction = this.getExecutionRecommendedAction({
        runStatus,
        triggerType,
        replayAllowed: replayGate.allowed,
        pendingApprovalsForTrigger,
        pendingApprovalsGlobal,
        connectorDlqOpen,
        deliveryBreaches24h,
      });

      const replaySafeNow =
        ["FAILED", "SKIPPED"].includes(runStatus) && replayGate.allowed;

      items.push({
        runId: String(run.id || ""),
        runStatus,
        triggerType,
        triggerKey,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        reason: run.reason || null,
        replaySafeNow,
        recommendedAction,
        replayGate,
        domainTruth: {
          pendingApprovalsForTrigger,
          pendingApprovalsGlobal,
          connectorDlqOpen,
          connectorRuntimePending,
          deliveryBreaches24h,
        },
        triage: latestTriageByRunId.get(String(run.id || "")) || null,
      });
    }

    return {
      items,
      total: runsResult.total,
      limit: runsResult.limit,
      offset: runsResult.offset,
      domainTruthSummary: {
        pendingApprovalsGlobal,
        connectorDlqOpen,
        connectorRuntimePending,
        deliveryBreaches24h,
      },
    };
  }

  async getCommandCenterFeed(merchantId: string, limit = 25) {
    const safeLimit = Math.max(5, Math.min(limit, 100));

    const [plannerRuns, approvals, dlqItems, deliveryBreaches] =
      await Promise.all([
        this.pool.query<{
          id: string;
          run_status: "FAILED" | "SKIPPED";
          trigger_type: string;
          trigger_key: string;
          reason: string | null;
          started_at: Date;
        }>(
          `SELECT
             id::text as id,
             run_status,
             trigger_type,
             trigger_key,
             reason,
             started_at
           FROM planner_run_ledger
           WHERE merchant_id = $1
             AND run_status IN ('FAILED', 'SKIPPED')
           ORDER BY started_at DESC
           LIMIT $2`,
          [merchantId, safeLimit],
        ),
        this.pool.query<{
          action_id: string;
          intent: string;
          status: string;
          updated_at: Date;
        }>(
          `SELECT
             action_id::text as action_id,
             intent,
             status,
             updated_at
           FROM copilot_action_approvals
           WHERE merchant_id = $1
             AND status IN ('pending', 'confirmed', 'executing')
           ORDER BY updated_at DESC
           LIMIT $2`,
          [merchantId, safeLimit],
        ),
        this.pool.query<{
          id: string;
          event_type: string;
          last_error: string | null;
          moved_to_dlq_at: Date;
        }>(
          `SELECT
             id::text as id,
             event_type,
             last_error,
             moved_to_dlq_at
           FROM connector_runtime_dlq
           WHERE merchant_id = $1
             AND status = 'OPEN'
           ORDER BY moved_to_dlq_at DESC
           LIMIT $2`,
          [merchantId, safeLimit],
        ),
        this.pool.query<{
          id: string;
          sla_type: string;
          reason: string | null;
          observed_at: Date;
        }>(
          `SELECT
             id::text as id,
             sla_type,
             reason,
             observed_at
           FROM delivery_sla_events
           WHERE merchant_id = $1
             AND status = 'BREACHED'
             AND observed_at >= NOW() - INTERVAL '48 hours'
           ORDER BY observed_at DESC
           LIMIT $2`,
          [merchantId, safeLimit],
        ),
      ]);

    const feed = [
      ...plannerRuns.rows.map((row) => ({
        id: `planner-${row.id}`,
        category: "planner",
        severity: row.run_status === "FAILED" ? "high" : "medium",
        title:
          row.run_status === "FAILED"
            ? "Planner run failed"
            : "Planner run skipped",
        message:
          row.reason ||
          `${row.trigger_type}:${row.trigger_key} ended with ${row.run_status}`,
        referenceId: row.id,
        createdAt: row.started_at,
      })),
      ...approvals.rows.map((row) => {
        const risk = evaluateCopilotActionRisk(
          String(row.intent) as CopilotIntent,
        );
        return {
          id: `approval-${row.action_id}`,
          category: "approval",
          severity:
            risk.tier === "critical"
              ? "high"
              : risk.tier === "high"
                ? "medium"
                : "low",
          title: "Copilot approval pending",
          message: `${row.intent} is ${row.status}`,
          referenceId: row.action_id,
          createdAt: row.updated_at,
        };
      }),
      ...dlqItems.rows.map((row) => ({
        id: `dlq-${row.id}`,
        category: "connector",
        severity: "high",
        title: "Connector event in DLQ",
        message: `${row.event_type} moved to DLQ${row.last_error ? `: ${row.last_error}` : ""}`,
        referenceId: row.id,
        createdAt: row.moved_to_dlq_at,
      })),
      ...deliveryBreaches.rows.map((row) => ({
        id: `delivery-sla-${row.id}`,
        category: "delivery",
        severity: "high",
        title: "Delivery SLA breached",
        message: row.reason || `${row.sla_type} breached`,
        referenceId: row.id,
        createdAt: row.observed_at,
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, safeLimit);

    return {
      items: feed,
      limit: safeLimit,
    };
  }

  async replayPlannerRun(input: {
    merchantId: string;
    runId: string;
    requestedBy?: string;
    reason?: string;
    dryRun?: boolean;
    confirmReplay?: boolean;
    previewToken?: string;
  }) {
    let previewToken = "";
    let tokenPayload: ReplayPreviewTokenPayload | null = null;
    if (!input.dryRun) {
      if (input.confirmReplay !== true) {
        throw new BadRequestException(
          "Explicit operator confirmation required (confirmReplay=true)",
        );
      }

      previewToken = String(input.previewToken || "").trim();
      if (!previewToken) {
        throw new BadRequestException(
          "Replay preview token is required (previewToken)",
        );
      }

      tokenPayload = this.verifyReplayPreviewTokenEnvelope({
        token: previewToken,
        merchantId: input.merchantId,
        runId: input.runId,
      });
    }

    const previewContext = await this.buildReplayPreviewContext({
      merchantId: input.merchantId,
      runId: input.runId,
    });
    const sourceRun = previewContext.sourceRun;
    if (sourceRun.runStatus === "STARTED") {
      throw new BadRequestException(
        "Cannot replay a run that is still STARTED",
      );
    }

    if (input.dryRun) {
      return {
        sourceRunId: sourceRun.id,
        dryRun: true,
        allowed: previewContext.allowedToReplayNow,
        gateReason:
          previewContext.blockingReasons[0] || previewContext.budgetGate.reason,
        triggerType: sourceRun.triggerType,
        triggerKey: sourceRun.triggerKey,
      };
    }

    if (!tokenPayload) {
      throw new BadRequestException("Replay preview token validation failed");
    }

    const replayNote = this.normalizeReplayOperatorNote(input.reason);

    const previewTokenHash = this.computeReplayPreviewTokenHash(previewToken);
    const alreadyConsumed = await this.isReplayPreviewTokenConsumed({
      merchantId: input.merchantId,
      previewTokenHash,
    });
    if (alreadyConsumed) {
      throw new BadRequestException(
        "Replay preview token already consumed; refresh preview",
      );
    }

    if (tokenPayload.previewContextHash !== previewContext.contextHash) {
      throw new BadRequestException(
        "Replay preview token does not match current replay context; refresh preview",
      );
    }

    if (!previewContext.allowedToReplayNow) {
      throw new BadRequestException(
        `Replay preview safety check failed: ${previewContext.blockingReasons[0] || "blocked"}`,
      );
    }

    const runStatus: PlannerRunStatus = "STARTED";
    const replayConfirmedAt = new Date().toISOString();
    const recorded = await this.runInTransaction(async (db) => {
      await this.claimReplayPreviewToken({
        db,
        merchantId: input.merchantId,
        sourceRunId: sourceRun.id,
        previewTokenHash,
        previewContextHash: tokenPayload.previewContextHash,
        operatorNote: replayNote,
        consumedBy: input.requestedBy,
        consumedAt: replayConfirmedAt,
      });

      const createdReplayRun = await this.recordPlannerRun({
        merchantId: input.merchantId,
        triggerType: sourceRun.triggerType,
        triggerKey: sourceRun.triggerKey,
        requestedBy: input.requestedBy,
        runStatus,
        reason: `Manual replay confirmed by operator note: ${replayNote}`,
        contextDigest: {
          ...(sourceRun.contextDigest || {}),
          replayOfRunId: sourceRun.id,
          replayRequestedAt: replayConfirmedAt,
          replayPreviewGeneratedAt: tokenPayload.previewGeneratedAt,
          replayPreviewContextHash: tokenPayload.previewContextHash,
          replayPreviewTokenHash: previewTokenHash,
          replayPreviewTokenExpiresAt: tokenPayload.previewExpiresAt,
          replayOperatorNote: {
            note: replayNote,
            confirmedBy: input.requestedBy || null,
            confirmedAt: replayConfirmedAt,
            source: "control-plane-command-center",
          },
        },
        correlationId: `replay-${sourceRun.id}-${randomUUID()}`,
        costAiCalls: 0,
        costTokens: 0,
        db,
      });

      await db.query(
        `UPDATE control_plane_replay_token_consumptions
         SET replay_run_id = $1::uuid,
             updated_at = NOW()
         WHERE merchant_id = $2
           AND preview_token_hash = $3`,
        [createdReplayRun.runId, input.merchantId, previewTokenHash],
      );

      return createdReplayRun;
    });

    return {
      sourceRunId: sourceRun.id,
      replayRunId: recorded.runId,
      allowed: previewContext.budgetGate.allowed,
      gateReason: previewContext.budgetGate.reason,
      runStatus,
      triggerType: sourceRun.triggerType,
      triggerKey: sourceRun.triggerKey,
      operatorReplayNote: replayNote,
    };
  }

  async getPlannerRunReplayPreview(input: {
    merchantId: string;
    runId: string;
  }) {
    const previewContext = await this.buildReplayPreviewContext(input);
    const previewGeneratedAt = new Date().toISOString();
    const previewExpiresAt = new Date(
      new Date(previewGeneratedAt).getTime() + REPLAY_PREVIEW_TOKEN_TTL_MS,
    ).toISOString();
    const previewToken = this.createReplayPreviewToken({
      v: 1,
      merchantId: input.merchantId,
      runId: previewContext.sourceRun.id,
      previewGeneratedAt,
      previewExpiresAt,
      previewContextHash: previewContext.contextHash,
    });

    return {
      sourceRun: {
        id: previewContext.sourceRun.id,
        triggerType: previewContext.sourceRun.triggerType,
        triggerKey: previewContext.sourceRun.triggerKey,
        runStatus: previewContext.sourceRun.runStatus,
        reason: previewContext.sourceRun.reason,
        startedAt: previewContext.sourceRun.startedAt,
        completedAt: previewContext.sourceRun.completedAt,
        createdAt: previewContext.sourceRun.createdAt,
      },
      confirmationRequired: true,
      allowedToReplayNow: previewContext.allowedToReplayNow,
      predictedReplayRunStatus: previewContext.allowedToReplayNow
        ? "STARTED"
        : "SKIPPED",
      budgetGate: previewContext.budgetGate,
      safetySummary: {
        pendingApprovalsForTrigger:
          previewContext.safetySummary.pendingApprovalsForTrigger,
        replayAttemptsForSource:
          previewContext.safetySummary.replayAttemptsForSource,
        latestReplayAt: previewContext.safetySummary.latestReplayAt,
        connectorDlqOpenForTrigger:
          previewContext.safetySummary.connectorDlqOpenForTrigger,
      },
      blockingReasons: previewContext.blockingReasons,
      previewGeneratedAt,
      operatorNotePolicy: {
        required: true,
        minLength: REPLAY_OPERATOR_NOTE_MIN_LENGTH,
        maxLength: REPLAY_OPERATOR_NOTE_MAX_LENGTH,
      },
      binding: {
        previewToken,
        previewTokenExpiresAt: previewExpiresAt,
        previewContextHash: previewContext.contextHash,
      },
    };
  }

  async getPlannerRunDrilldown(input: { merchantId: string; runId: string }) {
    const runResult = await this.pool.query<{
      id: string;
      trigger_type: TriggerType;
      trigger_key: string;
      requested_by: string | null;
      run_status: PlannerRunStatus;
      reason: string | null;
      context_digest: Record<string, any>;
      cost_tokens: number;
      cost_ai_calls: number;
      correlation_id: string | null;
      error: string | null;
      started_at: Date;
      completed_at: Date | null;
      created_at: Date;
    }>(
      `SELECT
         id::text as id,
         trigger_type,
         trigger_key,
         requested_by,
         run_status,
         reason,
         context_digest,
         cost_tokens,
         cost_ai_calls,
         correlation_id,
         error,
         started_at,
         completed_at,
         created_at
       FROM planner_run_ledger
       WHERE merchant_id = $1
         AND id::text = $2
       LIMIT 1`,
      [input.merchantId, input.runId],
    );

    if (!runResult.rows.length) {
      throw new NotFoundException("Planner run not found");
    }

    const run = runResult.rows[0];
    const triggerType = this.normalizeTriggerType(run.trigger_type);
    const triggerKey = String(run.trigger_key || "").trim();

    const budgetGate = triggerKey
      ? await this.checkTriggerBudget({
          merchantId: input.merchantId,
          triggerType,
          triggerKey,
          requestedAiCalls: 1,
          requestedTokens: 0,
        })
      : {
          allowed: false,
          reason: "Trigger key missing for budget validation",
          gateType: "missing_trigger",
          usedAiCallsToday: 0,
          usedTokensToday: 0,
          budgetAiCallsDaily: 0,
          budgetTokensDaily: 0,
        };

    const [
      approvalRows,
      replayRows,
      connectorRuntimeRows,
      connectorDlqRows,
      deliveryRows,
      replayConsumptionRows,
      triageAckRows,
    ] = await Promise.all([
      this.pool.query<{
        action_id: string;
        intent: string;
        source: string;
        status: string;
        actor_role: string | null;
        actor_id: string | null;
        details: Record<string, any> | null;
        execution_result: Record<string, any> | null;
        pending_at: Date | null;
        confirmed_at: Date | null;
        denied_at: Date | null;
        cancelled_at: Date | null;
        expired_at: Date | null;
        executing_at: Date | null;
        executed_at: Date | null;
        updated_at: Date;
      }>(
        `SELECT
             action_id::text as action_id,
             intent,
             source,
             status,
             actor_role,
             actor_id,
             details,
             execution_result,
             pending_at,
             confirmed_at,
             denied_at,
             cancelled_at,
             expired_at,
             executing_at,
             executed_at,
             updated_at
           FROM copilot_action_approvals
           WHERE merchant_id = $1
             AND UPPER(intent) = UPPER($2)
           ORDER BY updated_at DESC
           LIMIT 25`,
        [input.merchantId, triggerKey],
      ),
      this.pool.query<{
        id: string;
        run_status: PlannerRunStatus;
        reason: string | null;
        started_at: Date;
        correlation_id: string | null;
        replay_of_run_id: string | null;
      }>(
        `SELECT
             id::text as id,
             run_status,
             reason,
             started_at,
             correlation_id,
             (context_digest ->> 'replayOfRunId') as replay_of_run_id
           FROM planner_run_ledger
           WHERE merchant_id = $1
             AND trigger_type = $2
             AND trigger_key = $3
             AND (
               id::text = $4
               OR (context_digest ->> 'replayOfRunId') = $4
             )
           ORDER BY started_at DESC
           LIMIT 25`,
        [input.merchantId, triggerType, triggerKey, input.runId],
      ),
      this.pool.query<{
        id: string;
        endpoint_id: string | null;
        event_type: string;
        status: string;
        attempt_count: number;
        max_attempts: number;
        last_error: string | null;
        next_retry_at: Date | null;
        processed_at: Date | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT
             id::text as id,
             endpoint_id::text as endpoint_id,
             event_type,
             status,
             attempt_count,
             max_attempts,
             last_error,
             next_retry_at,
             processed_at,
             created_at,
             updated_at
           FROM connector_runtime_events
           WHERE merchant_id = $1
             AND UPPER(event_type) = UPPER($2)
           ORDER BY created_at DESC
           LIMIT 15`,
        [input.merchantId, triggerKey],
      ),
      this.pool.query<{
        id: string;
        runtime_event_id: string | null;
        endpoint_id: string | null;
        event_type: string;
        status: string;
        last_error: string | null;
        moved_to_dlq_at: Date;
        replayed_at: Date | null;
        replay_count: number;
      }>(
        `SELECT
             id::text as id,
             runtime_event_id::text as runtime_event_id,
             endpoint_id::text as endpoint_id,
             event_type,
             status,
             last_error,
             moved_to_dlq_at,
             replayed_at,
             replay_count
           FROM connector_runtime_dlq
           WHERE merchant_id = $1
             AND UPPER(event_type) = UPPER($2)
           ORDER BY moved_to_dlq_at DESC
           LIMIT 15`,
        [input.merchantId, triggerKey],
      ),
      this.pool.query<{
        id: string;
        order_id: string | null;
        order_number: string | null;
        sla_type: string;
        status: string;
        observed_at: Date;
        minutes_delta: number | null;
        reason: string | null;
        metadata: Record<string, any> | null;
      }>(
        `SELECT
             s.id::text as id,
             s.order_id::text as order_id,
             o.order_number,
             s.sla_type,
             s.status,
             s.observed_at,
             s.minutes_delta,
             s.reason,
             s.metadata
           FROM delivery_sla_events s
           LEFT JOIN orders o ON o.id::text = s.order_id::text
           WHERE s.merchant_id = $1
             AND UPPER(s.sla_type) = UPPER($2)
           ORDER BY s.observed_at DESC
           LIMIT 15`,
        [input.merchantId, triggerKey],
      ),
      this.pool.query<{
        id: string;
        source_run_id: string;
        replay_run_id: string | null;
        preview_token_hash: string;
        preview_context_hash: string;
        operator_note: string;
        consumed_by: string | null;
        consumed_at: Date;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT
             id::text as id,
             source_run_id::text as source_run_id,
             replay_run_id::text as replay_run_id,
             preview_token_hash,
             preview_context_hash,
             operator_note,
             consumed_by,
             consumed_at,
             created_at,
             updated_at
           FROM control_plane_replay_token_consumptions
           WHERE merchant_id = $1
             AND source_run_id::text = $2
           ORDER BY consumed_at DESC
           LIMIT 25`,
        [input.merchantId, input.runId],
      ),
      this.pool.query<{
        id: string;
        run_id: string;
        recommended_action: string;
        ack_status: string;
        ack_note: string;
        acked_by: string | null;
        acked_at: Date;
        metadata: Record<string, any> | null;
        created_at: Date;
      }>(
        `SELECT
             id::text as id,
             run_id::text as run_id,
             recommended_action,
             ack_status,
             ack_note,
             acked_by,
             acked_at,
             metadata,
             created_at
           FROM control_plane_triage_acknowledgements
           WHERE merchant_id = $1
             AND run_id::text = $2
           ORDER BY acked_at DESC
           LIMIT 25`,
        [input.merchantId, input.runId],
      ),
    ]);

    const replaySafeNow =
      ["FAILED", "SKIPPED"].includes(String(run.run_status || "")) &&
      budgetGate.allowed;

    const pendingApprovals = approvalRows.rows.filter((row) =>
      ["pending", "confirmed", "executing"].includes(
        String(row.status || "").toLowerCase(),
      ),
    ).length;

    const dlqOpen = connectorDlqRows.rows.filter(
      (row) => String(row.status || "").toUpperCase() === "OPEN",
    ).length;

    const activeBreaches = deliveryRows.rows.filter(
      (row) => String(row.status || "").toUpperCase() === "BREACHED",
    ).length;

    let recommendedNextAction: ExecutionRecommendedAction = "MONITOR";
    if (!budgetGate.allowed) {
      recommendedNextAction = "ADJUST_TRIGGER_BUDGET";
    } else if (pendingApprovals > 0) {
      recommendedNextAction = "REVIEW_PENDING_APPROVALS";
    } else if (dlqOpen > 0) {
      recommendedNextAction = "RETRY_CONNECTOR_DLQ";
    } else if (activeBreaches > 0) {
      recommendedNextAction = "EXECUTE_DELIVERY_ESCALATIONS";
    } else if (
      ["FAILED", "SKIPPED"].includes(String(run.run_status || "").toUpperCase())
    ) {
      recommendedNextAction = "REPLAY_RUN";
    }

    return {
      run: {
        id: run.id,
        triggerType,
        triggerKey,
        requestedBy: run.requested_by,
        runStatus: run.run_status,
        reason: run.reason,
        contextDigest: run.context_digest || {},
        costTokens: Number(run.cost_tokens || 0),
        costAiCalls: Number(run.cost_ai_calls || 0),
        correlationId: run.correlation_id,
        error: run.error,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        createdAt: run.created_at,
      },
      replaySafety: {
        replaySafeNow,
        gate: budgetGate,
      },
      recommendedNextAction,
      correlatedEvidence: {
        approvals: approvalRows.rows,
        replayAttempts: replayRows.rows,
        connectorRuntime: connectorRuntimeRows.rows,
        connectorDlq: connectorDlqRows.rows,
        deliveryBreaches: deliveryRows.rows,
        replayConsumptions: replayConsumptionRows.rows,
        triageAcks: triageAckRows.rows,
      },
      stats: {
        pendingApprovals,
        replayAttempts: replayRows.rows.length,
        connectorRuntimeRows: connectorRuntimeRows.rows.length,
        connectorDlqOpen: dlqOpen,
        deliveryActiveBreaches: activeBreaches,
        replayTokenConsumptions: replayConsumptionRows.rows.length,
        triageAcknowledgements: triageAckRows.rows.length,
      },
    };
  }

  async getCommandCenterOverview(merchantId: string) {
    const [plannerRuns, approvals, connector, delivery, simulations] =
      await Promise.all([
        this.pool.query<{
          total_runs: string;
          failed_runs: string;
          skipped_runs: string;
        }>(
          `SELECT
             COUNT(*)::text as total_runs,
             COUNT(*) FILTER (WHERE run_status = 'FAILED')::text as failed_runs,
             COUNT(*) FILTER (WHERE run_status = 'SKIPPED')::text as skipped_runs
           FROM planner_run_ledger
           WHERE merchant_id = $1
             AND started_at >= NOW() - INTERVAL '24 hours'`,
          [merchantId],
        ),
        this.pool.query<{ pending_approvals: string }>(
          `SELECT COUNT(*)::text as pending_approvals
           FROM copilot_action_approvals
           WHERE merchant_id = $1
             AND status IN ('pending', 'confirmed', 'executing')`,
          [merchantId],
        ),
        this.pool.query<{
          dlq_open: string;
          runtime_pending: string;
        }>(
          `SELECT
             (SELECT COUNT(*)::text FROM connector_runtime_dlq d WHERE d.merchant_id = $1 AND d.status = 'OPEN') as dlq_open,
             (SELECT COUNT(*)::text FROM connector_runtime_events r WHERE r.merchant_id = $1 AND r.status IN ('PENDING','RETRY')) as runtime_pending`,
          [merchantId],
        ),
        this.pool.query<{ recent_delivery_events: string }>(
          `SELECT COUNT(*)::text as recent_delivery_events
           FROM delivery_execution_events
           WHERE merchant_id = $1
             AND event_time >= NOW() - INTERVAL '24 hours'`,
          [merchantId],
        ),
        this.pool.query<{ simulation_count: string }>(
          `SELECT COUNT(*)::text as simulation_count
           FROM control_policy_simulations
           WHERE merchant_id = $1
             AND created_at >= NOW() - INTERVAL '7 days'`,
          [merchantId],
        ),
      ]);

    return {
      planner: {
        totalRuns24h: Number(plannerRuns.rows[0]?.total_runs || 0),
        failedRuns24h: Number(plannerRuns.rows[0]?.failed_runs || 0),
        skippedRuns24h: Number(plannerRuns.rows[0]?.skipped_runs || 0),
      },
      approvals: {
        pending: Number(approvals.rows[0]?.pending_approvals || 0),
      },
      connectors: {
        runtimePending: Number(connector.rows[0]?.runtime_pending || 0),
        dlqOpen: Number(connector.rows[0]?.dlq_open || 0),
      },
      delivery: {
        recentEvents24h: Number(delivery.rows[0]?.recent_delivery_events || 0),
      },
      policy: {
        simulations7d: Number(simulations.rows[0]?.simulation_count || 0),
      },
    };
  }

  async acknowledgePlannerRunTriage(input: {
    merchantId: string;
    runId: string;
    recommendedAction: ExecutionRecommendedAction;
    ackStatus?: TriageAckStatus;
    note: string;
    acknowledgedBy?: string;
    metadata?: Record<string, any>;
  }) {
    const runResult = await this.pool.query<{
      trigger_type: TriggerType;
      trigger_key: string;
    }>(
      `SELECT trigger_type, trigger_key
       FROM planner_run_ledger
       WHERE merchant_id = $1
         AND id::text = $2
       LIMIT 1`,
      [input.merchantId, input.runId],
    );

    if (!runResult.rows.length) {
      throw new NotFoundException("Planner run not found");
    }

    const recommendedAction = this.assertExecutionRecommendedAction(
      input.recommendedAction,
    );
    const ackStatus = this.normalizeTriageAckStatus(input.ackStatus);
    const note = this.normalizeTriageAckNote(input.note);

    this.assertJsonWithinLimit(
      input.metadata,
      MAX_SIMULATION_INPUT_BYTES,
      "triage metadata",
    );

    const run = runResult.rows[0];
    const inserted = await this.pool.query<{
      id: string;
      run_id: string;
      trigger_type: string;
      trigger_key: string;
      recommended_action: string;
      ack_status: string;
      ack_note: string;
      acked_by: string | null;
      acked_at: Date;
      metadata: Record<string, any>;
    }>(
      `INSERT INTO control_plane_triage_acknowledgements (
         merchant_id,
         run_id,
         trigger_type,
         trigger_key,
         recommended_action,
         ack_status,
         ack_note,
         acked_by,
         metadata
       ) VALUES (
         $1,
         $2::uuid,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9::jsonb
       )
       RETURNING
         id::text as id,
         run_id::text as run_id,
         trigger_type,
         trigger_key,
         recommended_action,
         ack_status,
         ack_note,
         acked_by,
         acked_at,
         metadata`,
      [
        input.merchantId,
        input.runId,
        this.normalizeTriggerType(run.trigger_type),
        String(run.trigger_key || "").trim(),
        recommendedAction,
        ackStatus,
        note,
        input.acknowledgedBy || null,
        JSON.stringify(input.metadata || {}),
      ],
    );

    return {
      acknowledgement: inserted.rows[0],
    };
  }

  private assertTriggerType(triggerTypeRaw: string) {
    const triggerType = String(triggerTypeRaw || "").toUpperCase();
    if (
      !["EVENT", "SCHEDULED", "ON_DEMAND", "ESCALATION"].includes(triggerType)
    ) {
      throw new BadRequestException("Invalid triggerType");
    }
  }

  private normalizeTriggerType(triggerTypeRaw: string): TriggerType {
    const normalized = String(triggerTypeRaw || "ON_DEMAND").toUpperCase();
    if (
      ["EVENT", "SCHEDULED", "ON_DEMAND", "ESCALATION"].includes(normalized)
    ) {
      return normalized as TriggerType;
    }
    return "ON_DEMAND";
  }

  private assertExecutionRecommendedAction(
    actionRaw: string,
  ): ExecutionRecommendedAction {
    const normalized = String(actionRaw || "")
      .trim()
      .toUpperCase();
    if (
      normalized === "MONITOR" ||
      normalized === "REPLAY_RUN" ||
      normalized === "REVIEW_PENDING_APPROVALS" ||
      normalized === "ADJUST_TRIGGER_BUDGET" ||
      normalized === "RETRY_CONNECTOR_DLQ" ||
      normalized === "EXECUTE_DELIVERY_ESCALATIONS"
    ) {
      return normalized as ExecutionRecommendedAction;
    }
    throw new BadRequestException("Invalid recommendedAction");
  }

  private normalizeTriageAckStatus(raw: string | undefined): TriageAckStatus {
    const normalized = String(raw || "acknowledged")
      .trim()
      .toLowerCase();
    if (normalized === "acknowledged" || normalized === "deferred") {
      return normalized;
    }
    throw new BadRequestException("ackStatus must be acknowledged or deferred");
  }

  private normalizeTriageAckNote(raw: string | undefined): string {
    const note = String(raw || "").trim();
    if (!note) {
      throw new BadRequestException("Triage acknowledgement note is required");
    }
    if (note.length < TRIAGE_ACK_NOTE_MIN_LENGTH) {
      throw new BadRequestException(
        `Triage note must be at least ${TRIAGE_ACK_NOTE_MIN_LENGTH} characters`,
      );
    }
    if (note.length > TRIAGE_ACK_NOTE_MAX_LENGTH) {
      throw new BadRequestException(
        `Triage note must be ${TRIAGE_ACK_NOTE_MAX_LENGTH} characters or fewer`,
      );
    }
    return note;
  }

  private getExecutionRecommendedAction(input: {
    runStatus: PlannerRunStatus;
    triggerType: TriggerType;
    replayAllowed: boolean;
    pendingApprovalsForTrigger: number;
    pendingApprovalsGlobal: number;
    connectorDlqOpen: number;
    deliveryBreaches24h: number;
  }): ExecutionRecommendedAction {
    if (input.runStatus === "STARTED") {
      return "MONITOR";
    }

    if (input.runStatus === "FAILED" || input.runStatus === "SKIPPED") {
      if (!input.replayAllowed) {
        return "ADJUST_TRIGGER_BUDGET";
      }

      if (
        input.pendingApprovalsForTrigger > 0 ||
        (input.runStatus === "SKIPPED" && input.pendingApprovalsGlobal > 0)
      ) {
        return "REVIEW_PENDING_APPROVALS";
      }

      if (input.triggerType === "EVENT" && input.connectorDlqOpen > 0) {
        return "RETRY_CONNECTOR_DLQ";
      }

      if (input.deliveryBreaches24h > 0) {
        return "EXECUTE_DELIVERY_ESCALATIONS";
      }

      return "REPLAY_RUN";
    }

    if (input.deliveryBreaches24h > 0) {
      return "EXECUTE_DELIVERY_ESCALATIONS";
    }

    return "MONITOR";
  }

  private async buildReplayPreviewContext(input: {
    merchantId: string;
    runId: string;
  }): Promise<ReplayPreviewContext> {
    const source = await this.pool.query<{
      id: string;
      trigger_type: TriggerType;
      trigger_key: string;
      run_status: PlannerRunStatus;
      reason: string | null;
      started_at: Date;
      completed_at: Date | null;
      created_at: Date;
      context_digest: Record<string, any>;
    }>(
      `SELECT
         id::text as id,
         trigger_type,
         trigger_key,
         run_status,
         reason,
         started_at,
         completed_at,
         created_at,
         context_digest
       FROM planner_run_ledger
       WHERE merchant_id = $1
         AND id::text = $2
       LIMIT 1`,
      [input.merchantId, input.runId],
    );

    if (!source.rows.length) {
      throw new NotFoundException("Planner run not found");
    }

    const sourceRow = source.rows[0];
    const triggerType = this.normalizeTriggerType(sourceRow.trigger_type);
    const triggerKey = String(sourceRow.trigger_key || "").trim();

    const replayEligibleByStatus = ["FAILED", "SKIPPED"].includes(
      String(sourceRow.run_status || "").toUpperCase(),
    );

    const budgetGate = triggerKey
      ? await this.checkTriggerBudget({
          merchantId: input.merchantId,
          triggerType,
          triggerKey,
          requestedAiCalls: 1,
          requestedTokens: 0,
        })
      : {
          allowed: false,
          reason: "Trigger key missing for budget validation",
          gateType: "missing_trigger",
          usedAiCallsToday: 0,
          usedTokensToday: 0,
          budgetAiCallsDaily: 0,
          budgetTokensDaily: 0,
        };

    const [approvalCountRows, replayHistoryRows, connectorDlqRows] =
      await Promise.all([
        triggerKey
          ? this.pool.query<{ pending_count: string }>(
              `SELECT COUNT(*)::text as pending_count
             FROM copilot_action_approvals
             WHERE merchant_id = $1
               AND UPPER(intent) = UPPER($2)
               AND status IN ('pending', 'confirmed', 'executing')`,
              [input.merchantId, triggerKey],
            )
          : Promise.resolve({ rows: [{ pending_count: "0" }] } as any),
        this.pool.query<{
          replay_count: string;
          latest_replay_at: Date | null;
        }>(
          `SELECT
           COUNT(*)::text as replay_count,
           MAX(started_at) as latest_replay_at
         FROM planner_run_ledger
         WHERE merchant_id = $1
           AND (context_digest ->> 'replayOfRunId') = $2`,
          [input.merchantId, sourceRow.id],
        ),
        triggerKey
          ? this.pool.query<{ open_dlq: string }>(
              `SELECT COUNT(*)::text as open_dlq
             FROM connector_runtime_dlq
             WHERE merchant_id = $1
               AND UPPER(event_type) = UPPER($2)
               AND status = 'OPEN'`,
              [input.merchantId, triggerKey],
            )
          : Promise.resolve({ rows: [{ open_dlq: "0" }] } as any),
      ]);

    const safetySummary = {
      pendingApprovalsForTrigger: Number(
        approvalCountRows.rows[0]?.pending_count || 0,
      ),
      replayAttemptsForSource: Number(
        replayHistoryRows.rows[0]?.replay_count || 0,
      ),
      latestReplayAt: replayHistoryRows.rows[0]?.latest_replay_at || null,
      connectorDlqOpenForTrigger: Number(
        connectorDlqRows.rows[0]?.open_dlq || 0,
      ),
    };

    const blockingReasons: string[] = [];
    if (!replayEligibleByStatus) {
      blockingReasons.push("Only FAILED and SKIPPED runs can be replayed");
    }
    if (!budgetGate.allowed) {
      blockingReasons.push(
        budgetGate.reason || "Replay budget gate blocked this replay",
      );
    }

    const contextHash = this.computeReplayPreviewContextHash({
      merchantId: input.merchantId,
      runId: sourceRow.id,
      triggerType,
      triggerKey,
      runStatus: sourceRow.run_status,
      budgetGate,
      safetySummary,
    });

    return {
      sourceRun: {
        id: sourceRow.id,
        triggerType,
        triggerKey,
        runStatus: sourceRow.run_status,
        reason: sourceRow.reason,
        startedAt: sourceRow.started_at,
        completedAt: sourceRow.completed_at,
        createdAt: sourceRow.created_at,
        contextDigest: sourceRow.context_digest || {},
      },
      budgetGate,
      safetySummary,
      replayEligibleByStatus,
      allowedToReplayNow: replayEligibleByStatus && budgetGate.allowed,
      blockingReasons,
      contextHash,
    };
  }

  private computeReplayPreviewContextHash(input: {
    merchantId: string;
    runId: string;
    triggerType: TriggerType;
    triggerKey: string;
    runStatus: PlannerRunStatus;
    budgetGate: ReplayPreviewContext["budgetGate"];
    safetySummary: ReplayPreviewContext["safetySummary"];
  }): string {
    const canonical = {
      merchantId: input.merchantId,
      runId: input.runId,
      triggerType: input.triggerType,
      triggerKey: input.triggerKey,
      runStatus: input.runStatus,
      budgetGate: {
        allowed: input.budgetGate.allowed,
        reason: input.budgetGate.reason,
        gateType: input.budgetGate.gateType,
        usedAiCallsToday: Number(input.budgetGate.usedAiCallsToday || 0),
        usedTokensToday: Number(input.budgetGate.usedTokensToday || 0),
        budgetAiCallsDaily: Number(input.budgetGate.budgetAiCallsDaily || 0),
        budgetTokensDaily: Number(input.budgetGate.budgetTokensDaily || 0),
      },
      safetySummary: {
        pendingApprovalsForTrigger: Number(
          input.safetySummary.pendingApprovalsForTrigger || 0,
        ),
        replayAttemptsForSource: Number(
          input.safetySummary.replayAttemptsForSource || 0,
        ),
        latestReplayAt: input.safetySummary.latestReplayAt
          ? new Date(input.safetySummary.latestReplayAt).toISOString()
          : null,
        connectorDlqOpenForTrigger: Number(
          input.safetySummary.connectorDlqOpenForTrigger || 0,
        ),
      },
    };

    return createHash("sha256")
      .update(JSON.stringify(canonical), "utf8")
      .digest("hex");
  }

  private createReplayPreviewToken(payload: ReplayPreviewTokenPayload): string {
    const encodedPayload = Buffer.from(
      JSON.stringify(payload),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", this.getReplayPreviewTokenSecret())
      .update(encodedPayload)
      .digest("base64url");
    return `${encodedPayload}.${signature}`;
  }

  private verifyReplayPreviewTokenEnvelope(input: {
    token: string;
    merchantId: string;
    runId: string;
  }): ReplayPreviewTokenPayload {
    const parts = String(input.token || "")
      .trim()
      .split(".");
    if (parts.length !== 2) {
      throw new BadRequestException("Invalid replay preview token");
    }

    const encodedPayload = parts[0];
    const signature = parts[1];
    const expectedSignature = createHmac(
      "sha256",
      this.getReplayPreviewTokenSecret(),
    )
      .update(encodedPayload)
      .digest("base64url");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const providedBuffer = Buffer.from(signature, "utf8");
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new BadRequestException("Invalid replay preview token signature");
    }

    let payload: ReplayPreviewTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, "base64url").toString("utf8"),
      ) as ReplayPreviewTokenPayload;
    } catch {
      throw new BadRequestException("Invalid replay preview token payload");
    }

    if (!payload || payload.v !== 1) {
      throw new BadRequestException("Unsupported replay preview token version");
    }

    if (
      payload.merchantId !== input.merchantId ||
      payload.runId !== input.runId
    ) {
      throw new BadRequestException(
        "Replay preview token does not match merchant/run",
      );
    }

    const expiresAtMs = new Date(payload.previewExpiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      throw new BadRequestException("Invalid replay preview token expiry");
    }
    if (Date.now() > expiresAtMs) {
      throw new BadRequestException(
        "Replay preview token expired; refresh preview",
      );
    }

    return payload;
  }

  private getReplayPreviewTokenSecret(): string {
    const secret = String(
      process.env.CONTROL_PLANE_REPLAY_PREVIEW_SECRET ||
        process.env.JWT_SECRET ||
        process.env.DATABASE_URL ||
        "",
    ).trim();

    if (!secret) {
      throw new BadRequestException(
        "Replay preview token secret is not configured",
      );
    }
    return secret;
  }

  private computeReplayPreviewTokenHash(token: string): string {
    return createHash("sha256")
      .update(String(token || ""), "utf8")
      .digest("hex");
  }

  private async isReplayPreviewTokenConsumed(input: {
    merchantId: string;
    previewTokenHash: string;
  }): Promise<boolean> {
    const result = await this.pool.query<{ consumed_count: string }>(
      `SELECT COUNT(*)::text as consumed_count
       FROM control_plane_replay_token_consumptions
       WHERE merchant_id = $1
         AND preview_token_hash = $2`,
      [input.merchantId, input.previewTokenHash],
    );

    return Number(result.rows[0]?.consumed_count || 0) > 0;
  }

  private async runInTransaction<T>(
    operation: (db: QueryExecutor) => Promise<T>,
  ): Promise<T> {
    const poolWithConnect = this.pool as Pool & {
      connect?: () => Promise<PoolClient>;
    };
    if (typeof poolWithConnect.connect !== "function") {
      return operation(this.pool);
    }

    const client = await poolWithConnect.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback errors and rethrow original failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async claimReplayPreviewToken(input: {
    db: QueryExecutor;
    merchantId: string;
    sourceRunId: string;
    previewTokenHash: string;
    previewContextHash: string;
    operatorNote: string;
    consumedBy?: string;
    consumedAt: string;
  }) {
    try {
      await input.db.query(
        `INSERT INTO control_plane_replay_token_consumptions (
           merchant_id,
           source_run_id,
           preview_token_hash,
           preview_context_hash,
           operator_note,
           consumed_by,
           consumed_at
         ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::timestamptz)`,
        [
          input.merchantId,
          input.sourceRunId,
          input.previewTokenHash,
          input.previewContextHash,
          input.operatorNote,
          input.consumedBy || null,
          input.consumedAt,
        ],
      );
    } catch (error: any) {
      if (String(error?.code || "") === "23505") {
        throw new BadRequestException(
          "Replay preview token already consumed; refresh preview",
        );
      }
      throw error;
    }
  }

  private normalizeReplayOperatorNote(raw: string | undefined): string {
    const note = String(raw || "").trim();
    if (!note) {
      throw new BadRequestException("Operator replay note is required");
    }
    if (note.length < REPLAY_OPERATOR_NOTE_MIN_LENGTH) {
      throw new BadRequestException(
        `Operator replay note must be at least ${REPLAY_OPERATOR_NOTE_MIN_LENGTH} characters`,
      );
    }
    if (note.length > REPLAY_OPERATOR_NOTE_MAX_LENGTH) {
      throw new BadRequestException(
        `Operator replay note must be ${REPLAY_OPERATOR_NOTE_MAX_LENGTH} characters or fewer`,
      );
    }
    return note;
  }

  private assertJsonWithinLimit(
    value: Record<string, any> | undefined,
    maxBytes: number,
    label: string,
  ) {
    if (!value) {
      return;
    }

    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
      throw new BadRequestException(`${label} exceeds allowed size`);
    }
  }
}
