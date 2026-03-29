# API Testing Guide (Script + Postman)

This guide helps you test the full non-WhatsApp API flow locally.

## 1) Start Required Services

Run API first:

```powershell
npm run dev:api
```

Confirm health:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get
```

Expected: status = ok.

## 2) Configure AI Key (for real assistant quality)

Set a real key in environment used by API:

- OPENAI_API_KEY
- OPENAI_MODEL (optional)

Then restart API.

## 3) Automated Smoke Test Script

Script path:

- scripts/test-live-api-flow.js

NPM command:

```powershell
npm run test:smoke:api
```

What it tests:

1. Health endpoint
2. POS integrations list/create/test/delete
3. Assistant chat endpoint
4. RAG preview endpoint
5. Inbox order-like message processing

### Optional environment variables

```powershell
$env:API_BASE_URL="http://localhost:3000"
$env:MERCHANT_ID="demo-merchant"
$env:SENDER_ID="201111111111"
$env:TEST_QUERY="بيتزا"
$env:TEST_CHAT_MESSAGE="ايه افضل المنتجات حاليا؟"
$env:TEST_ORDER_TEXT="عايز اطلب 2 بيتزا مارجريتا و 1 كوكاكولا"
$env:MERCHANT_AUTH_TOKEN="demo-token-123"   # optional
$env:MERCHANT_API_KEY=""                     # optional alternative auth
$env:KEEP_POS="false"                        # keep test POS integration if true
npm run test:smoke:api
```

## 4) Postman Manual Test Checklist

Use either:

- Authorization: Bearer <token>
- Header: x-api-key: <merchant_key>

Set base URL variable:

- baseUrl = http://localhost:3000

### Request A: Health

- GET {{baseUrl}}/health

### Request B: POS list

- GET {{baseUrl}}/api/v1/portal/pos-integrations

### Request C: POS create (Google Slides)

- POST {{baseUrl}}/api/v1/portal/pos-integrations
- Body JSON:

```json
{
  "provider": "google_slides",
  "name": "Google Slides Test",
  "credentials": {
    "presentationId": "1AbCDefGhIJkLmNoPqRsTuVwXyZ",
    "serviceAccountEmail": "slides-bot@project.iam.gserviceaccount.com",
    "privateKey": "-----BEGIN PRIVATE KEY-----test-----END PRIVATE KEY-----"
  },
  "config": {
    "templateSlideId": "g1234567890"
  }
}
```

### Request D: POS test contract

- POST {{baseUrl}}/api/v1/portal/pos-integrations/{{integrationId}}/test

Check response fields:

- success
- provider (should normalize to GOOGLE_SLIDES)
- contract.requiredFields
- contract.action
- contract.mode

### Request E: POS delete

- DELETE {{baseUrl}}/api/v1/portal/pos-integrations/{{integrationId}}

### Request F: Assistant chat

- POST {{baseUrl}}/api/v1/portal/assistant/chat
- Body JSON:

```json
{
  "message": "عايز اقتراحات لزيادة المبيعات",
  "history": []
}
```

### Request G: RAG preview

- POST {{baseUrl}}/api/v1/portal/assistant/rag-preview
- Body JSON:

```json
{
  "query": "بيتزا",
  "limit": 5
}
```

Use this to inspect retrieved catalog items and validate grounding quality.

### Request H: Inbox order simulation (without WhatsApp)

- POST {{baseUrl}}/api/v1/inbox/message
- Body JSON:

```json
{
  "merchantId": "demo-merchant",
  "senderId": "201111111111",
  "text": "عايز اطلب 2 بيتزا مارجريتا و 1 كوكاكولا والعنوان مدينة نصر عباس العقاد والدفع كاش عند الاستلام",
  "correlationId": "manual-test-001"
}
```

Check:

- conversationId
- replyText
- action
- cart

## 5) How to Verify RAG Quality

1. Call rag-preview with target product terms.
2. Ensure top retrieved items are relevant and in stock.
3. Call assistant chat with same intent.
4. Confirm answer references context aligned with retrieved items.

## 6) Common Failures

- Unable to connect to remote server:
  - API is not running on port 3000.
- Assistant says AI unavailable:
  - OPENAI_API_KEY invalid, missing, restricted, or quota exhausted.
- Arabic appears as ????? in terminal:
  - Use UTF-8 console before tests:

```powershell
chcp 65001
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```
