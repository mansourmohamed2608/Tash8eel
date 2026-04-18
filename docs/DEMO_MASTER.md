# 🎬 DEMO_MASTER.md - Complete WhatsApp Demo System

**Duration:** 10-15 minutes  
**Platform:** WhatsApp via Twilio  
**Target:** Merchant decision-maker  
**Goal:** "I want this for my business TODAY"

---

## 🚀 Pre-Demo Environment Setup

### 1. Environment Variables Required

```bash
# Core API
DATABASE_URL=postgresql://user:pass@localhost:5432/tash8eel
REDIS_URL=redis://localhost:6379
APP_URL=https://your-domain.com
API_PORT=3001
PORTAL_URL=https://your-domain.com

# Twilio WhatsApp Integration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
TWILIO_WEBHOOK_URL=https://your-ngrok.io/api/v1/webhook/twilio

# OpenAI (Voice + Vision + LLM)
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini

# Egyptian Payment (Optional for demo)
PAYMOB_API_KEY=your-paymob-key
INSTAPAY_MERCHANT_ID=your-instapay-id
```

### 2. Ngrok Setup (for WhatsApp webhook)

```bash
# Install ngrok
npm install -g ngrok

# Start tunnel to API
ngrok http 3001

# Copy the HTTPS URL and update .env
# Example: https://abc123.ngrok.io
```

### 3. Twilio Console Setup

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Messaging > Try it out > Send a WhatsApp message**
3. Connect your phone to the Twilio sandbox
4. Set webhook URL to: `https://your-ngrok.io/api/v1/webhook/twilio`

### 4. Start Services

```bash
# Terminal 1: API
cd apps/api && npm run start:dev

# Terminal 2: Worker
cd apps/worker && npm run start:dev

# Terminal 3: Portal
cd apps/portal && npm run dev

# Terminal 4: Verify
npm run go:check
```

### 5. Demo Account Setup

```sql
-- Ensure demo merchant exists with all features
UPDATE merchants
SET plan = 'PRO',
    enabled_agents = ARRAY['OPS_AGENT', 'INVENTORY_AGENT', 'FINANCE_AGENT']
WHERE id = 'demo-merchant-001';

-- Verify entitlements
SELECT COUNT(*) FROM merchant_entitlements
WHERE merchant_id = 'demo-merchant-001' AND is_enabled = true;
-- Should return 24+ features
```

---

## 📱 WhatsApp Demo Script (10 Minutes)

### Minute 0-1: Hook with Pain Point

**You Say:**

> "كل يوم بتضيع كام ساعة في الرد على رسائل الواتساب؟ وكام طلب بيروح لأنك مش موجود؟"

**Show:** Open portal dashboard at `http://localhost:3000/merchant/dashboard`

**Point Out:**

- Active Conversations: "58 بتتعامل أوتوماتيك، 9 بس محتاجين بشري"
- Response Time: "متوسط 18 ثانية"
- Conversion Rate: "32% of chats become orders"

---

### Minute 1-3: Live Text Order

**Customer sends via WhatsApp:**

```
عايز 2 تيشيرت أبيض حجم L
```

**What happens:**

1. Message appears in Portal → Conversations
2. AI detects: Product, Quantity, Size
3. Cart auto-populated
4. Lead Score badge: 🔥 HOT

**You Say:**

> "شفت؟ العميل لسه بعت، والسيستم فهم الطلب وحطه في السلة تلقائي"

---

### Minute 3-4: Location Pin → Address

**Customer sends via WhatsApp:**

- Share location via WhatsApp location pin, OR
- Send Google Maps link: `https://maps.google.com/?q=30.0444,31.2357`

**What happens:**

1. Location parsed: Coordinates extracted
2. Address structured: City → Area → Coordinates
3. AI asks for missing details: "ممكن رقم العمارة؟"

**You Say:**

> "لو العنوان مش واضح، السيستم بيسأل تلقائي. ده بيقلل فشل التوصيل 50%+"

---

### Minute 4-5: Egyptian Negotiation

**Customer sends via WhatsApp:**

```
لو عملتلي خصم هاخد 4
```

**What happens:**

1. Objection detected: "expensive" type
2. AI checks merchant discount policy (max 15%)
3. AI responds: "تمام! لو أخدت 4 هديلك 10% خصم، يعني المجموع ..."

**You Say:**

> "العميل المصري بيحب يفاصل. تاش8يل بيعرف يتعامل وبيحافظ على الربح"

---

### Minute 5-6: 🎙️ Voice Note Magic

