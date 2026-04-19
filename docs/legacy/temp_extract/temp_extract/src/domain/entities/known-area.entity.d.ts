export interface KnownArea {
    id: string;
    city: string;
    areaNameAr: string;
    areaNameEn?: string;
    areaAliases: string[];
    deliveryZone?: string;
    createdAt: Date;
    area?: string;
}
