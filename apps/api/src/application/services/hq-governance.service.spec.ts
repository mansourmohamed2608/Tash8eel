import { HqGovernanceService } from "./hq-governance.service";

describe("HqGovernanceService", () => {
  it("builds org tree and aggregates totals by type", async () => {
    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: "hq-1",
            parent_id: null,
            unit_type: "HQ",
            name: "HQ",
            code: "HQ",
            branch_id: null,
            metadata: {},
            status: "ACTIVE",
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: "brand-1",
            parent_id: "hq-1",
            unit_type: "BRAND",
            name: "Brand A",
            code: "BRANDA",
            branch_id: null,
            metadata: {},
            status: "ACTIVE",
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: "region-1",
            parent_id: "brand-1",
            unit_type: "REGION",
            name: "Region A",
            code: "REGA",
            branch_id: null,
            metadata: {},
            status: "INACTIVE",
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: "branch-1",
            parent_id: "region-1",
            unit_type: "BRANCH",
            name: "Branch A",
            code: "BRA",
            branch_id: "b-1",
            metadata: {},
            status: "ACTIVE",
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      }),
    } as any;

    const service = new HqGovernanceService(pool);
    const result = await service.getUnitTree("m-1");

    expect(result.tree).toHaveLength(1);
    expect(result.tree[0].id).toBe("hq-1");
    expect(result.tree[0].children[0].id).toBe("brand-1");
    expect(result.aggregates).toEqual({
      totalUnits: 4,
      activeUnits: 3,
      byType: {
        HQ: 1,
        BRAND: 1,
        REGION: 1,
        BRANCH: 1,
      },
    });
  });

  it("rejects moving a unit under its own descendant", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: "branch-1", unit_type: "BRANCH" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "region-1", unit_type: "REGION" }],
        })
        .mockResolvedValueOnce({ rows: [{ exists: 1 }] }),
    } as any;

    const service = new HqGovernanceService(pool);

    await expect(
      service.moveUnit({
        merchantId: "m-1",
        unitId: "branch-1",
        newParentId: "region-1",
      }),
    ).rejects.toThrow("Org unit cannot be moved under its own descendant");

    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it("rejects setting unit INACTIVE when it still has active children", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "region-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "branch-1" }] }),
    } as any;

    const service = new HqGovernanceService(pool);

    await expect(
      service.setUnitStatus({
        merchantId: "m-1",
        unitId: "region-1",
        status: "INACTIVE",
      }),
    ).rejects.toThrow(
      "Cannot set unit to INACTIVE while it has active children",
    );

    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("lists descendants in FLAT format with depth metadata", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "hq-1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "brand-1",
              parent_id: "hq-1",
              unit_type: "BRAND",
              name: "Brand A",
              code: "BRANDA",
              branch_id: null,
              metadata: {},
              status: "ACTIVE",
              created_at: new Date(),
              updated_at: new Date(),
              depth: 1,
            },
            {
              id: "region-1",
              parent_id: "brand-1",
              unit_type: "REGION",
              name: "Region A",
              code: "REGA",
              branch_id: null,
              metadata: {},
              status: "ACTIVE",
              created_at: new Date(),
              updated_at: new Date(),
              depth: 2,
            },
          ],
        }),
    } as any;

    const service = new HqGovernanceService(pool);
    const result = await service.listUnitDescendants("m-1", "hq-1", {
      format: "flat",
      maxDepth: 2,
    });

    expect(result).toMatchObject({
      unitId: "hq-1",
      format: "FLAT",
      maxDepth: 2,
      count: 2,
    });
    const flatDescendants = (result as any).descendants;
    expect(flatDescendants.map((row: any) => row.depth)).toEqual([1, 2]);
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      "m-1",
      "hq-1",
      2,
    ]);
  });

  it("builds descendants in TREE format", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "hq-1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "brand-1",
              parent_id: "hq-1",
              unit_type: "BRAND",
              name: "Brand A",
              code: "BRANDA",
              branch_id: null,
              metadata: {},
              status: "ACTIVE",
              created_at: new Date(),
              updated_at: new Date(),
              depth: 1,
            },
            {
              id: "region-1",
              parent_id: "brand-1",
              unit_type: "REGION",
              name: "Region A",
              code: "REGA",
              branch_id: null,
              metadata: {},
              status: "ACTIVE",
              created_at: new Date(),
              updated_at: new Date(),
              depth: 2,
            },
            {
              id: "branch-1",
              parent_id: "region-1",
              unit_type: "BRANCH",
              name: "Branch A",
              code: "BRA",
              branch_id: "b-1",
              metadata: {},
              status: "ACTIVE",
              created_at: new Date(),
              updated_at: new Date(),
              depth: 3,
            },
          ],
        }),
    } as any;

    const service = new HqGovernanceService(pool);
    const result = await service.listUnitDescendants("m-1", "hq-1", {
      format: "TREE",
      maxDepth: 3,
    });

    expect(result).toMatchObject({
      unitId: "hq-1",
      format: "TREE",
      maxDepth: 3,
      count: 3,
    });
    const tree = (result as any).tree;
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("brand-1");
    expect(tree[0].children[0].id).toBe("region-1");
    expect(tree[0].children[0].children[0].id).toBe("branch-1");
  });

  it("rejects descendants listing when maxDepth exceeds guard", async () => {
    const pool = {
      query: jest.fn(),
    } as any;

    const service = new HqGovernanceService(pool);

    await expect(
      service.listUnitDescendants("m-1", "hq-1", {
        format: "FLAT",
        maxDepth: 21,
      }),
    ).rejects.toThrow("maxDepth must be an integer between 1 and 20");

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("surfaces policy conflict insights for repeated policy keys in lineage", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "branch-1" }] })
        .mockResolvedValueOnce({
          rows: [
            { id: "branch-1", level: 0 },
            { id: "region-1", level: 1 },
            { id: "hq-1", level: 2 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              unit_id: "branch-1",
              policy_key: "delivery.cutoff",
              inheritance_mode: "OVERRIDE",
              version: 3,
            },
            {
              unit_id: "region-1",
              policy_key: "delivery.cutoff",
              inheritance_mode: "MERGE",
              version: 1,
            },
            {
              unit_id: "branch-1",
              policy_key: "tax.profile",
              inheritance_mode: "LOCKED",
              version: 2,
            },
            {
              unit_id: "region-1",
              policy_key: "pricing.rounding",
              inheritance_mode: "OVERRIDE",
              version: 4,
            },
            {
              unit_id: "hq-1",
              policy_key: "pricing.rounding",
              inheritance_mode: "OVERRIDE",
              version: 2,
            },
          ],
        }),
    } as any;

    const service = new HqGovernanceService(pool);
    const result = await service.getPolicyConflictInsights("m-1", "branch-1");

    expect(result.unitId).toBe("branch-1");
    expect(result.lineageDepth).toBe(2);
    expect(result.totalPolicyKeysInLineage).toBe(3);
    expect(result.conflictCount).toBe(2);

    const deliveryConflict = result.conflicts.find(
      (entry: any) => entry.policyKey === "delivery.cutoff",
    );
    expect(deliveryConflict).toBeDefined();
    expect(deliveryConflict).toMatchObject({
      occurrences: 2,
      modeDivergence: true,
      versionDivergence: true,
    });
    expect(
      (deliveryConflict as any).definitions.map((entry: any) => entry.depth),
    ).toEqual([0, 1]);

    const pricingConflict = result.conflicts.find(
      (entry: any) => entry.policyKey === "pricing.rounding",
    );
    expect(pricingConflict).toBeDefined();
    expect(pricingConflict).toMatchObject({
      occurrences: 2,
      modeDivergence: false,
      versionDivergence: true,
    });
  });

  it("blocks policy upsert when enforceAncestorLocks is true and an ancestor lock exists", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "branch-1" }] })
        .mockResolvedValueOnce({
          rows: [{ unit_id: "hq-1", level: 2, version: 5 }],
        }),
    } as any;

    const service = new HqGovernanceService(pool);

    await expect(
      service.upsertPolicyBinding({
        merchantId: "m-1",
        unitId: "branch-1",
        policyKey: "delivery.cutoff",
        policyValue: { minutes: 20 },
        enforceAncestorLocks: true,
      }),
    ).rejects.toThrow(
      'Cannot upsert policyKey "delivery.cutoff" because ancestor unit hq-1 has LOCKED mode at version 5',
    );

    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("allows policy upsert with enforceAncestorLocks when no ancestor lock exists", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "branch-1" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next_version: "3" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "binding-1",
              unit_id: "branch-1",
              policy_key: "delivery.cutoff",
              policy_value: { minutes: 30 },
              inheritance_mode: "OVERRIDE",
              version: 3,
              is_active: true,
              created_by: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        }),
    } as any;

    const service = new HqGovernanceService(pool);
    const result = await service.upsertPolicyBinding({
      merchantId: "m-1",
      unitId: "branch-1",
      policyKey: "delivery.cutoff",
      policyValue: { minutes: 30 },
      enforceAncestorLocks: true,
    });

    expect(result.id).toBe("binding-1");
    expect(pool.query).toHaveBeenCalledTimes(4);
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("latest_policy_by_unit"),
      ["m-1", "branch-1", "delivery.cutoff", 20],
    );
  });

  it("keeps backward compatibility by skipping ancestor lock checks unless explicitly enabled", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "branch-1" }] })
        .mockResolvedValueOnce({ rows: [{ next_version: "1" }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "binding-legacy",
              unit_id: "branch-1",
              policy_key: "delivery.cutoff",
              policy_value: { minutes: 25 },
              inheritance_mode: "OVERRIDE",
              version: 1,
              is_active: true,
              created_by: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        }),
    } as any;

    const service = new HqGovernanceService(pool);
    const result = await service.upsertPolicyBinding({
      merchantId: "m-1",
      unitId: "branch-1",
      policyKey: "delivery.cutoff",
      policyValue: { minutes: 25 },
    });

    expect(result.id).toBe("binding-legacy");
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("COALESCE(MAX(version), 0) + 1"),
      ["m-1", "branch-1", "delivery.cutoff"],
    );
  });

  it("blocks createUnit when structure mutations are governance-locked in ancestor lineage", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "hq-1", unit_type: "HQ" }] })
        .mockResolvedValueOnce({
          rows: [{ unit_id: "hq-root", level: 2, version: 7 }],
        }),
    } as any;

    const service = new HqGovernanceService(pool);

    await expect(
      service.createUnit({
        merchantId: "m-1",
        unitType: "BRAND",
        name: "Brand A",
        code: "BRAND_A",
        parentId: "hq-1",
        enforceGovernanceLocks: true,
      }),
    ).rejects.toThrow(
      'Cannot create org unit because ancestor unit hq-root has LOCKED mode for policyKey "governance.structure_mutations" at version 7',
    );

    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("blocks moveUnit when structure mutations are governance-locked", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ id: "branch-1", unit_type: "BRANCH" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "region-1", unit_type: "REGION" }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ unit_id: "hq-root", level: 2, version: 9 }],
        }),
    } as any;

    const service = new HqGovernanceService(pool);

    await expect(
      service.moveUnit({
        merchantId: "m-1",
        unitId: "branch-1",
        newParentId: "region-1",
        enforceGovernanceLocks: true,
      }),
    ).rejects.toThrow(
      'Cannot move org unit because ancestor unit hq-root has LOCKED mode for policyKey "governance.structure_mutations" at version 9',
    );

    expect(pool.query).toHaveBeenCalledTimes(4);
  });

  it("blocks upsertStaffScope when staff-scope mutations are governance-locked", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "branch-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "staff-1" }] })
        .mockResolvedValueOnce({
          rows: [{ unit_id: "region-1", level: 1, version: 3 }],
        }),
    } as any;

    const service = new HqGovernanceService(pool);

    await expect(
      service.upsertStaffScope({
        merchantId: "m-1",
        unitId: "branch-1",
        staffId: "staff-1",
        roleScope: "MANAGER",
        enforceGovernanceLocks: true,
      }),
    ).rejects.toThrow(
      'Cannot upsert staff scope because ancestor unit region-1 has LOCKED mode for policyKey "governance.staff_scope_mutations" at version 3',
    );

    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it("blocks upsertPolicyBinding when policy mutations are governance-locked", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: "branch-1" }] })
        .mockResolvedValueOnce({
          rows: [{ unit_id: "hq-1", level: 2, version: 11 }],
        }),
    } as any;

    const service = new HqGovernanceService(pool);

    await expect(
      service.upsertPolicyBinding({
        merchantId: "m-1",
        unitId: "branch-1",
        policyKey: "delivery.cutoff",
        policyValue: { minutes: 20 },
        enforceGovernanceLocks: true,
      }),
    ).rejects.toThrow(
      'Cannot upsert policy binding because ancestor unit hq-1 has LOCKED mode for policyKey "governance.policy_mutations" at version 11',
    );

    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});
