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
exports.EventRepository = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("../../shared/constants/enums");
const helpers_1 = require("../../shared/utils/helpers");
let EventRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var EventRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            EventRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        // ============= Outbox Events =============
        async createOutboxEvent(input) {
            const id = (0, helpers_1.generateId)();
            const result = await this.pool.query(`INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, merchant_id, payload, correlation_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`, [
                id,
                input.eventType,
                input.aggregateType,
                input.aggregateId,
                input.merchantId || null,
                JSON.stringify(input.payload),
                input.correlationId || null,
                enums_1.EventStatus.PENDING,
            ]);
            return this.mapOutboxEvent(result.rows[0]);
        }
        async findPendingOutboxEvents(limit) {
            const result = await this.pool.query(`SELECT * FROM outbox_events 
       WHERE status = $1 
       ORDER BY created_at ASC 
       LIMIT $2
       FOR UPDATE SKIP LOCKED`, [enums_1.EventStatus.PENDING, limit]);
            return result.rows.map((row) => this.mapOutboxEvent(row));
        }
        async updateOutboxEventStatus(id, status, error) {
            const result = await this.pool.query(`UPDATE outbox_events SET status = $1, error = $2 WHERE id = $3 RETURNING *`, [status, error || null, id]);
            return result.rows[0] ? this.mapOutboxEvent(result.rows[0]) : null;
        }
        async markOutboxEventProcessed(id) {
            const result = await this.pool.query(`UPDATE outbox_events SET status = $1, processed_at = NOW() WHERE id = $2 RETURNING *`, [enums_1.EventStatus.COMPLETED, id]);
            return result.rows[0] ? this.mapOutboxEvent(result.rows[0]) : null;
        }
        async incrementOutboxRetryCount(id) {
            const result = await this.pool.query(`UPDATE outbox_events SET retry_count = retry_count + 1 WHERE id = $1 RETURNING *`, [id]);
            return result.rows[0] ? this.mapOutboxEvent(result.rows[0]) : null;
        }
        // ============= DLQ Events =============
        async createDlqEvent(input) {
            const id = (0, helpers_1.generateId)();
            const result = await this.pool.query(`INSERT INTO dlq_events (id, original_event_id, event_type, payload, error, stack, correlation_id, merchant_id, status, max_retries, next_retry_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`, [
                id,
                input.originalEventId || null,
                input.eventType,
                JSON.stringify(input.payload),
                input.error,
                input.stack || null,
                input.correlationId || null,
                input.merchantId || null,
                enums_1.DlqStatus.PENDING,
                input.maxRetries || 5,
                new Date(Date.now() + 60000).toISOString(), // First retry in 1 minute
            ]);
            return this.mapDlqEvent(result.rows[0]);
        }
        async findDlqEventById(id) {
            const result = await this.pool.query(`SELECT * FROM dlq_events WHERE id = $1`, [id]);
            return result.rows[0] ? this.mapDlqEvent(result.rows[0]) : null;
        }
        async findPendingDlqEvents(limit) {
            const result = await this.pool.query(`SELECT * FROM dlq_events WHERE status IN ($1, $2) ORDER BY created_at ASC LIMIT $3`, [enums_1.DlqStatus.PENDING, enums_1.DlqStatus.RETRYING, limit]);
            return result.rows.map((row) => this.mapDlqEvent(row));
        }
        async findDlqEventsForRetry(before, limit) {
            const result = await this.pool.query(`SELECT * FROM dlq_events 
       WHERE status IN ($1, $2) 
       AND next_retry_at <= $3
       AND retry_count < max_retries
       ORDER BY next_retry_at ASC 
       LIMIT $4`, [enums_1.DlqStatus.PENDING, enums_1.DlqStatus.RETRYING, before.toISOString(), limit]);
            return result.rows.map((row) => this.mapDlqEvent(row));
        }
        async updateDlqEventStatus(id, status) {
            const result = await this.pool.query(`UPDATE dlq_events SET status = $1 WHERE id = $2 RETURNING *`, [status, id]);
            return result.rows[0] ? this.mapDlqEvent(result.rows[0]) : null;
        }
        async incrementDlqRetryCount(id, nextRetryAt) {
            const result = await this.pool.query(`UPDATE dlq_events SET retry_count = retry_count + 1, next_retry_at = $1, status = $2 WHERE id = $3 RETURNING *`, [nextRetryAt.toISOString(), enums_1.DlqStatus.RETRYING, id]);
            return result.rows[0] ? this.mapDlqEvent(result.rows[0]) : null;
        }
        async resolveDlqEvent(id) {
            const result = await this.pool.query(`UPDATE dlq_events SET status = $1, resolved_at = NOW() WHERE id = $2 RETURNING *`, [enums_1.DlqStatus.RESOLVED, id]);
            return result.rows[0] ? this.mapDlqEvent(result.rows[0]) : null;
        }
        async countDlqEvents() {
            const result = await this.pool.query(`SELECT COUNT(*) FROM dlq_events WHERE status IN ($1, $2)`, [enums_1.DlqStatus.PENDING, enums_1.DlqStatus.RETRYING]);
            return parseInt(result.rows[0].count, 10);
        }
        // ============= Reports =============
        async createOrUpdateReport(merchantId, reportDate, summary) {
            const result = await this.pool.query(`INSERT INTO merchant_reports (id, merchant_id, report_date, summary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (merchant_id, report_date)
       DO UPDATE SET summary = $4
       RETURNING *`, [(0, helpers_1.generateId)(), merchantId, reportDate, JSON.stringify(summary)]);
            return this.mapReport(result.rows[0]);
        }
        async findReportByDate(merchantId, reportDate) {
            const result = await this.pool.query(`SELECT * FROM merchant_reports WHERE merchant_id = $1 AND report_date = $2`, [merchantId, reportDate]);
            return result.rows[0] ? this.mapReport(result.rows[0]) : null;
        }
        // ============= Mappers =============
        mapOutboxEvent(row) {
            return {
                id: row.id,
                eventType: row.event_type,
                aggregateType: row.aggregate_type,
                aggregateId: row.aggregate_id,
                merchantId: row.merchant_id,
                payload: row.payload,
                correlationId: row.correlation_id,
                status: row.status,
                processedAt: row.processed_at
                    ? new Date(row.processed_at)
                    : undefined,
                error: row.error,
                retryCount: row.retry_count,
                createdAt: new Date(row.created_at),
            };
        }
        mapDlqEvent(row) {
            return {
                id: row.id,
                originalEventId: row.original_event_id,
                eventType: row.event_type,
                payload: row.payload,
                error: row.error,
                stack: row.stack,
                correlationId: row.correlation_id,
                merchantId: row.merchant_id,
                status: row.status,
                retryCount: row.retry_count,
                maxRetries: row.max_retries,
                nextRetryAt: row.next_retry_at
                    ? new Date(row.next_retry_at)
                    : undefined,
                resolvedAt: row.resolved_at
                    ? new Date(row.resolved_at)
                    : undefined,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            };
        }
        mapReport(row) {
            return {
                id: row.id,
                merchantId: row.merchant_id,
                reportDate: row.report_date,
                summary: row.summary,
                createdAt: new Date(row.created_at),
            };
        }
    };
    return EventRepository = _classThis;
})();
exports.EventRepository = EventRepository;
