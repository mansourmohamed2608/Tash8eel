import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { evaluateCopilotActionRisk } from "./copilot-risk-policy";
import { CopilotIntent } from "./copilot-schema";

type TriggerType = "EVENT" | "SCHEDULED" | "ON_DEMAND" | "ESCALATION";

const MAX_POLICY_DSL_BYTES = 256 * 1024;
const MAX_SIMULATION_INPUT_BYTES = 64 * 1024;
const MAX_PLANNER_CONTEXT_DIGEST_BYTES = 64 * 1024;
const MAX_TRIGGER_KEY_LENGTH = 120;
const MAX_BUDGET_AI_CALLS_DAILY = 500000;
const MAX_BUDGET_TOKENS_DAILY = 500000000;

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

    const row = await this.pool.query<{ id: string }>(
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
  }) {
    const source = await this.pool.query<{
      id: string;
      trigger_type: TriggerType;
      trigger_key: string;
      run_status: "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED";
      context_digest: Record<string, any>;
    }>(
      `SELECT
         id::text as id,
         trigger_type,
         trigger_key,
         run_status,
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
    if (sourceRow.run_status === "STARTED") {
      throw new BadRequestException(
        "Cannot replay a run that is still STARTED",
      );
    }

    const budget = await this.checkTriggerBudget({
      merchantId: input.merchantId,
      triggerType: sourceRow.trigger_type,
      triggerKey: sourceRow.trigger_key,
      requestedAiCalls: 1,
      requestedTokens: 0,
    });

    const requestedReason = String(input.reason || "").trim();
    const replayReason = requestedReason
      ? `Manual replay requested: ${requestedReason}`
      : "Manual replay requested from command center";

    if (input.dryRun) {
      return {
        sourceRunId: sourceRow.id,
        dryRun: true,
        allowed: budget.allowed,
        gateReason: budget.reason,
        triggerType: sourceRow.trigger_type,
        triggerKey: sourceRow.trigger_key,
      };
    }

    const runStatus = budget.allowed ? "STARTED" : "SKIPPED";
    const recorded = await this.recordPlannerRun({
      merchantId: input.merchantId,
      triggerType: sourceRow.trigger_type,
      triggerKey: sourceRow.trigger_key,
      requestedBy: input.requestedBy,
      runStatus,
      reason: budget.allowed
        ? replayReason
        : `${replayReason}. Budget gate: ${budget.reason || "denied"}`,
      contextDigest: {
        ...(sourceRow.context_digest || {}),
        replayOfRunId: sourceRow.id,
        replayRequestedAt: new Date().toISOString(),
      },
      correlationId: `replay-${sourceRow.id}-${randomUUID()}`,
      costAiCalls: 0,
      costTokens: 0,
    });

    return {
      sourceRunId: sourceRow.id,
      replayRunId: recorded.runId,
      allowed: budget.allowed,
      gateReason: budget.reason,
      runStatus,
      triggerType: sourceRow.trigger_type,
      triggerKey: sourceRow.trigger_key,
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

  private assertTriggerType(triggerTypeRaw: string) {
    const triggerType = String(triggerTypeRaw || "").toUpperCase();
    if (
      !["EVENT", "SCHEDULED", "ON_DEMAND", "ESCALATION"].includes(triggerType)
    ) {
      throw new BadRequestException("Invalid triggerType");
    }
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
