import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { createLogger } from "../../shared/logging/logger";
import { Merchant } from "../../domain/entities/merchant.entity";
import { Conversation } from "../../domain/entities/conversation.entity";
import { Message } from "../../domain/entities/message.entity";
import { EmbeddingService } from "./embedding.service";
import { VectorSearchService } from "./vector-search.service";

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

interface CatalogContextRow {
  id: string;
  merchant_id: string;
  sku: string | null;
  name_ar: string | null;
  name_en: string | null;
  description_ar: string | null;
  category: string | null;
  base_price: string | number | null;
  price: string | number | null;
  stock_quantity: string | number | null;
  is_available: boolean | null;
  is_active: boolean | null;
  variants: unknown;
}

interface KnowledgeBaseEntry {
  title: string;
  content: string;
  category: string;
}

export interface CustomerReplyContextParams {
  merchant: Merchant;
  conversation: Conversation;
  customerMessage: string;
  recentMessages: Message[];
}

export interface CustomerReplyContext {
  businessInfo: string;
  productCatalog: string;
  knowledgeBase: string;
  conversationHistory: string;
  orderContext: string;
  fullContext: string;
  productCount: number;
  kbCount: number;
  historyCount: number;
}

/**
 * Shared service that builds rich cross-system context for AI prompts.
 * Each section is a concise text summary optimized for token efficiency.
 * Used by merchant-assistant, copilot-ai, inventory-ai, etc.
 */
