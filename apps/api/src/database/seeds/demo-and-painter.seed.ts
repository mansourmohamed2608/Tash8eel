#!/usr/bin/env ts-node
import { Client } from "pg";
import * as dotenv from "dotenv";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
if (!process.env.DATABASE_URL) {
  dotenv.config({
    path: path.resolve(__dirname, "../../../../../apps/api/.env"),
  });
}

interface CatalogSeed {
  sku: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  category: string;
  price: number;
  stock: number;
  tags: string[];
  media?: Array<{ url: string; caption: string }>;
}

interface KbSeed {
  sourceType: string;
  title: string;
  content: string;
  tags?: string[];
}

interface MerchantSeed {
  id: string;
  name: string;
  config: Record<string, unknown>;
  deliveryRules: Record<string, unknown>;
  catalog: CatalogSeed[];
  kb: KbSeed[];
  playbook: {
    slotGraph: Array<Record<string, unknown>>;
    constraintDims: string[];
    nextQuestionTemplates: Record<string, string>;
    intentExamples: Record<string, string[]>;
    slotExtractors: Record<string, unknown>;
  };
}

const merchants: MerchantSeed[] = [
  {
    id: "demo-merchant",
    name: "متجر العرض التجريبي",
    config: {
      brandName: "متجر العرض التجريبي",
      tone: "warm",
      language: "ar-EG",
      locale: "ar-EG",
      cadence: {
        dialect: "egyptian",
        warmth: 0.75,
        emoji_budget: 1,
        signature: "فريق متجر العرض",
      },
      agent_availability: {
        hours_tz: "Africa/Cairo",
        channels: [],
        backup: "none",
      },
    },
    deliveryRules: {
      defaultFee: 45,
      freeDeliveryThreshold: 1000,
      deliveryZones: [
        { zone: "القاهرة", fee: 45, estimatedDays: 1 },
        { zone: "الجيزة", fee: 55, estimatedDays: 1 },
        { zone: "الإسكندرية", fee: 75, estimatedDays: 2 },
      ],
    },
    catalog: [
      {
        sku: "PAS-SEA-M",
        nameAr: "قميص كاجوال صيفي",
        nameEn: "Summer Casual Shirt",
        descriptionAr: "قميص خفيف مناسب للخروج اليومي والهدايا البسيطة.",
        category: "clothing",
        price: 210,
        stock: 20,
        tags: ["shirt", "casual", "gift", "summer"],
      },
      {
        sku: "DRS-001",
        nameAr: "فستان بسيط شيك",
        nameEn: "Simple Elegant Dress",
        descriptionAr: "فستان خفيف للمناسبات البسيطة والخروجات.",
        category: "clothing",
        price: 480,
        stock: 12,
        tags: ["dress", "gift", "elegant"],
      },
      {
        sku: "BAG-001",
        nameAr: "شنطة يد صغيرة",
        nameEn: "Small Handbag",
        descriptionAr: "شنطة مناسبة كهدية عملية وأنيقة.",
        category: "accessories",
        price: 350,
        stock: 15,
        tags: ["bag", "gift", "accessory"],
      },
    ],
    kb: [
      {
        sourceType: "return_policy",
        title: "سياسة الاسترجاع والاستبدال",
        content:
          "الاستبدال متاح خلال 14 يوم من الاستلام إذا المنتج بحالته الأصلية وبالفاتورة أو رقم الطلب. الاسترجاع يتم حسب حالة المنتج وطريقة الدفع بعد مراجعة الطلب.",
        tags: ["returns", "exchange", "policy"],
      },
      {
        sourceType: "delivery_cities",
        title: "التوصيل",
        content:
          "التوصيل متاح للقاهرة والجيزة والإسكندرية. القاهرة والجيزة غالباً خلال 24 ساعة، والإسكندرية خلال يومين عمل.",
        tags: ["delivery"],
      },
      {
        sourceType: "opener_bank",
        title: "نبرة الرد",
        content:
          "استخدم ردود قصيرة ودافية بالمصري. للتحية: وعليكم السلام، إزيك؟ للمشكلة: حقك عليا، احكيلي حصل إيه. للترشيح: نختارها سوا.",
        tags: ["tone"],
      },
      {
        sourceType: "escalation_policy",
        title: "سياسة الشكاوى",
        content:
          "إذا العميل طلب مسؤول ولا يوجد وكيل بشري متاح، لا تعد بتحويله. رد كأنك الشخص الموجود معه الآن واسأله عن تفاصيل المشكلة.",
        tags: ["complaint", "handoff"],
      },
    ],
    playbook: {
      slotGraph: [
        { key: "need_or_occasion", required: true },
        { key: "style", required: false },
        { key: "budget", required: false },
        { key: "size_or_variant", required: false },
        { key: "city", required: true },
        { key: "payment", required: true },
      ],
      constraintDims: ["budget", "stock", "delivery_window"],
      nextQuestionTemplates: {
        need_or_occasion: "بتدور على حاجة لنفسك ولا هدية؟",
        style: "تحب الستايل كاجوال ولا شيك أكتر؟",
        budget: "تحب الميزانية في حدود كام؟",
        city: "التوصيل لأي مدينة؟",
        payment: "تحب الدفع كاش ولا تحويل؟",
      },
      intentExamples: {
        greeting: ["السلام عليكم"],
        browsing: ["عايز هدية ومش عارف أختار"],
        asking_question: ["هل يوجد استرجاع أو استبدال؟"],
        off_topic: ["مين أفضل لاعب كرة في التاريخ؟"],
      },
      slotExtractors: {},
    },
  },
  {
    id: "merchant-a64aef2d",
    name: "مرسم اللوحات المخصصة",
    config: {
      brandName: "مرسم اللوحات المخصصة",
      tone: "warm",
      language: "ar-EG",
      locale: "ar-EG",
      cadence: {
        dialect: "egyptian",
        warmth: 0.8,
        emoji_budget: 1,
        signature: "فريق المرسم",
      },
      agent_availability: {
        hours_tz: "Africa/Cairo",
        channels: [],
        backup: "none",
      },
      constraint_quality_terms: ["فوتوريال", "واقعي جداً", "تفاصيل دقيقة"],
    },
    deliveryRules: {
      defaultFee: 80,
      freeDeliveryThreshold: 5000,
      deliveryZones: [
        { zone: "القاهرة", fee: 80, estimatedDays: 1 },
        { zone: "الجيزة", fee: 90, estimatedDays: 1 },
        { zone: "الإسكندرية", fee: 130, estimatedDays: 2 },
      ],
    },
    catalog: [
      {
        sku: "POR-ACR-4050",
        nameAr: "بورتريه أكريليك 40x50",
        nameEn: "Acrylic Portrait 40x50",
        descriptionAr:
          "بورتريه أكريليك مخصص مناسب للهدايا الشخصية، يتحدد السعر النهائي حسب عدد الأشخاص والتفاصيل.",
        category: "custom_art",
        price: 1800,
        stock: 20,
        tags: ["portrait", "acrylic", "custom", "gift"],
        media: [
          {
            url: "https://images.unsplash.com/photo-1579783928621-7a13d66a62d1",
            caption: "مثال بورتريه أكريليك مخصص بتفاصيل هادئة",
          },
        ],
      },
      {
        sku: "ABS-ACR-6090",
        nameAr: "لوحة تجريدية أكريليك 60x90",
        nameEn: "Abstract Acrylic 60x90",
        descriptionAr:
          "لوحة تجريدية حسب الألوان والإحساس المطلوب، مناسبة للمنازل والمكاتب.",
        category: "custom_art",
        price: 2600,
        stock: 20,
        tags: ["abstract", "acrylic", "custom", "decor"],
        media: [
          {
            url: "https://images.unsplash.com/photo-1541961017774-22349e4a1262",
            caption: "مثال لوحة تجريدية بألوان دافئة",
          },
        ],
      },
      {
        sku: "OIL-CUS-70100",
        nameAr: "لوحة زيت 70x100 مخصصة",
        nameEn: "Custom Oil Painting 70x100",
        descriptionAr:
          "لوحة زيتية مخصصة حسب الفكرة أو الصورة المرجعية، مناسبة للبورتريه والمناظر الهادئة.",
        category: "custom_art",
        price: 3200,
        stock: 20,
        tags: ["oil", "custom", "portrait", "landscape"],
        media: [
          {
            url: "https://images.unsplash.com/photo-1578301978018-3005759f48f7",
            caption: "مثال لوحة زيتية مخصصة بمقاس كبير",
          },
        ],
      },
      {
        sku: "WAT-SKT-3040",
        nameAr: "اسكتش مائي 30x40",
        nameEn: "Watercolor Sketch 30x40",
        descriptionAr:
          "اسكتش مائي خفيف مناسب كهدية بسيطة أو تصور أولي لفكرة أكبر.",
        category: "custom_art",
        price: 900,
        stock: 20,
        tags: ["watercolor", "sketch", "gift"],
      },
    ],
    kb: [
      {
        sourceType: "business_summary",
        title: "ملخص المرسم",
        content:
          "المرسم ينفذ لوحات مخصصة حسب الفكرة أو الصورة المرجعية أو الإحساس المطلوب. نساعد العميل يحدد الأسلوب، المقاس، الألوان، الخامة، والموعد المناسب قبل التأكيد.",
        tags: ["summary"],
      },
      {
        sourceType: "supported_styles",
        title: "الأساليب المدعومة",
        content:
          "ندعم البورتريه، الانطباعي، التجريدي، المناظر الطبيعية، الأكريليك، الزيت، المائي، والمكس ميديا. يمكن تنفيذ عمل مستوحى من مرجع بدون نسخ توقيع أو مطابقة غير قانونية.",
        tags: ["styles"],
      },
      {
        sourceType: "infeasibility_guidance",
        title: "الطلبات غير الممكنة",
        content:
          "لا ننفذ نسخة مطابقة 100% من لوحة فنان مشهور مع التوقيع. الطلبات شديدة الواقعية أو المقاسات الكبيرة أو المواعيد القصيرة جداً تحتاج تعديل واحد أو أكثر من: الميعاد، المقاس، مستوى التفاصيل، جودة الصورة الأصلية، أو الميزانية.",
        tags: ["constraints"],
      },
      {
        sourceType: "pricing_guidance",
        title: "التسعير",
        content:
          "التقدير يبدأ من 900 جنيه للاسكتش المائي 30x40، 1800 للبورتريه الأكريليك 40x50، 2600 للتجريدية 60x90، و3200 للوحة الزيت 70x100. السعر النهائي يعتمد على المقاس، عدد الأشخاص، مستوى التفاصيل، الخامة، والموعد.",
        tags: ["pricing"],
      },
      {
        sourceType: "lead_time",
        title: "مدة التنفيذ",
        content:
          "المدة المعتادة من 5 إلى 14 يوم حسب المقاس والتفاصيل والخامة. الطلبات الكبيرة أو الفوتوريالية تحتاج وقت أطول. التسليم خلال ساعات غير مناسب للطلبات الكبيرة أو الصور غير الواضحة.",
        tags: ["time"],
      },
      {
        sourceType: "materials",
        title: "الخامات والمصطلحات",
        content:
          "نستخدم زيت، أكريليك، ألوان مائية، كانفس مشدود، رول كانفس، جيسو، فرش مسطحة ومستديرة، سكين ألوان، وورنيش نهائي مطفي أو لامع. الألوان قد تكون دافئة، باردة، هادئة، أو عالية التباين حسب brief العميل.",
        tags: ["materials"],
      },
      {
        sourceType: "reference_image",
        title: "الصور المرجعية",
        content:
          "إذا لدى العميل صورة مرجعية نستخدمها لفهم الأشخاص، الإحساس، الألوان، والتكوين. إذا الصورة غير واضحة، نطلب صورة أوضح أو نقلل مستوى التفاصيل أو نمد الموعد.",
        tags: ["media", "reference"],
      },
      {
        sourceType: "opener_bank",
        title: "نبرة المرسم",
        content:
          "ردود المرسم تكون مصرية ودافية. عند الحيرة: نرسمها سوا خطوة خطوة. عند الشكوى: أنا معاك، احكيلي اللي حصل. عند الفكرة الفنية: الفكرة واضحة وحلوة، خلينا نثبت أهم تفصيلة.",
        tags: ["tone"],
      },
      {
        sourceType: "escalation_policy",
        title: "سياسة التعامل مع الشكاوى",
        content:
          "إذا العميل يطلب مسؤول ولا يوجد وكيل بشري متاح، لا تعد بتحويله. رد كأنك الشخص الموجود معه الآن، واسأله عن المشكلة أو الصورة أو رقم الطلب لو موجود.",
        tags: ["complaint"],
      },
    ],
    playbook: {
      slotGraph: [
        { key: "brief", required: true },
        { key: "size", required: true },
        { key: "style", required: true },
        { key: "material", required: false },
        { key: "deadline", required: true },
        { key: "budget", required: false },
        { key: "city", required: true },
        { key: "payment", required: true },
      ],
      constraintDims: [
        "deadline",
        "size",
        "quality",
        "source_image_quality",
        "budget",
      ],
      nextQuestionTemplates: {
        brief: "تحب اللوحة عن إيه أو لمين؟",
        size: "في مقاس معين في بالك؟",
        style: "تحبها واقعية، انطباعية، تجريدية، ولا ستايل هادي؟",
        material: "تفضل زيت ولا أكريليك؟",
        deadline: "محتاجها إمتى؟",
        budget: "تحب الميزانية في حدود كام؟",
        city: "التوصيل لأي مدينة؟",
        payment: "تحب الدفع كاش ولا تحويل؟",
      },
      intentExamples: {
        greeting: ["السلام عليكم"],
        browsing: ["أنا مش عارف أختار لوحة مناسبة"],
        custom_request: ["عايز لوحة من فكرة عن بيت قديم وشباك أزرق"],
        media_request: ["عندي صورة مرجعية ينفع؟"],
        infeasible_request: [
          "عايز لوحة فوتوريالية 200x300 تتسلم بعد ساعتين من صورة مش واضحة",
        ],
      },
      slotExtractors: {},
    },
  },
];

