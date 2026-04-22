"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
import { DataTable } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/alerts";
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
  CreditCard,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import portalApi from "@/lib/client";
import { branchesApi } from "@/lib/client";
import { REPORTING_PERIOD_OPTIONS } from "@/lib/reporting-period";

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
    color:
      "border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]",
    icon: Clock,
  },
  collected: {
    label: "تم التحصيل",
    color:
      "border-[color:rgba(59,130,246,0.26)] bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]",
    icon: Banknote,
  },
  reconciled: {
    label: "تمت التسوية",
    color:
      "border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]",
    icon: CheckCircle2,
  },
  disputed: {
    label: "متنازع عليه",
    color:
      "border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]",
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

function getFreshness(updatedAt: Date | null) {
  if (!updatedAt) return { label: "لم يتم التحديث", state: "old" as const };
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - updatedAt.getTime()) / 60000),
  );
  if (minutes < 1) return { label: "آخر تحديث: الآن", state: "fresh" as const };
  if (minutes <= 5) {
    return { label: `آخر تحديث: منذ ${minutes} د`, state: "fresh" as const };
  }
  if (minutes <= 30) {
    return { label: `آخر تحديث: منذ ${minutes} د`, state: "stale" as const };
  }
  return { label: "بيانات التسويات قديمة", state: "old" as const };
}

