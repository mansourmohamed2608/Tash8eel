import { MerchantCategory } from "../../shared/constants/enums";
import { NegotiationRules, Cart } from "../../shared/schemas";
import { CatalogItem } from "../entities/catalog.entity";
export interface NegotiationRequest {
    requestedDiscount?: number;
    requestedPrice?: number;
    productName?: string;
}
export interface NegotiationResult {
    approved: boolean;
    finalDiscount: number;
    finalPrice?: number;
    offerText: string;
    reason?: string;
}
export interface INegotiationPolicy {
    readonly category: MerchantCategory;
    evaluate(request: NegotiationRequest, rules: NegotiationRules, cart: Cart, catalogItem?: CatalogItem): NegotiationResult;
    calculateBundleDiscount(rules: NegotiationRules, cart: Cart): number;
    checkFreeDelivery(rules: NegotiationRules, cartTotal: number): {
        eligible: boolean;
        amountNeeded?: number;
    };
}
export declare const NEGOTIATION_POLICY: unique symbol;
