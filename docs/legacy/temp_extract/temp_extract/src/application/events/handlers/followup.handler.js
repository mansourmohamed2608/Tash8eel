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
exports.FollowupHandler = void 0;
const common_1 = require("@nestjs/common");
const event_types_1 = require("../event-types");
const templates_1 = require("../../../shared/constants/templates");
const enums_1 = require("../../../shared/constants/enums");
/**
 * Handles FollowupScheduled events - sends follow-up messages
 */
let FollowupHandler = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var FollowupHandler = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            FollowupHandler = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        eventHandlerRegistry;
        conversationRepository;
        messageRepository;
        eventType = event_types_1.EVENT_TYPES.FOLLOWUP_SCHEDULED;
        logger = new common_1.Logger(FollowupHandler.name);
        constructor(eventHandlerRegistry, conversationRepository, messageRepository) {
            this.eventHandlerRegistry = eventHandlerRegistry;
            this.conversationRepository = conversationRepository;
            this.messageRepository = messageRepository;
        }
        onModuleInit() {
            this.eventHandlerRegistry.registerHandler(this);
        }
        async handle(event) {
            const payload = event.payload;
            this.logger.log({
                message: "Processing FollowupScheduled event",
                eventId: event.id,
                conversationId: payload.conversationId,
                followupCount: payload.followupCount,
            });
            // Get conversation
            const conversation = await this.conversationRepository.findById(payload.conversationId);
            if (!conversation) {
                this.logger.warn({
                    message: "Conversation not found for followup",
                    conversationId: payload.conversationId,
                });
                return;
            }
            // Check if conversation is still active and needs follow-up
            if (conversation.state === enums_1.ConversationState.CLOSED ||
                conversation.state === enums_1.ConversationState.ORDER_PLACED) {
                this.logger.debug({
                    message: "Conversation already closed/confirmed, skipping followup",
                    conversationId: payload.conversationId,
                    state: conversation.state,
                });
                return;
            }
            // Select appropriate follow-up message based on count
            let followupMessage;
            const cartItems = this.formatCartItems(conversation.cart);
            if (payload.followupCount === 1) {
                followupMessage = templates_1.ARABIC_TEMPLATES.FOLLOWUP_FIRST.replace("{items}", cartItems);
            }
            else if (payload.followupCount === 2) {
                followupMessage = templates_1.ARABIC_TEMPLATES.FOLLOWUP_SECOND.replace("{items}", cartItems);
            }
            else {
                followupMessage = templates_1.ARABIC_TEMPLATES.FOLLOWUP_FINAL;
            }
            // Store the follow-up message
            await this.messageRepository.create({
                conversationId: conversation.id,
                merchantId: event.merchantId || conversation.merchantId,
                senderId: "bot",
                direction: enums_1.MessageDirection.OUTBOUND,
                text: followupMessage,
            });
            // Update conversation with followup count
            await this.conversationRepository.update(conversation.id, {
                followupCount: payload.followupCount,
                lastMessageAt: new Date(),
            });
            this.logger.log({
                message: "Followup message sent",
                conversationId: payload.conversationId,
                followupCount: payload.followupCount,
            });
        }
        formatCartItems(cart) {
            if (!cart || !cart.items || cart.items.length === 0) {
                return "السلة فارغة";
            }
            return cart.items
                .map((item) => `${item.name} × ${item.quantity}`)
                .join(", ");
        }
    };
    return FollowupHandler = _classThis;
})();
exports.FollowupHandler = FollowupHandler;
