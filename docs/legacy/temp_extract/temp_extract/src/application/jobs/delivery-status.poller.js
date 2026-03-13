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
exports.DeliveryStatusPoller = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const event_types_1 = require("../events/event-types");
/**
 * Polls delivery status updates from courier APIs
 */
let DeliveryStatusPoller = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _pollDeliveryStatus_decorators;
    var DeliveryStatusPoller = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _pollDeliveryStatus_decorators = [(0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES)];
            __esDecorate(this, null, _pollDeliveryStatus_decorators, { kind: "method", name: "pollDeliveryStatus", static: false, private: false, access: { has: obj => "pollDeliveryStatus" in obj, get: obj => obj.pollDeliveryStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DeliveryStatusPoller = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool = __runInitializers(this, _instanceExtraInitializers);
        deliveryAdapter;
        outboxService;
        redisService;
        logger = new common_1.Logger(DeliveryStatusPoller.name);
        lockKey = "delivery-status-poller-lock";
        lockTtl = 120000; // 2 minutes
        constructor(pool, deliveryAdapter, outboxService, redisService) {
            this.pool = pool;
            this.deliveryAdapter = deliveryAdapter;
            this.outboxService = outboxService;
            this.redisService = redisService;
        }
        /**
         * Poll for delivery status updates every 5 minutes
         */
        async pollDeliveryStatus() {
            const lock = await this.redisService.acquireLock(this.lockKey, this.lockTtl);
            if (!lock) {
                this.logger.debug("Could not acquire delivery poller lock");
                return;
            }
            try {
                await this.processActiveShipments();
            }
            catch (error) {
                this.logger.error({
                    msg: "Error in delivery status poller",
                    error: error.message,
                });
            }
            finally {
                await this.redisService.releaseLock(lock);
            }
        }
        async processActiveShipments() {
            // Find shipments that are not in final state
            const query = `
      SELECT s.*, o.order_number, o.customer_name
      FROM shipments s
      JOIN orders o ON s.order_id = o.id
      WHERE s.status NOT IN ('delivered', 'returned', 'cancelled')
        AND s.updated_at < NOW() - INTERVAL '5 minutes'
      ORDER BY s.updated_at ASC
      LIMIT 100
    `;
            const result = await this.pool.query(query);
            if (result.rows.length === 0) {
                this.logger.debug("No shipments to poll");
                return;
            }
            this.logger.log({
                msg: "Polling delivery status for shipments",
                count: result.rows.length,
            });
            let updatedCount = 0;
            for (const shipment of result.rows) {
                try {
                    const status = await this.deliveryAdapter.getStatus(shipment.tracking_id);
                    if (status.status !== shipment.status) {
                        // Status changed - update and emit event
                        await this.updateShipmentStatus(shipment, status);
                        updatedCount++;
                    }
                    else {
                        // Just update the updated_at to prevent re-polling too soon
                        await this.pool.query(`UPDATE shipments SET updated_at = NOW() WHERE id = $1`, [shipment.id]);
                    }
                }
                catch (error) {
                    this.logger.error({
                        msg: "Failed to poll shipment status",
                        shipmentId: shipment.id,
                        trackingId: shipment.tracking_id,
                        error: error.message,
                    });
                }
            }
            this.logger.log({
                msg: "Delivery status polling completed",
                polled: result.rows.length,
                updated: updatedCount,
            });
        }
        async updateShipmentStatus(shipment, status) {
            // Update status history
            const statusHistory = shipment.status_history || [];
            statusHistory.push({
                status: status.status,
                timestamp: new Date(),
                description: status.statusDescription,
            });
            // Update shipment
            await this.pool.query(`UPDATE shipments 
       SET status = $2, 
           status_description = $3, 
           status_history = $4, 
           estimated_delivery = $5,
           updated_at = NOW()
       WHERE id = $1`, [
                shipment.id,
                status.status,
                status.statusDescription,
                JSON.stringify(statusHistory),
                status.estimatedDelivery,
            ]);
            // Emit delivery status updated event
            await this.outboxService.publishEvent({
                eventType: event_types_1.EVENT_TYPES.DELIVERY_STATUS_UPDATED,
                aggregateType: "shipment",
                aggregateId: shipment.id,
                merchantId: shipment.merchant_id,
                payload: {
                    shipmentId: shipment.id,
                    orderId: shipment.order_id,
                    merchantId: shipment.merchant_id,
                    trackingId: shipment.tracking_id,
                    status: status.status,
                    statusDescription: status.statusDescription,
                },
            });
            this.logger.log({
                msg: "Shipment status updated",
                shipmentId: shipment.id,
                trackingId: shipment.tracking_id,
                oldStatus: shipment.status,
                newStatus: status.status,
            });
        }
    };
    return DeliveryStatusPoller = _classThis;
})();
exports.DeliveryStatusPoller = DeliveryStatusPoller;
