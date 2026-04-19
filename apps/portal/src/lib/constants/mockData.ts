export interface IntelligenceMessage {
  id: string;
  text: string;
}

export interface KpiMetric {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  trend: number | null;
  trendLabel: string;
  sublabel: string;
  tone: "blue" | "gold" | "success" | "info";
  icon: "trending-up" | "shopping-cart" | "message-square" | "users";
}

export interface RevenuePoint {
  time: string;
  value: number;
}

export interface ProductPerformance {
  name: string;
  value: number;
}

export interface ChannelStatusItem {
  id: string;
  name: string;
  icon: "whatsapp" | "messenger" | "instagram" | "phone";
  status: "نشط";
  lastMessageTime: string;
}

export interface OrderRow {
  id: string;
  customer: string;
  source: string;
  channel: "whatsapp" | "messenger" | "instagram" | "phone";
  total: number;
  status: "جديد" | "قيد التجهيز" | "تم التوصيل" | "ملغي";
  time: string;
}

export interface ActivityEvent {
  id: string;
  icon: "ai" | "order" | "inventory" | "payment" | "customer";
  text: string;
  time: string;
}

export const intelligenceMessages: IntelligenceMessage[] = [
  {
    id: "1",
    text: "الذكاء الاصطناعي أجاب على 47 رسالة اليوم بدون تدخل بشري",
  },
  {
    id: "2",
    text: "3 طلبات تجاوزت 45 دقيقة وتحتاج متابعة فورية",
  },
  {
    id: "3",
    text: "مخزون الكيلو جبن وصل لحد التنبيه — 12 كيلو متبقي",
  },
  {
    id: "4",
    text: "أفضل منتج مبيعاً اليوم: كابتشينو كبير (34 طلب)",
  },
];

export const kpiMetrics: KpiMetric[] = [
  {
    id: "sales",
    label: "المبيعات اليوم",
    value: 8450,
    suffix: "ج.م",
    trend: 14,
    trendLabel: "من أمس",
    sublabel: "من 32 طلب مكتمل",
    tone: "blue",
    icon: "trending-up",
  },
  {
    id: "orders",
    label: "الطلبات النشطة",
    value: 12,
    trend: null,
    trendLabel: "مماثل لأمس",
    sublabel: "3 تحتاج متابعة",
    tone: "gold",
    icon: "shopping-cart",
  },
  {
    id: "ai-chats",
    label: "محادثات الذكاء",
    value: 47,
    trend: 23,
    trendLabel: "من أمس",
    sublabel: "94% تمت تلقائياً",
    tone: "success",
    icon: "message-square",
  },
  {
    id: "customers",
    label: "العملاء الجدد",
    value: 8,
    trend: 6,
    trendLabel: "من أمس",
    sublabel: "من واتساب وإنستاجرام",
    tone: "info",
    icon: "users",
  },
];

export const revenueSeries = {
  اليوم: [
    { time: "8ص", value: 180 },
    { time: "9ص", value: 320 },
    { time: "10ص", value: 510 },
    { time: "11ص", value: 880 },
    { time: "12م", value: 1360 },
    { time: "1م", value: 1540 },
    { time: "2م", value: 1420 },
    { time: "3م", value: 990 },
    { time: "4م", value: 740 },
    { time: "5م", value: 860 },
    { time: "6م", value: 1080 },
    { time: "7م", value: 1290 },
    { time: "8م", value: 1510 },
    { time: "9م", value: 1180 },
    { time: "10م", value: 760 },
  ] as RevenuePoint[],
  الأسبوع: [
    { time: "السبت", value: 6480 },
    { time: "الأحد", value: 7120 },
    { time: "الاثنين", value: 6890 },
    { time: "الثلاثاء", value: 7750 },
    { time: "الأربعاء", value: 8210 },
    { time: "الخميس", value: 9140 },
    { time: "الجمعة", value: 10480 },
  ] as RevenuePoint[],
  الشهر: [
    { time: "أسبوع 1", value: 42200 },
    { time: "أسبوع 2", value: 44750 },
    { time: "أسبوع 3", value: 46880 },
    { time: "أسبوع 4", value: 49210 },
  ] as RevenuePoint[],
};

export const topProducts: ProductPerformance[] = [
  { name: "كابتشينو", value: 34 },
  { name: "شاورما دجاج", value: 28 },
  { name: "سموثي", value: 22 },
  { name: "كيك الشوكولا", value: 19 },
  { name: "شاي", value: 15 },
];

