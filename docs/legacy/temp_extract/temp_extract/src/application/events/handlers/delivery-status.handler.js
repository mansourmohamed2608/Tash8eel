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
exports.DeliveryStatusHandler = void 0;
const common_1 = require("@nestjs/common");
const event_types_1 = require("../event-types");
const enums_1 = require("../../../shared/constants/enums");
/**
 * Handles DeliveryStatusUpdated events - updates shipment and order status
 */
let DeliveryStatusHandler = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var DeliveryStatusHandler = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DeliveryStatusHandler = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        eventHandlerRegistry;
        shipmentRepository;
        orderRepository;
        conversationRepository;
        outboxService;
        eventType = event_types_1.EVENT_TYPES.DELIVERY_STATUS_UPDATED;
        logger = new common_1.Logger(DeliveryStatusHandler.name);
        constructor(eventHandlerRegistry, shipmentRepository, orderRepository, conversationRepository, outboxService) {
            this.eventHandlerRegistry = eventHandlerRegistry;
            this.shipmentRepository = shipmentRepository;
            this.orderRepository = orderRepository;
            this.conversationRepository = conversationRepository;
            this.outboxService = outboxService;
        }
        onModuleInit() {
            this.eventHandlerRegistry.registerHandler(this);
        }
        async handle(event) {
            const payload = event.payload;
            this.logger.log({
                msg: "Processing DeliveryStatusUpdated event",
                eventId: event.id,
                shipmentId: payload.shipmentId,
                status: payload.status,
            });
            // Update shipment status
            const shipment = await this.shipmentRepository.findById(payload.shipmentId);
            if (!shipment) {
                this.logger.warn({
                    msg: "Shipment not found",
                    shipmentId: payload.shipmentId,
                });
                return;
            }
            await this.shipmentRepository.updateStatus(payload.shipmentId, payload.status, payload.statusDescription);
            // Update order status based on delivery status
            const order = await this.orderRepository.findById(payload.orderId);
            if (order) {
                let newOrderStatus = order.status;
                if (payload.status === "delivered") {
                    newOrderStatus = enums_1.OrderStatus.DELIVERED;
                    // Also close the conversation
                    const conversation = await this.conversationRepository.findByMerchantAndSender(event.merchantId, order.customerId);
                    if (conversation) {
                        await this.conversationRepository.update(conversation.id, {
                            state: enums_1.ConversationState.CLOSED,
                            closedAt: new Date(),
                        });
                        // Emit conversation closed event
                        await this.outboxService.publishEvent({
                            eventType: event_types_1.EVENT_TYPES.CONVERSATION_CLOSED,
                            aggregateType: "conversation",
                            aggregateId: conversation.id,
                            merchantId: event.merchantId,
                            correlationId: event.correlationId,
                            payload: {
                                conversationId: conversation.id,
                                merchantId: event.merchantId,
                                reason: "Order delivered",
                            },
                        });
                    }
                }
                else if (payload.status === "failed" || payload.status === "returned") {
                    newOrderStatus = enums_1.OrderStatus.CANCELLED;
                }
                else if (payload.status === "out_for_delivery") {
                    newOrderStatus = enums_1.OrderStatus.OUT_FOR_DELIVERY;
                }
                if (newOrderStatus !== order.status) {
                    await this.orderRepository.update(order.id, {
                        status: newOrderStatus,
                    });
                    this.logger.log({
                        msg: "Order status updated",
                        orderId: order.id,
                        oldStatus: order.status,
                        newStatus: newOrderStatus,
                    });
                }
            }
        }
    };
    return DeliveryStatusHandler = _classThis;
})();
exports.DeliveryStatusHandler = DeliveryStatusHandler;
