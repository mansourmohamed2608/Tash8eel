/**
 * Retrieval path routing types and classifier for Tash8heel AI.
 *
 * Schema reference: TASH8EEL_KB_RAG_SCHEMA.md §12 — Router Decision Model
 *
 * Before answering, the assistant must classify every incoming request into
 * one or more retrieval paths so it queries only the relevant knowledge
 * sources. Merchant-specific behavior must not change these path definitions;
 * only query content and knowledge layers differ per merchant.
 */

/** The seven canonical retrieval paths from KB_RAG_SCHEMA §12. */
export type RetrievalPath =
  | "static_kb" // Layer 1: FAQs, policies, delivery/payment rules
  | "structured_catalog" // Layer 2: products, prices, variants, availability
  | "live_data" // Layer 3: order status, stock counts, payment state
  | "image_analysis" // Vision path: customer sent product/reference image
  | "ocr" // OCR path: customer sent screenshot or document
  | "voice" // Voice note path: transcription required first
  | "escalate"; // Human hand-off: low confidence, risky, unsupported

export interface RetrievalDecision {
  /** All paths relevant to this request (may be more than one). */
  paths: RetrievalPath[];
  /** The single highest-priority path to query first. */
  primaryPath: RetrievalPath;
  /** Human-readable reason for logging/debugging. */
  reason?: string;
}

/**
 * Classify a customer message into the likely retrieval path(s).
 *
 * This is a signal layer — not a hard gate. The assistant may widen paths
 * based on retrieved content. Designed to be merchant-type-agnostic:
 * no hardcoded business vertical keywords.
 */
export function classifyRetrievalPaths(
  messageText: string,
  messageType: string,
): RetrievalDecision {
  const type = (messageType || "text").toLowerCase().trim();

  // Media type gates override text classification entirely
  if (type === "image" || type === "document") {
    return {
      paths: ["image_analysis"],
      primaryPath: "image_analysis",
      reason: "message_type=image|document",
    };
  }
  if (type === "audio" || type === "voice") {
    return {
      paths: ["voice"],
      primaryPath: "voice",
      reason: "message_type=audio|voice",
    };
  }

  const normalized = (messageText || "")
    .toLowerCase()
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/[ـ]/g, "")
    .trim();

  const paths = new Set<RetrievalPath>();
  const reasons: string[] = [];

  // ── Live data signals ─────────────────────────────────────────────────────
  // Matches: order status, payment state, stock inquiries
  const liveDataTerms = [
    "طلبي",
    "اوردري",
    "اوردر",
    "order",
    "وين طلبي",
    "فين طلبي",
    "متى يوصل",
    "امتى يجي",
    "الشحنة",
    "تتبع",
    "حالة الطلب",
    "رقم الطلب",
    "مدفوع",
    "سدد",
    "دفع",
    "فاتورة",
    "invoice",
  ];
  if (liveDataTerms.some((t) => normalized.includes(t))) {
    paths.add("live_data");
    reasons.push("live_data_term");
  }

  // ── Structured catalog signals ────────────────────────────────────────────
  // Generic product/service lookup terms — intentionally vertical-agnostic
  const catalogTerms = [
    "سعر",
    "بكام",
    "بقد",
    "price",
    "كم",
    "متوفر",
    "في المخزن",
    "كمية",
    "stock",
    "منتج",
    "خدمة",
    "صنف",
    "بتبيع",
    "بتبيعو",
    "عندك",
    "عندكم",
    "كتالوج",
    "catalog",
    "مقاس",
    "لون",
    "نوع",
    "اختيار",
    "variant",
    "option",
  ];
  if (catalogTerms.some((t) => normalized.includes(t))) {
    paths.add("structured_catalog");
    reasons.push("catalog_term");
  }

  // ── Escalation signals ────────────────────────────────────────────────────
  // Complaints, negotiation, manager requests
  const escalationTerms = [
    "مشكلة",
    "شكوى",
    "مدير",
    "مسؤول",
    "complaint",
    "escalate",
    "manager",
    "supervisor",
    "احتجاج",
    "غلط",
    "خطأ",
    "مش صح",
    "problem",
    "حقوقي",
    "فين حقي",
    "legal",
    "قانون",
    "وحش",
    "مش راضي",
    "زعلان",
  ];
  if (escalationTerms.some((t) => normalized.includes(t))) {
    paths.add("escalate");
    reasons.push("escalation_term");
  }

  // ── Static KB signals ─────────────────────────────────────────────────────
  // Policy, delivery info, payment methods, working hours, returns
  const staticKbTerms = [
    "سياسة",
    "استرداد",
    "رجوع",
    "return",
    "refund",
    "توصيل",
    "delivery",
    "shipping",
    "شحن",
    "طريقة دفع",
    "payment",
    "دفع اون لاين",
    "كاش",
    "ضمان",
    "guarantee",
    "warranty",
    "شروط",
    "terms",
    "اشتراطات",
    "ساعات العمل",
    "working hours",
    "متى تفتح",
    "متى تقفل",
    "عنوان",
    "address",
    "فين موقعكم",
    "تواصل",
    "contact",
  ];
  if (staticKbTerms.some((t) => normalized.includes(t))) {
    paths.add("static_kb");
    reasons.push("static_kb_term");
  }

  // Default: if nothing matched, try static KB first (catches general questions)
  if (paths.size === 0) {
    paths.add("static_kb");
    reasons.push("default");
  }

  // Primary path: deterministic priority order (most specific first)
  const priority: RetrievalPath[] = [
    "live_data",
    "structured_catalog",
    "escalate",
    "image_analysis",
    "voice",
    "ocr",
    "static_kb",
  ];
  const pathArray = Array.from(paths);
  const primaryPath =
    priority.find((p) => pathArray.includes(p)) ?? "static_kb";

  return {
    paths: pathArray,
    primaryPath,
    reason: reasons.join(","),
  };
}
