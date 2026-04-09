import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { RedisService } from "../../infrastructure/redis/redis.service";
import { InventoryAiService } from "../llm/inventory-ai.service";
import { FinanceAiService } from "../llm/finance-ai.service";
import { NotificationsService } from "../services/notifications.service";
import { CommerceFactsService } from "../services/commerce-facts.service";

/**
 * Runs automation checks EVERY HOUR.
 *
 * Whether a specific merchant's automation actually fires is governed by
 * `merchant_automations.check_interval_hours` (default 24).
 * The scheduler stamps `last_checked_at` after processing so it knows
 * whether to skip the next hourly tick.
 *
 * This means:
 *  - SUPPLIER_LOW_STOCK can be set to every 2 h → catches mid-day stockouts
 *  - REVIEW_REQUEST / WELCOME default to 24 h
 *  - REENGAGEMENT_AUTO defaults to 168 h (weekly)
 *  - Merchant can update check_interval_hours via PATCH /portal/automations/:type
 */
@Injectable()
export class AutomationScheduler {
  private readonly logger = new Logger(AutomationScheduler.name);
  private readonly lockKey = "automation-scheduler-lock";
  private readonly lockTtl = 300_000; // 5 minutes

  /** Default intervals (hours) if merchant hasn't configured one */
  private static readonly DEFAULT_INTERVALS: Record<string, number> = {
    SUPPLIER_LOW_STOCK: 2, // every 2 h — catches mid-day stockouts
    REVIEW_REQUEST: 24,
    NEW_CUSTOMER_WELCOME: 1, // check every hour — welcome ASAP
    REENGAGEMENT_AUTO: 168, // weekly
    // --- New automations ---
    CHURN_PREVENTION: 168, // weekly
    QUOTE_FOLLOWUP: 2, // every 2 h
    LOYALTY_MILESTONE: 1, // hourly
    EXPENSE_SPIKE_ALERT: 24, // nightly
    DELIVERY_SLA_BREACH: 4, // every 4 h
    TOKEN_USAGE_WARNING: 24, // daily
    AI_ANOMALY_DETECTION: 24, // nightly
    SEASONAL_STOCK_PREP: 24, // daily
    SENTIMENT_MONITOR: 24, // nightly
    LEAD_SCORE: 24, // daily
    AUTO_VIP_TAG: 24, // nightly
    AT_RISK_TAG: 24, // nightly
    HIGH_RETURN_FLAG: 24, // nightly
  };

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly redisService: RedisService,
    private readonly inventoryAiService: InventoryAiService,
    private readonly financeAiService: FinanceAiService,
    private readonly notificationsService: NotificationsService,
    private readonly commerceFactsService: CommerceFactsService,
  ) {}

  /** Runs every hour on the dot */
  @Cron("0 * * * *")
  async runAutomationCycle(): Promise<void> {
    const lock = await this.redisService.acquireLock(
      this.lockKey,
      this.lockTtl,
    );
    if (!lock) {
      this.logger.debug("Could not acquire automation scheduler lock");
      return;
    }

    try {
      // Find enabled automations that are due (last_checked_at is old enough)
      const due = await this.pool.query<{
        merchant_id: string;
        automation_type: string;
        config: any;
        check_interval_hours: number;
      }>(
        `SELECT merchant_id, automation_type, config, check_interval_hours
         FROM merchant_automations
         WHERE is_enabled = true
           AND (
             last_checked_at IS NULL
             OR last_checked_at < NOW() - INTERVAL '1 hour' * check_interval_hours
           )
         ORDER BY merchant_id, automation_type`,
      );

      this.logger.log(`Automation cycle: ${due.rows.length} tasks due`);

      for (const row of due.rows) {
        await this.stamp(row.merchant_id, row.automation_type);
        switch (row.automation_type) {
          case "SUPPLIER_LOW_STOCK":
            await this.runSupplierLowStock(row.merchant_id, row.config);
            break;
          case "REVIEW_REQUEST":
            await this.runReviewRequest(row.merchant_id, row.config);
            break;
          case "NEW_CUSTOMER_WELCOME":
            await this.runNewCustomerWelcome(row.merchant_id, row.config);
            break;
          case "REENGAGEMENT_AUTO":
            await this.runReengagementAuto(row.merchant_id, row.config);
            break;
          case "CHURN_PREVENTION":
            await this.runChurnPrevention(row.merchant_id, row.config);
            break;
          case "QUOTE_FOLLOWUP":
            await this.runQuoteFollowup(row.merchant_id, row.config);
            break;
          case "LOYALTY_MILESTONE":
            await this.runLoyaltyMilestone(row.merchant_id, row.config);
            break;
          case "EXPENSE_SPIKE_ALERT":
            await this.runExpenseSpikeAlert(row.merchant_id, row.config);
            break;
          case "DELIVERY_SLA_BREACH":
            await this.runDeliverySLABreach(row.merchant_id, row.config);
            break;
          case "TOKEN_USAGE_WARNING":
            await this.runTokenUsageWarning(row.merchant_id, row.config);
            break;
          case "AI_ANOMALY_DETECTION":
            await this.runAiAnomalyDetection(row.merchant_id, row.config);
            break;
          case "SEASONAL_STOCK_PREP":
            await this.runSeasonalStockPrep(row.merchant_id, row.config);
            break;
          case "SENTIMENT_MONITOR":
            await this.runSentimentMonitor(row.merchant_id, row.config);
            break;
          case "LEAD_SCORE":
            await this.runLeadScoring(row.merchant_id, row.config);
            break;
          case "AUTO_VIP_TAG":
            await this.runAutoVipTag(row.merchant_id, row.config);
            break;
          case "AT_RISK_TAG":
            await this.runAtRiskTag(row.merchant_id, row.config);
            break;
          case "HIGH_RETURN_FLAG":
            await this.runHighReturnFlag(row.merchant_id, row.config);
            break;
        }
      }
    } catch (error: any) {
      this.logger.error({
        msg: "Automation scheduler top-level error",
        error: error.message,
      });
      try {
        await this.pool.query(
          `INSERT INTO job_failure_events (job_name, error_message, error_stack)
           VALUES ($1, $2, $3)`,
          ["automation-scheduler", error.message, error.stack ?? null],
        );
      } catch {
        /* non-fatal */
      }
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  /** Stamp last_checked_at so this automation won't re-fire until interval elapses */
  private async stamp(
    merchantId: string,
    automationType: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE merchant_automations SET last_checked_at = NOW()
       WHERE merchant_id = $1 AND automation_type = $2`,
      [merchantId, automationType],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUPPLIER LOW-STOCK ALERT
  // ─────────────────────────────────────────────────────────────────────────

  private async runSupplierLowStock(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "SUPPLIER_LOW_STOCK";
    let sent = 0;
    let targets = 0;
    try {
      const threshold = (config?.threshold ?? "critical") as string;

      const stockFilter =
        threshold === "critical"
          ? `quantity_in_stock = 0`
          : threshold === "warning"
            ? `quantity_in_stock <= COALESCE(reorder_level, 5)`
            : `quantity_in_stock <= COALESCE(reorder_level, 10)`;

      // ── 1. Fetch merchant name + owner WhatsApp ────────────────────────
      const merchantRow = await this.pool.query<{
        name: string;
        owner_phone: string | null;
      }>(
        `SELECT name, whatsapp_number AS owner_phone FROM merchants WHERE id = $1`,
        [merchant_id],
      );
      const merchantName = merchantRow.rows[0]?.name ?? "التاجر";
      const ownerPhone = merchantRow.rows[0]?.owner_phone ?? null;

      // ── 2. All low-stock products (regardless of supplier link) ───────────
      const allCriticalResult = await this.pool.query<{
        product_id: string;
        product_name: string;
        sku: string;
        quantity_in_stock: number;
        reorder_level: number | null;
        has_supplier: boolean;
      }>(
        `SELECT *
         FROM (
           SELECT ii.id AS product_id,
                  COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku, ii.id::text) AS product_name,
                  COALESCE(ii.sku, ii.id::text) AS sku,
                  COALESCE((
                    SELECT SUM(iv.quantity_on_hand)
                    FROM inventory_variants iv
                    WHERE iv.inventory_item_id = ii.id
                      AND iv.merchant_id = ii.merchant_id
                  ), 0) AS quantity_in_stock,
                  COALESCE(ii.reorder_point, 5) AS reorder_level,
                  EXISTS (
                    SELECT 1 FROM supplier_products sp2
                    JOIN suppliers s2 ON s2.id = sp2.supplier_id
                    WHERE sp2.product_id = ii.id
                      AND s2.is_active = true
                      AND s2.merchant_id = ii.merchant_id
                  ) AS has_supplier
           FROM inventory_items ii
           LEFT JOIN catalog_items ci
             ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
           WHERE ii.merchant_id = $1
         ) stock
         WHERE ${stockFilter}
         ORDER BY quantity_in_stock ASC
         LIMIT 50`,
        [merchant_id],
      );
      const criticalProducts = allCriticalResult.rows;

      // ── 3. Alert the merchant owner ───────────────────────────────────────
      if (criticalProducts.length > 0) {
        const preview = criticalProducts
          .slice(0, 5)
          .map((p) => `${p.product_name} (متوفر: ${p.quantity_in_stock})`)
          .join(" | ");
        const moreCount = Math.max(0, criticalProducts.length - 5);

        // in-app / push notification to merchant owner
        for (const p of criticalProducts.slice(0, 10)) {
          try {
            await this.notificationsService.notifyLowStock(
              merchant_id,
              p.product_id,
              p.product_name,
              p.quantity_in_stock,
              p.reorder_level ?? 5,
            );
          } catch {
            /* non-fatal */
          }
        }

        // WhatsApp to owner
        if (ownerPhone) {
          const lines = criticalProducts
            .slice(0, 10)
            .map((p, i) => {
              const flag = p.quantity_in_stock === 0 ? "🔴" : "🟠";
              return `${flag} ${i + 1}. ${p.product_name} — متبقٍ: ${p.quantity_in_stock}${p.reorder_level ? ` / حد الطلب: ${p.reorder_level}` : ""}`;
            })
            .join("\n");
          const extra =
            criticalProducts.length > 10
              ? `\n...(${criticalProducts.length - 10} منتجات أخرى)`
              : "";
          try {
            await this.notificationsService.sendBroadcastWhatsApp(
              ownerPhone,
              [
                `🚨 تنبيه مخزون – ${merchantName}`,
                ``,
                `تم اكتشاف ${criticalProducts.length} منتج يحتاج إعادة تزويد:`,
                ``,
                lines + extra,
                ``,
                `📊 غير مرتبط بمورّد: ${criticalProducts.filter((p) => !p.has_supplier).length} منتج`,
                `🔗 راجع لوحة الموردين للتزويد التلقائي`,
              ].join("\n"),
            );
          } catch (e: any) {
            this.logger.warn({
              msg: "Owner WhatsApp send failed",
              error: e.message,
            });
          }
        }
      }

      // ── 4. Auto-discover suppliers for products lacking one ───────────────
      const unlinked = criticalProducts.filter((p) => !p.has_supplier);
      if (unlinked.length > 0) {
        await this.autoDiscoverForProducts(merchant_id, unlinked);
      }

      // ── 5. Send AI-generated WhatsApp to each linked supplier ─────────────
      const suppliersResult = await this.pool.query<{
        supplier_id: string;
        supplier_name: string;
        whatsapp_phone: string;
        contact_name: string;
      }>(
        `SELECT s.id AS supplier_id, s.name AS supplier_name,
                COALESCE(s.whatsapp_phone, s.phone) AS whatsapp_phone,
                s.contact_name
         FROM suppliers s
         WHERE s.merchant_id = $1
           AND s.auto_notify_low_stock = true
           AND s.is_active = true
           AND COALESCE(s.whatsapp_phone, s.phone) IS NOT NULL
           AND (s.last_auto_notified_at IS NULL
                OR s.last_auto_notified_at < NOW() - INTERVAL '20 hours')`,
        [merchant_id],
      );

      targets = suppliersResult.rows.length;

      for (const supplier of suppliersResult.rows) {
        const productsResult = await this.pool.query<{
          product_name: string;
          sku: string;
          quantity_in_stock: number;
          reorder_level: number | null;
        }>(
          `SELECT *
           FROM (
             SELECT COALESCE(NULLIF(ii.name, ''), ci.name_ar, ci.name_en, ii.sku, ii.id::text) AS product_name,
                    COALESCE(ii.sku, ii.id::text) AS sku,
                    COALESCE((
                      SELECT SUM(iv.quantity_on_hand)
                      FROM inventory_variants iv
                      WHERE iv.inventory_item_id = ii.id
                        AND iv.merchant_id = ii.merchant_id
                    ), 0) AS quantity_in_stock,
                    COALESCE(ii.reorder_point, 5) AS reorder_level
             FROM inventory_items ii
             JOIN supplier_products sp
               ON sp.product_id = ii.id
              AND sp.merchant_id = ii.merchant_id
             LEFT JOIN catalog_items ci
               ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
             WHERE sp.supplier_id = $1
               AND ii.merchant_id = $2
           ) stock
           WHERE ${stockFilter}
           ORDER BY quantity_in_stock ASC
           LIMIT 30`,
          [supplier.supplier_id, merchant_id],
        );

        if (!productsResult.rows.length) continue;

        let messageBody: string;

        // Try AI-generated message
        const aiResult = await this.inventoryAiService.generateSupplierMessage({
          merchantId: merchant_id,
          merchantName,
          supplierName: supplier.contact_name || supplier.supplier_name,
          products: productsResult.rows.map((p) => ({
            name: p.product_name,
            sku: p.sku,
            quantity: p.quantity_in_stock,
            urgency: p.quantity_in_stock === 0 ? "critical" : "warning",
          })),
        });

        if (aiResult.success) {
          messageBody = aiResult.data.messageAr;
        } else if (config?.messageTemplate) {
          const list = productsResult.rows
            .map(
              (p, i) =>
                `${i + 1}. ${p.product_name} (${p.sku}) – متوفر: ${p.quantity_in_stock}${p.reorder_level ? ` / الحد الأدنى: ${p.reorder_level}` : ""}`,
            )
            .join("\n");
          messageBody = config.messageTemplate
            .replace(
              "{{supplier_name}}",
              supplier.contact_name || supplier.supplier_name,
            )
            .replace("{{product_list}}", list);
        } else {
          // Rich static fallback
          const urgentLines = productsResult.rows
            .map((p, i) => {
              const flag =
                p.quantity_in_stock === 0
                  ? "🔴"
                  : p.quantity_in_stock <= 3
                    ? "🟠"
                    : "🟡";
              const needed = p.reorder_level
                ? Math.max(0, p.reorder_level * 3 - p.quantity_in_stock)
                : "غير محدد";
              return `${flag} ${i + 1}. ${p.product_name} (${p.sku})\n   المتوفر: ${p.quantity_in_stock} | الكمية المقترحة للطلب: ${needed}`;
            })
            .join("\n");

          const urgencyLabel = productsResult.rows.some(
            (p) => p.quantity_in_stock === 0,
          )
            ? "🚨 عاجل جداً"
            : "⚠️ يحتاج تجديد";

          messageBody = [
            `السلام عليكم ${supplier.contact_name || supplier.supplier_name},`,
            ``,
            `${urgencyLabel} – نفاد مخزون في ${merchantName}`,
            ``,
            `المنتجات المطلوبة:`,
            urgentLines,
            ``,
            `📋 الإجراء المطلوب:`,
            `• هل يمكنكم توفير الكميات أعلاه؟`,
            `• يرجى إعلامنا بالسعر وموعد التسليم المتوقع`,
            `• في حال عدم التوفر، يرجى اقتراح بديل`,
            ``,
            `⏰ نأمل الرد في أقرب وقت ممكن للحفاظ على استمرار الخدمة.`,
            `شكراً جزيلاً`,
          ].join("\n");
        }

        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            supplier.whatsapp_phone,
            messageBody,
          );
        } catch (waErr: any) {
          this.logger.warn({
            msg: "Supplier WhatsApp send failed",
            supplierId: supplier.supplier_id,
            error: waErr.message,
          });
          continue;
        }

        await this.pool.query(
          `UPDATE suppliers SET last_auto_notified_at = NOW() WHERE id = $1`,
          [supplier.supplier_id],
        );

        sent++;
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "SUPPLIER_LOW_STOCK error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ── Auto-discover suppliers for unlinked critical products ──────────────
  private async autoDiscoverForProducts(
    merchantId: string,
    products: Array<{ product_id: string; product_name: string }>,
  ): Promise<void> {
    // Check if discovery was run recently (avoid spam)
    const recentCheck = await this.pool.query(
      `SELECT COUNT(*) FROM supplier_discovery_results
       WHERE merchant_id = $1 AND created_at > NOW() - INTERVAL '12 hours'`,
      [merchantId],
    );
    if (parseInt(recentCheck.rows[0].count, 10) > 0) return;

    const query = products
      .slice(0, 3)
      .map((p) => p.product_name)
      .join("، ");
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    let results: any[] = [];

    try {
      if (apiKey) {
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=مورد+${encodeURIComponent(query)}&language=ar&key=${apiKey}`;
        const res = await fetch(url);
        const json = (await res.json()) as any;
        results = (json.results ?? []).slice(0, 5).map((r: any) => ({
          name: r.name,
          address: r.formatted_address,
          rating: r.rating,
          totalRatings: r.user_ratings_total,
          source: "google_maps",
        }));
      }

      if (results.length === 0 && this.inventoryAiService.isConfigured()) {
        // Fallback: prompt AI for supplier suggestions
        const aiResult = await this.inventoryAiService.generateSupplierMessage({
          merchantId,
          merchantName: "المتجر",
          supplierName: "مورد مقترح",
          products: products.slice(0, 5).map((p) => ({
            name: p.product_name,
            sku: p.product_id,
            quantity: 0,
            urgency: "critical",
          })),
        });
        // We reuse the AI call here just to confirm AI is online; real discovery uses a separate path
        // Store a placeholder so the merchant knows discovery ran
        results = [
          {
            name: `اكتشاف تلقائي لـ: ${query}`,
            source: "ai_suggestion",
            searchTip: "افتح قسم الموردين ← اكتشاف موردين لعرض النتائج",
          },
        ];
        void aiResult; // suppress unused
      }
    } catch (e: any) {
      this.logger.warn({
        msg: "Auto-supplier-discovery fetch failed",
        error: e.message,
      });
      results = [];
    }

    if (results.length > 0) {
      await this.pool.query(
        `DELETE FROM supplier_discovery_results WHERE merchant_id = $1 AND query = $2`,
        [merchantId, query],
      );
      await this.pool.query(
        `INSERT INTO supplier_discovery_results (merchant_id, query, results, created_at)
         VALUES ($1, $2, $3::jsonb, NOW())`,
        [merchantId, query, JSON.stringify(results)],
      );
      this.logger.log(
        `Auto-discovery saved ${results.length} suggestions for merchant ${merchantId}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REVIEW REQUEST
  // ─────────────────────────────────────────────────────────────────────────

  private async runReviewRequest(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "REVIEW_REQUEST";
    let sent = 0;
    let targets = 0;
    try {
      const delayHours = Number(config?.delayHours ?? 24);

      // Orders delivered between (delayHours + 24h) ago and delayHours ago
      // that haven't already had a review request sent
      const ordersResult = await this.pool.query<{
        order_id: string;
        customer_phone: string;
        customer_name: string;
        order_number: string;
      }>(
        `SELECT o.id AS order_id, c.phone AS customer_phone,
                  COALESCE(c.name, 'عزيزي العميل') AS customer_name,
                  o.order_number
           FROM orders o
           JOIN conversations conv ON conv.id = o.conversation_id
           JOIN customers c ON c.id = conv.customer_id
           WHERE o.merchant_id = $1
             AND o.status IN ('DELIVERED', 'COMPLETED')
             AND o.updated_at BETWEEN NOW() - INTERVAL '1 hour' * $2 - INTERVAL '24 hours'
                                  AND NOW() - INTERVAL '1 hour' * $2
             AND o.review_requested_at IS NULL
             AND c.phone IS NOT NULL
           LIMIT 100`,
        [merchant_id, delayHours],
      );

      targets = ordersResult.rows.length;

      for (const order of ordersResult.rows) {
        const message = config?.messageTemplate
          ? config.messageTemplate
              .replace("{{customer_name}}", order.customer_name)
              .replace("{{order_number}}", order.order_number)
          : `مرحباً ${order.customer_name}،\n\nنأمل أن يكون طلبك رقم ${order.order_number} قد وصلك بسلامة.\nنودّ معرفة رأيك – هل أنت راضٍ عن طلبك؟ تقييمك يساعدنا على التحسين المستمر 🌟`;

        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            order.customer_phone,
            message,
          );
        } catch (e: any) {
          this.logger.warn({ msg: "Review WA failed", error: e.message });
          continue;
        }

        await this.pool.query(
          `UPDATE orders SET review_requested_at = NOW() WHERE id = $1`,
          [order.order_id],
        );

        sent++;
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "REVIEW_REQUEST error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NEW CUSTOMER WELCOME
  // ─────────────────────────────────────────────────────────────────────────

  private async runNewCustomerWelcome(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "NEW_CUSTOMER_WELCOME";
    let sent = 0;
    let targets = 0;
    try {
      // Find customers who placed their FIRST ever order in the last 2 hours
      // that haven't been welcomed yet
      const newCustomers = await this.pool.query<{
        conversation_id: string;
        customer_phone: string;
        customer_name: string;
      }>(
        `SELECT conv.id AS conversation_id,
                  c.phone AS customer_phone,
                  COALESCE(c.name, 'عزيزي العميل') AS customer_name
           FROM customers c
           JOIN conversations conv ON conv.customer_id = c.id AND conv.merchant_id = $1
           WHERE c.merchant_id = $1
             AND c.welcome_sent_at IS NULL
             AND c.phone IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM orders o2
               WHERE o2.merchant_id = $1
                 AND o2.conversation_id = conv.id
                 AND o2.created_at >= NOW() - INTERVAL '2 hours'
             )
             AND NOT EXISTS (
               SELECT 1 FROM orders o3
               WHERE o3.merchant_id = $1
                 AND o3.conversation_id IN (
                   SELECT id FROM conversations WHERE customer_id = c.id AND merchant_id = $1
                 )
                 AND o3.created_at < NOW() - INTERVAL '2 hours'
             )
           LIMIT 50`,
        [merchant_id],
      );

      targets = newCustomers.rows.length;

      for (const nc of newCustomers.rows) {
        const message = config?.messageTemplate
          ? config.messageTemplate.replace(
              "{{customer_name}}",
              nc.customer_name,
            )
          : `أهلاً ${nc.customer_name}! 🎉\nنرحب بكم في أسرتنا ونشكركم على ثقتكم بنا في أول طلب.\nنحن هنا دائماً لخدمتكم – لا تترددوا في التواصل معنا في أي وقت.`;

        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            nc.customer_phone,
            message,
          );
        } catch (e: any) {
          this.logger.warn({ msg: "Welcome WA failed", error: e.message });
          continue;
        }

        sent++;
      }

      // Mark customers as welcomed (bulk update)
      if (newCustomers.rows.length) {
        const phones = newCustomers.rows.map((r) => r.customer_phone);
        await this.pool.query(
          `UPDATE customers SET welcome_sent_at = NOW()
             WHERE merchant_id = $1 AND phone = ANY($2::text[])`,
          [merchant_id, phones],
        );
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "NEW_CUSTOMER_WELCOME error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RE-ENGAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  private async runReengagementAuto(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "REENGAGEMENT_AUTO";
    let sent = 0;
    let targets = 0;
    try {
      const inactiveDays = Number(config?.inactiveDays ?? 30);
      const discountCode = config?.discountCode ?? "";

      const customersResult = await this.pool.query<{
        customer_phone: string;
        customer_name: string;
      }>(
        `SELECT DISTINCT c.phone AS customer_phone,
                  COALESCE(c.name, 'عزيزي العميل') AS customer_name
           FROM customers c
           JOIN conversations conv ON conv.customer_id = c.id AND conv.merchant_id = $1
           WHERE c.merchant_id = $1
             AND c.phone IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM orders o
               WHERE o.merchant_id = $1
                 AND o.conversation_id = conv.id
                 AND o.created_at < NOW() - INTERVAL '1 day' * $2
             )
             AND NOT EXISTS (
               SELECT 1 FROM orders o2
               WHERE o2.merchant_id = $1
                 AND o2.conversation_id IN (
                   SELECT id FROM conversations WHERE customer_id = c.id AND merchant_id = $1
                 )
                 AND o2.created_at >= NOW() - INTERVAL '1 day' * $2
             )
           LIMIT 200`,
        [merchant_id, inactiveDays],
      );

      targets = customersResult.rows.length;

      for (const customer of customersResult.rows) {
        const discountLine = discountCode
          ? `\n🎁 استخدم كود الخصم: ${discountCode}`
          : "";

        const message = config?.messageTemplate
          ? config.messageTemplate
              .replace("{{customer_name}}", customer.customer_name)
              .replace("{{discount_code}}", discountCode)
          : `مرحباً ${customer.customer_name} 👋\nاشتقنا إليكم! لم نرَكم منذ فترة ونودّ أن نعلمكم بأحدث عروضنا.${discountLine}\nنحن في انتظار طلبكم `;

        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            customer.customer_phone,
            message,
          );
        } catch (e: any) {
          this.logger.warn({ msg: "Reengagement WA failed", error: e.message });
          continue;
        }

        sent++;
      }

      // Update last_run_at
      await this.pool.query(
        `UPDATE merchant_automations SET last_run_at = NOW()
           WHERE merchant_id = $1 AND automation_type = $2`,
        [merchant_id, automationType],
      );

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "REENGAGEMENT_AUTO error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHURN PREVENTION
  // ─────────────────────────────────────────────────────────────────────────

  private async runChurnPrevention(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "CHURN_PREVENTION";
    let sent = 0,
      targets = 0;
    try {
      const silentDays = Number(config?.silentDays ?? 60);
      const discountCode = config?.discountCode ?? "";

      const result = await this.pool.query<{
        customer_phone: string;
        customer_name: string;
        order_count: number;
        last_order_date: string;
      }>(
        `SELECT c.phone AS customer_phone,
                COALESCE(c.name, 'عزيزي العميل') AS customer_name,
                COUNT(o.id)::int AS order_count,
                MAX(o.created_at)::date AS last_order_date
         FROM customers c
         JOIN orders o ON o.merchant_id = c.merchant_id
           AND o.customer_id = c.id
           AND o.status IN ('CONFIRMED','DELIVERED','BOOKED','SHIPPED')
         WHERE c.merchant_id = $1
           AND c.phone IS NOT NULL
           AND c.is_blocked = false
         GROUP BY c.id, c.phone, c.name
         HAVING MAX(o.created_at) < NOW() - INTERVAL '1 day' * $2
            AND MAX(o.created_at) > NOW() - INTERVAL '1 day' * ($2 * 2)
         LIMIT 100`,
        [merchant_id, silentDays],
      );

      targets = result.rows.length;
      for (const c of result.rows) {
        const discountLine = discountCode
          ? `\n🎁 كود خاص لعودتك: *${discountCode}*`
          : "";
        const msg = config?.messageTemplate
          ? config.messageTemplate
              .replace("{{customer_name}}", c.customer_name)
              .replace("{{order_count}}", String(c.order_count))
              .replace("{{discount_code}}", discountCode)
          : `مرحباً ${c.customer_name} 💙\n\nنتشوّق لرؤيتك مجدداً! لاحظنا أنك لم تطلب منذ فترة.\nلك ${c.order_count} طلباً سابقاً معنا — أنت دائماً من أهل البيت.${discountLine}\n\nنحن هنا إذا احتجت أي شيء 🛒`;
        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            c.customer_phone,
            msg,
          );
          sent++;
        } catch (e: any) {
          this.logger.warn({
            msg: "ChurnPrevention WA failed",
            error: e.message,
          });
        }
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "CHURN_PREVENTION error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUOTE FOLLOW-UP
  // ─────────────────────────────────────────────────────────────────────────

  private async runQuoteFollowup(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "QUOTE_FOLLOWUP";
    let sent = 0,
      targets = 0;
    try {
      const ageHours = Number(config?.ageHours ?? 48);

      const result = await this.pool.query<{
        quote_id: string;
        customer_phone: string;
        customer_name: string;
        quote_number: string;
        total: number;
      }>(
        `SELECT q.id AS quote_id,
                c.phone AS customer_phone,
                COALESCE(c.name, 'عزيزي العميل') AS customer_name,
                q.quote_number,
                q.total
         FROM quotes q
         JOIN customers c ON c.id = q.customer_id
         WHERE q.merchant_id = $1
           AND q.status = 'SENT'
           AND q.created_at < NOW() - INTERVAL '1 hour' * $2
           AND q.followup_sent_at IS NULL
           AND c.phone IS NOT NULL
         LIMIT 100`,
        [merchant_id, ageHours],
      );

      targets = result.rows.length;
      for (const q of result.rows) {
        const msg = config?.messageTemplate
          ? config.messageTemplate
              .replace("{{customer_name}}", q.customer_name)
              .replace("{{quote_number}}", q.quote_number)
              .replace("{{total}}", q.total.toFixed(2))
          : `مرحباً ${q.customer_name} 👋\n\nيسعدنا تذكيرك بعرض السعر رقم *${q.quote_number}*\nالقيمة: *${q.total.toFixed(2)} ج.م*\n\nالعرض لا يزال متاحاً — تواصل معنا لأي استفسار أو لتأكيد الطلب 📋`;
        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            q.customer_phone,
            msg,
          );
          await this.pool.query(
            `UPDATE quotes SET followup_sent_at = NOW() WHERE id = $1`,
            [q.quote_id],
          );
          sent++;
        } catch (e: any) {
          this.logger.warn({
            msg: "QuoteFollowup WA failed",
            error: e.message,
          });
        }
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "QUOTE_FOLLOWUP error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOYALTY MILESTONE
  // ─────────────────────────────────────────────────────────────────────────

  private async runLoyaltyMilestone(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "LOYALTY_MILESTONE";
    let sent = 0,
      targets = 0;
    try {
      const milestonePoints = Number(config?.milestonePoints ?? 100);

      const result = await this.pool.query<{
        customer_phone: string;
        customer_name: string;
        points_balance: number;
        tier: string;
      }>(
        `SELECT c.phone AS customer_phone,
                COALESCE(c.name, 'عزيزي العميل') AS customer_name,
                lm.points_balance,
                lm.tier
         FROM loyalty_members lm
         JOIN customers c ON c.id = lm.customer_id
         WHERE lm.merchant_id = $1
           AND c.phone IS NOT NULL
           AND lm.points_balance >= $2
           AND (lm.milestone_notified_at IS NULL
                OR lm.milestone_notified_at < NOW() - INTERVAL '30 days')
         LIMIT 100`,
        [merchant_id, milestonePoints],
      );

      targets = result.rows.length;
      for (const m of result.rows) {
        const msg = config?.messageTemplate
          ? config.messageTemplate
              .replace("{{customer_name}}", m.customer_name)
              .replace("{{points}}", String(m.points_balance))
              .replace("{{tier}}", m.tier ?? "")
          : `مبروك ${m.customer_name}! 🎉\n\nوصلت إلى *${m.points_balance} نقطة* في برنامج الولاء!\n🏆 مستواك الحالي: *${m.tier ?? "فضي"}*\n\nيمكنك استبدال نقاطك الآن بخصومات حصرية. تواصل معنا للاستفادة 🎁`;
        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            m.customer_phone,
            msg,
          );
          await this.pool.query(
            `UPDATE loyalty_members SET milestone_notified_at = NOW()
             WHERE merchant_id = $1 AND customer_id = (
               SELECT id FROM customers WHERE phone = $2 AND merchant_id = $1 LIMIT 1
             )`,
            [merchant_id, m.customer_phone],
          );
          sent++;
        } catch (e: any) {
          this.logger.warn({
            msg: "LoyaltyMilestone WA failed",
            error: e.message,
          });
        }
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "LOYALTY_MILESTONE error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXPENSE SPIKE ALERT
  // ─────────────────────────────────────────────────────────────────────────

  private async runExpenseSpikeAlert(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "EXPENSE_SPIKE_ALERT";
    let sent = 0,
      targets = 0;
    try {
      const spikeThreshold = Number(config?.spikeThreshold ?? 150); // % of avg

      const result = await this.pool.query<{
        category: string;
        current_week: number;
        monthly_avg: number;
        spike_pct: number;
      }>(
        `WITH weekly AS (
           SELECT category,
                  SUM(amount)::numeric AS current_week
           FROM expenses
           WHERE merchant_id = $1
             AND expense_date >= NOW() - INTERVAL '7 days'
           GROUP BY category
         ),
         avg_monthly AS (
           SELECT category,
                  AVG(weekly_total)::numeric AS monthly_avg
           FROM (
             SELECT category,
                    date_trunc('week', expense_date) AS wk,
                    SUM(amount) AS weekly_total
             FROM expenses
             WHERE merchant_id = $1
               AND expense_date >= NOW() - INTERVAL '90 days'
               AND expense_date < NOW() - INTERVAL '7 days'
             GROUP BY category, wk
           ) sub
           GROUP BY category
         )
         SELECT w.category,
                w.current_week,
                COALESCE(a.monthly_avg, 0) AS monthly_avg,
                CASE WHEN COALESCE(a.monthly_avg, 0) > 0
                     THEN (w.current_week / a.monthly_avg * 100)::numeric
                     ELSE 200
                END AS spike_pct
         FROM weekly w
         LEFT JOIN avg_monthly a USING (category)
         WHERE CASE WHEN COALESCE(a.monthly_avg, 0) > 0
                    THEN (w.current_week / a.monthly_avg * 100)
                    ELSE 200
               END >= $2`,
        [merchant_id, spikeThreshold],
      );

      if (result.rows.length === 0) {
        await this.logRun(merchant_id, automationType, "success", 0, 0, null);
        return;
      }

      const ownerRow = await this.pool.query<{
        name: string;
        whatsapp_number: string | null;
      }>(`SELECT name, whatsapp_number FROM merchants WHERE id = $1`, [
        merchant_id,
      ]);
      const ownerPhone = ownerRow.rows[0]?.whatsapp_number;
      if (!ownerPhone) {
        await this.logRun(
          merchant_id,
          automationType,
          "success",
          0,
          result.rows.length,
          null,
        );
        return;
      }

      targets = 1;
      const lines = result.rows
        .map(
          (r) =>
            `• ${r.category}: ${Number(r.current_week).toFixed(0)} ج.م هذا الأسبوع (ارتفع ${Number(r.spike_pct).toFixed(0)}% عن المتوسط)`,
        )
        .join("\n");

      const msg = `🚨 تنبيه: ارتفاع غير معتاد في المصاريف\n\n${lines}\n\nراجع التقرير المالي للتحقق من هذه المصروفات`;
      try {
        await this.notificationsService.sendBroadcastWhatsApp(ownerPhone, msg);
        sent++;
      } catch (e: any) {
        this.logger.warn({ msg: "ExpenseSpike WA failed", error: e.message });
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "EXPENSE_SPIKE_ALERT error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DELIVERY SLA BREACH
  // ─────────────────────────────────────────────────────────────────────────

  private async runDeliverySLABreach(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "DELIVERY_SLA_BREACH";
    let sent = 0,
      targets = 0;
    try {
      const slaHours = Number(config?.slaHours ?? 48);
      const notifyCustomer = config?.notifyCustomer !== false;

      const result = await this.pool.query<{
        order_id: string;
        order_number: string;
        customer_phone: string;
        customer_name: string;
        shipped_at: string;
        delivery_status: string;
      }>(
        `SELECT o.id AS order_id,
                o.order_number,
                c.phone AS customer_phone,
                COALESCE(c.name, 'عزيزي العميل') AS customer_name,
                o.shipped_at,
                o.delivery_status
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE o.merchant_id = $1
           AND o.status IN ('BOOKED', 'SHIPPED')
           AND o.delivery_status NOT IN ('DELIVERED', 'FAILED', 'RETURNED')
           AND o.shipped_at IS NOT NULL
           AND o.shipped_at < NOW() - INTERVAL '1 hour' * $2
           AND (o.sla_breach_notified_at IS NULL OR o.sla_breach_notified_at < NOW() - INTERVAL '24 hours')
           AND c.phone IS NOT NULL
         LIMIT 50`,
        [merchant_id, slaHours],
      );

      targets = result.rows.length;
      const ownerRow = await this.pool.query<{
        name: string;
        whatsapp_number: string | null;
      }>(`SELECT name, whatsapp_number FROM merchants WHERE id = $1`, [
        merchant_id,
      ]);

      if (result.rows.length > 0) {
        // Alert merchant owner
        const ownerPhone = ownerRow.rows[0]?.whatsapp_number;
        if (ownerPhone) {
          const orderList = result.rows
            .slice(0, 5)
            .map(
              (r) =>
                `• طلب ${r.order_number} (مرسل منذ ${Math.floor((Date.now() - new Date(r.shipped_at).getTime()) / 3_600_000)} ساعة)`,
            )
            .join("\n");
          const ownerMsg = `⚠️ تجاوز SLA التوصيل\n\n${result.rows.length} طلب تجاوز ${slaHours} ساعة دون تأكيد توصيل:\n${orderList}\n\nيُنصح بالتواصل مع شركة الشحن للمتابعة`;
          try {
            await this.notificationsService.sendBroadcastWhatsApp(
              ownerPhone,
              ownerMsg,
            );
            sent++;
          } catch (e: any) {
            this.logger.warn({
              msg: "DeliverySLA owner WA failed",
              error: e.message,
            });
          }
        }

        // Optionally alert customers
        if (notifyCustomer) {
          for (const o of result.rows.slice(0, 20)) {
            const customerMsg = `مرحباً ${o.customer_name} 👋\n\nطلبك رقم *${o.order_number}* في الطريق إليك.\nنعتذر عن التأخير — يعمل فريقنا على تتبع الشحنة والتأكد من وصولها سريعاً 🚚\n\nللاستفسار تواصل معنا مباشرة`;
            try {
              await this.notificationsService.sendBroadcastWhatsApp(
                o.customer_phone,
                customerMsg,
              );
              await this.pool.query(
                `UPDATE orders SET sla_breach_notified_at = NOW() WHERE id = $1`,
                [o.order_id],
              );
              sent++;
            } catch (e: any) {
              this.logger.warn({
                msg: "DeliverySLA customer WA failed",
                error: e.message,
              });
            }
          }
        }
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "DELIVERY_SLA_BREACH error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TOKEN USAGE WARNING
  // ─────────────────────────────────────────────────────────────────────────

  private async runTokenUsageWarning(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "TOKEN_USAGE_WARNING";
    let sent = 0,
      targets = 0;
    try {
      const warnPct = Number(config?.warnPct ?? 80);

      const result = await this.pool.query<{
        tokens_used: number;
        token_limit: number;
        conversations_used: number;
        conversation_limit: number;
      }>(
        `SELECT
           COALESCE(SUM(mtu.tokens_used), 0)::int AS tokens_used,
           COALESCE(sp.monthly_token_limit, 10000) AS token_limit,
           COUNT(DISTINCT conv.id) FILTER (WHERE conv.created_at >= date_trunc('month', NOW()))::int AS conversations_used,
           COALESCE(sp.monthly_conversation_limit, 500) AS conversation_limit
         FROM merchants m
         LEFT JOIN subscriptions sub ON sub.merchant_id = m.id AND sub.status = 'ACTIVE'
         LEFT JOIN subscription_plans sp ON sp.id = sub.plan_id
         LEFT JOIN merchant_token_usage mtu ON mtu.merchant_id = m.id
           AND mtu.usage_date >= date_trunc('month', NOW())
         LEFT JOIN conversations conv ON conv.merchant_id = m.id
         WHERE m.id = $1
         GROUP BY sp.monthly_token_limit, sp.monthly_conversation_limit`,
        [merchant_id],
      );

      if (!result.rows.length) {
        await this.logRun(merchant_id, automationType, "success", 0, 0, null);
        return;
      }

      const row = result.rows[0];
      const tokenPct =
        row.token_limit > 0 ? (row.tokens_used / row.token_limit) * 100 : 0;
      const convPct =
        row.conversation_limit > 0
          ? (row.conversations_used / row.conversation_limit) * 100
          : 0;

      if (tokenPct < warnPct && convPct < warnPct) {
        await this.logRun(merchant_id, automationType, "success", 0, 0, null);
        return;
      }

      const ownerRow = await this.pool.query<{
        name: string;
        whatsapp_number: string | null;
      }>(`SELECT name, whatsapp_number FROM merchants WHERE id = $1`, [
        merchant_id,
      ]);
      const ownerPhone = ownerRow.rows[0]?.whatsapp_number;
      targets = 1;

      const lines: string[] = [];
      if (tokenPct >= warnPct)
        lines.push(
          `• التوكينات: ${row.tokens_used.toLocaleString()} / ${row.token_limit.toLocaleString()} (${tokenPct.toFixed(0)}%)`,
        );
      if (convPct >= warnPct)
        lines.push(
          `• المحادثات: ${row.conversations_used} / ${row.conversation_limit} (${convPct.toFixed(0)}%)`,
        );

      const urgency = tokenPct >= 95 || convPct >= 95 ? "🔴 حرج" : "🟡 تحذير";

      const msg = `${urgency}: اقتربت من حد خطتك الشهرية\n\n${lines.join("\n")}\n\nقم بترقية الخطة لضمان استمرارية الخدمة بدون انقطاع`;

      if (ownerPhone) {
        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            ownerPhone,
            msg,
          );
          sent++;
        } catch (e: any) {
          this.logger.warn({ msg: "TokenWarning WA failed", error: e.message });
        }
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "TOKEN_USAGE_WARNING error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI ANOMALY DETECTION
  // ─────────────────────────────────────────────────────────────────────────

  private async runAiAnomalyDetection(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "AI_ANOMALY_DETECTION";
    let sent = 0,
      targets = 0;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const historicalStart = new Date(todayStart);
      historicalStart.setDate(historicalStart.getDate() - 30);
      const historicalEnd = new Date(yesterdayStart.getTime() - 1);
      const historicalDays = Math.max(
        1,
        Math.round(
          (yesterdayStart.getTime() - historicalStart.getTime()) /
            (24 * 60 * 60 * 1000),
        ),
      );

      const [currentSummary, historicalSummary] = await Promise.all([
        this.commerceFactsService.buildFinanceSummary(
          merchant_id,
          yesterdayStart,
          new Date(todayStart.getTime() - 1),
        ),
        this.commerceFactsService.buildFinanceSummary(
          merchant_id,
          historicalStart,
          historicalEnd,
        ),
      ]);

      const metrics = {
        totalRevenue: currentSummary.realizedRevenue,
        realizedRevenue: currentSummary.realizedRevenue,
        totalCogs: 0,
        grossProfit: currentSummary.realizedRevenue * 0.4,
        grossMargin: 40,
        totalExpenses: 0,
        netProfit: currentSummary.realizedRevenue * 0.25,
        netMargin: 25,
        codCollected: 0,
        codPending: currentSummary.pendingCod,
        averageOrderValue: currentSummary.averageOrderValue,
        orderCount: currentSummary.totalOrders,
      };

      const historicalAvg = {
        totalRevenue: historicalSummary.realizedRevenue / historicalDays,
        realizedRevenue: historicalSummary.realizedRevenue / historicalDays,
        averageOrderValue: historicalSummary.averageOrderValue,
        orderCount: historicalSummary.totalOrders / historicalDays,
      };

      const aiResult = await this.financeAiService.generateAnomalyNarrative({
        merchantId: merchant_id,
        metrics,
        historicalAvg,
        periodType: "daily",
      });

      if (!aiResult.success || !aiResult.data?.hasAnomaly) {
        await this.logRun(merchant_id, automationType, "success", 0, 0, null);
        return;
      }

      const ownerRow = await this.pool.query<{
        name: string;
        whatsapp_number: string | null;
      }>(`SELECT name, whatsapp_number FROM merchants WHERE id = $1`, [
        merchant_id,
      ]);
      const ownerPhone = ownerRow.rows[0]?.whatsapp_number;
      targets = 1;

      if (ownerPhone && aiResult.success && aiResult.data) {
        const an = aiResult.data;
        const severityEmoji =
          an.severity === "critical"
            ? "🔴"
            : an.severity === "warning"
              ? "🟡"
              : "🔵";
        const msg = `${severityEmoji} ${an.titleAr}\n\n${an.narrativeAr}\n\n💡 التوصيات:\n${an.recommendations
          .slice(0, 3)
          .map((r, i) => `${i + 1}. ${r.actionAr}`)
          .join("\n")}`;
        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            ownerPhone,
            msg,
          );
          sent++;
        } catch (e: any) {
          this.logger.warn({
            msg: "AnomalyDetection WA failed",
            error: e.message,
          });
        }
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "AI_ANOMALY_DETECTION error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SEASONAL STOCK PREP
  // ─────────────────────────────────────────────────────────────────────────

  private async runSeasonalStockPrep(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "SEASONAL_STOCK_PREP";
    let sent = 0,
      targets = 0;
    try {
      const warningDays = Number(config?.warningDays ?? 14);

      // Egyptian holidays (month-day pairs), approximate Gregorian dates
      const EGYPTIAN_HOLIDAYS: Array<{
        name: string;
        month: number;
        day: number;
      }> = [
        { name: "رأس السنة الميلادية", month: 1, day: 1 },
        { name: "عيد الشرطة", month: 1, day: 25 },
        { name: "يوم المرأة المصرية", month: 3, day: 16 },
        { name: "عيد تحرير سيناء", month: 4, day: 25 },
        { name: "عيد العمال", month: 5, day: 1 },
        { name: "ثورة 30 يونيو", month: 6, day: 30 },
        { name: "ثورة 23 يوليو", month: 7, day: 23 },
        { name: "عيد القوات المسلحة", month: 10, day: 6 },
        { name: "عيد الميلاد القبطي", month: 1, day: 7 },
      ];

      const now = new Date();
      const upcoming = EGYPTIAN_HOLIDAYS.filter((h) => {
        const holidayDate = new Date(now.getFullYear(), h.month - 1, h.day);
        if (holidayDate < now) holidayDate.setFullYear(now.getFullYear() + 1);
        const diffMs = holidayDate.getTime() - now.getTime();
        const diffDays = Math.floor(diffMs / 86_400_000);
        return diffDays >= 0 && diffDays <= warningDays;
      });

      if (upcoming.length === 0) {
        await this.logRun(merchant_id, automationType, "success", 0, 0, null);
        return;
      }

      // Check for low stock
      const lowStockResult = await this.pool.query<{
        product_name: string;
        quantity_in_stock: number;
      }>(
        `SELECT COALESCE(NULLIF(ii.name, ''), ii.sku) AS product_name,
                COALESCE(SUM(iv.quantity_on_hand), 0)::int AS quantity_in_stock
         FROM inventory_items ii
         LEFT JOIN inventory_variants iv ON iv.inventory_item_id = ii.id
         WHERE ii.merchant_id = $1
         GROUP BY ii.id, ii.name, ii.sku
         HAVING COALESCE(SUM(iv.quantity_on_hand), 0) <= 10
         ORDER BY quantity_in_stock ASC LIMIT 10`,
        [merchant_id],
      );

      const ownerRow = await this.pool.query<{
        name: string;
        whatsapp_number: string | null;
      }>(`SELECT name, whatsapp_number FROM merchants WHERE id = $1`, [
        merchant_id,
      ]);
      const ownerPhone = ownerRow.rows[0]?.whatsapp_number;
      targets = 1;

      const holidayNames = upcoming.map((h) => h.name).join("، ");
      const lowStockLines =
        lowStockResult.rows.length > 0
          ? `\n\n📦 منتجات تحتاج إعادة تخزين:\n${lowStockResult.rows.map((p) => `• ${p.product_name}: ${p.quantity_in_stock} قطعة`).join("\n")}`
          : "\n\n✅ مستويات المخزون الحالية جيدة";

      const msg = `🗓️ تنبيه: ${upcoming[0].name} بعد أقل من ${warningDays} يوم\n\nالمناسبات القادمة: ${holidayNames}${lowStockLines}\n\nننصح بمراجعة المخزون وتجهيز كميات إضافية استعداداً للطلب المتزايد 🚀`;

      if (ownerPhone) {
        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            ownerPhone,
            msg,
          );
          sent++;
        } catch (e: any) {
          this.logger.warn({
            msg: "SeasonalStockPrep WA failed",
            error: e.message,
          });
        }
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "SEASONAL_STOCK_PREP error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SENTIMENT MONITOR
  // ─────────────────────────────────────────────────────────────────────────

  private async runSentimentMonitor(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "SENTIMENT_MONITOR";
    let sent = 0,
      targets = 0;
    try {
      const frustratedThresholdPct = Number(
        config?.frustratedThresholdPct ?? 5,
      );

      // Keywords indicating negative sentiment in Arabic conversations
      const negativeKeywords = [
        "مش كويس",
        "سيء",
        "غلط",
        "مشكلة",
        "شكوى",
        "مزعج",
        "تأخر",
        "مش وصل",
        "ما وصل",
        "لازم ترد",
        "مش معقول",
        "كاذب",
        "نصب",
        "امشي",
        "رجع الفلوس",
        "استرجاع",
        "إلغاء",
        "ما عجبني",
        "رديء",
        "مخسرتوني",
      ];

      const keywordCondition = negativeKeywords
        .map((_, i) => `content ILIKE $${i + 2}`)
        .join(" OR ");

      const negativeResult = await this.pool.query<{ count: string }>(
        `SELECT COUNT(DISTINCT conversation_id)::text AS count
         FROM messages
         WHERE merchant_id = $1
           AND direction = 'inbound'
           AND created_at >= NOW() - INTERVAL '24 hours'
           AND (${keywordCondition})`,
        [merchant_id, ...negativeKeywords.map((k) => `%${k}%`)],
      );

      const totalConvsResult = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM conversations
         WHERE merchant_id = $1
           AND last_message_at >= NOW() - INTERVAL '24 hours'`,
        [merchant_id],
      );

      const negCount = parseInt(negativeResult.rows[0]?.count ?? "0", 10);
      const totalConvs = parseInt(totalConvsResult.rows[0]?.count ?? "1", 10);
      const frustratedPct = totalConvs > 0 ? (negCount / totalConvs) * 100 : 0;
      targets = negCount;

      if (frustratedPct < frustratedThresholdPct || negCount < 3) {
        await this.logRun(merchant_id, automationType, "success", 0, 0, null);
        return;
      }

      const ownerRow = await this.pool.query<{
        name: string;
        whatsapp_number: string | null;
      }>(`SELECT name, whatsapp_number FROM merchants WHERE id = $1`, [
        merchant_id,
      ]);
      const ownerPhone = ownerRow.rows[0]?.whatsapp_number;

      if (ownerPhone) {
        const msg = `🔍 تنبيه: ارتفاع في المشاعر السلبية\n\n${negCount} محادثة من ${totalConvs} أبدت عدم رضا خلال آخر 24 ساعة (${frustratedPct.toFixed(1)}%)\n\nيُوصى بمراجعة هذه المحادثات والتدخل السريع لتحسين رضا العملاء 💬`;
        try {
          await this.notificationsService.sendBroadcastWhatsApp(
            ownerPhone,
            msg,
          );
          sent++;
        } catch (e: any) {
          this.logger.warn({
            msg: "SentimentMonitor WA failed",
            error: e.message,
          });
        }
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "SENTIMENT_MONITOR error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LEAD SCORING
  // ─────────────────────────────────────────────────────────────────────────

  private async runLeadScoring(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "LEAD_SCORE";
    let sent = 0,
      targets = 0;
    try {
      // Score recent conversations that haven't been scored yet
      const result = await this.pool.query<{
        conversation_id: string;
        message_count: number;
        cart_value: number;
        customer_phone: string;
        is_returning: boolean;
      }>(
        `SELECT
           c.id AS conversation_id,
           COUNT(m.id)::int AS message_count,
           COALESCE(
             (c.cart->>'total')::numeric,
             jsonb_array_length(COALESCE(c.cart->'items', '[]'::jsonb)) * 50
           )::numeric AS cart_value,
           cust.phone AS customer_phone,
           EXISTS(
             SELECT 1 FROM orders o2
             WHERE o2.merchant_id = $1 AND o2.customer_id = cust.id
           ) AS is_returning
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         LEFT JOIN customers cust ON cust.id = c.customer_id
         WHERE c.merchant_id = $1
           AND c.state IN ('COLLECTING_ITEMS','COLLECTING_CUSTOMER_INFO','NEGOTIATING')
           AND c.lead_score IS NULL
           AND c.last_message_at > NOW() - INTERVAL '48 hours'
           AND c.cart IS NOT NULL
           AND jsonb_array_length(COALESCE(c.cart->'items', '[]'::jsonb)) > 0
         LIMIT 100`,
        [merchant_id],
      );

      targets = result.rows.length;

      for (const conv of result.rows) {
        // Simple deterministic scoring (no AI tokens needed)
        const cartValue = Number(conv.cart_value);
        let score = 0;
        if (cartValue > 500) score += 40;
        else if (cartValue > 200) score += 25;
        else if (cartValue > 50) score += 15;
        if (conv.message_count > 10) score += 30;
        else if (conv.message_count > 5) score += 20;
        else score += 10;
        if (conv.is_returning) score += 30;
        const leadScore = score >= 70 ? "HOT" : score >= 40 ? "WARM" : "COLD";

        try {
          await this.pool.query(
            `UPDATE conversations SET lead_score = $1 WHERE id = $2`,
            [leadScore, conv.conversation_id],
          );
          sent++;
        } catch (e: any) {
          this.logger.warn({
            msg: "LeadScore update failed",
            error: e.message,
          });
        }
      }

      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "LEAD_SCORE error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTO VIP TAG
  // ─────────────────────────────────────────────────────────────────────────

  private async runAutoVipTag(merchant_id: string, config: any): Promise<void> {
    const automationType = "AUTO_VIP_TAG";
    let sent = 0,
      targets = 0;
    try {
      const minOrders = Number(config?.minOrders ?? 5);
      const minSpend = Number(config?.minSpend ?? 1000);

      const result = await this.pool.query<{ customer_id: string }>(
        `UPDATE customers SET tags = array_append(COALESCE(tags, '{}'), 'VIP')
         WHERE merchant_id = $1
           AND is_blocked = false
           AND NOT ('VIP' = ANY(COALESCE(tags, '{}')))
           AND id IN (
             SELECT customer_id FROM orders
             WHERE merchant_id = $1
               AND status IN ('DELIVERED','CONFIRMED')
             GROUP BY customer_id
             HAVING COUNT(*) >= $2
                AND SUM(total) >= $3
           )
         RETURNING id AS customer_id`,
        [merchant_id, minOrders, minSpend],
      );

      targets = result.rows.length;
      sent = result.rows.length;
      this.logger.log({
        msg: "AUTO_VIP_TAG: tagged customers",
        count: sent,
        merchant_id,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "AUTO_VIP_TAG error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AT-RISK TAG
  // ─────────────────────────────────────────────────────────────────────────

  private async runAtRiskTag(merchant_id: string, config: any): Promise<void> {
    const automationType = "AT_RISK_TAG";
    let sent = 0,
      targets = 0;
    try {
      const silentDays = Number(config?.silentDays ?? 21);
      const minPriorOrders = Number(config?.minPriorOrders ?? 2);

      const result = await this.pool.query<{ customer_id: string }>(
        `UPDATE customers SET tags = array_append(COALESCE(tags, '{}'), 'at_risk')
         WHERE merchant_id = $1
           AND is_blocked = false
           AND NOT ('at_risk' = ANY(COALESCE(tags, '{}')))
           AND id IN (
             SELECT o.customer_id FROM orders o
             WHERE o.merchant_id = $1
               AND o.status IN ('DELIVERED','CONFIRMED')
             GROUP BY o.customer_id
             HAVING COUNT(*) >= $2
                AND MAX(o.created_at) < NOW() - INTERVAL '1 day' * $3
                AND MAX(o.created_at) > NOW() - INTERVAL '1 day' * ($3 * 3)
           )
         RETURNING id AS customer_id`,
        [merchant_id, minPriorOrders, silentDays],
      );

      targets = result.rows.length;
      sent = result.rows.length;
      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "AT_RISK_TAG error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HIGH RETURN FLAG
  // ─────────────────────────────────────────────────────────────────────────

  private async runHighReturnFlag(
    merchant_id: string,
    config: any,
  ): Promise<void> {
    const automationType = "HIGH_RETURN_FLAG";
    let sent = 0,
      targets = 0;
    try {
      const cancellationRatePct = Number(config?.cancellationRatePct ?? 30);
      const minOrders = Number(config?.minOrders ?? 3);

      const result = await this.pool.query<{ customer_id: string }>(
        `UPDATE customers SET tags = array_append(COALESCE(tags, '{}'), 'high_return')
         WHERE merchant_id = $1
           AND is_blocked = false
           AND NOT ('high_return' = ANY(COALESCE(tags, '{}')))
           AND id IN (
             SELECT customer_id FROM orders
             WHERE merchant_id = $1
             GROUP BY customer_id
             HAVING COUNT(*) >= $2
                AND (
                  COUNT(*) FILTER (WHERE status IN ('CANCELLED','RETURNED'))::numeric
                  / COUNT(*)::numeric * 100
                ) >= $3
           )
         RETURNING id AS customer_id`,
        [merchant_id, minOrders, cancellationRatePct],
      );

      targets = result.rows.length;
      sent = result.rows.length;
      await this.logRun(
        merchant_id,
        automationType,
        "success",
        sent,
        targets,
        null,
      );
    } catch (err: any) {
      this.logger.error({
        msg: "HIGH_RETURN_FLAG error",
        merchant_id,
        error: err.message,
      });
      await this.logRun(
        merchant_id,
        automationType,
        "error",
        sent,
        targets,
        err.message,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private async logRun(
    merchantId: string,
    automationType: string,
    status: "success" | "error",
    messagesSent: number,
    targetsFound: number,
    errorMessage: string | null,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO automation_run_logs
           (merchant_id, automation_type, status, messages_sent, targets_found, error_message)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          merchantId,
          automationType,
          status,
          messagesSent,
          targetsFound,
          errorMessage,
        ],
      );

      // Update last_run_at on the settings row
      await this.pool.query(
        `UPDATE merchant_automations SET last_run_at = NOW()
         WHERE merchant_id = $1 AND automation_type = $2`,
        [merchantId, automationType],
      );
    } catch (logErr: any) {
      this.logger.warn({
        msg: "Could not write automation run log",
        error: logErr.message,
      });
    }
  }
}
