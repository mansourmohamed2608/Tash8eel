"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, AlertBanner } from "@/components/ui/alerts";
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Search,
  RefreshCw,
  Play,
  Trash2,
  Eye,
  Clock,
  Filter,
  CheckCircle,
  XCircle,
  RotateCcw,
  Loader2,
} from "lucide-react";
import {
  cn,
  formatDate,
  formatRelativeTime,
  getStatusColor,
} from "@/lib/utils";
import { portalApi } from "@/lib/client";

interface DlqEvent {
  id: string;
  eventType: string;
  aggregateId: string;
  merchantId: string;
  merchantName: string;
  payload: Record<string, unknown>;
  failReason: string;
  failedAt: string;
  retryCount: number;
  maxRetries: number;
  status: "pending" | "retrying" | "resolved" | "dead";
  lastRetryAt?: string;
}

const statusLabels: Record<string, string> = {
  pending: "معلق",
  retrying: "جاري المحاولة",
  resolved: "تم الحل",
  dead: "فشل نهائي",
};

const statusColors: Record<string, string> = {
  pending:
    "border border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/12 text-[var(--accent-warning)]",
  retrying:
    "border border-[var(--accent-blue)]/25 bg-[var(--accent-blue)]/12 text-[var(--accent-blue)]",
  resolved:
    "border border-[var(--accent-success)]/25 bg-[var(--accent-success)]/12 text-[var(--accent-success)]",
  dead: "border border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/12 text-[var(--accent-danger)]",
};

const JsonPayloadPreview = ({ value }: { value: unknown }) => (
  <pre
    className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm leading-6"
    dir="ltr"
  >
    {JSON.stringify(value, null, 2)}
  </pre>
);