**Customer sends via WhatsApp:**

- Record voice message: "عايز جاكت شتوي أسود مقاس XL وقميص أبيض"

**What happens:**

1. Voice transcribed via Whisper
2. Transcription appears: "عايز جاكت شتوي أسود مقاس XL وقميص أبيض"
3. Products extracted and added to cart
4. AI confirms: "تمام، جاكت شتوي أسود XL وقميص أبيض..."

**You Say:**

> "60% من المصريين بيبعتوا فويس. تاش8يل بيفهمهم كلهم"

**Technical Note:** Voice transcription uses OpenAI Whisper. Ensure `OPENAI_API_KEY` is set.

---

### Minute 6-7: 📸 Product Image OCR (Optional)

**Customer sends via WhatsApp:**

- Photo of a product they want

**What happens:**

1. Vision API extracts text/product info
2. AI searches catalog for match
3. Suggests: "ده شبه المنتج اللي عندنا..."

**Technical Note:** Uses `POST /api/v1/vision/product-match`

---

### Minute 7-8: Payment Link Flow

**AI sends payment link after order confirmation:**

```
تم تأكيد طلبك! 🎉
المجموع: 450 ج.م

ادفع من هنا:
https://tash8eel.app/pay/ABC123

طرق الدفع المتاحة:
- InstaPay
- Vodafone Cash
- تحويل بنكي
```

**Show in Portal:**

- Navigate to Orders → See payment link created
- Navigate to Payments → See pending payment

---

### Minute 8-9: 💳 InstaPay Screenshot OCR

**Customer sends via WhatsApp:**

- Screenshot of InstaPay payment confirmation

**What happens:**

1. Vision OCR extracts:
   - Sender name
   - Amount
   - Reference number
   - Date
2. Auto-verify if amount matches (±2%)
3. Order status updated to PAID

**You Say:**

> "العميل صور التحويل، السيستم فهم الصورة وأكد الدفع تلقائي. 85%+ دقة"

---

### Minute 9-10: 📦 Inventory Reservation

**Show in Portal → Inventory:**

1. Stock levels with reserved quantities
2. Low stock alerts (yellow badges)
3. AI substitution suggestions

**You Say:**

> "لما العميل يطلب، السيستم يحجز الكمية 30 دقيقة. لو ألغى، ترجع تلقائي. مفيش overselling"

---

### Minute 10-11: 📊 Premium Dashboard Cards

**Show Dashboard → Premium Row:**

| Card                  | What it Shows                          |
| --------------------- | -------------------------------------- |
| **Recovered Carts**   | 12 orders, 3,450 EGP this week         |
| **Delivery Failures** | 3 failures, reasons listed             |
| **Finance Summary**   | Profit estimate, COD pending, margin % |

**You Say:**

> "دي فلوس كانت هتضيع لولا المتابعة التلقائية"

---

### Minute 11-12: Close

**You Say:**

> "كل ده أوتوماتيك، 24/7، بدون موظفين.
>
> الخطة المبدئية 299 جنيه في الشهر.
>
> تجرب 7 أيام مجاناً؟"

---

## 🔧 Demo Troubleshooting

| Issue                  | Solution                                    |
| ---------------------- | ------------------------------------------- |
| Messages not arriving  | Check ngrok is running, webhook URL correct |
| Voice not transcribing | Verify `OPENAI_API_KEY` is set              |
| Location not parsing   | Send raw coordinates or Google Maps link    |
| Payment link broken    | Check `APP_URL` in .env                     |
| OCR not working        | Verify OpenAI Vision enabled                |
| Inventory not showing  | Ensure INVENTORY_AGENT enabled for merchant |
| Finance cards locked   | Verify PRO plan + FINANCE_AGENT enabled     |

---

## 📦 Postman Collection

Import the full collection from:

```
postman/Operations_Agent.postman_collection.json
```

### Key Endpoints for Demo:

