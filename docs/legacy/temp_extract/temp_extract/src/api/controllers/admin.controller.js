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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const admin_api_key_guard_1 = require("../../shared/guards/admin-api-key.guard");
const enums_1 = require("../../shared/constants/enums");
const uuid_1 = require("uuid");
let AdminController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)("Admin"), (0, common_1.Controller)("v1/admin"), (0, swagger_1.ApiHeader)({
            name: "x-admin-api-key",
            required: true,
            description: "Admin API key",
        }), (0, common_1.UseGuards)(admin_api_key_guard_1.AdminApiKeyGuard)];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getMetrics_decorators;
    let _replayDlqEvent_decorators;
    let _listDlqEvents_decorators;
    let _seedDemoData_decorators;
    let _togglePromotion_decorators;
    var AdminController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _getMetrics_decorators = [(0, common_1.Get)("metrics"), (0, swagger_1.ApiOperation)({
                    summary: "Get system metrics",
                    description: "Returns aggregated metrics for all merchants including token usage, order counts, and event statistics",
                }), (0, swagger_1.ApiResponse)({ status: 200, description: "Metrics retrieved successfully" })];
            _replayDlqEvent_decorators = [(0, common_1.Post)("replay/:dlqEventId"), (0, swagger_1.ApiOperation)({
                    summary: "Replay a DLQ event",
                    description: "Re-queue a failed event from the Dead Letter Queue for processing",
                }), (0, swagger_1.ApiParam)({ name: "dlqEventId", description: "DLQ event ID to replay" }), (0, swagger_1.ApiResponse)({ status: 200, description: "Event replayed successfully" }), (0, swagger_1.ApiResponse)({ status: 404, description: "DLQ event not found" })];
            _listDlqEvents_decorators = [(0, common_1.Get)("dlq"), (0, swagger_1.ApiOperation)({ summary: "List DLQ events" }), (0, swagger_1.ApiQuery)({ name: "limit", required: false }), (0, swagger_1.ApiQuery)({ name: "offset", required: false }), (0, swagger_1.ApiQuery)({ name: "merchantId", required: false })];
            _seedDemoData_decorators = [(0, common_1.Post)("seed"), (0, swagger_1.ApiOperation)({
                    summary: "Seed demo data",
                    description: "Create demo merchant and catalog data for testing",
                }), (0, swagger_1.ApiResponse)({ status: 200, description: "Demo data seeded" })];
            _togglePromotion_decorators = [(0, common_1.Post)("promotion/:merchantId"), (0, swagger_1.ApiOperation)({
                    summary: "Toggle active promotion for a merchant",
                    description: "Enable or disable the active promotion for a merchant",
                }), (0, swagger_1.ApiParam)({ name: "merchantId", description: "Merchant ID" }), (0, swagger_1.ApiResponse)({ status: 200, description: "Promotion toggled successfully" })];
            __esDecorate(this, null, _getMetrics_decorators, { kind: "method", name: "getMetrics", static: false, private: false, access: { has: obj => "getMetrics" in obj, get: obj => obj.getMetrics }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _replayDlqEvent_decorators, { kind: "method", name: "replayDlqEvent", static: false, private: false, access: { has: obj => "replayDlqEvent" in obj, get: obj => obj.replayDlqEvent }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listDlqEvents_decorators, { kind: "method", name: "listDlqEvents", static: false, private: false, access: { has: obj => "listDlqEvents" in obj, get: obj => obj.listDlqEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _seedDemoData_decorators, { kind: "method", name: "seedDemoData", static: false, private: false, access: { has: obj => "seedDemoData" in obj, get: obj => obj.seedDemoData }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _togglePromotion_decorators, { kind: "method", name: "togglePromotion", static: false, private: false, access: { has: obj => "togglePromotion" in obj, get: obj => obj.togglePromotion }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AdminController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool = __runInitializers(this, _instanceExtraInitializers);
        merchantRepo;
        dlqService;
        outboxService;
        logger = new common_1.Logger(AdminController.name);
        constructor(pool, merchantRepo, dlqService, outboxService) {
            this.pool = pool;
            this.merchantRepo = merchantRepo;
            this.dlqService = dlqService;
            this.outboxService = outboxService;
        }
        async getMetrics() {
            // Get overall statistics
            const [merchantStats, orderStats, conversationStats, messageStats, eventStats, dlqStats,] = await Promise.all([
                this.getMerchantStats(),
                this.getOrderStats(),
                this.getConversationStats(),
                this.getMessageStats(),
                this.outboxService.getEventStats(),
                this.dlqService.getStats(),
            ]);
            return {
                timestamp: new Date().toISOString(),
                merchants: merchantStats,
                orders: orderStats,
                conversations: conversationStats,
                messages: messageStats,
                events: eventStats,
                dlq: dlqStats,
            };
        }
        async replayDlqEvent(dlqEventId) {
            this.logger.log({
                msg: "Replaying DLQ event",
                dlqEventId,
            });
            const result = await this.dlqService.replayEvent(dlqEventId);
            return {
                success: result.success,
                newEventId: result.newEventId,
                error: result.error,
            };
        }
        async listDlqEvents(limit, offset, merchantId) {
            const result = await this.dlqService.listEvents(limit || 50, offset || 0, merchantId);
            return result;
        }
        async seedDemoData() {
            this.logger.log({ msg: "Seeding demo data" });
            // Create demo merchant
            const merchantId = "demo-merchant";
            const existingMerchant = await this.merchantRepo.findById(merchantId);
            if (!existingMerchant) {
                await this.merchantRepo.create({
                    id: merchantId,
                    name: "متجر تجريبي",
                    category: enums_1.MerchantCategory.CLOTHES,
                    dailyTokenBudget: 100000,
                    config: {
                        brandName: "متجر تجريبي",
                        tone: "friendly",
                        currency: "EGP",
                        language: "ar-EG",
                        enableNegotiation: true,
                        followupEnabled: true,
                    },
                    branding: {},
                    negotiationRules: {
                        maxDiscountPercent: 10,
                        minMarginPercent: 20,
                        allowNegotiation: true,
                        freeDeliveryThreshold: 500,
                        activePromotion: {
                            enabled: true,
                            discountPercent: 10,
                            description: "خصم 10% على كل المنتجات - عرض الأسبوع",
                        },
                    },
                    deliveryRules: {
                        defaultFee: 30,
                        freeDeliveryThreshold: 500,
                    },
                });
            }
            // Seed catalog items
            await this.seedCatalogItems(merchantId);
            return {
                success: true,
                merchantId,
                message: "Demo data seeded successfully",
            };
        }
        async togglePromotion(merchantId, body) {
            const merchant = await this.merchantRepo.findById(merchantId);
            if (!merchant) {
                return { success: false, error: "Merchant not found" };
            }
            const updatedRules = {
                ...merchant.negotiationRules,
                activePromotion: {
                    enabled: body.enabled,
                    discountPercent: body.discountPercent ||
                        merchant.negotiationRules.activePromotion?.discountPercent ||
                        10,
                    description: body.description ||
                        merchant.negotiationRules.activePromotion?.description ||
                        "عرض خاص",
                },
            };
            await this.pool.query(`UPDATE merchants SET negotiation_rules = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(updatedRules), merchantId]);
            return {
                success: true,
                activePromotion: updatedRules.activePromotion,
                message: body.enabled ? "العرض مفعّل" : "العرض متوقف",
            };
        }
        async seedCatalogItems(merchantId) {
            const items = [
                {
                    name_ar: "تيشيرت قطن أبيض",
                    base_price: 150,
                    category: "ملابس رجالي",
                    sku: "tshirt-white",
                    variants: [{ name: "size", values: ["S", "M", "L", "XL", "XXL"] }],
                },
                {
                    name_ar: "تيشيرت قطن أسود",
                    base_price: 150,
                    category: "ملابس رجالي",
                    sku: "tshirt-black",
                    variants: [{ name: "size", values: ["S", "M", "L", "XL", "XXL"] }],
                },
                {
                    name_ar: "بنطلون جينز",
                    base_price: 350,
                    category: "ملابس رجالي",
                    sku: "jeans-blue",
                    variants: [
                        { name: "size", values: ["30", "32", "34", "36", "38"] },
                        { name: "color", values: ["أزرق", "أسود", "رمادي"] },
                    ],
                },
                {
                    name_ar: "قميص كاجوال",
                    base_price: 250,
                    category: "ملابس رجالي",
                    sku: "shirt-casual",
                    variants: [
                        { name: "size", values: ["S", "M", "L", "XL"] },
                        { name: "color", values: ["أبيض", "أزرق فاتح", "بيج"] },
                    ],
                },
                {
                    name_ar: "شورت رياضي",
                    base_price: 120,
                    category: "ملابس رياضية",
                    sku: "shorts-sport",
                    variants: [
                        { name: "size", values: ["S", "M", "L", "XL"] },
                        { name: "color", values: ["أسود", "كحلي", "رمادي"] },
                    ],
                },
                {
                    name_ar: "فستان صيفي",
                    base_price: 280,
                    category: "ملابس حريمي",
                    sku: "dress-summer",
                    variants: [
                        { name: "size", values: ["S", "M", "L"] },
                        { name: "color", values: ["أحمر", "أزرق", "أخضر"] },
                    ],
                },
                {
                    name_ar: "بلوزة قطن",
                    base_price: 180,
                    category: "ملابس حريمي",
                    sku: "blouse-cotton",
                    variants: [
                        { name: "size", values: ["S", "M", "L"] },
                        { name: "color", values: ["أبيض", "وردي", "أسود"] },
                    ],
                },
            ];
            for (const item of items) {
                await this.pool.query(`INSERT INTO catalog_items (id, merchant_id, name_ar, base_price, category, sku, variants, is_available, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
         ON CONFLICT (merchant_id, sku) DO UPDATE SET
           base_price = EXCLUDED.base_price,
           category = EXCLUDED.category,
           variants = EXCLUDED.variants,
           updated_at = NOW()`, [
                    (0, uuid_1.v4)(),
                    merchantId,
                    item.name_ar,
                    item.base_price,
                    item.category,
                    item.sku,
                    JSON.stringify(item.variants || []),
                ]);
            }
        }
        async getMerchantStats() {
            const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active
      FROM merchants
    `);
            return {
                total: parseInt(result.rows[0].total, 10),
                active: parseInt(result.rows[0].active, 10),
            };
        }
        async getOrderStats() {
            const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE status = 'shipped') as shipped,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COALESCE(SUM(total), 0) as total_revenue,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today
      FROM orders
    `);
            const row = result.rows[0];
            return {
                total: parseInt(row.total, 10),
                pending: parseInt(row.pending, 10),
                confirmed: parseInt(row.confirmed, 10),
                shipped: parseInt(row.shipped, 10),
                delivered: parseInt(row.delivered, 10),
                cancelled: parseInt(row.cancelled, 10),
                totalRevenue: parseFloat(row.total_revenue),
                today: parseInt(row.today, 10),
            };
        }
        async getConversationStats() {
            const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE state = 'GREETING') as greeting,
        COUNT(*) FILTER (WHERE state IN ('COLLECTING_ITEMS', 'COLLECTING_VARIANTS', 'COLLECTING_CUSTOMER_INFO', 'COLLECTING_ADDRESS')) as collecting,
        COUNT(*) FILTER (WHERE state = 'NEGOTIATING') as negotiating,
        COUNT(*) FILTER (WHERE state IN ('CONFIRMING_ORDER', 'ORDER_PLACED')) as confirmed,
        COUNT(*) FILTER (WHERE state = 'CLOSED') as closed,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today
      FROM conversations
    `);
            const row = result.rows[0];
            return {
                total: parseInt(row.total, 10),
                greeting: parseInt(row.greeting, 10),
                collecting: parseInt(row.collecting, 10),
                negotiating: parseInt(row.negotiating, 10),
                confirmed: parseInt(row.confirmed, 10),
                closed: parseInt(row.closed, 10),
                today: parseInt(row.today, 10),
            };
        }
        async getMessageStats() {
            const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE sender = 'customer') as from_customers,
        COUNT(*) FILTER (WHERE sender = 'bot') as from_bot,
        COALESCE(SUM(token_usage), 0) as total_tokens,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today
      FROM messages
    `);
            const row = result.rows[0];
            return {
                total: parseInt(row.total, 10),
                fromCustomers: parseInt(row.from_customers, 10),
                fromBot: parseInt(row.from_bot, 10),
                totalTokens: parseInt(row.total_tokens, 10),
                today: parseInt(row.today, 10),
            };
        }
    };
    return AdminController = _classThis;
})();
exports.AdminController = AdminController;
