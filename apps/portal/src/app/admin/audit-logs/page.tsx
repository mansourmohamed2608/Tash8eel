"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/alerts";
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
} from "@/components/ui/dialog";
import {
  FileText,
  Search,
  Download,
  Eye,
  User,
  Calendar,
  Filter,
  Clock,
  Activity,
  RefreshCw,
} from "lucide-react";
import { cn, formatDate, formatRelativeTime } from "@/lib/utils";
import { portalApi } from "@/lib/client";

interface AuditLog {
  id: string;
  action: string;
  actor: {
    type: "admin" | "merchant" | "system";
    id: string;
    name: string;
  };
  target: {
    type: string;
    id: string;
    name?: string;
  };
  details: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
}

const actionLabels: Record<string, string> = {
  "merchant.created": "إنشاء تاجر",
  "merchant.updated": "تحديث تاجر",
  "merchant.deleted": "حذف تاجر",
  "merchant.activated": "تفعيل تاجر",
  "merchant.deactivated": "تعطيل تاجر",
  "order.created": "إنشاء طلب",
  "order.updated": "تحديث طلب",
  "order.cancelled": "إلغاء طلب",
  "dlq.replayed": "إعادة معالجة DLQ",
  "dlq.deleted": "حذف حدث DLQ",
  "settings.updated": "تحديث الإعدادات",
  "catalog.updated": "تحديث الكتالوج",
  "inventory.updated": "تحديث المخزون",
  "login.success": "تسجيل دخول ناجح",
  "login.failed": "فشل تسجيل الدخول",
  "api.key.rotated": "تدوير مفتاح API",
};

const actionColors: Record<string, string> = {
  created:
    "border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]",
  updated:
    "border-[color:rgba(59,130,246,0.26)] bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]",
  deleted:
    "border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]",
  activated:
    "border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]",
  deactivated:
    "border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]",
  cancelled:
    "border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]",
  replayed:
    "border-[color:rgba(232,197,71,0.24)] bg-[color:var(--accent-gold-dim)] text-[color:var(--accent-gold)]",
  success:
    "border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]",
  failed:
    "border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]",
  rotated:
    "border-[color:rgba(59,130,246,0.26)] bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]",
};

const getActionColor = (action: string): string => {
  const verb = action.split(".")[1];
  return (
    actionColors[verb] ||
    "border-[color:var(--border-default)] bg-[color:var(--bg-surface-2)] text-[color:var(--text-secondary)]"
  );
};

