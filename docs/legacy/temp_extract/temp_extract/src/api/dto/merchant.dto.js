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
exports.MerchantResponseDto = exports.MerchantConfigDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
const enums_1 = require("../../shared/constants/enums");
let NegotiationRulesDto = (() => {
    let _maxDiscountPercent_decorators;
    let _maxDiscountPercent_initializers = [];
    let _maxDiscountPercent_extraInitializers = [];
    let _allowQuantityNegotiation_decorators;
    let _allowQuantityNegotiation_initializers = [];
    let _allowQuantityNegotiation_extraInitializers = [];
    let _allowDeliveryFeeNegotiation_decorators;
    let _allowDeliveryFeeNegotiation_initializers = [];
    let _allowDeliveryFeeNegotiation_extraInitializers = [];
    let _freeDeliveryThreshold_decorators;
    let _freeDeliveryThreshold_initializers = [];
    let _freeDeliveryThreshold_extraInitializers = [];
    return class NegotiationRulesDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _maxDiscountPercent_decorators = [(0, swagger_1.ApiProperty)({
                    description: "Maximum discount percentage allowed",
                    example: 10,
                }), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0), (0, class_validator_1.Max)(50)];
            _allowQuantityNegotiation_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Allow negotiation on quantities",
                    example: true,
                }), (0, class_validator_1.IsBoolean)(), (0, class_validator_1.IsOptional)()];
            _allowDeliveryFeeNegotiation_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Allow negotiation on delivery fee",
                    example: false,
                }), (0, class_validator_1.IsBoolean)(), (0, class_validator_1.IsOptional)()];
            _freeDeliveryThreshold_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Minimum order for free delivery",
                    example: 500,
                }), (0, class_validator_1.IsNumber)(), (0, class_validator_1.IsOptional)(), (0, class_validator_1.Min)(0)];
            __esDecorate(null, null, _maxDiscountPercent_decorators, { kind: "field", name: "maxDiscountPercent", static: false, private: false, access: { has: obj => "maxDiscountPercent" in obj, get: obj => obj.maxDiscountPercent, set: (obj, value) => { obj.maxDiscountPercent = value; } }, metadata: _metadata }, _maxDiscountPercent_initializers, _maxDiscountPercent_extraInitializers);
            __esDecorate(null, null, _allowQuantityNegotiation_decorators, { kind: "field", name: "allowQuantityNegotiation", static: false, private: false, access: { has: obj => "allowQuantityNegotiation" in obj, get: obj => obj.allowQuantityNegotiation, set: (obj, value) => { obj.allowQuantityNegotiation = value; } }, metadata: _metadata }, _allowQuantityNegotiation_initializers, _allowQuantityNegotiation_extraInitializers);
            __esDecorate(null, null, _allowDeliveryFeeNegotiation_decorators, { kind: "field", name: "allowDeliveryFeeNegotiation", static: false, private: false, access: { has: obj => "allowDeliveryFeeNegotiation" in obj, get: obj => obj.allowDeliveryFeeNegotiation, set: (obj, value) => { obj.allowDeliveryFeeNegotiation = value; } }, metadata: _metadata }, _allowDeliveryFeeNegotiation_initializers, _allowDeliveryFeeNegotiation_extraInitializers);
            __esDecorate(null, null, _freeDeliveryThreshold_decorators, { kind: "field", name: "freeDeliveryThreshold", static: false, private: false, access: { has: obj => "freeDeliveryThreshold" in obj, get: obj => obj.freeDeliveryThreshold, set: (obj, value) => { obj.freeDeliveryThreshold = value; } }, metadata: _metadata }, _freeDeliveryThreshold_initializers, _freeDeliveryThreshold_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        maxDiscountPercent = __runInitializers(this, _maxDiscountPercent_initializers, void 0);
        allowQuantityNegotiation = (__runInitializers(this, _maxDiscountPercent_extraInitializers), __runInitializers(this, _allowQuantityNegotiation_initializers, void 0));
        allowDeliveryFeeNegotiation = (__runInitializers(this, _allowQuantityNegotiation_extraInitializers), __runInitializers(this, _allowDeliveryFeeNegotiation_initializers, void 0));
        freeDeliveryThreshold = (__runInitializers(this, _allowDeliveryFeeNegotiation_extraInitializers), __runInitializers(this, _freeDeliveryThreshold_initializers, void 0));
        constructor() {
            __runInitializers(this, _freeDeliveryThreshold_extraInitializers);
        }
    };
})();
let WorkingHoursDto = (() => {
    let _open_decorators;
    let _open_initializers = [];
    let _open_extraInitializers = [];
    let _close_decorators;
    let _close_initializers = [];
    let _close_extraInitializers = [];
    return class WorkingHoursDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _open_decorators = [(0, swagger_1.ApiProperty)({ description: "Opening time", example: "09:00" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _close_decorators = [(0, swagger_1.ApiProperty)({ description: "Closing time", example: "22:00" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            __esDecorate(null, null, _open_decorators, { kind: "field", name: "open", static: false, private: false, access: { has: obj => "open" in obj, get: obj => obj.open, set: (obj, value) => { obj.open = value; } }, metadata: _metadata }, _open_initializers, _open_extraInitializers);
            __esDecorate(null, null, _close_decorators, { kind: "field", name: "close", static: false, private: false, access: { has: obj => "close" in obj, get: obj => obj.close, set: (obj, value) => { obj.close = value; } }, metadata: _metadata }, _close_initializers, _close_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        open = __runInitializers(this, _open_initializers, void 0);
        close = (__runInitializers(this, _open_extraInitializers), __runInitializers(this, _close_initializers, void 0));
        constructor() {
            __runInitializers(this, _close_extraInitializers);
        }
    };
})();
let MerchantConfigDto = (() => {
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _category_decorators;
    let _category_initializers = [];
    let _category_extraInitializers = [];
    let _city_decorators;
    let _city_initializers = [];
    let _city_extraInitializers = [];
    let _defaultDeliveryFee_decorators;
    let _defaultDeliveryFee_initializers = [];
    let _defaultDeliveryFee_extraInitializers = [];
    let _currency_decorators;
    let _currency_initializers = [];
    let _currency_extraInitializers = [];
    let _language_decorators;
    let _language_initializers = [];
    let _language_extraInitializers = [];
    let _dailyTokenBudget_decorators;
    let _dailyTokenBudget_initializers = [];
    let _dailyTokenBudget_extraInitializers = [];
    let _autoBookDelivery_decorators;
    let _autoBookDelivery_initializers = [];
    let _autoBookDelivery_extraInitializers = [];
    let _enableFollowups_decorators;
    let _enableFollowups_initializers = [];
    let _enableFollowups_extraInitializers = [];
    let _greetingTemplate_decorators;
    let _greetingTemplate_initializers = [];
    let _greetingTemplate_extraInitializers = [];
    let _negotiationRules_decorators;
    let _negotiationRules_initializers = [];
    let _negotiationRules_extraInitializers = [];
    let _workingHours_decorators;
    let _workingHours_initializers = [];
    let _workingHours_extraInitializers = [];
    return class MerchantConfigDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _name_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "Merchant display name" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _category_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Business category",
                    enum: enums_1.MerchantCategory,
                }), (0, class_validator_1.IsEnum)(enums_1.MerchantCategory), (0, class_validator_1.IsOptional)()];
            _city_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "City for delivery area validation",
                    example: "cairo",
                }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _defaultDeliveryFee_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "Default delivery fee", example: 30 }), (0, class_validator_1.IsNumber)(), (0, class_validator_1.IsOptional)(), (0, class_validator_1.Min)(0)];
            _currency_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "Currency code", example: "EGP" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _language_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "Language code", example: "ar-EG" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _dailyTokenBudget_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Daily token budget limit",
                    example: 100000,
                }), (0, class_validator_1.IsNumber)(), (0, class_validator_1.IsOptional)(), (0, class_validator_1.Min)(1000)];
            _autoBookDelivery_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Auto-book delivery on order confirmation",
                }), (0, class_validator_1.IsBoolean)(), (0, class_validator_1.IsOptional)()];
            _enableFollowups_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Enable follow-up messages for abandoned carts",
                }), (0, class_validator_1.IsBoolean)(), (0, class_validator_1.IsOptional)()];
            _greetingTemplate_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "Custom greeting message template" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _negotiationRules_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Negotiation rules",
                    type: NegotiationRulesDto,
                }), (0, class_validator_1.ValidateNested)(), (0, class_transformer_1.Type)(() => NegotiationRulesDto), (0, class_validator_1.IsOptional)()];
            _workingHours_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Working hours",
                    type: WorkingHoursDto,
                }), (0, class_validator_1.ValidateNested)(), (0, class_transformer_1.Type)(() => WorkingHoursDto), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _category_decorators, { kind: "field", name: "category", static: false, private: false, access: { has: obj => "category" in obj, get: obj => obj.category, set: (obj, value) => { obj.category = value; } }, metadata: _metadata }, _category_initializers, _category_extraInitializers);
            __esDecorate(null, null, _city_decorators, { kind: "field", name: "city", static: false, private: false, access: { has: obj => "city" in obj, get: obj => obj.city, set: (obj, value) => { obj.city = value; } }, metadata: _metadata }, _city_initializers, _city_extraInitializers);
            __esDecorate(null, null, _defaultDeliveryFee_decorators, { kind: "field", name: "defaultDeliveryFee", static: false, private: false, access: { has: obj => "defaultDeliveryFee" in obj, get: obj => obj.defaultDeliveryFee, set: (obj, value) => { obj.defaultDeliveryFee = value; } }, metadata: _metadata }, _defaultDeliveryFee_initializers, _defaultDeliveryFee_extraInitializers);
            __esDecorate(null, null, _currency_decorators, { kind: "field", name: "currency", static: false, private: false, access: { has: obj => "currency" in obj, get: obj => obj.currency, set: (obj, value) => { obj.currency = value; } }, metadata: _metadata }, _currency_initializers, _currency_extraInitializers);
            __esDecorate(null, null, _language_decorators, { kind: "field", name: "language", static: false, private: false, access: { has: obj => "language" in obj, get: obj => obj.language, set: (obj, value) => { obj.language = value; } }, metadata: _metadata }, _language_initializers, _language_extraInitializers);
            __esDecorate(null, null, _dailyTokenBudget_decorators, { kind: "field", name: "dailyTokenBudget", static: false, private: false, access: { has: obj => "dailyTokenBudget" in obj, get: obj => obj.dailyTokenBudget, set: (obj, value) => { obj.dailyTokenBudget = value; } }, metadata: _metadata }, _dailyTokenBudget_initializers, _dailyTokenBudget_extraInitializers);
            __esDecorate(null, null, _autoBookDelivery_decorators, { kind: "field", name: "autoBookDelivery", static: false, private: false, access: { has: obj => "autoBookDelivery" in obj, get: obj => obj.autoBookDelivery, set: (obj, value) => { obj.autoBookDelivery = value; } }, metadata: _metadata }, _autoBookDelivery_initializers, _autoBookDelivery_extraInitializers);
            __esDecorate(null, null, _enableFollowups_decorators, { kind: "field", name: "enableFollowups", static: false, private: false, access: { has: obj => "enableFollowups" in obj, get: obj => obj.enableFollowups, set: (obj, value) => { obj.enableFollowups = value; } }, metadata: _metadata }, _enableFollowups_initializers, _enableFollowups_extraInitializers);
            __esDecorate(null, null, _greetingTemplate_decorators, { kind: "field", name: "greetingTemplate", static: false, private: false, access: { has: obj => "greetingTemplate" in obj, get: obj => obj.greetingTemplate, set: (obj, value) => { obj.greetingTemplate = value; } }, metadata: _metadata }, _greetingTemplate_initializers, _greetingTemplate_extraInitializers);
            __esDecorate(null, null, _negotiationRules_decorators, { kind: "field", name: "negotiationRules", static: false, private: false, access: { has: obj => "negotiationRules" in obj, get: obj => obj.negotiationRules, set: (obj, value) => { obj.negotiationRules = value; } }, metadata: _metadata }, _negotiationRules_initializers, _negotiationRules_extraInitializers);
            __esDecorate(null, null, _workingHours_decorators, { kind: "field", name: "workingHours", static: false, private: false, access: { has: obj => "workingHours" in obj, get: obj => obj.workingHours, set: (obj, value) => { obj.workingHours = value; } }, metadata: _metadata }, _workingHours_initializers, _workingHours_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        name = __runInitializers(this, _name_initializers, void 0);
        category = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _category_initializers, void 0));
        city = (__runInitializers(this, _category_extraInitializers), __runInitializers(this, _city_initializers, void 0));
        defaultDeliveryFee = (__runInitializers(this, _city_extraInitializers), __runInitializers(this, _defaultDeliveryFee_initializers, void 0));
        currency = (__runInitializers(this, _defaultDeliveryFee_extraInitializers), __runInitializers(this, _currency_initializers, void 0));
        language = (__runInitializers(this, _currency_extraInitializers), __runInitializers(this, _language_initializers, void 0));
        dailyTokenBudget = (__runInitializers(this, _language_extraInitializers), __runInitializers(this, _dailyTokenBudget_initializers, void 0));
        autoBookDelivery = (__runInitializers(this, _dailyTokenBudget_extraInitializers), __runInitializers(this, _autoBookDelivery_initializers, void 0));
        enableFollowups = (__runInitializers(this, _autoBookDelivery_extraInitializers), __runInitializers(this, _enableFollowups_initializers, void 0));
        greetingTemplate = (__runInitializers(this, _enableFollowups_extraInitializers), __runInitializers(this, _greetingTemplate_initializers, void 0));
        negotiationRules = (__runInitializers(this, _greetingTemplate_extraInitializers), __runInitializers(this, _negotiationRules_initializers, void 0));
        workingHours = (__runInitializers(this, _negotiationRules_extraInitializers), __runInitializers(this, _workingHours_initializers, void 0));
        constructor() {
            __runInitializers(this, _workingHours_extraInitializers);
        }
    };
})();
exports.MerchantConfigDto = MerchantConfigDto;
let MerchantResponseDto = (() => {
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _category_decorators;
    let _category_initializers = [];
    let _category_extraInitializers = [];
    let _city_decorators;
    let _city_initializers = [];
    let _city_extraInitializers = [];
    let _currency_decorators;
    let _currency_initializers = [];
    let _currency_extraInitializers = [];
    let _language_decorators;
    let _language_initializers = [];
    let _language_extraInitializers = [];
    let _dailyTokenBudget_decorators;
    let _dailyTokenBudget_initializers = [];
    let _dailyTokenBudget_extraInitializers = [];
    let _defaultDeliveryFee_decorators;
    let _defaultDeliveryFee_initializers = [];
    let _defaultDeliveryFee_extraInitializers = [];
    let _autoBookDelivery_decorators;
    let _autoBookDelivery_initializers = [];
    let _autoBookDelivery_extraInitializers = [];
    let _enableFollowups_decorators;
    let _enableFollowups_initializers = [];
    let _enableFollowups_extraInitializers = [];
    let _isActive_decorators;
    let _isActive_initializers = [];
    let _isActive_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    return class MerchantResponseDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [(0, swagger_1.ApiProperty)()];
            _name_decorators = [(0, swagger_1.ApiProperty)()];
            _category_decorators = [(0, swagger_1.ApiProperty)({ enum: enums_1.MerchantCategory })];
            _city_decorators = [(0, swagger_1.ApiProperty)()];
            _currency_decorators = [(0, swagger_1.ApiProperty)()];
            _language_decorators = [(0, swagger_1.ApiProperty)()];
            _dailyTokenBudget_decorators = [(0, swagger_1.ApiProperty)()];
            _defaultDeliveryFee_decorators = [(0, swagger_1.ApiProperty)()];
            _autoBookDelivery_decorators = [(0, swagger_1.ApiProperty)()];
            _enableFollowups_decorators = [(0, swagger_1.ApiProperty)()];
            _isActive_decorators = [(0, swagger_1.ApiProperty)()];
            _createdAt_decorators = [(0, swagger_1.ApiProperty)()];
            _updatedAt_decorators = [(0, swagger_1.ApiProperty)()];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _category_decorators, { kind: "field", name: "category", static: false, private: false, access: { has: obj => "category" in obj, get: obj => obj.category, set: (obj, value) => { obj.category = value; } }, metadata: _metadata }, _category_initializers, _category_extraInitializers);
            __esDecorate(null, null, _city_decorators, { kind: "field", name: "city", static: false, private: false, access: { has: obj => "city" in obj, get: obj => obj.city, set: (obj, value) => { obj.city = value; } }, metadata: _metadata }, _city_initializers, _city_extraInitializers);
            __esDecorate(null, null, _currency_decorators, { kind: "field", name: "currency", static: false, private: false, access: { has: obj => "currency" in obj, get: obj => obj.currency, set: (obj, value) => { obj.currency = value; } }, metadata: _metadata }, _currency_initializers, _currency_extraInitializers);
            __esDecorate(null, null, _language_decorators, { kind: "field", name: "language", static: false, private: false, access: { has: obj => "language" in obj, get: obj => obj.language, set: (obj, value) => { obj.language = value; } }, metadata: _metadata }, _language_initializers, _language_extraInitializers);
            __esDecorate(null, null, _dailyTokenBudget_decorators, { kind: "field", name: "dailyTokenBudget", static: false, private: false, access: { has: obj => "dailyTokenBudget" in obj, get: obj => obj.dailyTokenBudget, set: (obj, value) => { obj.dailyTokenBudget = value; } }, metadata: _metadata }, _dailyTokenBudget_initializers, _dailyTokenBudget_extraInitializers);
            __esDecorate(null, null, _defaultDeliveryFee_decorators, { kind: "field", name: "defaultDeliveryFee", static: false, private: false, access: { has: obj => "defaultDeliveryFee" in obj, get: obj => obj.defaultDeliveryFee, set: (obj, value) => { obj.defaultDeliveryFee = value; } }, metadata: _metadata }, _defaultDeliveryFee_initializers, _defaultDeliveryFee_extraInitializers);
            __esDecorate(null, null, _autoBookDelivery_decorators, { kind: "field", name: "autoBookDelivery", static: false, private: false, access: { has: obj => "autoBookDelivery" in obj, get: obj => obj.autoBookDelivery, set: (obj, value) => { obj.autoBookDelivery = value; } }, metadata: _metadata }, _autoBookDelivery_initializers, _autoBookDelivery_extraInitializers);
            __esDecorate(null, null, _enableFollowups_decorators, { kind: "field", name: "enableFollowups", static: false, private: false, access: { has: obj => "enableFollowups" in obj, get: obj => obj.enableFollowups, set: (obj, value) => { obj.enableFollowups = value; } }, metadata: _metadata }, _enableFollowups_initializers, _enableFollowups_extraInitializers);
            __esDecorate(null, null, _isActive_decorators, { kind: "field", name: "isActive", static: false, private: false, access: { has: obj => "isActive" in obj, get: obj => obj.isActive, set: (obj, value) => { obj.isActive = value; } }, metadata: _metadata }, _isActive_initializers, _isActive_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        id = __runInitializers(this, _id_initializers, void 0);
        name = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _name_initializers, void 0));
        category = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _category_initializers, void 0));
        city = (__runInitializers(this, _category_extraInitializers), __runInitializers(this, _city_initializers, void 0));
        currency = (__runInitializers(this, _city_extraInitializers), __runInitializers(this, _currency_initializers, void 0));
        language = (__runInitializers(this, _currency_extraInitializers), __runInitializers(this, _language_initializers, void 0));
        dailyTokenBudget = (__runInitializers(this, _language_extraInitializers), __runInitializers(this, _dailyTokenBudget_initializers, void 0));
        defaultDeliveryFee = (__runInitializers(this, _dailyTokenBudget_extraInitializers), __runInitializers(this, _defaultDeliveryFee_initializers, void 0));
        autoBookDelivery = (__runInitializers(this, _defaultDeliveryFee_extraInitializers), __runInitializers(this, _autoBookDelivery_initializers, void 0));
        enableFollowups = (__runInitializers(this, _autoBookDelivery_extraInitializers), __runInitializers(this, _enableFollowups_initializers, void 0));
        isActive = (__runInitializers(this, _enableFollowups_extraInitializers), __runInitializers(this, _isActive_initializers, void 0));
        createdAt = (__runInitializers(this, _isActive_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
        updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
        constructor() {
            __runInitializers(this, _updatedAt_extraInitializers);
        }
    };
})();
exports.MerchantResponseDto = MerchantResponseDto;
