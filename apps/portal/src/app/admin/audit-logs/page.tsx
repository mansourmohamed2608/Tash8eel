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
  created: "bg-green-100 text-green-800",
  updated: "bg-blue-100 text-blue-800",
  deleted: "bg-red-100 text-red-800",
  activated: "bg-green-100 text-green-800",
  deactivated: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
  replayed: "bg-purple-100 text-purple-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  rotated: "bg-blue-100 text-blue-800",
};

const getActionColor = (action: string): string => {
  const verb = action.split(".")[1];
  return actionColors[verb] || "bg-gray-100 text-gray-800";
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
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="سجل النشاط"
        description="تتبع جميع الأحداث والتغييرات في النظام"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              تحديث
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" />
              تصدير CSV
            </Button>
          </div>
        }
      />

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي السجلات</p>
                <p className="text-2xl font-bold">{logs.length}</p>
              </div>
              <FileText className="h-8 w-8 text-primary-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">نشاط المدراء</p>
                <p className="text-2xl font-bold">
                  {logs.filter((l) => l.actor.type === "admin").length}
                </p>
              </div>
              <User className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">نشاط التجار</p>
                <p className="text-2xl font-bold">
                  {logs.filter((l) => l.actor.type === "merchant").length}
                </p>
              </div>
              <Activity className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">نشاط النظام</p>
                <p className="text-2xl font-bold">
                  {logs.filter((l) => l.actor.type === "system").length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
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
      <Card>
        <CardContent className="p-0">
          {filteredLogs.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="لا توجد سجلات"
              description="لم يتم العثور على سجلات مطابقة للبحث"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
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
                      <tr key={log.id} className="hover:bg-muted/30">
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
                                "w-8 h-8 rounded-full flex items-center justify-center text-xs",
                                log.actor.type === "admin"
                                  ? "bg-blue-100 text-blue-700"
                                  : log.actor.type === "merchant"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-purple-100 text-purple-700",
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل السجل</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
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

              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <h4 className="font-medium">المنفذ</h4>
                <div className="grid grid-cols-2 gap-4">
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

              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <h4 className="font-medium">الهدف</h4>
                <div className="grid grid-cols-2 gap-4">
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

              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <h4 className="font-medium">معلومات الجلسة</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">عنوان IP</p>
                    <p className="font-mono text-sm">{selectedLog.ipAddress}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">User Agent</p>
                    <p
                      className="text-sm truncate"
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
                  className="p-3 rounded-lg bg-muted text-sm overflow-x-auto"
                  dir="ltr"
                >
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLog(null)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
