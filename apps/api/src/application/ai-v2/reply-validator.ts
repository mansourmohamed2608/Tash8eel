import {
  AiV2RenderOutput,
  MessageUnderstandingV2,
  ReplyPlanV2,
  RuntimeContextV2,
  ToolActionNameV2,
  ToolActionResultV2,
} from "./ai-v2.types";

const PHONE_RE =
  /(?:\+?\d[\d\s\-()]{6,}\d)|(?:رقم(?:ك|كم)?\s*(?:هو)?\s*[:：]?\s*\d+)/iu;
const DELIVERY_ASK_RE =
  /(?:عنوانك|عنوان\s+التوصيل|هتستلم\s+(?:فين|منين)|delivery\s+(?:address|location)|your\s+address|deliver\s+to)/iu;
const PAYMENT_ASK_RE =
  /(?:طريقة\s+(?:الدفع|السداد)|تدفع\s+(?:إزاي|ازاي)|payment\s+(?:method|type)|how\s+(?:will|would)\s+you\s+pay)/iu;
const GENERIC_HELP_RE =
  /(?:ازاي\s+اقدر\s+اساعدك|أقدر\s+أساعدك|تحب\s+أساعدك\s+في\s+إيه|how\s+can\s+i\s+help|what\s+can\s+i\s+do\s+for\s+you)/iu;
const INTERNAL_MARKERS =
  /\[internal\]|visibility:\s*internal|kb\s*internal|staff_only|INTERNAL_ONLY|private_only/i;
const GREETING_RE = /^(?:أهلاً|اهلا|مرحبا|السلام عليكم|hi|hello|hey)\b/iu;
const COMPLETION_CLAIM_RE =
  /(?:تم\s+(?:إنشاء|تأكيد|تسجيل|استرجاع|رد)|اتأكد|اتسجل|order\s+(?:created|confirmed|completed)|payment\s+(?:verified|confirmed)|refund\s+(?:done|completed)|return\s+(?:done|completed))/iu;
const ORDER_CREATED_CLAIM_RE =
  /(?:تم\s+(?:إنشاء|عمل|تسجيل)\s+(?:ال)?(?:طلب|اوردر|الأوردر|مسودة)|عملت(?:لك)?\s+(?:ال)?(?:طلب|اوردر|الأوردر)|سجلت(?:لك)?\s+(?:ال)?(?:طلب|اوردر|الأوردر)|order\s+(?:created|placed|confirmed|completed)|draft\s+order\s+created)/iu;
const ORDER_UPDATED_CLAIM_RE =
  /(?:تم\s+(?:تحديث|تعديل)\s+(?:ال)?(?:طلب|اوردر|الأوردر|مسودة)|حدثت(?:لك)?\s+(?:ال)?(?:طلب|اوردر|الأوردر)|عدلت(?:لك)?\s+(?:ال)?(?:طلب|اوردر|الأوردر)|order\s+updated|draft\s+order\s+updated)/iu;
const ORDER_STATUS_CLAIM_RE =
  /(?:طلبك\s+(?:في الطريق|اتشحن|وصل|جاهز)|order\s+is\s+(?:shipped|delivered|ready|on the way)|status\s+is)/iu;
const PAYMENT_VERIFIED_RE =
  /(?:(?:تم\s+تأكيد\s+الدفع)|الدفع\s+(?:اتأكد|تم تأكيده)|payment\s+(?:verified|confirmed)|proof\s+verified)/iu;
const REFUND_RETURN_COMPLETED_RE =
  /(?:تم\s+(?:استرجاع|رد|استبدال)|استرجاعك\s+تم|refund\s+(?:done|completed|processed)|return\s+(?:done|completed|processed)|exchange\s+(?:done|completed|processed))/iu;
const COMPLAINT_RECORDED_RE =
  /(?:تم\s+(?:تسجيل|رفع)\s+(?:ال)?(?:شكوى|مشكلة)|سجلت(?:لك)?\s+(?:ال)?(?:شكوى|مشكلة)|complaint\s+(?:recorded|filed|created))/iu;
const FEEDBACK_RECORDED_RE =
  /(?:تم\s+(?:تسجيل|حفظ)\s+(?:ال)?(?:رأيك|تقييمك|feedback)|سجلت(?:لك)?\s+(?:ال)?(?:رأيك|تقييمك)|feedback\s+(?:recorded|saved))/iu;
