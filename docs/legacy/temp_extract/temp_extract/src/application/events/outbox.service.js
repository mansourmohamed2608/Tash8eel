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
exports.OutboxService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
let OutboxService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var OutboxService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            OutboxService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        logger = new common_1.Logger(OutboxService.name);
        constructor(pool) {
            this.pool = pool;
        }
        /**
         * Publish event to outbox (transactionally with other DB operations)
         * This should be called within a transaction for consistency
         */
        async publishEvent(params) {
            const id = (0, uuid_1.v4)();
            const now = new Date();
            const query = `
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, 
        payload, status, merchant_id, correlation_id,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      RETURNING *
    `;
            const result = await this.pool.query(query, [
                id,
                params.eventType,
                params.aggregateType,
                params.aggregateId,
                JSON.stringify(params.payload),
                "PENDING",
                params.merchantId,
                params.correlationId || (0, uuid_1.v4)(),
                now,
            ]);
            this.logger.log({
                msg: "Event published to outbox",
                eventId: id,
                eventType: params.eventType,
                aggregateType: params.aggregateType,
                aggregateId: params.aggregateId,
                merchantId: params.merchantId,
            });
            return this.mapToEntity(result.rows[0]);
        }
        /**
         * Publish event within existing transaction
         */
        async publishEventInTransaction(client, params) {
            const id = (0, uuid_1.v4)();
            const now = new Date();
            const query = `
      INSERT INTO outbox_events (
        id, event_type, aggregate_type, aggregate_id, 
        payload, status, merchant_id, correlation_id,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      RETURNING *
    `;
            const result = await client.query(query, [
                id,
                params.eventType,
                params.aggregateType,
                params.aggregateId,
                JSON.stringify(params.payload),
                "PENDING",
                params.merchantId,
                params.correlationId || (0, uuid_1.v4)(),
                now,
            ]);
            return this.mapToEntity(result.rows[0]);
        }
        /**
         * Fetch pending events for processing (with locking)
         */
        async fetchPendingEvents(limit = 100) {
            const query = `
      SELECT * FROM outbox_events
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    `;
            const result = await this.pool.query(query, [limit]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        /**
         * Mark event as processed
         */
        async markProcessed(eventId) {
            const query = `
      UPDATE outbox_events
      SET status = 'COMPLETED', processed_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;
            await this.pool.query(query, [eventId]);
            this.logger.debug({ msg: "Event marked as processed", eventId });
        }
        /**
         * Mark event as failed and potentially move to DLQ
         */
        async markFailed(eventId, error, moveToDlq = false) {
            const client = await this.pool.connect();
            try {
                await client.query("BEGIN");
                // Increment retry count
                const updateQuery = `
        UPDATE outbox_events
        SET status = 'FAILED', 
            error = $2, 
            retry_count = retry_count + 1,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
                const result = await client.query(updateQuery, [eventId, error]);
                const event = result.rows[0];
                // Move to DLQ if needed (retry count >= 5 or explicitly requested)
                if (moveToDlq || (event && event.retry_count >= 5)) {
                    await this.moveToDlq(client, eventId, event, error);
                }
                await client.query("COMMIT");
            }
            catch (err) {
                await client.query("ROLLBACK");
                throw err;
            }
            finally {
                client.release();
            }
        }
        /**
         * Move event to Dead Letter Queue
         */
        async moveToDlq(client, eventId, event, error) {
            const dlqId = (0, uuid_1.v4)();
            const now = new Date();
            // Insert into DLQ
            const insertQuery = `
      INSERT INTO dlq_events (
        id, original_event_id, event_type, aggregate_type, aggregate_id,
        payload, error_message, retry_count, merchant_id, correlation_id,
        original_created_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
    `;
            await client.query(insertQuery, [
                dlqId,
                eventId,
                event.event_type,
                event.aggregate_type,
                event.aggregate_id,
                event.payload,
                error,
                event.retry_count,
                event.merchant_id,
                event.correlation_id,
                event.created_at,
                now,
            ]);
            // Mark original as moved to DLQ
            const updateQuery = `
      UPDATE outbox_events
      SET status = 'dlq', updated_at = NOW()
      WHERE id = $1
    `;
            await client.query(updateQuery, [eventId]);
            this.logger.warn({
                msg: "Event moved to DLQ",
                eventId,
                dlqEventId: dlqId,
                eventType: event.event_type,
                retryCount: event.retry_count,
                error,
            });
        }
        /**
         * Retry processing a pending event
         */
        async retryEvent(eventId) {
            const query = `
      UPDATE outbox_events
      SET status = 'PENDING', updated_at = NOW()
      WHERE id = $1 AND status = 'FAILED'
    `;
            await this.pool.query(query, [eventId]);
        }
        /**
         * Get event by ID
         */
        async getEventById(eventId) {
            const query = `SELECT * FROM outbox_events WHERE id = $1`;
            const result = await this.pool.query(query, [eventId]);
            if (result.rows.length === 0) {
                return null;
            }
            return this.mapToEntity(result.rows[0]);
        }
        /**
         * Get events by aggregate
         */
        async getEventsByAggregate(aggregateType, aggregateId, merchantId) {
            const query = `
      SELECT * FROM outbox_events
      WHERE aggregate_type = $1 
        AND aggregate_id = $2 
        AND merchant_id = $3
      ORDER BY created_at ASC
    `;
            const result = await this.pool.query(query, [
                aggregateType,
                aggregateId,
                merchantId,
            ]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        /**
         * Get event statistics
         */
        async getEventStats() {
            const query = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as processed,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
        COUNT(*) FILTER (WHERE status = 'FAILED' AND retry_count >= 5) as dlq
      FROM outbox_events
    `;
            const result = await this.pool.query(query);
            const row = result.rows[0];
            return {
                pending: parseInt(row.pending, 10),
                processed: parseInt(row.processed, 10),
                failed: parseInt(row.failed, 10),
                dlq: parseInt(row.dlq, 10),
            };
        }
        /**
         * Cleanup old processed events
         */
        async cleanupOldEvents(daysToKeep = 30) {
            const query = `
      DELETE FROM outbox_events
      WHERE status = 'processed' 
        AND processed_at < NOW() - INTERVAL '1 day' * $1
    `;
            const result = await this.pool.query(query, [daysToKeep]);
            this.logger.log({
                msg: "Cleaned up old processed events",
                deletedCount: result.rowCount,
                daysKept: daysToKeep,
            });
            return result.rowCount || 0;
        }
        mapToEntity(row) {
            return {
                id: row.id,
                eventType: row.event_type,
                aggregateType: row.aggregate_type,
                aggregateId: row.aggregate_id,
                payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
                status: row.status,
                errorMessage: row.error_message,
                retryCount: row.retry_count,
                merchantId: row.merchant_id,
                correlationId: row.correlation_id,
                processedAt: row.processed_at,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
        }
    };
    return OutboxService = _classThis;
})();
exports.OutboxService = OutboxService;
