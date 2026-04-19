import { MerchantCategory } from "../shared/constants/enums";
import { CatalogItem } from "../domain/entities/catalog.entity";
import { Conversation } from "../domain/entities/conversation.entity";

/**
 * Category Strategy Interface
 * Each category (CLOTHES, FOOD, SUPERMARKET, GENERIC) implements this
 * to provide category-specific behavior for:
 * - Variant collection (sizes, colors, toppings, etc.)
 * - Slot filling requirements
 * - Negotiation rules
 * - Greeting/response templates
 */
export interface ICategoryStrategy {
  category: MerchantCategory;

  /** Get required variant slots for an item */
  getRequiredVariants(item: CatalogItem): string[];

  /** Get slots that must be collected before order confirmation */
  getRequiredSlots(): string[];

  /** Check if all required info is collected */
  isMissingInfo(conversation: Conversation): string[];

  /** Get category-specific greeting template */
  getGreetingTemplate(): string;

  /** Get confirmation message template */
  getConfirmationTemplate(): string;

  /** Get negotiation guidance for LLM */
  getNegotiationGuidance(): string;

  /** Category-specific item matching hints */
  getItemMatchingHints(): string;

  /** Post-order actions specific to category */
  getPostOrderActions(): string[];
}

export { ClothesStrategy } from "./clothes/clothes.strategy";
export { FoodStrategy } from "./food/food.strategy";
export { SupermarketStrategy } from "./supermarket/supermarket.strategy";
export { GenericStrategy } from "./generic/generic.strategy";
export { CategoryStrategyFactory } from "./category-strategy.factory";
export { CategoriesModule } from "./categories.module";
