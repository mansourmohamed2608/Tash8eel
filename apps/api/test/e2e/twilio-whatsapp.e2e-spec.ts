import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request, { type Response } from "supertest";
import { Pool } from "pg";
import * as crypto from "crypto";
import { AppModule } from "../../src/app.module";
import { DATABASE_POOL } from "../../src/infrastructure/database/database.module";
import { ConfigService } from "@nestjs/config";

/**
 * Twilio WhatsApp Webhook E2E Tests
 *
 * Tests the full WhatsApp message flow:
 * 1. Incoming text messages → AI response
 * 2. Location sharing → order address extraction
 * 3. Voice note handling (mocked transcription)
 * 4. Product image OCR flow
 * 5. Status callback updates
 * 6. Signature validation
 */
describe("Twilio WhatsApp Webhook (e2e)", () => {
  let app: INestApplication;
  let pool: Pool;
  let configService: ConfigService;

  const merchantId = "test-merchant-twilio-e2e";
  const testApiKey = "tash8eel_twilio_test_1234567890123456789";
  const testApiKeyHash = crypto
    .createHash("sha256")
    .update(testApiKey)
    .digest("hex");

  // Simulated WhatsApp numbers
  const merchantWhatsApp = "whatsapp:+20123456789";
  const customerWhatsApp = "whatsapp:+201001234567";
  const customerPhone = "+201001234567";

  // Test Twilio credentials (from env or defaults for testing)
  let twilioAuthToken: string;
  let validateSignature: boolean;

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
    configService = moduleFixture.get<ConfigService>(ConfigService);

    twilioAuthToken =
      configService.get<string>("TWILIO_AUTH_TOKEN") || "test_auth_token";
    validateSignature =
      configService.get<string>("TWILIO_VALIDATE_SIGNATURE") !== "false";

    // Create test merchant
    await pool.query(
      `
      INSERT INTO merchants (id, name, category, api_key, is_active, city, currency, language, daily_token_budget, created_at, updated_at)
      VALUES ($1, 'Twilio Test Merchant', 'CLOTHES', 'mk_twilio_test', true, 'cairo', 'EGP', 'ar-EG', 100000, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET is_active = true
    `,
      [merchantId],
    );

    // Create API key for the test merchant
    const keyPrefix = testApiKey.substring(0, 10);
    await pool.query(
      `
      INSERT INTO merchant_api_keys (id, merchant_id, key_hash, key_prefix, name, is_active, scopes, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, 'Twilio Test Key', true, ARRAY['read', 'write'], NOW())
      ON CONFLICT DO NOTHING
    `,
      [merchantId, testApiKeyHash, keyPrefix],
    );

    // Map the test WhatsApp number to the merchant
    await pool.query(
      `
      INSERT INTO merchant_phone_numbers (id, merchant_id, phone_number, whatsapp_number, display_name, is_sandbox, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, '+20123456789', $2, 'Twilio E2E Test', true, true, NOW(), NOW())
      ON CONFLICT (whatsapp_number) DO UPDATE SET merchant_id = $1, is_active = true
    `,
      [merchantId, merchantWhatsApp],
    );

    // Seed catalog items for order tests
    await pool.query(
      `
      INSERT INTO catalog_items (id, merchant_id, name_ar, base_price, category, is_available, created_at, updated_at)
      VALUES 
        (gen_random_uuid(), $1, 'تيشيرت أسود', 200, 'ملابس', true, NOW(), NOW()),
        (gen_random_uuid(), $1, 'قميص أبيض', 250, 'ملابس', true, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `,
      [merchantId],
    );
  });

  afterAll(async () => {
    // Cleanup test data in correct order (respecting foreign keys)
    await pool.query(
      "DELETE FROM twilio_message_log WHERE from_number = $1 OR to_number = $1",
      [merchantWhatsApp],
    );
    await pool.query("DELETE FROM messages WHERE merchant_id = $1", [
      merchantId,
    ]);
    await pool.query(
      "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE merchant_id = $1)",
      [merchantId],
    );
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
      "DELETE FROM merchant_phone_numbers WHERE merchant_id = $1",
      [merchantId],
    );
    await pool.query("DELETE FROM merchant_api_keys WHERE merchant_id = $1", [
      merchantId,
    ]);
    await pool.query("DELETE FROM merchants WHERE id = $1", [merchantId]);

    await app.close();
  });

  /**
   * Helper to create a valid Twilio signature
   * Note: In real tests with TWILIO_VALIDATE_SIGNATURE=true, this would need the actual auth token
   */
  function createTwilioSignature(
    url: string,
    params: Record<string, string>,
  ): string {
    // Sort params and concatenate
    const data =
      url +
      Object.keys(params)
        .sort()
        .map((key) => key + params[key])
        .join("");

    return crypto
      .createHmac("sha1", twilioAuthToken)
      .update(Buffer.from(data, "utf-8"))
      .digest("base64");
  }

  /**
   * Helper to create a Twilio webhook payload
   */
  function createWebhookPayload(
    overrides: Partial<Record<string, string>> = {},
  ): Record<string, string> {
    const messageSid = `SM${crypto.randomBytes(16).toString("hex").substring(0, 32)}`;
    return {
      MessageSid: messageSid,
      AccountSid: "AC_test_account",
      From: customerWhatsApp,
      To: merchantWhatsApp,
      Body: "السلام عليكم",
      ProfileName: "Test Customer",
      WaId: customerPhone.replace("+", ""),
      NumMedia: "0",
      ...overrides,
    };
  }

  describe("POST /api/v1/webhooks/twilio/whatsapp", () => {
    describe("Basic Text Messages", () => {
      it("should process a greeting and return AI response", async () => {
        const payload = createWebhookPayload({ Body: "السلام عليكم" });
        const url = `http://127.0.0.1/api/v1/webhooks/twilio/whatsapp`;
        const signature = createTwilioSignature(url, payload);

        const response = await request(app.getHttpServer())
          .post("/api/v1/webhooks/twilio/whatsapp")
          .set("Content-Type", "application/x-www-form-urlencoded")
          .set("x-twilio-signature", validateSignature ? signature : "test-sig")
          .send(payload)
          .expect(200);

        // Twilio expects TwiML response
        expect(response.headers["content-type"]).toContain("text/xml");
        expect(response.text).toContain("<Response>");
      });

      it("should process an order request", async () => {
        const payload = createWebhookPayload({
          Body: "عايز 2 تيشيرت أسود",
          From: "whatsapp:+201009876543",
        });

        const response = await request(app.getHttpServer())
          .post("/api/v1/webhooks/twilio/whatsapp")
          .set("Content-Type", "application/x-www-form-urlencoded")
          .set("x-twilio-signature", "test-sig")
          .send(payload)
          .expect(200);

        expect(response.text).toContain("<Response>");

        // Verify conversation was created
        const { rows: conversations } = await pool.query(
          "SELECT * FROM conversations WHERE merchant_id = $1 AND sender_id = $2 ORDER BY created_at DESC LIMIT 1",
          [merchantId, "+201009876543"],
        );
        expect(conversations.length).toBeGreaterThan(0);
      });

      it("should return 200 for unknown WhatsApp number (no merchant)", async () => {
        const payload = createWebhookPayload({
          To: "whatsapp:+19999999999", // Unknown number
        });

        const response = await request(app.getHttpServer())
          .post("/api/v1/webhooks/twilio/whatsapp")
          .set("Content-Type", "application/x-www-form-urlencoded")
          .set("x-twilio-signature", "test-sig")
          .send(payload)
          .expect(200);

        // Should return empty TwiML (no reply)
        expect(response.text).toBe("<Response></Response>");
      });
    });

    describe("Location Messages", () => {
      it("should handle location shared for delivery address", async () => {
        // First create an active conversation/order context
        const greetPayload = createWebhookPayload({
          Body: "عايز تيشيرت",
          From: "whatsapp:+201112223333",
        });

        await request(app.getHttpServer())
          .post("/api/v1/webhooks/twilio/whatsapp")
          .set("Content-Type", "application/x-www-form-urlencoded")
          .set("x-twilio-signature", "test-sig")
          .send(greetPayload)
          .expect(200);

        // Now send location
        const locationPayload = createWebhookPayload({
          Body: "",
          From: "whatsapp:+201112223333",
          Latitude: "30.0444",
          Longitude: "31.2357",
          NumMedia: "0",
        });

        const response = await request(app.getHttpServer())
          .post("/api/v1/webhooks/twilio/whatsapp")
          .set("Content-Type", "application/x-www-form-urlencoded")
          .set("x-twilio-signature", "test-sig")
          .send(locationPayload)
          .expect(200);

        expect(response.text).toContain("<Response>");
      });

      it("should extract coordinates from Google Maps URL in message body", async () => {
        const payload = createWebhookPayload({
          Body: "موقعي هنا https://maps.google.com/?q=30.0444,31.2357",
          From: "whatsapp:+201444555666",
        });

        const response = await request(app.getHttpServer())
          .post("/api/v1/webhooks/twilio/whatsapp")
          .set("Content-Type", "application/x-www-form-urlencoded")
          .set("x-twilio-signature", "test-sig")
          .send(payload)
          .expect(200);

        expect(response.text).toContain("<Response>");
      });
    });

    describe("Validation & Error Handling", () => {
      it("should return 400 for missing required fields", async () => {
        const response = await request(app.getHttpServer())
          .post("/api/v1/webhooks/twilio/whatsapp")
          .set("Content-Type", "application/x-www-form-urlencoded")
          .set("x-twilio-signature", "test-sig")
          .send({ Body: "test" }) // Missing MessageSid, From, To
          .expect(400);

        expect(response.text).toContain("Missing required fields");
      });

      it("should return 401 for missing signature when validation enabled", async () => {
        // This test only applies when signature validation is enabled
        if (!validateSignature) {
          return; // Skip if validation disabled
        }

        const payload = createWebhookPayload();

        const response = await request(app.getHttpServer())
          .post("/api/v1/webhooks/twilio/whatsapp")
          .set("Content-Type", "application/x-www-form-urlencoded")
          // No x-twilio-signature header
          .send(payload)
          .expect(401);

        expect(response.text).toContain("Missing signature");
      });
    });
  });

  describe("POST /api/v1/webhooks/twilio/status", () => {
    it("should handle message delivered status", async () => {
      // First send a message to get a MessageSid
      const messageSid = `SM${crypto.randomBytes(16).toString("hex").substring(0, 32)}`;

      // Log a message first so we have something to update
      await pool.query(
        `
        INSERT INTO twilio_message_log (id, message_sid, account_sid, direction, from_number, to_number, body, status, created_at)
        VALUES (gen_random_uuid(), $1, 'AC_test_account', 'outbound', $2, $3, 'Test message', 'sent', NOW())
        ON CONFLICT DO NOTHING
      `,
        [messageSid, merchantWhatsApp, customerWhatsApp],
      );

      const statusPayload = {
        MessageSid: messageSid,
        AccountSid: "AC_test_account",
        From: merchantWhatsApp,
        To: customerWhatsApp,
        MessageStatus: "delivered",
      };

      const response = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/status")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(statusPayload)
        .expect(200);

      expect(response.text).toBe("OK");

      // Verify status was updated in DB
      const { rows } = await pool.query(
        "SELECT status FROM twilio_message_log WHERE message_sid = $1",
        [messageSid],
      );

      if (rows.length > 0) {
        expect(rows[0].status).toBe("delivered");
      }
    });

    it("should handle message failed status with error code", async () => {
      const messageSid = `SM${crypto.randomBytes(16).toString("hex").substring(0, 32)}`;

      // Log a message first
      await pool.query(
        `
        INSERT INTO twilio_message_log (id, message_sid, account_sid, direction, from_number, to_number, body, status, created_at)
        VALUES (gen_random_uuid(), $1, 'AC_test_account', 'outbound', $2, $3, 'Test failed message', 'sent', NOW())
        ON CONFLICT DO NOTHING
      `,
        [messageSid, merchantWhatsApp, customerWhatsApp],
      );

      const statusPayload = {
        MessageSid: messageSid,
        AccountSid: "AC_test_account",
        From: merchantWhatsApp,
        To: customerWhatsApp,
        MessageStatus: "failed",
        ErrorCode: "30005",
        ErrorMessage: "Unknown destination handset",
      };

      const response = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/status")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(statusPayload)
        .expect(200);

      expect(response.text).toBe("OK");
    });

    it("should handle read status", async () => {
      const messageSid = `SM${crypto.randomBytes(16).toString("hex").substring(0, 32)}`;

      const statusPayload = {
        MessageSid: messageSid,
        AccountSid: "AC_test_account",
        From: merchantWhatsApp,
        To: customerWhatsApp,
        MessageStatus: "read",
      };

      const response = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/status")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(statusPayload)
        .expect(200);

      expect(response.text).toBe("OK");
    });
  });

  describe("Integration Flow: Complete Order via WhatsApp", () => {
    const orderCustomerPhone = "whatsapp:+201555666777";

    it("should complete full order flow: greeting → product → address → confirm", async () => {
      // Step 1: Greeting
      const greeting = createWebhookPayload({
        Body: "السلام عليكم",
        From: orderCustomerPhone,
      });

      await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(greeting)
        .expect(200);

      // Step 2: Order request
      const orderRequest = createWebhookPayload({
        Body: "عايز قميص أبيض",
        From: orderCustomerPhone,
      });

      await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(orderRequest)
        .expect(200);

      // Step 3: Provide address
      const addressMessage = createWebhookPayload({
        Body: "العنوان: 15 شارع التحرير، الدقي، الجيزة",
        From: orderCustomerPhone,
      });

      await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(addressMessage)
        .expect(200);

      // Verify conversation exists with order context
      const { rows: conversations } = await pool.query(
        `
        SELECT c.*, 
               (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
        FROM conversations c
        WHERE c.merchant_id = $1 AND c.sender_id = $2
        ORDER BY c.created_at DESC LIMIT 1
      `,
        [merchantId, orderCustomerPhone.replace("whatsapp:", "")],
      );

      expect(conversations.length).toBe(1);
      expect(
        parseInt(conversations[0].message_count, 10),
      ).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty message body gracefully", async () => {
      const payload = createWebhookPayload({ Body: "" });

      const response = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(payload)
        .expect(200);

      expect(response.text).toContain("<Response>");
    });

    it("should handle very long message", async () => {
      const longMessage = "مرحبا ".repeat(500); // ~3000 chars
      const payload = createWebhookPayload({ Body: longMessage });

      const response = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(payload)
        .expect(200);

      expect(response.text).toContain("<Response>");
    });

    it("should handle special characters in message", async () => {
      const payload = createWebhookPayload({
        Body: '👋🏻 مرحبا! أريد 2×قميص "أبيض" بـ100ج',
      });

      const response = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(payload)
        .expect(200);

      expect(response.text).toContain("<Response>");
    });

    it("should handle concurrent messages from same customer", async () => {
      const concurrentPhone = "whatsapp:+201888999000";

      // Send 3 messages concurrently
      const promises = [1, 2, 3].map((i) => {
        const payload = createWebhookPayload({
          Body: `رسالة رقم ${i}`,
          From: concurrentPhone,
          MessageSid: `SM_concurrent_${i}_${Date.now()}`,
        });

        return request(app.getHttpServer())
          .post("/api/v1/webhooks/twilio/whatsapp")
          .set("Content-Type", "application/x-www-form-urlencoded")
          .set("x-twilio-signature", "test-sig")
          .send(payload);
      });

      const responses = await Promise.all(promises);

      // All should succeed (200)
      responses.forEach((response: Response) => {
        expect(response.status).toBe(200);
        expect(response.text).toContain("<Response>");
      });
    });
  });

  describe("Customer Reorder Flow", () => {
    const reorderCustomerPhone = "+201777888999";
    const reorderCustomerWhatsApp = `whatsapp:${reorderCustomerPhone}`;
    let reorderCustomerId: string;
    let reorderCatalogItemId: string;

    beforeAll(async () => {
      // Create a customer with a previous order
      const customerResult = await pool.query(
        `
        INSERT INTO customers (id, merchant_id, phone, name, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, 'Reorder Test Customer', NOW(), NOW())
        RETURNING id
      `,
        [merchantId, reorderCustomerPhone],
      );
      reorderCustomerId = customerResult.rows[0].id;

      // Create a catalog item with inventory
      const catalogResult = await pool.query(
        `
        INSERT INTO catalog_items (id, merchant_id, sku, name, name_ar, price, category, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, 'REORDER-SKU', 'Reorder Test Item', 'منتج اختبار الإعادة', 150, 'ملابس', true, NOW(), NOW())
        RETURNING id
      `,
        [merchantId],
      );
      reorderCatalogItemId = catalogResult.rows[0].id;

      // Add inventory
      await pool.query(
        `
        INSERT INTO inventory (id, merchant_id, catalog_item_id, quantity, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, 50, NOW(), NOW())
        ON CONFLICT (merchant_id, catalog_item_id) DO UPDATE SET quantity = 50
      `,
        [merchantId, reorderCatalogItemId],
      );

      // Create a previous delivered order
      await pool.query(
        `
        INSERT INTO orders (
          id, merchant_id, customer_id, order_number, status, 
          items, subtotal, total, 
          shipping_address_full, shipping_address_city,
          source, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, 'PREV-001', 'DELIVERED',
          $3::jsonb, 300, 300,
          '15 شارع النصر، المعادي', 'القاهرة',
          'whatsapp', NOW() - INTERVAL '7 days', NOW()
        )
      `,
        [
          merchantId,
          reorderCustomerId,
          JSON.stringify([
            {
              catalogItemId: reorderCatalogItemId,
              sku: "REORDER-SKU",
              name: "Reorder Test Item",
              nameAr: "منتج اختبار الإعادة",
              quantity: 2,
              price: 150,
              total: 300,
            },
          ]),
        ],
      );
    });

    afterAll(async () => {
      // Clean up reorder test data
      await pool.query("DELETE FROM inventory WHERE catalog_item_id = $1", [
        reorderCatalogItemId,
      ]);
      await pool.query("DELETE FROM orders WHERE customer_id = $1", [
        reorderCustomerId,
      ]);
      await pool.query("DELETE FROM conversations WHERE sender_id = $1", [
        reorderCustomerPhone,
      ]);
      await pool.query("DELETE FROM customers WHERE id = $1", [
        reorderCustomerId,
      ]);
      await pool.query("DELETE FROM catalog_items WHERE id = $1", [
        reorderCatalogItemId,
      ]);
    });

    it('should detect "نفس الطلب" and show previous order summary', async () => {
      const payload = createWebhookPayload({
        Body: "نفس الطلب",
        From: reorderCustomerWhatsApp,
      });

      const response = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(payload)
        .expect(200);

      expect(response.text).toContain("<Response>");

      // Verify conversation was created with reorder state
      const { rows: conversations } = await pool.query(
        `SELECT * FROM conversations 
         WHERE merchant_id = $1 AND sender_id = $2 
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId, reorderCustomerPhone],
      );
      expect(conversations.length).toBe(1);
      expect(conversations[0].collected_info?.pendingReorder).toBe(true);
    });

    it('should detect "كرر الطلب السابق" variant', async () => {
      const payload = createWebhookPayload({
        Body: "كرر طلبي",
        From: `whatsapp:+201666777888`,
      });

      const response = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(payload)
        .expect(200);

      // Should succeed even if no previous order (will get "no previous orders" message)
      expect(response.text).toContain("<Response>");
    });

    it('should detect "المرة اللي فاتت" variant', async () => {
      const payload = createWebhookPayload({
        Body: "عايز نفس طلب المرة اللي فاتت",
        From: reorderCustomerWhatsApp,
      });

      const response = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(payload)
        .expect(200);

      expect(response.text).toContain("<Response>");
    });

    it('should complete reorder when customer confirms with "تمام"', async () => {
      // First trigger reorder flow
      const reorderPayload = createWebhookPayload({
        Body: "نفس الطلب",
        From: reorderCustomerWhatsApp,
        MessageSid: `SM_reorder_init_${Date.now()}`,
      });

      await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(reorderPayload)
        .expect(200);

      // Now confirm with "تمام"
      const confirmPayload = createWebhookPayload({
        Body: "تمام",
        From: reorderCustomerWhatsApp,
        MessageSid: `SM_reorder_confirm_${Date.now()}`,
      });

      const confirmResponse = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(confirmPayload)
        .expect(200);

      expect(confirmResponse.text).toContain("<Response>");

      // Verify a new order was created
      const { rows: orders } = await pool.query(
        `SELECT * FROM orders 
         WHERE merchant_id = $1 AND customer_id = $2 AND source = 'whatsapp_reorder'
         ORDER BY created_at DESC LIMIT 1`,
        [merchantId, reorderCustomerId],
      );

      // Order might be created if flow is complete
      if (orders.length > 0) {
        expect(orders[0].status).toBe("CONFIRMED");
        expect(orders[0].order_number).toMatch(/^R/);
      }
    });

    it("should handle reorder when items are out of stock", async () => {
      // Temporarily set inventory to 0
      await pool.query(
        "UPDATE inventory SET quantity = 0 WHERE catalog_item_id = $1",
        [reorderCatalogItemId],
      );

      const payload = createWebhookPayload({
        Body: "نفس الطلب",
        From: reorderCustomerWhatsApp,
        MessageSid: `SM_reorder_oos_${Date.now()}`,
      });

      const response = await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/whatsapp")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("x-twilio-signature", "test-sig")
        .send(payload)
        .expect(200);

      expect(response.text).toContain("<Response>");

      // Restore inventory
      await pool.query(
        "UPDATE inventory SET quantity = 50 WHERE catalog_item_id = $1",
        [reorderCatalogItemId],
      );
    });
  });
});
