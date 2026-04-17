import {
  Controller,
  Get,
  Inject,
  Logger,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
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

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

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