const OFFER_RE = /(?:خصم|عرض|discount|offer|promo|coupon)/iu;
const POLICY_RE = /(?:استرجاع|استبدال|ضمان|refund|return|exchange|warranty)/iu;
const ADDRESS_LOCATION_RE =
  /(?:عنوان|العنوان|مكاننا|موقعنا|فرعنا|location|address|store\s+location)/iu;
const PAYMENT_FACT_RE =
  /(?:دفع|payment|cash|visa|wallet|تحويل|كاش|فيزا|instapay|انستاباي|vodafone\s*cash|فودافون\s*كاش)/iu;

export interface ReplyValidationResultV2 {
  ok: boolean;
  replyText: string;
  failures: string[];
}

export class ReplyValidatorV2 {
  static validate(input: {
    render: AiV2RenderOutput;
    runtimeContext: RuntimeContextV2;
    understanding: MessageUnderstandingV2;
    plan: ReplyPlanV2;
    toolResults: ToolActionResultV2[];
  }): ReplyValidationResultV2 {
    const failures: string[] = [];
    let replyText = String(input.render.customer_reply || "").trim();

    if (!replyText) {
      failures.push("empty_reply");
      replyText = deterministicRewrite(input, failures);
    }

    if (INTERNAL_MARKERS.test(replyText)) {
      failures.push("possible_internal_kb_leakage");
      replyText = deterministicRewrite(input, failures);
    }

    const questions = replyText.match(/[؟?]/g) || [];
    if (questions.length > input.plan.maxQuestions) {
      failures.push("more_than_one_question");
      replyText = keepFirstQuestionOnly(replyText);
    }

    if (!input.plan.allowedToAskDelivery && DELIVERY_ASK_RE.test(replyText)) {
      failures.push("early_address_or_delivery_ask");
      replyText = deterministicRewrite(input, failures);
    }

    if (!input.plan.allowedToAskPayment && PAYMENT_ASK_RE.test(replyText)) {
      failures.push("early_payment_ask");
      replyText = deterministicRewrite(input, failures);
    }

    if (input.plan.doNotGreetAgain && GREETING_RE.test(replyText)) {
      failures.push("repeated_greeting");
      replyText = stripGreeting(replyText);
    }

    if (input.plan.offTopicRedirectRequired) {
      failures.push("off_topic_general_redirect_required");
      replyText = offTopicReply();
    }

    if (GENERIC_HELP_RE.test(replyText) && customerAskedConcrete(input)) {
      failures.push("generic_help_after_concrete_customer_intent");
      replyText = deterministicRewrite(input, failures);
    }

    const currentRecommendationHash = input.plan.forbiddenRepeats
      .find((item) => item.startsWith("recommendation_hash:"))
      ?.replace("recommendation_hash:", "");
    if (
      currentRecommendationHash &&
      input.runtimeContext.aiV2State.lastRecommendationHash ===
        currentRecommendationHash &&
      input.runtimeContext.aiV2State.salesStage === "recommendation" &&
      !input.understanding.intentTags.includes("product_question") &&
      !input.understanding.intentTags.includes("greeting")
    ) {
      failures.push("repeated_recommendation");
      replyText =
        "عشان ما أكررش نفس الاختيارات، ابعتلي تفضيل مختلف أو ميزانية تقريبية.";
    }

    validateUsedFactIds(input, failures);
    validatePhone(input, replyText, failures);
    validateAddress(input, replyText, failures);
    validatePayment(input, replyText, failures);
    validateOffers(input, replyText, failures);
    validatePolicies(input, replyText, failures);
    validatePrices(input, replyText, failures);
    validateToolCompletionClaims(input, replyText, failures);
    validateManagerEscalation(input, replyText, failures);

    if (failures.some((f) => shouldRewriteFor(f))) {
      replyText = deterministicRewrite(input, failures);
    }

    if ((replyText.match(/[؟?]/g) || []).length > input.plan.maxQuestions) {
      replyText = keepFirstQuestionOnly(replyText);
    }

    return { ok: failures.length === 0, replyText: replyText.trim(), failures };
  }
}

