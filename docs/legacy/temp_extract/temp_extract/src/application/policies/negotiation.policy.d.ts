import { MerchantCategory } from "../../shared/constants/enums";
import { NegotiationRules, Cart } from "../../shared/schemas";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { INegotiationPolicy, NegotiationRequest, NegotiationResult } from "../../domain/policies/negotiation-policy.interface";
declare abstract class BaseNegotiationPolicy implements INegotiationPolicy {
    abstract readonly category: MerchantCategory;
    evaluate(request: NegotiationRequest, rules: NegotiationRules, cart: Cart, catalogItem?: CatalogItem): NegotiationResult;
    calculateBundleDiscount(rules: NegotiationRules, cart: Cart): number;
    checkFreeDelivery(rules: NegotiationRules, cartTotal: number): {
        eligible: boolean;
        amountNeeded?: number;
    };
}
export declare class ClothesNegotiationPolicy extends BaseNegotiationPolicy {
    readonly category = MerchantCategory.CLOTHES;
    evaluate(request: NegotiationRequest, rules: NegotiationRules, cart: Cart, catalogItem?: CatalogItem): NegotiationResult;
}
export declare class FoodNegotiationPolicy extends BaseNegotiationPolicy {
    readonly category = MerchantCategory.FOOD;
    evaluate(request: NegotiationRequest, rules: NegotiationRules, cart: Cart, catalogItem?: CatalogItem): NegotiationResult;
}
export declare class SupermarketNegotiationPolicy extends BaseNegotiationPolicy {
    readonly category = MerchantCategory.SUPERMARKET;
    evaluate(request: NegotiationRequest, rules: NegotiationRules, cart: Cart, catalogItem?: CatalogItem): NegotiationResult;
}
export declare class GenericNegotiationPolicy extends BaseNegotiationPolicy {
    readonly category = MerchantCategory.GENERIC;
}
export declare class NegotiationPolicyFactory {
    private policies;
    constructor(clothesPolicy: ClothesNegotiationPolicy, foodPolicy: FoodNegotiationPolicy, supermarketPolicy: SupermarketNegotiationPolicy, genericPolicy: GenericNegotiationPolicy);
    getPolicy(category: MerchantCategory): INegotiationPolicy;
    static create(category: MerchantCategory): INegotiationPolicy;
}
export {};
