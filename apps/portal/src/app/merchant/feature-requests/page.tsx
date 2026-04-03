"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertBanner, EmptyState } from "@/components/ui/alerts";
import { Lightbulb, Plus, RefreshCw, MessageSquare } from "lucide-react";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";

const CATEGORIES = [
  { value: "FEATURE", label: "ميزة" },
  { value: "AGENT", label: "وكيل ذكاء" },
  { value: "INTEGRATION", label: "تكامل" },
  { value: "UX", label: "تحسين واجهة" },
  { value: "QUOTE", label: "عرض سعر" },
  { value: "OTHER", label: "أخرى" },
];

const PRIORITIES = [
  { value: "LOW", label: "منخفض" },
  { value: "MEDIUM", label: "متوسط" },
  { value: "HIGH", label: "عالي" },
  { value: "URGENT", label: "عاجل" },
];

const STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  NEW: { label: "جديد", variant: "secondary" },
  UNDER_REVIEW: { label: "قيد المراجعة", variant: "default" },
  PLANNED: { label: "مخطط", variant: "default" },
  IN_PROGRESS: { label: "قيد التنفيذ", variant: "default" },
  DONE: { label: "مكتمل", variant: "secondary" },
  REJECTED: { label: "مرفوض", variant: "destructive" },
};

const QUOTE_STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  NEW: { label: "جديد", variant: "secondary" },
  UNDER_REVIEW: { label: "قيد المراجعة", variant: "default" },
  QUOTED: { label: "تم التسعير", variant: "default" },
  ACCEPTED: { label: "مقبول", variant: "secondary" },
  REJECTED: { label: "مرفوض", variant: "destructive" },
  ACTIVE: { label: "نشط", variant: "secondary" },
  DONE: { label: "مكتمل", variant: "secondary" },
};

