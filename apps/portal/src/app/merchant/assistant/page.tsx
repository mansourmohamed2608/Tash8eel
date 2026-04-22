"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertBanner } from "@/components/ui/alerts";
import {
  Activity,
  AudioLines,
  BarChart3,
  Bot,
  Boxes,
  Check,
  Clock3,
  Command,
  Lock,
  Mic,
  Receipt,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  intent?: string;
  requiresConfirmation?: boolean;
  pendingActionId?: string;
  featureBlocked?: boolean;
  blockedFeatures?: string[];
  confirmed?: boolean;
}

const QUICK_COMMANDS = [
  {
    label: "مصاريف الشهر",
    command: "مصاريف الشهر",
    icon: Receipt,
    description: "ملخص سريع للمصروفات والتوزيع الحالي.",
  },
  {
    label: "المنتجات الأقل مخزون",
    command: "إيه المنتجات اللي قربت تخلص؟",
    icon: Boxes,
    description: "أسرع طريقة لمعرفة المخزون الحرج.",
  },
  {
    label: "إيرادات اليوم",
    command: "إيرادات اليوم كام؟",
    icon: BarChart3,
    description: "قراءة مباشرة لأداء اليوم.",
  },
  {
    label: "راجع إثباتات الدفع",
    command: "افتح مراجعة إثباتات الدفع",
    icon: ShieldCheck,
    description: "انتقال فوري إلى مسار المدفوعات.",
  },
] as const;

const FEATURE_LABELS: Record<string, string> = {
  INVENTORY: "المخزون",
  REPORTS: "التقارير",
  PAYMENTS: "المدفوعات",
  ORDERS: "الطلبات",
  COPILOT_CHAT: "مساعد التاجر",
};

const INTENT_LABELS: Record<string, string> = {
  ADD_EXPENSE: "إضافة مصروف",
  ASK_EXPENSE_SUMMARY: "ملخص المصروفات",
  CREATE_PAYMENT_LINK: "رابط دفع",
  APPROVE_PAYMENT_PROOF: "مراجعة إثبات الدفع",
  ASK_COD_STATUS: "حالة التحصيل",
  CLOSE_MONTH: "إغلاق الشهر",
  UPDATE_STOCK: "تحديث المخزون",
  ASK_LOW_STOCK: "المخزون الحرج",
  ASK_SHRINKAGE: "الانكماش",
  IMPORT_SUPPLIER_CSV: "استيراد الموردين",
  ASK_TOP_MOVERS: "الأصناف الأعلى حركة",
  TAG_VIP: "تمييز عميل مهم",
  REMOVE_VIP: "إزالة التمييز",
  REORDER_LAST: "إعادة الطلب السابق",
};

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString("ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function staggerStyle(index: number): CSSProperties {
  return { ["--stagger-index" as string]: index } as CSSProperties;
}

function formatIntentLabel(intent?: string) {
  if (!intent) return null;
  return INTENT_LABELS[intent] || intent.replaceAll("_", " ");
}

