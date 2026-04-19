# 🎬 Tash8eel Demo Runbook

**Duration:** 10 minutes  
**Target:** Merchant decision-maker (owner/operations manager)  
**Outcome:** "I want this for my business"

---

## Pre-Demo Setup (5 min before)

### 1. Environment Check

```bash
# Verify all services are running
npm run go:check

# Expected output:
# ✓ API healthy
# ✓ Portal healthy
# ✓ Database connected
```

### 2. Demo Account Ready

- Login: `demo@tash8eel.com` / `Demo123!`
- Or use demo mode: Append `?demo=true` to any portal URL
- Has: 50+ sample orders, 200+ conversations, inventory items

### 3. Browser Setup

- Chrome with Arabic language support
- Portal: `http://localhost:3000/merchant/dashboard`
- WhatsApp Web simulator (optional): Postman collection

---

## Demo Script (10 minutes)

### 🔹 Minute 0-1: Hook with Pain Point

**Say:**

> "كل يوم بتضيع كام ساعة في الرد على رسائل الواتساب؟ وكام طلب بيروح لأنك مش موجود؟"
>
> "Every day, how many hours do you spend replying to WhatsApp? How many orders slip away because you weren't available?"

**Show:** Dashboard → Active Conversations count → "58 auto-handled, 9 human"

**Point out:**

- AI handled 87% of conversations automatically
- Average response time: 18 seconds
- Human needed only for complex cases

---

### 🔹 Minute 1-3: Live Order Demo

**Say:**

> "خليني أوريك إزاي تاش8يل بياخد طلب من العميل"

**Action:** Send test message via Postman or WhatsApp simulator:

```
POST /api/v1/inbox/message
{
  "merchantId": "demo-merchant",
  "senderId": "demo-customer-1",
  "text": "عايز 2 تيشيرت أبيض حجم L"
}
```

**Show Portal:**

1. New conversation appears instantly
2. AI detected: Product (تيشيرت أبيض), Quantity (2), Size (L)
3. Cart auto-populated
4. Lead Score badge: 🔥 HOT (ready to buy)

**Say:**

> "شفت؟ العميل لسه بعت، والسيستم فهم الطلب وحطه في السلة تلقائي"

---

### 🔹 Minute 3-4: Address & Delivery

**Action:** Send follow-up message:

```
{
  "text": "أنا في الدقي، شارع التحرير جنب صيدلية الأمل"
}
```

**Show:**

1. Address parsed: الدقي → شارع التحرير → صيدلية الأمل
2. Address Confidence: 72% (needs building number)
3. AI asks: "ممكن رقم العمارة أو علامة مميزة؟"

**Point out:**

> "لو العنوان مش واضح، السيستم بيسأل تلقائي. ده بيقلل فشل التوصيل بنسبة 50%+"

---

### 🔹 Minute 4-5: Egyptian Negotiation

**Action:** Customer tries to negotiate:

```
{
  "text": "لو عملتلي خصم هاخد 4"
}
```

**Show:**

1. Objection detected: "expensive" type
2. AI responds with Arabic template: "أكيد! لو أخدت 4 هديلك 10% خصم، يعني ..."
3. Policy-based: Max discount follows merchant rules

**Say:**

> "العميل المصري بيحب يفاصل. تاش8يل بيعرف إزاي يتعامل وبيحافظ على الربح بتاعك"

---

### 🔹 Minute 5-6: Voice Note Magic

**Action:** Send audio message (simulate):

```
POST /api/v1/inbox/message
{
  "text": "",
  "audioUrl": "https://example.com/voice-order.ogg"
}
```

**Show:**

1. Transcription appears: "عايز جاكت شتوي أسود مقاس XL وقميص أبيض"
2. Products extracted and added to cart
3. AI confirms: "تمام، جاكت شتوي أسود XL وقميص أبيض. المجموع ..."

**Say:**

> "60% من المصريين بيبعتوا فويس. تاش8يل بيفهمهم كلهم"

---

### 🔹 Minute 6-7: Premium Features (Pro Plan)

**Navigate:** Dashboard → Premium Insights Row

**Show:**

1. **Recovered Carts:** 12 orders worth 3,450 EGP this week
2. **Delivery Failures:** 3 (reasons: عنوان غير كامل, مش موجود)
3. **Finance Summary:**
   - Profit estimate: 8,200 EGP
   - COD pending: 2,100 EGP
   - Gross margin: 32%

**Say:**

> "دي فلوس كانت هتضيع لولا المتابعة التلقائية"

---

### 🔹 Minute 7-8: Inventory & Substitutions

**Navigate:** Inventory page

**Show:**

1. Low stock alert: "تيشيرت أبيض - باقي 3 فقط"
2. Dead stock highlight: "جاكت صيفي - لم يُباع منذ 45 يوم"
3. AI suggestion: "عرض خصم 20% لتصفية المخزون؟"

**Action:** Click substitution suggestion for out-of-stock item

- AI ranks alternatives with Arabic pitch

**Say:**

> "لو منتج خلص، السيستم بيقترح بديل للعميل بدل ما يروح"

---

### 🔹 Minute 8-9: Human Takeover

**Show:** Conversation with complex query

**Action:** Click "استلام المحادثة" (Takeover)

- Instant switch to human mode
- AI pauses responses
- Internal notes visible

**Say:**

> "في أي لحظة تقدر تستلم. لو عميل VIP أو مشكلة معقدة"

**Action:** Click "إرجاع للذكاء الاصطناعي" (Release)

- AI resumes with context

---

### 🔹 Minute 9-10: Close with ROI

**Navigate:** Reports → Weekly Summary

