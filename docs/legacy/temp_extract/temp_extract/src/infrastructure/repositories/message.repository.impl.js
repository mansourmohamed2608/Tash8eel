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
exports.MessageRepository = void 0;
const common_1 = require("@nestjs/common");
const helpers_1 = require("../../shared/utils/helpers");
let MessageRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MessageRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            MessageRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async findById(id) {
            const result = await this.pool.query(`SELECT * FROM messages WHERE id = $1`, [id]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findByConversation(conversationId) {
            const result = await this.pool.query(`SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`, [conversationId]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async findByProviderMessageId(merchantId, providerMessageId) {
            const result = await this.pool.query(`SELECT * FROM messages WHERE merchant_id = $1 AND provider_message_id = $2`, [merchantId, providerMessageId]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async create(input) {
            const id = (0, helpers_1.generateId)();
            const result = await this.pool.query(`INSERT INTO messages (id, conversation_id, merchant_id, provider_message_id, direction, sender_id, text, attachments, metadata, llm_used, tokens_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`, [
                id,
                input.conversationId,
                input.merchantId,
                input.providerMessageId || null,
                input.direction,
                input.senderId,
                input.text || null,
                JSON.stringify(input.attachments || []),
                JSON.stringify(input.metadata || {}),
                input.llmUsed || false,
                input.tokensUsed || 0,
            ]);
            return this.mapToEntity(result.rows[0]);
        }
        async countByMerchantAndDate(merchantId, date) {
            const result = await this.pool.query(`SELECT COUNT(*) FROM messages WHERE merchant_id = $1 AND DATE(created_at) = $2`, [merchantId, date]);
            return parseInt(result.rows[0].count, 10);
        }
        mapToEntity(row) {
            return {
                id: row.id,
                conversationId: row.conversation_id,
                merchantId: row.merchant_id,
                providerMessageId: row.provider_message_id,
                direction: row.direction,
                senderId: row.sender_id,
                text: row.text,
                attachments: row.attachments,
                metadata: row.metadata,
                llmUsed: row.llm_used,
                tokensUsed: row.tokens_used,
                createdAt: new Date(row.created_at),
            };
        }
    };
    return MessageRepository = _classThis;
})();
exports.MessageRepository = MessageRepository;
