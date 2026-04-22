"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Send,
  Copy,
  Check,
  MessageSquare,
  Bot,
  AlertCircle,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import portalApi from "@/lib/client";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";

interface AskAiButtonProps {
  /** The merchant ID */
  merchantId: string;
  /** Context/topic for the AI (e.g. "orders", "inventory") */
  context: string;
  /** Pre-built suggested questions */
  suggestions?: string[];
  /** Label for the button */
  label?: string;
  /** Compact mode (icon only) */
  compact?: boolean;
  /** Custom class */
  className?: string;
  /** Optional data to send as context along with the question */
  contextData?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Assistant button that opens a dialog
 * where the merchant can ask questions about their data.
 * Calls the merchant-assistant chat endpoint.
 */
export function AskAiButton({
  merchantId,
  context,
  suggestions = [],
  label = "اسأل المساعد",
  compact = false,
  className,
  contextData,
}: AskAiButtonProps) {
  const [open, setOpen] = useState(false);
  const messagesStorageKey = merchantId
    ? `ask-ai:messages:${merchantId}:${context}`
    : null;
  const inputStorageKey = merchantId
    ? `ask-ai:input:${merchantId}:${context}`
    : null;
  const [messages, setMessages] = useLocalStorageState<ChatMessage[]>(
    messagesStorageKey,
    [],
  );
  const [input, setInput] = useLocalStorageState<string>(inputStorageKey, "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      // Build message with context if contextData provided
      const fullMessage = contextData
        ? `[سياق: ${context}]\n${contextData}\n\nسؤال التاجر: ${text.trim()}`
        : text.trim();

      const data = await portalApi.chatWithAssistant(
        fullMessage,
        updatedMessages
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content })),
      );

      const aiMsg: ChatMessage = {
        role: "assistant",
        content: data.reply?.trim() || "لم أتمكن من الرد.",
      };
      setMessages([...updatedMessages, aiMsg]);
    } catch (err: any) {
      setError(err.message || "حدث خطأ");
      // Still add a placeholder so the conversation isn't broken
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content:
            "تعذر الاتصال بخدمة المساعد حالياً. يمكنك المحاولة مرة أخرى لاحقاً.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleOpen = () => {
    setOpen(true);
    if (messages.length === 0 && suggestions.length > 0) {
      // Show suggestions as initial state
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size={compact ? "icon" : "default"}
        className={cn(
          "border-[var(--border-default)] bg-[var(--bg-surface-1)] text-[var(--color-brand-primary)] hover:bg-[var(--brand-blue-dim)]",
          className,
        )}
        onClick={handleOpen}
      >
        <MessageSquare className="h-4 w-4" />
        {!compact && <span className="mr-1">{label}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-[var(--color-brand-primary)]" />
              المساعد - {context}
            </DialogTitle>
            <DialogDescription>
              اسأل عن أي شيء يخص {context} - المساعد يستخدم بياناتك الحقيقية
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-2 text-xs text-muted-foreground">
            هذه المحادثة محفوظة على هذا الجهاز لتجنب تكرار استهلاك رصيد المساعد
            عند الرجوع للصفحة.
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 py-4 min-h-[200px] max-h-[400px]">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-10 w-10 text-[var(--color-brand-primary)] mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-4">
                  اسأل أي سؤال عن {context}
                </p>
                {suggestions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      أسئلة مقترحة:
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s)}
                          className="rounded-full border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 py-1.5 text-xs text-[var(--color-brand-primary)] transition-colors hover:bg-[var(--brand-blue-dim)]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-2",
                    msg.role === "user" ? "justify-start" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs",
                      msg.role === "user"
                        ? "bg-blue-100 text-blue-600"
                        : "bg-[var(--brand-blue-dim)] text-[var(--color-brand-primary)]",
                    )}
                  >
                    {msg.role === "user" ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "rounded-xl px-3 py-2 max-w-[85%] text-sm",
                      msg.role === "user"
                        ? "bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200"
                        : "bg-muted",
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </p>
                    {msg.role === "assistant" && (
                      <button
                        onClick={() => handleCopy(msg.content, i)}
                        className="mt-1 text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {copiedIdx === i ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedIdx === i ? "تم النسخ" : "نسخ"}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-blue-dim)] text-[var(--color-brand-primary)]">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="bg-muted rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري التفكير...
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2 pt-2 border-t">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder={`اكتب سؤالك عن ${context}...`}
              className="min-h-[40px] max-h-[80px] resize-none"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="shrink-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-[var(--accent-danger)] mt-1">
              <AlertCircle className="h-3 w-3" />
              {error}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
