import {
  Merchant,
  CreateMerchantInput,
  UpdateMerchantInput,
  MerchantTokenUsage,
} from '../entities/merchant.entity';

export interface IMerchantRepository {
  findById(id: string): Promise<Merchant | null>;
  findAll(): Promise<Merchant[]>;
  findActive(): Promise<Merchant[]>;
  create(input: CreateMerchantInput): Promise<Merchant>;
  update(id: string, input: UpdateMerchantInput): Promise<Merchant | null>;
  delete(id: string): Promise<boolean>;
  
  // Token usage
  getTokenUsage(merchantId: string, date: string): Promise<MerchantTokenUsage | null>;
  incrementTokenUsage(merchantId: string, date: string, tokens: number): Promise<MerchantTokenUsage>;
}

export const MERCHANT_REPOSITORY = Symbol('IMerchantRepository');
