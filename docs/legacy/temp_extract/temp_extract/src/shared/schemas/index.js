"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainEventSchema = exports.CatalogItemUpsertSchema = exports.MerchantUpsertSchema = exports.InboxResponseSchema = exports.InboxMessageSchema = exports.LlmResponseSchema = exports.NegotiationResponseSchema = exports.ExtractedEntitiesSchema = exports.ExtractedAddressSchema = exports.ExtractedProductSchema = exports.BrandingSchema = exports.MerchantConfigSchema = exports.DeliveryRulesSchema = exports.NegotiationRulesSchema = exports.CollectedInfoSchema = exports.CartSchema = exports.CartItemSchema = exports.AddressSchema = exports.OrderStatus = exports.ConversationState = exports.MerchantCategory = exports.ActionType = void 0;
const zod_1 = require("zod");
const enums_1 = require("../constants/enums");
Object.defineProperty(exports, "ActionType", { enumerable: true, get: function () { return enums_1.ActionType; } });
Object.defineProperty(exports, "MerchantCategory", { enumerable: true, get: function () { return enums_1.MerchantCategory; } });
Object.defineProperty(exports, "ConversationState", { enumerable: true, get: function () { return enums_1.ConversationState; } });
Object.defineProperty(exports, "OrderStatus", { enumerable: true, get: function () { return enums_1.OrderStatus; } });
// ============= Address Schema =============
exports.AddressSchema = zod_1.z.object({
    city: zod_1.z.string().optional(),
    area: zod_1.z.string().optional(),
    street: zod_1.z.string().optional(),
    building: zod_1.z.string().optional(),
    floor: zod_1.z.string().optional(),
    apartment: zod_1.z.string().optional(),
    landmark: zod_1.z.string().optional(),
    delivery_notes: zod_1.z.string().optional(),
    raw_text: zod_1.z.string().optional(),
    confidence: zod_1.z.number().min(0).max(1).default(0),
    missing_fields: zod_1.z.array(zod_1.z.string()).default([]),
});
// ============= Cart Item Schema =============
exports.CartItemSchema = zod_1.z.object({
    productId: zod_1.z.string().optional(),
    sku: zod_1.z.string().optional(),
    name: zod_1.z.string(),
    quantity: zod_1.z.number().int().positive(),
    unitPrice: zod_1.z.number().positive(),
    variant: zod_1.z.record(zod_1.z.string()).optional(),
    options: zod_1.z.array(zod_1.z.string()).optional(),
    notes: zod_1.z.string().optional(),
    lineTotal: zod_1.z.number().positive(),
});
// ============= Cart Schema =============
exports.CartSchema = zod_1.z.object({
    items: zod_1.z.array(exports.CartItemSchema).default([]),
    subtotal: zod_1.z.number().default(0),
    discount: zod_1.z.number().default(0),
    discountPercent: zod_1.z.number().optional(),
    deliveryFee: zod_1.z.number().default(0),
    total: zod_1.z.number().default(0),
});
// ============= Collected Info Schema =============
exports.CollectedInfoSchema = zod_1.z.object({
    customerName: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    address: exports.AddressSchema.optional(),
    substitutionAllowed: zod_1.z.boolean().optional(),
    deliveryPreference: zod_1.z.string().optional(),
    deliveryDate: zod_1.z.string().optional(),
});
// ============= Negotiation Rules Schema =============
exports.NegotiationRulesSchema = zod_1.z.object({
    maxDiscountPercent: zod_1.z.number().min(0).max(100).default(10),
    minMarginPercent: zod_1.z.number().min(0).max(100).default(20),
    freeDeliveryThreshold: zod_1.z.number().optional(),
    bundleDiscounts: zod_1.z
        .array(zod_1.z.object({
        minItems: zod_1.z.number().int().positive(),
        discountPercent: zod_1.z.number().min(0).max(100),
    }))
        .optional(),
    allowNegotiation: zod_1.z.boolean().default(true),
    // Active promotion/offer
    activePromotion: zod_1.z
        .object({
        enabled: zod_1.z.boolean().default(false),
        discountPercent: zod_1.z.number().min(0).max(100),
        description: zod_1.z.string(), // e.g., "خصم 10% على كل المنتجات"
        validUntil: zod_1.z.string().optional(), // ISO date
    })
        .optional(),
});
// ============= Delivery Rules Schema =============
exports.DeliveryRulesSchema = zod_1.z.object({
    defaultFee: zod_1.z.number().default(50),
    freeDeliveryThreshold: zod_1.z.number().optional(),
    deliveryZones: zod_1.z
        .array(zod_1.z.object({
        zone: zod_1.z.string(),
        fee: zod_1.z.number(),
        estimatedDays: zod_1.z.number().int().positive(),
    }))
        .optional(),
    workingHours: zod_1.z
        .object({
        start: zod_1.z.string().optional(),
        end: zod_1.z.string().optional(),
    })
        .optional(),
});
// ============= Merchant Config Schema =============
exports.MerchantConfigSchema = zod_1.z.object({
    brandName: zod_1.z.string().optional(),
    tone: zod_1.z.enum(["friendly", "formal", "casual"]).default("friendly"),
    welcomeMessage: zod_1.z.string().optional(),
    currency: zod_1.z.string().default("EGP"),
    language: zod_1.z.string().default("ar-EG"),
    timezone: zod_1.z.string().default("Africa/Cairo"),
    enableNegotiation: zod_1.z.boolean().default(true),
    enableSubstitution: zod_1.z.boolean().default(false),
    followupEnabled: zod_1.z.boolean().default(true),
    followupIntervalMinutes: zod_1.z.number().int().positive().default(60),
    maxFollowups: zod_1.z.number().int().positive().default(3),
});
// ============= Branding Schema =============
exports.BrandingSchema = zod_1.z.object({
    logoUrl: zod_1.z.string().url().optional(),
    primaryColor: zod_1.z.string().optional(),
    tagline: zod_1.z.string().optional(),
});
// ============= Extracted Entities (from LLM) =============
exports.ExtractedProductSchema = zod_1.z.object({
    name: zod_1.z.string(),
    quantity: zod_1.z.number().int().positive().optional(),
    size: zod_1.z.string().optional(),
    color: zod_1.z.string().optional(),
    options: zod_1.z.array(zod_1.z.string()).optional(),
    notes: zod_1.z.string().optional(),
});
exports.ExtractedAddressSchema = zod_1.z.object({
    city: zod_1.z.string().optional(),
    area: zod_1.z.string().optional(),
    street: zod_1.z.string().optional(),
    building: zod_1.z.string().optional(),
    floor: zod_1.z.string().optional(),
    apartment: zod_1.z.string().optional(),
    landmark: zod_1.z.string().optional(),
    raw_text: zod_1.z.string().optional(),
});
exports.ExtractedEntitiesSchema = zod_1.z.object({
    products: zod_1.z.array(exports.ExtractedProductSchema).optional(),
    customerName: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    address: exports.ExtractedAddressSchema.optional(),
    substitutionAllowed: zod_1.z.boolean().optional(),
    deliveryPreference: zod_1.z.string().optional(),
});
// ============= Negotiation Response =============
exports.NegotiationResponseSchema = zod_1.z.object({
    requestedDiscount: zod_1.z.number().optional(),
    approved: zod_1.z.boolean(),
    offerText: zod_1.z.string().optional(),
    finalPrices: zod_1.z
        .array(zod_1.z.object({
        productName: zod_1.z.string(),
        originalPrice: zod_1.z.number(),
        finalPrice: zod_1.z.number(),
    }))
        .optional(),
});
// ============= LLM Response Schema (Structured Output) =============
exports.LlmResponseSchema = zod_1.z.object({
    actionType: zod_1.z.nativeEnum(enums_1.ActionType),
    reply_ar: zod_1.z.string(),
    extracted_entities: exports.ExtractedEntitiesSchema.optional(),
    missing_slots: zod_1.z.array(zod_1.z.string()).optional(),
    negotiation: exports.NegotiationResponseSchema.optional(),
    confidence: zod_1.z.number().min(0).max(1),
    reasoning: zod_1.z.string().optional(),
});
// ============= Inbox Message Schema =============
exports.InboxMessageSchema = zod_1.z.object({
    merchantId: zod_1.z.string().min(1, "merchantId is required"),
    conversationId: zod_1.z.string().min(1, "conversationId is required"),
    senderId: zod_1.z.string().min(1, "senderId is required"),
    providerMessageId: zod_1.z.string().min(1, "providerMessageId is required"),
    timestamp: zod_1.z.string().datetime(),
    text: zod_1.z.string().min(1, "text is required"),
    attachments: zod_1.z
        .array(zod_1.z.object({
        type: zod_1.z.string(),
        url: zod_1.z.string().url(),
    }))
        .default([]),
});
// ============= Inbox Response Schema =============
exports.InboxResponseSchema = zod_1.z.object({
    conversationId: zod_1.z.string(),
    reply: zod_1.z.string(),
    actionType: zod_1.z.nativeEnum(enums_1.ActionType),
    state: zod_1.z.object({
        missingSlots: zod_1.z.array(zod_1.z.string()),
        cartSummary: zod_1.z.string(),
        addressMissingFields: zod_1.z.array(zod_1.z.string()),
    }),
    debug: zod_1.z.object({
        correlationId: zod_1.z.string(),
        confidence: zod_1.z.number(),
        tokenBudgetRemaining: zod_1.z.number(),
        llmUsed: zod_1.z.boolean(),
    }),
});
// ============= Merchant Upsert Schema =============
exports.MerchantUpsertSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    category: zod_1.z.nativeEnum(enums_1.MerchantCategory).default(enums_1.MerchantCategory.GENERIC),
    config: exports.MerchantConfigSchema.optional(),
    branding: exports.BrandingSchema.optional(),
    negotiationRules: exports.NegotiationRulesSchema.optional(),
    deliveryRules: exports.DeliveryRulesSchema.optional(),
    dailyTokenBudget: zod_1.z.number().int().positive().default(100000),
});
// ============= Catalog Upsert Schema =============
exports.CatalogItemUpsertSchema = zod_1.z.object({
    merchantId: zod_1.z.string().min(1),
    sku: zod_1.z.string().optional(),
    nameAr: zod_1.z.string().min(1),
    nameEn: zod_1.z.string().optional(),
    descriptionAr: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
    basePrice: zod_1.z.number().positive(),
    minPrice: zod_1.z.number().positive().optional(),
    variants: zod_1.z
        .array(zod_1.z.object({
        name: zod_1.z.string(),
        values: zod_1.z.array(zod_1.z.string()),
        priceModifier: zod_1.z.number().optional(),
    }))
        .optional(),
    options: zod_1.z
        .array(zod_1.z.object({
        name: zod_1.z.string(),
        price: zod_1.z.number().optional(),
    }))
        .optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    isAvailable: zod_1.z.boolean().default(true),
});
// ============= Event Schemas =============
exports.DomainEventSchema = zod_1.z.object({
    eventType: zod_1.z.string(),
    aggregateType: zod_1.z.string(),
    aggregateId: zod_1.z.string(),
    merchantId: zod_1.z.string().optional(),
    payload: zod_1.z.record(zod_1.z.unknown()),
    correlationId: zod_1.z.string().optional(),
});