```bash
# 1. Send text message
POST /api/v1/inbox/message
{
  "merchantId": "demo-merchant-001",
  "senderId": "demo-customer",
  "text": "عايز 2 تيشيرت أبيض حجم L"
}

# 2. Send voice note
POST /api/v1/inbox/message
{
  "merchantId": "demo-merchant-001",
  "senderId": "demo-customer",
  "text": "",
  "media": {
    "type": "audio",
    "url": "https://example.com/voice.ogg"
  }
}

# 3. Send location
POST /api/v1/inbox/message
{
  "merchantId": "demo-merchant-001",
  "senderId": "demo-customer",
  "text": "",
  "media": {
    "type": "location",
    "coordinates": { "lat": 30.0444, "lng": 31.2357 }
  }
}

# 4. Process payment screenshot
POST /api/v1/vision/receipt
{
  "merchantId": "demo-merchant-001",
  "imageUrl": "https://example.com/instapay-receipt.png"
}

# 5. Get dashboard stats
GET /api/v1/merchants/demo-merchant-001/dashboard
Headers: x-api-key: demo-api-key

# 6. Get KPIs
GET /api/v1/kpis/summary?days=30
Headers: x-api-key: demo-api-key
```

---

## 🎯 Demo Success Metrics

After demo, track:

- [ ] Did customer ask "how much?"
- [ ] Did customer ask about setup time?
- [ ] Did customer mention specific pain point solved?
- [ ] Did customer want to try free trial?

---

## 🆕 HIGH-IMPACT FEATURES DEMO (V2)

### 1. VIP Customer Tagging (Ops Agent)

**WhatsApp Script:**

```
Customer: "أنا عاوز أطلب زي الأسبوع اللي فات"
Bot: "أهلاً! 👑 شكراً لأنك عميل VIP عندنا يا [Name]!
      لقيت طلبك السابق - 3 قميص أبيض + 2 بنطلون.
      تحب أكرر نفس الطلب؟"
Customer: "أيوه"
Bot: "تمام! الطلب #RE-ABC123 اتعمل بـ 850 ج.م.
      حابب نوصله على نفس العنوان؟"
```

**Portal Demo:**

1. Open **Customers** page → Show VIP badge on customer
2. Click customer → Show **Risk Score** (green/yellow/red)
3. Show **Quick Actions**: "تاج VIP", "Reorder", "View Risk"

**API Call (Postman):**

```json
// Tag customer as VIP
POST /api/v1/customers/demo-customer/tags
{
  "tag": "VIP",
  "action": "add",
  "metadata": { "reason": "10+ orders, 5000+ spent" }
}

// Get reorder items
GET /api/v1/customers/demo-customer/reorder-items

// Create reorder
POST /api/v1/customers/demo-customer/reorder
{
  "conversationId": "conv-123"
}
```

### 2. Return Risk Scoring (Ops Agent)

**Portal Demo:**

1. Open **Customers** → Filter by "High Risk"
2. Show customer with risk score 75+ (red badge)
3. Click to see risk factors:
   - Failed Deliveries: 2
   - Refusals: 1
   - Address Confidence: 45%
4. Highlight: "الأوردر ده محتاج تأكيد عنوان إضافي"

**Conversation Integration:**

```
Bot (internal note): "⚠️ عميل عالي المخاطرة (Risk: 72)
                     - 2 توصيلات فاشلة سابقة
                     - عنوان غير واضح
                     Recommend: طلب تفاصيل عنوان إضافية"
```

### 3. Supplier CSV Import (Inventory Agent)

**Portal Demo:**

1. Navigate to **Inventory** → **Import**
2. Click "استيراد من المورد"
3. Upload sample CSV:
   ```csv
   sku,name,cost_price,stock,category
   SKU001,قميص أبيض XL,85,50,ملابس
   SKU002,بنطلون جينز,120,30,ملابس
   SKU003,حذاء رياضي,200,20,أحذية
   ```
4. Show import result: "تم استيراد 3 منتجات بنجاح"
5. Navigate to **Inventory** → Products updated with new cost prices

### 4. Shrinkage Reports (Inventory Agent)

**Portal Demo:**

1. Navigate to **Inventory** → **Shrinkage**
2. Click "جرد جديد" → Enter count for selected SKUs:
   - SKU001: Expected 50, Actual 48 (-2)
   - SKU003: Expected 20, Actual 17 (-3)
3. Show shrinkage report:
   - Total Shrinkage: 5 units
   - Value Lost: 685 ج.م
   - Shrinkage Rate: 2.3%
4. **Anomaly Alert**: "SKU003 has 15% shrinkage rate - investigate"

**Highlight:**

> "كل الحسابات deterministic - لا يوجد AI في الأرقام"

### 5. Top Movers (Inventory Agent)

**Portal Demo:**

1. Navigate to **Inventory** → **Analytics**
2. Show **Top Sellers** (week):
   | SKU | Name | Qty Sold | Revenue |
   |-----|------|----------|---------|
   | SKU001 | قميص أبيض | 45 | 5,400 ج.م |
   | SKU002 | بنطلون جينز | 28 | 4,200 ج.م |
