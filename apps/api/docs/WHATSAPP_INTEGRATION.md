# WhatsApp Business API Integration Design

## Overview

This document outlines the architecture and implementation plan for integrating the Tash8eel Operations Agent with WhatsApp Business API. The integration will enable merchants to communicate with customers through WhatsApp, leveraging the existing conversational AI capabilities.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Portal (Next.js)                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Operations Agent (NestJS)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Inbox      │  │ Orchestrator│  │  Message Delivery       │ │
│  │  Service    │──│  (LLM)      │──│  Service                │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         │                                    │                  │
│         ▼                                    ▼                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  PostgreSQL + Redis                         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Mock Delivery       │
                    │   Adapter (Current)   │
                    └───────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Portal (Next.js)                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Operations Agent (NestJS)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Inbox      │  │ Orchestrator│  │  Message Delivery       │ │
│  │  Service    │──│  (LLM)      │──│  Service                │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         ▲                                    │                  │
│         │                                    ▼                  │
│  ┌──────┴──────────────────┐  ┌─────────────────────────────┐  │
│  │  Webhook Controller     │  │  Delivery Adapter Registry  │  │
│  │  (WhatsApp Webhooks)    │  │  ├─ MockDeliveryAdapter     │  │
│  └─────────────────────────┘  │  └─ WhatsAppAdapter ←──NEW  │  │
│                               └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
           ▲                              │
           │                              ▼
           │                   ┌───────────────────────┐
           │                   │   WhatsApp Business   │
           └───────────────────│   Cloud API          │
             (Webhooks)        └───────────────────────┘
```

## WhatsApp Business API Options

### Option 1: WhatsApp Cloud API (Recommended)

- **Provider**: Meta (Facebook)
- **Pricing**: Free for first 1,000 conversations/month, then per-conversation pricing
- **Pros**: Direct integration, no middleware, lower latency
- **Cons**: Requires Meta Business verification

### Option 2: Third-Party BSP (Business Solution Provider)

- **Providers**: Twilio, MessageBird, Vonage
- **Pros**: Easier setup, additional features
- **Cons**: Higher cost, additional dependency

### Recommendation

Start with **WhatsApp Cloud API** for direct integration and cost efficiency.

## Implementation Plan

### Phase 1: WhatsApp Business Account Setup

1. Create Meta Business Suite account
2. Set up WhatsApp Business Account
3. Verify business identity
4. Get API access token
5. Configure webhook URL

### Phase 2: Webhook Implementation

```typescript
// src/api/controllers/webhooks.controller.ts (extend existing)

interface WhatsAppWebhookPayload {
  object: "whatsapp_business_account";
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: "whatsapp";
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<WhatsAppMessage>;
        statuses?: Array<WhatsAppStatus>;
      };
      field: "messages";
    }>;
  }>;
}

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "location"
    | "button";
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string };
  audio?: { id: string; mime_type: string };
  button?: { text: string; payload: string };
}

interface WhatsAppStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}
```

### Phase 3: WhatsApp Adapter Implementation

```typescript
// src/application/adapters/whatsapp.adapter.ts

@Injectable()
export class WhatsAppAdapter implements IDeliveryAdapter {
  private readonly baseUrl = "https://graph.facebook.com/v18.0";

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const phoneNumberId = this.configService.get("WHATSAPP_PHONE_NUMBER_ID");
    const accessToken = this.configService.get("WHATSAPP_ACCESS_TOKEN");

    const response = await this.httpService.post(
      `${this.baseUrl}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.recipientPhone,
        type: "text",
        text: { body: params.message },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    return {
      success: true,
      providerMessageId: response.data.messages[0].id,
    };
  }

  async sendTemplateMessage(
    params: SendTemplateParams,
  ): Promise<SendMessageResult> {
    // For business-initiated conversations (24h window expired)
    const response = await this.httpService.post(
      `${this.baseUrl}/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: params.recipientPhone,
        type: "template",
        template: {
          name: params.templateName,
          language: { code: "ar" },
          components: params.components,
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    return {
      success: true,
      providerMessageId: response.data.messages[0].id,
    };
  }
}
```

### Phase 4: Multi-Channel Support

```typescript
// src/application/adapters/adapter-registry.ts

@Injectable()
export class DeliveryAdapterRegistry {
  private adapters: Map<string, IDeliveryAdapter> = new Map();

  constructor(
    private readonly mockAdapter: MockDeliveryAdapter,
    private readonly whatsAppAdapter: WhatsAppAdapter,
  ) {
    this.adapters.set("mock", this.mockAdapter);
    this.adapters.set("whatsapp", this.whatsAppAdapter);
  }

  getAdapter(channel: string): IDeliveryAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new Error(`Unknown delivery channel: ${channel}`);
    }
    return adapter;
  }

  async sendMessage(
    channel: string,
    params: SendMessageParams,
  ): Promise<SendMessageResult> {
    const adapter = this.getAdapter(channel);
    return adapter.sendMessage(params);
  }
}
```

## Database Schema Updates

```sql
-- Add channel support to conversations
ALTER TABLE conversations ADD COLUMN channel VARCHAR(20) DEFAULT 'mock';
ALTER TABLE conversations ADD COLUMN channel_metadata JSONB DEFAULT '{}';

