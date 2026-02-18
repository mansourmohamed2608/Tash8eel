import { Injectable, Inject, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../infrastructure/database.module";

/**
 * Proactive Alerts Scheduler
 *
 * Runs every 2 hours to detect cross-agent conditions:
 * 1. demand_spike_low_stock — demand spiking AND stock low (Inventory + Ops cross-agent)
 * 2. perishable_expiry — items expiring within threshold days
 * 3. cash_flow_warning — projected cash flow deficit in next 14 days
 *
 * Fires IN_APP + PUSH notifications via the notifications table.
 * Uses `proactive_alert_configs` per merchant for thresholds; falls back to defaults.
 */
@Injectable()
export class ProactiveAlertsSchedulerService {
  private readonly logger = new Logger(ProactiveAlertsSchedulerService.name);
  private hasProactiveConfigTable: boolean | null = null;

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private orderAmountExpr(alias: string): string {
    return `COALESCE(
      NULLIF((to_jsonb(${alias})->>'total'), '')::numeric,
      NULLIF((to_jsonb(${alias})->>'total_amount'), '')::numeric,
      0
    )`;
  }

  // Run every 2 hours
  @Cron("0 */2 * * *")
  async runProactiveAlerts(): Promise<void> {
    this.logger.log("Starting proactive alerts scan...");

    try {
      const merchants = await this.pool.query(
        `SELECT id, name FROM merchants WHERE is_active = true`,
      );

      let totalAlerts = 0;
      for (const merchant of merchants.rows) {
        try {
          const alerts = await this.checkMerchantAlerts(
            merchant.id,
            merchant.name,
          );
          totalAlerts += alerts;
        } catch (error) {
          this.logger.error(
            `Proactive alerts failed for merchant ${merchant.id}: ${error}`,
          );
        }
      }

      this.logger.log(
        `Proactive alerts completed. ${totalAlerts} alerts created.`,
      );
    } catch (error) {
      this.logger.error(`Proactive alerts scheduler error: ${error}`);
    }
  }

  private async checkMerchantAlerts(
    merchantId: string,
    merchantName: string,
  ): Promise<number> {
    let alertCount = 0;

    // Load merchant-specific config (or use defaults)
    let config: Record<string, any> = {};
    try {
      if (this.hasProactiveConfigTable === null) {
        const tableCheck = await this.pool.query(
          `SELECT to_regclass('public.proactive_alert_configs') as table_name`,
        );
        this.hasProactiveConfigTable = !!tableCheck.rows[0]?.table_name;
      }

      if (!this.hasProactiveConfigTable) {
        config = {};
      } else {
        const configResult = await this.pool.query(
          `SELECT * FROM proactive_alert_configs WHERE merchant_id = $1 LIMIT 1`,
          [merchantId],
        );
        config = configResult.rows[0] || {};
      }
    } catch (error: any) {
      if (error?.code !== "42P01") {
        throw error;
      }
      // Table is optional; defaults keep scheduler functional in lean schemas.
      this.hasProactiveConfigTable = false;
      config = {};
    }
    const expiryThresholdDays = config.expiry_threshold_days ?? 7;
    const cashFlowForecastDays = config.cash_flow_forecast_days ?? 14;
    const demandSpikeMultiplier = config.demand_spike_multiplier ?? 2.0;

    // ─── 1. Demand Spike + Low Stock (Cross-Agent) ──────────────
    alertCount += await this.checkDemandSpikeLowStock(
      merchantId,
      merchantName,
      demandSpikeMultiplier,
    );

    // ─── 2. Perishable Expiry ───────────────────────────────────
    alertCount += await this.checkPerishableExpiry(
      merchantId,
      merchantName,
      expiryThresholdDays,
    );

    // ─── 3. Cash Flow Warning ───────────────────────────────────
    alertCount += await this.checkCashFlowWarning(
      merchantId,
      merchantName,
      cashFlowForecastDays,
    );

    return alertCount;
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. DEMAND SPIKE + LOW STOCK
  // Items where recent order velocity > N× average AND stock is below reorder point
  // ═══════════════════════════════════════════════════════════════
  private async checkDemandSpikeLowStock(
    merchantId: string,
    merchantName: string,
    spikeMultiplier: number,
  ): Promise<number> {
    try {
      const result = await this.pool.query(
        `WITH order_item_daily AS (
           SELECT
             LOWER(COALESCE(NULLIF(item->>'sku', ''), NULLIF(item->>'productSku', ''), NULLIF(item->>'product_sku', ''))) as sku,
             DATE(o.created_at) as d,
             SUM(
               CASE
                 WHEN (item->>'quantity') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (item->>'quantity')::numeric
                 WHEN (item->>'qty') ~ '^[0-9]+(\\.[0-9]+)?$' THEN (item->>'qty')::numeric
                 ELSE 1
               END
             ) as daily_qty
           FROM orders o
           CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) item
           WHERE o.merchant_id = $1
             AND o.status NOT IN ('CANCELLED', 'DRAFT')
             AND o.created_at >= NOW() - INTERVAL '30 days'
           GROUP BY LOWER(COALESCE(NULLIF(item->>'sku', ''), NULLIF(item->>'productSku', ''), NULLIF(item->>'product_sku', ''))), DATE(o.created_at)
         ),
         daily_avg AS (
           SELECT sku, AVG(daily_qty) as avg_daily
           FROM order_item_daily
           WHERE d < CURRENT_DATE - INTERVAL '2 days'
             AND sku IS NOT NULL AND sku <> ''
           GROUP BY sku
         ),
         recent_avg AS (
           SELECT sku, AVG(daily_qty) as recent_daily
           FROM order_item_daily
           WHERE d >= CURRENT_DATE - INTERVAL '2 days'
             AND sku IS NOT NULL AND sku <> ''
           GROUP BY sku
         )
        SELECT 
          iv.id as variant_id,
          COALESCE(NULLIF(ci.name_ar, ''), NULLIF(ci.name_en, ''), ii.sku, iv.sku, 'منتج') as item_name,
          iv.name as variant_name,
          iv.quantity_on_hand,
          iv.low_stock_threshold,
          COALESCE(da.avg_daily, 0) as avg_daily,
          COALESCE(ra.recent_daily, 0) as recent_daily
        FROM inventory_variants iv
        JOIN inventory_items ii ON ii.id = iv.inventory_item_id
        LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id
        LEFT JOIN daily_avg da ON da.sku = LOWER(COALESCE(ii.sku, iv.sku, ci.sku, ''))
        LEFT JOIN recent_avg ra ON ra.sku = LOWER(COALESCE(ii.sku, iv.sku, ci.sku, ''))
        WHERE iv.merchant_id = $1
          AND COALESCE(ra.recent_daily, 0) > COALESCE(da.avg_daily, 0) * $2
          AND COALESCE(da.avg_daily, 0) > 0
          AND iv.quantity_on_hand <= COALESCE(iv.low_stock_threshold, 5)
        LIMIT 10`,
        [merchantId, spikeMultiplier],
      );

      if (result.rows.length > 0) {
        const items = result.rows
          .map((r) => r.item_name || r.variant_name)
          .slice(0, 3)
          .join("، ");
        const count = result.rows.length;
        await this.createAlert(
          merchantId,
          "DEMAND_SPIKE_LOW_STOCK",
          `⚠️ ${count} منتج: طلب متزايد ومخزون منخفض`,
          `المنتجات التالية تشهد طلب أعلى من المعتاد مع مخزون ينفد: ${items}. أعد التوريد فوراً.`,
        );
        return 1;
      }
    } catch (error) {
      this.logger.warn(`Demand spike check failed for ${merchantId}: ${error}`);
    }
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. PERISHABLE EXPIRY
  // Items with expiry_date within threshold days
  // ═══════════════════════════════════════════════════════════════
  private async checkPerishableExpiry(
    merchantId: string,
    merchantName: string,
    thresholdDays: number,
  ): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT ci.id,
                COALESCE(NULLIF(ci.name_ar, ''), NULLIF(ci.name_en, ''), ci.sku, 'منتج') as name,
                ci.expiry_date,
                (ci.expiry_date - CURRENT_DATE) as days_until_expiry,
                COALESCE(
                  (SELECT SUM(iv.quantity_on_hand)
                   FROM inventory_variants iv
                   JOIN inventory_items ii ON ii.id = iv.inventory_item_id
                   WHERE ii.catalog_item_id = ci.id AND iv.merchant_id = $1),
                  0
                ) as total_stock
         FROM catalog_items ci
         WHERE ci.merchant_id = $1
           AND ci.expiry_date IS NOT NULL
           AND ci.expiry_date <= CURRENT_DATE + make_interval(days := $2)
           AND ci.expiry_date >= CURRENT_DATE
           AND ci.is_active = true
         ORDER BY ci.expiry_date ASC
         LIMIT 20`,
        [merchantId, thresholdDays],
      );

      if (result.rows.length > 0) {
        const critical = result.rows.filter(
          (r) => parseInt(r.days_until_expiry) <= 3,
        );
        const warning = result.rows.filter(
          (r) => parseInt(r.days_until_expiry) > 3,
        );
        const items = result.rows
          .slice(0, 3)
          .map((r) => `${r.name} (${r.days_until_expiry} يوم)`)
          .join("، ");

        // Also upsert per-item expiry alerts for the detailed view
        for (const item of result.rows) {
          const alertType =
            parseInt(item.days_until_expiry) <= 0
              ? "EXPIRED"
              : parseInt(item.days_until_expiry) <= 3
                ? "CRITICAL"
                : parseInt(item.days_until_expiry) <= 7
                  ? "WARNING"
                  : "APPROACHING";

          await this.pool.query(
            `INSERT INTO expiry_alerts (merchant_id, item_id, expiry_date, alert_type, days_until_expiry, quantity_at_risk)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [
              merchantId,
              item.id,
              item.expiry_date,
              alertType,
              item.days_until_expiry,
              item.total_stock,
            ],
          );
        }

        await this.createAlert(
          merchantId,
          "PERISHABLE_EXPIRY",
          `🔴 ${critical.length} منتج قارب انتهاء الصلاحية، ${warning.length} تحذير`,
          `منتجات قاربت من انتهاء الصلاحية: ${items}. راجع صفحة تنبيهات الصلاحية.`,
        );
        return 1;
      }
    } catch (error) {
      this.logger.warn(
        `Perishable expiry check failed for ${merchantId}: ${error}`,
      );
    }
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. CASH FLOW WARNING
  // Projects income vs expenses forward N days; alerts if deficit
  // ═══════════════════════════════════════════════════════════════
  private async checkCashFlowWarning(
    merchantId: string,
    merchantName: string,
    forecastDays: number,
  ): Promise<number> {
    try {
      const orderAmountExpr = this.orderAmountExpr("o");
      // Average daily revenue (last 30 days)
      const revenueResult = await this.pool.query(
        `SELECT COALESCE(AVG(daily_rev), 0) as avg_daily_revenue
         FROM (
           SELECT DATE(o.created_at) as d, SUM(${orderAmountExpr}) as daily_rev
           FROM orders o
           WHERE o.merchant_id = $1 AND o.status = 'DELIVERED'
             AND o.created_at >= NOW() - INTERVAL '30 days'
           GROUP BY DATE(o.created_at)
         ) dr`,
        [merchantId],
      );
      const avgDailyRevenue = parseFloat(
        revenueResult.rows[0]?.avg_daily_revenue || "0",
      );

      // Average daily expenses (last 30 days) — prefer normalized expense_date schema.
      let expenseResult;
      try {
        expenseResult = await this.pool.query(
          `SELECT COALESCE(AVG(daily_exp), 0) as avg_daily_expense
           FROM (
             SELECT DATE(expense_date) as d, SUM(amount) as daily_exp
             FROM expenses
             WHERE merchant_id = $1
               AND expense_date >= NOW() - INTERVAL '30 days'
             GROUP BY DATE(expense_date)
           ) de`,
          [merchantId],
        );
      } catch (error: any) {
        if (error?.code !== "42703") {
          throw error;
        }
        expenseResult = await this.pool.query(
          `SELECT COALESCE(AVG(daily_exp), 0) as avg_daily_expense
           FROM (
             SELECT DATE(date) as d, SUM(amount) as daily_exp
             FROM expenses
             WHERE merchant_id = $1
               AND COALESCE(status, 'APPROVED') != 'REJECTED'
               AND date >= NOW() - INTERVAL '30 days'
             GROUP BY DATE(date)
           ) de`,
          [merchantId],
        );
      }
      const avgDailyExpense = parseFloat(
        expenseResult.rows[0]?.avg_daily_expense || "0",
      );

      // Pending COD (uncollected cash on delivery)
      const codResult = await this.pool.query(
        `SELECT COALESCE(SUM(${orderAmountExpr}), 0) as pending_cod
         FROM orders o
         WHERE o.merchant_id = $1 AND o.payment_method = 'COD'
           AND o.payment_status = 'PENDING' AND o.status = 'DELIVERED'`,
        [merchantId],
      );
      const pendingCod = parseFloat(codResult.rows[0]?.pending_cod || "0");

      const projectedNet = (avgDailyRevenue - avgDailyExpense) * forecastDays;
      const projectedBalance = projectedNet - pendingCod;

      if (projectedBalance < 0 && avgDailyExpense > 0) {
        const deficit = Math.abs(projectedBalance);
        const daysUntilDeficit =
          avgDailyExpense > avgDailyRevenue
            ? Math.ceil(pendingCod / (avgDailyExpense - avgDailyRevenue))
            : forecastDays;

        await this.createAlert(
          merchantId,
          "CASH_FLOW_WARNING",
          `💰 تحذير: عجز نقدي متوقع خلال ${daysUntilDeficit} يوم`,
          `بناءً على المعدلات الحالية، متوقع عجز بقيمة ${Math.round(deficit)} ج.م خلال ${forecastDays} يوم. ${pendingCod > 0 ? `مبالغ COD معلقة: ${Math.round(pendingCod)} ج.م.` : ""} راجع صفحة التدفق النقدي.`,
        );
        return 1;
      }
    } catch (error) {
      this.logger.warn(`Cash flow check failed for ${merchantId}: ${error}`);
    }
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPER: Create notification (with 12h dedup)
  // ═══════════════════════════════════════════════════════════════
  private async createAlert(
    merchantId: string,
    alertType: string,
    title: string,
    body: string,
  ): Promise<void> {
    // Dedup: skip if same alert type was sent in last 12 hours
    const dedup = await this.pool.query(
      `SELECT id FROM notifications
       WHERE merchant_id = $1
         AND data->>'alertKind' = 'PROACTIVE_ALERT'
         AND data->>'alertType' = $2
         AND created_at > NOW() - INTERVAL '12 hours'
       LIMIT 1`,
      [merchantId, alertType],
    );
    if (dedup.rows.length > 0) return;

    const payload = JSON.stringify({
      alertKind: "PROACTIVE_ALERT",
      alertType,
      source: "ProactiveAlertsSchedulerService",
    });

    const insertWithType = async (type: string) =>
      this.pool.query(
        `INSERT INTO notifications (
           merchant_id, type, title, title_ar, message, message_ar, data,
           priority, channels, action_url, expires_at, created_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7::jsonb,
           'HIGH', '{"IN_APP","PUSH"}', '/merchant/dashboard', NOW() + INTERVAL '24 hours', NOW()
         )`,
        [merchantId, type, title, title, body, body, payload],
      );

    try {
      await insertWithType("SYSTEM_ALERT");
    } catch (error: any) {
      const isTypeConstraintError =
        error?.code === "23514" ||
        (typeof error?.message === "string" &&
          error.message.includes("valid_type"));
      if (!isTypeConstraintError) {
        throw error;
      }

      const fallbackTypes = ["SECURITY_ALERT", "DAILY_SUMMARY", "ORDER_PLACED"];
      for (const fallbackType of fallbackTypes) {
        try {
          await insertWithType(fallbackType);
          return;
        } catch (retryError: any) {
          const retryTypeConstraintError =
            retryError?.code === "23514" ||
            (typeof retryError?.message === "string" &&
              retryError.message.includes("valid_type"));
          if (!retryTypeConstraintError) {
            throw retryError;
          }
        }
      }

      throw error;
    }
  }
}