3. Show **Slow Movers**:
   | SKU | Name | Stock | Days No Sale |
   |-----|------|-------|--------------|
   | SKU099 | حزام جلد | 15 | 45 |
4. Recommendation: "فكر في خصم على المنتجات البطيئة"

### 6. COD Statement Import (Finance Agent)

**Portal Demo:**

1. Navigate to **Payments** → **COD Reconciliation**
2. Click "استيراد كشف المندوب"
3. Select courier: "Bosta" or "Aramex"
4. Upload courier CSV statement
5. Show reconciliation result:
   - Matched: 45 orders
   - Unmatched: 3 orders
   - Discrepancies: 2 orders
6. Click discrepancy: "Order #1234: Expected 350, Reported 320 (-30 ج.م)"

**API Call:**

```json
POST /api/v1/finance/cod/import
{
  "merchantId": "demo-merchant-001",
  "courierName": "bosta",
  "filename": "bosta_statement_2024-01.csv",
  "statementDate": "2024-01-31",
  "rows": [
    {"trackingNumber": "BOSTA123", "orderNumber": "ORD-001", "collectedAmount": 350, "deliveryFee": 30}
  ]
}
```

### 7. Expense Categories & Monthly Close (Finance Agent)

**Portal Demo:**

1. Navigate to **Reports** → **Expenses**
2. Show expense breakdown:
   | Category | Amount |
   |----------|--------|
   | إعلانات | 3,500 ج.م |
   | إيجار | 5,000 ج.م |
   | رواتب | 12,000 ج.م |
   | توصيل | 2,800 ج.م |
3. Navigate to **Reports** → **Monthly Close**
4. Show January 2024 summary:
   - Revenue: 85,000 ج.م
   - COGS: 42,000 ج.م
   - Gross Profit: 43,000 ج.م (50.6%)
   - Expenses: 23,300 ج.م
   - Net Profit: 19,700 ج.م (23.2%)

### 8. Accountant Pack Export (Finance Agent)

**Portal Demo:**

1. Navigate to **Reports** → **Export**
2. Select period: January 2024
3. Check boxes: Orders, Expenses, COD, Inventory
4. Click "تصدير للمحاسب"
5. Show download options:
   - 📄 CSV (Excel-compatible)
   - 📑 PDF Report

---

## 🤖 Merchant Copilot (Command Agent) Demo

The Merchant Copilot allows merchants to issue commands via **Portal Chat** or **WhatsApp** using natural Arabic text or voice messages.

### 9. Copilot Demo - Portal Chat

**Portal Demo Route:** `http://localhost:3000/merchant/assistant`

#### Demo 1: Add Expense (Destructive - Requires Confirmation)

**Type in Chat:**

```
سجل مصروف ١٠٠٠ جنيه لحمة
```

**Expected Response:**

```
سأضيف مصروف ١٠٠٠ جنيه (لحمة). تأكد؟
[✓ تأكيد] [✗ إلغاء]
```

**Click "✓ تأكيد"** → Expense is recorded

**Point Out:**

- Destructive actions require confirmation (security)
- Arabic UI is natural and conversational
- Intent badge shows `ADD_EXPENSE` (for debugging)

#### Demo 2: Query KPI (Non-Destructive - Instant)

**Type in Chat:**

```
كم إيراد اليوم؟
```

**Expected Response:**

```
إيرادات اليوم: ٤٣,٢٠٠ ج.م
٢٧ طلب مكتمل
```

**Point Out:**

- Query commands execute instantly (no confirmation needed)
- Real-time data from orders table

#### Demo 3: Stock Update with Voice

**Click Microphone → Say:**

```
زود مخزون التيشيرت الأزرق ٥٠ قطعة
```

**Expected Response:**

```
سأزيد المخزون ٥٠ قطعة (تيشيرت أزرق). تأكد؟
[✓ تأكيد] [✗ إلغاء]
```

**Point Out:**

- Voice-to-text powered by OpenAI Whisper
- Same confirmation flow as text

### 10. Copilot Demo - WhatsApp Channel

Merchants can also use Copilot via their registered WhatsApp number.

#### Setup: Merchant Command Channel

First, the merchant's phone must be registered:

```sql
-- Check merchant's registered phone
SELECT whatsapp_number FROM merchants WHERE id = 'demo-merchant-001';
-- Example: 20101234567890
```

#### Demo: Send Command via WhatsApp

**From Merchant's Phone, Text to Business Number:**

