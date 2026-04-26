import { isObviouslyOffTopic } from "./llm.service";

// ── Helpers ──────────────────────────────────────────────────────────────────
const blocked = (msg: string) => expect(isObviouslyOffTopic(msg)).toBe(true);
const passes = (msg: string) => expect(isObviouslyOffTopic(msg)).toBe(false);

// ── Should be BLOCKED (off-topic — 0 tokens used) ───────────────────────────
describe("isObviouslyOffTopic — blocked cases", () => {
  // General knowledge
  it("blocks capital city question", () => blocked("ما هي عاصمة فرنسا؟"));
  it("blocks country history", () => blocked("ما هو تاريخ مصر القديمة"));
  it("blocks who is the president", () =>
    blocked("من هو رئيس الدولة السعودية"));

  // Jokes
  it("blocks احكيلي نكتة", () => blocked("احكيلي نكتة مضحكة"));
  it("blocks قولي نكتة", () => blocked("قولي نكتة"));
  it("blocks نكتة مضحكة", () => blocked("عندك نكتة مضحكة؟"));

  // Weather
  it("blocks weather today", () => blocked("الطقس النهارده إيه؟"));
  it("blocks weather tomorrow", () => blocked("الطقس بكره ايه"));
  it("blocks weather now", () => blocked("الطقس دلوقتي"));

  // Politics
  it("blocks politics opinion", () => blocked("رأيك في السياسة المصرية؟"));
  it("blocks government opinion", () => blocked("رايك في الحكومة الجديدة"));

  // Programming
  it("blocks write me code", () => blocked("اكتبلي كود بايثون"));
  it("blocks write me program", () => blocked("اكتبلي برنامج"));
  it("blocks write me script", () => blocked("اكتبلي سكريبت اكسل"));
  it("blocks I want code", () => blocked("عايز كود في جافا"));

  // Translation (unrelated)
  it("blocks translate this paragraph", () =>
    blocked("ترجملي الفقرة دي من انجليزي"));
  it("blocks translate random text", () => blocked("ترجملي كلمة resilience"));

  // Sports
  it("blocks football team name Liverpool", () =>
    blocked("ليفربول هيفوز النهارده؟"));
  it("blocks Barcelona", () => blocked("برشلونة عمل إيه امبارح؟"));
  it("blocks Real Madrid", () => blocked("ريال مدريد لعب امبارح؟"));
  it("blocks football كرة القدم", () => blocked("كرة القدم بتحبها؟"));
  it("blocks كورة النهارده", () => blocked("كورة النهارده امتى؟"));
  it("blocks Messi", () => blocked("ميسي اللاعب الأفضل في العالم؟"));
  it("blocks Ronaldo", () => blocked("رونالدو أحسن من ميسي؟"));
  it("blocks Neymar", () => blocked("نيمار بيلعب فين دلوقتي"));
  it("blocks national team Egypt", () => blocked("منتخب مصر هيلعب امتى"));
  it("blocks match result", () => blocked("نتيجة مباراة امبارح"));
  it("blocks نتيجة المباراة", () => blocked("نتيجة المباراة بتاعت النهارده"));

  // News
  it("blocks أهم الأخبار", () => blocked("أهم الأخبار النهارده"));
  it("blocks آخر الأخبار", () => blocked("آخر الأخبار السياسية"));

  // Medical
  it("blocks medical symptom صداع", () => blocked("عندي صداع شديد "));
  it("blocks medical عندي حمى", () => blocked("عندي حمى منذ أمس "));
  it("blocks كحة", () => blocked("عندي كحة مزمنة "));

  // Entertainment (no product context)
  it("blocks فيلم إيه", () => blocked("فيلم إيه حلو أشوفه؟"));
  it("blocks فيلم جديد", () => blocked("في فيلم جديد نشوفه؟"));
  it("blocks مسلسل إيه", () => blocked("مسلسل إيه حلو النهارده؟"));
  it("blocks مسلسل جديد", () => blocked("في مسلسل جديد ينتهي قريب؟"));

  // Religion Q&A
  it("blocks ما حكم في", () => blocked("ما حكم التدخين في الإسلام؟"));
  it("blocks رأي الدين في", () => blocked("ما رأي الدين في الزواج المبكر"));

  // Pure math
  it("blocks pure arithmetic 3+4", () => blocked("3 + 4"));
  it("blocks pure arithmetic expression", () => blocked("100 / 5 = "));
});

