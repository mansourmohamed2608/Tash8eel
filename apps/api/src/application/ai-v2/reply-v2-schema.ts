/**
 * OpenAI strict JSON schema for AI Reply Engine v2 renderer output.
 * state_patch is empty object only (strict mode); patches applied server-side later.
 */
export const AI_V2_RENDER_JSON_SCHEMA = {
  name: "ai_v2_customer_reply",
  strict: true,
  schema: {
    type: "object",
    properties: {
      customer_reply: {
        type: "string",
        description: "WhatsApp reply to send the customer",
      },
      state_patch: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      used_fact_ids: {
        type: "array",
        items: { type: "string" },
      },
      risk_flags: {
        type: "array",
        items: { type: "string" },
      },
      confidence: { type: "number" },
    },
    required: [
      "customer_reply",
      "state_patch",
      "used_fact_ids",
      "risk_flags",
      "confidence",
    ],
    additionalProperties: false,
  },
} as const;
