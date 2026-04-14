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
type OrgUnitStatus = "ACTIVE" | "INACTIVE";
type DescendantFormat = "FLAT" | "TREE";

const MAX_POLICY_VALUE_BYTES = 128 * 1024;
const MAX_STAFF_SCOPE_PERMISSIONS_BYTES = 64 * 1024;
const MAX_UNIT_HIERARCHY_DEPTH = 20;
const HQ_GOVERNANCE_LOCK_KEYS = {
  STRUCTURE_MUTATIONS: "governance.structure_mutations",
  STAFF_SCOPE_MUTATIONS: "governance.staff_scope_mutations",
  POLICY_MUTATIONS: "governance.policy_mutations",
} as const;

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

  async getUnitTree(merchantId: string) {
    const result = await this.pool.query<{
      id: string;
      parent_id: string | null;
      unit_type: OrgUnitType;
      name: string;
      code: string;
      branch_id: string | null;
      metadata: Record<string, any> | null;
      status: OrgUnitStatus;
      created_at: Date;
      updated_at: Date;
    }>(
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
       ORDER BY name ASC`,
      [merchantId],
    );

    const byType: Record<OrgUnitType, number> = {
      HQ: 0,
      BRAND: 0,
      REGION: 0,
      BRANCH: 0,
    };

    const nodes = new Map<
      string,
      {
        id: string;
        parent_id: string | null;
        unit_type: OrgUnitType;
        name: string;
        code: string;
        branch_id: string | null;
        metadata: Record<string, any> | null;
        status: OrgUnitStatus;
        created_at: Date;
        updated_at: Date;
        children: any[];
      }
    >();

    let activeUnits = 0;

    for (const row of result.rows) {
      const unitType = String(row.unit_type || "").toUpperCase() as OrgUnitType;
      if (Object.prototype.hasOwnProperty.call(byType, unitType)) {
        byType[unitType] += 1;
      }

      if (String(row.status || "").toUpperCase() === "ACTIVE") {
        activeUnits += 1;
      }

      nodes.set(row.id, {
        ...row,
        children: [],
      });
    }

    const tree: Array<typeof nodes extends Map<any, infer V> ? V : never> = [];

    for (const row of result.rows) {
      const node = nodes.get(row.id);
      if (!node) {
        continue;
      }

      if (row.parent_id && nodes.has(row.parent_id)) {
        nodes.get(row.parent_id)!.children.push(node);
      } else {
        tree.push(node);
      }
    }

    return {
      tree,
      aggregates: {
        totalUnits: result.rows.length,
        activeUnits,
        byType,
      },
    };
  }

  async listUnitDescendants(
    merchantId: string,
    unitId: string,
    options?: {
      format?: string;
      maxDepth?: number;
    },
  ) {
    const requestedDepth =
      options?.maxDepth === undefined
        ? MAX_UNIT_HIERARCHY_DEPTH
        : options.maxDepth;

    if (
      !Number.isInteger(requestedDepth) ||
      requestedDepth < 1 ||
      requestedDepth > MAX_UNIT_HIERARCHY_DEPTH
    ) {
      throw new BadRequestException(
        `maxDepth must be an integer between 1 and ${MAX_UNIT_HIERARCHY_DEPTH}`,
      );
    }

    const format = String(
      options?.format || "FLAT",
    ).toUpperCase() as DescendantFormat;
    if (!(["FLAT", "TREE"] as const).includes(format)) {
      throw new BadRequestException("format must be FLAT or TREE");
    }

    await this.assertUnitExists(merchantId, unitId);

    const descendants = await this.pool.query<{
      id: string;
      parent_id: string | null;
      unit_type: OrgUnitType;
      name: string;
      code: string;
      branch_id: string | null;
      metadata: Record<string, any> | null;
      status: OrgUnitStatus;
      created_at: Date;
      updated_at: Date;
      depth: number;
    }>(
      `WITH RECURSIVE descendant_chain AS (
         SELECT
           id,
           parent_id,
           unit_type,
           name,
           code,
           branch_id,
           metadata,
           status,
           created_at,
           updated_at,
           0 as depth,
           ARRAY[id]::uuid[] as path
         FROM merchant_org_units
         WHERE merchant_id = $1
           AND id::text = $2
         UNION ALL
         SELECT
           child.id,
           child.parent_id,
           child.unit_type,
           child.name,
           child.code,
           child.branch_id,
           child.metadata,
           child.status,
           child.created_at,
           child.updated_at,
           d.depth + 1,
           (d.path || child.id)
         FROM merchant_org_units child
         JOIN descendant_chain d ON child.parent_id = d.id
         WHERE child.merchant_id = $1
           AND d.depth < $3
           AND NOT (child.id = ANY(d.path))
       )
       SELECT
         id::text as id,
         parent_id::text as parent_id,
         unit_type,
         name,
         code,
         branch_id,
         metadata,
         status,
         created_at,
         updated_at,
         depth
       FROM descendant_chain
       WHERE depth > 0
       ORDER BY depth ASC, name ASC`,
      [merchantId, unitId, requestedDepth],
    );

    if (format === "FLAT") {
      return {
        unitId,
        format,
        maxDepth: requestedDepth,
        count: descendants.rows.length,
        descendants: descendants.rows,
      };
    }

    const nodes = new Map<
      string,
      {
        id: string;
        parent_id: string | null;
        unit_type: OrgUnitType;
        name: string;
        code: string;
        branch_id: string | null;
        metadata: Record<string, any> | null;
        status: OrgUnitStatus;
        created_at: Date;
        updated_at: Date;
        depth: number;
        children: any[];
      }
    >();

    for (const row of descendants.rows) {
      nodes.set(row.id, {
        ...row,
        children: [],
      });
    }

    const tree: Array<typeof nodes extends Map<any, infer V> ? V : never> = [];

    for (const row of descendants.rows) {
      const node = nodes.get(row.id);
      if (!node) {
        continue;
      }

      if (
        row.parent_id === unitId ||
        !row.parent_id ||
        !nodes.has(row.parent_id)
      ) {
        tree.push(node);
      } else {
        nodes.get(row.parent_id)!.children.push(node);
      }
    }

    return {
      unitId,
      format,
      maxDepth: requestedDepth,
      count: descendants.rows.length,
      tree,
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
    enforceGovernanceLocks?: boolean;
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

      if (input.enforceGovernanceLocks === true) {
        await this.assertMutationAllowedByGovernanceLock({
          merchantId: input.merchantId,
          unitId: input.parentId,
          policyKey: HQ_GOVERNANCE_LOCK_KEYS.STRUCTURE_MUTATIONS,
          mutationLabel: "create org unit",
        });
      }
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

  async moveUnit(input: {
    merchantId: string;
    unitId: string;
    newParentId: string;
    enforceGovernanceLocks?: boolean;
  }) {
    const unitId = String(input.unitId || "").trim();
    const newParentId = String(input.newParentId || "").trim();

    if (!unitId || !newParentId) {
      throw new BadRequestException("unitId and newParentId are required");
    }

    if (unitId === newParentId) {
      throw new BadRequestException("Org unit cannot be moved under itself");
    }

    const unit = await this.getUnit(input.merchantId, unitId);
    if (unit.unit_type === "HQ") {
      throw new BadRequestException("HQ unit cannot be moved under a parent");
    }

    const newParent = await this.getUnit(input.merchantId, newParentId);
    this.assertParentRelationship(
      unit.unit_type,
      String(newParent.unit_type || ""),
    );

    if (input.enforceGovernanceLocks === true) {
      await this.assertMutationAllowedByGovernanceLock({
        merchantId: input.merchantId,
        unitId,
        policyKey: HQ_GOVERNANCE_LOCK_KEYS.STRUCTURE_MUTATIONS,
        mutationLabel: "move org unit",
      });
      await this.assertMutationAllowedByGovernanceLock({
        merchantId: input.merchantId,
        unitId: newParentId,
        policyKey: HQ_GOVERNANCE_LOCK_KEYS.STRUCTURE_MUTATIONS,
        mutationLabel: "move org unit",
      });
    }

    const cycleCheck = await this.pool.query(
      `WITH RECURSIVE descendants AS (
         SELECT id, parent_id, ARRAY[id]::uuid[] as path
         FROM merchant_org_units
         WHERE merchant_id = $1
           AND id::text = $2
         UNION ALL
         SELECT child.id, child.parent_id, (d.path || child.id)
         FROM merchant_org_units child
         JOIN descendants d ON child.parent_id = d.id
         WHERE child.merchant_id = $1
           AND NOT (child.id = ANY(d.path))
       )
       SELECT 1
       FROM descendants
       WHERE id::text = $3
       LIMIT 1`,
      [input.merchantId, unitId, newParentId],
    );

    if (cycleCheck.rows.length) {
      throw new BadRequestException(
        "Org unit cannot be moved under its own descendant",
      );
    }

    const updated = await this.pool.query(
      `UPDATE merchant_org_units
       SET parent_id = $3::uuid,
           updated_at = NOW()
       WHERE merchant_id = $1
         AND id::text = $2
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
      [input.merchantId, unitId, newParentId],
    );

    if (!updated.rows.length) {
      throw new NotFoundException("Org unit not found");
    }

    return updated.rows[0];
  }

  async setUnitStatus(input: {
    merchantId: string;
    unitId: string;
    status: OrgUnitStatus;
    enforceGovernanceLocks?: boolean;
  }) {
    const status = String(input.status || "").toUpperCase() as OrgUnitStatus;
    if (!status || !["ACTIVE", "INACTIVE"].includes(status)) {
      throw new BadRequestException("status is invalid");
    }

    await this.assertUnitExists(input.merchantId, input.unitId);

    if (input.enforceGovernanceLocks === true) {
      await this.assertMutationAllowedByGovernanceLock({
        merchantId: input.merchantId,
        unitId: input.unitId,
        policyKey: HQ_GOVERNANCE_LOCK_KEYS.STRUCTURE_MUTATIONS,
        mutationLabel: "change org unit status",
      });
    }

    if (status === "INACTIVE") {
      const activeChildren = await this.pool.query(
        `SELECT id
         FROM merchant_org_units
         WHERE merchant_id = $1
           AND parent_id::text = $2
           AND status = 'ACTIVE'
         LIMIT 1`,
        [input.merchantId, input.unitId],
      );

      if (activeChildren.rows.length) {
        throw new BadRequestException(
          "Cannot set unit to INACTIVE while it has active children",
        );
      }
    }

    const updated = await this.pool.query(
      `UPDATE merchant_org_units
       SET status = $3,
           updated_at = NOW()
       WHERE merchant_id = $1
         AND id::text = $2
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
      [input.merchantId, input.unitId, status],
    );

    if (!updated.rows.length) {
      throw new NotFoundException("Org unit not found");
    }

    return updated.rows[0];
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
    enforceAncestorLocks?: boolean;
    enforceGovernanceLocks?: boolean;
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

    if (input.enforceGovernanceLocks === true) {
      await this.assertMutationAllowedByGovernanceLock({
        merchantId: input.merchantId,
        unitId: input.unitId,
        policyKey: HQ_GOVERNANCE_LOCK_KEYS.POLICY_MUTATIONS,
        mutationLabel: "upsert policy binding",
      });
    }

    if (input.enforceAncestorLocks === true) {
      const lockedAncestor = await this.findLockedAncestorPolicyBinding({
        merchantId: input.merchantId,
        unitId: input.unitId,
        policyKey: key,
      });

      if (lockedAncestor) {
        throw new BadRequestException(
          `Cannot upsert policyKey "${key}" because ancestor unit ${lockedAncestor.unit_id} has LOCKED mode at version ${lockedAncestor.version}`,
        );
      }
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

  async getPolicyConflictInsights(merchantId: string, unitId: string) {
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
       ORDER BY level ASC`,
      [merchantId, unitId, MAX_UNIT_HIERARCHY_DEPTH],
    );

    const unitIds = chain.rows.map((row) => row.id);
    if (!unitIds.length) {
      throw new NotFoundException("Org unit not found");
    }

    const bindings = await this.pool.query<{
      unit_id: string;
      policy_key: string;
      inheritance_mode: InheritanceMode;
      version: number;
    }>(
      `SELECT DISTINCT ON (unit_id, policy_key)
         unit_id::text as unit_id,
         policy_key,
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

    const byPolicy = new Map<
      string,
      Array<{
        unitId: string;
        depth: number;
        mode: InheritanceMode;
        version: number;
      }>
    >();

    for (const row of bindings.rows) {
      const existing = byPolicy.get(row.policy_key) || [];
      existing.push({
        unitId: row.unit_id,
        depth: depthByUnit[row.unit_id] ?? MAX_UNIT_HIERARCHY_DEPTH,
        mode: row.inheritance_mode,
        version: row.version,
      });
      byPolicy.set(row.policy_key, existing);
    }

    const conflicts = Array.from(byPolicy.entries())
      .filter(([, definitions]) => definitions.length > 1)
      .map(([policyKey, definitions]) => {
        definitions.sort((a, b) => a.depth - b.depth);

        const uniqueModes = new Set(definitions.map((entry) => entry.mode));
        const uniqueVersions = new Set(
          definitions.map((entry) => entry.version),
        );

        return {
          policyKey,
          occurrences: definitions.length,
          modeDivergence: uniqueModes.size > 1,
          versionDivergence: uniqueVersions.size > 1,
          definitions,
        };
      })
      .sort((a, b) => a.policyKey.localeCompare(b.policyKey));

    return {
      unitId,
      lineageDepth: Math.max(0, chain.rows.length - 1),
      totalPolicyKeysInLineage: byPolicy.size,
      conflictCount: conflicts.length,
      conflicts,
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
    enforceGovernanceLocks?: boolean;
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

    if (input.enforceGovernanceLocks === true) {
      await this.assertMutationAllowedByGovernanceLock({
        merchantId: input.merchantId,
        unitId: input.unitId,
        policyKey: HQ_GOVERNANCE_LOCK_KEYS.STAFF_SCOPE_MUTATIONS,
        mutationLabel: "upsert staff scope",
      });
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

  private async assertMutationAllowedByGovernanceLock(input: {
    merchantId: string;
    unitId: string;
    policyKey: string;
    mutationLabel: string;
  }) {
    const lockedAncestor = await this.findLockedAncestorPolicyBinding({
      merchantId: input.merchantId,
      unitId: input.unitId,
      policyKey: input.policyKey,
    });

    if (lockedAncestor) {
      throw new BadRequestException(
        `Cannot ${input.mutationLabel} because ancestor unit ${lockedAncestor.unit_id} has LOCKED mode for policyKey "${input.policyKey}" at version ${lockedAncestor.version}`,
      );
    }
  }

  private async findLockedAncestorPolicyBinding(input: {
    merchantId: string;
    unitId: string;
    policyKey: string;
  }) {
    const result = await this.pool.query<{
      unit_id: string;
      level: number;
      version: number;
    }>(
      `WITH RECURSIVE unit_chain AS (
         SELECT id, parent_id, 0 as level, ARRAY[id]::uuid[] as path
         FROM merchant_org_units
         WHERE merchant_id = $1
           AND id::text = $2
         UNION ALL
         SELECT p.id, p.parent_id, c.level + 1, (c.path || p.id)
         FROM merchant_org_units p
         JOIN unit_chain c ON c.parent_id = p.id
         WHERE p.merchant_id = $1
           AND c.level < $4
           AND NOT (p.id = ANY(c.path))
       ),
       latest_policy_by_unit AS (
         SELECT DISTINCT ON (binding.unit_id)
           binding.unit_id::text as unit_id,
           binding.inheritance_mode,
           binding.version
         FROM merchant_org_policy_bindings binding
         JOIN unit_chain chain ON chain.id = binding.unit_id
         WHERE binding.merchant_id = $1
           AND binding.policy_key = $3
           AND binding.is_active = true
           AND chain.level > 0
         ORDER BY binding.unit_id, binding.version DESC
       )
       SELECT
         latest.unit_id,
         chain.level,
         latest.version
       FROM latest_policy_by_unit latest
       JOIN unit_chain chain ON chain.id::text = latest.unit_id
       WHERE latest.inheritance_mode = 'LOCKED'
       ORDER BY chain.level ASC
       LIMIT 1`,
      [
        input.merchantId,
        input.unitId,
        input.policyKey,
        MAX_UNIT_HIERARCHY_DEPTH,
      ],
    );

    return result.rows[0] || null;
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
