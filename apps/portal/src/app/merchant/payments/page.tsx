"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Link2,
  Plus,
  Copy,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Receipt,
  RefreshCw,
  Filter,
  Bell,
  Image as ImageIcon,
} from "lucide-react";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { paymentsApi } from "@/lib/api";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useToast } from "@/hooks/use-toast";
import {
  AiInsightsCard,
  generatePaymentsInsights,
} from "@/components/ai/ai-insights-card";

interface PaymentLink {
  id: string;
  linkCode: string;
  amount: number;
  currency: string;
  description: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentUrl: string;
}

interface PaymentProof {
  id: string;
  amount?: number | null;
  currency?: string | null;
  linkAmount?: number | null;
  extractedAmount?: number | null;
  extractedReference?: string | null;
  referenceNumber?: string;
  status: string;
  imageUrl?: string;
  createdAt: string;
  rejectionReason?: string;
  linkCode?: string | null;
  orderNumber?: string | null;
}

const statusConfig: Record<
  string,
  { color: string; icon: React.ReactNode; label: string }
> = {
  PENDING: {
    color: "bg-yellow-100 text-yellow-800",
    icon: <Clock className="h-4 w-4" />,
    label: "قيد الانتظار",
  },
  VIEWED: {
    color: "bg-blue-100 text-blue-800",
    icon: <Eye className="h-4 w-4" />,
    label: "تمت المشاهدة",
  },
  PAID: {
    color: "bg-green-100 text-green-800",
    icon: <CheckCircle className="h-4 w-4" />,
    label: "مدفوع",
  },
  EXPIRED: {
    color: "bg-gray-100 text-gray-800",
    icon: <AlertCircle className="h-4 w-4" />,
    label: "منتهي",
  },
  CANCELLED: {
    color: "bg-red-100 text-red-800",
    icon: <XCircle className="h-4 w-4" />,
    label: "ملغي",
  },
  PENDING_REVIEW: {
    color: "bg-yellow-100 text-yellow-800",
    icon: <Clock className="h-4 w-4" />,
    label: "بانتظار المراجعة",
  },
  APPROVED: {
    color: "bg-green-100 text-green-800",
    icon: <CheckCircle className="h-4 w-4" />,
    label: "موافق عليه",
  },
  REJECTED: {
    color: "bg-red-100 text-red-800",
    icon: <XCircle className="h-4 w-4" />,
    label: "مرفوض",
  },
};

function normalizeProofStatus(raw?: string): string {
  const status = String(raw || "")
    .trim()
    .toUpperCase();
  return status || "PENDING";
}

function resolveProofImageUrl(rawUrl?: string | null): string | undefined {
  if (!rawUrl) return undefined;
  const normalized = String(rawUrl).trim().replace(/\\/g, "/");
  if (!normalized) return undefined;
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith("data:"))
    return normalized;
  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
  ).replace(/\/api\/?$/, "");
  if (normalized.startsWith("/")) return `${apiBase}${normalized}`;
  return `${apiBase}/${normalized}`;
}

