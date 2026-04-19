/**
 * Agent Teams Controller — فرق الوكلاء
 *
 * Provides endpoints for creating, monitoring, and managing team tasks
 * where multiple agents work in parallel on complex operations.
 *
 * This implements the "Agent Teams" pattern where instead of one agent
 * working sequentially, work is distributed across multiple agents,
 * each owning their part and coordinating results.
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from "@nestjs/swagger";
import { Pool } from "pg";
import { Request, Response } from "express";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { RolesGuard, RequireRole } from "../../shared/guards/roles.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { TEAM_TASK_TEMPLATES, TEAM_INTENTS } from "@tash8eel/agent-sdk";

@ApiTags("Agent Teams — فرق الوكلاء")
@ApiBearerAuth()
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal/teams")
export class AgentTeamsController {
  private readonly logger = new Logger(AgentTeamsController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private parseSubtasks(raw: unknown): any[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private formatDateTime(value: unknown): string {
    const date = value instanceof Date ? value : new Date(String(value || ""));
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private subtaskStatusLabel(status: unknown): string {
    const upper = String(status || "").toUpperCase();
    if (upper === "COMPLETED") return "تم بنجاح";
    if (upper === "FAILED") return "فشل";
    if (upper === "SKIPPED") return "تم التخطي";
    if (upper === "RUNNING") return "قيد التنفيذ";
    if (upper === "PENDING") return "بانتظار التنفيذ";
    return upper || "غير معروف";
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private formatPrettyJson(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value ?? "");
    }
  }

  private buildTaskReportText(task: any): string {
    const lines: string[] = [];
    const status = this.mapTaskRow(task, false)?.status;
    const statusLabels: Record<string, string> = {
      PLANNING: "جاري التخطيط",
      DISPATCHING: "جاري التوزيع",
      RUNNING: "قيد التنفيذ",
      AGGREGATING: "جاري التجميع",
      COMPLETED: "مكتمل",
      PARTIAL: "مكتمل جزئياً",
      FAILED: "فشل",
      CANCELLED: "ملغى",
    };
    const mapped = this.mapTaskRow(task, true);
    const progress = mapped.progress || { total: 0, completed: 0, failed: 0 };
    const subtasks: any[] = Array.isArray(mapped.subtasks)
      ? mapped.subtasks
      : [];
    const summary = String(mapped.resultSummaryAr || "").trim();
    const reportSourceLabel =
      mapped.reportSource === "agent_output"
        ? "مخرجات نصية مباشرة من الوكلاء"
        : "بيانات تشغيل خام فقط (بدون تحليل AI نصي)";

    lines.push(`# ${mapped.titleAr || "تقرير جماعي"}`);
    lines.push("");
    lines.push(`الحالة: ${statusLabels[status] || status}`);
    lines.push(
      `التقدم: ${progress.completed}/${progress.total} (فشل: ${progress.failed})`,
    );
    lines.push(`مصدر التقرير: ${reportSourceLabel}`);
    lines.push(`بدأت المهمة: ${this.formatDateTime(mapped.createdAt)}`);
    lines.push(`انتهت المهمة: ${this.formatDateTime(mapped.completedAt)}`);
    lines.push("");

    if (summary.length > 0) {
      lines.push("## الملخص التنفيذي");
      lines.push(summary);
      lines.push("");
    } else {
      lines.push("## الملخص التنفيذي");
      lines.push(
        "لا يوجد تحليل AI نصي محفوظ لهذه المهمة. راجع ناتج البيانات الخام بالأسفل.",
      );
      lines.push("");
    }

    if (
      Array.isArray(mapped.failureReasons) &&
      mapped.failureReasons.length > 0
    ) {
      lines.push("## أسباب الفشل");
      mapped.failureReasons.forEach((reason: string, idx: number) => {
        lines.push(`${idx + 1}. ${String(reason || "").trim()}`);
      });
      lines.push("");
    }

    if (subtasks.length > 0) {
      lines.push("## تفاصيل المهام الفرعية");
      subtasks.forEach((subtask, idx) => {
        lines.push(
          `${idx + 1}. ${String(subtask.descriptionAr || subtask.description || subtask.taskType || "مهمة فرعية")}`,
        );
        lines.push(`   - الحالة: ${this.subtaskStatusLabel(subtask.status)}`);

        const output =
          subtask?.output && typeof subtask.output === "object"
            ? subtask.output
            : null;
        const outputSummary = output
          ? [
              output.summaryAr,
              output.summary_ar,
              output.summary,
              output.messageAr,
              output.message_ar,
              output.message,
            ].find(
              (entry) => typeof entry === "string" && entry.trim().length > 0,
            )
          : null;

        if (
          typeof outputSummary === "string" &&
          outputSummary.trim().length > 0
        ) {
          lines.push(`   - المخرجات: ${outputSummary.trim()}`);
        } else if (output) {
          lines.push("   - المخرجات:");
          this.formatPrettyJson(output)
            .split("\n")
            .forEach((line) => {
              lines.push(`     ${line}`);
            });
        }

        if (subtask?.error) {
          lines.push(`   - الخطأ: ${String(subtask.error)}`);
        }

        lines.push("");
      });
    }

    if (mapped.aggregatedResult) {
      lines.push("## الناتج الخام (JSON)");
      lines.push(this.formatPrettyJson(mapped.aggregatedResult));
      lines.push("");
    }

    lines.push(`تاريخ إنشاء التقرير: ${this.formatDateTime(new Date())}`);
    return lines.join("\n").trim();
  }

  private buildTaskReportHtml(title: string, body: string): string {
    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${this.escapeHtml(title)}</title>
  <style>
    body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; margin: 24px; color: #0f172a; background: #fff; }
    h1 { margin: 0 0 16px; font-size: 24px; }
    pre { white-space: pre-wrap; line-height: 1.8; font-size: 13px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .meta { color: #64748b; margin-bottom: 12px; font-size: 12px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(title)}</h1>
  <div class="meta">تم التوليد من مهمة الوكلاء الجماعية</div>
  <pre>${this.escapeHtml(body)}</pre>
</body>
</html>`;
  }

  private toInt(value: unknown): number {
    const parsed = Number.parseInt(String(value ?? "0"), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private buildSubtaskInput(
    taskType: string,
    merchantId: string,
    baseInput: Record<string, unknown>,
  ): Record<string, unknown> {
    const input: Record<string, unknown> = { ...baseInput };
    if (!input.merchantId) input.merchantId = merchantId;

    if (taskType === "inventory_report" && !input.reportType) {
      input.reportType = "summary";
    }

    return input;
  }

  private extractFailureReason(subtask: any): string | null {
    const directCandidates: unknown[] = [
      subtask?.errorAr,
      subtask?.error_ar,
      subtask?.failureReasonAr,
      subtask?.failure_reason_ar,
      subtask?.failureReason,
      subtask?.failure_reason,
      subtask?.reasonAr,
      subtask?.reason_ar,
      subtask?.reason,
      subtask?.messageAr,
      subtask?.message_ar,
      subtask?.message,
      subtask?.error,
      subtask?.lastError,
      subtask?.last_error,
    ];

    const resultObj =
      subtask?.result && typeof subtask.result === "object"
        ? subtask.result
        : null;
    if (resultObj) {
      directCandidates.push(
        resultObj.errorAr,
        resultObj.error_ar,
        resultObj.failureReasonAr,
        resultObj.failure_reason_ar,
        resultObj.failureReason,
        resultObj.failure_reason,
        resultObj.reasonAr,
        resultObj.reason_ar,
        resultObj.reason,
        resultObj.messageAr,
        resultObj.message_ar,
        resultObj.message,
        resultObj.error,
      );
    }

    for (const candidate of directCandidates) {
      if (typeof candidate !== "string") continue;
      const normalized = candidate.trim();
      if (normalized.length > 0) return this.humanizeFailureReason(normalized);
    }

    const label = String(
      subtask?.descriptionAr ||
        subtask?.description ||
        subtask?.titleAr ||
        subtask?.title ||
        subtask?.agentType ||
        "",
    ).trim();
    if (label.length > 0) return `تعذر تنفيذ: ${label}`;
    return "تعذر تنفيذ مهمة فرعية";
  }

  private humanizeFailureReason(raw: string): string {
    const msg = raw.trim();
    const lower = msg.toLowerCase();

    if (lower.includes("column v.quantity_available does not exist")) {
      return "تعذر تنفيذ تقرير المخزون: حقل الكمية المتاحة غير متاح في قاعدة البيانات الحالية.";
    }
    if (lower.includes("invalid input syntax for type uuid")) {
      return "فشل داخلي في معرف المهمة. تم إصلاح السبب وسيتم التنفيذ بشكل صحيح في المهام الجديدة.";
    }

    return msg;
  }

  private collectFailureReasons(subtasks: any[], max = 3): string[] {
    if (!Array.isArray(subtasks) || subtasks.length === 0) return [];
    const reasons: string[] = [];
    const seen = new Set<string>();

    for (const subtask of subtasks) {
      const status = String(subtask?.status || "").toUpperCase();
      if (!["FAILED", "SKIPPED"].includes(status)) continue;

      const reason = this.extractFailureReason(subtask);
      if (!reason) continue;

      const dedupeKey = reason.trim().toLowerCase();
      if (dedupeKey.length === 0 || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      reasons.push(reason);

      if (reasons.length >= max) break;
    }

    return reasons;
  }

  private extractCompletionSummary(subtask: any): string | null {
    const output =
      subtask?.output && typeof subtask.output === "object"
        ? subtask.output
        : null;
    const directCandidates: unknown[] = [
      subtask?.summaryAr,
      subtask?.summary_ar,
      subtask?.summary,
      subtask?.messageAr,
      subtask?.message_ar,
      subtask?.message,
      output?.summaryAr,
      output?.summary_ar,
      output?.summary,
      output?.messageAr,
      output?.message_ar,
      output?.message,
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate !== "string") continue;
      const normalized = candidate.trim();
      if (normalized.length > 0) return normalized;
    }
    return null;
  }

  private collectCompletionSummaries(subtasks: any[], max = 3): string[] {
    if (!Array.isArray(subtasks) || subtasks.length === 0) return [];
    const summaries: string[] = [];
    const seen = new Set<string>();

    for (const subtask of subtasks) {
      const status = String(subtask?.status || "").toUpperCase();
      if (status !== "COMPLETED") continue;

      const summary = this.extractCompletionSummary(subtask);
      if (!summary) continue;

      const dedupeKey = summary.trim().toLowerCase();
      if (dedupeKey.length === 0 || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      summaries.push(summary);

      if (summaries.length >= max) break;
    }

    return summaries;
  }

  private mapTaskRow(row: any, includeDetails = false): any {
    const subtasks = this.parseSubtasks(row.subtasks);
    const subtasksTotal = subtasks.length;
    const subtasksCompleted = subtasks.filter(
      (st) => String(st?.status || "").toUpperCase() === "COMPLETED",
    ).length;
    const subtasksFailed = subtasks.filter((st) =>
      ["FAILED", "SKIPPED"].includes(String(st?.status || "").toUpperCase()),
    ).length;
    const failureReasons = this.collectFailureReasons(subtasks);
    const completionSummaries = this.collectCompletionSummaries(subtasks);
    const reportSource: "agent_output" | "raw" =
      completionSummaries.length > 0 ? "agent_output" : "raw";
    const replyAr =
      reportSource === "agent_output" && typeof row.reply_ar === "string"
        ? row.reply_ar.trim()
        : "";

    const total = this.toInt(row.total_subtasks) || subtasksTotal;
    const completed = this.toInt(row.completed_subtasks) || subtasksCompleted;
    const failed = this.toInt(row.failed_subtasks) || subtasksFailed;

    const fallbackPercent =
      total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;
    const storedPercent = this.toInt(row.progress_percent);
    const hasMeaningfulStoredPercent =
      row.progress_percent !== null &&
      row.progress_percent !== undefined &&
      storedPercent > 0;
    const percent = hasMeaningfulStoredPercent
      ? storedPercent
      : fallbackPercent;

    return {
      id: row.id,
      titleAr: row.title_ar,
      titleEn: row.title,
      status: row.status,
      strategy: row.strategy,
      progress: {
        total,
        completed,
        failed,
        percent: Math.max(0, Math.min(100, percent)),
      },
      failureReasons,
      completionSummaries,
      resultSummaryAr:
        completionSummaries.length > 0 ? completionSummaries.join("\n") : null,
      reportSource,
      ...(includeDetails
        ? {
            subtasks,
            aggregatedResult: row.aggregated_result,
            replyAr: replyAr.length > 0 ? replyAr : null,
          }
        : {}),
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  /**
   * Get available team task templates
   */
  @Get("templates")
  @ApiOperation({
    summary: "Get available team task templates",
    description:
      "Returns all predefined team task templates with required agents and subtask structure",
  })
  @ApiResponse({ status: 200, description: "List of team task templates" })
  async getTemplates(@Req() req: Request): Promise<any> {
    const merchantId = (req as any).merchantId;

    // Get merchant's enabled agents
    let enabledAgents: string[] = [];
    try {
      const result = await this.pool.query<{ enabled_agents: string[] }>(
        `SELECT enabled_agents FROM merchants WHERE id = $1`,
        [merchantId],
      );
      enabledAgents = result.rows[0]?.enabled_agents || [];
    } catch {
      // Default to basic agents
      enabledAgents = ["OPS_AGENT"];
    }

    const templates = TEAM_TASK_TEMPLATES.map((template) => {
      const missingAgents = template.agents.filter(
        (a) => !enabledAgents.includes(a),
      );
      return {
        id: template.id,
        nameAr: template.nameAr,
        nameEn: template.nameEn,
        descriptionAr: template.descriptionAr,
        descriptionEn: template.descriptionEn,
        agents: template.agents,
        subtasksCount: template.subtasksTemplate.length,
        subtasks: template.subtasksTemplate.map((st) => ({
          agentType: st.agentType,
          descriptionAr: st.descriptionAr,
          descriptionEn: st.descriptionEn,
          hasDependencies: !!st.dependsOn?.length,
        })),
        isAvailable: missingAgents.length === 0,
        missingAgents,
      };
    });

    return {
      templates,
      totalAvailable: templates.filter((t) => t.isAvailable).length,
      totalTemplates: templates.length,
    };
  }

  /**
   * Execute a team task from a template
   */
  @Post("execute/:templateId")
  @RequireRole("MANAGER")
  @RequiresFeature("REPORTS")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Execute a team task",
    description:
      "Create and dispatch a team task from a predefined template. Multiple agents work in parallel.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        input: { type: "object", description: "Input data for the team task" },
        priority: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        },
      },
    },
  })
  @ApiResponse({ status: 202, description: "Team task dispatched" })
  @ApiResponse({
    status: 400,
    description: "Invalid template or missing agents",
  })
  async executeTeamTask(
    @Req() req: Request,
    @Param("templateId") templateId: string,
    @Body() body: { input?: Record<string, unknown>; priority?: string },
  ): Promise<any> {
    const merchantId = (req as any).merchantId;

    const template = TEAM_TASK_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      throw new BadRequestException(`Unknown template: ${templateId}`);
    }

    // Create the team task record in DB (worker will pick it up)
    const teamTaskId = `team_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const subtasks = template.subtasksTemplate.map((st, i) => ({
      id: `st_${Date.now()}_${i}`,
      agentType: st.agentType,
      taskType: st.taskType,
      description: st.descriptionEn,
      descriptionAr: st.descriptionAr,
      input: this.buildSubtaskInput(st.taskType, merchantId, body.input || {}),
      dependsOn: st.dependsOn || [],
      status: "PENDING",
    }));

    try {
      await this.pool.query(
        `INSERT INTO team_tasks (
          id, merchant_id, title, title_ar, description,
          priority, status, strategy, failure_policy, subtasks,
          total_subtasks, timeout_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, 'PLANNING', $7, 'CONTINUE_ON_ERROR', $8, $9, 120000)`,
        [
          teamTaskId,
          merchantId,
          template.nameEn,
          template.nameAr,
          template.descriptionEn,
          body.priority || "MEDIUM",
          template.subtasksTemplate.some((st) => st.dependsOn?.length)
            ? "DAG"
            : "PARALLEL",
          JSON.stringify(subtasks),
          subtasks.length,
        ],
      );
    } catch (error) {
      this.logger.error({
        msg: "Failed to create team task",
        error: (error as Error).message,
      });
      throw new BadRequestException("Failed to create team task");
    }

    this.logger.log({
      msg: "Team task created",
      teamTaskId,
      templateId,
      merchantId,
      agents: template.agents,
    });

    return {
      success: true,
      teamTaskId,
      templateId,
      titleAr: template.nameAr,
      agents: template.agents,
      subtasksCount: subtasks.length,
      status: "PLANNING",
      message: `🚀 تم إطلاق "${template.nameAr}" — ${template.agents.length} وكلاء يعملون بالتوازي`,
    };
  }

  /**
   * Get team task status and results
   */
  @Get("tasks/:taskId")
  @ApiOperation({
    summary: "Get team task status",
    description: "Returns current status, progress, and results of a team task",
  })
  @ApiResponse({ status: 200, description: "Team task details" })
  @ApiResponse({ status: 404, description: "Team task not found" })
  async getTeamTaskStatus(
    @Req() req: Request,
    @Param("taskId") taskId: string,
  ): Promise<any> {
    const merchantId = (req as any).merchantId;

    const result = await this.pool.query(
      `SELECT * FROM team_tasks WHERE id = $1 AND merchant_id = $2`,
      [taskId, merchantId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Team task not found: ${taskId}`);
    }

    return this.mapTaskRow(result.rows[0], true);
  }

  /**
   * Download/view a team task report artifact
   */
  @Get("tasks/:taskId/report")
  @ApiOperation({
    summary: "Get team task report artifact",
    description:
      "Returns the generated team report as JSON, text, or printable HTML",
  })
  @ApiResponse({ status: 200, description: "Team task report returned" })
  async getTeamTaskReport(
    @Req() req: Request,
    @Param("taskId") taskId: string,
    @Query("format") format: "json" | "txt" | "html" = "json",
    @Res() res: Response,
  ): Promise<void> {
    const merchantId = (req as any).merchantId;

    const result = await this.pool.query(
      `SELECT * FROM team_tasks WHERE id = $1 AND merchant_id = $2`,
      [taskId, merchantId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Team task not found: ${taskId}`);
    }

    const row = result.rows[0];
    const mapped = this.mapTaskRow(row, true);
    const reportText = this.buildTaskReportText(row);
    const title = String(mapped.titleAr || mapped.titleEn || "team-report");
    const safeBaseName = `${
      title
        .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "team-report"
    }-${taskId}`;

    if (format === "txt") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeBaseName}.txt"`,
      );
      res.send(reportText);
      return;
    }

    if (format === "html") {
      const html = this.buildTaskReportHtml(title, reportText);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeBaseName}.html"`,
      );
      res.send(html);
      return;
    }

    res.json({
      ...mapped,
      reportText,
    });
  }

  /**
   * List merchant's team tasks
   */
  @Get("tasks")
  @ApiOperation({
    summary: "List team tasks",
    description: "Returns all team tasks for the merchant, most recent first",
  })
  @ApiResponse({ status: 200, description: "List of team tasks" })
  async listTeamTasks(@Req() req: Request): Promise<any> {
    const merchantId = (req as any).merchantId;

    const result = await this.pool.query(
      `SELECT id, title, title_ar, status, strategy, total_subtasks,
              completed_subtasks, failed_subtasks, progress_percent, subtasks, reply_ar,
              created_at, completed_at
       FROM team_tasks 
       WHERE merchant_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [merchantId],
    );

    return {
      tasks: result.rows.map((row) => this.mapTaskRow(row, false)),
      total: result.rows.length,
    };
  }

  /**
   * Cancel a team task
   */
  @Delete("tasks/:taskId")
  @RequireRole("ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Cancel a team task",
    description: "Cancels a running or pending team task",
  })
  async cancelTeamTask(
    @Req() req: Request,
    @Param("taskId") taskId: string,
  ): Promise<any> {
    const merchantId = (req as any).merchantId;

    const result = await this.pool.query(
      `UPDATE team_tasks SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1 AND merchant_id = $2 AND status IN ('PLANNING', 'DISPATCHING', 'RUNNING')
       RETURNING id`,
      [taskId, merchantId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException("Team task not found or already completed");
    }

    return {
      success: true,
      message: "تم إلغاء المهمة الجماعية",
    };
  }

  /**
   * Get team intents mapping
   */
  @Get("intents")
  @ApiOperation({
    summary: "Get team intent mappings",
    description: "Returns which copilot intents trigger team task templates",
  })
  async getTeamIntents(): Promise<any> {
    return {
      intents: Object.entries(TEAM_INTENTS).map(([intent, templateId]) => ({
        intent,
        templateId,
        template: TEAM_TASK_TEMPLATES.find((t) => t.id === templateId),
      })),
    };
  }
}