```
#cmd مصاريف الأسبوع ده كام؟
```

**Expected Response:**

```
📊 مصاريف هذا الأسبوع:
- لحمة: ٣,٥٠٠ ج.م
- خضار: ١,٢٠٠ ج.م
- إيجار: ٥,٠٠٠ ج.م
إجمالي: ٩,٧٠٠ ج.م
```

**Point Out:**

- Uses `#cmd` prefix to distinguish from customer messages
- Works from any phone registered as merchant
- Same AI parsing as Portal chat

### 11. Entitlement Gating Demo

**Portal Demo:** Show a Basic plan merchant

**Type in Chat:**

```
كم إيراد اليوم؟
```

**Expected Response (Blocked):**

```
🔒 هذه الميزة تحتاج ترقية الباقة
[عرض الباقات]
```

**Point Out:**

- Copilot respects entitlements
- KPI Dashboard requires Growth or Pro plan
- Blocked intents show upgrade prompt
- Lock icon in UI indicates feature blocked

### Available Copilot Intents (23 Total)

| Category      | Intent              | Arabic Example            | Feature Required |
| ------------- | ------------------- | ------------------------- | ---------------- |
| **Finance**   | ADD_EXPENSE         | "سجل مصروف ٥٠٠ كهرباء"    | REPORTS          |
|               | ASK_EXPENSE_SUMMARY | "مصاريف الشهر ده"         | REPORTS          |
|               | CREATE_PAYMENT_LINK | "لينك دفع ٢٠٠ جنيه"       | PAYMENTS         |
|               | ASK_COD_STATUS      | "كام كاش عند المناديب؟"   | PAYMENTS         |
| **Inventory** | UPDATE_STOCK        | "زود ١٠ تيشيرت أبيض"      | INVENTORY        |
|               | ASK_LOW_STOCK       | "إيه اللي قرب يخلص؟"      | INVENTORY        |
|               | ASK_TOP_MOVERS      | "أكتر منتج بيتباع"        | INVENTORY        |
|               | ASK_DEAD_STOCK      | "المنتجات اللي مش بتتباع" | INVENTORY        |
| **Ops**       | TAG_VIP             | "خلي أحمد VIP"            | CUSTOMERS        |
|               | REMOVE_VIP          | "شيل VIP من محمد"         | CUSTOMERS        |
|               | ASK_HIGH_RISK       | "الطلبات المشكوك فيها"    | ORDERS           |
|               | ASK_RECOVERED_CARTS | "العربات المتابعة"        | ABANDONED_CART   |
|               | ASK_PENDING_ORDERS  | "الطلبات المعلقة"         | ORDERS           |
| **Analytics** | ASK_KPI             | "إزاي الشغل النهاردة؟"    | KPI_DASHBOARD    |
|               | ASK_REVENUE         | "الإيراد الأسبوع ده"      | KPI_DASHBOARD    |
|               | ASK_ORDER_COUNT     | "كام طلب النهاردة؟"       | ORDERS           |
|               | ASK_AVG_ORDER       | "متوسط الطلب كام؟"        | KPI_DASHBOARD    |

---

## 📋 Post-Demo Checklist

- [ ] Send follow-up WhatsApp with pricing link
- [ ] Create trial account if requested
- [ ] Schedule onboarding call
- [ ] Add to CRM pipeline

---

## 🔗 Quick Links

| Resource           | URL                                                      |
| ------------------ | -------------------------------------------------------- |
| Portal Login       | `http://localhost:3000/login`                            |
| Demo Dashboard     | `http://localhost:3000/merchant/dashboard?demo=true`     |
| Customers (VIP)    | `http://localhost:3000/merchant/customers?filter=vip`    |
| Inventory Import   | `http://localhost:3000/merchant/import-export`           |
| Shrinkage Report   | `http://localhost:3000/merchant/inventory?tab=shrinkage` |
| COD Reconciliation | `http://localhost:3000/merchant/payments?tab=cod`        |
| Monthly Close      | `http://localhost:3000/merchant/reports?type=monthly`    |
| API Docs (Swagger) | `http://localhost:3001/api/docs`                         |
| Twilio Console     | `https://console.twilio.com`                             |
| Ngrok Dashboard    | `http://127.0.0.1:4040`                                  |

---

**Document Status:** ✅ Complete (V3 with Merchant Copilot)  
**Last Updated:** February 2026  
**Ready for:** Live WhatsApp demos with VIP/Reorder/Shrinkage/COD/Copilot features
