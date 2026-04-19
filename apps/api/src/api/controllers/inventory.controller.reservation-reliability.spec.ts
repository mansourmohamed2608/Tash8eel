import { InventoryController } from "./inventory.controller";

describe("InventoryController reservation reliability", () => {
  function makeController(options?: {
    poolQueryImpl?: (
      sql: string,
      params?: unknown[],
    ) => Promise<{ rows: any[] }>;
    clientQueryImpl?: (
      sql: string,
      params?: unknown[],
    ) => Promise<{ rows: any[] }>;
  }) {
    const poolQuery = jest.fn(
      options?.poolQueryImpl || (async () => ({ rows: [] })),
    );
    const clientQuery = jest.fn(
      options?.clientQueryImpl || (async () => ({ rows: [] })),
    );
    const client = {
      query: clientQuery,
      release: jest.fn(),
    };

    const pool = {
      query: poolQuery,
      connect: jest.fn(async () => client),
    } as any;

    const webSocketService = {
      emit: jest.fn(),
    } as any;

    return {
      controller: new InventoryController(pool, webSocketService),
      poolQuery,
      clientQuery,
      connectMock: pool.connect as jest.Mock,
      releaseMock: client.release as jest.Mock,
    };
  }

  it("cleans up expired reservations before checking availability", async () => {
    const sqlCalls: string[] = [];

    const { controller, clientQuery, releaseMock } = makeController({
      clientQueryImpl: async (sql: string) => {
        sqlCalls.push(sql);

        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return { rows: [] };
        }

        if (
          sql.includes("COUNT(*)::int AS reservation_count") &&
          sql.includes("expires_at <= NOW()")
        ) {
          return {
            rows: [
              {
                variant_id: "variant-1",
                reservation_count: "1",
                quantity: "2",
              },
            ],
          };
        }

        if (
          sql.includes("UPDATE stock_reservations") &&
          sql.includes("SET status = 'expired'")
        ) {
          return { rows: [] };
        }

        if (
          sql.includes("UPDATE inventory_variants") &&
          sql.includes(
            "quantity_reserved = GREATEST(quantity_reserved - $1, 0)",
          )
        ) {
          return { rows: [] };
        }

        if (sql.includes("FROM warehouse_locations")) {
          return { rows: [] };
        }

        if (
          sql.includes("AND variant_id = $2") &&
          sql.includes("COALESCE(v.quantity_reserved, 0) <> art.total_reserved")
        ) {
          return { rows: [] };
        }

        if (
          sql.includes(
            "SELECT (quantity_on_hand - GREATEST(COALESCE(quantity_reserved, 0), 0))",
          )
        ) {
          return { rows: [{ quantity_available: 5 }] };
        }

        if (sql.includes("INSERT INTO stock_reservations")) {
          return { rows: [{ id: "res-1" }] };
        }

        if (
          sql.includes(
            "SET quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0), 0) + $1",
          )
        ) {
          return { rows: [] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    });

    const result = await controller.createReservation("merchant-1", {
      variantId: "variant-1",
      quantity: 1,
      expiresInMinutes: 15,
    });

    expect(result.success).toBe(true);
    expect(clientQuery).toHaveBeenCalled();
    expect(releaseMock).toHaveBeenCalledTimes(1);

    const expireSweepIndex = sqlCalls.findIndex(
      (sql) =>
        sql.includes("UPDATE stock_reservations") && sql.includes("expired"),
    );
    const availabilityCheckIndex = sqlCalls.findIndex((sql) =>
      sql.includes(
        "SELECT (quantity_on_hand - GREATEST(COALESCE(quantity_reserved, 0), 0))",
      ),
    );
    const variantSyncIndex = sqlCalls.findIndex(
      (sql) =>
        sql.includes("AND variant_id = $2") &&
        sql.includes("COALESCE(v.quantity_reserved, 0) <> art.total_reserved"),
    );

    expect(expireSweepIndex).toBeGreaterThanOrEqual(0);
    expect(availabilityCheckIndex).toBeGreaterThanOrEqual(0);
    expect(variantSyncIndex).toBeGreaterThanOrEqual(0);
    expect(expireSweepIndex).toBeLessThan(availabilityCheckIndex);
    expect(variantSyncIndex).toBeLessThan(availabilityCheckIndex);
  });

  it("confirms reservations with clamped decrements and variant-level reserved sync", async () => {
    const sqlCalls: string[] = [];

    const { controller } = makeController({
      clientQueryImpl: async (sql: string) => {
        sqlCalls.push(sql);

        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return { rows: [] };
        }

        if (sql.includes("SELECT * FROM stock_reservations")) {
          return {
            rows: [
              {
                id: "res-1",
                status: "active",
                quantity: "3",
                variant_id: "variant-1",
              },
            ],
          };
        }

        if (
          sql.includes("COUNT(*)::int AS reservation_count") &&
          sql.includes("expires_at <= NOW()")
        ) {
          return { rows: [] };
        }

        if (
          sql.includes("UPDATE stock_reservations") &&
          sql.includes("SET status = 'expired'")
        ) {
          return { rows: [] };
        }

        if (
          sql.includes("UPDATE stock_reservations") &&
          sql.includes("SET status = 'confirmed'")
        ) {
          return { rows: [] };
        }

        if (
          sql.includes("UPDATE inventory_variants") &&
          sql.includes(
            "quantity_on_hand = GREATEST(COALESCE(quantity_on_hand, 0) - $1, 0)",
          ) &&
          sql.includes(
            "quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0) - $1, 0)",
          )
        ) {
          return { rows: [] };
        }

        if (sql.includes("FROM warehouse_locations")) {
          return { rows: [] };
        }

        if (
          sql.includes("AND variant_id = $2") &&
          sql.includes("COALESCE(v.quantity_reserved, 0) <> art.total_reserved")
        ) {
          return { rows: [] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    });

    const result = await controller.confirmReservation("merchant-1", "res-1");

    expect(result).toEqual({ success: true, reservationId: "res-1" });
    expect(
      sqlCalls.some(
        (sql) =>
          sql.includes("SET status = 'confirmed'") &&
          sql.includes(
            "WHERE id = $1 AND merchant_id = $2 AND status = 'active'",
          ),
      ),
    ).toBe(true);
    expect(
      sqlCalls.some(
        (sql) =>
          sql.includes(
            "quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0) - $1, 0)",
          ) && sql.includes("WHERE id = $2 AND merchant_id = $3"),
      ),
    ).toBe(true);
    expect(
      sqlCalls.some(
        (sql) =>
          sql.includes("AND variant_id = $2") &&
          sql.includes(
            "COALESCE(v.quantity_reserved, 0) <> art.total_reserved",
          ),
      ),
    ).toBe(true);
  });

  it("releases reservations with clamped decrements and variant-level reserved sync", async () => {
    const sqlCalls: string[] = [];

    const { controller } = makeController({
      clientQueryImpl: async (sql: string) => {
        sqlCalls.push(sql);

        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return { rows: [] };
        }

        if (sql.includes("SELECT * FROM stock_reservations")) {
          return {
            rows: [
              {
                id: "res-1",
                status: "active",
                quantity: "2",
                variant_id: "variant-1",
              },
            ],
          };
        }

        if (
          sql.includes("COUNT(*)::int AS reservation_count") &&
          sql.includes("expires_at <= NOW()")
        ) {
          return { rows: [] };
        }

        if (
          sql.includes("UPDATE stock_reservations") &&
          sql.includes("SET status = 'expired'")
        ) {
          return { rows: [] };
        }

        if (
          sql.includes("UPDATE stock_reservations") &&
          sql.includes("SET status = 'released'")
        ) {
          return { rows: [] };
        }

        if (
          sql.includes("UPDATE inventory_variants") &&
          sql.includes(
            "SET quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0) - $1, 0)",
          )
        ) {
          return { rows: [] };
        }

        if (sql.includes("FROM warehouse_locations")) {
          return { rows: [] };
        }

        if (
          sql.includes("AND variant_id = $2") &&
          sql.includes("COALESCE(v.quantity_reserved, 0) <> art.total_reserved")
        ) {
          return { rows: [] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    });

    const result = await controller.releaseReservation("merchant-1", "res-1", {
      reason: "manual release",
    });

    expect(result).toEqual({ success: true, reservationId: "res-1" });
    expect(
      sqlCalls.some(
        (sql) =>
          sql.includes("SET status = 'released'") &&
          sql.includes(
            "WHERE id = $2 AND merchant_id = $3 AND status = 'active'",
          ),
      ),
    ).toBe(true);
    expect(
      sqlCalls.some(
        (sql) =>
          sql.includes(
            "SET quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0) - $1, 0)",
          ) && sql.includes("WHERE id = $2 AND merchant_id = $3"),
      ),
    ).toBe(true);
    expect(
      sqlCalls.some(
        (sql) =>
          sql.includes("AND variant_id = $2") &&
          sql.includes(
            "COALESCE(v.quantity_reserved, 0) <> art.total_reserved",
          ),
      ),
    ).toBe(true);
  });

  it("returns reservation reconciliation snapshot with drift details", async () => {
    const { controller, poolQuery } = makeController({
      poolQueryImpl: async (sql: string) => {
        if (sql.includes("reservation_stats AS")) {
          return {
            rows: [
              {
                total_variants: "4",
                active_reservations: "3",
                active_reservation_quantity: "8",
                expired_active_reservations: "1",
                expired_active_quantity: "2",
                total_variant_reserved: "10",
                drifted_variants: "2",
                total_drift_quantity: "3",
              },
            ],
          };
        }

        if (
          sql.includes("ORDER BY ABS(variant_reserved - expected_reserved)")
        ) {
          return {
            rows: [
              {
                variant_id: "v-1",
                variant_reserved: "5",
                expected_reserved: "3",
                delta: "2",
              },
              {
                variant_id: "v-2",
                variant_reserved: "2",
                expected_reserved: "1",
                delta: "1",
              },
            ],
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    });

    const result = await controller.getReservationReconciliation(
      "merchant-1",
      "true",
      "25",
    );

    expect(poolQuery).toHaveBeenCalledTimes(2);
    expect(result.summary).toMatchObject({
      totalVariants: 4,
      activeReservations: 3,
      activeReservationQuantity: 8,
      expiredActiveReservations: 1,
      expiredActiveQuantity: 2,
      totalVariantReserved: 10,
      driftedVariants: 2,
      totalDriftQuantity: 3,
    });
    expect(result.variantDrift).toEqual([
      {
        variantId: "v-1",
        variantReserved: 5,
        expectedReserved: 3,
        delta: 2,
      },
      {
        variantId: "v-2",
        variantReserved: 2,
        expectedReserved: 1,
        delta: 1,
      },
    ]);
  });

  it("applies reconciliation repair and returns before/after summaries", async () => {
    let summaryCall = 0;

    const { controller, clientQuery, releaseMock } = makeController({
      clientQueryImpl: async (sql: string) => {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          return { rows: [] };
        }

        if (sql.includes("reservation_stats AS")) {
          summaryCall += 1;
          if (summaryCall === 1) {
            return {
              rows: [
                {
                  total_variants: "4",
                  active_reservations: "3",
                  active_reservation_quantity: "8",
                  expired_active_reservations: "1",
                  expired_active_quantity: "2",
                  total_variant_reserved: "10",
                  drifted_variants: "2",
                  total_drift_quantity: "3",
                },
              ],
            };
          }

          return {
            rows: [
              {
                total_variants: "4",
                active_reservations: "2",
                active_reservation_quantity: "6",
                expired_active_reservations: "0",
                expired_active_quantity: "0",
                total_variant_reserved: "6",
                drifted_variants: "0",
                total_drift_quantity: "0",
              },
            ],
          };
        }

        if (
          sql.includes("COUNT(*)::int AS reservation_count") &&
          sql.includes("expires_at <= NOW()")
        ) {
          return {
            rows: [
              {
                variant_id: "v-1",
                reservation_count: "1",
                quantity: "2",
              },
            ],
          };
        }

        if (
          sql.includes("UPDATE stock_reservations") &&
          sql.includes("SET status = 'expired'")
        ) {
          return { rows: [] };
        }

        if (
          sql.includes("UPDATE inventory_variants") &&
          sql.includes(
            "quantity_reserved = GREATEST(quantity_reserved - $1, 0)",
          )
        ) {
          return { rows: [] };
        }

        if (sql.includes("FROM warehouse_locations")) {
          return { rows: [] };
        }

        if (
          sql.includes("UPDATE inventory_variants v") &&
          sql.includes("RETURNING v.id")
        ) {
          return { rows: [{ id: "v-1" }, { id: "v-2" }] };
        }

        if (
          sql.includes("ORDER BY ABS(variant_reserved - expected_reserved)")
        ) {
          return { rows: [] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      },
    });

    const result = await controller.repairReservationReconciliation(
      "merchant-1",
      {
        dryRun: false,
        includeVariantDetails: true,
        variantLimit: 25,
      },
    );

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.operations).toMatchObject({
      expiredReservationsReleased: 1,
      expiredQuantityReleased: 2,
      variantsAdjusted: 2,
    });
    expect(result.before).toMatchObject({
      driftedVariants: 2,
      expiredActiveReservations: 1,
    });
    expect(result.after).toMatchObject({
      driftedVariants: 0,
      expiredActiveReservations: 0,
    });
    expect(result.variantDrift).toEqual([]);
    expect(releaseMock).toHaveBeenCalledTimes(1);

    const commitCalls = clientQuery.mock.calls.filter(
      (call) => call[0] === "COMMIT",
    );
    expect(commitCalls).toHaveLength(1);

    const repairSyncCall = clientQuery.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("UPDATE inventory_variants v") &&
        call[0].includes("RETURNING v.id"),
    );
    expect(repairSyncCall?.[0]).toContain(
      "COALESCE(v.quantity_reserved, 0) <> er.expected_reserved",
    );
  });
});
