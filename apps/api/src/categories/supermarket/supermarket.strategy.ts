import { ICategoryStrategy } from "../index";
import { MerchantCategory } from "../../shared/constants/enums";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { Conversation } from "../../domain/entities/conversation.entity";

/**
 * Supermarket Strategy
 * - Bulk quantities
 * - Item substitution handling
 * - Scheduled delivery slots
 */
export class SupermarketStrategy implements ICategoryStrategy {
  category = MerchantCategory.SUPERMARKET;

  getRequiredVariants(item: CatalogItem): string[] {
    const required: string[] = [];

    // Most supermarket items need quantity
    required.push("quantity");

    // Some items have size/weight options
    if (
      item.variants?.find(
        (v) =>
          v.name.toLowerCase().includes("weight") || v.name.includes("وزن"),
      )
    ) {
      required.push("weight");
    }

    return required;
  }

  getRequiredSlots(): string[] {
    return [
      "customerName",
      "phone",
      "address",
      "deliverySlot", // Time slot preference
    ];
  }

  isMissingInfo(conversation: Conversation): string[] {
    const missing: string[] = [];
    const info = conversation.collectedInfo || {};

    if (!info.customerName) missing.push("customerName");
    if (!info.phone) missing.push("phone");
    if (!info.address) missing.push("address");

    // Check for delivery slot
    if (!info.deliverySlot) missing.push("deliverySlot");

    return missing;
  }

  getGreetingTemplate(): string {
    return `أهلاً بيك في السوبر ماركت! 🛒
عندنا كل اللي محتاجه للبيت.

📦 أقسامنا:
- خضروات وفاكهة
- ألبان وأجبان
- مشروبات
- منظفات
- لحوم ودواجن

إيه اللي محتاجه النهاردة؟
ممكن تبعتلي اللستة كلها مرة واحدة.`;
  }

  getConfirmationTemplate(): string {
    return `طلبك من السوبر ماركت:
{{items}}

الإجمالي: {{total}} {{currency}}
التوصيل: {{deliveryFee}} {{currency}}
المجموع: {{grandTotal}} {{currency}}

📍 العنوان: {{address}}
📞 الموبايل: {{phone}}
🕐 موعد التوصيل: {{deliverySlot}}

⚠️ لو فيه حاجة مش متوفرة، هنتواصل معاك للبدائل.

تأكيد الطلب؟`;
  }

  getNegotiationGuidance(): string {
    return `For supermarket orders:
- Volume discounts on bulk purchases
- Free delivery for orders above 300 EGP
- Loyalty discounts for repeat customers
- Can suggest cheaper alternatives
- Bundle deals on related items`;
  }

  getItemMatchingHints(): string {
    return `Match supermarket items by:
- Category (خضار، فاكهة، لحوم، منظفات)
- Brand names in Arabic
- Package sizes (كيلو، نص كيلو، لتر، علبة)
- Common household items`;
  }

  getPostOrderActions(): string[] {
    return [
      "send_slot_confirmation",
      "notify_out_of_stock_alternatives",
      "suggest_reorder_for_staples",
    ];
  }
}
