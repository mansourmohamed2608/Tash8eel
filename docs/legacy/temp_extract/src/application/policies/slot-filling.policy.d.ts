import { MerchantCategory } from "../../shared/constants/enums";
import { Cart, CollectedInfo } from "../../shared/schemas";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { ISlotFillingPolicy, SlotFillingResult } from "../../domain/policies/slot-filling-policy.interface";
declare abstract class BaseSlotFillingPolicy implements ISlotFillingPolicy {
    abstract readonly category: MerchantCategory;
    abstract getRequiredSlots(): string[];
    abstract getSlotPriority(): string[];
    evaluate(cart: Cart, collectedInfo: CollectedInfo, catalogItems: CatalogItem[]): SlotFillingResult;
    protected checkCategorySpecificSlots(_cart: Cart, _collectedInfo: CollectedInfo, _missingSlots: string[]): void;
    protected checkAddressSlots(collectedInfo: CollectedInfo, missingSlots: string[]): void;
}
export declare class ClothesSlotFillingPolicy extends BaseSlotFillingPolicy {
    readonly category: any;
    getRequiredSlots(): string[];
    getSlotPriority(): string[];
    protected checkCategorySpecificSlots(cart: Cart, _collectedInfo: CollectedInfo, missingSlots: string[]): void;
}
export declare class FoodSlotFillingPolicy extends BaseSlotFillingPolicy {
    readonly category: any;
    getRequiredSlots(): string[];
    getSlotPriority(): string[];
    protected checkCategorySpecificSlots(_cart: Cart, _collectedInfo: CollectedInfo, _missingSlots: string[]): void;
}
export declare class SupermarketSlotFillingPolicy extends BaseSlotFillingPolicy {
    readonly category: any;
    getRequiredSlots(): string[];
    getSlotPriority(): string[];
    protected checkCategorySpecificSlots(_cart: Cart, collectedInfo: CollectedInfo, missingSlots: string[]): void;
}
export declare class GenericSlotFillingPolicy extends BaseSlotFillingPolicy {
    readonly category: any;
    getRequiredSlots(): string[];
    getSlotPriority(): string[];
}
export declare class SlotFillingPolicyFactory {
    private policies;
    constructor(clothesPolicy: ClothesSlotFillingPolicy, foodPolicy: FoodSlotFillingPolicy, supermarketPolicy: SupermarketSlotFillingPolicy, genericPolicy: GenericSlotFillingPolicy);
    getPolicy(category: MerchantCategory): ISlotFillingPolicy;
}
export {};
