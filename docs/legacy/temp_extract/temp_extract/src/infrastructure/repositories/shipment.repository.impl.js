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
exports.ShipmentRepository = void 0;
const common_1 = require("@nestjs/common");
const helpers_1 = require("../../shared/utils/helpers");
let ShipmentRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ShipmentRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ShipmentRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async findById(id) {
            const result = await this.pool.query(`SELECT * FROM shipments WHERE id = $1`, [id]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findByOrderId(orderId) {
            const result = await this.pool.query(`SELECT * FROM shipments WHERE order_id = $1`, [orderId]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findByTrackingId(trackingId) {
            const result = await this.pool.query(`SELECT * FROM shipments WHERE tracking_id = $1`, [trackingId]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async create(input) {
            const id = (0, helpers_1.generateId)();
            const initialStatus = {
                status: "pending",
                timestamp: new Date(),
                description: "Shipment created",
            };
            const result = await this.pool.query(`INSERT INTO shipments (id, order_id, merchant_id, tracking_id, courier, status, status_history, estimated_delivery)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`, [
                id,
                input.orderId,
                input.merchantId,
                input.trackingId || null,
                input.courier || null,
                "pending",
                JSON.stringify([initialStatus]),
                input.estimatedDelivery?.toISOString() || null,
            ]);
            return this.mapToEntity(result.rows[0]);
        }
        async update(id, input) {
            const updates = [];
            const values = [];
            let paramIndex = 1;
            if (input.trackingId !== undefined) {
                updates.push(`tracking_id = $${paramIndex++}`);
                values.push(input.trackingId);
            }
            if (input.courier !== undefined) {
                updates.push(`courier = $${paramIndex++}`);
                values.push(input.courier);
            }
            if (input.status !== undefined) {
                updates.push(`status = $${paramIndex++}`);
                values.push(input.status);
            }
            if (input.estimatedDelivery !== undefined) {
                updates.push(`estimated_delivery = $${paramIndex++}`);
                values.push(input.estimatedDelivery.toISOString());
            }
            if (input.actualDelivery !== undefined) {
                updates.push(`actual_delivery = $${paramIndex++}`);
                values.push(input.actualDelivery.toISOString());
            }
            if (updates.length === 0)
                return this.findById(id);
            values.push(id);
            const result = await this.pool.query(`UPDATE shipments SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`, values);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async addStatusEntry(id, status, description) {
            const entry = { status, timestamp: new Date(), description };
            const result = await this.pool.query(`UPDATE shipments 
       SET status = $1, status_history = status_history || $2::jsonb
       WHERE id = $3
       RETURNING *`, [status, JSON.stringify(entry), id]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async updateStatus(id, status, description) {
            return this.addStatusEntry(id, status, description);
        }
        mapToEntity(row) {
            return {
                id: row.id,
                orderId: row.order_id,
                merchantId: row.merchant_id,
                trackingId: row.tracking_id,
                courier: row.courier,
                status: row.status,
                statusHistory: row.status_history,
                estimatedDelivery: row.estimated_delivery
                    ? new Date(row.estimated_delivery)
                    : undefined,
                actualDelivery: row.actual_delivery
                    ? new Date(row.actual_delivery)
                    : undefined,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            };
        }
    };
    return ShipmentRepository = _classThis;
})();
exports.ShipmentRepository = ShipmentRepository;
