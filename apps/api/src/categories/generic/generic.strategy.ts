import { ICategoryStrategy } from "../index";
import { MerchantCategory } from "../../shared/constants/enums";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { Conversation } from "../../domain/entities/conversation.entity";

/**
 * Generic Strategy
 * - Default behavior for unspecified categories
 * - Basic slot filling
 * - General-purpose templates
 */
export class GenericStrategy implements ICategoryStrategy {
  category = MerchantCategory.GENERIC;

  getRequiredVariants(item: CatalogItem): string[] {
    const required: string[] = [];

    // Only require variants if explicitly defined with values
    if (item.variants && item.variants.length > 0) {
      for (const variant of item.variants) {
        if (variant.values && variant.values.length > 0) {
          required.push(variant.name);
        }
      }
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

    return missing;
  }

  getGreetingTemplate(): string {
    return `أهلاً بيك! 👋
إزاي أقدر أساعدك النهاردة؟

ابعتلي اللي محتاجه وأنا هساعدك.`;
  }

  getConfirmationTemplate(): string {
    return `ملخص الطلب:
{{items}}

الإجمالي: {{total}} {{currency}}
التوصيل: {{deliveryFee}} {{currency}}
المجموع الكلي: {{grandTotal}} {{currency}}

📍 العنوان: {{address}}
📞 رقم التواصل: {{phone}}

هل تأكد الطلب؟`;
  }

  getNegotiationGuidance(): string {
    return `General negotiation rules:
- Follow merchant's max discount setting
- Can offer free delivery for large orders
- Be flexible but within limits
- Always suggest value-adds over discounts`;
  }

  getItemMatchingHints(): string {
    return `Match items by:
- Product name in Arabic or English
- SKU if provided
- Category hints from conversation context`;
  }

  getPostOrderActions(): string[] {
    return ["send_order_confirmation", "schedule_delivery_followup"];
  }
}
