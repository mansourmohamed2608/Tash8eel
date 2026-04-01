import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

export interface DailyDataPoint {
  date: string;
  value: number;
  stockout?: boolean;
  promoActive?: boolean;
}

export interface SmoothedForecast {
  forecast: number[]; // predicted values for horizonDays
  lowerBound: number[]; // 95% CI lower
  upperBound: number[]; // 95% CI upper
  level: number; // last smoothed level
  trend: number; // last smoothed trend
  mape: number; // in-sample MAPE (%)
  residualStd: number; // σ of residuals
  confidence: number; // 0-1 model confidence score
}

export interface DemandForecastResult {
  merchantId: string;
  productId: string;
  productName: string;
  currentStock: number;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  recommendedOrderQty: number;
  estStockoutDate: string | null; // ISO date string
  daysUntilStockout: number | null;
  forecast7d: number;
  forecast14d: number;
  forecast30d: number;
  lower7d: number;
  upper7d: number;
  lower30d: number;
  upper30d: number;
  trendPct: number;
  urgency: "critical" | "high" | "medium" | "low" | "ok";
  mape7d: number;
  confidence: number;
  reasonCodes: Array<{ code: string; label: string; weight: number }>;
  historicalData: DailyDataPoint[];
}

export interface CashFlowForecastResult {
  merchantId: string;
  currentBalance: number;
  projection: Array<{
    date: string;
    inflow: number;
    outflow: number;
    balance: number;
  }>;
  runwayDays: number | null;
  riskDays: Array<{ date: string; reason: string }>;
  avgDailyInflow: number;
  avgDailyOutflow: number;
  forecastPeriodDays: number;
  confidence: number;
}

export interface ChurnRiskItem {
  customerId: string;
  customerName: string;
  customerPhone: string;
  daysSinceLastOrder: number;
  avgOrderCycleDays: number;
  churnProbability: number; // 0-1
  lifetimeValue: number;
  riskLevel: "critical" | "high" | "medium" | "low";
  recommendedAction: string;
}

export interface SlaBreachForecastItem {
  conversationId: string;
  customerName: string;
  agentType: string;
  openHours: number;
  avgResolutionHours: number;
  breachProbability: number;
  urgency: "critical" | "high" | "medium" | "low";
}

export interface WorkforceLoadForecast {
  dayPattern: Array<{
    dayOfWeek: number;
    dayName: string;
    avgMessages: number;
  }>;
  hourPattern: Array<{ hour: number; avgMessages: number; peakDay: string }>;
  nextSevenDays: Array<{
    date: string;
    dayOfWeek: number;
    forecastMessages: number;
    forecastConversations: number;
  }>;
  peakHour: number;
  peakDay: string;
  confidence: number;
}

export interface DeliveryEtaResult {
  orderId: string;
  orderNumber: string;
  customerName: string;
  zone: string;
  courier: string;
  delayProbability: number;
  estimatedDeliveryDate: string | null;
  riskFactors: string[];
}

export interface CampaignUpliftResult {
  segmentId: string | null;
  segmentName: string;
  estimatedAudienceSize: number;
  baselineOrderRate: number; // orders/customer in last 30d without promo
  forecastOrderRate: number; // predicted orders/customer with promo
  forecastRevenue: number;
  forecastOrders: number;
  upliftPct: number;
  roi: number | null; // null if campaign cost unknown
  confidence: number;
}

