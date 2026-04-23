"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  History,
  Search,
  Filter,
  Download,
  Printer,
  Eye,
  User,
  Clock,
  Activity,
  FileText,
  Package,
  MessageSquare,
  Settings,
  Server,
  Shield,
  Users,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Loader2,
  Bell,
  SlidersHorizontal,
  Briefcase,
  Plug,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { portalApi } from "@/lib/client";

interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  staffId?: string;
  staffName?: string;
  staffEmail?: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  changes?: { field: string; from: any; to: any }[];
  ipAddress: string;
  userAgent: string;
  correlationId?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface ActivitySummary {
  byAction: { action: string; count: number }[];
  byResource: { resource: string; count: number }[];
  byStaff: { staffId: string; name: string; count: number }[];
  timeline: { date: string; count: number }[];
}

type AuditChange = { field: string; from: any; to: any };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const tryParseJson = (value: unknown): any => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const looksLikeJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!looksLikeJson) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const valuesDiffer = (a: unknown, b: unknown): boolean => {
  const left = tryParseJson(a);
  const right = tryParseJson(b);
  return JSON.stringify(left) !== JSON.stringify(right);
};

const buildChangesFromValues = (
  oldValue?: Record<string, any>,
  newValue?: Record<string, any>,
  parentKey = "",
): AuditChange[] => {
  if (!oldValue && !newValue) return [];
  const oldSafe = oldValue || {};
  const newSafe = newValue || {};
  const keys = Array.from(
    new Set([...Object.keys(oldSafe), ...Object.keys(newSafe)]),
  );
  const changes: AuditChange[] = [];

  for (const key of keys) {
    const path = parentKey ? `${parentKey}.${key}` : key;
    const oldFieldValue = tryParseJson((oldSafe as any)[key]);
    const newFieldValue = tryParseJson((newSafe as any)[key]);

    if (isPlainObject(oldFieldValue) && isPlainObject(newFieldValue)) {
      changes.push(
        ...buildChangesFromValues(
          oldFieldValue as Record<string, any>,
          newFieldValue as Record<string, any>,
          path,
        ),
      );
      continue;
    }

    if (valuesDiffer(oldFieldValue, newFieldValue)) {
      changes.push({
        field: path,
        from: oldFieldValue ?? null,
        to: newFieldValue ?? null,
      });
    }
  }

  return changes;
};

const actionColors: Record<string, string> = {
  CREATE: "bg-green-500",
  UPDATE: "bg-blue-500",
  DELETE: "bg-red-500",
  VIEW: "bg-gray-500",
  LOGIN: "bg-purple-500",
  LOGOUT: "bg-purple-300",
  EXPORT: "bg-yellow-500",
  IMPORT: "bg-cyan-500",
};

const actionLabels: Record<string, string> = {
  CREATE: "إنشاء",
  UPDATE: "تحديث",
  DELETE: "حذف",
  VIEW: "عرض",
  LOGIN: "تسجيل دخول",
  LOGOUT: "تسجيل خروج",
  EXPORT: "تصدير",
  IMPORT: "استيراد",
};

const resourceIcons: Record<string, any> = {
  ORDER: Package,
  CONVERSATION: MessageSquare,
  PRODUCT: FileText,
  CUSTOMER: User,
  STAFF: Users,
  SETTINGS: Settings,
  WEBHOOK: Activity,
  INVENTORY: Package,
};

const resourceLabels: Record<string, string> = {
  ORDER: "طلب",
  CONVERSATION: "محادثة",
  PRODUCT: "منتج",
  CUSTOMER: "عميل",
  STAFF: "موظف",
  SETTINGS: "إعدادات",
  WEBHOOK: "Webhook",
  INVENTORY: "مخزون",
};

const quickFilters = [
  { label: "الكل", value: "all" },
  { label: "الإعدادات", value: "SETTINGS" },
  { label: "المدفوعات", value: "PAYMENT_LINK" },
  { label: "المخزون", value: "INVENTORY" },
  { label: "المحادثات", value: "CONVERSATION" },
  { label: "الطلبات", value: "ORDER" },
];

