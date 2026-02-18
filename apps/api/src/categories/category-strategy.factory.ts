import { Injectable } from "@nestjs/common";
import { MerchantCategory } from "../shared/constants/enums";
import {
  ICategoryStrategy,
  ClothesStrategy,
  FoodStrategy,
  SupermarketStrategy,
  GenericStrategy,
} from "./index";

/**
 * Factory for creating category-specific strategies
 */
@Injectable()
export class CategoryStrategyFactory {
  private strategies: Map<MerchantCategory, ICategoryStrategy>;

  constructor() {
    this.strategies = new Map();
    this.strategies.set(MerchantCategory.CLOTHES, new ClothesStrategy());
    this.strategies.set(MerchantCategory.FOOD, new FoodStrategy());
    this.strategies.set(
      MerchantCategory.SUPERMARKET,
      new SupermarketStrategy(),
    );
    this.strategies.set(MerchantCategory.GENERIC, new GenericStrategy());
  }

  /**
   * Get strategy for a specific category
   */
  getStrategy(category: MerchantCategory): ICategoryStrategy {
    return (
      this.strategies.get(category) ||
      this.strategies.get(MerchantCategory.GENERIC)!
    );
  }

  /**
   * Get all registered strategies
   */
  getAllStrategies(): ICategoryStrategy[] {
    return Array.from(this.strategies.values());
  }
}
