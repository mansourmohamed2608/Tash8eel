import { z } from "zod";
import { ActionType, MerchantCategory, ConversationState, OrderStatus } from "../constants/enums";
export { ActionType, MerchantCategory, ConversationState, OrderStatus };
export declare const AddressSchema: z.ZodObject<{
    city: z.ZodOptional<z.ZodString>;
    area: z.ZodOptional<z.ZodString>;
    street: z.ZodOptional<z.ZodString>;
    building: z.ZodOptional<z.ZodString>;
    floor: z.ZodOptional<z.ZodString>;
    apartment: z.ZodOptional<z.ZodString>;
    landmark: z.ZodOptional<z.ZodString>;
    delivery_notes: z.ZodOptional<z.ZodString>;
    raw_text: z.ZodOptional<z.ZodString>;
    confidence: z.ZodDefault<z.ZodNumber>;
    missing_fields: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    missing_fields: string[];
    city?: string | undefined;
    area?: string | undefined;
    street?: string | undefined;
    building?: string | undefined;
    landmark?: string | undefined;
    floor?: string | undefined;
    apartment?: string | undefined;
    raw_text?: string | undefined;
    delivery_notes?: string | undefined;
}, {
    city?: string | undefined;
    area?: string | undefined;
    street?: string | undefined;
    building?: string | undefined;
    confidence?: number | undefined;
    landmark?: string | undefined;
    floor?: string | undefined;
    apartment?: string | undefined;
    raw_text?: string | undefined;
    delivery_notes?: string | undefined;
    missing_fields?: string[] | undefined;
}>;
export type Address = z.infer<typeof AddressSchema>;
export declare const CartItemSchema: z.ZodObject<{
    productId: z.ZodOptional<z.ZodString>;
    sku: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    quantity: z.ZodNumber;
    unitPrice: z.ZodNumber;
    variant: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    notes: z.ZodOptional<z.ZodString>;
    lineTotal: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    quantity: number;
    name: string;
    unitPrice: number;
    lineTotal: number;
    options?: string[] | undefined;
    sku?: string | undefined;
    notes?: string | undefined;
    variant?: Record<string, string> | undefined;
    productId?: string | undefined;
}, {
    quantity: number;
    name: string;
    unitPrice: number;
    lineTotal: number;
    options?: string[] | undefined;
    sku?: string | undefined;
    notes?: string | undefined;
    variant?: Record<string, string> | undefined;
    productId?: string | undefined;
}>;
export type CartItem = z.infer<typeof CartItemSchema>;
export declare const CartSchema: z.ZodObject<{
    items: z.ZodDefault<z.ZodArray<z.ZodObject<{
        productId: z.ZodOptional<z.ZodString>;
        sku: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
        variant: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        notes: z.ZodOptional<z.ZodString>;
        lineTotal: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        name: string;
        unitPrice: number;
        lineTotal: number;
        options?: string[] | undefined;
        sku?: string | undefined;
        notes?: string | undefined;
        variant?: Record<string, string> | undefined;
        productId?: string | undefined;
    }, {
        quantity: number;
        name: string;
        unitPrice: number;
        lineTotal: number;
        options?: string[] | undefined;
        sku?: string | undefined;
        notes?: string | undefined;
        variant?: Record<string, string> | undefined;
        productId?: string | undefined;
    }>, "many">>;
    subtotal: z.ZodDefault<z.ZodNumber>;
    discount: z.ZodDefault<z.ZodNumber>;
    discountPercent: z.ZodOptional<z.ZodNumber>;
    deliveryFee: z.ZodDefault<z.ZodNumber>;
    total: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    items: {
        quantity: number;
        name: string;
        unitPrice: number;
        lineTotal: number;
        options?: string[] | undefined;
        sku?: string | undefined;
        notes?: string | undefined;
        variant?: Record<string, string> | undefined;
        productId?: string | undefined;
    }[];
    total: number;
    subtotal: number;
    discount: number;
    deliveryFee: number;
    discountPercent?: number | undefined;
}, {
    items?: {
        quantity: number;
        name: string;
        unitPrice: number;
        lineTotal: number;
        options?: string[] | undefined;
        sku?: string | undefined;
        notes?: string | undefined;
        variant?: Record<string, string> | undefined;
        productId?: string | undefined;
    }[] | undefined;
    total?: number | undefined;
    subtotal?: number | undefined;
    discount?: number | undefined;
    deliveryFee?: number | undefined;
    discountPercent?: number | undefined;
}>;
export type Cart = z.infer<typeof CartSchema>;
export declare const CollectedInfoSchema: z.ZodObject<{
    customerName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodObject<{
        city: z.ZodOptional<z.ZodString>;
        area: z.ZodOptional<z.ZodString>;
        street: z.ZodOptional<z.ZodString>;
        building: z.ZodOptional<z.ZodString>;
        floor: z.ZodOptional<z.ZodString>;
        apartment: z.ZodOptional<z.ZodString>;
        landmark: z.ZodOptional<z.ZodString>;
        delivery_notes: z.ZodOptional<z.ZodString>;
        raw_text: z.ZodOptional<z.ZodString>;
        confidence: z.ZodDefault<z.ZodNumber>;
        missing_fields: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        confidence: number;
        missing_fields: string[];
        city?: string | undefined;
        area?: string | undefined;
        street?: string | undefined;
        building?: string | undefined;
        landmark?: string | undefined;
        floor?: string | undefined;
        apartment?: string | undefined;
        raw_text?: string | undefined;
        delivery_notes?: string | undefined;
    }, {
        city?: string | undefined;
        area?: string | undefined;
        street?: string | undefined;
        building?: string | undefined;
        confidence?: number | undefined;
        landmark?: string | undefined;
        floor?: string | undefined;
        apartment?: string | undefined;
        raw_text?: string | undefined;
        delivery_notes?: string | undefined;
        missing_fields?: string[] | undefined;
    }>>;
    substitutionAllowed: z.ZodOptional<z.ZodBoolean>;
    deliveryPreference: z.ZodOptional<z.ZodString>;
    deliveryDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    customerName?: string | undefined;
    phone?: string | undefined;
    address?: {
        confidence: number;
        missing_fields: string[];
        city?: string | undefined;
        area?: string | undefined;
        street?: string | undefined;
        building?: string | undefined;
        landmark?: string | undefined;
        floor?: string | undefined;
        apartment?: string | undefined;
        raw_text?: string | undefined;
        delivery_notes?: string | undefined;
    } | undefined;
    deliveryDate?: string | undefined;
    substitutionAllowed?: boolean | undefined;
    deliveryPreference?: string | undefined;
}, {
    customerName?: string | undefined;
    phone?: string | undefined;
    address?: {
        city?: string | undefined;
        area?: string | undefined;
        street?: string | undefined;
        building?: string | undefined;
        confidence?: number | undefined;
        landmark?: string | undefined;
        floor?: string | undefined;
        apartment?: string | undefined;
        raw_text?: string | undefined;
        delivery_notes?: string | undefined;
        missing_fields?: string[] | undefined;
    } | undefined;
    deliveryDate?: string | undefined;
    substitutionAllowed?: boolean | undefined;
    deliveryPreference?: string | undefined;
}>;
export type CollectedInfo = z.infer<typeof CollectedInfoSchema>;
export declare const NegotiationRulesSchema: z.ZodObject<{
    maxDiscountPercent: z.ZodDefault<z.ZodNumber>;
    minMarginPercent: z.ZodDefault<z.ZodNumber>;
    freeDeliveryThreshold: z.ZodOptional<z.ZodNumber>;
    bundleDiscounts: z.ZodOptional<z.ZodArray<z.ZodObject<{
        minItems: z.ZodNumber;
        discountPercent: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        discountPercent: number;
        minItems: number;
    }, {
        discountPercent: number;
        minItems: number;
    }>, "many">>;
    allowNegotiation: z.ZodDefault<z.ZodBoolean>;
    activePromotion: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        discountPercent: z.ZodNumber;
        description: z.ZodString;
        validUntil: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        description: string;
        discountPercent: number;
        validUntil?: string | undefined;
    }, {
        description: string;
        discountPercent: number;
        enabled?: boolean | undefined;
        validUntil?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    maxDiscountPercent: number;
    minMarginPercent: number;
    allowNegotiation: boolean;
    freeDeliveryThreshold?: number | undefined;
    bundleDiscounts?: {
        discountPercent: number;
        minItems: number;
    }[] | undefined;
    activePromotion?: {
        enabled: boolean;
        description: string;
        discountPercent: number;
        validUntil?: string | undefined;
    } | undefined;
}, {
    maxDiscountPercent?: number | undefined;
    minMarginPercent?: number | undefined;
    freeDeliveryThreshold?: number | undefined;
    bundleDiscounts?: {
        discountPercent: number;
        minItems: number;
    }[] | undefined;
    allowNegotiation?: boolean | undefined;
    activePromotion?: {
        description: string;
        discountPercent: number;
        enabled?: boolean | undefined;
        validUntil?: string | undefined;
    } | undefined;
}>;
export type NegotiationRules = z.infer<typeof NegotiationRulesSchema>;
export declare const DeliveryRulesSchema: z.ZodObject<{
    defaultFee: z.ZodDefault<z.ZodNumber>;
    freeDeliveryThreshold: z.ZodOptional<z.ZodNumber>;
    deliveryZones: z.ZodOptional<z.ZodArray<z.ZodObject<{
        zone: z.ZodString;
        fee: z.ZodNumber;
        estimatedDays: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        zone: string;
        fee: number;
        estimatedDays: number;
    }, {
        zone: string;
        fee: number;
        estimatedDays: number;
    }>, "many">>;
    workingHours: z.ZodOptional<z.ZodObject<{
        start: z.ZodOptional<z.ZodString>;
        end: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        start?: string | undefined;
        end?: string | undefined;
    }, {
        start?: string | undefined;
        end?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    defaultFee: number;
    freeDeliveryThreshold?: number | undefined;
    workingHours?: {
        start?: string | undefined;
        end?: string | undefined;
    } | undefined;
    deliveryZones?: {
        zone: string;
        fee: number;
        estimatedDays: number;
    }[] | undefined;
}, {
    freeDeliveryThreshold?: number | undefined;
    workingHours?: {
        start?: string | undefined;
        end?: string | undefined;
    } | undefined;
    defaultFee?: number | undefined;
    deliveryZones?: {
        zone: string;
        fee: number;
        estimatedDays: number;
    }[] | undefined;
}>;
export type DeliveryRules = z.infer<typeof DeliveryRulesSchema>;
export declare const MerchantConfigSchema: z.ZodObject<{
    brandName: z.ZodOptional<z.ZodString>;
    tone: z.ZodDefault<z.ZodEnum<["friendly", "formal", "casual"]>>;
    welcomeMessage: z.ZodOptional<z.ZodString>;
    currency: z.ZodDefault<z.ZodString>;
    language: z.ZodDefault<z.ZodString>;
    timezone: z.ZodDefault<z.ZodString>;
    enableNegotiation: z.ZodDefault<z.ZodBoolean>;
    enableSubstitution: z.ZodDefault<z.ZodBoolean>;
    followupEnabled: z.ZodDefault<z.ZodBoolean>;
    followupIntervalMinutes: z.ZodDefault<z.ZodNumber>;
    maxFollowups: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    language: string;
    currency: string;
    tone: "friendly" | "formal" | "casual";
    timezone: string;
    enableNegotiation: boolean;
    enableSubstitution: boolean;
    followupEnabled: boolean;
    followupIntervalMinutes: number;
    maxFollowups: number;
    brandName?: string | undefined;
    welcomeMessage?: string | undefined;
}, {
    language?: string | undefined;
    currency?: string | undefined;
    brandName?: string | undefined;
    tone?: "friendly" | "formal" | "casual" | undefined;
    welcomeMessage?: string | undefined;
    timezone?: string | undefined;
    enableNegotiation?: boolean | undefined;
    enableSubstitution?: boolean | undefined;
    followupEnabled?: boolean | undefined;
    followupIntervalMinutes?: number | undefined;
    maxFollowups?: number | undefined;
}>;
export type MerchantConfig = z.infer<typeof MerchantConfigSchema>;
export declare const BrandingSchema: z.ZodObject<{
    logoUrl: z.ZodOptional<z.ZodString>;
    primaryColor: z.ZodOptional<z.ZodString>;
    tagline: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    logoUrl?: string | undefined;
    primaryColor?: string | undefined;
    tagline?: string | undefined;
}, {
    logoUrl?: string | undefined;
    primaryColor?: string | undefined;
    tagline?: string | undefined;
}>;
export type Branding = z.infer<typeof BrandingSchema>;
export declare const ExtractedProductSchema: z.ZodObject<{
    name: z.ZodString;
    quantity: z.ZodOptional<z.ZodNumber>;
    size: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    size?: string | undefined;
    color?: string | undefined;
    quantity?: number | undefined;
    options?: string[] | undefined;
    notes?: string | undefined;
}, {
    name: string;
    size?: string | undefined;
    color?: string | undefined;
    quantity?: number | undefined;
    options?: string[] | undefined;
    notes?: string | undefined;
}>;
export type ExtractedProduct = z.infer<typeof ExtractedProductSchema>;
export declare const ExtractedAddressSchema: z.ZodObject<{
    city: z.ZodOptional<z.ZodString>;
    area: z.ZodOptional<z.ZodString>;
    street: z.ZodOptional<z.ZodString>;
    building: z.ZodOptional<z.ZodString>;
    floor: z.ZodOptional<z.ZodString>;
    apartment: z.ZodOptional<z.ZodString>;
    landmark: z.ZodOptional<z.ZodString>;
    raw_text: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    city?: string | undefined;
    area?: string | undefined;
    street?: string | undefined;
    building?: string | undefined;
    landmark?: string | undefined;
    floor?: string | undefined;
    apartment?: string | undefined;
    raw_text?: string | undefined;
}, {
    city?: string | undefined;
    area?: string | undefined;
    street?: string | undefined;
    building?: string | undefined;
    landmark?: string | undefined;
    floor?: string | undefined;
    apartment?: string | undefined;
    raw_text?: string | undefined;
}>;
export type ExtractedAddress = z.infer<typeof ExtractedAddressSchema>;
export declare const ExtractedEntitiesSchema: z.ZodObject<{
    products: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        quantity: z.ZodOptional<z.ZodNumber>;
        size: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
        options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        notes: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        size?: string | undefined;
        color?: string | undefined;
        quantity?: number | undefined;
        options?: string[] | undefined;
        notes?: string | undefined;
    }, {
        name: string;
        size?: string | undefined;
        color?: string | undefined;
        quantity?: number | undefined;
        options?: string[] | undefined;
        notes?: string | undefined;
    }>, "many">>;
    customerName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodObject<{
        city: z.ZodOptional<z.ZodString>;
        area: z.ZodOptional<z.ZodString>;
        street: z.ZodOptional<z.ZodString>;
        building: z.ZodOptional<z.ZodString>;
        floor: z.ZodOptional<z.ZodString>;
        apartment: z.ZodOptional<z.ZodString>;
        landmark: z.ZodOptional<z.ZodString>;
        raw_text: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        city?: string | undefined;
        area?: string | undefined;
        street?: string | undefined;
        building?: string | undefined;
        landmark?: string | undefined;
        floor?: string | undefined;
        apartment?: string | undefined;
        raw_text?: string | undefined;
    }, {
        city?: string | undefined;
        area?: string | undefined;
        street?: string | undefined;
        building?: string | undefined;
        landmark?: string | undefined;
        floor?: string | undefined;
        apartment?: string | undefined;
        raw_text?: string | undefined;
    }>>;
    substitutionAllowed: z.ZodOptional<z.ZodBoolean>;
    deliveryPreference: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    customerName?: string | undefined;
    phone?: string | undefined;
    address?: {
        city?: string | undefined;
        area?: string | undefined;
        street?: string | undefined;
        building?: string | undefined;
        landmark?: string | undefined;
        floor?: string | undefined;
        apartment?: string | undefined;
        raw_text?: string | undefined;
    } | undefined;
    products?: {
        name: string;
        size?: string | undefined;
        color?: string | undefined;
        quantity?: number | undefined;
        options?: string[] | undefined;
        notes?: string | undefined;
    }[] | undefined;
    substitutionAllowed?: boolean | undefined;
    deliveryPreference?: string | undefined;
}, {
    customerName?: string | undefined;
    phone?: string | undefined;
    address?: {
        city?: string | undefined;
        area?: string | undefined;
        street?: string | undefined;
        building?: string | undefined;
        landmark?: string | undefined;
        floor?: string | undefined;
        apartment?: string | undefined;
        raw_text?: string | undefined;
    } | undefined;
    products?: {
        name: string;
        size?: string | undefined;
        color?: string | undefined;
        quantity?: number | undefined;
        options?: string[] | undefined;
        notes?: string | undefined;
    }[] | undefined;
    substitutionAllowed?: boolean | undefined;
    deliveryPreference?: string | undefined;
}>;
export type ExtractedEntities = z.infer<typeof ExtractedEntitiesSchema>;
export declare const NegotiationResponseSchema: z.ZodObject<{
    requestedDiscount: z.ZodOptional<z.ZodNumber>;
    approved: z.ZodBoolean;
    offerText: z.ZodOptional<z.ZodString>;
    finalPrices: z.ZodOptional<z.ZodArray<z.ZodObject<{
        productName: z.ZodString;
        originalPrice: z.ZodNumber;
        finalPrice: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        originalPrice: number;
        productName: string;
        finalPrice: number;
    }, {
        originalPrice: number;
        productName: string;
        finalPrice: number;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    approved: boolean;
    requestedDiscount?: number | undefined;
    offerText?: string | undefined;
    finalPrices?: {
        originalPrice: number;
        productName: string;
        finalPrice: number;
    }[] | undefined;
}, {
    approved: boolean;
    requestedDiscount?: number | undefined;
    offerText?: string | undefined;
    finalPrices?: {
        originalPrice: number;
        productName: string;
        finalPrice: number;
    }[] | undefined;
}>;
export type NegotiationResponse = z.infer<typeof NegotiationResponseSchema>;
export declare const LlmResponseSchema: z.ZodObject<{
    actionType: z.ZodNativeEnum<typeof ActionType>;
    reply_ar: z.ZodString;
    extracted_entities: z.ZodOptional<z.ZodObject<{
        products: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            quantity: z.ZodOptional<z.ZodNumber>;
            size: z.ZodOptional<z.ZodString>;
            color: z.ZodOptional<z.ZodString>;
            options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            notes: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            size?: string | undefined;
            color?: string | undefined;
            quantity?: number | undefined;
            options?: string[] | undefined;
            notes?: string | undefined;
        }, {
            name: string;
            size?: string | undefined;
            color?: string | undefined;
            quantity?: number | undefined;
            options?: string[] | undefined;
            notes?: string | undefined;
        }>, "many">>;
        customerName: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        address: z.ZodOptional<z.ZodObject<{
            city: z.ZodOptional<z.ZodString>;
            area: z.ZodOptional<z.ZodString>;
            street: z.ZodOptional<z.ZodString>;
            building: z.ZodOptional<z.ZodString>;
            floor: z.ZodOptional<z.ZodString>;
            apartment: z.ZodOptional<z.ZodString>;
            landmark: z.ZodOptional<z.ZodString>;
            raw_text: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            city?: string | undefined;
            area?: string | undefined;
            street?: string | undefined;
            building?: string | undefined;
            landmark?: string | undefined;
            floor?: string | undefined;
            apartment?: string | undefined;
            raw_text?: string | undefined;
        }, {
            city?: string | undefined;
            area?: string | undefined;
            street?: string | undefined;
            building?: string | undefined;
            landmark?: string | undefined;
            floor?: string | undefined;
            apartment?: string | undefined;
            raw_text?: string | undefined;
        }>>;
        substitutionAllowed: z.ZodOptional<z.ZodBoolean>;
        deliveryPreference: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        customerName?: string | undefined;
        phone?: string | undefined;
        address?: {
            city?: string | undefined;
            area?: string | undefined;
            street?: string | undefined;
            building?: string | undefined;
            landmark?: string | undefined;
            floor?: string | undefined;
            apartment?: string | undefined;
            raw_text?: string | undefined;
        } | undefined;
        products?: {
            name: string;
            size?: string | undefined;
            color?: string | undefined;
            quantity?: number | undefined;
            options?: string[] | undefined;
            notes?: string | undefined;
        }[] | undefined;
        substitutionAllowed?: boolean | undefined;
        deliveryPreference?: string | undefined;
    }, {
        customerName?: string | undefined;
        phone?: string | undefined;
        address?: {
            city?: string | undefined;
            area?: string | undefined;
            street?: string | undefined;
            building?: string | undefined;
            landmark?: string | undefined;
            floor?: string | undefined;
            apartment?: string | undefined;
            raw_text?: string | undefined;
        } | undefined;
        products?: {
            name: string;
            size?: string | undefined;
            color?: string | undefined;
            quantity?: number | undefined;
            options?: string[] | undefined;
            notes?: string | undefined;
        }[] | undefined;
        substitutionAllowed?: boolean | undefined;
        deliveryPreference?: string | undefined;
    }>>;
    missing_slots: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    negotiation: z.ZodOptional<z.ZodObject<{
        requestedDiscount: z.ZodOptional<z.ZodNumber>;
        approved: z.ZodBoolean;
        offerText: z.ZodOptional<z.ZodString>;
        finalPrices: z.ZodOptional<z.ZodArray<z.ZodObject<{
            productName: z.ZodString;
            originalPrice: z.ZodNumber;
            finalPrice: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }, {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        approved: boolean;
        requestedDiscount?: number | undefined;
        offerText?: string | undefined;
        finalPrices?: {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }[] | undefined;
    }, {
        approved: boolean;
        requestedDiscount?: number | undefined;
        offerText?: string | undefined;
        finalPrices?: {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }[] | undefined;
    }>>;
    confidence: z.ZodNumber;
    reasoning: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    actionType: ActionType;
    reply_ar: string;
    extracted_entities?: {
        customerName?: string | undefined;
        phone?: string | undefined;
        address?: {
            city?: string | undefined;
            area?: string | undefined;
            street?: string | undefined;
            building?: string | undefined;
            landmark?: string | undefined;
            floor?: string | undefined;
            apartment?: string | undefined;
            raw_text?: string | undefined;
        } | undefined;
        products?: {
            name: string;
            size?: string | undefined;
            color?: string | undefined;
            quantity?: number | undefined;
            options?: string[] | undefined;
            notes?: string | undefined;
        }[] | undefined;
        substitutionAllowed?: boolean | undefined;
        deliveryPreference?: string | undefined;
    } | undefined;
    missing_slots?: string[] | undefined;
    negotiation?: {
        approved: boolean;
        requestedDiscount?: number | undefined;
        offerText?: string | undefined;
        finalPrices?: {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }[] | undefined;
    } | undefined;
    reasoning?: string | undefined;
}, {
    confidence: number;
    actionType: ActionType;
    reply_ar: string;
    extracted_entities?: {
        customerName?: string | undefined;
        phone?: string | undefined;
        address?: {
            city?: string | undefined;
            area?: string | undefined;
            street?: string | undefined;
            building?: string | undefined;
            landmark?: string | undefined;
            floor?: string | undefined;
            apartment?: string | undefined;
            raw_text?: string | undefined;
        } | undefined;
        products?: {
            name: string;
            size?: string | undefined;
            color?: string | undefined;
            quantity?: number | undefined;
            options?: string[] | undefined;
            notes?: string | undefined;
        }[] | undefined;
        substitutionAllowed?: boolean | undefined;
        deliveryPreference?: string | undefined;
    } | undefined;
    missing_slots?: string[] | undefined;
    negotiation?: {
        approved: boolean;
        requestedDiscount?: number | undefined;
        offerText?: string | undefined;
        finalPrices?: {
            originalPrice: number;
            productName: string;
            finalPrice: number;
        }[] | undefined;
    } | undefined;
    reasoning?: string | undefined;
}>;
export type LlmResponse = z.infer<typeof LlmResponseSchema>;
export declare const InboxMessageSchema: z.ZodObject<{
    merchantId: z.ZodString;
    conversationId: z.ZodString;
    senderId: z.ZodString;
    providerMessageId: z.ZodString;
    timestamp: z.ZodString;
    text: z.ZodString;
    attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        url: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: string;
        url: string;
    }, {
        type: string;
        url: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    merchantId: string;
    conversationId: string;
    text: string;
    timestamp: string;
    senderId: string;
    providerMessageId: string;
    attachments: {
        type: string;
        url: string;
    }[];
}, {
    merchantId: string;
    conversationId: string;
    text: string;
    timestamp: string;
    senderId: string;
    providerMessageId: string;
    attachments?: {
        type: string;
        url: string;
    }[] | undefined;
}>;
export type InboxMessage = z.infer<typeof InboxMessageSchema>;
export declare const InboxResponseSchema: z.ZodObject<{
    conversationId: z.ZodString;
    reply: z.ZodString;
    actionType: z.ZodNativeEnum<typeof ActionType>;
    state: z.ZodObject<{
        missingSlots: z.ZodArray<z.ZodString, "many">;
        cartSummary: z.ZodString;
        addressMissingFields: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        missingSlots: string[];
        cartSummary: string;
        addressMissingFields: string[];
    }, {
        missingSlots: string[];
        cartSummary: string;
        addressMissingFields: string[];
    }>;
    debug: z.ZodObject<{
        correlationId: z.ZodString;
        confidence: z.ZodNumber;
        tokenBudgetRemaining: z.ZodNumber;
        llmUsed: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        confidence: number;
        correlationId: string;
        llmUsed: boolean;
        tokenBudgetRemaining: number;
    }, {
        confidence: number;
        correlationId: string;
        llmUsed: boolean;
        tokenBudgetRemaining: number;
    }>;
}, "strip", z.ZodTypeAny, {
    state: {
        missingSlots: string[];
        cartSummary: string;
        addressMissingFields: string[];
    };
    conversationId: string;
    actionType: ActionType;
    reply: string;
    debug: {
        confidence: number;
        correlationId: string;
        llmUsed: boolean;
        tokenBudgetRemaining: number;
    };
}, {
    state: {
        missingSlots: string[];
        cartSummary: string;
        addressMissingFields: string[];
    };
    conversationId: string;
    actionType: ActionType;
    reply: string;
    debug: {
        confidence: number;
        correlationId: string;
        llmUsed: boolean;
        tokenBudgetRemaining: number;
    };
}>;
export type InboxResponse = z.infer<typeof InboxResponseSchema>;
export declare const MerchantUpsertSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    category: z.ZodDefault<z.ZodNativeEnum<typeof MerchantCategory>>;
    config: z.ZodOptional<z.ZodObject<{
        brandName: z.ZodOptional<z.ZodString>;
        tone: z.ZodDefault<z.ZodEnum<["friendly", "formal", "casual"]>>;
        welcomeMessage: z.ZodOptional<z.ZodString>;
        currency: z.ZodDefault<z.ZodString>;
        language: z.ZodDefault<z.ZodString>;
        timezone: z.ZodDefault<z.ZodString>;
        enableNegotiation: z.ZodDefault<z.ZodBoolean>;
        enableSubstitution: z.ZodDefault<z.ZodBoolean>;
        followupEnabled: z.ZodDefault<z.ZodBoolean>;
        followupIntervalMinutes: z.ZodDefault<z.ZodNumber>;
        maxFollowups: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        language: string;
        currency: string;
        tone: "friendly" | "formal" | "casual";
        timezone: string;
        enableNegotiation: boolean;
        enableSubstitution: boolean;
        followupEnabled: boolean;
        followupIntervalMinutes: number;
        maxFollowups: number;
        brandName?: string | undefined;
        welcomeMessage?: string | undefined;
    }, {
        language?: string | undefined;
        currency?: string | undefined;
        brandName?: string | undefined;
        tone?: "friendly" | "formal" | "casual" | undefined;
        welcomeMessage?: string | undefined;
        timezone?: string | undefined;
        enableNegotiation?: boolean | undefined;
        enableSubstitution?: boolean | undefined;
        followupEnabled?: boolean | undefined;
        followupIntervalMinutes?: number | undefined;
        maxFollowups?: number | undefined;
    }>>;
    branding: z.ZodOptional<z.ZodObject<{
        logoUrl: z.ZodOptional<z.ZodString>;
        primaryColor: z.ZodOptional<z.ZodString>;
        tagline: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        logoUrl?: string | undefined;
        primaryColor?: string | undefined;
        tagline?: string | undefined;
    }, {
        logoUrl?: string | undefined;
        primaryColor?: string | undefined;
        tagline?: string | undefined;
    }>>;
    negotiationRules: z.ZodOptional<z.ZodObject<{
        maxDiscountPercent: z.ZodDefault<z.ZodNumber>;
        minMarginPercent: z.ZodDefault<z.ZodNumber>;
        freeDeliveryThreshold: z.ZodOptional<z.ZodNumber>;
        bundleDiscounts: z.ZodOptional<z.ZodArray<z.ZodObject<{
            minItems: z.ZodNumber;
            discountPercent: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            discountPercent: number;
            minItems: number;
        }, {
            discountPercent: number;
            minItems: number;
        }>, "many">>;
        allowNegotiation: z.ZodDefault<z.ZodBoolean>;
        activePromotion: z.ZodOptional<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            discountPercent: z.ZodNumber;
            description: z.ZodString;
            validUntil: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            description: string;
            discountPercent: number;
            validUntil?: string | undefined;
        }, {
            description: string;
            discountPercent: number;
            enabled?: boolean | undefined;
            validUntil?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        maxDiscountPercent: number;
        minMarginPercent: number;
        allowNegotiation: boolean;
        freeDeliveryThreshold?: number | undefined;
        bundleDiscounts?: {
            discountPercent: number;
            minItems: number;
        }[] | undefined;
        activePromotion?: {
            enabled: boolean;
            description: string;
            discountPercent: number;
            validUntil?: string | undefined;
        } | undefined;
    }, {
        maxDiscountPercent?: number | undefined;
        minMarginPercent?: number | undefined;
        freeDeliveryThreshold?: number | undefined;
        bundleDiscounts?: {
            discountPercent: number;
            minItems: number;
        }[] | undefined;
        allowNegotiation?: boolean | undefined;
        activePromotion?: {
            description: string;
            discountPercent: number;
            enabled?: boolean | undefined;
            validUntil?: string | undefined;
        } | undefined;
    }>>;
    deliveryRules: z.ZodOptional<z.ZodObject<{
        defaultFee: z.ZodDefault<z.ZodNumber>;
        freeDeliveryThreshold: z.ZodOptional<z.ZodNumber>;
        deliveryZones: z.ZodOptional<z.ZodArray<z.ZodObject<{
            zone: z.ZodString;
            fee: z.ZodNumber;
            estimatedDays: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            zone: string;
            fee: number;
            estimatedDays: number;
        }, {
            zone: string;
            fee: number;
            estimatedDays: number;
        }>, "many">>;
        workingHours: z.ZodOptional<z.ZodObject<{
            start: z.ZodOptional<z.ZodString>;
            end: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            start?: string | undefined;
            end?: string | undefined;
        }, {
            start?: string | undefined;
            end?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        defaultFee: number;
        freeDeliveryThreshold?: number | undefined;
        workingHours?: {
            start?: string | undefined;
            end?: string | undefined;
        } | undefined;
        deliveryZones?: {
            zone: string;
            fee: number;
            estimatedDays: number;
        }[] | undefined;
    }, {
        freeDeliveryThreshold?: number | undefined;
        workingHours?: {
            start?: string | undefined;
            end?: string | undefined;
        } | undefined;
        defaultFee?: number | undefined;
        deliveryZones?: {
            zone: string;
            fee: number;
            estimatedDays: number;
        }[] | undefined;
    }>>;
    dailyTokenBudget: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    category: MerchantCategory;
    name: string;
    dailyTokenBudget: number;
    config?: {
        language: string;
        currency: string;
        tone: "friendly" | "formal" | "casual";
        timezone: string;
        enableNegotiation: boolean;
        enableSubstitution: boolean;
        followupEnabled: boolean;
        followupIntervalMinutes: number;
        maxFollowups: number;
        brandName?: string | undefined;
        welcomeMessage?: string | undefined;
    } | undefined;
    negotiationRules?: {
        maxDiscountPercent: number;
        minMarginPercent: number;
        allowNegotiation: boolean;
        freeDeliveryThreshold?: number | undefined;
        bundleDiscounts?: {
            discountPercent: number;
            minItems: number;
        }[] | undefined;
        activePromotion?: {
            enabled: boolean;
            description: string;
            discountPercent: number;
            validUntil?: string | undefined;
        } | undefined;
    } | undefined;
    branding?: {
        logoUrl?: string | undefined;
        primaryColor?: string | undefined;
        tagline?: string | undefined;
    } | undefined;
    deliveryRules?: {
        defaultFee: number;
        freeDeliveryThreshold?: number | undefined;
        workingHours?: {
            start?: string | undefined;
            end?: string | undefined;
        } | undefined;
        deliveryZones?: {
            zone: string;
            fee: number;
            estimatedDays: number;
        }[] | undefined;
    } | undefined;
}, {
    id: string;
    name: string;
    category?: MerchantCategory | undefined;
    config?: {
        language?: string | undefined;
        currency?: string | undefined;
        brandName?: string | undefined;
        tone?: "friendly" | "formal" | "casual" | undefined;
        welcomeMessage?: string | undefined;
        timezone?: string | undefined;
        enableNegotiation?: boolean | undefined;
        enableSubstitution?: boolean | undefined;
        followupEnabled?: boolean | undefined;
        followupIntervalMinutes?: number | undefined;
        maxFollowups?: number | undefined;
    } | undefined;
    negotiationRules?: {
        maxDiscountPercent?: number | undefined;
        minMarginPercent?: number | undefined;
        freeDeliveryThreshold?: number | undefined;
        bundleDiscounts?: {
            discountPercent: number;
            minItems: number;
        }[] | undefined;
        allowNegotiation?: boolean | undefined;
        activePromotion?: {
            description: string;
            discountPercent: number;
            enabled?: boolean | undefined;
            validUntil?: string | undefined;
        } | undefined;
    } | undefined;
    branding?: {
        logoUrl?: string | undefined;
        primaryColor?: string | undefined;
        tagline?: string | undefined;
    } | undefined;
    deliveryRules?: {
        freeDeliveryThreshold?: number | undefined;
        workingHours?: {
            start?: string | undefined;
            end?: string | undefined;
        } | undefined;
        defaultFee?: number | undefined;
        deliveryZones?: {
            zone: string;
            fee: number;
            estimatedDays: number;
        }[] | undefined;
    } | undefined;
    dailyTokenBudget?: number | undefined;
}>;
export type MerchantUpsert = z.infer<typeof MerchantUpsertSchema>;
export declare const CatalogItemUpsertSchema: z.ZodObject<{
    merchantId: z.ZodString;
    sku: z.ZodOptional<z.ZodString>;
    nameAr: z.ZodString;
    nameEn: z.ZodOptional<z.ZodString>;
    descriptionAr: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    basePrice: z.ZodNumber;
    minPrice: z.ZodOptional<z.ZodNumber>;
    variants: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        values: z.ZodArray<z.ZodString, "many">;
        priceModifier: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        values: string[];
        priceModifier?: number | undefined;
    }, {
        name: string;
        values: string[];
        priceModifier?: number | undefined;
    }>, "many">>;
    options: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        price: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        price?: number | undefined;
    }, {
        name: string;
        price?: number | undefined;
    }>, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    isAvailable: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    merchantId: string;
    nameAr: string;
    isAvailable: boolean;
    basePrice: number;
    category?: string | undefined;
    options?: {
        name: string;
        price?: number | undefined;
    }[] | undefined;
    sku?: string | undefined;
    descriptionAr?: string | undefined;
    variants?: {
        name: string;
        values: string[];
        priceModifier?: number | undefined;
    }[] | undefined;
    tags?: string[] | undefined;
    nameEn?: string | undefined;
    minPrice?: number | undefined;
}, {
    merchantId: string;
    nameAr: string;
    basePrice: number;
    category?: string | undefined;
    options?: {
        name: string;
        price?: number | undefined;
    }[] | undefined;
    sku?: string | undefined;
    descriptionAr?: string | undefined;
    variants?: {
        name: string;
        values: string[];
        priceModifier?: number | undefined;
    }[] | undefined;
    tags?: string[] | undefined;
    nameEn?: string | undefined;
    isAvailable?: boolean | undefined;
    minPrice?: number | undefined;
}>;
export type CatalogItemUpsert = z.infer<typeof CatalogItemUpsertSchema>;
export declare const DomainEventSchema: z.ZodObject<{
    eventType: z.ZodString;
    aggregateType: z.ZodString;
    aggregateId: z.ZodString;
    merchantId: z.ZodOptional<z.ZodString>;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    correlationId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    payload: Record<string, unknown>;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    merchantId?: string | undefined;
    correlationId?: string | undefined;
}, {
    payload: Record<string, unknown>;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    merchantId?: string | undefined;
    correlationId?: string | undefined;
}>;
export type DomainEvent = z.infer<typeof DomainEventSchema>;
