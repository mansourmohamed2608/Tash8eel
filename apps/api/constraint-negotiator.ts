import { Merchant } from "../../domain/entities/merchant.entity";

export interface ConstraintNegotiationResult {
  reply: string;
  axes: string[];
  reasoning: string;
}

const AXIS_LABELS: Record<string, string> = {
  deadline: "الميعاد",
  size: "المقاس",
  quality: "مستوى التفاصيل",
  source_image_quality: "وضوح الصورة الأصلية",
  budget: "الميزانية",
};

export class ConstraintNegotiator {
  static compose(
    customerMessage: string,
    merchant: Merchant,
  ): ConstraintNegotiationResult | null {
    const text = String(customerMessage || "").trim();
    if (!text) return null;

    const axes = this.detectAxes(text, merchant);
    if (axes.length < 2) return null;

    const labels = axes.map((axis) => AXIS_LABELS[axis] || axis);
    const conflict = labels.join("، ");
    const lastLabel = labels[labels.length - 1];
    const question =
      labels.length >= 3
        ? `أي واحدة فيهم نقدر نعدّلها: ${labels.slice(0, -1).join("، ")}، ولا ${lastLabel}؟`
        : `أنهي جزء ممكن نعدّله: ${labels[0]} ولا ${labels[1]}؟`;

    return {
      axes,
      reply: `الطلب ممكن يتعمل، بس فيه كذا شرط محتاج يتظبط مع بعض: ${conflict}. ${question}`,
      reasoning: `dialog_constraint_negotiator:${axes.join(",")}`,
    };
  }

  private static detectAxes(text: string, merchant: Merchant): string[] {
    const normalized = text.toLowerCase();
    const axes: string[] = [];
    const add = (axis: string) => {
      if (!axes.includes(axis)) axes.push(axis);
    };

    if (this.hasTightDeadline(normalized)) add("deadline");
    if (this.hasLargeOrUnusualSize(normalized)) add("size");
    if (this.hasHighDetailRequest(normalized, merchant)) add("quality");
    if (this.hasWeakSourceMedia(normalized)) add("source_image_quality");
    if (this.hasBudgetPressure(normalized)) add("budget");

    return axes;
  }

  private static hasTightDeadline(text: string): boolean {
    if (/ساعتين|ساعة\s*واحدة|خلال\s*ساعة|خلال\s*ساعتين/i.test(text)) {
      return true;
    }
    const hourMatch = text.match(/(?:بعد\s*)?(\d+|ساعتين|ساعة)\s*(?:ساع[هة]|hours?|h)\b/i);
    if (hourMatch) {
      const raw = hourMatch[1];
      const hours =
        raw === "ساعتين" ? 2 : raw === "ساعة" ? 1 : Number.parseInt(raw, 10);
      if (Number.isFinite(hours) && hours <= 24) return true;
    }
    return /النهارده|اليوم|حال[اأ]ً|فوري|مستعجل\s*جداً|same\s*day|today|asap/i.test(
      text,
    );
  }

  private static hasLargeOrUnusualSize(text: string): boolean {
    const sizeMatch = text.match(/(\d{2,3})\s*[x×*]\s*(\d{2,3})/i);
    if (!sizeMatch) return false;
    const width = Number.parseInt(sizeMatch[1], 10);
    const height = Number.parseInt(sizeMatch[2], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
    return width * height >= 10000 || width >= 150 || height >= 150;
  }

  private static hasHighDetailRequest(text: string, merchant: Merchant): boolean {
    const config = (merchant?.config || {}) as Record<string, any>;
    const configuredTerms = Array.isArray(config.constraint_quality_terms)
      ? config.constraint_quality_terms
      : [];
    const qualityTerms = [
      "فوتوريال",
      "photoreal",
      "واقعي جداً",
      "تفاصيل دقيقة",
      "مطابقة",
      "نسخة طبق الأصل",
      ...configuredTerms,
    ];
    return qualityTerms.some((term) => text.includes(String(term).toLowerCase()));
  }

  private static hasWeakSourceMedia(text: string): boolean {
    return /مش\s*واضح|مش\s*واضحة|مغبشة|مهزوزة|blur|blurry|low\s*quality|رديئة/i.test(
      text,
    );
  }

  private static hasBudgetPressure(text: string): boolean {
    return /ميزانية|budget|غالي|أرخص|رخيص|تحت\s*\d+|less\s*than/i.test(text);
  }
}
