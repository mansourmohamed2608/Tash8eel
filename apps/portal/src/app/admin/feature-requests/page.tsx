"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { AlertBanner, EmptyState } from "@/components/ui/alerts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { portalApi } from "@/lib/authenticated-api";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

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

export default function AdminFeatureRequestsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("requests");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [quoteEvents, setQuoteEvents] = useState<Record<string, any[]>>({});
  const [quoteDraftNotes, setQuoteDraftNotes] = useState<
    Record<string, string>
  >({});
  const [quoteEdits, setQuoteEdits] = useState<
    Record<
      string,
      {
        status?: string;
        quotedPriceCents?: string;
        currency?: string;
        notes?: string;
      }
    >
  >({});
  const [quoteUpdatingId, setQuoteUpdatingId] = useState<string | null>(null);

  const parseQuotePayload = (description?: string, metadata?: any) => {
    if (metadata?.quote) return metadata.quote;
    if (metadata?.agents || metadata?.features) return metadata;
    if (!description) return null;
    const marker = "تفاصيل JSON:";
    const markerIndex = description.indexOf(marker);
    let payloadText = "";
    if (markerIndex >= 0) {
      payloadText = description.slice(markerIndex + marker.length).trim();
    } else {
      const start = description.lastIndexOf("{");
      const end = description.lastIndexOf("}");
      if (start >= 0 && end > start) {
        payloadText = description.slice(start, end + 1).trim();
      }
    }
    if (!payloadText) return null;
    try {
      const parsed = JSON.parse(payloadText);
      if (!parsed?.agents && !parsed?.features) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalApi.getAdminFeatureRequests({
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
      });
      setRequests(res?.requests || []);
    } catch (err: any) {
      setError(err.message || "فشل في تحميل الاقتراحات");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  const fetchQuotes = useCallback(async () => {
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const res = await portalApi.getAdminQuotes({
        status: statusFilter === "all" ? undefined : statusFilter,
        merchantId: searchQuery || undefined,
      });
      const loadedQuotes = res?.quotes || [];
      setQuotes(loadedQuotes);
      setQuoteEdits((prev) => {
        const next = { ...prev };
        loadedQuotes.forEach((quote: any) => {
          if (!next[quote.id]) {
            next[quote.id] = {
              status: quote.status,
              quotedPriceCents: quote.quoted_price_cents
                ? String(quote.quoted_price_cents / 100)
                : "",
              currency: quote.currency || "EGP",
              notes: quote.notes || "",
            };
          }
        });
        return next;
      });
    } catch (err: any) {
      setQuotesError(err.message || "فشل في تحميل عروض السعر");
    } finally {
      setQuotesLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (activeTab === "quotes") {
      fetchQuotes();
    }
  }, [activeTab, fetchQuotes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRequests();
    setRefreshing(false);
  };

  const handleUpdate = async (
    id: string,
    data: { status?: string; priority?: string },
  ) => {
    setUpdatingId(id);
    setError(null);
    try {
      const res = await portalApi.updateAdminFeatureRequest(id, data);
      setRequests((prev) =>
        prev.map((req) => (req.id === id ? res.request : req)),
      );
    } catch (err: any) {
      setError(err.message || "فشل في تحديث الاقتراح");
    } finally {
      setUpdatingId(null);
    }
  };

  const loadQuoteEvents = useCallback(async (quoteId: string) => {
    try {
      const res = await portalApi.getAdminQuoteEvents(quoteId);
      setQuoteEvents((prev) => ({ ...prev, [quoteId]: res?.events || [] }));
    } catch (err: any) {
      setQuotesError(err.message || "فشل في تحميل الخط الزمني");
    }
  }, []);

  const handleUpdateQuote = async (quote: any) => {
    const draft = quoteEdits[quote.id] || {};
    setQuoteUpdatingId(quote.id);
    setQuotesError(null);
    try {
      const payload: any = {};
      if (draft.status) payload.status = draft.status;
      if (
        draft.quotedPriceCents !== undefined &&
        draft.quotedPriceCents !== ""
      ) {
        payload.quotedPriceCents = Math.round(
          Number(draft.quotedPriceCents) * 100,
        );
      }
      if (draft.currency) payload.currency = draft.currency;
      if (draft.notes !== undefined) payload.notes = draft.notes;

      const res = await portalApi.updateAdminQuote(quote.id, payload);
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? res.quote : q)));
      await loadQuoteEvents(quote.id);
      toast({ title: "تم التحديث", description: "تم حفظ بيانات العرض." });
    } catch (err: any) {
      setQuotesError(err.message || "فشل في تحديث العرض");
    } finally {
      setQuoteUpdatingId(null);
    }
  };

  const handleAddAdminNote = async (quoteId: string) => {
    const note = quoteDraftNotes[quoteId]?.trim();
    if (!note) return;
    setQuoteUpdatingId(quoteId);
    try {
      await portalApi.createAdminQuoteEvent(quoteId, { note });
      setQuoteDraftNotes((prev) => ({ ...prev, [quoteId]: "" }));
      await loadQuoteEvents(quoteId);
      toast({ title: "تمت الإضافة", description: "تم حفظ الملاحظة." });
    } catch (err: any) {
      setQuotesError(err.message || "فشل في إضافة الملاحظة");
    } finally {
      setQuoteUpdatingId(null);
    }
  };

  const handleApplyQuoteEntitlements = async (quote: any) => {
    setApplyingId(quote.id);
    setError(null);
    try {
      await portalApi.applyPurchaseEvent({
        merchantId: quote.merchant_id,
        planCode: "CUSTOM",
        source: "admin_quote",
        entitlements: {
          enabledAgents: quote.requested_agents || [],
          enabledFeatures: quote.requested_features || [],
          limits: quote.limits || {},
          customPrice: quote.quoted_price_cents
            ? Math.round(quote.quoted_price_cents / 100)
            : null,
        },
      });
      toast({ title: "تم التطبيق", description: "تم تفعيل الصلاحيات للعميل." });
    } catch (err: any) {
      setQuotesError(err.message || "فشل في تطبيق الصلاحيات");
    } finally {
      setApplyingId(null);
    }
  };

  const handleApplyQuote = async (req: any) => {
    const payload = parseQuotePayload(req?.description, req?.metadata);
    if (!payload?.agents && !payload?.features) {
      toast({
        title: "لا توجد تفاصيل",
        description: "لا يمكن استخراج تفاصيل الباقة من الطلب.",
        variant: "destructive",
      });
      return;
    }
    setApplyingId(req.id);
    setError(null);
    try {
      await portalApi.applyPurchaseEvent({
        merchantId: req.merchant_id,
        planCode: "CUSTOM",
        source: "admin_quote",
        entitlements: {
          enabledAgents: payload.agents || [],
          enabledFeatures: payload.features || [],
          limits: payload.limits || {},
          customPrice: payload.customPrice ?? null,
        },
      });
      await handleUpdate(req.id, { status: "IN_PROGRESS" });
      toast({
        title: "تم التطبيق",
        description: "تم تفعيل الصلاحيات للعميل بنجاح.",
      });
    } catch (err: any) {
      setError(err.message || "فشل في تطبيق الصلاحيات");
    } finally {
      setApplyingId(null);
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const matchesSearch =
        !searchQuery ||
        req.title?.includes(searchQuery) ||
        req.merchant_id?.includes(searchQuery) ||
        req.merchant_name?.includes(searchQuery);
      const matchesPriority =
        priorityFilter === "all" || req.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [requests, searchQuery, priorityFilter]);

  const emptyState = useMemo(
    () => !loading && filteredRequests.length === 0,
    [loading, filteredRequests.length],
  );
  const emptyQuotes = useMemo(
    () => !quotesLoading && quotes.length === 0,
    [quotesLoading, quotes.length],
  );

  const headerActions =
    activeTab === "requests" ? (
      <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
        <RefreshCw className="h-4 w-4 ml-2" />
        تحديث
      </Button>
    ) : (
      <Button variant="outline" onClick={fetchQuotes} disabled={quotesLoading}>
        <RefreshCw className="h-4 w-4 ml-2" />
        تحديث عروض السعر
      </Button>
    );

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="اقتراحات الميزات"
        description="مراجعة اقتراحات التجار وتحديد أولويات التنفيذ"
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 w-full md:w-[360px]">
          <TabsTrigger value="requests">الاقتراحات</TabsTrigger>
          <TabsTrigger value="quotes">عروض السعر</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardContent className="p-4 grid gap-3 md:grid-cols-4">
              <Input
                placeholder="بحث بالعنوان أو التاجر"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {Object.keys(STATUS_LABELS).map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="الفئة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفئات</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="الأولوية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأولويات</SelectItem>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {emptyState && (
            <EmptyState
              icon={<Lightbulb className="h-12 w-12" />}
              title="لا توجد اقتراحات بعد"
              description="ستظهر الاقتراحات المقدمة من التجار هنا"
            />
          )}

          {!emptyState && (
            <div className="grid gap-4">
              {filteredRequests.map((req) => {
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
                const quotePayload =
                  req.category === "QUOTE"
                    ? parseQuotePayload(req.description, req.metadata)
                    : null;

                return (
                  <Card key={req.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{req.title}</CardTitle>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <CardDescription className="flex flex-wrap gap-2">
                        <span>
                          التاجر: {req.merchant_name || req.merchant_id}
                        </span>
                        <span>الفئة: {categoryLabel}</span>
                        <span>الأولوية: {priorityLabel}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {req.description || "بدون وصف"}
                      </p>
                      {quotePayload && (
                        <div className="rounded-md border border-dashed border-primary-200 bg-primary-50 p-3 text-sm space-y-2">
                          <div className="flex items-center gap-2 font-semibold text-primary-700">
                            <Sparkles className="h-4 w-4" />
                            تفاصيل عرض السعر
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">
                              الوكلاء: {(quotePayload.agents || []).length}
                            </Badge>
                            <Badge variant="secondary">
                              الميزات: {(quotePayload.features || []).length}
                            </Badge>
                            {quotePayload.limits?.messagesPerMonth && (
                              <Badge variant="secondary">
                                رسائل: {quotePayload.limits.messagesPerMonth}
                              </Badge>
                            )}
                            {quotePayload.limits?.whatsappNumbers && (
                              <Badge variant="secondary">
                                واتساب: {quotePayload.limits.whatsappNumbers}
                              </Badge>
                            )}
                            {quotePayload.limits?.teamMembers && (
                              <Badge variant="secondary">
                                فريق: {quotePayload.limits.teamMembers}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleApplyQuote(req)}
                              disabled={applyingId === req.id}
                            >
                              {applyingId === req.id
                                ? "جاري التطبيق..."
                                : "تطبيق الصلاحيات"}
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <Link
                                href={`/admin/entitlements?merchant=${encodeURIComponent(req.merchant_id)}`}
                              >
                                فتح صلاحيات التاجر
                              </Link>
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            تحديث الحالة
                          </label>
                          <Select
                            value={req.status}
                            onValueChange={(value) =>
                              handleUpdate(req.id, { status: value })
                            }
                            disabled={updatingId === req.id}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(STATUS_LABELS).map((statusKey) => (
                                <SelectItem key={statusKey} value={statusKey}>
                                  {STATUS_LABELS[statusKey].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            تحديث الأولوية
                          </label>
                          <Select
                            value={req.priority}
                            onValueChange={(value) =>
                              handleUpdate(req.id, { priority: value })
                            }
                            disabled={updatingId === req.id}
                          >
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
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="quotes" className="space-y-4">
          <Card>
            <CardContent className="p-4 grid gap-3 md:grid-cols-2">
              <Input
                placeholder="بحث برقم التاجر"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="حالة العرض" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {Object.keys(QUOTE_STATUS_LABELS).map((status) => (
                    <SelectItem key={status} value={status}>
                      {QUOTE_STATUS_LABELS[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

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
              icon={<Lightbulb className="h-12 w-12" />}
              title="لا توجد عروض سعر بعد"
              description="ستظهر عروض السعر المرسلة من التجار هنا"
            />
          )}

          {!emptyQuotes && (
            <div className="grid gap-4">
              {quotes.map((quote) => {
                const status = QUOTE_STATUS_LABELS[quote.status] || {
                  label: quote.status,
                  variant: "secondary",
                };
                const draft = quoteEdits[quote.id] || {};
                const events = quoteEvents[quote.id] || [];
                return (
                  <Card key={quote.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">
                            {quote.title || "عرض سعر مخصص"}
                          </CardTitle>
                          <CardDescription>
                            التاجر: {quote.merchant_name || quote.merchant_id} •{" "}
                            {quote.requested_agents?.length || 0} وكلاء •{" "}
                            {quote.requested_features?.length || 0} ميزات
                          </CardDescription>
                        </div>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">الحالة</label>
                          <Select
                            value={draft.status || quote.status}
                            onValueChange={(value) =>
                              setQuoteEdits((prev) => ({
                                ...prev,
                                [quote.id]: { ...draft, status: value },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(QUOTE_STATUS_LABELS).map(
                                (statusKey) => (
                                  <SelectItem key={statusKey} value={statusKey}>
                                    {QUOTE_STATUS_LABELS[statusKey].label}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            السعر الشهري (EGP)
                          </label>
                          <Input
                            type="number"
                            value={draft.quotedPriceCents ?? ""}
                            onChange={(e) =>
                              setQuoteEdits((prev) => ({
                                ...prev,
                                [quote.id]: {
                                  ...draft,
                                  quotedPriceCents: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">العملة</label>
                          <Input
                            value={draft.currency || quote.currency || "EGP"}
                            onChange={(e) =>
                              setQuoteEdits((prev) => ({
                                ...prev,
                                [quote.id]: {
                                  ...draft,
                                  currency: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          ملاحظات داخلية
                        </label>
                        <Textarea
                          rows={2}
                          value={draft.notes ?? quote.notes ?? ""}
                          onChange={(e) =>
                            setQuoteEdits((prev) => ({
                              ...prev,
                              [quote.id]: { ...draft, notes: e.target.value },
                            }))
                          }
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateQuote(quote)}
                          disabled={quoteUpdatingId === quote.id}
                        >
                          {quoteUpdatingId === quote.id
                            ? "جاري الحفظ..."
                            : "حفظ التحديثات"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApplyQuoteEntitlements(quote)}
                          disabled={applyingId === quote.id}
                        >
                          {applyingId === quote.id
                            ? "جاري التطبيق..."
                            : "تطبيق الصلاحيات"}
                        </Button>
                        <Button size="sm" variant="ghost" asChild>
                          <Link
                            href={`/admin/entitlements?merchant=${encodeURIComponent(quote.merchant_id)}`}
                          >
                            فتح صلاحيات التاجر
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => loadQuoteEvents(quote.id)}
                        >
                          تحديث الخط الزمني
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          إضافة ملاحظة
                        </label>
                        <div className="flex flex-col md:flex-row gap-2">
                          <Input
                            value={quoteDraftNotes[quote.id] || ""}
                            onChange={(e) =>
                              setQuoteDraftNotes((prev) => ({
                                ...prev,
                                [quote.id]: e.target.value,
                              }))
                            }
                            placeholder="أضف ملاحظة للتاجر أو للفريق الداخلي"
                          />
                          <Button
                            size="sm"
                            onClick={() => handleAddAdminNote(quote.id)}
                            disabled={
                              quoteUpdatingId === quote.id ||
                              !(quoteDraftNotes[quote.id] || "").trim()
                            }
                          >
                            إضافة
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">الخط الزمني</div>
                        {events.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            لا توجد تحديثات بعد
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {events.map((event) => (
                              <div
                                key={event.id}
                                className="rounded-md border p-2 text-xs text-muted-foreground"
                              >
                                <div className="flex items-center justify-between">
                                  <span>{event.action}</span>
                                  <span>
                                    {new Date(event.created_at).toLocaleString(
                                      "ar-EG",
                                    )}
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
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
