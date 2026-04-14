import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Pool, PoolClient, QueryResultRow } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { RedisService } from "../../infrastructure/redis/redis.service";

type QueryRowsResult<T extends QueryResultRow> = {
  rows: T[];
  rowCount: number;
};

@Injectable()
export class InventoryReservationReconciliationScheduler {
  private readonly logger = new Logger(
    InventoryReservationReconciliationScheduler.name,
  );
  private readonly jobName = "inventory-reservation-reconciliation";
  private readonly lockKey = "inventory-reservation-reconciliation-lock";
  private readonly lockTtl = 240_000; // 4 minutes
  private readonly lockSafetyWindowMs = 30_000;
  private readonly statementTimeoutMs = 45_000;
  private readonly lockTimeoutMs = 5_000;
  private readonly merchantBatchSize = 200;
  private savepointCounter = 0;
  private supportsReservationReleasedAtColumn: boolean | null = null;
  private supportsVariantUpdatedAtColumn: boolean | null = null;
  private supportsLocationUpdatedAtColumn: boolean | null = null;
  private supportsWarehouseLocationPriorityColumns: boolean | null = null;
  private supportsWarehouseLocationsTable: boolean | null = null;
  private supportsInventoryStockByLocationTable: boolean | null = null;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly redisService: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcileReservations(): Promise<void> {
    const runStartedAt = new Date();
    const runStartedAtMs = runStartedAt.getTime();
    const runDeadlineMs =
      runStartedAtMs + Math.max(this.lockTtl - this.lockSafetyWindowMs, 1_000);

    const lock = await this.redisService.acquireLock(
      this.lockKey,
      this.lockTtl,
    );
    if (!lock) {
      this.logger.debug({
        msg: "Could not acquire reservation reconciliation lock",
        jobName: this.jobName,
      });
      return;
    }

    let merchantsScanned = 0;
    let merchantsProcessed = 0;
    let merchantsChanged = 0;
    let merchantsFailed = 0;
    let merchantsSkippedForRuntimeBudget = 0;
    let totalExpiredReservations = 0;
    let totalReleasedQuantity = 0;
    let totalVariantsAdjusted = 0;

    try {
      const merchantIds = await this.loadCandidateMerchants();
      merchantsScanned = merchantIds.length;

      if (merchantIds.length === 0) {
        this.logger.debug({
          msg: "Reservation reconciliation found no merchants to process",
          jobName: this.jobName,
        });
        return;
      }

      for (const merchantId of merchantIds) {
        if (Date.now() >= runDeadlineMs) {
          merchantsSkippedForRuntimeBudget =
            merchantIds.length - merchantsProcessed;
          this.logger.warn({
            msg: "Reservation reconciliation stopped early due to lock runtime budget",
            jobName: this.jobName,
            merchantsProcessed,
            merchantsSkippedForRuntimeBudget,
            lockTtlMs: this.lockTtl,
          });
          break;
        }

        const result = await this.reconcileMerchant(merchantId, runStartedAt);
        merchantsProcessed += 1;
        if (!result) {
          merchantsFailed += 1;
          continue;
        }

        if (
          result.expiredReservations > 0 ||
          result.releasedQuantity > 0 ||
          result.variantsAdjusted > 0
        ) {
          merchantsChanged += 1;
        }
        totalExpiredReservations += result.expiredReservations;
        totalReleasedQuantity += result.releasedQuantity;
        totalVariantsAdjusted += result.variantsAdjusted;
      }

      const durationMs = Date.now() - runStartedAtMs;
      this.logger.log({
        msg: "Inventory reservation reconciliation completed",
        jobName: this.jobName,
        runStartedAt: runStartedAt.toISOString(),
        durationMs,
        merchantsScanned,
        merchantsProcessed,
        merchantsChanged,
        merchantsFailed,
        merchantsSkippedForRuntimeBudget,
        expiredReservationsReleased: totalExpiredReservations,
        releasedQuantity: totalReleasedQuantity,
        variantsAdjusted: totalVariantsAdjusted,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error({
        msg: "Inventory reservation reconciliation failed",
        jobName: this.jobName,
        runStartedAt: runStartedAt.toISOString(),
        durationMs: Date.now() - runStartedAtMs,
        merchantsScanned,
        merchantsProcessed,
        merchantsFailed,
        error: err.message,
        stack: err.stack,
      });
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  private async loadCandidateMerchants(): Promise<string[]> {
    try {
      const result = await this.pool.query<{ merchant_id: string }>(
        `SELECT merchant_id
         FROM (
           SELECT DISTINCT merchant_id
           FROM stock_reservations
           WHERE status = 'active'
           UNION
           SELECT DISTINCT merchant_id
           FROM inventory_variants
           WHERE COALESCE(quantity_reserved, 0) > 0
         ) merchant_candidates
         ORDER BY merchant_id
         LIMIT $1`,
        [this.merchantBatchSize],
      );

      return result.rows.map((row) => row.merchant_id);
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        return [];
      }
      throw error;
    }
  }

  private async reconcileMerchant(
    merchantId: string,
    asOf: Date,
  ): Promise<{
    expiredReservations: number;
    releasedQuantity: number;
    variantsAdjusted: number;
  } | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL statement_timeout = '${this.statementTimeoutMs}ms'`,
      );
      await client.query(`SET LOCAL lock_timeout = '${this.lockTimeoutMs}ms'`);

      const expired = await this.releaseExpiredReservations(
        client,
        merchantId,
        asOf,
      );
      const variantsAdjusted =
        await this.syncVariantReservedAgainstActiveReservations(
          client,
          merchantId,
          asOf,
        );
      await client.query("COMMIT");

      return {
        expiredReservations: expired.expiredReservations,
        releasedQuantity: expired.releasedQuantity,
        variantsAdjusted,
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        this.logger.error({
          msg: "Reservation reconciliation rollback failed",
          merchantId,
          error: (rollbackError as Error).message,
        });
      }

      this.logger.warn({
        msg: "Reservation reconciliation failed for merchant",
        merchantId,
        error: (error as Error).message,
      });
      return null;
    } finally {
      client.release();
    }
  }

  private async releaseExpiredReservations(
    client: PoolClient,
    merchantId: string,
    asOf: Date,
  ): Promise<{
    expiredReservations: number;
    releasedQuantity: number;
  }> {
    const expiredAgg = await this.queryWithSchemaFallback<{
      variant_id: string;
      reservation_count: number;
      quantity: number;
    }>(
      client,
      `SELECT
         variant_id,
         COUNT(*)::int AS reservation_count,
         COALESCE(SUM(quantity), 0)::int AS quantity
       FROM stock_reservations
       WHERE merchant_id = $1
         AND status = 'active'
         AND expires_at <= $2
       GROUP BY variant_id`,
      [merchantId, asOf],
      "select-expired-reservations",
    );

    if (!expiredAgg || expiredAgg.rows.length === 0) {
      return {
        expiredReservations: 0,
        releasedQuantity: 0,
      };
    }

    await this.markReservationsExpired(client, merchantId, asOf);

    const locationId = await this.resolvePreferredLocationId(
      client,
      merchantId,
    );

    let releasedQuantity = 0;
    let expiredReservations = 0;

    for (const row of expiredAgg.rows) {
      const variantReleased = Number(row.quantity || 0);
      const reservationCount = Number(row.reservation_count || 0);
      releasedQuantity += variantReleased;
      expiredReservations += reservationCount;

      if (variantReleased <= 0) continue;

      await this.adjustVariantReservedQuantity(
        client,
        merchantId,
        row.variant_id,
        variantReleased,
      );

      if (locationId) {
        await this.adjustLocationReservedQuantity(
          client,
          merchantId,
          row.variant_id,
          locationId,
          variantReleased,
        );
      }
    }

    return {
      expiredReservations,
      releasedQuantity,
    };
  }

  private async syncVariantReservedAgainstActiveReservations(
    client: PoolClient,
    merchantId: string,
    asOf: Date,
  ): Promise<number> {
    const params = [merchantId, asOf];
    const withUpdatedAtSql = `WITH active_reservation_totals AS (
         SELECT variant_id, COALESCE(SUM(quantity), 0)::int AS total_reserved
         FROM stock_reservations
         WHERE merchant_id = $1 AND status = 'active' AND expires_at > $2
         GROUP BY variant_id
       ),
       expected_reserved AS (
         SELECT
           v.id AS variant_id,
           GREATEST(COALESCE(art.total_reserved, 0), 0)::int AS expected_reserved
         FROM inventory_variants v
         LEFT JOIN active_reservation_totals art ON art.variant_id = v.id
         WHERE v.merchant_id = $1
       )
       UPDATE inventory_variants v
       SET quantity_reserved = er.expected_reserved,
           updated_at = NOW()
       FROM expected_reserved er
       WHERE v.id = er.variant_id
         AND v.merchant_id = $1
         AND GREATEST(COALESCE(v.quantity_reserved, 0), 0) <> er.expected_reserved
       RETURNING v.id`;
    const legacySql = `WITH active_reservation_totals AS (
         SELECT variant_id, COALESCE(SUM(quantity), 0)::int AS total_reserved
         FROM stock_reservations
         WHERE merchant_id = $1 AND status = 'active' AND expires_at > $2
         GROUP BY variant_id
       ),
       expected_reserved AS (
         SELECT
           v.id AS variant_id,
           GREATEST(COALESCE(art.total_reserved, 0), 0)::int AS expected_reserved
         FROM inventory_variants v
         LEFT JOIN active_reservation_totals art ON art.variant_id = v.id
         WHERE v.merchant_id = $1
       )
       UPDATE inventory_variants v
       SET quantity_reserved = er.expected_reserved
       FROM expected_reserved er
       WHERE v.id = er.variant_id
         AND v.merchant_id = $1
         AND GREATEST(COALESCE(v.quantity_reserved, 0), 0) <> er.expected_reserved
       RETURNING v.id`;

    if (this.supportsVariantUpdatedAtColumn === false) {
      const legacyResult = await this.queryWithSchemaFallback<{ id: string }>(
        client,
        legacySql,
        params,
        "sync-variant-reserved-legacy",
      );
      return legacyResult?.rowCount ?? 0;
    }

    const preferredResult = await this.queryWithSchemaFallback<{ id: string }>(
      client,
      withUpdatedAtSql,
      params,
      "sync-variant-reserved-with-updated-at",
    );

    if (preferredResult) {
      this.supportsVariantUpdatedAtColumn = true;
      return preferredResult.rowCount;
    }

    this.supportsVariantUpdatedAtColumn = false;
    const legacyResult = await this.queryWithSchemaFallback<{ id: string }>(
      client,
      legacySql,
      params,
      "sync-variant-reserved-legacy",
    );
    return legacyResult?.rowCount ?? 0;
  }

  private async markReservationsExpired(
    client: PoolClient,
    merchantId: string,
    asOf: Date,
  ): Promise<void> {
    const params = [merchantId, asOf];
    const withReleasedAtSql = `UPDATE stock_reservations
       SET status = 'expired',
           released_at = NOW()
       WHERE merchant_id = $1
         AND status = 'active'
         AND expires_at <= $2`;
    const legacySql = `UPDATE stock_reservations
       SET status = 'expired'
       WHERE merchant_id = $1
         AND status = 'active'
         AND expires_at <= $2`;

    if (this.supportsReservationReleasedAtColumn === false) {
      await this.queryWithSchemaFallback(
        client,
        legacySql,
        params,
        "expire-reservations-legacy",
      );
      return;
    }

    const preferredResult = await this.queryWithSchemaFallback(
      client,
      withReleasedAtSql,
      params,
      "expire-reservations-with-released-at",
    );
    if (preferredResult) {
      this.supportsReservationReleasedAtColumn = true;
      return;
    }

    this.supportsReservationReleasedAtColumn = false;
    await this.queryWithSchemaFallback(
      client,
      legacySql,
      params,
      "expire-reservations-legacy",
    );
  }

  private async resolvePreferredLocationId(
    client: PoolClient,
    merchantId: string,
  ): Promise<string | null> {
    if (this.supportsWarehouseLocationsTable === false) {
      return null;
    }

    const prioritySql = `SELECT id
       FROM warehouse_locations
       WHERE merchant_id = $1 AND is_active = true
       ORDER BY is_default DESC, created_at ASC
       LIMIT 1`;
    const fallbackSql = `SELECT id
       FROM warehouse_locations
       WHERE merchant_id = $1 AND is_active = true
       ORDER BY id ASC
       LIMIT 1`;

    if (this.supportsWarehouseLocationPriorityColumns === false) {
      const fallbackResult = await this.queryWithSchemaFallback<{ id: string }>(
        client,
        fallbackSql,
        [merchantId],
        "resolve-warehouse-location-fallback",
      );
      if (!fallbackResult) {
        this.supportsWarehouseLocationsTable = false;
        return null;
      }

      this.supportsWarehouseLocationsTable = true;
      return fallbackResult.rows[0]?.id ?? null;
    }

    const preferredResult = await this.queryWithSchemaFallback<{ id: string }>(
      client,
      prioritySql,
      [merchantId],
      "resolve-warehouse-location-priority",
    );

    if (preferredResult) {
      this.supportsWarehouseLocationPriorityColumns = true;
      this.supportsWarehouseLocationsTable = true;
      return preferredResult.rows[0]?.id ?? null;
    }

    this.supportsWarehouseLocationPriorityColumns = false;
    const fallbackResult = await this.queryWithSchemaFallback<{ id: string }>(
      client,
      fallbackSql,
      [merchantId],
      "resolve-warehouse-location-fallback",
    );
    if (!fallbackResult) {
      this.supportsWarehouseLocationsTable = false;
      return null;
    }

    this.supportsWarehouseLocationsTable = true;
    return fallbackResult.rows[0]?.id ?? null;
  }

  private async adjustVariantReservedQuantity(
    client: PoolClient,
    merchantId: string,
    variantId: string,
    releasedQuantity: number,
  ): Promise<void> {
    const params = [releasedQuantity, merchantId, variantId];
    const withUpdatedAtSql = `UPDATE inventory_variants
       SET quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0) - $1, 0),
           updated_at = NOW()
       WHERE merchant_id = $2 AND id = $3`;
    const legacySql = `UPDATE inventory_variants
       SET quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0) - $1, 0)
       WHERE merchant_id = $2 AND id = $3`;

    if (this.supportsVariantUpdatedAtColumn === false) {
      await this.queryWithSchemaFallback(
        client,
        legacySql,
        params,
        "adjust-variant-reserved-legacy",
      );
      return;
    }

    const preferredResult = await this.queryWithSchemaFallback(
      client,
      withUpdatedAtSql,
      params,
      "adjust-variant-reserved-with-updated-at",
    );

    if (preferredResult) {
      this.supportsVariantUpdatedAtColumn = true;
      return;
    }

    this.supportsVariantUpdatedAtColumn = false;
    await this.queryWithSchemaFallback(
      client,
      legacySql,
      params,
      "adjust-variant-reserved-legacy",
    );
  }

  private async adjustLocationReservedQuantity(
    client: PoolClient,
    merchantId: string,
    variantId: string,
    locationId: string,
    releasedQuantity: number,
  ): Promise<void> {
    if (this.supportsInventoryStockByLocationTable === false) {
      return;
    }

    const params = [releasedQuantity, merchantId, variantId, locationId];
    const withUpdatedAtSql = `UPDATE inventory_stock_by_location
       SET quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0) - $1, 0),
           updated_at = NOW()
       WHERE merchant_id = $2 AND variant_id = $3 AND location_id = $4`;
    const legacySql = `UPDATE inventory_stock_by_location
       SET quantity_reserved = GREATEST(COALESCE(quantity_reserved, 0) - $1, 0)
       WHERE merchant_id = $2 AND variant_id = $3 AND location_id = $4`;

    if (this.supportsLocationUpdatedAtColumn === false) {
      const legacyResult = await this.queryWithSchemaFallback(
        client,
        legacySql,
        params,
        "adjust-location-reserved-legacy",
      );
      if (!legacyResult) {
        this.supportsInventoryStockByLocationTable = false;
      } else {
        this.supportsInventoryStockByLocationTable = true;
      }
      return;
    }

    const preferredResult = await this.queryWithSchemaFallback(
      client,
      withUpdatedAtSql,
      params,
      "adjust-location-reserved-with-updated-at",
    );

    if (preferredResult) {
      this.supportsLocationUpdatedAtColumn = true;
      this.supportsInventoryStockByLocationTable = true;
      return;
    }

    this.supportsLocationUpdatedAtColumn = false;
    const legacyResult = await this.queryWithSchemaFallback(
      client,
      legacySql,
      params,
      "adjust-location-reserved-legacy",
    );
    if (!legacyResult) {
      this.supportsInventoryStockByLocationTable = false;
    } else {
      this.supportsInventoryStockByLocationTable = true;
    }
  }

  private async queryWithSchemaFallback<T extends QueryResultRow>(
    client: PoolClient,
    sql: string,
    params: unknown[],
    operation: string,
  ): Promise<QueryRowsResult<T> | null> {
    const savepoint = this.nextSavepointName();
    await client.query(`SAVEPOINT ${savepoint}`);

    try {
      const result = await client.query<T>(sql, params);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? result.rows.length,
      };
    } catch (error) {
      await this.rollbackSavepoint(client, savepoint);

      if (this.isSchemaCompatibilityError(error)) {
        this.logger.debug({
          msg: "Reservation reconciliation skipped schema-incompatible operation",
          operation,
          errorCode: (error as { code?: string }).code,
          error: (error as Error).message,
        });
        return null;
      }

      throw error;
    }
  }

  private async rollbackSavepoint(
    client: PoolClient,
    savepoint: string,
  ): Promise<void> {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    } finally {
      try {
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch {
        // No-op: savepoint is best-effort cleanup.
      }
    }
  }

  private nextSavepointName(): string {
    this.savepointCounter += 1;
    return `inv_res_reconcile_sp_${this.savepointCounter}`;
  }

  private isSchemaCompatibilityError(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    return code === "42P01" || code === "42703";
  }
}
