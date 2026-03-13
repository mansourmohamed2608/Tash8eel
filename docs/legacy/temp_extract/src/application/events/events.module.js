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
exports.EventsModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const database_module_1 = require("../../infrastructure/database/database.module");
const redis_module_1 = require("../../infrastructure/redis/redis.module");
const repositories_module_1 = require("../../infrastructure/repositories/repositories.module");
const event_handler_registry_1 = require("./event-handler.registry");
const outbox_service_1 = require("./outbox.service");
const outbox_worker_1 = require("./outbox.worker");
const handlers_1 = require("./handlers");
let EventsModule = (() => {
    let _classDecorators = [(0, common_1.Global)(), (0, common_1.Module)({
            imports: [
                database_module_1.DatabaseModule,
                redis_module_1.RedisModule,
                schedule_1.ScheduleModule.forRoot(),
                repositories_module_1.RepositoriesModule,
            ],
            providers: [
                event_handler_registry_1.EventHandlerRegistry,
                outbox_service_1.OutboxService,
                outbox_worker_1.OutboxWorker,
                // Event handlers (auto-register on init)
                handlers_1.ShipmentBookedHandler,
                handlers_1.DeliveryStatusHandler,
                handlers_1.FollowupHandler,
                handlers_1.MerchantAlertHandler,
                handlers_1.OrderCreatedHandler,
            ],
            exports: [event_handler_registry_1.EventHandlerRegistry, outbox_service_1.OutboxService],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var EventsModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            EventsModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return EventsModule = _classThis;
})();
exports.EventsModule = EventsModule;
