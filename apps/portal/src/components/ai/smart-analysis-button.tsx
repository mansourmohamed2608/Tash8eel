"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  PlayCircle,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { portalApi } from "@/lib/client";

type AnalysisContext =
  | "cfo"
  | "analytics"
  | "dashboard"
  | "inventory"
  | "operations";

const ANALYSIS_PROMPTS: Record<AnalysisContext, string> = {
  cfo: `أنت محلل مالي متخصص. بناءً على بيانات النظام الحية، قم بتحليل شامل يشمل:
1. ملخص الأداء المالي (إيرادات، مصاريف، هوامش ربح)
2. تحليل التدفق النقدي وتحصيل COD
3. أهم 3 نقاط قوة مالية
4. أهم 3 مخاطر أو تحديات
5. توصيات عملية لتحسين الأرباح خلال الأسبوع القادم
اكتب بالعربية بشكل مختصر ومفيد مع أرقام حقيقية. لا تستخدم ايموجي نهائيا في الرد.`,

  analytics: `أنت محلل بيانات متخصص. بناءً على بيانات النظام الحية، قم بتحليل شامل يشمل:
1. ملخص معدلات التحويل وأداء المبيعات
2. أوقات الذروة وأنماط الشراء
3. المنتجات الأكثر والأقل مبيعاً
4. تحليل سلوك العملاء (عملاء جدد vs عائدين)
5. توصيات عملية لزيادة المبيعات خلال الأسبوع القادم
اكتب بالعربية بشكل مختصر ومفيد مع أرقام حقيقية. لا تستخدم ايموجي نهائيا في الرد.`,

  dashboard: `أنت مستشار تشغيل ونمو لتاجر مصري. المطلوب: موجز يومي تنفيذي قصير يصلح للعرض داخل لوحة التحكم، اعتماداً فقط على بيانات النظام الحية.

قواعد إلزامية:
1. لا تبدأ بمقدمة عامة مثل "تقرير يومي سريع" أو اسم المتجر.
2. لا تستخدم Markdown أو ** أو عناوين مزخرفة.
3. اكتب 5 نقاط مرقمة فقط من 1 إلى 5.
4. استخدم هذه العناوين بالترتيب: الأداء اليوم، المقارنة، التنبيهات، الإجراء الآن، فرصة قريبة.
5. كل نقطة تكون جملة أو جملتين كحد أقصى وبأسلوب مباشر.
6. استخدم أرقاماً حقيقية فقط من البيانات المتاحة.
7. إذا كانت القيمة صفر أو لا توجد بيانات، قل ذلك بوضوح ولا تخترع استنتاجات.
8. لا تذكر أسماء عملاء أو فرص بيع محددة إلا إذا كانت مدعومة فعلاً بالبيانات الحالية.
9. لا تستخدم ايموجي نهائيا.

المطلوب داخل كل نقطة:
1. الأداء اليوم: الطلبات، الإيرادات، المحادثات أو التحويل لو متاح.
2. المقارنة: مقارنة قصيرة مع اليوم السابق أو الفترة السابقة إن كانت موجودة.
3. التنبيهات: أهم تنبيه فعلي فقط أو اذكر أنه لا توجد تنبيهات مهمة.
4. الإجراء الآن: أهم إجراء واحد واضح وقابل للتنفيذ فوراً.
5. فرصة قريبة: فرصة واحدة فقط، وإن لم توجد فرصة واضحة قل ذلك بصراحة.`,

  inventory: `أنت وكيل إدارة مخزون ذكي. بناءً على بيانات المخزون الحية، قم بتحليل:
1. ملخص حالة المخزون (إجمالي المنتجات، منخفضة، نافذة)
2. منتجات يجب إعادة طلبها فوراً مع تقدير الكميات
3. تحليل حركة المخزون (منتجات بطيئة الحركة وسريعة الحركة)
4. تقدير قيمة المخزون الراكد وتوصيات للتصريف
5. توصيات عملية لتحسين إدارة المخزون
اكتب بالعربية بشكل مختصر ومفيد مع أرقام حقيقية. لا تستخدم ايموجي نهائيا في الرد.`,

  operations: `أنت وكيل عمليات ذكي. بناءً على بيانات النظام الحية، قم بتحليل:
1. ملخص العمليات اليومية (طلبات جديدة، معلقة، مكتملة، ملغاة)
2. أداء التوصيل (متوسط وقت التوصيل، معدل النجاح، سائقين نشطين)
3. تحليل المحادثات (معدل الرد، رضا العملاء)
4. اختناقات العمليات (طلبات متأخرة، شكاوى، مشاكل توصيل)
5. توصيات عملية لتحسين الكفاءة التشغيلية
اكتب بالعربية بشكل مختصر ومفيد مع أرقام حقيقية. لا تستخدم ايموجي نهائيا في الرد.`,
};

const CONTEXT_TITLES: Record<AnalysisContext, string> = {
  cfo: "وكيل التحليل المالي",
  analytics: "وكيل تحليل الأداء",
  dashboard: "موجز اليوم الذكي",
  inventory: "وكيل المخزون الذكي",
  operations: "وكيل العمليات الذكي",
};

function normalizeAnalysisText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ParsedAnalysisSection {
  index: number;
  title: string;
  body: string;
}