**Show:**
| This Week | Value |
|-----------|-------|
| Orders processed | 127 |
| Revenue | 24,500 EGP |
| Hours saved | 28 hrs |
| Failed deliveries avoided | 8 |

**Say:**

> "28 ساعة في الأسبوع. ده موظف تقريباً. والاشتراك أقل من مرتبه"

**Call to Action:**

> "تقدر تجرب مجاناً لمدة 14 يوم. نبدأ امتى؟"

---

## Objection Handling

| Objection         | Response                                                                       |
| ----------------- | ------------------------------------------------------------------------------ |
| "مش محتاج AI"     | "حتى لو بترد بسرعة، هل بترد الساعة 2 الفجر؟ أو في الإجازات؟"                   |
| "غالي"            | "احسب: لو ضاع طلب واحد في اليوم × 200 جنيه × 30 يوم = 6000 جنيه. الاشتراك 999" |
| "مش واثق في الAI" | "انت متحكم 100%. أي وقت تقدر تستلم. والسيستم بيتعلم من أسلوبك"                 |
| "عندي نظام تاني"  | "تاش8يل مش ERP. ده موظف واتساب. الاتنين بيشتغلوا مع بعض"                       |
| "محتاج أفكر"      | "أكيد. اديني إيميلك أبعتلك ملخص. ولو قررت هنشغلك في ساعة"                      |

---

## Post-Demo

1. Send follow-up email with:
   - Portal login credentials (trial)
   - Postman collection for API testing
   - Pricing PDF
   - This week's WhatsApp response time benchmark

2. Schedule:
   - Day 2: Check-in call
   - Day 7: Usage review
   - Day 14: Conversion call

---

## Technical Fallbacks

| Issue                  | Quick Fix                                      |
| ---------------------- | ---------------------------------------------- |
| API slow               | Use demo mode (mocked data)                    |
| No messages appearing  | Check DATABASE_URL in .env                     |
| Audio not transcribing | Verify OPENAI_API_KEY                          |
| Portal not loading     | `npm run build:portal && npm run start:portal` |

---

## Demo Environment Commands

```bash
# Start all services
npm run dev

# Reset demo data
npm run db:seed

# Check health
curl http://localhost:3001/health

# Send test message (Postman alternative)
curl -X POST http://localhost:3001/api/v1/inbox/message \
  -H "Content-Type: application/json" \
  -H "x-api-key: demo-api-key" \
  -d '{"merchantId":"demo-merchant","senderId":"demo-123","text":"عايز أطلب"}'
```

---

_Last Updated: February 2026_
_Owner: Sales & Success Team_

---

## 🎯 EXTENDED DEMO: End-to-End Agent Flow (15-20 min)

This extended demo covers the complete Ops → Inventory → Finance → Proof → Copilot flow.

---

### Pre-Demo Verification

```bash
# Verify services
npm run go:check

# Verify demo merchant with PRO plan
psql $DATABASE_URL -c "SELECT id, plan FROM merchants WHERE id = 'demo-merchant-001'"

# Verify payout settings configured
psql $DATABASE_URL -c "SELECT payout_instapay_alias FROM merchants WHERE id = 'demo-merchant-001'"
```

---

### Extended Demo Scenario 1: Complete Order Flow (WhatsApp)

**Customer Message 1:** `مرحبا، عايز 2 تيشيرت أزرق مقاس M`

**Expected:**

- Ops Agent greets + shows products
- Inventory Agent checks stock
- If available: price + asks for address

**Customer Message 2:** `شارع التحرير عمارة 5 شقة 12 - 01012345678`

**Expected:**

- Slot filling accepts address
- Order summary shown
- Payment options offered (InstaPay/VodafoneCash/Bank)

**Verification:**

- [ ] Order created in `orders` table
- [ ] Inventory reservation in `inventory_reservations`
- [ ] Customer in `customers` table

---

### Extended Demo Scenario 2: Payment Proof with OCR

**Customer:** `1` (chooses InstaPay)

**Expected:**

```
حوّل 400 ج.م على: ahmed.shop
بعد التحويل ابعت سكرينشوت
```

**Customer sends screenshot** (InstaPay 400 EGP)

**Expected:**

- Proof received message
- OCR extracts: amount, reference, timestamp
- Auto-verification if confidence >= 85%
- Order status → CONFIRMED

**Portal Verification:**

1. Payments → إثباتات الدفع
2. Show proof with extracted fields
3. Show confidence score

---

### Extended Demo Scenario 3: Merchant Copilot

**Portal → المساعد الذكي**

**Demo 1 (Destructive):**

```
سجل مصروف 1000 جنيه لحمة
```

→ Shows confirmation dialog → Confirm → Expense logged

**Demo 2 (Query):**

```
كام إيراد اليوم؟
```

→ Shows KPI instantly (no confirmation needed)

**Demo 3 (Voice):**
Click mic → "زود مخزون التيشيرت 50 قطعة"
→ Transcription → Confirmation → Stock updated

---

### Extended Demo Scenario 4: Feature Gating

**For Basic plan merchant:**

```
كم إيراد اليوم؟
```

→ Shows 🔒 lock + upgrade CTA

---

### Technical Verification Checklist

- [ ] `npm run build` exits 0
- [ ] `npm test` all unit tests pass (234+)
- [ ] WhatsApp webhook receiving messages
- [ ] OCR extraction working
- [ ] Copilot confirmation flow working
- [ ] Audit logs capturing actions

---

### Troubleshooting Quick Ref

| Issue                  | Fix                              |
| ---------------------- | -------------------------------- |
| WhatsApp not receiving | Check ngrok + Twilio webhook URL |
| OCR fails              | Check OPENAI_API_KEY             |
| Copilot blocked        | Check merchant plan is PRO       |
| Stock not reserving    | Check worker service running     |
