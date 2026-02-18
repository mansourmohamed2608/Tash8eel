"use client";

import { useState, useEffect, useCallback } from "react";
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
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Banknote,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Download,
  FileText,
  Truck,
  Upload,
  FileSpreadsheet,
  X,
  Bell,
  Send,
  CalendarClock,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import portalApi from "@/lib/authenticated-api";
import { REPORTING_PERIOD_OPTIONS } from "@/lib/reporting-period";
import {
  AiInsightsCard,
  generateCodInsights,
} from "@/components/ai/ai-insights-card";

interface CODOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  codAmount: number;
  deliveryPartner: string;
  deliveryPartnerName?: string;
  deliveryDate: string;
  collectedAt?: string;
  reconciledAt?: string;
  status: "pending" | "collected" | "reconciled" | "disputed";
  notes?: string;
}

interface ReconciliationSummary {
  totalPending: number;
  totalPendingAmount: number;
  totalCollected: number;
  totalCollectedAmount: number;
  totalReconciled: number;
  totalReconciledAmount: number;
  totalDisputed: number;
  totalDisputedAmount: number;
}

interface CourierStatementRow {
  orderNumber: string;
  amount: number;
  date: string;
  status: string;
  notes?: string;
  matched?: boolean;
  matchedOrderId?: string;
}

interface CODReminder {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  codAmount: number;
  daysPastDue: number;
  reminderType: "first_reminder" | "second_reminder" | "final_notice";
  status: "pending" | "sent" | "acknowledged";
  scheduledAt: string;
  sentAt?: string;
}

const STATUS_CONFIG = {
  pending: {
    label: "قيد الانتظار",
    color: "bg-yellow-100 text-yellow-800",
    icon: Clock,
  },
  collected: {
    label: "تم التحصيل",
    color: "bg-blue-100 text-blue-800",
    icon: Banknote,
  },
  reconciled: {
    label: "تمت التسوية",
    color: "bg-green-100 text-green-800",
    icon: CheckCircle2,
  },
  disputed: {
    label: "متنازع عليه",
    color: "bg-red-100 text-red-800",
    icon: AlertTriangle,
  },
};

const COD_PERIOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "كل الفترة" },
  ...REPORTING_PERIOD_OPTIONS.filter((option) =>
    [1, 7, 14, 30, 60, 90, 180, 365].includes(option.value),
  ).map((option) => ({ value: String(option.value), label: option.label })),
];

