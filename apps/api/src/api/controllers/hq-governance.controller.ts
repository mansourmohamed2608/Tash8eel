import {
  Body,
  Controller,
  Get,
  ParseUUIDPipe,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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
import { HqGovernanceService } from "../../application/services/hq-governance.service";

const HQ_UNIT_TYPES = ["HQ", "BRAND", "REGION", "BRANCH"] as const;
const HQ_INHERITANCE_MODES = ["MERGE", "OVERRIDE", "LOCKED"] as const;
const HQ_ROLE_SCOPES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "ANALYST",
  "MEMBER",
] as const;
const HQ_SCOPE_STATUS = ["ACTIVE", "INACTIVE"] as const;
const HQ_UNIT_STATUS = ["ACTIVE", "INACTIVE"] as const;
const HQ_DESCENDANT_FORMATS = ["FLAT", "TREE", "flat", "tree"] as const;

class CreateUnitDto {
  @IsIn(HQ_UNIT_TYPES)
  unitType!: "HQ" | "BRAND" | "REGION" | "BRANCH";

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  code!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  branchId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

class UpsertPolicyBindingDto {
  @IsOptional()
  @IsObject()
  policyValue?: Record<string, any>;

  @IsOptional()
  @IsIn(HQ_INHERITANCE_MODES)
  inheritanceMode?: "MERGE" | "OVERRIDE" | "LOCKED";
}

class UpsertStaffScopeDto {
  @IsOptional()
  @IsIn(HQ_ROLE_SCOPES)
  roleScope?: "OWNER" | "ADMIN" | "MANAGER" | "ANALYST" | "MEMBER";

  @IsOptional()
  @IsObject()
  permissions?: Record<string, any>;

  @IsOptional()
  @IsIn(HQ_SCOPE_STATUS)
  status?: "ACTIVE" | "INACTIVE";
}

class MoveUnitDto {
  @IsUUID()
  newParentId!: string;
}

class SetUnitStatusDto {
  @IsIn(HQ_UNIT_STATUS)
  status!: "ACTIVE" | "INACTIVE";
}

class ListUnitDescendantsQueryDto {
  @IsOptional()
  @IsIn(HQ_DESCENDANT_FORMATS)
  format?: "FLAT" | "TREE" | "flat" | "tree";

  @IsOptional()
  @IsString()
  maxDepth?: string;
}

@ApiTags("HQ / Franchise Governance")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@RequiresFeature("TEAM")
@Controller("v1/portal/hq")
export class HqGovernanceController {
  constructor(private readonly hqGovernanceService: HqGovernanceService) {}

  @Get("units")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List HQ/brand/region/branch org units" })
  async listUnits(@Req() req: Request) {
    return this.hqGovernanceService.listUnits(getMerchantId(req));
  }

  @Get("units/tree")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Get org unit tree with aggregates" })
  async getUnitTree(@Req() req: Request) {
    return this.hqGovernanceService.getUnitTree(getMerchantId(req));
  }

  @Post("units")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Create org unit (HQ/brand/region/branch)" })
  async createUnit(@Req() req: Request, @Body() body: CreateUnitDto) {
    return this.hqGovernanceService.createUnit({
      merchantId: getMerchantId(req),
      unitType: body.unitType,
      name: body.name,
      code: body.code,
      parentId: body.parentId,
      branchId: body.branchId,
      metadata: body.metadata,
      enforceGovernanceLocks: true,
    });
  }

  @Put("units/:unitId/move")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Move org unit under a new parent" })
  async moveUnit(
    @Req() req: Request,
    @Param("unitId", new ParseUUIDPipe()) unitId: string,
    @Body() body: MoveUnitDto,
  ) {
    return this.hqGovernanceService.moveUnit({
      merchantId: getMerchantId(req),
      unitId,
      newParentId: body.newParentId,
      enforceGovernanceLocks: true,
    });
  }

