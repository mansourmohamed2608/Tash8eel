"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmService = void 0;
exports.createLlmResult = createLlmResult;
const common_1 = require("@nestjs/common");
const openai_1 = __importDefault(require("openai"));
const logger_1 = require("../../shared/logging/logger");
const enums_1 = require("../../shared/constants/enums");
const templates_1 = require("../../shared/constants/templates");
const helpers_1 = require("../../shared/utils/helpers");
const llm_schema_1 = require("./llm-schema");
const logger = (0, logger_1.createLogger)("LlmService");
// Helper to create LlmResult with convenience properties
function createLlmResult(response, tokensUsed, llmUsed) {
    // Filter products to only include those with names
    const products = response.extracted_entities?.products?.filter((p) => p.name) || [];
    return {
        response,
        tokensUsed,
        llmUsed,
        action: response.actionType,
        reply: response.reply_ar,
        cartItems: products.map((p) => ({
            name: p.name,
            quantity: p.quantity,
            size: p.size,
            color: p.color,
        })),
        customerName: response.extracted_entities?.customerName ?? undefined,
        phone: response.extracted_entities?.phone ?? undefined,
        address: response.extracted_entities?.address?.raw_text ?? undefined,
        discountPercent: response.negotiation?.requestedDiscount ?? undefined,
        deliveryFee: response.delivery_fee ?? undefined,
        missingSlots: response.missing_slots ?? undefined,
    };
}
let LlmService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var LlmService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            LlmService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        configService;
        merchantRepository;
        client;
        model;
        maxTokens;
        timeoutMs;
        constructor(configService, merchantRepository) {
            this.configService = configService;
            this.merchantRepository = merchantRepository;
            this.client = new openai_1.default({
                apiKey: this.configService.get("OPENAI_API_KEY"),
            });
            this.model = this.configService.get("OPENAI_MODEL", "gpt-4o-mini");
            this.maxTokens = parseInt(this.configService.get("OPENAI_MAX_TOKENS", "2048"), 10);
            this.timeoutMs = parseInt(this.configService.get("OPENAI_TIMEOUT_MS", "30000"), 10);
        }
        async processMessage(context) {
            const { merchant, conversation, catalogItems, recentMessages, customerMessage, } = context;
            // Check token budget
            const budgetCheck = await this.checkTokenBudget(merchant);
            if (!budgetCheck.hasRemaining) {
                logger.warn("Token budget exceeded", {
                    merchantId: merchant.id,
                    remaining: budgetCheck.remaining,
                });
                return this.createFallbackResponse(context);
            }
            try {
                const systemPrompt = this.buildSystemPrompt(merchant, catalogItems);
                const conversationHistory = this.buildConversationHistory(recentMessages);
                const userPrompt = this.buildUserPrompt(conversation, customerMessage);
                const response = await (0, helpers_1.withTimeout)((0, helpers_1.withRetry)(() => this.callOpenAI(systemPrompt, conversationHistory, userPrompt), { maxRetries: 2, initialDelayMs: 1000 }), this.timeoutMs, "OpenAI request timed out");
                // Extract parsed response from OpenAI structured output
                const parsedResponse = response.choices?.[0]?.message?.parsed ||
                    response.parsed ||
                    response;
                // Validate response with Zod
                const validated = this.validateResponse(parsedResponse);
                // Update token usage
                const tokensUsed = response.usage?.total_tokens || 0;
                await this.merchantRepository.incrementTokenUsage(merchant.id, (0, helpers_1.getTodayDate)(), tokensUsed);
                // Check confidence threshold
                if (validated.confidence < 0.5) {
                    logger.warn("Low confidence response", {
                        merchantId: merchant.id,
                        confidence: validated.confidence,
                    });
                    // Still use the response but log for monitoring
                }
                return createLlmResult(validated, tokensUsed, true);
            }
            catch (error) {
                const err = error;
                logger.error("LLM processing failed", err, {
                    merchantId: merchant.id,
                    errorMessage: err.message,
                    errorName: err.name,
                    timeoutMs: this.timeoutMs,
                });
                return this.createFallbackResponse(context);
            }
        }
        async callOpenAI(systemPrompt, conversationHistory, userPrompt) {
            return this.client.beta.chat.completions.parse({
                model: this.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    ...conversationHistory,
                    { role: "user", content: userPrompt },
                ],
                response_format: {
                    type: "json_schema",
                    json_schema: llm_schema_1.LLM_RESPONSE_JSON_SCHEMA,
                },
                max_tokens: this.maxTokens,
                temperature: 0.7,
            });
        }
        validateResponse(parsed) {
            const result = llm_schema_1.LlmResponseValidationSchema.safeParse(parsed);
            if (!result.success) {
                logger.warn("LLM response validation failed", {
                    errors: result.error.errors,
                });
                throw new Error("Invalid LLM response structure");
            }
            return result.data;
        }
        buildSystemPrompt(merchant, catalogItems) {
            const categorySpecificRules = this.getCategoryRules(merchant.category);
            const catalogSummary = this.buildCatalogSummary(catalogItems);
            const negotiationRules = this.buildNegotiationRules(merchant.negotiationRules);
            const activePromotion = merchant.negotiationRules.activePromotion;
            const hasActivePromotion = activePromotion?.enabled && activePromotion?.discountPercent > 0;
            return `أنت مساعد ذكي لخدمة العملاء لمتجر "${merchant.name}" (فئة: ${merchant.category}).
تتحدث باللهجة المصرية العامية بأسلوب ${merchant.config.tone || "friendly"}.

# 🔴 قواعد الخصم والعروض:
${hasActivePromotion
                ? `
🎉 **عندنا عرض حالياً!**
✅ العرض: ${activePromotion.description}
✅ الخصم: ${activePromotion.discountPercent}%
${activePromotion.validUntil ? `⏰ العرض ساري لغاية: ${activePromotion.validUntil}` : ""}

👉 لما العميل يطلب منتجات:
- قوله عن العرض: "عندنا عرض دلوقتي - ${activePromotion.description}"
- طبّق الخصم تلقائياً على الطلب
- اذكر السعر الأصلي والسعر بعد الخصم
`
                : `
❌ ممنوع تماماً تعرض خصم من نفسك
❌ ممنوع تذكر كلمة "خصم" إلا لما العميل يطلب
✅ اعرض خصم فقط لما العميل يقول: "عايز خصم", "ممكن خصم", "غالي", "كتير"
`}
✅ أقصى خصم: ${merchant.negotiationRules.maxDiscountPercent || 10}%

# قواعد أساسية:
1. رد دايماً بالعربي المصري
2. اسأل سؤال واحد بس في كل رد (مش أكتر)
3. لو العميل بيسأل عن منتج مش موجود، قوله إنه مش متوفر
4. ${categorySpecificRules}

# ⭐ قواعد الترحيب بالاسم:
- لما العميل يقولك اسمه (زي "أحمد", "محمد", "سارة"):
  ✅ لازم ترد: "أهلاً يا [الاسم]! اتشرفنا بيك 😊 إزاي أقدر أساعدك؟"
  ❌ مش ترد على طول بسؤال عن التليفون أو العنوان
- استخدم اسم العميل في الردود اللي بعد كده

# الكتالوج المتاح (الأسعار الرسمية):
${catalogSummary}

# قواعد التوصيل:
- رسوم التوصيل: ${merchant.deliveryRules.defaultFee || 50} جنيه
- التوصيل المجاني: ${merchant.negotiationRules.freeDeliveryThreshold ? `للطلبات فوق ${merchant.negotiationRules.freeDeliveryThreshold} جنيه` : "غير متاح"}
- رسوم التوصيل الأساسية: ${merchant.deliveryRules.defaultFee || 50} جنيه

# ⚠️ قواعد مهمة جداً للبيانات المطلوبة:
قبل تأكيد أي طلب، لازم تتأكد من توفر كل المعلومات دي:
1. **اسم العميل** - لو مش معروف، اسأل "ممكن اسمك الكريم؟"
2. **رقم التليفون** - ⚠️ رقم التليفون بيتسجل تلقائياً من الواتساب. متسألش عن الرقم إلا لو العميل قال يريد رقم مختلف.
3. **العنوان الكامل** - لازم يشمل:
   - المنطقة/الحي (مثل: المعادي، مدينة نصر)
   - الشارع
   - رقم العمارة/المبنى
   - رقم الشقة أو الدور
   لو العميل قال منطقة بس زي "المعادي"، اسأل: "ممكن العنوان بالتفصيل؟ الشارع ورقم العمارة والشقة"

# ⚠️ قواعد التأكيد:
- لما العميل يقول "تمام" أو "أيوه" أو "موافق":
  - لو كل البيانات موجودة (اسم، تليفون، عنوان كامل، منتجات) → استخدم actionType = "CONFIRM_ORDER" أو "CREATE_ORDER"
  - لو في بيانات ناقصة → اسأل عن البيانات الناقصة واستخدم actionType = "ASK_CLARIFYING_QUESTION"

# ⚠️ قاعدة الأسعار - مهم جداً:
- استخدم الأسعار من الكتالوج فقط
- لما تذكر سعر في الرد، لازم يكون نفس السعر في الكتالوج
- احسب المجموع صح: (سعر × كمية) لكل منتج + رسوم التوصيل - الخصم (لو في)
- مثال: تيشيرت 150 × 2 = 300 + بنطلون 350 × 1 = 350 + توصيل 50 = 700 جنيه

# ملاحظة عن العناوين:
- "التجمع", "مدينة نصر", "المعادي", "الزمالك", "الشيخ زايد" كلها أسماء مناطق وليست أسماء أشخاص
- لما حد يقول "أنا في التجمع" ده يعني المنطقة مش اسمه

# تعليمات الاختيار:
- لما العميل يقول رقم بس زي "2"، اسأله: "2 إيه بالظبط؟" عشان تتأكد من اختياره
- لما في أكتر من لون متاح، اسأل العميل يختار لون معين

# ⚠️ قواعد المنتجات والمقاسات والألوان (مهم جداً):
- استخدم اسم المنتج بالظبط زي ما هو في الكتالوج
- لو العميل طلب "تيشيرت أحمر" وعندك "تيشيرت قطن أبيض" و"تيشيرت قطن أسود" بس، قوله إن اللون الأحمر مش متوفر واعرض الألوان المتاحة
- ⚠️ لكل منتج في الكتالوج له مقاسات وألوان → لازم تسأل عن كل الخيارات المتاحة:
  - لو المنتج له مقاسات وألوان → اسأل عن الاتنين قبل التأكيد
  - مثال: "إيه المقاس والون اللي تحبه للبنطلون الجينز؟ عندنا مقاسات 30-38 وألوان أزرق وأسود ورمادي"
  - ❌ متأكدش الطلب لو في مقاس أو لون ناقص
`;
        }
        getCategoryRules(category) {
            const rules = {
                CLOTHES: "لازم تسأل عن المقاس واللون للهدوم",
                FOOD: "اسأل عن الإضافات والتعديلات على الأكل",
                SUPERMARKET: "اسأل لو العميل موافق على البدائل لو منتج مش متوفر",
                GENERIC: "اتبع الإجراءات العامة",
            };
            return rules[category] || rules.GENERIC;
        }
        buildCatalogSummary(items) {
            if (items.length === 0)
                return "لا توجد منتجات متاحة حالياً";
            return items
                .slice(0, 20)
                .map((item) => {
                const variants = item.variants.length > 0
                    ? ` (${item.variants.map((v) => `${v.name === "size" ? "مقاسات" : v.name === "color" ? "ألوان" : v.name}: ${v.values.join(", ")}`).join(" | ")})`
                    : "";
                return `- ${item.nameAr}: ${item.basePrice} جنيه${variants}`;
            })
                .join("\n");
        }
        buildNegotiationRules(rules) {
            if (!rules.allowNegotiation) {
                return "التفاوض غير متاح - الأسعار ثابتة";
            }
            return `التفاوض متاح بحد أقصى ${rules.maxDiscountPercent || 10}%`;
        }
        buildConversationHistory(messages) {
            return messages.slice(-10).map((msg) => ({
                role: msg.direction === "inbound" ? "user" : "assistant",
                content: msg.text || "",
            }));
        }
        buildUserPrompt(conversation, customerMessage) {
            const cartItems = conversation.cart.items || [];
            const cartSummary = cartItems.length > 0
                ? `السلة الحالية:\n${cartItems.map((i) => `- ${i.name} × ${i.quantity} = ${i.total} جنيه`).join("\n")}\nالمجموع الفرعي: ${conversation.cart.subtotal || conversation.cart.total} جنيه${conversation.cart.discount ? `\nالخصم: ${conversation.cart.discount} جنيه` : ""}${conversation.cart.deliveryFee ? `\nالتوصيل: ${conversation.cart.deliveryFee} جنيه` : ""}\nالإجمالي: ${conversation.cart.total} جنيه`
                : "السلة فارغة";
            // Build collected info summary
            const info = conversation.collectedInfo;
            const collectedParts = [];
            if (info.customerName)
                collectedParts.push(`الاسم: ${info.customerName}`);
            if (info.phone)
                collectedParts.push(`التليفون: ${info.phone}`);
            if (info.address) {
                const addr = typeof info.address === "object"
                    ? info.address.raw_text || JSON.stringify(info.address)
                    : info.address;
                collectedParts.push(`العنوان: ${addr}`);
            }
            const collectedInfo = collectedParts.length > 0 ? collectedParts.join("\n") : "لا يوجد";
            // Check what's missing
            const missingParts = [];
            if (!info.customerName)
                missingParts.push("اسم العميل");
            if (!info.phone)
                missingParts.push("رقم التليفون");
            if (!info.address ||
                (typeof info.address === "object" && !info.address.raw_text))
                missingParts.push("العنوان الكامل");
            if (cartItems.length === 0)
                missingParts.push("المنتجات");
            return `حالة المحادثة: ${conversation.state}

${cartSummary}

المعلومات المتوفرة:
${collectedInfo}

المعلومات الناقصة: ${missingParts.length > 0 ? missingParts.join(", ") : "كل المعلومات متوفرة"}

رسالة العميل: "${customerMessage}"

تعليمات: تحليل الرسالة ورد بشكل مناسب. إذا كانت هناك معلومات ناقصة ولم يطلبها العميل بعد، اسأل عنها.`;
        }
        async checkTokenBudget(merchant) {
            const usage = await this.merchantRepository.getTokenUsage(merchant.id, (0, helpers_1.getTodayDate)());
            const used = usage?.tokensUsed || 0;
            const budget = merchant.dailyTokenBudget;
            const remaining = budget - used;
            return {
                hasRemaining: remaining > 0,
                remaining: Math.max(0, remaining),
            };
        }
        async getRemainingBudget(merchantId) {
            const merchant = await this.merchantRepository.findById(merchantId);
            if (!merchant)
                return 0;
            const check = await this.checkTokenBudget(merchant);
            return check.remaining;
        }
        createFallbackResponse(context) {
            const { conversation } = context;
            // Determine fallback action based on state
            let reply = templates_1.ARABIC_TEMPLATES.BUDGET_EXCEEDED;
            let actionType = enums_1.ActionType.ASK_CLARIFYING_QUESTION;
            if (conversation.missingSlots.length > 0) {
                const slot = conversation.missingSlots[0];
                const questions = {
                    product: templates_1.ARABIC_TEMPLATES.ASK_PRODUCT,
                    quantity: templates_1.ARABIC_TEMPLATES.ASK_QUANTITY,
                    customer_name: templates_1.ARABIC_TEMPLATES.ASK_NAME,
                    phone: templates_1.ARABIC_TEMPLATES.ASK_PHONE,
                    address_city: templates_1.ARABIC_TEMPLATES.ASK_ADDRESS_CITY,
                    address_area: templates_1.ARABIC_TEMPLATES.ASK_ADDRESS_AREA,
                };
                reply = questions[slot] || templates_1.ARABIC_TEMPLATES.FALLBACK;
            }
            return {
                response: {
                    actionType,
                    reply_ar: reply,
                    confidence: 0.5,
                    missing_slots: conversation.missingSlots,
                },
                tokensUsed: 0,
                llmUsed: false,
            };
        }
    };
    return LlmService = _classThis;
})();
exports.LlmService = LlmService;
