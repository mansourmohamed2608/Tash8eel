#!/usr/bin/env ts-node
/**
 * demo-businesses.seed.ts
 *
 * Seeds three business verticals under the single `demo-merchant` account:
 *   - painter_wall_art         (hand-painted wall art; Shahdeen Art reference)
 *   - gifts_chocolate_perfume  (gift giveaways; Lady Orchid reference)
 *   - decor_planters           (plant pots / home decor; Garden and More reference)
 *
 * Data written:
 *   - merchants             (upsert — leaves existing entitlements alone)
 *   - catalog_items         (one row per product, tagged with business_type slug)
 *   - product_media         (Unsplash placeholder URLs, flagged as demo)
 *   - catalog_embedding_jobs (PENDING — drained by EmbeddingWorker)
 *   - merchant_kb_chunks    (tagged with business_type + source_type)
 *   - kb_embedding_jobs     (PENDING — drained by EmbeddingWorker)
 *   - merchant_sales_playbooks (unified slot graph covering all three verticals)
 *
 * Idempotent: scoped deletes by merchant_id + tag "business_type:<slug>"
 * rerun yields the same final state.
 *
 * NOTE on product_media: URLs point to public Unsplash photos used as
 * placeholders so MediaComposer can exercise the end-to-end attachment path
 * in demos. They are NOT real merchant photography and are marked as such
 * in product_media.hash via the "demo-placeholder:" prefix.
 *
 * Run: npm run db:seed:demo-businesses -w apps/api
 */

import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

// Look in likely .env locations: apps/api/.env, then repo root .env.
for (const rel of [
  "../../../.env",
  "../../../../.env",
  "../../../../../.env",
]) {
  if (process.env.DATABASE_URL) break;
  dotenv.config({ path: path.resolve(__dirname, rel) });
}

const MERCHANT_ID = "demo-merchant";

type BusinessType =
  | "painter_wall_art"
  | "gifts_chocolate_perfume"
  | "decor_planters";

interface ProductMedia {
  url: string;
  captionAr: string;
  captionEn?: string;
}

interface CatalogProduct {
  sku: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: string;
  basePrice: number;
  stock: number;
  extraTags: string[];
  media: ProductMedia[];
}

interface KbEntry {
  sourceType: string;
  title: string;
  content: string;
  tags?: string[];
}

interface VerticalSeed {
  businessType: BusinessType;
  catalog: CatalogProduct[];
  kb: KbEntry[];
}

