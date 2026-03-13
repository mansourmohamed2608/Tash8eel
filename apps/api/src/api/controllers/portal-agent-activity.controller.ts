import {
  Controller,
  Get,
  Post,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { EntitlementGuard } from "../../shared/guards/entitlement.guard";
import { RolesGuard } from "../../shared/guards/roles.guard";
import { getMerchantId, toNumber, expandAgentFilter } from "./portal-compat.helpers";

@ApiTags("Merchant Portal Compatibility")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalAgentActivityController {
  private readonly logger = new Logger(PortalAgentActivityController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get("agent-activity")
  @ApiOperation({ summary: "List agent actions for merchant activity feed" })
  async getAgentActivity(
    @Req() req: Request,
    @Query("agent") agent?: string,
    @Query("severity") severity?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const merchantId = getMerchantId(req);
    const limit = Math.min(
      Math.max(Number.parseInt(String(limitRaw || "100"), 10) || 100, 1),
      200,
    );

    const filters: string[] = ["merchant_id = $1"];
    const params: any[] = [merchantId];

    const agentValues = expandAgentFilter(agent);
    if (agentValues.length > 0) {
      params.push(agentValues);
      filters.push(`agent_type = ANY($${params.length})`);
    }

    if (severity && severity !== "ALL") {
      params.push(String(severity).toUpperCase());
      filters.push(`severity = $${params.length}`);
    }

    params.push(limit);

    const actionsResult = await this.pool.query(
      `SELECT
         id::text as id,
         agent_type,
         action_type,
         severity,
         title,
         description,
         COALESCE(metadata, '{}'::jsonb) as metadata,
         COALESCE(auto_resolved, false) as auto_resolved,
         COALESCE(merchant_ack, false) as merchant_ack,
         created_at
       FROM agent_actions
       WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    const summaryResult = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int as last_24h,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND auto_resolved = true)::int as auto_resolved_24h,
         COUNT(*) FILTER (WHERE merchant_ack = false AND severity = 'CRITICAL')::int as unack_critical,
         COUNT(*) FILTER (WHERE merchant_ack = false AND severity = 'WARNING')::int as unack_warning,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND severity IN ('ACTION', 'CRITICAL'))::int as actions_taken_24h
       FROM agent_actions
       WHERE merchant_id = $1`,
      [merchantId],
    );

    return {
      actions: actionsResult.rows,
      summary: summaryResult.rows[0] || {
        last_24h: 0,
        auto_resolved_24h: 0,
        unack_critical: 0,
        unack_warning: 0,
        actions_taken_24h: 0,
      },
    };
  }

  @Post("agent-activity/:actionId/acknowledge")
  @ApiOperation({ summary: "Acknowledge agent action" })
  async acknowledgeAgentAction(
    @Req() req: Request,
    @Param("actionId") actionId: string,
  ) {
    const merchantId = getMerchantId(req);
    const result = await this.pool.query(
      `UPDATE agent_actions
       SET merchant_ack = true
       WHERE merchant_id = $1 AND id::text = $2
       RETURNING id::text as id`,
      [merchantId, actionId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException("العنصر غير موجود");
    }

    return { success: true, id: result.rows[0].id };
  }
}
