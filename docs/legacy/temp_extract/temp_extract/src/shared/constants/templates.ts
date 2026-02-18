// Arabic response templates for fallback (when LLM not used or budget exceeded)

export const ARABIC_TEMPLATES = {
  // Greetings
  GREETING: "أهلاً وسهلاً! 👋 أنا هنا لمساعدتك. إزاي أقدر أساعدك النهاردة؟",
  GREETING_RETURNING:
    "أهلاً بيك تاني {name}! 👋 نورتنا. إزاي أقدر أساعدك النهاردة؟",

  // Slot filling questions
  ASK_PRODUCT: "إيه المنتج اللي حضرتك عايز/ة تطلبه؟",
  ASK_QUANTITY: "كام قطعة محتاج/ة من {product}؟",
  ASK_SIZE: "إيه المقاس المطلوب؟ (S, M, L, XL, XXL)",
  ASK_COLOR: "إيه اللون المفضل ليك؟",
  ASK_OPTIONS: "إيه الإضافات أو التفاصيل اللي عايز/ة تضيفها للطلب؟",
  ASK_SUBSTITUTION: "لو منتج مش متوفر، تحب نبدله بمنتج مشابه ولا لأ؟",

  // Customer info
  ASK_NAME: "ممكن أعرف اسم حضرتك للتوصيل؟",
  ASK_PHONE: "ممكن رقم الموبايل للتواصل؟",

  // Address questions (ONE at a time)
  ASK_ADDRESS_CITY: "حضرتك في أنهي محافظة؟ (القاهرة، الجيزة، الإسكندرية)",
  ASK_ADDRESS_AREA: "إيه اسم المنطقة أو الحي؟",
  ASK_ADDRESS_STREET: "إيه اسم الشارع؟",
  ASK_ADDRESS_BUILDING: "رقم أو اسم العمارة إيه؟",
  ASK_ADDRESS_FLOOR: "الدور رقم كام؟",
  ASK_ADDRESS_LANDMARK: "فيه علامة مميزة قريبة؟ (مسجد، مدرسة، صيدلية...)",

  // Cart & Order
  CART_UPDATED: "تمام! ضفت {item} للسلة. 🛒\nالمجموع: {total} جنيه",
  CART_SUMMARY:
    "السلة دلوقتي:\n{items}\n\nالمجموع: {subtotal} جنيه\n{discount_line}الإجمالي: {total} جنيه",
  CONFIRM_ORDER:
    "كده الطلب جاهز!\n\n{order_summary}\n\nتحب أأكد الطلب؟ (أيوه/لأ)",
  ORDER_CONFIRMED:
    "تمام! 🎉 الطلب #{order_number} اتأكد.\nهتوصلك رسالة بتفاصيل التوصيل.",

  // Delivery
  DELIVERY_BOOKED:
    "تم حجز التوصيل! 🚚\nرقم التتبع: {tracking_id}\nالتوصيل المتوقع: {estimated_date}",
  TRACKING_UPDATE: "تحديث الشحنة #{tracking_id}:\nالحالة: {status}",

  // Negotiation
  DISCOUNT_APPROVED:
    "ماشي! عملتلك خصم {discount}%! 🎁\nالسعر بعد الخصم: {final_price} جنيه",
  DISCOUNT_REJECTED:
    "للأسف مقدرش أعمل خصم أكتر من كده. أقصى خصم متاح هو {max_discount}%.",
  FREE_DELIVERY_OFFER:
    "لو ضفت منتجات بـ {amount_needed} جنيه كمان، التوصيل هيبقى مجاني! 🚚",

  // Follow-up
  FOLLOWUP_CHECK: "أهلاً! 👋 لسه مستني ردك على الطلب. محتاج أي مساعدة؟",
  FOLLOWUP_INCENTIVE:
    "عندنا عرض خاص ليك! 🎁 لو أكدت الطلب دلوقتي هتاخد خصم {discount}%!",
  FOLLOWUP_LAST: "مرحباً! الطلب لسه في السلة. لو مش مهتم/ة، قولي وهلغيه.",

  // Errors & Fallback
  FALLBACK: "مش فاهم قصدك تماماً. ممكن توضحلي أكتر؟",
  ERROR_GENERIC: "حصل مشكلة بسيطة. ممكن تحاول تاني؟",
  BUDGET_EXCEEDED: "عندنا ضغط شوية. ممكن تكتبلي الطلب بالتفصيل؟",

  // Follow-up messages
  FOLLOWUP_FIRST: "أهلاً! لسه معاك السلة ({items}). عايز تكمل الطلب؟",
  FOLLOWUP_SECOND: "مرحباً تاني! عندك ({items}) في السلة. ممكن أساعدك تكمل؟",
  FOLLOWUP_FINAL:
    "آخر تذكير! السلة بتاعتك لسه موجودة. لو محتاج حاجة تانية كلمني.",

  // Report
  DAILY_REPORT_HEADER: "📊 التقرير اليومي - {date}\n\n",
  DAILY_REPORT_ORDERS: "الطلبات: {count}\n",
  DAILY_REPORT_REVENUE: "الإيرادات: {amount} جنيه\n",
  DAILY_REPORT_CONVERSATIONS: "المحادثات: {count}\n",
};

// Helper to fill template placeholders
export function fillTemplate(
  template: string,
  params: Record<string, string | number>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return result;
}

// Slot-to-question mapping
export const SLOT_QUESTIONS: Record<string, string> = {
  product: ARABIC_TEMPLATES.ASK_PRODUCT,
  quantity: ARABIC_TEMPLATES.ASK_QUANTITY,
  size: ARABIC_TEMPLATES.ASK_SIZE,
  color: ARABIC_TEMPLATES.ASK_COLOR,
  options: ARABIC_TEMPLATES.ASK_OPTIONS,
  substitution_preference: ARABIC_TEMPLATES.ASK_SUBSTITUTION,
  customer_name: ARABIC_TEMPLATES.ASK_NAME,
  phone: ARABIC_TEMPLATES.ASK_PHONE,
  address_city: ARABIC_TEMPLATES.ASK_ADDRESS_CITY,
  address_area: ARABIC_TEMPLATES.ASK_ADDRESS_AREA,
  address_street: ARABIC_TEMPLATES.ASK_ADDRESS_STREET,
  address_building: ARABIC_TEMPLATES.ASK_ADDRESS_BUILDING,
  address_floor: ARABIC_TEMPLATES.ASK_ADDRESS_FLOOR,
  address_landmark: ARABIC_TEMPLATES.ASK_ADDRESS_LANDMARK,
};

// Alias for backward compatibility
export const ArabicTemplates = ARABIC_TEMPLATES;
