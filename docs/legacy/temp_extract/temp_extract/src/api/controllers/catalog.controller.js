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
exports.CatalogController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const catalog_dto_1 = require("../dto/catalog.dto");
const common_2 = require("@nestjs/common");
let CatalogController = (() => {
    let _classDecorators = [(0, swagger_1.ApiTags)("Catalog"), (0, common_1.Controller)("v1/catalog")];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _upsertItems_decorators;
    var CatalogController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _upsertItems_decorators = [(0, common_1.Post)("upsert"), (0, common_1.HttpCode)(common_1.HttpStatus.OK), (0, swagger_1.ApiOperation)({
                    summary: "Upsert catalog items",
                    description: "Create or update catalog items for a merchant. Items are matched by name or SKU.",
                }), (0, swagger_1.ApiResponse)({
                    status: 200,
                    description: "Items upserted successfully",
                    type: catalog_dto_1.CatalogUpsertResponseDto,
                }), (0, swagger_1.ApiResponse)({ status: 404, description: "Merchant not found" })];
            __esDecorate(this, null, _upsertItems_decorators, { kind: "method", name: "upsertItems", static: false, private: false, access: { has: obj => "upsertItems" in obj, get: obj => obj.upsertItems }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            CatalogController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        catalogRepo = __runInitializers(this, _instanceExtraInitializers);
        merchantRepo;
        logger = new common_1.Logger(CatalogController.name);
        constructor(catalogRepo, merchantRepo) {
            this.catalogRepo = catalogRepo;
            this.merchantRepo = merchantRepo;
        }
        async upsertItems(dto) {
            // Verify merchant exists
            const merchant = await this.merchantRepo.findById(dto.merchantId);
            if (!merchant) {
                throw new common_2.NotFoundException(`Merchant ${dto.merchantId} not found`);
            }
            let created = 0;
            let updated = 0;
            const processedItems = [];
            for (const itemDto of dto.items) {
                // Check if item exists by name or SKU
                let existingItem = await this.catalogRepo.findByName(itemDto.name, dto.merchantId);
                if (!existingItem && itemDto.sku) {
                    existingItem = await this.catalogRepo.findBySku(itemDto.sku, dto.merchantId);
                }
                if (existingItem) {
                    // Update existing item
                    const updatedItem = {
                        ...existingItem,
                        name: itemDto.name,
                        description: itemDto.description ?? existingItem.description,
                        price: itemDto.price,
                        category: itemDto.category ?? existingItem.category,
                        stock: itemDto.stock ?? existingItem.stock,
                        isActive: itemDto.isActive ?? existingItem.isActive,
                        variants: existingItem.variants,
                        imageUrl: itemDto.imageUrl ?? existingItem.imageUrl,
                        updatedAt: new Date(),
                    };
                    await this.catalogRepo.update(existingItem.id, updatedItem);
                    processedItems.push(updatedItem);
                    updated++;
                }
                else {
                    // Create new item - use create input, not full CatalogItem
                    await this.catalogRepo.create({
                        merchantId: dto.merchantId,
                        sku: itemDto.sku,
                        nameAr: itemDto.name,
                        basePrice: itemDto.price ?? 0,
                        category: itemDto.category,
                        isAvailable: itemDto.isActive ?? true,
                    });
                    const createdItem = await this.catalogRepo.findByName(itemDto.name, dto.merchantId);
                    if (createdItem)
                        processedItems.push(createdItem);
                    created++;
                }
            }
            this.logger.log({
                message: "Catalog items upserted",
                merchantId: dto.merchantId,
                created,
                updated,
                total: dto.items.length,
            });
            return {
                created,
                updated,
                total: dto.items.length,
                items: processedItems.map((item) => this.toResponseDto(item)),
            };
        }
        toResponseDto(item) {
            return {
                id: item.id,
                merchantId: item.merchantId,
                sku: item.sku,
                name: item.name || item.nameAr,
                description: item.description || item.descriptionAr,
                price: item.price || item.basePrice,
                category: item.category,
                stock: item.stock,
                isActive: item.isActive ?? item.isAvailable,
                variants: item.variants?.map((v) => v.name) || [],
                imageUrl: item.imageUrl,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            };
        }
    };
    return CatalogController = _classThis;
})();
exports.CatalogController = CatalogController;
