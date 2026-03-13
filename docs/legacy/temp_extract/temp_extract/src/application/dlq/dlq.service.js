"use strict";
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DlqService = void 0;
const common_1 = require("@nestjs/common");
let DlqService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var DlqService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DlqService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        outboxService;
        logger = new common_1.Logger(DlqService.name);
        constructor(pool, outboxService) {
            this.pool = pool;
            this.outboxService = outboxService;
        }
        /**
         * Get all DLQ events with pagination
         */
        async listEvents(limit = 50, offset = 0, merchantId) {
            let query = `
      SELECT *, COUNT(*) OVER() as total_count
      FROM dlq_events
      WHERE replayed_at IS NULL
    `;
            const params = [];
            let paramIndex = 1;
            if (merchantId) {
                query += ` AND merchant_id = $${paramIndex++}`;
                params.push(merchantId);
            }
            query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
            params.push(limit, offset);
            const result = await this.pool.query(query, params);
            const events = result.rows.map((row) => this.mapToEventWithDetails(row));
            const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
            return { events, total };
        }
        /**
         * Get single DLQ event by ID
         */
        async getEventById(eventId) {
            const query = `SELECT * FROM dlq_events WHERE id = $1`;
            const result = await this.pool.query(query, [eventId]);
            if (result.rows.length === 0) {
                return null;
            }
            return this.mapToEventWithDetails(result.rows[0]);
        }
        /**
         * Replay a single DLQ event
         */
        async replayEvent(eventId) {
            const event = await this.getEventById(eventId);
            if (!event) {
                throw new common_1.NotFoundException(`DLQ event ${eventId} not found`);
            }
            if (event.replayedAt) {
                return {
                    success: false,
                    error: "Event has already been replayed",
                };
            }
            this.logger.log({
                msg: "Replaying DLQ event",
                dlqEventId: eventId,
                eventType: event.eventType,
                originalEventId: event.originalEventId,
            });
            try {
                // Re-publish to outbox
                const newEvent = await this.outboxService.publishEvent({
                    eventType: event.eventType,
                    aggregateType: event.aggregateType,
                    aggregateId: event.aggregateId,
                    payload: event.payload,
                    merchantId: event.merchantId,
                    correlationId: event.correlationId,
                });
                // Mark as replayed
                await this.markAsReplayed(eventId);
                this.logger.log({
                    msg: "DLQ event replayed successfully",
                    dlqEventId: eventId,
                    newEventId: newEvent.id,
                });
                return {
                    success: true,
                    newEventId: newEvent.id,
                };
            }
            catch (error) {
                this.logger.error({
                    msg: "Failed to replay DLQ event",
                    dlqEventId: eventId,
                    error: error.message,
                });
                return {
                    success: false,
                    error: error.message,
                };
            }
        }
        /**
         * Replay multiple DLQ events
         */
        async replayBatch(eventIds) {
            const results = [];
            for (const eventId of eventIds) {
                try {
                    const result = await this.replayEvent(eventId);
                    results.push({
                        eventId,
                        success: result.success,
                        error: result.error,
                    });
                }
                catch (error) {
                    results.push({
                        eventId,
                        success: false,
                        error: error.message,
                    });
                }
            }
            const succeeded = results.filter((r) => r.success).length;
            const failed = results.filter((r) => !r.success).length;
            return {
                total: eventIds.length,
                succeeded,
                failed,
                results,
            };
        }
        /**
         * Replay all pending DLQ events for a merchant
         */
        async replayAllForMerchant(merchantId) {
            const { events } = await this.listEvents(1000, 0, merchantId);
            const eventIds = events.map((e) => e.id);
            if (eventIds.length === 0) {
                return { total: 0, succeeded: 0, failed: 0 };
            }
            const result = await this.replayBatch(eventIds);
            return {
                total: result.total,
                succeeded: result.succeeded,
                failed: result.failed,
            };
        }
        /**
         * Delete a DLQ event (after investigation)
         */
        async deleteEvent(eventId) {
            const query = `DELETE FROM dlq_events WHERE id = $1 RETURNING id`;
            const result = await this.pool.query(query, [eventId]);
            if (result.rowCount === 0) {
                throw new common_1.NotFoundException(`DLQ event ${eventId} not found`);
            }
            this.logger.log({
                msg: "DLQ event deleted",
                dlqEventId: eventId,
            });
            return true;
        }
        /**
         * Get DLQ statistics
         */
        async getStats() {
            const statsQuery = `
      SELECT 
        COUNT(*) as total,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM dlq_events
      WHERE replayed_at IS NULL
    `;
            const byTypeQuery = `
      SELECT event_type, COUNT(*) as count
      FROM dlq_events
      WHERE replayed_at IS NULL
      GROUP BY event_type
    `;
            const byMerchantQuery = `
      SELECT merchant_id, COUNT(*) as count
      FROM dlq_events
      WHERE replayed_at IS NULL
      GROUP BY merchant_id
    `;
            const [statsResult, typeResult, merchantResult] = await Promise.all([
                this.pool.query(statsQuery),
                this.pool.query(byTypeQuery),
                this.pool.query(byMerchantQuery),
            ]);
            const stats = statsResult.rows[0];
            const byEventType = {};
            const byMerchant = {};
            for (const row of typeResult.rows) {
                byEventType[row.event_type] = parseInt(row.count, 10);
            }
            for (const row of merchantResult.rows) {
                byMerchant[row.merchant_id] = parseInt(row.count, 10);
            }
            return {
                totalPending: parseInt(stats.total, 10),
                byEventType,
                byMerchant,
                oldest: stats.oldest,
                newest: stats.newest,
            };
        }
        /**
         * Mark event as replayed
         */
        async markAsReplayed(eventId) {
            const query = `
      UPDATE dlq_events
      SET replayed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;
            await this.pool.query(query, [eventId]);
        }
        mapToEventWithDetails(row) {
            const createdAt = new Date(row.created_at);
            const ageInHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
            return {
                id: row.id,
                originalEventId: row.original_event_id,
                eventType: row.event_type,
                aggregateType: row.aggregate_type,
                aggregateId: row.aggregate_id,
                payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
                error: row.error_message || row.error,
                retryCount: row.retry_count,
                merchantId: row.merchant_id,
                correlationId: row.correlation_id,
                status: row.status || "pending",
                maxRetries: row.max_retries || 3,
                replayedAt: row.replayed_at,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
        }
    };
    return DlqService = _classThis;
})();
exports.DlqService = DlqService;
