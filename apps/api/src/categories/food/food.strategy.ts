import { ICategoryStrategy } from "../index";
import { MerchantCategory } from "../../shared/constants/enums";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { Conversation } from "../../domain/entities/conversation.entity";

/**
 * Food Strategy
 * - Requires customization options (spice level, toppings)
 * - Time-sensitive delivery
 * - Urgency in responses
 */
export class FoodStrategy implements ICategoryStrategy {
  category = MerchantCategory.FOOD;

  getRequiredVariants(item: CatalogItem): string[] {
    const required: string[] = [];

    // Check for size options (small, medium, large)
    if (
      item.variants?.find(
        (v) => v.name.toLowerCase().includes("size") || v.name.includes("حجم"),
      )
    ) {
      required.push("size");
    }

    // Check for spice level in options
    if (
      item.options?.find(
        (o) => o.name.toLowerCase().includes("spice") || o.name.includes("حار"),
      )
    ) {
      required.push("spiceLevel");
    }

    return required;
  }

  getRequiredSlots(): string[] {
    return [
      "customerName",
      "phone",
      "address",
      "deliveryTime", // Optional but important for food
    ];
  }

  isMissingInfo(conversation: Conversation): string[] {
    const missing: string[] = [];
    const info = conversation.collectedInfo || {};

    if (!info.customerName) missing.push("customerName");
    if (!info.phone) missing.push("phone");
    if (!info.address) missing.push("address");

    // Cart customization checks
    const cart = conversation.cart || { items: [] };
    for (const item of cart.items || []) {
      if (item.requiresSpiceLevel && !item.spiceLevel) {
        missing.push(`${item.name}_spiceLevel`);
      }
    }

    return missing;
  }

  getGreetingTemplate(): string {
    return `أهلاً بيك! 🍔🍕
اتفضل اختار من المنيو:

🔥 الأكثر طلباً:
{{topItems}}

إيه اللي نفسك فيه النهاردة؟`;
  }

  getConfirmationTemplate(): string {
    return `طلبك من المطعم:
{{items}}

الإجمالي: {{total}} {{currency}}
التوصيل: {{deliveryFee}} {{currency}}
المجموع: {{grandTotal}} {{currency}}

📍 العنوان: {{address}}
📞 الموبايل: {{phone}}

⏱️ الوقت المتوقع: 30-45 دقيقة

تأكيد الطلب؟`;
  }

  getNegotiationGuidance(): string {
    return `For food orders:
- Limited discount (max 10%) as margins are tight
- Free delivery for orders above 200 EGP
- Can offer free drink/side with large orders
- No negotiation on delivery time
- Upsell combo meals or add-ons`;
  }

  getItemMatchingHints(): string {
    return `Match food items by:
- Arabic menu names (برجر، بيتزا، شاورما، فراخ)
- Meal types (وجبة، ساندوتش، طبق)
- Sizes (صغير، وسط، كبير، عائلي)
- Customizations (حار، وسط، بدون بصل)`;
  }

  getPostOrderActions(): string[] {
    return [
      "send_preparation_update",
      "send_delivery_eta",
      "request_rating_on_delivery",
    ];
  }
}
