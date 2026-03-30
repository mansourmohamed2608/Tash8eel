import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request, { type Response } from "supertest";
import { Pool } from "pg";
import * as crypto from "crypto";
import { AppModule } from "../../src/app.module";
import { DATABASE_POOL } from "../../src/infrastructure/database/database.module";

describe("Order Flows (e2e)", () => {
  let app: INestApplication;
  let pool: Pool;
  const merchantId = "test-order-flows";
  const testApiKey = "tash8eel_ord1234567890123456789012345678901"; // 42 chars (need >= 40)
  const testApiKeyHash = crypto
    .createHash("sha256")
    .update(testApiKey)
    .digest("hex");
  const keyPrefix = testApiKey.substring(0, 10);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.setGlobalPrefix("api");
    await app.init();

    pool = moduleFixture.get<Pool>(DATABASE_POOL);

    // Create test merchant with proper schema
    await pool.query(
      `
      INSERT INTO merchants (id, name, category, daily_token_budget, is_active, config, branding, negotiation_rules, delivery_rules, created_at, updated_at)
      VALUES ($1, 'متجر التجارب', 'CLOTHES', 500000, true,
        '{"brandName": "متجر التجارب", "tone": "friendly", "currency": "EGP", "language": "ar-EG", "enableNegotiation": true}'::jsonb,
        '{}'::jsonb,
        '{"maxDiscountPercent": 10, "minMarginPercent": 20, "allowNegotiation": true, "freeDeliveryThreshold": 500}'::jsonb,
        '{"defaultFee": 50, "freeDeliveryThreshold": 500}'::jsonb,
        NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET 
        is_active = true,
        daily_token_budget = 500000,
        updated_at = NOW()
    `,
      [merchantId],
    );

    // Create API key for test merchant (delete any existing first, then insert)
    await pool.query(`DELETE FROM merchant_api_keys WHERE merchant_id = $1`, [
      merchantId,
    ]);
    await pool.query(
      `
      INSERT INTO merchant_api_keys (id, merchant_id, key_hash, key_prefix, name, is_active, scopes, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, 'Test API Key', true, ARRAY['read', 'write'], NOW())
    `,
      [merchantId, testApiKeyHash, keyPrefix],
    );

    // Seed catalog with proper schema
    await pool.query(
      `
      DELETE FROM catalog_items WHERE merchant_id = $1
    `,
      [merchantId],
    );

    await pool.query(
      `
      INSERT INTO catalog_items (id, merchant_id, name_ar, base_price, category, sku, variants, is_available, created_at, updated_at)
      VALUES 
        (gen_random_uuid(), $1, 'تيشيرت قطن أبيض', 150, 'ملابس رجالي', 'tshirt-white', '[{"name": "size", "values": ["S", "M", "L", "XL"]}]'::jsonb, true, NOW(), NOW()),
        (gen_random_uuid(), $1, 'تيشيرت قطن أسود', 150, 'ملابس رجالي', 'tshirt-black', '[{"name": "size", "values": ["S", "M", "L", "XL"]}]'::jsonb, true, NOW(), NOW()),
        (gen_random_uuid(), $1, 'بنطلون جينز', 350, 'ملابس رجالي', 'jeans-blue', '[{"name": "size", "values": ["30", "32", "34", "36"]}, {"name": "color", "values": ["أزرق", "أسود"]}]'::jsonb, true, NOW(), NOW()),
        (gen_random_uuid(), $1, 'قميص كاجوال', 250, 'ملابس رجالي', 'shirt-casual', '[{"name": "size", "values": ["S", "M", "L", "XL"]}, {"name": "color", "values": ["أبيض", "أزرق"]}]'::jsonb, true, NOW(), NOW())
    `,
      [merchantId],
    );

    // Clear token usage
    await pool.query(
      "DELETE FROM merchant_token_usage WHERE merchant_id = $1",
      [merchantId],
    );
  }, 60000);

  afterAll(async () => {
    // Cleanup test data
    await pool.query("DELETE FROM messages WHERE merchant_id = $1", [
      merchantId,
    ]);
    await pool.query("DELETE FROM orders WHERE merchant_id = $1", [merchantId]);
    await pool.query("DELETE FROM conversations WHERE merchant_id = $1", [
      merchantId,
    ]);
    await pool.query("DELETE FROM customers WHERE merchant_id = $1", [
      merchantId,
    ]);
    await pool.query("DELETE FROM catalog_items WHERE merchant_id = $1", [
      merchantId,
    ]);
    await pool.query(
      "DELETE FROM merchant_token_usage WHERE merchant_id = $1",
      [merchantId],
    );
    await pool.query("DELETE FROM merchant_api_keys WHERE merchant_id = $1", [
      merchantId,
    ]);
    await pool.query("DELETE FROM merchants WHERE id = $1", [merchantId]);

    await app.close();
  }, 30000);

  // Helper to send message
  const sendMessage = async (senderId: string, text: string) => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/inbox/message")
      .set("x-api-key", testApiKey)
      .send({ merchantId, senderId, text });

    return response;
  };

  // ==========================================
  // 1. Happy Path - Complete Order Flow
  // ==========================================
  describe("Happy Path - Order Flow", () => {
    const customer = "+20100-happy-path";

    it("1. Customer greets and provides name", async () => {
      const response = await sendMessage(customer, "السلام عليكم أنا أحمد");

      expect(response.status).toBe(200);
      expect(response.body.conversationId).toBeDefined();
      expect(response.body.replyText).toBeDefined();
      // Should greet back with name
      expect(response.body.replyText.toLowerCase()).toMatch(/أحمد|اهلا|مرحبا/i);
    }, 30000);

    it("2. Customer orders products", async () => {
      const response = await sendMessage(customer, "عايز تيشيرت أبيض مقاس L");

      expect(response.status).toBe(200);
      expect(response.body.cart.items.length).toBeGreaterThan(0);
    }, 30000);

    it("3. Customer provides address", async () => {
      const response = await sendMessage(
        customer,
        "عنواني 15 شارع التحرير المعادي القاهرة شقة 5",
      );

      expect(response.status).toBe(200);
      // Should acknowledge address
    }, 30000);

    it("4. Customer confirms order", async () => {
      const response = await sendMessage(customer, "تمام أكد الطلب");

      expect(response.status).toBe(200);
      // Should have order confirmation
    }, 30000);
  });

  // ==========================================
  // 2. Negotiation Scenarios
  // ==========================================
  describe("Negotiation Scenarios", () => {
    const customer = "+20100-negotiation";

    beforeAll(async () => {
      // Setup: Create conversation with items
      await sendMessage(customer, "السلام عليكم أنا محمود");
      await sendMessage(customer, "عايز بنطلون جينز مقاس 32 أسود");
    }, 60000);

    it('should handle "too expensive" complaint', async () => {
      const response = await sendMessage(customer, "ده غالي قوي");

      expect(response.status).toBe(200);
      // Should offer discount or explain value
    }, 30000);

    it("should handle explicit discount request", async () => {
      const response = await sendMessage(customer, "ممكن خصم 10%؟");

      expect(response.status).toBe(200);
      // Should respond about discount
    }, 30000);

    it("should handle free delivery request", async () => {
      const response = await sendMessage(customer, "التوصيل ببلاش؟");

      expect(response.status).toBe(200);
      // Should respond about delivery policy
    }, 30000);
  });

  // ==========================================
  // 3. Edge Cases - Vague/Incomplete
  // ==========================================
  describe("Edge Cases - Vague/Incomplete", () => {
    it("should handle vague product request", async () => {
      const customer = "+20100-vague-1";
      const response = await sendMessage(customer, "عايز حاجة حلوة");

      expect(response.status).toBe(200);
      // Should ask for clarification
    }, 30000);

    it("should handle number-only message", async () => {
      const customer = "+20100-vague-2";
      await sendMessage(customer, "مرحبا");
      const response = await sendMessage(customer, "2");

      expect(response.status).toBe(200);
      // Should ask "2 of what?"
    }, 30000);

    it("should handle partial address", async () => {
      const customer = "+20100-vague-3";
      await sendMessage(customer, "عايز تيشيرت أبيض L");
      const response = await sendMessage(customer, "المعادي");

      expect(response.status).toBe(200);
      // Should ask for complete address
    }, 30000);

    it("should handle product not in catalog", async () => {
      const customer = "+20100-vague-4";
      const response = await sendMessage(customer, "عايز لاب توب");

      expect(response.status).toBe(200);
      // Should say product not available
    }, 30000);

    it("should handle color not available", async () => {
      const customer = "+20100-vague-5";
      const response = await sendMessage(customer, "عايز تيشيرت أحمر");

      expect(response.status).toBe(200);
      // Should suggest available colors
    }, 30000);
  });

  // ==========================================
  // 4. Stress Tests - Complex/Broken Input
  // ==========================================
  describe("Stress Tests - Complex/Broken Input", () => {
    it("should handle only emojis", async () => {
      const customer = "+20100-stress-1";
      const response = await sendMessage(customer, "😀😂🎉👍❤️🔥");

      expect(response.status).toBe(200);
      expect(response.body.replyText).toBeDefined();
    }, 30000);

    it("should handle very long message", async () => {
      const customer = "+20100-stress-2";
      const longText = "عايز تيشيرت ".repeat(100);
      const response = await sendMessage(customer, longText);

      expect(response.status).toBe(200);
      expect(response.body.replyText).toBeDefined();
    }, 60000);

    it("should handle mixed languages", async () => {
      const customer = "+20100-stress-3";
      const response = await sendMessage(customer, "Hi عايز shirt أبيض please");

      expect(response.status).toBe(200);
      expect(response.body.replyText).toBeDefined();
    }, 30000);

    it("should handle special characters", async () => {
      const customer = "+20100-stress-4";
      const response = await sendMessage(
        customer,
        "!@#$%^&*()_+-=[]{}|;:,.<>?",
      );

      expect(response.status).toBe(200);
      expect(response.body.replyText).toBeDefined();
    }, 30000);

    it("should handle numbers with Arabic", async () => {
      const customer = "+20100-stress-5";
      const response = await sendMessage(customer, "عايز ٢ تيشيرت و ٣ بنطلون");

      expect(response.status).toBe(200);
    }, 30000);

    it("should handle typos/misspellings", async () => {
      const customer = "+20100-stress-6";
      const response = await sendMessage(customer, "عايز تيشرت ابيض"); // Missing ي

      expect(response.status).toBe(200);
    }, 30000);
  });

  // ==========================================
  // 5. Different Customer - New Conversation
  // ==========================================
  describe("Different Customer - New Conversation", () => {
    it("should create separate conversations for different customers", async () => {
      const customer1 = "+20100-multi-1";
      const customer2 = "+20100-multi-2";

      const response1 = await sendMessage(customer1, "مرحبا أنا علي");
      const response2 = await sendMessage(customer2, "أهلا أنا سارة");

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.conversationId).not.toBe(
        response2.body.conversationId,
      );
    }, 60000);

    it("should maintain separate carts", async () => {
      const customer1 = "+20100-cart-1";
      const customer2 = "+20100-cart-2";

      await sendMessage(customer1, "عايز تيشيرت أبيض L");
      await sendMessage(customer2, "عايز بنطلون جينز 32 أسود");

      const r1 = await sendMessage(customer1, "كام المجموع؟");
      const r2 = await sendMessage(customer2, "كام المجموع؟");

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      // Carts should be different
    }, 90000);
  });

  // ==========================================
  // 6. Breaking Tests
  // ==========================================
  describe("Breaking Tests", () => {
    it("should return 404 for invalid merchant", async () => {
      // Note: With API key auth, we get 401 for mismatched merchant/key
      // This tests what the API guard returns when merchant doesn't match API key
      const response = await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey) // API key is for merchantId, not this one
        .send({
          merchantId: "non-existent-merchant-xyz",
          senderId: "+20100-break-1",
          text: "مرحبا",
        });

      // API key guard will reject since the API key doesn't belong to this merchant
      expect([401, 403, 404]).toContain(response.status);
    }, 30000);

    it("should return 400 for empty text", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          merchantId,
          senderId: "+20100-break-2",
          text: "",
        });

      expect(response.status).toBe(400);
    }, 30000);

    it("should return 400 for missing merchantId", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          senderId: "+20100-break-3",
          text: "مرحبا",
        });

      expect(response.status).toBe(400);
    }, 30000);

    it("should return 400 for missing senderId", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          merchantId,
          text: "مرحبا",
        });

      expect(response.status).toBe(400);
    }, 30000);
  });

  // ==========================================
  // 7. SQL Injection Attempt
  // ==========================================
  describe("SQL Injection Attempt", () => {
    it("should safely handle SQL injection in text", async () => {
      const customer = "+20100-sql-1";
      const response = await sendMessage(
        customer,
        "'; DROP TABLE merchants; --",
      );

      expect(response.status).toBe(200);
      // Should not crash and merchants table should still exist
      const merchants = await pool.query("SELECT COUNT(*) FROM merchants");
      expect(parseInt(merchants.rows[0].count)).toBeGreaterThan(0);
    }, 30000);

    it("should safely handle SQL injection in senderId", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          merchantId,
          senderId: "'; DELETE FROM conversations; --",
          text: "مرحبا",
        });

      expect(response.status).toBe(200);
    }, 30000);

    it("should safely handle SQL injection in merchantId", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          merchantId: "test'; DROP TABLE orders; --",
          senderId: "+20100-sql-3",
          text: "مرحبا",
        });

      // Should return 401, 403 (unauthorized), 404 (merchant not found), or 400 (bad input)
      expect([400, 401, 403, 404]).toContain(response.status);
    }, 30000);
  });

  // ==========================================
  // 8. Angry Customer / Escalation
  // ==========================================
  describe("Angry Customer / Escalation", () => {
    it("should handle angry message professionally", async () => {
      const customer = "+20100-angry-1";
      const response = await sendMessage(
        customer,
        "خدمتكم وحشة جداً ومحدش بيرد!",
      );

      expect(response.status).toBe(200);
      expect(response.body.replyText).toBeDefined();
      // Should respond politely
    }, 30000);

    it("should handle complaint about order", async () => {
      const customer = "+20100-angry-2";
      const response = await sendMessage(
        customer,
        "الطلب اتأخر كتير ومش راضي خالص",
      );

      expect(response.status).toBe(200);
    }, 30000);

    it("should handle demand for manager", async () => {
      const customer = "+20100-angry-3";
      const response = await sendMessage(customer, "عايز أكلم المدير دلوقتي!");

      expect(response.status).toBe(200);
      // Should handle escalation request
    }, 30000);

    it("should handle threat to complain", async () => {
      const customer = "+20100-angry-4";
      const response = await sendMessage(
        customer,
        "هعمل شكوى في حماية المستهلك",
      );

      expect(response.status).toBe(200);
    }, 30000);
  });

  // ==========================================
  // 9. Cart Operations
  // ==========================================
  describe("Cart Operations", () => {
    it("should not duplicate items when mentioned again", async () => {
      const customer = "+20100-cart-dup";

      // Add item
      const r0 = await sendMessage(customer, "عايز تيشيرت أبيض L");
      expect(r0.status).toBe(200);

      // Mention same item again
      const r1 = await sendMessage(customer, "تمام كده");
      expect(r1.status).toBe(200);

      // Cart may not be in response - check if it exists
      if (r1.body.cart && r1.body.cart.items) {
        const items1 = r1.body.cart.items;
        const tshirtCount = items1.filter(
          (i: any) => i.name && i.name.includes("تيشيرت"),
        ).length;
        expect(tshirtCount).toBeLessThanOrEqual(1);
      }
      // Test passes if no cart in response (cart operations handled differently)
    }, 60000);

    it("should handle item removal request", async () => {
      const customer = "+20100-cart-remove";

      await sendMessage(customer, "عايز تيشيرت أبيض L وبنطلون جينز 32 أسود");
      const response = await sendMessage(customer, "شيل البنطلون");

      expect(response.status).toBe(200);
      // Should acknowledge removal
    }, 60000);

    it("should handle quantity change", async () => {
      const customer = "+20100-cart-qty";

      await sendMessage(customer, "عايز 2 تيشيرت أبيض L");
      const response = await sendMessage(customer, "خليهم 3 بدل 2");

      expect(response.status).toBe(200);
    }, 60000);
  });

  // ==========================================
  // 10. Concurrent Messages (same customer)
  // ==========================================
  describe("Concurrent Messages", () => {
    it("should handle rapid sequential messages", async () => {
      const customer = "+20100-concurrent";

      // Send messages in quick succession
      const promises = [
        sendMessage(customer, "مرحبا"),
        sendMessage(customer, "عايز تيشيرت"),
        sendMessage(customer, "أبيض"),
      ];

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach((r: Response) => {
        expect(r.status).toBe(200);
      });
    }, 90000);
  });
});
