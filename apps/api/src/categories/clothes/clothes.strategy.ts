import { ICategoryStrategy } from "../index";
import { MerchantCategory } from "../../shared/constants/enums";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { Conversation } from "../../domain/entities/conversation.entity";

/**
 * Clothes Strategy
 * - Requires size, color selection
 * - Supports exchanges and returns
 * - Measurement guidance
 */
export class ClothesStrategy implements ICategoryStrategy {
  category = MerchantCategory.CLOTHES;

  getRequiredVariants(item: CatalogItem): string[] {
    const required: string[] = [];

    // Most clothing requires size
    if (
      !item.variants?.find(
        (v) => v.name.toLowerCase().includes("size") || v.name.includes("مقاس"),
      )
    ) {
      required.push("size");
    }

    // Many items have color options
    if (
      !item.variants?.find(
        (v) => v.name.toLowerCase().includes("color") || v.name.includes("لون"),
      )
    ) {
      required.push("color");
    }

    return required;
  }

  getRequiredSlots(): string[] {
    return ["customerName", "phone", "address"];
  }

  isMissingInfo(conversation: Conversation): string[] {
    const missing: string[] = [];
    const info = conversation.collectedInfo || {};

    if (!info.customerName) missing.push("customerName");
    if (!info.phone) missing.push("phone");
    if (!info.address) missing.push("address");

    // Check cart items for missing variants
    const cart = conversation.cart || { items: [] };
    for (const item of cart.items || []) {
      if (!item.size) missing.push(`${item.name}_size`);
      if (!item.color && item.hasColorOptions)
        missing.push(`${item.name}_color`);
    }

    return missing;
  }

  getGreetingTemplate(): string {
    return `أهلاً بيك في متجرنا! 👕
عندنا تشكيلة متنوعة من الملابس العصرية.
إيه اللي بتدور عليه النهاردة؟
- تيشيرتات
- بناطيل
- قمصان
- جاكيتات`;
  }

  getConfirmationTemplate(): string {
    return `طلبك جاهز للتأكيد:
{{items}}

الإجمالي: {{total}} {{currency}}
التوصيل: {{deliveryFee}} {{currency}}
المجموع الكلي: {{grandTotal}} {{currency}}

العنوان: {{address}}
رقم التواصل: {{phone}}

هل تأكد الطلب؟ 
📏 لو محتاج تعرف مقاساتك، ابعتلنا مقاساتك وهنساعدك.`;
  }

  getNegotiationGuidance(): string {
    return `For clothes:
- Can offer 5-15% discount on bulk orders (3+ items)
- Free delivery for orders above 500 EGP
- No discount on new arrivals or limited editions
- Can offer exchange if size doesn't fit
- Suggest complementary items (shirt + pants)`;
  }

  getItemMatchingHints(): string {
    return `Match clothing items by:
- Arabic name variations (تيشيرت، تي شيرت، T-shirt)
- Category (tops, bottoms, outerwear)
- Common colors in Arabic (أبيض، أسود، أزرق، أحمر)
- Sizes (S, M, L, XL, XXL, سمول، ميديم، لارج)`;
  }

  getPostOrderActions(): string[] {
    return [
      "send_size_guide",
      "schedule_delivery_followup",
      "request_review_after_delivery",
    ];
  }
}
