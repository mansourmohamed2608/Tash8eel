import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import {
  generateOrderNumber,
  normalizePhone,
} from "../../shared/utils/helpers";

export interface VoiceMessage {
  role: "customer" | "assistant";
  text: string;
  timestamp?: string;
}

export interface VoiceOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
}

export interface VoiceAIResponse {
  text: string;
  orderCreated?: VoiceOrderSummary;
  endCall?: boolean;
  tokensUsed?: number;
  routingDecision?: string;
}

interface VoiceModelItem {
  name?: string;
  quantity?: number;
  notes?: string;
}

interface VoiceModelOrder {
  customerName?: string;
  address?: string;
  deliveryType?: string;
  paymentMethod?: string;
  notes?: string;
  items?: VoiceModelItem[];
}

interface VoiceModelOutput {
  replyText?: string;
  intent?: string;
  endCall?: boolean;
  createOrder?: boolean;
  order?: VoiceModelOrder;
  tokensUsed?: number;
}

interface VoiceOrderInsertInput {
  merchantId: string;
  conversationId: string | null;
  orderNumber: string;
  items: Array<{
    catalogItemId?: string;
    name: string;
    quantity: number;
    unitPrice: number;
    notes?: string;
    lineTotal: number;
  }>;
  subtotal: number;
  total: number;
  customerName: string;
  customerPhone: string;
  deliveryType: "DELIVERY" | "PICKUP" | "DINE_IN";
  deliveryAddressText?: string;
  paymentMethod: "COD" | "CARD" | "BANK_TRANSFER";
  notes?: string;
}

@Injectable()
export class VoiceAiService {
  private readonly logger = new Logger(VoiceAiService.name);
  private readonly openai: OpenAI;
  private readonly openAiModel: string;
  private readonly openAiAvailable: boolean;
  private readonly elevenLabsApiKey: string;
  private readonly elevenLabsVoiceId: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {
    const openAiApiKey = this.configService.get<string>("OPENAI_API_KEY", "");
    this.openAiAvailable = openAiApiKey.length > 0;
    this.openai = new OpenAI({ apiKey: openAiApiKey || "sk-missing" });
    this.openAiModel = "gpt-4o-mini";

    this.elevenLabsApiKey = this.configService.get<string>(
      "ELEVENLABS_API_KEY",
      "",
    );
    this.elevenLabsVoiceId = this.configService.get<string>(
      "ELEVENLABS_VOICE_ID",
      "",
    );
  }

  async processVoiceInput(
    merchantId: string,
    customerPhone: string,
    transcript: string,
    conversationHistory: VoiceMessage[],
  ): Promise<VoiceAIResponse> {
    const normalizedTranscript = String(transcript || "").trim();
    if (!normalizedTranscript) {
      return {
        text: "مسمعتكش كويس. ممكن تقول طلبك تاني باختصار؟",
        routingDecision: "voice_empty_input",
      };
    }

    const merchant = await this.loadMerchant(merchantId);
    const catalogItems = await this.loadCatalogItems(merchantId);

    const directStatusReply = await this.tryBuildOrderStatusReply(
      merchantId,
      customerPhone,
      normalizedTranscript,
    );
    if (directStatusReply) {
      return {
        text: directStatusReply,
        endCall: false,
        tokensUsed: 0,
        routingDecision: "voice_order_status_direct",
      };
    }

    if (!this.openAiAvailable) {
      return {
        text: "حالياً في ضغط على النظام. سيب رقمك وهنكلمك خلال دقائق.",
        routingDecision: "voice_ai_unavailable",
      };
    }

    const modelOutput = await this.generateVoiceModelResponse({
      merchantName: merchant.name,
      merchantCategory: merchant.category,
      catalogItems,
      transcript: normalizedTranscript,
      conversationHistory,
    });

    let responseText = this.enforceVoiceLength(
      modelOutput.replyText ||
        "تمام، وضح لي طلبك في جملة واحدة وأنا هساعدك فوراً.",
    );

    let orderCreated: VoiceOrderSummary | undefined;
    if (this.shouldCreateOrder(modelOutput)) {
      orderCreated = await this.createOrderFromModel(
        merchantId,
        customerPhone,
        modelOutput.order || {},
        catalogItems,
      );

      if (orderCreated) {
        responseText = this.enforceVoiceLength(
          `تمام يا فندم، سجلت طلبك رقم ${orderCreated.orderNumber}. هنراجع معاك التفاصيل حالاً.`,
        );
      }
    }

    const endCall =
      Boolean(modelOutput.endCall) ||
      /مع السلامة|خلاص كده|شكرا|شكرًا|سلام عليكم/i.test(normalizedTranscript);

    return {
      text: responseText,
      orderCreated,
      endCall,
      tokensUsed: modelOutput.tokensUsed || 0,
      routingDecision: orderCreated
        ? "voice_order_created"
        : "voice_ai_response",
    };
  }

