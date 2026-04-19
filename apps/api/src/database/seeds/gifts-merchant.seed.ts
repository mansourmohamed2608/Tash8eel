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

interface GiftProduct {
  sku: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  category: string;
  price: number;
  tags: string[];
  media?: Array<{ url: string; caption: string }>;
}

const merchantId = "hadaya-wa-otoor";

const products: GiftProduct[] = [
  {
    sku: "PER-OUD-100",
    nameAr: "عطر عود شرقي 100 مل",
    nameEn: "Oriental Oud Perfume 100ml",
    descriptionAr: "عطر شرقي ثابت بنفحات عود وخشب، مناسب للهدايا الرسمية.",
    category: "perfume",
    price: 1450,
    tags: ["oud", "oriental", "him", "unisex", "gift"],
    media: [
      {
        url: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539",
        caption: "عطر عود شرقي 100 مل - اختيار أنيق للهدايا الرسمية",
      },
      {
        url: "https://images.unsplash.com/photo-1541643600914-78b084683601",
        caption: "العبوة الخارجية لعطر العود الشرقي",
      },
      {
        url: "https://images.unsplash.com/photo-1523293182086-7651a899d37f",
        caption: "ستايل عطر شرقي بنفحات خشبية دافئة",
      },
    ],
  },
  {
    sku: "PER-FLR-50",
    nameAr: "عطر فلورال ناعم 50 مل",
    nameEn: "Soft Floral Perfume 50ml",
    descriptionAr: "رائحة ورد وفانيليا خفيفة، مناسبة لهدية رقيقة.",
    category: "perfume",
    price: 850,
    tags: ["floral", "her", "soft", "gift"],
    media: [
      {
        url: "https://images.unsplash.com/photo-1590736704728-f4730bb30770",
        caption: "عطر فلورال ناعم 50 مل - رائحة ورد وفانيليا",
      },
      {
        url: "https://images.unsplash.com/photo-1595425964071-2c1ec1f16a4f",
        caption: "تفاصيل زجاجة العطر الفلورال",
      },
      {
        url: "https://images.unsplash.com/photo-1587017539504-67cfbddac569",
        caption: "اختيار مناسب لهدية رقيقة وبسيطة",
      },
    ],
  },
  {
    sku: "PER-CIT-100",
    nameAr: "عطر حمضي منعش 100 مل",
    nameEn: "Fresh Citrus Perfume 100ml",
    descriptionAr: "حمضي ومنعش للاستخدام اليومي، مناسب للجنسين.",
    category: "perfume",
    price: 1200,
    tags: ["citrus", "fresh", "unisex"],
  },
  {
    sku: "PER-WDY-100",
    nameAr: "عطر وودي كلاسيك 100 مل",
    nameEn: "Classic Woody Perfume 100ml",
    descriptionAr: "خشبي دافئ بثبات عالي، مناسب لهدية رجالي.",
    category: "perfume",
    price: 1350,
    tags: ["woody", "him", "classic"],
  },
  {
    sku: "BSK-MOM-01",
    nameAr: "بوكس هدية للأم",
    nameEn: "Gift Basket for Mom",
    descriptionAr: "بوكس فيه عطر صغير، شوكولاتة، كارت إهداء، وتغليف ورد.",
    category: "gift_basket",
    price: 1100,
    tags: ["mother", "basket", "chocolate", "card"],
    media: [
      {
        url: "https://images.unsplash.com/photo-1513201099705-a9746e1e201f",
        caption: "بوكس هدية للأم بتغليف ورد وكارت إهداء",
      },
      {
        url: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48",
        caption: "تفاصيل محتويات البوكس: عطر صغير وشوكولاتة",
      },
      {
        url: "https://images.unsplash.com/photo-1512909006721-3d6018887383",
        caption: "شكل التغليف النهائي للهدية",
      },
    ],
  },
  {
    sku: "BSK-LUX-01",
    nameAr: "بوكس فاخر بالعطر والتمر",
    nameEn: "Luxury Perfume and Dates Basket",
    descriptionAr: "بوكس فاخر فيه عطر 100 مل، تمر محشي، شمعة، وكارت.",
    category: "gift_basket",
    price: 2100,
    tags: ["luxury", "dates", "candle", "basket"],
  },
  {
    sku: "BSK-BDAY-01",
    nameAr: "بوكس عيد ميلاد",
    nameEn: "Birthday Gift Basket",
    descriptionAr: "بوكس عيد ميلاد فيه شوكولاتة، كارت، وشريط تهنئة.",
    category: "gift_basket",
    price: 750,
    tags: ["birthday", "basket", "chocolate"],
  },
  {
    sku: "ADD-WRAP-01",
    nameAr: "تغليف فاخر",
    nameEn: "Premium Wrapping",
    descriptionAr: "تغليف فاخر بألوان هادئة مع شريط وكارت صغير.",
    category: "addon",
    price: 120,
    tags: ["wrap", "addon"],
  },
  {
    sku: "ADD-CARD-01",
    nameAr: "كارت إهداء مكتوب",
    nameEn: "Written Gift Card",
    descriptionAr: "كارت إهداء برسالة قصيرة يكتبها العميل.",
    category: "addon",
    price: 60,
    tags: ["card", "addon", "personalization"],
  },
  {
    sku: "ADD-ENG-01",
    nameAr: "حفر اسم على علبة الهدية",
    nameEn: "Name Engraving",
    descriptionAr: "حفر اسم بسيط على علبة الهدية، يحتاج 48 ساعة على الأقل.",
    category: "addon",
    price: 180,
    tags: ["engraving", "personalization", "48h"],
  },
  {
    sku: "PER-MINI-SET",
    nameAr: "طقم عطور ميني",
    nameEn: "Mini Perfume Set",
    descriptionAr: "ثلاث عطور صغيرة لتجربة روائح مختلفة.",
    category: "perfume",
    price: 680,
    tags: ["mini", "set", "gift"],
  },
  {
    sku: "GFT-VCH-500",
    nameAr: "كارت هدية 500 جنيه",
    nameEn: "Gift Card 500 EGP",
    descriptionAr: "كارت هدية بقيمة 500 جنيه يستخدم في المتجر.",
    category: "gift_card",
    price: 500,
    tags: ["gift_card"],
  },
];