function validateUsedFactIds(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
  failures: string[],
) {
  const allowed = new Set(input.plan.allowedFactIds);
  for (const id of input.render.used_fact_ids || []) {
    if (!allowed.has(id)) failures.push(`used_fact_not_allowed:${id}`);
  }
}

function validatePhone(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
  replyText: string,
  failures: string[],
) {
  if (!PHONE_RE.test(replyText)) return;
  const allowedPhones = input.runtimeContext.merchantFacts
    .filter(
      (fact) =>
        fact.type === "phone" && input.plan.allowedFactIds.includes(fact.id),
    )
    .map((fact) => fact.value);
  if (!allowedPhones.some((phone) => replyText.includes(phone))) {
    failures.push("invented_phone");
  }
}

function validateAddress(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
  replyText: string,
  failures: string[],
) {
  const addressFacts = input.runtimeContext.merchantFacts.filter(
    (fact) =>
      fact.type === "address" && input.plan.allowedFactIds.includes(fact.id),
  );
  const mentionsAddress =
    input.understanding.intentTags.includes("location_question") ||
    ADDRESS_LOCATION_RE.test(replyText);
  if (
    mentionsAddress &&
    addressFacts.length === 0 &&
    !/غير متاح|not available|مش متاح/i.test(replyText)
  ) {
    failures.push("invented_address");
  }
}

function validatePayment(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
  replyText: string,
  failures: string[],
) {
  const methods = input.runtimeContext.merchantFacts.filter(
    (fact) =>
      fact.type === "payment_method" &&
      input.plan.allowedFactIds.includes(fact.id),
  );
  const mentionsPayment =
    input.understanding.intentTags.includes("payment_question") ||
    PAYMENT_FACT_RE.test(replyText);
  if (
    mentionsPayment &&
    methods.length === 0 &&
    !/غير متاح|not available|مش متاح/i.test(replyText)
  ) {
    failures.push("invented_payment_method");
  }
}

function validateOffers(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
  replyText: string,
  failures: string[],
) {
  if (!OFFER_RE.test(replyText)) return;
  const offerFacts = input.runtimeContext.ragFacts.offerFacts.filter((fact) =>
    input.plan.allowedFactIds.includes(fact.id),
  );
  if (
    offerFacts.length === 0 &&
    !/غير متاح|not available|مش متاح/i.test(replyText)
  ) {
    failures.push("invented_offer_or_discount");
  }
}

function validatePolicies(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
  replyText: string,
  failures: string[],
) {
  if (!POLICY_RE.test(replyText)) return;
  const facts = [
    ...input.runtimeContext.merchantFacts.filter((fact) =>
      ["policy", "return_rule", "delivery_rule"].includes(fact.type),
    ),
    ...input.runtimeContext.ragFacts.kbFacts,
    ...input.runtimeContext.ragFacts.businessRuleFacts,
  ].filter((fact) => input.plan.allowedFactIds.includes(fact.id));
  if (
    facts.length === 0 &&
    !/غير متاح|not available|مش متاح/i.test(replyText)
  ) {
    failures.push("invented_policy");
  }
}

function validatePrices(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
  replyText: string,
  failures: string[],
) {
  const pricesInReply = replyText.match(/\b\d{2,7}(?:\.\d+)?\b/g) || [];
  if (pricesInReply.length === 0) return;
  const allowedNumbers = new Set<string>();
  for (const fact of input.runtimeContext.ragFacts.catalogFacts) {
    if (fact.price != null && input.plan.allowedFactIds.includes(fact.id)) {
      allowedNumbers.add(String(fact.price));
    }
  }
  for (const number of pricesInReply) {
    const mightBePhone = input.runtimeContext.merchantFacts.some(
      (fact) => fact.type === "phone" && fact.value.includes(number),
    );
    if (!allowedNumbers.has(number) && !mightBePhone) {
      failures.push("invented_price");
      return;
    }
  }
}

