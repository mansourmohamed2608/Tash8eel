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
exports.OutboxWorker = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
let OutboxWorker = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _processOutbox_decorators;
    var OutboxWorker = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _processOutbox_decorators = [(0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_SECONDS)];
            __esDecorate(this, null, _processOutbox_decorators, { kind: "method", name: "processOutbox", static: false, private: false, access: { has: obj => "processOutbox" in obj, get: obj => obj.processOutbox }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            OutboxWorker = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        outboxService = __runInitializers(this, _instanceExtraInitializers);
        eventHandlerRegistry;
        redisService;
        logger = new common_1.Logger(OutboxWorker.name);
        isProcessing = false;
        lockKey = "outbox-worker-lock";
        lockTtl = 30000; // 30 seconds
        constructor(outboxService, eventHandlerRegistry, redisService) {
            this.outboxService = outboxService;
            this.eventHandlerRegistry = eventHandlerRegistry;
            this.redisService = redisService;
        }
        /**
         * Process outbox events every 5 seconds
         */
        async processOutbox() {
            if (this.isProcessing) {
                this.logger.debug("Outbox processing already in progress, skipping");
                return;
            }
            // Try to acquire distributed lock
            const lock = await this.redisService.acquireLock(this.lockKey, this.lockTtl);
            if (!lock) {
                this.logger.debug("Could not acquire outbox lock, another instance is processing");
                return;
            }
            this.isProcessing = true;
            try {
                const events = await this.outboxService.fetchPendingEvents(50);
                if (events.length === 0) {
                    return;
                }
                this.logger.log({
                    msg: "Processing outbox events",
                    count: events.length,
                });
                for (const event of events) {
                    try {
                        // Get handler for event type
                        const handler = this.eventHandlerRegistry.getHandler(event.eventType);
                        if (handler) {
                            await handler.handle(event);
                            this.logger.debug({
                                msg: "Event handled successfully",
                                eventId: event.id,
                                eventType: event.eventType,
                            });
                        }
                        else {
                            this.logger.warn({
                                msg: "No handler registered for event type",
                                eventId: event.id,
                                eventType: event.eventType,
                            });
                        }
                        // Mark as processed
                        await this.outboxService.markProcessed(event.id);
                    }
                    catch (error) {
                        this.logger.error({
                            msg: "Failed to process event",
                            eventId: event.id,
                            eventType: event.eventType,
                            error: error.message,
                        });
                        // Mark as failed (will move to DLQ after 5 retries)
                        await this.outboxService.markFailed(event.id, error.message);
                    }
                }
            }
            catch (error) {
                this.logger.error({
                    msg: "Error in outbox worker",
                    error: error.message,
                });
            }
            finally {
                this.isProcessing = false;
                await this.redisService.releaseLock(lock);
            }
        }
        /**
         * Get processing status
         */
        isCurrentlyProcessing() {
            return this.isProcessing;
        }
    };
    return OutboxWorker = _classThis;
})();
exports.OutboxWorker = OutboxWorker;
