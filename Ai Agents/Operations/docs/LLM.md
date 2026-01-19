# Operations Agent - LLM Integration

## Model Selection

We use **GPT-4o-mini** exclusively for all LLM operations:
- Excellent Arabic language support
- Cost-effective ($0.15 / 1M input tokens)
- Supports Structured Outputs (JSON Schema mode)
- Fast response times (~1-2 seconds)

## Structured Outputs

All LLM responses use OpenAI's Structured Outputs feature with `strict: true`:

```typescript
const response = await this.openai.chat.completions.create({
  model: 'gpt-4o-mini',
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'operations_agent_response',
      strict: true,
      schema: LLM_RESPONSE_SCHEMA,
    },
  },
  messages: [...],
});
```

## Response Schema

```json
{
  "reply": "Arabic response to customer",
  "action": "greet|update_cart|collect_slots|counter_offer|accept_negotiation|reject_negotiation|order_confirmed|track_order|escalate|fallback",
  "confidence": 0.95,
  "cartItems": [
    {"name": "تيشيرت أبيض", "quantity": 2, "price": 150}
  ],
  "customerName": "أحمد",
  "phone": "01234567890",
  "address": "مدينة نصر",
  "orderNumberMentioned": null,
  "needsHumanEscalation": false,
  "reasoning": "Customer wants 2 white t-shirts"
}
```

## Validation with Zod

All LLM responses are validated at runtime:

```typescript
const LlmResponseSchema = z.object({
  reply: z.string(),
  action: z.enum([...]),
  confidence: z.number().min(0).max(1),
  cartItems: z.array(CartItemSchema).optional(),
  // ...
});

// In LlmService
const parsed = LlmResponseSchema.parse(response);
```

## Context Building

The LLM receives comprehensive context:

1. **Merchant Info**: Name, category, policies
2. **Negotiation Rules**: Max discount, thresholds
3. **Catalog**: Available products with prices
4. **Customer History**: Past orders, preferences
5. **Current Cart**: Items already added
6. **Required Slots**: What info is still needed
7. **Delivery Areas**: Valid areas for address
8. **Message History**: Last 10 messages

## Token Budget Management

Per-merchant daily limits are enforced:

```typescript
async checkTokenBudget(merchantId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}> {
  // Query today's usage
  const usage = await this.getTokenUsage(merchantId, today);
  const merchant = await this.merchantRepo.findById(merchantId);
  
  return {
    allowed: usage < merchant.dailyTokenBudget,
    used: usage,
    limit: merchant.dailyTokenBudget,
    remaining: merchant.dailyTokenBudget - usage,
  };
}
```

When budget exceeded:
1. Return fallback response (no LLM call)
2. Alert merchant via event
3. Log warning

## Fallback Handling

If LLM fails or budget exceeded:

```typescript
createFallbackResponse(): LlmResponse {
  return {
    reply: ArabicTemplates.errors.generalError,
    action: ActionType.FALLBACK,
    confidence: 0,
    tokenUsage: 0,
  };
}
```

## Prompt Engineering

Key principles for Arabic prompts:

1. **Egyptian Dialect**: Use ar-EG, not MSA
2. **Friendly Tone**: Use expressions like "تمام", "إن شاء الله"
3. **Clear Instructions**: Numbered steps in context
4. **Example Patterns**: Include sample responses
5. **Error Handling**: Handle unclear requests gracefully

## Cost Tracking

Token usage is tracked per message:

```sql
SELECT 
  merchant_id,
  DATE(created_at) as date,
  SUM(token_usage) as total_tokens,
  COUNT(*) as message_count
FROM messages
WHERE sender = 'bot'
GROUP BY merchant_id, DATE(created_at);
```

## Retry Strategy

On LLM errors:
1. Retry up to 2 times with exponential backoff
2. If all retries fail, return fallback
3. Log error with full context for debugging

## Future Enhancements

- [ ] Fine-tuned model for Egyptian e-commerce
- [ ] Prompt caching for repeated patterns
- [ ] A/B testing different prompts
- [ ] Automatic prompt optimization
