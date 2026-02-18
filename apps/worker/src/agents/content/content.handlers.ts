/**
 * Content Agent Handlers
 * Product descriptions, catalog content, translations.
 */
import { Pool } from "pg";
import { Logger } from "@nestjs/common";
import { AgentTask } from "@tash8eel/agent-sdk";
import {
  GenerateDescriptionInput,
  TranslateContentInput,
  EnrichCatalogInput,
} from "./content.tasks";

export class ContentHandlers {
  private readonly logger = new Logger(ContentHandlers.name);

  constructor(private readonly pool: Pool) {}

  /**
   * Generate product description from product data
   * SDK task: GENERATE_DESCRIPTION
   */
  async generateDescription(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as unknown as GenerateDescriptionInput;
    const merchantId = task.merchantId;

    try {
      // Look up product data from DB if productId provided
      let productData: any = {
        name: input.productName,
        category: input.category,
        attributes: input.attributes || {},
      };

      if (input.productId && merchantId) {
        const result = await this.pool.query(
          `SELECT name, description, price, category, sku, variants, images
           FROM products WHERE id = $1 AND merchant_id = $2`,
          [input.productId, merchantId],
        );
        if (result.rows[0]) {
          productData = { ...productData, ...result.rows[0] };
        }
      }

      // Generate description templates based on category
      const lang = input.targetLanguage || "ar";
      const attrs = productData.attributes || {};
      const attrText = Object.entries(attrs)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");

      let description: string;
      let shortDescription: string;

      if (lang === "ar") {
        shortDescription = `${productData.name} - ${productData.category || "منتج"}`;
        description = `${productData.name}\n\n`;
        description += productData.category
          ? `الفئة: ${productData.category}\n`
          : "";
        description += attrText ? `المواصفات: ${attrText}\n` : "";
        description += `\nمنتج عالي الجودة متوفر الآن. اطلبه عبر واتساب للحصول على أفضل سعر.`;
      } else {
        shortDescription = `${productData.name} - ${productData.category || "Product"}`;
        description = `${productData.name}\n\n`;
        description += productData.category
          ? `Category: ${productData.category}\n`
          : "";
        description += attrText ? `Specifications: ${attrText}\n` : "";
        description += `\nHigh quality product now available. Order via WhatsApp for the best price.`;
      }

      // Generate SEO-friendly tags
      const tags = [
        productData.name,
        productData.category,
        ...Object.values(attrs),
      ]
        .filter(Boolean)
        .slice(0, 10);

      this.logger.log(`Generated description for product: ${productData.name}`);

      return {
        action: "DESCRIPTION_GENERATED",
        productId: input.productId,
        description,
        shortDescription,
        tags,
        language: lang,
        seoTitle: shortDescription,
        seoDescription: description.substring(0, 160),
      };
    } catch (error) {
      this.logger.error(
        `generateDescription failed: ${(error as Error).message}`,
      );
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Translate content between Arabic and English
   * SDK task: TRANSLATE_CONTENT
   */
  async translateContent(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as unknown as TranslateContentInput;

    try {
      if (!input.content) {
        return {
          action: "FAILED",
          message: "Content is required for translation",
        };
      }

      // Simple keyword-based translation for common commerce terms
      // In production, this would call an LLM or translation API
      const arToEn: Record<string, string> = {
        طلب: "order",
        منتج: "product",
        عميل: "customer",
        سعر: "price",
        خصم: "discount",
        شحن: "shipping",
        دفع: "payment",
        مخزون: "stock",
        فاتورة: "invoice",
        ضريبة: "tax",
        إجمالي: "total",
        كمية: "quantity",
        "المبلغ الإجمالي": "total amount",
        "رقم الطلب": "order number",
        "اسم العميل": "customer name",
        "رقم الهاتف": "phone number",
      };

      const enToAr: Record<string, string> = {};
      for (const [ar, en] of Object.entries(arToEn)) {
        enToAr[en] = ar;
      }

      let translated = input.content;
      const dict = input.sourceLanguage === "ar" ? arToEn : enToAr;

      for (const [from, to] of Object.entries(dict)) {
        translated = translated.replace(new RegExp(from, "gi"), to);
      }

      this.logger.log(
        `Translated content from ${input.sourceLanguage} to ${input.targetLanguage}`,
      );

      return {
        action: "TRANSLATION_COMPLETE",
        originalContent: input.content,
        translatedContent: translated,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        method: "keyword_mapping",
        note: "Basic translation using keyword mapping. For production, integrate with a translation API.",
      };
    } catch (error) {
      this.logger.error(`translateContent failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Enrich catalog item with better descriptions and tags
   */
  async enrichCatalog(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as unknown as EnrichCatalogInput;
    const merchantId = input.merchantId || task.merchantId;
    if (!merchantId)
      return { action: "FAILED", message: "merchantId required" };

    try {
      // Fetch the catalog item
      const result = await this.pool.query(
        `SELECT id, name, description, price, category, sku, variants
         FROM products WHERE id = $1 AND merchant_id = $2`,
        [input.catalogItemId, merchantId],
      );

      if (result.rows.length === 0) {
        return { action: "FAILED", message: "Product not found" };
      }

      const product = result.rows[0];
      const enrichments: Record<string, any> = {};

      for (const type of input.enrichmentTypes) {
        switch (type) {
          case "description":
            enrichments.description = product.description
              ? product.description
              : `${product.name} - منتج متوفر بسعر ${product.price} ج.م. اطلبه الآن عبر واتساب.`;
            break;
          case "tags":
            enrichments.tags = [
              product.name,
              product.category,
              product.sku,
              product.price > 500 ? "premium" : "value",
            ].filter(Boolean);
            break;
          case "seo":
            enrichments.seo = {
              title: `${product.name} | شراء أونلاين`,
              description: `اشتري ${product.name} بأفضل سعر. ${product.category || ""} متوفر للطلب عبر واتساب.`,
              keywords: [
                product.name,
                product.category,
                "شراء أونلاين",
                "واتساب",
              ].filter(Boolean),
            };
            break;
        }
      }

      this.logger.log(`Enriched catalog item ${input.catalogItemId}`);

      return {
        action: "CATALOG_ENRICHED",
        productId: input.catalogItemId,
        productName: product.name,
        enrichments,
        enrichmentTypes: input.enrichmentTypes,
      };
    } catch (error) {
      this.logger.error(`enrichCatalog failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Moderate content for inappropriate material
   */
  async moderateContent(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as any;
    const content = input?.content || "";

    try {
      // Basic content moderation - check for blocked patterns
      const blockedPatterns = [
        /\b(spam|scam|fake|counterfeit)\b/i,
        /\b(مزيف|مقلد|نصب|احتيال)\b/i,
      ];

      const issues: string[] = [];
      for (const pattern of blockedPatterns) {
        if (pattern.test(content)) {
          issues.push(`Blocked pattern found: ${pattern.source}`);
        }
      }

      const isClean = issues.length === 0;

      return {
        action: isClean ? "CONTENT_APPROVED" : "CONTENT_FLAGGED",
        isClean,
        issues,
        contentLength: content.length,
        reviewedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`moderateContent failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }
}
