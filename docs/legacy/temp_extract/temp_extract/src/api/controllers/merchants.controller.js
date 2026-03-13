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
exports.MerchantsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const merchant_dto_1 = require("../dto/merchant.dto");
const enums_1 = require("../../shared/constants/enums");
const uuid_1 = require("uuid");
let MerchantsController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)("Merchants"), (0, common_1.Controller)("v1/merchants")];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _getMerchant_decorators;
    let _updateConfig_decorators;
    let _toggleActive_decorators;
    var MerchantsController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _getMerchant_decorators = [(0, common_1.Get)(":id"), (0, swagger_1.ApiOperation)({ summary: "Get merchant by ID" }), (0, swagger_1.ApiParam)({ name: "id", description: "Merchant ID" }), (0, swagger_1.ApiResponse)({
                    status: 200,
                    description: "Merchant found",
                    type: merchant_dto_1.MerchantResponseDto,
                }), (0, swagger_1.ApiResponse)({ status: 404, description: "Merchant not found" })];
            _updateConfig_decorators = [(0, common_1.Post)(":id/config"), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                    summary: "Update merchant configuration",
                    description: "Update merchant settings including negotiation rules, delivery fee, token budget, etc.",
                }), (0, swagger_1.ApiParam)({ name: "id", description: "Merchant ID" }), (0, swagger_1.ApiResponse)({
                    status: 200,
                    description: "Configuration updated",
                    type: merchant_dto_1.MerchantResponseDto,
                }), (0, swagger_1.ApiResponse)({ status: 404, description: "Merchant not found" })];
            _toggleActive_decorators = [(0, common_1.Put)(":id/toggle-active"), (0, swagger_1.ApiOperation)({ summary: "Toggle merchant active status" }), (0, swagger_1.ApiParam)({ name: "id", description: "Merchant ID" }), (0, swagger_1.ApiResponse)({ status: 200, type: merchant_dto_1.MerchantResponseDto })];
            __esDecorate(this, null, _getMerchant_decorators, { kind: "method", name: "getMerchant", static: false, private: false, access: { has: obj => "getMerchant" in obj, get: obj => obj.getMerchant }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _updateConfig_decorators, { kind: "method", name: "updateConfig", static: false, private: false, access: { has: obj => "updateConfig" in obj, get: obj => obj.updateConfig }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _toggleActive_decorators, { kind: "method", name: "toggleActive", static: false, private: false, access: { has: obj => "toggleActive" in obj, get: obj => obj.toggleActive }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            MerchantsController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        merchantRepo = __runInitializers(this, _instanceExtraInitializers);
        logger = new common_1.Logger(MerchantsController.name);
        constructor(merchantRepo) {
            this.merchantRepo = merchantRepo;
        }
        async getMerchant(id) {
            const merchant = await this.merchantRepo.findById(id);
            if (!merchant) {
                throw new common_1.NotFoundException(`Merchant ${id} not found`);
            }
            return this.toResponseDto(merchant);
        }
        async updateConfig(id, dto) {
            let merchant = await this.merchantRepo.findById(id);
            if (!merchant) {
                // Create new merchant if not exists
                this.logger.log({
                    msg: "Creating new merchant",
                    merchantId: id,
                });
                merchant = {
                    id,
                    name: dto.name || `Merchant ${id}`,
                    category: dto.category || enums_1.MerchantCategory.GENERIC,
                    apiKey: this.generateApiKey(),
                    isActive: true,
                    city: dto.city || "cairo",
                    currency: dto.currency || "EGP",
                    language: dto.language || "ar-EG",
                    dailyTokenBudget: dto.dailyTokenBudget || 100000,
                    defaultDeliveryFee: dto.defaultDeliveryFee || 30,
                    autoBookDelivery: dto.autoBookDelivery ?? false,
                    enableFollowups: dto.enableFollowups ?? true,
                    greetingTemplate: dto.greetingTemplate,
                    negotiationRules: dto.negotiationRules || {
                        maxDiscountPercent: 10,
                        allowNegotiation: true,
                    },
                    workingHours: dto.workingHours,
                    config: {},
                    branding: {},
                    deliveryRules: { defaultFee: dto.defaultDeliveryFee || 30 },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                await this.merchantRepo.create(merchant);
            }
            else {
                // Update existing merchant
                const updates = {
                    ...merchant,
                    updatedAt: new Date(),
                };
                if (dto.name !== undefined)
                    updates.name = dto.name;
                if (dto.category !== undefined)
                    updates.category = dto.category;
                if (dto.city !== undefined)
                    updates.city = dto.city;
                if (dto.currency !== undefined)
                    updates.currency = dto.currency;
                if (dto.language !== undefined)
                    updates.language = dto.language;
                if (dto.dailyTokenBudget !== undefined)
                    updates.dailyTokenBudget = dto.dailyTokenBudget;
                if (dto.defaultDeliveryFee !== undefined)
                    updates.defaultDeliveryFee = dto.defaultDeliveryFee;
                if (dto.autoBookDelivery !== undefined)
                    updates.autoBookDelivery = dto.autoBookDelivery;
                if (dto.enableFollowups !== undefined)
                    updates.enableFollowups = dto.enableFollowups;
                if (dto.greetingTemplate !== undefined)
                    updates.greetingTemplate = dto.greetingTemplate;
                if (dto.negotiationRules !== undefined)
                    updates.negotiationRules = dto.negotiationRules;
                if (dto.workingHours !== undefined)
                    updates.workingHours = dto.workingHours;
                await this.merchantRepo.update(id, updates);
                merchant = await this.merchantRepo.findById(id);
            }
            this.logger.log({
                msg: "Merchant config updated",
                merchantId: id,
            });
            return this.toResponseDto(merchant);
        }
        async toggleActive(id) {
            const merchant = await this.merchantRepo.findById(id);
            if (!merchant) {
                throw new common_1.NotFoundException(`Merchant ${id} not found`);
            }
            await this.merchantRepo.update(id, {
                isActive: !merchant.isActive,
            });
            const updated = await this.merchantRepo.findById(id);
            return this.toResponseDto(updated);
        }
        toResponseDto(merchant) {
            return {
                id: merchant.id,
                name: merchant.name,
                category: merchant.category,
                city: merchant.city || "cairo",
                currency: merchant.currency || "EGP",
                language: merchant.language || "ar-EG",
                dailyTokenBudget: merchant.dailyTokenBudget || 100000,
                defaultDeliveryFee: merchant.defaultDeliveryFee || 30,
                autoBookDelivery: merchant.autoBookDelivery || false,
                enableFollowups: merchant.enableFollowups ?? true,
                isActive: merchant.isActive,
                createdAt: merchant.createdAt,
                updatedAt: merchant.updatedAt,
            };
        }
        generateApiKey() {
            return `mk_${(0, uuid_1.v4)().replace(/-/g, "")}`;
        }
    };
    return MerchantsController = _classThis;
})();
exports.MerchantsController = MerchantsController;
