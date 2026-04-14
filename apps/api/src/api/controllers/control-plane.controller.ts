import {
  Body,
  Controller,
  Get,
  ParseEnumPipe,
  ParseUUIDPipe,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Request } from "express";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { RequireRole, RolesGuard } from "../../shared/guards/roles.guard";
import { getMerchantId } from "./portal-compat.helpers";
import { ControlPlaneGovernanceService } from "../../application/llm/control-plane-governance.service";
import {
  CopilotIntent,
  CopilotIntentEnum,
} from "../../application/llm/copilot-schema";

enum ControlTriggerTypeDto {
  EVENT = "EVENT",
  SCHEDULED = "SCHEDULED",
  ON_DEMAND = "ON_DEMAND",
  ESCALATION = "ESCALATION",
}

class CreatePolicySetDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(["DRAFT", "ACTIVE"])
  status?: "DRAFT" | "ACTIVE";

  @IsOptional()
  @IsObject()
  policyDsl?: Record<string, any>;
}

class SimulatePolicyDto {
  @IsIn(CopilotIntentEnum.options)
  intent!: CopilotIntent;

  @IsOptional()
  @IsIn(Object.values(ControlTriggerTypeDto))
  triggerType?: "EVENT" | "SCHEDULED" | "ON_DEMAND" | "ESCALATION";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  triggerKey?: string;

  @IsOptional()
  @IsObject()
  simulationInput?: Record<string, any>;
}

class UpsertTriggerBudgetDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500000)
  budgetAiCallsDaily?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500000000)
  budgetTokensDaily?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

class PlannerRunsQueryDto {
  @IsOptional()
  @IsIn(["STARTED", "COMPLETED", "FAILED", "SKIPPED"])
  status?: "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED";

  @IsOptional()
  @IsIn(Object.values(ControlTriggerTypeDto))
  triggerType?: "EVENT" | "SCHEDULED" | "ON_DEMAND" | "ESCALATION";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  triggerKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

class CommandCenterFeedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(100)
  limit?: number;
}

class ReplayPlannerRunDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(240)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmReplay?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  previewToken?: string;
}

class AcknowledgePlannerRunTriageDto {
  @IsString()
  @IsIn([
    "MONITOR",
    "REPLAY_RUN",
    "REVIEW_PENDING_APPROVALS",
    "ADJUST_TRIGGER_BUDGET",
    "RETRY_CONNECTOR_DLQ",
    "EXECUTE_DELIVERY_ESCALATIONS",
  ])
  recommendedAction!:
    | "MONITOR"
    | "REPLAY_RUN"
    | "REVIEW_PENDING_APPROVALS"
    | "ADJUST_TRIGGER_BUDGET"
    | "RETRY_CONNECTOR_DLQ"
    | "EXECUTE_DELIVERY_ESCALATIONS";

  @IsOptional()
  @IsString()
  @IsIn(["acknowledged", "deferred"])
  ackStatus?: "acknowledged" | "deferred";

  @IsString()
  @MinLength(8)
  @MaxLength(240)
  note!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

@ApiTags("Control Plane")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@RequiresFeature("COPILOT_CHAT")
@Controller("v1/portal/control-plane")
export class ControlPlaneController {
  constructor(
    private readonly controlPlaneGovernance: ControlPlaneGovernanceService,
  ) {}

  @Get("command-center/overview")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Command center backend overview snapshot" })
  async getOverview(@Req() req: Request) {
    return this.controlPlaneGovernance.getCommandCenterOverview(
      getMerchantId(req),
    );
  }

  @Get("command-center/feed")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Command center alert/feed stream" })
  async getCommandCenterFeed(
    @Req() req: Request,
    @Query() query: CommandCenterFeedQueryDto,
  ) {
    return this.controlPlaneGovernance.getCommandCenterFeed(
      getMerchantId(req),
      query.limit ?? 25,
    );
  }

