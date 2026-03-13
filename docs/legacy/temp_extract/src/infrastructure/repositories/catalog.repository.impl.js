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
exports.CatalogRepository = void 0;
const common_1 = require("@nestjs/common");
const helpers_1 = require("../../shared/utils/helpers");
let CatalogRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var CatalogRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            CatalogRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async findById(id) {
            const result = await this.pool.query(`SELECT * FROM catalog_items WHERE id = $1`, [id]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findBySku(merchantId, sku) {
            const result = await this.pool.query(`SELECT * FROM catalog_items WHERE merchant_id = $1 AND sku = $2`, [merchantId, sku]);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async findByMerchant(merchantId) {
            const result = await this.pool.query(`SELECT * FROM catalog_items WHERE merchant_id = $1 AND is_available = true ORDER BY name_ar`, [merchantId]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async findByMerchantAndCategory(merchantId, category) {
            const result = await this.pool.query(`SELECT * FROM catalog_items WHERE merchant_id = $1 AND category = $2 AND is_available = true ORDER BY name_ar`, [merchantId, category]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async searchByName(merchantId, query) {
            const result = await this.pool.query(`SELECT * FROM catalog_items 
       WHERE merchant_id = $1 AND is_available = true 
       AND (name_ar ILIKE $2 OR name_en ILIKE $2 OR $3 = ANY(tags))
       ORDER BY similarity(name_ar, $3) DESC
       LIMIT 10`, [merchantId, `%${query}%`, query]);
            return result.rows.map((row) => this.mapToEntity(row));
        }
        async create(input) {
            const id = (0, helpers_1.generateId)();
            const result = await this.pool.query(`INSERT INTO catalog_items (id, merchant_id, sku, name_ar, name_en, description_ar, category, base_price, min_price, variants, options, tags, is_available)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`, [
                id,
                input.merchantId,
                input.sku || null,
                input.nameAr,
                input.nameEn || null,
                input.descriptionAr || null,
                input.category || null,
                input.basePrice,
                input.minPrice || null,
                JSON.stringify(input.variants || []),
                JSON.stringify(input.options || []),
                input.tags || [],
                input.isAvailable !== false,
            ]);
            return this.mapToEntity(result.rows[0]);
        }
        async update(id, input) {
            const updates = [];
            const values = [];
            let paramIndex = 1;
            if (input.nameAr !== undefined) {
                updates.push(`name_ar = $${paramIndex++}`);
                values.push(input.nameAr);
            }
            if (input.nameEn !== undefined) {
                updates.push(`name_en = $${paramIndex++}`);
                values.push(input.nameEn);
            }
            if (input.descriptionAr !== undefined) {
                updates.push(`description_ar = $${paramIndex++}`);
                values.push(input.descriptionAr);
            }
            if (input.category !== undefined) {
                updates.push(`category = $${paramIndex++}`);
                values.push(input.category);
            }
            if (input.basePrice !== undefined) {
                updates.push(`base_price = $${paramIndex++}`);
                values.push(input.basePrice);
            }
            if (input.minPrice !== undefined) {
                updates.push(`min_price = $${paramIndex++}`);
                values.push(input.minPrice);
            }
            if (input.variants !== undefined) {
                updates.push(`variants = $${paramIndex++}`);
                values.push(JSON.stringify(input.variants));
            }
            if (input.options !== undefined) {
                updates.push(`options = $${paramIndex++}`);
                values.push(JSON.stringify(input.options));
            }
            if (input.tags !== undefined) {
                updates.push(`tags = $${paramIndex++}`);
                values.push(input.tags);
            }
            if (input.isAvailable !== undefined) {
                updates.push(`is_available = $${paramIndex++}`);
                values.push(input.isAvailable);
            }
            if (updates.length === 0)
                return this.findById(id);
            values.push(id);
            const result = await this.pool.query(`UPDATE catalog_items SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`, values);
            return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
        }
        async upsertBySku(input) {
            if (!input.sku) {
                return this.create(input);
            }
            const existing = await this.findBySku(input.merchantId, input.sku);
            if (existing) {
                return (await this.update(existing.id, {
                    nameAr: input.nameAr,
                    nameEn: input.nameEn,
                    descriptionAr: input.descriptionAr,
                    category: input.category,
                    basePrice: input.basePrice,
                    minPrice: input.minPrice,
                    variants: input.variants,
                    options: input.options,
                    tags: input.tags,
                    isAvailable: input.isAvailable,
                }));
            }
            return this.create(input);
        }
        async delete(id) {
            const result = await this.pool.query(`DELETE FROM catalog_items WHERE id = $1`, [id]);
            return (result.rowCount ?? 0) > 0;
        }
        async findByName(name, merchantId) {
            const results = await this.searchByName(merchantId, name);
            return results[0] || null;
        }
        mapToEntity(row) {
            return {
                id: row.id,
                merchantId: row.merchant_id,
                sku: row.sku,
                nameAr: row.name_ar,
                nameEn: row.name_en,
                descriptionAr: row.description_ar,
                category: row.category,
                basePrice: parseFloat(row.base_price),
                minPrice: row.min_price ? parseFloat(row.min_price) : undefined,
                variants: row.variants,
                options: row.options,
                tags: row.tags,
                isAvailable: row.is_available,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            };
        }
    };
    return CatalogRepository = _classThis;
})();
exports.CatalogRepository = CatalogRepository;
