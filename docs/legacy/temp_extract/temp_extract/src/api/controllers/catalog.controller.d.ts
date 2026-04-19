import { CatalogUpsertDto, CatalogUpsertResponseDto } from "../dto/catalog.dto";
import { ICatalogRepository } from "../../domain/ports/catalog.repository";
import { IMerchantRepository } from "../../domain/ports/merchant.repository";
export declare class CatalogController {
    private readonly catalogRepo;
    private readonly merchantRepo;
    private readonly logger;
    constructor(catalogRepo: ICatalogRepository, merchantRepo: IMerchantRepository);
    upsertItems(dto: CatalogUpsertDto): Promise<CatalogUpsertResponseDto>;
    private toResponseDto;
}
