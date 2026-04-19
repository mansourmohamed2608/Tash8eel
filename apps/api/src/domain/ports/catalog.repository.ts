import {
  CatalogItem,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
} from "../entities/catalog.entity";

export interface ICatalogRepository {
  findById(id: string): Promise<CatalogItem | null>;
  findBySku(merchantId: string, sku: string): Promise<CatalogItem | null>;
  findByMerchant(merchantId: string): Promise<CatalogItem[]>;
  findByMerchantAndCategory(
    merchantId: string,
    category: string,
  ): Promise<CatalogItem[]>;
  searchByName(merchantId: string, query: string): Promise<CatalogItem[]>;
  findByName(name: string, merchantId: string): Promise<CatalogItem | null>;
  create(input: CreateCatalogItemInput): Promise<CatalogItem>;
  update(
    id: string,
    input: UpdateCatalogItemInput,
  ): Promise<CatalogItem | null>;
  upsertBySku(input: CreateCatalogItemInput): Promise<CatalogItem>;
  delete(id: string): Promise<boolean>;
}

export const CATALOG_REPOSITORY = Symbol("ICatalogRepository");