const normalizeCourierKey = (raw?: string | null): string => {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (!value || value === "all") return "other";
  if (/بوسط|بوسته|بوسطة|bosta/u.test(value)) return "bosta";
  if (/أرامكس|ارامكس|aramex/u.test(value)) return "aramex";
  if (/فيتشر|fetchr/u.test(value)) return "fetchr";
  if (/سبرينت|sprint/u.test(value)) return "sprint";
  return "other";
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNumberOrFallback = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isCodStatus = (value: unknown): value is CODOrder["status"] =>
  value === "pending" ||
  value === "collected" ||
  value === "reconciled" ||
  value === "disputed";

export default function CODReconciliationPage() {
  const { merchantId, apiKey } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<CODOrder[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedPartner, setSelectedPartner] = useState<string>("all");
  const [periodDays, setPeriodDays] = useState<string>("7");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [disputeNotes, setDisputeNotes] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // CSV Import state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importedRows, setImportedRows] = useState<CourierStatementRow[]>([]);
  const [importPreview, setImportPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    matched: number;
    unmatched: number;
    totalAmount: number;
  } | null>(null);

  // COD Reminders state
  const [reminders, setReminders] = useState<CODReminder[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [schedulingReminders, setSchedulingReminders] = useState(false);
  const [daysPastDueInput, setDaysPastDueInput] = useState("3");

  const deliveryPartners = [
    { id: "aramex", name: "أرامكس" },
    { id: "fetchr", name: "فيتشر" },
    { id: "bosta", name: "بوسطة" },
    { id: "sprint", name: "سبرينت" },
    { id: "other", name: "أخرى" },
  ];

  const fetchOrders = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    if ((startDate && !endDate) || (!startDate && endDate)) return;

    try {
      setLoading(true);

      const hasCustomRange = Boolean(startDate && endDate);
      const query: {
        period?: "today" | "week" | "month" | "quarter" | "year" | "all";
        days?: number;
        startDate?: string;
        endDate?: string;
        courier?: string;
      } = {};
      if (hasCustomRange) {
        query.startDate = startDate;
        query.endDate = endDate;
      } else if (periodDays === "all") {
        query.period = "all";
      } else {
        query.days = Number(periodDays);
      }
      if (selectedPartner !== "all") {
        query.courier = selectedPartner;
      }

      const data = await portalApi.getCodSummary(query);

      // Transform recent orders to match UI format.
      // Important: only trust explicit COD status from backend.
      const transformedOrders: CODOrder[] = data.recentOrders.map((order) => {
        const codStatus: CODOrder["status"] = isCodStatus(order.codStatus)
          ? order.codStatus
          : "pending";

        const deliveryPartner = normalizeCourierKey(
          order.courierKey || order.courier,
        );
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerPhone: "",
          codAmount: toNumber(order.total),
          deliveryPartner,
          deliveryPartnerName: order.courier || undefined,
          deliveryDate: String(order.createdAt || "").split("T")[0],
          status: codStatus,
          collectedAt: order.codCollectedAt || undefined,
          reconciledAt: order.codReconciledAt || undefined,
        };
      });

      const partnerFilteredOrders =
        selectedPartner === "all"
          ? transformedOrders
          : transformedOrders.filter(
              (order) => order.deliveryPartner === selectedPartner,
            );
      setOrders(partnerFilteredOrders);
      setSelectedOrders([]);

      const localSummary = partnerFilteredOrders.reduce(
        (acc, order) => {
          if (order.status === "pending") {
            acc.totalPending += 1;
            acc.totalPendingAmount += order.codAmount;
          } else if (order.status === "collected") {
            acc.totalCollected += 1;
            acc.totalCollectedAmount += order.codAmount;
          } else if (order.status === "reconciled") {
            acc.totalReconciled += 1;
            acc.totalReconciledAmount += order.codAmount;
          } else if (order.status === "disputed") {
            acc.totalDisputed += 1;
            acc.totalDisputedAmount += order.codAmount;
          }
          return acc;
        },
        {
          totalPending: 0,
          totalPendingAmount: 0,
          totalCollected: 0,
          totalCollectedAmount: 0,
          totalReconciled: 0,
          totalReconciledAmount: 0,
          totalDisputed: 0,
          totalDisputedAmount: 0,
        },
      );

      const apiSummary = data.summary || {};
      setSummary({
        totalPending: toNumberOrFallback(
          apiSummary.pendingOrders,
          localSummary.totalPending,
        ),
        totalPendingAmount: toNumberOrFallback(
          apiSummary.pendingAmount,
          localSummary.totalPendingAmount,
        ),
        totalCollected: toNumberOrFallback(
          apiSummary.collectedOrders,
          localSummary.totalCollected,
        ),
        totalCollectedAmount: toNumberOrFallback(
          apiSummary.collectedAmount,
          localSummary.totalCollectedAmount,
        ),
        totalReconciled: toNumberOrFallback(
          apiSummary.reconciledOrders,
          localSummary.totalReconciled,
        ),
        totalReconciledAmount: toNumberOrFallback(
          apiSummary.reconciledAmount,
          localSummary.totalReconciledAmount,
        ),
        totalDisputed: toNumberOrFallback(
          apiSummary.disputedOrders,
          localSummary.totalDisputed,
        ),
        totalDisputedAmount: toNumberOrFallback(
          apiSummary.disputedAmount,
          localSummary.totalDisputedAmount,
        ),
      });
    } catch (error) {
      console.error("Failed to fetch COD orders:", error);
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey, selectedPartner, periodDays, startDate, endDate]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // COD Reminders functions
  const fetchReminders = useCallback(async () => {
    try {
      setRemindersLoading(true);
      const data = await portalApi.getCodReminders();
      setReminders(data.reminders || []);
    } catch (error) {
      console.error("Failed to fetch COD reminders:", error);
    } finally {
      setRemindersLoading(false);
    }
  }, []);

  const handleScheduleReminders = async () => {
    try {
      setSchedulingReminders(true);
      const days = parseInt(daysPastDueInput) || 3;
      await portalApi.scheduleCodReminders(days);
      await fetchReminders();
    } catch (error) {
      console.error("Failed to schedule reminders:", error);
    } finally {
      setSchedulingReminders(false);
    }
  };

  useEffect(() => {
    if (activeTab === "reminders") {
      fetchReminders();
    }
  }, [activeTab, fetchReminders]);

  const handleReconcile = async () => {
    if (selectedOrders.length === 0) return;

    try {
      setSubmitting(true);

      // Call API for each selected order
      await Promise.all(
        selectedOrders.map((orderId) =>
          portalApi.reconcileCodOrder(orderId, {
            amountReceived: actualAmount ? parseFloat(actualAmount) : undefined,
          }),
        ),
      );

      setReconcileDialogOpen(false);
      setSelectedOrders([]);
      setActualAmount("");
      fetchOrders();
    } catch (error) {
      console.error("Failed to reconcile:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispute = async () => {
    if (selectedOrders.length === 0 || !disputeNotes) return;

    try {
      setSubmitting(true);

      // Call API for each selected order
      await Promise.all(
        selectedOrders.map((orderId) =>
          portalApi.disputeCodOrder(orderId, {
            reason: disputeNotes,
          }),
        ),
      );

      setDisputeDialogOpen(false);
      setSelectedOrders([]);
      setDisputeNotes("");
      fetchOrders();
    } catch (error) {
      console.error("Failed to dispute:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // CSV Import handlers
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
      parseCSVFile(file);
    }
  };

  const parseCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter((line) => line.trim());

      if (lines.length < 2) {
        console.error("Invalid CSV: needs header + at least 1 row");
        return;
      }

      // Parse header to detect columns
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const orderNumIdx = header.findIndex(
        (h) => h.includes("order") || h.includes("رقم") || h.includes("awb"),
      );
      const amountIdx = header.findIndex(
        (h) => h.includes("amount") || h.includes("مبلغ") || h.includes("cod"),
      );
      const dateIdx = header.findIndex(
        (h) => h.includes("date") || h.includes("تاريخ"),
      );
      const statusIdx = header.findIndex(
        (h) => h.includes("status") || h.includes("حالة"),
      );

      const rows: CourierStatementRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        if (cols.length < 2) continue;

        const orderNumber = orderNumIdx >= 0 ? cols[orderNumIdx] : cols[0];
        const amount =
          parseFloat(amountIdx >= 0 ? cols[amountIdx] : cols[1]) || 0;
        const date =
          dateIdx >= 0 ? cols[dateIdx] : new Date().toISOString().split("T")[0];
        const status = statusIdx >= 0 ? cols[statusIdx] : "collected";

        // Try to match with existing orders
        const matchedOrder = orders.find(
          (o) =>
            o.orderNumber === orderNumber ||
            o.orderNumber.includes(orderNumber) ||
            orderNumber.includes(o.orderNumber),
        );

        rows.push({
          orderNumber,
          amount,
          date,
          status,
          matched: !!matchedOrder,
          matchedOrderId: matchedOrder?.id,
        });
      }

      setImportedRows(rows);
      setImportPreview(true);

      // Calculate summary
      const matched = rows.filter((r) => r.matched);
      setImportSummary({
        total: rows.length,
        matched: matched.length,
        unmatched: rows.length - matched.length,
        totalAmount: rows.reduce((sum, r) => sum + r.amount, 0),
      });
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = async () => {
    if (importedRows.length === 0) return;

    try {
      setImporting(true);

      // Call real API endpoint
      const response = await fetch("/api/v1/portal/cod/import-statement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey || "",
        },
        body: JSON.stringify({
          courierName: selectedPartner !== "all" ? selectedPartner : "unknown",
          fileName: importFile?.name,
          statementDate: new Date().toISOString().split("T")[0],
          rows: importedRows.map((row) => ({
            orderNumber: row.orderNumber,
            trackingNumber: row.orderNumber, // Use orderNumber as fallback
            amount: row.amount,
            date: row.date,
            status: row.status,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("تعذر استيراد كشف التحصيل حالياً. حاول مرة أخرى.");
      }

      const result = await response.json();
      // Import completed successfully

      // Close dialog and reset
      setImportDialogOpen(false);
      setImportFile(null);
      setImportedRows([]);
      setImportPreview(false);
      setImportSummary(null);

      // Refresh orders
      fetchOrders();
    } catch (error) {
      console.error("Failed to import statement:", error);
    } finally {
      setImporting(false);
    }
  };

  const clearImport = () => {
    setImportFile(null);
    setImportedRows([]);
    setImportPreview(false);
    setImportSummary(null);
  };

  const filteredOrders = orders.filter((order) => {
    if (activeTab !== "all" && order.status !== activeTab) return false;
    if (selectedPartner !== "all" && order.deliveryPartner !== selectedPartner)
      return false;
    return true;
  });

  const columns = [
    {
      key: "select",
      header: "اختيار",
      render: (item: CODOrder) => (
        <input
          type="checkbox"
          checked={selectedOrders.includes(item.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedOrders([...selectedOrders, item.id]);
            } else {
              setSelectedOrders(selectedOrders.filter((id) => id !== item.id));
            }
          }}
          className="rounded border-gray-300"
        />
      ),
    },
    {
      key: "orderNumber",
      header: "رقم الطلب",
      render: (item: CODOrder) => (
        <span className="font-mono text-sm">{item.orderNumber}</span>
      ),
    },
    {
      key: "customerName",
      header: "العميل",
      render: (item: CODOrder) => <span>{item.customerName}</span>,
    },
    {
      key: "deliveryPartner",
      header: "شركة الشحن",
      render: (item: CODOrder) => {
        const partner = deliveryPartners.find(
          (p) => p.id === item.deliveryPartner,
        );
        return (
          <span>{partner?.name || item.deliveryPartnerName || "أخرى"}</span>
        );
      },
    },
    {
      key: "codAmount",
      header: "المبلغ",
      render: (item: CODOrder) => (
        <span className="font-semibold">{formatCurrency(item.codAmount)}</span>
      ),
    },
    {
      key: "deliveryDate",
      header: "تاريخ التسليم",
      render: (item: CODOrder) => (
        <span className="text-sm">
          {new Date(item.deliveryDate).toLocaleDateString("ar-EG")}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      render: (item: CODOrder) => {
        const config = STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG];
        const Icon = config.icon;
        return (
          <Badge className={cn("font-normal gap-1", config.color)}>
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="تسوية الدفع عند الاستلام"
        description="متابعة وتسوية مبالغ COD من شركات الشحن"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="h-4 w-4 ml-2" />
              استيراد كشف
            </Button>
            <Button variant="outline" size="sm" onClick={fetchOrders}>
              <RefreshCw className="h-4 w-4 ml-2" />
              تحديث
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 ml-2" />
              تصدير
            </Button>
          </div>
        }
      />

      {/* AI COD Insights */}
      <AiInsightsCard
        title="تحليلات الدفع عند الاستلام"
        insights={generateCodInsights({
          pendingAmount: summary?.totalPendingAmount ?? 0,
          collectedAmount: summary?.totalCollectedAmount ?? 0,
          disputedAmount: summary?.totalDisputedAmount ?? 0,
          totalOrders: orders.length,
        })}
        loading={loading}
      />

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                قيد الانتظار
              </CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {formatCurrency(summary.totalPendingAmount)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.totalPending} طلب
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">تم التحصيل</CardTitle>
              <Banknote className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(summary.totalCollectedAmount)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.totalCollected} طلب
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">تمت التسوية</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.totalReconciledAmount)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.totalReconciled} طلب
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">متنازع عليه</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(summary.totalDisputedAmount)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.totalDisputed} طلب
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-blue-200 bg-blue-50/60">
        <CardContent className="pt-4 text-sm text-blue-800">
          حالات COD هنا مبنية على حالة التسوية المالية (`pending / collected /
          reconciled / disputed`) وليست مرادفة تلقائياً لحالة الشحن.
        </CardContent>
      </Card>

      {/* Filters and Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-4">
              <Select
                value={selectedPartner}
                onValueChange={setSelectedPartner}
              >
                <SelectTrigger className="w-[180px]">
                  <Truck className="h-4 w-4 ml-2" />
                  <SelectValue placeholder="شركة الشحن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الشركات</SelectItem>
                  {deliveryPartners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>
                      {partner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={periodDays} onValueChange={setPeriodDays}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COD_PERIOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                className="w-[170px]"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="من تاريخ"
              />
              <Input
                type="date"
                className="w-[170px]"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="إلى تاريخ"
              />
              {(startDate && !endDate) || (!startDate && endDate) ? (
                <span className="text-xs text-muted-foreground self-center">
                  أدخل تاريخ البداية والنهاية معًا لتفعيل المدى المخصص
                </span>
              ) : null}
              {(startDate || endDate) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                >
                  مسح التاريخ
                </Button>
              )}
            </div>

            {selectedOrders.length > 0 && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setReconcileDialogOpen(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="h-4 w-4 ml-2" />
                  تسوية ({selectedOrders.length})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDisputeDialogOpen(true)}
                >
                  <AlertTriangle className="h-4 w-4 ml-2" />
                  اعتراض
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Orders Table with Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            قيد الانتظار
          </TabsTrigger>
          <TabsTrigger value="collected" className="gap-2">
            <Banknote className="h-4 w-4" />
            تم التحصيل
          </TabsTrigger>
          <TabsTrigger value="reconciled" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            تمت التسوية
          </TabsTrigger>
          <TabsTrigger value="disputed" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            متنازع عليه
          </TabsTrigger>
          <TabsTrigger value="reminders" className="gap-2">
            <Bell className="h-4 w-4" />
            التذكيرات
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {activeTab !== "reminders" ? (
            <Card>
              <CardHeader>
                <CardTitle>طلبات الدفع عند الاستلام</CardTitle>
                <CardDescription>{filteredOrders.length} طلب</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    جاري التحميل...
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    لا توجد طلبات في هذه الفئة
                  </div>
                ) : (
                  <DataTable columns={columns} data={filteredOrders} />
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Schedule Reminders Action */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarClock className="h-5 w-5" />
                    جدولة تذكيرات التحصيل
                  </CardTitle>
                  <CardDescription>
                    إرسال تذكيرات تلقائية للعملاء الذين لم يتم تحصيل مبالغ الدفع
                    عند الاستلام منهم
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-4">
                    <div className="space-y-2">
                      <Label>أيام التأخير</Label>
                      <Select
                        value={daysPastDueInput}
                        onValueChange={setDaysPastDueInput}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">يوم واحد</SelectItem>
                          <SelectItem value="3">3 أيام</SelectItem>
                          <SelectItem value="5">5 أيام</SelectItem>
                          <SelectItem value="7">أسبوع</SelectItem>
                          <SelectItem value="14">أسبوعين</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={handleScheduleReminders}
                      disabled={schedulingReminders}
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      {schedulingReminders
                        ? "جاري الجدولة..."
                        : "جدولة التذكيرات"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={fetchReminders}
                      disabled={remindersLoading}
                      className="gap-2"
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          remindersLoading && "animate-spin",
                        )}
                      />
                      تحديث
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Reminders List */}
              <Card>
                <CardHeader>
                  <CardTitle>التذكيرات المجدولة</CardTitle>
                  <CardDescription>{reminders.length} تذكير</CardDescription>
                </CardHeader>
                <CardContent>
                  {remindersLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      جاري التحميل...
                    </div>
                  ) : reminders.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-medium">
                        لا توجد تذكيرات مجدولة
                      </p>
                      <p className="text-sm mt-1">
                        استخدم الزر أعلاه لجدولة تذكيرات للطلبات المتأخرة
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm" dir="rtl">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="p-3 text-right font-medium">
                              رقم الطلب
                            </th>
                            <th className="p-3 text-right font-medium">
                              العميل
                            </th>
                            <th className="p-3 text-right font-medium">
                              المبلغ
                            </th>
                            <th className="p-3 text-right font-medium">
                              أيام التأخير
                            </th>
                            <th className="p-3 text-right font-medium">
                              نوع التذكير
                            </th>
                            <th className="p-3 text-right font-medium">
                              الحالة
                            </th>
                            <th className="p-3 text-right font-medium">
                              تاريخ الجدولة
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {reminders.map((reminder) => (
                            <tr
                              key={reminder.id}
                              className="border-t hover:bg-muted/30"
                            >
                              <td className="p-3 font-mono text-xs">
                                {reminder.orderNumber}
                              </td>
                              <td className="p-3">{reminder.customerName}</td>
                              <td className="p-3 font-medium">
                                {formatCurrency(reminder.codAmount)}
                              </td>
                              <td className="p-3">
                                <Badge
                                  variant="outline"
                                  className="bg-orange-50 text-orange-700"
                                >
                                  {reminder.daysPastDue} يوم
                                </Badge>
                              </td>
                              <td className="p-3">
                                <Badge
                                  className={cn(
                                    reminder.reminderType ===
                                      "first_reminder" &&
                                      "bg-blue-100 text-blue-800",
                                    reminder.reminderType ===
                                      "second_reminder" &&
                                      "bg-yellow-100 text-yellow-800",
                                    reminder.reminderType === "final_notice" &&
                                      "bg-red-100 text-red-800",
                                  )}
                                >
                                  {reminder.reminderType === "first_reminder" &&
                                    "تذكير أول"}
                                  {reminder.reminderType ===
                                    "second_reminder" && "تذكير ثاني"}
                                  {reminder.reminderType === "final_notice" &&
                                    "إشعار نهائي"}
                                </Badge>
                              </td>
                              <td className="p-3">
                                <Badge
                                  className={cn(
                                    reminder.status === "pending" &&
                                      "bg-gray-100 text-gray-800",
                                    reminder.status === "sent" &&
                                      "bg-green-100 text-green-800",
                                    reminder.status === "acknowledged" &&
                                      "bg-blue-100 text-blue-800",
                                  )}
                                >
                                  {reminder.status === "pending" &&
                                    "في الانتظار"}
                                  {reminder.status === "sent" && "تم الإرسال"}
                                  {reminder.status === "acknowledged" &&
                                    "تم الاستلام"}
                                </Badge>
                              </td>
                              <td className="p-3 text-muted-foreground text-xs">
                                {new Date(
                                  reminder.scheduledAt,
                                ).toLocaleDateString("ar-EG")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Reconcile Dialog */}
      <Dialog open={reconcileDialogOpen} onOpenChange={setReconcileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسوية الطلبات</DialogTitle>
            <DialogDescription>
              تأكيد استلام المبالغ من شركة الشحن
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="text-sm">
              عدد الطلبات: <strong>{selectedOrders.length}</strong>
            </div>
            <div className="text-sm">
              المبلغ المتوقع:{" "}
              <strong>
                {formatCurrency(
                  orders
                    .filter((o) => selectedOrders.includes(o.id))
                    .reduce((sum, o) => sum + o.codAmount, 0),
                )}
              </strong>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="actualAmount">المبلغ الفعلي المستلم</Label>
              <Input
                id="actualAmount"
                type="number"
                placeholder="أدخل المبلغ الفعلي"
                value={actualAmount}
                onChange={(e) => setActualAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReconcileDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button onClick={handleReconcile} disabled={submitting}>
              {submitting ? "جاري التسوية..." : "تأكيد التسوية"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تسجيل اعتراض</DialogTitle>
            <DialogDescription>
              تسجيل خلاف مع شركة الشحن بخصوص هذه الطلبات
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="text-sm">
              عدد الطلبات: <strong>{selectedOrders.length}</strong>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="disputeNotes">سبب الاعتراض</Label>
              <Textarea
                id="disputeNotes"
                placeholder="اشرح سبب الاعتراض..."
                value={disputeNotes}
                onChange={(e) => setDisputeNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisputeDialogOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleDispute}
              disabled={submitting || !disputeNotes}
            >
              {submitting ? "جاري التسجيل..." : "تسجيل الاعتراض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              استيراد كشف شركة الشحن
            </DialogTitle>
            <DialogDescription>
              قم برفع ملف CSV من شركة الشحن لمطابقة المبالغ المحصلة
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {!importPreview ? (
              <>
                {/* File Upload Section */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary transition-colors">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label htmlFor="csv-upload" className="cursor-pointer">
                    <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <p className="text-sm text-muted-foreground mb-2">
                      اسحب ملف CSV هنا أو انقر للاختيار
                    </p>
                    <p className="text-xs text-muted-foreground">
                      يدعم ملفات: CSV, TXT (بفاصلة)
                    </p>
                  </label>
                </div>

                {/* Instructions */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-2">
                    تنسيق الملف المتوقع:
                  </h4>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>عمود رقم الطلب (Order Number / AWB)</li>
                    <li>عمود المبلغ (Amount / COD)</li>
                    <li>عمود التاريخ (اختياري)</li>
                    <li>عمود الحالة (اختياري)</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                {/* Preview Section */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {importFile?.name}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearImport}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Summary Stats */}
                {importSummary && (
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-muted rounded p-3 text-center">
                      <div className="text-lg font-bold">
                        {importSummary.total}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        إجمالي الصفوف
                      </div>
                    </div>
                    <div className="bg-green-50 rounded p-3 text-center">
                      <div className="text-lg font-bold text-green-600">
                        {importSummary.matched}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        متطابق
                      </div>
                    </div>
                    <div className="bg-yellow-50 rounded p-3 text-center">
                      <div className="text-lg font-bold text-yellow-600">
                        {importSummary.unmatched}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        غير متطابق
                      </div>
                    </div>
                    <div className="bg-blue-50 rounded p-3 text-center">
                      <div className="text-lg font-bold text-blue-600">
                        {formatCurrency(importSummary.totalAmount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        الإجمالي
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview Table */}
                <div className="border rounded-lg max-h-64 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-right p-2">رقم الطلب</th>
                        <th className="text-right p-2">المبلغ</th>
                        <th className="text-right p-2">التاريخ</th>
                        <th className="text-right p-2">المطابقة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importedRows.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2 font-mono text-xs">
                            {row.orderNumber}
                          </td>
                          <td className="p-2">{formatCurrency(row.amount)}</td>
                          <td className="p-2 text-muted-foreground">
                            {row.date}
                          </td>
                          <td className="p-2">
                            {row.matched ? (
                              <Badge className="bg-green-100 text-green-800">
                                ✓ متطابق
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-800">
                                ؟ غير متطابق
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                      {importedRows.length > 10 && (
                        <tr className="border-t bg-muted/50">
                          <td
                            colSpan={4}
                            className="p-2 text-center text-muted-foreground"
                          >
                            ... و {importedRows.length - 10} صف آخر
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImportDialogOpen(false);
                clearImport();
              }}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleImportConfirm}
              disabled={importing || importedRows.length === 0}
            >
              {importing
                ? "جاري الاستيراد..."
                : `تسوية ${importSummary?.matched || 0} طلب`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