  @Get("command-center/execution-visibility")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary:
      "Cross-domain execution visibility for planner runs with replay safety and domain truth signals",
  })
  async getExecutionVisibility(
    @Req() req: Request,
    @Query() query: PlannerRunsQueryDto,
  ) {
    return this.controlPlaneGovernance.getExecutionVisibility(
      getMerchantId(req),
      {
        limit: query.limit ?? 20,
        offset: query.offset ?? 0,
        status: query.status,
        triggerType: query.triggerType,
        triggerKey: query.triggerKey,
      },
    );
  }

  @Get("policy-sets")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List control policy sets" })
  async listPolicySets(@Req() req: Request) {
    return this.controlPlaneGovernance.listPolicySets(getMerchantId(req));
  }

  @Post("policy-sets")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Create control policy set" })
  async createPolicySet(@Req() req: Request, @Body() body: CreatePolicySetDto) {
    const staffId = (req as any)?.staffId
      ? String((req as any).staffId)
      : undefined;

    return this.controlPlaneGovernance.createPolicySet({
      merchantId: getMerchantId(req),
      name: body.name,
      status: body.status,
      policyDsl: body.policyDsl,
      createdBy: staffId,
    });
  }

  @Post("policy-sets/:policySetId/simulate")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Simulate policy set against intent and trigger" })
  async simulatePolicy(
    @Req() req: Request,
    @Param("policySetId", new ParseUUIDPipe()) policySetId: string,
    @Body() body: SimulatePolicyDto,
  ) {
    const staffId = (req as any)?.staffId
      ? String((req as any).staffId)
      : undefined;

    return this.controlPlaneGovernance.simulatePolicy({
      merchantId: getMerchantId(req),
      policySetId,
      intent: body.intent,
      triggerType: body.triggerType,
      triggerKey: body.triggerKey,
      simulationInput: body.simulationInput,
      createdBy: staffId,
    });
  }

  @Get("planner-trigger-budgets")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List planner trigger budgets" })
  async listTriggerBudgets(@Req() req: Request) {
    return this.controlPlaneGovernance.listTriggerBudgets(getMerchantId(req));
  }

  @Put("planner-trigger-budgets/:triggerType/:triggerKey")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Upsert planner trigger budget policy" })
  async upsertTriggerBudget(
    @Req() req: Request,
    @Param("triggerType", new ParseEnumPipe(ControlTriggerTypeDto))
    triggerType: ControlTriggerTypeDto,
    @Param("triggerKey") triggerKey: string,
    @Body() body: UpsertTriggerBudgetDto,
  ) {
    return this.controlPlaneGovernance.upsertTriggerBudget({
      merchantId: getMerchantId(req),
      triggerType: String(triggerType) as
        | "EVENT"
        | "SCHEDULED"
        | "ON_DEMAND"
        | "ESCALATION",
      triggerKey,
      budgetAiCallsDaily:
        body.budgetAiCallsDaily !== undefined
          ? Number(body.budgetAiCallsDaily)
          : undefined,
      budgetTokensDaily:
        body.budgetTokensDaily !== undefined
          ? Number(body.budgetTokensDaily)
          : undefined,
      enabled: body.enabled,
      config: body.config,
    });
  }

  @Get("planner-runs")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List planner run ledger entries" })
  async listPlannerRuns(
    @Req() req: Request,
    @Query() query: PlannerRunsQueryDto,
  ) {
    return this.controlPlaneGovernance.listPlannerRuns(getMerchantId(req), {
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      status: query.status,
      triggerType: query.triggerType,
      triggerKey: query.triggerKey,
    });
  }

  @Get("planner-runs/:runId/drilldown")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary:
      "Get planner run drilldown with correlated approvals, replay attempts, connector and delivery evidence",
  })
  async getPlannerRunDrilldown(
    @Req() req: Request,
    @Param("runId", new ParseUUIDPipe()) runId: string,
  ) {
    return this.controlPlaneGovernance.getPlannerRunDrilldown({
      merchantId: getMerchantId(req),
      runId,
    });
  }

  @Get("planner-runs/:runId/replay-preview")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary:
      "Preview replay safety and dry-run summary for a planner run before explicit operator confirmation",
  })
  async getPlannerRunReplayPreview(
    @Req() req: Request,
    @Param("runId", new ParseUUIDPipe()) runId: string,
  ) {
    return this.controlPlaneGovernance.getPlannerRunReplayPreview({
      merchantId: getMerchantId(req),
      runId,
    });
  }

  @Post("planner-runs/:runId/replay")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Replay planner run with budget guardrails" })
  async replayPlannerRun(
    @Req() req: Request,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() body: ReplayPlannerRunDto,
  ) {
    const staffId = (req as any)?.staffId
      ? String((req as any).staffId)
      : undefined;

    return this.controlPlaneGovernance.replayPlannerRun({
      merchantId: getMerchantId(req),
      runId,
      requestedBy: staffId,
      reason: body.reason,
      dryRun: body.dryRun,
      confirmReplay: body.confirmReplay,
      previewToken: body.previewToken,
    });
  }

  @Post("planner-runs/:runId/triage-ack")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary:
      "Persist operator triage acknowledgement for a planner run recommended action",
  })
  async acknowledgePlannerRunTriage(
    @Req() req: Request,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body() body: AcknowledgePlannerRunTriageDto,
  ) {
    const staffId = (req as any)?.staffId
      ? String((req as any).staffId)
      : undefined;

    return this.controlPlaneGovernance.acknowledgePlannerRunTriage({
      merchantId: getMerchantId(req),
      runId,
      recommendedAction: body.recommendedAction,
      ackStatus: body.ackStatus,
      note: body.note,
      acknowledgedBy: staffId,
      metadata: body.metadata,
    });
  }
}
