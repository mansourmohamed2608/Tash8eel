import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { createLogger } from "../logging/logger";

const logger = createLogger("AiMetricsService");

export interface AiMetricParams {
  serviceName: string;
  methodName: string;
  merchantId?: string | null;
  outcome: "success" | "error" | "budget_exceeded" | "timeout";
  tokensUsed?: number;
  latencyMs?: number;
}

@Injectable()
export class AiMetricsService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  async record(params: AiMetricParams): Promise<void> {
    // merchant_id column is uuid — only pass valid UUIDs, otherwise store NULL
    const merchantId =
      params.merchantId && AiMetricsService.UUID_RE.test(params.merchantId)
        ? params.merchantId
        : null;
    try {
      await this.pool.query(
        `INSERT INTO ai_call_metrics
           (service_name, method_name, merchant_id, outcome, tokens_used, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          params.serviceName,
          params.methodName,
          merchantId,
          params.outcome,
          params.tokensUsed ?? null,
          params.latencyMs ?? null,
        ],
      );
    } catch (err) {
      // Non-fatal: metrics must never crash the caller
      logger.warn("Failed to record AI metric", { err, params });
    }
  }
}