-- Add WhatsApp-specific merchant configuration
ALTER TABLE merchants ADD COLUMN whatsapp_config JSONB DEFAULT '{}';
-- whatsapp_config structure:
-- {
--   "enabled": true,
--   "phoneNumberId": "...",
--   "businessAccountId": "...",
--   "verifyToken": "...",
--   "templates": {
--     "order_confirmation": "tash8eel_order_confirm_v1",
--     "delivery_update": "tash8eel_delivery_v1"
--   }
-- }

-- Track message provider IDs
ALTER TABLE messages ADD COLUMN channel VARCHAR(20) DEFAULT 'mock';
```

## Message Templates

WhatsApp requires pre-approved templates for business-initiated messages. Required templates:

### 1. Order Confirmation

```
Name: tash8eel_order_confirm_v1
Language: Arabic
Category: TRANSACTIONAL

Content:
مرحباً {{1}}! 🎉

تم تأكيد طلبك #{{2}} بنجاح

📦 {{3}} منتجات
💰 المجموع: {{4}} ج.م

سيتم التوصيل خلال {{5}}

للتتبع، راسلنا في أي وقت!
```

### 2. Delivery Update

```
Name: tash8eel_delivery_v1
Language: Arabic
Category: TRANSACTIONAL

Content:
📦 تحديث التوصيل

طلبك #{{1}} في الطريق إليك!

🚚 شركة الشحن: {{2}}
📍 الحالة: {{3}}

للاستفسار، راسلنا مباشرة
```

### 3. Daily Report

```
Name: tash8eel_daily_report_v1
Language: Arabic
Category: MARKETING

Content:
📊 تقريرك اليومي - {{1}}
━━━━━━━━━━━━━━━
💰 الإيرادات: {{2}} ج.م
🛒 الطلبات: {{3}}
💬 المحادثات: {{4}}
✅ نسبة التحويل: {{5}}%
━━━━━━━━━━━━━━━
للتفاصيل، قم بزيارة لوحة التحكم
```

## Security Considerations

### 1. Webhook Verification

```typescript
// Verify webhook signature
async verifyWebhookSignature(req: Request): Promise<boolean> {
  const signature = req.headers['x-hub-signature-256'];
  const appSecret = this.configService.get('WHATSAPP_APP_SECRET');

  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  return `sha256=${expectedSignature}` === signature;
}
```

### 2. Token Management

- Store access tokens in secure environment variables
- Implement token refresh mechanism
- Use short-lived tokens where possible

### 3. Rate Limiting

- WhatsApp has rate limits (1000 messages/second for Cloud API)
- Implement queue-based sending with rate limiting
- Track and respect 24-hour messaging windows

## Cost Estimation

| Tier   | Conversations/Month | Cost (USD)           |
| ------ | ------------------- | -------------------- |
| Free   | 0-1,000             | $0                   |
| Tier 1 | 1,001-10,000        | ~$0.005/conversation |
| Tier 2 | 10,001-100,000      | ~$0.004/conversation |

**Note**: Business-initiated conversations cost more than user-initiated.

## Timeline Estimate

| Phase                  | Duration  | Dependencies        |
| ---------------------- | --------- | ------------------- |
| Business Account Setup | 1-2 weeks | Meta verification   |
| Webhook Implementation | 1 week    | Account approved    |
| WhatsApp Adapter       | 1 week    | Webhooks working    |
| Template Approval      | 1-2 weeks | Templates submitted |
| Testing & QA           | 1 week    | All above           |
| Production Rollout     | 1 week    | Testing complete    |

**Total Estimate**: 6-8 weeks

## Testing Strategy

### 1. Local Development

- Use the existing MockDeliveryAdapter
- Simulate webhook payloads with test scripts

### 2. WhatsApp Test Numbers

- Use Meta's test phone numbers during development
- Test all message types and status callbacks

### 3. Staging Environment

- Full WhatsApp integration with test numbers
- End-to-end conversation flow testing

## Rollout Plan

1. **Alpha**: Internal team testing only
2. **Beta**: 5-10 merchants with opt-in
3. **General Availability**: All merchants with opt-in

## Monitoring & Observability

### Metrics to Track

- Message delivery success rate
- Average delivery latency
- Conversation window compliance
- Template usage and performance
- Error rates by type

### Alerts

- Delivery success rate < 95%
- Webhook processing errors
- Rate limit warnings
- Token expiration warnings

## Conclusion

This design enables a smooth transition from the current mock-based system to full WhatsApp integration while maintaining backward compatibility. The adapter pattern allows easy addition of other channels (SMS, Telegram, etc.) in the future.

### Next Steps

1. Begin Meta Business verification process
2. Set up development environment with test phone numbers
3. Implement webhook endpoint with signature verification
4. Create and submit message templates for approval
