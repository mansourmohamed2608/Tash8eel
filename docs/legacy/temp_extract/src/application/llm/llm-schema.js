"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmResponseValidationSchema = exports.LLM_RESPONSE_JSON_SCHEMA = void 0;
const zod_1 = require("zod");
const enums_1 = require("../../shared/constants/enums");
// JSON Schema for OpenAI Structured Outputs
exports.LLM_RESPONSE_JSON_SCHEMA = {
    name: "ops_agent_plan",
    strict: true,
    schema: {
        type: "object",
        properties: {
            actionType: {
                type: "string",
                enum: [
                    "ASK_CLARIFYING_QUESTION",
                    "UPDATE_CART",
                    "CREATE_ORDER",
                    "BOOK_DELIVERY",
                    "SEND_TRACKING",
                    "SCHEDULE_FOLLOWUP",
                    "SEND_REPORT",
                    "ESCALATE_TO_HUMAN",
                    "GREET",
                    "CONFIRM_ORDER",
                    "HANDLE_NEGOTIATION",
                ],
                description: "The action to take based on the conversation",
            },
            reply_ar: {
                type: "string",
                description: "The response in Egyptian Arabic dialect to send to the customer",
            },
            extracted_entities: {
                type: ["object", "null"],
                properties: {
                    products: {
                        type: ["array", "null"],
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                quantity: { type: ["number", "null"] },
                                size: { type: ["string", "null"] },
                                color: { type: ["string", "null"] },
                                options: {
                                    type: ["array", "null"],
                                    items: { type: "string" },
                                },
                                notes: { type: ["string", "null"] },
                            },
                            required: [
                                "name",
                                "quantity",
                                "size",
                                "color",
                                "options",
                                "notes",
                            ],
                            additionalProperties: false,
                        },
                    },
                    customerName: { type: ["string", "null"] },
                    phone: { type: ["string", "null"] },
                    address: {
                        type: ["object", "null"],
                        properties: {
                            city: { type: ["string", "null"] },
                            area: { type: ["string", "null"] },
                            street: { type: ["string", "null"] },
                            building: { type: ["string", "null"] },
                            floor: { type: ["string", "null"] },
                            apartment: { type: ["string", "null"] },
                            landmark: { type: ["string", "null"] },
                            raw_text: { type: ["string", "null"] },
                        },
                        required: [
                            "city",
                            "area",
                            "street",
                            "building",
                            "floor",
                            "apartment",
                            "landmark",
                            "raw_text",
                        ],
                        additionalProperties: false,
                    },
                    substitutionAllowed: { type: ["boolean", "null"] },
                    deliveryPreference: { type: ["string", "null"] },
                },
                required: [
                    "products",
                    "customerName",
                    "phone",
                    "address",
                    "substitutionAllowed",
                    "deliveryPreference",
                ],
                additionalProperties: false,
            },
            missing_slots: {
                type: ["array", "null"],
                items: { type: "string" },
                description: "List of information still needed from the customer: customerName, phone, address, products",
            },
            negotiation: {
                type: ["object", "null"],
                properties: {
                    requestedDiscount: {
                        type: ["number", "null"],
                        description: "Discount percentage given (e.g., 10 for 10%)",
                    },
                    approved: { type: "boolean" },
                    offerText: { type: ["string", "null"] },
                    finalPrices: {
                        type: ["array", "null"],
                        items: {
                            type: "object",
                            properties: {
                                productName: { type: "string" },
                                originalPrice: { type: "number" },
                                finalPrice: { type: "number" },
                            },
                            required: ["productName", "originalPrice", "finalPrice"],
                            additionalProperties: false,
                        },
                    },
                },
                required: ["requestedDiscount", "approved", "offerText", "finalPrices"],
                additionalProperties: false,
            },
            delivery_fee: {
                type: ["number", "null"],
                description: "Delivery fee in EGP (e.g., 50)",
            },
            confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
                description: "Confidence score for this response (0-1)",
            },
            reasoning: {
                type: ["string", "null"],
                description: "Brief reasoning for the chosen action",
            },
        },
        required: [
            "actionType",
            "reply_ar",
            "confidence",
            "extracted_entities",
            "missing_slots",
            "negotiation",
            "reasoning",
            "delivery_fee",
        ],
        additionalProperties: false,
    },
};
// Zod schema for validation
exports.LlmResponseValidationSchema = zod_1.z.object({
    actionType: zod_1.z.nativeEnum(enums_1.ActionType),
    reply_ar: zod_1.z.string().min(1, "Reply is required"),
    extracted_entities: zod_1.z
        .object({
        products: zod_1.z
            .array(zod_1.z.object({
            name: zod_1.z.string(),
            quantity: zod_1.z.number().nullable(),
            size: zod_1.z.string().nullable(),
            color: zod_1.z.string().nullable(),
            options: zod_1.z.array(zod_1.z.string()).nullable(),
            notes: zod_1.z.string().nullable(),
        }))
            .nullable(),
        customerName: zod_1.z.string().nullable(),
        phone: zod_1.z.string().nullable(),
        address: zod_1.z
            .object({
            city: zod_1.z.string().nullable(),
            area: zod_1.z.string().nullable(),
            street: zod_1.z.string().nullable(),
            building: zod_1.z.string().nullable(),
            floor: zod_1.z.string().nullable(),
            apartment: zod_1.z.string().nullable(),
            landmark: zod_1.z.string().nullable(),
            raw_text: zod_1.z.string().nullable(),
        })
            .nullable(),
        substitutionAllowed: zod_1.z.boolean().nullable(),
        deliveryPreference: zod_1.z.string().nullable(),
    })
        .nullable(),
    missing_slots: zod_1.z.array(zod_1.z.string()).nullable(),
    negotiation: zod_1.z
        .object({
        requestedDiscount: zod_1.z.number().nullable(),
        approved: zod_1.z.boolean(),
        offerText: zod_1.z.string().nullable(),
        finalPrices: zod_1.z
            .array(zod_1.z.object({
            productName: zod_1.z.string(),
            originalPrice: zod_1.z.number(),
            finalPrice: zod_1.z.number(),
        }))
            .nullable(),
    })
        .nullable(),
    delivery_fee: zod_1.z.number().nullable(),
    confidence: zod_1.z.number().min(0).max(1),
    reasoning: zod_1.z.string().nullable(),
});
