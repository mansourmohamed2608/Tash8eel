# دليل إعداد Meta Cloud API — Tash8eel WhatsApp Integration

> هذا الدليل يشرح كيفية إعداد Meta Cloud API لتشغيل واتساب على منصة تشغيل.

---

## المتطلبات الأساسية

1. **حساب Meta Business** (business.facebook.com)
2. **صفحة فيسبوك** مرتبطة بحساب الأعمال
3. **حساب مطور** (developers.facebook.com)
4. **رقم هاتف** غير مسجل على واتساب (للتحقق)

---

## الخطوة 1: إنشاء تطبيق Meta

1. اذهب إلى [Meta for Developers](https://developers.facebook.com/apps/)
2. اضغط **Create App** → اختر **Business** → اختر **Other**
3. اسم التطبيق: `Tash8eel WhatsApp`
4. اربط حساب الأعمال الخاص بك
5. بعد الإنشاء، من القائمة الجانبية: **Add Product** → **WhatsApp** → **Set Up**

---

## الخطوة 2: إعداد WhatsApp Business API

1. في لوحة التطبيق، اذهب إلى **WhatsApp** → **Getting Started**
2. ستحصل تلقائياً على:
   - **Phone Number ID** — معرف رقم الهاتف
   - **WhatsApp Business Account ID (WABA ID)** — معرف حساب الأعمال
   - **Temporary Access Token** — رمز مؤقت (صالح 24 ساعة)

3. **إضافة رقم هاتف حقيقي:**
   - اذهب إلى **WhatsApp** → **Phone Numbers** → **Add Phone Number**
   - أدخل رقم الهاتف المصري (مثل: +201xxxxxxxxx)
   - أكمل التحقق بالرسالة النصية أو المكالمة

---

## الخطوة 3: إنشاء System User Token (دائم)

> الرمز المؤقت ينتهي بعد 24 ساعة. تحتاج رمز دائم.

1. اذهب إلى **Business Settings** → **Users** → **System Users**
2. اضغط **Add** → اسم: `tash8eel-api` → الدور: **Admin**
3. اضغط **Generate Token**:
   - اختر التطبيق: `Tash8eel WhatsApp`
   - الصلاحيات المطلوبة:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
   - مدة الصلاحية: **Never Expires**
4. **انسخ الرمز وأحفظه بأمان** — هذا هو `META_ACCESS_TOKEN`

---

## الخطوة 4: إعداد App Secret

1. في لوحة التطبيق: **Settings** → **Basic**
2. اضغط **Show** بجانب **App Secret**
3. انسخه — هذا هو `META_APP_SECRET` (يُستخدم للتحقق من توقيع Webhook)

---

## الخطوة 5: إعداد Webhook

### عنوان الـ Webhook:

```
https://your-domain.com/api/v1/webhooks/meta/whatsapp
```

### خطوات الإعداد:

1. في لوحة التطبيق: **WhatsApp** → **Configuration**
2. في قسم **Webhook**:
   - **Callback URL:** `https://your-domain.com/api/v1/webhooks/meta/whatsapp`
   - **Verify Token:** ضع قيمة مطابقة لـ `META_WEBHOOK_VERIFY_TOKEN` في متغيرات البيئة
3. اضغط **Verify and Save**
4. اشترك في الأحداث التالية:
   - ✅ `messages` — الرسائل الواردة
   - ✅ `message_deliveries` — إيصالات التسليم
   - ✅ `message_reads` — إيصالات القراءة

---

## الخطوة 6: متغيرات البيئة

أضف هذه المتغيرات في ملف `.env` أو إعدادات الخادم:

```env
# === Meta Cloud API ===
META_ACCESS_TOKEN=EAA...your_system_user_token
META_PHONE_NUMBER_ID=1234567890          # من WhatsApp > Phone Numbers
META_WABA_ID=9876543210                   # من WhatsApp > Getting Started
META_APP_SECRET=abc123...                 # من Settings > Basic > App Secret
META_WEBHOOK_VERIFY_TOKEN=my_secret_123   # أنت تختاره — يجب أن يطابق إعدادات Webhook
```

---

## الخطوة 7: التحقق من العمل

### 1. اختبار الـ Webhook (GET):

```bash
curl "https://your-domain.com/api/v1/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=my_secret_123&hub.challenge=test123"
# يجب أن يرد: test123
```

### 2. إرسال رسالة اختبارية:

```bash
curl -X POST "https://graph.facebook.com/v21.0/YOUR_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "201xxxxxxxxx",
    "type": "text",
    "text": { "body": "أهلاً! هذه رسالة اختبار من تشغيل 🎉" }
  }'
```

### 3. التحقق من استقبال الرسائل:

- أرسل رسالة من واتساب إلى الرقم المربوط
- تحقق من logs الخادم أنه استقبل الـ webhook
- تحقق أن `whatsapp_message_log` يحتوي على السجل

---

## الخطوة 8: الانتقال إلى الإنتاج (Production)

1. في لوحة التطبيق: **App Review** → **Request Permissions**
2. اطلب:
   - `whatsapp_business_messaging` ← **مطلوب**
   - `whatsapp_business_management` ← **مطلوب**
3. أكمل **Business Verification** (يتطلب مستندات الشركة)
4. بعد الموافقة: **App Mode** → **Live**

---

## تركيبة المشروع: الملفات الجديدة

| الملف                                    | الوظيفة                                         |
| ---------------------------------------- | ----------------------------------------------- |
| `adapters/meta-whatsapp.adapter.ts`      | المحول الأساسي — إرسال/استقبال/تنزيل وسائط      |
| `controllers/meta-webhook.controller.ts` | Webhook endpoints — GET (تحقق) + POST (استقبال) |
| `migrations/026_meta_cloud_api.sql`      | جدول `whatsapp_message_log` + `merchant_addons` |

---

## استكشاف الأخطاء

| المشكلة                | الحل                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| Webhook لا يتحقق       | تأكد أن `META_WEBHOOK_VERIFY_TOKEN` مطابق في `.env` و Meta Dashboard |
| رسائل لا تصل           | تحقق من الاشتراك في أحداث `messages` في Webhook Configuration        |
| خطأ 401 عند الإرسال    | `META_ACCESS_TOKEN` منتهي — أنشئ System User Token جديد              |
| خطأ 190 OAuthException | يجب أن يكون Token من System User (ليس Page token)                    |
| التوقيع غير صالح       | `META_APP_SECRET` خاطئ — تأكد أنه App Secret وليس Access Token       |
| رسائل Template ترفض    | يجب الموافقة على Template من WhatsApp قبل الاستخدام                  |

---

## الحدود والقيود

| البند                             | القيمة                                                 |
| --------------------------------- | ------------------------------------------------------ |
| **رسائل الخدمة**                  | مجانية — بلا حدود (خلال 24 ساعة من آخر رسالة عميل)     |
| **رسائل الأدوات في نافذة الخدمة** | مجانية (منذ أبريل 2025)                                |
| **رسائل التسويق**                 | ~3.70 ج.م/رسالة (مصر)                                  |
| **حد الرسائل/يوم**                | يبدأ بـ 250 → 1,000 → 10,000 → 100,000 (يزيد تلقائياً) |
| **Graph API version**             | v21.0                                                  |
| **Webhook retries**               | 7 محاولات خلال 7 أيام (لذلك نرد 200 فوراً)             |