@Injectable()
export class MerchantContextService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorSearchService: VectorSearchService,
  ) {}

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

  async buildCustomerReplyContext(
    params: CustomerReplyContextParams,
  ): Promise<CustomerReplyContext> {
    const { merchant, conversation, customerMessage, recentMessages } = params;
    const allCatalogRows = await this.loadAllActiveCatalogRows(merchant.id);
    const relevantCatalogRows = await this.loadRelevantCatalogRows(
      merchant.id,
      customerMessage,
      allCatalogRows,
    );
    const kbEntries = this.extractKnowledgeBaseEntries(merchant);
    const relevantKbEntries = this.selectRelevantKnowledgeBaseEntries(
      kbEntries,
      customerMessage,
    );
    const historyMessages = this.prepareHistoryMessages(
      recentMessages,
      customerMessage,
    );
    const orderContext = await this.buildCustomerOrderContext(
      merchant.id,
      conversation,
    );

    const businessInfo = this.buildBusinessIdentitySection(merchant);
    const productCatalog = this.buildCustomerProductCatalogSection(
      allCatalogRows,
      relevantCatalogRows,
    );
    const knowledgeBase = this.buildKnowledgeBaseSection(
      merchant,
      kbEntries,
      relevantKbEntries,
    );
    const conversationHistory =
      this.buildCustomerConversationHistorySection(historyMessages);

    const fullContext = [
      "SECTION A — Business Identity:",
      businessInfo,
      "",
      "SECTION B — Complete Product Catalog:",
      productCatalog,
      "",
      "SECTION C — Knowledge Base:",
      knowledgeBase,
      "",
      "SECTION D — Conversation History:",
      conversationHistory,
      "",
      "SECTION E — Order Context:",
      orderContext,
    ].join("\n");

    return {
      businessInfo,
      productCatalog,
      knowledgeBase,
      conversationHistory,
      orderContext,
      fullContext,
      productCount: allCatalogRows.length,
      kbCount: relevantKbEntries.length,
      historyCount: historyMessages.length,
    };
  }

  private buildBusinessIdentitySection(merchant: Merchant): string {
    const workingHours = this.formatWorkingHours(merchant);
    const welcomeMessage =
      merchant.config?.welcomeMessage?.trim() || "غير محدد";
    const businessType =
      merchant.knowledgeBase?.businessInfo?.category ||
      merchant.category ||
      "غير محدد";

    return [
      `Merchant name: ${merchant.name}`,
      `Business type: ${businessType}`,
      `Welcome message: ${welcomeMessage}`,
      `Language: Arabic (Egyptian dialect)`,
      `Working hours: ${workingHours}`,
    ].join("\n");
  }

  private async loadAllActiveCatalogRows(
    merchantId: string,
  ): Promise<CatalogContextRow[]> {
    try {
      const result = await this.pool.query<CatalogContextRow>(
        `SELECT
           id,
           merchant_id,
           sku,
           name_ar,
           name_en,
           description_ar,
           category,
           COALESCE(price, base_price) AS price,
           base_price,
           stock_quantity,
           is_available,
           COALESCE(is_active, true) AS is_active,
           variants
         FROM catalog_items
         WHERE merchant_id = $1
           AND COALESCE(is_active, true) = true
         ORDER BY COALESCE(category, ''), COALESCE(name_ar, name_en, sku, id::text)`,
        [merchantId],
      );
      return result.rows;
    } catch (error: any) {
      if (error?.code === "42703") {
        const fallback = await this.pool.query<CatalogContextRow>(
          `SELECT
             id,
             merchant_id,
             sku,
             name_ar,
             name_en,
             description_ar,
             category,
             COALESCE(price, base_price) AS price,
             base_price,
             NULL::numeric AS stock_quantity,
             is_available,
             true AS is_active,
             variants
           FROM catalog_items
           WHERE merchant_id = $1
           ORDER BY COALESCE(category, ''), COALESCE(name_ar, name_en, sku, id::text)`,
          [merchantId],
        );
        return fallback.rows;
      }
      throw error;
    }
  }

  private async loadRelevantCatalogRows(
    merchantId: string,
    customerMessage: string,
    allCatalogRows: CatalogContextRow[],
  ): Promise<CatalogContextRow[]> {
    if (allCatalogRows.length === 0) {
      return [];
    }

    try {
      const queryVector = await this.embeddingService.embed(customerMessage);
      if (!queryVector.every((value) => value === 0)) {
        const vectorMatches = await this.vectorSearchService.semanticSearch(
          merchantId,
          queryVector,
          5,
        );
        const byId = new Map(allCatalogRows.map((row) => [row.id, row]));
        const matchedRows = vectorMatches
          .map((match) => byId.get(match.id))
          .filter((row): row is CatalogContextRow => !!row);
        if (matchedRows.length > 0) {
          return matchedRows;
        }
      }
    } catch (error) {
      logger.warn("Relevant catalog vector lookup failed", { error });
    }

    const scored = allCatalogRows
      .map((row) => ({
        row,
        score: this.keywordScore(customerMessage, [
          row.name_ar,
          row.name_en,
          row.description_ar,
          row.category,
          row.sku,
        ]),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.row);

    return scored.length > 0 ? scored : allCatalogRows.slice(0, 5);
  }

  private buildCustomerProductCatalogSection(
    allCatalogRows: CatalogContextRow[],
    relevantCatalogRows: CatalogContextRow[],
  ): string {
    if (allCatalogRows.length === 0) {
      return "No active products available.";
    }

    const relevantIds = new Set(relevantCatalogRows.map((row) => row.id));
    const relevantLines = relevantCatalogRows.map((row) =>
      this.formatCatalogLine(row),
    );

    if (allCatalogRows.length <= 50) {
      const allLines = allCatalogRows.map((row) => this.formatCatalogLine(row));
      return [
        `Total active products: ${allCatalogRows.length}`,
        "Relevant products for the current customer message:",
        ...(relevantLines.length > 0 ? relevantLines : ["- No direct product match found."]),
        "",
        "Full active catalog:",
        ...allLines,
      ].join("\n");
    }

    const grouped = new Map<string, CatalogContextRow[]>();
    for (const row of allCatalogRows) {
      const category = (row.category || "بدون تصنيف").trim() || "بدون تصنيف";
      const current = grouped.get(category) || [];
      current.push(row);
      grouped.set(category, current);
    }

    const categoryBlocks = Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b, "ar"))
      .map(([category, rows]) => {
        const names = rows.map((row) => row.name_ar || row.name_en || row.sku || row.id);
        return `Category: ${category} (${rows.length} products)\n- ${names.join(" | ")}`;
      });

    return [
      `Total active products: ${allCatalogRows.length}`,
      "Relevant products for the current customer message:",
      ...(relevantLines.length > 0 ? relevantLines : ["- No direct product match found."]),
      "",
      "Grouped full catalog overview:",
      ...categoryBlocks,
      "",
      "Detailed relevant product cards:",
      ...allCatalogRows
        .filter((row) => relevantIds.has(row.id))
        .map((row) => this.formatCatalogLine(row)),
    ].join("\n");
  }

  private formatCatalogLine(row: CatalogContextRow): string {
    const name = row.name_ar || row.name_en || row.sku || row.id;
    const price = Number(row.price ?? row.base_price ?? 0);
    const sku = row.sku || "غير متوفر";
    const category = row.category || "بدون تصنيف";
    const description = row.description_ar?.trim() || "لا يوجد وصف";
    const inStock = this.isInStock(row) ? "yes" : "no";
    const variants = this.formatVariants(row.variants);

    return [
      `- Name (Arabic): ${name}`,
      `  Description: ${description}`,
      `  Price: ${price} جنيه`,
      `  SKU/code: ${sku}`,
      `  Category: ${category}`,
      `  In stock: ${inStock}`,
      `  Variants: ${variants}`,
    ].join("\n");
  }

  private extractKnowledgeBaseEntries(merchant: Merchant): KnowledgeBaseEntry[] {
    const knowledgeBase = merchant.knowledgeBase || {};
    const businessInfo = knowledgeBase.businessInfo || {};
    const entries: KnowledgeBaseEntry[] = [];

    const pushEntry = (title: string, content: string, category: string) => {
      const normalized = String(content || "").trim();
      if (!normalized) return;
      entries.push({ title, content: normalized, category });
    };

    pushEntry("Business name", businessInfo.name || merchant.name, "business");
    pushEntry("Business category", businessInfo.category || merchant.category, "business");
    pushEntry("Business address", businessInfo.address, "business");
    pushEntry("Working hours", this.formatWorkingHours(merchant), "business");
    pushEntry(
      "Return policy",
      businessInfo.policies?.returnPolicy,
      "policy",
    );
    pushEntry(
      "Delivery info",
      businessInfo.policies?.deliveryInfo,
      "delivery",
    );
    pushEntry(
      "Payment methods",
      Array.isArray(businessInfo.policies?.paymentMethods)
        ? businessInfo.policies.paymentMethods.join(", ")
        : "",
      "payment",
    );
    pushEntry(
      "Delivery notes",
      businessInfo.deliveryPricing?.notes,
      "delivery",
    );
    pushEntry(
      "Unified delivery price",
      businessInfo.deliveryPricing?.unifiedPrice != null
        ? String(businessInfo.deliveryPricing.unifiedPrice)
        : "",
      "delivery",
    );

    if (Array.isArray(businessInfo.deliveryPricing?.byCity)) {
      for (const entry of businessInfo.deliveryPricing.byCity.slice(0, 10)) {
        const location = entry?.area || entry?.city;
        if (!location) continue;
        pushEntry(
          `Delivery price for ${location}`,
          `${location}: ${entry.price}`,
          "delivery",
        );
      }
    }

    if (Array.isArray(knowledgeBase.faqs)) {
      for (const faq of knowledgeBase.faqs) {
        if (!faq || faq.isActive === false) continue;
        pushEntry(
          `FAQ: ${faq.question || "Question"}`,
          `Q: ${faq.question || ""}\nA: ${faq.answer || ""}`,
          faq.category || "faq",
        );
      }
    }

    if (Array.isArray(knowledgeBase.offers)) {
      for (const offer of knowledgeBase.offers) {
        if (!offer || offer.isActive === false) continue;
        const label = offer.nameAr || offer.name || "Offer";
        const value =
          offer.type === "PERCENTAGE"
            ? `${offer.value}%`
            : offer.type === "FREE_SHIPPING"
              ? "شحن مجاني"
              : offer.value != null
                ? String(offer.value)
                : "";
        pushEntry(
          `Offer: ${label}`,
          `${label}${value ? ` - ${value}` : ""}`,
          "offer",
        );
      }
    }

    if (Array.isArray(knowledgeBase.customInstructions)) {
      for (const instruction of knowledgeBase.customInstructions) {
        pushEntry("Custom instruction", String(instruction), "instruction");
      }
    }

    if (typeof knowledgeBase.customInstructions === "string") {
      pushEntry(
        "Custom instruction",
        knowledgeBase.customInstructions,
        "instruction",
      );
    }

    return entries;
  }

  private selectRelevantKnowledgeBaseEntries(
    entries: KnowledgeBaseEntry[],
    customerMessage: string,
  ): KnowledgeBaseEntry[] {
    if (entries.length === 0) {
      return [];
    }

    const scored = entries
      .map((entry) => ({
        entry,
        score: this.keywordScore(customerMessage, [
          entry.title,
          entry.content,
          entry.category,
        ]),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.entry);

    if (scored.length > 0) {
      return scored;
    }

    return entries.slice(0, 20);
  }

  private buildKnowledgeBaseSection(
    merchant: Merchant,
    allEntries: KnowledgeBaseEntry[],
    relevantEntries: KnowledgeBaseEntry[],
  ): string {
    const merchantPolicies = merchant.knowledgeBase?.businessInfo?.policies || {};
    const relevantLines = relevantEntries.map(
      (entry) => `- [${entry.category}] ${entry.title}\n  ${entry.content}`,
    );

    return [
      `Total knowledge entries available: ${allEntries.length}`,
      `Return policy: ${merchantPolicies.returnPolicy || "غير محدد"}`,
      `Delivery info: ${merchantPolicies.deliveryInfo || "غير محدد"}`,
      `Payment methods: ${
        Array.isArray(merchantPolicies.paymentMethods) &&
        merchantPolicies.paymentMethods.length > 0
          ? merchantPolicies.paymentMethods.join(", ")
          : "غير محدد"
      }`,
      "Relevant knowledge for this message:",
      ...(relevantLines.length > 0
        ? relevantLines
        : ["- No matching knowledge-base entry found."]),
    ].join("\n");
  }

  private prepareHistoryMessages(
    recentMessages: Message[],
    customerMessage: string,
  ): Message[] {
    const trimmedCustomerMessage = String(customerMessage || "").trim();
    const sorted = [...recentMessages].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const messages = [...sorted];
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage &&
      String(lastMessage.direction).toLowerCase() === "inbound" &&
      String(lastMessage.text || "").trim() === trimmedCustomerMessage
    ) {
      messages.pop();
    }
    return messages.slice(-10);
  }

  private buildCustomerConversationHistorySection(messages: Message[]): string {
    if (messages.length === 0) {
      return "No previous conversation history.";
    }

    return messages
      .map((message) => {
        const speaker =
          String(message.direction).toLowerCase() === "inbound"
            ? "Customer"
            : "Assistant";
        return `${speaker}: ${String(message.text || "").trim() || "[empty]"}`;
      })
      .join("\n");
  }

  private async buildCustomerOrderContext(
    merchantId: string,
    conversation: Conversation,
  ): Promise<string> {
    const senderId = String(conversation.senderId || "").trim();
    const phone = String(conversation.collectedInfo?.phone || senderId).trim();

    try {
      const result = await this.pool.query<{
        id: string;
        order_number: string;
        status: string;
        total: string;
        items: unknown;
        created_at: string;
      }>(
        `SELECT id, order_number, status, total, items, created_at
         FROM orders
         WHERE merchant_id = $1
           AND (
             customer_id = $2
             OR ($3 <> '' AND customer_phone = $3)
           )
         ORDER BY created_at DESC
         LIMIT 4`,
        [merchantId, conversation.customerId || null, phone],
      );

      if (result.rows.length === 0) {
        return "No pending or previous orders for this customer.";
      }

      const pendingOrder = result.rows.find(
        (row) => !["DELIVERED", "CANCELLED"].includes(String(row.status)),
      );
      const previousOrders = result.rows.slice(0, 3);

      const lines: string[] = [];
      if (pendingOrder) {
        lines.push("Pending order:");
        lines.push(this.formatOrderLine(pendingOrder));
      }

      if (previousOrders.length > 0) {
        lines.push("Previous orders:");
        previousOrders.forEach((order) => {
          lines.push(this.formatOrderLine(order));
        });
      }

      return lines.join("\n");
    } catch (error) {
      logger.warn("Failed to build customer order context", { error });
      return "Order context unavailable right now.";
    }
  }

  private formatOrderLine(order: {
    order_number: string;
    status: string;
    total: string;
    items: unknown;
    created_at: string;
  }): string {
    const items = Array.isArray(order.items)
      ? order.items
          .map((item: any) => `${item?.name || "منتج"} × ${item?.quantity || 1}`)
          .join("، ")
      : "تفاصيل المنتجات غير متاحة";
    return `- #${order.order_number} | status: ${order.status} | total: ${Number(order.total).toLocaleString()} جنيه | items: ${items} | date: ${new Date(order.created_at).toLocaleString("en-GB")}`;
  }

  private formatVariants(rawVariants: unknown): string {
    const variants = Array.isArray(rawVariants)
      ? (rawVariants as Array<{ name?: string; values?: string[] }>)
      : [];
    if (variants.length === 0) {
      return "none";
    }

    return variants
      .map((variant) => {
        const name = variant.name || "option";
        const values = Array.isArray(variant.values)
          ? variant.values.join(", ")
          : "غير محدد";
        return `${name}: ${values}`;
      })
      .join(" | ");
  }

  private isInStock(row: CatalogContextRow): boolean {
    if (row.is_available === false) {
      return false;
    }
    if (row.stock_quantity == null) {
      return true;
    }
    return Number(row.stock_quantity) > 0;
  }

  private keywordScore(query: string, values: Array<string | null | undefined>): number {
    const tokens = this.tokenizeArabicText(query);
    if (tokens.length === 0) {
      return 0;
    }

    const haystack = values
      .filter((value): value is string => !!value)
      .join(" ")
      .toLowerCase();

    return tokens.reduce((score, token) => {
      if (token.length < 2) {
        return score;
      }
      return haystack.includes(token) ? score + 1 : score;
    }, 0);
  }

  private tokenizeArabicText(value: string): string[] {
    return String(value || "")
      .toLowerCase()
      .replace(/[؟?!.,،؛:()/\\-]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  private formatWorkingHours(merchant: Merchant): string {
    const knowledgeBaseHours = merchant.knowledgeBase?.businessInfo?.workingHours;
    const merchantHours = merchant.workingHours as
      | { start?: string; end?: string; open?: string; close?: string }
      | undefined;
    const deliveryHours = merchant.deliveryRules?.workingHours;

    const open =
      knowledgeBaseHours?.open ||
      knowledgeBaseHours?.start ||
      merchantHours?.open ||
      merchantHours?.start ||
      deliveryHours?.start;
    const close =
      knowledgeBaseHours?.close ||
      knowledgeBaseHours?.end ||
      merchantHours?.close ||
      merchantHours?.end ||
      deliveryHours?.end;

    if (!open && !close) {
      return "غير محدد";
    }

    return `${open || "غير محدد"} - ${close || "غير محدد"}`;
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
      logger.error("Failed to build orders context", error, { cause: err });
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
      logger.error("Failed to build inventory context", error, { cause: err });
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
      logger.error("Failed to build finance context", error, { cause: err });
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
      logger.error("Failed to build customers context", error, { cause: err });
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
      logger.error("Failed to build conversations context", error, {
        cause: err,
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
