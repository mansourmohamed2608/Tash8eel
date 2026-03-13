export declare class CatalogItemDto {
    sku?: string;
    name: string;
    description?: string;
    price: number;
    category?: string;
    stock?: number;
    isActive?: boolean;
    variants?: string[];
    imageUrl?: string;
}
export declare class CatalogUpsertDto {
    merchantId: string;
    items: CatalogItemDto[];
}
export declare class CatalogItemResponseDto {
    id: string;
    merchantId: string;
    sku?: string;
    name: string;
    description?: string;
    price: number;
    category?: string;
    stock?: number;
    isActive: boolean;
    variants?: string[];
    imageUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare class CatalogUpsertResponseDto {
    created: number;
    updated: number;
    total: number;
    items: CatalogItemResponseDto[];
}