export default function PaymentsPage() {
  const { apiKey } = useMerchant();
  const { canCreate, canDelete, canApprove, isReadOnly } =
    useRoleAccess("payments");
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("links");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [linksTotal, setLinksTotal] = useState(0);
  const [proofsTotal, setProofsTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedLink, setSelectedLink] = useState<PaymentLink | null>(null);
  const [selectedProof, setSelectedProof] = useState<PaymentProof | null>(null);
  const [showProofDialog, setShowProofDialog] = useState(false);
  const [proofImageLoadFailed, setProofImageLoadFailed] = useState(false);
  const itemsPerPage = 10;

  const [newLink, setNewLink] = useState({
    amount: "",
    currency: "EGP",
    description: "",
    customerName: "",
    customerPhone: "",
    expiresInHours: "24",
  });
  const [creating, setCreating] = useState(false);

  const normalizeError = (err: any, fallback: string) => {
    const message = err?.message || fallback;
    if (
      message.includes("does not exist") ||
      message.includes("invalid input syntax") ||
      message.includes("NaN")
    ) {
      return "ميزة المدفوعات غير مهيأة بعد أو غير متاحة حالياً. حاول لاحقاً أو تواصل مع الدعم.";
    }
    return fallback;
  };

  const fetchLinks = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const filters: { status?: string; limit?: number; offset?: number } = {
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      };
      if (statusFilter !== "all") filters.status = statusFilter;
      const data = await paymentsApi.listPaymentLinks(apiKey, filters);
      setLinks(data.links || []);
      setLinksTotal(data.total || 0);
    } catch (err: any) {
      const message = normalizeError(err, "فشل في جلب روابط الدفع");
      setError(message);
      toast({ title: "خطأ", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiKey, currentPage, statusFilter, toast]);

  const fetchProofs = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const filters: { status?: string; limit?: number; offset?: number } = {
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      };
      if (statusFilter !== "all") filters.status = statusFilter;
      const data = await paymentsApi.listPaymentProofs(apiKey, filters);
      const mapped = (data.proofs || []).map((proof: any) => {
        const amount = proof.linkAmount ?? proof.extractedAmount ?? null;
        return {
          id: proof.id,
          amount,
          currency: proof.linkCurrency || "EGP",
          linkAmount: proof.linkAmount ?? null,
          extractedAmount: proof.extractedAmount ?? null,
          extractedReference: proof.extractedReference ?? null,
          referenceNumber:
            proof.referenceNumber || proof.extractedReference || null,
          status: normalizeProofStatus(proof.status),
          imageUrl: resolveProofImageUrl(proof.imageUrl),
          createdAt: proof.createdAt,
          rejectionReason: proof.rejectionReason,
          linkCode: proof.linkCode ?? null,
          orderNumber: proof.orderNumber ?? null,
        } as PaymentProof;
      });
      setProofs(mapped);
      setProofsTotal(data.total || 0);
    } catch (err: any) {
      const message = normalizeError(err, "فشل في جلب إثباتات الدفع");
      setError(message);
      toast({ title: "خطأ", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiKey, currentPage, statusFilter, toast]);

  useEffect(() => {
    if (activeTab === "links") fetchLinks();
    else fetchProofs();
  }, [activeTab, fetchLinks, fetchProofs]);

  useEffect(() => {
    setProofImageLoadFailed(false);
  }, [selectedProof?.id, showProofDialog]);

  const handleCreateLink = async () => {
    if (!apiKey || !newLink.amount) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال المبلغ",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const result = await paymentsApi.createPaymentLink(apiKey, {
        amount: parseFloat(newLink.amount),
        currency: newLink.currency,
        description: newLink.description || undefined,
        customerName: newLink.customerName || undefined,
        customerPhone: newLink.customerPhone || undefined,
        expiresInHours: parseInt(newLink.expiresInHours) || 24,
      });
      toast({
        title: "تم",
        description: "تم إنشاء رابط الدفع بنجاح",
        variant: "success",
      });
      setShowCreateDialog(false);
      setNewLink({
        amount: "",
        currency: "EGP",
        description: "",
        customerName: "",
        customerPhone: "",
        expiresInHours: "24",
      });
      setSelectedLink({
        ...result,
        createdAt: new Date().toISOString(),
      } as PaymentLink);
      setShowDetailsDialog(true);
      fetchLinks();
    } catch (err: any) {
      const message = normalizeError(err, "فشل في إنشاء رابط الدفع");
      toast({ title: "خطأ", description: message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleCopyLink = (link: PaymentLink) => {
    navigator.clipboard.writeText(link.paymentUrl);
    toast({ title: "تم", description: "تم نسخ الرابط" });
  };
  const handleSendReminder = async (linkId: string) => {
    if (!apiKey) return;
    try {
      await paymentsApi.sendReminder(apiKey, linkId);
      toast({ title: "تم", description: "تم إرسال تذكير للعميل" });
    } catch (err: any) {
      const message = normalizeError(err, "فشل في إرسال التذكير");
      toast({ title: "خطأ", description: message, variant: "destructive" });
    }
  };
  const handleCancelLink = async (linkId: string) => {
    if (!apiKey) return;
    try {
      await paymentsApi.cancelPaymentLink(apiKey, linkId);
      toast({ title: "تم", description: "تم إلغاء الرابط" });
      fetchLinks();
    } catch (err: any) {
      const message = normalizeError(err, "فشل في إلغاء الرابط");
      toast({ title: "خطأ", description: message, variant: "destructive" });
    }
  };
  const handleVerifyProof = async (proofId: string, approved: boolean) => {
    if (!apiKey) return;
    try {
      await paymentsApi.verifyProof(
        apiKey,
        proofId,
        approved,
        approved ? undefined : "إثبات غير صالح",
      );
      toast({
        title: "تم",
        description: approved ? "تم قبول الإثبات" : "تم رفض الإثبات",
      });
      setShowProofDialog(false);
      fetchProofs();
    } catch (err: any) {
      const message = normalizeError(err, "فشل في مراجعة الإثبات");
      toast({ title: "خطأ", description: message, variant: "destructive" });
    }
  };

  const StatusBadge = ({
    status,
    context,
  }: {
    status: string;
    context?: "links" | "proofs";
  }) => {
    const config = statusConfig[status] || statusConfig.PENDING;
    const label =
      status === "PENDING" && context === "proofs"
        ? "بانتظار المراجعة"
        : config.label;
    return (
      <Badge className={cn("flex items-center gap-1", config.color)}>
        {config.icon}
        {label}
      </Badge>
    );
  };

  const linkColumns = [
    { key: "linkCode", header: "كود الرابط" },
    {
      key: "amount",
      header: "المبلغ",
      render: (link: PaymentLink) => formatCurrency(link.amount, link.currency),
    },
    {
      key: "customerName",
      header: "العميل",
      render: (link: PaymentLink) => link.customerName || "-",
    },
    {
      key: "status",
      header: "الحالة",
      render: (link: PaymentLink) => (
        <StatusBadge status={link.status} context="links" />
      ),
    },
    {
      key: "createdAt",
      header: "التاريخ",
      render: (link: PaymentLink) => formatRelativeTime(link.createdAt),
    },
    {
      key: "expiresAt",
      header: "ينتهي",
      render: (link: PaymentLink) => formatRelativeTime(link.expiresAt),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (link: PaymentLink) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopyLink(link)}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedLink(link);
              setShowDetailsDialog(true);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {(link.status === "PENDING" || link.status === "VIEWED") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSendReminder(link.id)}
              title="إرسال تذكير"
            >
              <Bell className="h-4 w-4" />
            </Button>
          )}
          {(link.status === "PENDING" || link.status === "VIEWED") &&
            canDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCancelLink(link.id)}
                className="text-red-600"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}
        </div>
      ),
    },
  ];

  const proofColumns = [
    {
      key: "id",
      header: "المعرف",
      render: (proof: PaymentProof) => proof.id.slice(0, 8) + "...",
    },
    {
      key: "amount",
      header: "المبلغ",
      render: (proof: PaymentProof) =>
        proof.amount != null
          ? formatCurrency(proof.amount, proof.currency || "EGP")
          : "-",
    },
    {
      key: "referenceNumber",
      header: "المرجع",
      render: (proof: PaymentProof) => proof.referenceNumber || "-",
    },
    {
      key: "status",
      header: "الحالة",
      render: (proof: PaymentProof) => (
        <StatusBadge status={proof.status} context="proofs" />
      ),
    },
    {
      key: "createdAt",
      header: "التاريخ",
      render: (proof: PaymentProof) => formatRelativeTime(proof.createdAt),
    },
    {
      key: "actions",
      header: "إجراءات",
      render: (proof: PaymentProof) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedProof(proof);
            setShowProofDialog(true);
          }}
        >
          <Eye className="h-4 w-4 ml-1" />
          مراجعة
        </Button>
      ),
    },
  ];

  const totalPages =
    activeTab === "links"
      ? Math.ceil(linksTotal / itemsPerPage)
      : Math.ceil(proofsTotal / itemsPerPage);

  return (
    <div className="space-y-6">
      <PageHeader
        title="المدفوعات"
        description="إدارة روابط الدفع وإثباتات التحويل"
        actions={
          activeTab === "links" && canCreate ? (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 ml-2" />
              إنشاء رابط
            </Button>
          ) : null
        }
      />

      {/* AI Payments Insights */}
      <AiInsightsCard
        title="مساعد المدفوعات"
        insights={generatePaymentsInsights({
          totalLinks: linksTotal,
          pendingProofs: proofs.filter((p) => p.status === "PENDING").length,
          totalProofs: proofsTotal,
        })}
      />

      <Card>
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val);
            setCurrentPage(1);
            setStatusFilter("all");
          }}
        >
          <CardHeader className="pb-0">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="links">
                <Link2 className="h-4 w-4 ml-2" />
                روابط الدفع
              </TabsTrigger>
              <TabsTrigger value="proofs">
                <Receipt className="h-4 w-4 ml-2" />
                إثباتات الدفع
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <Filter className="h-4 w-4 ml-2" />
                  <SelectValue placeholder="تصفية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {activeTab === "links" ? (
                    <>
                      <SelectItem value="PENDING">قيد الانتظار</SelectItem>
                      <SelectItem value="PAID">مدفوع</SelectItem>
                      <SelectItem value="EXPIRED">منتهي</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="PENDING">بانتظار المراجعة</SelectItem>
                      <SelectItem value="APPROVED">موافق</SelectItem>
                      <SelectItem value="REJECTED">مرفوض</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() =>
                  activeTab === "links" ? fetchLinks() : fetchProofs()
                }
              >
                <RefreshCw className="h-4 w-4 ml-2" />
                تحديث
              </Button>
            </div>
            {error && <AlertBanner type="error" message={error} />}

            <TabsContent value="links" className="mt-0">
              {loading ? (
                <TableSkeleton rows={5} columns={7} />
              ) : links.length === 0 ? (
                <EmptyState
                  icon={<Link2 className="h-12 w-12" />}
                  title="لا توجد روابط"
                  description="قم بإنشاء رابط دفع جديد"
                  action={
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className="h-4 w-4 ml-2" />
                      إنشاء
                    </Button>
                  }
                />
              ) : (
                <>
                  <DataTable data={links} columns={linkColumns} />
                  {totalPages > 1 && (
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="proofs" className="mt-0">
              {loading ? (
                <TableSkeleton rows={5} columns={6} />
              ) : proofs.length === 0 ? (
                <EmptyState
                  icon={<Receipt className="h-12 w-12" />}
                  title="لا توجد إثباتات"
                  description="ستظهر هنا إثباتات الدفع"
                />
              ) : (
                <>
                  <DataTable data={proofs} columns={proofColumns} />
                  {totalPages > 1 && (
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  )}
                </>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء رابط دفع</DialogTitle>
            <DialogDescription>أدخل تفاصيل الدفع</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label>المبلغ *</Label>
                <Input
                  type="number"
                  value={newLink.amount}
                  onChange={(e) =>
                    setNewLink({ ...newLink, amount: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>العملة</Label>
                <Select
                  value={newLink.currency}
                  onValueChange={(val) =>
                    setNewLink({ ...newLink, currency: val })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EGP">EGP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea
                value={newLink.description}
                onChange={(e) =>
                  setNewLink({ ...newLink, description: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>اسم العميل</Label>
                <Input
                  value={newLink.customerName}
                  onChange={(e) =>
                    setNewLink({ ...newLink, customerName: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>الهاتف</Label>
                <Input
                  value={newLink.customerPhone}
                  onChange={(e) =>
                    setNewLink({ ...newLink, customerPhone: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              إلغاء
            </Button>
            <Button onClick={handleCreateLink} disabled={creating}>
              {creating ? "جاري..." : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل رابط الدفع</DialogTitle>
          </DialogHeader>
          {selectedLink && (
            <div className="space-y-4 py-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الحالة</span>
                <StatusBadge status={selectedLink.status} context="links" />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المبلغ</span>
                <span className="font-semibold text-lg">
                  {formatCurrency(selectedLink.amount, selectedLink.currency)}
                </span>
              </div>
              <div className="pt-4 border-t">
                <Label>رابط الدفع</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={selectedLink.paymentUrl}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyLink(selectedLink)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => window.open(selectedLink.paymentUrl, "_blank")}
              >
                <ExternalLink className="h-4 w-4 ml-2" />
                فتح الرابط
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showProofDialog} onOpenChange={setShowProofDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>مراجعة إثبات الدفع</DialogTitle>
          </DialogHeader>
          {selectedProof && (
            <div className="space-y-4 py-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الحالة</span>
                <StatusBadge status={selectedProof.status} context="proofs" />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المبلغ</span>
                <span className="font-semibold">
                  {selectedProof.amount != null
                    ? formatCurrency(
                        selectedProof.amount,
                        selectedProof.currency || "EGP",
                      )
                    : "-"}
                </span>
              </div>
              {selectedProof.referenceNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المرجع</span>
                  <span className="font-mono">
                    {selectedProof.referenceNumber}
                  </span>
                </div>
              )}
              <div className="pt-4 border-t">
                <Label>صورة الإثبات</Label>
                {selectedProof.imageUrl && !proofImageLoadFailed ? (
                  <img
                    src={selectedProof.imageUrl}
                    alt="صورة إثبات الدفع"
                    className="mt-2 rounded-lg border max-h-64 object-contain w-full"
                    onError={() => setProofImageLoadFailed(true)}
                  />
                ) : (
                  <div className="mt-2 rounded-lg border bg-muted/40 min-h-40 flex items-center justify-center text-sm text-muted-foreground gap-2">
                    <ImageIcon className="h-4 w-4" />
                    {selectedProof.imageUrl
                      ? "تعذر تحميل صورة الإثبات"
                      : "لا توجد صورة مرفقة"}
                  </div>
                )}
              </div>
              {(selectedProof.status === "PENDING" ||
                selectedProof.status === "PENDING_REVIEW") && (
                <div className="flex gap-2 pt-4">
                  <Button
                    className="flex-1"
                    onClick={() => handleVerifyProof(selectedProof.id, true)}
                    disabled={!canApprove}
                  >
                    <CheckCircle className="h-4 w-4 ml-2" />
                    قبول
                  </Button>
                  <Button
                    className="flex-1"
                    variant="destructive"
                    onClick={() => handleVerifyProof(selectedProof.id, false)}
                    disabled={!canApprove}
                  >
                    <XCircle className="h-4 w-4 ml-2" />
                    رفض
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
