/**
 * Comprehensive Demo Seed Service
 * Seeds ALL actively-used tables (~85) with realistic Egyptian Arabic demo data.
 * Intended for demo/staging environments ONLY.
 *
 * Execution: POST /internal/seed/demo  OR  npm run db:seed
 */
import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { randomUUID } from "crypto";
import * as crypto from "crypto";

// ── Fixed UUIDs for deterministic FKs ──────────────────────────────
const ID = {
  // Merchant
  merchant: "demo-merchant",
  // Staff
  staffOwner: "00000000-0000-4000-a000-000000000001",
  staffAdmin: "00000000-0000-4000-a000-000000000002",
  staffAgent: "00000000-0000-4000-a000-000000000003",
  // Customers
  cust1: "00000000-0000-4000-b000-000000000001",
  cust2: "00000000-0000-4000-b000-000000000002",
  cust3: "00000000-0000-4000-b000-000000000003",
  cust4: "00000000-0000-4000-b000-000000000004",
  cust5: "00000000-0000-4000-b000-000000000005",
  cust6: "00000000-0000-4000-b000-000000000006",
  cust7: "00000000-0000-4000-b000-000000000007",
  cust8: "00000000-0000-4000-b000-000000000008",
  // Catalog items
  cat1: "00000000-0000-4000-c000-000000000001",
  cat2: "00000000-0000-4000-c000-000000000002",
  cat3: "00000000-0000-4000-c000-000000000003",
  cat4: "00000000-0000-4000-c000-000000000004",
  cat5: "00000000-0000-4000-c000-000000000005",
  cat6: "00000000-0000-4000-c000-000000000006",
  cat7: "00000000-0000-4000-c000-000000000007",
  cat8: "00000000-0000-4000-c000-000000000008",
  cat9: "00000000-0000-4000-c000-000000000009",
  cat10: "00000000-0000-4000-c000-000000000010",
  cat11: "00000000-0000-4000-c000-000000000011",
  cat12: "00000000-0000-4000-c000-000000000012",
  // Orders
  ord1: "00000000-0000-4000-d000-000000000001",
  ord2: "00000000-0000-4000-d000-000000000002",
  ord3: "00000000-0000-4000-d000-000000000003",
  ord4: "00000000-0000-4000-d000-000000000004",
  ord5: "00000000-0000-4000-d000-000000000005",
  ord6: "00000000-0000-4000-d000-000000000006",
  ord7: "00000000-0000-4000-d000-000000000007",
  ord8: "00000000-0000-4000-d000-000000000008",
  ord9: "00000000-0000-4000-d000-000000000009",
  ord10: "00000000-0000-4000-d000-000000000010",
  // Inventory items
  inv1: "00000000-0000-4000-e000-000000000001",
  inv2: "00000000-0000-4000-e000-000000000002",
  inv3: "00000000-0000-4000-e000-000000000003",
  inv4: "00000000-0000-4000-e000-000000000004",
  inv5: "00000000-0000-4000-e000-000000000005",
  // Inventory variants
  var1: "00000000-0000-4000-e100-000000000001",
  var2: "00000000-0000-4000-e100-000000000002",
  var3: "00000000-0000-4000-e100-000000000003",
  var4: "00000000-0000-4000-e100-000000000004",
  var5: "00000000-0000-4000-e100-000000000005",
  // Warehouse
  wh1: "00000000-0000-4000-e200-000000000001",
  wh2: "00000000-0000-4000-e200-000000000002",
  // Suppliers
  sup1: "00000000-0000-4000-e300-000000000001",
  sup2: "00000000-0000-4000-e300-000000000002",
  // Delivery drivers
  drv1: "00000000-0000-4000-f000-000000000001",
  drv2: "00000000-0000-4000-f000-000000000002",
  drv3: "00000000-0000-4000-f000-000000000003",
  // Billing
  planStarter: "00000000-0000-4000-f100-000000000001",
  planGrowth: "00000000-0000-4000-f100-000000000002",
  planPro: "00000000-0000-4000-f100-000000000003",
  planEnterprise: "00000000-0000-4000-f100-000000000004",
  subscription: "00000000-0000-4000-f100-000000000010",
  // Loyalty tiers
  tierBronze: "00000000-0000-4000-f200-000000000001",
  tierSilver: "00000000-0000-4000-f200-000000000002",
  tierGold: "00000000-0000-4000-f200-000000000003",
  // Promotions
  promo1: "00000000-0000-4000-f300-000000000001",
  promo2: "00000000-0000-4000-f300-000000000002",
  // Gift card
  gc1: "00000000-0000-4000-f400-000000000001",
  // Payment links
  pl1: "00000000-0000-4000-f500-000000000001",
  pl2: "00000000-0000-4000-f500-000000000002",
  // Webhook
  wh_hook1: "00000000-0000-4000-f600-000000000001",
  // Segment
  seg1: "00000000-0000-4000-f700-000000000001",
  seg2: "00000000-0000-4000-f700-000000000002",
};

