import { z } from "zod";
import {
  ActionType,
  MerchantCategory,
  ConversationState,
  OrderStatus,
} from "../constants/enums";

// Re-export enums for convenience
export { ActionType, MerchantCategory, ConversationState, OrderStatus };

// ============= Address Schema =============
export const AddressSchema = z.object({
  city: z.string().optional(),
  area: z.string().optional(),
  street: z.string().optional(),
  building: z.string().optional(),
  floor: z.string().optional(),
  apartment: z.string().optional(),
  landmark: z.string().optional(),
  delivery_notes: z.string().optional(),
  raw_text: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0),
  missing_fields: z.array(z.string()).default([]),
});
export type Address = z.infer<typeof AddressSchema>;

// ============= Cart Item Schema =============
export const CartItemSchema = z.object({
  productId: z.string().optional(),
  sku: z.string().optional(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  variant: z.record(z.string()).optional(),
  options: z.array(z.string()).optional(),
  notes: z.string().optional(),
  lineTotal: z.number().positive(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

// ============= Cart Schema =============
export const CartSchema = z.object({
  items: z.array(CartItemSchema).default([]),
  subtotal: z.number().default(0),
  discount: z.number().default(0),
  discountPercent: z.number().optional(),
  deliveryFee: z.number().default(0),
  total: z.number().default(0),
});
export type Cart = z.infer<typeof CartSchema>;

// ============= Collected Info Schema =============
export const CollectedInfoSchema = z.object({
  customerName: z.string().optional(),
  phone: z.string().optional(),
  address: AddressSchema.optional(),
  substitutionAllowed: z.boolean().optional(),
  deliveryPreference: z.string().optional(),
  deliveryDate: z.string().optional(),
});
export type CollectedInfo = z.infer<typeof CollectedInfoSchema>;

// ============= Negotiation Rules Schema =============
export const NegotiationRulesSchema = z.object({
  maxDiscountPercent: z.number().min(0).max(100).default(10),
  minMarginPercent: z.number().min(0).max(100).default(20),
  freeDeliveryThreshold: z.number().optional(),
  bundleDiscounts: z
    .array(
      z.object({
        minItems: z.number().int().positive(),
        discountPercent: z.number().min(0).max(100),
      }),
    )
    .optional(),
  allowNegotiation: z.boolean().default(true),
  // Active promotion/offer
  activePromotion: z
    .object({
      enabled: z.boolean().default(false),
      discountPercent: z.number().min(0).max(100),
      description: z.string(), // e.g., "خصم 10% على كل المنتجات"
      validUntil: z.string().optional(), // ISO date
    })
    .optional(),
});
export type NegotiationRules = z.infer<typeof NegotiationRulesSchema>;

// ============= Delivery Rules Schema =============
export const DeliveryRulesSchema = z.object({
  defaultFee: z.number().default(50),
  freeDeliveryThreshold: z.number().optional(),
  deliveryZones: z
    .array(
      z.object({
        zone: z.string(),
        fee: z.number(),
        estimatedDays: z.number().int().positive(),
      }),
    )
    .optional(),
  workingHours: z
    .object({
      start: z.string().optional(),
      end: z.string().optional(),
    })
    .optional(),
});
export type DeliveryRules = z.infer<typeof DeliveryRulesSchema>;

// ============= Merchant Config Schema =============
export const MerchantConfigSchema = z.object({
  brandName: z.string().optional(),
  tone: z.enum(["friendly", "formal", "casual"]).default("friendly"),
  welcomeMessage: z.string().optional(),
  currency: z.string().default("EGP"),
  language: z.string().default("ar-EG"),
  timezone: z.string().default("Africa/Cairo"),
  enableNegotiation: z.boolean().default(true),
  enableSubstitution: z.boolean().default(false),
  followupEnabled: z.boolean().default(true),
  followupIntervalMinutes: z.number().int().positive().default(60),
  maxFollowups: z.number().int().positive().default(3),
});
export type MerchantConfig = z.infer<typeof MerchantConfigSchema>;

// ============= Branding Schema =============
export const BrandingSchema = z.object({
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().optional(),
  tagline: z.string().optional(),
});
export type Branding = z.infer<typeof BrandingSchema>;

// ============= Extracted Entities (from LLM) =============
export const ExtractedProductSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  options: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type ExtractedProduct = z.infer<typeof ExtractedProductSchema>;

export const ExtractedAddressSchema = z.object({
  city: z.string().optional(),
  area: z.string().optional(),
  street: z.string().optional(),
  building: z.string().optional(),
  floor: z.string().optional(),
  apartment: z.string().optional(),
  landmark: z.string().optional(),
  raw_text: z.string().optional(),
});
export type ExtractedAddress = z.infer<typeof ExtractedAddressSchema>;

export const ExtractedEntitiesSchema = z.object({
  products: z.array(ExtractedProductSchema).optional(),
  customerName: z.string().optional(),
  phone: z.string().optional(),
  address: ExtractedAddressSchema.optional(),
  substitutionAllowed: z.boolean().optional(),
  deliveryPreference: z.string().optional(),
});
export type ExtractedEntities = z.infer<typeof ExtractedEntitiesSchema>;

// ============= Negotiation Response =============
export const NegotiationResponseSchema = z.object({
  requestedDiscount: z.number().optional(),
  approved: z.boolean(),
  offerText: z.string().optional(),
  finalPrices: z
    .array(
      z.object({
        productName: z.string(),
        originalPrice: z.number(),
        finalPrice: z.number(),
      }),
    )
    .optional(),
});
export type NegotiationResponse = z.infer<typeof NegotiationResponseSchema>;

// ============= LLM Response Schema (Structured Output) =============
export const LlmResponseSchema = z.object({
  actionType: z.nativeEnum(ActionType),
  reply_ar: z.string(),
  extracted_entities: ExtractedEntitiesSchema.optional(),
  missing_slots: z.array(z.string()).optional(),
  negotiation: NegotiationResponseSchema.optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});
export type LlmResponse = z.infer<typeof LlmResponseSchema>;

// ============= Inbox Message Schema =============
export const InboxMessageSchema = z.object({
  merchantId: z.string().min(1, "merchantId is required"),
  conversationId: z.string().min(1, "conversationId is required"),
  senderId: z.string().min(1, "senderId is required"),
  providerMessageId: z.string().min(1, "providerMessageId is required"),
  timestamp: z.string().datetime(),
  text: z.string().min(1, "text is required"),
  attachments: z
    .array(
      z.object({
        type: z.string(),
        url: z.string().url(),
      }),
    )
    .default([]),
});
export type InboxMessage = z.infer<typeof InboxMessageSchema>;

// ============= Inbox Response Schema =============
export const InboxResponseSchema = z.object({
  conversationId: z.string(),
  reply: z.string(),
  actionType: z.nativeEnum(ActionType),
  state: z.object({
    missingSlots: z.array(z.string()),
    cartSummary: z.string(),
    addressMissingFields: z.array(z.string()),
  }),
  debug: z.object({
    correlationId: z.string(),
    confidence: z.number(),
    tokenBudgetRemaining: z.number(),
    llmUsed: z.boolean(),
  }),
});
export type InboxResponse = z.infer<typeof InboxResponseSchema>;

// ============= Merchant Upsert Schema =============
export const MerchantUpsertSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.nativeEnum(MerchantCategory).default(MerchantCategory.GENERIC),
  config: MerchantConfigSchema.optional(),
  branding: BrandingSchema.optional(),
  negotiationRules: NegotiationRulesSchema.optional(),
  deliveryRules: DeliveryRulesSchema.optional(),
  dailyTokenBudget: z.number().int().positive().default(100000),
});
export type MerchantUpsert = z.infer<typeof MerchantUpsertSchema>;

// ============= Catalog Upsert Schema =============
export const CatalogItemUpsertSchema = z.object({
  merchantId: z.string().min(1),
  sku: z.string().optional(),
  nameAr: z.string().min(1),
  nameEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  category: z.string().optional(),
  basePrice: z.number().positive(),
  minPrice: z.number().positive().optional(),
  variants: z
    .array(
      z.object({
        name: z.string(),
        values: z.array(z.string()),
        priceModifier: z.number().optional(),
      }),
    )
    .optional(),
  options: z
    .array(
      z.object({
        name: z.string(),
        price: z.number().optional(),
      }),
    )
    .optional(),
  tags: z.array(z.string()).optional(),
  isAvailable: z.boolean().default(true),
});
export type CatalogItemUpsert = z.infer<typeof CatalogItemUpsertSchema>;

// ============= Event Schemas =============
export const DomainEventSchema = z.object({
  eventType: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  merchantId: z.string().optional(),
  payload: z.record(z.unknown()),
  correlationId: z.string().optional(),
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;