  @Put("units/:unitId/status")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Set org unit status" })
  async setUnitStatus(
    @Req() req: Request,
    @Param("unitId", new ParseUUIDPipe()) unitId: string,
    @Body() body: SetUnitStatusDto,
  ) {
    return this.hqGovernanceService.setUnitStatus({
      merchantId: getMerchantId(req),
      unitId,
      status: body.status,
      enforceGovernanceLocks: true,
    });
  }

  @Get("units/:unitId/policies")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List policy bindings for org unit" })
  async listUnitPolicies(
    @Req() req: Request,
    @Param("unitId", new ParseUUIDPipe()) unitId: string,
  ) {
    return this.hqGovernanceService.listPolicyBindings(
      getMerchantId(req),
      unitId,
    );
  }

  @Get("units/:unitId/policies/effective")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Resolve effective policies across org hierarchy" })
  async getEffectivePolicies(
    @Req() req: Request,
    @Param("unitId", new ParseUUIDPipe()) unitId: string,
  ) {
    return this.hqGovernanceService.getEffectivePolicies(
      getMerchantId(req),
      unitId,
    );
  }

  @Get("units/:unitId/descendants")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "List descendants for an org unit as flat list or tree",
  })
  async listUnitDescendants(
    @Req() req: Request,
    @Param("unitId", new ParseUUIDPipe()) unitId: string,
    @Query() query: ListUnitDescendantsQueryDto,
  ) {
    const maxDepth =
      query.maxDepth === undefined ? undefined : Number(query.maxDepth);

    return this.hqGovernanceService.listUnitDescendants(
      getMerchantId(req),
      unitId,
      {
        format: query.format,
        maxDepth,
      },
    );
  }

  @Get("units/:unitId/policies/conflicts")
  @RequireRole("MANAGER")
  @ApiOperation({
    summary: "Get policy conflict insights across the org lineage",
  })
  async getPolicyConflictInsights(
    @Req() req: Request,
    @Param("unitId", new ParseUUIDPipe()) unitId: string,
  ) {
    return this.hqGovernanceService.getPolicyConflictInsights(
      getMerchantId(req),
      unitId,
    );
  }

  @Put("units/:unitId/policies/:policyKey")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Upsert policy binding with new version" })
  async upsertPolicyBinding(
    @Req() req: Request,
    @Param("unitId", new ParseUUIDPipe()) unitId: string,
    @Param("policyKey") policyKey: string,
    @Body() body: UpsertPolicyBindingDto,
  ) {
    const staffId = (req as any)?.staffId
      ? String((req as any).staffId)
      : undefined;

    return this.hqGovernanceService.upsertPolicyBinding({
      merchantId: getMerchantId(req),
      unitId,
      policyKey,
      policyValue: body.policyValue || {},
      inheritanceMode: body.inheritanceMode,
      createdBy: staffId,
      enforceAncestorLocks: true,
      enforceGovernanceLocks: true,
    });
  }

  @Get("units/:unitId/staff-scopes")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "List staff scopes for org unit" })
  async listStaffScopes(
    @Req() req: Request,
    @Param("unitId", new ParseUUIDPipe()) unitId: string,
  ) {
    return this.hqGovernanceService.listStaffScopes(getMerchantId(req), unitId);
  }

  @Put("units/:unitId/staff-scopes/:staffId")
  @RequireRole("OWNER")
  @ApiOperation({ summary: "Upsert staff scoped role within org unit" })
  async upsertStaffScope(
    @Req() req: Request,
    @Param("unitId", new ParseUUIDPipe()) unitId: string,
    @Param("staffId") staffId: string,
    @Body() body: UpsertStaffScopeDto,
  ) {
    return this.hqGovernanceService.upsertStaffScope({
      merchantId: getMerchantId(req),
      unitId,
      staffId,
      roleScope: body.roleScope,
      permissions: body.permissions,
      status: body.status,
      enforceGovernanceLocks: true,
    });
  }
}
