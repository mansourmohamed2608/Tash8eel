import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Pool } from "pg";
import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { DATABASE_POOL } from "../../src/infrastructure/database/database.module";

describe("Foundation hardening flows (e2e)", () => {
  let app: INestApplication;
  let pool: Pool;
  let authToken: string;
  let agentAuthToken: string;
  let noTeamAuthToken: string;

  const merchantId = "test-foundation-hardening";
  const merchantName = "Foundation Hardening Merchant";
  const staffEmail = "owner.foundation.hardening@test.local";
  const noTeamMerchantId = "test-foundation-hardening-no-team";

  let orderId = "";
  let orderNumber = "";

  const authHeader = () => ({ Authorization: `Bearer ${authToken}` });
  const agentAuthHeader = () => ({ Authorization: `Bearer ${agentAuthToken}` });
  const noTeamAuthHeader = () => ({
    Authorization: `Bearer ${noTeamAuthToken}`,
  });

  const jwtSecret =
    process.env.JWT_SECRET || "test_jwt_secret_for_e2e_at_least_32_chars";

  const createStaffToken = (staffId: string, targetMerchantId: string) =>
    jwt.sign({ staffId, merchantId: targetMerchantId }, jwtSecret, {
      expiresIn: "1h",
    });

  const safeDeleteByMerchant = async (
    tableName: string,
    targetMerchantId: string,
  ) => {
    try {
      await pool.query(`DELETE FROM ${tableName} WHERE merchant_id = $1`, [
        targetMerchantId,
      ]);
    } catch (error: any) {
      if (String(error?.code || "") !== "42P01") {
        throw error;
      }
    }
  };

  const ensureFoundationSchema = async () => {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS integration_endpoints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        provider VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'INBOUND_WEBHOOK',
        secret VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_event_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(merchant_id, provider, type)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS integration_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        endpoint_id UUID NOT NULL REFERENCES integration_endpoints(id) ON DELETE CASCADE,
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
        error TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_execution_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        shipment_id UUID,
        event_type VARCHAR(64) NOT NULL,
        source VARCHAR(32) NOT NULL DEFAULT 'system',
        status VARCHAR(32) NOT NULL DEFAULT 'RECORDED',
        event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        correlation_id VARCHAR(128),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_pod_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        shipment_id UUID,
        proof_type VARCHAR(32) NOT NULL DEFAULT 'note',
        proof_url TEXT,
        proof_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        captured_by VARCHAR(64),
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        dispute_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
        disputed_at TIMESTAMPTZ,
        dispute_note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_location_timeline (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        shipment_id UUID,
        latitude DECIMAL(10, 7) NOT NULL,
        longitude DECIMAL(10, 7) NOT NULL,
        accuracy_meters DECIMAL(10, 2),
        speed_kmh DECIMAL(10, 2),
        heading_deg DECIMAL(10, 2),
        source VARCHAR(32) NOT NULL DEFAULT 'driver_app',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_sla_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        shipment_id UUID,
        sla_type VARCHAR(32) NOT NULL,
        status VARCHAR(16) NOT NULL,
        target_at TIMESTAMPTZ,
        observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        minutes_delta INTEGER,
        reason TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS connector_runtime_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        endpoint_id UUID REFERENCES integration_endpoints(id) ON DELETE SET NULL,
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_error TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS connector_runtime_dlq (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        runtime_event_id UUID NOT NULL REFERENCES connector_runtime_events(id) ON DELETE CASCADE,
        endpoint_id UUID REFERENCES integration_endpoints(id) ON DELETE SET NULL,
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        last_error TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        first_failed_at TIMESTAMPTZ,
        moved_to_dlq_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        replayed_at TIMESTAMPTZ,
        replay_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (runtime_event_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS connector_reconciliation_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        endpoint_id UUID REFERENCES integration_endpoints(id) ON DELETE SET NULL,
        scope VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        drift_count INTEGER NOT NULL DEFAULT 0,
        summary JSONB NOT NULL DEFAULT '{}'::jsonb,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_by VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS connector_reconciliation_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES connector_reconciliation_runs(id) ON DELETE CASCADE,
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        entity_type VARCHAR(50) NOT NULL,
        entity_key VARCHAR(255) NOT NULL,
        source_hash TEXT,
        target_hash TEXT,
        drift_type VARCHAR(32) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        resolution_note TEXT,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_org_units (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        parent_id UUID REFERENCES merchant_org_units(id) ON DELETE SET NULL,
        unit_type VARCHAR(16) NOT NULL,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(64) NOT NULL,
        branch_id VARCHAR(64),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (merchant_id, unit_type, code)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_org_policy_bindings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        unit_id UUID NOT NULL REFERENCES merchant_org_units(id) ON DELETE CASCADE,
        policy_key VARCHAR(100) NOT NULL,
        policy_value JSONB NOT NULL DEFAULT '{}'::jsonb,
        inheritance_mode VARCHAR(20) NOT NULL DEFAULT 'OVERRIDE',
        version INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_org_staff_scopes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        unit_id UUID NOT NULL REFERENCES merchant_org_units(id) ON DELETE CASCADE,
        staff_id VARCHAR(64) NOT NULL,
        role_scope VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
        permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (merchant_id, unit_id, staff_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS copilot_pending_actions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        intent VARCHAR(50) NOT NULL,
        command JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        source VARCHAR(20) DEFAULT 'portal',
        execution_result JSONB
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS copilot_action_approvals (
        action_id UUID PRIMARY KEY REFERENCES copilot_pending_actions(id) ON DELETE CASCADE,
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        intent VARCHAR(50) NOT NULL,
        source VARCHAR(20) NOT NULL DEFAULT 'portal',
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        pending_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        confirmed_at TIMESTAMPTZ,
        denied_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        expired_at TIMESTAMPTZ,
        executing_at TIMESTAMPTZ,
        executed_at TIMESTAMPTZ,
        actor_role VARCHAR(20),
        actor_id VARCHAR(64),
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        execution_result JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS planner_trigger_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        trigger_type VARCHAR(20) NOT NULL,
        trigger_key VARCHAR(120) NOT NULL,
        budget_ai_calls_daily INTEGER NOT NULL DEFAULT 0,
        budget_tokens_daily INTEGER NOT NULL DEFAULT 0,
        enabled BOOLEAN NOT NULL DEFAULT true,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (merchant_id, trigger_type, trigger_key)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS planner_run_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        trigger_type VARCHAR(20) NOT NULL,
        trigger_key VARCHAR(120) NOT NULL,
        requested_by VARCHAR(64),
        budget_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
        run_status VARCHAR(20) NOT NULL DEFAULT 'STARTED',
        reason TEXT,
        context_digest JSONB NOT NULL DEFAULT '{}'::jsonb,
        cost_tokens INTEGER NOT NULL DEFAULT 0,
        cost_ai_calls INTEGER NOT NULL DEFAULT 0,
        correlation_id VARCHAR(128),
        error TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  };

  const cleanupMerchantData = async (targetMerchantId: string) => {
    await safeDeleteByMerchant("delivery_location_timeline", targetMerchantId);
    await safeDeleteByMerchant("delivery_sla_events", targetMerchantId);
    await safeDeleteByMerchant("delivery_pod_records", targetMerchantId);
    await safeDeleteByMerchant("delivery_execution_events", targetMerchantId);
    await safeDeleteByMerchant("connector_runtime_dlq", targetMerchantId);
    await safeDeleteByMerchant("connector_runtime_events", targetMerchantId);
    await safeDeleteByMerchant(
      "connector_reconciliation_items",
      targetMerchantId,
    );
    await safeDeleteByMerchant(
      "connector_reconciliation_runs",
      targetMerchantId,
    );
    await safeDeleteByMerchant("integration_events", targetMerchantId);
    await safeDeleteByMerchant("integration_endpoints", targetMerchantId);
    await safeDeleteByMerchant("merchant_org_staff_scopes", targetMerchantId);
    await safeDeleteByMerchant(
      "merchant_org_policy_bindings",
      targetMerchantId,
    );
    await safeDeleteByMerchant("merchant_org_units", targetMerchantId);
    await safeDeleteByMerchant("copilot_action_approvals", targetMerchantId);
    await safeDeleteByMerchant("copilot_pending_actions", targetMerchantId);
    await safeDeleteByMerchant("planner_run_ledger", targetMerchantId);
    await safeDeleteByMerchant("planner_trigger_policies", targetMerchantId);
    await safeDeleteByMerchant("orders", targetMerchantId);
    await safeDeleteByMerchant("conversations", targetMerchantId);
    await safeDeleteByMerchant("customers", targetMerchantId);
    await safeDeleteByMerchant("merchant_staff", targetMerchantId);
    await safeDeleteByMerchant("merchant_api_keys", targetMerchantId);
    await pool.query("DELETE FROM merchants WHERE id = $1", [targetMerchantId]);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.setGlobalPrefix("api");
    await app.init();

    pool = moduleFixture.get<Pool>(DATABASE_POOL);

    await ensureFoundationSchema();
    await cleanupMerchantData(merchantId);
    await cleanupMerchantData(noTeamMerchantId);

    await pool.query(
      `INSERT INTO merchants (
         id,
         name,
         category,
         daily_token_budget,
         is_active,
         config,
         branding,
         negotiation_rules,
         delivery_rules,
         enabled_features,
         enabled_agents,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         'GENERIC',
         500000,
         true,
         '{}'::jsonb,
         '{}'::jsonb,
         '{}'::jsonb,
         '{}'::jsonb,
         ARRAY['CONVERSATIONS', 'ORDERS', 'CATALOG', 'WEBHOOKS', 'TEAM', 'COPILOT_CHAT']::text[],
         ARRAY['OPS_AGENT', 'INVENTORY_AGENT']::text[],
         NOW(),
         NOW()
       )`,
      [merchantId, merchantName],
    );

    const staffInsert = await pool.query<{ id: string }>(
      `INSERT INTO merchant_staff (
         merchant_id,
         email,
         name,
         role,
         status,
         permissions,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         'Foundation Owner',
         'OWNER',
         'ACTIVE',
         '{}'::jsonb,
         NOW(),
         NOW()
       ) RETURNING id::text as id`,
      [merchantId, staffEmail],
    );

    const staffId = staffInsert.rows[0].id;
    authToken = createStaffToken(staffId, merchantId);

    const agentStaffInsert = await pool.query<{ id: string }>(
      `INSERT INTO merchant_staff (
         merchant_id,
         email,
         name,
         role,
         status,
         permissions,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         'Foundation Agent',
         'AGENT',
         'ACTIVE',
         '{}'::jsonb,
         NOW(),
         NOW()
       ) RETURNING id::text as id`,
      [merchantId, "agent.foundation.hardening@test.local"],
    );
    agentAuthToken = createStaffToken(agentStaffInsert.rows[0].id, merchantId);

    await pool.query(
      `INSERT INTO merchants (
         id,
         name,
         category,
         daily_token_budget,
         is_active,
         config,
         branding,
         negotiation_rules,
         delivery_rules,
         enabled_features,
         enabled_agents,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         'GENERIC',
         500000,
         true,
         '{}'::jsonb,
         '{}'::jsonb,
         '{}'::jsonb,
         '{}'::jsonb,
         ARRAY['CONVERSATIONS', 'ORDERS', 'CATALOG', 'WEBHOOKS']::text[],
         ARRAY['OPS_AGENT', 'INVENTORY_AGENT']::text[],
         NOW(),
         NOW()
       )`,
      [noTeamMerchantId, "Foundation Hardening No-Team Merchant"],
    );

    const noTeamStaffInsert = await pool.query<{ id: string }>(
      `INSERT INTO merchant_staff (
         merchant_id,
         email,
         name,
         role,
         status,
         permissions,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         'No Team Owner',
         'OWNER',
         'ACTIVE',
         '{}'::jsonb,
         NOW(),
         NOW()
       ) RETURNING id::text as id`,
      [noTeamMerchantId, "owner.foundation.no-team@test.local"],
    );
    noTeamAuthToken = createStaffToken(
      noTeamStaffInsert.rows[0].id,
      noTeamMerchantId,
    );

    const customerInsert = await pool.query<{ id: string }>(
      `INSERT INTO customers (
         merchant_id,
         sender_id,
         phone,
         name,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         $3,
         'Delivery Test Customer',
         NOW(),
         NOW()
       ) RETURNING id::text as id`,
      [merchantId, `sender-${crypto.randomUUID()}`, "+201000000000"],
    );

    const customerId = customerInsert.rows[0].id;
    const conversationId = `conv-hardening-${Date.now()}`;

    await pool.query(
      `INSERT INTO conversations (
         id,
         merchant_id,
         customer_id,
         sender_id,
         state,
         context,
         cart,
         collected_info,
         missing_slots,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         $3::uuid,
         $4,
         'GREETING',
         '{}'::jsonb,
         '{"items": [], "subtotal": 0, "discount": 0, "total": 0}'::jsonb,
         '{}'::jsonb,
         ARRAY[]::text[],
         NOW(),
         NOW()
       )`,
      [conversationId, merchantId, customerId, `sender-${crypto.randomUUID()}`],
    );

    orderNumber = `ORD-HARD-${Date.now()}`;

    const orderInsert = await pool.query<{ id: string }>(
      `INSERT INTO orders (
         merchant_id,
         conversation_id,
         customer_id,
         order_number,
         status,
         items,
         subtotal,
         discount,
         delivery_fee,
         total,
         customer_name,
         customer_phone,
         delivery_address,
         created_at,
         updated_at
       ) VALUES (
         $1,
         $2,
         $3::uuid,
         $4,
         'CONFIRMED',
         '[]'::jsonb,
         100,
         0,
         20,
         120,
         'Delivery Test Customer',
         '+201000000000',
         '{"city":"Cairo","area":"Nasr City"}'::jsonb,
         NOW(),
         NOW()
       ) RETURNING id::text as id`,
      [merchantId, conversationId, customerId, orderNumber],
    );

    orderId = orderInsert.rows[0].id;
  }, 90000);

  afterAll(async () => {
    await cleanupMerchantData(merchantId);
    await cleanupMerchantData(noTeamMerchantId);
    await app.close();
  }, 90000);

  it("records delivery execution signals and returns a timeline", async () => {
    const eventResp = await request(app.getHttpServer())
      .post(`/api/v1/portal/delivery/orders/${orderId}/events`)
      .set(authHeader())
      .send({
        eventType: "delivery.out_for_delivery",
        source: "driver_app",
        status: "RECORDED",
        payload: { checkpoint: "left_hub" },
      });

    expect(eventResp.status).toBe(201);

    const podResp = await request(app.getHttpServer())
      .post(`/api/v1/portal/delivery/orders/${orderId}/pod`)
      .set(authHeader())
      .send({
        proofType: "note",
        proofPayload: { note: "Customer received package" },
      });

    expect(podResp.status).toBe(201);
    expect(podResp.body?.pod?.id).toBeDefined();

    const disputeResp = await request(app.getHttpServer())
      .post(
        `/api/v1/portal/delivery/orders/${orderId}/pod/${podResp.body.pod.id}/dispute`,
      )
      .set(authHeader())
      .send({
        disputeNote: "Customer reported wrong package",
        disputedBy: "qa_foundation",
      });

    expect(disputeResp.status).toBe(201);
    expect(disputeResp.body?.dispute?.status).toBe("OPEN");

    const locationResp = await request(app.getHttpServer())
      .post(`/api/v1/portal/delivery/orders/${orderId}/location`)
      .set(authHeader())
      .send({
        latitude: 30.05,
        longitude: 31.36,
        accuracyMeters: 10,
        speedKmh: 18,
        source: "driver_app",
      });

    expect(locationResp.status).toBe(201);

    const slaResp = await request(app.getHttpServer())
      .post(`/api/v1/portal/delivery/orders/${orderId}/sla-events`)
      .set(authHeader())
      .send({
        slaType: "eta",
        status: "AT_RISK",
        minutesDelta: 12,
        reason: "Traffic congestion",
      });

    expect(slaResp.status).toBe(201);

    const timelineResp = await request(app.getHttpServer())
      .get(`/api/v1/portal/delivery/orders/${orderId}/timeline`)
      .set(authHeader());

    expect(timelineResp.status).toBe(200);
    expect(timelineResp.body.orderId).toBe(orderId);
    expect(timelineResp.body.timeline).toBeDefined();
    expect(Array.isArray(timelineResp.body.timeline.events)).toBe(true);
    expect(Array.isArray(timelineResp.body.timeline.pod)).toBe(true);
    expect(Array.isArray(timelineResp.body.timeline.locations)).toBe(true);
    expect(Array.isArray(timelineResp.body.timeline.slaEvents)).toBe(true);
    expect(timelineResp.body.timeline.events.length).toBeGreaterThan(0);
    expect(timelineResp.body.timeline.pod.length).toBeGreaterThan(0);
    expect(timelineResp.body.timeline.locations.length).toBeGreaterThan(0);
    expect(timelineResp.body.timeline.slaEvents.length).toBeGreaterThan(0);
    expect(
      (timelineResp.body.timeline.events || []).some(
        (event: any) => event.event_type === "delivery.disputed",
      ),
    ).toBe(true);

    const liveSnapshotResp = await request(app.getHttpServer())
      .get(`/api/v1/portal/delivery/orders/${orderId}/live-snapshot`)
      .set(authHeader());

    expect(liveSnapshotResp.status).toBe(200);
    expect(liveSnapshotResp.body.snapshot).toBeDefined();
    expect(liveSnapshotResp.body.snapshot.flags.atRisk).toBe(true);
    expect(liveSnapshotResp.body.snapshot.flags.podDisputed).toBe(true);
  }, 60000);

  it("rejects malformed delivery/connector payloads with 400", async () => {
    const invalidDelivery = await request(app.getHttpServer())
      .post(`/api/v1/portal/delivery/orders/${orderId}/events`)
      .set(authHeader())
      .send({
        eventType: "delivery.invalid_status",
      });

    expect(invalidDelivery.status).toBe(400);

    const invalidConnector = await request(app.getHttpServer())
      .post("/api/v1/portal/integrations/erp/runtime/process")
      .set(authHeader())
      .send({ limit: 0 });

    expect(invalidConnector.status).toBe(400);

    const endpointResp = await request(app.getHttpServer())
      .get("/api/v1/portal/integrations/erp")
      .set(authHeader());

    expect(endpointResp.status).toBe(200);

    const invalidConnectorEvent = await request(app.getHttpServer())
      .post(`/api/v1/integrations/erp/${merchantId}/events?mode=queue`)
      .set("x-integration-secret", endpointResp.body.secret)
      .send({
        eventType: "unknown.event",
        data: { any: true },
      });

    expect(invalidConnectorEvent.status).toBe(400);
  }, 60000);

  it("enforces role and entitlement boundaries with 403", async () => {
    const roleForbidden = await request(app.getHttpServer())
      .post("/api/v1/portal/integrations/erp/runtime/process")
      .set(agentAuthHeader())
      .send({ limit: 10 });

    expect(roleForbidden.status).toBe(403);

    const entitlementForbidden = await request(app.getHttpServer())
      .get("/api/v1/portal/hq/units")
      .set(noTeamAuthHeader());

    expect(entitlementForbidden.status).toBe(403);
  }, 60000);

  it("moves failed runtime queue item into DLQ", async () => {
    const endpointResp = await request(app.getHttpServer())
      .get("/api/v1/portal/integrations/erp")
      .set(authHeader());

    expect(endpointResp.status).toBe(200);
    expect(endpointResp.body.id).toBeDefined();
    expect(endpointResp.body.secret).toBeDefined();

    const enqueueResp = await request(app.getHttpServer())
      .post(`/api/v1/integrations/erp/${merchantId}/events?mode=queue`)
      .set("x-integration-secret", endpointResp.body.secret)
      .send({
        eventType: "payment.received",
        data: { method: "CARD", reference: "pay-hardening" },
        maxAttempts: 1,
      });

    expect(enqueueResp.status).toBe(201);
    expect(enqueueResp.body.mode).toBe("queue");

    const processResp = await request(app.getHttpServer())
      .post("/api/v1/portal/integrations/erp/runtime/process")
      .set(authHeader())
      .send({ limit: 10 });

    expect(processResp.status).toBe(201);
    expect(processResp.body.movedToDlq).toBeGreaterThanOrEqual(1);

    const dlqResp = await request(app.getHttpServer())
      .get("/api/v1/portal/integrations/erp/runtime/dlq")
      .set(authHeader());

    expect(dlqResp.status).toBe(200);
    expect(Array.isArray(dlqResp.body.items)).toBe(true);

    const matching = (dlqResp.body.items || []).find(
      (item: any) => item.event_type === "payment.received",
    );

    expect(matching).toBeDefined();
    expect(String(matching.last_error || "")).toContain("orderNumber");

    const batchRetryResp = await request(app.getHttpServer())
      .post("/api/v1/portal/integrations/erp/runtime/dlq/retry-open")
      .set(authHeader())
      .send({ limit: 10 });

    expect(batchRetryResp.status).toBe(201);
    expect(batchRetryResp.body.retriedCount).toBeGreaterThanOrEqual(1);
  }, 60000);

  it("resolves effective HQ policy inheritance across parent and child units", async () => {
    const hqUnitResp = await request(app.getHttpServer())
      .post("/api/v1/portal/hq/units")
      .set(authHeader())
      .send({
        unitType: "HQ",
        name: "Headquarters",
        code: "HQ_MAIN",
      });

    expect(hqUnitResp.status).toBe(201);
    const hqUnitId = hqUnitResp.body.id;

    const brandUnitResp = await request(app.getHttpServer())
      .post("/api/v1/portal/hq/units")
      .set(authHeader())
      .send({
        unitType: "BRAND",
        name: "Brand North",
        code: "BRAND_NORTH",
        parentId: hqUnitId,
      });

    expect(brandUnitResp.status).toBe(201);
    const brandUnitId = brandUnitResp.body.id;

    const policyKey = "discount_policy";

    const parentPolicyResp = await request(app.getHttpServer())
      .put(`/api/v1/portal/hq/units/${hqUnitId}/policies/${policyKey}`)
      .set(authHeader())
      .send({
        inheritanceMode: "MERGE",
        policyValue: {
          maxDiscountPercent: 10,
          freeDeliveryThreshold: 500,
        },
      });

    expect(parentPolicyResp.status).toBe(200);

    const childPolicyResp = await request(app.getHttpServer())
      .put(`/api/v1/portal/hq/units/${brandUnitId}/policies/${policyKey}`)
      .set(authHeader())
      .send({
        inheritanceMode: "MERGE",
        policyValue: {
          maxDiscountPercent: 15,
        },
      });

    expect(childPolicyResp.status).toBe(200);

    const effectiveResp = await request(app.getHttpServer())
      .get(`/api/v1/portal/hq/units/${brandUnitId}/policies/effective`)
      .set(authHeader());

    expect(effectiveResp.status).toBe(200);
    expect(effectiveResp.body.unitId).toBe(brandUnitId);
    expect(effectiveResp.body.effectivePolicies).toBeDefined();
    expect(effectiveResp.body.effectivePolicies[policyKey]).toBeDefined();
    expect(
      effectiveResp.body.effectivePolicies[policyKey].maxDiscountPercent,
    ).toBe(15);
    expect(
      effectiveResp.body.effectivePolicies[policyKey].freeDeliveryThreshold,
    ).toBe(500);

    const lineage = effectiveResp.body.lineage?.[policyKey] || [];
    expect(Array.isArray(lineage)).toBe(true);
    expect(lineage.length).toBeGreaterThanOrEqual(2);

    const invalidHierarchyResp = await request(app.getHttpServer())
      .post("/api/v1/portal/hq/units")
      .set(authHeader())
      .send({
        unitType: "BRANCH",
        name: "Invalid Branch",
        code: "BRANCH_INVALID",
        parentId: hqUnitId,
      });

    expect(invalidHierarchyResp.status).toBe(400);
  }, 60000);

  it("exposes command-center feed and supports planner run replay", async () => {
    const failedRunId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO planner_run_ledger (
         id,
         merchant_id,
         trigger_type,
         trigger_key,
         run_status,
         reason,
         context_digest,
         started_at,
         completed_at,
         created_at
       ) VALUES (
         $1::uuid,
         $2,
         'ON_DEMAND',
         'ASK_REVENUE',
         'FAILED',
         'synthetic failure for replay coverage',
         '{}'::jsonb,
         NOW(),
         NOW(),
         NOW()
       )`,
      [failedRunId, merchantId],
    );

    const feedResp = await request(app.getHttpServer())
      .get("/api/v1/portal/control-plane/command-center/feed?limit=20")
      .set(authHeader());

    expect(feedResp.status).toBe(200);
    expect(Array.isArray(feedResp.body.items)).toBe(true);
    expect(
      (feedResp.body.items || []).some(
        (item: any) =>
          item.category === "planner" && item.referenceId === failedRunId,
      ),
    ).toBe(true);

    const replayResp = await request(app.getHttpServer())
      .post(`/api/v1/portal/control-plane/planner-runs/${failedRunId}/replay`)
      .set(authHeader())
      .send({
        reason: "e2e replay validation",
      });

    expect(replayResp.status).toBe(201);
    expect(replayResp.body.sourceRunId).toBe(failedRunId);
    expect(replayResp.body.replayRunId).toBeDefined();
    expect(replayResp.body.runStatus).toBe("STARTED");

    const startedRunsResp = await request(app.getHttpServer())
      .get(
        "/api/v1/portal/control-plane/planner-runs?status=STARTED&triggerType=ON_DEMAND&triggerKey=ASK_REVENUE&limit=20&offset=0",
      )
      .set(authHeader());

    expect(startedRunsResp.status).toBe(200);
    expect(Array.isArray(startedRunsResp.body.runs)).toBe(true);
    expect(startedRunsResp.body.runs.length).toBeGreaterThanOrEqual(1);
  }, 60000);

  it("covers approval/planner foundations for cashier approval workflows", async () => {
    const commandPayload = {
      intent: "APPROVE_PAYMENT_PROOF",
      confidence: 1,
      entities: {
        expense: null,
        stockUpdate: null,
        paymentLink: null,
        vipTag: null,
        dateRange: null,
        order: null,
      },
      requires_confirmation: true,
      preview: null,
      missing_fields: [],
      reply_ar: "تأكيد اعتماد إثبات الدفع",
      reasoning: null,
    };

    const actionIds = Array.from({ length: 6 }, () => crypto.randomUUID());
    for (const actionId of actionIds) {
      await pool.query(
        `INSERT INTO copilot_pending_actions (
           id,
           merchant_id,
           intent,
           command,
           expires_at,
           status,
           source,
           created_at,
           updated_at
         ) VALUES (
           $1::uuid,
           $2,
           'APPROVE_PAYMENT_PROOF',
           $3::jsonb,
           NOW() + INTERVAL '30 minutes',
           'pending',
           'portal',
           NOW(),
           NOW()
         )`,
        [actionId, merchantId, JSON.stringify(commandPayload)],
      );

      await pool.query(
        `INSERT INTO copilot_action_approvals (
           action_id,
           merchant_id,
           intent,
           source,
           status,
           pending_at,
           details,
           created_at,
           updated_at
         ) VALUES (
           $1::uuid,
           $2,
           'APPROVE_PAYMENT_PROOF',
           'portal',
           'pending',
           NOW(),
           '{}'::jsonb,
           NOW(),
           NOW()
         )
         ON CONFLICT (action_id) DO NOTHING`,
        [actionId, merchantId],
      );
    }

    const approvalsBeforeConfirm = await request(app.getHttpServer())
      .get("/api/v1/portal/copilot/approvals?status=pending&limit=20&offset=0")
      .set(authHeader());

    expect(approvalsBeforeConfirm.status).toBe(200);
    expect(Array.isArray(approvalsBeforeConfirm.body.approvals)).toBe(true);
    expect(approvalsBeforeConfirm.body.approvals.length).toBeGreaterThanOrEqual(
      6,
    );

    const confirmBlocked = await request(app.getHttpServer())
      .post("/api/v1/portal/copilot/confirm")
      .set(authHeader())
      .send({
        actionId: actionIds[0],
        confirm: true,
      });

    expect([200, 201]).toContain(confirmBlocked.status);
    expect(confirmBlocked.body.success).toBe(false);
    expect(confirmBlocked.body.action?.type).toBe("planner_blocked");

    const approvalsList = await request(app.getHttpServer())
      .get("/api/v1/portal/copilot/approvals?status=pending&limit=20&offset=0")
      .set(authHeader());

    expect(approvalsList.status).toBe(200);
    expect(Array.isArray(approvalsList.body.approvals)).toBe(true);
    expect(approvalsList.body.approvals.length).toBeGreaterThanOrEqual(5);
  }, 60000);
});