// ─── Painter / custom wall art ──────────────────────────────────────────────
// Prices match the user-supplied quote sheet from the Shahdeen Art screenshot.
const painter: VerticalSeed = {
  businessType: "painter_wall_art",
  catalog: [
    {
      sku: "PAINT-40X40",
      nameAr: "تابلوه رسم يدوي 40x40 سم",
      nameEn: "Hand-painted wall art 40x40 cm",
      descriptionAr:
        "لوحة مرسومة يدوياً بمقاس 40×40 سم. التصميم والألوان حسب طلب العميل أو صورة مرجعية.",
      descriptionEn:
        "Hand-painted 40x40 cm piece. Design and palette chosen per customer reference or brief.",
      category: "wall_art",
      basePrice: 1300,
      stock: 99,
      extraTags: ["size:40x40", "handmade", "custom_design"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1579783928621-7a13d66a62d1",
          captionAr: "مثال تابلوه مرسوم يدوياً بتفاصيل هادئة",
        },
      ],
    },
    {
      sku: "PAINT-50X50",
      nameAr: "تابلوه رسم يدوي 50x50 سم",
      nameEn: "Hand-painted wall art 50x50 cm",
      descriptionAr:
        "لوحة مرسومة يدوياً بمقاس 50×50 سم. مناسبة لغرف الاستقبال والمكاتب.",
      descriptionEn:
        "Hand-painted 50x50 cm piece. Great for living rooms and studies.",
      category: "wall_art",
      basePrice: 1600,
      stock: 99,
      extraTags: ["size:50x50", "handmade", "custom_design"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1541961017774-22349e4a1262",
          captionAr: "مثال تابلوه بألوان دافئة",
        },
      ],
    },
    {
      sku: "PAINT-80X120",
      nameAr: "تابلوه رسم يدوي 80x120 سم",
      nameEn: "Hand-painted wall art 80x120 cm",
      descriptionAr:
        "لوحة بانورامية مرسومة يدوياً بمقاس 80×120 سم. تعطي حضور قوي لأي حائط.",
      descriptionEn:
        "Panoramic hand-painted 80x120 cm piece. Makes a strong statement on any wall.",
      category: "wall_art",
      basePrice: 4500,
      stock: 99,
      extraTags: ["size:80x120", "statement", "handmade"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1578301978018-3005759f48f7",
          captionAr: "مثال لوحة بانورامية مخصصة",
        },
      ],
    },
    {
      sku: "PAINT-100X100",
      nameAr: "تابلوه رسم يدوي 100x100 سم",
      nameEn: "Hand-painted wall art 100x100 cm",
      descriptionAr:
        "لوحة مربعة مرسومة يدوياً بمقاس 100×100 سم. مناسبة للحيطان الكبيرة والمداخل.",
      descriptionEn:
        "Square hand-painted 100x100 cm piece. Suits large walls and entrances.",
      category: "wall_art",
      basePrice: 4500,
      stock: 99,
      extraTags: ["size:100x100", "square", "handmade"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38",
          captionAr: "مثال تابلوه مربع بألوان تجريدية",
        },
      ],
    },
    {
      sku: "PAINT-100X150",
      nameAr: "تابلوه رسم يدوي 100x150 سم",
      nameEn: "Hand-painted wall art 100x150 cm",
      descriptionAr:
        "لوحة مستطيلة مرسومة يدوياً بمقاس 100×150 سم. مناسبة لصالات الاستقبال الكبيرة.",
      descriptionEn:
        "Rectangular hand-painted 100x150 cm piece. For larger reception rooms.",
      category: "wall_art",
      basePrice: 5200,
      stock: 99,
      extraTags: ["size:100x150", "large", "handmade"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1549887534-1541e9326642",
          captionAr: "مثال لوحة كبيرة بألوان دافئة",
        },
      ],
    },
    {
      sku: "PAINT-200X100",
      nameAr: "تابلوه رسم يدوي 200x100 سم",
      nameEn: "Hand-painted wall art 200x100 cm",
      descriptionAr:
        "لوحة ممتدة أفقياً بمقاس 200×100 سم. قطعة مميزة للحيطان الطويلة.",
      descriptionEn:
        "Horizontal 200x100 cm panel. A standout piece for long walls.",
      category: "wall_art",
      basePrice: 8000,
      stock: 99,
      extraTags: ["size:200x100", "panorama", "statement"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1515405295579-ba7b45403062",
          captionAr: "مثال بانوراما أفقية",
        },
      ],
    },
    {
      sku: "PAINT-CUSTOM",
      nameAr: "تابلوه مخصص (مقاس وتصميم خاص)",
      nameEn: "Custom-sized wall art",
      descriptionAr:
        "مقاسات خاصة خارج المقاسات المعتادة. التسعير النهائي يتحدد بعد مراجعة الصورة المرجعية وصورة الحيطة والمقاس.",
      descriptionEn:
        "Non-standard sizes. Final price quoted after reviewing reference image, wall photo, and size.",
      category: "wall_art",
      basePrice: 0,
      stock: 99,
      extraTags: ["custom_size", "quote_required", "handmade"],
      media: [],
    },
  ],
  kb: [
    {
      sourceType: "pricing_guidance",
      title: "قائمة أسعار التابلوهات المعتادة",
      content: [
        "قائمة الأسعار المعتمدة للمقاسات الجاهزة:",
        "- 40×40 سم: 1300 جنيه",
        "- 50×50 سم: 1600 جنيه",
        "- 80×120 سم: 4500 جنيه",
        "- 100×100 سم: 4500 جنيه",
        "- 100×150 سم: 5200 جنيه",
        "- 200×100 سم: 8000 جنيه",
        "المقاسات خارج القائمة تحتاج مراجعة الصورة المرجعية وصورة الحيطة قبل التسعير النهائي.",
      ].join("\n"),
      tags: ["pricing", "sizes", "canonical"],
    },
    {
      sourceType: "sizing_policy",
      title: "المقاسات المعتادة والمقاسات الخاصة",
      content:
        "لو العميل طلب مقاس من القائمة المعتادة نعطيه السعر مباشرة. لو مقاس مخصص، نسأل عن أبعاد الحيطة وصورة المكان قبل ما نأكد السعر.",
      tags: ["sizing"],
    },
    {
      sourceType: "reference_image",
      title: "الصور المرجعية وصور الحيطة",
      content:
        "نقبل صور مرجعية من العميل لفهم الفكرة والألوان. لو الصورة غير واضحة نطلب صورة أوضح. نطلب كمان صورة الحيطة/الركن المطلوب لاختيار المقاس المناسب.",
      tags: ["media", "reference"],
    },
    {
      sourceType: "production_time",
      title: "مدة التنفيذ والتسليم",
      content:
        "المدة المعتادة من 5 إلى 14 يوم عمل حسب المقاس ومستوى التفاصيل. المقاسات الكبيرة أو التفاصيل العالية قد تحتاج وقت أطول. التسليم داخل القاهرة والجيزة خلال 24 ساعة بعد الانتهاء، الإسكندرية خلال يومين.",
      tags: ["time", "delivery"],
    },
    {
      sourceType: "payment_policy",
      title: "طريقة الدفع والعربون",
      content:
        "الأعمال المخصصة تحتاج عربون 50% قبل بدء التنفيذ والباقي عند التسليم. الدفع كاش عند التسليم أو تحويل بنكي/إنستاباي على العربون.",
      tags: ["payment", "deposit"],
    },
    {
      sourceType: "supported_styles",
      title: "الأساليب والألوان المدعومة",
      content:
        "ندعم التجريدي، الانطباعي، المناظر الطبيعية، البورتريه، والميكس ميديا. الألوان تكون حسب طلب العميل: دافئة، باردة، هادئة، أو عالية التباين.",
      tags: ["styles", "colors"],
    },
    {
      sourceType: "infeasibility_guidance",
      title: "الطلبات غير الممكنة",
      content:
        "لا نقوم بنسخ مطابق 100% من لوحة لفنان معروف مع التوقيع. الطلبات شديدة الواقعية بمقاس كبير وميعاد قصير تحتاج تعديل على الميعاد أو الميزانية أو مستوى التفاصيل.",
      tags: ["constraints"],
    },
    {
      sourceType: "delivery_cities",
      title: "مناطق التوصيل",
      content:
        "التوصيل متاح للقاهرة والجيزة والإسكندرية. لمناطق تانية نرتب شحن مع شركة موثوقة على حساب العميل.",
      tags: ["delivery"],
    },
    {
      sourceType: "opener_bank",
      title: "نبرة الرد — تابلوهات",
      content:
        'استخدم ردود مصرية دافية. عند طلب صورة مرجعية: "ابعتيلي الصورة عشان أقدر أحدد المقاس المناسب". عند السؤال عن سعر مقاس غير مألوف: "المقاس ده بنأكده بعد ما نشوف الصورة والحيطة".',
      tags: ["tone"],
    },
    {
      sourceType: "escalation_policy",
      title: "سياسة الشكاوى والتحويل",
      content:
        "إذا العميل طلب مسؤول ولا يوجد وكيل بشري متاح، لا تعد بالتحويل. رد كأنك الشخص الموجود واسأل عن تفاصيل المشكلة أو رقم الطلب.",
      tags: ["complaint"],
    },
  ],
};

