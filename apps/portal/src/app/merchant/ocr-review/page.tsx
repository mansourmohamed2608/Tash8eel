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
import { TableSkeleton } from "@/components/ui/skeleton";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ScanLine,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Image,
  Package,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import portalApi from "@/lib/client";

interface OcrConfirmation {
  id: string;
  productName: string;
  detectedName: string;
  detectedPrice: number | null;
  detectedQuantity: number | null;
  imageUrl?: string;
  status: "pending" | "approved" | "rejected";
  confidence: number;
  createdAt: string;
  reviewedAt?: string;
}

export default function OcrReviewPage() {
  const [confirmations, setConfirmations] = useState<OcrConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("pending");
  const [selected, setSelected] = useState<OcrConfirmation | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchConfirmations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await portalApi.getOcrConfirmations(
        filter !== "all" ? filter : undefined,
      );
      setConfirmations(data.confirmations || []);
    } catch (err) {
      console.error("Failed to fetch OCR confirmations:", err);
      setError("تعذر تحميل مراجعات التعرف الضوئي");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchConfirmations();
  }, [fetchConfirmations]);

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setActionLoading(true);
    try {
      await portalApi.reviewOcrConfirmation(id, action);
      // Optimistic update
      setConfirmations((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status: action === "approve" ? "approved" : "rejected",
                reviewedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
      setSelected(null);
    } catch {
      // Revert on error
      fetchConfirmations();
    } finally {
      setActionLoading(false);
    }
  };

  const pending = confirmations.filter((c) => c.status === "pending");
  const approved = confirmations.filter((c) => c.status === "approved");
  const rejected = confirmations.filter((c) => c.status === "rejected");

  const displayItems =
    filter === "pending"
      ? pending
      : filter === "approved"
        ? approved
        : filter === "rejected"
          ? rejected
          : confirmations;

  const confidenceBadge = (confidence: number) => {
    if (confidence >= 0.9)
      return (
        <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
          عالية {Math.round(confidence * 100)}%
        </Badge>
      );
    if (confidence >= 0.7)
      return (
        <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
          متوسطة {Math.round(confidence * 100)}%
        </Badge>
      );
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
        منخفضة {Math.round(confidence * 100)}%
      </Badge>
    );
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="h-3 w-3 ml-1" />
            تمت الموافقة
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 ml-1" />
            مرفوض
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 ml-1" />
            بانتظار المراجعة
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="مراجعة التعرف الضوئي"
        description="مراجعة واعتماد المنتجات المكتشفة تلقائياً من صور الإيصالات والفواتير"
        actions={
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={fetchConfirmations}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 ml-2 ${loading ? "animate-spin" : ""}`}
            />
            تحديث
          </Button>
        }
      />
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-sm text-muted-foreground">
                  بانتظار المراجعة
                </p>
                <p className="text-2xl font-bold">{pending.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">تمت الموافقة</p>
                <p className="text-2xl font-bold">{approved.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">مرفوض</p>
                <p className="text-2xl font-bold">{rejected.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ScanLine className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">إجمالي المسح</p>
                <p className="text-2xl font-bold">{confirmations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-700 dark:text-yellow-300">
          {error} - يتم عرض بيانات تجريبية
        </div>
      )}

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <TabsTrigger value="pending" className="w-full">
            بانتظار المراجعة
            {pending.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="w-full">
            تمت الموافقة
          </TabsTrigger>
          <TabsTrigger value="rejected" className="w-full">
            مرفوض
          </TabsTrigger>
          <TabsTrigger value="all" className="shrink-0">
            الكل
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter} className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-3 md:hidden">
                  {displayItems.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      <ScanLine className="mx-auto mb-2 h-12 w-12 opacity-30" />
                      لا توجد عناصر للمراجعة
                    </div>
                  ) : (
                    displayItems.map((item) => (
                      <div
                        key={item.id}
                        className="space-y-3 rounded-lg border p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{item.detectedName}</p>
                            <p className="text-xs text-muted-foreground">
                              المنتج الأصلي: {item.productName || "-"}
                            </p>
                          </div>
                          {statusBadge(item.status)}
                        </div>
                        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              السعر
                            </p>
                            <p className="font-medium">
                              {item.detectedPrice != null
                                ? `${item.detectedPrice} ج.م`
                                : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              الكمية
                            </p>
                            <p className="font-medium">
                              {item.detectedQuantity ?? "-"}
                            </p>
                          </div>
                          <div className="sm:col-span-2">
                            <p className="text-xs text-muted-foreground">
                              الثقة
                            </p>
                            <div className="mt-1">
                              {confidenceBadge(item.confidence)}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => setSelected(item)}
                          >
                            <Eye className="ml-1 h-4 w-4" />
                            مراجعة
                          </Button>
                          {item.status === "pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-green-600 sm:w-auto"
                                onClick={() => handleAction(item.id, "approve")}
                                disabled={actionLoading}
                              >
                                <CheckCircle2 className="ml-1 h-4 w-4" />
                                موافقة
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-red-600 sm:w-auto"
                                onClick={() => handleAction(item.id, "reject")}
                                disabled={actionLoading}
                              >
                                <XCircle className="ml-1 h-4 w-4" />
                                رفض
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">
                          المنتج المكتشف
                        </TableHead>
                        <TableHead className="text-right">
                          المنتج الأصلي
                        </TableHead>
                        <TableHead className="text-center">السعر</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">الثقة</TableHead>
                        <TableHead className="text-center">الحالة</TableHead>
                        <TableHead className="text-center">إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayItems.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center text-muted-foreground py-8"
                          >
                            <ScanLine className="h-12 w-12 mx-auto mb-2 opacity-30" />
                            لا توجد عناصر للمراجعة
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.detectedName}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.productName || "-"}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.detectedPrice != null
                                ? `${item.detectedPrice} ج.م`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.detectedQuantity ?? "-"}
                            </TableCell>
                            <TableCell className="text-center">
                              {confidenceBadge(item.confidence)}
                            </TableCell>
                            <TableCell className="text-center">
                              {statusBadge(item.status)}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelected(item)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {item.status === "pending" && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-green-600"
                                      onClick={() =>
                                        handleAction(item.id, "approve")
                                      }
                                      disabled={actionLoading}
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-600"
                                      onClick={() =>
                                        handleAction(item.id, "reject")
                                      }
                                      disabled={actionLoading}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-blue-500" />
              تفاصيل التعرف الضوئي
            </DialogTitle>
            <DialogDescription>مراجعة بيانات المنتج المكتشف</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {selected.imageUrl && (
                <div className="bg-muted rounded-lg p-4 flex items-center justify-center">
                  <Image className="h-24 w-24 text-muted-foreground/30" />
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">الاسم المكتشف</p>
                  <p className="font-medium">{selected.detectedName}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">المنتج الأصلي</p>
                  <p className="font-medium">
                    {selected.productName || "غير محدد"}
                  </p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">السعر المكتشف</p>
                  <p className="font-medium">
                    {selected.detectedPrice != null
                      ? `${selected.detectedPrice} ج.م`
                      : "غير محدد"}
                  </p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">الكمية</p>
                  <p className="font-medium">
                    {selected.detectedQuantity ?? "غير محدد"}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  تاريخ المسح:{" "}
                  {new Date(selected.createdAt).toLocaleString("ar-EG")}
                </p>
                {confidenceBadge(selected.confidence)}
              </div>
            </div>
          )}
          {selected?.status === "pending" && (
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="w-full text-red-600 sm:w-auto"
                onClick={() => handleAction(selected.id, "reject")}
                disabled={actionLoading}
              >
                <XCircle className="h-4 w-4 ml-2" />
                رفض
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => handleAction(selected.id, "approve")}
                disabled={actionLoading}
              >
                <CheckCircle2 className="h-4 w-4 ml-2" />
                موافقة
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
