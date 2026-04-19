import { Pool } from "pg";
import { createLogger } from "@tash8eel/shared";
import { AgentTask } from "@tash8eel/agent-sdk";

const logger = createLogger("OpsHandlers");

interface OrderStats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
}

interface ConversationMetrics {
  totalConversations: number;
  activeConversations: number;
  avgResponseTimeMs: number;
  escalationRate: number;
  conversionRate: number;
}

export class OpsHandlers {
  constructor(private readonly pool: Pool) {}

  /**
   * Process incoming message with analytics and intent tracking
   */
  async processMessage(task: AgentTask): Promise<Record<string, unknown>> {
    const { conversationId, merchantId, text, intent, sentiment } =
      task.input as any;

    logger.info("Processing message via OpsAgent", {
      conversationId,
      merchantId,
      intent,
    });

    // Track message analytics
    await this.trackMessageAnalytics(merchantId, conversationId, {
      intent: intent || "UNKNOWN",
      sentiment: sentiment || "NEUTRAL",
      messageLength: text?.length || 0,
    });

    // Check for potential followup scheduling based on conversation state
    const conversation = await this.getConversation(conversationId);
    let followupScheduled = false;
    if (conversation && this.shouldScheduleFollowup(conversation)) {
      followupScheduled = await this.scheduleAutoFollowup(
        merchantId,
        conversationId,
        conversation.state,
      );
    }

    // Update conversation metrics
    if (conversationId) {
      await this.updateConversationMetrics(conversationId);
    }

    return {
      processed: true,
      conversationId,
      merchantId,
      intent,
      followupScheduled,
      summaryAr: followupScheduled
        ? "تم تحليل المحادثات وجدولة متابعة تلقائية."
        : "تم تحليل المحادثات بنجاح.",
      messageAr: followupScheduled
        ? "تم تحليل الرسائل وجدولة متابعة للعميل."
        : "تم تحليل الرسائل بدون الحاجة لمتابعة إضافية.",
    };
  }

