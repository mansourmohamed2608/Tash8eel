import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../infrastructure/database/database.module';
import { OutboxService } from '../events/outbox.service';
import { EVENT_TYPES } from '../events/event-types';
import { RedisService } from '../../infrastructure/redis/redis.service';

interface DailyStats {
  merchantId: string;
  merchantName: string;
  date: string;
  totalConversations: number;
  newConversations: number;
  ordersCreated: number;
  ordersConfirmed: number;
  totalRevenue: number;
  averageOrderValue: number;
  tokenUsage: number;
  conversionRate: number;
}

/**
 * Generates daily reports for merchants
 */
@Injectable()
export class DailyReportScheduler {
  private readonly logger = new Logger(DailyReportScheduler.name);
  private readonly lockKey = 'daily-report-scheduler-lock';
  private readonly lockTtl = 300000; // 5 minutes

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly outboxService: OutboxService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Run daily report at 8 AM Egypt time (6 AM UTC)
   */
  @Cron('0 6 * * *', { timeZone: 'UTC' })
  async generateDailyReports(): Promise<void> {
    const lock = await this.redisService.acquireLock(this.lockKey, this.lockTtl);
    if (!lock) {
      this.logger.debug('Could not acquire daily report lock');
      return;
    }

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      this.logger.log({
        msg: 'Generating daily reports',
        dateFrom: yesterday.toISOString(),
        dateTo: today.toISOString(),
      });

      // Get all active merchants
      const merchantsResult = await this.pool.query(
        `SELECT id, name FROM merchants WHERE is_active = true`,
      );

      for (const merchant of merchantsResult.rows) {
        try {
          const stats = await this.calculateMerchantStats(
            merchant.id,
            merchant.name,
            yesterday,
            today,
          );

          await this.sendDailyReport(stats);
        } catch (error: any) {
          this.logger.error({
            msg: 'Failed to generate report for merchant',
            merchantId: merchant.id,
            error: error.message,
          });
        }
      }

      this.logger.log({
        msg: 'Daily reports generation completed',
        merchantCount: merchantsResult.rows.length,
      });
    } catch (error: any) {
      this.logger.error({
        msg: 'Error in daily report scheduler',
        error: error.message,
      });
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  /**
   * Manual trigger for testing
   */
  async generateReportForMerchant(merchantId: string): Promise<DailyStats> {
    const merchantResult = await this.pool.query(
      `SELECT id, name FROM merchants WHERE id = $1`,
      [merchantId],
    );

    if (merchantResult.rows.length === 0) {
      throw new Error(`Merchant ${merchantId} not found`);
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await this.calculateMerchantStats(
      merchantResult.rows[0].id,
      merchantResult.rows[0].name,
      yesterday,
      today,
    );

    await this.sendDailyReport(stats);

    return stats;
  }

  private async calculateMerchantStats(
    merchantId: string,
    merchantName: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<DailyStats> {
    // Conversations stats
    const conversationsQuery = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3) as new_today
      FROM conversations
      WHERE merchant_id = $1
        AND last_activity_at >= $2
        AND last_activity_at < $3
    `;
    const convResult = await this.pool.query(conversationsQuery, [
      merchantId,
      dateFrom,
      dateTo,
    ]);

    // Orders stats
    const ordersQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status IN ('confirmed', 'shipped', 'delivered')) as confirmed_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as avg_order_value
      FROM orders
      WHERE merchant_id = $1
        AND created_at >= $2
        AND created_at < $3
    `;
    const orderResult = await this.pool.query(ordersQuery, [
      merchantId,
      dateFrom,
      dateTo,
    ]);

    // Token usage
    const tokenQuery = `
      SELECT COALESCE(SUM(token_usage), 0) as total_tokens
      FROM messages
      WHERE merchant_id = $1
        AND created_at >= $2
        AND created_at < $3
        AND sender = 'bot'
    `;
    const tokenResult = await this.pool.query(tokenQuery, [
      merchantId,
      dateFrom,
      dateTo,
    ]);

    const totalConversations = parseInt(convResult.rows[0].total, 10);
    const ordersCreated = parseInt(orderResult.rows[0].total_orders, 10);

    const conversionRate = totalConversations > 0
      ? (ordersCreated / totalConversations) * 100
      : 0;

    return {
      merchantId,
      merchantName,
      date: dateFrom.toISOString().slice(0, 10),
      totalConversations,
      newConversations: parseInt(convResult.rows[0].new_today, 10),
      ordersCreated,
      ordersConfirmed: parseInt(orderResult.rows[0].confirmed_orders, 10),
      totalRevenue: parseFloat(orderResult.rows[0].total_revenue),
      averageOrderValue: parseFloat(orderResult.rows[0].avg_order_value),
      tokenUsage: parseInt(tokenResult.rows[0].total_tokens, 10),
      conversionRate: Math.round(conversionRate * 10) / 10,
    };
  }

  private async sendDailyReport(stats: DailyStats): Promise<void> {
    // Format report message in Arabic
    const message = this.formatReportMessage(stats);

    // Publish merchant alert with daily report
    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.MERCHANT_ALERTED,
      aggregateType: 'merchant',
      aggregateId: stats.merchantId,
      merchantId: stats.merchantId,
      payload: {
        merchantId: stats.merchantId,
        alertType: 'daily_report',
        message,
        metadata: {
          date: stats.date,
          totalConversations: stats.totalConversations,
          ordersCreated: stats.ordersCreated,
          totalRevenue: stats.totalRevenue,
          conversionRate: stats.conversionRate,
          tokenUsage: stats.tokenUsage,
        },
      },
    });

    this.logger.log({
      msg: 'Daily report sent',
      merchantId: stats.merchantId,
      date: stats.date,
      orders: stats.ordersCreated,
      revenue: stats.totalRevenue,
    });
  }

  private formatReportMessage(stats: DailyStats): string {
    return `
📊 التقرير اليومي - ${stats.date}

👋 مرحباً ${stats.merchantName}!

📈 ملخص اليوم:
• المحادثات: ${stats.totalConversations} (جديد: ${stats.newConversations})
• الطلبات: ${stats.ordersCreated} (مؤكد: ${stats.ordersConfirmed})
• الإيرادات: ${stats.totalRevenue.toLocaleString('ar-EG')} جنيه
• متوسط الطلب: ${stats.averageOrderValue.toLocaleString('ar-EG')} جنيه
• معدل التحويل: ${stats.conversionRate}%

🤖 استخدام AI: ${stats.tokenUsage.toLocaleString('ar-EG')} توكن

شكراً لاستخدامك خدماتنا! 🙏
    `.trim();
  }
}