function validateToolCompletionClaims(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
  replyText: string,
  failures: string[],
) {
  if (
    ORDER_CREATED_CLAIM_RE.test(replyText) &&
    !hasSuccessfulTool(input.toolResults, "createDraftOrder")
  ) {
    failures.push("order_created_claim_without_createDraftOrder_success");
  }
  if (
    ORDER_UPDATED_CLAIM_RE.test(replyText) &&
    !hasSuccessfulTool(input.toolResults, "updateDraftOrder")
  ) {
    failures.push("order_updated_claim_without_updateDraftOrder_success");
  }
  if (COMPLETION_CLAIM_RE.test(replyText)) {
    const success =
      hasSuccessfulTool(input.toolResults, "createDraftOrder") ||
      hasSuccessfulTool(input.toolResults, "updateDraftOrder") ||
      hasSuccessfulTool(input.toolResults, "verifyPaymentProof") ||
      hasSuccessfulTool(input.toolResults, "recordComplaintNote") ||
      hasSuccessfulTool(input.toolResults, "recordCustomerFeedback");
    if (!success) failures.push("completion_claim_without_tool_success");
  }
  if (
    ORDER_STATUS_CLAIM_RE.test(replyText) &&
    !hasSuccessfulTool(input.toolResults, "getOrderStatus")
  ) {
    failures.push("unsupported_order_status_claim");
  }
  if (
    PAYMENT_VERIFIED_RE.test(replyText) &&
    !hasSuccessfulTool(input.toolResults, "verifyPaymentProof")
  ) {
    failures.push("payment_proof_verification_claim_without_tool_success");
  }
  if (REFUND_RETURN_COMPLETED_RE.test(replyText)) {
    failures.push("refund_return_completion_without_tool_success");
  }
  if (
    COMPLAINT_RECORDED_RE.test(replyText) &&
    !hasSuccessfulTool(input.toolResults, "recordComplaintNote")
  ) {
    failures.push("complaint_recorded_claim_without_tool_success");
  }
  if (
    FEEDBACK_RECORDED_RE.test(replyText) &&
    !hasSuccessfulTool(input.toolResults, "recordCustomerFeedback")
  ) {
    failures.push("feedback_recorded_claim_without_tool_success");
  }
}

function validateManagerEscalation(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
  replyText: string,
  failures: string[],
) {
  if (!input.understanding.intentTags.includes("manager_request")) return;
  if (
    /مديرنا|manager\s+is|اسمه|name is|رقمه|phone/i.test(replyText) &&
    !hasSuccessfulTool(input.toolResults, "recordComplaintNote")
  ) {
    failures.push("fake_manager_escalation_detail");
  }
}

function deterministicRewrite(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
  failures: string[],
): string {
  const tags = input.understanding.intentTags;
  const fact = factAccess(input);

  if (
    input.plan.offTopicRedirectRequired ||
    tags.includes("off_topic_general")
  ) {
    return offTopicReply();
  }

  if (tags.includes("order_status_question")) {
    return hasSuccessfulTool(input.toolResults, "getOrderStatus")
      ? "راجعت أداة متابعة الطلب. ابعت رقم الطلب لو محتاج تفاصيل أدق."
      : "مش متاح عندي تأكيد حالة الطلب بدون أداة متابعة الطلب. ابعت رقم الطلب عشان أراجع المتاح.";
  }

  if (tags.includes("payment_question")) {
    if (fact.paymentMethods.length > 0) {
      return `طريقة الدفع المتاحة حسب بيانات المتجر: ${fact.paymentMethods[0]}.`;
    }
    return "طرق الدفع غير متاحة عندي في بيانات المتجر حالياً.";
  }

  if (tags.includes("delivery_question")) {
    const deliveryFact = input.runtimeContext.merchantFacts.find(
      (fact) =>
        ["delivery_rule", "policy"].includes(fact.type) &&
        input.plan.allowedFactIds.includes(fact.id),
    );
    return deliveryFact
      ? `معلومات التوصيل حسب بيانات المتجر: ${deliveryFact.value}.`
      : "معلومات التوصيل غير متاحة عندي بشكل مؤكد حالياً.";
  }

  if (tags.includes("location_question") || tags.includes("contact_question")) {
    if (tags.includes("location_question")) {
      return fact.address
        ? `العنوان المسجل للمتجر: ${fact.address}.`
        : "العنوان غير متاح عندي في بيانات المتجر حالياً.";
    }
    return fact.phone
      ? `رقم التواصل المتاح هو ${fact.phone}.`
      : "رقم التواصل غير متاح عندي في بيانات المتجر حالياً.";
  }

  if (input.runtimeContext.aiV2State.salesStage === "complaint") {
    return "حقك علينا. ابعت رقم الطلب وتفاصيل المشكلة عشان أسجلها بدقة.";
  }

  if (tags.includes("price_question")) {
    const priced = input.runtimeContext.ragFacts.catalogFacts.find(
      (catalogFact) =>
        catalogFact.price != null &&
        input.plan.allowedFactIds.includes(catalogFact.id),
    );
    return priced
      ? `${priced.name} سعره ${priced.price}.`
      : "السعر غير متاح عندي من بيانات المتجر حالياً. ابعت اسم المنتج أو صورته عشان أراجع المتاح.";
  }

  if (
    tags.includes("product_question") ||
    tags.includes("recommendation_request")
  ) {
    const product = input.runtimeContext.ragFacts.catalogFacts.find(
      (catalogFact) => input.plan.allowedFactIds.includes(catalogFact.id),
    );
    return product
      ? `المتاح عندي من بيانات المتجر: ${product.name}. تحب تعرف تفاصيله؟`
      : "محتاج اسم المنتج أو وصفه عشان أراجع المتاح عندي بدقة.";
  }

  if (failures.includes("repeated_greeting")) {
    return "معاك. ابعتلي تفاصيل طلبك أو سؤالك عن المتجر.";
  }

  return "معاك. ابعتلي تفاصيل طلبك أو سؤالك عن المتجر.";
}

