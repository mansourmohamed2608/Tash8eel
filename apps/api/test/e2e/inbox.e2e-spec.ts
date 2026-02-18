import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { Pool } from "pg";
import * as crypto from "crypto";
import { AppModule } from "../../src/app.module";
import { DATABASE_POOL } from "../../src/infrastructure/database/database.module";

describe("Inbox Controller (e2e)", () => {
  let app: INestApplication;
  let pool: Pool;
  const merchantId = "test-merchant-e2e";
  const testApiKey = "tash8eel_test1234567890123456789012345678"; // 40+ chars
  const testApiKeyHash = crypto
    .createHash("sha256")
    .update(testApiKey)
    .digest("hex");

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

    // Create test merchant
    await pool.query(
      `
      INSERT INTO merchants (id, name, category, api_key, is_active, city, currency, language, daily_token_budget, created_at, updated_at)
      VALUES ($1, 'Test Merchant', 'CLOTHES', 'mk_test', true, 'cairo', 'EGP', 'ar-EG', 100000, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `,
      [merchantId],
    );

    // Create API key for the test merchant
    // key_prefix is NOT NULL - use first 10 chars of testApiKey
    const keyPrefix = testApiKey.substring(0, 10);
    await pool.query(
      `
      INSERT INTO merchant_api_keys (id, merchant_id, key_hash, key_prefix, name, is_active, scopes, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, 'Test API Key', true, ARRAY['read', 'write'], NOW())
      ON CONFLICT DO NOTHING
    `,
      [merchantId, testApiKeyHash, keyPrefix],
    );

    // Seed catalog using correct schema: name_ar instead of name, base_price instead of price, is_available instead of is_active
    await pool.query(
      `
      INSERT INTO catalog_items (id, merchant_id, name_ar, base_price, category, is_available, created_at, updated_at)
      VALUES 
        (gen_random_uuid(), $1, 'تيشيرت أبيض', 150, 'ملابس', true, NOW(), NOW()),
        (gen_random_uuid(), $1, 'بنطلون جينز', 350, 'ملابس', true, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `,
      [merchantId],
    );
  });

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
    await pool.query("DELETE FROM merchant_api_keys WHERE merchant_id = $1", [
      merchantId,
    ]);
    await pool.query("DELETE FROM merchants WHERE id = $1", [merchantId]);

    await app.close();
  });

  describe("POST /api/v1/inbox/message", () => {
    it("should process a greeting message", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          merchantId,
          senderId: "test-customer-1",
          text: "السلام عليكم",
        })
        .expect(200);

      expect(response.body).toHaveProperty("conversationId");
      expect(response.body).toHaveProperty("replyText");
      expect(response.body).toHaveProperty("action");
      expect(response.body).toHaveProperty("cart");
    });

    it("should process an order request", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          merchantId,
          senderId: "test-customer-2",
          text: "عايز 2 تيشيرت أبيض",
        })
        .expect(200);

      expect(response.body.action).toBeDefined();
      expect(response.body.cart).toBeDefined();
    });

    it("should return 403 for non-existent merchant (API key mismatch)", async () => {
      // When API key doesn't match merchant, returns 403 Forbidden
      await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          merchantId: "non-existent-merchant",
          senderId: "test-customer",
          text: "مرحبا",
        })
        .expect(403);
    });

    it("should validate request body", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          merchantId: "",
          senderId: "",
          text: "",
        })
        .expect(400);
    });
  });

  describe("Message continuity", () => {
    const customerId = "test-customer-continuity";

    it("should maintain conversation context", async () => {
      // First message
      const response1 = await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          merchantId,
          senderId: customerId,
          text: "عايز تيشيرت",
        })
        .expect(200);

      const conversationId = response1.body.conversationId;

      // Second message in same conversation
      const response2 = await request(app.getHttpServer())
        .post("/api/v1/inbox/message")
        .set("x-api-key", testApiKey)
        .send({
          merchantId,
          senderId: customerId,
          text: "لونه أبيض",
        })
        .expect(200);

      expect(response2.body.conversationId).toBe(conversationId);
    });
  });
});
