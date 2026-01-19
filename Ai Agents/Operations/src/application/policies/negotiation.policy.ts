import { Injectable } from '@nestjs/common';
import { MerchantCategory } from '../../shared/constants/enums';
import { NegotiationRules, Cart } from '../../shared/schemas';
import { CatalogItem } from '../../domain/entities/catalog.entity';
import {
  INegotiationPolicy,
  NegotiationRequest,
  NegotiationResult,
} from '../../domain/policies/negotiation-policy.interface';

abstract class BaseNegotiationPolicy implements INegotiationPolicy {
  abstract readonly category: MerchantCategory;

  evaluate(
    request: NegotiationRequest,
    rules: NegotiationRules,
    cart: Cart,
    catalogItem?: CatalogItem,
  ): NegotiationResult {
    // Check if negotiation is allowed
    if (!rules.allowNegotiation) {
      return {
        approved: false,
        finalDiscount: 0,
        offerText: 'للأسف مش بنعمل خصومات على المنتجات دي',
        reason: 'Negotiation disabled',
      };
    }

    const requestedDiscount = request.requestedDiscount || 0;
    const maxDiscount = rules.maxDiscountPercent || 10;

    // Check if requested discount exceeds max
    if (requestedDiscount > maxDiscount) {
      return {
        approved: false,
        finalDiscount: maxDiscount,
        offerText: `للأسف مقدرش أعمل خصم ${requestedDiscount}%، لكن ممكن أعملك ${maxDiscount}%`,
        reason: 'Exceeds max discount',
      };
    }

    // Check min margin if catalog item available
    if (catalogItem && catalogItem.minPrice) {
      const minMargin = rules.minMarginPercent || 20;
      const priceAfterDiscount = catalogItem.basePrice * (1 - requestedDiscount / 100);
      
      if (priceAfterDiscount < catalogItem.minPrice) {
        const maxPossibleDiscount = ((catalogItem.basePrice - catalogItem.minPrice) / catalogItem.basePrice) * 100;
        const safeDiscount = Math.floor(maxPossibleDiscount);
        
        return {
          approved: false,
          finalDiscount: safeDiscount,
          finalPrice: catalogItem.basePrice * (1 - safeDiscount / 100),
          offerText: `أقصى خصم أقدر أعمله على المنتج ده ${safeDiscount}%`,
          reason: 'Would violate min margin',
        };
      }
    }

    // Approved
    return {
      approved: true,
      finalDiscount: requestedDiscount,
      finalPrice: catalogItem ? catalogItem.basePrice * (1 - requestedDiscount / 100) : undefined,
      offerText: `تمام! عملتلك خصم ${requestedDiscount}%! 🎉`,
    };
  }

  calculateBundleDiscount(rules: NegotiationRules, cart: Cart): number {
    if (!rules.bundleDiscounts || rules.bundleDiscounts.length === 0) {
      return 0;
    }

    const totalItems = cart.items.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
    
    // Sort bundles by minItems descending to find best applicable discount
    const sortedBundles = [...rules.bundleDiscounts].sort((a, b) => b.minItems - a.minItems);
    
    for (const bundle of sortedBundles) {
      if (totalItems >= bundle.minItems) {
        return bundle.discountPercent;
      }
    }

    return 0;
  }

  checkFreeDelivery(
    rules: NegotiationRules,
    cartTotal: number,
  ): { eligible: boolean; amountNeeded?: number } {
    const threshold = rules.freeDeliveryThreshold;
    
    if (!threshold) {
      return { eligible: false };
    }

    if (cartTotal >= threshold) {
      return { eligible: true };
    }

    return {
      eligible: false,
      amountNeeded: threshold - cartTotal,
    };
  }
}

@Injectable()
export class ClothesNegotiationPolicy extends BaseNegotiationPolicy {
  readonly category = MerchantCategory.CLOTHES;