function factAccess(input: Parameters<typeof ReplyValidatorV2.validate>[0]) {
  const allowed = new Set(input.plan.allowedFactIds);
  const merchantFacts = input.runtimeContext.merchantFacts.filter((fact) =>
    allowed.has(fact.id),
  );
  return {
    phone: merchantFacts.find((fact) => fact.type === "phone")?.value || null,
    address:
      merchantFacts.find((fact) => fact.type === "address")?.value || null,
    paymentMethods: merchantFacts
      .filter((fact) => fact.type === "payment_method")
      .map((fact) => fact.value),
  };
}

function customerAskedConcrete(
  input: Parameters<typeof ReplyValidatorV2.validate>[0],
) {
  return input.understanding.intentTags.some((tag) =>
    [
      "product_question",
      "recommendation_request",
      "price_question",
      "buying_intent",
      "complaint",
      "payment_question",
      "delivery_question",
      "contact_question",
      "location_question",
      "policy_question",
      "order_status_question",
    ].includes(tag),
  );
}

function hasSuccessfulTool(
  results: ToolActionResultV2[],
  actionName: ToolActionNameV2,
): boolean {
  return results.some(
    (result) =>
      result.actionName === actionName &&
      result.available &&
      result.attempted &&
      result.success,
  );
}

function shouldRewriteFor(failure: string): boolean {
  return (
    failure.startsWith("used_fact_not_allowed:") ||
    [
      "invented_phone",
      "invented_address",
      "invented_payment_method",
      "invented_offer_or_discount",
      "invented_policy",
      "invented_price",
      "order_created_claim_without_createDraftOrder_success",
      "order_updated_claim_without_updateDraftOrder_success",
      "completion_claim_without_tool_success",
      "unsupported_order_status_claim",
      "payment_proof_verification_claim_without_tool_success",
      "refund_return_completion_without_tool_success",
      "complaint_recorded_claim_without_tool_success",
      "feedback_recorded_claim_without_tool_success",
      "fake_manager_escalation_detail",
      "generic_help_after_concrete_customer_intent",
      "early_address_or_delivery_ask",
      "early_payment_ask",
      "possible_internal_kb_leakage",
      "empty_reply",
    ].includes(failure)
  );
}

function offTopicReply(): string {
  return "أقدر أساعدك في أسئلة المتجر والمنتجات والطلبات فقط. ابعتلي طلبك من المتجر.";
}

function keepFirstQuestionOnly(text: string): string {
  const marks: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "؟" || text[i] === "?") marks.push(i);
  }
  if (marks.length <= 1) return text;
  return text
    .slice(0, marks[1])
    .replace(/[\s,،.!؟?\n]+$/, "")
    .trim();
}

function stripGreeting(text: string): string {
  return (
    text
      .replace(GREETING_RE, "")
      .replace(/^[\s,،.!؟?]+/, "")
      .trim() || "معاك."
  );
}
