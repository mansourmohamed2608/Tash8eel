import { Injectable } from '@nestjs/common';
import { MerchantCategory } from '../../shared/constants/enums';
import { Cart, CollectedInfo } from '../../shared/schemas';
import { SLOT_QUESTIONS, ARABIC_TEMPLATES } from '../../shared/constants/templates';
import { CatalogItem } from '../../domain/entities/catalog.entity';
import {
  ISlotFillingPolicy,
  SlotFillingResult,
} from '../../domain/policies/slot-filling-policy.interface';

abstract class BaseSlotFillingPolicy implements ISlotFillingPolicy {
  abstract readonly category: MerchantCategory;
  abstract getRequiredSlots(): string[];
  abstract getSlotPriority(): string[];

  evaluate(
    cart: Cart,
    collectedInfo: CollectedInfo,
    catalogItems: CatalogItem[],
  ): SlotFillingResult {
    const missingSlots: string[] = [];
    const priority = this.getSlotPriority();

    // Check product/items
    if (cart.items.length === 0) {
      missingSlots.push('product');
    } else {
      // Check item-level requirements
      for (const item of cart.items) {
        if (!item.quantity || item.quantity <= 0) {
          missingSlots.push('quantity');
          break;
        }
      }
    }

    // Check category-specific slots
    this.checkCategorySpecificSlots(cart, collectedInfo, missingSlots);

    // Check customer info
    if (!collectedInfo.customerName) {
      missingSlots.push('customer_name');
    }
    if (!collectedInfo.phone) {
      missingSlots.push('phone');
    }

    // Check address
    this.checkAddressSlots(collectedInfo, missingSlots);

    // Find the highest priority missing slot
    let nextQuestion = ARABIC_TEMPLATES.FALLBACK;
    let highestPrioritySlot = '';

    for (const slot of priority) {
      if (missingSlots.includes(slot)) {
        highestPrioritySlot = slot;
        nextQuestion = SLOT_QUESTIONS[slot] || ARABIC_TEMPLATES.FALLBACK;
        break;
      }
    }

    return {
      missingSlots,
      nextQuestion,
      isComplete: missingSlots.length === 0,
      priority: highestPrioritySlot,
    };
  }

  protected checkCategorySpecificSlots(
    _cart: Cart,
    _collectedInfo: CollectedInfo,
    _missingSlots: string[],
  ): void {
    // Override in subclasses
  }

  protected checkAddressSlots(collectedInfo: CollectedInfo, missingSlots: string[]): void {
    const address = collectedInfo.address;
    
    if (!address) {
      missingSlots.push('address_city');
      return;
    }

    if (!address.city) {
      missingSlots.push('address_city');
    } else if (!address.area) {
      missingSlots.push('address_area');
    } else if (!address.street) {
      missingSlots.push('address_street');
    } else if (!address.building) {
      missingSlots.push('address_building');
    }
  }
}

@Injectable()
export class ClothesSlotFillingPolicy extends BaseSlotFillingPolicy {
  readonly category = MerchantCategory.CLOTHES;

  getRequiredSlots(): string[] {
    return ['product', 'quantity', 'size', 'color', 'customer_name', 'phone', 'address_city', 'address_area', 'address_street', 'address_building'];
  }

  getSlotPriority(): string[] {
    return ['product', 'quantity', 'size', 'color', 'customer_name', 'phone', 'address_city', 'address_area', 'address_street', 'address_building'];
  }

  protected checkCategorySpecificSlots(
    cart: Cart,
    _collectedInfo: CollectedInfo,
    missingSlots: string[],
  ): void {
    // For clothes, check if size/color are needed
    for (const item of cart.items) {
      if (!item.variant?.size) {
        missingSlots.push('size');
        break;
      }
      if (!item.variant?.color) {
        missingSlots.push('color');
        break;
      }
    }
  }
}

@Injectable()
export class FoodSlotFillingPolicy extends BaseSlotFillingPolicy {
  readonly category = MerchantCategory.FOOD;

  getRequiredSlots(): string[] {
    return ['product', 'quantity', 'options', 'customer_name', 'phone', 'address_city', 'address_area', 'address_street'];
  }

  getSlotPriority(): string[] {
    return ['product', 'quantity', 'options', 'customer_name', 'phone', 'address_city', 'address_area', 'address_street', 'address_building'];
  }

  protected checkCategorySpecificSlots(
    _cart: Cart,
    _collectedInfo: CollectedInfo,
    _missingSlots: string[],
  ): void {
    // Food: Options are optional by default
  }
}

@Injectable()
export class SupermarketSlotFillingPolicy extends BaseSlotFillingPolicy {
  readonly category = MerchantCategory.SUPERMARKET;

  getRequiredSlots(): string[] {
    return ['product', 'quantity', 'substitution_preference', 'customer_name', 'phone', 'address_city', 'address_area', 'address_street', 'address_building'];
  }

  getSlotPriority(): string[] {
    return ['product', 'quantity', 'customer_name', 'phone', 'substitution_preference', 'address_city', 'address_area', 'address_street', 'address_building'];
  }

  protected checkCategorySpecificSlots(
    _cart: Cart,
    collectedInfo: CollectedInfo,
    missingSlots: string[],
  ): void {
    // Supermarket: Check substitution preference
    if (collectedInfo.substitutionAllowed === undefined) {
      missingSlots.push('substitution_preference');
    }
  }
}

@Injectable()
export class GenericSlotFillingPolicy extends BaseSlotFillingPolicy {
  readonly category = MerchantCategory.GENERIC;

  getRequiredSlots(): string[] {
    return ['product', 'quantity', 'customer_name', 'phone', 'address_city', 'address_area'];
  }

  getSlotPriority(): string[] {
    return ['product', 'quantity', 'customer_name', 'phone', 'address_city', 'address_area', 'address_street', 'address_building'];
  }
}

// Factory service
@Injectable()
export class SlotFillingPolicyFactory {
  private policies: Map<MerchantCategory, ISlotFillingPolicy>;

  constructor(
    clothesPolicy: ClothesSlotFillingPolicy,
    foodPolicy: FoodSlotFillingPolicy,
    supermarketPolicy: SupermarketSlotFillingPolicy,
    genericPolicy: GenericSlotFillingPolicy,
  ) {
    this.policies = new Map<MerchantCategory, ISlotFillingPolicy>();
    this.policies.set(MerchantCategory.CLOTHES, clothesPolicy);
    this.policies.set(MerchantCategory.FOOD, foodPolicy);
    this.policies.set(MerchantCategory.SUPERMARKET, supermarketPolicy);
    this.policies.set(MerchantCategory.GENERIC, genericPolicy);
  }

  getPolicy(category: MerchantCategory): ISlotFillingPolicy {
    return this.policies.get(category) || this.policies.get(MerchantCategory.GENERIC)!;
  }
}