export const channelStatuses: ChannelStatusItem[] = [
  {
    id: "whatsapp",
    name: "واتساب",
    icon: "whatsapp",
    status: "نشط",
    lastMessageTime: "19:42",
  },
  {
    id: "messenger",
    name: "ماسنجر",
    icon: "messenger",
    status: "نشط",
    lastMessageTime: "19:18",
  },
  {
    id: "instagram",
    name: "إنستاجرام",
    icon: "instagram",
    status: "نشط",
    lastMessageTime: "18:57",
  },
  {
    id: "phone",
    name: "الهاتف",
    icon: "phone",
    status: "نشط",
    lastMessageTime: "18:44",
  },
];

export const latestOrders: OrderRow[] = [
  {
    id: "#2341",
    customer: "محمد سامح",
    source: "واتساب - القاهرة الجديدة",
    channel: "whatsapp",
    total: 420,
    status: "جديد",
    time: "19:41",
  },
  {
    id: "#2340",
    customer: "أسماء محمود",
    source: "إنستاجرام - مدينة نصر",
    channel: "instagram",
    total: 285,
    status: "قيد التجهيز",
    time: "19:34",
  },
  {
    id: "#2339",
    customer: "كريم نبيل",
    source: "الهاتف - الشيخ زايد",
    channel: "phone",
    total: 610,
    status: "تم التوصيل",
    time: "19:20",
  },
  {
    id: "#2338",
    customer: "سارة مجدي",
    source: "ماسنجر - المعادي",
    channel: "messenger",
    total: 190,
    status: "قيد التجهيز",
    time: "19:12",
  },
  {
    id: "#2337",
    customer: "حسن عادل",
    source: "واتساب - أكتوبر",
    channel: "whatsapp",
    total: 745,
    status: "ملغي",
    time: "18:56",
  },
  {
    id: "#2336",
    customer: "نهى عمرو",
    source: "واتساب - الرحاب",
    channel: "whatsapp",
    total: 360,
    status: "تم التوصيل",
    time: "18:40",
  },
];

export const initialActivityFeed: ActivityEvent[] = [
  {
    id: "a1",
    icon: "ai",
    text: "الذكاء رد على استفسار عميل عن توفر كيك الشوكولا",
    time: "الآن",
  },
  {
    id: "a2",
    icon: "order",
    text: "تم إنشاء طلب جديد للعميل محمد سامح بقيمة 420 ج.م",
    time: "منذ 2 دقيقة",
  },
  {
    id: "a3",
    icon: "inventory",
    text: "تنبيه مخزون: الكيلو جبن اقترب من حد الأمان",
    time: "منذ 4 دقائق",
  },
  {
    id: "a4",
    icon: "payment",
    text: "تم تسجيل دفعة COD محصلة لشركة الشحن بقيمة 1,280 ج.م",
    time: "منذ 6 دقائق",
  },
  {
    id: "a5",
    icon: "customer",
    text: "تم إضافة عميلة جديدة من قناة إنستاجرام: سارة مجدي",
    time: "منذ 8 دقائق",
  },
  {
    id: "a6",
    icon: "order",
    text: "تم تحويل طلب #2338 إلى حالة قيد التجهيز",
    time: "منذ 11 دقيقة",
  },
  {
    id: "a7",
    icon: "ai",
    text: "الذكاء اقترح متابعة فورية لثلاث طلبات متأخرة",
    time: "منذ 13 دقيقة",
  },
  {
    id: "a8",
    icon: "inventory",
    text: "تمت مزامنة كميات المخزون بين الفرع الرئيسي والمطبخ",
    time: "منذ 16 دقيقة",
  },
];

export const activityLiveQueue: ActivityEvent[] = [
  {
    id: "n1",
    icon: "ai",
    text: "الذكاء أجاب على استفسار عن سعر الكابتشينو الكبير خلال 6 ثوانٍ",
    time: "الآن",
  },
  {
    id: "n2",
    icon: "order",
    text: "دخل طلب جديد من واتساب بقيمة 315 ج.م للعميلة مريم خالد",
    time: "الآن",
  },
  {
    id: "n3",
    icon: "payment",
    text: "تمت تسوية دفعة COD لشحنة فرع المعادي",
    time: "الآن",
  },
  {
    id: "n4",
    icon: "inventory",
    text: "تم اقتراح إعادة طلب 18 عبوة حليب بسبب تسارع السحب",
    time: "الآن",
  },
];
