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
exports.RepositoriesModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../database/database.module");
const merchant_repository_impl_1 = require("./merchant.repository.impl");
const conversation_repository_impl_1 = require("./conversation.repository.impl");
const message_repository_impl_1 = require("./message.repository.impl");
const order_repository_impl_1 = require("./order.repository.impl");
const shipment_repository_impl_1 = require("./shipment.repository.impl");
const customer_repository_impl_1 = require("./customer.repository.impl");
const catalog_repository_impl_1 = require("./catalog.repository.impl");
const known_area_repository_impl_1 = require("./known-area.repository.impl");
const event_repository_impl_1 = require("./event.repository.impl");
const ports_1 = require("../../domain/ports");
let RepositoriesModule = (() => {
    let _classDecorators = [(0, common_1.Module)({
            imports: [database_module_1.DatabaseModule],
            providers: [
                { provide: ports_1.MERCHANT_REPOSITORY, useClass: merchant_repository_impl_1.MerchantRepository },
                { provide: ports_1.CONVERSATION_REPOSITORY, useClass: conversation_repository_impl_1.ConversationRepository },
                { provide: ports_1.MESSAGE_REPOSITORY, useClass: message_repository_impl_1.MessageRepository },
                { provide: ports_1.ORDER_REPOSITORY, useClass: order_repository_impl_1.OrderRepository },
                { provide: ports_1.SHIPMENT_REPOSITORY, useClass: shipment_repository_impl_1.ShipmentRepository },
                { provide: ports_1.CUSTOMER_REPOSITORY, useClass: customer_repository_impl_1.CustomerRepository },
                { provide: ports_1.CATALOG_REPOSITORY, useClass: catalog_repository_impl_1.CatalogRepository },
                { provide: ports_1.KNOWN_AREA_REPOSITORY, useClass: known_area_repository_impl_1.KnownAreaRepository },
                { provide: ports_1.EVENT_REPOSITORY, useClass: event_repository_impl_1.EventRepository },
            ],
            exports: [
                ports_1.MERCHANT_REPOSITORY,
                ports_1.CONVERSATION_REPOSITORY,
                ports_1.MESSAGE_REPOSITORY,
                ports_1.ORDER_REPOSITORY,
                ports_1.SHIPMENT_REPOSITORY,
                ports_1.CUSTOMER_REPOSITORY,
                ports_1.CATALOG_REPOSITORY,
                ports_1.KNOWN_AREA_REPOSITORY,
                ports_1.EVENT_REPOSITORY,
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RepositoriesModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            RepositoriesModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return RepositoriesModule = _classThis;
})();
exports.RepositoriesModule = RepositoriesModule;
