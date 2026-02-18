"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/ui/alerts";
import {
  Bot,
  Send,
  Sparkles,
  Trash2,
  Check,
  X,
  Lock,
  Mic,
  Square,
} from "lucide-react";
import { merchantApi } from "@/lib/api";
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

export default function MerchantAssistantPage() {
  const { merchantId, apiKey } = useMerchant();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // AI connection status
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

  // Fetch AI status on mount
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
          message: "⚠️ تعذر الاتصال بخدمة الذكاء الاصطناعي",
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
        // ignore invalid cache
      }
    }
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "أهلاً! أنا مساعدك الذكي. اسألني عن أي شيء يتعلق بعملك.",
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
      const assistantEntry: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.reply,
        createdAt: new Date().toISOString(),
        intent: res.intent,
        requiresConfirmation: res.requiresConfirmation,
        pendingActionId: res.pendingActionId,
        featureBlocked: res.featureBlocked,
        blockedFeatures: res.blockedFeatures,
      };
      setMessages((prev) => [...prev, assistantEntry]);

      // If AI returned an error, update status banner to show disconnected
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
      setError(err.message || "فشل في إرسال الرسالة");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "حدث خطأ. حاول مرة أخرى.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, history, apiKey]);

  const handleConfirmAction = useCallback(
    async (messageId: string, actionId: string, confirm: boolean) => {
      try {
        setSending(true);
        const res = await merchantApi.copilotConfirm(apiKey, actionId, confirm);

        // Update the message to mark as confirmed/cancelled
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, confirmed: confirm, requiresConfirmation: false }
              : m,
          ),
        );

        // Add result message
        const resultMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            res.reply ||
            (confirm ? "✅ تم تنفيذ الأمر بنجاح" : "❌ تم إلغاء الأمر"),
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, resultMessage]);
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
            "تم استنفاد رصيد الذكاء الاصطناعي. قم بترقية الباقة أو انتظر تجديد الرصيد اليومي.",
          );
        } else {
          setError(err.message || "فشل في تأكيد الأمر");
        }
      } finally {
        setSending(false);
      }
    },
    [apiKey],
  );

  const handleClear = () => {
    const cleared: ChatMessage[] = [
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "تم مسح المحادثة. كيف يمكنني مساعدتك الآن؟",
        createdAt: new Date().toISOString(),
      },
    ];
    setMessages(cleared);
  };

  // Voice recording functions
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

      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
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

      // Add "recording user" message
      const userEntry: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "🎤 رسالة صوتية...",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userEntry]);

      try {
        // Convert blob to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(",")[1];
            resolve(base64);
          };
        });
        reader.readAsDataURL(audioBlob);
        const audioBase64 = await base64Promise;

        const res = await merchantApi.copilotVoice(apiKey, {
          audioBase64,
          mimeType: "audio/webm",
          history: history.map((m) => ({ role: m.role, content: m.content })),
        });

        // Update user message with transcribed text
        if (res.transcribedText) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === userEntry.id
                ? { ...m, content: `🎤 "${res.transcribedText}"` }
                : m,
            ),
          );
        }

        const assistantEntry: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: res.reply,
          createdAt: new Date().toISOString(),
          intent: res.intent,
          requiresConfirmation: res.requiresConfirmation,
          pendingActionId: res.pendingActionId,
          featureBlocked: res.featureBlocked,
          blockedFeatures: res.blockedFeatures,
        };
        setMessages((prev) => [...prev, assistantEntry]);
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
            ? "تم استنفاد رصيد الذكاء الاصطناعي. قم بترقية الباقة أو انتظر تجديد الرصيد اليومي."
            : err.message || "فشل في إرسال الرسالة الصوتية",
        );
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: isQuotaError
              ? "⚠️ رصيد الذكاء الاصطناعي غير كافٍ. قم بترقية باقتك للاستمرار."
              : "حدث خطأ في معالجة الصوت. حاول مرة أخرى.",
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

  // Cleanup on unmount
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

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="مساعد التاجر الذكي"
        description="أرسل أوامر نصية أو صوتية لإدارة المصاريف، المخزون، الطلبات والمزيد"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Copilot
            </Badge>
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="h-4 w-4 ml-2" />
              مسح المحادثة
            </Button>
          </div>
        }
      />

      {error && (
        <AlertBanner
          type="error"
          title="خطأ"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {/* AI Status Banner — only shown when AI is NOT working */}
      {aiStatus && !aiStatus.connected && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span>
            الذكاء الاصطناعي غير متاح — قم بتفعيل الخدمة أو ترقية باقتك
          </span>
          <a
            href="/merchant/plan"
            className="mr-auto text-xs font-medium bg-amber-600 text-white rounded-md px-3 py-1 hover:bg-amber-700 transition-colors"
          >
            ترقية الباقة
          </a>
        </div>
      )}

      {/* Example commands — show only when conversation is fresh */}
      {messages.length <= 1 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "📊 مصاريف الشهر", cmd: "مصاريف الشهر" },
            {
              label: "📦 المنتجات الأقل مخزون",
              cmd: "إيه المنتجات اللي قربت تخلص؟",
            },
            { label: "💰 إيرادات اليوم", cmd: "إيرادات اليوم كام؟" },
            { label: "🔗 لينك دفع 500 جنيه", cmd: "اعمل لينك دفع 500 جنيه" },
          ].map((ex) => (
            <Button
              key={ex.cmd}
              variant="outline"
              size="sm"
              className="text-xs justify-start whitespace-nowrap"
              onClick={() => {
                setInput(ex.cmd);
              }}
            >
              {ex.label}
            </Button>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            المحادثة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4 max-h-[520px] overflow-y-auto rounded-lg border bg-muted/20 p-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.role === "assistant" ? "justify-start" : "justify-end",
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                    msg.role === "assistant"
                      ? "bg-white text-foreground border"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </p>

                  {/* Feature blocked indicator */}
                  {msg.featureBlocked && (
                    <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-center gap-2 text-amber-700 text-xs">
                        <Lock className="h-3 w-3" />
                        <span>هذه الميزة تتطلب ترقية خطتك</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 text-xs h-7"
                      >
                        ترقية الآن
                      </Button>
                    </div>
                  )}

                  {/* Confirmation buttons */}
                  {msg.requiresConfirmation &&
                    msg.pendingActionId &&
                    !msg.confirmed &&
                    msg.confirmed !== false && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 text-xs"
                          onClick={() =>
                            handleConfirmAction(
                              msg.id,
                              msg.pendingActionId!,
                              true,
                            )
                          }
                          disabled={sending}
                        >
                          <Check className="h-3 w-3 ml-1" />
                          تأكيد
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() =>
                            handleConfirmAction(
                              msg.id,
                              msg.pendingActionId!,
                              false,
                            )
                          }
                          disabled={sending}
                        >
                          <X className="h-3 w-3 ml-1" />
                          إلغاء
                        </Button>
                      </div>
                    )}

                  {/* Intent badge for debugging */}
                  {msg.intent && (
                    <Badge variant="outline" className="mt-2 text-[10px]">
                      {msg.intent}
                    </Badge>
                  )}

                  <span
                    className={cn(
                      "mt-2 block text-[11px]",
                      msg.role === "assistant"
                        ? "text-muted-foreground"
                        : "text-primary-100",
                    )}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString("ar-SA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-white px-4 py-3 text-sm text-muted-foreground border animate-pulse">
                  جاري التفكير...
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب أمرك هنا... مثال: مصاريف الشهر، زود المخزون 10"
              className="min-h-[48px]"
              disabled={isRecording}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button
              variant={isRecording ? "destructive" : "outline"}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={sending}
              className={cn(isRecording && "animate-pulse")}
              title={isRecording ? "إيقاف التسجيل" : "تسجيل صوتي"}
            >
              {isRecording ? (
                <Square className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            <Button
              onClick={sendMessage}
              disabled={sending || !input.trim() || isRecording}
            >
              <Send className="h-4 w-4" />
              إرسال
            </Button>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-4">
            <span>يتم حفظ المحادثة تلقائياً في هذا المتصفح.</span>
            {isRecording && (
              <Badge
                variant="destructive"
                className="text-[10px] animate-pulse"
              >
                <Mic className="h-3 w-3 ml-1" />
                جاري التسجيل... {recordingTime}ث
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
