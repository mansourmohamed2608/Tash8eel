import { Pool } from "pg";
import { IMerchantRepository } from "../../domain/ports/merchant.repository";
import { Merchant, CreateMerchantInput, UpdateMerchantInput, MerchantTokenUsage } from "../../domain/entities/merchant.entity";
export declare class MerchantRepository implements IMerchantRepository {
    private pool;
    constructor(pool: Pool);
    findById(id: string): Promise<Merchant | null>;
    findAll(): Promise<Merchant[]>;
    findActive(): Promise<Merchant[]>;
    create(input: CreateMerchantInput): Promise<Merchant>;
    update(id: string, input: UpdateMerchantInput): Promise<Merchant | null>;
    delete(id: string): Promise<boolean>;
    getTokenUsage(merchantId: string, date: string): Promise<MerchantTokenUsage | null>;
    incrementTokenUsage(merchantId: string, date: string, tokens: number): Promise<MerchantTokenUsage>;
    private mapToEntity;
    private mapTokenUsage;
}
