import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { Interval, Cron, CronExpression } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../infrastructure/database.module";
import { createLogger } from "@tash8eel/shared";
import { AgentType, AgentTask, AgentResult } from "@tash8eel/agent-sdk";
import { randomUUID } from "crypto";
import { OpsAgent } from "../agents/ops";
import { InventoryAgent } from "../agents/inventory";
import { FinanceAgent } from "../agents/finance";
import { MarketingAgent } from "../agents/marketing";
import { ContentAgent } from "../agents/content";
import { SupportAgent } from "../agents/support";

const logger = createLogger("Orchestrator");

/**
 * Maps task types to required features.
 * Tasks not in this map don't require feature gating.
 */
const TASK_TYPE_TO_FEATURE: Record<string, string> = {
  // Inventory tasks require INVENTORY feature
  check_stock: "INVENTORY",
  update_stock: "INVENTORY",
  low_stock_alert: "INVENTORY",
  reserve_stock: "INVENTORY",
  confirm_reservation: "INVENTORY",
  release_reservation: "INVENTORY",
  deduct_stock: "INVENTORY",
  sync_inventory: "INVENTORY",
  inventory_report: "INVENTORY",
  cleanup_expired_reservations: "INVENTORY",
  substitution_suggestions: "INVENTORY",
  restock_recommendations: "INVENTORY",
  supplier_order_draft: "INVENTORY",
  check_expiry_alerts: "INVENTORY",
  expiry_report: "INVENTORY",
  receive_lot: "INVENTORY",
  lot_report: "INVENTORY",
  fifo_cogs: "INVENTORY",
  inventory_valuation_fifo: "INVENTORY",
  detect_duplicate_skus: "INVENTORY",
  merge_skus: "INVENTORY",

  // Payment tasks require PAYMENTS feature
  process_payment: "PAYMENTS",
  generate_invoice: "PAYMENTS",
  calculate_fees: "PAYMENTS",
  payment_proof_review: "PAYMENTS",
  weekly_cfo_brief: "KPI_DASHBOARD",
  daily_revenue_summary: "KPI_DASHBOARD",
  tax_report: "KPI_DASHBOARD",
  cash_flow_forecast: "KPI_DASHBOARD",
  discount_impact: "KPI_DASHBOARD",
  revenue_by_channel: "KPI_DASHBOARD",
  refund_analysis: "KPI_DASHBOARD",
  reconcile_transactions: "PAYMENTS",
  import_cod_statement: "PAYMENTS",
  record_expense: "PAYMENTS",
  expense_summary: "KPI_DASHBOARD",
  monthly_close: "KPI_DASHBOARD",

  // Marketing tasks require LOYALTY feature (for promotions)
  generate_promo: "LOYALTY",
  customer_segment: "REPORTS",

  // Reports
  generate_report: "REPORTS",
};

interface Agent {
  agentType: AgentType;
  execute(task: AgentTask): Promise<AgentResult>;
}

interface MerchantAgentSubscription {
  merchantId: string;
  enabledAgents: AgentType[];
  enabledFeatures: string[];
  cachedAt: Date;
}

interface OrchestratorMetrics {
  tasksProcessed: number;
  tasksSucceeded: number;
  tasksFailed: number;
  tasksRetried: number;
  avgExecutionTimeMs: number;
  lastProcessedAt: Date | null;
  agentMetrics: Map<string, AgentMetrics>;
}

interface AgentMetrics {
  tasksProcessed: number;
  successRate: number;
  avgExecutionTimeMs: number;
  currentActive: number;
}

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  lastHeartbeat: Date;
  queueDepth: number;
  staleTasks: number;
  agentHealth: Map<string, boolean>;
}

type PlannerTriggerType = "EVENT" | "SCHEDULED" | "ON_DEMAND" | "ESCALATION";

interface TriggerGovernanceDecision {
  allowed: boolean;
  triggerType: PlannerTriggerType;
  reason?: string;
}

