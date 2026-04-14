import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { AuditService } from "../../application/services/audit.service";
import { NotificationsService } from "../../application/services/notifications.service";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { RolesGuard } from "../../shared/guards/roles.guard";
import { getMerchantId, toNumber } from "./portal-compat.helpers";

interface VoiceTranscriptItem {
  speaker: string;
  text: string;
  at?: string;
}

type CallFollowUpWorkflowState = "OPEN" | "CLAIMED" | "ASSIGNED" | "RESOLVED";
type CallFollowUpDisposition =
  | "ORDER_CREATED"
  | "CALLBACK_REQUESTED"
  | "NO_ANSWER"
  | "NOT_INTERESTED"
  | "ESCALATED";

const MISSED_CALL_STATUSES = [
  "missed",
  "busy",
  "failed",
  "no-answer",
  "canceled",
] as const;

const CALL_FOLLOWUP_WORKFLOW_STATES: CallFollowUpWorkflowState[] = [
  "OPEN",
  "CLAIMED",
  "ASSIGNED",
  "RESOLVED",
];

const CALL_FOLLOWUP_DISPOSITIONS: CallFollowUpDisposition[] = [
  "ORDER_CREATED",
  "CALLBACK_REQUESTED",
  "NO_ANSWER",
  "NOT_INTERESTED",
  "ESCALATED",
];

const DEFAULT_CALLBACK_DELAY_MINUTES = 120;
const DEFAULT_BRIDGE_DUE_WITHIN_HOURS = 24;
const DEFAULT_BRIDGE_MAX_RECIPIENTS = 120;
const DEFAULT_BRIDGE_INACTIVE_DAYS = 30;

type CallbackCampaignBridgeStatus =
  | "DRAFT"
  | "APPROVED"
  | "EXECUTING"
  | "EXECUTED"
  | "CANCELLED";

const CALLBACK_CAMPAIGN_BRIDGE_STATUSES: CallbackCampaignBridgeStatus[] = [
  "DRAFT",
  "APPROVED",
  "EXECUTING",
  "EXECUTED",
  "CANCELLED",
];

interface CallbackBridgeRecipientRow {
  call_id: string;
  workflow_event_id: string | null;
  customer_phone: string;
  customer_name: string | null;
  callback_due_at: Date | null;
}

interface CallFollowUpWorkflowSnapshot {
  callId: string;
  callStatus: string;
  customerPhone: string;
  orderId: string | null;
  workflowState: CallFollowUpWorkflowState;
  claimedBy: string | null;
  assignedTo: string | null;
  disposition: CallFollowUpDisposition | null;
  callbackDueAt: Date | null;
  workflowMetadata: Record<string, unknown>;
  workflowUpdatedAt: Date | null;
}