export default function DlqPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<DlqEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<DlqEvent | null>(null);
  const [replaying, setReplaying] = useState<string | null>(null);
  const itemsPerPage = 10;

  const fetchEvents = useCallback(async () => {
    try {
      const data = await portalApi.getAdminDlqEvents();
      setEvents(data || []);
    } catch (error) {
      console.error("Failed to fetch DLQ events:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  };

  const filteredEvents = events.filter((event) => {
    const matchesSearch =
      event.eventType.includes(searchQuery) ||
      event.aggregateId.includes(searchQuery) ||
      event.merchantName.includes(searchQuery) ||
      event.failReason.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || event.status === statusFilter;
    const matchesType =
      typeFilter === "all" || event.eventType.startsWith(typeFilter);
    return matchesSearch && matchesStatus && matchesType;
  });

  const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
  const paginatedEvents = filteredEvents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const pendingCount = events.filter((e) => e.status === "pending").length;
  const deadCount = events.filter((e) => e.status === "dead").length;

  const handleReplay = async (eventId: string) => {
    setReplaying(eventId);
    try {
      await portalApi.retryAdminDlqEvent(eventId);
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId
            ? {
                ...e,
                status: "retrying" as const,
                retryCount: e.retryCount + 1,
              }
            : e,
        ),
      );
    } catch (error) {
      console.error("Failed to retry DLQ event:", error);
    } finally {
      setReplaying(null);
    }
  };

  const handleReplayAll = async () => {
    const pendingEvents = events.filter(
      (e) => e.status === "pending" || e.status === "dead",
    );
    for (const event of pendingEvents) {
      await handleReplay(event.id);
    }
  };

  const handleDelete = async (eventId: string) => {
    try {
      await portalApi.dismissAdminDlqEvent(eventId);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      setSelectedEvent(null);
    } catch (error) {
      console.error("Failed to dismiss DLQ event:", error);
    }
  };

  const uniqueEventTypes = Array.from(
    new Set(events.map((e) => e.eventType.split(".")[0])),
  );

  if (loading) {
    return (
      <div>
        <PageHeader title="إدارة DLQ" />
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      <PageHeader
        title="إدارة DLQ"
        description="مراقبة وإعادة معالجة الأحداث الفاشلة"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full sm:w-auto"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              تحديث
            </Button>
            <Button
              onClick={handleReplayAll}
              disabled={pendingCount === 0 && deadCount === 0}
              className="w-full sm:w-auto"
            >
              <RotateCcw className="h-4 w-4" />
              إعادة معالجة الكل ({pendingCount + deadCount})
            </Button>
          </div>
        }
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div>
            <p className="app-hero-band__eyebrow">موثوقية وتشغيل</p>
            <h2 className="app-hero-band__title">
              سيطرة أوضح على الأحداث المتعثرة ومحاولات الاسترجاع
            </h2>
            <p className="app-hero-band__copy">
              راقب الطوابير الفاشلة، فرّق بين الحالات المعلقة والنهائية، وأعد
              تشغيل الممرات الحرجة قبل أن تتحول إلى تراكم تشغيلي.
            </p>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                الأحداث الحالية
              </span>
              <strong className="app-hero-band__metric-value">
                {events.length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">معلّقة</span>
              <strong className="app-hero-band__metric-value">
                {pendingCount}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">فشل نهائي</span>
              <strong className="app-hero-band__metric-value">
                {deadCount}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* Alerts */}
      {deadCount > 0 && (
        <AlertBanner
          type="error"
          title="أحداث فاشلة نهائياً"
          message={`يوجد ${deadCount} حدث وصل للحد الأقصى من المحاولات ويحتاج تدخل يدوي`}
        />
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="app-data-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الأحداث</p>
                <p className="text-2xl font-bold">{events.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="app-data-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">معلق</p>
                <p className="text-2xl font-bold text-[var(--accent-warning)]">
                  {pendingCount}
                </p>
              </div>
              <Clock className="h-8 w-8 text-[var(--accent-warning)]" />
            </div>
          </CardContent>
        </Card>
        <Card className="app-data-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">تم الحل</p>
                <p className="text-2xl font-bold text-[var(--accent-success)]">
                  {events.filter((e) => e.status === "resolved").length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-[var(--accent-success)]" />
            </div>
          </CardContent>
        </Card>
        <Card className="app-data-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">فشل نهائي</p>
                <p className="text-2xl font-bold text-[var(--accent-danger)]">
                  {deadCount}
                </p>
              </div>
              <XCircle className="h-8 w-8 text-[var(--accent-danger)]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="app-data-card app-data-card--muted">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بنوع الحدث، المعرف، أو سبب الفشل..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="pending">معلق</SelectItem>
                <SelectItem value="retrying">جاري المحاولة</SelectItem>
                <SelectItem value="resolved">تم الحل</SelectItem>
                <SelectItem value="dead">فشل نهائي</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                {uniqueEventTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card className="app-data-card">
        <CardContent className="p-0">
          {filteredEvents.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle className="h-12 w-12" />}
              title="لا توجد أحداث"
              description="لم يتم العثور على أحداث فاشلة"
            />
          ) : (
            <>
              <div className="divide-y md:hidden">
                {paginatedEvents.map((event) => (
                  <div key={event.id} className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-mono text-sm font-medium">
                          {event.eventType}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {event.aggregateId}
                        </p>
                      </div>
                      <Badge
                        className={cn("text-xs", statusColors[event.status])}
                      >
                        {statusLabels[event.status]}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-muted-foreground">التاجر</p>
                        <p>{event.merchantName}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">المحاولات</p>
                        <p>
                          {event.retryCount} / {event.maxRetries}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-muted-foreground">سبب الفشل</p>
                        <p className="text-sm text-[var(--accent-danger)]">
                          {event.failReason}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">الوقت</p>
                        <p>{formatRelativeTime(event.failedAt)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => setSelectedEvent(event)}
                      >
                        <Eye className="ml-2 h-4 w-4" />
                        عرض
                      </Button>
                      {event.status !== "resolved" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={() => handleReplay(event.id)}
                          disabled={replaying === event.id}
                        >
                          <Play
                            className={cn(
                              "ml-2 h-4 w-4",
                              replaying === event.id && "animate-pulse",
                            )}
                          />
                          إعادة المعالجة
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-[var(--accent-danger)] sm:w-auto"
                        onClick={() => handleDelete(event.id)}
                      >
                        <Trash2 className="ml-2 h-4 w-4 text-[var(--accent-danger)]" />
                        حذف
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-right p-4 font-medium text-sm">
                        الحدث
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        التاجر
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        سبب الفشل
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        الحالة
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        المحاولات
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        الوقت
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        إجراءات
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginatedEvents.map((event) => (
                      <tr key={event.id} className="hover:bg-muted/30">
                        <td className="p-4">
                          <div>
                            <p className="font-medium font-mono text-sm">
                              {event.eventType}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {event.aggregateId}
                            </p>
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="text-sm">{event.merchantName}</p>
                        </td>
                        <td className="p-4 max-w-xs">
                          <p
                            className="truncate text-sm text-[var(--accent-danger)]"
                            title={event.failReason}
                          >
                            {event.failReason}
                          </p>
                        </td>
                        <td className="p-4">
                          <Badge
                            className={cn(
                              "text-xs",
                              statusColors[event.status],
                            )}
                          >
                            {statusLabels[event.status]}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <p className="text-sm">
                            {event.retryCount} / {event.maxRetries}
                          </p>
                        </td>
                        <td className="p-4">
                          <p className="text-sm text-muted-foreground">
                            {formatRelativeTime(event.failedAt)}
                          </p>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedEvent(event)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {event.status !== "resolved" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleReplay(event.id)}
                                disabled={replaying === event.id}
                              >
                                <Play
                                  className={cn(
                                    "h-4 w-4",
                                    replaying === event.id && "animate-pulse",
                                  )}
                                />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(event.id)}
                            >
                              <Trash2 className="h-4 w-4 text-[var(--accent-danger)]" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="p-4 border-t">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Event Details Dialog */}
      <Dialog
        open={!!selectedEvent}
        onOpenChange={() => setSelectedEvent(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل الحدث</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">نوع الحدث</p>
                  <p className="break-all font-mono text-sm">
                    {selectedEvent.eventType}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">معرف الكيان</p>
                  <p className="break-all font-mono text-sm">
                    {selectedEvent.aggregateId}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">التاجر</p>
                  <p className="font-medium">{selectedEvent.merchantName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">الحالة</p>
                  <Badge
                    className={cn(
                      "text-xs",
                      statusColors[selectedEvent.status],
                    )}
                  >
                    {statusLabels[selectedEvent.status]}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">المحاولات</p>
                  <p className="font-medium">
                    {selectedEvent.retryCount} / {selectedEvent.maxRetries}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">وقت الفشل</p>
                  <p className="font-medium">
                    {formatDate(selectedEvent.failedAt, "long")}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">سبب الفشل</p>
                <div className="rounded-lg border border-[var(--accent-danger)]/25 bg-[var(--accent-danger)]/12 p-3">
                  <p className="break-words text-sm text-[var(--accent-danger)]">
                    {selectedEvent.failReason}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  البيانات (Payload)
                </p>
                <JsonPayloadPreview value={selectedEvent.payload} />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setSelectedEvent(null)}
              className="w-full sm:w-auto"
            >
              إغلاق
            </Button>
            {selectedEvent && selectedEvent.status !== "resolved" && (
              <Button
                onClick={() => handleReplay(selectedEvent.id)}
                className="w-full sm:w-auto"
              >
                <Play className="h-4 w-4" />
                إعادة المعالجة
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
