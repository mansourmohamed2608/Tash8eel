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
exports.OrderRepository = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("../../shared/constants/enums");
const helpers_1 = require("../../shared/utils/helpers");
let OrderRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var OrderRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            OrderRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async findById(id) {
            const result = await this.pool.query(`SELECT * FROM orders WHERE id = $1`, [
                id,
            ]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findByOrderNumber(merchantId, orderNumber) {
            const result = await this.pool.query(`SELECT * FROM orders WHERE merchant_id = $1 AND order_number = $2`, [merchantId, orderNumber]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findByIdempotencyKey(key) {
            const result = await this.pool.query(`SELECT * FROM orders WHERE idempotency_key = $1`, [key]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findByMerchant(merchantId, limit = 100) {
            const result = await this.pool.query(`SELECT * FROM orders WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2`, [merchantId, limit]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async findByMerchantAndDateRange(merchantId, startDate, endDate) {
            const result = await this.pool.query(`SELECT * FROM orders 
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at < $3
       ORDER BY created_at DESC`, [merchantId, startDate.toISOString(), endDate.toISOString()]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async create(input) {
            const id = (0, helpers_1.generateId)();
            const result = await this.pool.query(`INSERT INTO orders (id, merchant_id, conversation_id, customer_id, order_number, status, items, subtotal, discount, delivery_fee, total, customer_name, customer_phone, delivery_address, delivery_notes, delivery_preference, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`, [
                id,
                input.merchantId,
                input.conversationId,
                input.customerId || null,
                input.orderNumber,
                enums_1.OrderStatus.DRAFT,
                JSON.stringify(input.items),
                input.subtotal,
                input.discount || 0,
                input.deliveryFee || 0,
                input.total,
                input.customerName || null,
                input.customerPhone || null,
                input.deliveryAddress ? JSON.stringify(input.deliveryAddress) : null,
                input.deliveryNotes || null,
                input.deliveryPreference || null,
                input.idempotencyKey || null,
            ]);
            return this.mapToEntity(result.rows[0]);
        }
        async update(id, input) {
            const updates = [];
            const values = [];
            let paramIndex = 1;
            if (input.status !== undefined) {
                updates.push(`status = $${paramIndex++}`);
                values.push(input.status);
            }
            if (input.deliveryFee !== undefined) {
                updates.push(`delivery_fee = $${paramIndex++}`);
                values.push(input.deliveryFee);
            }
            if (input.total !== undefined) {
                updates.push(`total = $${paramIndex++}`);
                values.push(input.total);
            }
            if (updates.length === 0)
                return this.findById(id);
            values.push(id);
            const result = await this.pool.query(`UPDATE orders SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`, values);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async countByMerchantAndDate(merchantId, date) {
            const result = await this.pool.query(`SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND DATE(created_at) = $2`, [merchantId, date]);
            return parseInt(result.rows[0].count, 10);
        }
        async sumRevenueByMerchantAndDate(merchantId, date) {
            const result = await this.pool.query(`SELECT COALESCE(SUM(total), 0) as revenue FROM orders 
       WHERE merchant_id = $1 AND DATE(created_at) = $2 AND status NOT IN ('CANCELLED', 'DRAFT')`, [merchantId, date]);
            return parseFloat(result.rows[0].revenue);
        }
        async countByMerchantDateAndStatus(merchantId, date, status) {
            const result = await this.pool.query(`SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND DATE(created_at) = $2 AND status = $3`, [merchantId, date, status]);
            return parseInt(result.rows[0].count, 10);
        }
        mapToEntity(row) {
            return {
                id: row.id,
                merchantId: row.merchant_id,
                conversationId: row.conversation_id,
                customerId: row.customer_id,
                orderNumber: row.order_number,
                status: row.status,
                items: row.items,
                subtotal: parseFloat(row.subtotal),
                discount: parseFloat(row.discount),
                deliveryFee: parseFloat(row.delivery_fee),
                total: parseFloat(row.total),
                customerName: row.customer_name,
                customerPhone: row.customer_phone,
                deliveryAddress: row.delivery_address,
                deliveryNotes: row.delivery_notes,
                deliveryPreference: row.delivery_preference,
                idempotencyKey: row.idempotency_key,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            };
        }
    };
    return OrderRepository = _classThis;
})();
exports.OrderRepository = OrderRepository;
