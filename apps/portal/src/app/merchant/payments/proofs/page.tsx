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
import {
  AiInsightsCard,
  generatePaymentsInsights,
} from "@/components/ai/ai-insights-card";

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
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
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
          <Badge className="bg-amber-100 text-amber-800">
            <Clock className="h-3 w-3 ml-1" /> في الانتظار
          </Badge>
        );
      case "APPROVED":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 ml-1" /> معتمد
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge className="bg-red-100 text-red-800">
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
      return <Badge className="bg-green-100 text-green-800">{pct}%</Badge>;
    } else if (pct >= 60) {
      return <Badge className="bg-amber-100 text-amber-800">{pct}%</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">{pct}%</Badge>;
    }
  };

  const getRiskBadge = (level?: string, score?: number) => {
    const label = `${level || "LOW"} (${Number(score || 0)})`;
    if (level === "HIGH") {
      return <Badge className="bg-red-100 text-red-800">{label}</Badge>;
    }
    if (level === "MEDIUM") {
      return <Badge className="bg-amber-100 text-amber-800">{label}</Badge>;
    }
    return <Badge className="bg-emerald-100 text-emerald-800">{label}</Badge>;
  };

  const pendingCount = summary.pending;
  const approvedCount = summary.approved;
  const rejectedCount = summary.rejected;
  const summaryTotal = summary.total;
  const proofImageUrl = resolveProofImageUrl(selectedProof?.imageUrl);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="إثباتات الدفع"
        description="مراجعة واعتماد إثباتات الدفع من العملاء"
        actions={
          <Button onClick={fetchProofs} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 ml-2" />
            تحديث
          </Button>
        }
      />

      {/* AI Payment Proofs Insights */}
      <AiInsightsCard
        title="مساعد إثباتات الدفع"
        insights={generatePaymentsInsights({
          totalLinks: 0,
          pendingProofs: pendingCount,
          totalProofs: summaryTotal,
        })}
        loading={loading}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">في الانتظار</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{approvedCount}</p>
                <p className="text-sm text-muted-foreground">معتمد</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rejectedCount}</p>
                <p className="text-sm text-muted-foreground">مرفوض</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Receipt className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summaryTotal}</p>
                <p className="text-sm text-muted-foreground">إجمالي</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="كل الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">كل الحالات</SelectItem>
                  <SelectItem value="PENDING">في الانتظار</SelectItem>
                  <SelectItem value="APPROVED">معتمد</SelectItem>
                  <SelectItem value="REJECTED">مرفوض</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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
        <Card>
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
                header: "Risk",
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
        <DialogContent className="max-w-2xl">
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

              <div className="grid gap-4 md:grid-cols-2">
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
                  <Label>Risk score</Label>
                  <div>
                    {getRiskBadge(
                      selectedProof.riskLevel,
                      selectedProof.riskScore,
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Duplicate image</Label>
                  <p>
                    {selectedProof.duplicateOfProofId
                      ? `Yes (distance ${selectedProof.duplicateDistance ?? "-"})`
                      : "No"}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImageDialog(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verify Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>مراجعة إثبات الدفع</DialogTitle>
            <DialogDescription>
              قم بمراجعة البيانات واتخاذ القرار
            </DialogDescription>
          </DialogHeader>
          {selectedProof && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
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
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={() => handleVerify(false)}
              disabled={verifying}
            >
              <X className="h-4 w-4 ml-2" />
              رفض
            </Button>
            <Button
              variant="default"
              onClick={() => handleVerify(true)}
              disabled={verifying}
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