@Injectable()
export class OrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly nestLogger = new Logger(OrchestratorService.name);
  private isProcessing = false;
  private isShuttingDown = false;
  private readonly batchSize = 10;
  private readonly agents: Map<string, Agent> = new Map();
  private readonly concurrencyLimits: Map<string, number> = new Map();
  private readonly activeTasks: Map<string, number> = new Map();
  private readonly taskTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // Merchant agent subscription cache (5 minute TTL)
  private readonly merchantSubscriptions: Map<
    string,
    MerchantAgentSubscription
  > = new Map();
  private readonly subscriptionCacheTTL = 5 * 60 * 1000; // 5 minutes

  // Metrics tracking
  private metrics: OrchestratorMetrics = {
    tasksProcessed: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    tasksRetried: 0,
    avgExecutionTimeMs: 0,
    lastProcessedAt: null,
    agentMetrics: new Map(),
  };

  // Health monitoring
  private health: HealthStatus = {
    status: "healthy",
    lastHeartbeat: new Date(),
    queueDepth: 0,
    staleTasks: 0,
    agentHealth: new Map(),
  };

  // Circuit breaker state per agent
  private readonly circuitBreakers: Map<
    string,
    { failures: number; lastFailure: Date | null; isOpen: boolean }
  > = new Map();
  private readonly circuitBreakerThreshold = 5;
  private readonly circuitBreakerResetMs = 60000; // 1 minute

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly opsAgent: OpsAgent,
    private readonly inventoryAgent: InventoryAgent,
    private readonly financeAgent: FinanceAgent,
    private readonly marketingAgent: MarketingAgent,
    private readonly contentAgent: ContentAgent,
    private readonly supportAgent: SupportAgent,
  ) {
    // Register agents
    this.agents.set("OPS_AGENT", opsAgent);
    this.agents.set("INVENTORY_AGENT", inventoryAgent);
    this.agents.set("FINANCE_AGENT", financeAgent);
    this.agents.set("MARKETING_AGENT", marketingAgent);
    this.agents.set("CONTENT_AGENT", contentAgent);
    this.agents.set("SUPPORT_AGENT", supportAgent);

    // Set concurrency limits per agent type (production-tuned)
    this.concurrencyLimits.set("OPS_AGENT", 10); // High priority, high concurrency
    this.concurrencyLimits.set("INVENTORY_AGENT", 5); // Stock operations
    this.concurrencyLimits.set("FINANCE_AGENT", 3); // Payment processing
    this.concurrencyLimits.set("MARKETING_AGENT", 3); // Campaign tasks
    this.concurrencyLimits.set("CONTENT_AGENT", 2); // Content generation
    this.concurrencyLimits.set("SUPPORT_AGENT", 5); // Customer support

    // Initialize metrics and circuit breakers for each agent
    for (const agentType of this.agents.keys()) {
      this.activeTasks.set(agentType, 0);
      this.metrics.agentMetrics.set(agentType, {
        tasksProcessed: 0,
        successRate: 100,
        avgExecutionTimeMs: 0,
        currentActive: 0,
      });
      this.circuitBreakers.set(agentType, {
        failures: 0,
        lastFailure: null,
        isOpen: false,
      });
      this.health.agentHealth.set(agentType, true);
    }
  }

  onModuleInit(): void {
    this.nestLogger.log("Orchestrator service initialized");
    this.nestLogger.log(
      `Registered agents: ${Array.from(this.agents.keys()).join(", ")}`,
    );
    this.nestLogger.log(
      `Concurrency limits: ${JSON.stringify(Object.fromEntries(this.concurrencyLimits))}`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    this.nestLogger.log(
      "Orchestrator shutting down, waiting for active tasks...",
    );

    // Wait for active tasks to complete (max 30 seconds)
    const maxWaitMs = 30000;
    const startWait = Date.now();
    while (
      this.getTotalActiveTasks() > 0 &&
      Date.now() - startWait < maxWaitMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Clear any task timeouts
    for (const timeout of this.taskTimeouts.values()) {
      clearTimeout(timeout);
    }

    this.nestLogger.log("Orchestrator shutdown complete");
  }

  /**
   * Get orchestrator metrics for monitoring
   */
  getMetrics(): OrchestratorMetrics {
    return {
      ...this.metrics,
      agentMetrics: new Map(this.metrics.agentMetrics),
    };
  }

  /**
   * Get health status for monitoring/alerting
   */
  getHealthStatus(): HealthStatus {
    return {
      ...this.health,
      agentHealth: new Map(this.health.agentHealth),
    };
  }

  /**
   * Get total active tasks across all agents
   */
  getTotalActiveTasks(): number {
    let total = 0;
    for (const count of this.activeTasks.values()) {
      total += count;
    }
    return total;
  }

  /**
   * Check if a merchant has enabled a specific agent type.
   * Uses cached subscriptions with 5-minute TTL.
   */
  async isAgentEnabledForMerchant(
    merchantId: string,
    agentType: AgentType,
  ): Promise<boolean> {
    const subscription = await this.getMerchantSubscription(merchantId);
    return subscription.enabledAgents.includes(agentType);
  }

  /**
   * Check if a merchant has enabled a specific feature (for task type gating).
   * Uses cached subscriptions with 5-minute TTL.
   */
  async isFeatureEnabledForMerchant(
    merchantId: string,
    feature: string,
  ): Promise<boolean> {
    const subscription = await this.getMerchantSubscription(merchantId);
    return subscription.enabledFeatures.includes(feature);
  }

  /**
   * Get required feature for a task type (if any).
   */
  getRequiredFeatureForTask(taskType: string): string | null {
    return TASK_TYPE_TO_FEATURE[taskType] || null;
  }

  /**
   * Get merchant subscription data (agents + features).
   * Uses cached subscriptions with 5-minute TTL.
   */
  private async getMerchantSubscription(
    merchantId: string,
  ): Promise<MerchantAgentSubscription> {
    // Check cache first
    const cached = this.merchantSubscriptions.get(merchantId);
    if (
      cached &&
      Date.now() - cached.cachedAt.getTime() < this.subscriptionCacheTTL
    ) {
      return cached;
    }

    // FREE plan defaults: only OPS_AGENT (other agents require paid plans)
    const defaults: MerchantAgentSubscription = {
      merchantId,
      enabledAgents: ["OPS_AGENT"] as AgentType[],
      enabledFeatures: ["CONVERSATIONS", "ORDERS", "CATALOG"],
      cachedAt: new Date(),
    };

    // Fetch from database
    let result;
    try {
      result = await this.pool.query(
        `SELECT enabled_agents, enabled_features FROM merchants WHERE id = $1`,
        [merchantId],
      );
    } catch (error) {
      const err = error as Error;
      logger.warn("Failed to load merchant entitlements, using defaults", {
        merchantId,
        message: err.message,
      });
      this.merchantSubscriptions.set(merchantId, defaults);
      return defaults;
    }

    if (result.rows.length === 0) {
      // Merchant not found - return defaults
      this.merchantSubscriptions.set(merchantId, defaults);
      return defaults;
    }

    const rawAgents = result.rows[0].enabled_agents || [
      "OPS_AGENT", // Only OPS is free-tier default
    ];
    const enabledAgents = rawAgents.map((agent: string) =>
      this.normalizeAgentType(agent),
    );

    const enabledFeatures = result.rows[0].enabled_features || [
      "CONVERSATIONS",
      "ORDERS",
      "CATALOG",
    ];

    // Cache the result
    const subscription: MerchantAgentSubscription = {
      merchantId,
      enabledAgents,
      enabledFeatures,
      cachedAt: new Date(),
    };
    this.merchantSubscriptions.set(merchantId, subscription);

    return subscription;
  }

  /**
   * Clear cached subscription for a merchant (call when subscription changes)
   */
  invalidateMerchantSubscription(merchantId: string): void {
    this.merchantSubscriptions.delete(merchantId);
    this.nestLogger.log(
      `Invalidated agent subscription cache for merchant: ${merchantId}`,
    );
  }

  /**
   * Check if circuit breaker is open for an agent
   */
  private isCircuitBreakerOpen(agentType: string): boolean {
    const breaker = this.circuitBreakers.get(agentType);
    if (!breaker) return false;

    if (breaker.isOpen && breaker.lastFailure) {
      // Check if enough time has passed to try again
      if (
        Date.now() - breaker.lastFailure.getTime() >
        this.circuitBreakerResetMs
      ) {
        breaker.isOpen = false;
        breaker.failures = 0;
        this.health.agentHealth.set(agentType, true);
        logger.info(`Circuit breaker reset for ${agentType}`);
      }
    }

    return breaker.isOpen;
  }

  /**
   * Record a failure for circuit breaker
   */
  private recordCircuitBreakerFailure(agentType: string): void {
    const breaker = this.circuitBreakers.get(agentType);
    if (!breaker) return;

    breaker.failures++;
    breaker.lastFailure = new Date();

    if (breaker.failures >= this.circuitBreakerThreshold) {
      breaker.isOpen = true;
      this.health.agentHealth.set(agentType, false);
      logger.warn(
        `Circuit breaker OPEN for ${agentType} after ${breaker.failures} failures`,
      );
    }
  }

  /**
   * Record a success for circuit breaker
   */
  private recordCircuitBreakerSuccess(agentType: string): void {
    const breaker = this.circuitBreakers.get(agentType);
    if (!breaker) return;

    breaker.failures = 0;
    breaker.isOpen = false;
    this.health.agentHealth.set(agentType, true);
  }

  @Interval(500)
  async dispatchTasks(): Promise<void> {
    if (this.isProcessing || this.isShuttingDown) {
      return;
    }

    this.isProcessing = true;
    this.health.lastHeartbeat = new Date();

    try {
      const client = await this.pool.connect();

      try {
        await client.query("BEGIN");

        // Select pending tasks with FOR UPDATE SKIP LOCKED
        // Priority: 1 = urgent, 2 = high, 3 = normal, 4 = low
        const result = await client.query(
          `SELECT id, agent_type, task_type, merchant_id, correlation_id, 
                  priority, status, input, retry_count, timeout_at, scheduled_at, created_at, updated_at
           FROM agent_tasks
           WHERE status = 'PENDING'
             AND (scheduled_at IS NULL OR scheduled_at <= NOW())
           ORDER BY priority ASC, created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED`,
          [this.batchSize],
        );

        // Update queue depth metric
        const queueResult = await client.query(
          `SELECT COUNT(*) as depth FROM agent_tasks WHERE status = 'PENDING'`,
        );
        this.health.queueDepth = parseInt(queueResult.rows[0].depth);

        if (result.rows.length === 0) {
          await client.query("COMMIT");
          return;
        }

        for (const row of result.rows) {
          const taskInput = this.parseTaskInput(row.input);
          const triggerDecision = this.evaluateTaskTriggerGovernance({
            taskType: row.task_type,
            correlationId: row.correlation_id,
            scheduledAt: row.scheduled_at,
            taskInput,
          });

          if (!triggerDecision.allowed) {
            logger.warn("Task blocked by trigger governance", {
              taskId: row.id,
              taskType: row.task_type,
              triggerType: triggerDecision.triggerType,
              reason: triggerDecision.reason,
            });

            await client.query(
              `UPDATE agent_tasks SET status = 'CANCELLED', error = $2, updated_at = NOW() WHERE id = $1`,
              [
                row.id,
                triggerDecision.reason ||
                  "Task blocked by trigger governance policy",
              ],
            );
            continue;
          }

          const task = this.mapRowToTask(row, taskInput);
          const agent = this.agents.get(task.agentType);

          if (!agent) {
            logger.warn(`No agent found for type: ${task.agentType}`);
            await client.query(
              `UPDATE agent_tasks SET status = 'FAILED', error = 'No agent found', updated_at = NOW() WHERE id = $1`,
              [task.id],
            );
            continue;
          }

          // Check circuit breaker
          if (this.isCircuitBreakerOpen(task.agentType)) {
            logger.warn(
              `Circuit breaker open for ${task.agentType}, skipping task ${task.id}`,
            );
            continue;
          }

          // Check if agent is enabled for this merchant
          if (task.merchantId) {
            const isEnabled = await this.isAgentEnabledForMerchant(
              task.merchantId,
              task.agentType,
            );
            if (!isEnabled) {
              logger.info(
                `Agent ${task.agentType} not enabled for merchant ${task.merchantId}, skipping task ${task.id}`,
              );
              await client.query(
                `UPDATE agent_tasks SET status = 'CANCELLED', error = 'Agent not enabled for merchant', updated_at = NOW() WHERE id = $1`,
                [task.id],
              );
              continue;
            }

            // Check if required feature is enabled for this merchant
            const requiredFeature = this.getRequiredFeatureForTask(
              task.taskType,
            );
            if (requiredFeature) {
              const featureEnabled = await this.isFeatureEnabledForMerchant(
                task.merchantId,
                requiredFeature,
              );
              if (!featureEnabled) {
                logger.info(
                  `Feature ${requiredFeature} not enabled for merchant ${task.merchantId}, skipping task ${task.id} (type: ${task.taskType})`,
                );
                await client.query(
                  `UPDATE agent_tasks SET status = 'CANCELLED', error = $2, updated_at = NOW() WHERE id = $1`,
                  [
                    task.id,
                    `Feature ${requiredFeature} not enabled for merchant`,
                  ],
                );
                continue;
              }
            }
          }

          // Check concurrency limit
          const currentActive = this.activeTasks.get(task.agentType) || 0;
          const limit = this.concurrencyLimits.get(task.agentType) || 1;

          if (currentActive >= limit) {
            continue; // Skip this task for now
          }

          // Update task to PROCESSING
          await client.query(
            `UPDATE agent_tasks SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1`,
            [task.id],
          );

          // Increment active counter
          this.activeTasks.set(task.agentType, currentActive + 1);

          // Update agent metrics
          const agentMetrics = this.metrics.agentMetrics.get(task.agentType);
          if (agentMetrics) {
            agentMetrics.currentActive = currentActive + 1;
          }

          // Set task timeout
          const timeoutMs = task.timeoutAt
            ? new Date(task.timeoutAt).getTime() - Date.now()
            : 300000; // 5 minute default timeout

          const timeout = setTimeout(
            () => {
              this.handleTaskTimeout(task.id, task.agentType);
            },
            Math.max(timeoutMs, 10000),
          );

          this.taskTimeouts.set(task.id, timeout);

          // Execute task asynchronously
          this.executeTask(agent, task).catch((error) => {
            logger.error(`Task execution error for ${task.id}`, error as Error);
          });
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const err = error as Error & { code?: string };
      logger.error("Orchestrator dispatch error", {
        message: err.message,
        stack: err.stack,
        code: (err as any)?.code,
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Handle task timeout
   */
  private async handleTaskTimeout(
    taskId: string,
    agentType: string,
  ): Promise<void> {
    logger.warn(`Task ${taskId} timed out`);

    try {
      await this.pool.query(
        `UPDATE agent_tasks SET status = 'FAILED', error = 'Task timeout', updated_at = NOW() WHERE id = $1 AND status = 'PROCESSING'`,
        [taskId],
      );

      this.recordCircuitBreakerFailure(agentType);
      this.metrics.tasksFailed++;
    } catch (error) {
      logger.error(
        `Failed to handle task timeout for ${taskId}`,
        error as Error,
      );
    }
  }

  /**
   * Clean up stale tasks that have been running too long
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupStaleTasks(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      // Find tasks that have been running for more than 10 minutes
      const staleResult = await this.pool.query(
        `UPDATE agent_tasks 
         SET status = 'FAILED', error = 'Stale task cleanup', updated_at = NOW()
         WHERE status = 'PROCESSING'
           AND updated_at < NOW() - INTERVAL '10 minutes'
         RETURNING id, agent_type`,
      );

      this.health.staleTasks = staleResult.rowCount || 0;

      if (staleResult.rows.length > 0) {
        logger.warn(`Cleaned up ${staleResult.rows.length} stale tasks`);

        // Reset active counters for affected agents
        for (const row of staleResult.rows) {
          const current = this.activeTasks.get(row.agent_type) || 1;
          this.activeTasks.set(row.agent_type, Math.max(0, current - 1));
        }
      }

      // Update health status
      this.health.status = this.health.staleTasks > 10 ? "degraded" : "healthy";
      for (const [agentType, isHealthy] of this.health.agentHealth) {
        if (!isHealthy) {
          this.health.status = "degraded";
          break;
        }
      }
    } catch (error) {
      logger.error("Failed to cleanup stale tasks", error as Error);
    }
  }

  /**
   * Move failed tasks to dead letter queue after max retries
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async processDeadLetterQueue(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      const result = await this.pool.query(
        `INSERT INTO dead_letter_queue (original_task_id, agent_type, task_type, merchant_id, input, error, failed_at)
         SELECT id, agent_type, task_type, merchant_id, input, error, NOW()
         FROM agent_tasks
         WHERE status = 'FAILED' AND retry_count >= 3 AND id NOT IN (SELECT original_task_id FROM dead_letter_queue)
         RETURNING id`,
      );

      if (result.rows.length > 0) {
        logger.info(`Moved ${result.rows.length} failed tasks to DLQ`);
      }
    } catch (error) {
      // DLQ table might not exist, log but don't fail
      logger.debug("DLQ processing skipped", error as Error);
    }
  }

  /**
   * Persist metrics to database for historical tracking
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async persistMetrics(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      await this.pool
        .query(
          `INSERT INTO orchestrator_metrics 
         (timestamp, tasks_processed, tasks_succeeded, tasks_failed, tasks_retried, avg_execution_time_ms, queue_depth)
         VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
          [
            this.metrics.tasksProcessed,
            this.metrics.tasksSucceeded,
            this.metrics.tasksFailed,
            this.metrics.tasksRetried,
            this.metrics.avgExecutionTimeMs,
            this.health.queueDepth,
          ],
        )
        .catch(() => {
          // Metrics table might not exist yet
        });
    } catch (error) {
      logger.debug("Metrics persistence skipped", error as Error);
    }
  }

  private async executeTask(agent: Agent, task: AgentTask): Promise<void> {
    const startTime = Date.now();

    try {
      // Clear timeout
      const timeout = this.taskTimeouts.get(task.id);
      if (timeout) {
        clearTimeout(timeout);
        this.taskTimeouts.delete(task.id);
      }

      // Update to PROCESSING
      await this.pool.query(
        `UPDATE agent_tasks SET status = 'PROCESSING', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [task.id],
      );

      // Execute agent
      const result = await agent.execute(task);

      const executionTimeMs = Date.now() - startTime;

      // Store result
      await this.pool.query(
        `INSERT INTO agent_results (task_id, agent_type, success, output, tokens_used, execution_time_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          task.id,
          task.agentType,
          result.success,
          JSON.stringify(result.output),
          result.tokensUsed,
          executionTimeMs,
        ],
      );

      if (result.success) {
        await this.pool.query(
          `UPDATE agent_tasks SET status = 'COMPLETED', output = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [task.id, JSON.stringify(result.output)],
        );

        // Update metrics
        this.metrics.tasksSucceeded++;
        this.recordCircuitBreakerSuccess(task.agentType);
      } else {
        throw new Error(result.error || "Agent execution failed");
      }

      // Update metrics
      this.metrics.tasksProcessed++;
      this.metrics.lastProcessedAt = new Date();
      this.updateAvgExecutionTime(executionTimeMs);
      this.updateAgentMetrics(task.agentType, true, executionTimeMs);

      logger.info("Task completed", {
        taskId: task.id,
        agentType: task.agentType,
        executionTimeMs,
      });
    } catch (error) {
      const err = error as Error;
      logger.error(`Task ${task.id} failed`, err);

      const newRetryCount = (task.retryCount || 0) + 1;
      const maxRetries = task.maxRetries || 3;

      if (newRetryCount >= maxRetries) {
        await this.pool.query(
          `UPDATE agent_tasks SET status = 'FAILED', error = $2, updated_at = NOW() WHERE id = $1`,
          [task.id, err.message],
        );
        this.metrics.tasksFailed++;
        this.recordCircuitBreakerFailure(task.agentType);
      } else {
        // Exponential backoff: delay = 2^retryCount * 1000ms
        const backoffMs = Math.pow(2, newRetryCount) * 1000;
        await this.pool.query(
          `UPDATE agent_tasks SET status = 'PENDING', retry_count = $2, error = $3, 
           updated_at = NOW(), scheduled_at = NOW() + make_interval(secs := $4 / 1000.0)
           WHERE id = $1`,
          [task.id, newRetryCount, err.message, backoffMs],
        );
        this.metrics.tasksRetried++;
      }

      this.updateAgentMetrics(task.agentType, false, Date.now() - startTime);
    } finally {
      // Decrement active counter
      const current = this.activeTasks.get(task.agentType) || 1;
      this.activeTasks.set(task.agentType, Math.max(0, current - 1));

      // Update agent metrics
      const agentMetrics = this.metrics.agentMetrics.get(task.agentType);
      if (agentMetrics) {
        agentMetrics.currentActive = Math.max(0, current - 1);
      }
    }
  }

  private updateAvgExecutionTime(newTimeMs: number): void {
    const n = this.metrics.tasksProcessed;
    this.metrics.avgExecutionTimeMs =
      (this.metrics.avgExecutionTimeMs * (n - 1) + newTimeMs) / n;
  }

  private updateAgentMetrics(
    agentType: string,
    success: boolean,
    executionTimeMs: number,
  ): void {
    const metrics = this.metrics.agentMetrics.get(agentType);
    if (!metrics) return;

    metrics.tasksProcessed++;

    // Update success rate (rolling average)
    const successValue = success ? 100 : 0;
    metrics.successRate =
      (metrics.successRate * (metrics.tasksProcessed - 1) + successValue) /
      metrics.tasksProcessed;

    // Update avg execution time
    metrics.avgExecutionTimeMs =
      (metrics.avgExecutionTimeMs * (metrics.tasksProcessed - 1) +
        executionTimeMs) /
      metrics.tasksProcessed;
  }

  private mapRowToTask(
    row: any,
    parsedInput?: Record<string, unknown>,
  ): AgentTask {
    return {
      id: row.id,
      agentType: this.normalizeAgentType(row.agent_type),
      taskType: row.task_type,
      merchantId: row.merchant_id,
      correlationId: row.correlation_id,
      priority: row.priority,
      status: row.status,
      input: parsedInput || this.parseTaskInput(row.input),
      retryCount: row.retry_count || 0,
      maxRetries: 3,
      timeoutAt: row.timeout_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseTaskInput(rawInput: unknown): Record<string, unknown> {
    if (rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)) {
      return rawInput as Record<string, unknown>;
    }

    if (typeof rawInput === "string") {
      try {
        const parsed = JSON.parse(rawInput);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return {};
      }
    }

    return {};
  }

  private evaluateTaskTriggerGovernance(input: {
    taskType: string;
    correlationId?: string | null;
    scheduledAt?: Date | null;
    taskInput: Record<string, unknown>;
  }): TriggerGovernanceDecision {
    const triggerType = this.resolveTaskTriggerType(input);

    if (
      this.isAlwaysOnLoopRequest(
        input.taskType,
        input.correlationId,
        input.taskInput,
      )
    ) {
      return {
        allowed: false,
        triggerType,
        reason:
          "Autonomous/always-on loop requests are blocked; use explicit event, scheduled, on-demand, or escalation triggers",
      };
    }

    return {
      allowed: true,
      triggerType,
    };
  }

  private resolveTaskTriggerType(input: {
    taskType: string;
    correlationId?: string | null;
    scheduledAt?: Date | null;
    taskInput: Record<string, unknown>;
  }): PlannerTriggerType {
    const explicitTrigger = this.extractExplicitTriggerType(input.taskInput);
    if (explicitTrigger) {
      return explicitTrigger;
    }

    if (input.scheduledAt) {
      return "SCHEDULED";
    }

    const taskType = String(input.taskType || "").toLowerCase();
    if (taskType.includes("escalation")) {
      return "ESCALATION";
    }
    if (taskType.includes("event") || taskType.includes("webhook")) {
      return "EVENT";
    }

    const correlation = String(input.correlationId || "").toLowerCase();
    if (correlation.includes("escalation")) {
      return "ESCALATION";
    }
    if (correlation.includes("event") || correlation.includes("webhook")) {
      return "EVENT";
    }

    if (this.toBoolean(input.taskInput["escalated"])) {
      return "ESCALATION";
    }

    if (
      this.toBoolean(input.taskInput["eventDriven"]) ||
      this.toBoolean(input.taskInput["fromEvent"])
    ) {
      return "EVENT";
    }

    return "ON_DEMAND";
  }

  private extractExplicitTriggerType(
    taskInput: Record<string, unknown>,
  ): PlannerTriggerType | null {
    const candidates: string[] = [];
    const pushCandidate = (value: unknown) => {
      if (typeof value === "string" && value.trim().length > 0) {
        candidates.push(value.trim().toLowerCase());
      }
    };

    pushCandidate(taskInput["triggerType"]);
    pushCandidate(taskInput["trigger_type"]);
    pushCandidate(taskInput["executionTrigger"]);

    const meta = this.toRecord(taskInput["meta"]);
    if (meta) {
      pushCandidate(meta["triggerType"]);
      pushCandidate(meta["trigger_type"]);
      pushCandidate(meta["executionTrigger"]);
    }

    for (const candidate of candidates) {
      if (
        candidate.includes("schedule") ||
        candidate.includes("cron") ||
        candidate.includes("timer")
      ) {
        return "SCHEDULED";
      }

      if (
        candidate.includes("event") ||
        candidate.includes("webhook") ||
        candidate.includes("signal")
      ) {
        return "EVENT";
      }

      if (candidate.includes("escalation")) {
        return "ESCALATION";
      }

      if (
        candidate.includes("on_demand") ||
        candidate.includes("ondemand") ||
        candidate.includes("manual") ||
        candidate.includes("portal")
      ) {
        return "ON_DEMAND";
      }
    }

    return null;
  }

  private isAlwaysOnLoopRequest(
    taskType: string,
    correlationId: string | null | undefined,
    taskInput: Record<string, unknown>,
  ): boolean {
    const fragments = [
      "always",
      "always_on",
      "always-on",
      "autonomous",
      "continuous",
      "daemon",
      "heartbeat",
      "watch",
      "poll",
      "loop",
    ];

    const haystacks = [
      String(taskType || "").toLowerCase(),
      String(correlationId || "").toLowerCase(),
      String(taskInput["mode"] || "").toLowerCase(),
      String(taskInput["executionMode"] || "").toLowerCase(),
    ];

    const hasLoopFragment = haystacks.some((value) =>
      fragments.some((fragment) => value.includes(fragment)),
    );
    if (hasLoopFragment) {
      return true;
    }

    return (
      this.toBoolean(taskInput["alwaysOn"]) ||
      this.toBoolean(taskInput["autonomous"]) ||
      this.toBoolean(taskInput["continuous"])
    );
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return ["1", "true", "yes", "enabled"].includes(normalized);
    }

    if (typeof value === "number") {
      return value === 1;
    }

    return false;
  }

  private normalizeAgentType(value: string): AgentType {
    if (!value) return "OPS_AGENT";
    if (value.endsWith("_AGENT")) return value as AgentType;
    const map: Record<string, AgentType> = {
      ops: "OPS_AGENT",
      inventory: "INVENTORY_AGENT",
      finance: "FINANCE_AGENT",
      marketing: "MARKETING_AGENT",
      content: "CONTENT_AGENT",
      support: "SUPPORT_AGENT",
    };
    return (
      map[value] ||
      (value.toUpperCase().endsWith("_AGENT")
        ? (value.toUpperCase() as AgentType)
        : "OPS_AGENT")
    );
  }

  // ==================== TASK SCHEDULING ====================

  /**
   * Schedule a task to run at a specific time
   */
  async scheduleTask(
    agentType: AgentType,
    taskType: string,
    merchantId: string,
    input: Record<string, unknown>,
    scheduledFor: Date,
    options?: {
      priority?: number;
      correlationId?: string;
      timeoutMinutes?: number;
    },
  ): Promise<string> {
    const taskId = randomUUID();
    const timeoutAt = options?.timeoutMinutes
      ? new Date(scheduledFor.getTime() + options.timeoutMinutes * 60 * 1000)
      : null;

    await this.pool.query(
      `INSERT INTO agent_tasks 
       (id, agent_type, task_type, merchant_id, correlation_id, priority, status, input, timeout_at, scheduled_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, NOW(), NOW())`,
      [
        taskId,
        agentType,
        taskType,
        merchantId,
        options?.correlationId,
        options?.priority || 3,
        JSON.stringify(input),
        timeoutAt,
        scheduledFor,
      ],
    );

    logger.info("Task scheduled", {
      taskId,
      agentType,
      taskType,
      merchantId,
      scheduledFor,
    });
    return taskId;
  }

  /**
   * Process scheduled tasks that are due
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledTasks(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      // Scheduling is handled by dispatchTasks filtering on scheduled_at.
      // Keep this cron lightweight for compatibility.
      await this.pool.query(`SELECT 1`);
    } catch (error) {
      logger.error("Failed to process scheduled tasks", error as Error);
    }
  }

  /**
   * Bulk create tasks for batch processing
   */
  async createBulkTasks(
    tasks: Array<{
      agentType: AgentType;
      taskType: string;
      merchantId: string;
      input: Record<string, unknown>;
      priority?: number;
    }>,
    correlationId?: string,
  ): Promise<{ created: number; taskIds: string[] }> {
    const bulkCorrelationId = correlationId || `bulk_${Date.now()}`;
    const taskIds: string[] = [];

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      for (const task of tasks) {
        const taskId = randomUUID();

        await client.query(
          `INSERT INTO agent_tasks 
           (id, agent_type, task_type, merchant_id, correlation_id, priority, status, input, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, NOW(), NOW())`,
          [
            taskId,
            task.agentType,
            task.taskType,
            task.merchantId,
            bulkCorrelationId,
            task.priority || 3,
            JSON.stringify(task.input),
          ],
        );

        taskIds.push(taskId);
      }

      await client.query("COMMIT");

      logger.info("Bulk tasks created", {
        count: taskIds.length,
        correlationId: bulkCorrelationId,
      });
      return { created: taskIds.length, taskIds };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get task status by ID or correlation ID
   */
  async getTaskStatus(taskId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT t.*, r.success, r.output as result_output, r.execution_time_ms
       FROM agent_tasks t
       LEFT JOIN agent_results r ON t.id = r.task_id
       WHERE t.id = $1 OR t.correlation_id = $1
       ORDER BY t.created_at DESC`,
      [taskId],
    );

    if (result.rows.length === 0) return null;

    if (result.rows.length === 1) {
      const row = result.rows[0];
      return {
        taskId: row.id,
        agentType: row.agent_type,
        taskType: row.task_type,
        status: row.status,
        priority: row.priority,
        retryCount: row.retry_count,
        input: row.input,
        output: row.output || row.result_output,
        error: row.error,
        executionTimeMs: row.execution_time_ms,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      };
    }

    // Multiple tasks (correlation ID query)
    return {
      correlationId: taskId,
      totalTasks: result.rows.length,
      completed: result.rows.filter((r) => r.status === "COMPLETED").length,
      failed: result.rows.filter((r) => r.status === "FAILED").length,
      pending: result.rows.filter((r) =>
        ["PENDING", "PROCESSING"].includes(r.status),
      ).length,
      tasks: result.rows.map((row) => ({
        taskId: row.id,
        agentType: row.agent_type,
        taskType: row.task_type,
        status: row.status,
        error: row.error,
      })),
    };
  }

  /**
   * Cancel a pending or scheduled task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE agent_tasks 
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1 AND status = 'PENDING'
       RETURNING id`,
      [taskId],
    );

    if (result.rows.length > 0) {
      logger.info("Task cancelled", { taskId });
      return true;
    }
    return false;
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE agent_tasks 
       SET status = 'PENDING', retry_count = 0, error = NULL, updated_at = NOW()
       WHERE id = $1 AND status = 'FAILED'
       RETURNING id`,
      [taskId],
    );

    if (result.rows.length > 0) {
      logger.info("Task queued for retry", { taskId });
      return true;
    }
    return false;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    byStatus: Record<string, number>;
    byAgent: Record<
      string,
      { pending: number; running: number; failed: number }
    >;
    avgWaitTimeMs: number;
    oldestPendingTask: Date | null;
  }> {
    const statusResult = await this.pool.query(
      `SELECT status, COUNT(*) as count 
       FROM agent_tasks 
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY status`,
    );

    const agentResult = await this.pool.query(
      `SELECT agent_type, status, COUNT(*) as count 
       FROM agent_tasks 
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY agent_type, status`,
    );

    const waitTimeResult = await this.pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (started_at - created_at)) * 1000) as avg_wait_ms
       FROM agent_tasks 
       WHERE started_at IS NOT NULL AND created_at > NOW() - INTERVAL '1 hour'`,
    );

    const oldestResult = await this.pool.query(
      `SELECT MIN(created_at) as oldest 
       FROM agent_tasks 
       WHERE status = 'PENDING'`,
    );

    const byStatus: Record<string, number> = {};
    for (const row of statusResult.rows) {
      byStatus[row.status] = parseInt(row.count);
    }

    const byAgent: Record<
      string,
      { pending: number; running: number; failed: number }
    > = {};
    for (const row of agentResult.rows) {
      if (!byAgent[row.agent_type]) {
        byAgent[row.agent_type] = { pending: 0, running: 0, failed: 0 };
      }
      if (row.status === "PENDING")
        byAgent[row.agent_type].pending = parseInt(row.count);
      if (row.status === "PROCESSING")
        byAgent[row.agent_type].running = parseInt(row.count);
      if (row.status === "FAILED")
        byAgent[row.agent_type].failed = parseInt(row.count);
    }

    return {
      byStatus,
      byAgent,
      avgWaitTimeMs: parseFloat(waitTimeResult.rows[0]?.avg_wait_ms) || 0,
      oldestPendingTask: oldestResult.rows[0]?.oldest || null,
    };
  }

  /**
   * Purge old completed tasks (cleanup)
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldTasks(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      // Keep completed tasks for 7 days, failed for 30 days
      const result = await this.pool.query(
        `DELETE FROM agent_tasks 
         WHERE (status = 'COMPLETED' AND completed_at < NOW() - INTERVAL '7 days')
            OR (status IN ('FAILED', 'CANCELLED') AND updated_at < NOW() - INTERVAL '30 days')
         RETURNING id`,
      );

      if (result.rows.length > 0) {
        logger.info(`Purged ${result.rows.length} old tasks`);
      }
    } catch (error) {
      logger.error("Failed to purge old tasks", error as Error);
    }
  }
}
