import { z } from "zod";
import { ActionType } from "../../shared/constants/enums";

// JSON Schema for OpenAI Structured Outputs
export const LLM_RESPONSE_JSON_SCHEMA = {
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
          "REORDER_LAST",
          "CONFIRM_REORDER",
        ],
        description: "The action to take based on the conversation",
      },
      reply_ar: {
        type: "string",
        description:
          "The response in Egyptian Arabic dialect to send to the customer",
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
              map_url: {
                type: ["string", "null"],
                description: "Google Maps URL if customer shared one",
              },
              coordinates: {
                type: ["object", "null"],
                properties: {
                  lat: {
                    type: "number",
                    description: "Latitude from Google Maps URL",
                  },
                  lng: {
                    type: "number",
                    description: "Longitude from Google Maps URL",
                  },
                },
                required: ["lat", "lng"],
                additionalProperties: false,
              },
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
              "map_url",
              "coordinates",
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
        description:
          "List of information still needed from the customer: customerName, phone, address, products",
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
export const LlmResponseValidationSchema = z.object({
  actionType: z.nativeEnum(ActionType),
  reply_ar: z.string().min(1, "Reply is required"),
  extracted_entities: z
    .object({
      products: z
        .array(
          z.object({
            name: z.string(),
            quantity: z.number().nullable(),
            size: z.string().nullable(),
            color: z.string().nullable(),
            options: z.array(z.string()).nullable(),
            notes: z.string().nullable(),
          }),
        )
        .nullable(),
      customerName: z.string().nullable(),
      phone: z.string().nullable(),
      address: z
        .object({
          city: z.string().nullable(),
          area: z.string().nullable(),
          street: z.string().nullable(),
          building: z.string().nullable(),
          floor: z.string().nullable(),
          apartment: z.string().nullable(),
          landmark: z.string().nullable(),
          raw_text: z.string().nullable(),
        })
        .nullable(),
      substitutionAllowed: z.boolean().nullable(),
      deliveryPreference: z.string().nullable(),
    })
    .nullable(),
  missing_slots: z.array(z.string()).nullable(),
  negotiation: z
    .object({
      requestedDiscount: z.number().nullable(),
      approved: z.boolean(),
      offerText: z.string().nullable(),
      finalPrices: z
        .array(
          z.object({
            productName: z.string(),
            originalPrice: z.number(),
            finalPrice: z.number(),
          }),
        )
        .nullable(),
    })
    .nullable(),
  delivery_fee: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().nullable(),
});

export type ValidatedLlmResponse = z.infer<typeof LlmResponseValidationSchema>;
