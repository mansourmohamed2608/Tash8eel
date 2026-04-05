"use client";

import React, { useState, useCallback } from "react";
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
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  return (
    <div
      className={`bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 rounded-xl border border-purple-200 dark:border-purple-800 ${className}`}
    >
      {/* Header with button */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-purple-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
            />
          </svg>
          <h3 className="font-semibold text-purple-900 dark:text-purple-100">
            {CONTEXT_TITLES[context]}
          </h3>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-sm font-medium transition-colors"
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
            className="w-full flex items-center justify-between px-4 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-100/50 dark:hover:bg-purple-900/30 transition-colors"
          >
            <span>{isExpanded ? "إخفاء التحليل" : "عرض التحليل"}</span>
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {isExpanded && (
            <div className="px-4 pb-4">
              <div
                className="mx-auto max-w-4xl rounded-xl border border-purple-100 bg-white p-5 text-sm leading-8 text-gray-800 shadow-sm whitespace-pre-wrap dark:border-purple-900/60 dark:bg-gray-900 dark:text-gray-200"
                dir="rtl"
              >
                {normalizedAnalysis}
              </div>
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
