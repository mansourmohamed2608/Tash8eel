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
exports.ConversationRepository = void 0;
const common_1 = require("@nestjs/common");
const enums_1 = require("../../shared/constants/enums");
const helpers_1 = require("../../shared/utils/helpers");
let ConversationRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ConversationRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ConversationRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async findById(id) {
            const result = await this.pool.query(`SELECT * FROM conversations WHERE id = $1`, [id]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findByMerchantAndSender(merchantId, senderId) {
            const result = await this.pool.query(`SELECT * FROM conversations 
       WHERE merchant_id = $1 AND sender_id = $2 
       AND state NOT IN ('CLOSED')
       ORDER BY created_at DESC LIMIT 1`, [merchantId, senderId]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findPendingFollowups(before) {
            const result = await this.pool.query(`SELECT * FROM conversations 
       WHERE next_followup_at IS NOT NULL 
       AND next_followup_at <= $1
       AND state NOT IN ('CLOSED', 'ORDER_PLACED')
       ORDER BY next_followup_at ASC`, [before.toISOString()]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async create(input) {
            const id = input.id || (0, helpers_1.generateId)();
            const result = await this.pool.query(`INSERT INTO conversations (id, merchant_id, sender_id, customer_id, state, context, cart, collected_info, missing_slots)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`, [
                id,
                input.merchantId,
                input.senderId,
                input.customerId || null,
                enums_1.ConversationState.GREETING,
                JSON.stringify({}),
                JSON.stringify({ items: [], subtotal: 0, discount: 0, total: 0 }),
                JSON.stringify({}),
                [],
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
            if (input.state !== undefined) {
                updates.push(`state = $${paramIndex++}`);
                values.push(input.state);
            }
            if (input.context !== undefined) {
                updates.push(`context = $${paramIndex++}`);
                values.push(JSON.stringify({ ...existing.context, ...input.context }));
            }
            if (input.cart !== undefined) {
                updates.push(`cart = $${paramIndex++}`);
                const mergedCart = { ...existing.cart, ...input.cart };
                values.push(JSON.stringify(mergedCart));
            }
            if (input.collectedInfo !== undefined) {
                updates.push(`collected_info = $${paramIndex++}`);
                values.push(JSON.stringify({ ...existing.collectedInfo, ...input.collectedInfo }));
            }
            if (input.missingSlots !== undefined) {
                updates.push(`missing_slots = $${paramIndex++}`);
                values.push(input.missingSlots);
            }
            if (input.lastMessageAt !== undefined) {
                updates.push(`last_message_at = $${paramIndex++}`);
                values.push(input.lastMessageAt.toISOString());
            }
            if (input.followupCount !== undefined) {
                updates.push(`followup_count = $${paramIndex++}`);
                values.push(input.followupCount);
            }
            if (input.nextFollowupAt !== undefined) {
                updates.push(`next_followup_at = $${paramIndex++}`);
                values.push(input.nextFollowupAt?.toISOString() || null);
            }
            if (input.customerId !== undefined) {
                updates.push(`customer_id = $${paramIndex++}`);
                values.push(input.customerId);
            }
            if (updates.length === 0)
                return existing;
            values.push(id);
            const result = await this.pool.query(`UPDATE conversations SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`, values);
            return this.mapToEntity(result.rows[0]);
        }
        async countByMerchantAndDate(merchantId, date) {
            const result = await this.pool.query(`SELECT COUNT(*) FROM conversations 
       WHERE merchant_id = $1 AND DATE(created_at) = $2`, [merchantId, date]);
            return parseInt(result.rows[0].count, 10);
        }
        mapToEntity(row) {
            return {
                id: row.id,
                merchantId: row.merchant_id,
                customerId: row.customer_id,
                senderId: row.sender_id,
                state: row.state,
                context: row.context,
                cart: row.cart,
                collectedInfo: row.collected_info,
                missingSlots: row.missing_slots,
                lastMessageAt: row.last_message_at
                    ? new Date(row.last_message_at)
                    : undefined,
                followupCount: row.followup_count,
                nextFollowupAt: row.next_followup_at
                    ? new Date(row.next_followup_at)
                    : undefined,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            };
        }
    };
    return ConversationRepository = _classThis;
})();
exports.ConversationRepository = ConversationRepository;
