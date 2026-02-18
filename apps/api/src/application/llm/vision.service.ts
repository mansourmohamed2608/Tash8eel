import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { withRetry, withTimeout } from "../../shared/utils/helpers";

export interface OcrResult {
  success: boolean;
  text?: string;
  extractedData?: Record<string, unknown>;
  confidence: number;
  error?: string;
}

export interface ReceiptData {
  paymentMethod:
    | "INSTAPAY"
    | "VODAFONE_CASH"
    | "BANK_TRANSFER"
    | "FAWRY"
    | "WALLET"
    | "UNKNOWN";
  amount: number;
  currency: string;
  referenceNumber?: string;
  date?: string;
  senderName?: string;
  receiverName?: string;
  bankName?: string;
  walletNumber?: string;
  instapayAlias?: string;
  [key: string]: unknown;
}

export interface ProductAnalysis {
  productName?: string;
  category?: string;
  color?: string;
  size?: string;
  brand?: string;
  condition?: string;
  suggestedPrice?: number;
  suggestedDescription?: string;
  tags: string[];
  [key: string]: unknown;
}

export interface MedicineAnalysis {
  medicineName?: string;
  genericName?: string;
  manufacturer?: string;
  dosageForm?: string;
  strength?: string;
  instructions?: string;
  warnings?: string[];
  activeIngredients?: string[];
  [key: string]: unknown;
}

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private client: OpenAI;
  private model: string;
  private isTestMode: boolean;
  private strictAiMode: boolean;
  private timeoutMs: number;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>("OPENAI_API_KEY") || "";

    this.isTestMode =
      !apiKey ||
      apiKey.startsWith("sk-test-") ||
      apiKey.startsWith("sk-dummy-") ||
      apiKey.includes("dummy") ||
      (process.env.NODE_ENV === "test" && !apiKey.startsWith("sk-proj-"));

    this.client = new OpenAI({ apiKey });
    this.model = this.configService.get<string>(
      "OPENAI_VISION_MODEL",
      "gpt-4o",
    );
    this.timeoutMs = parseInt(
      this.configService.get<string>("OPENAI_TIMEOUT_MS", "30000"),
      10,
    );
    this.strictAiMode =
      (
        this.configService.get<string>("AI_STRICT_MODE", "false") || "false"
      ).toLowerCase() === "true";

    if (this.isTestMode) {
      if (this.strictAiMode) {
        this.logger.warn(
          "Vision Service in test mode with AI_STRICT_MODE=true - mock responses disabled",
        );
      } else {
        this.logger.log(
          "Vision Service running in test mode - using mock responses",
        );
      }
    }
  }

  private getAiUnavailableMessage(): string {
    return "الذكاء الاصطناعي غير مفعّل حالياً. فعّل OPENAI_API_KEY أو عطّل AI_STRICT_MODE.";
  }

  /**
   * Classify payment proof image to detect payment method
   * Used when customer submits proof without specifying method
   */
  async classifyPaymentProof(imageBase64: string): Promise<{
    paymentMethod: ReceiptData["paymentMethod"];
    confidence: number;
    indicators: string[];
  }> {
    if (this.isTestMode) {
      if (this.strictAiMode) {
        return {
          paymentMethod: "UNKNOWN",
          confidence: 0,
          indicators: ["AI_NOT_ENABLED"],
        };
      }
      return {
        paymentMethod: "INSTAPAY",
        confidence: 0.9,
        indicators: ["InstaPay logo detected", "IPA@ alias visible"],
      };
    }

    try {
      const prompt = `Classify this Egyptian payment receipt/screenshot. Identify the payment method.

Return ONLY a JSON object:
{
  "paymentMethod": "INSTAPAY|VODAFONE_CASH|BANK_TRANSFER|FAWRY|WALLET|UNKNOWN",
  "confidence": <0.0-1.0>,
  "indicators": ["reason1", "reason2"]
}

Classification rules:
- INSTAPAY: InstaPay logo, IPA@ alias, bank app showing InstaPay transfer
- VODAFONE_CASH: Red Vodafone Cash branding, *9* reference, 010 number
- BANK_TRANSFER: Bank name/logo, IBAN, account number, "تحويل بنكي"
- FAWRY: Yellow Fawry branding, Fawry reference number
- WALLET: Orange/Etisalat/WE branding for mobile money
- UNKNOWN: Cannot determine`;

      const response = await withTimeout(
        withRetry(() => this.analyzeImage(imageBase64, prompt), {
          maxRetries: 2,
          initialDelayMs: 1000,
        }),
        this.timeoutMs,
        "Vision API request timed out",
      );

      const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      return {
        paymentMethod: this.normalizePaymentMethod(parsed.paymentMethod),
        confidence: parsed.confidence || 0.5,
        indicators: parsed.indicators || [],
      };
    } catch (error) {
      this.logger.error("Payment proof classification failed", error);
      return {
        paymentMethod: "UNKNOWN",
        confidence: 0,
        indicators: ["Classification failed"],
      };
    }
  }

  /**
   * Process an InstaPay/bank transfer receipt image
   */
  async processPaymentReceipt(
    imageBase64: string,
  ): Promise<OcrResult & { receipt?: ReceiptData }> {
    if (this.isTestMode) {
      if (this.strictAiMode) {
        return {
          success: false,
          confidence: 0,
          error: this.getAiUnavailableMessage(),
        };
      }
      return this.mockReceiptResponse();
    }

    try {
      const response = await withTimeout(
        withRetry(
          () => this.analyzeImage(imageBase64, this.getReceiptPrompt()),
          { maxRetries: 2, initialDelayMs: 1000 },
        ),
        this.timeoutMs,
        "Vision API request timed out",
      );

      const parsedData = this.parseReceiptResponse(response);

      return {
        success: true,
        text: response,
        extractedData: parsedData,
        confidence: parsedData.referenceNumber ? 0.9 : 0.7,
        receipt: parsedData as ReceiptData,
      };
    } catch (error) {
      this.logger.error("Receipt processing failed", error);
      const message =
        error instanceof Error ? String(error.message || "") : String(error);
      return {
        success: false,
        confidence: 0,
        error: message.toLowerCase().includes("api key")
          ? "تعذر الاتصال بخدمة الذكاء الاصطناعي حالياً."
          : message,
      };
    }
  }

  /**
   * Analyze a product image for catalog entry
   */
  async analyzeProductImage(
    imageBase64: string,
    merchantCategory?: string,
  ): Promise<OcrResult & { product?: ProductAnalysis }> {
    if (this.isTestMode) {
      if (this.strictAiMode) {
        return {
          success: false,
          confidence: 0,
          error: this.getAiUnavailableMessage(),
        };
      }
      return this.mockProductResponse();
    }

    try {
      const response = await withTimeout(
        withRetry(
          () =>
            this.analyzeImage(
              imageBase64,
              this.getProductPrompt(merchantCategory),
            ),
          { maxRetries: 2, initialDelayMs: 1000 },
        ),
        this.timeoutMs,
        "Vision API request timed out",
      );

      const parsedData = this.parseProductResponse(response);

      return {
        success: true,
        text: response,
        extractedData: parsedData,
        confidence: 0.85,
        product: parsedData as ProductAnalysis,
      };
    } catch (error) {
      this.logger.error("Product analysis failed", error);
      const message =
        error instanceof Error ? String(error.message || "") : String(error);
      return {
        success: false,
        confidence: 0,
        error: message.toLowerCase().includes("api key")
          ? "تعذر الاتصال بخدمة الذكاء الاصطناعي حالياً."
          : message,
      };
    }
  }

  /**
   * Analyze a medicine/pharmaceutical image
   */
  async analyzeMedicineImage(
    imageBase64: string,
  ): Promise<OcrResult & { medicine?: MedicineAnalysis }> {
    if (this.isTestMode) {
      if (this.strictAiMode) {
        return {
          success: false,
          confidence: 0,
          error: this.getAiUnavailableMessage(),
        };
      }
      return this.mockMedicineResponse();
    }

    try {
      const response = await withTimeout(
        withRetry(
          () => this.analyzeImage(imageBase64, this.getMedicinePrompt()),
          { maxRetries: 2, initialDelayMs: 1000 },
        ),
        this.timeoutMs,
        "Vision API request timed out",
      );

      const parsedData = this.parseMedicineResponse(response);

      return {
        success: true,
        text: response,
        extractedData: parsedData,
        confidence: 0.8,
        medicine: parsedData as MedicineAnalysis,
      };
    } catch (error) {
      this.logger.error("Medicine analysis failed", error);
      const message =
        error instanceof Error ? String(error.message || "") : String(error);
      return {
        success: false,
        confidence: 0,
        error: message.toLowerCase().includes("api key")
          ? "تعذر الاتصال بخدمة الذكاء الاصطناعي حالياً."
          : message,
      };
    }
  }

  /**
   * General OCR - extract text from any image
   */
  async extractText(imageBase64: string): Promise<OcrResult> {
    if (this.isTestMode) {
      if (this.strictAiMode) {
        return {
          success: false,
          confidence: 0,
          error: this.getAiUnavailableMessage(),
        };
      }
      return {
        success: true,
        text: "نص تجريبي مستخرج من الصورة",
        confidence: 0.9,
      };
    }

    try {
      const response = await withTimeout(
        withRetry(
          () =>
            this.analyzeImage(
              imageBase64,
              `استخرج كل النص الموجود في هذه الصورة بدقة عالية.

=== تعليمات مهمة ===
1. حافظ على النص العربي كما هو بالضبط بدون تغيير حروف أو تشكيل
2. اقرأ النص من اليمين لليسار للعربي ومن اليسار لليمين للإنجليزي
3. لو فيه أرقام (تليفونات، أسعار، مبالغ)، اكتبها بالأرقام كما تظهر
4. حافظ على تنسيق النص الأصلي (سطور، مسافات)
5. لو فيه نص مش واضح أو مقروء جزئياً، اكتب ما تقدر تقرأه وضع [...] مكان الجزء غير الواضح
6. اقرأ أكواد QR أو باركود لو ظاهرة (اذكر وجودها فقط)
7. ميّز بين العناوين والنص العادي لو ممكن`,
            ),
          { maxRetries: 2, initialDelayMs: 1000 },
        ),
        this.timeoutMs,
        "Vision API request timed out",
      );

      return {
        success: true,
        text: response,
        confidence: 0.85,
      };
    } catch (error) {
      this.logger.error("Text extraction failed", error);
      const message =
        error instanceof Error ? String(error.message || "") : String(error);
      return {
        success: false,
        confidence: 0,
        error: message.toLowerCase().includes("api key")
          ? "تعذر الاتصال بخدمة الذكاء الاصطناعي حالياً."
          : message,
      };
    }
  }

  private async analyzeImage(
    imageBase64: string,
    prompt: string,
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: imageBase64.startsWith("data:")
                  ? imageBase64
                  : `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    return response.choices[0]?.message?.content || "";
  }

  private getReceiptPrompt(): string {
    return `تحليل إيصال الدفع/تحويل الأموال المصري هذا. استخرج المعلومات التالية بتنسيق JSON:
{
  "paymentMethod": "<طريقة الدفع - انظر التصنيف أدناه>",
  "amount": <المبلغ كرقم>,
  "currency": "EGP",
  "referenceNumber": "<رقم المرجع/العملية إن وجد>",
  "date": "<التاريخ بتنسيق YYYY-MM-DD>",
  "senderName": "<اسم المرسل>",
  "receiverName": "<اسم المستلم/المحفظة>",
  "bankName": "<اسم البنك>",
  "walletNumber": "<رقم المحفظة إن وجد>",
  "instapayAlias": "<IPA@ الخاص بالمستلم إن وجد>"
}

تصنيف طريقة الدفع (paymentMethod):
- "INSTAPAY" = إذا وجدت كلمة InstaPay أو IPA@ أو تحويل عبر InstaPay
- "VODAFONE_CASH" = إذا وجدت Vodafone Cash أو فودافون كاش أو *9* أو رقم يبدأ بـ 010
- "BANK_TRANSFER" = تحويل بنكي عادي أو ACH أو SWIFT أو IBAN
- "FAWRY" = إذا وجدت فوري أو Fawry أو رقم مرجع فوري
- "WALLET" = محافظ أخرى مثل Orange Cash أو Etisalat Cash أو WE Pay
- "UNKNOWN" = غير قادر على التحديد

أعد فقط كائن JSON بدون أي نص إضافي.`;
  }

  private getProductPrompt(category?: string): string {
    const categoryHint = category ? `هذا المنتج من فئة "${category}". ` : "";
    return `أنت خبير كتالوج منتجات في السوق المصري. ${categoryHint}حلل صورة المنتج هذه واستخرج المعلومات التالية بتنسيق JSON:
{
  "productName": "<اسم المنتج بالعربية - اكتب اسم واضح يصلح للكتالوج>",
  "category": "<الفئة الرئيسية: ملابس/إلكترونيات/مستحضرات تجميل/أطعمة/أدوات منزلية/إكسسوارات/أحذية/أخرى>",
  "color": "<اللون بالعربية>",
  "size": "<المقاس - استخدم المقاسات الشائعة في مصر: S/M/L/XL/XXL للملابس، أو 38-46 للأحذية>",
  "brand": "<العلامة التجارية إن ظاهرة في الصورة>",
  "condition": "new|used|refurbished",
  "suggestedPrice": <السعر المقترح بالجنيه المصري - استخدم أسعار واقعية للسوق المصري>,
  "suggestedDescription": "<وصف مقترح بالعربية 2-3 أسطر يصلح للنشر في متجر إلكتروني - يشمل المميزات والخامة>",
  "tags": ["علامة1", "علامة2", "علامة3"]
}

=== إرشادات السعر المقترح (بالجنيه المصري) ===
- ملابس: 150-800 ج.م (حسب النوع والخامة)
- أحذية: 200-1500 ج.م
- إلكترونيات/إكسسوارات: 100-5000 ج.م
- مستحضرات تجميل: 50-500 ج.م
- أدوات منزلية: 100-2000 ج.م
- إذا كان المنتج يبدو ماركة عالمية، ارفع السعر المقترح

=== ملاحظات ===
- اكتب الوصف بالعربية الفصحى البسيطة (ليس عامية)
- أضف على الأقل 3-5 tags تساعد في البحث
- لو فيه نص عربي على المنتج، اقرأه بدقة
- لو المنتج مش واضح، اكتب أفضل تخمين مع ذكر ذلك

أعد فقط كائن JSON بدون أي نص إضافي.`;
  }

  private getMedicinePrompt(): string {
    return `أنت صيدلي متخصص. حلل صورة الدواء/العبوة الدوائية هذه واستخرج المعلومات التالية بتنسيق JSON:
{
  "medicineName": "<الاسم التجاري كما هو مكتوب على العبوة بالعربية والإنجليزية>",
  "genericName": "<المادة الفعالة / الاسم العلمي>",
  "manufacturer": "<الشركة المصنعة - كثير من الأدوية في مصر من: إيبيكو، عمكو، آمون، المهن الطبية، فاركو، جلاكسو>",
  "dosageForm": "<شكل الجرعة: أقراص/كبسولات/شراب/أمبولات/كريم/قطرة/لبوس/بخاخ>",
  "strength": "<التركيز مع الوحدة: مثلاً 500mg أو 250mg/5ml>",
  "instructions": "<تعليمات الاستخدام الموجودة على العبوة>",
  "warnings": ["<تحذيرات مكتوبة على العبوة>", "<موانع الاستعمال إن وجدت>"],
  "activeIngredients": ["<المكونات الفعالة كما هي مكتوبة>"]
}

=== تعليمات مهمة ===
- اقرأ النص العربي والإنجليزي على العبوة بدقة
- لو الدواء مصري (مكتوب عليه "صنع في مصر" أو "Egyptian Drug Authority")، اذكر ذلك في الشركة المصنعة
- لو فيه رقم تسجيل أو باركود، تجاهله
- لو فيه تاريخ صلاحية ظاهر، اذكره في التحذيرات
- لو مش قادر تقرأ جزء معين، اكتب "غير واضح" بدل ما تخمن
- لا تضيف معلومات طبية من عندك - اكتب فقط ما هو موجود على العبوة

أعد فقط كائن JSON بدون أي نص إضافي.`;
  }

  private parseReceiptResponse(response: string): ReceiptData {
    try {
      const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      // Normalize payment method to uppercase enum
      const normalizedMethod = this.normalizePaymentMethod(
        parsed.paymentMethod,
      );

      return {
        ...parsed,
        paymentMethod: normalizedMethod,
      };
    } catch {
      return {
        paymentMethod: "UNKNOWN",
        amount: 0,
        currency: "EGP",
      };
    }
  }

  /**
   * Normalize payment method string to standard enum values
   */
  private normalizePaymentMethod(method: string): ReceiptData["paymentMethod"] {
    const m = (method || "").toLowerCase().trim();

    if (m.includes("instapay") || m.includes("ipa")) return "INSTAPAY";
    if (m.includes("vodafone") || m.includes("فودافون")) return "VODAFONE_CASH";
    if (
      m.includes("bank") ||
      m.includes("بنك") ||
      m.includes("transfer") ||
      m.includes("تحويل")
    )
      return "BANK_TRANSFER";
    if (m.includes("fawry") || m.includes("فوري")) return "FAWRY";
    if (
      m.includes("wallet") ||
      m.includes("محفظ") ||
      m.includes("orange") ||
      m.includes("etisalat") ||
      m.includes("we pay")
    )
      return "WALLET";

    // Match exact uppercase values
    if (m === "instapay") return "INSTAPAY";
    if (m === "vodafone_cash") return "VODAFONE_CASH";
    if (m === "bank_transfer") return "BANK_TRANSFER";
    if (m === "fawry") return "FAWRY";
    if (m === "wallet") return "WALLET";

    return "UNKNOWN";
  }

  private parseProductResponse(response: string): ProductAnalysis {
    try {
      const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return { tags: [] };
    }
  }

  private parseMedicineResponse(response: string): MedicineAnalysis {
    try {
      const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(cleaned);
    } catch {
      return {};
    }
  }

  // Mock responses for test mode
  private mockReceiptResponse(): OcrResult & { receipt?: ReceiptData } {
    return {
      success: true,
      text: "InstaPay payment receipt - Mock",
      confidence: 0.95,
      receipt: {
        paymentMethod: "INSTAPAY",
        amount: 150.0,
        currency: "EGP",
        referenceNumber: "IP123456789",
        date: new Date().toISOString().split("T")[0],
        senderName: "أحمد محمد",
        receiverName: "متجر الاختبار",
        bankName: "البنك الأهلي المصري",
        instapayAlias: "test@instapay",
      },
    };
  }

  private mockProductResponse(): OcrResult & { product?: ProductAnalysis } {
    return {
      success: true,
      text: "Product analysis - Mock",
      confidence: 0.85,
      product: {
        productName: "قميص أزرق كلاسيك",
        category: "ملابس رجالي",
        color: "أزرق",
        size: "L",
        brand: "Unknown",
        condition: "new",
        suggestedPrice: 250,
        suggestedDescription:
          "قميص رجالي كلاسيكي باللون الأزرق، مناسب للعمل والمناسبات الرسمية",
        tags: ["قميص", "رجالي", "أزرق", "كلاسيك"],
      },
    };
  }

  private mockMedicineResponse(): OcrResult & { medicine?: MedicineAnalysis } {
    return {
      success: true,
      text: "Medicine analysis - Mock",
      confidence: 0.8,
      medicine: {
        medicineName: "بانادول إكسترا",
        genericName: "باراسيتامول + كافيين",
        manufacturer: "جلاكسو سميث كلاين",
        dosageForm: "أقراص",
        strength: "500mg/65mg",
        instructions: "قرص إلى قرصين كل 4-6 ساعات",
        warnings: ["لا تتجاوز 8 أقراص في اليوم", "لا يستخدم مع مشاكل الكبد"],
        activeIngredients: ["باراسيتامول", "كافيين"],
      },
    };
  }
}