async function seed(): Promise<void> {
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
    await client.query(`DELETE FROM merchants WHERE id = $1`, [merchantId]);

    await client.query(
      `INSERT INTO merchants (
         id, name, category, plan, is_active, currency, language, city, timezone,
         enabled_features, enabled_agents, config, branding, negotiation_rules, delivery_rules
       ) VALUES (
         $1, $2, 'GENERIC', 'PRO', true, 'EGP', 'ar', 'القاهرة', 'Africa/Cairo',
         ARRAY['CONVERSATIONS','ORDERS','CATALOG','VOICE_NOTES','NOTIFICATIONS','INVENTORY','API_ACCESS','WEBHOOKS'],
         ARRAY['OPS_AGENT','INVENTORY_AGENT'],
         $3, '{}', '{}', $4
       )`,
      [
        merchantId,
        "هدايا وعطور",
        JSON.stringify({
          brandName: "هدايا وعطور",
          tone: "warm",
          language: "ar-EG",
          locale: "ar-EG",
          cadence: {
            dialect: "egyptian",
            warmth: 0.7,
            emoji_budget: 1,
            signature: "فريق هدايا وعطور",
          },
          agent_availability: {
            hours_tz: "Africa/Cairo",
            channels: [],
            backup: "none",
          },
        }),
        JSON.stringify({
          defaultFee: 45,
          freeDeliveryThreshold: 1800,
          deliveryZones: [
            { zone: "القاهرة", fee: 45, estimatedDays: 1 },
            { zone: "الجيزة", fee: 55, estimatedDays: 1 },
            { zone: "الإسكندرية", fee: 75, estimatedDays: 2 },
          ],
        }),
      ],
    );

    const catalogIds: Record<string, string> = {};
    for (const product of products) {
      const id = uuidv4();
      catalogIds[product.sku] = id;
      await client.query(
        `INSERT INTO catalog_items (
           id, merchant_id, sku, name_ar, name_en, description_ar, description_en,
           base_price, category, stock_quantity, variants, options, tags,
           is_active, is_available
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $6, $7, $8, 20, $9, '[]', $10, true, true
         )`,
        [
          id,
          merchantId,
          product.sku,
          product.nameAr,
          product.nameEn,
          product.descriptionAr,
          product.price,
          product.category,
          JSON.stringify(
            product.category === "perfume"
              ? [{ name: "size", values: ["50ml", "100ml"] }]
              : [],
          ),
          product.tags,
        ],
      );

      for (const [index, media] of (product.media || []).entries()) {
        await client.query(
          `INSERT INTO product_media (
             catalog_item_id, url, caption_ar, display_order, channel_flags,
             send_on, fallback_text, hash
           ) VALUES ($1, $2, $3, $4, $5, 'on_request', $6, $7)`,
          [
            id,
            media.url,
            media.caption,
            index,
            JSON.stringify({ whatsapp: true, messenger: true, instagram: true }),
            media.caption,
            `${product.sku}-${index}`,
          ],
        );
      }
    }

    await client.query(
      `INSERT INTO merchant_sales_playbooks (
         merchant_id, slot_graph, constraint_dims, next_question_templates,
         intent_examples, slot_extractors, version
       ) VALUES ($1, $2, $3, $4, $5, $6, 1)`,
      [
        merchantId,
        JSON.stringify([
          { key: "occasion", required: true },
          { key: "recipient", required: true },
          {
            key: "fragrance_family",
            required: false,
            when: { category: "perfume" },
          },
          { key: "budget", required: true },
          { key: "wrap_or_basket", required: true },
          { key: "city", required: true },
          { key: "payment", required: true },
        ]),
        JSON.stringify([
          "budget",
          "date",
          "personalization",
          "stock",
          "delivery_window",
        ]),
        JSON.stringify({
          occasion: "الهدية لمناسبة إيه؟",
          recipient: "الهدية لمين؟",
          fragrance_family: "بتفضل رائحة عود، فلورال، حمضي، ولا وودي؟",
          budget: "تحب الميزانية في حدود كام؟",
          wrap_or_basket: "تحبها تغليف بسيط ولا بوكس كامل؟",
          city: "التوصيل لأي مدينة؟",
          payment: "تحب الدفع كاش عند الاستلام ولا تحويل؟",
        }),
        JSON.stringify({
          greeting: ["السلام عليكم", "صباح الخير"],
          browsing: ["عايز هدية لأمي ومش عارف أختار"],
          custom_request: ["عايز بوكس مخصوص فيه عطر وشوكولاتة"],
          infeasible_request: ["عايز حفر اسم ويتسلم النهارده"],
          media_request: ["ممكن تبعتلي صورة العطر ده؟"],
        }),
        JSON.stringify({
          budget: ["تحت\\s*(\\d+)", "ميزانية\\s*(\\d+)"],
          city: ["القاهرة", "الجيزة", "الإسكندرية"],
        }),
      ],
    );

    const chunks = [
      {
        type: "escalation_policy",
        id: "default",
        title: "سياسة التصعيد",
        content:
          "لا تعد العميل بتحويل بشري إلا لو توجد قناة بشرية مفعلة. في الاختبار backup=none، لذلك رد كشخص من الفريق موجود معه الآن. التصعيد الداخلي فقط للطلبات أعلى من 2000 جنيه أو الحفر المخصص أو تكرار الشكوى مرتين.",
      },
      {
        type: "infeasibility_guidance",
        id: "default",
        title: "قيود الطلبات المخصصة",
        content:
          "الحفر على علبة الهدية يحتاج 48 ساعة على الأقل. لا يوجد تركيب عطر مخصص من الصفر. التغليف الشخصي خارج المدن المخدومة غير متاح.",
      },
      {
        type: "opener_bank",
        id: "default",
        title: "افتتاحيات المتجر",
        content:
          "عيد ميلاد: نختار حاجة تفرحها وتبان شخصية. عيد: نخليها هدية دافئة ومرتبة. عزاء أو مناسبة حساسة: نرد بهدوء واحترام. عام: معاك، نختارها خطوة خطوة.",
      },
      {
        type: "delivery_cities",
        id: "default",
        title: "مدن التوصيل",
        content:
          "التوصيل متاح في القاهرة والجيزة خلال يوم، والإسكندرية خلال يومين. المدن الأخرى تحتاج تأكيد قبل الطلب.",
      },
      {
        type: "payment_methods",
        id: "default",
        title: "طرق الدفع",
        content:
          "الدفع متاح كاش عند الاستلام أو تحويل فودافون كاش. لا يوجد دفع ببطاقات هدايا خارجية.",
      },
      {
        type: "return_policy",
        id: "default",
        title: "سياسة الاستبدال",
        content:
          "يمكن استبدال المنتج خلال 14 يوم إذا كان غير مستخدم وبحالته الأصلية. العطور المفتوحة والهدايا الشخصية أو المحفورة لا تُستبدل إلا لو فيها عيب واضح.",
      },
    ];

    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO merchant_kb_chunks (
           merchant_id, source_type, source_id, locale, visibility,
           confidence_level, tags, title, content, metadata, is_active
         ) VALUES ($1, $2, $3, 'ar-EG', 'public', 'high', $4, $5, $6, $7, true)`,
        [
          merchantId,
          chunk.type,
          chunk.id,
          [chunk.type],
          chunk.title,
          chunk.content,
          JSON.stringify({ seeded: true }),
        ],
      );
    }

    await client.query("COMMIT");
    console.log(`✅ Seeded gifts/perfume merchant: ${merchantId}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error("❌ gifts merchant seed failed:", error.message);
  process.exit(1);
});
