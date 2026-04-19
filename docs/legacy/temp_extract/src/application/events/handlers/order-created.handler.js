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
exports.OrderCreatedHandler = void 0;
const common_1 = require("@nestjs/common");
const event_types_1 = require("../event-types");
/**
 * Handles OrderCreated events - sends merchant alerts, updates customer stats
 */
let OrderCreatedHandler = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var OrderCreatedHandler = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            OrderCreatedHandler = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        eventHandlerRegistry;
        merchantRepository;
        customerRepository;
        outboxService;
        eventType = event_types_1.EVENT_TYPES.ORDER_CREATED;
        logger = new common_1.Logger(OrderCreatedHandler.name);
        constructor(eventHandlerRegistry, merchantRepository, customerRepository, outboxService) {
            this.eventHandlerRegistry = eventHandlerRegistry;
            this.merchantRepository = merchantRepository;
            this.customerRepository = customerRepository;
            this.outboxService = outboxService;
        }
        onModuleInit() {
            this.eventHandlerRegistry.registerHandler(this);
        }
        async handle(event) {
            const payload = event.payload;
            this.logger.log({
                msg: "Processing OrderCreated event",
                eventId: event.id,
                orderId: payload.orderId,
                orderNumber: payload.orderNumber,
                total: payload.total,
            });
            // Update customer statistics
            if (payload.customerId) {
                await this.updateCustomerStats(payload.customerId, event.merchantId, payload.total);
            }
            // Alert merchant about new order
            await this.alertMerchant(event.merchantId, payload, event.correlationId);
        }
        async updateCustomerStats(customerId, merchantId, orderTotal) {
            try {
                const customer = await this.customerRepository.findById(customerId);
                if (customer) {
                    await this.customerRepository.update(customerId, {
                        totalOrders: customer.totalOrders + 1,
                        totalSpent: customer.totalSpent + orderTotal,
                    });
                    this.logger.debug({
                        message: "Customer stats updated",
                        customerId,
                        totalOrders: customer.totalOrders + 1,
                        totalSpent: customer.totalSpent + orderTotal,
                    });
                }
            }
            catch (error) {
                this.logger.error({
                    message: "Failed to update customer stats",
                    customerId,
                    error: error.message,
                });
                // Don't throw - this is a side effect that shouldn't fail the main event
            }
        }
        async alertMerchant(merchantId, orderPayload, correlationId) {
            try {
                const merchant = await this.merchantRepository.findById(merchantId);
                if (!merchant) {
                    this.logger.warn({
                        msg: "Merchant not found for order alert",
                        merchantId,
                    });
                    return;
                }
                // Publish merchant alert event
                await this.outboxService.publishEvent({
                    eventType: event_types_1.EVENT_TYPES.MERCHANT_ALERTED,
                    aggregateType: "merchant",
                    aggregateId: merchantId,
                    merchantId,
                    correlationId,
                    payload: {
                        merchantId,
                        alertType: "new_order",
                        message: `طلب جديد #${orderPayload.orderNumber} بقيمة ${orderPayload.total} جنيه`,
                        metadata: {
                            orderId: orderPayload.orderId,
                            orderNumber: orderPayload.orderNumber,
                            total: orderPayload.total,
                            conversationId: orderPayload.conversationId,
                        },
                    },
                });
                this.logger.log({
                    msg: "Merchant alert scheduled for new order",
                    merchantId,
                    orderNumber: orderPayload.orderNumber,
                });
            }
            catch (error) {
                this.logger.error({
                    msg: "Failed to alert merchant",
                    merchantId,
                    error: error.message,
                });
            }
        }
    };
    return OrderCreatedHandler = _classThis;
})();
exports.OrderCreatedHandler = OrderCreatedHandler;
