import { z } from "zod";

// ============================================================================
// Merchant Category
// ============================================================================
export const MerchantCategorySchema = z.enum([
  "CLOTHES",
  "FOOD",
  "SUPERMARKET",
  "GENERIC",
]);
export type MerchantCategory = z.infer<typeof MerchantCategorySchema>;

// ============================================================================
// Conversation State
// ============================================================================
export const ConversationStateSchema = z.enum([
  "GREETING",
  "COLLECTING_ITEMS",
  "COLLECTING_VARIANTS",
  "COLLECTING_CUSTOMER_INFO",
  "COLLECTING_ADDRESS",
  "NEGOTIATING",
  "CONFIRMING_ORDER",
  "ORDER_PLACED",
  "TRACKING",
  "FOLLOWUP",
  "CLOSED",
]);
export type ConversationState = z.infer<typeof ConversationStateSchema>;

// ============================================================================
// Order Status
// ============================================================================
export const OrderStatusSchema = z.enum([
  "DRAFT",
  "CONFIRMED",
  "BOOKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

// ============================================================================
// Message Direction
// ============================================================================
export const MessageDirectionSchema = z.enum(["INBOUND", "OUTBOUND"]);
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;

// ============================================================================
// Message Status
// ============================================================================
export const MessageStatusSchema = z.enum([
  "QUEUED",
  "SENT",
  "DELIVERED",
  "FAILED",
]);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

// ============================================================================
// Event Status
// ============================================================================
export const EventStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);
export type EventStatus = z.infer<typeof EventStatusSchema>;

// ============================================================================
// DLQ Status
// ============================================================================
export const DlqStatusSchema = z.enum([
  "PENDING",
  "RETRYING",
  "RESOLVED",
  "EXHAUSTED",
]);
export type DlqStatus = z.infer<typeof DlqStatusSchema>;

// ============================================================================
// Agent Task Status
// ============================================================================
export const AgentTaskStatusSchema = z.enum([
  "PENDING",
  "ASSIGNED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;

// ============================================================================
// Address Schema
// ============================================================================
export const AddressSchema = z.object({
  city: z.string().optional(),
  area: z.string().optional(),
  street: z.string().optional(),
  building: z.string().optional(),
  floor: z.string().optional(),
  apartment: z.string().optional(),
  landmark: z.string().optional(),
  notes: z.string().optional(),
  raw_text: z.string(),
  map_url: z.string().optional(),
  coordinates: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  confidence: z.number().min(0).max(1).default(0),
  missing_fields: z.array(z.string()).default([]),
});
export type Address = z.infer<typeof AddressSchema>;

// ============================================================================
// Cart Item Schema
// ============================================================================
export const CartItemSchema = z.object({
  id: z.string().optional(),
  catalogItemId: z.string().optional(),
  name: z.string(),
  nameAr: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().positive(),
  totalPrice: z.number().positive(),
  variants: z.record(z.string()).optional(),
  options: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

// ============================================================================
// Cart Schema
// ============================================================================
export const CartSchema = z.object({
  items: z.array(CartItemSchema).default([]),
  subtotal: z.number().default(0),
  discount: z.number().default(0),
  discountPercent: z.number().optional(),
  discountReason: z.string().optional(),
  deliveryFee: z.number().default(0),
  total: z.number().default(0),
});
export type Cart = z.infer<typeof CartSchema>;

// ============================================================================
// Collected Info Schema
// ============================================================================
export const CollectedInfoSchema = z.object({
  customerName: z.string().optional(),
  phone: z.string().optional(),
  address: AddressSchema.optional(),
  deliveryPreference: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  substitutionAllowed: z.boolean().optional(),
  pendingReorder: z.boolean().optional(),
  reorderDetails: z.record(z.unknown()).optional(),
});
export type CollectedInfo = z.infer<typeof CollectedInfoSchema>;

// ============================================================================
// Merchant Schema
// ============================================================================
export const MerchantSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: MerchantCategorySchema,
  whatsappNumber: z.string().optional(),
  apiKeyHash: z.string().optional(),
  config: z.record(z.unknown()).default({}),
  branding: z
    .object({
      botName: z.string().optional(),
      welcomeMessage: z.string().optional(),
      logoUrl: z.string().optional(),
    })
    .default({}),
  negotiationRules: z
    .object({
      enabled: z.boolean().default(false),
      maxDiscountPercent: z.number().default(0),
      minOrderForDiscount: z.number().default(0),
      autoApproveBelow: z.number().default(0),
    })
    .default({}),
  deliveryRules: z
    .object({
      defaultFee: z.number().default(0),
      freeDeliveryMinimum: z.number().optional(),
      zones: z
        .array(
          z.object({
            name: z.string(),
            fee: z.number(),
          }),
        )
        .default([]),
    })
    .default({}),
  dailyTokenBudget: z.number().default(100000),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Merchant = z.infer<typeof MerchantSchema>;

// ============================================================================
// Customer Schema
// ============================================================================
export const CustomerSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  senderId: z.string(),
  phone: z.string().optional(),
  name: z.string().optional(),
  address: AddressSchema.optional(),
  preferences: z.record(z.unknown()).default({}),
  totalOrders: z.number().default(0),
  lastInteractionAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Customer = z.infer<typeof CustomerSchema>;

// ============================================================================
// Conversation Schema
// ============================================================================
export const ConversationSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  customerId: z.string().optional(),
  senderId: z.string(),
  state: ConversationStateSchema,
  context: z.record(z.unknown()).default({}),
  cart: CartSchema.default({
    items: [],
    subtotal: 0,
    discount: 0,
    deliveryFee: 0,
    total: 0,
  }),
  collectedInfo: CollectedInfoSchema.default({}),
  conversationSummary: z.string().optional(),
  missingSlots: z.array(z.string()).default([]),
  lastMessageAt: z.date().optional(),
  isHumanTakeover: z.boolean().default(false),
  takenOverBy: z.string().optional(),
  takenOverAt: z.date().optional(),
  followupCount: z.number().default(0),
  nextFollowupAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

// ============================================================================
// Message Schema
// ============================================================================
export const AttachmentSchema = z.object({
  type: z.enum(["image", "audio", "video", "document", "location"]),
  url: z.string().optional(),
  mimeType: z.string().optional(),
  filename: z.string().optional(),
  caption: z.string().optional(),
  transcript: z.string().optional(),
  coordinates: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  merchantId: z.string(),
  providerMessageId: z.string().optional(),
  direction: MessageDirectionSchema,
  status: MessageStatusSchema.default("QUEUED"),
  senderId: z.string(),
  text: z.string().optional(),
  attachments: z.array(AttachmentSchema).default([]),
  metadata: z.record(z.unknown()).default({}),
  llmUsed: z.boolean().default(false),
  tokensUsed: z.number().default(0),
  sentAt: z.date().optional(),
  deliveredAt: z.date().optional(),
  failedAt: z.date().optional(),
  retryCount: z.number().default(0),
  lastError: z.string().optional(),
  createdAt: z.date(),
});
export type Message = z.infer<typeof MessageSchema>;

// ============================================================================
// Order Schema
// ============================================================================
export const OrderSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  conversationId: z.string(),
  customerId: z.string().optional(),
  orderNumber: z.string(),
  status: OrderStatusSchema,
  items: z.array(CartItemSchema),
  subtotal: z.number(),
  discount: z.number().default(0),
  deliveryFee: z.number().default(0),
  total: z.number(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  deliveryAddress: AddressSchema.optional(),
  deliveryNotes: z.string().optional(),
  deliveryPreference: z.string().optional(),
  idempotencyKey: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Order = z.infer<typeof OrderSchema>;

// ============================================================================
// Catalog Item Schema
// ============================================================================
export const CatalogItemVariantSchema = z.object({
  name: z.string(),
  nameAr: z.string().optional(),
  options: z.array(
    z.object({
      value: z.string(),
      valueAr: z.string().optional(),
      priceModifier: z.number().default(0),
      available: z.boolean().default(true),
    }),
  ),
});
export type CatalogItemVariant = z.infer<typeof CatalogItemVariantSchema>;

export const CatalogItemOptionSchema = z.object({
  name: z.string(),
  nameAr: z.string().optional(),
  price: z.number().default(0),
  available: z.boolean().default(true),
  category: z.string().optional(),
});
export type CatalogItemOption = z.infer<typeof CatalogItemOptionSchema>;

export const CatalogItemSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  sku: z.string().optional(),
  nameAr: z.string(),
  nameEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  category: z.string().optional(),
  basePrice: z.number(),
  minPrice: z.number().optional(),
  variants: z.array(CatalogItemVariantSchema).default([]),
  options: z.array(CatalogItemOptionSchema).default([]),
  tags: z.array(z.string()).default([]),
  stock: z.number().optional(),
  isAvailable: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

// ============================================================================
// Token Usage Schema
// ============================================================================
export const TokenUsageSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  usageDate: z.string(),
  tokensUsed: z.number().default(0),
  llmCalls: z.number().default(0),
  budget: z.number(),
  remaining: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

// ============================================================================
// Daily Report Schema
// ============================================================================
export const DailyReportSummarySchema = z.object({
  totalOrders: z.number(),
  deliveredOrders: z.number(),
  failedOrders: z.number(),
  cancelledOrders: z.number(),
  totalRevenue: z.number(),
  totalItems: z.number(),
  averageOrderValue: z.number(),
  newCustomers: z.number(),
  returningCustomers: z.number(),
  messagesProcessed: z.number(),
  tokensUsed: z.number(),
  humanTakeovers: z.number(),
  pendingFollowups: z.number(),
  topProducts: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      revenue: z.number(),
    }),
  ),
});
export type DailyReportSummary = z.infer<typeof DailyReportSummarySchema>;

export const DailyReportSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  reportDate: z.string(),
  summary: DailyReportSummarySchema,
  createdAt: z.date(),
});
export type DailyReport = z.infer<typeof DailyReportSchema>;

// ============================================================================
// Notification Schema
// ============================================================================
export const NotificationTypeSchema = z.enum([
  "DAILY_REPORT",
  "ORDER_ALERT",
  "LOW_STOCK",
  "TOKEN_BUDGET_WARNING",
  "ESCALATION",
  "FOLLOWUP_REMINDER",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  message: z.string(),
  data: z.record(z.unknown()).optional(),
  isRead: z.boolean().default(false),
  createdAt: z.date(),
  readAt: z.date().optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;

// ============================================================================
// Followup Schema
// ============================================================================
export const FollowupStatusSchema = z.enum([
  "PENDING",
  "SENT",
  "CANCELLED",
  "EXPIRED",
]);
export type FollowupStatus = z.infer<typeof FollowupStatusSchema>;

export const FollowupSchema = z.object({
  id: z.string(),
  merchantId: z.string(),
  conversationId: z.string(),
  orderId: z.string().optional(),
  type: z.string(),
  scheduledAt: z.date(),
  status: FollowupStatusSchema,
  message: z.string().optional(),
  sentAt: z.date().optional(),
  cancelledAt: z.date().optional(),
  createdAt: z.date(),
});
export type Followup = z.infer<typeof FollowupSchema>;

// ============================================================================
// Known Area Schema
// ============================================================================
export const KnownAreaSchema = z.object({
  id: z.string(),
  city: z.string(),
  areaNameAr: z.string(),
  areaNameEn: z.string().optional(),
  areaAliases: z.array(z.string()).default([]),
  deliveryZone: z.string().optional(),
  createdAt: z.date(),
});
export type KnownArea = z.infer<typeof KnownAreaSchema>;