  /**
   * Create and confirm order with inventory check and notification
   */
  async createOrder(task: AgentTask): Promise<Record<string, unknown>> {
    const { orderId, merchantId, items } = task.input as any;

    logger.info("Processing order creation", {
      orderId,
      merchantId,
      itemCount: items?.length,
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const orderResult = await client.query(
        `SELECT id, order_number, total, conversation_id 
         FROM orders 
         WHERE id = $1 AND merchant_id = $2
         FOR UPDATE`,
        [orderId, merchantId],
      );

      if (orderResult.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      const orderRow = orderResult.rows[0];

      // Update order status to CONFIRMED
      await client.query(
        `UPDATE orders SET status = 'CONFIRMED', updated_at = NOW() WHERE id = $1`,
        [orderId],
      );

      // Move conversation to ORDER_PLACED if present
      if (orderRow.conversation_id) {
        await client.query(
          `UPDATE conversations SET state = 'ORDER_PLACED', updated_at = NOW() WHERE id = $1`,
          [orderRow.conversation_id],
        );
      }

      // Create notification for merchant
      await client.query(
        `INSERT INTO notifications 
         (merchant_id, type, title, title_ar, message, message_ar, data, priority, channels, action_url, created_at)
         VALUES ($1, 'ORDER_CONFIRMED', $2, $3, $4, $5, $6, 'MEDIUM', ARRAY['IN_APP'], $7, NOW())`,
        [
          merchantId,
          "Order confirmed",
          "تم تأكيد الطلب",
          `Order #${orderRow.order_number} has been confirmed.`,
          `تم تأكيد الطلب رقم ${orderRow.order_number}.`,
          JSON.stringify({
            orderId,
            orderNumber: orderRow.order_number,
            total: orderRow.total,
            itemCount: items?.length || 0,
          }),
          `/merchant/orders/${orderId}`,
        ],
      );

      await client.query("COMMIT");

      return {
        orderId,
        orderNumber: orderRow.order_number,
        status: "CONFIRMED",
        notificationSent: true,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Book delivery with carrier integration and tracking
   */
  async bookDelivery(task: AgentTask): Promise<Record<string, unknown>> {
    const { orderId, merchantId } = task.input as any;

    logger.info("Processing delivery booking", { orderId, merchantId });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Get order details
      const order = await client.query(
        `SELECT id, order_number FROM orders WHERE id = $1 AND merchant_id = $2`,
        [orderId, merchantId],
      );

      if (order.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Generate tracking number
      const trackingNumber = `TRK-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const estimatedDelivery = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

      // Update order with delivery info
      await client.query(
        `UPDATE orders 
         SET status = 'BOOKED', 
             updated_at = NOW()
         WHERE id = $1`,
        [orderId],
      );

      // Create shipment record
      await client.query(
        `INSERT INTO shipments (order_id, merchant_id, tracking_id, status, status_history, estimated_delivery, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (order_id) DO UPDATE SET
           tracking_id = $3,
           status = $4,
           status_history = $5,
           estimated_delivery = $6,
           updated_at = NOW()`,
        [
          orderId,
          merchantId,
          trackingNumber,
          "pending",
          JSON.stringify([
            {
              status: "pending",
              at: new Date().toISOString(),
              note: "Delivery booked",
            },
          ]),
          estimatedDelivery,
        ],
      );

      // Notify merchant
      await client.query(
        `INSERT INTO notifications 
         (merchant_id, type, title, title_ar, message, message_ar, data, priority, channels, action_url, created_at)
         VALUES ($1, 'SYSTEM_ALERT', $2, $3, $4, $5, $6, 'MEDIUM', ARRAY['IN_APP'], $7, NOW())`,
        [
          merchantId,
          "Delivery booked",
          "تم حجز التوصيل",
          `Delivery booked for order #${order.rows[0]?.order_number || orderId}. Tracking: ${trackingNumber}`,
          `تم حجز التوصيل للطلب رقم ${order.rows[0]?.order_number || orderId}. رقم التتبع: ${trackingNumber}`,
          JSON.stringify({ orderId, trackingNumber }),
          `/merchant/orders/${orderId}`,
        ],
      );

      await client.query("COMMIT");

      return {
        orderId,
        booked: true,
        trackingNumber,
        estimatedDelivery: estimatedDelivery.toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Send followup message with smart timing and personalization
   */
  async sendFollowup(task: AgentTask): Promise<Record<string, unknown>> {
    const {
      followupId,
      conversationId,
      merchantId,
      messageTemplate,
      customerName,
    } = task.input as any;

    logger.info("Processing followup", {
      followupId,
      conversationId,
      merchantId,
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Get followup details
      const followup = await client.query(
        `SELECT * FROM followups WHERE id = $1`,
        [followupId],
      );

      if (followup.rows.length === 0) {
        throw new Error(`Followup ${followupId} not found`);
      }

      const followupData = followup.rows[0];

      // Get conversation for context
      const conversation = await client.query(
        `SELECT c.*, COALESCE(m.trade_name, m.name) as business_name
         FROM conversations c
         JOIN merchants m ON c.merchant_id = m.id
         WHERE c.id = $1`,
        [conversationId],
      );

      const knowledgeBase = await this.getMerchantKnowledgeBase(merchantId);
      const kbTokens = this.buildKnowledgeTokens(
        knowledgeBase,
        conversation.rows[0]?.business_name || "",
      );

      // Personalize message
      let message =
        messageTemplate ||
        followupData.custom_message ||
        followupData.message_template ||
        this.getDefaultFollowupMessage(followupData.type);
      message = message.replace(
        "{customer_name}",
        customerName || "عزيزي العميل",
      );
      message = this.applyKnowledgeTokens(message, kbTokens);

      // Append policy hints for relevant followup types
      const policyHints = this.getPolicyHints(knowledgeBase, followupData.type);
      if (policyHints.length > 0) {
        message = `${message}\n\n${policyHints.join("\n")}`;
      }

      // Update followup status
      await client.query(
        `UPDATE followups 
         SET status = 'SENT', 
             sent_at = NOW(),
             custom_message = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [followupId, message],
      );

      await client.query("COMMIT");

      return {
        followupId,
        conversationId,
        sent: true,
        message,
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle conversation escalation with smart routing
   */
  async handleEscalation(task: AgentTask): Promise<Record<string, unknown>> {
    const { conversationId, merchantId, reason, priority, customerSentiment } =
      task.input as any;

    logger.info("Processing escalation", {
      conversationId,
      merchantId,
      reason,
      priority,
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const knowledgeBase = await this.getMerchantKnowledgeBase(merchantId);

      const escalationPayload = {
        reason,
        priority: priority || "MEDIUM",
        sentiment: customerSentiment || "NEUTRAL",
        escalatedAt: new Date().toISOString(),
        businessInfo: knowledgeBase?.businessInfo || undefined,
      };

      // Mark conversation as human takeover
      await client.query(
        `UPDATE conversations
         SET human_takeover = true,
             human_takeover_at = NOW(),
             state = 'HUMAN_TAKEOVER',
             context = jsonb_set(COALESCE(context, '{}'::jsonb), '{escalation}', $2::jsonb, true),
             updated_at = NOW()
         WHERE id = $1`,
        [conversationId, JSON.stringify(escalationPayload)],
      );

      const normalizedPriority = (() => {
        const raw = (priority || "").toUpperCase();
        if (raw === "LOW") return "LOW";
        if (raw === "HIGH") return "HIGH";
        if (raw === "URGENT") return "URGENT";
        return "MEDIUM";
      })();

      // Create urgent notification
      await client.query(
        `INSERT INTO notifications 
         (merchant_id, type, title, title_ar, message, message_ar, data, priority, channels, action_url, created_at)
         VALUES ($1, 'ESCALATED_CONVERSATION', $2, $3, $4, $5, $6, $7, ARRAY['IN_APP'], $8, NOW())`,
        [
          merchantId,
          "Conversation escalated",
          "تصعيد محادثة",
          `Conversation requires human attention. Reason: ${reason}`,
          `محادثة تحتاج إلى تدخل بشري. السبب: ${reason}`,
          JSON.stringify({
            conversationId,
            reason,
            priority: normalizedPriority,
            customerSentiment,
          }),
          normalizedPriority,
          `/merchant/conversations/${conversationId}`,
        ],
      );

      await client.query("COMMIT");

      return {
        conversationId,
        escalated: true,
        reason,
        priority: normalizedPriority,
        notificationSent: true,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ==================== HELPER METHODS ====================

  private async getConversation(conversationId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId],
    );
    return result.rows[0];
  }

  private shouldScheduleFollowup(conversation: any): boolean {
    const state = conversation?.state;
    if (
      !state ||
      state === "ORDER_PLACED" ||
      state === "CLOSED" ||
      state === "HUMAN_TAKEOVER"
    ) {
      return false;
    }

    if (conversation.next_followup_at) {
      return false;
    }

    const cart = (() => {
      if (!conversation.cart) return {};
      if (typeof conversation.cart === "string") {
        try {
          return JSON.parse(conversation.cart);
        } catch {
          return {};
        }
      }
      return conversation.cart;
    })();
    const items = Array.isArray(cart.items) ? cart.items : [];
    if (items.length === 0) {
      return false;
    }

    const lastActivity =
      conversation.last_message_at || conversation.updated_at;
    if (!lastActivity) {
      return false;
    }

    const lastUpdate = new Date(lastActivity);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return lastUpdate < hourAgo;
  }

  private async scheduleAutoFollowup(
    merchantId: string,
    conversationId: string,
    state: string,
  ): Promise<boolean> {
    const merchant = await this.pool.query(
      `SELECT enable_followups FROM merchants WHERE id = $1`,
      [merchantId],
    );

    if (!merchant.rows[0]?.enable_followups) {
      return false;
    }

    const followupType = "abandoned_cart";
    const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

    const existing = await this.pool.query(
      `SELECT id FROM followups 
       WHERE merchant_id = $1 AND conversation_id = $2 AND type = $3 AND status = 'PENDING'`,
      [merchantId, conversationId, followupType],
    );

    if (existing.rows.length > 0) {
      return false;
    }

    await this.pool.query(
      `INSERT INTO followups 
       (merchant_id, conversation_id, type, status, scheduled_at, message_template, metadata, created_at)
       VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, NOW())`,
      [
        merchantId,
        conversationId,
        followupType,
        scheduledAt,
        this.getDefaultFollowupMessage(followupType),
        JSON.stringify({ source: "auto", state }),
      ],
    );

    await this.pool.query(
      `UPDATE conversations SET next_followup_at = $2, updated_at = NOW() WHERE id = $1`,
      [conversationId, scheduledAt],
    );

    return true;
  }

  private async trackMessageAnalytics(
    merchantId: string,
    conversationId: string,
    data: any,
  ): Promise<void> {
    await this.pool
      .query(
        `INSERT INTO message_analytics (merchant_id, conversation_id, intent, sentiment, message_length, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          merchantId,
          conversationId,
          data.intent,
          data.sentiment,
          data.messageLength,
        ],
      )
      .catch((err) => logger.warn("Failed to track message analytics", err));
  }

  private async updateConversationMetrics(
    conversationId: string,
  ): Promise<void> {
    await this.pool
      .query(
        `UPDATE conversations 
       SET last_message_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
        [conversationId],
      )
      .catch((err) =>
        logger.warn("Failed to update conversation metrics", err),
      );
  }

  private async getMerchantKnowledgeBase(merchantId: string): Promise<any> {
    try {
      const result = await this.pool.query(
        `SELECT knowledge_base, name FROM merchants WHERE id = $1`,
        [merchantId],
      );
      const row = result.rows[0];
      if (!row) return null;

      const kb = row.knowledge_base;
      if (!kb) {
        return { businessInfo: { name: row.name || "" } };
      }
      if (typeof kb === "string") {
        return JSON.parse(kb);
      }
      return kb;
    } catch (error) {
      logger.warn("Failed to load knowledge base", error as Error);
      return null;
    }
  }

  private buildKnowledgeTokens(
    knowledgeBase: any,
    fallbackName: string,
  ): Record<string, string> {
    const info = knowledgeBase?.businessInfo || {};
    const policies = info.policies || {};
    const paymentMethods = Array.isArray(policies.paymentMethods)
      ? policies.paymentMethods.join("، ")
      : "";

    return {
      "{business_name}": info.name || fallbackName || "",
      "{business_category}": info.category || "",
      "{business_description}": info.description || "",
      "{business_phone}": info.phone || "",
      "{business_whatsapp}": info.whatsapp || "",
      "{business_website}": info.website || "",
      "{business_address}": info.address || "",
      "{return_policy}": policies.returnPolicy || "",
      "{delivery_info}": policies.deliveryInfo || "",
      "{payment_methods}": paymentMethods || "",
    };
  }

  private applyKnowledgeTokens(
    message: string,
    tokens: Record<string, string>,
  ): string {
    let output = message;
    Object.entries(tokens).forEach(([token, value]) => {
      if (!token) return;
      output = output.split(token).join(value || "");
    });
    return output;
  }

  private getPolicyHints(knowledgeBase: any, followupType: string): string[] {
    const info = knowledgeBase?.businessInfo || {};
    const policies = info.policies || {};
    const hints: string[] = [];

    if (
      ["order_confirmation", "delivery_reminder"].includes(followupType) &&
      policies.deliveryInfo
    ) {
      hints.push(`معلومات التوصيل: ${policies.deliveryInfo}`);
    }
    if (
      ["order_confirmation", "abandoned_cart", "reorder_suggestion"].includes(
        followupType,
      )
    ) {
      if (
        Array.isArray(policies.paymentMethods) &&
        policies.paymentMethods.length > 0
      ) {
        hints.push(`طرق الدفع المتاحة: ${policies.paymentMethods.join("، ")}`);
      }
    }
    if (
      ["feedback_request", "order_confirmation"].includes(followupType) &&
      policies.returnPolicy
    ) {
      hints.push(`سياسة الاسترجاع: ${policies.returnPolicy}`);
    }

    return hints;
  }

  private getDefaultFollowupMessage(type: string): string {
    const messages: Record<string, string> = {
      abandoned_cart:
        "مرحباً {customer_name}! لاحظنا أن لديك منتجات في سلة التسوق. هل تحتاج أي مساعدة لإتمام طلبك؟ 🛒",
      delivery_reminder:
        "مرحباً {customer_name}! تذكير لطيف بشأن موعد توصيل طلبك. هل ما زال الموعد مناسباً؟ 🚚",
      feedback_request:
        "مرحباً {customer_name}! نتمنى أن يكون طلبك قد وصلك بشكل جيد. نسعد بتقييمك! ⭐",
      order_confirmation:
        "مرحباً {customer_name}! تم تأكيد طلبك لدى {business_name}. سنبقيك على اطلاع بالتحديثات.",
      reorder_suggestion:
        "مرحباً {customer_name}! لاحظنا أنك قد تحتاج لإعادة الطلب. هل ترغب بالمساعدة؟ 🔁",
      custom:
        "مرحباً {customer_name}! شكراً لتواصلك مع {business_name}. هل هناك أي شيء آخر يمكننا مساعدتك به؟",
    };
    return messages[type] || messages.custom;
  }

  // ==================== CUSTOMER INSIGHTS ====================

  /**
   * Get comprehensive customer insights and profile
   */
  async getCustomerInsights(task: AgentTask): Promise<Record<string, unknown>> {
    const { merchantId, customerId, customerPhone } = task.input as any;

    logger.info("Getting customer insights", {
      merchantId,
      customerId: customerId || customerPhone,
    });

    // Get customer orders history
    const ordersResult = await this.pool.query(
      `SELECT 
         COUNT(*) as total_orders,
         COUNT(*) FILTER (WHERE status = 'DELIVERED') as completed_orders,
         COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled_orders,
         SUM(CASE WHEN status NOT IN ('CANCELLED') THEN total ELSE 0 END) as total_spent,
         AVG(CASE WHEN status NOT IN ('CANCELLED') THEN total ELSE NULL END) as avg_order_value,
         MIN(created_at) as first_order_date,
         MAX(created_at) as last_order_date,
         COUNT(DISTINCT DATE(created_at)) as active_days
       FROM orders 
       WHERE merchant_id = $1 AND (customer_id = $2 OR customer_phone = $3)`,
      [merchantId, customerId, customerPhone],
    );

    // Get conversation stats
    const conversationResult = await this.pool.query(
      `SELECT 
         COUNT(*) as total_conversations,
         COUNT(*) FILTER (WHERE state = 'ORDER_PLACED') as successful_conversations,
         AVG(COALESCE(msgs.message_count, 0)) as avg_messages_per_conversation,
         COUNT(*) FILTER (WHERE COALESCE(human_takeover, false) = true) as escalations
       FROM conversations c
       LEFT JOIN (
         SELECT conversation_id, COUNT(*) as message_count
         FROM messages
         WHERE merchant_id = $1
         GROUP BY conversation_id
       ) msgs ON msgs.conversation_id = c.id
       WHERE c.merchant_id = $1 AND (c.customer_id = $2 OR c.sender_id = $3)`,
      [merchantId, customerId, customerPhone],
    );

    // Get favorite products
    const productsResult = await this.pool.query(
      `SELECT 
         item_data->>'itemId' as item_id,
         item_data->>'name' as product_name,
         SUM((item_data->>'quantity')::int) as total_quantity,
         COUNT(*) as order_count
       FROM orders o,
       jsonb_array_elements(o.items) as item_data
       WHERE o.merchant_id = $1 
         AND (o.customer_id = $2 OR o.customer_phone = $3)
         AND o.status NOT IN ('CANCELLED')
       GROUP BY item_data->>'itemId', item_data->>'name'
       ORDER BY total_quantity DESC
       LIMIT 5`,
      [merchantId, customerId, customerPhone],
    );

    // Get recent activity
    const recentActivity = await this.pool.query(
      `SELECT 'order' as type, id, status, total as value, created_at
       FROM orders
       WHERE merchant_id = $1 AND (customer_id = $2 OR customer_phone = $3)
       ORDER BY created_at DESC LIMIT 10`,
      [merchantId, customerId, customerPhone],
    );

    const orders = ordersResult.rows[0];
    const conversations = conversationResult.rows[0];

    // Calculate customer segment
    const segment = this.calculateCustomerSegment(orders, conversations);

    // Calculate customer lifetime value (CLV)
    const clv = this.calculateCLV(orders);

    // Calculate churn risk
    const churnRisk = this.calculateChurnRisk(orders);

    return {
      customerId: customerId || customerPhone,
      merchantId,
      profile: {
        totalOrders: parseInt(orders.total_orders) || 0,
        completedOrders: parseInt(orders.completed_orders) || 0,
        cancelledOrders: parseInt(orders.cancelled_orders) || 0,
        totalSpent: parseFloat(orders.total_spent) || 0,
        avgOrderValue: parseFloat(orders.avg_order_value) || 0,
        firstOrderDate: orders.first_order_date,
        lastOrderDate: orders.last_order_date,
        activeDays: parseInt(orders.active_days) || 0,
      },
      conversationStats: {
        total: parseInt(conversations.total_conversations) || 0,
        successful: parseInt(conversations.successful_conversations) || 0,
        avgMessages:
          parseFloat(conversations.avg_messages_per_conversation) || 0,
        escalations: parseInt(conversations.escalations) || 0,
      },
      favoriteProducts: productsResult.rows,
      recentActivity: recentActivity.rows,
      insights: {
        segment,
        clv,
        churnRisk,
        conversionRate:
          conversations.total_conversations > 0
            ? Math.round(
                (parseInt(conversations.successful_conversations) /
                  parseInt(conversations.total_conversations)) *
                  100,
              )
            : 0,
      },
    };
  }

  /**
   * Segment customers based on RFM analysis
   */
  async segmentCustomers(task: AgentTask): Promise<Record<string, unknown>> {
    const { merchantId } = task.input as any;

    logger.info("Segmenting customers", { merchantId });

    const customersResult = await this.pool.query(
      `WITH customer_metrics AS (
         SELECT 
           COALESCE(customer_id, customer_phone) as customer_key,
           customer_name,
           customer_phone,
           COUNT(*) as order_count,
           SUM(CASE WHEN status NOT IN ('CANCELLED') THEN total ELSE 0 END) as total_spent,
           MAX(created_at) as last_order,
           MIN(created_at) as first_order,
           EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 86400 as days_since_last_order
         FROM orders
         WHERE merchant_id = $1
         GROUP BY COALESCE(customer_id, customer_phone), customer_name, customer_phone
       )
       SELECT *,
         CASE 
           WHEN order_count >= 5 AND total_spent >= 1000 AND days_since_last_order <= 30 THEN 'VIP'
           WHEN order_count >= 3 AND days_since_last_order <= 60 THEN 'LOYAL'
           WHEN order_count >= 2 AND days_since_last_order <= 90 THEN 'REGULAR'
           WHEN days_since_last_order > 90 THEN 'AT_RISK'
           ELSE 'NEW'
         END as segment
       FROM customer_metrics
       ORDER BY total_spent DESC`,
      [merchantId],
    );

    // Group by segment
    const segments: Record<string, any[]> = {
      VIP: [],
      LOYAL: [],
      REGULAR: [],
      NEW: [],
      AT_RISK: [],
    };

    for (const customer of customersResult.rows) {
      segments[customer.segment]?.push({
        customerId: customer.customer_key,
        name: customer.customer_name,
        phone: customer.customer_phone,
        orderCount: parseInt(customer.order_count),
        totalSpent: parseFloat(customer.total_spent),
        lastOrder: customer.last_order,
        daysSinceLastOrder: Math.round(
          parseFloat(customer.days_since_last_order),
        ),
      });
    }

    const segmentSummary = {
      VIP: {
        count: segments.VIP.length,
        revenue: segments.VIP.reduce((s, c) => s + c.totalSpent, 0),
      },
      LOYAL: {
        count: segments.LOYAL.length,
        revenue: segments.LOYAL.reduce((s, c) => s + c.totalSpent, 0),
      },
      REGULAR: {
        count: segments.REGULAR.length,
        revenue: segments.REGULAR.reduce((s, c) => s + c.totalSpent, 0),
      },
      NEW: {
        count: segments.NEW.length,
        revenue: segments.NEW.reduce((s, c) => s + c.totalSpent, 0),
      },
      AT_RISK: {
        count: segments.AT_RISK.length,
        revenue: segments.AT_RISK.reduce((s, c) => s + c.totalSpent, 0),
      },
    };

    return {
      merchantId,
      totalCustomers: customersResult.rows.length,
      segmentSummary,
      segments,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generate automated win-back campaigns for at-risk customers
   */
  async createWinBackCampaign(
    task: AgentTask,
  ): Promise<Record<string, unknown>> {
    const { merchantId, customerIds, discountPercent, expiryDays } =
      task.input as any;

    logger.info("Creating win-back campaign", {
      merchantId,
      customerCount: customerIds?.length,
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Generate unique campaign code
      const campaignCode = `WINBACK-${Date.now().toString(36).toUpperCase()}`;
      const expiresAt = new Date(
        Date.now() + (expiryDays || 7) * 24 * 60 * 60 * 1000,
      );

      // Create promotion record
      const campaign = await client.query(
        `INSERT INTO promotions 
         (merchant_id, name, name_ar, description, type, value, code, auto_apply, min_order_amount, start_date, end_date, is_active, target_audience, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'PERCENTAGE', $5, $6, false, 0, NOW(), $7, true, $8, NOW(), NOW())
         RETURNING id`,
        [
          merchantId,
          `Win-back ${campaignCode}`,
          `استرجاع العملاء ${campaignCode}`,
          `Win-back promotion for at-risk customers (${campaignCode})`,
          discountPercent || 10,
          campaignCode,
          expiresAt,
          JSON.stringify({ customerIds, type: "WIN_BACK" }),
        ],
      );

      // Schedule followup messages for each customer
      for (const customerId of customerIds || []) {
        await client.query(
          `INSERT INTO followups 
           (merchant_id, customer_id, type, status, scheduled_at, message_template, metadata, created_at)
           VALUES ($1, $2, 'custom', 'PENDING', NOW(), $3, $4, NOW())`,
          [
            merchantId,
            customerId,
            `مرحباً! 👋 اشتقنا لك! استخدم كود ${campaignCode} واحصل على خصم ${discountPercent || 10}% على طلبك القادم. العرض ساري حتى ${expiresAt.toLocaleDateString("ar-SA")} 🎁`,
            JSON.stringify({ promotionId: campaign.rows[0].id, campaignCode }),
          ],
        );
      }

      await client.query("COMMIT");

      return {
        campaignId: campaign.rows[0].id,
        campaignCode,
        discountPercent: discountPercent || 10,
        expiresAt: expiresAt.toISOString(),
        targetedCustomers: customerIds?.length || 0,
        status: "ACTIVE",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate daily business report
   */
  async generateDailyReport(task: AgentTask): Promise<Record<string, unknown>> {
    const { merchantId, reportDate } = task.input as any;
    const date = reportDate || new Date().toISOString().split("T")[0];

    logger.info("Generating daily report", { merchantId, date });

    // Get order stats for the day
    const orderStats = await this.pool.query(
      `SELECT 
         COUNT(*) as total_orders,
         COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
         COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
         SUM(CASE WHEN status NOT IN ('CANCELLED') THEN total ELSE 0 END) as revenue,
         AVG(CASE WHEN status NOT IN ('CANCELLED') THEN total ELSE NULL END) as avg_order_value
       FROM orders 
       WHERE merchant_id = $1 AND DATE(created_at) = $2`,
      [merchantId, date],
    );

    // Get conversation stats
    const convStats = await this.pool.query(
      `SELECT 
         COUNT(*) as total_conversations,
         COUNT(*) FILTER (WHERE state = 'ORDER_PLACED') as converted,
         COUNT(*) FILTER (WHERE COALESCE(human_takeover, false) = true) as escalated
       FROM conversations 
       WHERE merchant_id = $1 AND DATE(created_at) = $2`,
      [merchantId, date],
    );

    const messageStats = await this.pool.query(
      `SELECT COUNT(*) as total_messages
       FROM messages
       WHERE merchant_id = $1 AND DATE(created_at) = $2`,
      [merchantId, date],
    );

    // Get new vs returning customers
    const customerStats = await this.pool.query(
      `WITH day_customers AS (
         SELECT DISTINCT COALESCE(customer_id, customer_phone) as cust
         FROM orders WHERE merchant_id = $1 AND DATE(created_at) = $2
       ),
       previous_customers AS (
         SELECT DISTINCT COALESCE(customer_id, customer_phone) as cust
         FROM orders WHERE merchant_id = $1 AND DATE(created_at) < $2
       )
       SELECT 
         COUNT(*) as total_customers,
         COUNT(*) FILTER (WHERE dc.cust NOT IN (SELECT cust FROM previous_customers)) as new_customers
       FROM day_customers dc`,
      [merchantId, date],
    );

    // Get top products for the day
    const topProducts = await this.pool.query(
      `SELECT 
         item_data->>'name' as product_name,
         SUM((item_data->>'quantity')::int) as quantity_sold,
         SUM((item_data->>'price')::numeric * (item_data->>'quantity')::int) as revenue
       FROM orders o,
       jsonb_array_elements(o.items) as item_data
       WHERE o.merchant_id = $1 AND DATE(o.created_at) = $2 AND o.status NOT IN ('CANCELLED')
       GROUP BY item_data->>'name'
       ORDER BY quantity_sold DESC
       LIMIT 5`,
      [merchantId, date],
    );

    // Compare with previous day
    const previousDate = new Date(
      new Date(date).getTime() - 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split("T")[0];
    const previousStats = await this.pool.query(
      `SELECT 
         COUNT(*) as total_orders,
         SUM(CASE WHEN status NOT IN ('CANCELLED') THEN total ELSE 0 END) as revenue
       FROM orders 
       WHERE merchant_id = $1 AND DATE(created_at) = $2`,
      [merchantId, previousDate],
    );

    const orders = orderStats.rows[0];
    const convs = convStats.rows[0];
    const custs = customerStats.rows[0];
    const prev = previousStats.rows[0];

    const report = {
      merchantId,
      date,
      orders: {
        total: parseInt(orders.total_orders) || 0,
        delivered: parseInt(orders.delivered) || 0,
        cancelled: parseInt(orders.cancelled) || 0,
        revenue: parseFloat(orders.revenue) || 0,
        avgOrderValue: parseFloat(orders.avg_order_value) || 0,
        changeFromYesterday:
          prev.total_orders > 0
            ? Math.round(
                ((parseInt(orders.total_orders) - parseInt(prev.total_orders)) /
                  parseInt(prev.total_orders)) *
                  100,
              )
            : 0,
      },
      conversations: {
        total: parseInt(convs.total_conversations) || 0,
        converted: parseInt(convs.converted) || 0,
        escalated: parseInt(convs.escalated) || 0,
        totalMessages: parseInt(messageStats.rows[0]?.total_messages) || 0,
        conversionRate:
          convs.total_conversations > 0
            ? Math.round(
                (parseInt(convs.converted) /
                  parseInt(convs.total_conversations)) *
                  100,
              )
            : 0,
      },
      customers: {
        total: parseInt(custs.total_customers) || 0,
        new: parseInt(custs.new_customers) || 0,
        returning:
          (parseInt(custs.total_customers) || 0) -
          (parseInt(custs.new_customers) || 0),
      },
      topProducts: topProducts.rows,
      generatedAt: new Date().toISOString(),
    };

    // Store report
    await this.pool.query(
      `INSERT INTO merchant_reports (merchant_id, report_date, period_type, period_start, period_end, summary, created_at)
       VALUES ($1, $2, 'daily', $2, $2, $3, NOW())
       ON CONFLICT (merchant_id, report_date, period_type) DO UPDATE SET summary = EXCLUDED.summary`,
      [merchantId, date, JSON.stringify(report)],
    );

    return report;
  }

  // ==================== HELPER METHODS FOR INSIGHTS ====================

  private calculateCustomerSegment(orders: any, conversations: any): string {
    const orderCount = parseInt(orders.total_orders) || 0;
    const totalSpent = parseFloat(orders.total_spent) || 0;
    const daysSinceLastOrder = orders.last_order_date
      ? Math.floor(
          (Date.now() - new Date(orders.last_order_date).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 999;

    if (orderCount >= 5 && totalSpent >= 1000 && daysSinceLastOrder <= 30)
      return "VIP";
    if (orderCount >= 3 && daysSinceLastOrder <= 60) return "LOYAL";
    if (orderCount >= 2 && daysSinceLastOrder <= 90) return "REGULAR";
    if (daysSinceLastOrder > 90) return "AT_RISK";
    return "NEW";
  }

  private calculateCLV(orders: any): number {
    const avgOrderValue = parseFloat(orders.avg_order_value) || 0;
    const orderCount = parseInt(orders.total_orders) || 0;
    const activeDays = parseInt(orders.active_days) || 1;

    // Simple CLV = AOV * Purchase Frequency * Customer Lifespan (estimated)
    const purchaseFrequency = orderCount / Math.max(activeDays / 30, 1);
    const estimatedLifespan = 12; // months

    return Math.round(avgOrderValue * purchaseFrequency * estimatedLifespan);
  }

  private calculateChurnRisk(orders: any): "LOW" | "MEDIUM" | "HIGH" {
    const daysSinceLastOrder = orders.last_order_date
      ? Math.floor(
          (Date.now() - new Date(orders.last_order_date).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 999;

    if (daysSinceLastOrder > 90) return "HIGH";
    if (daysSinceLastOrder > 45) return "MEDIUM";
    return "LOW";
  }

  // ============================================================================
  // VIP TAGGING HANDLERS (Pro/Growth Feature)
  // ============================================================================

  /**
   * Add or remove a customer tag (VIP, WHOLESALE, BLACKLIST, etc.)
   */
  async manageCustomerTag(task: AgentTask): Promise<Record<string, unknown>> {
    const { merchantId, customerId, tag, action, expiresAt, metadata } =
      task.input as {
        merchantId: string;
        customerId: string;
        tag: string;
        action: "add" | "remove";
        expiresAt?: string;
        metadata?: Record<string, unknown>;
      };

    logger.info("Managing customer tag", {
      merchantId,
      customerId,
      tag,
      action,
    });

    if (action === "remove") {
      await this.pool.query(
        `DELETE FROM customer_tags WHERE merchant_id = $1 AND customer_id = $2 AND tag = $3`,
        [merchantId, customerId, tag],
      );

      // Clear VIP cache if removing VIP tag
      if (tag === "VIP") {
        await this.pool.query(
          `UPDATE customers SET vip_status = NULL WHERE merchant_id = $1 AND id = $2`,
          [merchantId, customerId],
        );
      }

      return { action: "TAG_REMOVED", merchantId, customerId, tag };
    }

    // Add tag
    const result = await this.pool.query(
      `INSERT INTO customer_tags (merchant_id, customer_id, tag, source, expires_at, metadata, created_by)
       VALUES ($1, $2, $3, 'manual', $4, $5, 'ops_agent')
       ON CONFLICT (merchant_id, customer_id, tag) DO UPDATE SET
         expires_at = EXCLUDED.expires_at,
         metadata = EXCLUDED.metadata,
         created_at = NOW()
       RETURNING id`,
      [
        merchantId,
        customerId,
        tag,
        expiresAt || null,
        JSON.stringify(metadata || {}),
      ],
    );

    // Update VIP cache
    if (tag === "VIP") {
      await this.pool.query(
        `UPDATE customers SET vip_status = 'VIP', vip_since = COALESCE(vip_since, NOW()) 
         WHERE merchant_id = $1 AND id = $2`,
        [merchantId, customerId],
      );
    }

    return {
      action: "TAG_ADDED",
      tagId: result.rows[0]?.id,
      merchantId,
      customerId,
      tag,
      expiresAt,
    };
  }

  /**
   * Get all tags for a customer
   */
  async getCustomerTags(task: AgentTask): Promise<Record<string, unknown>> {
    const { merchantId, customerId } = task.input as {
      merchantId: string;
      customerId: string;
    };

    const result = await this.pool.query(
      `SELECT tag, source, created_at, expires_at, metadata
       FROM customer_tags
       WHERE merchant_id = $1 AND customer_id = $2
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [merchantId, customerId],
    );

    return {
      customerId,
      tags: result.rows.map((r) => ({
        tag: r.tag,
        source: r.source,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        metadata: r.metadata,
      })),
      isVip: result.rows.some((r) => r.tag === "VIP"),
    };
  }

  /**
   * Apply VIP rules to check if customer qualifies for auto-tagging
   */
  async applyVipRules(task: AgentTask): Promise<Record<string, unknown>> {
    const { merchantId, customerId } = task.input as {
      merchantId: string;
      customerId: string;
    };

    logger.info("Applying VIP rules", { merchantId, customerId });

    // Call the database function
    const result = await this.pool.query(
      `SELECT apply_vip_rules($1, $2) as applied_tag`,
      [merchantId, customerId],
    );

    const appliedTag = result.rows[0]?.applied_tag;

    return {
      action: appliedTag ? "TAG_APPLIED" : "NO_QUALIFYING_RULE",
      merchantId,
      customerId,
      appliedTag,
    };
  }

  // ============================================================================
  // ONE-CLICK REORDER (Growth+ Feature)
  // ============================================================================

  /**
   * Get customer's last order items for quick reorder
   */
  async getReorderItems(task: AgentTask): Promise<Record<string, unknown>> {
    const { merchantId, customerId } = task.input as {
      merchantId: string;
      customerId: string;
    };

    // Get last completed order
    const lastOrder = await this.pool.query(
      `SELECT o.id, o.order_number, o.total, o.created_at,
              json_agg(json_build_object(
                'sku', oi.sku,
                'name', oi.product_name,
                'qty', oi.quantity,
                'price', oi.unit_price,
                'variantId', oi.variant_id
              )) as items
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.merchant_id = $1 AND o.customer_id = $2 AND o.status = 'DELIVERED'
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [merchantId, customerId],
    );

    if (lastOrder.rows.length === 0) {
      return { found: false, message: "No previous orders found" };
    }

    const order = lastOrder.rows[0];

    // Check stock availability for reorder items
    const items = order.items || [];
    const stockChecks = await Promise.all(
      items.map(async (item: any) => {
        if (!item.variantId)
          return { ...item, available: false, currentStock: 0 };

        const stock = await this.pool.query(
          `SELECT quantity_available, price FROM inventory_variants WHERE id = $1`,
          [item.variantId],
        );

        return {
          ...item,
          available: (stock.rows[0]?.quantity_available || 0) >= item.qty,
          currentStock: stock.rows[0]?.quantity_available || 0,
          currentPrice: stock.rows[0]?.price || item.price,
        };
      }),
    );

    return {
      found: true,
      lastOrderId: order.id,
      lastOrderNumber: order.order_number,
      lastOrderDate: order.created_at,
      lastOrderTotal: order.total,
      items: stockChecks,
      allInStock: stockChecks.every((i: any) => i.available),
    };
  }

  /**
   * Create a reorder from last order items
   */
  async createReorder(task: AgentTask): Promise<Record<string, unknown>> {
    const { merchantId, customerId, conversationId, items } = task.input as {
      merchantId: string;
      customerId: string;
      conversationId?: string;
      items?: Array<{ variantId: string; quantity: number }>;
    };

    logger.info("Creating reorder", { merchantId, customerId });

    // Get items from last order if not provided
    let orderItems = items;
    if (!orderItems || orderItems.length === 0) {
      const reorderData = await this.getReorderItems({
        input: { merchantId, customerId },
      } as unknown as AgentTask);
      if (!reorderData.found) {
        return { action: "REORDER_FAILED", reason: "No previous orders" };
      }
      orderItems = (reorderData.items as any[])
        .filter((i: any) => i.available)
        .map((i: any) => ({ variantId: i.variantId, quantity: i.qty }));
    }

    if (orderItems.length === 0) {
      return {
        action: "REORDER_FAILED",
        reason: "No items available for reorder",
      };
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Get customer details
      const customer = await client.query(
        `SELECT name, phone, default_address FROM customers WHERE merchant_id = $1 AND id = $2`,
        [merchantId, customerId],
      );

      // Calculate order total
      let total = 0;
      const itemDetails = [];
      for (const item of orderItems) {
        const variant = await client.query(
          `SELECT v.id, v.sku, v.name, v.price_modifier, i.name as item_name, i.base_price
           FROM inventory_variants v
           JOIN inventory_items i ON v.inventory_item_id = i.id
           WHERE v.id = $1`,
          [item.variantId],
        );
        if (variant.rows.length > 0) {
          const v = variant.rows[0];
          const price = v.price_modifier || v.base_price || 0;
          total += price * item.quantity;
          itemDetails.push({
            variantId: v.id,
            sku: v.sku,
            name: v.name || v.item_name,
            quantity: item.quantity,
            price,
          });
        }
      }

      // Create order
      const orderNumber = `RE-${Date.now().toString(36).toUpperCase()}`;
      const order = await client.query(
        `INSERT INTO orders (merchant_id, customer_id, conversation_id, order_number, total, status, 
                            customer_name, customer_phone, delivery_address, source, created_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, 'reorder', NOW())
         RETURNING id`,
        [
          merchantId,
          customerId,
          conversationId,
          orderNumber,
          total,
          customer.rows[0]?.name,
          customer.rows[0]?.phone,
          customer.rows[0]?.default_address,
        ],
      );

      const orderId = order.rows[0].id;

      // Insert order items
      for (const item of itemDetails) {
        await client.query(
          `INSERT INTO order_items (order_id, variant_id, sku, product_name, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            orderId,
            item.variantId,
            item.sku,
            item.name,
            item.quantity,
            item.price,
            item.price * item.quantity,
          ],
        );
      }

      // Increment reorder count
      await client.query(
        `UPDATE customers SET reorder_count = COALESCE(reorder_count, 0) + 1, 
                             last_order_items = $1
         WHERE merchant_id = $2 AND id = $3`,
        [JSON.stringify(itemDetails), merchantId, customerId],
      );

      await client.query("COMMIT");

      return {
        action: "REORDER_CREATED",
        orderId,
        orderNumber,
        total,
        itemCount: itemDetails.length,
        items: itemDetails,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // RETURN RISK SCORING (Pro Feature)
  // ============================================================================

  /**
   * Get customer's return/delivery risk score
   */
  async getCustomerRiskScore(
    task: AgentTask,
  ): Promise<Record<string, unknown>> {
    const { merchantId, customerId } = task.input as {
      merchantId: string;
      customerId: string;
    };

    // Check for existing score
    const existing = await this.pool.query(
      `SELECT risk_score, risk_factors, last_calculated_at
       FROM customer_risk_scores
       WHERE merchant_id = $1 AND customer_id = $2`,
      [merchantId, customerId],
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      const hoursSinceCalc =
        (Date.now() - new Date(row.last_calculated_at).getTime()) /
        (1000 * 60 * 60);

      // Return cached if less than 24 hours old
      if (hoursSinceCalc < 24) {
        return {
          customerId,
          riskScore: row.risk_score,
          riskLevel: this.getRiskLevel(row.risk_score),
          riskFactors: row.risk_factors,
          calculatedAt: row.last_calculated_at,
          cached: true,
        };
      }
    }

    // Calculate fresh score
    const result = await this.pool.query(
      `SELECT calculate_customer_risk_score($1, $2) as risk_score`,
      [merchantId, customerId],
    );

    const riskScore = result.rows[0]?.risk_score || 0;

    // Get updated factors
    const updated = await this.pool.query(
      `SELECT risk_factors FROM customer_risk_scores WHERE merchant_id = $1 AND customer_id = $2`,
      [merchantId, customerId],
    );

    return {
      customerId,
      riskScore,
      riskLevel: this.getRiskLevel(riskScore),
      riskFactors: updated.rows[0]?.risk_factors || {},
      calculatedAt: new Date().toISOString(),
      cached: false,
    };
  }

  private getRiskLevel(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (score >= 75) return "CRITICAL";
    if (score >= 50) return "HIGH";
    if (score >= 25) return "MEDIUM";
    return "LOW";
  }

  /**
   * Record a delivery outcome for risk scoring
   */
  async recordDeliveryOutcome(
    task: AgentTask,
  ): Promise<Record<string, unknown>> {
    const { merchantId, orderId, customerId, outcome, notes } = task.input as {
      merchantId: string;
      orderId: string;
      customerId: string;
      outcome:
        | "delivered"
        | "refused"
        | "failed_address"
        | "failed_no_answer"
        | "returned";
      notes?: string;
    };

    logger.info("Recording delivery outcome", { merchantId, orderId, outcome });

    await this.pool.query(
      `INSERT INTO delivery_outcomes (merchant_id, order_id, customer_id, outcome, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, 'ops_agent')`,
      [merchantId, orderId, customerId, outcome, notes],
    );

    // Recalculate risk score if negative outcome
    if (outcome !== "delivered") {
      await this.pool.query(`SELECT calculate_customer_risk_score($1, $2)`, [
        merchantId,
        customerId,
      ]);
    }

    return {
      action: "OUTCOME_RECORDED",
      orderId,
      outcome,
      riskUpdated: outcome !== "delivered",
    };
  }

  /**
   * Get customers with high return risk for a merchant
   */
  async getHighRiskCustomers(
    task: AgentTask,
  ): Promise<Record<string, unknown>> {
    const {
      merchantId,
      minRiskScore = 50,
      limit = 20,
    } = task.input as {
      merchantId: string;
      minRiskScore?: number;
      limit?: number;
    };

    const result = await this.pool.query(
      `SELECT crs.customer_id, crs.risk_score, crs.risk_factors, crs.last_calculated_at,
              c.name, c.phone, 
              (SELECT COUNT(*) FROM orders WHERE customer_id = crs.customer_id AND merchant_id = $1) as order_count
       FROM customer_risk_scores crs
       LEFT JOIN customers c ON c.id = crs.customer_id AND c.merchant_id = crs.merchant_id
       WHERE crs.merchant_id = $1 AND crs.risk_score >= $2
       ORDER BY crs.risk_score DESC
       LIMIT $3`,
      [merchantId, minRiskScore, limit],
    );

    return {
      merchantId,
      minRiskScore,
      customers: result.rows.map((r) => ({
        customerId: r.customer_id,
        name: r.name,
        phone: r.phone,
        riskScore: r.risk_score,
        riskLevel: this.getRiskLevel(r.risk_score),
        riskFactors: r.risk_factors,
        orderCount: parseInt(r.order_count) || 0,
        lastCalculated: r.last_calculated_at,
      })),
      count: result.rows.length,
    };
  }

  // ============================================================================
  // UPSELL / CROSS-SELL ENGINE
  // ============================================================================

  /**
   * Get upsell & cross-sell suggestions for a customer's current cart
   */
  async getUpsellSuggestions(
    task: AgentTask,
  ): Promise<Record<string, unknown>> {
    const { merchantId, cartItems, customerId, conversationId } =
      task.input as {
        merchantId: string;
        cartItems: Array<{
          itemId: string;
          name: string;
          price: number;
          category?: string;
        }>;
        customerId?: string;
        conversationId?: string;
      };

    const suggestions: Array<{
      type: "UPSELL" | "CROSS_SELL" | "BUNDLE" | "HISTORY_BASED";
      item: any;
      reason: string;
      reasonAr: string;
      discountPct: number;
      priority: number;
    }> = [];

    try {
      // 1. Rule-based suggestions from upsell_rules table
      for (const cartItem of cartItems) {
        const ruleResults = await this.pool.query(
          `SELECT ur.*,
                  COALESCE(ci.name_ar, ci.name_en, 'منتج') as target_name,
                  ci.base_price as target_price,
                  ci.image_url,
                  ci.base_price as effective_price
           FROM upsell_rules ur
           JOIN catalog_items ci ON ci.id = ur.target_item_id
           WHERE ur.merchant_id = $1
             AND ur.is_active = true
             AND (ur.source_item_id = $2::uuid OR ur.source_category = $3)
             AND ur.target_item_id != $2::uuid
             AND ci.is_available = true
           ORDER BY ur.priority DESC
           LIMIT 3`,
          [merchantId, cartItem.itemId, cartItem.category || ""],
        );

        for (const rule of ruleResults.rows) {
          suggestions.push({
            type: rule.rule_type || "CROSS_SELL",
            item: {
              id: rule.target_item_id,
              name: rule.target_name,
              price: parseFloat(rule.effective_price),
              imageUrl: rule.image_url,
            },
            reason: `Complements ${cartItem.name}`,
            reasonAr: rule.message_ar || `يتماشى مع ${cartItem.name}`,
            discountPct: parseFloat(rule.discount_pct) || 0,
            priority: rule.priority || 0,
          });

          // Track impression
          await this.pool
            .query(
              `UPDATE upsell_rules SET impressions = impressions + 1 WHERE id = $1`,
              [rule.id],
            )
            .catch((e) =>
              logger.warn(`Upsell impression increment failed: ${e.message}`),
            );
        }
      }

      // 2. Category-based auto-suggestions (same category, higher price = upsell)
      if (suggestions.length < 3) {
        for (const cartItem of cartItems) {
          const upsellResult = await this.pool.query(
            `SELECT ci.id, ci.name, ci.price, ci.image_url, ci.category
             FROM catalog_items ci
             WHERE ci.merchant_id = $1
               AND ci.is_active = true
               AND ci.category = $2
               AND ci.id != $3::uuid
               AND ci.price > $4
               AND ci.price <= $4 * 1.5
             ORDER BY ci.price ASC
             LIMIT 1`,
            [
              merchantId,
              cartItem.category || "",
              cartItem.itemId,
              cartItem.price,
            ],
          );

          for (const row of upsellResult.rows) {
            if (!suggestions.find((s) => s.item.id === row.id)) {
              suggestions.push({
                type: "UPSELL",
                item: {
                  id: row.id,
                  name: row.name,
                  price: parseFloat(row.price),
                  imageUrl: row.image_url,
                },
                reason: `Premium version in same category`,
                reasonAr: `نسخة أفضل في نفس الفئة`,
                discountPct: 0,
                priority: 5,
              });
            }
          }
        }
      }

      // 3. Purchase history suggestions (if customer exists)
      if (customerId && suggestions.length < 5) {
        const historyResult = await this.pool.query(
          `SELECT DISTINCT ci.id, ci.name, ci.price, ci.image_url
           FROM orders o
           CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
           JOIN catalog_items ci ON ci.name = item->>'name' AND ci.merchant_id = $1
           WHERE o.customer_id = $2 AND o.merchant_id = $1
             AND o.status IN ('DELIVERED', 'CONFIRMED')
             AND ci.is_active = true
             AND ci.id NOT IN (${cartItems.map((c) => `'${c.itemId}'`).join(",") || "''"})
           ORDER BY o.created_at DESC
           LIMIT 3`,
          [merchantId, customerId],
        );

        for (const row of historyResult.rows) {
          if (!suggestions.find((s) => s.item.id === row.id)) {
            suggestions.push({
              type: "HISTORY_BASED",
              item: {
                id: row.id,
                name: row.name,
                price: parseFloat(row.price),
                imageUrl: row.image_url,
              },
              reason: "Previously purchased",
              reasonAr: "اشتريتها قبل كده",
              discountPct: 0,
              priority: 3,
            });
          }
        }
      }

      // 4. Frequently bought together (co-occurrence in past orders)
      if (cartItems.length > 0 && suggestions.length < 5) {
        const fbtResult = await this.pool.query(
          `WITH cart_names AS (SELECT unnest($2::text[]) AS name)
           SELECT item->>'name' as name, COUNT(*) as co_count
           FROM orders o
           CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
           WHERE o.merchant_id = $1
             AND o.status IN ('DELIVERED', 'CONFIRMED')
             AND item->>'name' NOT IN (SELECT name FROM cart_names)
             AND o.id IN (
               SELECT o2.id FROM orders o2
               CROSS JOIN LATERAL jsonb_array_elements(o2.items) AS item2
               WHERE o2.merchant_id = $1
                 AND item2->>'name' IN (SELECT name FROM cart_names)
             )
           GROUP BY item->>'name'
           ORDER BY co_count DESC
           LIMIT 2`,
          [merchantId, cartItems.map((c) => c.name)],
        );

        for (const row of fbtResult.rows) {
          const itemLookup = await this.pool.query(
            `SELECT id, name, price, image_url FROM catalog_items WHERE merchant_id = $1 AND name = $2 AND is_active = true LIMIT 1`,
            [merchantId, row.name],
          );
          if (
            itemLookup.rows[0] &&
            !suggestions.find((s) => s.item.id === itemLookup.rows[0].id)
          ) {
            suggestions.push({
              type: "CROSS_SELL",
              item: {
                id: itemLookup.rows[0].id,
                name: row.name,
                price: parseFloat(itemLookup.rows[0].price),
                imageUrl: itemLookup.rows[0].image_url,
              },
              reason: `Frequently bought together (${row.co_count} times)`,
              reasonAr: `كتير بيتشتري مع بعض (${row.co_count} مرة)`,
              discountPct: 0,
              priority: 4,
            });
          }
        }
      }

      // Sort by priority descending, take top 5
      suggestions.sort((a, b) => b.priority - a.priority);
      const topSuggestions = suggestions.slice(0, 5);

      // Build Arabic message for WhatsApp
      let suggestedMessageAr = "";
      if (topSuggestions.length > 0) {
        suggestedMessageAr = "💡 ممكن يعجبك كمان:\n";
        topSuggestions.forEach((s, i) => {
          const discountStr =
            s.discountPct > 0 ? ` (خصم ${s.discountPct}%)` : "";
          suggestedMessageAr += `${i + 1}. ${s.item.name} — ${s.item.price} ج.م${discountStr}\n   ${s.reasonAr}\n`;
        });
        suggestedMessageAr += "\nرد بالرقم لإضافته للسلة 🛒";
      }

      return {
        suggestions: topSuggestions,
        suggestedMessageAr,
        count: topSuggestions.length,
      };
    } catch (error) {
      logger.error("getUpsellSuggestions failed", {
        error: (error as Error).message,
      });
      return { suggestions: [], count: 0 };
    }
  }

  /**
   * Record upsell conversion (customer accepted a suggestion)
   */
  async recordUpsellConversion(
    task: AgentTask,
  ): Promise<Record<string, unknown>> {
    const { merchantId, ruleId, itemId } = task.input as {
      merchantId: string;
      ruleId?: string;
      itemId: string;
    };
    if (ruleId) {
      await this.pool
        .query(
          `UPDATE upsell_rules SET conversions = conversions + 1 WHERE id = $1`,
          [ruleId],
        )
        .catch((e) =>
          logger.warn(`Upsell conversion increment failed: ${e.message}`),
        );
    }
    return { recorded: true, itemId };
  }

  // ============================================================================
  // DELIVERY ETA CALCULATOR
  // ============================================================================

  /**
   * Calculate delivery ETA based on historical data per area
   */
  async calculateDeliveryEta(
    task: AgentTask,
  ): Promise<Record<string, unknown>> {
    const { merchantId, area, orderId } = task.input as {
      merchantId: string;
      area: string;
      orderId?: string;
    };

    try {
      // 1. Check configured ETA for this area
      const configResult = await this.pool.query(
        `SELECT avg_delivery_hours, sample_count FROM delivery_eta_config
         WHERE merchant_id = $1 AND LOWER(area_name) = LOWER($2)`,
        [merchantId, area],
      );

      let etaHours: number;
      let confidence: "HIGH" | "MEDIUM" | "LOW";
      let source: string;

      if (
        configResult.rows.length > 0 &&
        configResult.rows[0].sample_count >= 5
      ) {
        etaHours = parseFloat(configResult.rows[0].avg_delivery_hours);
        confidence =
          configResult.rows[0].sample_count >= 20 ? "HIGH" : "MEDIUM";
        source = "historical_data";
      } else {
        // 2. Calculate from past deliveries to this area
        const historicalResult = await this.pool.query(
          `SELECT AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.shipped_at)) / 3600) as avg_hours,
                  COUNT(*) as sample_count
           FROM shipments s
           JOIN orders o ON o.id = s.order_id
           WHERE s.merchant_id = $1
             AND s.delivered_at IS NOT NULL
             AND s.shipped_at IS NOT NULL
             AND (LOWER(o.delivery_address->>'area') = LOWER($2) OR LOWER(o.delivery_address->>'city') = LOWER($2))
             AND s.delivered_at > NOW() - INTERVAL '90 days'`,
          [merchantId, area],
        );

        const hist = historicalResult.rows[0];
        if (hist && parseInt(hist.sample_count) >= 3) {
          etaHours = Math.round(parseFloat(hist.avg_hours) * 10) / 10;
          confidence = parseInt(hist.sample_count) >= 10 ? "MEDIUM" : "LOW";
          source = "calculated";

          // Cache it for future use
          await this.pool
            .query(
              `INSERT INTO delivery_eta_config (merchant_id, area_name, avg_delivery_hours, sample_count)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (merchant_id, area_name)
             DO UPDATE SET avg_delivery_hours = $3, sample_count = $4, last_updated = NOW()`,
              [merchantId, area, etaHours, parseInt(hist.sample_count)],
            )
            .catch((e) =>
              logger.warn(`ETA config cache upsert failed: ${e.message}`),
            );
        } else {
          // 3. Fallback: merchant-wide average
          const globalResult = await this.pool.query(
            `SELECT AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.shipped_at)) / 3600) as avg_hours
             FROM shipments s
             WHERE s.merchant_id = $1 AND s.delivered_at IS NOT NULL AND s.shipped_at IS NOT NULL
               AND s.delivered_at > NOW() - INTERVAL '90 days'`,
            [merchantId],
          );
          etaHours = globalResult.rows[0]?.avg_hours
            ? Math.round(parseFloat(globalResult.rows[0].avg_hours) * 10) / 10
            : 24;
          confidence = "LOW";
          source = "global_average";
        }
      }

      // Format ETA
      const etaDays = Math.ceil(etaHours / 24);
      const etaText =
        etaHours < 24
          ? `${Math.round(etaHours)} ساعة`
          : etaDays === 1
            ? "يوم واحد"
            : `${etaDays} أيام`;

      return {
        area,
        etaHours,
        etaDays,
        etaTextAr: `الوقت المتوقع للتوصيل: ${etaText}`,
        confidence,
        source,
      };
    } catch (error) {
      logger.error("calculateDeliveryEta failed", {
        error: (error as Error).message,
      });
      return {
        area,
        etaHours: 24,
        etaDays: 1,
        etaTextAr: "الوقت المتوقع للتوصيل: 1-2 يوم عمل",
        confidence: "LOW",
        source: "default",
      };
    }
  }

  /**
   * Update ETA config from actual delivery data (called after delivery confirmation)
   */
  async updateDeliveryEtaStats(
    task: AgentTask,
  ): Promise<Record<string, unknown>> {
    const { merchantId } = task.input as { merchantId: string };

    const result = await this.pool.query(
      `INSERT INTO delivery_eta_config (merchant_id, area_name, avg_delivery_hours, sample_count)
       SELECT s.merchant_id,
              COALESCE(o.delivery_address->>'area', o.delivery_address->>'city', 'unknown'),
              AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.shipped_at)) / 3600),
              COUNT(*)
       FROM shipments s
       JOIN orders o ON o.id = s.order_id
       WHERE s.merchant_id = $1
         AND s.delivered_at IS NOT NULL AND s.shipped_at IS NOT NULL
         AND s.delivered_at > NOW() - INTERVAL '90 days'
       GROUP BY s.merchant_id, COALESCE(o.delivery_address->>'area', o.delivery_address->>'city', 'unknown')
       ON CONFLICT (merchant_id, area_name)
       DO UPDATE SET avg_delivery_hours = EXCLUDED.avg_delivery_hours, sample_count = EXCLUDED.sample_count, last_updated = NOW()`,
      [merchantId],
    );

    return { updated: true, areasUpdated: result.rowCount };
  }

  // ============================================================================
  // COMPLAINT RESOLUTION PLAYBOOKS
  // ============================================================================

  /**
   * Start a complaint resolution playbook
   */
  async handleComplaint(task: AgentTask): Promise<Record<string, unknown>> {
    const {
      merchantId,
      conversationId,
      customerId,
      complaintType,
      orderId,
      messageText,
    } = task.input as {
      merchantId: string;
      conversationId: string;
      customerId?: string;
      complaintType?: string;
      orderId?: string;
      messageText?: string;
    };

    try {
      // Auto-detect complaint type from message if not provided
      const detectedType =
        complaintType || this.detectComplaintType(messageText || "");

      // Get playbook for this complaint type
      const playbookResult = await this.pool.query(
        `SELECT * FROM complaint_playbooks
         WHERE (merchant_id = $1 OR merchant_id IS NULL)
           AND complaint_type = $2
         ORDER BY merchant_id NULLS LAST, step_number ASC`,
        [merchantId, detectedType],
      );

      if (playbookResult.rows.length === 0) {
        // Fallback: generic apology + escalate
        return {
          action: "GENERIC_RESPONSE",
          complaintType: detectedType,
          messageAr:
            "نأسف جداً للإزعاج! تم تسجيل شكوتك وهنتواصل معاك في أقرب وقت.",
          shouldEscalate: true,
        };
      }

      const steps = playbookResult.rows;
      const firstStep = steps[0];

      // Get order details if orderId provided
      let orderDetails: any = null;
      if (orderId) {
        const orderResult = await this.pool.query(
          `SELECT id, order_number, total, status, items FROM orders WHERE id = $1 AND merchant_id = $2`,
          [orderId, merchantId],
        );
        orderDetails = orderResult.rows[0];
      }

      // Store complaint state in conversation context
      await this.pool.query(
        `UPDATE conversations
         SET context = jsonb_set(COALESCE(context, '{}'::jsonb), '{complaint}', $2::jsonb, true),
             updated_at = NOW()
         WHERE id = $1`,
        [
          conversationId,
          JSON.stringify({
            type: detectedType,
            currentStep: firstStep.step_number,
            orderId,
            startedAt: new Date().toISOString(),
            steps: steps.map((s) => ({
              step: s.step_number,
              action: s.action_type,
            })),
          }),
        ],
      );

      // Format the response message
      let responseMessage = firstStep.message_template_ar;
      if (orderDetails) {
        responseMessage = responseMessage
          .replace("{order_total}", `${orderDetails.total} ج.م`)
          .replace("{order_number}", orderDetails.order_number);
      }
      if (firstStep.auto_compensation_pct) {
        responseMessage = responseMessage.replace(
          "{compensation}",
          `${firstStep.auto_compensation_pct}`,
        );
      }

      // Log AI decision
      await this.pool
        .query(
          `INSERT INTO ai_decision_log (merchant_id, agent_type, decision_type, input_summary, decision, reasoning, entity_type, entity_id, metadata)
         VALUES ($1, 'OPS_AGENT', 'COMPLAINT_STARTED', $2, $3, $4, 'CONVERSATION', $5, $6)`,
          [
            merchantId,
            `Complaint: ${detectedType} for order ${orderId || "N/A"}`,
            `Started ${detectedType} playbook at step ${firstStep.step_number}`,
            `Auto-detected type: ${detectedType}, playbook has ${steps.length} steps`,
            conversationId,
            JSON.stringify({
              complaintType: detectedType,
              orderId,
              stepsCount: steps.length,
            }),
          ],
        )
        .catch((e) =>
          logger.warn(`AI decision log insert failed: ${e.message}`),
        );

      return {
        action: "PLAYBOOK_STARTED",
        complaintType: detectedType,
        currentStep: firstStep.step_number,
        totalSteps: steps.length,
        messageAr: responseMessage,
        requiresPhoto: firstStep.requires_photo || false,
        requiresConfirmation: firstStep.requires_confirmation || false,
        shouldEscalate: firstStep.escalate_after_step || false,
      };
    } catch (error) {
      logger.error("handleComplaint failed", {
        error: (error as Error).message,
      });
      return {
        action: "GENERIC_RESPONSE",
        messageAr: "نأسف جداً! تم تسجيل شكوتك وهنتواصل معاك قريب.",
        shouldEscalate: true,
      };
    }
  }

  /**
   * Advance to next step in complaint playbook based on customer response
   */
  async advanceComplaintStep(
    task: AgentTask,
  ): Promise<Record<string, unknown>> {
    const { merchantId, conversationId, customerResponse } = task.input as {
      merchantId: string;
      conversationId: string;
      customerResponse: "yes" | "no" | "photo" | "text";
    };

    try {
      // Get current complaint state from conversation context
      const convResult = await this.pool.query(
        `SELECT context->'complaint' as complaint FROM conversations WHERE id = $1`,
        [conversationId],
      );

      const complaint = convResult.rows[0]?.complaint;
      if (!complaint || !complaint.currentStep) {
        return {
          action: "NO_ACTIVE_COMPLAINT",
          messageAr: "لا يوجد شكوى نشطة",
        };
      }

      // Get current step
      const currentStepResult = await this.pool.query(
        `SELECT * FROM complaint_playbooks
         WHERE (merchant_id = $1 OR merchant_id IS NULL)
           AND complaint_type = $2
           AND step_number = $3
         ORDER BY merchant_id NULLS LAST
         LIMIT 1`,
        [merchantId, complaint.type, complaint.currentStep],
      );

      if (currentStepResult.rows.length === 0) {
        return {
          action: "PLAYBOOK_COMPLETE",
          messageAr: "تم معالجة شكوتك. شكراً لصبرك!",
        };
      }

      const currentStep = currentStepResult.rows[0];
      const nextStepNum =
        customerResponse === "yes" || customerResponse === "photo"
          ? currentStep.next_step_on_yes
          : currentStep.next_step_on_no;

      if (!nextStepNum) {
        return {
          action: "PLAYBOOK_COMPLETE",
          messageAr: "تم معالجة شكوتك بنجاح. شكراً لصبرك! 🙏",
        };
      }

      // Get next step
      const nextStepResult = await this.pool.query(
        `SELECT * FROM complaint_playbooks
         WHERE (merchant_id = $1 OR merchant_id IS NULL)
           AND complaint_type = $2
           AND step_number = $3
         ORDER BY merchant_id NULLS LAST
         LIMIT 1`,
        [merchantId, complaint.type, nextStepNum],
      );

      if (nextStepResult.rows.length === 0) {
        return {
          action: "PLAYBOOK_COMPLETE",
          messageAr: "تم معالجة شكوتك بنجاح. شكراً لصبرك! 🙏",
        };
      }

      const nextStep = nextStepResult.rows[0];

      // Update conversation context
      await this.pool.query(
        `UPDATE conversations
         SET context = jsonb_set(context, '{complaint,currentStep}', $2::jsonb),
             updated_at = NOW()
         WHERE id = $1`,
        [conversationId, JSON.stringify(nextStep.step_number)],
      );

      let responseMessage = nextStep.message_template_ar;
      if (nextStep.auto_compensation_pct) {
        responseMessage = responseMessage.replace(
          "{compensation}",
          `${nextStep.auto_compensation_pct}`,
        );
      }

      return {
        action: nextStep.escalate_after_step ? "ESCALATE" : "NEXT_STEP",
        currentStep: nextStep.step_number,
        messageAr: responseMessage,
        requiresPhoto: nextStep.requires_photo || false,
        shouldEscalate: nextStep.escalate_after_step || false,
        autoCompensation: nextStep.auto_compensation_pct || null,
      };
    } catch (error) {
      logger.error("advanceComplaintStep failed", {
        error: (error as Error).message,
      });
      return { action: "ERROR", messageAr: "حصل خطأ. تم تحويلك لفريق الدعم." };
    }
  }

  /**
   * Detect complaint type from Arabic message text
   */
  private detectComplaintType(text: string): string {
    const lower = text.toLowerCase();
    if (/غلط|خطأ|مش ده|مختلف|تاني/.test(lower)) return "WRONG_ITEM";
    if (/مكسور|تالف|خربان|damaged/.test(lower)) return "DAMAGED";
    if (/متأخر|تأخير|فين الطلب|لسه|late/.test(lower)) return "LATE_DELIVERY";
    if (/ناقص|مش كامل|missing/.test(lower)) return "MISSING_ITEM";
    if (/جودة|وحش|مش حلو|quality/.test(lower)) return "QUALITY";
    if (/غالي|فلوس|زيادة|حساب|overcharg/.test(lower)) return "OVERCHARGED";
    return "QUALITY"; // default
  }

  // ============================================================================
  // CUSTOMER MEMORY / PERSONALIZATION STORE
  // ============================================================================

  /**
   * Save a memory fact about a customer (preferences, history, notes)
   */
  async saveCustomerMemory(input: {
    merchantId: string;
    customerId: string;
    memoryType: string; // PREFERENCE, BEHAVIOR, NOTE, ALLERGY, ADDRESS, PAYMENT_PREF
    key: string;
    value: string;
    source?: string;
    confidence?: number;
  }): Promise<Record<string, unknown>> {
    try {
      await this.pool.query(
        `INSERT INTO customer_memory (merchant_id, customer_id, memory_type, key, value, source, confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (merchant_id, customer_id, memory_type, key) DO UPDATE SET
           value = EXCLUDED.value,
           source = COALESCE(EXCLUDED.source, customer_memory.source),
           confidence = GREATEST(COALESCE(EXCLUDED.confidence, customer_memory.confidence), customer_memory.confidence),
           access_count = customer_memory.access_count + 1,
           last_accessed_at = NOW(),
           updated_at = NOW()`,
        [
          input.merchantId,
          input.customerId,
          input.memoryType,
          input.key,
          input.value,
          input.source || "AGENT",
          input.confidence || 0.8,
        ],
      );

      return {
        action: "MEMORY_SAVED",
        customerId: input.customerId,
        memoryType: input.memoryType,
        key: input.key,
        message: `تم حفظ ${input.memoryType}: ${input.key} = ${input.value}`,
      };
    } catch (error) {
      logger.error(`saveCustomerMemory failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Retrieve all stored memories for a customer, ranked by relevance
   */
  async getCustomerMemory(input: {
    merchantId: string;
    customerId: string;
    memoryType?: string;
  }): Promise<Record<string, unknown>> {
    try {
      const params: any[] = [input.merchantId, input.customerId];
      let typeFilter = "";
      if (input.memoryType) {
        typeFilter = " AND memory_type = $3";
        params.push(input.memoryType);
      }

      const result = await this.pool.query(
        `SELECT id, memory_type, key, value, source, confidence, access_count, last_accessed_at, created_at
         FROM customer_memory
         WHERE merchant_id = $1 AND customer_id = $2${typeFilter}
         ORDER BY confidence DESC, access_count DESC, updated_at DESC`,
        params,
      );

      // Update access count
      if (result.rows.length > 0) {
        await this.pool.query(
          `UPDATE customer_memory SET access_count = access_count + 1, last_accessed_at = NOW()
           WHERE merchant_id = $1 AND customer_id = $2${typeFilter}`,
          params,
        );
      }

      // Build a summary for AI context injection
      const memoryByType: Record<
        string,
        Array<{ key: string; value: string }>
      > = {};
      for (const row of result.rows) {
        if (!memoryByType[row.memory_type]) memoryByType[row.memory_type] = [];
        memoryByType[row.memory_type].push({ key: row.key, value: row.value });
      }

      const contextSummary = Object.entries(memoryByType)
        .map(
          ([type, items]) =>
            `[${type}] ${items.map((i) => `${i.key}: ${i.value}`).join(", ")}`,
        )
        .join(" | ");

      return {
        customerId: input.customerId,
        memories: result.rows.map((r) => ({
          id: r.id,
          type: r.memory_type,
          key: r.key,
          value: r.value,
          confidence: parseFloat(r.confidence),
          source: r.source,
          accessCount: r.access_count,
          createdAt: r.created_at,
        })),
        contextSummary,
        totalMemories: result.rows.length,
      };
    } catch (error) {
      logger.error(`getCustomerMemory failed: ${(error as Error).message}`);
      return {
        customerId: input.customerId,
        memories: [],
        contextSummary: "",
        totalMemories: 0,
      };
    }
  }

  /**
   * Auto-extract memories from a conversation message using pattern detection
   */
  async extractMemoriesFromMessage(input: {
    merchantId: string;
    customerId: string;
    text: string;
    conversationId?: string;
  }): Promise<Record<string, unknown>> {
    const extracted: Array<{ type: string; key: string; value: string }> = [];
    const text = input.text;

    // Address patterns (Arabic)
    const addressMatch = text.match(/عنوان[يي]?\s*[:؟]?\s*(.+?)(?:\.|$)/);
    if (addressMatch) {
      extracted.push({
        type: "ADDRESS",
        key: "delivery_address",
        value: addressMatch[1].trim(),
      });
    }

    // Area/zone mention
    const areaMatch = text.match(
      /(المعادي|مدينة نصر|التجمع|الشيخ زايد|6 أكتوبر|المهندسين|الدقي|الهرم|حلوان|شبرا|العباسية|مصر الجديدة|النزهة|المقطم)/i,
    );
    if (areaMatch) {
      extracted.push({ type: "ADDRESS", key: "area", value: areaMatch[1] });
    }

    // Payment preference
    if (/فودافون كاش|vodafone cash/i.test(text)) {
      extracted.push({
        type: "PAYMENT_PREF",
        key: "preferred_payment",
        value: "VODAFONE_CASH",
      });
    } else if (/انستاباي|instapay/i.test(text)) {
      extracted.push({
        type: "PAYMENT_PREF",
        key: "preferred_payment",
        value: "INSTAPAY",
      });
    } else if (/كاش|نقد|عند الاستلام/i.test(text)) {
      extracted.push({
        type: "PAYMENT_PREF",
        key: "preferred_payment",
        value: "COD",
      });
    }

    // Allergy / dietary
    const allergyMatch = text.match(
      /(حساسية|allergic|بدون)\s*(لبن|فول سوداني|جلوتين|سكر|ملح|لحمة|dairy|nuts|gluten)/i,
    );
    if (allergyMatch) {
      extracted.push({
        type: "ALLERGY",
        key: allergyMatch[2],
        value: `حساسية ${allergyMatch[2]}`,
      });
    }

    // Preference patterns
    if (/نباتي|vegetarian|vegan/i.test(text)) {
      extracted.push({ type: "PREFERENCE", key: "diet", value: "VEGETARIAN" });
    }

    // Save extracted memories
    for (const mem of extracted) {
      await this.saveCustomerMemory({
        merchantId: input.merchantId,
        customerId: input.customerId,
        memoryType: mem.type,
        key: mem.key,
        value: mem.value,
        source: "AUTO_EXTRACT",
        confidence: 0.7,
      });
    }

    return {
      customerId: input.customerId,
      extracted,
      count: extracted.length,
    };
  }

  // ============================================================================
  // UNIFIED AI AUDIT TRAIL
  // ============================================================================

  /**
   * Log an AI decision to the audit trail
   */
  async logAiDecision(input: {
    merchantId: string;
    agentType: string; // OPS_AGENT, INVENTORY_AGENT, FINANCE_AGENT
    decisionType: string; // NBA, UPSELL, COMPLAINT, RESTOCK, ANOMALY, etc.
    inputSummary: string;
    decision: string;
    reasoning?: string;
    entityType?: string; // ORDER, CUSTOMER, ITEM, CONVERSATION
    entityId?: string;
    confidence?: number;
    metadata?: Record<string, any>;
  }): Promise<Record<string, unknown>> {
    try {
      const result = await this.pool.query(
        `INSERT INTO ai_decision_log (merchant_id, agent_type, decision_type, input_summary, decision, reasoning, entity_type, entity_id, confidence, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, created_at`,
        [
          input.merchantId,
          input.agentType,
          input.decisionType,
          input.inputSummary,
          input.decision,
          input.reasoning || null,
          input.entityType || null,
          input.entityId || null,
          input.confidence || null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ],
      );

      return {
        logged: true,
        logId: result.rows[0].id,
        createdAt: result.rows[0].created_at,
      };
    } catch (error) {
      logger.error(`logAiDecision failed: ${(error as Error).message}`);
      return { logged: false, error: (error as Error).message };
    }
  }

  /**
   * Query AI decision audit trail with filters
   */
  async getAiDecisionLog(input: {
    merchantId: string;
    agentType?: string;
    decisionType?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
    since?: string;
  }): Promise<Record<string, unknown>> {
    try {
      const conditions = ["merchant_id = $1"];
      const params: any[] = [input.merchantId];
      let idx = 2;

      if (input.agentType) {
        conditions.push(`agent_type = $${idx++}`);
        params.push(input.agentType);
      }
      if (input.decisionType) {
        conditions.push(`decision_type = $${idx++}`);
        params.push(input.decisionType);
      }
      if (input.entityType) {
        conditions.push(`entity_type = $${idx++}`);
        params.push(input.entityType);
      }
      if (input.entityId) {
        conditions.push(`entity_id = $${idx++}`);
        params.push(input.entityId);
      }
      if (input.since) {
        conditions.push(`created_at >= $${idx++}`);
        params.push(input.since);
      }

      const limit = input.limit || 50;
      params.push(limit);

      const result = await this.pool.query(
        `SELECT id, agent_type, decision_type, input_summary, decision, reasoning, entity_type, entity_id, confidence, created_at
         FROM ai_decision_log
         WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT $${idx}`,
        params,
      );

      // Summary stats
      const stats = await this.pool.query(
        `SELECT agent_type, decision_type, COUNT(*) as count
         FROM ai_decision_log WHERE merchant_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
         GROUP BY agent_type, decision_type ORDER BY count DESC LIMIT 20`,
        [input.merchantId],
      );

      return {
        decisions: result.rows.map((r) => ({
          id: r.id,
          agentType: r.agent_type,
          decisionType: r.decision_type,
          inputSummary: r.input_summary,
          decision: r.decision,
          reasoning: r.reasoning,
          entityType: r.entity_type,
          entityId: r.entity_id,
          confidence: r.confidence ? parseFloat(r.confidence) : null,
          createdAt: r.created_at,
        })),
        count: result.rows.length,
        weeklyStats: stats.rows.map((r: any) => ({
          agent: r.agent_type,
          type: r.decision_type,
          count: parseInt(r.count),
        })),
      };
    } catch (error) {
      logger.error(`getAiDecisionLog failed: ${(error as Error).message}`);
      return { decisions: [], count: 0, weeklyStats: [] };
    }
  }
}