  evaluate(
    request: NegotiationRequest,
    rules: NegotiationRules,
    cart: Cart,
    catalogItem?: CatalogItem,
  ): NegotiationResult {
    // Clothes: More flexible with bundles
    const result = super.evaluate(request, rules, cart, catalogItem);
    
    if (!result.approved && cart.items.length >= 3) {
      // Offer bundle discount for 3+ items
      const bundleDiscount = Math.min(rules.maxDiscountPercent || 10, 15);
      return {
        approved: true,
        finalDiscount: bundleDiscount,
        offerText: `بما إنك بتاخد ${cart.items.length} حاجات، هعملك خصم ${bundleDiscount}%! 🎁`,
      };
    }
    
    return result;
  }
}

@Injectable()
export class FoodNegotiationPolicy extends BaseNegotiationPolicy {
  readonly category = MerchantCategory.FOOD;

  evaluate(
    request: NegotiationRequest,
    rules: NegotiationRules,
    cart: Cart,
    catalogItem?: CatalogItem,
  ): NegotiationResult {
    // Food: Less negotiation flexibility, focus on combos
    const maxDiscount = Math.min(rules.maxDiscountPercent || 5, 10); // Cap at 10% for food
    
    if ((request.requestedDiscount || 0) > maxDiscount) {
      return {
        approved: false,
        finalDiscount: 0,
        offerText: 'للأسف مفيش خصومات على الأكل، لكن ممكن تشوف العروض والكومبوهات! 🍕',
        reason: 'Food discount limited',
      };
    }
    
    return super.evaluate(request, { ...rules, maxDiscountPercent: maxDiscount }, cart, catalogItem);
  }
}

@Injectable()
export class SupermarketNegotiationPolicy extends BaseNegotiationPolicy {
  readonly category = MerchantCategory.SUPERMARKET;

  evaluate(
    request: NegotiationRequest,
    rules: NegotiationRules,
    cart: Cart,
    catalogItem?: CatalogItem,
  ): NegotiationResult {
    // Supermarket: Minimal negotiation, bulk discounts
    const totalItems = cart.items.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
    
    if (totalItems >= 10) {
      return {
        approved: true,
        finalDiscount: 5,
        offerText: 'بما إن الطلب كبير، هعملك خصم 5%! 🛒',
      };
    }
    
    if ((request.requestedDiscount || 0) > 0) {
      return {
        approved: false,
        finalDiscount: 0,
        offerText: 'أسعارنا ثابتة، لكن التوصيل مجاني للطلبات الكبيرة!',
        reason: 'Supermarket fixed prices',
      };
    }
    
    return { approved: true, finalDiscount: 0, offerText: '' };
  }
}

@Injectable()
export class GenericNegotiationPolicy extends BaseNegotiationPolicy {
  readonly category = MerchantCategory.GENERIC;
}

// Factory service
@Injectable()
export class NegotiationPolicyFactory {
  private policies: Map<MerchantCategory, INegotiationPolicy>;

  constructor(
    clothesPolicy: ClothesNegotiationPolicy,
    foodPolicy: FoodNegotiationPolicy,
    supermarketPolicy: SupermarketNegotiationPolicy,
    genericPolicy: GenericNegotiationPolicy,
  ) {
    this.policies = new Map<MerchantCategory, INegotiationPolicy>();
    this.policies.set(MerchantCategory.CLOTHES, clothesPolicy);
    this.policies.set(MerchantCategory.FOOD, foodPolicy);
    this.policies.set(MerchantCategory.SUPERMARKET, supermarketPolicy);
    this.policies.set(MerchantCategory.GENERIC, genericPolicy);
  }

  getPolicy(category: MerchantCategory): INegotiationPolicy {
    return this.policies.get(category) || this.policies.get(MerchantCategory.GENERIC)!;
  }

  // Static factory method for standalone use
  static create(category: MerchantCategory): INegotiationPolicy {
    switch (category) {
      case MerchantCategory.CLOTHES:
        return new ClothesNegotiationPolicy();
      case MerchantCategory.FOOD:
        return new FoodNegotiationPolicy();
      case MerchantCategory.SUPERMARKET:
        return new SupermarketNegotiationPolicy();
      default:
        return new GenericNegotiationPolicy();
    }
  }
}
