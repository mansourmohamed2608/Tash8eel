import { Address } from "../../shared/schemas";
export interface CustomerPreferences {
    preferredDeliveryTime?: string;
    preferredPaymentMethod?: string;
    allergies?: string[];
    notes?: string;
}
export interface Customer {
    id: string;
    merchantId: string;
    senderId: string;
    phone?: string;
    name?: string;
    address?: Address;
    preferences: CustomerPreferences;
    totalOrders: number;
    lastInteractionAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    totalSpent?: number;
    notes?: string;
    preferredAddress?: string;
}
export interface CreateCustomerInput {
    merchantId: string;
    senderId: string;
    phone?: string;
    name?: string;
    address?: Address;
}
export interface UpdateCustomerInput {
    phone?: string;
    name?: string;
    address?: Address;
    preferences?: Partial<CustomerPreferences>;
    totalOrders?: number;
    totalSpent?: number;
    lastInteractionAt?: Date;
}
