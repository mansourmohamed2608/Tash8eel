"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const inbox_dto_1 = require("../dto/inbox.dto");
let InboxController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)("Inbox"), (0, common_1.Controller)("v1/inbox")];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _processMessage_decorators;
    var InboxController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _processMessage_decorators = [(0, common_1.Post)("message"), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                    summary: "Process incoming customer message",
                    description: "Main endpoint for processing customer messages. Handles order extraction, negotiation, slot filling, and order confirmation.",
                }), (0, swagger_1.ApiHeader)({
                    name: "x-correlation-id",
                    required: false,
                    description: "Correlation ID for request tracing",
                }), (0, swagger_1.ApiResponse)({
                    status: 200,
                    description: "Message processed successfully",
                    type: inbox_dto_1.InboxResponseDto,
                }), (0, swagger_1.ApiResponse)({ status: 400, description: "Invalid request body" }), (0, swagger_1.ApiResponse)({ status: 404, description: "Merchant not found" }), (0, swagger_1.ApiResponse)({ status: 429, description: "Token budget exceeded" })];
            __esDecorate(this, null, _processMessage_decorators, { kind: "method", name: "processMessage", static: false, private: false, access: { has: obj => "processMessage" in obj, get: obj => obj.processMessage }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            InboxController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        inboxService = __runInitializers(this, _instanceExtraInitializers);
        logger = new common_1.Logger(InboxController.name);
        constructor(inboxService) {
            this.inboxService = inboxService;
        }
        async processMessage(dto, correlationId) {
            this.logger.log({
                msg: "Incoming message",
                merchantId: dto.merchantId,
                senderId: dto.senderId,
                textLength: dto.text.length,
                correlationId,
            });
            const result = await this.inboxService.processMessage({
                merchantId: dto.merchantId,
                senderId: dto.senderId,
                text: dto.text,
                correlationId: correlationId || dto.correlationId,
            });
            return result;
        }
    };
    return InboxController = _classThis;
})();
exports.InboxController = InboxController;
