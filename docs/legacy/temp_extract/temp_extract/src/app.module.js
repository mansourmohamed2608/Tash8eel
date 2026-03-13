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
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const core_1 = require("@nestjs/core");
// API module
const api_module_1 = require("./api/api.module");
// Infrastructure modules
const database_module_1 = require("./infrastructure/database/database.module");
const redis_module_1 = require("./infrastructure/redis/redis.module");
// Application modules
const events_module_1 = require("./application/events/events.module");
const jobs_module_1 = require("./application/jobs/jobs.module");
const dlq_module_1 = require("./application/dlq/dlq.module");
// Shared
const correlation_id_middleware_1 = require("./shared/middleware/correlation-id.middleware");
const all_exceptions_filter_1 = require("./shared/filters/all-exceptions.filter");
let AppModule = (() => {
    let _classDecorators = [(0, common_1.Module)({
            imports: [
                // Configuration
                config_1.ConfigModule.forRoot({
                    isGlobal: true,
                    envFilePath: [".env.local", ".env"],
                }),
                // Scheduling
                schedule_1.ScheduleModule.forRoot(),
                // Infrastructure
                database_module_1.DatabaseModule,
                redis_module_1.RedisModule,
                // Application
                events_module_1.EventsModule,
                jobs_module_1.JobsModule,
                dlq_module_1.DlqModule,
                // API
                api_module_1.ApiModule,
            ],
            providers: [
                {
                    provide: core_1.APP_FILTER,
                    useClass: all_exceptions_filter_1.AllExceptionsFilter,
                },
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AppModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AppModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        configure(consumer) {
            consumer.apply(correlation_id_middleware_1.CorrelationIdMiddleware).forRoutes("*");
        }
    };
    return AppModule = _classThis;
})();
exports.AppModule = AppModule;
