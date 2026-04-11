"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, Pagination } from "@/components/ui/data-table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, AlertBanner } from "@/components/ui/alerts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Receipt,
  Check,
  X,
  Clock,
  Eye,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";

interface PaymentProof {
  id: string;
  paymentLinkId?: string;
  orderId?: string;
  orderNumber?: string;
  proofType: string;
  imageUrl?: string;
  referenceNumber?: string;
  extractedAmount: number | null;
  extractedReference?: string;
  extractedSender?: string;
  extractedDate?: string;
  ocrConfidence: number | null;
  riskScore?: number;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  riskFlags?: string[];
  manualReviewRequired?: boolean;
  duplicateOfProofId?: string;
  duplicateDistance?: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  verifiedAt?: string;
  verifiedBy?: string;
  rejectionReason?: string;
  autoVerified: boolean;
  linkAmount: number | null;
  linkCode?: string;
  createdAt: string;
  order?: {
    orderNumber: string;
    totalAmount: number;
    customerName: string;
    customerPhone: string;
  };
  paymentLink?: {
    linkCode: string;
    amount: number;
    currency: string;
    customerName?: string;
  };
  verificationHints?: string[];
}

interface ProofSummary {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

function resolveProofImageUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  if (/^https?:\/\//i.test(rawUrl) || rawUrl.startsWith("data:")) return rawUrl;
  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
  ).trim();
  if (rawUrl.startsWith("/")) return `${apiBase}${rawUrl}`;
  return `${apiBase}/${rawUrl}`;
}