export default function FeatureRequestsPage() {
  const { merchantId, apiKey } = useMerchant();
  const { canApprove } = useRoleAccess("feature-requests");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("requests");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [expandedQuotes, setExpandedQuotes] = useState<Record<string, boolean>>(
    {},
  );
  const [quoteEvents, setQuoteEvents] = useState<Record<string, any[]>>({});
  const [quoteNoteDrafts, setQuoteNoteDrafts] = useState<
    Record<string, string>
  >({});
  const [addingNoteId, setAddingNoteId] = useState<string | null>(null);
  const [acceptingQuoteId, setAcceptingQuoteId] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("FEATURE");
  const [priority, setPriority] = useState("MEDIUM");

  const fetchRequests = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await merchantApi.getFeatureRequests(merchantId, apiKey);
      setRequests(res.requests || []);
    } catch (err: any) {
      setError(err.message || "فشل في تحميل الاقتراحات");
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey]);

  const fetchQuotes = useCallback(async () => {
    if (!apiKey) return;
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const res = await merchantApi.getQuotes(apiKey);
      setQuotes(res.quotes || []);
    } catch (err: any) {
      setQuotesError(err.message || "فشل في تحميل عروض السعر");
    } finally {
      setQuotesLoading(false);
    }
  }, [apiKey]);

  const loadQuoteEvents = useCallback(
    async (quoteId: string) => {
      if (!apiKey) return;
      try {
        const res = await merchantApi.getQuoteEvents(apiKey, quoteId);
        setQuoteEvents((prev) => ({ ...prev, [quoteId]: res.events || [] }));
      } catch (err: any) {
        setQuotesError(err.message || "فشل في تحميل تفاصيل العرض");
      }
    },
    [apiKey],
  );

  const toggleQuoteExpand = (quoteId: string) => {
    setExpandedQuotes((prev) => {
      const next = { ...prev, [quoteId]: !prev[quoteId] };
      if (next[quoteId] && !quoteEvents[quoteId]) {
        loadQuoteEvents(quoteId);
      }
      return next;
    });
  };

  const handleAddNote = async (quoteId: string) => {
    const note = quoteNoteDrafts[quoteId]?.trim();
    if (!note || !apiKey) return;
    setAddingNoteId(quoteId);
    try {
      await merchantApi.createQuoteEvent(apiKey, quoteId, { note });
      setQuoteNoteDrafts((prev) => ({ ...prev, [quoteId]: "" }));
      await loadQuoteEvents(quoteId);
    } catch (err: any) {
      setQuotesError(err.message || "فشل في إضافة الملاحظة");
    } finally {
      setAddingNoteId(null);
    }
  };

  const handleAcceptQuote = async (quoteId: string) => {
    if (!apiKey) return;
    setAcceptingQuoteId(quoteId);
    setQuotesError(null);
    try {
      await merchantApi.acceptQuote(apiKey, quoteId);
      await fetchQuotes();
    } catch (err: any) {
      setQuotesError(err.message || "فشل في قبول العرض");
    } finally {
      setAcceptingQuoteId(null);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (activeTab === "quotes") {
      fetchQuotes();
    }
  }, [activeTab, fetchQuotes]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "quotes" || tab === "requests") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "requests") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await merchantApi.createFeatureRequest(merchantId, apiKey, {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        priority,
      });
      setTitle("");
      setDescription("");
      setCategory("FEATURE");
      setPriority("MEDIUM");
      setShowDialog(false);
      await fetchRequests();
    } catch (err: any) {
      setError(err.message || "فشل في إرسال الاقتراح");
    } finally {
      setSubmitting(false);
    }
  };

  const emptyState = useMemo(
    () => requests.length === 0 && !loading,
    [requests, loading],
  );

  const emptyQuotes = useMemo(
    () => quotes.length === 0 && !quotesLoading,
    [quotes, quotesLoading],
  );

  const headerActions =
    activeTab === "requests" ? (
      <div className="flex gap-2">
        <Button variant="outline" onClick={fetchRequests} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          تحديث
        </Button>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4" />
          اقتراح جديد
        </Button>
      </div>
    ) : (
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={fetchQuotes}
          disabled={quotesLoading}
        >
          <RefreshCw className="h-4 w-4" />
          تحديث عروض السعر
        </Button>
      </div>
    );

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="الاقتراحات وعروض السعر"
        description="اقتراحات ميزات جديدة للنظام وعروض أسعار الباقات المخصصة"
        actions={headerActions}
      />

      {error && (
        <AlertBanner
          type="error"
          title="خطأ"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid grid-cols-2 w-full md:w-[360px]">
          <TabsTrigger value="requests">الاقتراحات</TabsTrigger>
          <TabsTrigger value="quotes">عروض السعر</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          {emptyState && (
            <EmptyState
              icon={<Lightbulb className="h-12 w-12" />}
              title="لا توجد اقتراحات بعد"
              description="شاركنا أفكارك حول الميزات أو الوكلاء الذين تحتاجهم"
              action={
                <Button onClick={() => setShowDialog(true)}>
                  <Plus className="h-4 w-4 ml-2" />
                  اقتراح جديد
                </Button>
              }
            />
          )}

          {!emptyState && (
            <div className="grid gap-4">
              {requests.map((req) => {
                const status = STATUS_LABELS[req.status] || {
                  label: req.status,
                  variant: "secondary",
                };
                const categoryLabel =
                  CATEGORIES.find((c) => c.value === req.category)?.label ||
                  req.category;
                const priorityLabel =
                  PRIORITIES.find((p) => p.value === req.priority)?.label ||
                  req.priority;
                return (
                  <Card key={req.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{req.title}</CardTitle>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <CardDescription className="flex gap-2">
                        <span>التصنيف: {categoryLabel}</span>
                        <span>الأولوية: {priorityLabel}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {req.description || "بدون وصف"}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quotes" className="space-y-4">
          {quotesError && (
            <AlertBanner
              type="error"
              title="خطأ"
              message={quotesError}
              onDismiss={() => setQuotesError(null)}
            />
          )}

          {quotesLoading && (
            <div className="text-sm text-muted-foreground">
              جاري تحميل عروض السعر...
            </div>
          )}

          {emptyQuotes && (
            <EmptyState
              icon={<MessageSquare className="h-12 w-12" />}
              title="لا توجد عروض سعر بعد"
              description="ابدأ بطلب باقة مخصصة من صفحة الخطة"
            />
          )}

          {!emptyQuotes && (
            <div className="grid gap-4">
              {quotes.map((quote) => {
                const status = QUOTE_STATUS_LABELS[quote.status] || {
                  label: quote.status,
                  variant: "secondary",
                };
                const agentsCount = quote.requested_agents?.length || 0;
                const featuresCount = quote.requested_features?.length || 0;
                const isExpanded = expandedQuotes[quote.id];
                const quotedPrice = quote.quoted_price_cents
                  ? `${(quote.quoted_price_cents / 100).toLocaleString("ar-EG")} ${quote.currency || "EGP"}`
                  : null;
                return (
                  <Card key={quote.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">
                            {quote.title || "عرض سعر مخصص"}
                          </CardTitle>
                          <CardDescription>
                            {agentsCount} وكلاء • {featuresCount} ميزات
                            {quotedPrice
                              ? ` • السعر المقترح: ${quotedPrice}`
                              : ""}
                          </CardDescription>
                        </div>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          آخر تحديث:{" "}
                          {quote.updated_at
                            ? new Date(quote.updated_at).toLocaleDateString(
                                "ar-EG",
                              )
                            : "-"}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleQuoteExpand(quote.id)}
                        >
                          {isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                        </Button>
                      </div>

                      {isExpanded && (
                        <div className="space-y-3">
                          {quote.status === "QUOTED" && (
                            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-green-200 bg-green-50 p-3 text-sm">
                              <div className="text-green-700 font-semibold">
                                تم التسعير - هل تريد قبول العرض؟
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleAcceptQuote(quote.id)}
                                disabled={
                                  !canApprove || acceptingQuoteId === quote.id
                                }
                              >
                                {acceptingQuoteId === quote.id
                                  ? "جاري القبول..."
                                  : "قبول العرض"}
                              </Button>
                            </div>
                          )}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              ملاحظات للعرض
                            </label>
                            <Textarea
                              value={quoteNoteDrafts[quote.id] || ""}
                              onChange={(e) =>
                                setQuoteNoteDrafts((prev) => ({
                                  ...prev,
                                  [quote.id]: e.target.value,
                                }))
                              }
                              rows={3}
                            />
                            <Button
                              size="sm"
                              onClick={() => handleAddNote(quote.id)}
                              disabled={
                                addingNoteId === quote.id ||
                                !(quoteNoteDrafts[quote.id] || "").trim()
                              }
                            >
                              {addingNoteId === quote.id
                                ? "جاري الإرسال..."
                                : "إضافة ملاحظة"}
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-medium">
                              الخط الزمني
                            </div>
                            {(quoteEvents[quote.id] || []).length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                لا توجد تحديثات بعد
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {(quoteEvents[quote.id] || []).map((event) => (
                                  <div
                                    key={event.id}
                                    className="rounded-md border p-2 text-xs text-muted-foreground"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span>{event.action}</span>
                                      <span>
                                        {new Date(
                                          event.created_at,
                                        ).toLocaleString("ar-EG")}
                                      </span>
                                    </div>
                                    {event.note && (
                                      <div className="mt-1">{event.note}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>اقتراح ميزة جديدة</DialogTitle>
            <DialogDescription>
              شاركنا فكرتك بإيجاز وسنتابعها معك
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">العنوان</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: وكيل متابعة العملاء"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">الوصف</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">التصنيف</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">الأولوية</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
            >
              {submitting ? "جاري الإرسال..." : "إرسال الاقتراح"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