// ─── Gifts / chocolate / perfume giveaways ─────────────────────────────────
// Driven by the Lady Orchid reference screenshots and the user's quantity-200
// quote sheet (Passionelle 175/piece etc).
const gifts: VerticalSeed = {
  businessType: "gifts_chocolate_perfume",
  catalog: [
    {
      sku: "GIFT-PASSIONELLE",
      nameAr: "شوكولاتة Passionelle — قطعة واحدة",
      nameEn: "Passionelle chocolate — per piece",
      descriptionAr:
        "شوكولاتة Passionelle فاخرة مناسبة لتوزيعات المناسبات والأفراح. السعر للقطعة الواحدة.",
      descriptionEn:
        "Premium Passionelle chocolate for event giveaways. Priced per piece.",
      category: "chocolate",
      basePrice: 175,
      stock: 500,
      extraTags: ["chocolate", "premium", "giveaway", "per_piece"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1549007994-cb92caebd54b",
          captionAr: "قطعة شوكولاتة فاخرة للتوزيعات",
        },
      ],
    },
    {
      sku: "GIFT-CHOC-PLAIN",
      nameAr: "توزيعات شوكولاتة سادة",
      nameEn: "Plain chocolate giveaway",
      descriptionAr:
        "توزيعات شوكولاتة سادة بدون مكسرات، مغلفة بورق مناسب للمناسبة. السعر للقطعة.",
      descriptionEn:
        "Plain chocolate giveaway, wrapped to suit the occasion. Priced per piece.",
      category: "chocolate",
      basePrice: 85,
      stock: 1000,
      extraTags: ["chocolate", "plain", "giveaway", "no_nuts"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1548365328-9f547fb09530",
          captionAr: "توزيعات شوكولاتة سادة",
        },
      ],
    },
    {
      sku: "GIFT-CHOC-NUTS",
      nameAr: "توزيعات شوكولاتة بالمكسرات",
      nameEn: "Chocolate giveaway with nuts",
      descriptionAr:
        "توزيعات شوكولاتة بالبندق أو الفستق حسب التوفر. السعر للقطعة، يختلف بسيط حسب نوع المكسرات.",
      descriptionEn:
        "Hazelnut or pistachio chocolate giveaway. Priced per piece; varies slightly by nut choice.",
      category: "chocolate",
      basePrice: 120,
      stock: 1000,
      extraTags: ["chocolate", "with_nuts", "hazelnut", "pistachio", "giveaway"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52",
          captionAr: "شوكولاتة بالمكسرات",
        },
      ],
    },
    {
      sku: "GIFT-PERFUME-30ML",
      nameAr: "توزيعات برفيوم 30 مل",
      nameEn: "Perfume giveaway 30 ml",
      descriptionAr:
        "زجاجة برفيوم 30 مل مناسبة للتوزيعات في الأفراح والمناسبات المميزة. السعر للقطعة.",
      descriptionEn:
        "30 ml perfume bottle for wedding and premium event giveaways. Priced per piece.",
      category: "perfume",
      basePrice: 220,
      stock: 400,
      extraTags: ["perfume", "30ml", "giveaway", "event"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1587017539504-67cfbddac569",
          captionAr: "توزيعات برفيوم 30 مل",
        },
      ],
    },
    {
      sku: "GIFT-BOX-CUSTOM",
      nameAr: "بوكس هدايا مخصص",
      nameEn: "Custom gift box",
      descriptionAr:
        "بوكس هدايا يتم تجهيزه حسب طلب العميل: شوكولاتة أو برفيوم أو الاتنين، مع تغليف وكارت. السعر النهائي حسب المحتوى والعدد.",
      descriptionEn:
        "Gift box assembled to customer spec: chocolate, perfume, or both, with wrap and card. Final price depends on contents and quantity.",
      category: "gift_box",
      basePrice: 0,
      stock: 200,
      extraTags: ["gift_box", "custom", "quote_required"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1512909006721-3d6018887383",
          captionAr: "بوكس هدايا مخصص",
        },
      ],
    },
    {
      sku: "GIFT-PACK-ADDON",
      nameAr: "تغليف إضافي + كارت",
      nameEn: "Extra packaging + card",
      descriptionAr:
        "إضافة تغليف مميز وكارت شخصي باسم العميل/المناسبة. يُضاف على القطعة الواحدة.",
      descriptionEn:
        "Premium wrap + personal card added per piece.",
      category: "packaging",
      basePrice: 15,
      stock: 9999,
      extraTags: ["packaging", "addon", "card"],
      media: [],
    },
  ],
  kb: [
    {
      sourceType: "pricing_guidance",
      title: "أسعار التوزيعات الأساسية",
      content: [
        "توزيعات شوكولاتة:",
        "- Passionelle فاخرة: 175 جنيه للقطعة",
        "- شوكولاتة سادة: 85 جنيه للقطعة (تقريبي)",
        "- شوكولاتة بالمكسرات: 120 جنيه للقطعة",
        "توزيعات برفيوم 30 مل: 220 جنيه للقطعة.",
        "تغليف إضافي + كارت: +15 جنيه للقطعة.",
        "بوكس هدايا مخصص: السعر يتحدد بعد ما نعرف المحتوى والعدد.",
      ].join("\n"),
      tags: ["pricing", "canonical"],
    },
    {
      sourceType: "quantity_discipline",
      title: "تحديد الكمية قبل التأكيد",
      content:
        "قبل أي تسعير نهائي نسأل العميل عن الكمية المطلوبة والمناسبة والتاريخ. الكميات الكبيرة (200+) يمكن التفاوض على خصم بسيط.",
      tags: ["quantity", "qualification"],
    },
    {
      sourceType: "occasion_qualification",
      title: "أسئلة تأهيل المناسبة",
      content:
        "نسأل عن: نوع المناسبة، التاريخ، الكمية، الميزانية التقريبية، الاختيار بين شوكولاتة أو برفيوم، طريقة التغليف، منطقة التوصيل، طريقة الدفع.",
      tags: ["qualification", "slots"],
    },
    {
      sourceType: "reference_screenshot",
      title: "التعامل مع الريلز والروابط",
      content:
        "لو العميل بعت لينك أو ريل ولم يفتح، نطلب منه screenshot للصورة أو المنتج. لو المنتج مش من عندنا، نقترح أقرب بديل متاح عندنا.",
      tags: ["media", "reference"],
    },
    {
      sourceType: "delivery_cities",
      title: "التوصيل",
      content:
        "توصيل القاهرة والجيزة في نفس اليوم أو اليوم التالي حسب الكمية. الإسكندرية يومين عمل. المحافظات الأخرى شحن مع شركة موثوقة على حساب العميل.",
      tags: ["delivery"],
    },
    {
      sourceType: "payment_policy",
      title: "طريقة الدفع والعربون",
      content:
        "للكميات الصغيرة الدفع كاش عند التسليم. للكميات 100+ نطلب عربون 50% تحويل بنكي أو إنستاباي. الباقي يتدفع قبل الشحن.",
      tags: ["payment", "deposit"],
    },
    {
      sourceType: "packaging_options",
      title: "خيارات التغليف",
      content:
        "التغليف الأساسي مجاني. التغليف المميز بكارت وشريطة وحروف ذهبية بإضافة 15 جنيه للقطعة. الألوان: أبيض، كريمي، ذهبي، وردي، أسود.",
      tags: ["packaging"],
    },
    {
      sourceType: "variant_policy",
      title: "الشوكولاتة: سادة أو بمكسرات",
      content:
        "الشوكولاتة السادة أرخص ومتاحة كمية أكبر. بالمكسرات (بندق/فستق) أعلى سعر بسيط وتحتاج تأكيد التوفر للكميات الكبيرة.",
      tags: ["variants", "chocolate"],
    },
    {
      sourceType: "opener_bank",
      title: "نبرة الرد — توزيعات",
      content:
        'استخدم ردود دافية وبائعة. "أكيد ❤️ قوليلي المناسبة والتاريخ والكمية تقريباً عشان أظبطلك اقتراح مناسب". ممكن الرد بالإنجليزي لو العميل بدأ بالإنجليزي.',
      tags: ["tone"],
    },
    {
      sourceType: "escalation_policy",
      title: "التعامل مع طلب مسؤول",
      content:
        "لو العميل طلب مسؤول ولا يوجد وكيل بشري متاح، رد كأنك الشخص الموجود واسأله عن التفاصيل مباشرة.",
      tags: ["complaint"],
    },
  ],
};

