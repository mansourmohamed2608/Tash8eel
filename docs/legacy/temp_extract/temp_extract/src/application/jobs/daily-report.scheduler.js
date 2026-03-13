"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyReportScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const event_types_1 = require("../events/event-types");
/**
 * Generates daily reports for merchants
 */
let DailyReportScheduler = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _generateDailyReports_decorators;
    var DailyReportScheduler = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _generateDailyReports_decorators = [(0, schedule_1.Cron)("0 6 * * *", { timeZone: "UTC" })];
            __esDecorate(this, null, _generateDailyReports_decorators, { kind: "method", name: "generateDailyReports", static: false, private: false, access: { has: obj => "generateDailyReports" in obj, get: obj => obj.generateDailyReports }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DailyReportScheduler = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool = __runInitializers(this, _instanceExtraInitializers);
        outboxService;
        redisService;
        logger = new common_1.Logger(DailyReportScheduler.name);
        lockKey = "daily-report-scheduler-lock";
        lockTtl = 300000; // 5 minutes
        constructor(pool, outboxService, redisService) {
            this.pool = pool;
            this.outboxService = outboxService;
            this.redisService = redisService;
        }
        /**
         * Run daily report at 8 AM Egypt time (6 AM UTC)
         */
        async generateDailyReports() {
            const lock = await this.redisService.acquireLock(this.lockKey, this.lockTtl);
            if (!lock) {
                this.logger.debug("Could not acquire daily report lock");
                return;
            }
            try {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                yesterday.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                this.logger.log({
                    msg: "Generating daily reports",
                    dateFrom: yesterday.toISOString(),
                    dateTo: today.toISOString(),
                });
                // Get all active merchants
                const merchantsResult = await this.pool.query(`SELECT id, name FROM merchants WHERE is_active = true`);
                for (const merchant of merchantsResult.rows) {
                    try {
                        const stats = await this.calculateMerchantStats(merchant.id, merchant.name, yesterday, today);
                        await this.sendDailyReport(stats);
                    }
                    catch (error) {
                        this.logger.error({
                            msg: "Failed to generate report for merchant",
                            merchantId: merchant.id,
                            error: error.message,
                        });
                    }
                }
                this.logger.log({
                    msg: "Daily reports generation completed",
                    merchantCount: merchantsResult.rows.length,
                });
            }
            catch (error) {
                this.logger.error({
                    msg: "Error in daily report scheduler",
                    error: error.message,
                });
            }
            finally {
                await this.redisService.releaseLock(lock);
            }
        }
        /**
         * Manual trigger for testing
         */
        async generateReportForMerchant(merchantId) {
            const merchantResult = await this.pool.query(`SELECT id, name FROM merchants WHERE id = $1`, [merchantId]);
            if (merchantResult.rows.length === 0) {
                throw new Error(`Merchant ${merchantId} not found`);
            }
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const stats = await this.calculateMerchantStats(merchantResult.rows[0].id, merchantResult.rows[0].name, yesterday, today);
            await this.sendDailyReport(stats);
            return stats;
        }
        async calculateMerchantStats(merchantId, merchantName, dateFrom, dateTo) {
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
            const conversionRate = totalConversations > 0 ? (ordersCreated / totalConversations) * 100 : 0;
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
        async sendDailyReport(stats) {
            // Format report message in Arabic
            const message = this.formatReportMessage(stats);
            // Publish merchant alert with daily report
            await this.outboxService.publishEvent({
                eventType: event_types_1.EVENT_TYPES.MERCHANT_ALERTED,
                aggregateType: "merchant",
                aggregateId: stats.merchantId,
                merchantId: stats.merchantId,
                payload: {
                    merchantId: stats.merchantId,
                    alertType: "daily_report",
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
                msg: "Daily report sent",
                merchantId: stats.merchantId,
                date: stats.date,
                orders: stats.ordersCreated,
                revenue: stats.totalRevenue,
            });
        }
        formatReportMessage(stats) {
            return `
📊 التقرير اليومي - ${stats.date}

👋 مرحباً ${stats.merchantName}!

📈 ملخص اليوم:
• المحادثات: ${stats.totalConversations} (جديد: ${stats.newConversations})
• الطلبات: ${stats.ordersCreated} (مؤكد: ${stats.ordersConfirmed})
• الإيرادات: ${stats.totalRevenue.toLocaleString("ar-EG")} جنيه
• متوسط الطلب: ${stats.averageOrderValue.toLocaleString("ar-EG")} جنيه
• معدل التحويل: ${stats.conversionRate}%

🤖 استخدام AI: ${stats.tokenUsage.toLocaleString("ar-EG")} توكن

شكراً لاستخدامك خدماتنا! 🙏
    `.trim();
        }
    };
    return DailyReportScheduler = _classThis;
})();
exports.DailyReportScheduler = DailyReportScheduler;