export default function AuditLogsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const itemsPerPage = 10;

  const fetchLogs = useCallback(async () => {
    try {
      // actorType filter not supported in current API - using action filter only
      const data = await portalApi.getAuditLogs({
        action: actionFilter !== "all" ? actionFilter : undefined,
      });
      setLogs(data || []);
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading(false);
    }
  }, [actorFilter, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.action.includes(searchQuery) ||
      log.actor.name.includes(searchQuery) ||
      log.target.id.includes(searchQuery) ||
      (log.target.name?.includes(searchQuery) ?? false);
    const matchesActor =
      actorFilter === "all" || log.actor.type === actorFilter;
    const matchesAction =
      actionFilter === "all" || log.action.startsWith(actionFilter);
    return matchesSearch && matchesActor && matchesAction;
  });

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const uniqueActionTypes = Array.from(
    new Set(logs.map((l) => l.action.split(".")[0])),
  );

  const handleExport = () => {
    const csv = [
      ["ID", "Action", "Actor", "Target", "IP Address", "Timestamp"].join(","),
      ...filteredLogs.map((log) =>
        [
          log.id,
          log.action,
          log.actor.name,
          log.target.id,
          log.ipAddress,
          log.timestamp,
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="سجل النشاط" />
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      <PageHeader
        title="سجل النشاط"
        description="تتبع جميع الأحداث والتغييرات في النظام"
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
              variant="outline"
              onClick={handleExport}
              className="w-full sm:w-auto"
            >
              <Download className="h-4 w-4" />
              تصدير CSV
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <span className="text-muted-foreground">إجمالي السجلات</span>
          <span className="font-mono text-[var(--accent-gold)]">
            {logs.length}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <span className="text-muted-foreground">نشاط المدراء</span>
          <span className="font-mono text-[var(--accent-blue)]">
            {logs.filter((l) => l.actor.type === "admin").length}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <span className="text-muted-foreground">النتائج المطابقة</span>
          <span className="font-mono text-foreground">
            {filteredLogs.length}
          </span>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="app-data-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي السجلات</p>
                <p className="text-2xl font-bold">{logs.length}</p>
              </div>
              <FileText className="h-8 w-8 text-[color:var(--accent-gold)]" />
            </div>
          </CardContent>
        </Card>
        <Card className="app-data-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">نشاط المدراء</p>
                <p className="text-2xl font-bold">
                  {logs.filter((l) => l.actor.type === "admin").length}
                </p>
              </div>
              <User className="h-8 w-8 text-[color:var(--accent-blue)]" />
            </div>
          </CardContent>
        </Card>
        <Card className="app-data-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">نشاط التجار</p>
                <p className="text-2xl font-bold">
                  {logs.filter((l) => l.actor.type === "merchant").length}
                </p>
              </div>
              <Activity className="h-8 w-8 text-[color:var(--accent-success)]" />
            </div>
          </CardContent>
        </Card>
        <Card className="app-data-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">نشاط النظام</p>
                <p className="text-2xl font-bold">
                  {logs.filter((l) => l.actor.type === "system").length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-[color:var(--accent-warning)]" />
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
                placeholder="بحث في السجلات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={actorFilter} onValueChange={setActorFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="المنفذ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المنفذين</SelectItem>
                <SelectItem value="admin">مدير</SelectItem>
                <SelectItem value="merchant">تاجر</SelectItem>
                <SelectItem value="system">نظام</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="نوع الحدث" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأحداث</SelectItem>
                {uniqueActionTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="app-data-card">
        <CardContent className="p-0">
          {filteredLogs.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="لا توجد سجلات"
              description="لم يتم العثور على سجلات مطابقة للبحث"
            />
          ) : (
            <>
              <div className="divide-y md:hidden">
                {paginatedLogs.map((log) => (
                  <div key={log.id} className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div>
                          <Badge
                            className={cn(
                              "text-xs",
                              getActionColor(log.action),
                            )}
                          >
                            {actionLabels[log.action] || log.action}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(log.timestamp)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="ml-2 h-4 w-4" />
                        التفاصيل
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-muted-foreground">المنفذ</p>
                        <p className="font-medium">{log.actor.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {log.actor.type === "admin"
                            ? "مدير"
                            : log.actor.type === "merchant"
                              ? "تاجر"
                              : "نظام"}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">الهدف</p>
                        <p>{log.target.name || log.target.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {log.target.type}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">عنوان IP</p>
                        <p className="font-mono text-xs">{log.ipAddress}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead className="border-b bg-[color:var(--bg-surface-2)]">
                    <tr>
                      <th className="text-right p-4 font-medium text-sm">
                        الحدث
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        المنفذ
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        الهدف
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        عنوان IP
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        الوقت
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        تفاصيل
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginatedLogs.map((log) => (
                      <tr
                        key={log.id}
                        className="transition-colors hover:bg-[color:var(--bg-surface-2)]"
                      >
                        <td className="p-4">
                          <Badge
                            className={cn(
                              "text-xs",
                              getActionColor(log.action),
                            )}
                          >
                            {actionLabels[log.action] || log.action}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border text-xs",
                                log.actor.type === "admin"
                                  ? "border-[color:rgba(59,130,246,0.24)] bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]"
                                  : log.actor.type === "merchant"
                                    ? "border-[color:rgba(34,197,94,0.26)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]"
                                    : "border-[color:rgba(232,197,71,0.22)] bg-[color:var(--accent-gold-dim)] text-[color:var(--accent-gold)]",
                              )}
                            >
                              {log.actor.type === "admin"
                                ? "م"
                                : log.actor.type === "merchant"
                                  ? "ت"
                                  : "ن"}
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {log.actor.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {log.actor.type === "admin"
                                  ? "مدير"
                                  : log.actor.type === "merchant"
                                    ? "تاجر"
                                    : "نظام"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="text-sm">
                            {log.target.name || log.target.id}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {log.target.type}
                          </p>
                        </td>
                        <td className="p-4">
                          <p className="text-sm font-mono">{log.ipAddress}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-sm text-muted-foreground">
                            {formatRelativeTime(log.timestamp)}
                          </p>
                        </td>
                        <td className="p-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
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

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل السجل</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">الحدث</p>
                  <Badge
                    className={cn(
                      "text-xs mt-1",
                      getActionColor(selectedLog.action),
                    )}
                  >
                    {actionLabels[selectedLog.action] || selectedLog.action}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">الوقت</p>
                  <p className="font-medium">
                    {formatDate(selectedLog.timestamp, "long")}
                  </p>
                </div>
              </div>

              <div className="space-y-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] p-4">
                <h4 className="font-medium">المنفذ</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">الاسم</p>
                    <p className="font-medium">{selectedLog.actor.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">النوع</p>
                    <p className="font-medium">
                      {selectedLog.actor.type === "admin"
                        ? "مدير"
                        : selectedLog.actor.type === "merchant"
                          ? "تاجر"
                          : "نظام"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] p-4">
                <h4 className="font-medium">الهدف</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">النوع</p>
                    <p className="font-medium">{selectedLog.target.type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">المعرف</p>
                    <p className="font-medium font-mono">
                      {selectedLog.target.id}
                    </p>
                  </div>
                  {selectedLog.target.name && (
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">الاسم</p>
                      <p className="font-medium">{selectedLog.target.name}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] p-4">
                <h4 className="font-medium">معلومات الجلسة</h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">عنوان IP</p>
                    <p className="font-mono text-sm break-all">
                      {selectedLog.ipAddress}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">User Agent</p>
                    <p
                      className="text-sm break-words"
                      title={selectedLog.userAgent}
                    >
                      {selectedLog.userAgent}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  التفاصيل (Payload)
                </p>
                <pre
                  className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-sm"
                  dir="ltr"
                >
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setSelectedLog(null)}
              className="w-full sm:w-auto"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