// ─── Home decor / plant pots / planters ────────────────────────────────────
// Based on Garden and More / Terrastics screenshots.
const decor: VerticalSeed = {
  businessType: "decor_planters",
  catalog: [
    {
      sku: "DECOR-CERAMIC-SM",
      nameAr: "قصرية سيراميك صغيرة",
      nameEn: "Small ceramic planter",
      descriptionAr:
        "قصرية سيراميك حجم صغير إلى متوسط. ألوان متاحة: بيج، رمادي، أسود، أبيض. مناسبة للنباتات الداخلية.",
      descriptionEn:
        "Small to medium ceramic planter. Available in beige, grey, black, white. Suits indoor plants.",
      category: "planter",
      basePrice: 350,
      stock: 40,
      extraTags: [
        "ceramic",
        "indoor",
        "color:beige",
        "color:grey",
        "color:black",
        "color:white",
        "size:small",
        "size:medium",
      ],
      media: [
        {
          url: "https://images.unsplash.com/photo-1485955900006-10f4d324d411",
          captionAr: "قصرية سيراميك صغيرة",
        },
      ],
    },
    {
      sku: "DECOR-CONE-TALL",
      nameAr: "قصرية مخروطية طويلة",
      nameEn: "Tall cone planter",
      descriptionAr:
        "قصرية طويلة بشكل مخروطي. ألوان: أسود، رمادي، بيج. مناسبة للداخل والخارج.",
      descriptionEn:
        "Tall cone-shaped planter. Colors: black, grey, beige. Indoor or outdoor.",
      category: "planter",
      basePrice: 950,
      stock: 25,
      extraTags: [
        "tall",
        "cone",
        "color:black",
        "color:grey",
        "color:beige",
        "indoor_outdoor",
      ],
      media: [
        {
          url: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a",
          captionAr: "قصرية مخروطية طويلة",
        },
      ],
    },
    {
      sku: "DECOR-MARBLE-ROUND",
      nameAr: "قصرية بتأثير رخامي دائرية",
      nameEn: "Marble-look round planter",
      descriptionAr:
        "قصرية دائرية بتأثير رخامي أبيض/رمادي. مناسبة للديكور الفاخر.",
      descriptionEn:
        "Round pot with white/grey marble effect. Premium decor.",
      category: "planter",
      basePrice: 1200,
      stock: 20,
      extraTags: ["round", "marble", "stone_look", "premium"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1485955900006-10f4d324d411",
          captionAr: "قصرية دائرية برخامي",
        },
      ],
    },
    {
      sku: "DECOR-HANGING",
      nameAr: "قصرية معلقة + حامل",
      nameEn: "Hanging basket / metal stand pot",
      descriptionAr:
        "قصرية معلقة أو قصرية بحامل معدني. مناسبة للبلكونة والحديقة.",
      descriptionEn:
        "Hanging basket or metal stand pot. For balconies and gardens.",
      category: "planter",
      basePrice: 550,
      stock: 30,
      extraTags: ["hanging", "metal_stand", "balcony", "garden"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1446071103084-c257b5f70672",
          captionAr: "قصرية معلقة",
        },
      ],
    },
    {
      sku: "DECOR-RIBBED-LARGE",
      nameAr: "قصرية مضلعة كبيرة",
      nameEn: "Large ribbed planter",
      descriptionAr:
        "قصرية كبيرة مضلعة، قطعة بارزة مناسبة لنبات كبير بمدخل أو صالة.",
      descriptionEn:
        "Large ribbed statement pot for entry or living room plants.",
      category: "planter",
      basePrice: 1800,
      stock: 15,
      extraTags: ["large", "ribbed", "statement"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1534705867302-2a41394d2a3b",
          captionAr: "قصرية مضلعة كبيرة",
        },
      ],
    },
    {
      sku: "DECOR-POT-WITH-PLANT",
      nameAr: "قصرية مع نبات داخلي",
      nameEn: "Indoor pot + plant bundle",
      descriptionAr:
        "قصرية مختارة مع نبات داخلي مناسب (مونستيرا، بوتس، سنسفيريا...). السعر النهائي حسب نوع النبات وحجم القصرية.",
      descriptionEn:
        "Selected pot + matching indoor plant (monstera, pothos, sansevieria...). Final price depends on plant and pot size.",
      category: "plant_bundle",
      basePrice: 0,
      stock: 50,
      extraTags: ["bundle", "plant_included", "indoor", "quote_required"],
      media: [
        {
          url: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a",
          captionAr: "قصرية مع نبات داخلي",
        },
      ],
    },
    {
      sku: "DECOR-CUSTOM-SET",
      nameAr: "سيت قصاري مخصص",
      nameEn: "Custom planter set",
      descriptionAr:
        "سيت قصاري مخصص حسب المكان والنبات. نراجع صورة المكان ونقترح المقاسات والألوان المناسبة.",
      descriptionEn:
        "Custom planter set curated for the space. We review a photo of the area and suggest sizes/colors.",
      category: "planter",
      basePrice: 0,
      stock: 30,
      extraTags: ["custom", "set", "quote_required"],
      media: [],
    },
  ],
  kb: [
    {
      sourceType: "availability_policy",
      title: "التأكد من التوفر",
      content:
        "لو العميل بعت صورة/سكرين شوت لقصرية معينة، نأكد التوفر قبل ما نقول السعر. لو المنتج مش متاح، نقترح أقرب شكل/لون/مقاس متوفر.",
      tags: ["availability"],
    },
    {
      sourceType: "variants",
      title: "الألوان والمقاسات",
      content:
        "القصاري متاحة بألوان وأحجام مختلفة. الألوان الأساسية: بيج، رمادي، أسود، أبيض. بعض الموديلات تدعم ألوان إضافية عند الطلب. المقاسات تتحدد حسب المنتج.",
      tags: ["variants"],
    },
    {
      sourceType: "bundle_policy",
      title: "قصرية فقط أم مع نبات",
      content:
        "معظم القصاري تباع لوحدها. بعضها يتباع كباندل مع نبات داخلي مناسب. لو العميل مش متأكد، نسأل: قصرية بس ولا نبات معاها؟",
      tags: ["bundle"],
    },
    {
      sourceType: "reference_image",
      title: "طلب صورة المكان أو المنتج",
      content:
        "لو العميل محتار، نسأله يبعت صورة المكان/الركن المطلوب عشان نرشح المقاس واللون. الصورة تساعد نرشح حاجة تناسب الديكور والإضاءة.",
      tags: ["media", "reference"],
    },
    {
      sourceType: "voice_note_policy",
      title: "الفويس نوت",
      content:
        "لو العميل بعت رسالة صوتية، النظام بيفرغها كنص تلقائياً ونتعامل معها كأي رسالة عادية. ممكن نلخص للعميل طلبه للتأكيد.",
      tags: ["voice"],
    },
    {
      sourceType: "delivery_cities",
      title: "التوصيل والمناطق",
      content:
        "التوصيل متاح لكل محافظات القاهرة الكبرى. مصر الجديدة، المعادي، التجمع، الرحاب، 6 أكتوبر: رسوم من 45 لـ 75 جنيه حسب المنطقة والحجم. القصاري الكبيرة تحتاج سيارة مناسبة.",
      tags: ["delivery"],
    },
    {
      sourceType: "payment_policy",
      title: "طريقة الدفع",
      content:
        "الدفع كاش عند الاستلام أو تحويل/إنستاباي قبل التجهيز. الطلبات المخصصة تحتاج عربون 30% قبل التحضير.",
      tags: ["payment", "deposit"],
    },
    {
      sourceType: "indoor_outdoor",
      title: "داخلي أم خارجي",
      content:
        "القصاري السيراميك مناسبة للداخل أساساً. الخشب والمعدن للخارج. القصاري الكبيرة المضلعة مناسبة للداخل والخارج لو في غطاء.",
      tags: ["use_case"],
    },
    {
      sourceType: "opener_bank",
      title: "نبرة الرد — ديكور",
      content:
        'نبرة سريعة وعملية بالمصري. "تمام، ابعتيلي صورة المنتج/المكان عشان أقدر أقولك التوفر والسعر بدقة". عند عدم التوفر: "ده مش موجود بس عندي شبهه باللون/المقاس ده".',
      tags: ["tone"],
    },
    {
      sourceType: "escalation_policy",
      title: "التعامل مع الشكاوى",
      content:
        "إذا العميل طلب مسؤول ولا يوجد وكيل بشري متاح، لا تعد بالتحويل. رد كأنك أنت المسؤول المتاح واسأله عن تفاصيل الطلب/الشحنة.",
      tags: ["complaint"],
    },
  ],
};

