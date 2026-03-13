import { MerchantConfigDto, MerchantResponseDto } from "../dto/merchant.dto";
import { IMerchantRepository } from "../../domain/ports/merchant.repository";
export declare class MerchantsController {
    private readonly merchantRepo;
    private readonly logger;
    constructor(merchantRepo: IMerchantRepository);
    getMerchant(id: string): Promise<MerchantResponseDto>;
    updateConfig(id: string, dto: MerchantConfigDto): Promise<MerchantResponseDto>;
    toggleActive(id: string): Promise<MerchantResponseDto>;
    private toResponseDto;
    private generateApiKey;
}
