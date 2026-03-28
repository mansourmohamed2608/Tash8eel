"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Settings,
  Play,
  Square,
  RefreshCw,
  AlertCircle,
  Loader2,
  TrendingUp,
  ShoppingCart,
  DollarSign,
} from "lucide-react";
import Link from "next/link";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { branchesApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";

// ────────────────────────────────────────────
// Branch Shifts (Cashier Sessions) Page
// ────────────────────────────────────────────

export default function BranchShiftsPage() {
  const params = useParams<{ branchId: string }>();
  const branchId = params.branchId;
  const router = useRouter();
  const { apiKey } = useMerchant();
  const { toast } = useToast();

  const [branch, setBranch] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  // Open shift dialog
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [openingCash, setOpeningCash] = useState("0");
  const [openNotes, setOpenNotes] = useState("");
  const [openingShift, setOpeningShift] = useState(false);

  // Close shift dialog
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closingCash, setClosingCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closingShift, setClosingShift] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const [branchRes, currentRes, shiftsRes] = await Promise.allSettled([
        branchesApi.get(apiKey, branchId),
        branchesApi.getCurrentShift(apiKey, branchId),
        branchesApi.listShifts(apiKey, branchId, { limit: LIMIT, offset }),
      ]);
      if (branchRes.status === "fulfilled") setBranch(branchRes.value as any);
      if (currentRes.status === "fulfilled")
        setCurrentShift((currentRes.value as any).data ?? null);
      if (shiftsRes.status === "fulfilled") {
        setShifts((shiftsRes.value as any).data ?? []);
        setTotal((shiftsRes.value as any).total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [apiKey, branchId, offset]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleOpenShift() {
    if (!apiKey) return;
    setOpeningShift(true);
    try {
      await branchesApi.openShift(apiKey, branchId, {
        openingCash: Number(openingCash) || 0,
        notes: openNotes || undefined,
      });
      toast({ title: "تم فتح الجلسة بنجاح" });
      setShowOpenDialog(false);
      setOpeningCash("0");
      setOpenNotes("");
      await fetchAll();
    } catch (err: any) {
      const msg = err?.message ?? "فشل في فتح الجلسة";
      toast({
        title: msg.includes("already") ? "يوجد جلسة مفتوحة بالفعل" : msg,
        variant: "destructive",
      });
    } finally {
      setOpeningShift(false);
    }
  }

  async function handleCloseShift() {
    if (!apiKey || !currentShift) return;
    setClosingShift(true);
    try {
      await branchesApi.closeShift(apiKey, branchId, currentShift.id, {
        closingCash: closingCash ? Number(closingCash) : undefined,
        closingNotes: closeNotes || undefined,
      });
      toast({ title: "تم إغلاق الجلسة بنجاح" });
      setShowCloseDialog(false);
      setClosingCash("");
      setCloseNotes("");
      await fetchAll();
    } catch {
      toast({ title: "فشل في إغلاق الجلسة", variant: "destructive" });
    } finally {
      setClosingShift(false);
    }
  }

  function cashDiffLabel(diff: number | null) {
    if (diff == null) return "-";
    if (diff > 0)
      return <span className="text-green-600">+{formatCurrency(diff)}</span>;
    if (diff < 0)
      return <span className="text-red-500">{formatCurrency(diff)}</span>;
    return <span className="text-muted-foreground">0</span>;
  }

  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="space-y-6">
      {/* Tab nav */}
      <div className="flex gap-1 border-b pb-0">
        <Link
          href={`/merchant/branches/${branchId}`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <BarChart3 className="h-4 w-4" />
          التحليلات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/settings`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          الإعدادات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/shifts`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary"
        >
          <Clock className="h-4 w-4" />
          الجلسات
        </Link>
      </div>

      <PageHeader
        title={`جلسات الكاشير - ${branch?.name ?? "..."}`}
        description="فتح وإغلاق جلسات الكاشير وتتبع النقد"
        actions={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/merchant/branches")}
            >
              <ArrowLeft className="h-4 w-4 ml-1" />
              الفروع
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAll}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
            {currentShift ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setClosingCash("");
                  setCloseNotes("");
                  setShowCloseDialog(true);
                }}
              >
                <Square className="h-4 w-4 ml-1" />
                إغلاق الجلسة
              </Button>
            ) : (
              <Button size="sm" onClick={() => setShowOpenDialog(true)}>
                <Play className="h-4 w-4 ml-1" />
                فتح جلسة
              </Button>
            )}
          </div>
        }
      />

      {/* Current Open Shift Banner */}
      {currentShift && (
        <Card className="border-green-400 bg-green-50 dark:bg-green-950/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-semibold text-green-700 dark:text-green-400">
                جلسة مفتوحة الآن
              </span>
              <span className="text-sm text-muted-foreground">
                منذ {formatDate(currentShift.opened_at)}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">النقد الافتتاحي</p>
                <p className="font-semibold">
                  {formatCurrency(currentShift.opening_cash ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">الطلبات الجارية</p>
                <p className="font-semibold">
                  {currentShift.running_orders ?? 0}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">الإيراد الجاري</p>
                <p className="font-semibold text-green-600">
                  {formatCurrency(currentShift.running_revenue ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">فُتحت بواسطة</p>
                <p className="font-semibold">
                  {currentShift.opened_by_name ?? "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Past Shifts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل الجلسات</CardTitle>
          <CardDescription>{total} جلسة</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              لا توجد جلسات مسجّلة بعد
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>فُتحت</TableHead>
                  <TableHead>أُغلقت</TableHead>
                  <TableHead>المرفتح</TableHead>
                  <TableHead>الطلبات</TableHead>
                  <TableHead>الإيراد</TableHead>
                  <TableHead>النقد الافتتاحي</TableHead>
                  <TableHead>النقد الختامي</TableHead>
                  <TableHead>الفرق</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">
                      {formatDate(s.opened_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.closed_at ? formatDate(s.closed_at) : "-"}
                    </TableCell>
                    <TableCell>{s.opened_by_name ?? "-"}</TableCell>
                    <TableCell>{s.total_orders ?? 0}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(s.total_revenue ?? 0)}
                    </TableCell>
                    <TableCell>{formatCurrency(s.opening_cash ?? 0)}</TableCell>
                    <TableCell>
                      {s.closing_cash != null
                        ? formatCurrency(s.closing_cash)
                        : "-"}
                    </TableCell>
                    <TableCell>{cashDiffLabel(s.cash_difference)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.status === "OPEN"
                            ? "default"
                            : s.status === "CLOSED"
                              ? "secondary"
                              : "outline"
                        }
                        className={cn(
                          "text-xs",
                          s.status === "OPEN" && "bg-green-500 text-white",
                        )}
                      >
                        {s.status === "OPEN"
                          ? "مفتوحة"
                          : s.status === "CLOSED"
                            ? "مغلقة"
                            : "ملغاة"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-muted-foreground">
              صفحة {currentPage} من {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
              >
                السابق
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setOffset(offset + LIMIT)}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Open Shift Dialog ── */}
      <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>فتح جلسة كاشير جديدة</DialogTitle>
            <DialogDescription>
              أدخل مبلغ النقد الافتتاحي في الصندوق
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>النقد الافتتاحي</Label>
              <Input
                type="number"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات (اختياري)</Label>
              <Input
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="ملاحظات..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOpenDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleOpenShift} disabled={openingShift}>
              {openingShift ? (
                <Loader2 className="h-4 w-4 animate-spin ml-1" />
              ) : (
                <Play className="h-4 w-4 ml-1" />
              )}
              فتح الجلسة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Close Shift Dialog ── */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إغلاق الجلسة الحالية</DialogTitle>
            <DialogDescription>
              أدخل مبلغ النقد في الصندوق عند الإغلاق ليُحسب الفرق تلقائياً
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {currentShift && (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الطلبات</span>
                  <span className="font-medium">
                    {currentShift.running_orders ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الإيراد الكلي</span>
                  <span className="font-medium">
                    {formatCurrency(currentShift.running_revenue ?? 0)}
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>النقد الختامي في الصندوق</Label>
              <Input
                type="number"
                min="0"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                placeholder="أدخل المبلغ..."
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات الإغلاق (اختياري)</Label>
              <Input
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="ملاحظات..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleCloseShift}
              disabled={closingShift}
            >
              {closingShift ? (
                <Loader2 className="h-4 w-4 animate-spin ml-1" />
              ) : (
                <Square className="h-4 w-4 ml-1" />
              )}
              إغلاق الجلسة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
