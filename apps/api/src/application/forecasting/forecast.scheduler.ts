import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { ForecastEngineService } from "./forecast-engine.service";

const LOCK_KEY = "forecast-scheduler-lock";
const LOCK_TTL = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class ForecastScheduler {
  private readonly logger = new Logger(ForecastScheduler.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly redisService: RedisService,
    private readonly forecastEngine: ForecastEngineService,
  ) {}

  /**
   * Nightly at 02:00 — compute all forecast types for every active merchant
   */
  @Cron("0 2 * * *")
  async runNightlyForecastCycle(): Promise<void> {
    const lock = await this.redisService.acquireLock(LOCK_KEY, LOCK_TTL);
    if (!lock) {
      this.logger.debug("Forecast scheduler already running, skipping.");
      return;
    }

    try {
      const merchantsResult = await this.pool.query(
        `SELECT id FROM merchants WHERE is_active = true ORDER BY id`,
      );

      this.logger.log(`ForecastScheduler: running for ${merchantsResult.rows.length} merchants`);

      for (const { id: merchantId } of merchantsResult.rows) {
        await this.runForMerchant(merchantId);
      }

      this.logger.log("ForecastScheduler: completed nightly cycle");
    } catch (err) {
      this.logger.error("ForecastScheduler fatal error", err);
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  async runForMerchant(merchantId: string): Promise<void> {
    //
    // 1. Demand forecasts
    //
    await this.runWithTracking(merchantId, "demand", async () => {
      const results = await this.forecastEngine.computeDemandForecast(merchantId);
      await this.forecastEngine.persistDemandForecasts(merchantId, results);
      return results.length;
    });

    //
    // 2. Backtest / model metrics
    //
    await this.runWithTracking(merchantId, "backtest", async () => {
      const metrics = await this.forecastEngine.backtestDemand(merchantId);
      if (metrics.sampleSize > 0) {
        await this.forecastEngine.saveModelMetrics(merchantId, "demand", metrics);
      }
      return metrics.sampleSize;
    });

    //
    // 3. Churn forecast — write to forecast_predictions
    //
    await this.runWithTracking(merchantId, "churn", async () => {
      const items = await this.forecastEngine.computeChurnForecast(merchantId, 100);
      if (items.length === 0) return 0;
      // Bulk upsert as forecast_predictions
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        for (const item of items) {
          await client.query(
            `INSERT INTO forecast_predictions
               (merchant_id, forecast_type, entity_id, horizon_days,
                predicted_value, confidence_score, trend_direction,
                reason_codes, metadata)
             VALUES ($1,'churn',$2,30,$3,$4,'down',$5::jsonb,$6::jsonb)`,
            [
              merchantId, item.customerId, item.churnProbability * 100,
              item.churnProbability,
              JSON.stringify([{ code: item.riskLevel, label: item.riskLevel }]),
              JSON.stringify({ daysSinceLast: item.daysSinceLastOrder, ltv: item.lifetimeValue, action: item.recommendedAction }),
            ],
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      return items.length;
    });

    //
    // 4. SLA breach forecast
    //
    await this.runWithTracking(merchantId, "sla_breach", async () => {
      const items = await this.forecastEngine.computeSlaBreachForecast(merchantId);
      return items.length;
    });

    //
    // 5. Workforce load forecast
    //
    await this.runWithTracking(merchantId, "workforce_load", async () => {
      await this.forecastEngine.computeWorkforceLoadForecast(merchantId);
      return 1;
    });
  }

  // Run a named forecast step, record timing + errors in forecast_runs
  private async runWithTracking(
    merchantId: string,
    type: string,
    fn: () => Promise<number>,
  ): Promise<void> {
    const t0 = Date.now();
    try {
      const itemCount = await fn();
      await this.forecastEngine.recordForecastRun(merchantId, type, itemCount, Date.now() - t0);
    } catch (err: any) {
      this.logger.warn(`Forecast type=${type} merchant=${merchantId} failed: ${err?.message}`);
      await this.forecastEngine.recordForecastRun(merchantId, type, 0, Date.now() - t0, String(err?.message ?? err));
    }
  }
}
