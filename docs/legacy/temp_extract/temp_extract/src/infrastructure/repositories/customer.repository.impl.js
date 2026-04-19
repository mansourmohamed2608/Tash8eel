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
exports.CustomerRepository = void 0;
const common_1 = require("@nestjs/common");
const helpers_1 = require("../../shared/utils/helpers");
let CustomerRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var CustomerRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            CustomerRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async findById(id) {
            const result = await this.pool.query(`SELECT * FROM customers WHERE id = $1`, [id]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findByMerchantAndSender(merchantId, senderId) {
            const result = await this.pool.query(`SELECT * FROM customers WHERE merchant_id = $1 AND sender_id = $2`, [merchantId, senderId]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findByPhone(merchantId, phone) {
            const result = await this.pool.query(`SELECT * FROM customers WHERE merchant_id = $1 AND phone = $2`, [merchantId, phone]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async create(input) {
            const id = (0, helpers_1.generateId)();
            const result = await this.pool.query(`INSERT INTO customers (id, merchant_id, sender_id, phone, name, address, preferences, last_interaction_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`, [
                id,
                input.merchantId,
                input.senderId,
                input.phone || null,
                input.name || null,
                input.address ? JSON.stringify(input.address) : null,
                JSON.stringify({}),
            ]);
            return this.mapToEntity(result.rows[0]);
        }
        async update(id, input) {
            const existing = await this.findById(id);
            if (!existing)
                return null;
            const updates = [];
            const values = [];
            let paramIndex = 1;
            if (input.phone !== undefined) {
                updates.push(`phone = $${paramIndex++}`);
                values.push(input.phone);
            }
            if (input.name !== undefined) {
                updates.push(`name = $${paramIndex++}`);
                values.push(input.name);
            }
            if (input.address !== undefined) {
                updates.push(`address = $${paramIndex++}`);
                values.push(JSON.stringify(input.address));
            }
            if (input.preferences !== undefined) {
                updates.push(`preferences = $${paramIndex++}`);
                values.push(JSON.stringify({ ...existing.preferences, ...input.preferences }));
            }
            if (input.totalOrders !== undefined) {
                updates.push(`total_orders = $${paramIndex++}`);
                values.push(input.totalOrders);
            }
            if (input.lastInteractionAt !== undefined) {
                updates.push(`last_interaction_at = $${paramIndex++}`);
                values.push(input.lastInteractionAt.toISOString());
            }
            if (updates.length === 0)
                return existing;
            values.push(id);
            const result = await this.pool.query(`UPDATE customers SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`, values);
            return this.mapToEntity(result.rows[0]);
        }
        mapToEntity(row) {
            return {
                id: row.id,
                merchantId: row.merchant_id,
                senderId: row.sender_id,
                phone: row.phone,
                name: row.name,
                address: row.address,
                preferences: row.preferences,
                totalOrders: row.total_orders,
                lastInteractionAt: row.last_interaction_at
                    ? new Date(row.last_interaction_at)
                    : undefined,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            };
        }
    };
    return CustomerRepository = _classThis;
})();
exports.CustomerRepository = CustomerRepository;
