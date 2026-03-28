import { Injectable, Inject, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { VisionService, ProductAnalysis } from "../llm/vision.service";
import {
  ICatalogRepository,
  CATALOG_REPOSITORY,
} from "../../domain/ports/catalog.repository";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import {
  IMetaWhatsAppAdapter,
  META_WHATSAPP_ADAPTER,
} from "../adapters/meta-whatsapp.adapter";

export interface ProductOcrResult {
  success: boolean;
  analyzed: boolean;
  product?: ProductAnalysis;
  catalogMatches?: CatalogMatch[];
  error?: string;
  confirmationMessage?: string;
}

export interface CatalogMatch {
  item: CatalogItem;
  matchScore: number;
  matchType: "exact" | "similar" | "category";
}

export interface PendingProductConfirmation {
  id: string;
  merchantId: string;
  customerId: string;
  conversationId: string;
  ocrResult: ProductAnalysis;
  catalogMatches: CatalogMatch[];
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class ProductOcrService {
  private readonly logger = new Logger(ProductOcrService.name);

  // In-memory cache for pending confirmations (in production, use Redis)
  private readonly pendingConfirmations = new Map<
    string,
    PendingProductConfirmation
  >();

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly visionService: VisionService,
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogRepo: ICatalogRepository,
    @Inject(META_WHATSAPP_ADAPTER)
    private readonly whatsappAdapter: IMetaWhatsAppAdapter,
  ) {}

  /**
   * Check if a media content type is an image we can process
   */
  isProcessableImage(contentType: string): boolean {
    const supportedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif", // Static GIFs only
    ];
    return supportedTypes.some((t) => contentType.toLowerCase().startsWith(t));
  }

  /**
   * Process a product image from WhatsApp:
   * 1. Download the image
   * 2. Run OCR/Vision analysis
   * 3. Search catalog for matches
   * 4. Return results for confirmation flow
   */
  async processProductImage(
    imageUrl: string,
    merchantId: string,
    customerId: string,
    conversationId: string,
    merchantCategory?: string,
  ): Promise<ProductOcrResult> {
    this.logger.log({
      msg: "Processing product image",
      merchantId,
      customerId,
      conversationId,
    });

    try {
      // 1. Download image from Meta Cloud API (imageUrl is a media ID or data URL)
      const { buffer, contentType } =
        await this.whatsappAdapter.downloadMedia(imageUrl);

      if (!this.isProcessableImage(contentType)) {
        return {
          success: false,
          analyzed: false,
          error: `Unsupported image type: ${contentType}`,
        };
      }

      // 2. Convert to base64 for Vision API
      const imageBase64 = buffer.toString("base64");

      // 3. Run product analysis
      const ocrResult = await this.visionService.analyzeProductImage(
        imageBase64,
        merchantCategory,
      );

      if (!ocrResult.success || !ocrResult.product) {
        return {
          success: false,
          analyzed: true,
          error: ocrResult.error || "Could not analyze product from image",
        };
      }

      this.logger.log({
        msg: "Product analyzed from image",
        merchantId,
        productName: ocrResult.product.name,
        confidence: ocrResult.confidence,
      });

      // 4. Search catalog for matches
      const catalogMatches = await this.findCatalogMatches(
        merchantId,
        ocrResult.product,
      );

      // 5. Store pending confirmation if matches found
      let confirmationId: string | undefined;
      if (catalogMatches.length > 0) {
        confirmationId = await this.storePendingConfirmation({
          merchantId,
          customerId,
          conversationId,
          ocrResult: ocrResult.product,
          catalogMatches,
        });
      }

      // 6. Generate confirmation message
      const confirmationMessage = this.generateConfirmationMessage(
        ocrResult.product,
        catalogMatches,
        confirmationId,
      );

      return {
        success: true,
        analyzed: true,
        product: ocrResult.product,
        catalogMatches,
        confirmationMessage,
      };
    } catch (error) {
      this.logger.error({
        msg: "Product image processing failed",
        merchantId,
        error: (error as Error).message,
      });
      return {
        success: false,
        analyzed: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Find catalog items that match the analyzed product
   */
  private async findCatalogMatches(
    merchantId: string,
    product: ProductAnalysis,
  ): Promise<CatalogMatch[]> {
    const matches: CatalogMatch[] = [];

    try {
      // Search by product name
      const productName = product.productName;
      if (productName && typeof productName === "string") {
        const nameMatches = await this.catalogRepo.searchByName(
          merchantId,
          productName,
        );

        for (const item of nameMatches) {
          const score = this.calculateMatchScore(product, item);
          if (score > 0.3) {
            // Minimum threshold
            matches.push({
              item,
              matchScore: score,
              matchType: score > 0.8 ? "exact" : "similar",
            });
          }
        }
      }

      // Search by brand if provided
      const brandName = product.brand;
      if (brandName && typeof brandName === "string" && matches.length < 5) {
        const brandMatches = await this.catalogRepo.searchByName(
          merchantId,
          brandName,
        );

        for (const item of brandMatches) {
          // Don't add duplicates
          if (!matches.some((m) => m.item.id === item.id)) {
            const score = this.calculateMatchScore(product, item);
            if (score > 0.2) {
              matches.push({
                item,
                matchScore: score,
                matchType: "similar",
              });
            }
          }
        }
      }

      // Sort by score and take top matches
      matches.sort((a, b) => b.matchScore - a.matchScore);
      return matches.slice(0, 5);
    } catch (error) {
      this.logger.error({
        msg: "Catalog search failed during OCR matching",
        merchantId,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Calculate how well a catalog item matches the analyzed product
   */
  private calculateMatchScore(
    product: ProductAnalysis,
    item: CatalogItem,
  ): number {
    let score = 0;
    let maxScore = 0;

    // Get product name (uses productName from ProductAnalysis)
    const productName = product.productName;
    const productBrand = product.brand;
    const productCategory = product.category;
    const suggestedPrice = product.suggestedPrice;

    // Name matching (weighted heavily)
    if (productName && typeof productName === "string" && item.name) {
      maxScore += 50;
      const productNameLower = productName.toLowerCase();
      const itemNameLower = (item.name || item.nameAr || "").toLowerCase();

      if (itemNameLower === productNameLower) {
        score += 50;
      } else if (
        itemNameLower.includes(productNameLower) ||
        productNameLower.includes(itemNameLower)
      ) {
        score += 35;
      } else {
        // Fuzzy match using word overlap
        const productWords = new Set(productNameLower.split(/\s+/));
        const itemWords = new Set(itemNameLower.split(/\s+/));
        const overlap = [...productWords].filter((w) =>
          itemWords.has(w),
        ).length;
        score += (overlap / Math.max(productWords.size, itemWords.size)) * 30;
      }
    }

    // Brand matching
    if (productBrand && typeof productBrand === "string") {
      maxScore += 20;
      const itemDescription = (
        item.description ||
        item.descriptionAr ||
        ""
      ).toLowerCase();
      const itemName = (item.name || item.nameAr || "").toLowerCase();
      const brandLower = productBrand.toLowerCase();

      if (
        itemName.includes(brandLower) ||
        itemDescription.includes(brandLower)
      ) {
        score += 20;
      }
    }

    // Category matching
    if (
      productCategory &&
      typeof productCategory === "string" &&
      item.category
    ) {
      maxScore += 15;
      if (productCategory.toLowerCase() === item.category.toLowerCase()) {
        score += 15;
      }
    }

    // Price proximity (if both have prices)
    if (suggestedPrice && typeof suggestedPrice === "number" && item.price) {
      maxScore += 15;
      const priceDiff = Math.abs(suggestedPrice - item.price);
      const priceRatio = priceDiff / Math.max(suggestedPrice, item.price);

      if (priceRatio < 0.1)
        score += 15; // Within 10%
      else if (priceRatio < 0.2)
        score += 10; // Within 20%
      else if (priceRatio < 0.3) score += 5; // Within 30%
    }

    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Store a pending confirmation for customer response
   */
  private async storePendingConfirmation(data: {
    merchantId: string;
    customerId: string;
    conversationId: string;
    ocrResult: ProductAnalysis;
    catalogMatches: CatalogMatch[];
  }): Promise<string> {
    this.cleanupExpired();

    const id = `pc_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const confirmation: PendingProductConfirmation = {
      id,
      merchantId: data.merchantId,
      customerId: data.customerId,
      conversationId: data.conversationId,
      ocrResult: data.ocrResult,
      catalogMatches: data.catalogMatches,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min expiry
    };

    this.pendingConfirmations.set(id, confirmation);

    // Also store in DB for persistence
    await this.pool
      .query(
        `INSERT INTO product_ocr_confirmations 
       (id, merchant_id, customer_id, conversation_id, ocr_result, catalog_matches, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
        [
          id,
          data.merchantId,
          data.customerId,
          data.conversationId,
          JSON.stringify(data.ocrResult),
          JSON.stringify(
            data.catalogMatches.map((m) => ({
              itemId: m.item.id,
              itemName: m.item.name || m.item.nameAr,
              matchScore: m.matchScore,
              matchType: m.matchType,
            })),
          ),
          confirmation.expiresAt,
        ],
      )
      .catch((err) => {
        // Table might not exist yet - that's OK for now
        this.logger.warn("Could not persist confirmation to DB", err.message);
      });

    return id;
  }

  /**
   * Generate a customer-facing confirmation message with options
   */
  private generateConfirmationMessage(
    product: ProductAnalysis,
    catalogMatches: CatalogMatch[],
    confirmationId?: string,
  ): string {
    const lines: string[] = [];

    // Header with detected product
    lines.push("📸 *تم التعرف على المنتج من الصورة*");
    lines.push("");

    if (product.productName) {
      lines.push(`المنتج: ${product.productName}`);
    }
    if (product.brand) {
      lines.push(`العلامة التجارية: ${product.brand}`);
    }
    if (product.category) {
      lines.push(`الفئة: ${product.category}`);
    }

    // Show catalog matches
    if (catalogMatches.length > 0) {
      lines.push("");
      lines.push("🔍 *المنتجات المطابقة في الكتالوج:*");
      lines.push("");

      catalogMatches.slice(0, 3).forEach((match, index) => {
        const item = match.item;
        const name = item.name || item.nameAr;
        const price = item.price ? `${item.price} ر.س` : "";
        const matchPercent = Math.round(match.matchScore * 100);

        lines.push(`${index + 1}. ${name} ${price ? `- ${price}` : ""}`);
        lines.push(`   📊 نسبة التطابق: ${matchPercent}%`);
      });

      lines.push("");
      lines.push("للطلب، أرسل رقم المنتج (مثلاً: *1*)");
      lines.push("أو اكتب *لا* للبحث بشكل آخر");
    } else {
      lines.push("");
      lines.push("⚠️ لم نجد منتجات مطابقة في الكتالوج.");
      lines.push("هل تريد البحث عن منتج مشابه؟");
      lines.push("اكتب اسم المنتج الذي تبحث عنه.");
    }

    return lines.join("\n");
  }

  /**
   * Handle customer response to product confirmation
   */
  async handleConfirmationResponse(
    merchantId: string,
    customerId: string,
    responseText: string,
  ): Promise<{
    handled: boolean;
    selectedItem?: CatalogItem;
    message?: string;
  }> {
    this.cleanupExpired();

    // Find pending confirmation for this customer
    const confirmation = Array.from(this.pendingConfirmations.values()).find(
      (c) =>
        c.merchantId === merchantId &&
        c.customerId === customerId &&
        c.expiresAt > new Date(),
    );

    if (!confirmation) {
      return { handled: false };
    }

    const text = responseText.trim().toLowerCase();

    // Check for "no" / rejection
    if (text === "لا" || text === "no" || text === "لأ") {
      this.pendingConfirmations.delete(confirmation.id);
      return {
        handled: true,
        message: "حسنًا، يمكنك البحث عن المنتج بالاسم أو إرسال صورة أخرى.",
      };
    }

    // Check for numeric selection
    const num = parseInt(text, 10);
    if (!isNaN(num) && num >= 1 && num <= confirmation.catalogMatches.length) {
      const selectedMatch = confirmation.catalogMatches[num - 1];
      this.pendingConfirmations.delete(confirmation.id);

      return {
        handled: true,
        selectedItem: selectedMatch.item,
        message: `✅ تم اختيار: ${selectedMatch.item.name || selectedMatch.item.nameAr}`,
      };
    }

    return { handled: false };
  }

  /**
   * Clean up expired confirmations
   */
  cleanupExpired(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [id, confirmation] of this.pendingConfirmations) {
      if (confirmation.expiresAt < now) {
        this.pendingConfirmations.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  cleanupExpiredConfirmations(): void {
    const cleaned = this.cleanupExpired();
    if (cleaned > 0) {
      this.logger.log(`Cleaned ${cleaned} expired product OCR confirmations`);
    }
  }
}