const SECTION_STYLES = [
  {
    icon: Activity,
    accent: "text-blue-700",
    border: "border-blue-200 dark:border-blue-900/60",
    bg: "bg-blue-50/80 dark:bg-blue-950/20",
  },
  {
    icon: TrendingUp,
    accent: "text-emerald-700",
    border: "border-emerald-200 dark:border-emerald-900/60",
    bg: "bg-emerald-50/80 dark:bg-emerald-950/20",
  },
  {
    icon: AlertTriangle,
    accent: "text-amber-700",
    border: "border-amber-200 dark:border-amber-900/60",
    bg: "bg-amber-50/80 dark:bg-amber-950/20",
  },
  {
    icon: PlayCircle,
    accent: "text-violet-700",
    border: "border-violet-200 dark:border-violet-900/60",
    bg: "bg-violet-50/80 dark:bg-violet-950/20",
  },
  {
    icon: Target,
    accent: "text-rose-700",
    border: "border-rose-200 dark:border-rose-900/60",
    bg: "bg-rose-50/80 dark:bg-rose-950/20",
  },
] as const;

function parseAnalysisSections(text: string): ParsedAnalysisSection[] {
  const normalized = normalizeAnalysisText(text);
  if (!normalized) {
    return [];
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sections: Array<{ index: number; raw: string[] }> = [];

  for (const line of lines) {
    const numberedMatch = line.match(/^(\d+)[\.\-)\u066b]\s*(.+)$/);
    if (numberedMatch) {
      sections.push({
        index: Number(numberedMatch[1]),
        raw: [numberedMatch[2].trim()],
      });
      continue;
    }

    if (sections.length === 0) {
      sections.push({ index: 1, raw: [line] });
      continue;
    }

    sections[sections.length - 1].raw.push(line);
  }

  return sections
    .map(({ index, raw }) => {
      const [firstLine, ...rest] = raw;
      const inlineSplit = firstLine.match(/^([^:]+):\s*(.+)$/);
      const title = inlineSplit ? inlineSplit[1].trim() : firstLine.trim();
      const bodyParts = inlineSplit
        ? [inlineSplit[2].trim(), ...rest]
        : rest.length > 0
          ? rest
          : [];

      return {
        index,
        title: title.replace(/[.:،\s]+$/g, "").trim(),
        body: bodyParts.join("\n").trim(),
      };
    })
    .filter((section) => section.title || section.body);
}

interface SmartAnalysisButtonProps {
  context: AnalysisContext;
  className?: string;
}

export function SmartAnalysisButton({
  context,
  className = "",
}: SmartAnalysisButtonProps) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const result = await portalApi.chatWithAssistant(
        ANALYSIS_PROMPTS[context],
      );
      setAnalysis(result.reply);
      setIsExpanded(true);
    } catch (err: any) {
      setError(err?.message || "فشل في تحليل البيانات. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }, [context]);

  const normalizedAnalysis = analysis ? normalizeAnalysisText(analysis) : null;
  const parsedSections = useMemo(
    () => (normalizedAnalysis ? parseAnalysisSections(normalizedAnalysis) : []),
    [normalizedAnalysis],
  );
  const renderStructuredDashboard =
    context === "dashboard" && parsedSections.length >= 3;

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 via-white to-blue-50 shadow-sm dark:border-purple-800 dark:from-purple-950/30 dark:via-slate-950 dark:to-blue-950/30 ${className}`}
    >
      {/* Header with button */}
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-semibold text-purple-950 dark:text-purple-50">
                {CONTEXT_TITLES[context]}
              </h3>
              <p className="text-xs text-purple-700/80 dark:text-purple-300/80">
                تحليل مباشر مبني على بيانات النظام الحالية
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:bg-purple-400"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              جاري التحليل...
            </>
          ) : (
            <>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                />
              </svg>
              {analysis ? "تحليل جديد" : "تحليل ذكي"}
            </>
          )}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mx-4 mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Analysis result */}
      {analysis && (
        <div className="border-t border-purple-200 dark:border-purple-800">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm text-purple-700 transition-colors hover:bg-purple-100/50 dark:text-purple-300 dark:hover:bg-purple-900/30"
          >
            <span>{isExpanded ? "إخفاء التحليل" : "عرض التحليل"}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </button>
          {isExpanded && (
            <div className="px-4 pb-4">
              {renderStructuredDashboard ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" dir="rtl">
                  {parsedSections.map((section, idx) => {
                    const style = SECTION_STYLES[idx % SECTION_STYLES.length];
                    const Icon = style.icon;

                    return (
                      <section
                        key={`${section.index}-${section.title}`}
                        className={`rounded-2xl border p-4 shadow-sm ${style.border} ${style.bg}`}
                      >
                        <div className="mb-3 flex items-center gap-3">
                          <span
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 dark:bg-slate-950/40 ${style.accent}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {section.index.toString().padStart(2, "0")}
                            </p>
                            <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                              {section.title}
                            </h4>
                          </div>
                        </div>
                        <p className="text-sm leading-7 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {section.body || "لا توجد تفاصيل إضافية."}
                        </p>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div
                  className="mx-auto max-w-4xl rounded-2xl border border-purple-100 bg-white p-5 text-sm leading-8 text-gray-800 shadow-sm whitespace-pre-wrap dark:border-purple-900/60 dark:bg-gray-900 dark:text-gray-200"
                  dir="rtl"
                >
                  {normalizedAnalysis}
                </div>
              )}
              <p className="mt-2 text-xs text-purple-500 dark:text-purple-400 text-center">
                تم التحليل بواسطة الذكاء الاصطناعي • البيانات من النظام مباشرة
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state hint */}
      {!analysis && !loading && !error && (
        <div className="px-4 pb-4 text-center">
          <p className="text-sm text-purple-500 dark:text-purple-400">
            اضغط "تحليل ذكي" للحصول على تحليل مبني على بيانات نشاطك الحقيقية
            بالذكاء الاصطناعي
          </p>
        </div>
      )}
    </div>
  );
}