export default function MerchantAssistantPage() {
  const { merchantId, apiKey } = useMerchant();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [aiStatus, setAiStatus] = useState<{
    connected: boolean;
    message: string;
    voice: boolean;
    vision: boolean;
    usage?: { callsToday: number; dailyLimit: number };
  } | null>(null);

  const history = useMemo(
    () => messages.filter((m) => (m.role as string) !== "system").slice(-12),
    [messages],
  );

  const usagePercent = useMemo(() => {
    const usage = aiStatus?.usage;
    if (!usage?.dailyLimit) return null;
    return Math.min(
      100,
      Math.round((usage.callsToday / usage.dailyLimit) * 100),
    );
  }, [aiStatus]);

  useEffect(() => {
    if (!apiKey) return;
    merchantApi
      .copilotStatus(apiKey)
      .then((res) => {
        const resAny = res as Record<string, any>;
        setAiStatus({
          connected: res.ai.connected,
          message: res.ai.message,
          voice: res.voice.transcriptionAvailable,
          vision: res.vision.ocrAvailable,
          usage: resAny.usage
            ? {
                callsToday: resAny.usage.callsToday,
                dailyLimit: resAny.usage.dailyLimit,
              }
            : undefined,
        });
      })
      .catch(() => {
        setAiStatus({
          connected: false,
          message: "تعذر الاتصال بخدمة المساعد حالياً.",
          voice: false,
          vision: false,
        });
      });
  }, [apiKey]);

  useEffect(() => {
    if (!merchantId || typeof window === "undefined") return;
    const storageKey = `assistantChat:${merchantId}`;
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          setInitialized(true);
          return;
        }
      } catch {
        // Ignore corrupt cached history.
      }
    }

    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "أهلاً بك. أنا المساعد التشغيلي داخل النظام. اسألني عن المصروفات أو الطلبات أو المدفوعات وسأعيد لك الإجابة بشكل تنفيذي مباشر.",
        createdAt: new Date().toISOString(),
      },
    ]);
    setInitialized(true);
  }, [merchantId]);

  useEffect(() => {
    if (!initialized || !merchantId || typeof window === "undefined") return;
    const storageKey = `assistantChat:${merchantId}`;
    window.localStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, merchantId, initialized]);

  useEffect(() => {
    if (!endRef.current) return;
    endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || sending) return;
    const userMessage = input.trim();
    setInput("");
    setError(null);
    setSending(true);

    const userEntry: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userEntry]);

    try {
      const res = await merchantApi.copilotMessage(apiKey, {
        message: userMessage,
        history: history.map((m) => ({ role: m.role, content: m.content })),
      });

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.reply,
          createdAt: new Date().toISOString(),
          intent: res.intent,
          requiresConfirmation: res.requiresConfirmation,
          pendingActionId: res.pendingActionId,
          featureBlocked: res.featureBlocked,
          blockedFeatures: res.blockedFeatures,
        },
      ]);

      if (
        res.error === "AI_QUOTA_EXHAUSTED" ||
        res.error === "AI_TEMPORARILY_UNAVAILABLE" ||
        res.error === "AI_NOT_ENABLED"
      ) {
        setAiStatus((prev) =>
          prev
            ? {
                ...prev,
                connected: false,
                message: res.reply,
                voice: false,
                vision: false,
              }
            : prev,
        );
      }
    } catch (err: any) {
      setError(err.message || "فشل في إرسال الرسالة.");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "حدث خطأ أثناء التنفيذ. أعد المحاولة بعد لحظة.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [apiKey, history, input, sending]);

  const handleConfirmAction = useCallback(
    async (messageId: string, actionId: string, confirm: boolean) => {
      try {
        setSending(true);
        const res = await merchantApi.copilotConfirm(apiKey, actionId, confirm);

        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  confirmed: confirm,
                  requiresConfirmation: false,
                }
              : message,
          ),
        );

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              res.reply ||
              (confirm ? "تم تنفيذ الأمر بنجاح." : "تم إلغاء الأمر."),
            createdAt: new Date().toISOString(),
          },
        ]);
      } catch (err: any) {
        const errMsg = err?.message || err?.error || "";
        const isQuotaError =
          typeof errMsg === "string" &&
          (errMsg.includes("AI_QUOTA_EXHAUSTED") ||
            errMsg.includes("AI_NOT_ENABLED") ||
            errMsg.includes("AI_TEMPORARILY_UNAVAILABLE") ||
            errMsg.includes("AI_LIMIT_EXCEEDED") ||
            errMsg.includes("Token budget exceeded"));

        if (isQuotaError) {
          setAiStatus((prev) =>
            prev
              ? { ...prev, connected: false, voice: false, vision: false }
              : prev,
          );
          setError(
            "تم استنفاد رصيد المساعد. قم بترقية الباقة أو انتظر تجديد الرصيد اليومي.",
          );
        } else {
          setError(err.message || "فشل في تأكيد الأمر.");
        }
      } finally {
        setSending(false);
      }
    },
    [apiKey],
  );

  const handleClear = useCallback(() => {
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "تم فتح جلسة جديدة. ابدأ بالأمر التالي عندما تكون جاهزاً.",
        createdAt: new Date().toISOString(),
      },
    ]);
    setError(null);
    setInput("");
    textareaRef.current?.focus();
  }, []);

  const handleQuickCommand = useCallback((command: string) => {
    setInput(command);
    setError(null);
    textareaRef.current?.focus();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        await sendVoiceMessage(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch {
      setError("لا يمكن الوصول إلى الميكروفون. تأكد من السماح بالوصول.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  }, [isRecording]);

  const sendVoiceMessage = useCallback(
    async (audioBlob: Blob) => {
      setSending(true);
      setError(null);

      const userEntry: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "رسالة صوتية قيد المعالجة...",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userEntry]);

      try {
        const reader = new FileReader();
        const audioBase64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const value =
              typeof reader.result === "string" ? reader.result : "";
            resolve(value.split(",")[1] || "");
          };
          reader.readAsDataURL(audioBlob);
        });

        const res = await merchantApi.copilotVoice(apiKey, {
          audioBase64,
          mimeType: "audio/webm",
          history: history.map((m) => ({ role: m.role, content: m.content })),
        });

        if (res.transcribedText) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === userEntry.id
                ? { ...message, content: `رسالة صوتية: ${res.transcribedText}` }
                : message,
            ),
          );
        }

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: res.reply,
            createdAt: new Date().toISOString(),
            intent: res.intent,
            requiresConfirmation: res.requiresConfirmation,
            pendingActionId: res.pendingActionId,
            featureBlocked: res.featureBlocked,
            blockedFeatures: res.blockedFeatures,
          },
        ]);
      } catch (err: any) {
        const errMsg = err?.message || err?.error || "";
        const isQuotaError =
          typeof errMsg === "string" &&
          (errMsg.includes("AI_QUOTA_EXHAUSTED") ||
            errMsg.includes("AI_NOT_ENABLED") ||
            errMsg.includes("AI_TEMPORARILY_UNAVAILABLE") ||
            errMsg.includes("AI_LIMIT_EXCEEDED") ||
            errMsg.includes("Token budget exceeded") ||
            errMsg.includes("budget"));

        if (isQuotaError) {
          setAiStatus((prev) =>
            prev
              ? {
                  ...prev,
                  connected: false,
                  message: errMsg,
                  voice: false,
                  vision: false,
                }
              : prev,
          );
        }

        setError(
          isQuotaError
            ? "تم استنفاد رصيد المساعد. قم بترقية الباقة أو انتظر تجديد الرصيد اليومي."
            : err.message || "فشل في إرسال الرسالة الصوتية.",
        );
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: isQuotaError
              ? "رصيد المساعد غير كافٍ حالياً. قم بالترقية للاستمرار."
              : "تعذر معالجة الرسالة الصوتية. حاول مرة أخرى.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setSending(false);
        setRecordingTime(0);
      }
    },
    [apiKey, history],
  );

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

  const statusCards = useMemo(
    () => [
      {
        label: "حالة المساعد",
        value: aiStatus?.connected ? "متصل وجاهز" : "يحتاج تفعيل",
        note: aiStatus?.connected
          ? "يمكنك إرسال أوامر تشغيلية ونصوص تنفيذية الآن."
          : "الخدمة متوقفة أو مقيدة بخطتك الحالية.",
        icon: Wand2,
        tone: aiStatus?.connected
          ? "var(--success-muted)"
          : "var(--warning-muted)",
        toneColor: aiStatus?.connected ? "var(--success)" : "var(--warning)",
      },
      {
        label: "الصوت",
        value: aiStatus?.voice ? "مفعل" : "غير متاح",
        note: aiStatus?.voice
          ? "التفريغ الصوتي جاهز لاختصارات التشغيل السريعة."
          : "الأوامر الصوتية غير مفعلة في الجلسة الحالية.",
        icon: Mic,
        tone: "var(--accent-muted)",
        toneColor: "var(--accent)",
      },
      {
        label: "الاستخدام اليومي",
        value: aiStatus?.usage
          ? `${aiStatus.usage.callsToday} / ${aiStatus.usage.dailyLimit}`
          : "غير متاح",
        note:
          usagePercent !== null
            ? `تم استهلاك ${usagePercent}% من الرصيد اليومي.`
            : "سيظهر الرصيد هنا عند توافر بيانات الاستهلاك.",
        icon: Activity,
        tone:
          usagePercent !== null && usagePercent >= 85
            ? "var(--warning-muted)"
            : "var(--surface-muted)",
        toneColor:
          usagePercent !== null && usagePercent >= 85
            ? "var(--warning)"
            : "var(--text-primary)",
      },
      {
        label: "آخر حالة",
        value: aiStatus?.message || "جاري التحقق من الاتصال",
        note: "تحديث مباشر من خدمة المساعد داخل المنصة.",
        icon: Clock3,
        tone: "var(--surface-muted)",
        toneColor: "var(--text-primary)",
      },
    ],
    [aiStatus, usagePercent],
  );

  return (
    <div className="assistant-screen">
      <section
        className="assistant-hero assistant-stagger"
        style={staggerStyle(0)}
      >
        <div className="assistant-hero-grid">
          <div className="assistant-hero-copy">
            <span className="assistant-hero-meta">
              <Command className="h-4 w-4" />
              مركز القيادة / مساعد إداري
            </span>
            <h1 className="assistant-display">مساعد إداري</h1>
            <p className="assistant-subheading">
              سطح داعم للاستعلامات التشغيلية اليدوية ومراجعة النتائج داخل سياق
              مركز القيادة.
            </p>
          </div>

          <div className="assistant-hero-actions">
            <span className="assistant-chip">
              <Bot className="h-4 w-4" />
              جلسة استعلام
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="assistant-button assistant-button--ghost"
            >
              <Trash2 className="h-4 w-4" />
              مسح الجلسة
            </button>
          </div>
        </div>
      </section>

      {error && (
        <AlertBanner
          type="error"
          title="تعذر إكمال الأمر"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      <section className="assistant-metrics">
        {aiStatus
          ? statusCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <article
                  key={card.label}
                  className="assistant-panel assistant-metric assistant-stagger"
                  style={staggerStyle(index + 1)}
                >
                  <div className="assistant-metric-header">
                    <div className="assistant-metric-copy">
                      <span className="assistant-label">{card.label}</span>
                      <p className="assistant-metric-value">{card.value}</p>
                    </div>
                    <span
                      className="assistant-metric-icon"
                      style={{
                        background: card.tone,
                        color: card.toneColor,
                      }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                  <p className="assistant-metric-note">{card.note}</p>
                  {card.label === "الاستخدام اليومي" &&
                    usagePercent !== null && (
                      <div className="assistant-progress" aria-hidden="true">
                        <div
                          className="assistant-progress-bar"
                          style={{
                            width: `${usagePercent}%`,
                            background:
                              usagePercent >= 85
                                ? "var(--warning)"
                                : "var(--accent)",
                          }}
                        />
                      </div>
                    )}
                </article>
              );
            })
          : Array.from({ length: 4 }).map((_, index) => (
              <article
                key={`metric-skeleton-${index}`}
                className="assistant-panel assistant-metric assistant-stagger"
                style={staggerStyle(index + 1)}
              >
                <span
                  className="assistant-skeleton"
                  style={{ height: 12, width: "34%" }}
                />
                <span
                  className="assistant-skeleton"
                  style={{ height: 22, width: "62%" }}
                />
                <span
                  className="assistant-skeleton"
                  style={{ height: 10, width: "82%" }}
                />
                <span
                  className="assistant-skeleton"
                  style={{ height: 8, width: "100%" }}
                />
              </article>
            ))}
      </section>

      {aiStatus && !aiStatus.connected && (
        <section
          className="assistant-upgrade assistant-stagger"
          style={staggerStyle(5)}
        >
          <div>
            <h2 className="assistant-upgrade-title">
              الخدمة الذكية غير متاحة بالكامل الآن
            </h2>
            <p className="assistant-upgrade-body">
              بعض الأوامر التشغيلية ستبقى مقيدة حتى يتم تفعيل الخدمة أو تعديل
              صلاحيات الحساب الحالي. إذا كنت تحضّر للديمو، لا تعتمد على أوامر
              المخزون أو الخدمات المقيدة قبل مراجعة الباقة.
            </p>
          </div>
          <div className="assistant-inline-actions">
            <a
              href="/merchant/billing"
              className="assistant-button assistant-button--primary"
            >
              الاطلاع على الباقات
            </a>
          </div>
        </section>
      )}

      <section className="assistant-workspace">
        <article
          className="assistant-panel assistant-chat-panel assistant-stagger"
          style={staggerStyle(6)}
        >
          <header className="assistant-panel-header">
            <div className="assistant-panel-copy">
              <div className="assistant-panel-title">
                <Command className="h-5 w-5" />
                المحادثة التنفيذية
              </div>
              <p className="assistant-panel-description">
                سجل حي للأوامر والردود. يتم حفظ الجلسة محلياً داخل هذا المتصفح
                لتعود إليها بسرعة.
              </p>
            </div>
            <span className="assistant-chip">
              <AudioLines className="h-4 w-4" />
              آخر 12 رسالة
            </span>
          </header>

          <div className="assistant-transcript">
            {messages.map((message, index) => {
              const intentLabel = formatIntentLabel(message.intent);
              const blockedLabels = (message.blockedFeatures || []).map(
                (feature) => FEATURE_LABELS[feature] || feature,
              );

              return (
                <div
                  key={message.id}
                  className={cn(
                    "assistant-message-row",
                    message.role === "user"
                      ? "assistant-message-row--user"
                      : "assistant-message-row--assistant",
                  )}
                >
                  <article
                    className={cn(
                      "assistant-bubble assistant-stagger",
                      message.role === "user"
                        ? "assistant-bubble--user"
                        : "assistant-bubble--assistant",
                    )}
                    style={staggerStyle(index + 7)}
                  >
                    {(intentLabel || blockedLabels.length > 0) && (
                      <div className="assistant-inline-actions">
                        {intentLabel && (
                          <span className="assistant-intent-badge">
                            <Command className="h-3 w-3" />
                            {intentLabel}
                          </span>
                        )}
                        {blockedLabels.map((label) => (
                          <span key={label} className="assistant-feature-badge">
                            <Lock className="h-3 w-3" />
                            {label}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="assistant-bubble-text">{message.content}</p>

                    {message.featureBlocked && (
                      <div className="assistant-blocked">
                        <div>
                          <strong>هذا الأمر مقيد بالخطة الحالية.</strong>
                          <p className="assistant-panel-description">
                            المزايا المطلوبة:{" "}
                            {blockedLabels.length > 0
                              ? blockedLabels.join("، ")
                              : "ميزات إضافية"}
                          </p>
                        </div>
                        <a
                          href="/merchant/billing"
                          className="assistant-button assistant-button--secondary assistant-button--tiny"
                        >
                          راجع الباقات
                        </a>
                      </div>
                    )}

                    {message.requiresConfirmation &&
                      message.pendingActionId &&
                      !message.confirmed &&
                      message.confirmed !== false && (
                        <div className="assistant-inline-actions">
                          <button
                            type="button"
                            className="assistant-button assistant-button--primary assistant-button--tiny"
                            onClick={() =>
                              handleConfirmAction(
                                message.id,
                                message.pendingActionId!,
                                true,
                              )
                            }
                            disabled={sending}
                          >
                            <Check className="h-3 w-3" />
                            تأكيد التنفيذ
                          </button>
                          <button
                            type="button"
                            className="assistant-button assistant-button--secondary assistant-button--tiny"
                            onClick={() =>
                              handleConfirmAction(
                                message.id,
                                message.pendingActionId!,
                                false,
                              )
                            }
                            disabled={sending}
                          >
                            <X className="h-3 w-3" />
                            إلغاء
                          </button>
                        </div>
                      )}

                    <footer className="assistant-bubble-meta">
                      <span>{formatMessageTime(message.createdAt)}</span>
                    </footer>
                  </article>
                </div>
              );
            })}

            {sending && (
              <div className="assistant-message-row assistant-message-row--assistant">
                <div className="assistant-bubble assistant-bubble--assistant assistant-loading">
                  <span
                    className="assistant-skeleton"
                    style={{ height: 12, width: "42%" }}
                  />
                  <span
                    className="assistant-skeleton"
                    style={{ height: 12, width: "78%" }}
                  />
                  <span
                    className="assistant-skeleton"
                    style={{ height: 12, width: "64%" }}
                  />
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          <div className="assistant-composer">
            <div className="assistant-field">
              <label
                className="assistant-field-label"
                htmlFor="assistant-command"
              >
                أمر جديد
              </label>
              <div
                className={cn(
                  "assistant-composer-shell",
                  error && "assistant-composer-shell--error",
                )}
              >
                <textarea
                  id="assistant-command"
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  className="assistant-textarea"
                  placeholder="مثال: افتح مراجعة إثباتات الدفع أو اعرض مصاريف الشهر"
                  disabled={isRecording}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                />

                <div className="assistant-composer-actions">
                  <div className="assistant-inline-actions">
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={sending}
                      className={cn(
                        "assistant-button assistant-button--secondary assistant-button--icon",
                        isRecording && "assistant-button--danger",
                      )}
                      aria-label={
                        isRecording
                          ? "إيقاف التسجيل الصوتي"
                          : "بدء التسجيل الصوتي"
                      }
                    >
                      {isRecording ? (
                        <Square className="h-4 w-4" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={sending || !input.trim() || isRecording}
                    className="assistant-button assistant-button--primary"
                  >
                    <Send className="h-4 w-4" />
                    إرسال الأمر
                  </button>
                </div>
              </div>
            </div>

            <div className="assistant-composer-meta">
              <span>Enter للإرسال و Shift + Enter لسطر جديد.</span>
              {isRecording && (
                <span className="assistant-recording-pill">
                  <Mic className="h-3 w-3" />
                  جاري التسجيل {recordingTime}ث
                </span>
              )}
            </div>
          </div>
        </article>

        <aside className="assistant-sidebar">
          <section
            className="assistant-panel assistant-stagger"
            style={staggerStyle(7)}
          >
            <header className="assistant-panel-copy">
              <div className="assistant-panel-title">
                <Command className="h-5 w-5" />
                أوامر جاهزة
              </div>
              <p className="assistant-panel-description">
                اختصارات عملية لبدء الديمو أو التنقل إلى الأسئلة الأكثر فائدة.
              </p>
            </header>

            <div className="assistant-stack">
              {QUICK_COMMANDS.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.command}
                    type="button"
                    onClick={() => handleQuickCommand(item.command)}
                    className="assistant-quick-button assistant-stagger"
                    style={staggerStyle(index + 8)}
                  >
                    <div className="assistant-quick-header">
                      <span className="assistant-quick-icon">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="assistant-quick-title">{item.label}</p>
                        <p className="assistant-quick-body">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            className="assistant-panel assistant-stagger"
            style={staggerStyle(8)}
          >
            <header className="assistant-panel-copy">
              <div className="assistant-panel-title">
                <Bot className="h-5 w-5" />
                قدرات الجلسة
              </div>
            </header>

            <div className="assistant-stack">
              <div className="assistant-note">
                <strong>تحليل تشغيلي مباشر</strong>
                يقرأ الأسئلة العربية الحرة ويعيد لك إجابات قابلة للتنفيذ بدل
                ردود عامة.
              </div>
              <div className="assistant-note">
                <strong>أوامر صوتية عند التفعيل</strong>
                إذا كانت خدمة الصوت متاحة، يمكنك إرسال الأوامر من الميكروفون
                مباشرة.
              </div>
              <div className="assistant-note">
                <strong>تحكم قبل التنفيذ</strong>
                الأوامر الحساسة تمر عبر تأكيد صريح قبل تنفيذها داخل النظام.
              </div>
            </div>
          </section>

          <section
            className="assistant-panel assistant-stagger"
            style={staggerStyle(9)}
          >
            <header className="assistant-panel-copy">
              <div className="assistant-panel-title">
                <Activity className="h-5 w-5" />
                ملاحظات الجلسة
              </div>
            </header>

            <div className="assistant-stack">
              <div className="assistant-note">
                <strong>الحفظ المحلي</strong>
                يتم حفظ المحادثة الحالية محلياً داخل هذا المتصفح لتستكملها
                بسرعة.
              </div>
              <div className="assistant-note">
                <strong>أفضلية الديمو</strong>
                استخدم أوامر المصروفات والمدفوعات والتنقلات التشغيلية قبل أوامر
                المخزون المقيدة بالخطة الحالية.
              </div>
              <div className="assistant-note">
                <strong>الحساب الحالي</strong>
                {merchantId
                  ? `معرّف التاجر المستخدم الآن هو ${merchantId}.`
                  : "جاري تحميل بيانات الحساب الحالي."}
              </div>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
