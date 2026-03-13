import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

/**
 * Idempotency service — BL-007
 *
 * Prevents duplicate side-effects when AI mutation endpoints are retried.
 * Uses the `idempotency_records` table (created in migration 080).
 *
 * Callers should:
 *  1. Call `checkKey` — if non-null, return the cached response immediately.
 *  2. Execute the operation.
 *  3. Call `storeKey` with the response so retries hit the cache.
 *
 * Keys expire after 24 hours (configurable via DB default).
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * Return the previously stored response for this key, or null if the key is new.
   */
  async checkKey(key: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.pool.query<{
        response_body: Record<string, unknown>;
      }>(
        `SELECT response_body
         FROM idempotency_records
         WHERE key = $1 AND expires_at > NOW()`,
        [key],
      );
      return result.rows[0]?.response_body ?? null;
    } catch {
      return null; // non-fatal — table may not exist yet
    }
  }

  /**
   * Persist the response for a key.  ON CONFLICT DO NOTHING guards against races.
   */
  async storeKey(
    key: string,
    merchantId: string,
    responseBody: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO idempotency_records (key, merchant_id, response_body)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [key, merchantId, JSON.stringify(responseBody)],
      );
    } catch {
      /* non-fatal */
    }
  }
}
