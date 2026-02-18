import {
  Merchant,
  CreateMerchantInput,
  UpdateMerchantInput,
  MerchantTokenUsage,
} from "../entities/merchant.entity";

export interface IMerchantRepository {
  findById(id: string): Promise<Merchant | null>;
  findAll(): Promise<Merchant[]>;
  findActive(): Promise<Merchant[]>;
  create(input: CreateMerchantInput): Promise<Merchant>;
  update(id: string, input: UpdateMerchantInput): Promise<Merchant | null>;
  delete(id: string): Promise<boolean>;

  // Token usage
  getTokenUsage(
    merchantId: string,
    date: string,
  ): Promise<MerchantTokenUsage | null>;
  incrementTokenUsage(
    merchantId: string,
    date: string,
    tokens: number,
  ): Promise<MerchantTokenUsage>;

  // Usage tracking (alias for backwards compatibility)
  getUsage(
    merchantId: string,
    date: string,
  ): Promise<{ tokensUsed: number; llmCalls: number } | null>;

  // Daily reports
  getDailyReports(
    merchantId: string,
    options: { startDate?: string; endDate?: string; limit?: number },
  ): Promise<any[]>;

  // Notifications
  getNotifications(merchantId: string, unreadOnly?: boolean): Promise<any[]>;
  markNotificationRead(
    merchantId: string,
    notificationId: string,
  ): Promise<void>;
}

export const MERCHANT_REPOSITORY = Symbol("IMerchantRepository");
