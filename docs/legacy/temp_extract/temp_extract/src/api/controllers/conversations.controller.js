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
exports.ConversationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
let ConversationsController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)("Conversations"), (0, common_1.Controller)("v1/conversations")];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getConversation_decorators;
    let _listConversations_decorators;
    var ConversationsController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _getConversation_decorators = [(0, common_1.Get)(":id"), (0, swagger_1.ApiOperation)({
                    summary: "Get conversation by ID",
                    description: "Retrieve conversation details including message history",
                }), (0, swagger_1.ApiParam)({ name: "id", description: "Conversation ID" }), (0, swagger_1.ApiQuery)({
                    name: "merchantId",
                    description: "Merchant ID for tenant isolation",
                }), (0, swagger_1.ApiQuery)({
                    name: "includeMessages",
                    description: "Include message history",
                    required: false,
                }), (0, swagger_1.ApiResponse)({ status: 200, description: "Conversation found" }), (0, swagger_1.ApiResponse)({ status: 404, description: "Conversation not found" })];
            _listConversations_decorators = [(0, common_1.Get)(), (0, swagger_1.ApiOperation)({ summary: "List conversations for merchant" }), (0, swagger_1.ApiQuery)({ name: "merchantId", description: "Merchant ID" }), (0, swagger_1.ApiQuery)({ name: "state", description: "Filter by state", required: false }), (0, swagger_1.ApiQuery)({ name: "limit", description: "Max results", required: false }), (0, swagger_1.ApiQuery)({
                    name: "offset",
                    description: "Pagination offset",
                    required: false,
                })];
            __esDecorate(this, null, _getConversation_decorators, { kind: "method", name: "getConversation", static: false, private: false, access: { has: obj => "getConversation" in obj, get: obj => obj.getConversation }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listConversations_decorators, { kind: "method", name: "listConversations", static: false, private: false, access: { has: obj => "listConversations" in obj, get: obj => obj.listConversations }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ConversationsController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        conversationRepo = __runInitializers(this, _instanceExtraInitializers);
        messageRepo;
        logger = new common_1.Logger(ConversationsController.name);
        constructor(conversationRepo, messageRepo) {
            this.conversationRepo = conversationRepo;
            this.messageRepo = messageRepo;
        }
        async getConversation(id, merchantId, includeMessages) {
            const conversation = await this.conversationRepo.findById(id);
            if (!conversation) {
                throw new common_1.NotFoundException(`Conversation ${id} not found`);
            }
            // Verify merchant ownership
            if (conversation.merchantId !== merchantId) {
                throw new common_1.ForbiddenException("Access denied");
            }
            let messages = [];
            if (includeMessages === "true") {
                messages = await this.messageRepo.findByConversation(id);
            }
            return this.mapConversationToDto(conversation, messages);
        }
        async listConversations(merchantId, state, limit, offset) {
            // For now, we need to get pending followups and filter -
            // ideally add a findByMerchant method to the repository
            const pendingFollowups = await this.conversationRepo.findPendingFollowups(new Date());
            const conversations = pendingFollowups.filter((c) => c.merchantId === merchantId);
            // Filter by state if provided
            let filtered = conversations;
            if (state) {
                filtered = conversations.filter((c) => c.state === state);
            }
            // Apply pagination
            const start = offset || 0;
            const end = start + (limit || 20);
            const paginated = filtered.slice(start, end);
            // Don't include messages in list view
            const result = paginated.map((conv) => this.mapConversationToDto(conv, []));
            return {
                conversations: result,
                total: filtered.length,
            };
        }
        mapConversationToDto(conversation, messages) {
            return {
                id: conversation.id,
                merchantId: conversation.merchantId,
                customerId: conversation.customerId,
                senderId: conversation.senderId,
                state: conversation.state,
                cart: conversation.cart,
                collectedInfo: conversation.collectedInfo,
                missingSlots: conversation.missingSlots,
                followupCount: conversation.followupCount,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                lastMessageAt: conversation.lastMessageAt,
                messages: messages.length > 0
                    ? messages.map((msg) => ({
                        id: msg.id,
                        direction: msg.direction,
                        senderId: msg.senderId,
                        text: msg.text,
                        tokensUsed: msg.tokensUsed,
                        createdAt: msg.createdAt,
                    }))
                    : undefined,
            };
        }
    };
    return ConversationsController = _classThis;
})();
exports.ConversationsController = ConversationsController;
