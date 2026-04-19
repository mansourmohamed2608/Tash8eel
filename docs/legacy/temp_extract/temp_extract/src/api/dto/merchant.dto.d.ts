import { MerchantCategory } from "../../shared/constants/enums";
declare class NegotiationRulesDto {
    maxDiscountPercent: number;
    allowQuantityNegotiation?: boolean;
    allowDeliveryFeeNegotiation?: boolean;
    freeDeliveryThreshold?: number;
}
declare class WorkingHoursDto {
    open: string;
    close: string;
}
export declare class MerchantConfigDto {
    name?: string;
    category?: MerchantCategory;
    city?: string;
    defaultDeliveryFee?: number;
    currency?: string;
    language?: string;
    dailyTokenBudget?: number;
    autoBookDelivery?: boolean;
    enableFollowups?: boolean;
    greetingTemplate?: string;
    negotiationRules?: NegotiationRulesDto;
    workingHours?: WorkingHoursDto;
}
export declare class MerchantResponseDto {
    id: string;
    name: string;
    category: MerchantCategory;
    city: string;
    currency: string;
    language: string;
    dailyTokenBudget: number;
    defaultDeliveryFee: number;
    autoBookDelivery: boolean;
    enableFollowups: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export {};