// Conversation IDs (string type)
const CONV = {
  c1: "conv-demo-001",
  c2: "conv-demo-002",
  c3: "conv-demo-003",
  c4: "conv-demo-004",
  c5: "conv-demo-005",
  c6: "conv-demo-006",
  c7: "conv-demo-007",
  c8: "conv-demo-008",
};

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * Wipe ALL demo data and re-seed from scratch.
   * Safe: only deletes rows where merchant_id = 'demo-merchant'.
   */
  async seedDemo(): Promise<{ tables: number; duration: number }> {
    const start = Date.now();
    let tableCount = 0;
    const client = await this.pool.connect();
    const errors: string[] = [];

    const runStep = async (name: string, fn: () => Promise<number>) => {
      try {
        await client.query(`SAVEPOINT sp_${name}`);
        const count = await fn();
        await client.query(`RELEASE SAVEPOINT sp_${name}`);
        tableCount += count;
        this.logger.log(`  ✓ ${name}: ${count} tables`);
      } catch (err: any) {
        await client.query(`ROLLBACK TO SAVEPOINT sp_${name}`);
        errors.push(`${name}: ${err.message}`);
        this.logger.warn(`  ✗ ${name} skipped: ${err.message}`);
      }
    };

    try {
      await client.query("BEGIN");

      // ── 0. CLEAN existing demo data (reverse FK order) ──
      await this.cleanDemoData(client);

      // ── Seed each domain with savepoints ──
      await runStep("merchant_core", () => this.seedMerchantCore(client));
      await runStep("catalog", () => this.seedCatalog(client));
      await runStep("customers", () => this.seedCustomers(client));
      await runStep("conversations", () => this.seedConversations(client));
      await runStep("orders", () => this.seedOrders(client));
      await runStep("inventory", () => this.seedInventory(client));
      await runStep("delivery", () => this.seedDelivery(client));
      await runStep("finance", () => this.seedFinance(client));
      await runStep("loyalty", () => this.seedLoyalty(client));
      await runStep("notifications", () => this.seedNotifications(client));
      await runStep("agents", () => this.seedAgents(client));
      await runStep("analytics", () => this.seedAnalytics(client));
      await runStep("billing", () => this.seedBilling(client));
      await runStep("security", () => this.seedSecurity(client));

      await client.query("COMMIT");
      const duration = Date.now() - start;
      this.logger.log(
        `✅ Demo seed complete: ${tableCount} tables seeded in ${duration}ms${errors.length ? ` (${errors.length} steps skipped)` : ""}`,
      );
      return { tables: tableCount, duration };
    } catch (err) {
      await client.query("ROLLBACK");
      this.logger.error(`❌ Seed failed: ${err.message}`, err.stack);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Public method to clean demo data only (no re-seed).
   */
  async cleanDemo(): Promise<{ duration: number }> {
    const start = Date.now();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.cleanDemoData(client);
      await client.query("COMMIT");
      const duration = Date.now() - start;
      this.logger.log(`🧹 Demo data cleaned in ${duration}ms`);
      return { duration };
    } catch (err) {
      await client.query("ROLLBACK");
      this.logger.error(`❌ Clean failed: ${err.message}`, err.stack);
      throw err;
    } finally {
      client.release();
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // CLEAN
  // ═════════════════════════════════════════════════════════════════
  private async cleanDemoData(client: any): Promise<void> {
    const m = ID.merchant;
    const scopedDeletes: Record<string, string> = {
      order_items: `DELETE FROM order_items WHERE order_id::text IN (SELECT id::text FROM orders WHERE merchant_id = $1)`,
      cod_statement_lines: `DELETE FROM cod_statement_lines l USING cod_statement_imports i WHERE l.statement_id = i.id AND i.merchant_id = $1`,
      message_events: `DELETE FROM message_events me USING messages msg WHERE me.message_id = msg.id AND msg.merchant_id = $1`,
      notification_delivery_log: `DELETE FROM notification_delivery_log ndl USING notifications n WHERE ndl.notification_id = n.id AND n.merchant_id = $1`,
    };
    // Order matters: children first
    const tables = [
      // AI / agents
      "agent_actions",
      "ai_decision_log",
      "customer_memory",
      // Agent tasks
      "agent_results",
      "agent_tasks",
      // Analytics
      "analytics_events",
      "recovered_carts",
      "feature_requests",
      "quote_request_events",
      "quote_requests",
      // Billing
      "billing_invoices",
      "merchant_subscriptions",
      "subscription_offers",
      // Notifications
      "notification_delivery_log",
      "notifications",
      "merchant_notifications",
      "notification_templates",
      "push_subscriptions",
      "notification_preferences",
      // Loyalty
      "promotion_usage",
      "promotions",
      "gift_card_transactions",
      "gift_cards",
      "points_transactions",
      "customer_points",
      "customer_referrals",
      "loyalty_tiers",
      "segment_memberships",
      "customer_segments",
      // Finance
      "finance_insights",
      "margin_alerts",
      "finance_snapshots",
      "cod_reminders",
      "cod_statement_lines",
      "cod_statement_imports",
      "monthly_closes",
      "accountant_exports",
      "tax_reports",
      "cash_flow_forecasts",
      "merchant_tax_config",
      "expenses",
      "product_cogs",
      // Payments
      "payment_proofs",
      "payment_links",
      "proof_requests",
      "ocr_verification_rules",
      // Inventory
      "order_ingredient_deductions",
      "item_recipes",
      "sku_merge_log",
      "inventory_cost_layers",
      "inventory_lots",
      "expiry_alerts",
      "shrinkage_records",
      "inventory_top_movers",
      "inventory_stock_by_location",
      "warehouse_locations",
      "supplier_imports",
      "suppliers",
      "stock_reservations",
      "inventory_alerts",
      "inventory_variants",
      "inventory_items",
      "stock_alerts",
      "stock_movements",
      "substitution_suggestions",
      // Delivery
      "delivery_outcomes",
      "delivery_eta_config",
      "delivery_drivers",
      // Shipments / orders
      "shipments",
      "order_items",
      "orders",
      // Messages / conversations
      "whatsapp_message_log",
      "message_events",
      "messages",
      "product_ocr_confirmations",
      "conversation_locks",
      "followups",
      "conversations",
      // Customers
      "customer_risk_scores",
      "vip_rules",
      "customers",
      // Catalog
      "catalog_items",
      "known_areas",
      // Webhooks
      "webhook_deliveries",
      "webhooks",
      // Security
      "audit_logs",
      "staff_sessions",
      "permission_templates",
      "rate_limit_violations",
      "rate_limit_counters",
      "bulk_operations",
      "data_requests",
      "entitlement_changes",
      // Complaints / upsell
      "complaint_playbooks",
      "upsell_rules",
      "objection_templates",
      // Integrations
      "integration_events",
      "integration_endpoints",
      "pos_integrations",
      // Merchant
      "merchant_command_channels",
      "merchant_phone_numbers",
      "merchant_agent_subscriptions",
      "agent_subscription_audit",
      "merchant_reports",
      "merchant_token_usage",
      "merchant_api_keys",
      "voice_transcriptions",
      "address_cache",
      "merchant_staff",
      // DLQ / outbox
      "dlq_events",
      "outbox_events",
    ];

    for (const t of tables) {
      try {
        await client.query(`SAVEPOINT sp_clean`);
        const scopedSql = scopedDeletes[t];
        if (scopedSql) {
          await client.query(scopedSql, [m]);
        } else {
          await client.query(`DELETE FROM ${t} WHERE merchant_id = $1`, [m]);
        }
        await client.query(`RELEASE SAVEPOINT sp_clean`);
      } catch {
        await client.query(`ROLLBACK TO SAVEPOINT sp_clean`);
        // Table might not exist or no merchant_id column — skip
      }
    }

    // Delete merchant itself last
    try {
      await client.query(`SAVEPOINT sp_merchant`);
      await client.query(`DELETE FROM merchants WHERE id = $1`, [m]);
      await client.query(`RELEASE SAVEPOINT sp_merchant`);
    } catch {
      await client.query(`ROLLBACK TO SAVEPOINT sp_merchant`);
    }
    // Clean billing plans (no merchant_id)
    try {
      await client.query(`SAVEPOINT sp_plans`);
      await client.query(
        `DELETE FROM billing_plans WHERE code IN ('STARTER','GROWTH','PRO','ENTERPRISE')`,
      );
      await client.query(`RELEASE SAVEPOINT sp_plans`);
    } catch {
      await client.query(`ROLLBACK TO SAVEPOINT sp_plans`);
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // 1. MERCHANT CORE
  // ═════════════════════════════════════════════════════════════════
  private async seedMerchantCore(client: any): Promise<number> {
    let t = 0;

    // merchants
    await client.query(
      `
      INSERT INTO merchants (id, name, category, config, branding, negotiation_rules, delivery_rules,
        daily_token_budget, is_active, trade_name, city, currency, language,
        default_delivery_fee, auto_book_delivery, enable_followups, greeting_template,
        working_hours, timezone, auto_response_enabled, followup_delay_minutes,
        payment_reminders_enabled, low_stock_alerts_enabled, whatsapp_reports_enabled,
        report_periods_enabled, notification_phone, enabled_agents, enabled_features,
        inventory_agent_enabled, inventory_config, knowledge_base, plan, plan_limits,
        payout_instapay_alias, payout_vodafone_cash, payout_preferred_method,
        auto_assign_delivery, delivery_assignment_mode, notify_customer_on_assign)
      VALUES ($1, 'متجر تشغيل التجريبي', 'CLOTHES',
        '{"maxNegotiationRounds":3,"enableVoice":true,"enableOCR":true,"enableProductImages":true}'::jsonb,
        '{"primaryColor":"#6366f1","logo":"https://demo.tash8eel.com/logo.png","storeName":"تشغيل ستور"}'::jsonb,
        '{"maxDiscountPct":15,"requireApprovalAbove":500,"autoApproveBelow":100}'::jsonb,
        '{"freeAbove":300,"zones":{"cairo":30,"giza":40,"alex":60}}'::jsonb,
        800000, true, 'Tash8eel Demo Store', 'cairo', 'EGP', 'ar-EG',
        30, true, true,
        'أهلاً وسهلاً! 👋 أنا مساعد تشغيل الذكي. كيف أقدر أساعدك النهاردة؟',
        '{"sun":{"open":"09:00","close":"22:00"},"mon":{"open":"09:00","close":"22:00"},"tue":{"open":"09:00","close":"22:00"},"wed":{"open":"09:00","close":"22:00"},"thu":{"open":"09:00","close":"23:00"},"fri":{"open":"14:00","close":"23:00"},"sat":{"open":"09:00","close":"22:00"}}'::jsonb,
        'Africa/Cairo', true, 45, true, true, true,
        ARRAY['daily','weekly'], '+201012345678',
        ARRAY['OPS_AGENT','INVENTORY_AGENT','FINANCE_AGENT'],
        ARRAY['CONVERSATIONS','ORDERS','CATALOG','VOICE_NOTES','REPORTS','NOTIFICATIONS','INVENTORY','API_ACCESS','PAYMENTS','VISION_OCR','KPI_DASHBOARD','WEBHOOKS','TEAM','AUDIT_LOGS'],
        true,
        '{"autoReorder":true,"lowStockMultiplier":1.5,"checkIntervalHours":6}'::jsonb,
        '{"faqs":[{"q":"مواعيد الشغل إيه؟","a":"من 9 الصبح لـ 10 بالليل كل يوم ماعدا الجمعة من 2 الضهر"},{"q":"التوصيل بكام؟","a":"القاهرة 30 جنيه، الجيزة 40، إسكندرية 60. مجاناً فوق 300 جنيه"}]}'::jsonb,
        'PRO',
        '{"messagesPerMonth":50000,"whatsappNumbers":3,"teamMembers":3,"tokenBudgetDaily":800000,"aiCallsPerDay":1500}'::jsonb,
        'tash8eel_demo', '01012345678', 'INSTAPAY',
        true, 'round_robin', true
      )
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = true
    `,
      [ID.merchant],
    );
    t++;

    // merchant_api_keys
    const keyHash = crypto
      .createHash("sha256")
      .update("demo-api-key-2024")
      .digest("hex");
    await client.query(
      `
      INSERT INTO merchant_api_keys (id, merchant_id, key_hash, key_prefix, name, scopes, is_active)
      VALUES (gen_random_uuid(), $1, $2, 'tsh8_', 'Demo API Key',
        ARRAY['read','write','orders','catalog','customers','analytics'], true)
    `,
      [ID.merchant, keyHash],
    );
    t++;

    // merchant_token_usage (last 7 days)
    for (let d = 0; d < 7; d++) {
      await client.query(
        `
        INSERT INTO merchant_token_usage (id, merchant_id, date, tokens_used, llm_calls)
        VALUES (gen_random_uuid(), $1, CURRENT_DATE - $2::int, $3, $4)
        ON CONFLICT (merchant_id, date) DO NOTHING
      `,
        [
          ID.merchant,
          d,
          8000 + Math.floor(Math.random() * 12000),
          40 + Math.floor(Math.random() * 60),
        ],
      );
    }
    t++;

    // merchant_staff (3 staff members)
    const pwHash = crypto
      .createHash("sha256")
      .update("Demo@1234")
      .digest("hex");
    await client.query(
      `
      INSERT INTO merchant_staff (id, merchant_id, email, name, password_hash, role, status, permissions)
      VALUES
        ($1, $2, 'owner@tash8eel.com', 'أحمد محمود', $5, 'OWNER', 'ACTIVE', '{"all":true}'::jsonb),
        ($3, $2, 'admin@tash8eel.com', 'سارة أحمد', $5, 'ADMIN', 'ACTIVE',
          '{"orders":true,"catalog":true,"customers":true,"analytics":true,"settings":true}'::jsonb),
        ($4, $2, 'agent@tash8eel.com', 'محمد علي', $5, 'AGENT', 'ACTIVE',
          '{"orders":true,"conversations":true,"customers":true}'::jsonb)
    `,
      [ID.staffOwner, ID.merchant, ID.staffAdmin, ID.staffAgent, pwHash],
    );
    t++;

    // merchant_phone_numbers
    await client.query(
      `
      INSERT INTO merchant_phone_numbers (id, merchant_id, phone_number, whatsapp_number, provider, display_name, is_active, is_sandbox)
      VALUES (gen_random_uuid(), $1, '+201012345678', '+201012345678', 'meta', 'تشغيل ستور', true, true)
    `,
      [ID.merchant],
    );
    t++;

    // merchant_agent_subscriptions (columns: agent_type, is_enabled, config)
    const agents = [
      "OPS_AGENT",
      "INVENTORY_AGENT",
      "FINANCE_AGENT",
      "MARKETING_AGENT",
      "SUPPORT_AGENT",
    ];
    for (const a of agents) {
      await client.query(
        `
        INSERT INTO merchant_agent_subscriptions (id, merchant_id, agent_type, is_enabled, config)
        VALUES (gen_random_uuid(), $1, $2, true, '{"autoRun":true}'::jsonb)
        ON CONFLICT DO NOTHING
      `,
        [ID.merchant, a],
      );
    }
    t++;

    // merchant_command_channels
    await client.query(
      `
      INSERT INTO merchant_command_channels (id, merchant_id, phone_number, is_active, verified_at)
      VALUES (gen_random_uuid(), $1, '+201012345678', true, NOW())
    `,
      [ID.merchant],
    );
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 2. CATALOG (12 products across categories)
  // ═════════════════════════════════════════════════════════════════
  private async seedCatalog(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    const products = [
      {
        id: ID.cat1,
        sku: "TSH-001",
        nameAr: "تيشيرت قطن أبيض",
        nameEn: "White Cotton T-Shirt",
        cat: "ملابس",
        price: 250,
        minPrice: 200,
        desc: "تيشيرت قطن مصري 100% - مقاسات S/M/L/XL",
      },
      {
        id: ID.cat2,
        sku: "TSH-002",
        nameAr: "تيشيرت قطن أسود",
        nameEn: "Black Cotton T-Shirt",
        cat: "ملابس",
        price: 250,
        minPrice: 200,
        desc: "تيشيرت قطن مصري 100% - لون أسود",
      },
      {
        id: ID.cat3,
        sku: "JNS-001",
        nameAr: "بنطلون جينز سليم",
        nameEn: "Slim Fit Jeans",
        cat: "ملابس",
        price: 450,
        minPrice: 380,
        desc: "جينز سليم فيت - أزرق غامق",
      },
      {
        id: ID.cat4,
        sku: "DRS-001",
        nameAr: "فستان صيفي فلورال",
        nameEn: "Floral Summer Dress",
        cat: "ملابس",
        price: 550,
        minPrice: 480,
        desc: "فستان صيفي بنقشة ورود",
      },
      {
        id: ID.cat5,
        sku: "SHO-001",
        nameAr: "حذاء رياضي نايك",
        nameEn: "Nike Sports Shoes",
        cat: "أحذية",
        price: 1200,
        minPrice: 1000,
        desc: "حذاء رياضي مريح للجري",
      },
      {
        id: ID.cat6,
        sku: "BAG-001",
        nameAr: "شنطة جلد طبيعي",
        nameEn: "Genuine Leather Bag",
        cat: "إكسسوارات",
        price: 800,
        minPrice: 650,
        desc: "شنطة يد جلد طبيعي - بني",
      },
      {
        id: ID.cat7,
        sku: "ACC-001",
        nameAr: "ساعة يد كلاسيك",
        nameEn: "Classic Watch",
        cat: "إكسسوارات",
        price: 950,
        minPrice: 800,
        desc: "ساعة يد ستانلس ستيل",
      },
      {
        id: ID.cat8,
        sku: "KDS-001",
        nameAr: "طقم أطفال صيفي",
        nameEn: "Kids Summer Set",
        cat: "أطفال",
        price: 350,
        minPrice: 300,
        desc: "طقم تيشيرت وشورت للأطفال",
      },
      {
        id: ID.cat9,
        sku: "JKT-001",
        nameAr: "جاكيت جلد",
        nameEn: "Leather Jacket",
        cat: "ملابس",
        price: 1800,
        minPrice: 1500,
        desc: "جاكيت جلد صناعي - أسود",
      },
      {
        id: ID.cat10,
        sku: "SCF-001",
        nameAr: "إيشارب حرير",
        nameEn: "Silk Scarf",
        cat: "إكسسوارات",
        price: 180,
        minPrice: 150,
        desc: "إيشارب حرير ألوان متعددة",
      },
      {
        id: ID.cat11,
        sku: "PLO-001",
        nameAr: "بولو شيرت",
        nameEn: "Polo Shirt",
        cat: "ملابس",
        price: 320,
        minPrice: 270,
        desc: "بولو شيرت لاكوست ستايل",
      },
      {
        id: ID.cat12,
        sku: "BLT-001",
        nameAr: "حزام جلد",
        nameEn: "Leather Belt",
        cat: "إكسسوارات",
        price: 220,
        minPrice: 180,
        desc: "حزام جلد طبيعي - بني/أسود",
      },
    ];

    for (const p of products) {
      const variants = JSON.stringify([
        { name: "S", price: p.price, sku: `${p.sku}-S` },
        { name: "M", price: p.price, sku: `${p.sku}-M` },
        { name: "L", price: p.price + 20, sku: `${p.sku}-L` },
        { name: "XL", price: p.price + 40, sku: `${p.sku}-XL` },
      ]);
      await client.query(
        `
        INSERT INTO catalog_items (id, merchant_id, sku, name_ar, name_en, description_ar, category,
          base_price, min_price, variants, is_available, stock_quantity, low_stock_threshold,
          track_inventory, tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, true, $11, 5, true, $12)
      `,
        [
          p.id,
          m,
          p.sku,
          p.nameAr,
          p.nameEn,
          p.desc,
          p.cat,
          p.price,
          p.minPrice,
          variants,
          30 + Math.floor(Math.random() * 70),
          `{${p.cat},جديد,عرض}`,
        ],
      );
    }
    t++;

    // known_areas (Egyptian cities/areas)
    const areas = [
      ["cairo", "المعادي", "Maadi", "{المعادى,معادي,maadi}"],
      ["cairo", "مدينة نصر", "Nasr City", "{مدينه نصر,nasr city,نصر}"],
      ["cairo", "المهندسين", "Mohandessin", "{المهندسين,مهندسين,mohandessin}"],
      ["cairo", "الزمالك", "Zamalek", "{زمالك,zamalek}"],
      [
        "cairo",
        "التجمع الخامس",
        "Fifth Settlement",
        "{التجمع,5th settlement,تجمع}",
      ],
      [
        "cairo",
        "مصر الجديدة",
        "Heliopolis",
        "{هليوبوليس,heliopolis,مصر الجديده}",
      ],
      ["giza", "الدقي", "Dokki", "{دقي,dokki}"],
      ["giza", "6 أكتوبر", "6th October", "{اكتوبر,october,6 اكتوبر}"],
      ["alex", "سموحة", "Smouha", "{سموحه,smouha}"],
      ["alex", "ستانلي", "Stanley", "{stanley,ستانلى}"],
    ];
    for (const [city, ar, en, aliases] of areas) {
      await client.query(
        `
        INSERT INTO known_areas (id, city, area_name_ar, area_name_en, area_aliases, delivery_zone)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
        ON CONFLICT (city, area_name_ar) DO NOTHING
      `,
        [
          city,
          ar,
          en,
          aliases,
          city === "cairo" ? "zone_a" : city === "giza" ? "zone_b" : "zone_c",
        ],
      );
    }
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 3. CUSTOMERS (8)
  // ═════════════════════════════════════════════════════════════════
  private async seedCustomers(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    const custs = [
      {
        id: ID.cust1,
        sender: "201111111111@c.us",
        phone: "+201111111111",
        name: "فاطمة حسن",
        orders: 12,
        vip: "GOLD",
      },
      {
        id: ID.cust2,
        sender: "201222222222@c.us",
        phone: "+201222222222",
        name: "محمد إبراهيم",
        orders: 8,
        vip: "SILVER",
      },
      {
        id: ID.cust3,
        sender: "201333333333@c.us",
        phone: "+201333333333",
        name: "نورهان أحمد",
        orders: 5,
        vip: null,
      },
      {
        id: ID.cust4,
        sender: "201444444444@c.us",
        phone: "+201444444444",
        name: "أحمد سمير",
        orders: 15,
        vip: "GOLD",
      },
      {
        id: ID.cust5,
        sender: "201555555555@c.us",
        phone: "+201555555555",
        name: "سارة محمود",
        orders: 3,
        vip: null,
      },
      {
        id: ID.cust6,
        sender: "201666666666@c.us",
        phone: "+201666666666",
        name: "عمر خالد",
        orders: 7,
        vip: "SILVER",
      },
      {
        id: ID.cust7,
        sender: "201777777777@c.us",
        phone: "+201777777777",
        name: "ياسمين طارق",
        orders: 1,
        vip: null,
      },
      {
        id: ID.cust8,
        sender: "201888888888@c.us",
        phone: "+201888888888",
        name: "كريم مصطفى",
        orders: 20,
        vip: "GOLD",
      },
    ];

    for (const c of custs) {
      await client.query(
        `
        INSERT INTO customers (id, merchant_id, sender_id, phone, name, address, preferences,
          total_orders, vip_status, vip_since, last_interaction_at)
        VALUES ($1, $2, $3, $4, $5,
          '{"city":"cairo","area":"المعادي","street":"شارع 9","building":"15","floor":"3"}'::jsonb,
          '{"preferredPayment":"COD","preferredSize":"L","language":"ar"}'::jsonb,
          $6, $7, ${c.vip ? "NOW() - interval '30 days'" : "NULL"}, NOW() - interval '2 hours')
      `,
        [c.id, m, c.sender, c.phone, c.name, c.orders, c.vip],
      );
    }
    t++;

    // customer_tags — table removed in migration 062
    // Tags are stored as JSONB array on customers.tags column instead

    // vip_rules
    await client.query(
      `
      INSERT INTO vip_rules (id, merchant_id, name, tag_to_apply, conditions, is_active, priority) VALUES
        (gen_random_uuid(), $1, 'VIP بعد 10 أوردرات', 'VIP', '{"minOrders":10,"minSpend":3000}'::jsonb, true, 1),
        (gen_random_uuid(), $1, 'عميل متكرر', 'frequent_buyer', '{"minOrders":5}'::jsonb, true, 2)
    `,
      [m],
    );
    t++;

    // customer_risk_scores
    for (const cId of [
      ID.cust1,
      ID.cust2,
      ID.cust3,
      ID.cust4,
      ID.cust5,
      ID.cust6,
      ID.cust7,
      ID.cust8,
    ]) {
      await client.query(
        `
        INSERT INTO customer_risk_scores (id, merchant_id, customer_id, risk_score, risk_factors)
        VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb)
      `,
        [
          m,
          cId,
          Math.floor(Math.random() * 30),
          JSON.stringify({
            cancelRate: Math.random() * 0.1,
            returnRate: Math.random() * 0.05,
          }),
        ],
      );
    }
    t++;

    // customer_segments
    await client.query(
      `
      INSERT INTO customer_segments (id, merchant_id, name, description, type, conditions, customer_count) VALUES
        ($2, $1, 'عملاء VIP', 'العملاء اللي عندهم أكتر من 10 أوردرات', 'DYNAMIC',
          '{"minOrders":10}'::jsonb, 3),
        ($3, $1, 'عملاء جداد', 'العملاء اللي سجّلوا في آخر 30 يوم', 'DYNAMIC',
          '{"registeredWithin":30}'::jsonb, 2)
    `,
      [m, ID.seg1, ID.seg2],
    );
    t++;

    // segment_memberships
    await client.query(
      `
      INSERT INTO segment_memberships (segment_id, customer_id) VALUES
        ($1, $2), ($1, $3), ($1, $4), ($5, $6), ($5, $7)
    `,
      [ID.seg1, ID.cust1, ID.cust4, ID.cust8, ID.seg2, ID.cust7, ID.cust5],
    );
    t++;

    // customer_memory
    await client.query(
      `
      INSERT INTO customer_memory (id, merchant_id, customer_id, memory_type, memory_key, memory_value, confidence, source) VALUES
        (gen_random_uuid(), $1, $2, 'preference', 'size', 'L', 0.95, 'conversation'),
        (gen_random_uuid(), $1, $2, 'preference', 'color', 'أبيض', 0.80, 'conversation'),
        (gen_random_uuid(), $1, $3, 'preference', 'payment', 'COD', 0.90, 'order_history'),
        (gen_random_uuid(), $1, $4, 'preference', 'brand', 'نايك', 0.85, 'conversation')
    `,
      [m, ID.cust1, ID.cust2, ID.cust4],
    );
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 4. CONVERSATIONS + MESSAGES
  // ═════════════════════════════════════════════════════════════════
  private async seedConversations(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    const convs = [
      {
        id: CONV.c1,
        custId: ID.cust1,
        sender: "201111111111@c.us",
        state: "CLOSED",
        cart: '{"items":[],"subtotal":0,"total":0}',
      },
      {
        id: CONV.c2,
        custId: ID.cust2,
        sender: "201222222222@c.us",
        state: "BROWSING" as string,
        cart: '{"items":[],"subtotal":0,"total":0}',
      },
      {
        id: CONV.c3,
        custId: ID.cust3,
        sender: "201333333333@c.us",
        state: "COLLECTING_ITEMS",
        cart: '{"items":[{"name":"تيشيرت قطن أبيض","qty":2,"price":250}],"subtotal":500,"total":500}',
      },
      {
        id: CONV.c4,
        custId: ID.cust4,
        sender: "201444444444@c.us",
        state: "ORDER_PLACED",
        cart: '{"items":[],"subtotal":0,"total":0}',
      },
      {
        id: CONV.c5,
        custId: ID.cust5,
        sender: "201555555555@c.us",
        state: "COLLECTING_ADDRESS",
        cart: '{"items":[{"name":"حذاء رياضي","qty":1,"price":1200}],"subtotal":1200,"total":1230}',
      },
      {
        id: CONV.c6,
        custId: ID.cust6,
        sender: "201666666666@c.us",
        state: "NEGOTIATING",
        cart: '{"items":[{"name":"جاكيت جلد","qty":1,"price":1800}],"subtotal":1800,"total":1830}',
      },
      {
        id: CONV.c7,
        custId: ID.cust7,
        sender: "201777777777@c.us",
        state: "GREETING",
        cart: '{"items":[],"subtotal":0,"total":0}',
      },
      {
        id: CONV.c8,
        custId: ID.cust8,
        sender: "201888888888@c.us",
        state: "TRACKING",
        cart: '{"items":[],"subtotal":0,"total":0}',
      },
    ];

    // Fix: conversation_state might not have 'BROWSING' — use COLLECTING_ITEMS
    for (const c of convs) {
      const state = [
        "GREETING",
        "COLLECTING_ITEMS",
        "COLLECTING_VARIANTS",
        "COLLECTING_CUSTOMER_INFO",
        "COLLECTING_ADDRESS",
        "NEGOTIATING",
        "CONFIRMING_ORDER",
        "ORDER_PLACED",
        "TRACKING",
        "FOLLOWUP",
        "CLOSED",
      ].includes(c.state)
        ? c.state
        : "COLLECTING_ITEMS";

      await client.query(
        `
        INSERT INTO conversations (id, merchant_id, customer_id, sender_id, state, context, cart,
          collected_info, human_takeover, last_message_at)
        VALUES ($1, $2, $3, $4, $5,
          '{"intent":"shopping","itemsDiscussed":["تيشيرت","جينز"]}'::jsonb,
          $6::jsonb, '{"name":true,"phone":true}'::jsonb, false,
          NOW() - interval '1 hour')
      `,
        [c.id, m, c.custId, c.sender, state, c.cart],
      );
    }
    t++;

    // messages (3-5 per conversation for first 4 conversations)
    const msgTemplates = [
      { dir: "inbound", text: "السلام عليكم، عايز أشوف التيشيرتات" },
      {
        dir: "outbound",
        text: "أهلاً وسهلاً! 👋 عندنا تشكيلة حلوة من التيشيرتات. عايز تشوف إيه بالظبط؟",
      },
      { dir: "inbound", text: "عايز تيشيرت قطن أبيض مقاس L" },
      {
        dir: "outbound",
        text: "تمام! تيشيرت قطن أبيض مقاس L بـ 270 جنيه. تحب تضيفه للسلة؟",
      },
      { dir: "inbound", text: "أيوه ضيفه" },
      {
        dir: "outbound",
        text: "تم إضافة تيشيرت قطن أبيض L للسلة ✅. حاجة تانية ولا نكمل الأوردر؟",
      },
      { dir: "inbound", text: "كمّل الأوردر" },
      { dir: "outbound", text: "محتاج العنوان لو سمحت 📍" },
      { dir: "inbound", text: "المعادي شارع 9 عمارة 15 الدور التالت" },
      {
        dir: "outbound",
        text: "تمام! الأوردر اتأكد ✅\n🛍 تيشيرت قطن أبيض L - 270 ج\n🚚 توصيل: 30 ج\n💰 الإجمالي: 300 ج\nهيوصلك خلال 24-48 ساعة",
      },
    ];

    const convIds = [CONV.c1, CONV.c2, CONV.c3, CONV.c4];
    for (const convId of convIds) {
      const msgCount = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < msgCount && i < msgTemplates.length; i++) {
        const msg = msgTemplates[i];
        await client.query(
          `
          INSERT INTO messages (id, conversation_id, merchant_id, direction, sender_id, text,
            delivery_status, llm_used, tokens_used, created_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
            'DELIVERED', $6, $7, NOW() - $8::interval)
        `,
          [
            convId,
            m,
            msg.dir,
            msg.dir === "inbound" ? "201111111111@c.us" : "system",
            msg.text,
            msg.dir === "outbound",
            msg.dir === "outbound" ? 150 + Math.floor(Math.random() * 200) : 0,
            `${(msgCount - i) * 5} minutes`,
          ],
        );
      }
    }
    t++;

    // followups
    await client.query(
      `
      INSERT INTO followups (id, merchant_id, conversation_id, customer_id, type, status, scheduled_at, message_template) VALUES
        (gen_random_uuid(), $1, $5, $2, 'order_confirmation', 'SENT', NOW() - interval '2 hours', 'أوردرك اتأكد ✅'),
        (gen_random_uuid(), $1, $5, $2, 'delivery_reminder', 'PENDING', NOW() + interval '20 hours', 'أوردرك في الطريق 🚚'),
        (gen_random_uuid(), $1, $6, $3, 'feedback_request', 'PENDING', NOW() + interval '2 days', 'إيه رأيك في المنتجات؟ ⭐'),
        (gen_random_uuid(), $1, $7, $4, 'abandoned_cart', 'PENDING', NOW() + interval '3 hours', 'لسه مكملتش الأوردر! عندنا عرض خاص 🎁')
    `,
      [m, ID.cust1, ID.cust3, ID.cust5, CONV.c1, CONV.c3, CONV.c5],
    );
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 5. ORDERS + ORDER ITEMS + SHIPMENTS
  // ═════════════════════════════════════════════════════════════════
  private async seedOrders(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    const orderItems = [
      {
        orderId: ID.ord1,
        catId: ID.cat1,
        name: "تيشيرت قطن أبيض - L",
        sku: "TSH-001-L",
        qty: 2,
        unit: 250,
        total: 500,
      },
      {
        orderId: ID.ord2,
        catId: ID.cat3,
        name: "بنطلون جينز سليم - M",
        sku: "JNS-001-M",
        qty: 2,
        unit: 450,
        total: 900,
      },
      {
        orderId: ID.ord3,
        catId: ID.cat4,
        name: "فستان صيفي فلورال - M",
        sku: "DRS-001-M",
        qty: 1,
        unit: 550,
        total: 550,
      },
      {
        orderId: ID.ord4,
        catId: ID.cat5,
        name: "حذاء رياضي نايك - 43",
        sku: "SHO-001-43",
        qty: 1,
        unit: 1200,
        total: 1200,
      },
      {
        orderId: ID.ord5,
        catId: ID.cat3,
        name: "بنطلون جينز سليم - L",
        sku: "JNS-001-L",
        qty: 1,
        unit: 450,
        total: 450,
      },
      {
        orderId: ID.ord6,
        catId: ID.cat5,
        name: "حذاء رياضي نايك - 42",
        sku: "SHO-001-42",
        qty: 1,
        unit: 1200,
        total: 1200,
      },
      {
        orderId: ID.ord7,
        catId: ID.cat9,
        name: "جاكيت جلد - L",
        sku: "JKT-001-L",
        qty: 1,
        unit: 1800,
        total: 1800,
      },
      {
        orderId: ID.ord8,
        catId: ID.cat1,
        name: "تيشيرت قطن أبيض - M",
        sku: "TSH-001-M",
        qty: 1,
        unit: 250,
        total: 250,
      },
      {
        orderId: ID.ord8,
        catId: ID.cat3,
        name: "بنطلون جينز سليم - M",
        sku: "JNS-001-M",
        qty: 1,
        unit: 450,
        total: 450,
      },
      {
        orderId: ID.ord9,
        catId: ID.cat11,
        name: "بولو شيرت - L",
        sku: "PLO-001-L",
        qty: 1,
        unit: 320,
        total: 320,
      },
      {
        orderId: ID.ord10,
        catId: ID.cat7,
        name: "ساعة يد كلاسيك",
        sku: "ACC-001",
        qty: 1,
        unit: 950,
        total: 950,
      },
    ];

    const orderItemsByOrderId = orderItems.reduce((acc, item) => {
      const existing = acc.get(item.orderId) || [];
      existing.push(item);
      acc.set(item.orderId, existing);
      return acc;
    }, new Map<string, Array<(typeof orderItems)[number]>>());

    const orderData = [
      {
        id: ID.ord1,
        num: "ORD-2024-001",
        custId: ID.cust1,
        convId: CONV.c1,
        status: "DELIVERED",
        sub: 500,
        del: 30,
        total: 530,
        paid: "PAID",
        method: "COD",
        name: "فاطمة حسن",
        phone: "+201111111111",
      },
      {
        id: ID.ord2,
        num: "ORD-2024-002",
        custId: ID.cust2,
        convId: CONV.c2,
        status: "DELIVERED",
        sub: 900,
        del: 0,
        total: 900,
        paid: "PAID",
        method: "INSTAPAY",
        name: "محمد إبراهيم",
        phone: "+201222222222",
      },
      {
        id: ID.ord3,
        num: "ORD-2024-003",
        custId: ID.cust3,
        convId: CONV.c3,
        status: "CONFIRMED",
        sub: 550,
        del: 30,
        total: 580,
        paid: "PENDING",
        method: "COD",
        name: "نورهان أحمد",
        phone: "+201333333333",
      },
      {
        id: ID.ord4,
        num: "ORD-2024-004",
        custId: ID.cust4,
        convId: CONV.c4,
        status: "SHIPPED",
        sub: 1200,
        del: 30,
        total: 1230,
        paid: "PAID",
        method: "VODAFONE_CASH",
        name: "أحمد سمير",
        phone: "+201444444444",
      },
      {
        id: ID.ord5,
        num: "ORD-2024-005",
        custId: ID.cust4,
        convId: CONV.c4,
        status: "DELIVERED",
        sub: 450,
        del: 0,
        total: 450,
        paid: "PAID",
        method: "COD",
        name: "أحمد سمير",
        phone: "+201444444444",
      },
      {
        id: ID.ord6,
        num: "ORD-2024-006",
        custId: ID.cust5,
        convId: CONV.c5,
        status: "DRAFT",
        sub: 1200,
        del: 30,
        total: 1230,
        paid: "PENDING",
        method: "COD",
        name: "سارة محمود",
        phone: "+201555555555",
      },
      {
        id: ID.ord7,
        num: "ORD-2024-007",
        custId: ID.cust6,
        convId: CONV.c6,
        status: "CANCELLED",
        sub: 1800,
        del: 30,
        total: 1830,
        paid: "PENDING",
        method: "COD",
        name: "عمر خالد",
        phone: "+201666666666",
      },
      {
        id: ID.ord8,
        num: "ORD-2024-008",
        custId: ID.cust8,
        convId: CONV.c8,
        status: "BOOKED",
        sub: 700,
        del: 30,
        total: 730,
        paid: "PENDING",
        method: "COD",
        name: "كريم مصطفى",
        phone: "+201888888888",
      },
      {
        id: ID.ord9,
        num: "ORD-2024-009",
        custId: ID.cust1,
        convId: CONV.c1,
        status: "DELIVERED",
        sub: 320,
        del: 0,
        total: 320,
        paid: "PAID",
        method: "BANK_TRANSFER",
        name: "فاطمة حسن",
        phone: "+201111111111",
      },
      {
        id: ID.ord10,
        num: "ORD-2024-010",
        custId: ID.cust8,
        convId: CONV.c8,
        status: "CONFIRMED",
        sub: 950,
        del: 30,
        total: 980,
        paid: "PENDING",
        method: "COD",
        name: "كريم مصطفى",
        phone: "+201888888888",
      },
    ];

    for (const o of orderData) {
      const seededItems = (orderItemsByOrderId.get(o.id) || []).map((line) => ({
        catalogItemId: line.catId,
        name: line.name,
        sku: line.sku,
        quantity: line.qty,
        unitPrice: line.unit,
        total: line.total,
      }));

      await client.query(
        `
        INSERT INTO orders (id, merchant_id, conversation_id, customer_id, order_number, status,
          items, subtotal, discount, delivery_fee, total,
          customer_name, customer_phone, delivery_address, payment_method, payment_status,
          source_channel, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6,
          $7::jsonb, $8, 0, $9, $10,
          $11, $12,
          '{"city":"cairo","area":"المعادي","street":"شارع 9","building":"15"}'::jsonb,
          $13, $14,
          'whatsapp',
          NOW() - interval '${Math.floor(Math.random() * 14)} days',
          NOW() - interval '${Math.floor(Math.random() * 3)} days')
      `,
        [
          o.id,
          m,
          o.convId,
          o.custId,
          o.num,
          o.status,
          JSON.stringify(seededItems),
          o.sub,
          o.del,
          o.total,
          o.name,
          o.phone,
          o.method,
          o.paid,
        ],
      );
    }
    t++;

    // order_items
    for (const oi of orderItems) {
      await client.query(
        `
        INSERT INTO order_items (id, order_id, catalog_item_id, name, sku, quantity, unit_price, total_price)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
      `,
        [oi.orderId, oi.catId, oi.name, oi.sku, oi.qty, oi.unit, oi.total],
      );
    }
    t++;

    // shipments (for shipped/delivered orders)
    const shippedOrders = [
      {
        orderId: ID.ord1,
        status: "delivered",
        tracking: "BOS-112233",
        courier: "بوسطة",
      },
      {
        orderId: ID.ord2,
        status: "delivered",
        tracking: "BOS-445566",
        courier: "بوسطة",
      },
      {
        orderId: ID.ord4,
        status: "in_transit",
        tracking: "BOS-778899",
        courier: "بوسطة",
      },
      {
        orderId: ID.ord5,
        status: "delivered",
        tracking: "MYL-001122",
        courier: "مايلر",
      },
      { orderId: ID.ord8, status: "pending", tracking: null, courier: "بوسطة" },
      {
        orderId: ID.ord9,
        status: "delivered",
        tracking: "BOS-334455",
        courier: "بوسطة",
      },
    ];

    for (const s of shippedOrders) {
      await client.query(
        `
        INSERT INTO shipments (id, order_id, merchant_id, tracking_id, courier, status, status_history,
          estimated_delivery, actual_delivery)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5,
          $6::jsonb,
          ${s.status === "delivered" ? "NOW() - interval '1 day'" : "NOW() + interval '2 days'"},
          ${s.status === "delivered" ? "NOW() - interval '12 hours'" : "NULL"})
      `,
        [
          s.orderId,
          m,
          s.tracking,
          s.courier,
          s.status,
          JSON.stringify([
            {
              status: "pending",
              at: new Date(Date.now() - 86400000 * 3).toISOString(),
            },
            { status: s.status, at: new Date().toISOString() },
          ]),
        ],
      );
    }
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 6. INVENTORY
  // ═════════════════════════════════════════════════════════════════
  private async seedInventory(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    // inventory_items
    const invItems = [
      { id: ID.inv1, catId: ID.cat1, sku: "TSH-001", loc: "رف A1" },
      { id: ID.inv2, catId: ID.cat3, sku: "JNS-001", loc: "رف A2" },
      { id: ID.inv3, catId: ID.cat5, sku: "SHO-001", loc: "رف B1" },
      { id: ID.inv4, catId: ID.cat6, sku: "BAG-001", loc: "رف B2" },
      { id: ID.inv5, catId: ID.cat9, sku: "JKT-001", loc: "رف C1" },
    ];
    for (const ii of invItems) {
      await client.query(
        `
        INSERT INTO inventory_items (id, merchant_id, catalog_item_id, sku, track_inventory,
          low_stock_threshold, reorder_point, reorder_quantity, location, cost_price)
        VALUES ($1, $2, $3, $4, true, 5, 10, 20, $5, $6)
      `,
        [
          ii.id,
          m,
          ii.catId,
          ii.sku,
          ii.loc,
          50 + Math.floor(Math.random() * 200),
        ],
      );
    }
    t++;

    // inventory_variants
    const vars = [
      {
        id: ID.var1,
        invId: ID.inv1,
        sku: "TSH-001-M",
        name: "تيشيرت أبيض - M",
        qty: 25,
        cost: 120,
      },
      {
        id: ID.var2,
        invId: ID.inv1,
        sku: "TSH-001-L",
        name: "تيشيرت أبيض - L",
        qty: 8,
        cost: 120,
      },
      {
        id: ID.var3,
        invId: ID.inv2,
        sku: "JNS-001-M",
        name: "جينز سليم - M",
        qty: 15,
        cost: 200,
      },
      {
        id: ID.var4,
        invId: ID.inv3,
        sku: "SHO-001-42",
        name: "حذاء نايك - 42",
        qty: 3,
        cost: 600,
      },
      {
        id: ID.var5,
        invId: ID.inv5,
        sku: "JKT-001-L",
        name: "جاكيت جلد - L",
        qty: 12,
        cost: 800,
      },
    ];
    for (const v of vars) {
      await client.query(
        `
        INSERT INTO inventory_variants (id, inventory_item_id, merchant_id, sku, name,
          attributes, quantity_on_hand, quantity_reserved, low_stock_threshold, cost_price, is_active)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 0, 5, $8, true)
      `,
        [
          v.id,
          v.invId,
          m,
          v.sku,
          v.name,
          JSON.stringify({ size: v.sku.split("-").pop() }),
          v.qty,
          v.cost,
        ],
      );
    }
    t++;

    // warehouse_locations
    await client.query(
      `
      INSERT INTO warehouse_locations (id, merchant_id, name, name_ar, address, city, is_default, is_active) VALUES
        ($2, $1, 'Main Warehouse', 'المخزن الرئيسي', 'المنطقة الصناعية، المعادي', 'cairo', true, true),
        ($3, $1, 'Secondary Store', 'المخزن الفرعي', '6 أكتوبر، الحي الأول', 'giza', false, true)
    `,
      [m, ID.wh1, ID.wh2],
    );
    t++;

    // inventory_stock_by_location
    for (const v of [ID.var1, ID.var2, ID.var3, ID.var4, ID.var5]) {
      await client.query(
        `
        INSERT INTO inventory_stock_by_location (id, merchant_id, variant_id, location_id,
          quantity_on_hand, quantity_reserved, bin_location)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, $5)
      `,
        [
          m,
          v,
          ID.wh1,
          10 + Math.floor(Math.random() * 20),
          `A${Math.floor(Math.random() * 10)}-${Math.floor(Math.random() * 5)}`,
        ],
      );
    }
    t++;

    // stock_movements (recent activity)
    const moveTypes = ["SALE", "RESTOCK", "ADJUSTMENT", "RETURN"];
    for (let i = 0; i < 15; i++) {
      const variantId = [ID.var1, ID.var2, ID.var3, ID.var4, ID.var5][i % 5];
      const mt = moveTypes[i % 4];
      const qty =
        mt === "SALE"
          ? -(1 + Math.floor(Math.random() * 3))
          : 5 + Math.floor(Math.random() * 15);
      await client.query(
        `
        INSERT INTO stock_movements (id, merchant_id, variant_id, movement_type, quantity,
          reference_type, notes, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW() - interval '${i} days')
      `,
        [
          m,
          variantId,
          mt,
          qty,
          mt === "SALE" ? "order" : "manual",
          mt === "RESTOCK"
            ? "إعادة تعبئة المخزن"
            : mt === "SALE"
              ? "بيع من أوردر"
              : "تعديل يدوي",
        ],
      );
    }
    t++;

    // stock_alerts
    await client.query(
      `
      INSERT INTO stock_alerts (id, merchant_id, catalog_item_id, alert_type, current_quantity, threshold, acknowledged) VALUES
        (gen_random_uuid(), $1, $2, 'LOW_STOCK', 3, 5, false),
        (gen_random_uuid(), $1, $3, 'LOW_STOCK', 2, 5, false),
        (gen_random_uuid(), $1, $4, 'OUT_OF_STOCK', 0, 5, true)
    `,
      [m, ID.cat5, ID.cat10, ID.cat8],
    );
    t++;

    // inventory_alerts
    await client.query(
      `
      INSERT INTO inventory_alerts (id, merchant_id, variant_id, alert_type, status, severity,
        message, quantity_at_alert, threshold) VALUES
        (gen_random_uuid(), $1, $2, 'LOW_STOCK', 'active', 'warning', 'حذاء نايك 42 - المخزون قليل!', 3, 5),
        (gen_random_uuid(), $1, $3, 'REORDER_NEEDED', 'active', 'info', 'تيشيرت أبيض L - محتاج إعادة طلب', 8, 10)
    `,
      [m, ID.var4, ID.var2],
    );
    t++;

    // suppliers
    await client.query(
      `
      INSERT INTO suppliers (id, merchant_id, name, contact_name, phone, email, payment_terms, lead_time_days, is_active) VALUES
        ($2, $1, 'مصنع النسيج المصري', 'حسام فؤاد', '+201098765432', 'info@nasig.eg', 'net_30', 7, true),
        ($3, $1, 'مصنع الأحذية الحديث', 'سامي نصار', '+201087654321', 'orders@shoes-eg.com', 'net_15', 14, true)
    `,
      [m, ID.sup1, ID.sup2],
    );
    t++;

    // supplier_products — table doesn't exist yet (managed by inventory agent at runtime)

    // inventory_top_movers
    await client.query(
      `
      INSERT INTO inventory_top_movers (id, merchant_id, period, period_start, period_end, top_sellers, slow_movers) VALUES
        (gen_random_uuid(), $1, 'weekly', CURRENT_DATE - 7, CURRENT_DATE,
          '[{"sku":"TSH-001","name":"تيشيرت قطن أبيض","sold":45},{"sku":"JNS-001","name":"جينز سليم","sold":28}]'::jsonb,
          '[{"sku":"SCF-001","name":"إيشارب حرير","sold":2},{"sku":"BLT-001","name":"حزام جلد","sold":3}]'::jsonb)
    `,
      [m],
    );
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 7. DELIVERY
  // ═════════════════════════════════════════════════════════════════
  private async seedDelivery(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    // delivery_drivers
    await client.query(
      `
      INSERT INTO delivery_drivers (id, merchant_id, name, phone, whatsapp_number, status, vehicle_type) VALUES
        ($2, $1, 'عصام محمد', '+201099887766', '+201099887766', 'ACTIVE', 'motorcycle'),
        ($3, $1, 'حسين أحمد', '+201088776655', '+201088776655', 'ACTIVE', 'car'),
        ($4, $1, 'مصطفى سيد', '+201077665544', '+201077665544', 'ON_DELIVERY', 'motorcycle')
    `,
      [m, ID.drv1, ID.drv2, ID.drv3],
    );
    t++;

    // delivery_outcomes
    await client.query(
      `
      INSERT INTO delivery_outcomes (id, merchant_id, order_id, customer_id, outcome, notes, recorded_by) VALUES
        (gen_random_uuid(), $1, $2, $5, 'DELIVERED', 'تم التسليم بنجاح', 'عصام محمد'),
        (gen_random_uuid(), $1, $3, $6, 'DELIVERED', 'العميل استلم في الموعد', 'حسين أحمد'),
        (gen_random_uuid(), $1, $4, $5, 'RETURNED', 'العميل رفض الاستلام - مقاس غلط', 'مصطفى سيد')
    `,
      [m, ID.ord1, ID.ord2, ID.ord7, ID.cust1, ID.cust2],
    );
    t++;

    // delivery_eta_config
    await client.query(
      `
      INSERT INTO delivery_eta_config (id, merchant_id, area_name, avg_delivery_hours, sample_count) VALUES
        (gen_random_uuid(), $1, 'المعادي', 18, 45),
        (gen_random_uuid(), $1, 'مدينة نصر', 24, 32),
        (gen_random_uuid(), $1, 'التجمع الخامس', 20, 28),
        (gen_random_uuid(), $1, '6 أكتوبر', 36, 15)
    `,
      [m],
    );
    t++;

    // Update orders with assigned drivers
    await client.query(
      `UPDATE orders SET assigned_driver_id = $1 WHERE id = $2`,
      [ID.drv3, ID.ord4],
    );
    await client.query(
      `UPDATE orders SET assigned_driver_id = $1 WHERE id = $2`,
      [ID.drv1, ID.ord8],
    );

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 8. PAYMENTS & FINANCE
  // ═════════════════════════════════════════════════════════════════
  private async seedFinance(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    // payment_links
    await client.query(
      `
      INSERT INTO payment_links (id, merchant_id, order_id, customer_id, link_code, amount, currency,
        description, status, expires_at, customer_phone, customer_name, allowed_methods) VALUES
        ($2, $1, $4, $6, 'PAY-DEMO-001', 900, 'EGP', 'دفع أوردر 002', 'PAID',
          NOW() + interval '7 days', '+201222222222', 'محمد إبراهيم', '{INSTAPAY,BANK_TRANSFER,VODAFONE_CASH}'),
        ($3, $1, $5, $7, 'PAY-DEMO-002', 1230, 'EGP', 'دفع أوردر 004', 'PENDING',
          NOW() + interval '7 days', '+201444444444', 'أحمد سمير', '{INSTAPAY,BANK_TRANSFER,VODAFONE_CASH}')
    `,
      [m, ID.pl1, ID.pl2, ID.ord2, ID.ord4, ID.cust2, ID.cust4],
    );
    t++;

    // payment_proofs
    await client.query(
      `
      INSERT INTO payment_proofs (id, merchant_id, payment_link_id, order_id, image_url, status) VALUES
        (gen_random_uuid(), $1, $2, $3, 'https://storage.tash8eel.com/proofs/demo-receipt.jpg', 'APPROVED')
    `,
      [m, ID.pl1, ID.ord2],
    );
    t++;

    // product_cogs — table doesn't exist, cost_price is on inventory_items directly

    // expenses
    await client.query(
      `
      INSERT INTO expenses (id, merchant_id, category, subcategory, description, amount, expense_date, is_recurring, created_by) VALUES
        (gen_random_uuid(), $1, 'إيجار', 'مخزن', 'إيجار المخزن الرئيسي - المعادي', 8000, CURRENT_DATE - 5, true, 'owner'),
        (gen_random_uuid(), $1, 'مرتبات', 'موظفين', 'مرتبات الموظفين - يناير', 25000, CURRENT_DATE - 10, true, 'owner'),
        (gen_random_uuid(), $1, 'شحن', 'بوسطة', 'فاتورة شحن بوسطة - الأسبوع الماضي', 3200, CURRENT_DATE - 3, false, 'admin'),
        (gen_random_uuid(), $1, 'تسويق', 'إعلانات', 'إعلانات فيسبوك - يناير', 5000, CURRENT_DATE - 15, true, 'admin'),
        (gen_random_uuid(), $1, 'مشتريات', 'بضاعة', 'شراء بضاعة جديدة من المصنع', 45000, CURRENT_DATE - 7, false, 'owner')
    `,
      [m],
    );
    t++;

    // cod_collections — table doesn't exist yet (managed by finance agent at runtime)

    // finance_snapshots (last 7 days)
    for (let d = 0; d < 7; d++) {
      const rev = 2000 + Math.floor(Math.random() * 8000);
      const cogs = Math.floor(rev * 0.4);
      const exp = 1000 + Math.floor(Math.random() * 3000);
      await client.query(
        `
        INSERT INTO finance_snapshots (id, merchant_id, snapshot_date, total_revenue, total_cogs,
          gross_profit, total_expenses, net_profit, orders_count, avg_order_value,
          cod_expected, cod_collected, delivery_fees_collected)
        VALUES (gen_random_uuid(), $1, CURRENT_DATE - $2::int, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12)
      `,
        [
          m,
          d,
          rev,
          cogs,
          rev - cogs,
          exp,
          rev - cogs - exp,
          3 + Math.floor(Math.random() * 8),
          Math.floor(rev / (3 + Math.floor(Math.random() * 5))),
          Math.floor(rev * 0.6),
          Math.floor(rev * 0.4),
          30 * (2 + Math.floor(Math.random() * 5)),
        ],
      );
    }
    t++;

    // margin_alerts
    await client.query(
      `
      INSERT INTO margin_alerts (id, merchant_id, alert_type, threshold_value, is_active) VALUES
        (gen_random_uuid(), $1, 'LOW_MARGIN', 20, true),
        (gen_random_uuid(), $1, 'NEGATIVE_PROFIT', 0, true)
    `,
      [m],
    );
    t++;

    // finance_insights
    await client.query(
      `
      INSERT INTO finance_insights (id, merchant_id, insight_type, period_start, period_end,
        title_ar, body_ar, actions, severity) VALUES
        (gen_random_uuid(), $1, 'cost_reduction', CURRENT_DATE - 7, CURRENT_DATE,
          'تكلفة الشحن عالية!', 'تكلفة الشحن وصلت 15% من الإيرادات. حاول تقلل عدد المرتجعات.',
          '[{"type":"view_report","label":"شوف التقرير"}]'::jsonb, 'warning'),
        (gen_random_uuid(), $1, 'revenue_up', CURRENT_DATE - 7, CURRENT_DATE,
          'الإيرادات زادت 20%! 🎉', 'مبروك! إيرادات الأسبوع ده أعلى من اللي فات بـ 20%.',
          '[]'::jsonb, 'info')
    `,
      [m],
    );
    t++;

    // merchant_tax_config
    await client.query(
      `
      INSERT INTO merchant_tax_config (id, merchant_id, vat_rate, tax_enabled, include_vat_in_price)
      VALUES (gen_random_uuid(), $1, 14.00, true, true)
    `,
      [m],
    );
    t++;

    // monthly_closes
    await client.query(
      `
      INSERT INTO monthly_closes (id, merchant_id, year, month, period_start, period_end,
        total_revenue, total_orders, completed_orders, cancelled_orders,
        total_cogs, gross_profit, gross_margin_pct, total_expenses, net_profit, net_margin_pct,
        cod_expected, cod_collected, cod_outstanding, status)
      VALUES (gen_random_uuid(), $1, 2024, 12, '2024-12-01', '2024-12-31',
        85000, 120, 95, 8, 34000, 51000, 60.00, 38000, 13000, 15.29,
        51000, 42000, 9000, 'closed')
    `,
      [m],
    );
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 9. LOYALTY & PROMOTIONS
  // ═════════════════════════════════════════════════════════════════
  private async seedLoyalty(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    // loyalty_tiers
    await client.query(
      `
      INSERT INTO loyalty_tiers (id, merchant_id, name, name_ar, min_points, discount_percentage,
        free_shipping, multiplier, color, icon) VALUES
        ($2, $1, 'Bronze', 'برونزي', 0, 0, false, 1.0, '#CD7F32', 'star'),
        ($3, $1, 'Silver', 'فضي', 500, 5, false, 1.5, '#C0C0C0', 'award'),
        ($4, $1, 'Gold', 'ذهبي', 2000, 10, true, 2.0, '#FFD700', 'crown')
    `,
      [m, ID.tierBronze, ID.tierSilver, ID.tierGold],
    );
    t++;

    // customer_points
    await client.query(
      `
      INSERT INTO customer_points (id, merchant_id, customer_id, current_points, lifetime_points, tier_id) VALUES
        (gen_random_uuid(), $1, $2, 2500, 3200, $7),
        (gen_random_uuid(), $1, $3, 800, 1100, $8),
        (gen_random_uuid(), $1, $4, 3800, 5000, $7),
        (gen_random_uuid(), $1, $5, 150, 150, $9),
        (gen_random_uuid(), $1, $6, 950, 1200, $8)
    `,
      [
        m,
        ID.cust1,
        ID.cust2,
        ID.cust4,
        ID.cust5,
        ID.cust6,
        ID.tierGold,
        ID.tierSilver,
        ID.tierBronze,
      ],
    );
    t++;

    // points_transactions
    await client.query(
      `
      INSERT INTO points_transactions (id, merchant_id, customer_id, type, points, balance_after, source, description) VALUES
        (gen_random_uuid(), $1, $2, 'EARN', 100, 2500, 'order', 'نقاط من أوردر ORD-2024-001'),
        (gen_random_uuid(), $1, $2, 'REDEEM', -50, 2400, 'discount', 'خصم على أوردر'),
        (gen_random_uuid(), $1, $3, 'EARN', 80, 800, 'order', 'نقاط من أوردر ORD-2024-002'),
        (gen_random_uuid(), $1, $4, 'EARN', 200, 3800, 'order', 'نقاط مضاعفة - VIP')
    `,
      [m, ID.cust1, ID.cust2, ID.cust4],
    );
    t++;

    // promotions
    await client.query(
      `
      INSERT INTO promotions (id, merchant_id, name, name_ar, description, type, value, code,
        min_order_amount, max_discount_amount, usage_limit, current_usage,
        start_date, end_date, is_active) VALUES
        ($2, $1, 'Summer Sale', 'خصم الصيف', 'خصم 15% على كل المنتجات', 'PERCENTAGE', 15, 'SUMMER15',
          200, 200, 100, 23, NOW() - interval '10 days', NOW() + interval '20 days', true),
        ($3, $1, 'First Order', 'أول أوردر', 'خصم 50 جنيه على أول أوردر', 'FIXED', 50, 'WELCOME50',
          100, 50, 500, 45, NOW() - interval '30 days', NOW() + interval '60 days', true)
    `,
      [m, ID.promo1, ID.promo2],
    );
    t++;

    // promotion_usage
    await client.query(
      `
      INSERT INTO promotion_usage (id, promotion_id, merchant_id, customer_id, order_id, discount_amount) VALUES
        (gen_random_uuid(), $2, $1, $4, $6, 75),
        (gen_random_uuid(), $3, $1, $5, $7, 50)
    `,
      [m, ID.promo1, ID.promo2, ID.cust2, ID.cust7, ID.ord2, ID.ord6],
    );
    t++;

    // gift_cards
    await client.query(
      `
      INSERT INTO gift_cards (id, merchant_id, code, initial_balance, current_balance,
        recipient_name, message, is_active, expires_at) VALUES
        ($2, $1, 'GIFT-DEMO-500', 500, 350, 'ياسمين طارق', 'كل سنة وانتي طيبة! 🎂', true,
          NOW() + interval '90 days')
    `,
      [m, ID.gc1],
    );
    t++;

    // gift_card_transactions
    await client.query(
      `
      INSERT INTO gift_card_transactions (id, gift_card_id, type, amount, balance_after) VALUES
        (gen_random_uuid(), $1, 'PURCHASE', 500, 500),
        (gen_random_uuid(), $1, 'REDEEM', -150, 350)
    `,
      [ID.gc1],
    );
    t++;

    // customer_referrals
    await client.query(
      `
      INSERT INTO customer_referrals (id, merchant_id, referrer_customer_id, referred_customer_id,
        referral_code, status, referrer_points, referred_points) VALUES
        (gen_random_uuid(), $1, $2, $3, 'REF-FATMA', 'COMPLETED', 200, 100)
    `,
      [m, ID.cust1, ID.cust7],
    );
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 10. NOTIFICATIONS
  // ═════════════════════════════════════════════════════════════════
  private async seedNotifications(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    // notification_templates
    await client.query(
      `
      INSERT INTO notification_templates (id, merchant_id, name, type, title_template, title_ar_template,
        message_template, message_ar_template, default_priority, default_channels, is_active, is_system) VALUES
        (gen_random_uuid(), $1, 'new_order', 'ORDER', 'New Order {{orderNumber}}', 'أوردر جديد {{orderNumber}}',
          'New order from {{customerName}}', 'أوردر جديد من {{customerName}} - {{total}} ج.م', 'HIGH', ARRAY['IN_APP','WHATSAPP'], true, true),
        (gen_random_uuid(), $1, 'low_stock', 'INVENTORY', 'Low Stock Alert', 'تنبيه مخزون قليل',
          '{{productName}} is running low', '{{productName}} - المخزون وصل {{quantity}} قطعة!', 'MEDIUM', ARRAY['IN_APP'], true, true),
        (gen_random_uuid(), $1, 'payment_received', 'PAYMENT', 'Payment Received', 'تم استلام الدفع',
          'Payment of {{amount}} received', 'تم استلام {{amount}} ج.م من {{customerName}}', 'MEDIUM', ARRAY['IN_APP'], true, true)
    `,
      [m],
    );
    t++;

    // notifications (active notifications)
    await client.query(
      `
      INSERT INTO notifications (id, merchant_id, type, title, title_ar, message, message_ar,
        data, priority, channels, is_read) VALUES
        (gen_random_uuid(), $1, 'ORDER_PLACED', 'New Order ORD-2024-010', 'أوردر جديد ORD-2024-010',
          'New order from كريم مصطفى', 'أوردر جديد من كريم مصطفى - 980 ج.م',
          '{"orderId":"${ID.ord10}","orderNumber":"ORD-2024-010"}'::jsonb, 'HIGH', ARRAY['IN_APP','WHATSAPP'], false),
        (gen_random_uuid(), $1, 'LOW_STOCK', 'Low Stock: حذاء رياضي', 'مخزون قليل: حذاء رياضي',
          'Nike Sports Shoes running low (3 left)', 'حذاء رياضي نايك - باقي 3 قطع بس!',
          '{"productId":"${ID.cat5}","quantity":3}'::jsonb, 'MEDIUM', ARRAY['IN_APP'], false),
        (gen_random_uuid(), $1, 'PAYMENT_RECEIVED', 'Payment Received', 'تم استلام دفع',
          'Payment of 900 EGP received from محمد إبراهيم', 'تم استلام 900 ج.م من محمد إبراهيم عن طريق InstaPay',
          '{"orderId":"${ID.ord2}","amount":900}'::jsonb, 'MEDIUM', ARRAY['IN_APP'], true),
        (gen_random_uuid(), $1, 'SYSTEM_ALERT', 'Welcome to Tash8eel!', 'أهلاً في تشغيل! 🎉',
          'Your store is set up and ready', 'المتجر جاهز! ابدأ استقبل أوردرات على واتساب.',
          '{}'::jsonb, 'LOW', ARRAY['IN_APP'], true)
    `,
      [m],
    );
    t++;

    // notification_preferences
    await client.query(
      `
      INSERT INTO notification_preferences (id, merchant_id, staff_id, email_enabled, push_enabled,
        whatsapp_enabled, quiet_hours_start, quiet_hours_end) VALUES
        (gen_random_uuid(), $1, $2, true, true, true, '23:00', '08:00'),
        (gen_random_uuid(), $1, $3, true, true, false, '00:00', '09:00')
    `,
      [m, ID.staffOwner, ID.staffAdmin],
    );
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 11. AI / AGENTS
  // ═════════════════════════════════════════════════════════════════
  private async seedAgents(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    // agent_tasks
    const tasks = [
      {
        type: "OPS_AGENT",
        taskType: "process_order",
        status: "COMPLETED",
        orderId: ID.ord1,
      },
      {
        type: "OPS_AGENT",
        taskType: "process_order",
        status: "COMPLETED",
        orderId: ID.ord2,
      },
      {
        type: "INVENTORY_AGENT",
        taskType: "check_stock",
        status: "COMPLETED",
        orderId: null,
      },
      {
        type: "FINANCE_AGENT",
        taskType: "daily_summary",
        status: "COMPLETED",
        orderId: null,
      },
      {
        type: "SUPPORT_AGENT",
        taskType: "handle_complaint",
        status: "RUNNING",
        orderId: ID.ord7,
      },
      {
        type: "MARKETING_AGENT",
        taskType: "suggest_promo",
        status: "PENDING",
        orderId: null,
      },
    ];
    const taskIds: string[] = [];
    for (const tk of tasks) {
      const taskId = randomUUID();
      taskIds.push(taskId);
      await client.query(
        `
        INSERT INTO agent_tasks (id, agent_type, task_type, merchant_id, order_id, input, status, priority)
        VALUES ($1, $2, $3, $4, $5, '{"source":"demo_seed"}'::jsonb, $6, 5)
      `,
        [taskId, tk.type, tk.taskType, m, tk.orderId, tk.status],
      );
    }
    t++;

    // agent_results (for completed tasks)
    for (let i = 0; i < 4; i++) {
      await client.query(
        `
        INSERT INTO agent_results (id, task_id, agent_type, success, output, execution_time_ms, tokens_used)
        VALUES (gen_random_uuid(), $1, $2, true, '{"result":"success","details":"Demo data"}'::jsonb, $3, $4)
      `,
        [
          taskIds[i],
          tasks[i].type,
          200 + Math.floor(Math.random() * 1000),
          100 + Math.floor(Math.random() * 300),
        ],
      );
    }
    t++;

    // agent_actions
    await client.query(
      `
      INSERT INTO agent_actions (id, merchant_id, agent_type, action_type, severity, title, description, metadata, auto_resolved) VALUES
        (gen_random_uuid(), $1, 'INVENTORY_AGENT', 'LOW_STOCK_ALERT', 'WARNING',
          'حذاء رياضي نايك - مخزون قليل', 'المخزون وصل 3 قطع بس. محتاج إعادة طلب.',
          '{"sku":"SHO-001","currentStock":3,"reorderQty":20}'::jsonb, false),
        (gen_random_uuid(), $1, 'FINANCE_AGENT', 'MARGIN_ALERT', 'INFO',
          'هامش الربح انخفض الأسبوع ده', 'هامش الربح الإجمالي نزل من 62% لـ 55%. مراجعة التكاليف مطلوبة.',
          '{"previousMargin":62,"currentMargin":55}'::jsonb, false),
        (gen_random_uuid(), $1, 'OPS_AGENT', 'ORDER_PROCESSED', 'INFO',
          'أوردر ORD-2024-001 اتعالج بنجاح', 'الأوردر اتأكد واتبعت لشركة الشحن.',
          '{"orderNumber":"ORD-2024-001"}'::jsonb, true),
        (gen_random_uuid(), $1, 'SUPPORT_AGENT', 'COMPLAINT_RECEIVED', 'WARNING',
          'شكوى من عمر خالد', 'العميل بيشتكي إن المقاس مش مظبوط. محتاج متابعة.',
          '{"customerId":"${ID.cust6}","orderNumber":"ORD-2024-007"}'::jsonb, false),
        (gen_random_uuid(), $1, 'MARKETING_AGENT', 'PROMO_SUGGESTED', 'INFO',
          'اقتراح: خصم على الأحذية', 'الأحذية مش بتتباع كويس. ممكن خصم 20% يحرّك المبيعات.',
          '{"category":"أحذية","suggestedDiscount":20}'::jsonb, false)
    `,
      [m],
    );
    t++;

    // copilot_history — table doesn't exist yet (managed by copilot service at runtime)

    // ai_decision_log
    await client.query(
      `
      INSERT INTO ai_decision_log (id, merchant_id, agent_type, decision_type, input_summary,
        decision, reasoning, confidence, entity_type, entity_id) VALUES
        (gen_random_uuid(), $1, 'OPS_AGENT', 'auto_confirm_order', 'أوردر من عميل VIP',
          'تأكيد تلقائي', 'العميل VIP مع 12 أوردر سابق وريسك سكور 5', 0.95, 'ORDER', $2),
        (gen_random_uuid(), $1, 'INVENTORY_AGENT', 'auto_reorder', 'حذاء نايك 42 - مخزون قليل',
          'إرسال طلب شراء للمورّد', 'المخزون 3 قطع. معدل البيع 5/أسبوع. إعادة طلب 20 قطعة.', 0.88, 'PRODUCT', $3),
        (gen_random_uuid(), $1, 'SUPPORT_AGENT', 'escalate_complaint', 'شكوى مقاس غلط',
          'تصعيد للمدير', 'الشكوى متكررة (3 مرات). محتاج تدخل بشري.', 0.75, 'ORDER', $4)
    `,
      [m, ID.ord1, ID.cat5, ID.ord7],
    );
    t++;

    // complaint_playbooks
    await client.query(
      `
      INSERT INTO complaint_playbooks (id, merchant_id, complaint_type, step_number, action_type,
        message_template_ar, requires_photo, auto_compensation_pct) VALUES
        (gen_random_uuid(), $1, 'WRONG_SIZE', 1, 'MESSAGE',
          'آسفين جداً على المشكلة! 😔 ممكن تبعتلنا صورة للمنتج؟', true, NULL),
        (gen_random_uuid(), $1, 'WRONG_SIZE', 2, 'OFFER_EXCHANGE',
          'هنبعتلك المقاس الصح وهنبعت مندوب ياخد القديم. مفيش أي تكلفة عليك.', false, NULL),
        (gen_random_uuid(), $1, 'DAMAGED', 1, 'MESSAGE',
          'آسفين جداً! 😔 ممكن تبعتلنا صورة للمنتج التالف؟', true, NULL),
        (gen_random_uuid(), $1, 'DAMAGED', 2, 'OFFER_REFUND',
          'هنرجعلك {{compensation_pct}}% من المبلغ + هنبعتلك بديل.', false, 50),
        (gen_random_uuid(), $1, 'LATE_DELIVERY', 1, 'MESSAGE',
          'آسفين على التأخير! 🙏 خلينا نتابع الشحنة ونرجعلك.', false, NULL),
        (gen_random_uuid(), NULL, 'LATE_DELIVERY', 2, 'OFFER_DISCOUNT',
          'كتعويض عن التأخير، هنديك خصم {{compensation_pct}}% على الأوردر الجاي.', false, 10)
    `,
      [m],
    );
    t++;

    // upsell_rules
    await client.query(
      `
      INSERT INTO upsell_rules (id, merchant_id, rule_type, source_item_id, target_item_id,
        priority, discount_pct, message_ar, is_active) VALUES
        (gen_random_uuid(), $1, 'CROSS_SELL', $2, $4, 1, 10,
          'مع التيشيرت ده ممكن تضيف حزام جلد بخصم 10%! 🎁', true),
        (gen_random_uuid(), $1, 'UPSELL', $3, $5, 2, 0,
          'لو حابب حاجة أنيقة أكتر، شوف الجاكيت الجلد! 🧥', true),
        (gen_random_uuid(), $1, 'CROSS_SELL', $5, $6, 3, 15,
          'مع الحذاء ده، الشنطة الجلد هتكون تمام عليك!', true)
    `,
      [m, ID.cat1, ID.cat3, ID.cat12, ID.cat5, ID.cat6],
    );
    t++;

    // objection_templates
    await client.query(
      `
      INSERT INTO objection_templates (id, merchant_id, objection_type, keywords, response_template_ar, is_active) VALUES
        (gen_random_uuid(), $1, 'PRICE_HIGH', '{غالي,كتير,غالى}',
          'فاهمك! بس الخامة قطن مصري 100% وبيستحمل غسيل كتير. وكمان ممكن تستخدم كود SUMMER15 تاخد خصم 15%! 🎁', true),
        (gen_random_uuid(), $1, 'DELIVERY_SLOW', '{بطيء,كتير,وقت طويل}',
          'التوصيل بيوصل خلال 24-48 ساعة في القاهرة والجيزة! ولو محتاج أسرع ممكن توصيل express.', true),
        (gen_random_uuid(), $1, 'QUALITY_DOUBT', '{جودة,خامة,مش حلو}',
          'كل منتجاتنا بنختارها بعناية! وعندنا سياسة استرجاع 14 يوم لو مش عاجبك. جرّب وهتحب! ✨', true)
    `,
      [m],
    );
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 12. ANALYTICS & MISC
  // ═════════════════════════════════════════════════════════════════
  private async seedAnalytics(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    // analytics_events
    const events = [
      { name: "page_view", props: { page: "/dashboard", source: "portal" } },
      { name: "page_view", props: { page: "/orders", source: "portal" } },
      {
        name: "order_created",
        props: { orderNumber: "ORD-2024-010", total: 980 },
      },
      {
        name: "product_viewed",
        props: { productId: ID.cat1, productName: "تيشيرت قطن أبيض" },
      },
      {
        name: "conversation_started",
        props: { customerId: ID.cust7, channel: "whatsapp" },
      },
      {
        name: "copilot_query",
        props: { intent: "analytics_query", source: "portal" },
      },
      { name: "payment_received", props: { amount: 900, method: "INSTAPAY" } },
    ];
    for (let i = 0; i < events.length; i++) {
      await client.query(
        `
        INSERT INTO analytics_events (id, merchant_id, staff_id, event_name, event_properties,
          source, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, 'portal', NOW() - interval '${i * 30} minutes')
      `,
        [m, ID.staffOwner, events[i].name, JSON.stringify(events[i].props)],
      );
    }
    t++;

    // recovered_carts
    await client.query(
      `
      INSERT INTO recovered_carts (id, merchant_id, conversation_id, order_id, followup_sent_at,
        order_created_at, cart_value, order_value, is_recovered) VALUES
        (gen_random_uuid(), $1, $2, $3, NOW() - interval '5 hours', NOW() - interval '3 hours',
          500, 530, true),
        (gen_random_uuid(), $1, $4, NULL, NOW() - interval '2 hours', NULL, 1200, NULL, false)
    `,
      [m, CONV.c1, ID.ord1, CONV.c5],
    );
    t++;

    // feature_requests
    await client.query(
      `
      INSERT INTO feature_requests (id, merchant_id, staff_id, title, description, category, status, priority) VALUES
        (gen_random_uuid(), $1, $2, 'ربط مع شوبيفاي', 'محتاج ربط المتجر مع شوبيفاي لسهولة إدارة المنتجات', 'INTEGRATION', 'UNDER_REVIEW', 'HIGH'),
        (gen_random_uuid(), $1, $2, 'تقارير PDF', 'محتاج أقدر أنزّل التقارير PDF', 'FEATURE', 'PLANNED', 'MEDIUM')
    `,
      [m, ID.staffOwner],
    );
    t++;

    // merchant_reports
    for (let d = 0; d < 5; d++) {
      await client.query(
        `
        INSERT INTO merchant_reports (id, merchant_id, report_date, period_type, summary)
        VALUES (gen_random_uuid(), $1, CURRENT_DATE - $2::int, 'daily',
          $3::jsonb)
      `,
        [
          m,
          d,
          JSON.stringify({
            totalOrders: 3 + Math.floor(Math.random() * 8),
            totalRevenue: 2000 + Math.floor(Math.random() * 8000),
            newCustomers: Math.floor(Math.random() * 5),
            avgResponseTime: "2.5 min",
            topProduct: "تيشيرت قطن أبيض",
          }),
        ],
      );
    }
    t++;

    // substitution_suggestions
    await client.query(
      `
      INSERT INTO substitution_suggestions (id, merchant_id, conversation_id, original_product_id,
        suggested_products, customer_message_ar, customer_accepted) VALUES
        (gen_random_uuid(), $1, $2, $3,
          '[{"id":"${ID.cat2}","name":"تيشيرت قطن أسود","price":250}]'::jsonb,
          'الأبيض خلص للأسف! بس عندنا الأسود بنفس السعر. تحب؟', true)
    `,
      [m, CONV.c3, ID.cat1],
    );
    t++;

    // address_cache
    await client.query(
      `
      INSERT INTO address_cache (id, raw_text, city, area, street, building, floor, confidence, missing_fields) VALUES
        (gen_random_uuid(), 'المعادي شارع 9 عمارة 15 الدور 3', 'cairo', 'المعادي', 'شارع 9', '15', '3', 0.95, '{}'),
        (gen_random_uuid(), 'مدينة نصر شارع مصطفى النحاس', 'cairo', 'مدينة نصر', 'شارع مصطفى النحاس', NULL, NULL, 0.70, '{building,floor}')
      ON CONFLICT (raw_text) DO NOTHING
    `,
      [],
    );
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 13. BILLING
  // ═════════════════════════════════════════════════════════════════
  private async seedBilling(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    // billing_plans
    await client.query(
      `
      INSERT INTO billing_plans (id, code, name, price_cents, currency, billing_period, description, features, agents, limits, is_active) VALUES
        ($1, 'STARTER', 'Starter', 44900, 'EGP', 'monthly', 'للتجار الجدد — وكيل عمليات ذكي + ~33 محادثة يومياً',
          '["CONVERSATIONS","ORDERS","CATALOG","VOICE_NOTES","REPORTS","NOTIFICATIONS"]'::jsonb,
          '["OPS_AGENT"]'::jsonb,
          '{"messagesPerMonth":10000,"whatsappNumbers":1,"teamMembers":1,"tokenBudgetDaily":150000,"aiCallsPerDay":300}'::jsonb, true),
        ($2, 'GROWTH', 'Growth', 79900, 'EGP', 'monthly', 'للتجار المتوسعين — +وكيل مخزون + ~50 محادثة يومياً',
          '["CONVERSATIONS","ORDERS","CATALOG","VOICE_NOTES","REPORTS","NOTIFICATIONS","INVENTORY","API_ACCESS"]'::jsonb,
          '["OPS_AGENT","INVENTORY_AGENT"]'::jsonb,
          '{"messagesPerMonth":15000,"whatsappNumbers":2,"teamMembers":2,"tokenBudgetDaily":300000,"aiCallsPerDay":500}'::jsonb, true),
        ($3, 'PRO', 'Pro', 149900, 'EGP', 'monthly', 'للتجار المحترفين — +وكيل مالي + ~167 محادثة يومياً',
          '["CONVERSATIONS","ORDERS","CATALOG","VOICE_NOTES","REPORTS","NOTIFICATIONS","INVENTORY","API_ACCESS","PAYMENTS","VISION_OCR","KPI_DASHBOARD","WEBHOOKS","TEAM","AUDIT_LOGS"]'::jsonb,
          '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
          '{"messagesPerMonth":50000,"whatsappNumbers":3,"teamMembers":3,"tokenBudgetDaily":800000,"aiCallsPerDay":1500}'::jsonb, true),
        ($4, 'ENTERPRISE', 'Enterprise', 299900, 'EGP', 'monthly', 'للمؤسسات الكبيرة — كل الميزات + بلا حدود',
          '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","PAYMENTS","VISION_OCR","VOICE_NOTES","REPORTS","WEBHOOKS","TEAM","NOTIFICATIONS","AUDIT_LOGS","KPI_DASHBOARD","API_ACCESS"]'::jsonb,
          '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
          '{"messagesPerMonth":-1,"whatsappNumbers":-1,"teamMembers":10,"tokenBudgetDaily":-1,"aiCallsPerDay":-1}'::jsonb, true)
    `,
      [ID.planStarter, ID.planGrowth, ID.planPro, ID.planEnterprise],
    );
    t++;

    // merchant_subscriptions
    await client.query(
      `
      INSERT INTO merchant_subscriptions (id, merchant_id, plan_id, status, provider,
        current_period_start, current_period_end, cancel_at_period_end)
      VALUES ($1, $2, $3, 'ACTIVE', 'manual', CURRENT_DATE - 15, CURRENT_DATE + 15, false)
    `,
      [ID.subscription, m, ID.planPro],
    );
    t++;

    // billing_invoices
    await client.query(
      `
      INSERT INTO billing_invoices (id, merchant_id, subscription_id, amount_cents, currency, status, due_date, paid_at) VALUES
        (gen_random_uuid(), $1, $2, 149900, 'EGP', 'PAID', CURRENT_DATE - 15, CURRENT_DATE - 14),
        (gen_random_uuid(), $1, $2, 149900, 'EGP', 'OPEN', CURRENT_DATE + 15, NULL)
    `,
      [m, ID.subscription],
    );
    t++;

    // merchant_addons — table removed in migration 062
    // Add-on tracking is handled via merchant_subscriptions metadata

    // subscription_offers
    await client.query(
      `
      INSERT INTO subscription_offers (id, code, name, name_ar, description, description_ar,
        discount_type, discount_value, applies_to_plan, is_active) VALUES
        (gen_random_uuid(), 'LAUNCH50', 'Launch Offer', 'عرض الإطلاق',
          '50% off first month', 'خصم 50% على أول شهر',
          'PERCENT', 50, 'PRO', true)
      ON CONFLICT (code) DO NOTHING
    `,
      [],
    );
    t++;

    // entitlement_changes
    await client.query(
      `
      INSERT INTO entitlement_changes (id, merchant_id, change_type, entity_type, entity_name,
        previous_value, new_value, changed_by, reason) VALUES
        (gen_random_uuid(), $1, 'UPGRADE', 'PLAN', 'PRO', false, true, 'system', 'خطة اتغيّرت من STARTER لـ PRO')
    `,
      [m],
    );
    t++;

    return t;
  }

  // ═════════════════════════════════════════════════════════════════
  // 14. SECURITY & AUDIT
  // ═════════════════════════════════════════════════════════════════
  private async seedSecurity(client: any): Promise<number> {
    let t = 0;
    const m = ID.merchant;

    // audit_logs (split inserts to avoid type deduction issues with mixed UUID/text params)
    const auditEntries = [
      {
        staffId: ID.staffOwner,
        action: "LOGIN",
        resType: "STAFF",
        resId: ID.staffOwner,
        meta: '{"method":"email"}',
        ip: "41.35.120.100",
      },
      {
        staffId: ID.staffOwner,
        action: "CREATE",
        resType: "ORDER",
        resId: ID.ord10,
        meta: '{"orderNumber":"ORD-2024-010"}',
        ip: "41.35.120.100",
      },
      {
        staffId: ID.staffAdmin,
        action: "UPDATE",
        resType: "PRODUCT",
        resId: ID.cat1,
        meta: '{"field":"price","old":250,"new":280}',
        ip: "41.35.120.101",
      },
      {
        staffId: ID.staffOwner,
        action: "SETTINGS_CHANGE",
        resType: "MERCHANT",
        resId: m,
        meta: '{"field":"enable_followups","old":false,"new":true}',
        ip: "41.35.120.100",
      },
      {
        staffId: ID.staffOwner,
        action: "EXPORT",
        resType: "REPORT",
        resId: null,
        meta: '{"type":"daily","date":"2024-01-10"}',
        ip: "41.35.120.100",
      },
    ];
    for (const e of auditEntries) {
      await client.query(
        `
        INSERT INTO audit_logs (id, merchant_id, staff_id, action, resource_type, resource_id, metadata, ip_address)
        VALUES (gen_random_uuid(), $1, $2::uuid, $3, $4, $5::text, $6::jsonb, $7)
      `,
        [m, e.staffId, e.action, e.resType, e.resId, e.meta, e.ip],
      );
    }
    t++;

    // permission_templates
    await client.query(
      `
      INSERT INTO permission_templates (id, merchant_id, name, description, permissions, is_system) VALUES
        (gen_random_uuid(), NULL, 'Full Access', 'كامل الصلاحيات', '{"all":true}'::jsonb, true),
        (gen_random_uuid(), NULL, 'Orders Only', 'أوردرات فقط', '{"orders":true,"conversations":true}'::jsonb, true),
        (gen_random_uuid(), $1, 'Custom Agent', 'وكيل مخصص', '{"orders":true,"conversations":true,"customers":true,"catalog":false}'::jsonb, false)
      ON CONFLICT (name) DO NOTHING
    `,
      [m],
    );
    t++;

    // webhooks
    await client.query(
      `
      INSERT INTO webhooks (id, merchant_id, name, url, secret, events, status, retry_count) VALUES
        ($2, $1, 'Order Webhook', 'https://hooks.example.com/orders', 'whsec_demo123',
          ARRAY['order.created','order.updated','order.delivered'], 'ACTIVE', 3)
    `,
      [m, ID.wh_hook1],
    );
    t++;

    // webhook_deliveries
    await client.query(
      `
      INSERT INTO webhook_deliveries (id, webhook_id, merchant_id, event_type, payload, status,
        response_status, response_time_ms) VALUES
        (gen_random_uuid(), $2, $1, 'order.created',
          '{"orderId":"${ID.ord10}","orderNumber":"ORD-2024-010"}'::jsonb, 'SUCCESS', 200, 145),
        (gen_random_uuid(), $2, $1, 'order.updated',
          '{"orderId":"${ID.ord4}","status":"SHIPPED"}'::jsonb, 'SUCCESS', 200, 230)
    `,
      [m, ID.wh_hook1],
    );
    t++;

    // integration_endpoints
    await client.query(
      `
      INSERT INTO integration_endpoints (id, merchant_id, provider, type, secret, status, config) VALUES
        (gen_random_uuid(), $1, 'meta_whatsapp', 'INBOUND_WEBHOOK', 'meta_verify_demo_token', 'ACTIVE',
          '{"phoneNumberId":"123456789","wabaId":"987654321"}'::jsonb)
    `,
      [m],
    );
    t++;

    return t;
  }
}
