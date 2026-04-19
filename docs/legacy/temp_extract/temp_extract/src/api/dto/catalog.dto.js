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
exports.CatalogUpsertResponseDto = exports.CatalogItemResponseDto = exports.CatalogUpsertDto = exports.CatalogItemDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
let CatalogItemDto = (() => {
    let _sku_decorators;
    let _sku_initializers = [];
    let _sku_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _price_decorators;
    let _price_initializers = [];
    let _price_extraInitializers = [];
    let _category_decorators;
    let _category_initializers = [];
    let _category_extraInitializers = [];
    let _stock_decorators;
    let _stock_initializers = [];
    let _stock_extraInitializers = [];
    let _isActive_decorators;
    let _isActive_initializers = [];
    let _isActive_extraInitializers = [];
    let _variants_decorators;
    let _variants_initializers = [];
    let _variants_extraInitializers = [];
    let _imageUrl_decorators;
    let _imageUrl_initializers = [];
    let _imageUrl_extraInitializers = [];
    return class CatalogItemDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _sku_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "External SKU/ID" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _name_decorators = [(0, swagger_1.ApiProperty)({ description: "Product name", example: "تيشيرت قطن" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _description_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "Product description" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _price_decorators = [(0, swagger_1.ApiProperty)({ description: "Price in local currency", example: 150 }), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0)];
            _category_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Product category",
                    example: "ملابس رجالي",
                }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            _stock_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "Stock quantity", example: 100 }), (0, class_validator_1.IsNumber)(), (0, class_validator_1.IsOptional)(), (0, class_validator_1.Min)(0)];
            _isActive_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Is product active/available",
                    default: true,
                }), (0, class_validator_1.IsBoolean)(), (0, class_validator_1.IsOptional)()];
            _variants_decorators = [(0, swagger_1.ApiPropertyOptional)({
                    description: "Product variants (sizes, colors, etc.)",
                    example: ["S", "M", "L", "XL"],
                }), (0, class_validator_1.IsArray)(), (0, class_validator_1.IsOptional)()];
            _imageUrl_decorators = [(0, swagger_1.ApiPropertyOptional)({ description: "Product image URL" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _sku_decorators, { kind: "field", name: "sku", static: false, private: false, access: { has: obj => "sku" in obj, get: obj => obj.sku, set: (obj, value) => { obj.sku = value; } }, metadata: _metadata }, _sku_initializers, _sku_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _price_decorators, { kind: "field", name: "price", static: false, private: false, access: { has: obj => "price" in obj, get: obj => obj.price, set: (obj, value) => { obj.price = value; } }, metadata: _metadata }, _price_initializers, _price_extraInitializers);
            __esDecorate(null, null, _category_decorators, { kind: "field", name: "category", static: false, private: false, access: { has: obj => "category" in obj, get: obj => obj.category, set: (obj, value) => { obj.category = value; } }, metadata: _metadata }, _category_initializers, _category_extraInitializers);
            __esDecorate(null, null, _stock_decorators, { kind: "field", name: "stock", static: false, private: false, access: { has: obj => "stock" in obj, get: obj => obj.stock, set: (obj, value) => { obj.stock = value; } }, metadata: _metadata }, _stock_initializers, _stock_extraInitializers);
            __esDecorate(null, null, _isActive_decorators, { kind: "field", name: "isActive", static: false, private: false, access: { has: obj => "isActive" in obj, get: obj => obj.isActive, set: (obj, value) => { obj.isActive = value; } }, metadata: _metadata }, _isActive_initializers, _isActive_extraInitializers);
            __esDecorate(null, null, _variants_decorators, { kind: "field", name: "variants", static: false, private: false, access: { has: obj => "variants" in obj, get: obj => obj.variants, set: (obj, value) => { obj.variants = value; } }, metadata: _metadata }, _variants_initializers, _variants_extraInitializers);
            __esDecorate(null, null, _imageUrl_decorators, { kind: "field", name: "imageUrl", static: false, private: false, access: { has: obj => "imageUrl" in obj, get: obj => obj.imageUrl, set: (obj, value) => { obj.imageUrl = value; } }, metadata: _metadata }, _imageUrl_initializers, _imageUrl_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        sku = __runInitializers(this, _sku_initializers, void 0);
        name = (__runInitializers(this, _sku_extraInitializers), __runInitializers(this, _name_initializers, void 0));
        description = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _description_initializers, void 0));
        price = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _price_initializers, void 0));
        category = (__runInitializers(this, _price_extraInitializers), __runInitializers(this, _category_initializers, void 0));
        stock = (__runInitializers(this, _category_extraInitializers), __runInitializers(this, _stock_initializers, void 0));
        isActive = (__runInitializers(this, _stock_extraInitializers), __runInitializers(this, _isActive_initializers, void 0));
        variants = (__runInitializers(this, _isActive_extraInitializers), __runInitializers(this, _variants_initializers, void 0));
        imageUrl = (__runInitializers(this, _variants_extraInitializers), __runInitializers(this, _imageUrl_initializers, void 0));
        constructor() {
            __runInitializers(this, _imageUrl_extraInitializers);
        }
    };
})();
exports.CatalogItemDto = CatalogItemDto;
let CatalogUpsertDto = (() => {
    let _merchantId_decorators;
    let _merchantId_initializers = [];
    let _merchantId_extraInitializers = [];
    let _items_decorators;
    let _items_initializers = [];
    let _items_extraInitializers = [];
    return class CatalogUpsertDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _merchantId_decorators = [(0, swagger_1.ApiProperty)({ description: "Merchant ID" }), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)()];
            _items_decorators = [(0, swagger_1.ApiProperty)({
                    description: "List of catalog items to upsert",
                    type: [CatalogItemDto],
                }), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => CatalogItemDto)];
            __esDecorate(null, null, _merchantId_decorators, { kind: "field", name: "merchantId", static: false, private: false, access: { has: obj => "merchantId" in obj, get: obj => obj.merchantId, set: (obj, value) => { obj.merchantId = value; } }, metadata: _metadata }, _merchantId_initializers, _merchantId_extraInitializers);
            __esDecorate(null, null, _items_decorators, { kind: "field", name: "items", static: false, private: false, access: { has: obj => "items" in obj, get: obj => obj.items, set: (obj, value) => { obj.items = value; } }, metadata: _metadata }, _items_initializers, _items_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        merchantId = __runInitializers(this, _merchantId_initializers, void 0);
        items = (__runInitializers(this, _merchantId_extraInitializers), __runInitializers(this, _items_initializers, void 0));
        constructor() {
            __runInitializers(this, _items_extraInitializers);
        }
    };
})();
exports.CatalogUpsertDto = CatalogUpsertDto;
let CatalogItemResponseDto = (() => {
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _merchantId_decorators;
    let _merchantId_initializers = [];
    let _merchantId_extraInitializers = [];
    let _sku_decorators;
    let _sku_initializers = [];
    let _sku_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _description_decorators;
    let _description_initializers = [];
    let _description_extraInitializers = [];
    let _price_decorators;
    let _price_initializers = [];
    let _price_extraInitializers = [];
    let _category_decorators;
    let _category_initializers = [];
    let _category_extraInitializers = [];
    let _stock_decorators;
    let _stock_initializers = [];
    let _stock_extraInitializers = [];
    let _isActive_decorators;
    let _isActive_initializers = [];
    let _isActive_extraInitializers = [];
    let _variants_decorators;
    let _variants_initializers = [];
    let _variants_extraInitializers = [];
    let _imageUrl_decorators;
    let _imageUrl_initializers = [];
    let _imageUrl_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    return class CatalogItemResponseDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _id_decorators = [(0, swagger_1.ApiProperty)()];
            _merchantId_decorators = [(0, swagger_1.ApiProperty)()];
            _sku_decorators = [(0, swagger_1.ApiPropertyOptional)()];
            _name_decorators = [(0, swagger_1.ApiProperty)()];
            _description_decorators = [(0, swagger_1.ApiPropertyOptional)()];
            _price_decorators = [(0, swagger_1.ApiProperty)()];
            _category_decorators = [(0, swagger_1.ApiPropertyOptional)()];
            _stock_decorators = [(0, swagger_1.ApiPropertyOptional)()];
            _isActive_decorators = [(0, swagger_1.ApiProperty)()];
            _variants_decorators = [(0, swagger_1.ApiPropertyOptional)()];
            _imageUrl_decorators = [(0, swagger_1.ApiPropertyOptional)()];
            _createdAt_decorators = [(0, swagger_1.ApiProperty)()];
            _updatedAt_decorators = [(0, swagger_1.ApiProperty)()];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _merchantId_decorators, { kind: "field", name: "merchantId", static: false, private: false, access: { has: obj => "merchantId" in obj, get: obj => obj.merchantId, set: (obj, value) => { obj.merchantId = value; } }, metadata: _metadata }, _merchantId_initializers, _merchantId_extraInitializers);
            __esDecorate(null, null, _sku_decorators, { kind: "field", name: "sku", static: false, private: false, access: { has: obj => "sku" in obj, get: obj => obj.sku, set: (obj, value) => { obj.sku = value; } }, metadata: _metadata }, _sku_initializers, _sku_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _description_decorators, { kind: "field", name: "description", static: false, private: false, access: { has: obj => "description" in obj, get: obj => obj.description, set: (obj, value) => { obj.description = value; } }, metadata: _metadata }, _description_initializers, _description_extraInitializers);
            __esDecorate(null, null, _price_decorators, { kind: "field", name: "price", static: false, private: false, access: { has: obj => "price" in obj, get: obj => obj.price, set: (obj, value) => { obj.price = value; } }, metadata: _metadata }, _price_initializers, _price_extraInitializers);
            __esDecorate(null, null, _category_decorators, { kind: "field", name: "category", static: false, private: false, access: { has: obj => "category" in obj, get: obj => obj.category, set: (obj, value) => { obj.category = value; } }, metadata: _metadata }, _category_initializers, _category_extraInitializers);
            __esDecorate(null, null, _stock_decorators, { kind: "field", name: "stock", static: false, private: false, access: { has: obj => "stock" in obj, get: obj => obj.stock, set: (obj, value) => { obj.stock = value; } }, metadata: _metadata }, _stock_initializers, _stock_extraInitializers);
            __esDecorate(null, null, _isActive_decorators, { kind: "field", name: "isActive", static: false, private: false, access: { has: obj => "isActive" in obj, get: obj => obj.isActive, set: (obj, value) => { obj.isActive = value; } }, metadata: _metadata }, _isActive_initializers, _isActive_extraInitializers);
            __esDecorate(null, null, _variants_decorators, { kind: "field", name: "variants", static: false, private: false, access: { has: obj => "variants" in obj, get: obj => obj.variants, set: (obj, value) => { obj.variants = value; } }, metadata: _metadata }, _variants_initializers, _variants_extraInitializers);
            __esDecorate(null, null, _imageUrl_decorators, { kind: "field", name: "imageUrl", static: false, private: false, access: { has: obj => "imageUrl" in obj, get: obj => obj.imageUrl, set: (obj, value) => { obj.imageUrl = value; } }, metadata: _metadata }, _imageUrl_initializers, _imageUrl_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        id = __runInitializers(this, _id_initializers, void 0);
        merchantId = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _merchantId_initializers, void 0));
        sku = (__runInitializers(this, _merchantId_extraInitializers), __runInitializers(this, _sku_initializers, void 0));
        name = (__runInitializers(this, _sku_extraInitializers), __runInitializers(this, _name_initializers, void 0));
        description = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _description_initializers, void 0));
        price = (__runInitializers(this, _description_extraInitializers), __runInitializers(this, _price_initializers, void 0));
        category = (__runInitializers(this, _price_extraInitializers), __runInitializers(this, _category_initializers, void 0));
        stock = (__runInitializers(this, _category_extraInitializers), __runInitializers(this, _stock_initializers, void 0));
        isActive = (__runInitializers(this, _stock_extraInitializers), __runInitializers(this, _isActive_initializers, void 0));
        variants = (__runInitializers(this, _isActive_extraInitializers), __runInitializers(this, _variants_initializers, void 0));
        imageUrl = (__runInitializers(this, _variants_extraInitializers), __runInitializers(this, _imageUrl_initializers, void 0));
        createdAt = (__runInitializers(this, _imageUrl_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
        updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
        constructor() {
            __runInitializers(this, _updatedAt_extraInitializers);
        }
    };
})();
exports.CatalogItemResponseDto = CatalogItemResponseDto;
let CatalogUpsertResponseDto = (() => {
    let _created_decorators;
    let _created_initializers = [];
    let _created_extraInitializers = [];
    let _updated_decorators;
    let _updated_initializers = [];
    let _updated_extraInitializers = [];
    let _total_decorators;
    let _total_initializers = [];
    let _total_extraInitializers = [];
    let _items_decorators;
    let _items_initializers = [];
    let _items_extraInitializers = [];
    return class CatalogUpsertResponseDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _created_decorators = [(0, swagger_1.ApiProperty)({ description: "Number of items created" })];
            _updated_decorators = [(0, swagger_1.ApiProperty)({ description: "Number of items updated" })];
            _total_decorators = [(0, swagger_1.ApiProperty)({ description: "Total items processed" })];
            _items_decorators = [(0, swagger_1.ApiProperty)({ type: [CatalogItemResponseDto] })];
            __esDecorate(null, null, _created_decorators, { kind: "field", name: "created", static: false, private: false, access: { has: obj => "created" in obj, get: obj => obj.created, set: (obj, value) => { obj.created = value; } }, metadata: _metadata }, _created_initializers, _created_extraInitializers);
            __esDecorate(null, null, _updated_decorators, { kind: "field", name: "updated", static: false, private: false, access: { has: obj => "updated" in obj, get: obj => obj.updated, set: (obj, value) => { obj.updated = value; } }, metadata: _metadata }, _updated_initializers, _updated_extraInitializers);
            __esDecorate(null, null, _total_decorators, { kind: "field", name: "total", static: false, private: false, access: { has: obj => "total" in obj, get: obj => obj.total, set: (obj, value) => { obj.total = value; } }, metadata: _metadata }, _total_initializers, _total_extraInitializers);
            __esDecorate(null, null, _items_decorators, { kind: "field", name: "items", static: false, private: false, access: { has: obj => "items" in obj, get: obj => obj.items, set: (obj, value) => { obj.items = value; } }, metadata: _metadata }, _items_initializers, _items_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        created = __runInitializers(this, _created_initializers, void 0);
        updated = (__runInitializers(this, _created_extraInitializers), __runInitializers(this, _updated_initializers, void 0));
        total = (__runInitializers(this, _updated_extraInitializers), __runInitializers(this, _total_initializers, void 0));
        items = (__runInitializers(this, _total_extraInitializers), __runInitializers(this, _items_initializers, void 0));
        constructor() {
            __runInitializers(this, _items_extraInitializers);
        }
    };
})();
exports.CatalogUpsertResponseDto = CatalogUpsertResponseDto;
