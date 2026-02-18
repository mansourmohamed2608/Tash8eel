"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CardSkeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Receipt,
  Check,
  Clock,
  X,
  MessageSquare,
  Send,
  RefreshCw,
} from "lucide-react";
import { merchantApi } from "@/lib/api";
import { useMerchant } from "@/hooks/use-merchant";
import {
  AiInsightsCard,
  generateQuotesInsights,
} from "@/components/ai/ai-insights-card";

interface Quote {
  id: string;
  customerName: string;
  customerPhone: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  status: "pending" | "accepted" | "rejected" | "expired";
  notes: string;
  createdAt: string;
  expiresAt: string;
}

interface QuoteEvent {
  id: string;
  action: string;
  note: string;
  createdAt: string;
  createdBy: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: {
    label: "قيد الانتظار",
    color:
      "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800",
    icon: Clock,
  },
  accepted: {
    label: "مقبول",
    color:
      "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-800",
    icon: Check,
  },
  rejected: {
    label: "مرفوض",
    color:
      "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800",
    icon: X,
  },
  expired: {
    label: "منتهي",
    color: "bg-muted text-muted-foreground border",
    icon: Clock,
  },
};

// Map backend statuses (DB enum) to frontend display statuses
const mapBackendStatus = (status: string): Quote["status"] => {
  const s = (status || "").toUpperCase();
  switch (s) {
    case "NEW":
    case "UNDER_REVIEW":
    case "QUOTED":
    case "PENDING":
      return "pending";
    case "ACCEPTED":
    case "ACTIVE":
      return "accepted";
    case "REJECTED":
      return "rejected";
    case "DONE":
    case "EXPIRED":
      return "expired";
    default:
      return (status || "pending").toLowerCase() as Quote["status"];
  }
};

