export const UNIVERSAL_SLOTS = [
  "business_type",
  "customer_intent",
  "product_interest",
  "quantity",
  "budget",
  "delivery_area",
  "deadline",
  "payment_state",
  "closing_stage",
] as const;

export type UniversalSlotKey = (typeof UNIVERSAL_SLOTS)[number];

export const UNIVERSAL_SLOT_LABELS_AR: Record<UniversalSlotKey, string> = {
  business_type: "نوع النشاط",
  customer_intent: "نية العميل",
  product_interest: "المنتج محل الاهتمام",
  quantity: "الكمية",
  budget: "الميزانية",
  delivery_area: "منطقة التوصيل",
  deadline: "موعد التسليم",
  payment_state: "حالة الدفع",
  closing_stage: "مرحلة الإغلاق",
};

export function isUniversalSlot(key: string): key is UniversalSlotKey {
  return (UNIVERSAL_SLOTS as readonly string[]).includes(key);
}
