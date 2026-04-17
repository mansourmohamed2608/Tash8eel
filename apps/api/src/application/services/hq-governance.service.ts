import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

type OrgUnitType = "HQ" | "BRAND" | "REGION" | "BRANCH";
type InheritanceMode = "MERGE" | "OVERRIDE" | "LOCKED";

const MAX_POLICY_VALUE_BYTES = 128 * 1024;
const MAX_STAFF_SCOPE_PERMISSIONS_BYTES = 64 * 1024;
const MAX_UNIT_HIERARCHY_DEPTH = 20;

@Injectable()
export class HqGovernanceService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async listUnits(merchantId: string) {
    const result = await this.pool.query(
      `SELECT
         id::text as id,
         parent_id::text as parent_id,
         unit_type,
         name,
         code,
         branch_id,
         metadata,
         status,
         created_at,
         updated_at
       FROM merchant_org_units
       WHERE merchant_id = $1
       ORDER BY
         CASE unit_type
           WHEN 'HQ' THEN 1
           WHEN 'BRAND' THEN 2
           WHEN 'REGION' THEN 3
           WHEN 'BRANCH' THEN 4
           ELSE 99
         END,
         name ASC`,
      [merchantId],
    );

    return {
      units: result.rows,
      count: result.rows.length,
    };
  }

  async createUnit(input: {
    merchantId: string;
    unitType: OrgUnitType;
    name: string;
    code: string;
    parentId?: string;
    branchId?: string;
    metadata?: Record<string, any>;
  }) {
    const unitType = String(input.unitType || "").toUpperCase() as OrgUnitType;
    if (!["HQ", "BRAND", "REGION", "BRANCH"].includes(unitType)) {
      throw new BadRequestException("Invalid unitType");
    }

    const code = String(input.code || "")
      .trim()
      .toUpperCase();
    const name = String(input.name || "").trim();
    if (!code || !name) {
      throw new BadRequestException("name and code are required");
    }

    if (unitType === "HQ") {
      if (input.parentId) {
        throw new BadRequestException("HQ unit cannot have a parent");
      }

      const existingHq = await this.pool.query(
        `SELECT id
         FROM merchant_org_units
         WHERE merchant_id = $1
           AND unit_type = 'HQ'
           AND status = 'ACTIVE'
         LIMIT 1`,
        [input.merchantId],
      );
      if (existingHq.rows.length) {
        throw new BadRequestException("Only one active HQ unit is allowed");
      }
    }

    if (input.parentId) {
      const parent = await this.getUnit(input.merchantId, input.parentId);
      this.assertParentRelationship(unitType, String(parent.unit_type || ""));
    } else if (unitType !== "HQ") {
      throw new BadRequestException(`${unitType} unit requires a parentId`);
    }

    const duplicateCode = await this.pool.query(
      `SELECT id
       FROM merchant_org_units
       WHERE merchant_id = $1
         AND code = $2
       LIMIT 1`,
      [input.merchantId, code],
    );
    if (duplicateCode.rows.length) {
      throw new BadRequestException(
        "An org unit with this code already exists",
      );
    }

    this.assertJsonWithinLimit(
      input.metadata,
      MAX_STAFF_SCOPE_PERMISSIONS_BYTES,
      "unit metadata",
    );

    const created = await this.pool.query(
      `INSERT INTO merchant_org_units (
         merchant_id,
         parent_id,
         unit_type,
         name,
         code,
         branch_id,
         metadata,
         status
       ) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::jsonb, 'ACTIVE')
       RETURNING
         id::text as id,
         parent_id::text as parent_id,
         unit_type,
         name,
         code,
         branch_id,
         metadata,
         status,
         created_at,
         updated_at`,
      [
        input.merchantId,
        input.parentId || null,
        unitType,
        name,
        code,
        input.branchId || null,
        JSON.stringify(input.metadata || {}),
      ],
    );

    return created.rows[0];
  }

  async listPolicyBindings(merchantId: string, unitId: string) {
    await this.assertUnitExists(merchantId, unitId);

    const rows = await this.pool.query(
      `SELECT
         id::text as id,
         unit_id::text as unit_id,
         policy_key,
         policy_value,
         inheritance_mode,
         version,
         is_active,
         created_by,
         created_at,
         updated_at
       FROM merchant_org_policy_bindings
       WHERE merchant_id = $1
         AND unit_id::text = $2
       ORDER BY policy_key ASC, version DESC`,
      [merchantId, unitId],
    );

    return {
      bindings: rows.rows,
      count: rows.rows.length,
    };
  }

  async upsertPolicyBinding(input: {
    merchantId: string;
    unitId: string;
    policyKey: string;
    policyValue: Record<string, any>;
    inheritanceMode?: InheritanceMode;
    createdBy?: string;
  }) {
    await this.assertUnitExists(input.merchantId, input.unitId);

    const key = String(input.policyKey || "").trim();
    if (!key) {
      throw new BadRequestException("policyKey is required");
    }

    const inheritanceMode = (input.inheritanceMode || "OVERRIDE").toUpperCase();
    if (!["MERGE", "OVERRIDE", "LOCKED"].includes(inheritanceMode)) {
      throw new BadRequestException("inheritanceMode is invalid");
    }

    const versionRow = await this.pool.query<{ next_version: string }>(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version
       FROM merchant_org_policy_bindings
       WHERE merchant_id = $1
         AND unit_id::text = $2
         AND policy_key = $3`,
      [input.merchantId, input.unitId, key],
    );

    const nextVersion = Number(versionRow.rows[0]?.next_version || 1);

    this.assertJsonWithinLimit(
      input.policyValue,
      MAX_POLICY_VALUE_BYTES,
      "policyValue",
    );

    const created = await this.pool.query(
      `INSERT INTO merchant_org_policy_bindings (
         merchant_id,
         unit_id,
         policy_key,
         policy_value,
         inheritance_mode,
         version,
         is_active,
         created_by
       ) VALUES ($1, $2::uuid, $3, $4::jsonb, $5, $6, true, $7)
       RETURNING
         id::text as id,
         unit_id::text as unit_id,
         policy_key,
         policy_value,
         inheritance_mode,
         version,
         is_active,
         created_by,
         created_at,
         updated_at`,
      [
        input.merchantId,
        input.unitId,
        key,
        JSON.stringify(input.policyValue || {}),
        inheritanceMode,
        nextVersion,
        input.createdBy || null,
      ],
    );

    return created.rows[0];
  }

  async getEffectivePolicies(merchantId: string, unitId: string) {
    await this.assertUnitExists(merchantId, unitId);

    const chain = await this.pool.query<{
      id: string;
      level: number;
    }>(
      `WITH RECURSIVE unit_chain AS (
         SELECT id, parent_id, 0 as level, ARRAY[id]::uuid[] as path
         FROM merchant_org_units
         WHERE merchant_id = $1 AND id::text = $2
         UNION ALL
         SELECT p.id, p.parent_id, c.level + 1, (c.path || p.id)
         FROM merchant_org_units p
         JOIN unit_chain c ON c.parent_id = p.id
         WHERE p.merchant_id = $1
           AND c.level < $3
           AND NOT (p.id = ANY(c.path))
       )
       SELECT id::text as id, level
       FROM unit_chain
       ORDER BY level DESC`,
      [merchantId, unitId, MAX_UNIT_HIERARCHY_DEPTH],
    );

    const unitIds = chain.rows.map((row) => row.id);
    if (!unitIds.length) {
      throw new NotFoundException("Org unit not found");
    }

    const bindings = await this.pool.query<{
      unit_id: string;
      policy_key: string;
      policy_value: Record<string, any>;
      inheritance_mode: InheritanceMode;
      version: number;
    }>(
      `SELECT DISTINCT ON (unit_id, policy_key)
         unit_id::text as unit_id,
         policy_key,
         policy_value,
         inheritance_mode,
         version
       FROM merchant_org_policy_bindings
       WHERE merchant_id = $1
         AND unit_id::text = ANY($2::text[])
         AND is_active = true
       ORDER BY unit_id, policy_key, version DESC`,
      [merchantId, unitIds],
    );

    const depthByUnit = chain.rows.reduce(
      (acc, row) => {
        acc[row.id] = row.level;
        return acc;
      },
      {} as Record<string, number>,
    );

    bindings.rows.sort((a, b) => {
      const depthA = depthByUnit[a.unit_id] ?? 999;
      const depthB = depthByUnit[b.unit_id] ?? 999;
      return depthB - depthA;
    });

    const resolved: Record<string, any> = {};
    const lockedKeys = new Set<string>();
    const lineage: Record<string, Array<Record<string, any>>> = {};

    for (const row of bindings.rows) {
      if (!lineage[row.policy_key]) {
        lineage[row.policy_key] = [];
      }

      const isLocked = lockedKeys.has(row.policy_key);
      lineage[row.policy_key].push({
        unitId: row.unit_id,
        mode: row.inheritance_mode,
        version: row.version,
        applied: !isLocked,
      });

      if (isLocked) {
        continue;
      }

      const incomingValue = row.policy_value || {};
      const currentValue = resolved[row.policy_key] || {};

      if (row.inheritance_mode === "MERGE") {
        const safeCurrent =
          currentValue && typeof currentValue === "object" ? currentValue : {};
        const safeIncoming =
          incomingValue && typeof incomingValue === "object"
            ? incomingValue
            : {};
        resolved[row.policy_key] = {
          ...safeCurrent,
          ...safeIncoming,
        };
      } else {
        resolved[row.policy_key] = incomingValue;
      }

      if (row.inheritance_mode === "LOCKED") {
        lockedKeys.add(row.policy_key);
      }
    }

    return {
      unitId,
      effectivePolicies: resolved,
      lineage,
    };
  }

  async listStaffScopes(merchantId: string, unitId: string) {
    await this.assertUnitExists(merchantId, unitId);

    const rows = await this.pool.query(
      `SELECT
         s.id::text as id,
         s.unit_id::text as unit_id,
         s.staff_id,
         s.role_scope,
         s.permissions,
         s.status,
         s.created_at,
         s.updated_at,
         ms.name as staff_name,
         ms.email as staff_email,
         ms.role as staff_global_role
       FROM merchant_org_staff_scopes s
       LEFT JOIN merchant_staff ms
         ON ms.id::text = s.staff_id
        AND ms.merchant_id = s.merchant_id
       WHERE s.merchant_id = $1
         AND s.unit_id::text = $2
       ORDER BY s.created_at DESC`,
      [merchantId, unitId],
    );

    return {
      scopes: rows.rows,
      count: rows.rows.length,
    };
  }

  async upsertStaffScope(input: {
    merchantId: string;
    unitId: string;
    staffId: string;
    roleScope?: "OWNER" | "ADMIN" | "MANAGER" | "ANALYST" | "MEMBER";
    permissions?: Record<string, any>;
    status?: "ACTIVE" | "INACTIVE";
  }) {
    await this.assertUnitExists(input.merchantId, input.unitId);

    const staffId = String(input.staffId || "").trim();
    if (!staffId) {
      throw new BadRequestException("staffId is required");
    }

    await this.assertStaffExists(input.merchantId, staffId);

    const roleScope = String(input.roleScope || "MEMBER").toUpperCase();
    if (
      !["OWNER", "ADMIN", "MANAGER", "ANALYST", "MEMBER"].includes(roleScope)
    ) {
      throw new BadRequestException("roleScope is invalid");
    }

    const status = String(input.status || "ACTIVE").toUpperCase();
    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      throw new BadRequestException("status is invalid");
    }

    this.assertJsonWithinLimit(
      input.permissions,
      MAX_STAFF_SCOPE_PERMISSIONS_BYTES,
      "permissions",
    );

    const row = await this.pool.query(
      `INSERT INTO merchant_org_staff_scopes (
         merchant_id,
         unit_id,
         staff_id,
         role_scope,
         permissions,
         status
       ) VALUES ($1, $2::uuid, $3, $4, $5::jsonb, $6)
       ON CONFLICT (merchant_id, unit_id, staff_id)
       DO UPDATE SET
         role_scope = EXCLUDED.role_scope,
         permissions = EXCLUDED.permissions,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING
         id::text as id,
         unit_id::text as unit_id,
         staff_id,
         role_scope,
         permissions,
         status,
         created_at,
         updated_at`,
      [
        input.merchantId,
        input.unitId,
        staffId,
        roleScope,
        JSON.stringify(input.permissions || {}),
        status,
      ],
    );

    return row.rows[0];
  }

  private async assertUnitExists(merchantId: string, unitId: string) {
    const exists = await this.pool.query(
      `SELECT id
       FROM merchant_org_units
       WHERE merchant_id = $1 AND id::text = $2
       LIMIT 1`,
      [merchantId, unitId],
    );

    if (!exists.rows.length) {
      throw new NotFoundException("Org unit not found");
    }
  }

  private assertParentRelationship(
    unitType: OrgUnitType,
    parentTypeRaw: string,
  ) {
    const parentType = parentTypeRaw.toUpperCase() as OrgUnitType;
    const allowedParents: Record<OrgUnitType, OrgUnitType[]> = {
      HQ: [],
      BRAND: ["HQ"],
      REGION: ["HQ", "BRAND"],
      BRANCH: ["REGION", "BRAND"],
    };

    if (!allowedParents[unitType].includes(parentType)) {
      throw new BadRequestException(
        `${unitType} cannot be assigned under ${parentType}`,
      );
    }
  }

  private async getUnit(merchantId: string, unitId: string) {
    const result = await this.pool.query<{
      id: string;
      unit_type: OrgUnitType;
    }>(
      `SELECT id::text as id, unit_type
       FROM merchant_org_units
       WHERE merchant_id = $1
         AND id::text = $2
       LIMIT 1`,
      [merchantId, unitId],
    );

    if (!result.rows.length) {
      throw new NotFoundException("Org unit not found");
    }

    return result.rows[0];
  }

  private async assertStaffExists(merchantId: string, staffId: string) {
    const result = await this.pool.query(
      `SELECT id
       FROM merchant_staff
       WHERE merchant_id = $1
         AND id::text = $2
       LIMIT 1`,
      [merchantId, staffId],
    );

    if (!result.rows.length) {
      throw new NotFoundException("Staff member not found");
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
