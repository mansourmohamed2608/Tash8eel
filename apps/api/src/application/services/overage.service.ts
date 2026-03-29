import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

@Injectable()
export class OverageService {
  private readonly logger = new Logger(OverageService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Cron("0 6 1 * *")
  async calculateMonthlyOverages(): Promise<void> {
    try {
      const merchants = await this.pool.query<{
        merchant_id: string;
        currency: string | null;
        monthly_conversations_included: string | number | null;
        overage_rate_aed: string | number | null;
        overage_rate_sar: string | number | null;
      }>(
        `SELECT DISTINCT ON (s.merchant_id)
         s.merchant_id,
         COALESCE(NULLIF(m.currency, ''), CASE s.region_code WHEN 'AE' THEN 'AED' WHEN 'SA' THEN 'SAR' ELSE NULL END) AS currency,
         pl.monthly_conversations_included,
         pl.overage_rate_aed,
         pl.overage_rate_sar
       FROM subscriptions s
       JOIN merchants m ON m.id = s.merchant_id
       JOIN plan_limits pl ON pl.plan_id = s.plan_id
       WHERE s.status = 'ACTIVE'
         AND COALESCE(NULLIF(m.currency, ''), CASE s.region_code WHEN 'AE' THEN 'AED' WHEN 'SA' THEN 'SAR' ELSE NULL END) IN ('AED', 'SAR')
       ORDER BY s.merchant_id, COALESCE(s.updated_at, s.created_at) DESC`,
      );

      let processed = 0;
      let totalCharges = 0;
      const billingPeriod = new Date();
      billingPeriod.setUTCDate(1);
      billingPeriod.setUTCHours(0, 0, 0, 0);
      billingPeriod.setUTCMonth(billingPeriod.getUTCMonth() - 1);

      for (const merchant of merchants.rows) {
        const included = Number(merchant.monthly_conversations_included || 0);
        const currency = String(merchant.currency || "").toUpperCase();
        const rate = Number(
          currency === "AED"
            ? merchant.overage_rate_aed || 0
            : merchant.overage_rate_sar || 0,
        );

        const actualResult = await this.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
         FROM whatsapp_conversation_windows
         WHERE merchant_id = $1
           AND opened_at >= date_trunc('month', NOW() - INTERVAL '1 month')
           AND opened_at < date_trunc('month', NOW())`,
          [merchant.merchant_id],
        );

        const actual = Number(actualResult.rows[0]?.count || 0);
        processed += 1;

        if (actual <= included || rate <= 0) {
          continue;
        }

        const overage = actual - included;
        const charge = Number((overage * rate).toFixed(2));
        totalCharges += charge;

        const insertResult = await this.pool.query<{ id: string }>(
          `INSERT INTO billing_overages (
           merchant_id,
           billing_period,
           metric_type,
           included_amount,
           actual_amount,
           overage_amount,
           rate_per_unit,
           currency,
           total_charge,
           status
         ) VALUES ($1, $2, 'conversations', $3, $4, $5, $6, $7, $8, 'pending')
         ON CONFLICT (merchant_id, billing_period, metric_type) DO NOTHING
         RETURNING id`,
          [
            merchant.merchant_id,
            billingPeriod.toISOString().slice(0, 10),
            included,
            actual,
            overage,
            rate,
            currency,
            charge,
          ],
        );

        if (insertResult.rowCount && insertResult.rowCount > 0) {
          await this.pool.query(
            `INSERT INTO notifications (
             merchant_id,
             type,
             title,
             title_ar,
             message,
             message_ar,
             priority,
             channels,
             data
           ) VALUES (
             $1,
             'BILLING_OVERAGE',
             'Conversation overage invoice generated',
             'تم إنشاء فاتورة المحادثات الزائدة',
             $2,
             $3,
             'MEDIUM',
             ARRAY['IN_APP'],
             $4::jsonb
           )`,
            [
              merchant.merchant_id,
              `Additional conversations this month: ${overage} conversations. Additional charges: ${charge} ${currency}. These charges will be added to your next invoice.`,
              `محادثاتك الإضافية هذا الشهر: ${overage} محادثة\nالرسوم الإضافية: ${charge} ${currency}\nسيتم إضافتها لفاتورتك القادمة`,
              JSON.stringify({
                billingPeriod: billingPeriod.toISOString().slice(0, 10),
                included,
                actual,
                overage,
                rate,
                charge,
                currency,
              }),
            ],
          );
        }
      }

      this.logger.log(
        `Monthly overages processed: ${processed} merchants, total charges ${totalCharges.toFixed(2)}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to calculate monthly overages: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getOverageSummary(
    merchantId: string,
    period: Date,
  ): Promise<any | null> {
    const normalized = new Date(period);
    normalized.setUTCDate(1);
    normalized.setUTCHours(0, 0, 0, 0);

    const result = await this.pool.query(
      `SELECT *
       FROM billing_overages
       WHERE merchant_id = $1
         AND billing_period = $2
       LIMIT 1`,
      [merchantId, normalized.toISOString().slice(0, 10)],
    );

    return result.rows[0] || null;
  }
}