const verticals: VerticalSeed[] = [painter, gifts, decor];

// ─── Database writes ──────────────────────────────────────────────────────

async function upsertDemoMerchant(client: Client): Promise<void> {
  // Leaves existing merchant row / entitlements (from migration 016) untouched.
  // Only ensures the row exists so catalog_items FK holds in fresh environments.
  await client.query(
    `INSERT INTO merchants (
       id, name, category, plan, is_active, currency, language, city, timezone,
       config, branding, negotiation_rules, delivery_rules
     )
     VALUES (
       $1, $2, 'GENERIC', 'PRO', true, 'EGP', 'ar', 'القاهرة', 'Africa/Cairo',
       $3::jsonb, '{}'::jsonb, '{}'::jsonb, $4::jsonb
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      MERCHANT_ID,
      "متجر العرض التجريبي",
      JSON.stringify({
        brandName: "متجر العرض التجريبي",
        tone: "warm",
        language: "ar-EG",
        locale: "ar-EG",
        currency: "EGP",
        cadence: {
          dialect: "egyptian",
          warmth: 0.8,
          emoji_budget: 1,
          signature: "فريق متجر العرض",
        },
        agent_availability: {
          hours_tz: "Africa/Cairo",
          channels: [],
          backup: "none",
        },
      }),
      JSON.stringify({
        defaultFee: 50,
        freeDeliveryThreshold: 1500,
        deliveryZones: [
          { zone: "القاهرة", fee: 50, estimatedDays: 1 },
          { zone: "الجيزة", fee: 55, estimatedDays: 1 },
          { zone: "مصر الجديدة", fee: 55, estimatedDays: 1 },
          { zone: "التجمع", fee: 65, estimatedDays: 1 },
          { zone: "6 أكتوبر", fee: 70, estimatedDays: 1 },
          { zone: "الإسكندرية", fee: 90, estimatedDays: 2 },
        ],
      }),
    ],
  );
}

async function clearVertical(
  client: Client,
  businessType: BusinessType,
  skus: string[],
): Promise<void> {
  // Catalog: delete by sku prefix list (scoped to merchant).
  if (skus.length > 0) {
    // product_media CASCADEs via catalog_items FK on DELETE, but be explicit:
    await client.query(
      `DELETE FROM product_media
       WHERE catalog_item_id IN (
         SELECT id FROM catalog_items
         WHERE merchant_id = $1 AND sku = ANY($2::text[])
       )`,
      [MERCHANT_ID, skus],
    );
    await client.query(
      `DELETE FROM catalog_embedding_jobs
       WHERE catalog_item_id IN (
         SELECT id FROM catalog_items
         WHERE merchant_id = $1 AND sku = ANY($2::text[])
       )`,
      [MERCHANT_ID, skus],
    );
    await client.query(
      `DELETE FROM catalog_items
       WHERE merchant_id = $1 AND sku = ANY($2::text[])`,
      [MERCHANT_ID, skus],
    );
  }

  // KB: delete by merchant + business_type (scoped).
  await client.query(
    `DELETE FROM kb_embedding_jobs
     WHERE chunk_id IN (
       SELECT id FROM merchant_kb_chunks
       WHERE merchant_id = $1 AND business_type = $2
     )`,
    [MERCHANT_ID, businessType],
  );
  await client.query(
    `DELETE FROM merchant_kb_chunks
     WHERE merchant_id = $1 AND business_type = $2`,
    [MERCHANT_ID, businessType],
  );
}

async function insertCatalogItem(
  client: Client,
  vertical: VerticalSeed,
  product: CatalogProduct,
): Promise<string> {
  const catalogItemId = uuidv4();
  const tags = [
    `business_type:${vertical.businessType}`,
    vertical.businessType,
    ...product.extraTags,
  ];

  await client.query(
    `INSERT INTO catalog_items (
       id, merchant_id, sku, name_ar, name_en, description_ar, description_en,
       base_price, category, stock_quantity, variants, options, tags,
       is_active, is_available
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '[]'::jsonb, '[]'::jsonb, $11,
       true, $12
     )`,
    [
      catalogItemId,
      MERCHANT_ID,
      product.sku,
      product.nameAr,
      product.nameEn,
      product.descriptionAr,
      product.descriptionEn,
      product.basePrice,
      product.category,
      product.stock,
      tags,
      product.stock > 0 && product.basePrice > 0,
    ],
  );

  // product_media rows — placeholder URLs, flagged via hash prefix.
  for (const [idx, media] of product.media.entries()) {
    await client.query(
      `INSERT INTO product_media (
         catalog_item_id, url, caption_ar, caption_en, display_order,
         channel_flags, send_on, fallback_text, hash
       ) VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, 'on_request', $7, $8
       )`,
      [
        catalogItemId,
        media.url,
        media.captionAr,
        media.captionEn ?? null,
        idx,
        JSON.stringify({ whatsapp: true, messenger: true, instagram: true }),
        media.captionAr,
        `demo-placeholder:${product.sku}:${idx}`,
      ],
    );
  }

  // Enqueue catalog embedding job.
  await client.query(
    `INSERT INTO catalog_embedding_jobs (catalog_item_id, merchant_id, status)
     VALUES ($1, $2, 'PENDING')
     ON CONFLICT DO NOTHING`,
    [catalogItemId, MERCHANT_ID],
  );

  return catalogItemId;
}

async function insertKbChunk(
  client: Client,
  vertical: VerticalSeed,
  entry: KbEntry,
): Promise<void> {
  const chunkId = uuidv4();
  const sourceId = `${MERCHANT_ID}:${vertical.businessType}:${entry.sourceType}:${entry.title}`;
  const tags = [
    vertical.businessType,
    entry.sourceType,
    ...(entry.tags || []),
  ];

  await client.query(
    `INSERT INTO merchant_kb_chunks (
       id, merchant_id, source_type, source_id, business_type, module, category,
       locale, visibility, confidence_level, tags, title, content, metadata,
       is_active
     ) VALUES (
       $1, $2, $3, $4, $5, 'dialog', $3,
       'ar', 'public', 'high', $6, $7, $8, $9::jsonb,
       true
     )`,
    [
      chunkId,
      MERCHANT_ID,
      entry.sourceType,
      sourceId,
      vertical.businessType,
      tags,
      entry.title,
      entry.content,
      JSON.stringify({
        seeded: true,
        seed_source: "demo-businesses.seed.ts",
        business_type: vertical.businessType,
      }),
    ],
  );

  // Enqueue embedding job — worker drains on its 30s tick.
  await client.query(
    `INSERT INTO kb_embedding_jobs (chunk_id, merchant_id, status)
     VALUES ($1, $2, 'PENDING')
     ON CONFLICT DO NOTHING`,
    [chunkId, MERCHANT_ID],
  );
}

// Unified playbook covering painter + gifts + decor intents under one merchant.
async function upsertUnifiedPlaybook(client: Client): Promise<void> {
  const slotGraph = [
    { key: "need_or_occasion", required: true },
    { key: "product_or_style", required: false },
    { key: "size_or_variant", required: false },
    { key: "reference_media", required: false },
    { key: "quantity", required: false },
    { key: "budget", required: false },
    { key: "deadline", required: false },
    { key: "city", required: true },
    { key: "payment", required: true },
  ];

  const constraintDims = [
    "budget",
    "deadline",
    "size",
    "stock",
    "quality",
    "source_image_quality",
    "delivery_window",
  ];

  const nextQuestionTemplates = {
    need_or_occasion:
      "بتدوري على حاجة لنفسك، هدية، ولا مناسبة معينة؟",
    product_or_style: "عندك في بالك شكل أو ستايل معين؟",
    size_or_variant: "المقاس أو اللون المطلوب إيه؟",
    reference_media: "ابعتيلي صورة للمنتج/الحيطة/المكان عشان أقدر أحدد الأنسب.",
    quantity: "الكمية تقريباً كام قطعة؟",
    budget: "الميزانية تقريباً في حدود كام؟",
    deadline: "محتاجاها إمتى؟",
    city: "التوصيل لأي مدينة أو منطقة؟",
    payment: "تحبي الدفع كاش عند الاستلام ولا تحويل؟",
  };

  const intentExamples = {
    greeting: ["السلام عليكم", "Hi", "هاي"],
    browsing: [
      "عايزة حاجة شيك للسيزون",
      "بدور على هدية",
      "مش عارف أختار",
    ],
    custom_request: [
      "ممكن تعملي تابلوه زي الصورة دي؟",
      "عايزاه 100x150 وفيه ألوان بيج ودهبي",
      "عايز سيت قصاري للصالة",
    ],
    pricing_question: [
      "السعر كام؟",
      "Can you please let me know prices for perfumes giveaways?",
      "بكام القصرية دي؟",
    ],
    variant_question: [
      "عايز نفس الشكل ده بس لون اسود",
      "في مقاس أكبر؟",
      "عايزة شوكليت ساده ولا بندق؟",
    ],
    availability_question: [
      "عندكم زي الصورة دي؟",
      "هوا ده بوت بس ولا مع النبات؟",
    ],
    media_request: [
      "ممكن أبعتلك screenshot؟",
      "ينفع أبعتلك صورة الحيطة وتشوفي المقاس المناسب؟",
      "ممكن ابعتلك صورة المكان وتقوليلي يناسبه ايه؟",
    ],
    delivery_question: [
      "التسليم امتى؟",
      "التوصيل لمصر الجديدة بكام؟",
    ],
    quantity_statement: ["Around 200", "حوالي 200", "١٠٠ قطعة"],
    infeasible_request: [
      "عايز لوحة 200x300 تتسلم بعد ساعتين من صورة مش واضحة",
    ],
    demanding_human: ["عايز اكلم مسؤول", "حد من الإدارة"],
    off_topic: ["مين أفضل لاعب كرة في التاريخ؟"],
  };

  await client.query(
    `INSERT INTO merchant_sales_playbooks (
       merchant_id, slot_graph, constraint_dims, next_question_templates,
       intent_examples, slot_extractors, version
     ) VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, 1)
     ON CONFLICT (merchant_id) DO UPDATE SET
       slot_graph = EXCLUDED.slot_graph,
       constraint_dims = EXCLUDED.constraint_dims,
       next_question_templates = EXCLUDED.next_question_templates,
       intent_examples = EXCLUDED.intent_examples,
       slot_extractors = EXCLUDED.slot_extractors,
       version = merchant_sales_playbooks.version + 1,
       updated_at = NOW()`,
    [
      MERCHANT_ID,
      JSON.stringify(slotGraph),
      JSON.stringify(constraintDims),
      JSON.stringify(nextQuestionTemplates),
      JSON.stringify(intentExamples),
      JSON.stringify({}),
    ],
  );
}

async function seedVertical(
  client: Client,
  vertical: VerticalSeed,
): Promise<void> {
  const skus = vertical.catalog.map((p) => p.sku);
  await clearVertical(client, vertical.businessType, skus);

  for (const product of vertical.catalog) {
    await insertCatalogItem(client, vertical, product);
  }

  for (const entry of vertical.kb) {
    await insertKbChunk(client, vertical, entry);
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "false"
        ? false
        : { rejectUnauthorized: false },
  });
  await client.connect();

  const summary: Array<{ businessType: string; catalog: number; kb: number }> =
    [];

  try {
    await client.query("BEGIN");

    await upsertDemoMerchant(client);

    for (const vertical of verticals) {
      await seedVertical(client, vertical);
      summary.push({
        businessType: vertical.businessType,
        catalog: vertical.catalog.length,
        kb: vertical.kb.length,
      });
    }

    await upsertUnifiedPlaybook(client);

    await client.query("COMMIT");

    console.log(
      `✅ Seeded demo-merchant with ${verticals.length} verticals under merchant_id=${MERCHANT_ID}`,
    );
    for (const row of summary) {
      console.log(
        `   • ${row.businessType}: ${row.catalog} catalog items, ${row.kb} KB chunks`,
      );
    }
    console.log(
      "ℹ️  Embedding jobs enqueued. EmbeddingWorker drains within ~30s when OPENAI_API_KEY is set.",
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("demo-businesses seed failed:", err);
  process.exit(1);
});