export default function QuotesPage() {
  const { apiKey } = useMerchant();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [events, setEvents] = useState<QuoteEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [sending, setSending] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await merchantApi.getQuotes(apiKey, filter || undefined);
      // Map backend DB statuses (NEW, QUOTED, ACCEPTED, etc.) to frontend statuses
      const normalized = (data.quotes || []).map((q: any) => ({
        ...q,
        status: mapBackendStatus(q.status),
        // Map backend field names to frontend interface
        customerName: q.customerName || q.customer_name || q.title || "عميل",
        customerPhone: q.customerPhone || q.customer_phone || "",
        totalAmount: q.totalAmount || q.total_amount || q.amount || 0,
        items: q.items || [],
        notes: q.notes || q.description || "",
        createdAt: q.createdAt || q.created_at,
        expiresAt: q.expiresAt || q.expires_at || q.created_at,
      }));
      setQuotes(normalized);
    } catch (err) {
      console.error("Failed to fetch quotes:", err);
    } finally {
      setLoading(false);
    }
  }, [apiKey, filter]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  const openQuoteDetails = async (quote: Quote) => {
    setSelectedQuote(quote);
    setEventsLoading(true);
    try {
      const data = await merchantApi.getQuoteEvents(apiKey, quote.id);
      setEvents(data.events || []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedQuote || !noteText.trim()) return;
    setSending(true);
    try {
      await merchantApi.createQuoteEvent(apiKey, selectedQuote.id, {
        note: noteText,
      });
      setNoteText("");
      const data = await merchantApi.getQuoteEvents(apiKey, selectedQuote.id);
      setEvents(data.events || []);
    } catch {
      // Error handled by API client
    } finally {
      setSending(false);
    }
  };

  const handleAcceptQuote = async () => {
    if (!selectedQuote) return;
    setAccepting(true);
    try {
      await merchantApi.acceptQuote(apiKey, selectedQuote.id);
      setSelectedQuote({ ...selectedQuote, status: "accepted" });
      fetchQuotes();
    } catch {
      // Error handled by API client
    } finally {
      setAccepting(false);
    }
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount == null || isNaN(Number(amount))) return "٠٫٠٠ ج.م.";
    return new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: "EGP",
    }).format(Number(amount));
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "—";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto" dir="rtl">
        <PageHeader
          title="عروض الأسعار"
          description="إدارة عروض الأسعار المرسلة من العملاء"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {[1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const stats = {
    total: quotes.length,
    pending: quotes.filter((q) => q.status === "pending").length,
    accepted: quotes.filter((q) => q.status === "accepted").length,
    rejected: quotes.filter((q) => q.status === "rejected").length,
  };

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <PageHeader
        title="عروض الأسعار"
        description="إدارة عروض الأسعار المرسلة من العملاء والرد عليها"
      />

      {/* AI Quotes Insights */}
      <AiInsightsCard
        title="مساعد عروض الأسعار"
        insights={generateQuotesInsights({
          totalQuotes: stats.total,
          pendingQuotes: stats.pending,
          acceptedQuotes: stats.accepted,
          rejectedQuotes: stats.rejected,
        })}
        loading={loading}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 mb-8">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">الإجمالي</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 dark:border-yellow-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-300">
              {stats.pending}
            </p>
            <p className="text-sm text-muted-foreground">قيد الانتظار</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-300">
              {stats.accepted}
            </p>
            <p className="text-sm text-muted-foreground">مقبول</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800/50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-300">
              {stats.rejected}
            </p>
            <p className="text-sm text-muted-foreground">مرفوض</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["", "pending", "accepted", "rejected", "expired"].map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(status)}
            className={filter === status ? "" : ""}
          >
            {status === "" ? "الكل" : STATUS_CONFIG[status]?.label || status}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={fetchQuotes}
          className="ms-auto"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Quotes List */}
      {quotes.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg">لا توجد عروض أسعار</p>
            <p className="text-muted-foreground text-sm mt-2">
              ستظهر هنا عروض الأسعار عندما يطلبها العملاء عبر الواتساب
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {quotes.map((quote) => {
            const statusCfg =
              STATUS_CONFIG[quote.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusCfg.icon;
            return (
              <Card
                key={quote.id}
                className="hover:bg-muted/50 transition-all cursor-pointer"
                onClick={() => openQuoteDetails(quote)}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">
                        {quote.customerName}
                      </CardTitle>
                      <p className="text-muted-foreground text-xs mt-1">
                        {quote.customerPhone}
                      </p>
                    </div>
                    <Badge className={`${statusCfg.color} border text-xs`}>
                      <StatusIcon className="h-3 w-3 ml-1" />
                      {statusCfg.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {quote.items?.slice(0, 3).map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {item.name} ×{item.quantity}
                        </span>
                        <span>{formatCurrency(item.price)}</span>
                      </div>
                    ))}
                    {(quote.items?.length || 0) > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{quote.items.length - 3} عناصر أخرى
                      </p>
                    )}
                  </div>
                  <div className="flex justify-between items-center mt-4 pt-3 border-t">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(quote.createdAt)}
                    </span>
                    <span className="font-bold">
                      {formatCurrency(quote.totalAmount)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quote Details Dialog */}
      <Dialog
        open={!!selectedQuote}
        onOpenChange={() => setSelectedQuote(null)}
      >
        <DialogContent
          className="max-w-lg max-h-[85vh] overflow-y-auto"
          dir="rtl"
        >
          {selectedQuote && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  عرض سعر — {selectedQuote.customerName}
                </DialogTitle>
              </DialogHeader>

              {/* Items */}
              <div className="space-y-2 my-4">
                <h4 className="text-sm font-medium text-muted-foreground">
                  العناصر
                </h4>
                {selectedQuote.items?.map((item, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center bg-muted rounded-lg p-3"
                  >
                    <div>
                      <p className="text-sm">{item.name}</p>
                      <p className="text-muted-foreground text-xs">
                        الكمية: {item.quantity}
                      </p>
                    </div>
                    <span className="font-medium">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="text-muted-foreground font-medium">
                    الإجمالي
                  </span>
                  <span className="text-xl font-bold">
                    {formatCurrency(selectedQuote.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {selectedQuote.notes && (
                <div className="bg-muted rounded-lg p-3 mb-4">
                  <h4 className="text-sm text-muted-foreground mb-1">
                    ملاحظات العميل
                  </h4>
                  <p className="text-sm">{selectedQuote.notes}</p>
                </div>
              )}

              {/* Events / Timeline */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" />
                  سجل الأحداث
                </h4>
                {eventsLoading ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-8 bg-muted rounded" />
                    <div className="h-8 bg-muted rounded" />
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    لا توجد أحداث بعد
                  </p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {events.map((event) => (
                      <div
                        key={event.id}
                        className="bg-muted rounded-lg p-2 text-sm"
                      >
                        <div className="flex justify-between">
                          <span>{event.note}</span>
                          <span className="text-muted-foreground text-xs">
                            {formatDate(event.createdAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Note */}
              {selectedQuote.status === "pending" && (
                <div className="flex gap-2 mb-4">
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="أضف ملاحظة..."
                    className="min-h-[60px]"
                  />
                  <Button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || sending}
                    size="icon"
                    className="shrink-0 mt-auto"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <DialogFooter className="flex gap-2">
                {selectedQuote.status === "pending" && (
                  <Button
                    onClick={handleAcceptQuote}
                    disabled={accepting}
                    className="flex-1"
                  >
                    <Check className="h-4 w-4 ml-2" />
                    {accepting ? "جاري القبول..." : "قبول العرض"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setSelectedQuote(null)}
                >
                  إغلاق
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
