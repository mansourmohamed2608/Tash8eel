import {
  Injectable,
  Inject,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../infrastructure/database.module";
import {
  AgentType,
  TeamTask,
  Subtask,
  TeamTaskTemplate,
  createTeamTaskFromTemplate,
  TEAM_TASK_TEMPLATES,
  TEAM_INTENTS,
  CreateTeamTaskParams,
  createTeamTask,
} from "@tash8eel/agent-sdk";
import { OrchestratorService } from "./orchestrator.service";

/**
 * Team Orchestrator — فرق الوكلاء
 *
 * Coordinates multiple agents working in parallel on complex tasks.
 * Instead of one agent working sequentially, distributes work across
 * multiple agents where each owns their part and coordinates results.
 *
 * Architecture:
 *   1. TeamTask is created (from template or custom)
 *   2. Subtasks are analyzed for dependencies (DAG)
 *   3. Independent subtasks are dispatched in parallel
 *   4. As subtasks complete, dependent subtasks are unblocked
 *   5. All results are aggregated into a final response
 *
 * This implements Anthropic's "Agent Teams" pattern adapted for
 * our WhatsApp commerce platform.
 */
@Injectable()
export class TeamOrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TeamOrchestratorService.name);

  // Active team tasks being coordinated
  private activeTeamTasks: Map<string, TeamTask> = new Map();

  // Callbacks waiting for team task completion
  private completionCallbacks: Map<string, (result: TeamTask) => void> =
    new Map();
  private queuedTaskIds: Set<string> = new Set();
  private activeTimers: Set<NodeJS.Timeout> = new Set();

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async onModuleInit() {
    this.logger.log("Team Orchestrator initialized — فرق الوكلاء جاهزة");
    await this.ensureTeamTasksTable();
  }

  onModuleDestroy(): void {
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
    this.completionCallbacks.clear();
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Create and execute a team task from a template
   */
  async executeTeamTemplate(
    templateId: string,
    merchantId: string,
    input: Record<string, unknown>,
    options?: {
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      correlationId?: string;
    },
  ): Promise<TeamTask | null> {
    const template = TEAM_TASK_TEMPLATES.find(
      (t: TeamTaskTemplate) => t.id === templateId,
    );
    if (!template) {
      this.logger.warn(`Unknown team template: ${templateId}`);
      return null;
    }

    // Check if merchant has all required agents enabled
    const missingAgents = await this.checkAgentAvailability(
      merchantId,
      template.agents,
    );
    if (missingAgents.length > 0) {
      this.logger.warn({
        msg: "Merchant missing agents for team task",
        merchantId,
        templateId,
        missingAgents,
      });
      // Still proceed but skip subtasks for missing agents
    }

    const teamTaskData = createTeamTaskFromTemplate(
      templateId,
      merchantId,
      input,
      options,
    );
    if (!teamTaskData) return null;

    // Filter out subtasks for agents the merchant doesn't have
    if (missingAgents.length > 0) {
      teamTaskData.subtasks = teamTaskData.subtasks.filter(
        (st: Subtask) => !missingAgents.includes(st.agentType),
      );
      teamTaskData.totalSubtasks = teamTaskData.subtasks.length;
    }

    return this.executeTeamTask(teamTaskData);
  }

  /**
   * Create and execute a custom team task
   */
  async executeCustomTeam(params: CreateTeamTaskParams): Promise<TeamTask> {
    const teamTaskData = createTeamTask(params);
    return this.executeTeamTask(teamTaskData);
  }

  /**
   * Resolve an intent to a team task template (if applicable)
   */
  getTeamTemplateForIntent(intent: string): string | null {
    return TEAM_INTENTS[intent] || null;
  }

  /**
   * Check if an intent should be handled as a team task
   */
  isTeamIntent(intent: string): boolean {
    return intent in TEAM_INTENTS;
  }

  /**
   * Get status of an active team task
   */
  getTeamTaskStatus(teamTaskId: string): TeamTask | undefined {
    return this.activeTeamTasks.get(teamTaskId);
  }

  /**
   * Get all active team tasks for a merchant
   */
  getActiveMerchantTeamTasks(merchantId: string): TeamTask[] {
    return Array.from(this.activeTeamTasks.values()).filter(
      (tt) => tt.merchantId === merchantId,
    );
  }

  /**
   * Cancel a team task
   */
  async cancelTeamTask(teamTaskId: string): Promise<boolean> {
    const teamTask = this.activeTeamTasks.get(teamTaskId);
    if (!teamTask) return false;

    teamTask.status = "CANCELLED";
    teamTask.subtasks.forEach((st: Subtask) => {
      if (st.status === "PENDING" || st.status === "RUNNING") {
        st.status = "SKIPPED";
      }
    });

    await this.persistTeamTask(teamTask);
    this.activeTeamTasks.delete(teamTaskId);
    this.notifyCompletion(teamTaskId, teamTask);

    this.logger.log({ msg: "Team task cancelled", teamTaskId });
    return true;
  }

  /**
   * Wait for a team task to complete
   */
  waitForCompletion(
    teamTaskId: string,
    timeoutMs: number = 120000,
  ): Promise<TeamTask> {
    return new Promise((resolve, reject) => {
      const existing = this.activeTeamTasks.get(teamTaskId);
      if (
        existing &&
        ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(
          existing.status,
        )
      ) {
        return resolve(existing);
      }

      const timer = setTimeout(() => {
        this.activeTimers.delete(timer);
        this.completionCallbacks.delete(teamTaskId);
        const task = this.activeTeamTasks.get(teamTaskId);
        if (task) {
          task.status = "PARTIAL";
          resolve(task);
        } else {
          reject(new Error(`Team task ${teamTaskId} not found`));
        }
      }, timeoutMs);
      this.activeTimers.add(timer);

      this.completionCallbacks.set(teamTaskId, (result) => {
        clearTimeout(timer);
        this.activeTimers.delete(timer);
        resolve(result);
      });
    });
  }

  private parseDate(value: unknown): Date {
    if (value instanceof Date) return value;
    const parsed = new Date(String(value || Date.now()));
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private parseSubtasks(raw: unknown): Subtask[] {
    if (Array.isArray(raw)) return raw as Subtask[];
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as Subtask[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private hydratePersistedTask(row: any): TeamTask {
    const subtasks = this.parseSubtasks(row.subtasks);
    const totalSubtasks = Number(row.total_subtasks || subtasks.length || 0);
    const completedSubtasks = Number(
      row.completed_subtasks ||
        subtasks.filter((st) => st.status === "COMPLETED").length ||
        0,
    );
    const failedSubtasks = Number(
      row.failed_subtasks ||
        subtasks.filter((st) => st.status === "FAILED").length ||
        0,
    );
    const progressPercent = Number.isFinite(Number(row.progress_percent))
      ? Number(row.progress_percent)
      : totalSubtasks > 0
        ? Math.round(
            ((completedSubtasks + failedSubtasks) / totalSubtasks) * 100,
          )
        : 0;

    return {
      id: row.id,
      merchantId: row.merchant_id,
      correlationId: row.correlation_id || undefined,
      title: row.title || "مهمة جماعية",
      titleAr: row.title_ar || undefined,
      description: row.description || "",
      priority: row.priority || "MEDIUM",
      status: row.status || "PLANNING",
      strategy: row.strategy || "PARALLEL",
      failurePolicy: row.failure_policy || "CONTINUE_ON_ERROR",
      subtasks,
      aggregatedResult: row.aggregated_result || undefined,
      replyAr: row.reply_ar || undefined,
      maxParallelism: 4,
      timeoutMs: Number(row.timeout_ms || 120000),
      totalSubtasks,
      completedSubtasks,
      failedSubtasks,
      progressPercent,
      createdAt: this.parseDate(row.created_at),
      updatedAt: this.parseDate(row.updated_at),
      completedAt: row.completed_at
        ? this.parseDate(row.completed_at)
        : undefined,
    } as TeamTask;
  }

  private async resumeQueuedTask(row: any): Promise<void> {
    const teamTask = this.hydratePersistedTask(row);
    if (this.activeTeamTasks.has(teamTask.id)) return;

    this.activeTeamTasks.set(teamTask.id, teamTask);

    this.logger.log({
      msg: "Resuming queued team task",
      teamTaskId: teamTask.id,
      status: teamTask.status,
      totalSubtasks: teamTask.totalSubtasks,
    });

    try {
      switch (teamTask.strategy) {
        case "PARALLEL":
          await this.executeParallel(teamTask);
          break;
        case "SEQUENTIAL":
          await this.executeSequential(teamTask);
          break;
        case "DAG":
          await this.executeDAG(teamTask);
          break;
      }
    } catch (error) {
      this.logger.error({
        msg: "Queued team task execution error",
        teamTaskId: teamTask.id,
        error: (error as Error).message,
      });
      teamTask.status = "FAILED";
      await this.persistTeamTask(teamTask);
    } finally {
      this.queuedTaskIds.delete(teamTask.id);
    }
  }

  // ============================================================================
  // CORE ENGINE
  // ============================================================================

  /**
   * Execute a team task — the main orchestration loop
   */
  private async executeTeamTask(
    taskData: Omit<TeamTask, "id" | "createdAt" | "updatedAt">,
  ): Promise<TeamTask> {
    const teamTask: TeamTask = {
      ...taskData,
      id: `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as TeamTask;

    this.activeTeamTasks.set(teamTask.id, teamTask);

    this.logger.log({
      msg: "Starting team task",
      teamTaskId: teamTask.id,
      title: teamTask.title,
      totalSubtasks: teamTask.totalSubtasks,
      strategy: teamTask.strategy,
      agents: [
        ...new Set(teamTask.subtasks.map((st: Subtask) => st.agentType)),
      ],
    });

    // Persist to DB
    await this.persistTeamTask(teamTask);

    // Start execution based on strategy
    teamTask.status = "DISPATCHING";
    await this.persistTeamTask(teamTask);

    try {
      switch (teamTask.strategy) {
        case "PARALLEL":
          await this.executeParallel(teamTask);
          break;
        case "SEQUENTIAL":
          await this.executeSequential(teamTask);
          break;
        case "DAG":
          await this.executeDAG(teamTask);
          break;
      }
    } catch (error) {
      this.logger.error({
        msg: "Team task execution error",
        teamTaskId: teamTask.id,
        error: (error as Error).message,
      });
      teamTask.status = "FAILED";
    }

    return teamTask;
  }

  /**
   * Execute all subtasks in parallel
   */
  private async executeParallel(teamTask: TeamTask): Promise<void> {
    teamTask.status = "RUNNING";
    await this.persistTeamTask(teamTask);

    const promises = teamTask.subtasks.map((subtask: Subtask) =>
      this.executeSubtask(teamTask, subtask),
    );

    // Wait for all with concurrency limit
    await this.runWithConcurrency(promises, teamTask.maxParallelism);

    this.finalizeTeamTask(teamTask);
  }

  /**
   * Execute subtasks one after another
   */
  private async executeSequential(teamTask: TeamTask): Promise<void> {
    teamTask.status = "RUNNING";
    await this.persistTeamTask(teamTask);

    for (const subtask of teamTask.subtasks) {
      if ((teamTask.status as string) === "CANCELLED") break;

      await this.executeSubtask(teamTask, subtask);

      // Check failure policy
      if (
        subtask.status === "FAILED" &&
        teamTask.failurePolicy === "FAIL_FAST"
      ) {
        teamTask.status = "FAILED";
        // Skip remaining subtasks
        teamTask.subtasks
          .filter((st: Subtask) => st.status === "PENDING")
          .forEach((st: Subtask) => {
            st.status = "SKIPPED";
          });
        break;
      }
    }

    this.finalizeTeamTask(teamTask);
  }

  /**
   * Execute subtasks as a DAG (Directed Acyclic Graph)
   * Respects dependency ordering while maximizing parallelism
   */
  private async executeDAG(teamTask: TeamTask): Promise<void> {
    teamTask.status = "RUNNING";
    await this.persistTeamTask(teamTask);

    const completed = new Set<string>();
    const running = new Set<string>();
    let changed = true;

    while (changed) {
      changed = false;

      // Find subtasks that can run now (all dependencies met)
      const ready = teamTask.subtasks.filter(
        (st: Subtask) =>
          st.status === "PENDING" &&
          !running.has(st.id) &&
          st.dependsOn.every((depId: string) => {
            // Find the subtask with matching taskType (dependsOn references taskType)
            const depSubtask = teamTask.subtasks.find(
              (s: Subtask) => s.taskType === depId,
            );
            return depSubtask ? completed.has(depSubtask.id) : true;
          }),
      );

      if (ready.length === 0 && running.size === 0) break;

      // Launch ready subtasks in parallel (up to concurrency limit)
      const available = teamTask.maxParallelism - running.size;
      const toRun = ready.slice(0, Math.max(1, available));

      if (toRun.length > 0) {
        changed = true;
        const promises = toRun.map(async (subtask: Subtask) => {
          running.add(subtask.id);
          await this.executeSubtask(teamTask, subtask);
          running.delete(subtask.id);
          completed.add(subtask.id);
        });

        await Promise.all(promises);
      }

      // Check if we should abort
      if (
        teamTask.failurePolicy === "FAIL_FAST" &&
        teamTask.failedSubtasks > 0
      ) {
        teamTask.subtasks
          .filter((st: Subtask) => st.status === "PENDING")
          .forEach((st: Subtask) => {
            st.status = "SKIPPED";
          });
        break;
      }
    }

    this.finalizeTeamTask(teamTask);
  }

  /**
   * Execute a single subtask by dispatching it to the appropriate agent
   */
  private async executeSubtask(
    teamTask: TeamTask,
    subtask: Subtask,
  ): Promise<void> {
    const startTime = Date.now();
    subtask.status = "RUNNING";
    subtask.startedAt = new Date();

    try {
      // Dispatch to the orchestrator — schedule immediately
      const taskId = await this.orchestrator.scheduleTask(
        subtask.agentType,
        subtask.taskType,
        teamTask.merchantId,
        {
          ...subtask.input,
          _teamTaskId: teamTask.id,
          _subtaskId: subtask.id,
        },
        new Date(), // Run immediately
        {
          priority:
            teamTask.priority === "CRITICAL"
              ? 1
              : teamTask.priority === "HIGH"
                ? 2
                : 3,
          correlationId: teamTask.correlationId || teamTask.id,
          timeoutMinutes: 1,
        },
      );

      // Wait for the task to complete (poll with timeout)
      const result = await this.waitForAgentTask(taskId, 60000);

      subtask.completedAt = new Date();
      subtask.executionTimeMs = Date.now() - startTime;

      if (result?.success) {
        subtask.output = result.output || {};
        const outputFailureReason = this.extractOutputFailureReason(
          subtask.output,
        );
        if (outputFailureReason) {
          subtask.status = "FAILED";
          subtask.error = outputFailureReason;
          teamTask.failedSubtasks++;
        } else {
          subtask.status = "COMPLETED";
          teamTask.completedSubtasks++;
        }
      } else {
        subtask.status = "FAILED";
        subtask.error = result?.error || "Task execution failed";
        teamTask.failedSubtasks++;
      }
    } catch (error) {
      subtask.status = "FAILED";
      subtask.error = (error as Error).message;
      subtask.completedAt = new Date();
      subtask.executionTimeMs = Date.now() - startTime;
      teamTask.failedSubtasks++;
    }

    // Update progress
    const done = teamTask.completedSubtasks + teamTask.failedSubtasks;
    teamTask.progressPercent =
      teamTask.totalSubtasks > 0
        ? Math.round((done / teamTask.totalSubtasks) * 100)
        : 0;
    teamTask.updatedAt = new Date();
    await this.persistTeamTask(teamTask);

    this.logger.log({
      msg: "Subtask completed",
      teamTaskId: teamTask.id,
      subtaskId: subtask.id,
      agentType: subtask.agentType,
      status: subtask.status,
      progress: `${done}/${teamTask.totalSubtasks}`,
      executionTimeMs: subtask.executionTimeMs,
    });
  }

  /**
   * Wait for a scheduled agent task to complete
   */
  private async waitForAgentTask(
    taskId: string,
    timeoutMs: number,
  ): Promise<{
    success: boolean;
    output?: Record<string, unknown>;
    error?: string;
  } | null> {
    const deadline = Date.now() + timeoutMs;
    const pollInterval = 500; // 500ms polling

    while (Date.now() < deadline) {
      const result = await this.pool.query<{
        status: string;
        output: Record<string, unknown>;
        error: string;
      }>(`SELECT status, output, error FROM agent_tasks WHERE id = $1`, [
        taskId,
      ]);

      if (result.rows.length === 0) {
        await this.sleep(pollInterval);
        continue;
      }

      const task = result.rows[0];
      if (task.status === "COMPLETED") {
        return { success: true, output: task.output };
      }
      if (task.status === "FAILED" || task.status === "CANCELLED") {
        return { success: false, error: task.error };
      }

      await this.sleep(pollInterval);
    }

    return { success: false, error: "Task execution timed out" };
  }

  /**
   * Finalize team task — aggregate results and set final status
   */
  private finalizeTeamTask(teamTask: TeamTask): void {
    // Aggregate results from all completed subtasks
    const aggregated: Record<string, unknown> = {};
    const sections: string[] = [];

    for (const subtask of teamTask.subtasks) {
      if (subtask.status === "COMPLETED" && subtask.output) {
        aggregated[subtask.agentType] = {
          taskType: subtask.taskType,
          description: subtask.descriptionAr || subtask.description,
          result: subtask.output,
          executionTimeMs: subtask.executionTimeMs,
        };

        // Build Arabic reply section
        const sectionTitle = this.getAgentSectionTitle(subtask.agentType);
        const sectionData = this.toReadableSubtaskSummary(subtask);
        if (sectionData.length > 0) {
          sections.push(`📋 ${sectionTitle}:\n${sectionData}`);
        }
      }
    }

    teamTask.aggregatedResult = aggregated;
    teamTask.completedAt = new Date();

    // Determine final status
    if (teamTask.failedSubtasks === 0) {
      teamTask.status = "COMPLETED";
    } else if (teamTask.completedSubtasks > 0) {
      teamTask.status = "PARTIAL";
    } else {
      teamTask.status = "FAILED";
    }

    // Build final Arabic reply
    const header = teamTask.titleAr || teamTask.title;
    const statusEmoji =
      teamTask.status === "COMPLETED"
        ? "✅"
        : teamTask.status === "PARTIAL"
          ? "⚠️"
          : "❌";

    const sectionsBody =
      sections.length > 0
        ? sections.join("\n\n")
        : "لا يوجد ملخص AI نصي مباشر لهذه المهمة. راجع الناتج الخام.";
    teamTask.replyAr = `${statusEmoji} ${header}\n\n${sectionsBody}`;

    if (teamTask.failedSubtasks > 0) {
      const failedAgents = teamTask.subtasks
        .filter((st: Subtask) => st.status === "FAILED")
        .map((st: Subtask) => this.getAgentSectionTitle(st.agentType));
      teamTask.replyAr += `\n\n⚠️ فشل في: ${failedAgents.join("، ")}`;
    }

    teamTask.replyAr += `\n\n⏱️ الوقت: ${((teamTask.completedAt.getTime() - teamTask.createdAt.getTime()) / 1000).toFixed(1)} ثانية`;

    this.logger.log({
      msg: "Team task finalized",
      teamTaskId: teamTask.id,
      status: teamTask.status,
      completed: teamTask.completedSubtasks,
      failed: teamTask.failedSubtasks,
      total: teamTask.totalSubtasks,
      durationMs: teamTask.completedAt.getTime() - teamTask.createdAt.getTime(),
    });

    // Persist final state
    this.persistTeamTask(teamTask).catch((err) =>
      this.logger.error({
        msg: "Failed to persist team task",
        error: err.message,
      }),
    );

    // Notify waiters
    this.notifyCompletion(teamTask.id, teamTask);

    // Remove from active after a delay (keep for status queries)
    const cleanupTimer = setTimeout(() => {
      this.activeTeamTasks.delete(teamTask.id);
      this.activeTimers.delete(cleanupTimer);
    }, 300000); // 5 min
    this.activeTimers.add(cleanupTimer);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async checkAgentAvailability(
    merchantId: string,
    requiredAgents: AgentType[],
  ): Promise<AgentType[]> {
    try {
      const result = await this.pool.query<{ enabled_agents: string[] }>(
        `SELECT enabled_agents FROM merchants WHERE id = $1`,
        [merchantId],
      );

      if (result.rows.length === 0) return requiredAgents;

      const enabledAgents = result.rows[0].enabled_agents || [];
      return requiredAgents.filter((a) => !enabledAgents.includes(a));
    } catch {
      return []; // On error, assume all available
    }
  }

  private notifyCompletion(teamTaskId: string, result: TeamTask): void {
    const callback = this.completionCallbacks.get(teamTaskId);
    if (callback) {
      callback(result);
      this.completionCallbacks.delete(teamTaskId);
    }
  }

  private async runWithConcurrency(
    promises: Promise<void>[],
    limit: number,
  ): Promise<void> {
    const results: Promise<void>[] = [];
    const executing: Set<Promise<void>> = new Set();

    for (const p of promises) {
      const wrapped = p.then(() => {
        executing.delete(wrapped);
      });
      results.push(wrapped);
      executing.add(wrapped);

      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }

    await Promise.all(results);
  }

  private getAgentSectionTitle(agentType: AgentType): string {
    const titles: Record<string, string> = {
      OPS_AGENT: "🔄 العمليات",
      INVENTORY_AGENT: "📦 المخزون",
      FINANCE_AGENT: "💰 المالية",
      MARKETING_AGENT: "📢 التسويق",
      SUPPORT_AGENT: "🎧 الدعم",
      CONTENT_AGENT: "✍️ المحتوى",
      SALES_AGENT: "📊 المبيعات",
      CREATIVE_AGENT: "🎨 الإبداع",
    };
    return titles[agentType] || agentType;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  private async ensureTeamTasksTable(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS team_tasks (
          id TEXT PRIMARY KEY,
          merchant_id TEXT NOT NULL REFERENCES merchants(id),
          correlation_id TEXT,
          title TEXT NOT NULL,
          title_ar TEXT,
          description TEXT,
          priority TEXT DEFAULT 'MEDIUM',
          status TEXT DEFAULT 'PLANNING',
          strategy TEXT DEFAULT 'PARALLEL',
          failure_policy TEXT DEFAULT 'CONTINUE_ON_ERROR',
          subtasks JSONB NOT NULL DEFAULT '[]',
          aggregated_result JSONB,
          reply_ar TEXT,
          total_subtasks INT NOT NULL DEFAULT 0,
          completed_subtasks INT DEFAULT 0,
          failed_subtasks INT DEFAULT 0,
          progress_percent INT DEFAULT 0,
          timeout_ms INT DEFAULT 120000,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_team_tasks_merchant ON team_tasks(merchant_id);
        CREATE INDEX IF NOT EXISTS idx_team_tasks_status ON team_tasks(status);
        CREATE INDEX IF NOT EXISTS idx_team_tasks_created ON team_tasks(created_at DESC);
      `);
      this.logger.log("team_tasks table ready");
    } catch (error) {
      this.logger.error({
        msg: "Failed to create team_tasks table",
        error: (error as Error).message,
      });
    }
  }

  private async persistTeamTask(teamTask: TeamTask): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO team_tasks (
          id, merchant_id, correlation_id, title, title_ar, description,
          priority, status, strategy, failure_policy, subtasks,
          aggregated_result, reply_ar, total_subtasks, completed_subtasks,
          failed_subtasks, progress_percent, timeout_ms, created_at, updated_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        ON CONFLICT (id) DO UPDATE SET
          status = $8,
          subtasks = $11,
          aggregated_result = $12,
          reply_ar = $13,
          completed_subtasks = $15,
          failed_subtasks = $16,
          progress_percent = $17,
          updated_at = NOW(),
          completed_at = $21`,
        [
          teamTask.id,
          teamTask.merchantId,
          teamTask.correlationId,
          teamTask.title,
          teamTask.titleAr,
          teamTask.description,
          teamTask.priority,
          teamTask.status,
          teamTask.strategy,
          teamTask.failurePolicy,
          JSON.stringify(teamTask.subtasks),
          teamTask.aggregatedResult
            ? JSON.stringify(teamTask.aggregatedResult)
            : null,
          teamTask.replyAr,
          teamTask.totalSubtasks,
          teamTask.completedSubtasks,
          teamTask.failedSubtasks,
          teamTask.progressPercent,
          teamTask.timeoutMs,
          teamTask.createdAt,
          teamTask.updatedAt,
          teamTask.completedAt,
        ],
      );
    } catch (error) {
      this.logger.error({
        msg: "Failed to persist team task",
        teamTaskId: teamTask.id,
        error: (error as Error).message,
      });
    }
  }

  // ============================================================================
  // MONITORING — Cleanup stale team tasks
  // ============================================================================

  @Interval(5000) // Every 5 seconds
  async dispatchQueuedTeamTasks(): Promise<void> {
    try {
      const claimed = await this.pool.query(
        `UPDATE team_tasks
         SET status = 'DISPATCHING', updated_at = NOW()
         WHERE id IN (
           SELECT id
           FROM team_tasks
           WHERE status = 'PLANNING'
           ORDER BY created_at ASC
           LIMIT 3
         )
         RETURNING *`,
      );

      for (const row of claimed.rows) {
        if (
          this.queuedTaskIds.has(row.id) ||
          this.activeTeamTasks.has(row.id)
        ) {
          continue;
        }
        this.queuedTaskIds.add(row.id);
        void this.resumeQueuedTask(row);
      }
    } catch (error) {
      this.logger.warn({
        msg: "Failed to dispatch queued team tasks",
        error: (error as Error).message,
      });
    }
  }

  private extractOutputFailureReason(
    output: Record<string, unknown> | undefined,
  ): string | null {
    if (!output || typeof output !== "object") return null;
    const action = String((output as any).action || "").toUpperCase();
    if (action === "FAILED") {
      const actionMessage = String(
        (output as any).messageAr || (output as any).message || "",
      ).trim();
      return actionMessage || "فشل تنفيذ المهمة";
    }

    const errorMessage = String((output as any).error || "").trim();
    if (errorMessage.length > 0) {
      return errorMessage;
    }

    return null;
  }

  private toReadableSubtaskSummary(subtask: Subtask): string {
    const output =
      subtask.output && typeof subtask.output === "object"
        ? (subtask.output as Record<string, unknown>)
        : {};

    const summaryCandidates: unknown[] = [
      output.summaryAr,
      output.summary_ar,
      output.summary,
      output.messageAr,
      output.message_ar,
      output.message,
    ];

    for (const candidate of summaryCandidates) {
      if (typeof candidate !== "string") continue;
      const normalized = this.translateCommonEnglishMessage(candidate.trim());
      if (normalized.length > 0) return normalized;
    }
    // No synthetic summaries: if an explicit text summary is not provided by the
    // subtask output itself, keep it empty and show raw data elsewhere.
    return "";
  }

  private translateCommonEnglishMessage(message: string): string {
    const normalized = message.trim();
    if (normalized === "No orders found for the reporting period") {
      return "لا توجد طلبات في الفترة المحددة للتقرير.";
    }
    if (normalized === "Weekly CFO brief generated successfully") {
      return "تم إنشاء الملخص المالي بنجاح.";
    }
    return normalized;
  }

  @Interval(60000) // Every minute
  async cleanupStaleTeamTasks(): Promise<void> {
    const now = Date.now();

    for (const [id, teamTask] of this.activeTeamTasks) {
      const elapsed = now - teamTask.createdAt.getTime();

      if (elapsed > teamTask.timeoutMs && teamTask.status === "RUNNING") {
        this.logger.warn({
          msg: "Team task timed out",
          teamTaskId: id,
          elapsed,
          timeout: teamTask.timeoutMs,
        });

        // Mark pending subtasks as skipped
        teamTask.subtasks
          .filter(
            (st: Subtask) => st.status === "PENDING" || st.status === "RUNNING",
          )
          .forEach((st: Subtask) => {
            st.status = "SKIPPED";
          });

        this.finalizeTeamTask(teamTask);
      }
    }
  }
}