export default function PaymentProofsPage() {
  const { apiKey } = useMerchant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [summary, setSummary] = useState<ProofSummary>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedProof, setSelectedProof] = useState<PaymentProof | null>(null);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const limit = 10;

  const fetchProofs = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const response = await merchantApi.getPaymentProofs(apiKey, {
        status: statusFilter === "ALL" ? undefined : statusFilter || undefined,
        limit,
        offset: (page - 1) * limit,
      });
      setProofs(response.proofs);
      setTotal(response.total);
      setSummary({
        total: Number(response.summary?.total || 0),
        pending: Number(response.summary?.pending || 0),
        approved: Number(response.summary?.approved || 0),
        rejected: Number(response.summary?.rejected || 0),
      });
    } catch (err) {
      console.error("Failed to fetch proofs:", err);
      toast({
        title: "خطأ",
        description: "فشل في تحميل إثباتات الدفع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [apiKey, page, statusFilter, toast]);

  useEffect(() => {
    fetchProofs();
  }, [fetchProofs]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [selectedProof?.id, showImageDialog]);

  const handleVerify = async (approved: boolean) => {
    if (!selectedProof || !apiKey) return;
    setVerifying(true);
    try {
      await merchantApi.verifyPaymentProof(
        apiKey,
        selectedProof.id,
        approved,
        approved ? undefined : rejectionReason,
      );
      toast({
        title: approved ? "تمت الموافقة" : "تم الرفض",
        description: approved ? "تم اعتماد إثبات الدفع" : "تم رفض إثبات الدفع",
      });
      setShowVerifyDialog(false);
      setRejectionReason("");
      fetchProofs();
    } catch (err) {
      console.error("Failed to verify proof:", err);
      toast({
        title: "خطأ",
        description: "فشل في معالجة الطلب",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <Badge className="border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]">
            <Clock className="h-3 w-3 ml-1" /> في الانتظار
          </Badge>
        );
      case "APPROVED":
        return (
          <Badge className="border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]">
            <CheckCircle className="h-3 w-3 ml-1" /> معتمد
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge className="border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]">
            <XCircle className="h-3 w-3 ml-1" /> مرفوض
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getConfidenceBadge = (confidence: number | null) => {
    if (!confidence) return null;
    const pct = Math.round(confidence * 100);
    if (pct >= 85) {
      return (
        <Badge className="border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]">
          {pct}%
        </Badge>
      );
    } else if (pct >= 60) {
      return (
        <Badge className="border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]">
          {pct}%
        </Badge>
      );
    } else {
      return (
        <Badge className="border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]">
          {pct}%
        </Badge>
      );
    }
  };

  const getRiskBadge = (level?: string, score?: number) => {
    const label = `${level || "LOW"} (${Number(score || 0)})`;
    if (level === "HIGH") {
      return (
        <Badge className="border-[color:rgba(239,68,68,0.3)] bg-[color:rgba(239,68,68,0.1)] text-[color:#fca5a5]">
          {label}
        </Badge>
      );
    }
    if (level === "MEDIUM") {
      return (
        <Badge className="border-[color:rgba(245,158,11,0.28)] bg-[color:rgba(245,158,11,0.12)] text-[color:#fcd34d]">
          {label}
        </Badge>
      );
    }
    return (
      <Badge className="border-[color:rgba(34,197,94,0.28)] bg-[color:rgba(34,197,94,0.1)] text-[color:#86efac]">
        {label}
      </Badge>
    );
  };

  const pendingCount = summary.pending;
  const approvedCount = summary.approved;
  const rejectedCount = summary.rejected;
  const summaryTotal = summary.total;
  const proofImageUrl = resolveProofImageUrl(selectedProof?.imageUrl);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="إثباتات الدفع"
        description="مراجعة واعتماد إثباتات الدفع من العملاء"
        actions={
          <div className="flex w-full sm:w-auto">
            <Button
              onClick={fetchProofs}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              <RefreshCw className="ml-2 h-4 w-4" />
              تحديث
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        {[
          { id: "ALL", label: "الكل", count: summaryTotal },
          { id: "PENDING", label: "في الانتظار", count: pendingCount },
          { id: "APPROVED", label: "معتمد", count: approvedCount },
          { id: "REJECTED", label: "مرفوض", count: rejectedCount },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStatusFilter(item.id)}
            className={
              statusFilter === item.id
                ? "inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--accent-gold)] bg-[var(--accent-gold)] px-3 text-xs font-semibold text-[#0A0A0B]"
                : "inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-1)] px-3 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)]"
            }
          >
            <span>{item.label}</span>
            <span className="font-mono">{item.count}</span>
          </button>
        ))}
      </div>

      {/* Proofs List */}
      {loading ? (
        <TableSkeleton rows={5} columns={7} />
      ) : proofs.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-12 w-12" />}
          title="لا توجد إثباتات دفع"
          description="لم يتم إرسال أي إثباتات دفع بعد"
        />
      ) : (
        <Card className="app-data-card">
          <div className="md:hidden divide-y">
            {proofs.map((proof) => (
              <div key={proof.id} className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {proof.orderNumber || proof.linkCode || "إثبات دفع"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(proof.createdAt, "short")}
                    </p>
                  </div>
                  {getStatusBadge(proof.status)}
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">المبلغ</p>
                    <p className="font-medium">
                      {proof.extractedAmount !== null &&
                      proof.extractedAmount !== undefined
                        ? formatCurrency(proof.extractedAmount, "EGP")
                        : "غير متاح"}
                    </p>
                    {proof.linkAmount !== null &&
                      proof.linkAmount !== undefined &&
                      proof.extractedAmount !== proof.linkAmount && (
                        <p className="text-xs text-muted-foreground">
                          المتوقع: {formatCurrency(proof.linkAmount, "EGP")}
                        </p>
                      )}
                  </div>
                  <div>
                    <p className="text-muted-foreground">ثقة OCR</p>
                    <div className="mt-1">
                      {getConfidenceBadge(proof.ocrConfidence) || "غير متاح"}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">مستوى المخاطر</p>
                    <div className="mt-1">
                      {getRiskBadge(proof.riskLevel, proof.riskScore)}
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">المرجع</p>
                    <p className="font-mono text-xs">
                      {proof.extractedReference ||
                        proof.referenceNumber ||
                        "غير متاح"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setSelectedProof(proof);
                      setShowImageDialog(true);
                    }}
                  >
                    <Eye className="ml-2 h-4 w-4" />
                    عرض
                  </Button>
                  {proof.status === "PENDING" && (
                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setSelectedProof(proof);
                        setShowVerifyDialog(true);
                      }}
                    >
                      مراجعة
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
            <DataTable
              data={proofs}
              columns={[
                {
                  key: "createdAt",
                  header: "التاريخ",
                  render: (proof) => formatDate(proof.createdAt, "short"),
                },
                {
                  key: "orderNumber",
                  header: "الطلب",
                  render: (proof) => proof.orderNumber || proof.linkCode || "-",
                },
                {
                  key: "amount",
                  header: "المبلغ",
                  render: (proof) => (
                    <div className="text-right">
                      {proof.extractedAmount !== null &&
                        proof.extractedAmount !== undefined && (
                          <div>
                            {formatCurrency(proof.extractedAmount, "EGP")}
                          </div>
                        )}
                      {proof.linkAmount !== null &&
                        proof.linkAmount !== undefined &&
                        proof.extractedAmount !== proof.linkAmount && (
                          <div className="text-xs text-muted-foreground">
                            المتوقع: {formatCurrency(proof.linkAmount, "EGP")}
                          </div>
                        )}
                    </div>
                  ),
                },
                {
                  key: "ocrConfidence",
                  header: "ثقة OCR",
                  render: (proof) => getConfidenceBadge(proof.ocrConfidence),
                },
                {
                  key: "risk",
                  header: "مستوى المخاطر",
                  render: (proof) =>
                    getRiskBadge(proof.riskLevel, proof.riskScore),
                },
                {
                  key: "status",
                  header: "الحالة",
                  render: (proof) => getStatusBadge(proof.status),
                },
                {
                  key: "actions",
                  header: "الإجراءات",
                  render: (proof) => (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedProof(proof);
                          setShowImageDialog(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {proof.status === "PENDING" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedProof(proof);
                            setShowVerifyDialog(true);
                          }}
                        >
                          مراجعة
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
          <div className="p-4 border-t">
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(total / limit)}
              onPageChange={setPage}
            />
          </div>
        </Card>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>عرض إثبات الدفع</DialogTitle>
          </DialogHeader>
          {selectedProof && (
            <div className="space-y-4">
              {proofImageUrl && !imageLoadFailed ? (
                <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                  <img
                    src={proofImageUrl}
                    alt="إثبات الدفع"
                    className="object-contain w-full h-full"
                    onError={() => setImageLoadFailed(true)}
                  />
                </div>
              ) : (
                <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center gap-2">
                  <ImageIcon className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {proofImageUrl
                      ? "تعذر عرض صورة إثبات الدفع"
                      : "لا توجد صورة مرفقة بهذا الإثبات"}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>المبلغ المستخرج</Label>
                  <p className="font-semibold">
                    {selectedProof.extractedAmount !== null &&
                    selectedProof.extractedAmount !== undefined
                      ? formatCurrency(selectedProof.extractedAmount, "EGP")
                      : "غير متاح"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>رقم المرجع</Label>
                  <p className="font-mono text-sm">
                    {selectedProof.extractedReference ||
                      selectedProof.referenceNumber ||
                      "غير متاح"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>المرسل</Label>
                  <p>{selectedProof.extractedSender || "غير متاح"}</p>
                </div>
                <div className="space-y-2">
                  <Label>ثقة OCR</Label>
                  <p>
                    {selectedProof.ocrConfidence !== null &&
                    selectedProof.ocrConfidence !== undefined
                      ? `${Math.round(selectedProof.ocrConfidence * 100)}%`
                      : "غير متاح"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>درجة المخاطر</Label>
                  <div>
                    {getRiskBadge(
                      selectedProof.riskLevel,
                      selectedProof.riskScore,
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>صورة مكررة</Label>
                  <p>
                    {selectedProof.duplicateOfProofId
                      ? `نعم (المسافة ${selectedProof.duplicateDistance ?? "-"})`
                      : "لا"}
                  </p>
                </div>
              </div>

              {selectedProof.riskFlags &&
                selectedProof.riskFlags.length > 0 && (
                  <div className="rounded-lg border p-3">
                    <Label className="mb-2 block">Risk flags</Label>
                    <div className="flex flex-wrap gap-2">
                      {selectedProof.riskFlags.map((flag) => (
                        <Badge key={flag} variant="outline">
                          {flag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

              {selectedProof.verificationHints &&
                selectedProof.verificationHints.length > 0 && (
                  <div className="p-3 bg-muted rounded-lg">
                    <Label className="mb-2 block">ملاحظات التحقق</Label>
                    <ul className="space-y-1 text-sm">
                      {selectedProof.verificationHints.map((hint, idx) => (
                        <li key={idx}>{hint}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowImageDialog(false)}
              className="w-full sm:w-auto"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>مراجعة إثبات الدفع</DialogTitle>
            <DialogDescription>
              قم بمراجعة البيانات واتخاذ القرار
            </DialogDescription>
          </DialogHeader>
          {selectedProof && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>المبلغ المستخرج</Label>
                  <p className="text-lg font-semibold">
                    {selectedProof.extractedAmount !== null &&
                    selectedProof.extractedAmount !== undefined
                      ? formatCurrency(selectedProof.extractedAmount, "EGP")
                      : "غير متاح"}
                  </p>
                </div>
                {selectedProof.linkAmount !== null &&
                  selectedProof.linkAmount !== undefined && (
                    <div>
                      <Label>المبلغ المطلوب</Label>
                      <p className="text-lg font-semibold">
                        {formatCurrency(selectedProof.linkAmount, "EGP")}
                      </p>
                    </div>
                  )}
              </div>

              {selectedProof.extractedAmount !== null &&
                selectedProof.extractedAmount !== undefined &&
                selectedProof.linkAmount !== null &&
                selectedProof.linkAmount !== undefined && (
                  <AlertBanner
                    type={
                      Math.abs(
                        selectedProof.extractedAmount -
                          selectedProof.linkAmount,
                      ) < 1
                        ? "success"
                        : "warning"
                    }
                    message={
                      Math.abs(
                        selectedProof.extractedAmount -
                          selectedProof.linkAmount,
                      ) < 1
                        ? "المبلغ مطابق"
                        : "المبلغ مختلف"
                    }
                  />
                )}

              <div className="space-y-2">
                <Label htmlFor="rejection">سبب الرفض (اختياري)</Label>
                <Textarea
                  id="rejection"
                  placeholder="اكتب سبب الرفض إذا كنت ستقوم بالرفض..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="destructive"
              onClick={() => handleVerify(false)}
              disabled={verifying}
              className="w-full sm:w-auto"
            >
              <X className="h-4 w-4 ml-2" />
              رفض
            </Button>
            <Button
              variant="default"
              onClick={() => handleVerify(true)}
              disabled={verifying}
              className="w-full sm:w-auto"
            >
              <Check className="h-4 w-4 ml-2" />
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