const settingsSectionLabels: Record<string, string> = {
  business: "بيانات المتجر",
  notifications: "الإشعارات",
  preferences: "التفضيلات",
  onboarding: "التجهيز",
  reports: "التقارير",
  integrations: "التكاملات",
};

const JsonPreview = ({ value }: { value: unknown }) => (
  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs leading-5">
    {JSON.stringify(value, null, 2)}
  </pre>
);

const settingsSectionIcons: Record<string, any> = {
  business: Briefcase,
  notifications: Bell,
  preferences: SlidersHorizontal,
  onboarding: Settings,
  reports: FileText,
  integrations: Plug,
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [filters, setFilters] = useState({
    action: "all",
    resourceType: "all",
    staffId: "all",
    settingsSection: "all",
    search: "",
    dateFrom: "",
    dateTo: "",
  });
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { toast } = useToast();

  const fetchAuditData = useCallback(async () => {
    try {
      setLoading(true);
      const [logsData, summaryData] = await Promise.all([
        portalApi.getAuditLogs({
          action: filters.action !== "all" ? filters.action : undefined,
          resource:
            filters.resourceType !== "all" ? filters.resourceType : undefined,
          staffId: filters.staffId !== "all" ? filters.staffId : undefined,
          startDate: filters.dateFrom || undefined,
          endDate: filters.dateTo || undefined,
        }),
        portalApi.getAuditSummary(),
      ]);
      const rawLogs = logsData.logs || logsData || [];
      const mappedLogs = rawLogs.map((log: any) => {
        const oldValue = tryParseJson(log.oldValue || log.oldValues);
        const newValue = tryParseJson(log.newValue || log.newValues);
        const metadata = tryParseJson(log.metadata);
        const computedChanges =
          Array.isArray(log.changes) && log.changes.length > 0
            ? log.changes
            : buildChangesFromValues(
                isPlainObject(oldValue)
                  ? (oldValue as Record<string, any>)
                  : undefined,
                isPlainObject(newValue)
                  ? (newValue as Record<string, any>)
                  : undefined,
              );

        return {
          id: log.id,
          action: log.action,
          resourceType: log.resourceType || log.resource,
          resourceId: log.resourceId,
          resourceName: log.resourceName,
          staffId: log.staffId,
          staffName: log.staffName,
          staffEmail: log.staffEmail,
          oldValue: isPlainObject(oldValue)
            ? (oldValue as Record<string, any>)
            : undefined,
          newValue: isPlainObject(newValue)
            ? (newValue as Record<string, any>)
            : undefined,
          changes: computedChanges,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          correlationId: log.correlationId,
          timestamp: log.timestamp || log.createdAt,
          metadata: isPlainObject(metadata)
            ? (metadata as Record<string, any>)
            : undefined,
        };
      });

      const normalizedSummary = summaryData
        ? {
            byAction: Array.isArray(summaryData.byAction)
              ? summaryData.byAction
              : Object.entries(summaryData.byAction || {}).map(
                  ([action, count]) => ({ action, count }),
                ),
            byResource: Array.isArray(summaryData.byResource)
              ? summaryData.byResource
              : Object.entries(summaryData.byResource || {}).map(
                  ([resource, count]) => ({ resource, count }),
                ),
            byStaff: summaryData.byStaff || [],
            timeline: summaryData.timeline || [],
          }
        : {
            byAction: [],
            byResource: [],
            byStaff: [],
            timeline: [],
          };

      setLogs(mappedLogs);
      setSummary(normalizedSummary);
    } catch (error) {
      console.error("Failed to fetch audit data:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل سجل التدقيق",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [
    filters.action,
    filters.resourceType,
    filters.staffId,
    filters.dateFrom,
    filters.dateTo,
    toast,
  ]);

  useEffect(() => {
    fetchAuditData();
  }, [fetchAuditData]);

  const filteredLogs = logs.filter((log) => {
    if (filters.action !== "all" && log.action !== filters.action) return false;
    if (
      filters.resourceType !== "all" &&
      log.resourceType !== filters.resourceType
    )
      return false;
    if (filters.staffId !== "all") {
      if (filters.staffId === "api") {
        const isSystem =
          !log.staffId || log.staffId === "api" || log.staffName === "API Key";
        if (!isSystem) return false;
      } else if (log.staffId !== filters.staffId) {
        return false;
      }
    }
    if (filters.settingsSection !== "all") {
      const sections = Array.isArray(log.metadata?.sections)
        ? log.metadata.sections
        : log.metadata?.section
          ? [log.metadata.section]
          : [];
      if (!sections.includes(filters.settingsSection)) return false;
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (
        !log.resourceName?.toLowerCase().includes(searchLower) &&
        !log.staffName?.toLowerCase().includes(searchLower) &&
        !(log.resourceId || "").toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }
    return true;
  });

  useEffect(() => {
    setPage(1);
  }, [
    filters.action,
    filters.resourceType,
    filters.staffId,
    filters.settingsSection,
    filters.search,
  ]);

  const sortedLogs = [...filteredLogs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const totalPages = Math.max(1, Math.ceil(sortedLogs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedLogs = sortedLogs.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const formatTimeSince = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `منذ ${days} يوم`;
    if (hours > 0) return `منذ ${hours} ساعة`;
    if (minutes > 0) return `منذ ${minutes} دقيقة`;
    return "الآن";
  };

  const handleExport = async () => {
    try {
      toast({ title: "جاري التصدير...", description: "يتم تحضير ملف CSV" });
      const blob = await portalApi.exportAuditCsv({
        startDate: filters.dateFrom || undefined,
        endDate: filters.dateTo || undefined,
        action: filters.action !== "all" ? filters.action : undefined,
        resource:
          filters.resourceType !== "all" ? filters.resourceType : undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "تم التصدير", description: "تم تحميل ملف سجل التدقيق" });
    } catch (error) {
      console.error("Export failed:", error);
      toast({
        title: "خطأ",
        description: "فشل في تصدير السجل",
        variant: "destructive",
      });
    }
  };

  const handleExportPdf = () => {
    const rows = paginatedLogs.map((log) => ({
      action: actionLabels[log.action] || log.action,
      resource:
        log.resourceType === "SETTINGS"
          ? `إعدادات المتجر${Array.isArray(log.metadata?.sections) ? ` (${log.metadata.sections.join("، ")})` : ""}`
          : log.resourceName || log.resourceId || "-",
      staff: log.staffName || "نظام (تلقائي)",
      ip: formatIp(log.ipAddress),
      time: formatDate(log.timestamp),
    }));

    const html = `
      <html dir="rtl" lang="ar">
        <head>
          <title>سجل التدقيق</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1 { font-size: 18px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: right; }
            th { background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>سجل التدقيق</h1>
          <table>
            <thead>
              <tr>
                <th>الإجراء</th>
                <th>المورد</th>
                <th>المستخدم</th>
                <th>IP</th>
                <th>الوقت</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                    <tr>
                      <td>${row.action}</td>
                      <td>${row.resource}</td>
                      <td>${row.staff}</td>
                      <td>${row.ip}</td>
                      <td>${row.time}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const latestByAction = (action: string) =>
    sortedLogs.find((log) => log.action === action);

  const formatIp = (ip?: string) => {
    if (!ip) return "-";
    if (ip === "::1" || ip === "127.0.0.1") return "محلي (localhost)";
    return ip;
  };

  const isLocalIp = (ip?: string) => ip === "::1" || ip === "127.0.0.1";

  const getBrowserLabel = (ua?: string) => {
    if (!ua) return "-";
    const lower = ua.toLowerCase();
    const edge = ua.match(/edg\/([\d.]+)/i);
    if (edge) return `Microsoft Edge ${edge[1]}`;
    const chrome = ua.match(/chrome\/([\d.]+)/i);
    if (chrome) return `Google Chrome ${chrome[1]}`;
    const firefox = ua.match(/firefox\/([\d.]+)/i);
    if (firefox) return `Mozilla Firefox ${firefox[1]}`;
    const safari = ua.match(/version\/([\d.]+).*safari/i);
    if (safari) return `Safari ${safari[1]}`;
    return ua;
  };

  const getOsLabel = (ua?: string) => {
    if (!ua) return "-";
    if (/windows nt/i.test(ua)) return "Windows";
    if (/mac os x/i.test(ua)) return "macOS";
    if (/android/i.test(ua)) return "Android";
    if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
    if (/linux/i.test(ua)) return "Linux";
    return "-";
  };

  const formatChangeValue = (value: unknown): string => {
    if (value === undefined) return "-";
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const timeline = summary?.timeline || [];
  const maxActivity =
    timeline.length > 0 ? Math.max(...timeline.map((t) => t.count)) : 1;
  const staffOptionsRaw = (summary?.byStaff || []).map((staff) => ({
    ...staff,
    staffId: staff.staffId || "api",
    name: staff.name || "API Key",
  }));
  const staffOptions = [
    {
      staffId: "api",
      name: "النظام",
      count: staffOptionsRaw.find((s) => s.staffId === "api")?.count || 0,
    },
    ...staffOptionsRaw.filter((s) => s.staffId !== "api"),
  ];

  const safeSummary = summary || {
    byAction: [],
    byResource: [],
    byStaff: [],
    timeline: [],
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="سجل التدقيق"
        description="تتبع جميع الإجراءات والتغييرات في النظام"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" onClick={fetchAuditData}>
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" />
              تصدير
            </Button>
            <Button variant="outline" onClick={handleExportPdf}>
              <Printer className="h-4 w-4" />
              تصدير PDF
            </Button>
          </div>
        }
      />

      {/* AI Audit Insights */}
      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              إجمالي السجلات
            </CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(summary?.byAction || [])
                .reduce((sum, a) => sum + a.count, 0)
                .toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">آخر 30 يوم</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              التغييرات اليوم
            </CardTitle>
            <Activity className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.timeline?.length
                ? summary.timeline[summary.timeline.length - 1].count
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">+12% عن أمس</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              المستخدمون النشطون
            </CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.byStaff?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground">هذا الأسبوع</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">عمليات الحذف</CardTitle>
            <FileText className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.byAction?.find((a) => a.action === "DELETE")?.count ||
                0}
            </div>
            <p className="text-xs text-muted-foreground">تحتاج مراجعة</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              آخر تحديث إعدادات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {latestByAction("UPDATE")?.resourceType === "SETTINGS"
                ? formatTimeSince(latestByAction("UPDATE")!.timestamp)
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground">
              آخر تعديل في الإعدادات
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">آخر دخول</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {latestByAction("LOGIN")
                ? formatTimeSince(latestByAction("LOGIN")!.timestamp)
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground">آخر تسجيل دخول</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">آخر حذف</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">
              {latestByAction("DELETE")
                ? formatTimeSince(latestByAction("DELETE")!.timestamp)
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground">آخر عملية حذف</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>نشاط آخر 7 أيام</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const timeline = summary?.timeline || [];
            if (timeline.length === 0) {
              return (
                <div className="text-sm text-muted-foreground">
                  لا توجد بيانات بعد.
                </div>
              );
            }
            return (
              <div className="flex items-end justify-between h-32 gap-2">
                {timeline.map((day) => (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    <div
                      className="w-full bg-primary/20 rounded-t transition-all hover:bg-primary/40"
                      style={{
                        height: `${(day.count / maxActivity) * 100}%`,
                        minHeight: "8px",
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {new Date(day.date).toLocaleDateString("ar-SA", {
                        weekday: "short",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Tabs defaultValue="logs">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-2">
          <TabsTrigger value="logs" className="w-full">
            السجلات
          </TabsTrigger>
          <TabsTrigger value="summary" className="w-full">
            الملخص
          </TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-4 space-y-4">
          <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
            {quickFilters.map((filter) => (
              <Button
                key={filter.value}
                size="sm"
                className="shrink-0"
                variant={
                  filters.resourceType === filter.value ? "default" : "outline"
                }
                onClick={() =>
                  setFilters({ ...filters, resourceType: filter.value })
                }
              >
                {filter.label}
              </Button>
            ))}
          </div>
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="بحث..."
                    className="pr-9"
                    value={filters.search}
                    onChange={(e) =>
                      setFilters({ ...filters, search: e.target.value })
                    }
                  />
                </div>
                <Select
                  value={filters.action}
                  onValueChange={(v) => setFilters({ ...filters, action: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="الإجراء" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الإجراءات</SelectItem>
                    {Object.entries(actionLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filters.resourceType}
                  onValueChange={(v) =>
                    setFilters({ ...filters, resourceType: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="نوع المورد" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الموارد</SelectItem>
                    {Object.entries(resourceLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filters.staffId}
                  onValueChange={(v) => setFilters({ ...filters, staffId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="المستخدم" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المستخدمين</SelectItem>
                    {staffOptions.map((staff) => (
                      <SelectItem key={staff.staffId} value={staff.staffId}>
                        {staff.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filters.settingsSection}
                  onValueChange={(v) =>
                    setFilters({ ...filters, settingsSection: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="قسم الإعدادات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأقسام</SelectItem>
                    {Object.entries(settingsSectionLabels).map(
                      ([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters({ ...filters, dateFrom: e.target.value })
                  }
                />
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters({ ...filters, dateTo: e.target.value })
                  }
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    setFilters({
                      action: "all",
                      resourceType: "all",
                      staffId: "all",
                      settingsSection: "all",
                      search: "",
                      dateFrom: "",
                      dateTo: "",
                    });
                    setPage(1);
                  }}
                >
                  إعادة تعيين
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table */}
          <Card>
            <CardContent className="p-0">
              <div className="space-y-3 p-4 md:hidden">
                {paginatedLogs.map((log) => {
                  const ResourceIcon =
                    resourceIcons[log.resourceType] || FileText;
                  const resourceLabel =
                    resourceLabels[log.resourceType] || log.resourceType || "-";
                  const isSettings = log.resourceType === "SETTINGS";
                  const rawSections = Array.isArray(log.metadata?.sections)
                    ? log.metadata.sections
                    : log.metadata?.section
                      ? [log.metadata.section]
                      : [];
                  const sectionLabels = rawSections
                    .map(
                      (section: string) =>
                        settingsSectionLabels[section] || section,
                    )
                    .filter(Boolean);
                  const sectionSuffix =
                    sectionLabels.length > 0
                      ? ` • ${sectionLabels.join("، ")}`
                      : "";
                  const resourceTitle = isSettings
                    ? `إعدادات المتجر${sectionSuffix}`
                    : log.resourceName ||
                      (log.resourceId ? log.resourceId.slice(0, 8) : "-");
                  const actionLabel =
                    actionLabels[log.action] || log.action || "-";
                  const actionColor =
                    actionColors[log.action] || "bg-slate-500";
                  const isSystem =
                    !log.staffId ||
                    log.staffId === "api" ||
                    log.staffName === "API Key";
                  const staffDisplayName = isSystem
                    ? "نظام (تلقائي)"
                    : log.staffName || "نظام";

                  return (
                    <div
                      key={log.id}
                      className="rounded-lg border p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge className={`${actionColor} text-white`}>
                              {actionLabel}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTimeSince(log.timestamp)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <ResourceIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium break-words">
                              {resourceTitle}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {resourceLabel}
                          </div>
                        </div>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedLog(log)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>تفاصيل السجل</DialogTitle>
                              <DialogDescription>
                                معلومات كاملة عن هذا الإجراء
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 text-sm">
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">
                                    الإجراء
                                  </label>
                                  <div className="mt-1">
                                    <Badge
                                      className={`${actionColor} text-white`}
                                    >
                                      {actionLabel}
                                    </Badge>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">
                                    المورد
                                  </label>
                                  <p className="mt-1 break-words">
                                    {resourceTitle}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">
                                    المستخدم
                                  </label>
                                  <p className="mt-1 break-words">
                                    {staffDisplayName}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">
                                    الوقت
                                  </label>
                                  <p className="mt-1">
                                    {formatDate(log.timestamp)}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">
                                    عنوان IP
                                  </label>
                                  <p className="mt-1 font-mono text-xs break-all">
                                    {formatIp(log.ipAddress)}
                                  </p>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">
                                    المصدر
                                  </label>
                                  <p className="mt-1 text-sm">
                                    {isSystem ? "نظام / API" : "لوحة التحكم"}
                                  </p>
                                </div>
                              </div>
                              {log.changes && log.changes.length > 0 && (
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">
                                    التغييرات
                                  </label>
                                  <div className="mt-2 space-y-2">
                                    {log.changes.map((change, i) => (
                                      <div
                                        key={i}
                                        className="flex flex-wrap items-center gap-2 rounded bg-muted p-2 text-sm"
                                      >
                                        <span className="font-medium break-all">
                                          {change.field}:
                                        </span>
                                        <span className="break-words text-red-600 line-through">
                                          {formatChangeValue(change.from)}
                                        </span>
                                        <span>→</span>
                                        <span className="break-words text-green-600">
                                          {formatChangeValue(change.to)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {log.oldValue && (
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">
                                    القيمة السابقة
                                  </label>
                                  <JsonPreview value={log.oldValue} />
                                </div>
                              )}
                              {log.newValue && (
                                <div>
                                  <label className="text-sm font-medium text-muted-foreground">
                                    القيمة الجديدة
                                  </label>
                                  <JsonPreview value={log.newValue} />
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground">
                        <div>المستخدم: {staffDisplayName}</div>
                        <div>IP: {formatIp(log.ipAddress)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-center w-24">
                        الإجراء
                      </TableHead>
                      <TableHead className="text-right w-56">المورد</TableHead>
                      <TableHead className="text-right w-40">
                        المستخدم
                      </TableHead>
                      <TableHead className="text-center w-24">
                        عنوان IP
                      </TableHead>
                      <TableHead className="text-center w-28">الوقت</TableHead>
                      <TableHead className="text-center w-16">تفاصيل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.map((log) => {
                      const ResourceIcon =
                        resourceIcons[log.resourceType] || FileText;
                      const resourceLabel =
                        resourceLabels[log.resourceType] ||
                        log.resourceType ||
                        "-";
                      const isSettings = log.resourceType === "SETTINGS";
                      const rawSections = Array.isArray(log.metadata?.sections)
                        ? log.metadata.sections
                        : log.metadata?.section
                          ? [log.metadata.section]
                          : [];
                      const sectionLabels = rawSections
                        .map(
                          (section: string) =>
                            settingsSectionLabels[section] || section,
                        )
                        .filter(Boolean);
                      const sectionSuffix =
                        sectionLabels.length > 0
                          ? ` • ${sectionLabels.join("، ")}`
                          : "";
                      const resourceTitle = isSettings
                        ? `إعدادات المتجر${sectionSuffix}`
                        : log.resourceName ||
                          (log.resourceId ? log.resourceId.slice(0, 8) : "-");
                      const actionLabel =
                        actionLabels[log.action] || log.action || "-";
                      const actionColor =
                        actionColors[log.action] || "bg-slate-500";
                      const isSystem =
                        !log.staffId ||
                        log.staffId === "api" ||
                        log.staffName === "API Key";
                      const staffDisplayName = isSystem
                        ? "نظام (تلقائي)"
                        : log.staffName || "نظام";
                      const staffSecondary = isSystem
                        ? "API"
                        : log.staffEmail || "-";
                      const safeMetadata = log.metadata
                        ? { ...log.metadata }
                        : undefined;
                      if (safeMetadata && "staffIdRaw" in safeMetadata) {
                        delete (safeMetadata as any).staffIdRaw;
                      }
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="text-center align-middle w-24">
                            <Badge className={`${actionColor} text-white`}>
                              {actionLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right w-56">
                            <div className="flex w-full items-center gap-2 text-right flex-row-reverse">
                              <ResourceIcon className="h-4 w-4 text-muted-foreground" />
                              <div className="max-w-[13rem]">
                                <div className="font-medium break-words">
                                  {resourceTitle}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {resourceLabel}
                                </div>
                                {isSettings && sectionLabels.length > 0 && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    الأقسام: {sectionLabels.join("، ")}
                                  </div>
                                )}
                                {isSettings && rawSections.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {rawSections.map((section: string) => {
                                      const Icon =
                                        settingsSectionIcons[section] ||
                                        Settings;
                                      const label =
                                        settingsSectionLabels[section] ||
                                        section;
                                      return (
                                        <Badge
                                          key={section}
                                          variant="outline"
                                          className="text-[10px] flex items-center gap-1"
                                        >
                                          <Icon className="h-3 w-3" />
                                          {label}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right w-40">
                            <div className="flex w-full items-center gap-2 text-right flex-row-reverse">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                {isSystem ? (
                                  <Server className="h-4 w-4" />
                                ) : (
                                  log.staffName?.charAt(0) || "?"
                                )}
                              </div>
                              <div className="max-w-[9rem]">
                                <div className="font-medium break-words">
                                  {staffDisplayName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {staffSecondary}
                                </div>
                                {isSystem && (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 text-[10px] text-muted-foreground"
                                  >
                                    النظام
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center align-middle w-24">
                            <div className="flex items-center justify-center gap-1">
                              <code className="text-xs bg-muted px-1 rounded">
                                {formatIp(log.ipAddress)}
                              </code>
                              {isLocalIp(log.ipAddress) && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-muted-foreground"
                                >
                                  سجل محلي
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center align-middle w-28">
                            <div className="flex items-center justify-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span className="text-sm">
                                {formatTimeSince(log.timestamp)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center align-middle w-16">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedLog(log)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>تفاصيل السجل</DialogTitle>
                                  <DialogDescription>
                                    معلومات كاملة عن هذا الإجراء
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        الإجراء
                                      </label>
                                      <div className="mt-1">
                                        <Badge
                                          className={`${actionColor} text-white`}
                                        >
                                          {actionLabel}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        المورد
                                      </label>
                                      <p className="mt-1">{resourceTitle}</p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        معرّف المورد
                                      </label>
                                      <p className="mt-1 font-mono text-sm">
                                        {log.resourceId || "-"}
                                      </p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        المستخدم
                                      </label>
                                      <p className="mt-1">
                                        {staffDisplayName} ({staffSecondary})
                                      </p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        معرّف المستخدم
                                      </label>
                                      <p className="mt-1 font-mono text-sm">
                                        {log.staffId || "-"}
                                      </p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        الوقت
                                      </label>
                                      <p className="mt-1">
                                        {formatDate(log.timestamp)}
                                      </p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        عنوان IP
                                      </label>
                                      <p className="mt-1 font-mono text-sm">
                                        {formatIp(log.ipAddress)}
                                      </p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        المتصفح
                                      </label>
                                      <p className="mt-1 break-words text-sm">
                                        {getBrowserLabel(log.userAgent)}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        نظام التشغيل:{" "}
                                        {getOsLabel(log.userAgent)}
                                      </p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        المصدر
                                      </label>
                                      <p className="mt-1 text-sm">
                                        {isSystem
                                          ? "نظام / API"
                                          : "لوحة التحكم"}
                                      </p>
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        معرّف الطلب
                                      </label>
                                      <p className="mt-1 font-mono text-sm">
                                        {log.correlationId || "-"}
                                      </p>
                                    </div>
                                    {(log.metadata?.pagePath ||
                                      log.metadata?.pageName) && (
                                      <div>
                                        <label className="text-sm font-medium text-muted-foreground">
                                          الصفحة
                                        </label>
                                        <p className="mt-1 text-sm">
                                          {log.metadata?.pageName ||
                                            log.metadata?.pagePath}
                                        </p>
                                        {log.metadata?.pagePath && (
                                          <p className="text-xs text-muted-foreground">
                                            {log.metadata.pagePath}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    {log.metadata?.pagePath && (
                                      <div>
                                        <label className="text-sm font-medium text-muted-foreground">
                                          صفحة النظام
                                        </label>
                                        <p className="mt-1 text-sm">
                                          {log.metadata.pagePath}
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  {log.changes && log.changes.length > 0 && (
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        التغييرات
                                      </label>
                                      <div className="mt-2 space-y-2">
                                        {log.changes.map((change, i) => (
                                          <div
                                            key={i}
                                            className="flex flex-wrap items-center gap-2 rounded bg-muted p-2 text-sm"
                                          >
                                            <span className="font-medium break-all">
                                              {change.field}:
                                            </span>
                                            <span className="break-words text-red-600 line-through">
                                              {formatChangeValue(change.from)}
                                            </span>
                                            <span>→</span>
                                            <span className="break-words text-green-600">
                                              {formatChangeValue(change.to)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {log.oldValue && (
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        القيمة السابقة
                                      </label>
                                      <JsonPreview value={log.oldValue} />
                                    </div>
                                  )}

                                  {log.newValue && (
                                    <div>
                                      <label className="text-sm font-medium text-muted-foreground">
                                        القيمة الجديدة
                                      </label>
                                      <JsonPreview value={log.newValue} />
                                    </div>
                                  )}

                                  {safeMetadata &&
                                    Object.keys(safeMetadata).length > 0 && (
                                      <div>
                                        <label className="text-sm font-medium text-muted-foreground">
                                          بيانات إضافية
                                        </label>
                                        <JsonPreview value={safeMetadata} />
                                      </div>
                                    )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              عرض {paginatedLogs.length} من {sortedLogs.length} سجل
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2 flex-row-reverse">
              <Button
                variant="outline"
                size="icon"
                aria-label="الصفحة السابقة"
                disabled={safePage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="min-w-0 text-center text-sm">
                صفحة {safePage} من {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="الصفحة التالية"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* By Action */}
            <Card>
              <CardHeader>
                <CardTitle>حسب الإجراء</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {safeSummary.byAction.map((item) => (
                  <div key={item.action} className="flex items-center gap-3">
                    <Badge
                      className={`${actionColors[item.action]} text-white w-20 justify-center`}
                    >
                      {actionLabels[item.action]}
                    </Badge>
                    <div className="flex-1 bg-muted rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2"
                        style={{
                          width: `${(item.count / Math.max(...safeSummary.byAction.map((a) => a.count), 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-12 text-end">
                      {item.count}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* By Resource */}
            <Card>
              <CardHeader>
                <CardTitle>حسب المورد</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(safeSummary?.byResource || []).map((item) => {
                  const Icon = resourceIcons[item.resource] || FileText;
                  const maxValue = Math.max(
                    ...(safeSummary?.byResource || []).map((r) => r.count),
                    1,
                  );
                  return (
                    <div
                      key={item.resource}
                      className="flex items-center gap-3"
                    >
                      <div className="flex items-center gap-2 w-24">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {resourceLabels[item.resource]}
                        </span>
                      </div>
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div
                          className="bg-primary rounded-full h-2"
                          style={{ width: `${(item.count / maxValue) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-12 text-end">
                        {item.count}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* By Staff */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>حسب المستخدم</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                  {(safeSummary?.byStaff || []).map((staff) => (
                    <div
                      key={staff.staffId}
                      className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                    >
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                        {staff.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{staff.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {staff.count} إجراء
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
