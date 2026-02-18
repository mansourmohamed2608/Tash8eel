import { MerchantCategory } from "../../shared/constants/enums";
import { Cart, CollectedInfo } from "../../shared/schemas";
import { CatalogItem } from "../entities/catalog.entity";

export interface SlotFillingResult {
  missingSlots: string[];
  nextQuestion: string;
  isComplete: boolean;
  priority: string;
}

export interface ISlotFillingPolicy {
  readonly category: MerchantCategory;

  evaluate(
    cart: Cart,
    collectedInfo: CollectedInfo,
    catalogItems: CatalogItem[],
  ): SlotFillingResult;

  getRequiredSlots(): string[];

  getSlotPriority(): string[];
}

export const SLOT_FILLING_POLICY = Symbol("ISlotFillingPolicy");