export interface WhatIfResult {
  scenarioType: string;
  baselineValue: number;
  adjustedValue: number;
  delta: number;
  deltaPct: number;
  breakdownByItem?: Array<{
    id: string;
    name: string;
    baseline: number;
    adjusted: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Holt-Winters Double Exponential Smoothing (additive trend)
// ─────────────────────────────────────────────────────────────────────────────
function holtWinters(
  data: number[],
  alpha = 0.3, // level smoothing
  beta = 0.1, // trend smoothing
  horizonDays = 30,
): SmoothedForecast {
  if (data.length < 3) {
    const mean = data.length
      ? data.reduce((a, b) => a + b, 0) / data.length
      : 0;
    const arr = Array(horizonDays).fill(Math.round(mean));
    return {
      forecast: arr,
      lowerBound: arr.map((v) => Math.max(0, v - mean)),
      upperBound: arr.map((v) => v + mean),
      level: mean,
      trend: 0,
      mape: 0,
      residualStd: mean * 0.3,
      confidence: 0.3,
    };
  }

  // Initialize
  let level = data[0];
  let trend = data[1] - data[0] || 0;

  const fitted: number[] = [];
  const residuals: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const y = data[i];
    const fittedVal = level + trend;
    fitted.push(fittedVal);
    const residual = y - fittedVal;
    residuals.push(residual);

    const prevLevel = level;
    level = alpha * y + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  // MAPE on fitted values (skip first since no fit)
  let mapeSum = 0;
  let mapeCount = 0;
  for (let i = 0; i < residuals.length; i++) {
    if (data[i + 1] > 0.5) {
      mapeSum += Math.abs(residuals[i]) / data[i + 1];
      mapeCount++;
    }
  }
  const mape = mapeCount > 0 ? (mapeSum / mapeCount) * 100 : 0;

  // Residual std for confidence bands
  const residualStd =
    residuals.length > 1
      ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
      : Math.abs(level * 0.2);

  const z95 = 1.96;

  // Generate forecast
  const forecast: number[] = [];
  const lowerBound: number[] = [];
  const upperBound: number[] = [];

  for (let h = 1; h <= horizonDays; h++) {
    const val = Math.max(0, level + h * trend);
    const band = z95 * residualStd * Math.sqrt(h); // uncertainty grows with horizon
    forecast.push(Math.round(val));
    lowerBound.push(Math.max(0, Math.round(val - band)));
    upperBound.push(Math.round(val + band));
  }

  // Confidence: high when MAPE < 20%, low when > 50%
  const confidence = Math.max(0.2, Math.min(0.98, 1 - mape / 100));

  return {
    forecast,
    lowerBound,
    upperBound,
    level,
    trend,
    mape,
    residualStd,
    confidence,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Compute safety stock and reorder point
// ─────────────────────────────────────────────────────────────────────────────
function computeReplenishmentParams(
  avgDailySales: number,
  stdDailySales: number,
  leadTimeDays: number,
  serviceLevel = 0.95, // 95% service level → Z=1.65
) {
  const Z = serviceLevel >= 0.99 ? 2.33 : serviceLevel >= 0.97 ? 1.88 : 1.65;
  const safetyStock = Math.ceil(Z * stdDailySales * Math.sqrt(leadTimeDays));
  const reorderPoint = Math.ceil(avgDailySales * leadTimeDays) + safetyStock;
  return { safetyStock, reorderPoint };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Service
// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class ForecastEngineService {
  private readonly logger = new Logger(ForecastEngineService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  // ───────────────────────────────────────────────────────────────────────────
  // 1. DEMAND FORECAST (per product)
  // ───────────────────────────────────────────────────────────────────────────

  async computeDemandForecast(
    merchantId: string,
    productId?: string,
    lookbackDays = 90,
  ): Promise<DemandForecastResult[]> {
    // Get product list (all or specific)
    const productFilter = productId ? "AND ip.id = $2" : "";
    const params: any[] = [merchantId];
    if (productId) params.push(productId);

    const products = await this.pool.query(
      `SELECT ip.id, COALESCE(NULLIF(ip.name, ''), ip.sku) AS name,
              COALESCE(SUM(iv.quantity_on_hand), 0)::int AS current_stock,
              3 AS lead_time_days,
              20.0 AS safety_stock_pct
       FROM inventory_items ip
       LEFT JOIN inventory_variants iv ON iv.inventory_item_id = ip.id
       WHERE ip.merchant_id = $1 ${productFilter}
       GROUP BY ip.id, ip.name, ip.sku
       LIMIT 200`,
      params,
    );

    const results: DemandForecastResult[] = [];
    const today = new Date();

    for (const product of products.rows) {
      try {
        // Get daily sales for lookback window (filling stockout days from order gaps)
        const salesRows = await this.pool.query(
          `SELECT
             gs::date AS sales_date,
             COALESCE(SUM(oi.quantity), 0)::int AS units_sold,
             COALESCE(SUM(CASE WHEN o.status = 'CANCELLED' THEN oi.quantity ELSE 0 END), 0)::int AS units_returned
           FROM generate_series(
             NOW()::date - INTERVAL '1 day' * $3,
             NOW()::date - INTERVAL '1 day',
             INTERVAL '1 day'
           ) gs
           LEFT JOIN orders o ON o.merchant_id = $1
             AND o.status NOT IN ('DRAFT', 'CANCELLED')
             AND DATE_TRUNC('day', o.created_at) = gs::date
           LEFT JOIN order_items oi ON oi.order_id = o.id
             AND oi.sku = (SELECT sku FROM inventory_items WHERE id = $2)
           GROUP BY gs
           ORDER BY gs ASC`,
          [merchantId, product.id, lookbackDays],
        );

        const dailyNet: number[] = salesRows.rows.map((r: any) =>
          Math.max(0, r.units_sold - r.units_returned),
        );
        const histData: DailyDataPoint[] = salesRows.rows.map((r: any) => ({
          date: r.sales_date,
          value: Math.max(0, r.units_sold - r.units_returned),
        }));

        if (dailyNet.every((v) => v === 0)) {
          // No sales data — sparse/new item fallback
          results.push({
            merchantId,
            productId: product.id,
            productName: product.name,
            currentStock: product.current_stock,
            leadTimeDays: product.lead_time_days,
            safetyStock: 0,
            reorderPoint: 0,
            recommendedOrderQty: 0,
            estStockoutDate: null,
            daysUntilStockout: null,
            forecast7d: 0,
            forecast14d: 0,
            forecast30d: 0,
            lower7d: 0,
            upper7d: 0,
            lower30d: 0,
            upper30d: 0,
            trendPct: 0,
            urgency: "ok",
            mape7d: 0,
            confidence: 0.1,
            reasonCodes: [
              {
                code: "no_sales_data",
                label: "لا توجد مبيعات سابقة",
                weight: 1,
              },
            ],
            historicalData: histData,
          });
          continue;
        }

        // Holt-Winters forecast
        const smoothed = holtWinters(dailyNet, 0.3, 0.1, 30);
        const forecast7 = smoothed.forecast
          .slice(0, 7)
          .reduce((a, b) => a + b, 0);
        const forecast14 = smoothed.forecast
          .slice(0, 14)
          .reduce((a, b) => a + b, 0);
        const forecast30 = smoothed.forecast.reduce((a, b) => a + b, 0);

        // Previous vs current velocity for trend%
        const prevHalf = dailyNet.slice(0, Math.floor(dailyNet.length / 2));
        const currHalf = dailyNet.slice(Math.floor(dailyNet.length / 2));
        const prevAvg =
          prevHalf.reduce((a, b) => a + b, 0) / (prevHalf.length || 1);
        const currAvg =
          currHalf.reduce((a, b) => a + b, 0) / (currHalf.length || 1);
        const trendPct =
          prevAvg > 0.1 ? ((currAvg - prevAvg) / prevAvg) * 100 : 0;

        // Standard deviation for safety stock
        const mean7 = dailyNet.slice(-7).reduce((a, b) => a + b, 0) / 7;
        const variance7 =
          dailyNet.slice(-7).reduce((a, b) => a + (b - mean7) ** 2, 0) / 7;
        const std7 = Math.sqrt(variance7);

        const { safetyStock, reorderPoint } = computeReplenishmentParams(
          mean7,
          std7,
          product.lead_time_days,
        );

        // Days until stockout
        const stock = product.current_stock;
        let daysUntilStockout: number | null = null;
        let estStockoutDate: string | null = null;
        if (forecast7 > 0 && stock >= 0) {
          const dailyRate = forecast7 / 7;
          daysUntilStockout =
            dailyRate > 0 ? Math.floor(stock / dailyRate) : null;
          if (daysUntilStockout !== null) {
            const d = new Date(today);
            d.setDate(d.getDate() + daysUntilStockout);
            estStockoutDate = d.toISOString().slice(0, 10);
          }
        }

        // Recommended order qty
        const coveredByStock = daysUntilStockout ?? 999;
        const recommendedOrderQty =
          coveredByStock < product.lead_time_days + 7
            ? Math.max(0, reorderPoint + forecast30 - stock)
            : 0;

        // Urgency
        let urgency: DemandForecastResult["urgency"] = "ok";
        if (daysUntilStockout !== null) {
          if (daysUntilStockout <= product.lead_time_days) urgency = "critical";
          else if (daysUntilStockout <= product.lead_time_days * 2)
            urgency = "high";
          else if (daysUntilStockout <= product.lead_time_days * 3)
            urgency = "medium";
          else if (daysUntilStockout <= 30) urgency = "low";
        }

        // Reason codes
        const reasonCodes: DemandForecastResult["reasonCodes"] = [];
        if (Math.abs(trendPct) > 20) {
          reasonCodes.push({
            code: trendPct > 0 ? "rising_demand" : "falling_demand",
            label: trendPct > 0 ? "طلب متزايد" : "طلب متناقص",
            weight: Math.min(1, Math.abs(trendPct) / 100),
          });
        }
        if (daysUntilStockout !== null && daysUntilStockout <= 7) {
          reasonCodes.push({
            code: "imminent_stockout",
            label: "نفاد وشيك للمخزون",
            weight: 1,
          });
        }
        if (smoothed.mape > 30) {
          reasonCodes.push({
            code: "high_variance",
            label: "طلب متذبذب جداً",
            weight: 0.6,
          });
        }

        results.push({
          merchantId,
          productId: product.id,
          productName: product.name,
          currentStock: stock,
          leadTimeDays: product.lead_time_days,
          safetyStock,
          reorderPoint,
          recommendedOrderQty,
          estStockoutDate,
          daysUntilStockout,
          forecast7d: forecast7,
          forecast14d: forecast14,
          forecast30d: forecast30,
          lower7d: smoothed.lowerBound.slice(0, 7).reduce((a, b) => a + b, 0),
          upper7d: smoothed.upperBound.slice(0, 7).reduce((a, b) => a + b, 0),
          lower30d: smoothed.lowerBound.reduce((a, b) => a + b, 0),
          upper30d: smoothed.upperBound.reduce((a, b) => a + b, 0),
          trendPct: Math.round(trendPct * 10) / 10,
          urgency,
          mape7d: Math.round(smoothed.mape * 10) / 10,
          confidence: smoothed.confidence,
          reasonCodes,
          historicalData: histData,
        });
      } catch (err) {
        this.logger.warn(
          `Demand forecast failed for product ${product.id}: ${err}`,
        );
      }
    }

    return results;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. BACKTEST: Compare last 7-day forecast vs actuals → MAPE
  // ───────────────────────────────────────────────────────────────────────────

  async backtestDemand(merchantId: string): Promise<{
    mape: number;
    wmape: number;
    bias: number;
    mae: number;
    sampleSize: number;
  }> {
    // Compare demand_forecasts computed 7d ago vs actuals
    const result = await this.pool.query(
      `WITH recent_forecasts AS (
         SELECT df.product_id, df.forecast_7d AS predicted,
                df.computed_at
         FROM demand_forecasts df
         WHERE df.merchant_id = $1
           AND df.computed_at BETWEEN NOW() - INTERVAL '14 days'
                                  AND NOW() - INTERVAL '7 days'
       ),
       actuals AS (
         SELECT oi.sku, SUM(oi.quantity)::numeric AS actual_units
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.merchant_id = $1
           AND o.status NOT IN ('DRAFT','CANCELLED')
           AND o.created_at >= NOW() - INTERVAL '7 days'
         GROUP BY oi.sku
       ),
       joined AS (
         SELECT rf.predicted::numeric, a.actual_units,
                ABS(rf.predicted - a.actual_units) AS abs_error
         FROM recent_forecasts rf
         JOIN inventory_items ip ON ip.id = rf.product_id AND ip.merchant_id = $1
         JOIN actuals a ON a.sku = ip.sku
         WHERE a.actual_units > 0
       )
       SELECT
         COALESCE(AVG(abs_error / NULLIF(actual_units, 0)) * 100, 0)::numeric(8,2) AS mape,
         COALESCE(SUM(abs_error) / NULLIF(SUM(actual_units), 0) * 100, 0)::numeric(8,2) AS wmape,
         COALESCE(AVG(predicted - actual_units), 0)::numeric(8,2) AS bias,
         COALESCE(AVG(abs_error), 0)::numeric(8,2) AS mae,
         COUNT(*)::int AS sample_size
       FROM joined`,
      [merchantId],
    );

    const r = result.rows[0];
    return {
      mape: Number(r?.mape ?? 0),
      wmape: Number(r?.wmape ?? 0),
      bias: Number(r?.bias ?? 0),
      mae: Number(r?.mae ?? 0),
      sampleSize: Number(r?.sample_size ?? 0),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. CASH-FLOW FORECAST
  // ───────────────────────────────────────────────────────────────────────────

  async computeCashFlowForecast(
    merchantId: string,
    forecastDays = 30,
  ): Promise<CashFlowForecastResult> {
    // 30-day rolling average of inflows (order revenue) and outflows (expenses)
    const statsResult = await this.pool.query(
      `WITH days AS (
         SELECT generate_series(
           NOW()::date - INTERVAL '30 days',
           NOW()::date - INTERVAL '1 day',
           INTERVAL '1 day'
         )::date AS day
       ),
       inflow_by_day AS (
         SELECT DATE_TRUNC('day', o.created_at)::date AS day,
                SUM(o.total)::numeric AS daily_inflow
         FROM orders o
         WHERE o.merchant_id = $1
           AND o.status NOT IN ('DRAFT','CANCELLED')
           AND o.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY 1
       ),
       outflow_by_day AS (
         SELECT DATE_TRUNC('day', e.created_at)::date AS day,
                SUM(e.amount)::numeric AS daily_outflow
         FROM expenses e
         WHERE e.merchant_id = $1
           AND e.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY 1
       )
       SELECT
         COALESCE(AVG(COALESCE(i.daily_inflow, 0)), 0)::numeric AS avg_daily_inflow,
         COALESCE(STDDEV(COALESCE(i.daily_inflow, 0)), 0)::numeric AS std_inflow,
         COALESCE(AVG(COALESCE(o.daily_outflow, 0)), 0)::numeric AS avg_daily_outflow,
         COALESCE(STDDEV(COALESCE(o.daily_outflow, 0)), 0)::numeric AS std_outflow
       FROM days d
       LEFT JOIN inflow_by_day i ON i.day = d.day
       LEFT JOIN outflow_by_day o ON o.day = d.day`,
      [merchantId],
    );

    const stats = statsResult.rows[0];
    const avgInflow = Number(stats?.avg_daily_inflow ?? 0);
    const avgOutflow = Number(stats?.avg_daily_outflow ?? 0);
    const stdInflow = Number(stats?.std_inflow ?? avgInflow * 0.2);
    const stdOutflow = Number(stats?.std_outflow ?? avgOutflow * 0.15);

    // Current cash approximation: last 7 days net
    const balanceResult = await this.pool.query(
      `SELECT
         (
           SELECT COALESCE(SUM(o.total), 0)
           FROM orders o
           WHERE o.merchant_id = $1
             AND o.status NOT IN ('DRAFT','CANCELLED')
             AND o.created_at >= NOW() - INTERVAL '30 days'
         ) - (
           SELECT COALESCE(SUM(e.amount), 0)
           FROM expenses e
           WHERE e.merchant_id = $1
             AND e.created_at >= NOW() - INTERVAL '30 days'
         ) AS approx_balance`,
      [merchantId],
    );
    const currentBalance = Number(balanceResult.rows[0]?.approx_balance ?? 0);

    const projection: CashFlowForecastResult["projection"] = [];
    const riskDays: CashFlowForecastResult["riskDays"] = [];
    let rollingBalance = currentBalance;

    const today = new Date();
    for (let d = 1; d <= forecastDays; d++) {
      const dt = new Date(today);
      dt.setDate(today.getDate() + d);
      const dateStr = dt.toISOString().slice(0, 10);

      const inflow = Math.max(0, avgInflow);
      const outflow = Math.max(0, avgOutflow);

      rollingBalance += inflow - outflow;
      projection.push({
        date: dateStr,
        inflow: Math.round(inflow),
        outflow: Math.round(outflow),
        balance: Math.round(rollingBalance),
      });

      if (rollingBalance < 0)
        riskDays.push({ date: dateStr, reason: "رصيد سلبي متوقع" });
      else if (rollingBalance < avgOutflow * 7)
        riskDays.push({ date: dateStr, reason: "احتياطي أقل من أسبوع" });
    }

    const runwayDays =
      avgOutflow > avgInflow && avgOutflow - avgInflow > 0
        ? Math.max(0, Math.floor(currentBalance / (avgOutflow - avgInflow)))
        : null;

    const confidence =
      0.5 + Math.max(0, 0.4 - (stdInflow / (avgInflow + 1)) * 0.5);

    return {
      merchantId,
      currentBalance: Math.round(currentBalance),
      projection,
      runwayDays,
      riskDays,
      avgDailyInflow: Math.round(avgInflow),
      avgDailyOutflow: Math.round(avgOutflow),
      forecastPeriodDays: forecastDays,
      confidence: Math.min(0.9, confidence),
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. CHURN RISK FORECAST
  // ───────────────────────────────────────────────────────────────────────────

  async computeChurnForecast(
    merchantId: string,
    limit = 50,
  ): Promise<ChurnRiskItem[]> {
    const result = await this.pool.query(
      `WITH customer_activity AS (
         SELECT
           c.id,
           c.name,
           c.phone,
           COALESCE(c.total_orders, 0) AS total_orders,
           COALESCE(c.total_spent, 0) AS lifetime_value,
           MAX(o.created_at) AS last_order_at,
           COUNT(o.id)::int AS order_count,
           CASE WHEN COUNT(o.id) > 1 THEN
             EXTRACT(EPOCH FROM (MAX(o.created_at) - MIN(o.created_at))) / 86400.0 / NULLIF(COUNT(o.id) - 1, 0)
           ELSE 30 END AS avg_order_cycle_days
         FROM customers c
         LEFT JOIN orders o ON o.merchant_id = $1 AND o.customer_id = c.id
           AND o.status NOT IN ('DRAFT','CANCELLED')
         WHERE c.merchant_id = $1
           AND c.total_orders > 0
         GROUP BY c.id, c.name, c.phone, c.total_orders, c.total_spent
         HAVING MAX(o.created_at) IS NOT NULL
       )
       SELECT *,
         EXTRACT(DAY FROM NOW() - last_order_at)::int AS days_since_last_order
       FROM customer_activity
       WHERE EXTRACT(DAY FROM NOW() - last_order_at) > avg_order_cycle_days * 0.8
       ORDER BY lifetime_value DESC, days_since_last_order DESC
       LIMIT $2`,
      [merchantId, limit],
    );

    return result.rows.map((r: any) => {
      const daysSince = Number(r.days_since_last_order);
      const cycle = Math.max(7, Number(r.avg_order_cycle_days));
      // Survival-based churn probability: 1 - exp(-t/mu)
      const churnProb = Math.min(0.99, 1 - Math.exp(-daysSince / cycle));

      let riskLevel: ChurnRiskItem["riskLevel"] = "low";
      if (churnProb >= 0.8) riskLevel = "critical";
      else if (churnProb >= 0.6) riskLevel = "high";
      else if (churnProb >= 0.4) riskLevel = "medium";

      const ltv = Number(r.lifetime_value);
      let recommendedAction = "متابعة عادية";
      if (riskLevel === "critical" && ltv > 500)
        recommendedAction = "اتصال مباشر + خصم VIP";
      else if (riskLevel === "critical")
        recommendedAction = "رسالة واتساب شخصية + خصم";
      else if (riskLevel === "high" && ltv > 200)
        recommendedAction = "حملة استرجاع مع كود خصم";
      else if (riskLevel === "high") recommendedAction = "رسالة واتساب تذكير";
      else if (riskLevel === "medium")
        recommendedAction = "إضافة لقائمة إعادة الاستهداف";

      return {
        customerId: r.id,
        customerName: r.name || "غير معروف",
        customerPhone: r.phone || "",
        daysSinceLastOrder: daysSince,
        avgOrderCycleDays: Math.round(cycle),
        churnProbability: Math.round(churnProb * 100) / 100,
        lifetimeValue: ltv,
        riskLevel,
        recommendedAction,
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. SLA BREACH FORECAST
  // ───────────────────────────────────────────────────────────────────────────

  async computeSlaBreachForecast(
    merchantId: string,
  ): Promise<SlaBreachForecastItem[]> {
    // Average resolution time from closed conversations this month
    const avgResult = await this.pool.query(
      `SELECT COALESCE(
         AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600.0)
         FILTER (WHERE status = 'CLOSED' AND updated_at >= NOW() - INTERVAL '30 days'),
         24
       )::numeric AS avg_res_hours
       FROM conversations
       WHERE merchant_id = $1`,
      [merchantId],
    );
    const avgResolutionHours = Number(avgResult.rows[0]?.avg_res_hours ?? 24);

    const result = await this.pool.query(
      `SELECT
         c.id,
         COALESCE(
           NULLIF((to_jsonb(c)->>'customer_name'), ''),
           NULLIF((to_jsonb(c)->>'customerName'), ''),
           'غير معروف'
         ) AS customer_name,
         COALESCE(
           NULLIF((to_jsonb(c)->>'agent_type'), ''),
           NULLIF((to_jsonb(c)->>'agentType'), ''),
           'SUPPORT'
         ) AS agent_type,
         EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 3600.0 AS open_hours
       FROM conversations c
       WHERE c.merchant_id = $1
         AND c.status NOT IN ('CLOSED','RESOLVED')
       ORDER BY c.created_at ASC
       LIMIT 100`,
      [merchantId],
    );

    return result.rows.map((r: any) => {
      const openHours = Number(r.open_hours);
      const breachProb = Math.min(0.99, openHours / (avgResolutionHours * 2));

      let urgency: SlaBreachForecastItem["urgency"] = "low";
      if (openHours > avgResolutionHours * 2.0) urgency = "critical";
      else if (openHours > avgResolutionHours * 1.5) urgency = "high";
      else if (openHours > avgResolutionHours * 1.0) urgency = "medium";

      return {
        conversationId: r.id,
        customerName: r.customer_name || "غير معروف",
        agentType: r.agent_type,
        openHours: Math.round(openHours * 10) / 10,
        avgResolutionHours: Math.round(avgResolutionHours),
        breachProbability: Math.round(breachProb * 100) / 100,
        urgency,
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. WORKFORCE LOAD FORECAST
  // ───────────────────────────────────────────────────────────────────────────

  async computeWorkforceLoadForecast(
    merchantId: string,
  ): Promise<WorkforceLoadForecast> {
    const dayNames = [
      "أحد",
      "اثنين",
      "ثلاثاء",
      "أربعاء",
      "خميس",
      "جمعة",
      "سبت",
    ];

    const dayPattern = await this.pool.query(
      `SELECT
         dow AS day_of_week,
         AVG(daily_count)::numeric AS avg_messages
       FROM (
         SELECT DATE_TRUNC('day', created_at) AS day, EXTRACT(DOW FROM created_at)::int AS dow,
                COUNT(*)::int AS daily_count
         FROM messages
         WHERE merchant_id = $1 AND created_at >= NOW() - INTERVAL '60 days'
         GROUP BY 1, 2
       ) sub
       GROUP BY dow
       ORDER BY dow`,
      [merchantId],
    );

    const hourPattern = await this.pool.query(
      `SELECT
         h AS hour,
         AVG(hourly_count)::numeric AS avg_messages
       FROM (
         SELECT DATE_TRUNC('hour', created_at) AS hour_bucket,
                EXTRACT(HOUR FROM created_at)::int AS h,
                COUNT(*)::int AS hourly_count
         FROM messages
         WHERE merchant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
         GROUP BY 1, 2
       ) sub
       GROUP BY h
       ORDER BY h`,
      [merchantId],
    );

    const dayMap: Record<number, number> = {};
    for (const r of dayPattern.rows)
      dayMap[r.day_of_week] = Number(r.avg_messages);

    const hourMap: Record<number, number> = {};
    for (const r of hourPattern.rows) hourMap[r.hour] = Number(r.avg_messages);

    const peakDOW = Object.entries(dayMap).sort(([, a], [, b]) => b - a)[0];
    const peakHourEntry = Object.entries(hourMap).sort(
      ([, a], [, b]) => b - a,
    )[0];

    // 7-day ahead forecast combining day-of-week pattern
    const today = new Date();
    const nextSevenDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i + 1);
      const dow = d.getDay();
      const forecastMsgs = Math.round(dayMap[dow] ?? 10);
      return {
        date: d.toISOString().slice(0, 10),
        dayOfWeek: dow,
        forecastMessages: forecastMsgs,
        forecastConversations: Math.round(forecastMsgs * 0.4),
      };
    });

    const dayResult = Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      dayName: dayNames[i],
      avgMessages: Math.round(dayMap[i] ?? 0),
    }));

    const hourResult = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      avgMessages: Math.round(hourMap[h] ?? 0),
      peakDay: dayNames[Number(peakDOW?.[0] ?? 5)],
    }));

    return {
      dayPattern: dayResult,
      hourPattern: hourResult,
      nextSevenDays,
      peakHour: Number(peakHourEntry?.[0] ?? 12),
      peakDay: dayNames[Number(peakDOW?.[0] ?? 5)],
      confidence: dayPattern.rows.length >= 5 ? 0.8 : 0.4,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7. DELIVERY ETA / DELAY PROBABILITY
  // ───────────────────────────────────────────────────────────────────────────

  async computeDeliveryEtaForecast(
    merchantId: string,
  ): Promise<DeliveryEtaResult[]> {
    // Historical delay rate by zone/courier (past 30d completed orders)
    const histResult = await this.pool.query(
      `SELECT
         COALESCE(o.delivery_zone, 'unknown') AS zone,
         COALESCE(o.courier_name, 'unknown')  AS courier,
         COUNT(*) FILTER (WHERE o.status = 'DELIVERED')::numeric AS delivered,
         COUNT(*) FILTER (
           WHERE o.status = 'DELIVERED'
             AND EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 86400.0 > 3
         )::numeric AS delayed
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.status IN ('DELIVERED','CANCELLED')
         AND o.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY zone, courier`,
      [merchantId],
    );

    const delayRates: Record<string, number> = {};
    for (const r of histResult.rows) {
      const key = `${r.zone}__${r.courier}`;
      const total = Number(r.delivered);
      delayRates[key] = total > 0 ? Number(r.delayed) / total : 0.2;
    }

    // Active orders (in transit)
    const activeOrders = await this.pool.query(
      `SELECT o.id, o.order_number, o.customer_name,
              COALESCE(o.delivery_zone, 'غير محدد') AS zone,
              COALESCE(o.courier_name, 'غير محدد')  AS courier,
              o.created_at,
              EXTRACT(DAY FROM NOW() - o.created_at)::int AS age_days
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.status IN ('SHIPPED','OUT_FOR_DELIVERY','BOOKED')
       ORDER BY o.created_at ASC
       LIMIT 50`,
      [merchantId],
    );

    return activeOrders.rows.map((o: any) => {
      const key = `${o.zone}__${o.courier}`;
      const baseDelay = delayRates[key] ?? 0.2;
      const ageDays = Number(o.age_days);
      // Higher probability if parcel is already older than avg SLA
      const delayProb = Math.min(0.99, baseDelay + ageDays * 0.05);

      const today = new Date();
      const eta = new Date(today);
      eta.setDate(today.getDate() + Math.max(1, 3 - ageDays));

      const riskFactors: string[] = [];
      if (ageDays > 2) riskFactors.push("تأخر في العبور");
      if (baseDelay > 0.3) riskFactors.push("منطقة بمعدل تأخير مرتفع");
      if (o.courier === "غير محدد") riskFactors.push("لا يوجد ساعي محدد");

      return {
        orderId: o.id,
        orderNumber: o.order_number,
        customerName: o.customer_name || "غير معروف",
        zone: o.zone,
        courier: o.courier,
        delayProbability: Math.round(delayProb * 100) / 100,
        estimatedDeliveryDate: eta.toISOString().slice(0, 10),
        riskFactors,
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 8. CAMPAIGN UPLIFT FORECAST
  // ───────────────────────────────────────────────────────────────────────────

  async computeCampaignUpliftForecast(
    merchantId: string,
    segmentId?: string,
    discountPct = 15,
    campaignCost = 0,
  ): Promise<CampaignUpliftResult> {
    // Estimate audience size and baseline order rate.
    // If a segment is provided, use its actual memberships; otherwise use all customers.
    let audienceResult: {
      rows: Array<{
        segment_name: string;
        audience_size: number | string;
        monthly_order_rate: number | string;
      }>;
    };
    try {
      audienceResult = segmentId
        ? await this.pool.query(
            `SELECT
               cs.name AS segment_name,
               COUNT(DISTINCT sm.customer_id)::int AS audience_size,
               COALESCE(
                 AVG(c.total_orders::numeric / NULLIF(
                   EXTRACT(DAY FROM NOW() - c.created_at) / 30.0, 0
                 )), 0
               )::numeric AS monthly_order_rate
             FROM customer_segments cs
             LEFT JOIN segment_memberships sm ON sm.segment_id = cs.id
             LEFT JOIN customers c ON c.id = sm.customer_id AND c.merchant_id = cs.merchant_id
             WHERE cs.merchant_id = $1
               AND cs.id = $2::uuid
             GROUP BY cs.id, cs.name
             LIMIT 1`,
            [merchantId, segmentId],
          )
        : await this.pool.query(
            `SELECT
               'الكل' AS segment_name,
               COUNT(DISTINCT c.id)::int AS audience_size,
               COALESCE(
                 AVG(c.total_orders::numeric / NULLIF(
                   EXTRACT(DAY FROM NOW() - c.created_at) / 30.0, 0
                 )), 0
               )::numeric AS monthly_order_rate
             FROM customers c
             WHERE c.merchant_id = $1`,
            [merchantId],
          );
    } catch (error: any) {
      if (error?.code !== "42P01") {
        throw error;
      }
      audienceResult = await this.pool.query(
        `SELECT
           'الكل' AS segment_name,
           COUNT(DISTINCT c.id)::int AS audience_size,
           COALESCE(
             AVG(c.total_orders::numeric / NULLIF(
               EXTRACT(DAY FROM NOW() - c.created_at) / 30.0, 0
             )), 0
           )::numeric AS monthly_order_rate
         FROM customers c
         WHERE c.merchant_id = $1`,
        [merchantId],
      );
    }

    // Historical campaign uplift: compare 30d before vs 30d after past campaigns.
    // Some environments do not have campaign history tables yet, so degrade to defaults.
    let upliftResult: {
      rows: Array<{
        avg_lift_pct: number | string;
        campaign_count: number | string;
      }>;
    } = {
      rows: [{ avg_lift_pct: 15, campaign_count: 0 }],
    };
    try {
      upliftResult = await this.pool.query(
        `SELECT
           COALESCE(AVG(lift_pct), 15.0)::numeric AS avg_lift_pct,
           COUNT(*) AS campaign_count
         FROM (
           SELECT
             bc.id,
             (COALESCE(aft.orders, 0) - COALESCE(bef.orders, 0)) /
               NULLIF(COALESCE(bef.orders, 0), 0) * 100 AS lift_pct
           FROM broadcast_campaigns bc
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS orders FROM orders
             WHERE merchant_id = $1 AND created_at BETWEEN bc.created_at - INTERVAL '30 days' AND bc.created_at
           ) bef ON true
           LEFT JOIN LATERAL (
             SELECT COUNT(*) AS orders FROM orders
             WHERE merchant_id = $1 AND created_at BETWEEN bc.created_at AND bc.created_at + INTERVAL '30 days'
           ) aft ON true
           WHERE bc.merchant_id = $1 AND bc.status = 'SENT'
             AND bc.created_at >= NOW() - INTERVAL '180 days'
         ) sub`,
        [merchantId],
      );
    } catch (error: any) {
      if (error?.code !== "42P01") {
        throw error;
      }
    }

    const row = audienceResult.rows[0];
    const segmentName = row?.segment_name ?? "الكل";
    const audienceSize = Number(row?.audience_size ?? 0);
    const baselineRate = Number(row?.monthly_order_rate ?? 0.1);
    const historicalLift = Number(upliftResult.rows[0]?.avg_lift_pct ?? 15);
    const discountLift = discountPct * 0.5; // empirical: 1% discount → 0.5% uplift
    const totalLiftPct = Math.min(80, historicalLift + discountLift);

    const baselineOrders = Math.round(audienceSize * baselineRate);
    const forecastRate = baselineRate * (1 + totalLiftPct / 100);
    const forecastOrders = Math.round(audienceSize * forecastRate);
    const avgOrderValue = await this.getAvgOrderValue(merchantId);
    const forecastRevenue = Math.round(
      forecastOrders * avgOrderValue * (1 - discountPct / 100),
    );

    const roi =
      campaignCost > 0
        ? Math.round(((forecastRevenue - campaignCost) / campaignCost) * 100) /
          100
        : null;

    const confidence =
      Number(upliftResult.rows[0]?.campaign_count ?? 0) >= 3 ? 0.75 : 0.45;

    return {
      segmentId: segmentId ?? null,
      segmentName,
      estimatedAudienceSize: audienceSize,
      baselineOrderRate: Math.round(baselineRate * 1000) / 1000,
      forecastOrderRate: Math.round(forecastRate * 1000) / 1000,
      forecastRevenue,
      forecastOrders,
      upliftPct: Math.round(totalLiftPct * 10) / 10,
      roi,
      confidence,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 9. WHAT-IF SIMULATOR
  // ───────────────────────────────────────────────────────────────────────────

  async runWhatIf(
    merchantId: string,
    scenario: {
      type: "demand" | "cashflow" | "campaign" | "pricing";
      params: Record<string, any>;
    },
  ): Promise<WhatIfResult> {
    switch (scenario.type) {
      case "demand": {
        // What if lead time changes?
        const { productId, newLeadTimeDays = 5 } = scenario.params;
        const current = await this.computeDemandForecast(merchantId, productId);
        const base = current[0];
        if (!base)
          return {
            scenarioType: "demand",
            baselineValue: 0,
            adjustedValue: 0,
            delta: 0,
            deltaPct: 0,
          };

        const { safetyStock: newSS, reorderPoint: newROP } =
          computeReplenishmentParams(
            base.forecast7d / 7,
            (base.forecast7d / 7) * 0.3,
            newLeadTimeDays,
          );
        return {
          scenarioType: "demand_lead_time",
          baselineValue: base.reorderPoint,
          adjustedValue: newROP,
          delta: newROP - base.reorderPoint,
          deltaPct:
            base.reorderPoint > 0
              ? Math.round(
                  ((newROP - base.reorderPoint) / base.reorderPoint) * 1000,
                ) / 10
              : 0,
          breakdownByItem: [
            {
              id: base.productId,
              name: base.productName,
              baseline: base.reorderPoint,
              adjusted: newROP,
            },
          ],
        };
      }

      case "cashflow": {
        const { extraRevenue = 0, extraExpense = 0 } = scenario.params;
        const cf = await this.computeCashFlowForecast(merchantId, 30);
        const baseRunway = cf.runwayDays ?? 999;
        const netDelta = extraRevenue - extraExpense;
        const newAvgOutflow = Math.max(0, cf.avgDailyOutflow - netDelta);
        const newRunway =
          newAvgOutflow > 0 &&
          cf.avgDailyInflow + extraRevenue < cf.avgDailyOutflow
            ? Math.floor(
                cf.currentBalance /
                  (newAvgOutflow - cf.avgDailyInflow - extraRevenue),
              )
            : null;
        return {
          scenarioType: "cashflow_runway",
          baselineValue: baseRunway === 999 ? -1 : baseRunway,
          adjustedValue: newRunway ?? -1,
          delta: (newRunway ?? 999) - baseRunway,
          deltaPct: 0,
        };
      }

      case "campaign": {
        const {
          segmentId,
          discountPct = 15,
          campaignCost = 0,
        } = scenario.params;
        const base = await this.computeCampaignUpliftForecast(
          merchantId,
          undefined,
          0,
          0,
        );
        const adj = await this.computeCampaignUpliftForecast(
          merchantId,
          segmentId,
          discountPct,
          campaignCost,
        );
        return {
          scenarioType: "campaign_uplift",
          baselineValue: base.forecastRevenue,
          adjustedValue: adj.forecastRevenue,
          delta: adj.forecastRevenue - base.forecastRevenue,
          deltaPct:
            base.forecastRevenue > 0
              ? Math.round(
                  ((adj.forecastRevenue - base.forecastRevenue) /
                    base.forecastRevenue) *
                    1000,
                ) / 10
              : 0,
        };
      }

      case "pricing": {
        // What if I raise/lower price by X%?
        const { priceDeltaPct = 10 } = scenario.params;
        // Elasticity assumption: -1.5 (1% price increase → 1.5% volume decrease)
        const ELASTICITY = -1.5;
        const volumeChangePct = ELASTICITY * priceDeltaPct;
        const revenueChangePct = Math.max(
          -95,
          Math.min(200, priceDeltaPct + volumeChangePct),
        );
        const [baseForecast, avgUnitPrice, recentRevenue] = await Promise.all([
          this.computeDemandForecast(merchantId, undefined, 30),
          this.getAvgUnitPrice(merchantId),
          this.getRecentRevenue(merchantId, 30),
        ]);
        const forecastDerivedRevenue = baseForecast.reduce(
          (sum, product) => sum + product.forecast30d * avgUnitPrice,
          0,
        );
        const baseRevenue = Math.max(
          Math.round(forecastDerivedRevenue),
          Math.round(recentRevenue),
        );
        const adjusted = Math.round(baseRevenue * (1 + revenueChangePct / 100));
        return {
          scenarioType: "pricing_revenue",
          baselineValue: baseRevenue,
          adjustedValue: adjusted,
          delta: adjusted - baseRevenue,
          deltaPct: revenueChangePct,
        };
      }

      default:
        return {
          scenarioType: scenario.type,
          baselineValue: 0,
          adjustedValue: 0,
          delta: 0,
          deltaPct: 0,
        };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // HELPER: persist forecast results to DB
  // ───────────────────────────────────────────────────────────────────────────

  async persistDemandForecasts(
    merchantId: string,
    results: DemandForecastResult[],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      for (const r of results) {
        // Upsert into demand_forecasts (recent record per product)
        await client.query(
          `INSERT INTO demand_forecasts
             (merchant_id, product_id, product_name, current_stock, avg_daily_orders,
              days_until_stockout, trend_pct, forecast_7d, forecast_14d, forecast_30d,
              lower_bound_7d, upper_bound_7d, lower_bound_30d, upper_bound_30d,
              reorder_suggestion, reorder_point, safety_stock, lead_time_days,
              est_stockout_date, urgency, mape_7d, model_version, reason_codes,
              ai_summary_ar, computed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                   $19::date,$20,$21,$22,$23::jsonb,NULL,NOW())`,
          [
            merchantId,
            r.productId,
            r.productName,
            r.currentStock,
            r.forecast7d / 7,
            r.daysUntilStockout,
            r.trendPct,
            r.forecast7d,
            r.forecast14d,
            r.forecast30d,
            r.lower7d,
            r.upper7d,
            r.lower30d,
            r.upper30d,
            r.recommendedOrderQty,
            r.reorderPoint,
            r.safetyStock,
            r.leadTimeDays,
            r.estStockoutDate,
            r.urgency,
            r.mape7d,
            "1.0",
            JSON.stringify(r.reasonCodes),
          ],
        );

        // Upsert replenishment recommendation if there's an order suggestion
        if (r.recommendedOrderQty > 0) {
          await client.query(
            `INSERT INTO replenishment_recommendations
               (merchant_id, product_id, product_name, recommended_qty, reorder_point,
                safety_stock, lead_time_days, est_stockout_date, urgency, computed_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,NOW())
             ON CONFLICT DO NOTHING`,
            [
              merchantId,
              r.productId,
              r.productName,
              r.recommendedOrderQty,
              r.reorderPoint,
              r.safetyStock,
              r.leadTimeDays,
              r.estStockoutDate,
              r.urgency,
            ],
          );
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async recordForecastRun(
    merchantId: string,
    type: string,
    itemCount: number,
    durationMs: number,
    error?: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO forecast_runs (merchant_id, forecast_type, status, items_computed, duration_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        merchantId,
        type,
        error ? "error" : "ok",
        itemCount,
        durationMs,
        error ?? null,
      ],
    );
  }

  async saveModelMetrics(
    merchantId: string,
    type: string,
    metrics: {
      mape: number;
      wmape: number;
      bias: number;
      mae: number;
      sampleSize: number;
    },
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO forecast_model_metrics
         (merchant_id, forecast_type, mape, wmape, bias, mae, sample_size, evaluation_window)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '7d')`,
      [
        merchantId,
        type,
        metrics.mape,
        metrics.wmape,
        metrics.bias,
        metrics.mae,
        metrics.sampleSize,
      ],
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  private async getAvgOrderValue(merchantId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COALESCE(AVG(total), 100)::numeric AS aov
       FROM orders WHERE merchant_id = $1 AND status NOT IN ('DRAFT','CANCELLED')
       AND created_at >= NOW() - INTERVAL '30 days'`,
      [merchantId],
    );
    return Number(result.rows[0]?.aov ?? 100);
  }

  private async getAvgUnitPrice(merchantId: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COALESCE(
         SUM(
           COALESCE(
             (to_jsonb(oi)->>'unit_price')::numeric,
             (to_jsonb(oi)->>'price')::numeric,
             0
           ) * oi.quantity
         ) / NULLIF(SUM(oi.quantity), 0),
         10
       )::numeric AS avg_unit_price
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.merchant_id = $1
         AND o.status NOT IN ('DRAFT','CANCELLED')
         AND o.created_at >= NOW() - INTERVAL '30 days'`,
      [merchantId],
    );
    return Number(result.rows[0]?.avg_unit_price ?? 10);
  }

  private async getRecentRevenue(
    merchantId: string,
    days = 30,
  ): Promise<number> {
    const result = await this.pool.query(
      `SELECT COALESCE(SUM(o.total), 0)::numeric AS revenue
       FROM orders o
       WHERE o.merchant_id = $1
         AND o.status NOT IN ('DRAFT','CANCELLED')
         AND o.created_at >= NOW() - INTERVAL '1 day' * $2`,
      [merchantId, days],
    );
    return Number(result.rows[0]?.revenue ?? 0);
  }
}
