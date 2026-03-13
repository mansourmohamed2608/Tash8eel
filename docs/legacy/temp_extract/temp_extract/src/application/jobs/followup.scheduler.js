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
exports.FollowupScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const event_types_1 = require("../events/event-types");
/**
 * Schedules follow-up messages for abandoned carts
 */
let FollowupScheduler = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _scheduleFollowups_decorators;
    var FollowupScheduler = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _scheduleFollowups_decorators = [(0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_10_MINUTES)];
            __esDecorate(this, null, _scheduleFollowups_decorators, { kind: "method", name: "scheduleFollowups", static: false, private: false, access: { has: obj => "scheduleFollowups" in obj, get: obj => obj.scheduleFollowups }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            FollowupScheduler = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool = __runInitializers(this, _instanceExtraInitializers);
        outboxService;
        redisService;
        logger = new common_1.Logger(FollowupScheduler.name);
        lockKey = "followup-scheduler-lock";
        lockTtl = 60000; // 60 seconds
        constructor(pool, outboxService, redisService) {
            this.pool = pool;
            this.outboxService = outboxService;
            this.redisService = redisService;
        }
        /**
         * Check for abandoned carts every 10 minutes
         */
        async scheduleFollowups() {
            const lock = await this.redisService.acquireLock(this.lockKey, this.lockTtl);
            if (!lock) {
                this.logger.debug("Could not acquire followup scheduler lock");
                return;
            }
            try {
                await this.processAbandonedCarts();
            }
            catch (error) {
                this.logger.error({
                    msg: "Error in followup scheduler",
                    error: error.message,
                });
            }
            finally {
                await this.redisService.releaseLock(lock);
            }
        }
        async processAbandonedCarts() {
            // Find conversations that need follow-up:
            // - State is 'COLLECTING_ITEMS' or 'NEGOTIATING'
            // - Has items in cart
            // - Last activity > 30 minutes ago
            // - Follow-up count < 3
            // - No followup scheduled in last 30 minutes
            const query = `
      SELECT c.*, m.name as merchant_name, m.category
      FROM conversations c
      JOIN merchants m ON c.merchant_id = m.id
      WHERE c.state IN ('COLLECTING_ITEMS', 'COLLECTING_CUSTOMER_INFO', 'COLLECTING_ADDRESS', 'NEGOTIATING')
        AND c.cart IS NOT NULL
        AND jsonb_array_length(c.cart->'items') > 0
        AND c.last_message_at < NOW() - INTERVAL '30 minutes'
        AND c.followup_count < 3
        AND (c.next_followup_at IS NULL OR c.next_followup_at < NOW() - INTERVAL '30 minutes')
        AND m.is_active = true
      ORDER BY c.last_message_at ASC
      LIMIT 50
    `;
            const result = await this.pool.query(query);
            if (result.rows.length === 0) {
                this.logger.debug("No conversations need follow-up");
                return;
            }
            this.logger.log({
                msg: "Scheduling follow-ups for abandoned carts",
                count: result.rows.length,
            });
            for (const row of result.rows) {
                const nextFollowupCount = row.followup_count + 1;
                // Calculate follow-up delay based on count
                let delayMinutes;
                if (nextFollowupCount === 1) {
                    delayMinutes = 0; // First followup - immediate
                }
                else if (nextFollowupCount === 2) {
                    delayMinutes = 60; // 1 hour
                }
                else {
                    delayMinutes = 180; // 3 hours for final
                }
                const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);
                // Publish followup scheduled event
                await this.outboxService.publishEvent({
                    eventType: event_types_1.EVENT_TYPES.FOLLOWUP_SCHEDULED,
                    aggregateType: "conversation",
                    aggregateId: row.id,
                    merchantId: row.merchant_id,
                    payload: {
                        conversationId: row.id,
                        merchantId: row.merchant_id,
                        scheduledAt: scheduledAt.toISOString(),
                        followupCount: nextFollowupCount,
                    },
                });
                // Update conversation to prevent re-scheduling
                await this.pool.query(`UPDATE conversations 
         SET next_followup_at = NOW() + INTERVAL '30 minutes', followup_count = followup_count + 1, updated_at = NOW() 
         WHERE id = $1`, [row.id]);
                this.logger.debug({
                    msg: "Follow-up scheduled",
                    conversationId: row.id,
                    followupCount: nextFollowupCount,
                    scheduledAt: scheduledAt.toISOString(),
                });
            }
        }
    };
    return FollowupScheduler = _classThis;
})();
exports.FollowupScheduler = FollowupScheduler;
