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
exports.MerchantAlertHandler = void 0;
const common_1 = require("@nestjs/common");
const event_types_1 = require("../event-types");
/**
 * Handles MerchantAlerted events - sends alerts to merchants
 */
let MerchantAlertHandler = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MerchantAlertHandler = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            MerchantAlertHandler = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        eventHandlerRegistry;
        merchantRepository;
        eventType = event_types_1.EVENT_TYPES.MERCHANT_ALERTED;
        logger = new common_1.Logger(MerchantAlertHandler.name);
        constructor(eventHandlerRegistry, merchantRepository) {
            this.eventHandlerRegistry = eventHandlerRegistry;
            this.merchantRepository = merchantRepository;
        }
        onModuleInit() {
            this.eventHandlerRegistry.registerHandler(this);
        }
        async handle(event) {
            const payload = event.payload;
            this.logger.log({
                msg: "Processing MerchantAlerted event",
                eventId: event.id,
                merchantId: payload.merchantId,
                alertType: payload.alertType,
            });
            // Get merchant
            const merchant = await this.merchantRepository.findById(payload.merchantId);
            if (!merchant) {
                this.logger.warn({
                    message: "Merchant not found for alert",
                    merchantId: payload.merchantId,
                });
                return;
            }
            // Log alert details
            this.logger.log({
                message: "Merchant alert triggered",
                merchantId: payload.merchantId,
                merchantName: merchant.name,
                alertType: payload.alertType,
                alertMessage: payload.message,
                metadata: payload.metadata,
            });
            // TODO: Send actual alert via configured channel
            // Options:
            // - WhatsApp Business API notification
            // - SMS via Twilio/similar
            // - Email notification
            // - Webhook to merchant's system
            // - Push notification to merchant app
            switch (payload.alertType) {
                case "new_order":
                    await this.handleNewOrderAlert(merchant, payload);
                    break;
                case "escalation_needed":
                    await this.handleEscalationAlert(merchant, payload);
                    break;
                case "daily_report":
                    await this.handleDailyReportAlert(merchant, payload);
                    break;
                case "token_budget_warning":
                    await this.handleBudgetWarningAlert(merchant, payload);
                    break;
                case "delivery_issue":
                    await this.handleDeliveryIssueAlert(merchant, payload);
                    break;
                default:
                    this.logger.warn({
                        msg: "Unknown alert type",
                        alertType: payload.alertType,
                    });
            }
        }
        async handleNewOrderAlert(merchant, payload) {
            this.logger.log({
                msg: "New order alert for merchant",
                merchantId: merchant.id,
                orderNumber: payload.metadata?.orderNumber,
                total: payload.metadata?.total,
            });
            // In production: Send notification via merchant's preferred channel
        }
        async handleEscalationAlert(merchant, payload) {
            this.logger.warn({
                msg: "Escalation needed alert for merchant",
                merchantId: merchant.id,
                conversationId: payload.metadata?.conversationId,
                reason: payload.message,
            });
            // In production: Send urgent notification to merchant
        }
        async handleDailyReportAlert(merchant, payload) {
            this.logger.log({
                msg: "Daily report alert for merchant",
                merchantId: merchant.id,
                stats: payload.metadata,
            });
            // In production: Send daily summary email/message
        }
        async handleBudgetWarningAlert(merchant, payload) {
            this.logger.warn({
                msg: "Token budget warning for merchant",
                merchantId: merchant.id,
                usage: payload.metadata?.usage,
                limit: payload.metadata?.limit,
                percentage: payload.metadata?.percentage,
            });
            // In production: Notify merchant about high token usage
        }
        async handleDeliveryIssueAlert(merchant, payload) {
            this.logger.warn({
                msg: "Delivery issue alert for merchant",
                merchantId: merchant.id,
                orderId: payload.metadata?.orderId,
                issue: payload.message,
            });
            // In production: Notify merchant about delivery problem
        }
    };
    return MerchantAlertHandler = _classThis;
})();
exports.MerchantAlertHandler = MerchantAlertHandler;