async function seedMerchant(client: Client, merchant: MerchantSeed): Promise<void> {
  await client.query(`DELETE FROM merchant_sales_playbooks WHERE merchant_id = $1`, [
    merchant.id,
  ]);
  await client.query(`DELETE FROM merchant_kb_chunks WHERE merchant_id = $1`, [
    merchant.id,
  ]);
  await client.query(
    `DELETE FROM product_media
     WHERE catalog_item_id IN (SELECT id FROM catalog_items WHERE merchant_id = $1)`,
    [merchant.id],
  );
  await client.query(`DELETE FROM catalog_items WHERE merchant_id = $1`, [
    merchant.id,
  ]);

  await client.query(
    `INSERT INTO merchants (
       id, name, category, plan, is_active, currency, language, city, timezone,
       enabled_features, enabled_agents, config, branding, negotiation_rules, delivery_rules
     ) VALUES (
       $1, $2, 'GENERIC', 'PRO', true, 'EGP', 'ar', 'القاهرة', 'Africa/Cairo',
       ARRAY['CONVERSATIONS','ORDERS','CATALOG','VOICE_NOTES','NOTIFICATIONS','INVENTORY','API_ACCESS','WEBHOOKS'],
       ARRAY['OPS_AGENT','INVENTORY_AGENT'],
       $3, '{}', '{}', $4
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       category = EXCLUDED.category,
       plan = EXCLUDED.plan,
       is_active = true,
       currency = EXCLUDED.currency,
       language = EXCLUDED.language,
       city = EXCLUDED.city,
       timezone = EXCLUDED.timezone,
       enabled_features = EXCLUDED.enabled_features,
       enabled_agents = EXCLUDED.enabled_agents,
       config = EXCLUDED.config,
       delivery_rules = EXCLUDED.delivery_rules,
       updated_at = now()`,
    [
      merchant.id,
      merchant.name,
      JSON.stringify(merchant.config),
      JSON.stringify(merchant.deliveryRules),
    ],
  );

  for (const product of merchant.catalog) {
    const catalogItemId = uuidv4();
    await client.query(
      `INSERT INTO catalog_items (
         id, merchant_id, sku, name_ar, name_en, description_ar, description_en,
         base_price, category, stock_quantity, variants, options, tags,
         is_active, is_available
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $6, $7, $8, $9, '[]', '[]', $10, true, $11
       )`,
      [
        catalogItemId,
        merchant.id,
        product.sku,
        product.nameAr,
        product.nameEn,
        product.descriptionAr,
        product.price,
        product.category,
        product.stock,
        product.tags,
        product.stock > 0,
      ],
    );

    for (const [index, media] of (product.media || []).entries()) {
      await client.query(
        `INSERT INTO product_media (
           catalog_item_id, url, caption_ar, display_order, channel_flags,
           send_on, fallback_text, hash
         ) VALUES ($1, $2, $3, $4, $5, 'on_request', $6, $7)`,
        [
          catalogItemId,
          media.url,
          media.caption,
          index,
          JSON.stringify({ whatsapp: true, messenger: true, instagram: true }),
          media.caption,
          `${merchant.id}-${product.sku}-${index}`,
        ],
      );
    }
  }

  for (const entry of merchant.kb) {
    await client.query(
      `INSERT INTO merchant_kb_chunks (
         merchant_id, source_type, source_id, business_type, module, category,
         locale, visibility, confidence_level, tags, title, content, metadata, is_active
       ) VALUES (
         $1, $2, $3, 'generic', 'dialog', $2,
         'ar', 'public', 'high', $4, $5, $6, $7, true
       )`,
      [
        merchant.id,
        entry.sourceType,
        `${merchant.id}:${entry.sourceType}:${entry.title}`,
        entry.tags || [],
        entry.title,
        entry.content,
        JSON.stringify({ seeded: true }),
      ],
    );
  }

  await client.query(
    `INSERT INTO merchant_sales_playbooks (
       merchant_id, slot_graph, constraint_dims, next_question_templates,
       intent_examples, slot_extractors, version
     ) VALUES ($1, $2, $3, $4, $5, $6, 1)
     ON CONFLICT (merchant_id) DO UPDATE SET
       slot_graph = EXCLUDED.slot_graph,
       constraint_dims = EXCLUDED.constraint_dims,
       next_question_templates = EXCLUDED.next_question_templates,
       intent_examples = EXCLUDED.intent_examples,
       slot_extractors = EXCLUDED.slot_extractors,
       version = merchant_sales_playbooks.version + 1,
       updated_at = now()`,
    [
      merchant.id,
      JSON.stringify(merchant.playbook.slotGraph),
      JSON.stringify(merchant.playbook.constraintDims),
      JSON.stringify(merchant.playbook.nextQuestionTemplates),
      JSON.stringify(merchant.playbook.intentExamples),
      JSON.stringify(merchant.playbook.slotExtractors),
    ],
  );
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("BEGIN");
    for (const merchant of merchants) {
      await seedMerchant(client, merchant);
    }
    await client.query("COMMIT");
    console.log(
      `Seeded merchants: ${merchants.map((merchant) => merchant.id).join(", ")}`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("demo/painter seed failed:", error.message);
  process.exit(1);
});
