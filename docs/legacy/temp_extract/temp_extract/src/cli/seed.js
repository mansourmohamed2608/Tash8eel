#!/usr/bin/env node
"use strict";
/**
 * CLI for seeding demo data
 *
 * Usage:
 *   npx ts-node src/cli/seed.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const uuid_1 = require("uuid");
const DATABASE_URL = process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/operations_agent";
async function main() {
    console.log("🌱 Seeding demo data...\n");
    const pool = new pg_1.Pool({ connectionString: DATABASE_URL });
    try {
        // Create demo merchants
        await seedMerchants(pool);
        // Seed catalog items
        await seedCatalogItems(pool);
        console.log("\n✅ Seeding completed successfully!");
        console.log("\nDemo credentials:");
        console.log("  Merchant ID: demo-clothes");
        console.log("  Merchant ID: demo-food");
        console.log("  Merchant ID: demo-supermarket");
    }
    catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
    finally {
        await pool.end();
    }
}
async function seedMerchants(pool) {
    const merchants = [
        {
            id: "demo-clothes",
            name: "متجر الملابس",
            category: "clothes",
            city: "cairo",
            dailyTokenBudget: 100000,
            defaultDeliveryFee: 30,
        },
        {
            id: "demo-food",
            name: "مطعم البيت",
            category: "food",
            city: "cairo",
            dailyTokenBudget: 50000,
            defaultDeliveryFee: 15,
        },
        {
            id: "demo-supermarket",
            name: "سوبر ماركت الفرحة",
            category: "supermarket",
            city: "alexandria",
            dailyTokenBudget: 80000,
            defaultDeliveryFee: 20,
        },
    ];
    for (const merchant of merchants) {
        await pool.query(`
      INSERT INTO merchants (
        id, name, category, api_key, is_active,
        city, currency, language, daily_token_budget,
        default_delivery_fee, auto_book_delivery, enable_followups,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, true, $5, 'EGP', 'ar-EG', $6, $7, false, true, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        updated_at = NOW()
    `, [
            merchant.id,
            merchant.name,
            merchant.category,
            `mk_${merchant.id.replace("-", "_")}_${(0, uuid_1.v4)().slice(0, 8)}`,
            merchant.city,
            merchant.dailyTokenBudget,
            merchant.defaultDeliveryFee,
        ]);
        console.log(`✅ Created merchant: ${merchant.name} (${merchant.id})`);
    }
}
async function seedCatalogItems(pool) {
    const catalogData = {
        "demo-clothes": [
            { name: "تيشيرت قطن أبيض", price: 150, category: "تيشيرتات", stock: 100 },
            { name: "تيشيرت قطن أسود", price: 150, category: "تيشيرتات", stock: 80 },
            { name: "تيشيرت قطن رمادي", price: 150, category: "تيشيرتات", stock: 60 },
            { name: "بنطلون جينز أزرق", price: 350, category: "بنطلونات", stock: 50 },
            { name: "بنطلون جينز أسود", price: 350, category: "بنطلونات", stock: 40 },
            { name: "قميص كاجوال أبيض", price: 250, category: "قمصان", stock: 60 },
            { name: "قميص كاجوال أزرق", price: 250, category: "قمصان", stock: 45 },
            { name: "شورت رياضي", price: 120, category: "ملابس رياضية", stock: 70 },
            { name: "بلوزة نسائية", price: 180, category: "ملابس حريمي", stock: 55 },
            { name: "فستان صيفي", price: 280, category: "ملابس حريمي", stock: 35 },
        ],
        "demo-food": [
            { name: "شاورما فراخ", price: 45, category: "سندوتشات", stock: 999 },
            { name: "شاورما لحمة", price: 55, category: "سندوتشات", stock: 999 },
            { name: "وجبة شاورما فراخ", price: 85, category: "وجبات", stock: 999 },
            { name: "وجبة شاورما لحمة", price: 95, category: "وجبات", stock: 999 },
            { name: "بيتزا مارجريتا", price: 80, category: "بيتزا", stock: 999 },
            { name: "بيتزا بالفراخ", price: 100, category: "بيتزا", stock: 999 },
            { name: "سلطة خضراء", price: 25, category: "سلطات", stock: 999 },
            { name: "بطاطس محمرة", price: 20, category: "إضافات", stock: 999 },
            { name: "كولا", price: 15, category: "مشروبات", stock: 999 },
            { name: "عصير برتقال", price: 20, category: "مشروبات", stock: 999 },
        ],
        "demo-supermarket": [
            {
                name: "لبن كامل الدسم 1 لتر",
                price: 28,
                category: "ألبان",
                stock: 200,
            },
            { name: "جبنة فيتا 500 جم", price: 65, category: "ألبان", stock: 100 },
            { name: "زبدة 200 جم", price: 45, category: "ألبان", stock: 80 },
            { name: "أرز بسمتي 1 كيلو", price: 55, category: "بقالة", stock: 150 },
            { name: "مكرونة 500 جم", price: 18, category: "بقالة", stock: 200 },
            { name: "زيت ذرة 1 لتر", price: 85, category: "بقالة", stock: 100 },
            { name: "سكر 1 كيلو", price: 35, category: "بقالة", stock: 180 },
            { name: "شاي 100 كيس", price: 45, category: "مشروبات", stock: 120 },
            {
                name: "مياه معدنية 1.5 لتر",
                price: 8,
                category: "مشروبات",
                stock: 300,
            },
            { name: "خبز بلدي", price: 5, category: "مخبوزات", stock: 500 },
        ],
    };
    for (const [merchantId, items] of Object.entries(catalogData)) {
        for (const item of items) {
            await pool.query(`
        INSERT INTO catalog_items (
          id, merchant_id, name, price, category, stock, is_active,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
        ON CONFLICT (merchant_id, name) DO UPDATE SET
          price = EXCLUDED.price,
          stock = EXCLUDED.stock,
          updated_at = NOW()
      `, [
                (0, uuid_1.v4)(),
                merchantId,
                item.name,
                item.price,
                item.category,
                item.stock,
            ]);
        }
        console.log(`✅ Seeded ${items.length} catalog items for ${merchantId}`);
    }
}
main();
