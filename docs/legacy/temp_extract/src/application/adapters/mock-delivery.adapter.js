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
exports.MockDeliveryAdapter = void 0;
const common_1 = require("@nestjs/common");
const helpers_1 = require("../../shared/utils/helpers");
const logger_1 = require("../../shared/logging/logger");
const logger = (0, logger_1.createLogger)("MockDeliveryAdapter");
let MockDeliveryAdapter = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MockDeliveryAdapter = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            MockDeliveryAdapter = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        name = "mock";
        shipments = new Map();
        async bookDelivery(request) {
            logger.info("Mock: Booking delivery", { orderId: request.orderId });
            // Simulate some processing time
            await new Promise((resolve) => setTimeout(resolve, 100));
            // Simulate occasional failures (10% failure rate)
            if (Math.random() < 0.1) {
                return {
                    success: false,
                    error: "Mock delivery booking failed - please try again",
                };
            }
            const trackingId = (0, helpers_1.generateTrackingId)();
            const estimatedDelivery = new Date();
            estimatedDelivery.setDate(estimatedDelivery.getDate() + 2); // 2 days from now
            // Store in mock database
            this.shipments.set(trackingId, {
                trackingId,
                status: "pending",
                events: [
                    {
                        timestamp: new Date(),
                        status: "pending",
                        description: "Shipment created - awaiting pickup",
                    },
                ],
                estimatedDelivery,
            });
            return {
                success: true,
                trackingId,
                courier: "MockCourier",
                estimatedDelivery,
            };
        }
        async getStatus(request) {
            logger.info("Mock: Getting delivery status", {
                trackingId: request.trackingId,
            });
            const shipment = this.shipments.get(request.trackingId);
            if (!shipment) {
                // Return a simulated status for unknown tracking IDs
                return {
                    trackingId: request.trackingId,
                    status: "unknown",
                    statusDescription: "Tracking ID not found",
                    lastUpdate: new Date(),
                    events: [],
                };
            }
            // Simulate status progression
            const statusProgression = [
                "pending",
                "picked_up",
                "in_transit",
                "out_for_delivery",
                "delivered",
            ];
            const currentIndex = statusProgression.indexOf(shipment.status);
            // Randomly advance status (for demo purposes)
            if (currentIndex < statusProgression.length - 1 && Math.random() < 0.3) {
                const newStatus = statusProgression[currentIndex + 1];
                shipment.status = newStatus;
                shipment.events.push({
                    timestamp: new Date(),
                    status: newStatus,
                    description: this.getStatusDescription(newStatus),
                    location: "Cairo, Egypt",
                });
            }
            return {
                trackingId: shipment.trackingId,
                status: shipment.status,
                statusDescription: this.getStatusDescription(shipment.status),
                lastUpdate: shipment.events[shipment.events.length - 1].timestamp,
                estimatedDelivery: shipment.estimatedDelivery,
                actualDelivery: shipment.status === "delivered" ? new Date() : undefined,
                events: shipment.events,
            };
        }
        async cancelDelivery(trackingId) {
            logger.info("Mock: Cancelling delivery", { trackingId });
            const shipment = this.shipments.get(trackingId);
            if (!shipment) {
                return false;
            }
            if (shipment.status === "delivered" ||
                shipment.status === "out_for_delivery") {
                return false; // Cannot cancel delivered or out for delivery
            }
            shipment.status = "cancelled";
            shipment.events.push({
                timestamp: new Date(),
                status: "cancelled",
                description: "Shipment cancelled by merchant",
            });
            return true;
        }
        getStatusDescription(status) {
            const descriptions = {
                pending: "الشحنة في انتظار الاستلام من المتجر",
                picked_up: "تم استلام الشحنة من المتجر",
                in_transit: "الشحنة في الطريق",
                out_for_delivery: "الشحنة خرجت للتوصيل",
                delivered: "تم التوصيل بنجاح",
                cancelled: "تم إلغاء الشحنة",
                unknown: "حالة غير معروفة",
            };
            return descriptions[status] || "حالة غير معروفة";
        }
    };
    return MockDeliveryAdapter = _classThis;
})();
exports.MockDeliveryAdapter = MockDeliveryAdapter;
