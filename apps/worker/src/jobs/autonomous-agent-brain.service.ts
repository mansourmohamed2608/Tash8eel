import { Injectable, Inject, Optional, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../infrastructure/database.module";
import {
  LLM_CLIENT,
  ILlmClient,
  AgentReasoningResult,
} from "../infrastructure/llm-client.module";

/**
 * Autonomous Agent Brain (GPT-Enhanced)
 *
 * Runs every hour. Each agent type thinks independently:
 * SQL detects the situation → GPT-4o-mini reasons about it → personalized action.
 *
 * ── Operations Agent ──────────────────────────────────────────
 *  1. Stale conversations — GPT crafts personalized follow-up based on last messages
 *  2. Unassigned orders — auto-assigns to next available driver
 *  3. Overdue orders — flags PROCESSING orders >24h old
 *  4. Customer sentiment — GPT analyzes message tone and recommends priority
 *
 * ── Inventory Agent ──────────────────────────────────────────
 *  5. Auto-reserve stock — holds inventory for PENDING orders
 *  6. Dead stock detection — GPT suggests clearance strategy per product
 *  7. Reorder suggestions — GPT calculates smart reorder quantities
 *  8. Price optimization hint — items with dropping sell-through rate
 *
 * ── Finance Agent ─────────────────────────────────────────────
 *  9. Overdue payments — COD delivered but not collected in 48h
 * 10. Unusual refund rate — GPT analyzes root cause and recommends fix
 * 11. Expense anomaly — single expense >3× the category average
 * 12. Daily revenue milestone — GPT writes a celebration message
 *
 * Every action is logged to `agent_actions` so the merchant can see
 * what each agent did, why, and acknowledge or override it.
 */
@Injectable()
export class AutonomousAgentBrainService {
  private readonly logger = new Logger(AutonomousAgentBrainService.name);
  private orderDriverColumn: "assigned_driver_id" | "driver_id" | null = null;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Optional() @Inject(LLM_CLIENT) private readonly llmClient?: ILlmClient,
  ) {
    if (this.llmClient) {
      this.logger.log(
        "🧠 Agent brain initialized WITH GPT reasoning (AI-enhanced mode)",
      );
    } else {
      this.logger.warn(
        "🧠 Agent brain initialized WITHOUT GPT — running rule-based only",
      );
    }
  }

  // ─── Run every hour at minute 30 ──────────────────────────
  @Cron("30 * * * *")
  async think(): Promise<void> {
    this.logger.log("🧠 Autonomous agent brain starting...");
    const start = Date.now();

    try {
      const merchants = await this.pool.query(
        `SELECT id, name FROM merchants WHERE is_active = true`,
      );

      let totalActions = 0;
      for (const m of merchants.rows) {
        try {
          totalActions += await this.thinkForMerchant(m.id, m.name || m.id);
        } catch (err) {
          this.logger.error(`Agent brain failed for merchant ${m.id}: ${err}`);
        }
      }

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      this.logger.log(
        `🧠 Agent brain done. ${totalActions} actions across ${merchants.rows.length} merchants (${elapsed}s)`,
      );
    } catch (err) {
      this.logger.error(`Agent brain scheduler error: ${err}`);
      // BL-009: persist failure for alerting
      this.pool
        .query(
          `INSERT INTO job_failure_events (job_name, error_message, error_stack)
           VALUES ($1, $2, $3)`,
          ["AutonomousAgentBrain.think", String(err), null],
        )
        .catch(() => {/* non-fatal */});
    }
  }

  private async thinkForMerchant(
    merchantId: string,
    merchantName: string,
  ): Promise<number> {
    // ── Gather full business context for GPT ──────────────────
    const ctx = await this.gatherMerchantContext(merchantId, merchantName);
    let actions = 0;

    // ── Operations Agent ──────────────────────────────────────
    actions += await this.opsAutoFollowUpStaleConversations(
      merchantId,
      merchantName,
      ctx,
    );
    actions += await this.opsAutoAssignUnassignedOrders(merchantId);
    actions += await this.opsFlagOverdueOrders(merchantId);
    actions += await this.opsFlagNegativeSentiment(
      merchantId,
      merchantName,
      ctx,
    );

    // ── Inventory Agent ───────────────────────────────────────
    actions += await this.invAutoReserveStockForPendingOrders(merchantId);
    actions += await this.invDetectDeadStock(merchantId, merchantName, ctx);
    actions += await this.invSuggestReorders(merchantId, merchantName, ctx);
    actions += await this.invPriceOptimizationHint(merchantId);

    // ── Finance Agent ─────────────────────────────────────────
    actions += await this.finFlagOverdueCod(merchantId);
    actions += await this.finDetectRefundSpike(merchantId, merchantName, ctx);
    actions += await this.finDetectExpenseAnomaly(merchantId);
    actions += await this.finRevenueMilestone(merchantId, merchantName, ctx);

    return actions;
  }

  // ═══════════════════════════════════════════════════════════
  //  MERCHANT CONTEXT — full business snapshot for GPT
  // ═══════════════════════════════════════════════════════════

  private async gatherMerchantContext(
    merchantId: string,
    merchantName: string,
  ): Promise<Record<string, any>> {
    try {
      const [profile, stats, topProducts, recentActivity] = await Promise.all([
        // 1. Merchant profile
        this.pool.query(
          `SELECT
             m.name,
             m.category,
             m.phone,
             m.created_at,
             COALESCE(to_jsonb(m)->>'whatsapp_number', '') as whatsapp,
             COALESCE(NULLIF(to_jsonb(m)->>'daily_token_budget', '')::numeric, 100000) as daily_ai_budget,
             COALESCE(
               NULLIF(to_jsonb(m)->>'plan', ''),
               NULLIF(to_jsonb(m)->>'plan_id', ''),
               'TRIAL'
             ) as plan_code
           FROM merchants m
           WHERE m.id = $1`,
          [merchantId],
        ),
        // 2. Business stats (last 30 days + all-time)
        this.pool.query(
          `SELECT
             (SELECT COUNT(*) FROM orders WHERE merchant_id = $1) as total_orders_alltime,
             (SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND created_at > NOW() - INTERVAL '30 days') as orders_30d,
             (SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND DATE(created_at) = CURRENT_DATE) as orders_today,
             (SELECT COALESCE(SUM(total), 0) FROM orders WHERE merchant_id = $1 AND status = 'DELIVERED' AND created_at > NOW() - INTERVAL '30 days') as revenue_30d,
             (SELECT COALESCE(SUM(total), 0) FROM orders WHERE merchant_id = $1 AND status = 'DELIVERED' AND DATE(created_at) = CURRENT_DATE) as revenue_today,
             (SELECT COALESCE(AVG(total), 0) FROM orders WHERE merchant_id = $1 AND status = 'DELIVERED' AND created_at > NOW() - INTERVAL '30 days') as avg_order_value,
             (SELECT COUNT(DISTINCT sender_id) FROM conversations WHERE merchant_id = $1) as total_customers,
             (SELECT COUNT(DISTINCT sender_id) FROM conversations WHERE merchant_id = $1 AND created_at > NOW() - INTERVAL '7 days') as active_customers_7d,
             (SELECT COUNT(*) FROM catalog_items WHERE merchant_id = $1 AND is_available = true) as active_products,
             (SELECT COUNT(*) FROM inventory_variants iv JOIN inventory_items ii ON ii.id = iv.inventory_item_id WHERE ii.merchant_id = $1 AND iv.quantity_on_hand <= COALESCE(iv.low_stock_threshold, 5) AND iv.quantity_on_hand >= 0) as low_stock_count,
             (SELECT COUNT(*) FROM delivery_drivers WHERE merchant_id = $1 AND status = 'ACTIVE') as active_drivers,
             (SELECT COUNT(*) FROM conversations WHERE merchant_id = $1 AND state != 'CLOSED') as open_conversations,
             (SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND status IN ('CONFIRMED','BOOKED','SHIPPED','OUT_FOR_DELIVERY') AND updated_at < NOW() - INTERVAL '24 hours') as overdue_orders
          `,
          [merchantId],
        ),
        // 3. Top selling products (last 30 days)
        this.pool.query(
          `SELECT
             COALESCE(item->>'name', item->>'productName', item->>'title', 'منتج') as name,
             SUM(COALESCE(NULLIF(item->>'quantity','')::int, 1)) as sold,
             SUM(
               COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
               * COALESCE(NULLIF(item->>'unitPrice','')::numeric, NULLIF(item->>'price','')::numeric, 0)
             ) as revenue
           FROM orders o
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE
               WHEN o.items IS NULL THEN '[]'::jsonb
               WHEN jsonb_typeof(o.items::jsonb) = 'array' THEN o.items::jsonb
               ELSE '[]'::jsonb
             END
           ) as item
           WHERE o.merchant_id = $1
             AND o.created_at > NOW() - INTERVAL '30 days'
             AND o.status NOT IN ('CANCELLED', 'DRAFT')
           GROUP BY name
           ORDER BY sold DESC
           LIMIT 5`,
          [merchantId],
        ),
        // 4. Recent agent actions (last 24h)
        this.pool.query(
          `SELECT action_type, severity, title, created_at
           FROM agent_actions
           WHERE merchant_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
           ORDER BY created_at DESC
           LIMIT 10`,
          [merchantId],
        ),
      ]);

      const p = profile.rows[0] || {};
      const s = stats.rows[0] || {};

      return {
        merchant: {
          name: merchantName,
          category: p.category || "unknown",
          plan: p.plan_code || "TRIAL",
          activeSince: p.created_at
            ? new Date(p.created_at).toISOString().split("T")[0]
            : "unknown",
        },
        businessStats: {
          totalOrdersAllTime: parseInt(s.total_orders_alltime) || 0,
          orders30d: parseInt(s.orders_30d) || 0,
          ordersToday: parseInt(s.orders_today) || 0,
          revenue30dEGP: Math.round(parseFloat(s.revenue_30d) || 0),
          revenueTodayEGP: Math.round(parseFloat(s.revenue_today) || 0),
          avgOrderValueEGP: Math.round(parseFloat(s.avg_order_value) || 0),
          totalCustomers: parseInt(s.total_customers) || 0,
          activeCustomers7d: parseInt(s.active_customers_7d) || 0,
          activeProducts: parseInt(s.active_products) || 0,
          lowStockCount: parseInt(s.low_stock_count) || 0,
          activeDrivers: parseInt(s.active_drivers) || 0,
          openConversations: parseInt(s.open_conversations) || 0,
          overdueOrders: parseInt(s.overdue_orders) || 0,
        },
        topProducts: topProducts.rows.slice(0, 5).map((r) => ({
          name: r.name,
          sold: parseInt(r.sold),
          revenueEGP: Math.round(parseFloat(r.revenue)),
        })),
        recentAgentActions: recentActivity.rows.map((r) => ({
          type: r.action_type,
          severity: r.severity,
          title: r.title,
        })),
      };
    } catch (err) {
      this.logger.warn(
        `Failed to gather merchant context for ${merchantId}: ${err}`,
      );
      return { merchant: { name: merchantName }, error: "context_unavailable" };
    }
  }

  /**
   * Ask GPT to reason about a detected situation.
   * Merges the full business snapshot into contextData so GPT has
   * complete merchant context for every decision.
   * Falls back to null if LLM client is unavailable or call fails.
   */
  private async askGpt(
    merchantId: string,
    merchantName: string,
    agentType: string,
    checkType: string,
    contextData: Record<string, any>,
    merchantContext?: Record<string, any>,
  ): Promise<AgentReasoningResult | null> {
    if (!this.llmClient) return null;
    try {
      // Merge full business snapshot so GPT sees everything
      const enrichedContext = merchantContext
        ? { businessSnapshot: merchantContext, ...contextData }
        : contextData;

      return await this.llmClient.agentReason({
        merchantId,
        merchantName,
        agentType,
        checkType,
        contextData: enrichedContext,
      });
    } catch (err) {
      this.logger.warn(`GPT reasoning failed for ${checkType}: ${err}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  OPERATIONS AGENT
  // ═══════════════════════════════════════════════════════════

  /**
   * 1. Stale conversations — if customer sent a message >4h ago
   *    with no merchant/agent reply, auto-queue a follow-up.
   */
  private async opsAutoFollowUpStaleConversations(
    merchantId: string,
    merchantName: string,
    ctx: Record<string, any>,
  ): Promise<number> {
    try {
      // Get stale conversations WITH last customer message for GPT context
      const stale = await this.pool.query(
        `SELECT c.id, c.sender_id, c.last_message_at,
                (SELECT m.text FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'INBOUND' ORDER BY m.created_at DESC LIMIT 1) as last_customer_msg
         FROM conversations c
         WHERE c.merchant_id = $1
           AND c.state != 'CLOSED'
           AND c.last_message_at < NOW() - INTERVAL '4 hours'
           AND c.last_message_at > NOW() - INTERVAL '24 hours'
           AND NOT EXISTS (
             SELECT 1 FROM followups f
             WHERE f.conversation_id = c.id
               AND f.status = 'PENDING'
           )
         LIMIT 20`,
        [merchantId],
      );

      if (stale.rows.length === 0) return 0;

      for (const conv of stale.rows) {
        // Ask GPT to craft a personalized follow-up based on last message
        let followupMsg = "مرحباً! هل تحتاج مساعدة إضافية؟ نحن هنا لخدمتك 😊";
        const gpt = await this.askGpt(
          merchantId,
          merchantName,
          "OPS_AGENT",
          "STALE_FOLLOWUP",
          {
            conversationId: conv.id,
            lastCustomerMessage: conv.last_customer_msg || "(no message)",
            hoursSinceLastMessage: Math.round(
              (Date.now() - new Date(conv.last_message_at).getTime()) / 3600000,
            ),
          },
          ctx,
        );
        if (gpt?.personalizedMessage) {
          followupMsg = gpt.personalizedMessage;
        }

        await this.pool.query(
          `INSERT INTO followups (conversation_id, merchant_id, type, message_template, scheduled_at, status)
           VALUES ($1, $2, 'AUTO_FOLLOWUP', $3, NOW() + INTERVAL '5 minutes', 'PENDING')
           ON CONFLICT DO NOTHING`,
          [conv.id, merchantId, followupMsg],
        );
      }

      await this.logAction(
        merchantId,
        "OPS_AGENT",
        "AUTO_FOLLOWUP",
        "ACTION",
        `📨 تم جدولة ${stale.rows.length} متابعة تلقائية ذكية`,
        `${stale.rows.length} محادثة بدون رد لأكثر من 4 ساعات. تم إرسال رسائل متابعة مخصصة لكل عميل.`,
        {
          conversationIds: stale.rows.map((r) => r.id),
          count: stale.rows.length,
          gptEnhanced: !!this.llmClient,
        },
        true,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`opsAutoFollowUp failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  /**
   * 2. Unassigned orders — CONFIRMED orders with no driver assigned,
   *    auto-assign to the least-busy active driver.
   */
  private async opsAutoAssignUnassignedOrders(
    merchantId: string,
  ): Promise<number> {
    try {
      const driverColumn = await this.resolveOrderDriverColumn();
      const unassigned = await this.pool.query(
        `SELECT o.id, o.order_number
         FROM orders o
         WHERE o.merchant_id = $1
           AND o.status = 'CONFIRMED'
           AND o.${driverColumn} IS NULL
           AND o.created_at > NOW() - INTERVAL '12 hours'
         ORDER BY o.created_at ASC
         LIMIT 10`,
        [merchantId],
      );

      if (unassigned.rows.length === 0) return 0;

      // Find least-busy active driver
      const driver = await this.pool.query(
        `SELECT dd.id, dd.name,
                COUNT(o.id) FILTER (WHERE o.status IN ('CONFIRMED','BOOKED','SHIPPED','OUT_FOR_DELIVERY')) as active_orders
         FROM delivery_drivers dd
         LEFT JOIN orders o ON o.${driverColumn} = dd.id
         WHERE dd.merchant_id = $1 AND dd.status = 'ACTIVE'
         GROUP BY dd.id, dd.name
         ORDER BY active_orders ASC
         LIMIT 1`,
        [merchantId],
      );

      if (driver.rows.length === 0) {
        // No drivers available — notify merchant
        await this.logAction(
          merchantId,
          "OPS_AGENT",
          "NO_DRIVERS_AVAILABLE",
          "WARNING",
          `⚠️ ${unassigned.rows.length} طلب بدون سائق ولا يوجد سائق متاح`,
          `هناك طلبات مؤكدة تحتاج توصيل ولكن لا يوجد سائق نشط. أضف سائقين من صفحة التوصيل.`,
          { orderIds: unassigned.rows.map((r) => r.id) },
          false,
        );
        return 1;
      }

      const d = driver.rows[0];
      const assignedIds: string[] = [];

      for (const order of unassigned.rows) {
        await this.pool.query(
          `UPDATE orders SET ${driverColumn} = $1, updated_at = NOW() WHERE id = $2`,
          [d.id, order.id],
        );
        assignedIds.push(order.order_number);
      }

      await this.logAction(
        merchantId,
        "OPS_AGENT",
        "AUTO_ASSIGN_DRIVER",
        "ACTION",
        `🚚 تم تعيين ${assignedIds.length} طلب للسائق ${d.name} تلقائياً`,
        `الطلبات: ${assignedIds.join("، ")}. السائق ${d.name} كان الأقل طلبات نشطة.`,
        { driverId: d.id, driverName: d.name, orderNumbers: assignedIds },
        true,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`opsAutoAssign failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  /**
   * 3. Overdue orders — PROCESSING for >24h without status change.
   */
  private async opsFlagOverdueOrders(merchantId: string): Promise<number> {
    try {
      const overdue = await this.pool.query(
        `SELECT id, order_number, status, created_at
         FROM orders
         WHERE merchant_id = $1
           AND status IN ('CONFIRMED', 'BOOKED', 'SHIPPED', 'OUT_FOR_DELIVERY')
           AND updated_at < NOW() - INTERVAL '24 hours'
           AND created_at > NOW() - INTERVAL '7 days'
         LIMIT 20`,
        [merchantId],
      );

      if (overdue.rows.length === 0) return 0;

      await this.logAction(
        merchantId,
        "OPS_AGENT",
        "OVERDUE_ORDERS",
        "WARNING",
        `⏰ ${overdue.rows.length} طلب متأخر أكثر من 24 ساعة`,
        `الطلبات التالية لم تتحرك منذ أكثر من يوم: ${overdue.rows
          .slice(0, 5)
          .map((r) => r.order_number)
          .join("، ")}. الرجاء مراجعتها.`,
        { orderNumbers: overdue.rows.map((r) => r.order_number) },
        false,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`opsFlagOverdue failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  /**
   * 4. Negative sentiment — conversations mentioning complaint keywords.
   */
  private async opsFlagNegativeSentiment(
    merchantId: string,
    merchantName: string,
    ctx: Record<string, any>,
  ): Promise<number> {
    try {
      const negative = await this.pool.query(
        `SELECT c.id, c.sender_id, m.text
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.merchant_id = $1
           AND m.direction = 'INBOUND'
           AND m.created_at > NOW() - INTERVAL '2 hours'
           AND c.state != 'CLOSED'
           AND (
             m.text ILIKE '%شكوى%' OR m.text ILIKE '%مشكلة%' OR m.text ILIKE '%سيء%'
             OR m.text ILIKE '%رد فلوسي%' OR m.text ILIKE '%اتأخر%' OR m.text ILIKE '%متضايق%'
             OR m.text ILIKE '%complaint%' OR m.text ILIKE '%refund%' OR m.text ILIKE '%worst%'
           )
           AND NOT EXISTS (
             SELECT 1 FROM agent_actions aa
             WHERE aa.merchant_id = $1 AND aa.action_type = 'NEGATIVE_SENTIMENT'
               AND aa.metadata->>'conversationId' = c.id::text
               AND aa.created_at > NOW() - INTERVAL '12 hours'
           )
         LIMIT 10`,
        [merchantId],
      );

      if (negative.rows.length === 0) return 0;

      // Auto-mark as high priority
      const convIds = negative.rows.map((r) => r.id);
      try {
        await this.pool.query(
          `UPDATE conversations SET priority = 'HIGH', updated_at = NOW()
           WHERE id = ANY($1) AND priority != 'HIGH'`,
          [convIds],
        );
      } catch (error: any) {
        if (error?.code !== "42703") throw error;
      }

      // Ask GPT to analyze the complaints and recommend a response strategy
      const gpt = await this.askGpt(
        merchantId,
        merchantName,
        "OPS_AGENT",
        "NEGATIVE_SENTIMENT",
        {
          complainingMessages: negative.rows.slice(0, 5).map((r) => r.text),
          count: negative.rows.length,
        },
        ctx,
      );

      const title =
        gpt?.titleAr ||
        `🔴 ${negative.rows.length} محادثة تحتوي شكوى أو عدم رضا`;
      const desc =
        gpt?.descriptionAr ||
        `تم رفع أولوية المحادثات تلقائياً. الرجاء التدخل لحل المشكلة وكسب رضا العميل.`;
      const severity = gpt?.severity || "CRITICAL";

      await this.logAction(
        merchantId,
        "OPS_AGENT",
        "NEGATIVE_SENTIMENT",
        severity,
        title,
        desc,
        { conversationIds: convIds, gptReasoning: gpt?.reasoning },
        true,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`opsFlagSentiment failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  INVENTORY AGENT
  // ═══════════════════════════════════════════════════════════

  /**
   * 5. Auto-reserve stock for pending orders that haven't been reserved yet.
   */
  private async invAutoReserveStockForPendingOrders(
    merchantId: string,
  ): Promise<number> {
    try {
      const unReserved = await this.pool.query(
        `WITH pending_items AS (
           SELECT
             COALESCE(item->>'variantId', item->>'variant_id') as variant_id,
             SUM(COALESCE(NULLIF(item->>'quantity','')::int, 1)) as needed
           FROM orders o
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE
               WHEN o.items IS NULL THEN '[]'::jsonb
               WHEN jsonb_typeof(o.items::jsonb) = 'array' THEN o.items::jsonb
               ELSE '[]'::jsonb
             END
           ) as item
           WHERE o.merchant_id = $1
             AND o.status IN ('DRAFT', 'CONFIRMED', 'BOOKED')
             AND o.created_at > NOW() - INTERVAL '48 hours'
             AND COALESCE(item->>'variantId', item->>'variant_id', '') ~* '^[0-9a-f-]{36}$'
           GROUP BY COALESCE(item->>'variantId', item->>'variant_id')
         )
         SELECT
           pi.variant_id::uuid as variant_id,
           pi.needed,
           iv.quantity_on_hand as available,
           COALESCE(iv.name, ii.name, ii.sku) as item_name
         FROM pending_items pi
         JOIN inventory_variants iv ON iv.id = pi.variant_id::uuid
         JOIN inventory_items ii ON ii.id = iv.inventory_item_id
         WHERE ii.merchant_id = $1
           AND COALESCE(iv.quantity_reserved, 0) = 0
           AND pi.needed <= COALESCE(iv.quantity_on_hand, 0)
         LIMIT 50`,
        [merchantId],
      );

      if (unReserved.rows.length === 0) return 0;

      let reserved = 0;
      for (const item of unReserved.rows) {
        await this.pool.query(
          `UPDATE inventory_variants
           SET quantity_reserved = COALESCE(quantity_reserved, 0) + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [item.needed, item.variant_id],
        );
        reserved++;
      }

      await this.logAction(
        merchantId,
        "INVENTORY_AGENT",
        "AUTO_RESERVE_STOCK",
        "ACTION",
        `📦 تم حجز مخزون ${reserved} منتج تلقائياً للطلبات المعلقة`,
        `تم حجز الكميات لضمان عدم نفاد المخزون أثناء تجهيز الطلبات.`,
        { reservedVariants: reserved },
        true,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`invAutoReserve failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  /**
   * 6. Dead stock — items with 0 orders in 30+ days but still in stock.
   */
  private async invDetectDeadStock(
    merchantId: string,
    merchantName: string,
    ctx: Record<string, any>,
  ): Promise<number> {
    try {
      const dead = await this.pool.query(
        `SELECT ii.id, COALESCE(ii.name, ii.sku) as name, iv.quantity_on_hand,
                COALESCE(iv.cost_price, ii.cost_price, 0) * iv.quantity_on_hand as stuck_value
         FROM inventory_items ii
         JOIN inventory_variants iv ON iv.inventory_item_id = ii.id
         WHERE ii.merchant_id = $1
           AND iv.quantity_on_hand > 0
           AND NOT EXISTS (
             SELECT 1
             FROM orders o
             CROSS JOIN LATERAL jsonb_array_elements(
               CASE
                 WHEN o.items IS NULL THEN '[]'::jsonb
                 WHEN jsonb_typeof(o.items::jsonb) = 'array' THEN o.items::jsonb
                 ELSE '[]'::jsonb
               END
             ) as item
             WHERE o.merchant_id = $1
               AND o.created_at > NOW() - INTERVAL '30 days'
               AND o.status NOT IN ('CANCELLED', 'DRAFT')
               AND (
                 item->>'variantId' = iv.id::text
                 OR item->>'variant_id' = iv.id::text
                 OR COALESCE(item->>'sku', '') = COALESCE(iv.sku, '')
               )
           )
         ORDER BY stuck_value DESC
         LIMIT 15`,
        [merchantId],
      );

      if (dead.rows.length === 0) return 0;

      const totalValue = dead.rows.reduce(
        (s, r) => s + parseFloat(r.stuck_value || 0),
        0,
      );
      const names = dead.rows
        .slice(0, 4)
        .map((r) => r.name)
        .join("، ");

      // GPT suggests clearance strategy for dead stock
      const gpt = await this.askGpt(
        merchantId,
        merchantName,
        "INVENTORY_AGENT",
        "DEAD_STOCK",
        {
          deadItems: dead.rows
            .slice(0, 8)
            .map((r) => ({
              name: r.name,
              qty: r.quantity_on_hand,
              stuckValueEGP: Math.round(parseFloat(r.stuck_value || 0)),
            })),
          totalStuckValueEGP: Math.round(totalValue),
          totalProducts: dead.rows.length,
        },
        ctx,
      );

      const title =
        gpt?.titleAr ||
        `📉 ${dead.rows.length} منتج راكد بقيمة ${Math.round(totalValue)} ج.م`;
      const desc =
        gpt?.descriptionAr ||
        `منتجات لم تُباع منذ 30 يوم+: ${names}. فكر في عمل خصم أو حزم عروض لتحريكها.`;

      await this.logAction(
        merchantId,
        "INVENTORY_AGENT",
        "DEAD_STOCK",
        gpt?.severity || "WARNING",
        title,
        desc,
        {
          items: dead.rows.map((r) => ({
            id: r.id,
            name: r.name,
            qty: r.quantity_on_hand,
            value: r.stuck_value,
          })),
          gptReasoning: gpt?.reasoning,
        },
        false,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`invDeadStock failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  /**
   * 7. Reorder suggestions — items below reorder point.
   */
  private async invSuggestReorders(
    merchantId: string,
    merchantName: string,
    ctx: Record<string, any>,
  ): Promise<number> {
    try {
      const low = await this.pool.query(
        `SELECT COALESCE(ii.name, ii.sku) as name, iv.id as variant_id, iv.sku,
                iv.quantity_on_hand, COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, 5) as low_stock_threshold,
                COALESCE(ii.reorder_quantity, ii.reorder_point, iv.low_stock_threshold * 3, 15) as suggested_qty
         FROM inventory_variants iv
         JOIN inventory_items ii ON ii.id = iv.inventory_item_id
         WHERE ii.merchant_id = $1
           AND iv.quantity_on_hand <= COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, 5)
           AND iv.quantity_on_hand >= 0
           AND NOT EXISTS (
             SELECT 1 FROM agent_actions aa
             WHERE aa.merchant_id = $1 AND aa.action_type = 'REORDER_SUGGESTION'
               AND aa.metadata->>'variantId' = iv.id::text
               AND aa.created_at > NOW() - INTERVAL '48 hours'
           )
         ORDER BY iv.quantity_on_hand ASC
         LIMIT 15`,
        [merchantId],
      );

      if (low.rows.length === 0) return 0;

      const names = low.rows
        .slice(0, 4)
        .map((r) => `${r.name} (${r.quantity_on_hand} متبقي)`)
        .join("، ");

      // GPT calculates smarter reorder quantities and urgency
      const gpt = await this.askGpt(
        merchantId,
        merchantName,
        "INVENTORY_AGENT",
        "REORDER_SUGGESTION",
        {
          lowStockItems: low.rows.slice(0, 10).map((r) => ({
            name: r.name,
            sku: r.sku,
            onHand: r.quantity_on_hand,
            threshold: r.low_stock_threshold,
            suggestedQty: r.suggested_qty,
          })),
          totalItems: low.rows.length,
        },
        ctx,
      );

      const title =
        gpt?.titleAr || `🔄 ${low.rows.length} منتج يحتاج إعادة طلب`;
      const desc =
        gpt?.descriptionAr ||
        `المنتجات التالية وصلت لحد إعادة الطلب: ${names}. الكمية المقترحة في التفاصيل.`;

      await this.logAction(
        merchantId,
        "INVENTORY_AGENT",
        "REORDER_SUGGESTION",
        gpt?.severity || "WARNING",
        title,
        desc,
        {
          items: low.rows.map((r) => ({
            variantId: r.variant_id,
            name: r.name,
            sku: r.sku,
            onHand: r.quantity_on_hand,
            threshold: r.low_stock_threshold,
            suggestedQty: r.suggested_qty,
          })),
          gptReasoning: gpt?.reasoning,
        },
        false,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`invSuggestReorders failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  /**
   * 8. Price optimization — items with sell-through rate dropping vs last month.
   */
  private async invPriceOptimizationHint(merchantId: string): Promise<number> {
    try {
      const dropping = await this.pool.query(
        `WITH this_month AS (
           SELECT
             COALESCE(item->>'variantId', item->>'variant_id') as variant_id,
             SUM(COALESCE(NULLIF(item->>'quantity','')::int, 1)) as sold
           FROM orders o
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE
               WHEN o.items IS NULL THEN '[]'::jsonb
               WHEN jsonb_typeof(o.items::jsonb) = 'array' THEN o.items::jsonb
               ELSE '[]'::jsonb
             END
           ) as item
           WHERE o.merchant_id = $1 AND o.created_at > NOW() - INTERVAL '14 days'
             AND o.status NOT IN ('CANCELLED', 'DRAFT')
             AND COALESCE(item->>'variantId', item->>'variant_id', '') ~* '^[0-9a-f-]{36}$'
           GROUP BY COALESCE(item->>'variantId', item->>'variant_id')
         ),
         last_month AS (
           SELECT
             COALESCE(item->>'variantId', item->>'variant_id') as variant_id,
             SUM(COALESCE(NULLIF(item->>'quantity','')::int, 1)) as sold
           FROM orders o
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE
               WHEN o.items IS NULL THEN '[]'::jsonb
               WHEN jsonb_typeof(o.items::jsonb) = 'array' THEN o.items::jsonb
               ELSE '[]'::jsonb
             END
           ) as item
           WHERE o.merchant_id = $1
             AND o.created_at BETWEEN NOW() - INTERVAL '45 days' AND NOW() - INTERVAL '15 days'
             AND o.status NOT IN ('CANCELLED', 'DRAFT')
             AND COALESCE(item->>'variantId', item->>'variant_id', '') ~* '^[0-9a-f-]{36}$'
           GROUP BY COALESCE(item->>'variantId', item->>'variant_id')
         )
         SELECT COALESCE(ii.name, ii.sku) as name,
                COALESCE(ii.price, 0) + COALESCE(iv.price_modifier, 0) as price,
                COALESCE(tm.sold, 0) as current_sold,
                COALESCE(lm.sold, 0) as previous_sold
         FROM inventory_variants iv
         JOIN inventory_items ii ON ii.id = iv.inventory_item_id
         LEFT JOIN this_month tm ON tm.variant_id::uuid = iv.id
         LEFT JOIN last_month lm ON lm.variant_id::uuid = iv.id
         WHERE ii.merchant_id = $1
           AND COALESCE(lm.sold, 0) >= 5
           AND COALESCE(tm.sold, 0) < COALESCE(lm.sold, 0) * 0.5
         LIMIT 10`,
        [merchantId],
      );

      if (dropping.rows.length === 0) return 0;

      const names = dropping.rows
        .slice(0, 3)
        .map(
          (r) =>
            `${r.name} (${r.current_sold} مقابل ${r.previous_sold} سابقاً)`,
        )
        .join("، ");

      await this.logAction(
        merchantId,
        "INVENTORY_AGENT",
        "PRICE_OPTIMIZATION",
        "INFO",
        `💡 ${dropping.rows.length} منتج تراجعت مبيعاته — فرصة لتعديل السعر`,
        `المنتجات التالية انخفضت مبيعاتها >50%: ${names}. فكر في خصم أو عرض.`,
        { items: dropping.rows },
        false,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`invPriceOpt failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  FINANCE AGENT
  // ═══════════════════════════════════════════════════════════

  /**
   * 9. Overdue COD — delivered orders with unpaid COD for >48h.
   */
  private async finFlagOverdueCod(merchantId: string): Promise<number> {
    try {
      const overdue = await this.pool.query(
        `SELECT id, order_number, total, updated_at
         FROM orders
         WHERE merchant_id = $1
           AND payment_method = 'COD'
           AND payment_status = 'PENDING'
           AND status = 'DELIVERED'
           AND updated_at < NOW() - INTERVAL '48 hours'
         LIMIT 20`,
        [merchantId],
      );

      if (overdue.rows.length === 0) return 0;

      const total = overdue.rows.reduce(
        (s, r) => s + parseFloat(r.total || 0),
        0,
      );
      const nums = overdue.rows
        .slice(0, 5)
        .map((r) => r.order_number)
        .join("، ");

      await this.logAction(
        merchantId,
        "FINANCE_AGENT",
        "OVERDUE_COD",
        "CRITICAL",
        `💸 ${overdue.rows.length} طلب COD متأخر التحصيل — ${Math.round(total)} ج.م`,
        `طلبات تم توصيلها ولم توثق الدفع بعد 48 ساعة: ${nums}. راجع صفحة مطابقة COD.`,
        {
          orderNumbers: overdue.rows.map((r) => r.order_number),
          totalAmount: total,
        },
        false,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`finOverdueCod failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  /**
   * 10. Refund spike — refund rate >15% in last 7 days.
   */
  private async finDetectRefundSpike(
    merchantId: string,
    merchantName: string,
    ctx: Record<string, any>,
  ): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT
           (SELECT COUNT(*) FROM refunds WHERE merchant_id = $1 AND status = 'APPROVED' AND created_at > NOW() - INTERVAL '7 days') as refunded,
           (SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND status NOT IN ('CANCELLED', 'DRAFT') AND created_at > NOW() - INTERVAL '7 days') as total`,
        [merchantId],
      );

      const { refunded, total } = result.rows[0];
      if (parseInt(total) < 5) return 0;

      const rate = parseInt(refunded) / parseInt(total);
      if (rate <= 0.15) return 0;

      // GPT analyzes root cause and recommends a fix
      const gpt = await this.askGpt(
        merchantId,
        merchantName,
        "FINANCE_AGENT",
        "REFUND_SPIKE",
        {
          refundedCount: parseInt(refunded),
          totalOrders: parseInt(total),
          refundRatePercent: Math.round(rate * 100),
          period: "7 days",
        },
        ctx,
      );

      const title =
        gpt?.titleAr ||
        `🔴 نسبة المرتجعات ${(rate * 100).toFixed(0)}% — أعلى من الحد الطبيعي`;
      const desc =
        gpt?.descriptionAr ||
        `${refunded} مرتجع من أصل ${total} طلب في آخر 7 أيام. تحقق من جودة المنتجات أو وصف الكتالوج.`;

      await this.logAction(
        merchantId,
        "FINANCE_AGENT",
        "REFUND_SPIKE",
        gpt?.severity || "CRITICAL",
        title,
        desc,
        {
          refunded: parseInt(refunded),
          total: parseInt(total),
          rate: Math.round(rate * 100),
          gptReasoning: gpt?.reasoning,
        },
        false,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`finRefundSpike failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  /**
   * 11. Expense anomaly — single expense >3× the average for that category.
   */
  private async finDetectExpenseAnomaly(merchantId: string): Promise<number> {
    try {
      const anomalies = await this.pool.query(
        `WITH cat_avg AS (
           SELECT category, AVG(amount) as avg_amount, STDDEV(amount) as std_amount
           FROM expenses
           WHERE merchant_id = $1 AND expense_date > NOW() - INTERVAL '90 days'
           GROUP BY category
           HAVING COUNT(*) >= 3
         )
         SELECT e.id, e.description, e.amount, e.category, ca.avg_amount
         FROM expenses e
         JOIN cat_avg ca ON ca.category = e.category
         WHERE e.merchant_id = $1
           AND e.expense_date > NOW() - INTERVAL '24 hours'
           AND e.amount > ca.avg_amount * 3
         LIMIT 5`,
        [merchantId],
      );

      if (anomalies.rows.length === 0) return 0;

      for (const a of anomalies.rows) {
        await this.logAction(
          merchantId,
          "FINANCE_AGENT",
          "EXPENSE_ANOMALY",
          "WARNING",
          `⚠️ مصروف غير عادي: ${a.description} — ${Math.round(a.amount)} ج.م`,
          `هذا المصروف أعلى 3 أضعاف المتوسط لفئة "${a.category}" (متوسط: ${Math.round(a.avg_amount)} ج.م). تأكد من صحته.`,
          {
            expenseId: a.id,
            amount: a.amount,
            avgAmount: a.avg_amount,
            category: a.category,
          },
          false,
        );
      }
      return anomalies.rows.length;
    } catch (err) {
      this.logger.warn(`finExpenseAnomaly failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  /**
   * 12. Revenue milestone — daily revenue crossed the merchant's all-time high.
   */
  private async finRevenueMilestone(
    merchantId: string,
    merchantName: string,
    ctx: Record<string, any>,
  ): Promise<number> {
    try {
      const result = await this.pool.query(
        `WITH daily_rev AS (
           SELECT DATE(created_at) as d, SUM(total) as rev
           FROM orders
           WHERE merchant_id = $1 AND status = 'DELIVERED'
           GROUP BY DATE(created_at)
         ),
         today AS (
           SELECT COALESCE(SUM(total), 0) as rev
           FROM orders
           WHERE merchant_id = $1 AND status = 'DELIVERED'
             AND DATE(created_at) = CURRENT_DATE
         ),
         best AS (
           SELECT MAX(rev) as max_rev FROM daily_rev WHERE d < CURRENT_DATE
         )
         SELECT t.rev as today_rev, COALESCE(b.max_rev, 0) as best_rev
         FROM today t, best b`,
        [merchantId],
      );

      const { today_rev, best_rev } = result.rows[0];
      const todayRev = parseFloat(today_rev);
      const bestRev = parseFloat(best_rev);

      if (todayRev <= 0 || todayRev <= bestRev) return 0;

      // Dedup — only once per day
      const existing = await this.pool.query(
        `SELECT id FROM agent_actions
         WHERE merchant_id = $1 AND action_type = 'REVENUE_MILESTONE'
           AND created_at > CURRENT_DATE
         LIMIT 1`,
        [merchantId],
      );
      if (existing.rows.length > 0) return 0;

      // GPT writes a celebration message for the merchant
      const gpt = await this.askGpt(
        merchantId,
        merchantName,
        "FINANCE_AGENT",
        "REVENUE_MILESTONE",
        {
          todayRevenueEGP: Math.round(todayRev),
          previousBestEGP: Math.round(bestRev),
          percentIncrease: Math.round(((todayRev - bestRev) / bestRev) * 100),
        },
        ctx,
      );

      const title =
        gpt?.titleAr ||
        `🎉 رقم قياسي! إيرادات اليوم ${Math.round(todayRev)} ج.م — الأعلى على الإطلاق`;
      const desc =
        gpt?.descriptionAr ||
        `إيرادات اليوم تجاوزت الرقم السابق (${Math.round(bestRev)} ج.م). استمر!`;

      await this.logAction(
        merchantId,
        "FINANCE_AGENT",
        "REVENUE_MILESTONE",
        "INFO",
        title,
        desc,
        {
          todayRevenue: todayRev,
          previousBest: bestRev,
          gptReasoning: gpt?.reasoning,
        },
        false,
      );
      return 1;
    } catch (err) {
      this.logger.warn(`finMilestone failed for ${merchantId}: ${err}`);
      return 0;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════

  /**
   * Log agent action + create notification for merchant.
   * Deduplicates by (merchant, action_type) within 6 hours.
   */
  private async logAction(
    merchantId: string,
    agentType: string,
    actionType: string,
    severity: string,
    title: string,
    description: string,
    metadata: Record<string, any>,
    autoResolved: boolean,
  ): Promise<void> {
    // Dedup within 6h for same action type
    const dedup = await this.pool.query(
      `SELECT id FROM agent_actions
       WHERE merchant_id = $1 AND action_type = $2
         AND created_at > NOW() - INTERVAL '6 hours'
       LIMIT 1`,
      [merchantId, actionType],
    );
    if (dedup.rows.length > 0) return;

    // Insert action record
    await this.pool.query(
      `INSERT INTO agent_actions (merchant_id, agent_type, action_type, severity, title, description, metadata, auto_resolved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        merchantId,
        agentType,
        actionType,
        severity,
        title,
        description,
        JSON.stringify(metadata),
        autoResolved,
      ],
    );

    // Also fire a human-friendly notification (current notifications schema)
    const priority =
      severity === "CRITICAL" || severity === "ERROR"
        ? "HIGH"
        : severity === "WARNING"
          ? "MEDIUM"
          : "LOW";
    await this.pool.query(
      `INSERT INTO notifications (merchant_id, type, title, title_ar, message, message_ar, priority, channels, data, is_read, created_at)
       VALUES ($1, 'SYSTEM_ALERT', $2, $2, $3, $3, $4, ARRAY['IN_APP']::text[], $5, false, NOW())`,
      [
        merchantId,
        title,
        description,
        priority,
        JSON.stringify({
          alertKind: "AGENT_ACTION",
          agentType,
          actionType,
          severity,
          autoResolved,
          ...metadata,
        }),
      ],
    );
  }

  private async resolveOrderDriverColumn(): Promise<
    "assigned_driver_id" | "driver_id"
  > {
    if (this.orderDriverColumn) return this.orderDriverColumn;

    const result = await this.pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'orders'
         AND column_name = ANY($1::text[])`,
      [["assigned_driver_id", "driver_id"]],
    );

    const columns = new Set(result.rows.map((row) => row.column_name));
    if (columns.has("assigned_driver_id")) {
      this.orderDriverColumn = "assigned_driver_id";
      return this.orderDriverColumn;
    }
    if (columns.has("driver_id")) {
      this.orderDriverColumn = "driver_id";
      return this.orderDriverColumn;
    }

    throw new Error(
      "Orders table is missing assigned_driver_id/driver_id columns",
    );
  }
}