  async generateVoiceResponse(text: string): Promise<Buffer> {
    if (!this.elevenLabsApiKey || !this.elevenLabsVoiceId) {
      throw new Error("ElevenLabs credentials are not configured");
    }

    const payload = {
      text: this.enforceVoiceLength(text),
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };

    let lastError = "ElevenLabs request failed";

    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.elevenLabsVoiceId)}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": this.elevenLabsApiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        const data = await response.arrayBuffer();
        return Buffer.from(data);
      }

      lastError = await response.text();
      if (attempt < 2) {
        await this.sleep(350);
      }
    }

    throw new Error(lastError);
  }

  private async generateVoiceModelResponse(input: {
    merchantName: string;
    merchantCategory: string;
    catalogItems: CatalogItem[];
    transcript: string;
    conversationHistory: VoiceMessage[];
  }): Promise<VoiceModelOutput> {
    const catalogSummary = input.catalogItems
      .slice(0, 35)
      .map((item) => `${item.nameAr}: ${item.basePrice} جنيه`)
      .join("\n");

    const historyMessages = input.conversationHistory
      .filter((entry) => entry.text && entry.text.trim().length > 0)
      .slice(-6)
      .map(
        (entry) =>
          ({
            role: entry.role === "assistant" ? "assistant" : "user",
            content: entry.text,
          }) as OpenAI.ChatCompletionMessageParam,
      );

    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    messages.push({
      role: "system",
      content:
        `أنت موظف كول سنتر صوتي لمتجر ${input.merchantName} (${input.merchantCategory}). ` +
        `تكلم باللهجة المصرية فقط وبشكل مختصر جداً. ` +
        `أي رد صوتي لازم يكون بحد أقصى جملتين و30 كلمة. ` +
        `لو العميل بيطلب منتجات وحدد العناصر، جهز createOrder=true واكتب العناصر. ` +
        `لو السؤال عن حالة الطلب، intent يكون status. ` +
        `لو المحادثة انتهت، endCall=true. ` +
        `لا تكتب أي نص خارج JSON.\n` +
        `JSON المطلوب: {"replyText":"string","intent":"string","createOrder":boolean,"endCall":boolean,"order":{"customerName":"string","address":"string","deliveryType":"delivery|pickup|dine_in","paymentMethod":"cash|card|transfer","notes":"string","items":[{"name":"string","quantity":number,"notes":"string"}]}}\n` +
        `الكتالوج:\n${catalogSummary || "لا يوجد كتالوج متاح حالياً"}`,
    } as OpenAI.ChatCompletionMessageParam);
    messages.push(...historyMessages);
    messages.push({
      role: "user",
      content: input.transcript,
    } as OpenAI.ChatCompletionMessageParam);

    const completion = await this.openai.chat.completions.create({
      model: this.openAiModel,
      temperature: 0.25,
      max_tokens: 260,
      response_format: { type: "json_object" },
      messages,
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed: VoiceModelOutput = {};

    try {
      parsed = JSON.parse(raw) as VoiceModelOutput;
    } catch {
      parsed = {
        replyText: raw,
      };
    }

    parsed.tokensUsed = completion.usage?.total_tokens || 0;
    return parsed;
  }

  private shouldCreateOrder(output: VoiceModelOutput): boolean {
    if (output.createOrder) return true;

    const intent = String(output.intent || "").toLowerCase();
    if (!["order", "create_order", "buy"].includes(intent)) {
      return false;
    }

    return (output.order?.items || []).length > 0;
  }

  private async createOrderFromModel(
    merchantId: string,
    customerPhone: string,
    orderData: VoiceModelOrder,
    catalogItems: CatalogItem[],
  ): Promise<VoiceOrderSummary | undefined> {
    const candidates = (orderData.items || [])
      .map((item) => ({
        name: String(item?.name || "").trim(),
        quantity: Number(item?.quantity || 1),
        notes: item?.notes ? String(item.notes).trim() : undefined,
      }))
      .filter((item) => item.name.length > 0 && Number.isFinite(item.quantity));

    if (candidates.length === 0) {
      return undefined;
    }

    const normalizedItems = candidates.map((item) => {
      const quantity = Math.max(1, Math.round(item.quantity));
      const matched = this.findCatalogMatch(item.name, catalogItems);
      const unitPrice = Number(matched?.basePrice || 0);
      const lineTotal = Number((unitPrice * quantity).toFixed(2));

      return {
        catalogItemId: matched?.id,
        name: matched?.nameAr || item.name,
        quantity,
        unitPrice,
        notes: item.notes,
        lineTotal,
      };
    });

    const subtotal = Number(
      normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2),
    );
    const total = subtotal;

    const deliveryType = this.normalizeDeliveryType(orderData.deliveryType);
    const paymentMethod = this.normalizePaymentMethod(orderData.paymentMethod);
    const customerName =
      String(orderData.customerName || "").trim() || "عميل اتصال صوتي";
    const normalizedPhone = normalizePhone(customerPhone || "");

    const orderNumber = await this.createUniqueOrderNumber(merchantId);

    const input: VoiceOrderInsertInput = {
      merchantId,
      conversationId: null,
      orderNumber,
      items: normalizedItems,
      subtotal,
      total,
      customerName,
      customerPhone: normalizedPhone || customerPhone,
      deliveryType,
      deliveryAddressText: orderData.address,
      paymentMethod,
      notes: orderData.notes,
    };

    let created;
    try {
      created = await this.insertVoiceOrder(input);
    } catch (error: unknown) {
      const pgError = error as { code?: string; message?: string };
      const code = String(pgError.code || "");
      const message = String(pgError.message || "").toLowerCase();

      if (code === "23502" && message.includes("conversation_id")) {
        const fallbackConversationId =
          await this.createVoiceConversationFallback(
            merchantId,
            customerName,
            normalizedPhone || customerPhone,
          );

        created = await this.insertVoiceOrder({
          ...input,
          conversationId: fallbackConversationId,
        });
      } else {
        throw error;
      }
    }

    return created;
  }

  private async insertVoiceOrder(
    input: VoiceOrderInsertInput,
  ): Promise<VoiceOrderSummary> {
    try {
      const result = await this.pool.query<{
        id: string;
        order_number: string;
        status: string;
        total: string;
      }>(
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
           delivery_notes,
           delivery_preference,
           payment_method,
           payment_status,
           source_channel,
           updated_at
         ) VALUES (
           $1,
           $2,
           NULL,
           $3,
           'DRAFT',
           $4,
           $5,
           0,
           0,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           'PENDING',
           'voice_ai',
           NOW()
         )
         RETURNING id::text as id, order_number, status::text as status, total::text as total`,
        [
          input.merchantId,
          input.conversationId,
          input.orderNumber,
          JSON.stringify(input.items),
          input.subtotal,
          input.total,
          input.customerName,
          input.customerPhone,
          input.deliveryAddressText
            ? JSON.stringify({
                street: input.deliveryAddressText,
                raw_text: input.deliveryAddressText,
              })
            : null,
          input.notes || null,
          input.deliveryType,
          input.paymentMethod,
        ],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        total: Number(row.total || 0),
      };
    } catch (error: unknown) {
      const pgError = error as { code?: string };
      if (pgError.code !== "42703") {
        throw error;
      }

      const fallback = await this.pool.query<{
        id: string;
        order_number: string;
        status: string;
        total: string;
      }>(
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
           delivery_notes,
           delivery_preference,
           payment_method,
           updated_at
         ) VALUES (
           $1,
           $2,
           NULL,
           $3,
           'DRAFT',
           $4,
           $5,
           0,
           0,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           NOW()
         )
         RETURNING id::text as id, order_number, status::text as status, total::text as total`,
        [
          input.merchantId,
          input.conversationId,
          input.orderNumber,
          JSON.stringify(input.items),
          input.subtotal,
          input.total,
          input.customerName,
          input.customerPhone,
          input.deliveryAddressText
            ? JSON.stringify({
                street: input.deliveryAddressText,
                raw_text: input.deliveryAddressText,
              })
            : null,
          input.notes || null,
          input.deliveryType,
          input.paymentMethod,
        ],
      );

      const row = fallback.rows[0];
      return {
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        total: Number(row.total || 0),
      };
    }
  }

  private async createVoiceConversationFallback(
    merchantId: string,
    customerName: string,
    customerPhone: string,
  ): Promise<string> {
    const conversationId = `voice-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    try {
      await this.pool.query(
        `INSERT INTO conversations (
           id,
           merchant_id,
           sender_id,
           channel,
           state,
           collected_info,
           last_message_at,
           updated_at
         ) VALUES (
           $1,
           $2,
           $3,
           'whatsapp',
           'ORDER_PLACED',
           $4,
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          conversationId,
          merchantId,
          customerPhone || "voice-caller",
          JSON.stringify({
            customerName,
            phone: customerPhone,
            source: "voice_ai_call",
          }),
        ],
      );
    } catch {
      await this.pool.query(
        `INSERT INTO conversations (
           id,
           merchant_id,
           sender_id,
           state,
           collected_info,
           last_message_at,
           updated_at
         ) VALUES (
           $1,
           $2,
           $3,
           'ORDER_PLACED',
           $4,
           NOW(),
           NOW()
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          conversationId,
          merchantId,
          customerPhone || "voice-caller",
          JSON.stringify({
            customerName,
            phone: customerPhone,
            source: "voice_ai_call",
          }),
        ],
      );
    }

    return conversationId;
  }

  private async createUniqueOrderNumber(merchantId: string): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = generateOrderNumber(merchantId);
      const exists = await this.pool.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM orders WHERE merchant_id = $1 AND order_number = $2
         ) as exists`,
        [merchantId, candidate],
      );

      if (!exists.rows[0]?.exists) {
        return candidate;
      }
    }

    return `VOICE-${Date.now().toString(36).toUpperCase()}`;
  }

  private findCatalogMatch(
    name: string,
    catalogItems: CatalogItem[],
  ): CatalogItem | undefined {
    const normalized = this.normalizeText(name);
    if (!normalized) return undefined;

    const exact = catalogItems.find(
      (item) =>
        this.normalizeText(item.nameAr) === normalized ||
        this.normalizeText(item.nameEn || "") === normalized,
    );
    if (exact) return exact;

    return catalogItems.find((item) => {
      const ar = this.normalizeText(item.nameAr);
      const en = this.normalizeText(item.nameEn || "");
      return (
        ar.includes(normalized) ||
        normalized.includes(ar) ||
        en.includes(normalized)
      );
    });
  }

  private async loadMerchant(merchantId: string): Promise<{
    id: string;
    name: string;
    category: string;
  }> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      category: string | null;
    }>(`SELECT id, name, category FROM merchants WHERE id = $1 LIMIT 1`, [
      merchantId,
    ]);

    if (!result.rows[0]) {
      throw new Error("Merchant not found");
    }

    return {
      id: result.rows[0].id,
      name: result.rows[0].name,
      category: result.rows[0].category || "GENERIC",
    };
  }

  private async loadCatalogItems(merchantId: string): Promise<CatalogItem[]> {
    const result = await this.pool.query<{
      id: string;
      merchant_id: string;
      sku: string | null;
      name_ar: string;
      name_en: string | null;
      category: string | null;
      base_price: string;
      variants: unknown;
      options: unknown;
      tags: string[] | null;
      is_available: boolean | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT
         id::text,
         merchant_id,
         sku,
         name_ar,
         name_en,
         category,
         base_price,
         variants,
         options,
         tags,
         COALESCE(is_available, true) as is_available,
         created_at,
         updated_at
       FROM catalog_items
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT 120`,
      [merchantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      merchantId: row.merchant_id,
      sku: row.sku || undefined,
      nameAr: row.name_ar,
      nameEn: row.name_en || undefined,
      category: row.category || undefined,
      basePrice: Number(row.base_price || 0),
      variants: Array.isArray(row.variants)
        ? (row.variants as CatalogItem["variants"])
        : [],
      options: Array.isArray(row.options)
        ? (row.options as CatalogItem["options"])
        : [],
      tags: row.tags || [],
      isAvailable: row.is_available !== false,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  private async tryBuildOrderStatusReply(
    merchantId: string,
    customerPhone: string,
    transcript: string,
  ): Promise<string | null> {
    const wantsStatus = /حالة|الطلب|اوردر|order|status|وصل|لسه/i.test(
      transcript,
    );
    if (!wantsStatus) {
      return null;
    }

    const digits = String(customerPhone || "").replace(/\D/g, "");
    if (!digits) {
      return null;
    }

    const result = await this.pool.query<{
      order_number: string;
      status: string;
      total: string;
      created_at: Date;
    }>(
      `SELECT order_number, status::text, total::text, created_at
       FROM orders
       WHERE merchant_id = $1
         AND regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [merchantId, digits],
    );

    if (!result.rows[0]) {
      return "مش لاقي طلب مسجل بنفس الرقم ده. قولّي رقم الطلب أو اطلب جديد.";
    }

    const statusLabel = this.mapOrderStatusToArabic(result.rows[0].status);
    return this.enforceVoiceLength(
      `آخر طلب رقم ${result.rows[0].order_number} حالته ${statusLabel}. لو عايز أي تعديل قولّي دلوقتي.`,
    );
  }

  private mapOrderStatusToArabic(status: string): string {
    const normalized = String(status || "").toUpperCase();
    const labels: Record<string, string> = {
      DRAFT: "قيد المراجعة",
      CONFIRMED: "متأكد",
      BOOKED: "محجوز للشحن",
      SHIPPED: "اتشحن",
      OUT_FOR_DELIVERY: "خارج للتسليم",
      DELIVERED: "تم التسليم",
      CANCELLED: "ملغي",
    };
    return labels[normalized] || "قيد المعالجة";
  }

  private normalizeDeliveryType(
    value?: string,
  ): "DELIVERY" | "PICKUP" | "DINE_IN" {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (normalized === "pickup") return "PICKUP";
    if (normalized === "dine_in" || normalized === "dine-in") return "DINE_IN";
    return "DELIVERY";
  }

  private normalizePaymentMethod(
    value?: string,
  ): "COD" | "CARD" | "BANK_TRANSFER" {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (normalized === "card") return "CARD";
    if (normalized === "transfer" || normalized === "bank_transfer") {
      return "BANK_TRANSFER";
    }
    return "COD";
  }

  private normalizeText(value: string): string {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  private enforceVoiceLength(text: string): string {
    const cleaned = String(text || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) {
      return "تمام، اتفضل قول اللي محتاجه.";
    }

    const sentenceParts = cleaned
      .split(/(?<=[.!؟])/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .slice(0, 2);

    const firstPass =
      sentenceParts.length > 0 ? sentenceParts.join(" ") : cleaned;
    const words = firstPass.split(/\s+/).filter((word) => word.length > 0);

    if (words.length <= 30) {
      return firstPass;
    }

    return words.slice(0, 30).join(" ");
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