export default function CODReconciliationPage() {
  const { merchantId, apiKey } = useMerchant();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<CODOrder[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedPartner, setSelectedPartner] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [periodDays, setPeriodDays] = useState<string>("7");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState(false);
  const [disputeNotes, setDisputeNotes] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

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

  const [deliveryPartners, setDeliveryPartners] = useState<
    Array<{ id: string; name: string }>
  >([
    { id: "aramex", name: "أرامكس" },
    { id: "bosta", name: "بوسطة" },
    { id: "fetchr", name: "فيتشر" },
    { id: "sprint", name: "سبرينت" },
    { id: "other", name: "أخرى" },
  ]);

  // Load delivery partners from API (centralised - no frontend deploy needed to add a courier)
  useEffect(() => {
    portalApi
      .getDeliveryPartners()
      .then((data) => {
        if (data?.partners?.length) {
          setDeliveryPartners(
            data.partners.map((p) => ({ id: p.id, name: p.nameAr })),
          );
        }
      })
      .catch(() => {
        /* keep defaults on error */
      });
  }, []);

  // Load branches list once
  useEffect(() => {
    if (!apiKey || !merchantId) return;
    branchesApi
      .list(apiKey)
      .then((data: any) => {
        const list = Array.isArray(data)
          ? data
          : (data?.branches ?? data?.data ?? []);
        if (list.length > 1)
          setBranches(list.map((b: any) => ({ id: b.id, name: b.name })));
      })
      .catch(() => {
        /* silently ignore */
      });
  }, [apiKey, merchantId]);

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
        branchId?: string;
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
      if (branchFilter !== "all") {
        query.branchId = branchFilter;
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
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error("Failed to fetch COD orders:", error);
    } finally {
      setLoading(false);
    }
  }, [
    merchantId,
    apiKey,
    selectedPartner,
    branchFilter,
    periodDays,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (
      tab === "pending" ||
      tab === "collected" ||
      tab === "reconciled" ||
      tab === "disputed" ||
      tab === "reminders"
    ) {
      setActiveTab(tab);
      return;
    }
    setActiveTab("pending");
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "pending") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

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
  const expectedAmount = summary
    ? summary.totalPendingAmount +
      summary.totalCollectedAmount +
      summary.totalReconciledAmount +
      summary.totalDisputedAmount
    : 0;
  const collectedAmount = summary
    ? summary.totalCollectedAmount + summary.totalReconciledAmount
    : 0;
  const varianceAmount = expectedAmount - collectedAmount;
  const freshness = getFreshness(lastUpdatedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        title="تسوية الدفع عند الاستلام"
        description="متابعة وتسوية مبالغ COD من شركات الشحن"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportDialogOpen(true)}
              className="w-full sm:w-auto"
            >
              <Upload className="h-4 w-4 ml-2" />
              استيراد كشف
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchOrders}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4 ml-2" />
              تحديث
            </Button>
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              <Download className="h-4 w-4 ml-2" />
              تصدير
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        {[
          ["الملخص", "/merchant/finance/summary"],
          ["الإيرادات", "/merchant/finance/revenue"],
          ["المصروفات", "/merchant/expenses"],
          ["التدفق النقدي", "/merchant/reports/cash-flow"],
          ["التسويات", "/merchant/payments/cod"],
        ].map(([label, href]) => (
          <Button
            key={href}
            asChild
            variant={href === "/merchant/payments/cod" ? "default" : "outline"}
            size="sm"
          >
            <Link href={href}>{label}</Link>
          </Button>
        ))}
      </div>

      <section className="rounded-[var(--radius-base)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-sm)]">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">
                المتوقع من شركات الشحن
              </p>
              <p className="mt-1 font-mono text-lg font-bold">
                {formatCurrency(expectedAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">
                المحصل أو المسوى
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-[var(--color-success-text)]">
                {formatCurrency(collectedAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">
                الفرق المطلوب متابعته
              </p>
              <p
                className={`mt-1 font-mono text-lg font-bold ${
                  varianceAmount > 0
                    ? "text-[var(--color-warning-text)]"
                    : "text-[var(--color-success-text)]"
                }`}
              >
                {formatCurrency(varianceAmount)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
            <Button asChild variant="outline">
              <Link href="/merchant/payments/proofs">
                <CreditCard className="h-4 w-4" />
                إثباتات الدفع
              </Link>
            </Button>
            <span
              className={
                freshness.state === "old"
                  ? "text-xs text-[var(--color-danger-text)]"
                  : freshness.state === "stale"
                    ? "text-xs text-[var(--color-warning-text)]"
                    : "text-xs text-[var(--color-text-secondary)]"
              }
            >
              {freshness.label}
            </span>
          </div>
        </div>
      </section>

      {summary && (
        <div className="flex flex-wrap gap-2">
          {[
            `قيد الانتظار: ${formatCurrency(summary.totalPendingAmount)} (${summary.totalPending})`,
            `تم التحصيل: ${formatCurrency(summary.totalCollectedAmount)} (${summary.totalCollected})`,
            `تمت التسوية: ${formatCurrency(summary.totalReconciledAmount)} (${summary.totalReconciled})`,
            `متنازع عليه: ${formatCurrency(summary.totalDisputedAmount)} (${summary.totalDisputed})`,
          ].map((chip) => (
            <div
              key={chip}
              className="inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs text-[var(--text-secondary)]"
            >
              {chip}
            </div>
          ))}
        </div>
      )}

      <Card className="app-data-card border-[color:rgba(59,130,246,0.24)] bg-[color:rgba(59,130,246,0.1)]">
        <CardContent className="pt-4 text-sm text-[color:rgba(244,244,245,0.84)]">
          حالات COD هنا مبنية على حالة التسوية المالية (`pending / collected /
          reconciled / disputed`) وليست مرادفة تلقائياً لحالة الشحن.
        </CardContent>
      </Card>

      {/* Filters and Actions */}
      <Card className="app-data-card app-data-card--muted">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center">
              <Select
                value={selectedPartner}
                onValueChange={setSelectedPartner}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
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

              {branches.length > 0 && (
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger className="w-full sm:w-[170px]">
                    <SelectValue placeholder="الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الفروع</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={periodDays} onValueChange={setPeriodDays}>
                <SelectTrigger className="w-full sm:w-[170px]">
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
                className="w-full sm:w-[170px]"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="من تاريخ"
              />
              <Input
                type="date"
                className="w-full sm:w-[170px]"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="إلى تاريخ"
              />
              {(startDate && !endDate) || (!startDate && endDate) ? (
                <span className="text-xs text-muted-foreground lg:self-center">
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  onClick={() => setReconcileDialogOpen(true)}
                  className="bg-[var(--accent-success)] text-[var(--bg-base)] hover:brightness-110"
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
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <TabsTrigger value="pending" className="w-full gap-2">
            <Clock className="h-4 w-4" />
            قيد الانتظار
          </TabsTrigger>
          <TabsTrigger value="collected" className="w-full gap-2">
            <Banknote className="h-4 w-4" />
            تم التحصيل
          </TabsTrigger>
          <TabsTrigger value="reconciled" className="w-full gap-2">
            <CheckCircle2 className="h-4 w-4" />
            تمت التسوية
          </TabsTrigger>
          <TabsTrigger value="disputed" className="w-full gap-2">
            <AlertTriangle className="h-4 w-4" />
            متنازع عليه
          </TabsTrigger>
          <TabsTrigger value="reminders" className="w-full gap-2">
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
                  <TableSkeleton rows={6} columns={7} />
                ) : filteredOrders.length === 0 ? (
                  <EmptyState
                    icon={<Banknote className="h-7 w-7" />}
                    title="لا توجد طلبات في حالة التسوية الحالية"
                    description="غيّر الحالة أو شركة الشحن أو الفترة الزمنية لعرض طلبات أخرى، أو استورد كشف شركة الشحن عند توفره."
                    action={
                      <Button
                        variant="outline"
                        onClick={() => setImportDialogOpen(true)}
                      >
                        <Upload className="h-4 w-4" />
                        استيراد كشف
                      </Button>
                    }
                    className="py-8"
                  />
                ) : (
                  <>
                    <div className="space-y-3 md:hidden">
                      {filteredOrders.map((order) => {
                        const config =
                          STATUS_CONFIG[
                            order.status as keyof typeof STATUS_CONFIG
                          ];
                        const Icon = config.icon;
                        const partner = deliveryPartners.find(
                          (p) => p.id === order.deliveryPartner,
                        );
                        const isSelected = selectedOrders.includes(order.id);
                        return (
                          <div
                            key={order.id}
                            className="space-y-4 rounded-lg border p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedOrders([
                                          ...selectedOrders,
                                          order.id,
                                        ]);
                                      } else {
                                        setSelectedOrders(
                                          selectedOrders.filter(
                                            (id) => id !== order.id,
                                          ),
                                        );
                                      }
                                    }}
                                    className="rounded border-gray-300"
                                  />
                                  <p className="font-mono text-sm font-medium">
                                    {order.orderNumber}
                                  </p>
                                </div>
                                <p className="text-sm">{order.customerName}</p>
                              </div>
                              <Badge
                                className={cn(
                                  "font-normal gap-1",
                                  config.color,
                                )}
                              >
                                <Icon className="h-3 w-3" />
                                {config.label}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                              <div>
                                <p className="text-muted-foreground">
                                  شركة الشحن
                                </p>
                                <p>
                                  {partner?.name ||
                                    order.deliveryPartnerName ||
                                    "أخرى"}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">المبلغ</p>
                                <p className="font-semibold">
                                  {formatCurrency(order.codAmount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">
                                  تاريخ التسليم
                                </p>
                                <p>
                                  {new Date(
                                    order.deliveryDate,
                                  ).toLocaleDateString("ar-EG")}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="hidden md:block">
                      <DataTable columns={columns} data={filteredOrders} />
                    </div>
                  </>
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
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                    <div className="space-y-2">
                      <Label>أيام التأخير</Label>
                      <Select
                        value={daysPastDueInput}
                        onValueChange={setDaysPastDueInput}
                      >
                        <SelectTrigger className="w-full sm:w-[180px]">
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
                      className="gap-2 w-full sm:w-auto"
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
                      className="gap-2 w-full sm:w-auto"
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
                    <TableSkeleton rows={5} columns={7} />
                  ) : reminders.length === 0 ? (
                    <EmptyState
                      icon={<Bell className="h-7 w-7" />}
                      title="لا توجد تذكيرات مجدولة"
                      description="استخدم إجراء الجدولة بالأعلى لإنشاء تذكيرات للطلبات المتأخرة في التحصيل."
                      className="py-10"
                    />
                  ) : (
                    <>
                      <div className="space-y-3 md:hidden">
                        {reminders.map((reminder) => (
                          <div
                            key={reminder.id}
                            className="space-y-3 rounded-lg border p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-mono text-sm font-medium">
                                  {reminder.orderNumber}
                                </p>
                                <p className="text-sm">
                                  {reminder.customerName}
                                </p>
                              </div>
                              <Badge
                                className={cn(
                                  reminder.status === "pending" &&
                                    "border-[color:var(--border-default)] bg-[color:var(--bg-surface-2)] text-[color:var(--text-secondary)]",
                                  reminder.status === "sent" &&
                                    "border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]",
                                  reminder.status === "acknowledged" &&
                                    "border-[color:rgba(59,130,246,0.26)] bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]",
                                )}
                              >
                                {reminder.status === "pending" && "في الانتظار"}
                                {reminder.status === "sent" && "تم الإرسال"}
                                {reminder.status === "acknowledged" &&
                                  "تم الاستلام"}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                              <div>
                                <p className="text-muted-foreground">المبلغ</p>
                                <p className="font-medium">
                                  {formatCurrency(reminder.codAmount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">
                                  أيام التأخير
                                </p>
                                <Badge
                                  variant="outline"
                                  className="border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.1)] text-[color:#fdba74]"
                                >
                                  {reminder.daysPastDue} يوم
                                </Badge>
                              </div>
                              <div>
                                <p className="text-muted-foreground">
                                  نوع التذكير
                                </p>
                                <Badge
                                  className={cn(
                                    reminder.reminderType ===
                                      "first_reminder" &&
                                      "border-[color:rgba(59,130,246,0.26)] bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]",
                                    reminder.reminderType ===
                                      "second_reminder" &&
                                      "border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]",
                                    reminder.reminderType === "final_notice" &&
                                      "border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]",
                                  )}
                                >
                                  {reminder.reminderType === "first_reminder" &&
                                    "تذكير أول"}
                                  {reminder.reminderType ===
                                    "second_reminder" && "تذكير ثاني"}
                                  {reminder.reminderType === "final_notice" &&
                                    "إشعار نهائي"}
                                </Badge>
                              </div>
                              <div>
                                <p className="text-muted-foreground">
                                  تاريخ الجدولة
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(
                                    reminder.scheduledAt,
                                  ).toLocaleDateString("ar-EG")}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="hidden overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] md:block">
                        <table className="w-full text-sm" dir="rtl">
                          <thead className="bg-[color:var(--bg-surface-2)]">
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
                                className="border-t border-[color:var(--border-subtle)] transition-colors hover:bg-[color:var(--bg-surface-2)]"
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
                                    className="border-[color:rgba(245,158,11,0.24)] bg-[color:rgba(245,158,11,0.1)] text-[color:#fdba74]"
                                  >
                                    {reminder.daysPastDue} يوم
                                  </Badge>
                                </td>
                                <td className="p-3">
                                  <Badge
                                    className={cn(
                                      reminder.reminderType ===
                                        "first_reminder" &&
                                        "border-[color:rgba(59,130,246,0.26)] bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]",
                                      reminder.reminderType ===
                                        "second_reminder" &&
                                        "border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]",
                                      reminder.reminderType ===
                                        "final_notice" &&
                                        "border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]",
                                    )}
                                  >
                                    {reminder.reminderType ===
                                      "first_reminder" && "تذكير أول"}
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
                                        "border-[color:var(--border-default)] bg-[color:var(--bg-surface-2)] text-[color:var(--text-secondary)]",
                                      reminder.status === "sent" &&
                                        "border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]",
                                      reminder.status === "acknowledged" &&
                                        "border-[color:rgba(59,130,246,0.26)] bg-[color:rgba(59,130,246,0.12)] text-[color:#93c5fd]",
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
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Reconcile Dialog */}
      <Dialog open={reconcileDialogOpen} onOpenChange={setReconcileDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
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
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setReconcileDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleReconcile}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              {submitting ? "جاري التسوية..." : "تأكيد التسوية"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={disputeDialogOpen} onOpenChange={setDisputeDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
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
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setDisputeDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleDispute}
              disabled={submitting || !disputeNotes}
              className="w-full sm:w-auto"
            >
              {submitting ? "جاري التسجيل..." : "تسجيل الاعتراض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
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
                <div className="rounded-lg border-2 border-dashed border-[var(--border-default)] p-8 text-center transition-colors hover:border-[var(--accent-blue)]">
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label htmlFor="csv-upload" className="cursor-pointer">
                    <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
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
                <div className="flex items-center justify-between gap-3">
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
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)] p-3 text-center">
                      <div className="text-lg font-bold">
                        {importSummary.total}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        إجمالي الصفوف
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-sm)] border border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] p-3 text-center">
                      <div className="text-lg font-bold text-[color:var(--accent-success)]">
                        {importSummary.matched}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        متطابق
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-sm)] border border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] p-3 text-center">
                      <div className="text-lg font-bold text-[color:var(--accent-warning)]">
                        {importSummary.unmatched}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        غير متطابق
                      </div>
                    </div>
                    <div className="rounded-[var(--radius-sm)] border border-[color:rgba(59,130,246,0.26)] bg-[color:rgba(59,130,246,0.12)] p-3 text-center">
                      <div className="text-lg font-bold text-[color:var(--accent-blue)]">
                        {formatCurrency(importSummary.totalAmount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        الإجمالي
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview Table */}
                <div className="space-y-3 md:hidden">
                  {importedRows.slice(0, 10).map((row, idx) => (
                    <div key={idx} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-mono text-xs">{row.orderNumber}</p>
                        {row.matched ? (
                          <Badge className="border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]">
                            ✓ متطابق
                          </Badge>
                        ) : (
                          <Badge className="border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]">
                            ؟ غير متطابق
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-muted-foreground">المبلغ</p>
                          <p>{formatCurrency(row.amount)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">التاريخ</p>
                          <p className="text-muted-foreground">{row.date}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {importedRows.length > 10 && (
                    <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                      ... و {importedRows.length - 10} صف آخر
                    </div>
                  )}
                </div>
                <div className="hidden max-h-64 overflow-auto rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] md:block">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[color:var(--bg-surface-2)]">
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
                              <Badge className="border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]">
                                ✓ متطابق
                              </Badge>
                            ) : (
                              <Badge className="border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]">
                                ؟ غير متطابق
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                      {importedRows.length > 10 && (
                        <tr className="border-t border-[color:var(--border-subtle)] bg-[color:var(--bg-surface-2)]">
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

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => {
                setImportDialogOpen(false);
                clearImport();
              }}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleImportConfirm}
              disabled={importing || importedRows.length === 0}
              className="w-full sm:w-auto"
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
