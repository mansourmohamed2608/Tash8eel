import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { Pool } from 'pg';
import { AppModule } from '../../src/app.module';
import { DATABASE_POOL } from '../../src/infrastructure/database/database.module';

describe('Inbox Controller (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const merchantId = 'test-merchant-e2e';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.setGlobalPrefix('api');
    await app.init();

    pool = moduleFixture.get<Pool>(DATABASE_POOL);

    // Create test merchant
    await pool.query(`
      INSERT INTO merchants (id, name, category, api_key, is_active, city, currency, language, daily_token_budget, created_at, updated_at)
      VALUES ($1, 'Test Merchant', 'clothes', 'mk_test', true, 'cairo', 'EGP', 'ar-EG', 100000, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `, [merchantId]);

    // Seed catalog
    await pool.query(`
      INSERT INTO catalog_items (id, merchant_id, name, price, category, is_active, created_at, updated_at)
      VALUES 
        (gen_random_uuid(), $1, 'تيشيرت أبيض', 150, 'ملابس', true, NOW(), NOW()),
        (gen_random_uuid(), $1, 'بنطلون جينز', 350, 'ملابس', true, NOW(), NOW())
      ON CONFLICT DO NOTHING
    `, [merchantId]);
  });

  afterAll(async () => {
    // Cleanup test data
    await pool.query('DELETE FROM messages WHERE merchant_id = $1', [merchantId]);
    await pool.query('DELETE FROM orders WHERE merchant_id = $1', [merchantId]);
    await pool.query('DELETE FROM conversations WHERE merchant_id = $1', [merchantId]);
    await pool.query('DELETE FROM customers WHERE merchant_id = $1', [merchantId]);
    await pool.query('DELETE FROM catalog_items WHERE merchant_id = $1', [merchantId]);
    await pool.query('DELETE FROM merchants WHERE id = $1', [merchantId]);
    
    await app.close();
  });

  describe('POST /api/v1/inbox/message', () => {
    it('should process a greeting message', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/inbox/message')
        .send({
          merchantId,
          senderId: 'test-customer-1',
          text: 'السلام عليكم',
        })
        .expect(200);

      expect(response.body).toHaveProperty('conversationId');
      expect(response.body).toHaveProperty('replyText');
      expect(response.body).toHaveProperty('action');
      expect(response.body).toHaveProperty('cart');
    });

    it('should process an order request', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/inbox/message')
        .send({
          merchantId,
          senderId: 'test-customer-2',
          text: 'عايز 2 تيشيرت أبيض',
        })
        .expect(200);

      expect(response.body.action).toBeDefined();
      expect(response.body.cart).toBeDefined();
    });

    it('should return 404 for non-existent merchant', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inbox/message')
        .send({
          merchantId: 'non-existent-merchant',
          senderId: 'test-customer',
          text: 'مرحبا',
        })
        .expect(404);
    });

    it('should validate request body', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inbox/message')
        .send({
          merchantId: '',
          senderId: '',
          text: '',
        })
        .expect(400);
    });
  });

  describe('Message continuity', () => {
    const customerId = 'test-customer-continuity';

    it('should maintain conversation context', async () => {
      // First message
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/inbox/message')
        .send({
          merchantId,
          senderId: customerId,
          text: 'عايز تيشيرت',
        })
        .expect(200);

      const conversationId = response1.body.conversationId;

      // Second message in same conversation
      const response2 = await request(app.getHttpServer())
        .post('/api/v1/inbox/message')
        .send({
          merchantId,
          senderId: customerId,
          text: 'لونه أبيض',
        })
        .expect(200);

      expect(response2.body.conversationId).toBe(conversationId);
    });
  });
});
