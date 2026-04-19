import { Pool } from "pg";
import { ICatalogRepository } from "../../domain/ports/catalog.repository";
import { CatalogItem, CreateCatalogItemInput, UpdateCatalogItemInput } from "../../domain/entities/catalog.entity";
export declare class CatalogRepository implements ICatalogRepository {
    private pool;
    constructor(pool: Pool);
    findById(id: string): Promise<CatalogItem | null>;
    findBySku(merchantId: string, sku: string): Promise<CatalogItem | null>;
    findByMerchant(merchantId: string): Promise<CatalogItem[]>;
    findByMerchantAndCategory(merchantId: string, category: string): Promise<CatalogItem[]>;
    searchByName(merchantId: string, query: string): Promise<CatalogItem[]>;
    create(input: CreateCatalogItemInput): Promise<CatalogItem>;
    update(id: string, input: UpdateCatalogItemInput): Promise<CatalogItem | null>;
    upsertBySku(input: CreateCatalogItemInput): Promise<CatalogItem>;
    delete(id: string): Promise<boolean>;
    findByName(name: string, merchantId: string): Promise<CatalogItem | null>;
    private mapToEntity;
}