@ApiTags("Merchant Portal Compatibility")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalCallsController {
  private readonly logger = new Logger(PortalCallsController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  @Get("calls")
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({ summary: "List merchant voice calls" })
  async getCalls(
    @Req() req: Request,
    @Query("limit") limitRaw?: string,
    @Query("offset") offsetRaw?: string,
    @Query("handledBy") handledBy?: string,
    @Query("status") status?: string,
  ) {
    const merchantId = getMerchantId(req);
    const limit = Math.min(Math.max(Number(limitRaw || 25) || 25, 1), 100);
    const offset = Math.max(Number(offsetRaw || 0) || 0, 0);

    const filters: string[] = ["vc.merchant_id = $1"];
    const params: unknown[] = [merchantId];

    const handledByNormalized = String(handledBy || "")
      .trim()
      .toLowerCase();
    if (handledByNormalized) {
      params.push(handledByNormalized);
      filters.push(`LOWER(COALESCE(vc.handled_by, '')) = $${params.length}`);
    }

    const statusNormalized = String(status || "")
      .trim()
      .toLowerCase();
    if (statusNormalized) {
      params.push(statusNormalized);
      filters.push(`LOWER(COALESCE(vc.status, '')) = $${params.length}`);
    }

    params.push(limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;

    try {
      const result = await this.pool.query<{
        id: string;
        customer_phone: string;
        call_sid: string;
        started_at: Date;
        ended_at: Date | null;
        duration_seconds: number | null;
        handled_by: string;
        status: string;
        transcript: unknown;
        order_id: string | null;
        order_number: string | null;
        recording_url: string | null;
      }>(
        `SELECT
           vc.id::text as id,
           vc.customer_phone,
           vc.call_sid,
           vc.started_at,
           vc.ended_at,
           vc.duration_seconds,
           COALESCE(vc.handled_by, 'ai') as handled_by,
           COALESCE(vc.status, 'active') as status,
           COALESCE(vc.transcript, '[]'::jsonb) as transcript,
           vc.order_id::text as order_id,
           o.order_number,
           vc.recording_url
         FROM voice_calls vc
         LEFT JOIN orders o ON o.id::text = vc.order_id::text
         WHERE ${filters.join(" AND ")}
         ORDER BY vc.started_at DESC
         LIMIT $${limitIndex}
         OFFSET $${offsetIndex}`,
        params,
      );

      const calls = result.rows.map((row) => ({
        id: row.id,
        customerPhone: row.customer_phone,
        callSid: row.call_sid,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        durationSeconds: row.duration_seconds,
        handledBy: row.handled_by,
        status: row.status,
        transcript: this.parseTranscript(row.transcript),
        orderId: row.order_id,
        orderNumber: row.order_number,
        recordingUrl: row.recording_url,
      }));

      return {
        calls,
        total: calls.length,
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "";
      if (message.includes("voice_calls")) {
        return { calls: [], total: 0 };
      }

      throw error;
    }
  }

  @Get("calls/stats")
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({ summary: "Voice call dashboard stats" })
  async getCallStats(@Req() req: Request, @Query("days") daysRaw?: string) {
    const merchantId = getMerchantId(req);
    const days = Math.min(Math.max(Number(daysRaw || 1) || 1, 1), 90);

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (days - 1));

    try {
      const result = await this.pool.query<{
        calls_total: string;
        ai_handled: string;
        staff_handled: string;
        missed_calls: string;
        orders_from_calls: string;
      }>(
        `SELECT
           COUNT(*)::text as calls_total,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(handled_by, 'ai')) = 'ai')::text as ai_handled,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(handled_by, '')) = 'staff')::text as staff_handled,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'missed')::text as missed_calls,
           COUNT(*) FILTER (WHERE order_id IS NOT NULL)::text as orders_from_calls
         FROM voice_calls
         WHERE merchant_id = $1
           AND started_at >= $2`,
        [merchantId, startDate],
      );

      const row = result.rows[0];
      return {
        periodDays: days,
        callsToday: toNumber(row?.calls_total, 0),
        aiHandled: toNumber(row?.ai_handled, 0),
        staffHandled: toNumber(row?.staff_handled, 0),
        missedCalls: toNumber(row?.missed_calls, 0),
        ordersFromCalls: toNumber(row?.orders_from_calls, 0),
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "";
      if (message.includes("voice_calls")) {
        return {
          periodDays: days,
          callsToday: 0,
          aiHandled: 0,
          staffHandled: 0,
          missedCalls: 0,
          ordersFromCalls: 0,
        };
      }

      throw error;
    }
  }

  @Get("calls/follow-up-queue")
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({ summary: "Operational follow-up queue for missed calls" })
  async getFollowUpQueue(
    @Req() req: Request,
    @Query("limit") limitRaw?: string,
    @Query("offset") offsetRaw?: string,
    @Query("hours") hoursRaw?: string,
    @Query("includeResolved") includeResolvedRaw?: string,
    @Query("handledBy") handledByRaw?: string,
  ) {
    const merchantId = getMerchantId(req);
    const limit = this.parseBoundedInt(limitRaw, 25, 1, 100);
    const offset = this.parseBoundedInt(offsetRaw, 0, 0, 5000);
    const hours = this.parseBoundedInt(hoursRaw, 48, 1, 720);
    const includeResolved = this.parseBooleanQuery(includeResolvedRaw, false);
    const handledByFilter = this.parseHandledByFilter(handledByRaw);

    const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000);

    const runQueueQuery = async (withWorkflow: boolean) => {
      const filters: string[] = [
        "vc.merchant_id = $1",
        "vc.started_at >= $2",
        `LOWER(COALESCE(vc.status, '')) IN ('missed', 'busy', 'failed', 'no-answer', 'canceled')`,
      ];
      const baseParams: unknown[] = [merchantId, windowStart];

      if (!includeResolved) {
        filters.push("vc.order_id IS NULL");
        if (withWorkflow) {
          filters.push("COALESCE(cfw.state, 'OPEN') <> 'RESOLVED'");
        }
      }

      if (handledByFilter !== "all") {
        baseParams.push(handledByFilter);
        filters.push(
          `LOWER(COALESCE(vc.handled_by, 'ai')) = $${baseParams.length}`,
        );
      }

      const workflowJoin = withWorkflow
        ? "LEFT JOIN call_followup_workflows cfw ON cfw.call_id = vc.id AND cfw.merchant_id = vc.merchant_id"
        : "";

      const workflowProjection = withWorkflow
        ? `
           COALESCE(cfw.state, 'OPEN') as workflow_state,
           cfw.claimed_by,
           cfw.assigned_to,
           cfw.disposition,
           cfw.callback_due_at,
           cfw.updated_at as workflow_updated_at`
        : `
           'OPEN'::text as workflow_state,
           NULL::text as claimed_by,
           NULL::text as assigned_to,
           NULL::text as disposition,
           NULL::timestamptz as callback_due_at,
           NULL::timestamptz as workflow_updated_at`;

      const totalResult = await this.pool.query<{ total: string }>(
        `SELECT COUNT(*)::text as total
         FROM voice_calls vc
         ${workflowJoin}
         WHERE ${filters.join(" AND ")}`,
        baseParams,
      );

      const queryParams = [...baseParams];
      queryParams.push(limit);
      const limitIndex = queryParams.length;
      queryParams.push(offset);
      const offsetIndex = queryParams.length;

      const queueResult = await this.pool.query<{
        id: string;
        call_sid: string;
        customer_phone: string;
        started_at: Date;
        ended_at: Date | null;
        duration_seconds: number | null;
        handled_by: string;
        status: string;
        order_id: string | null;
        recording_url: string | null;
        missed_attempts: string;
        last_attempt_at: Date | null;
        workflow_state: string;
        claimed_by: string | null;
        assigned_to: string | null;
        disposition: string | null;
        callback_due_at: Date | null;
        workflow_updated_at: Date | null;
      }>(
        `SELECT
           vc.id::text as id,
           vc.call_sid,
           vc.customer_phone,
           vc.started_at,
           vc.ended_at,
           vc.duration_seconds,
           COALESCE(vc.handled_by, 'ai') as handled_by,
           COALESCE(vc.status, 'unknown') as status,
           vc.order_id::text as order_id,
           vc.recording_url,
           COALESCE(attempts.missed_attempts, 0)::text as missed_attempts,
           attempts.last_attempt_at,
           ${workflowProjection}
         FROM voice_calls vc
         ${workflowJoin}
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*) FILTER (
               WHERE LOWER(COALESCE(vc2.status, '')) IN ('missed', 'busy', 'failed', 'no-answer', 'canceled')
             )::int as missed_attempts,
             MAX(vc2.started_at) FILTER (
               WHERE LOWER(COALESCE(vc2.status, '')) IN ('missed', 'busy', 'failed', 'no-answer', 'canceled')
             ) as last_attempt_at
           FROM voice_calls vc2
           WHERE vc2.merchant_id = vc.merchant_id
             AND vc2.customer_phone = vc.customer_phone
             AND vc2.started_at >= $2
         ) attempts ON true
         WHERE ${filters.join(" AND ")}
         ORDER BY attempts.missed_attempts DESC NULLS LAST, vc.started_at DESC
         LIMIT $${limitIndex}
         OFFSET $${offsetIndex}`,
        queryParams,
      );

      return {
        total: toNumber(totalResult.rows[0]?.total, queueResult.rows.length),
        rows: queueResult.rows,
      };
    };

    try {
      let queueQueryResult: {
        total: number;
        rows: Array<{
          id: string;
          call_sid: string;
          customer_phone: string;
          started_at: Date;
          ended_at: Date | null;
          duration_seconds: number | null;
          handled_by: string;
          status: string;
          order_id: string | null;
          recording_url: string | null;
          missed_attempts: string;
          last_attempt_at: Date | null;
          workflow_state: string;
          claimed_by: string | null;
          assigned_to: string | null;
          disposition: string | null;
          callback_due_at: Date | null;
          workflow_updated_at: Date | null;
        }>;
      };

      try {
        queueQueryResult = await runQueueQuery(true);
      } catch (workflowError) {
        if (
          !this.isMissingRelationError(workflowError, "call_followup_workflows")
        ) {
          throw workflowError;
        }
        queueQueryResult = await runQueueQuery(false);
      }

      const now = Date.now();
      const queue = queueQueryResult.rows.map((row) => {
        const startedAtMs = new Date(row.started_at).getTime();
        const ageMinutes = Number.isFinite(startedAtMs)
          ? Math.max(0, Math.round((now - startedAtMs) / 60000))
          : 0;
        const missedAttempts = toNumber(row.missed_attempts, 0);
        const workflowState = this.parseWorkflowState(row.workflow_state);
        const disposition = this.parseDisposition(row.disposition);

        return {
          callId: row.id,
          callSid: row.call_sid,
          customerPhone: row.customer_phone,
          startedAt: row.started_at,
          endedAt: row.ended_at,
          durationSeconds: row.duration_seconds,
          handledBy: row.handled_by,
          status: row.status,
          orderId: row.order_id,
          recordingUrl: row.recording_url,
          missedAttempts,
          lastAttemptAt: row.last_attempt_at,
          ageMinutes,
          priority: this.getFollowUpPriority(missedAttempts, ageMinutes),
          requiresRecovery: !row.order_id,
          workflowState,
          claimedBy: row.claimed_by,
          assignedTo: row.assigned_to,
          disposition,
          callbackDueAt: row.callback_due_at,
          workflowUpdatedAt: row.workflow_updated_at,
        };
      });

      return {
        windowHours: hours,
        includeResolved,
        handledBy: handledByFilter,
        total: queueQueryResult.total,
        queue,
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "";
      if (message.includes("voice_calls")) {
        return {
          windowHours: hours,
          includeResolved,
          handledBy: handledByFilter,
          total: 0,
          queue: [],
        };
      }

      throw error;
    }
  }

  @Post("calls/follow-up-queue/:callId/claim")
  @HttpCode(HttpStatus.OK)
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({ summary: "Claim a follow-up queue call for an operator" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        actorId: { type: "string" },
        note: { type: "string" },
      },
      required: ["actorId"],
    },
  })
  async claimFollowUpQueueItem(
    @Req() req: Request,
    @Param("callId") callId: string,
    @Body() body: { actorId?: string; note?: string },
  ) {
    return this.transitionCallFollowUpWorkflow(req, {
      callId,
      action: "CLAIM",
      actorId: body.actorId,
      note: body.note,
    });
  }

  @Post("calls/follow-up-queue/:callId/assign")
  @HttpCode(HttpStatus.OK)
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({ summary: "Assign a follow-up queue call to an operator" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        actorId: { type: "string" },
        assigneeId: { type: "string" },
        note: { type: "string" },
      },
      required: ["actorId", "assigneeId"],
    },
  })
  async assignFollowUpQueueItem(
    @Req() req: Request,
    @Param("callId") callId: string,
    @Body() body: { actorId?: string; assigneeId?: string; note?: string },
  ) {
    return this.transitionCallFollowUpWorkflow(req, {
      callId,
      action: "ASSIGN",
      actorId: body.actorId,
      assigneeId: body.assigneeId,
      note: body.note,
    });
  }

  @Post("calls/follow-up-queue/:callId/resolve")
  @HttpCode(HttpStatus.OK)
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({
    summary: "Resolve a follow-up queue call with disposition and metadata",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        actorId: { type: "string" },
        disposition: {
          type: "string",
          enum: CALL_FOLLOWUP_DISPOSITIONS,
        },
        note: { type: "string" },
        callbackDelayMinutes: { type: "number" },
      },
      required: ["actorId", "disposition"],
    },
  })
  async resolveFollowUpQueueItem(
    @Req() req: Request,
    @Param("callId") callId: string,
    @Body()
    body: {
      actorId?: string;
      disposition?: string;
      note?: string;
      callbackDelayMinutes?: number;
    },
  ) {
    return this.transitionCallFollowUpWorkflow(req, {
      callId,
      action: "RESOLVE",
      actorId: body.actorId,
      disposition: body.disposition,
      note: body.note,
      callbackDelayMinutes: body.callbackDelayMinutes,
    });
  }

  @Post("calls/callback-campaign-bridge/drafts")
  @HttpCode(HttpStatus.OK)
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({
    summary:
      "Create deterministic callback-to-campaign draft from resolved callback requests",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        actorId: { type: "string" },
        dueWithinHours: { type: "number" },
        maxRecipients: { type: "number" },
        inactiveDays: { type: "number" },
        messageTemplate: { type: "string" },
        discountCode: { type: "string" },
      },
      required: ["actorId"],
    },
  })
  async createCallbackCampaignBridgeDraft(
    @Req() req: Request,
    @Body()
    body: {
      actorId?: string;
      dueWithinHours?: number;
      maxRecipients?: number;
      inactiveDays?: number;
      messageTemplate?: string;
      discountCode?: string;
    },
  ) {
    const merchantId = getMerchantId(req);
    const actorId = this.normalizeActorId(body.actorId, "actorId");
    const dueWithinHours = Math.round(
      this.parseBoundedNumber(
        body.dueWithinHours,
        DEFAULT_BRIDGE_DUE_WITHIN_HOURS,
        1,
        168,
      ),
    );
    const maxRecipients = Math.round(
      this.parseBoundedNumber(
        body.maxRecipients,
        DEFAULT_BRIDGE_MAX_RECIPIENTS,
        1,
        500,
      ),
    );
    const inactiveDays = Math.round(
      this.parseBoundedNumber(
        body.inactiveDays,
        DEFAULT_BRIDGE_INACTIVE_DAYS,
        1,
        365,
      ),
    );
    const discountCode = this.normalizeBridgeDiscountCode(body.discountCode);
    const callbackDueBefore = new Date(
      Date.now() + dueWithinHours * 60 * 60 * 1000,
    );
    const messageTemplate = this.normalizeBridgeMessageTemplate(
      body.messageTemplate,
      discountCode,
    );

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `callback-campaign-bridge:${merchantId}`,
      ]);

      const eligibleResult = await client.query<CallbackBridgeRecipientRow>(
        `WITH eligible AS (
           SELECT
             cfw.call_id::text as call_id,
             latest_event.id::text as workflow_event_id,
             vc.customer_phone,
             customer_pick.name as customer_name,
             cfw.callback_due_at,
             ROW_NUMBER() OVER (
               PARTITION BY vc.customer_phone
               ORDER BY COALESCE(cfw.callback_due_at, cfw.updated_at, vc.started_at) ASC, cfw.call_id ASC
             ) as phone_rank
           FROM call_followup_workflows cfw
           JOIN voice_calls vc
             ON vc.id = cfw.call_id
            AND vc.merchant_id = cfw.merchant_id
           LEFT JOIN LATERAL (
             SELECT cwe.id
             FROM call_followup_workflow_events cwe
             WHERE cwe.merchant_id = cfw.merchant_id
               AND cwe.call_id = cfw.call_id
               AND cwe.action = 'RESOLVE'
               AND cwe.to_state = 'RESOLVED'
               AND cwe.disposition = 'CALLBACK_REQUESTED'
             ORDER BY cwe.created_at DESC
             LIMIT 1
           ) latest_event ON TRUE
           LEFT JOIN LATERAL (
             SELECT c.name
             FROM customers c
             WHERE c.merchant_id = cfw.merchant_id
               AND c.phone = vc.customer_phone
             ORDER BY c.created_at DESC
             LIMIT 1
           ) customer_pick ON TRUE
           WHERE cfw.merchant_id = $1
             AND cfw.state = 'RESOLVED'
             AND cfw.disposition = 'CALLBACK_REQUESTED'
             AND (cfw.callback_due_at IS NULL OR cfw.callback_due_at <= $2)
             AND vc.customer_phone IS NOT NULL
             AND btrim(vc.customer_phone) <> ''
             AND NOT EXISTS (
               SELECT 1
               FROM callback_campaign_bridge_items bi
               JOIN callback_campaign_bridges b ON b.id = bi.bridge_id
               WHERE bi.merchant_id = cfw.merchant_id
                 AND bi.call_id = cfw.call_id
                 AND b.status IN ('DRAFT', 'APPROVED', 'EXECUTING', 'EXECUTED')
             )
         )
         SELECT
           call_id,
           workflow_event_id,
           customer_phone,
           customer_name,
           callback_due_at
         FROM eligible
         WHERE phone_rank = 1
         ORDER BY COALESCE(callback_due_at, NOW()) ASC, call_id ASC
         LIMIT $3`,
        [merchantId, callbackDueBefore, maxRecipients],
      );

      if (eligibleResult.rows.length === 0) {
        await client.query("COMMIT");
        return {
          created: false,
          approvalRequired: true,
          reason: "No eligible callback cohort found for draft creation",
          callbackDueBefore,
          totalEligible: 0,
        };
      }

      const bridgeInsertResult = await client.query<{
        id: string;
        status: string;
        created_at: Date;
      }>(
        `INSERT INTO callback_campaign_bridges (
           merchant_id,
           status,
           created_by,
           message_template,
           discount_code,
           inactive_days,
           callback_due_before,
           target_count,
           metadata
         ) VALUES (
           $1,
           'DRAFT',
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8::jsonb
         )
         RETURNING id::text as id, status, created_at`,
        [
          merchantId,
          actorId,
          messageTemplate,
          discountCode,
          inactiveDays,
          callbackDueBefore,
          eligibleResult.rows.length,
          JSON.stringify({
            cohortType: "CALLBACK_REQUESTED",
            deterministicOrder: "callback_due_at asc, call_id asc",
            dedupedBy: "customer_phone",
          }),
        ],
      );

      const bridge = bridgeInsertResult.rows[0];
      for (const row of eligibleResult.rows) {
        await client.query(
          `INSERT INTO callback_campaign_bridge_items (
             bridge_id,
             merchant_id,
             call_id,
             workflow_event_id,
             customer_phone,
             customer_name,
             callback_due_at,
             metadata
           ) VALUES (
             $1::uuid,
             $2,
             $3::uuid,
             $4::uuid,
             $5,
             $6,
             $7,
             $8::jsonb
           )`,
          [
            bridge.id,
            merchantId,
            row.call_id,
            row.workflow_event_id,
            row.customer_phone,
            row.customer_name,
            row.callback_due_at,
            JSON.stringify({
              bridgeSource: "call_followup_workflow_events",
              callbackRequested: true,
            }),
          ],
        );
      }

      await client.query("COMMIT");

      await this.auditService.logFromRequest(
        req,
        "CREATE",
        "CAMPAIGN",
        bridge.id,
        {
          metadata: {
            campaignType: "CALLBACK_REENGAGEMENT_DRAFT",
            targetCount: eligibleResult.rows.length,
            callbackDueBefore,
            linkedWorkflowEventIds: eligibleResult.rows
              .map((row) => row.workflow_event_id)
              .filter((id): id is string => Boolean(id)),
          },
        },
      );

      return {
        created: true,
        approvalRequired: true,
        bridge: {
          id: bridge.id,
          status: this.parseCallbackCampaignBridgeStatus(bridge.status),
          createdAt: bridge.created_at,
          createdBy: actorId,
          messageTemplate,
          discountCode,
          inactiveDays,
          callbackDueBefore,
          targetCount: eligibleResult.rows.length,
        },
        recipients: eligibleResult.rows.map((row) => ({
          callId: row.call_id,
          workflowEventId: row.workflow_event_id,
          customerPhone: row.customer_phone,
          customerName: row.customer_name,
          callbackDueAt: row.callback_due_at,
        })),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (
        this.isMissingRelationError(error, "callback_campaign_bridges") ||
        this.isMissingRelationError(error, "callback_campaign_bridge_items")
      ) {
        throw new BadRequestException(
          "Callback campaign bridge tables are not available. Apply migration 119_callback_campaign_bridge.sql first.",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  @Post("calls/callback-campaign-bridge/drafts/:draftId/approve")
  @HttpCode(HttpStatus.OK)
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({
    summary:
      "Approve callback bridge draft before execution (explicit operator approval)",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        actorId: { type: "string" },
        note: { type: "string" },
      },
      required: ["actorId"],
    },
  })
  async approveCallbackCampaignBridgeDraft(
    @Req() req: Request,
    @Param("draftId") draftId: string,
    @Body() body: { actorId?: string; note?: string },
  ) {
    const merchantId = getMerchantId(req);
    const actorId = this.normalizeActorId(body.actorId, "actorId");
    const note = this.normalizeOptionalNote(body.note);
    const normalizedDraftId = String(draftId || "").trim();
    if (!normalizedDraftId) {
      throw new BadRequestException("draftId is required");
    }

    const approveResult = await this.pool.query<{
      id: string;
      status: string;
      approved_at: Date | null;
      target_count: number;
      message_template: string;
      discount_code: string | null;
      inactive_days: number;
      callback_due_before: Date | null;
    }>(
      `UPDATE callback_campaign_bridges
       SET status = 'APPROVED',
           approved_by = $3,
           approval_note = $4,
           approved_at = NOW(),
           updated_at = NOW()
       WHERE id::text = $1
         AND merchant_id = $2
         AND status = 'DRAFT'
       RETURNING
         id::text as id,
         status,
         approved_at,
         target_count,
         message_template,
         discount_code,
         inactive_days,
         callback_due_before`,
      [normalizedDraftId, merchantId, actorId, note],
    );

    const row = approveResult.rows[0];
    if (!row) {
      const existing = await this.pool.query<{ status: string }>(
        `SELECT status
         FROM callback_campaign_bridges
         WHERE id::text = $1
           AND merchant_id = $2
         LIMIT 1`,
        [normalizedDraftId, merchantId],
      );
      if (!existing.rows[0]) {
        throw new NotFoundException("Callback campaign draft not found");
      }
      const currentStatus = this.parseCallbackCampaignBridgeStatus(
        existing.rows[0].status,
      );
      throw new ConflictException(
        `Callback campaign draft cannot be approved from state ${currentStatus}`,
      );
    }

    await this.auditService.logFromRequest(req, "UPDATE", "CAMPAIGN", row.id, {
      metadata: {
        campaignType: "CALLBACK_REENGAGEMENT_DRAFT",
        approvalActorId: actorId,
        targetCount: row.target_count,
        approvalNote: note,
      },
    });

    return {
      approved: true,
      bridge: {
        id: row.id,
        status: this.parseCallbackCampaignBridgeStatus(row.status),
        approvedAt: row.approved_at,
        approvedBy: actorId,
        messageTemplate: row.message_template,
        discountCode: row.discount_code,
        inactiveDays: row.inactive_days,
        callbackDueBefore: row.callback_due_before,
        targetCount: row.target_count,
      },
    };
  }

  @Post("calls/callback-campaign-bridge/drafts/:draftId/execute")
  @HttpCode(HttpStatus.OK)
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({
    summary:
      "Execute approved callback campaign draft and write execution ledger",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        actorId: { type: "string" },
      },
      required: ["actorId"],
    },
  })
  async executeCallbackCampaignBridgeDraft(
    @Req() req: Request,
    @Param("draftId") draftId: string,
    @Body() body: { actorId?: string },
  ) {
    const merchantId = getMerchantId(req);
    const actorId = this.normalizeActorId(body.actorId, "actorId");
    const normalizedDraftId = String(draftId || "").trim();
    if (!normalizedDraftId) {
      throw new BadRequestException("draftId is required");
    }

    const deliveryStatus = this.notificationsService.getDeliveryConfigStatus();
    if (!deliveryStatus.whatsapp?.configured) {
      throw new BadRequestException(
        "WhatsApp delivery is not configured for campaign execution",
      );
    }

    const startExecutionResult = await this.pool.query<{
      id: string;
      status: string;
      message_template: string;
      discount_code: string | null;
      inactive_days: number;
      target_count: number;
    }>(
      `UPDATE callback_campaign_bridges
       SET status = 'EXECUTING',
           executed_by = $3,
           updated_at = NOW()
       WHERE id::text = $1
         AND merchant_id = $2
         AND status = 'APPROVED'
       RETURNING
         id::text as id,
         status,
         message_template,
         discount_code,
         inactive_days,
         target_count`,
      [normalizedDraftId, merchantId, actorId],
    );

    const bridgeRow = startExecutionResult.rows[0];
    if (!bridgeRow) {
      const existing = await this.pool.query<{ status: string }>(
        `SELECT status
         FROM callback_campaign_bridges
         WHERE id::text = $1
           AND merchant_id = $2
         LIMIT 1`,
        [normalizedDraftId, merchantId],
      );
      if (!existing.rows[0]) {
        throw new NotFoundException("Callback campaign draft not found");
      }
      const currentStatus = this.parseCallbackCampaignBridgeStatus(
        existing.rows[0].status,
      );
      throw new ConflictException(
        `Callback campaign draft must be approved before execution. Current state: ${currentStatus}`,
      );
    }

    const merchantConfigResult = await this.pool.query<{
      whatsapp_number: string | null;
    }>(
      `SELECT whatsapp_number
       FROM merchants
       WHERE id = $1
       LIMIT 1`,
      [merchantId],
    );
    const merchantWhatsAppNumber =
      merchantConfigResult.rows[0]?.whatsapp_number || undefined;

    const recipientsResult = await this.pool.query<{
      id: string;
      call_id: string;
      workflow_event_id: string | null;
      customer_phone: string;
      customer_name: string | null;
      callback_due_at: Date | null;
    }>(
      `SELECT
         id::text as id,
         call_id::text as call_id,
         workflow_event_id::text as workflow_event_id,
         customer_phone,
         customer_name,
         callback_due_at
       FROM callback_campaign_bridge_items
       WHERE bridge_id::text = $1
         AND merchant_id = $2
       ORDER BY callback_due_at ASC NULLS LAST, created_at ASC`,
      [normalizedDraftId, merchantId],
    );

    let sentCount = 0;
    let failedCount = 0;
    const sampleErrors: Array<{ phone: string; error: string }> = [];

    for (const recipient of recipientsResult.rows) {
      const renderedMessage = this.renderCallbackBridgeMessage(
        bridgeRow.message_template,
        {
          customerName: recipient.customer_name,
          discountCode: bridgeRow.discount_code,
          inactiveDays: bridgeRow.inactive_days,
          callbackDueAt: recipient.callback_due_at,
        },
      );

      try {
        await this.notificationsService.sendBroadcastWhatsApp(
          recipient.customer_phone,
          renderedMessage,
          merchantWhatsAppNumber,
        );

        sentCount += 1;
        await this.pool.query(
          `UPDATE callback_campaign_bridge_items
           SET sent = true,
               sent_at = NOW(),
               send_error = NULL
           WHERE id::text = $1
             AND merchant_id = $2`,
          [recipient.id, merchantId],
        );
      } catch (error: unknown) {
        failedCount += 1;
        const errorMessage = (error as Error)?.message || "Send failed";
        await this.pool.query(
          `UPDATE callback_campaign_bridge_items
           SET sent = false,
               send_error = $3
           WHERE id::text = $1
             AND merchant_id = $2`,
          [recipient.id, merchantId, errorMessage.slice(0, 500)],
        );
        if (sampleErrors.length < 5) {
          sampleErrors.push({
            phone: recipient.customer_phone,
            error: errorMessage,
          });
        }
      }
    }

    const finalizeResult = await this.pool.query<{
      id: string;
      status: string;
      executed_at: Date | null;
      target_count: number;
      sent_count: number;
      failed_count: number;
    }>(
      `UPDATE callback_campaign_bridges
       SET status = 'EXECUTED',
           executed_at = NOW(),
           sent_count = $3,
           failed_count = $4,
           metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
           updated_at = NOW()
       WHERE id::text = $1
         AND merchant_id = $2
       RETURNING
         id::text as id,
         status,
         executed_at,
         target_count,
         sent_count,
         failed_count`,
      [
        normalizedDraftId,
        merchantId,
        sentCount,
        failedCount,
        JSON.stringify({
          executedBy: actorId,
          executedAt: new Date().toISOString(),
          sampleErrors,
        }),
      ],
    );

    const finalized = finalizeResult.rows[0];
    if (!finalized) {
      throw new NotFoundException("Callback campaign draft not found");
    }

    await this.auditService.logFromRequest(
      req,
      "CREATE",
      "CAMPAIGN",
      finalized.id,
      {
        metadata: {
          campaignType: "CALLBACK_REENGAGEMENT_EXECUTION",
          targetCount: finalized.target_count,
          sentCount: finalized.sent_count,
          failedCount: finalized.failed_count,
          sampleErrors,
        },
      },
    );

    return {
      executed: true,
      bridge: {
        id: finalized.id,
        status: this.parseCallbackCampaignBridgeStatus(finalized.status),
        executedAt: finalized.executed_at,
        targetCount: finalized.target_count,
        sentCount: finalized.sent_count,
        failedCount: finalized.failed_count,
      },
      sampleErrors,
    };
  }

  @Get("calls/agent-performance")
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({ summary: "Voice call performance breakdown by handler" })
  async getAgentPerformance(
    @Req() req: Request,
    @Query("days") daysRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("handledBy") handledByRaw?: string,
  ) {
    const merchantId = getMerchantId(req);
    const days = this.parseBoundedInt(daysRaw, 7, 1, 90);
    const limit = this.parseBoundedInt(limitRaw, 10, 1, 50);
    const handledByFilter = this.parseHandledByFilter(handledByRaw);

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (days - 1));

    const filters: string[] = ["merchant_id = $1", "started_at >= $2"];
    const baseParams: unknown[] = [merchantId, startDate];

    if (handledByFilter !== "all") {
      baseParams.push(handledByFilter);
      filters.push(`LOWER(COALESCE(handled_by, 'ai')) = $${baseParams.length}`);
    }

    try {
      const summaryResult = await this.pool.query<{
        total_calls: string;
        completed_calls: string;
        missed_calls: string;
        orders_from_calls: string;
      }>(
        `SELECT
           COUNT(*)::text as total_calls,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'completed')::text as completed_calls,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'missed')::text as missed_calls,
           COUNT(*) FILTER (WHERE order_id IS NOT NULL)::text as orders_from_calls
         FROM voice_calls
         WHERE ${filters.join(" AND ")}`,
        baseParams,
      );

      const queryParams = [...baseParams];
      queryParams.push(limit);
      const limitIndex = queryParams.length;

      const byHandlerResult = await this.pool.query<{
        handled_by: string;
        total_calls: string;
        completed_calls: string;
        missed_calls: string;
        active_calls: string;
        orders_from_calls: string;
        avg_duration_seconds: string;
      }>(
        `SELECT
           LOWER(COALESCE(handled_by, 'ai')) as handled_by,
           COUNT(*)::text as total_calls,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'completed')::text as completed_calls,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'missed')::text as missed_calls,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) IN ('active', 'ringing', 'in-progress'))::text as active_calls,
           COUNT(*) FILTER (WHERE order_id IS NOT NULL)::text as orders_from_calls,
           COALESCE(
             ROUND(AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL AND duration_seconds >= 0)),
             0
           )::text as avg_duration_seconds
         FROM voice_calls
         WHERE ${filters.join(" AND ")}
         GROUP BY LOWER(COALESCE(handled_by, 'ai'))
         ORDER BY COUNT(*) DESC, LOWER(COALESCE(handled_by, 'ai')) ASC
         LIMIT $${limitIndex}`,
        queryParams,
      );

      const summaryRow = summaryResult.rows[0];
      const totalCalls = toNumber(summaryRow?.total_calls, 0);
      const completedCalls = toNumber(summaryRow?.completed_calls, 0);
      const missedCalls = toNumber(summaryRow?.missed_calls, 0);
      const ordersFromCalls = toNumber(summaryRow?.orders_from_calls, 0);

      return {
        periodDays: days,
        handledBy: handledByFilter,
        totalCalls,
        completedCalls,
        missedCalls,
        ordersFromCalls,
        completionRatePct: this.calculateRate(completedCalls, totalCalls),
        missedRatePct: this.calculateRate(missedCalls, totalCalls),
        conversionRatePct: this.calculateRate(ordersFromCalls, totalCalls),
        agents: byHandlerResult.rows.map((row) => {
          const agentTotal = toNumber(row.total_calls, 0);
          const agentCompleted = toNumber(row.completed_calls, 0);
          const agentMissed = toNumber(row.missed_calls, 0);
          const agentOrders = toNumber(row.orders_from_calls, 0);

          return {
            handledBy: row.handled_by,
            totalCalls: agentTotal,
            completedCalls: agentCompleted,
            missedCalls: agentMissed,
            activeCalls: toNumber(row.active_calls, 0),
            ordersFromCalls: agentOrders,
            avgDurationSeconds: Math.round(
              toNumber(row.avg_duration_seconds, 0),
            ),
            completionRatePct: this.calculateRate(agentCompleted, agentTotal),
            missedRatePct: this.calculateRate(agentMissed, agentTotal),
            conversionRatePct: this.calculateRate(agentOrders, agentTotal),
          };
        }),
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "";
      if (message.includes("voice_calls")) {
        return {
          periodDays: days,
          handledBy: handledByFilter,
          totalCalls: 0,
          completedCalls: 0,
          missedCalls: 0,
          ordersFromCalls: 0,
          completionRatePct: 0,
          missedRatePct: 0,
          conversionRatePct: 0,
          agents: [],
        };
      }

      throw error;
    }
  }

  @Get("calls/queue-health")
  @RequiresFeature("CONVERSATIONS")
  @ApiOperation({
    summary: "Voice queue health snapshot for contact-center ops",
  })
  async getQueueHealth(
    @Req() req: Request,
    @Query("windowMinutes") windowMinutesRaw?: string,
    @Query("activeGraceMinutes") activeGraceMinutesRaw?: string,
  ) {
    const merchantId = getMerchantId(req);
    const windowMinutes = this.parseBoundedInt(windowMinutesRaw, 60, 15, 720);
    const activeGraceMinutes = this.parseBoundedInt(
      activeGraceMinutesRaw,
      15,
      5,
      120,
    );

    const now = Date.now();
    const windowStart = new Date(now - windowMinutes * 60 * 1000);
    const previousWindowStart = new Date(now - windowMinutes * 2 * 60 * 1000);
    const activeCutoff = new Date(now - activeGraceMinutes * 60 * 1000);

    try {
      const result = await this.pool.query<{
        calls_window: string;
        calls_previous_window: string;
        completed_window: string;
        missed_window: string;
        ai_window: string;
        staff_window: string;
        avg_duration_window: string;
        active_live: string;
        oldest_live_seconds: string;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE started_at >= $2)::text as calls_window,
           COUNT(*) FILTER (WHERE started_at >= $3 AND started_at < $2)::text as calls_previous_window,
           COUNT(*) FILTER (WHERE started_at >= $2 AND LOWER(COALESCE(status, '')) = 'completed')::text as completed_window,
           COUNT(*) FILTER (WHERE started_at >= $2 AND LOWER(COALESCE(status, '')) = 'missed')::text as missed_window,
           COUNT(*) FILTER (WHERE started_at >= $2 AND LOWER(COALESCE(handled_by, 'ai')) = 'ai')::text as ai_window,
           COUNT(*) FILTER (WHERE started_at >= $2 AND LOWER(COALESCE(handled_by, '')) = 'staff')::text as staff_window,
           COALESCE(
             ROUND(AVG(duration_seconds) FILTER (WHERE started_at >= $2 AND duration_seconds IS NOT NULL AND duration_seconds >= 0)),
             0
           )::text as avg_duration_window,
           COUNT(*) FILTER (
             WHERE LOWER(COALESCE(status, '')) IN ('active', 'ringing', 'in-progress')
               AND (ended_at IS NULL OR ended_at >= $4)
           )::text as active_live,
           COALESCE(
             ROUND(
               MAX(EXTRACT(EPOCH FROM (NOW() - started_at))) FILTER (
                 WHERE LOWER(COALESCE(status, '')) IN ('active', 'ringing', 'in-progress')
                   AND ended_at IS NULL
               )
             ),
             0
           )::text as oldest_live_seconds
         FROM voice_calls
         WHERE merchant_id = $1`,
        [merchantId, windowStart, previousWindowStart, activeCutoff],
      );

      const row = result.rows[0];
      const callsInWindow = toNumber(row?.calls_window, 0);
      const callsInPreviousWindow = toNumber(row?.calls_previous_window, 0);
      const completedInWindow = toNumber(row?.completed_window, 0);
      const missedInWindow = toNumber(row?.missed_window, 0);
      const activeLive = toNumber(row?.active_live, 0);
      const aiInWindow = toNumber(row?.ai_window, 0);
      const staffInWindow = toNumber(row?.staff_window, 0);

      const callVolumeTrendPct =
        callsInPreviousWindow > 0
          ? Number(
              (
                ((callsInWindow - callsInPreviousWindow) /
                  callsInPreviousWindow) *
                100
              ).toFixed(2),
            )
          : callsInWindow > 0
            ? 100
            : 0;

      const serviceLevelPct = this.calculateRate(
        callsInWindow - missedInWindow,
        callsInWindow,
      );
      const missedRatePct = this.calculateRate(missedInWindow, callsInWindow);

      const activePressure = Math.min(activeLive * 12, 100);
      const trendPressure = Math.min(Math.max(callVolumeTrendPct, 0), 100);
      const pressureScore = Math.round(
        Math.min(
          100,
          activePressure * 0.4 + missedRatePct * 0.4 + trendPressure * 0.2,
        ),
      );

      return {
        windowMinutes,
        activeGraceMinutes,
        callsInWindow,
        callsInPreviousWindow,
        callVolumeTrendPct,
        completedInWindow,
        missedInWindow,
        activeLive,
        oldestLiveSeconds: toNumber(row?.oldest_live_seconds, 0),
        avgDurationSeconds: Math.round(toNumber(row?.avg_duration_window, 0)),
        aiHandledInWindow: aiInWindow,
        staffHandledInWindow: staffInWindow,
        staffCoveragePct: this.calculateRate(staffInWindow, callsInWindow),
        serviceLevelPct,
        missedRatePct,
        pressureScore,
        healthState:
          pressureScore >= 70
            ? "critical"
            : pressureScore >= 40
              ? "elevated"
              : "stable",
      };
    } catch (error: unknown) {
      const message = (error as Error).message || "";
      if (message.includes("voice_calls")) {
        return {
          windowMinutes,
          activeGraceMinutes,
          callsInWindow: 0,
          callsInPreviousWindow: 0,
          callVolumeTrendPct: 0,
          completedInWindow: 0,
          missedInWindow: 0,
          activeLive: 0,
          oldestLiveSeconds: 0,
          avgDurationSeconds: 0,
          aiHandledInWindow: 0,
          staffHandledInWindow: 0,
          staffCoveragePct: 0,
          serviceLevelPct: 0,
          missedRatePct: 0,
          pressureScore: 0,
          healthState: "stable",
        };
      }

      throw error;
    }
  }

  private async transitionCallFollowUpWorkflow(
    req: Request,
    input: {
      callId: string;
      action: "CLAIM" | "ASSIGN" | "RESOLVE";
      actorId?: string;
      assigneeId?: string;
      disposition?: string;
      note?: string;
      callbackDelayMinutes?: number;
    },
  ) {
    const merchantId = getMerchantId(req);
    const callId = String(input.callId || "").trim();
    const actorId = this.normalizeActorId(input.actorId, "actorId");
    const note = this.normalizeOptionalNote(input.note);

    if (!callId) {
      throw new BadRequestException("callId is required");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `call-followup:${merchantId}:${callId}`,
      ]);

      const snapshot = await this.getCallFollowUpSnapshot(
        client,
        merchantId,
        callId,
      );

      if (!this.isFollowUpCandidate(snapshot)) {
        throw new BadRequestException(
          "Call is not eligible for follow-up workflow transitions",
        );
      }

      const fromState = snapshot.workflowState;
      let toState: CallFollowUpWorkflowState = fromState;
      let claimedBy = snapshot.claimedBy;
      let assignedTo = snapshot.assignedTo;
      let disposition = snapshot.disposition;
      let callbackDueAt = snapshot.callbackDueAt;

      if (input.action === "CLAIM") {
        if (fromState === "RESOLVED") {
          throw new ConflictException(
            "Resolved follow-up cannot be claimed again",
          );
        }

        if (
          fromState === "CLAIMED" &&
          snapshot.claimedBy &&
          snapshot.claimedBy !== actorId
        ) {
          throw new ConflictException(
            "Follow-up is already claimed by another operator",
          );
        }

        if (
          fromState === "ASSIGNED" &&
          snapshot.assignedTo &&
          snapshot.assignedTo !== actorId
        ) {
          throw new ConflictException(
            "Assigned follow-up can only be claimed by the assigned operator",
          );
        }

        toState = fromState === "ASSIGNED" ? "ASSIGNED" : "CLAIMED";
        claimedBy = actorId;
      }

      if (input.action === "ASSIGN") {
        if (fromState === "RESOLVED") {
          throw new ConflictException("Resolved follow-up cannot be assigned");
        }

        const assigneeId = this.normalizeActorId(
          input.assigneeId,
          "assigneeId",
        );
        toState = "ASSIGNED";
        claimedBy = snapshot.claimedBy || actorId;
        assignedTo = assigneeId;
      }

      if (input.action === "RESOLVE") {
        if (fromState === "RESOLVED") {
          throw new ConflictException("Follow-up is already resolved");
        }

        const normalizedDisposition = this.normalizeDisposition(
          input.disposition,
        );
        disposition = normalizedDisposition;
        toState = "RESOLVED";
        claimedBy = snapshot.claimedBy || actorId;

        if (normalizedDisposition === "CALLBACK_REQUESTED") {
          const callbackDelayMinutes = this.parseBoundedNumber(
            input.callbackDelayMinutes,
            DEFAULT_CALLBACK_DELAY_MINUTES,
            15,
            7 * 24 * 60,
          );
          callbackDueAt = new Date(
            Date.now() + callbackDelayMinutes * 60 * 1000,
          );
        } else {
          callbackDueAt = null;
        }
      }

      const now = new Date();
      const workflowMetadata = {
        ...snapshot.workflowMetadata,
        lastAction: input.action,
        lastActorId: actorId,
        lastNote: note,
        lastActionAt: now.toISOString(),
      };

      const upsertResult = await client.query<{
        state: string;
        claimed_by: string | null;
        assigned_to: string | null;
        disposition: string | null;
        callback_due_at: Date | null;
        resolved_at: Date | null;
        updated_at: Date;
      }>(
        `INSERT INTO call_followup_workflows (
           call_id,
           merchant_id,
           state,
           claimed_by,
           assigned_to,
           disposition,
           resolution_note,
           callback_due_at,
           claimed_at,
           assigned_at,
           resolved_at,
           metadata
         ) VALUES (
           $1::uuid,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12::jsonb
         )
         ON CONFLICT (call_id)
         DO UPDATE SET
           state = EXCLUDED.state,
           claimed_by = EXCLUDED.claimed_by,
           assigned_to = EXCLUDED.assigned_to,
           disposition = EXCLUDED.disposition,
           resolution_note = EXCLUDED.resolution_note,
           callback_due_at = EXCLUDED.callback_due_at,
           claimed_at = COALESCE(call_followup_workflows.claimed_at, EXCLUDED.claimed_at),
           assigned_at = CASE
             WHEN EXCLUDED.assigned_to IS DISTINCT FROM call_followup_workflows.assigned_to
               THEN COALESCE(EXCLUDED.assigned_at, NOW())
             ELSE call_followup_workflows.assigned_at
           END,
           resolved_at = CASE
             WHEN EXCLUDED.state = 'RESOLVED'
               THEN COALESCE(call_followup_workflows.resolved_at, EXCLUDED.resolved_at, NOW())
             ELSE call_followup_workflows.resolved_at
           END,
           metadata = COALESCE(call_followup_workflows.metadata, '{}'::jsonb) || EXCLUDED.metadata,
           updated_at = NOW()
         RETURNING
           state,
           claimed_by,
           assigned_to,
           disposition,
           callback_due_at,
           resolved_at,
           updated_at`,
        [
          snapshot.callId,
          merchantId,
          toState,
          claimedBy,
          assignedTo,
          disposition,
          note,
          callbackDueAt,
          claimedBy ? now : null,
          assignedTo ? now : null,
          toState === "RESOLVED" ? now : null,
          JSON.stringify(workflowMetadata),
        ],
      );

      const workflow = upsertResult.rows[0];

      await client.query(
        `INSERT INTO call_followup_workflow_events (
           merchant_id,
           call_id,
           action,
           from_state,
           to_state,
           actor_id,
           claimed_by,
           assigned_to,
           disposition,
           note,
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
           $9,
           $10,
           $11::jsonb
         )`,
        [
          merchantId,
          snapshot.callId,
          input.action,
          fromState,
          this.parseWorkflowState(workflow.state),
          actorId,
          workflow.claimed_by,
          workflow.assigned_to,
          workflow.disposition,
          note,
          JSON.stringify({
            callStatus: snapshot.callStatus,
            customerPhone: snapshot.customerPhone,
            orderId: snapshot.orderId,
            callbackDueAt: workflow.callback_due_at
              ? new Date(workflow.callback_due_at).toISOString()
              : null,
          }),
        ],
      );

      await client.query("COMMIT");

      return {
        callId: snapshot.callId,
        workflowState: this.parseWorkflowState(workflow.state),
        claimedBy: workflow.claimed_by,
        assignedTo: workflow.assigned_to,
        disposition: this.parseDisposition(workflow.disposition),
        callbackDueAt: workflow.callback_due_at,
        resolvedAt: workflow.resolved_at,
        updatedAt: workflow.updated_at,
        action: input.action,
        actorId,
        note,
        campaignCallbackCandidate:
          this.parseDisposition(workflow.disposition) === "CALLBACK_REQUESTED",
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (this.isMissingRelationError(error, "call_followup_workflows")) {
        throw new BadRequestException(
          "Call follow-up workflow tables are not available. Apply migration 118_call_followup_workflow.sql first.",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async getCallFollowUpSnapshot(
    client: {
      query: <T = any>(
        queryText: string,
        params?: unknown[],
      ) => Promise<{ rows: T[] }>;
    },
    merchantId: string,
    callId: string,
  ): Promise<CallFollowUpWorkflowSnapshot> {
    const result = await client.query<{
      call_id: string;
      call_status: string;
      customer_phone: string;
      order_id: string | null;
      workflow_state: string | null;
      claimed_by: string | null;
      assigned_to: string | null;
      disposition: string | null;
      callback_due_at: Date | null;
      workflow_metadata: unknown;
      workflow_updated_at: Date | null;
    }>(
      `SELECT
         vc.id::text as call_id,
         COALESCE(vc.status, 'unknown') as call_status,
         vc.customer_phone,
         vc.order_id::text as order_id,
         COALESCE(cfw.state, 'OPEN') as workflow_state,
         cfw.claimed_by,
         cfw.assigned_to,
         cfw.disposition,
         cfw.callback_due_at,
         COALESCE(cfw.metadata, '{}'::jsonb) as workflow_metadata,
         cfw.updated_at as workflow_updated_at
       FROM voice_calls vc
       LEFT JOIN call_followup_workflows cfw
         ON cfw.call_id = vc.id AND cfw.merchant_id = vc.merchant_id
       WHERE vc.merchant_id = $1
         AND vc.id::text = $2
       LIMIT 1`,
      [merchantId, callId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("Call not found for this merchant");
    }

    return {
      callId: row.call_id,
      callStatus: row.call_status,
      customerPhone: row.customer_phone,
      orderId: row.order_id,
      workflowState: this.parseWorkflowState(row.workflow_state),
      claimedBy: row.claimed_by,
      assignedTo: row.assigned_to,
      disposition: this.parseDisposition(row.disposition),
      callbackDueAt: row.callback_due_at,
      workflowMetadata: this.parseMetadataObject(row.workflow_metadata),
      workflowUpdatedAt: row.workflow_updated_at,
    };
  }

  private isFollowUpCandidate(snapshot: CallFollowUpWorkflowSnapshot): boolean {
    const normalizedStatus = String(snapshot.callStatus || "")
      .trim()
      .toLowerCase();

    if (!snapshot.orderId) {
      return true;
    }

    if (
      snapshot.workflowState !== "OPEN" ||
      snapshot.disposition ||
      snapshot.claimedBy ||
      snapshot.assignedTo
    ) {
      return true;
    }

    return MISSED_CALL_STATUSES.includes(
      normalizedStatus as (typeof MISSED_CALL_STATUSES)[number],
    );
  }

  private normalizeDisposition(
    raw: string | undefined,
  ): CallFollowUpDisposition {
    const normalized = String(raw || "")
      .trim()
      .toUpperCase();
    if (
      CALL_FOLLOWUP_DISPOSITIONS.includes(normalized as CallFollowUpDisposition)
    ) {
      return normalized as CallFollowUpDisposition;
    }
    throw new BadRequestException(
      `disposition must be one of: ${CALL_FOLLOWUP_DISPOSITIONS.join(", ")}`,
    );
  }

  private normalizeActorId(raw: string | undefined, fieldName: string): string {
    const normalized = String(raw || "").trim();
    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }
    if (normalized.length > 120) {
      throw new BadRequestException(`${fieldName} length must be <= 120`);
    }
    return normalized;
  }

  private normalizeOptionalNote(raw: string | undefined): string | null {
    const normalized = String(raw || "").trim();
    if (!normalized) {
      return null;
    }
    return normalized.slice(0, 1000);
  }

  private normalizeBridgeDiscountCode(raw: string | undefined): string | null {
    const normalized = String(raw || "")
      .trim()
      .toUpperCase();
    if (!normalized) {
      return null;
    }
    return normalized.slice(0, 80);
  }

  private normalizeBridgeMessageTemplate(
    raw: string | undefined,
    discountCode: string | null,
  ): string {
    const normalized = String(raw || "").trim();
    if (normalized) {
      return normalized.slice(0, 1500);
    }

    const codeText = discountCode
      ? `استخدم كود ${discountCode} عند الطلب.`
      : "يسعدنا مساعدتك في إتمام الطلب مباشرة.";

    return `مرحبًا {name}، بناءً على طلب معاودة الاتصال السابق يسعدنا خدمتك الآن. ${codeText}`;
  }

  private parseCallbackCampaignBridgeStatus(
    raw: string | null | undefined,
  ): CallbackCampaignBridgeStatus {
    const normalized = String(raw || "DRAFT")
      .trim()
      .toUpperCase();
    if (
      CALLBACK_CAMPAIGN_BRIDGE_STATUSES.includes(
        normalized as CallbackCampaignBridgeStatus,
      )
    ) {
      return normalized as CallbackCampaignBridgeStatus;
    }
    return "DRAFT";
  }

  private renderCallbackBridgeMessage(
    template: string,
    payload: {
      customerName: string | null;
      discountCode: string | null;
      inactiveDays: number;
      callbackDueAt: Date | null;
    },
  ): string {
    const safeTemplate = String(template || "").trim();
    const fallbackMessage = this.normalizeBridgeMessageTemplate(
      undefined,
      payload.discountCode,
    );
    const base = safeTemplate || fallbackMessage;

    const dueAtText = payload.callbackDueAt
      ? payload.callbackDueAt.toISOString().slice(0, 16).replace("T", " ")
      : "الآن";

    return base
      .replace(/\{name\}/gi, String(payload.customerName || "عميلنا العزيز"))
      .replace(/\{code\}/gi, String(payload.discountCode || ""))
      .replace(/\{days\}/gi, String(payload.inactiveDays))
      .replace(/\{callbackDueAt\}/gi, dueAtText)
      .trim();
  }

  private parseWorkflowState(
    raw: string | null | undefined,
  ): CallFollowUpWorkflowState {
    const normalized = String(raw || "OPEN")
      .trim()
      .toUpperCase();
    if (
      CALL_FOLLOWUP_WORKFLOW_STATES.includes(
        normalized as CallFollowUpWorkflowState,
      )
    ) {
      return normalized as CallFollowUpWorkflowState;
    }
    return "OPEN";
  }

  private parseDisposition(
    raw: string | null | undefined,
  ): CallFollowUpDisposition | null {
    const normalized = String(raw || "")
      .trim()
      .toUpperCase();
    if (!normalized) {
      return null;
    }
    if (
      CALL_FOLLOWUP_DISPOSITIONS.includes(normalized as CallFollowUpDisposition)
    ) {
      return normalized as CallFollowUpDisposition;
    }
    return null;
  }

  private parseMetadataObject(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return {};
      }
    }
    return {};
  }

  private isMissingRelationError(
    error: unknown,
    relationName: string,
  ): boolean {
    const message = (error as Error)?.message || "";
    const normalizedRelation = String(relationName || "").toLowerCase();
    if (!normalizedRelation) return false;

    return (
      message.toLowerCase().includes(`relation "${normalizedRelation}"`) ||
      message.toLowerCase().includes(`relation '${normalizedRelation}'`) ||
      message.toLowerCase().includes(normalizedRelation)
    );
  }

  private parseBoundedNumber(
    raw: number | string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
  }

  private parseBoundedInt(
    raw: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number.parseInt(String(raw ?? ""), 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
  }

  private parseBooleanQuery(
    raw: string | undefined,
    fallback: boolean,
  ): boolean {
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      return fallback;
    }

    const normalized = String(raw).trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n", "off"].includes(normalized)) {
      return false;
    }

    throw new BadRequestException(
      "Invalid boolean query. Use true/false for includeResolved.",
    );
  }

  private parseHandledByFilter(
    raw: string | undefined,
  ): "all" | "ai" | "staff" {
    const normalized = String(raw || "all")
      .trim()
      .toLowerCase();
    if (["", "all"].includes(normalized)) {
      return "all";
    }
    if (normalized === "ai" || normalized === "staff") {
      return normalized;
    }
    throw new BadRequestException("handledBy must be one of: all, ai, staff");
  }

  private calculateRate(numerator: number, denominator: number): number {
    if (!Number.isFinite(denominator) || denominator <= 0) {
      return 0;
    }
    return Number(((numerator / denominator) * 100).toFixed(2));
  }

  private getFollowUpPriority(
    missedAttempts: number,
    ageMinutes: number,
  ): "high" | "medium" | "low" {
    if (missedAttempts >= 3 || ageMinutes >= 180) {
      return "high";
    }
    if (missedAttempts >= 2 || ageMinutes >= 60) {
      return "medium";
    }
    return "low";
  }

  private parseTranscript(raw: unknown): VoiceTranscriptItem[] {
    if (Array.isArray(raw)) {
      const parsed: VoiceTranscriptItem[] = [];

      for (const entry of raw) {
        const row = entry as Record<string, unknown>;
        const speaker = String(row.speaker || "").trim();
        const text = String(row.text || "").trim();
        const at = String(row.at || "").trim();

        if (!text) continue;

        parsed.push({
          speaker: speaker || "unknown",
          text,
          at: at || undefined,
        });
      }

      return parsed;
    }

    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return this.parseTranscript(parsed);
      } catch {
        return [];
      }
    }

    return [];
  }
}