// ── Should PASS through (real customer messages) ─────────────────────────────
describe("isObviouslyOffTopic — pass-through cases", () => {
  // Greetings
  it("passes أهلا", () => passes("أهلا"));
  it("passes مرحبا", () => passes("مرحبا"));
  it("passes السلام عليكم", () => passes("السلام عليكم"));
  it("passes هاي", () => passes("هاي"));

  // Order intent
  it("passes numeric-only short replies", () => passes("200"));
  it("passes عايز أطلب", () => passes("عايز أطلب بيتزا"));
  it("passes عاوز بيتزا", () => passes("عاوز بيتزا مارغريتا"));
  it("passes محتاج منتج", () => passes("محتاج جاكيت شتوي"));
  it("passes اطلب منتج", () => passes("اطلب بنطلون جينز مقاس 32"));

  // Price / catalog questions
  it("passes بكام", () => passes("البيتزا الكبيرة بكام؟"));
  it("passes السعر كام", () => passes("السعر كام للشيرت الأبيض؟"));
  it("passes ايه المنتجات", () => passes("إيه المنتجات المتاحة عندكم؟"));
  it("passes عندكم كتالوج", () => passes("عندكم كتالوج؟"));

  // Delivery
  it("passes توصيل فين", () => passes("بتوصلوا المنصورة؟"));
  it("passes التوصيل بكام", () => passes("التوصيل بكام؟"));
  it("passes دليفري", () => passes("الدليفري بياخد قد ايه؟"));
  it("passes موعد التوصيل", () => passes("موعد التوصيل امتى؟"));

  // Payment
  it("passes دفع كاش", () => passes("بادفع كاش عند الاستلام؟"));
  it("passes بطاقة فيزا", () => passes("ممكن أدفع ببطاقة فيزا؟"));

  // Returns / cancellation
  it("passes استرجاع", () => passes("عايز أعمل استرجاع للطلب"));
  it("passes إلغاء طلب", () => passes("عايز ألغي الطلب بتاعي"));
  it("passes استبدال", () => passes("ممكن استبدال المنتج؟"));

  // Address / info questions
  it("passes العنوان", () => passes("العنوان هو شارع النيل"));
  it("passes رقم التليفون", () => passes("رقم تليفوني 01012345678"));

  // Availability
  it("passes متوفر", () => passes("المنتج ده متوفر؟"));
  it("passes مش متوفر", () => passes("لو مش متوفر فيه بديل؟"));

  // How to order (common real questions)
  it("passes ازاي أطلب", () => passes("ازاي أطلب من عندكم؟"));
  it("passes كيف أطلب", () => passes("كيف أطلب من المتجر؟"));
  it("passes كيف يتم الدفع", () => passes("كيف يتم الدفع؟"));
  it("passes كيف التوصيل", () => passes("كيف يتم التوصيل عندكم؟"));
  it("passes هل يمكن الدفع", () => passes("هل يمكن الدفع عند الاستلام؟"));
  it("passes ممكن أشوف المنتجات", () => passes("ممكن أشوف المنتجات المتاحة؟"));
  it("passes ممكن تساعدني في الطلب", () => passes("ممكن تساعدني في الطلب؟"));

  // Product-related how-to questions
  it("passes ازاي أغير المقاس", () => passes("ازاي أغير المقاس في الطلب؟"));
  it("passes كيف أتابع طلبي", () => passes("كيف أتابع طلبي؟"));

  // Translation WITH product context
  it("passes ترجملي اسم المنتج", () => passes("ترجملي اسم المنتج ده للعربي"));
  it("passes ترجملي العنوان", () => passes("ترجملي العنوان ده"));

  // Edge cases that should NOT be blocked
  it("passes short ok", () => passes("ok"));
  it("passes 1 (too short)", () => passes("1")); // length < 3
  it("passes empty string", () => passes(""));
  it("passes رقم فقط كـ order number", () => passes("رقم طلبي 1234"));
  it("passes عندي سؤال عن طلبي", () => passes("عندي سؤال عن طلبي"));
  it("passes product with الم in name", () => passes("عايز منتج الماس"));
  it("passes question with كورة in product name context", () =>
    passes("عندكم كورة أطفال"));
  it("passes مباراة سعر figurative", () =>
    passes("فيه مباراة سعر بين المنتجين؟"));
});
