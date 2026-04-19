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
exports.MerchantRepository = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("../../shared/constants/enums");
const logger_1 = require("../../shared/logging/logger");
const logger = (0, logger_1.createLogger)("MerchantRepository");
let MerchantRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MerchantRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            MerchantRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async findById(id) {
            const result = await this.pool.query(`SELECT * FROM merchants WHERE id = $1`, [id]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findAll() {
            const result = await this.pool.query(`SELECT * FROM merchants ORDER BY created_at DESC`);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async findActive() {
            const result = await this.pool.query(`SELECT * FROM merchants WHERE is_active = true ORDER BY created_at DESC`);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async create(input) {
            const result = await this.pool.query(`INSERT INTO merchants (id, name, category, config, branding, negotiation_rules, delivery_rules, daily_token_budget)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`, [
                input.id,
                input.name,
                input.category || enums_1.MerchantCategory.GENERIC,
                JSON.stringify(input.config || {}),
                JSON.stringify(input.branding || {}),
                JSON.stringify(input.negotiationRules || {}),
                JSON.stringify(input.deliveryRules || {}),
                input.dailyTokenBudget || 100000,
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
            if (input.name !== undefined) {
                updates.push(`name = $${paramIndex++}`);
                values.push(input.name);
            }
            if (input.category !== undefined) {
                updates.push(`category = $${paramIndex++}`);
                values.push(input.category);
            }
            if (input.config !== undefined) {
                updates.push(`config = $${paramIndex++}`);
                values.push(JSON.stringify({ ...existing.config, ...input.config }));
            }
            if (input.branding !== undefined) {
                updates.push(`branding = $${paramIndex++}`);
                values.push(JSON.stringify({ ...existing.branding, ...input.branding }));
            }
            if (input.negotiationRules !== undefined) {
                updates.push(`negotiation_rules = $${paramIndex++}`);
                values.push(JSON.stringify({
                    ...existing.negotiationRules,
                    ...input.negotiationRules,
                }));
            }
            if (input.deliveryRules !== undefined) {
                updates.push(`delivery_rules = $${paramIndex++}`);
                values.push(JSON.stringify({ ...existing.deliveryRules, ...input.deliveryRules }));
            }
            if (input.dailyTokenBudget !== undefined) {
                updates.push(`daily_token_budget = $${paramIndex++}`);
                values.push(input.dailyTokenBudget);
            }
            if (input.isActive !== undefined) {
                updates.push(`is_active = $${paramIndex++}`);
                values.push(input.isActive);
            }
            if (updates.length === 0)
                return existing;
            values.push(id);
            const result = await this.pool.query(`UPDATE merchants SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`, values);
            return this.mapToEntity(result.rows[0]);
        }
        async delete(id) {
            const result = await this.pool.query(`DELETE FROM merchants WHERE id = $1`, [id]);
            return (result.rowCount ?? 0) > 0;
        }
        async getTokenUsage(merchantId, date) {
            const result = await this.pool.query(`SELECT * FROM merchant_token_usage WHERE merchant_id = $1 AND usage_date = $2`, [merchantId, date]);
            return result.rows[0] ? this.mapTokenUsage(result.rows[0]) : null;
        }
        async incrementTokenUsage(merchantId, date, tokens) {
            const result = await this.pool.query(`INSERT INTO merchant_token_usage (merchant_id, usage_date, tokens_used, llm_calls)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (merchant_id, usage_date)
       DO UPDATE SET tokens_used = merchant_token_usage.tokens_used + $3, 
                     llm_calls = merchant_token_usage.llm_calls + 1
       RETURNING *`, [merchantId, date, tokens]);
            return this.mapTokenUsage(result.rows[0]);
        }
        mapToEntity(row) {
            return {
                id: row.id,
                name: row.name,
                category: row.category,
                config: row.config,
                branding: row.branding,
                negotiationRules: row.negotiation_rules,
                deliveryRules: row.delivery_rules,
                dailyTokenBudget: row.daily_token_budget,
                isActive: row.is_active,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            };
        }
        mapTokenUsage(row) {
            return {
                id: row.id,
                merchantId: row.merchant_id,
                usageDate: row.usage_date,
                tokensUsed: row.tokens_used,
                llmCalls: row.llm_calls,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            };
        }
    };
    return MerchantRepository = _classThis;
})();
exports.MerchantRepository = MerchantRepository;
