import { MerchantCategory, MerchantConfig, NegotiationRules, DeliveryRules, Branding } from "../../shared/schemas";
export interface Merchant {
    id: string;
    name: string;
    category: MerchantCategory;
    config: MerchantConfig;
    branding: Branding;
    negotiationRules: NegotiationRules;
    deliveryRules: DeliveryRules;
    dailyTokenBudget: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    apiKey?: string;
    city?: string;
    language?: string;
    currency?: string;
    defaultDeliveryFee?: number;
    autoBookDelivery?: boolean;
    enableFollowups?: boolean;
    greetingTemplate?: string;
    workingHours?: {
        open: string;
        close: string;
    };
    address?: string;
}
export interface MerchantTokenUsage {
    id: string;
    merchantId: string;
    usageDate: string;
    tokensUsed: number;
    llmCalls: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface CreateMerchantInput {
    id: string;
    name: string;
    category?: MerchantCategory;
    config?: Partial<MerchantConfig>;
    branding?: Partial<Branding>;
    negotiationRules?: Partial<NegotiationRules>;
    deliveryRules?: Partial<DeliveryRules>;
    dailyTokenBudget?: number;
    apiKey?: string;
    city?: string;
    language?: string;
    currency?: string;
    defaultDeliveryFee?: number;
    autoBookDelivery?: boolean;
    enableFollowups?: boolean;
    greetingTemplate?: string;
    workingHours?: {
        open: string;
        close: string;
    };
    address?: string;
    isActive?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}
export interface UpdateMerchantInput {
    name?: string;
    category?: MerchantCategory;
    config?: Partial<MerchantConfig>;
    branding?: Partial<Branding>;
    negotiationRules?: Partial<NegotiationRules>;
    apiKey?: string;
    city?: string;
    language?: string;
    currency?: string;
    defaultDeliveryFee?: number;
    autoBookDelivery?: boolean;
    enableFollowups?: boolean;
    greetingTemplate?: string;
    workingHours?: {
        open: string;
        close: string;
    };
    address?: string;
    deliveryRules?: Partial<DeliveryRules>;
    dailyTokenBudget?: number;
    isActive?: boolean;
}
