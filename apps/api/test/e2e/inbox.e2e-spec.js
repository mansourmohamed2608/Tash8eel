"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const supertest_1 = __importDefault(require("supertest"));
const crypto = __importStar(require("crypto"));
const app_module_1 = require("../../src/app.module");
const database_module_1 = require("../../src/infrastructure/database/database.module");
describe("Inbox Controller (e2e)", () => {
    let app;
    let pool;
    const merchantId = "test-merchant-e2e";
    const testApiKey = "tash8eel_test1234567890123456789012345678"; // 40+ chars
    const testApiKeyHash = crypto
        .createHash("sha256")
        .update(testApiKey)
        .digest("hex");
    beforeAll(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new common_1.ValidationPipe({ transform: true, whitelist: true }));
        app.setGlobalPrefix("api");
        await app.init();
        pool = moduleFixture.get(database_module_1.DATABASE_POOL);
        // Create test merchant
        await pool.query(`
      INSERT INTO merchants (id, name, category, api_key, is_active, city, currency, language, daily_token_budget, created_at, updated_at)
      VALUES ($1, 'Test Merchant', 'CLOTHES', 'mk_test', true, 'cairo', 'EGP', 'ar-EG', 100000, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `, [merchantId]);
        // Create API key for the test merchant
        // key_prefix is NOT NULL - use first 10 chars of testApiKey
        const keyPrefix = testApiKey.substring(0, 10);
        await pool.query(`
      INSERT INTO merchant_api_keys (id, merchant_id, key_hash, key_prefix, name, is_active, scopes, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, 'Test API Key', true, ARRAY['read', 'write'], NOW())
      ON CONFLICT DO NOTHING
    `, [merchantId, testApiKeyHash, keyPrefix]);
        // Seed catalog using correct schema: name_ar instead of name, base_price instead of price, is_available instead of is_active
        await pool.query(`
      INSERT INTO catalog_items (id, merchant_id, name_ar, base_price, category, is_available, created_at, updated_at)
      VALUES 
        (gen_random_uuid(), $1, 'تيشيرت أبيض', 150, 'ملابس', true, NOW(), NOW()),
        (gen_random_uuid(), $1, 'بنطلون جينز', 350, 'ملابس', true, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `, [merchantId]);
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
            const response = await (0, supertest_1.default)(app.getHttpServer())
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
            const response = await (0, supertest_1.default)(app.getHttpServer())
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
            await (0, supertest_1.default)(app.getHttpServer())
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
            await (0, supertest_1.default)(app.getHttpServer())
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
            const response1 = await (0, supertest_1.default)(app.getHttpServer())
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
            const response2 = await (0, supertest_1.default)(app.getHttpServer())
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
