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
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
let OrdersController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)("Orders"), (0, common_1.Controller)("v1/orders")];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getOrder_decorators;
    let _listOrders_decorators;
    let _getOrderByNumber_decorators;
    var OrdersController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _getOrder_decorators = [(0, common_1.Get)(":id"), (0, swagger_1.ApiOperation)({
                    summary: "Get order by ID",
                    description: "Retrieve order details including shipment information",
                }), (0, swagger_1.ApiParam)({ name: "id", description: "Order ID" }), (0, swagger_1.ApiQuery)({
                    name: "merchantId",
                    description: "Merchant ID for tenant isolation",
                }), (0, swagger_1.ApiResponse)({ status: 200, description: "Order found" }), (0, swagger_1.ApiResponse)({ status: 404, description: "Order not found" })];
            _listOrders_decorators = [(0, common_1.Get)(), (0, swagger_1.ApiOperation)({ summary: "List orders for merchant" }), (0, swagger_1.ApiQuery)({ name: "merchantId", description: "Merchant ID" }), (0, swagger_1.ApiQuery)({
                    name: "status",
                    description: "Filter by status",
                    required: false,
                }), (0, swagger_1.ApiQuery)({ name: "limit", description: "Max results", required: false }), (0, swagger_1.ApiQuery)({
                    name: "offset",
                    description: "Pagination offset",
                    required: false,
                })];
            _getOrderByNumber_decorators = [(0, common_1.Get)("by-number/:orderNumber"), (0, swagger_1.ApiOperation)({ summary: "Get order by order number" }), (0, swagger_1.ApiParam)({
                    name: "orderNumber",
                    description: "Order number (e.g., ORD-240115-ABC1)",
                }), (0, swagger_1.ApiQuery)({
                    name: "merchantId",
                    description: "Merchant ID for tenant isolation",
                })];
            __esDecorate(this, null, _getOrder_decorators, { kind: "method", name: "getOrder", static: false, private: false, access: { has: obj => "getOrder" in obj, get: obj => obj.getOrder }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listOrders_decorators, { kind: "method", name: "listOrders", static: false, private: false, access: { has: obj => "listOrders" in obj, get: obj => obj.listOrders }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getOrderByNumber_decorators, { kind: "method", name: "getOrderByNumber", static: false, private: false, access: { has: obj => "getOrderByNumber" in obj, get: obj => obj.getOrderByNumber }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            OrdersController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        orderRepo = __runInitializers(this, _instanceExtraInitializers);
        shipmentRepo;
        logger = new common_1.Logger(OrdersController.name);
        constructor(orderRepo, shipmentRepo) {
            this.orderRepo = orderRepo;
            this.shipmentRepo = shipmentRepo;
        }
        async getOrder(id, merchantId) {
            const order = await this.orderRepo.findById(id);
            if (!order) {
                throw new common_1.NotFoundException(`Order ${id} not found`);
            }
            // Verify merchant ownership
            if (order.merchantId !== merchantId) {
                throw new common_1.ForbiddenException("Access denied");
            }
            // Get shipment if exists
            const shipment = await this.shipmentRepo.findByOrderId(order.id);
            return this.mapOrderToDto(order, shipment);
        }
        async listOrders(merchantId, status, limit, offset) {
            const orders = await this.orderRepo.findByMerchant(merchantId, limit);
            // Filter by status if provided
            let filtered = orders;
            if (status) {
                filtered = orders.filter((o) => o.status === status);
            }
            // Apply pagination
            const start = offset || 0;
            const end = start + (limit || 20);
            const paginated = filtered.slice(start, end);
            const result = paginated.map((order) => this.mapOrderToDto(order, null));
            return {
                orders: result,
                total: filtered.length,
            };
        }
        async getOrderByNumber(orderNumber, merchantId) {
            const order = await this.orderRepo.findByOrderNumber(merchantId, orderNumber);
            if (!order) {
                throw new common_1.NotFoundException(`Order ${orderNumber} not found`);
            }
            const shipment = await this.shipmentRepo.findByOrderId(order.id);
            return this.mapOrderToDto(order, shipment);
        }
        mapOrderToDto(order, shipment) {
            return {
                id: order.id,
                orderNumber: order.orderNumber,
                merchantId: order.merchantId,
                conversationId: order.conversationId,
                customerId: order.customerId,
                customerName: order.customerName,
                customerPhone: order.customerPhone,
                deliveryAddress: order.deliveryAddress,
                deliveryNotes: order.deliveryNotes,
                items: order.items,
                subtotal: order.subtotal,
                deliveryFee: order.deliveryFee,
                discount: order.discount,
                total: order.total,
                status: order.status,
                shipment: shipment
                    ? {
                        id: shipment.id,
                        trackingId: shipment.trackingId,
                        courier: shipment.courier,
                        status: shipment.status,
                        estimatedDelivery: shipment.estimatedDelivery,
                        statusHistory: shipment.statusHistory,
                    }
                    : undefined,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
            };
        }
    };
    return OrdersController = _classThis;
})();
exports.OrdersController = OrdersController;
