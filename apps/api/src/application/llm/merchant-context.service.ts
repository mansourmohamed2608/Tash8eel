import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { createLogger } from "../../shared/logging/logger";

const logger = createLogger("MerchantContextService");

export interface ContextOptions {
  includeOrders?: boolean;
  includeInventory?: boolean;
  includeFinance?: boolean;
  includeCustomers?: boolean;
  includeConversations?: boolean;
  includeDrivers?: boolean;
}

export interface MerchantContext {
  orders?: string;
  inventory?: string;
  finance?: string;
  customers?: string;
  conversations?: string;
  drivers?: string;
}

/**
 * Shared service that builds rich cross-system context for AI prompts.
 * Each section is a concise text summary optimized for token efficiency.
 * Used by merchant-assistant, copilot-ai, inventory-ai, etc.
 */
@Injectable()
export class MerchantContextService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async buildContext(
    merchantId: string,
    options: ContextOptions = {},
  ): Promise<MerchantContext> {
    const context: MerchantContext = {};
    const promises: Promise<void>[] = [];

    if (options.includeOrders) {
      promises.push(
        this.buildOrdersContext(merchantId).then((s) => {
          context.orders = s;
        }),
      );
    }
    if (options.includeInventory) {
      promises.push(
        this.buildInventoryContext(merchantId).then((s) => {
          context.inventory = s;
        }),
      );
    }
    if (options.includeFinance) {
      promises.push(
        this.buildFinanceContext(merchantId).then((s) => {
          context.finance = s;
        }),
      );
    }
    if (options.includeCustomers) {
      promises.push(
        this.buildCustomersContext(merchantId).then((s) => {
          context.customers = s;
        }),
      );
    }
    if (options.includeConversations) {
      promises.push(
        this.buildConversationsContext(merchantId).then((s) => {
          context.conversations = s;
        }),
      );
    }
    if (options.includeDrivers) {
      promises.push(
        this.buildDriversContext(merchantId).then((s) => {
          context.drivers = s;
        }),
      );
    }

    await Promise.all(promises);
    return context;
  }

  /** One-shot summary string for injection into system prompts */
  async buildContextSummary(
    merchantId: string,
    options: ContextOptions = {},
  ): Promise<string> {
    const ctx = await this.buildContext(merchantId, options);
    const sections: string[] = [];

    if (ctx.orders) sections.push(`=== ملخص الطلبات ===\n${ctx.orders}`);
    if (ctx.inventory) sections.push(`=== ملخص المخزون ===\n${ctx.inventory}`);
    if (ctx.finance) sections.push(`=== ملخص المالية ===\n${ctx.finance}`);
    if (ctx.customers) sections.push(`=== ملخص العملاء ===\n${ctx.customers}`);
    if (ctx.conversations)
      sections.push(`=== ملخص المحادثات ===\n${ctx.conversations}`);
    if (ctx.drivers) sections.push(`=== سائقي التوصيل ===\n${ctx.drivers}`);

    return sections.join("\n\n");
  }

  // ─── Orders ──────────────────────────────────────────────────
  private async buildOrdersContext(merchantId: string): Promise<string> {
    try {
      const [summary, recent, topProducts] = await Promise.all([
        this.pool.query(
          `
          SELECT
            COUNT(*) AS total_orders,
            COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed,
            COUNT(*) FILTER (WHERE status = 'SHIPPED' OR status = 'OUT_FOR_DELIVERY') AS in_transit,
            COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
            COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
            COALESCE(SUM(total), 0) AS total_revenue,
            COALESCE(AVG(total), 0) AS avg_order_value,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7_days,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h
          FROM orders WHERE merchant_id = $1
        `,
          [merchantId],
        ),
        this.pool.query(
          `
          SELECT order_number, customer_name, total, status, created_at
          FROM orders WHERE merchant_id = $1
          ORDER BY created_at DESC LIMIT 5
        `,
          [merchantId],
        ),
        this.pool.query(
          `
          SELECT ci.name, COUNT(oi.id) AS order_count, SUM(oi.quantity) AS total_qty
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          LEFT JOIN catalog_items ci ON ci.id = oi.catalog_item_id
          WHERE o.merchant_id = $1
          GROUP BY ci.name
          ORDER BY order_count DESC LIMIT 5
        `,
          [merchantId],
        ),
      ]);

      const s = summary.rows[0];
      const parts: string[] = [
        `إجمالي الطلبات: ${s.total_orders} (آخر 24 ساعة: ${s.last_24h}، آخر أسبوع: ${s.last_7_days})`,
        `الحالات: مؤكد ${s.confirmed} | قيد الشحن ${s.in_transit} | تم التسليم ${s.delivered} | ملغي ${s.cancelled}`,
        `إجمالي الإيرادات: ${Number(s.total_revenue).toLocaleString()} ج.م | متوسط الطلب: ${Number(s.avg_order_value).toFixed(0)} ج.م`,
      ];

      if (recent.rows.length > 0) {
        parts.push("آخر الطلبات:");
        recent.rows.forEach((o) => {
          parts.push(
            `  - #${o.order_number || "?"} ${o.customer_name || "عميل"} — ${o.total} ج.م (${o.status})`,
          );
        });
      }

      if (topProducts.rows.length > 0) {
        parts.push("أكثر المنتجات طلباً:");
        topProducts.rows.forEach((p) => {
          parts.push(
            `  - ${p.name || "منتج"}: ${p.order_count} طلب (${p.total_qty} قطعة)`,
          );
        });
      }

      return parts.join("\n");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Failed to build orders context", { error: error.message });
      return "بيانات الطلبات غير متاحة حالياً";
    }
  }

  // ─── Inventory ───────────────────────────────────────────────
  private async buildInventoryContext(merchantId: string): Promise<string> {
    try {
      const [summary, lowStock, topValue] = await Promise.all([
        this.pool.query(
          `
          SELECT
            COUNT(*) AS total_products,
            COUNT(*) FILTER (WHERE stock_quantity > 0) AS in_stock,
            COUNT(*) FILTER (WHERE stock_quantity = 0) AS out_of_stock,
            COUNT(*) FILTER (WHERE stock_quantity > 0 AND stock_quantity <= COALESCE(low_stock_threshold, 5)) AS low_stock,
            COALESCE(SUM(stock_quantity * price), 0) AS inventory_value
          FROM catalog_items WHERE merchant_id = $1
        `,
          [merchantId],
        ),
        this.pool.query(
          `
          SELECT name, stock_quantity, low_stock_threshold, price
          FROM catalog_items
          WHERE merchant_id = $1 AND stock_quantity > 0 AND stock_quantity <= COALESCE(low_stock_threshold, 5)
          ORDER BY stock_quantity ASC LIMIT 5
        `,
          [merchantId],
        ),
        this.pool.query(
          `
          SELECT name, stock_quantity, price, (stock_quantity * price) AS value
          FROM catalog_items WHERE merchant_id = $1 AND stock_quantity > 0
          ORDER BY value DESC LIMIT 5
        `,
          [merchantId],
        ),
      ]);

      const s = summary.rows[0];
      const parts: string[] = [
        `إجمالي المنتجات: ${s.total_products} | متاح: ${s.in_stock} | نفذ: ${s.out_of_stock} | مخزون منخفض: ${s.low_stock}`,
        `قيمة المخزون: ${Number(s.inventory_value).toLocaleString()} ج.م`,
      ];

      if (lowStock.rows.length > 0) {
        parts.push("⚠️ تنبيه مخزون منخفض:");
        lowStock.rows.forEach((p) => {
          parts.push(
            `  - ${p.name}: باقي ${p.stock_quantity} قطعة (حد الإنذار: ${p.low_stock_threshold || 5})`,
          );
        });
      }

      if (topValue.rows.length > 0) {
        parts.push("أعلى قيمة مخزون:");
        topValue.rows.forEach((p) => {
          parts.push(
            `  - ${p.name}: ${p.stock_quantity} × ${p.price} = ${Number(p.value).toLocaleString()} ج.م`,
          );
        });
      }

      return parts.join("\n");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Failed to build inventory context", {
        error: error.message,
      });
      return "بيانات المخزون غير متاحة حالياً";
    }
  }

  // ─── Finance ─────────────────────────────────────────────────
  private async buildFinanceContext(merchantId: string): Promise<string> {
    try {
      const [revenue, expenses, cod] = await Promise.all([
        this.pool.query(
          `
          SELECT
            COALESCE(SUM(total) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'), 0) AS revenue_30d,
            COALESCE(SUM(total) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'), 0) AS revenue_7d,
            COALESCE(SUM(total) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0) AS revenue_today,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND status = 'DELIVERED') AS delivered_30d
          FROM orders WHERE merchant_id = $1
        `,
          [merchantId],
        ),
        this.pool
          .query(
            `
          SELECT
            COALESCE(SUM(amount) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'), 0) AS expenses_30d,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS expense_count_30d
          FROM expenses WHERE merchant_id = $1
        `,
            [merchantId],
          )
          .catch(() => ({ rows: [{ expenses_30d: 0, expense_count_30d: 0 }] })),
        this.pool
          .query(
            `
          SELECT
            COUNT(*) AS cod_orders,
            COALESCE(SUM(CASE WHEN cod_collected = true THEN cod_collected_amount ELSE 0 END), 0) AS collected,
            COALESCE(SUM(CASE WHEN cod_collected = false OR cod_collected IS NULL THEN total ELSE 0 END), 0) AS pending
          FROM orders WHERE merchant_id = $1 AND created_at > NOW() - INTERVAL '30 days'
        `,
            [merchantId],
          )
          .catch(() => ({
            rows: [{ cod_orders: 0, collected: 0, pending: 0 }],
          })),
      ]);

      const r = revenue.rows[0];
      const e = expenses.rows[0];
      const c = cod.rows[0];
      const profit30d = Number(r.revenue_30d) - Number(e.expenses_30d);
      const margin =
        Number(r.revenue_30d) > 0
          ? ((profit30d / Number(r.revenue_30d)) * 100).toFixed(1)
          : "0";

      return [
        `إيرادات اليوم: ${Number(r.revenue_today).toLocaleString()} ج.م`,
        `إيرادات آخر 7 أيام: ${Number(r.revenue_7d).toLocaleString()} ج.م`,
        `إيرادات آخر 30 يوم: ${Number(r.revenue_30d).toLocaleString()} ج.م (${r.delivered_30d} طلب مسلّم)`,
        `مصاريف آخر 30 يوم: ${Number(e.expenses_30d).toLocaleString()} ج.م (${e.expense_count_30d} عملية)`,
        `صافي الربح (30 يوم): ${profit30d.toLocaleString()} ج.م | هامش الربح: ${margin}%`,
        `COD — محصّل: ${Number(c.collected).toLocaleString()} ج.م | معلّق: ${Number(c.pending).toLocaleString()} ج.م`,
      ].join("\n");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Failed to build finance context", { error: error.message });
      return "بيانات المالية غير متاحة حالياً";
    }
  }

  // ─── Customers ───────────────────────────────────────────────
  private async buildCustomersContext(merchantId: string): Promise<string> {
    try {
      const [summary, topCustomers] = await Promise.all([
        this.pool.query(
          `
          SELECT
            COUNT(*) AS total_customers,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_this_week
          FROM customers WHERE merchant_id = $1
        `,
          [merchantId],
        ),
        this.pool.query(
          `
          SELECT c.name, c.phone, COUNT(o.id) AS order_count, COALESCE(SUM(o.total), 0) AS total_spent
          FROM customers c
          LEFT JOIN orders o ON o.customer_phone = c.phone AND o.merchant_id = c.merchant_id
          WHERE c.merchant_id = $1
          GROUP BY c.id, c.name, c.phone
          ORDER BY total_spent DESC LIMIT 5
        `,
          [merchantId],
        ),
      ]);

      const s = summary.rows[0];
      const parts: string[] = [
        `إجمالي العملاء: ${s.total_customers} | جدد هذا الأسبوع: ${s.new_this_week}`,
      ];

      if (topCustomers.rows.length > 0) {
        parts.push("أهم العملاء:");
        topCustomers.rows.forEach((c) => {
          parts.push(
            `  - ${c.name || "عميل"} (${c.phone}): ${c.order_count} طلب — ${Number(c.total_spent).toLocaleString()} ج.م`,
          );
        });
      }

      return parts.join("\n");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Failed to build customers context", {
        error: error.message,
      });
      return "بيانات العملاء غير متاحة حالياً";
    }
  }

  // ─── Conversations ───────────────────────────────────────────
  private async buildConversationsContext(merchantId: string): Promise<string> {
    try {
      const result = await this.pool.query(
        `
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'OPEN') AS open,
          COUNT(*) FILTER (WHERE status = 'CLOSED') AS closed,
          COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '24 hours') AS active_today
        FROM conversations WHERE merchant_id = $1
      `,
        [merchantId],
      );

      const s = result.rows[0];
      return [
        `المحادثات: إجمالي ${s.total} | مفتوحة ${s.open} | مغلقة ${s.closed}`,
        `نشطة اليوم: ${s.active_today}`,
      ].join("\n");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Failed to build conversations context", {
        error: error.message,
      });
      return "بيانات المحادثات غير متاحة حالياً";
    }
  }

  // ─── Drivers ─────────────────────────────────────────────────
  private async buildDriversContext(merchantId: string): Promise<string> {
    try {
      const result = await this.pool.query(
        `
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active
        FROM delivery_drivers WHERE merchant_id = $1
      `,
        [merchantId],
      );

      const s = result.rows[0];
      return `سائقي التوصيل: ${s.total} (نشط: ${s.active})`;
    } catch (err) {
      return "بيانات السائقين غير متاحة";
    }
  }
}
