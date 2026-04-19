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
exports.InboxResponseDto = exports.InboxMessageDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
let InboxMessageDto = (() => {
    let _merchantId_decorators;
    let _merchantId_initializers = [];
    let _merchantId_extraInitializers = [];
    let _senderId_decorators;
    let _senderId_initializers = [];
    let _senderId_extraInitializers = [];
    let _text_decorators;
    let _text_initializers = [];
    let _text_extraInitializers = [];
    let _correlationId_decorators;
    let _correlationId_initializers = [];
    let _correlationId_extraInitializers = [];
    return class InboxMessageDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _merchantId_decorators = [(0, swagger_1.ApiProperty)({
                    description: "Merchant ID",
                    example: "merchant-123",
                }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _senderId_decorators = [(0, swagger_1.ApiProperty)({
                    description: "Customer/sender ID (e.g., WhatsApp number)",
                    example: "+201234567890",
                }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _text_decorators = [(0, swagger_1.ApiProperty)({
                    description: "Message text from customer",
                    example: "عايز 2 تيشيرت أبيض مقاس لارج",
                }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(4000)];
            _correlationId_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Correlation ID for tracing",
                    example: "corr-abc-123",
                }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _merchantId_decorators, { kind: "field", name: "merchantId", static: false, private: false, access: { has: obj => "merchantId" in obj, get: obj => obj.merchantId, set: (obj, value) => { obj.merchantId = value; } }, metadata: _metadata }, _merchantId_initializers, _merchantId_extraInitializers);
            __esDecorate(null, null, _senderId_decorators, { kind: "field", name: "senderId", static: false, private: false, access: { has: obj => "senderId" in obj, get: obj => obj.senderId, set: (obj, value) => { obj.senderId = value; } }, metadata: _metadata }, _senderId_initializers, _senderId_extraInitializers);
            __esDecorate(null, null, _text_decorators, { kind: "field", name: "text", static: false, private: false, access: { has: obj => "text" in obj, get: obj => obj.text, set: (obj, value) => { obj.text = value; } }, metadata: _metadata }, _text_initializers, _text_extraInitializers);
            __esDecorate(null, null, _correlationId_decorators, { kind: "field", name: "correlationId", static: false, private: false, access: { has: obj => "correlationId" in obj, get: obj => obj.correlationId, set: (obj, value) => { obj.correlationId = value; } }, metadata: _metadata }, _correlationId_initializers, _correlationId_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        merchantId = __runInitializers(this, _merchantId_initializers, void 0);
        senderId = (__runInitializers(this, _merchantId_extraInitializers), __runInitializers(this, _senderId_initializers, void 0));
        text = (__runInitializers(this, _senderId_extraInitializers), __runInitializers(this, _text_initializers, void 0));
        correlationId = (__runInitializers(this, _text_extraInitializers), __runInitializers(this, _correlationId_initializers, void 0));
        constructor() {
            __runInitializers(this, _correlationId_extraInitializers);
        }
    };
})();
exports.InboxMessageDto = InboxMessageDto;
let InboxResponseDto = (() => {
    let _conversationId_decorators;
    let _conversationId_initializers = [];
    let _conversationId_extraInitializers = [];
    let _replyText_decorators;
    let _replyText_initializers = [];
    let _replyText_extraInitializers = [];
    let _action_decorators;
    let _action_initializers = [];
    let _action_extraInitializers = [];
    let _cart_decorators;
    let _cart_initializers = [];
    let _cart_extraInitializers = [];
    let _orderId_decorators;
    let _orderId_initializers = [];
    let _orderId_extraInitializers = [];
    let _orderNumber_decorators;
    let _orderNumber_initializers = [];
    let _orderNumber_extraInitializers = [];
    return class InboxResponseDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _conversationId_decorators = [(0, swagger_1.ApiProperty)({ description: "Conversation ID" })];
            _replyText_decorators = [(0, swagger_1.ApiProperty)({ description: "Bot reply text in Arabic" })];
            _action_decorators = [(0, swagger_1.ApiProperty)({
                    description: "Action taken by the bot",
                    enum: [
                        "greet",
                        "update_cart",
                        "collect_slots",
                        "counter_offer",
                        "accept_negotiation",
                        "reject_negotiation",
                        "order_confirmed",
                        "track_order",
                        "escalate",
                        "fallback",
                    ],
                })];
            _cart_decorators = [(0, swagger_1.ApiProperty)({
                    description: "Current cart state",
                    example: {
                        items: [{ name: "تيشيرت أبيض", quantity: 2, unitPrice: 150, total: 300 }],
                        total: 300,
                    },
                })];
            _orderId_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "Order ID if order was created" })];
            _orderNumber_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "Order number if order was created" })];
            __esDecorate(null, null, _conversationId_decorators, { kind: "field", name: "conversationId", static: false, private: false, access: { has: obj => "conversationId" in obj, get: obj => obj.conversationId, set: (obj, value) => { obj.conversationId = value; } }, metadata: _metadata }, _conversationId_initializers, _conversationId_extraInitializers);
            __esDecorate(null, null, _replyText_decorators, { kind: "field", name: "replyText", static: false, private: false, access: { has: obj => "replyText" in obj, get: obj => obj.replyText, set: (obj, value) => { obj.replyText = value; } }, metadata: _metadata }, _replyText_initializers, _replyText_extraInitializers);
            __esDecorate(null, null, _action_decorators, { kind: "field", name: "action", static: false, private: false, access: { has: obj => "action" in obj, get: obj => obj.action, set: (obj, value) => { obj.action = value; } }, metadata: _metadata }, _action_initializers, _action_extraInitializers);
            __esDecorate(null, null, _cart_decorators, { kind: "field", name: "cart", static: false, private: false, access: { has: obj => "cart" in obj, get: obj => obj.cart, set: (obj, value) => { obj.cart = value; } }, metadata: _metadata }, _cart_initializers, _cart_extraInitializers);
            __esDecorate(null, null, _orderId_decorators, { kind: "field", name: "orderId", static: false, private: false, access: { has: obj => "orderId" in obj, get: obj => obj.orderId, set: (obj, value) => { obj.orderId = value; } }, metadata: _metadata }, _orderId_initializers, _orderId_extraInitializers);
            __esDecorate(null, null, _orderNumber_decorators, { kind: "field", name: "orderNumber", static: false, private: false, access: { has: obj => "orderNumber" in obj, get: obj => obj.orderNumber, set: (obj, value) => { obj.orderNumber = value; } }, metadata: _metadata }, _orderNumber_initializers, _orderNumber_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        conversationId = __runInitializers(this, _conversationId_initializers, void 0);
        replyText = (__runInitializers(this, _conversationId_extraInitializers), __runInitializers(this, _replyText_initializers, void 0));
        action = (__runInitializers(this, _replyText_extraInitializers), __runInitializers(this, _action_initializers, void 0));
        cart = (__runInitializers(this, _action_extraInitializers), __runInitializers(this, _cart_initializers, void 0));
        orderId = (__runInitializers(this, _cart_extraInitializers), __runInitializers(this, _orderId_initializers, void 0));
        orderNumber = (__runInitializers(this, _orderId_extraInitializers), __runInitializers(this, _orderNumber_initializers, void 0));
        constructor() {
            __runInitializers(this, _orderNumber_extraInitializers);
        }
    };
})();
exports.InboxResponseDto = InboxResponseDto;
