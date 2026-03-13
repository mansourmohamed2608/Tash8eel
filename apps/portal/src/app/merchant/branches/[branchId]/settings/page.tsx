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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Settings,
  UserPlus,
  UserMinus,
  Plus,
  Trash2,
  Pencil,
  Phone,
  Target,
  Loader2,
  RefreshCw,
  Package,
  Bell,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { branchesApi } from "@/lib/api";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";

// ────────────────────────────────────────────
// Branch settings: Staff, WhatsApp #, Goals
// ────────────────────────────────────────────

export default function BranchSettingsPage() {
  const params = useParams<{ branchId: string }>();
  const branchId = params.branchId;
  const router = useRouter();
  const { apiKey } = useMerchant();
  const { toast } = useToast();

  const [branch, setBranch] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // WA edit
  const [editingWA, setEditingWA] = useState(false);
  const [waNumber, setWaNumber] = useState("");
  const [savingWA, setSavingWA] = useState(false);

  // Staff assign dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [assigningStaff, setAssigningStaff] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);

  // Goal dialog
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [editGoal, setEditGoal] = useState<any>(null);
  const [goalForm, setGoalForm] = useState({
    periodType: "MONTHLY",
    targetRevenue: "",
    targetOrders: "",
    startDate: "",
    endDate: "",
    notes: "",
  });
  const [savingGoal, setSavingGoal] = useState(false);
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const [branchRes, staffRes, availRes, goalsRes] = await Promise.allSettled([
        branchesApi.get(apiKey, branchId),
        branchesApi.listStaff(apiKey, branchId),
        branchesApi.availableStaff(apiKey, branchId),
        branchesApi.listGoals(apiKey, branchId, false),
      ]);
      if (branchRes.status === "fulfilled") {
        const b = branchRes.value as any;
        setBranch(b);
        setWaNumber(b.whatsapp_number ?? "");
      }
      if (staffRes.status === "fulfilled") setStaff((staffRes.value as any).data ?? []);
      if (availRes.status === "fulfilled") setAvailable((availRes.value as any).data ?? []);
      if (goalsRes.status === "fulfilled") setGoals((goalsRes.value as any).data ?? []);
    } finally {
      setLoading(false);
    }
  }, [apiKey, branchId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Save WA number ──
  async function saveWANumber() {
    if (!apiKey) return;
    setSavingWA(true);
    try {
      await branchesApi.update(apiKey, branchId, { whatsapp_number: waNumber } as any);
      setEditingWA(false);
      toast({ title: "تم حفظ رقم واتساب الفرع" });
      setBranch((prev: any) => ({ ...prev, whatsapp_number: waNumber }));
    } catch {
      toast({ title: "فشل في الحفظ", variant: "destructive" });
    } finally {
      setSavingWA(false);
    }
  }

  // ── Assign staff ──
  async function handleAssignStaff() {
    if (!apiKey || !selectedStaffId) return;
    setAssigningStaff(true);
    try {
      await branchesApi.assignStaff(apiKey, branchId, { staffId: selectedStaffId });
      toast({ title: "تم إضافة الموظف للفرع" });
      setShowAssignDialog(false);
      setSelectedStaffId("");
      await fetchAll();
    } catch {
      toast({ title: "فشل في إضافة الموظف", variant: "destructive" });
    } finally {
      setAssigningStaff(false);
    }
  }

  // ── Remove staff ──
  async function handleRemoveStaff(assignmentId: string) {
    if (!apiKey) return;
    try {
      await branchesApi.removeStaff(apiKey, branchId, assignmentId);
      toast({ title: "تم إزالة الموظف من الفرع" });
      setRemoveConfirm(null);
      await fetchAll();
    } catch {
      toast({ title: "فشل في الإزالة", variant: "destructive" });
    }
  }

  // ── Save goal ──
  async function handleSaveGoal() {
    if (!apiKey) return;
    if (!goalForm.startDate || !goalForm.endDate) {
      toast({ title: "يجب تحديد تاريخ البداية والنهاية", variant: "destructive" });
      return;
    }
    setSavingGoal(true);
    try {
      if (editGoal) {
        await branchesApi.updateGoal(apiKey, branchId, editGoal.id, {
          targetRevenue: goalForm.targetRevenue ? Number(goalForm.targetRevenue) : undefined,
          targetOrders: goalForm.targetOrders ? Number(goalForm.targetOrders) : undefined,
          notes: goalForm.notes || undefined,
        });
        toast({ title: "تم تحديث الهدف" });
      } else {
        await branchesApi.createGoal(apiKey, branchId, {
          periodType: goalForm.periodType,
          targetRevenue: goalForm.targetRevenue ? Number(goalForm.targetRevenue) : undefined,
          targetOrders: goalForm.targetOrders ? Number(goalForm.targetOrders) : undefined,
          startDate: goalForm.startDate,
          endDate: goalForm.endDate,
          notes: goalForm.notes || undefined,
        });
        toast({ title: "تم إنشاء الهدف" });
      }
      setShowGoalDialog(false);
      setEditGoal(null);
      await fetchAll();
    } catch {
      toast({ title: "فشل في حفظ الهدف", variant: "destructive" });
    } finally {
      setSavingGoal(false);
    }
  }

  async function handleDeleteGoal(goalId: string) {
    if (!apiKey) return;
    try {
      await branchesApi.deleteGoal(apiKey, branchId, goalId);
      toast({ title: "تم حذف الهدف" });
      setDeleteGoalId(null);
      await fetchAll();
    } catch {
      toast({ title: "فشل في الحذف", variant: "destructive" });
    }
  }

  function openEditGoal(goal: any) {
    setEditGoal(goal);
    setGoalForm({
      periodType: goal.period_type,
      targetRevenue: goal.target_revenue ?? "",
      targetOrders: goal.target_orders ?? "",
      startDate: goal.start_date,
      endDate: goal.end_date,
      notes: goal.notes ?? "",
    });
    setShowGoalDialog(true);
  }

  function openNewGoal() {
    setEditGoal(null);
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);
    setGoalForm({
      periodType: "MONTHLY",
      targetRevenue: "",
      targetOrders: "",
      startDate: firstDay,
      endDate: lastDay,
      notes: "",
    });
    setShowGoalDialog(true);
  }

  const PERIOD_LABELS: Record<string, string> = {
    WEEKLY: "أسبوعي",
    MONTHLY: "شهري",
    QUARTERLY: "ربعي",
    YEARLY: "سنوي",
  };

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
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary"
        >
          <Settings className="h-4 w-4" />
          الإعدادات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/shifts`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Clock className="h-4 w-4" />
          الجلسات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/inventory`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Package className="h-4 w-4" />
          المخزون
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/alerts`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          التنبيهات
        </Link>
        <Link
          href={`/merchant/branches/${branchId}/pl-report`}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground"
        >
          <FileText className="h-4 w-4" />
          تقرير الأرباح
        </Link>
      </div>

      <PageHeader
        title={`إعدادات الفرع — ${branch?.name ?? "..."}`}
        description="إدارة الموظفين والتواصل والأهداف"
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/merchant/branches")}>
              <ArrowLeft className="h-4 w-4 ml-1" />
              الفروع
            </Button>
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      {/* WhatsApp number */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-green-500" />
            رقم واتساب الفرع
          </CardTitle>
          <CardDescription>رقم واتساب مخصص لهذا الفرع</CardDescription>
        </CardHeader>
        <CardContent>
          {editingWA ? (
            <div className="flex items-center gap-2 max-w-sm">
              <Input
                value={waNumber}
                onChange={(e) => setWaNumber(e.target.value)}
                placeholder="+966XXXXXXXXX"
                dir="ltr"
              />
              <Button size="sm" onClick={saveWANumber} disabled={savingWA}>
                {savingWA ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingWA(false)}>
                إلغاء
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm" dir="ltr">
                {branch?.whatsapp_number || (
                  <span className="text-muted-foreground">لم يُحدد بعد</span>
                )}
              </span>
              <Button size="sm" variant="outline" onClick={() => setEditingWA(true)}>
                <Pencil className="h-3 w-3 ml-1" />
                تعديل
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Staff assignments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                موظفو الفرع
              </CardTitle>
              <CardDescription>
                الموظفون المعيّنون للعمل في هذا الفرع
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowAssignDialog(true)} disabled={available.length === 0}>
              <UserPlus className="h-4 w-4 ml-1" />
              إضافة موظف
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              لا يوجد موظفون مُعيّنون لهذا الفرع بعد
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.name}
                      {s.is_primary && (
                        <Badge className="mr-1 text-xs" variant="secondary">
                          رئيسي
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground" dir="ltr">
                      {s.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.status === "ACTIVE" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {s.status === "ACTIVE" ? "نشط" : s.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => setRemoveConfirm(s.id)}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Goals */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                أهداف الفرع
              </CardTitle>
              <CardDescription>المستهدفات الشهرية أو الدورية للفرع</CardDescription>
            </div>
            <Button size="sm" onClick={openNewGoal}>
              <Plus className="h-4 w-4 ml-1" />
              هدف جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              لا توجد أهداف محددة لهذا الفرع بعد
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفترة</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>هدف الإيراد</TableHead>
                  <TableHead>هدف الطلبات</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {PERIOD_LABELS[g.period_type] ?? g.period_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {g.start_date} → {g.end_date}
                    </TableCell>
                    <TableCell>
                      {g.target_revenue != null
                        ? formatCurrency(g.target_revenue)
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {g.target_orders != null
                        ? `${g.target_orders} طلب`
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditGoal(g)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => setDeleteGoalId(g.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Assign Staff Dialog ── */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة موظف للفرع</DialogTitle>
            <DialogDescription>اختر موظفاً من قائمة الموظفين المتاحين</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>اختر موظفاً</Label>
            <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر..." />
              </SelectTrigger>
              <SelectContent>
                {available.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {s.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAssignStaff} disabled={!selectedStaffId || assigningStaff}>
              {assigningStaff ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              إضافة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove Staff Confirm ── */}
      <AlertDialog open={!!removeConfirm} onOpenChange={() => setRemoveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إزالة الموظف من الفرع؟</AlertDialogTitle>
            <AlertDialogDescription>
              لن يتأثر حساب الموظف، فقط سيُزال تعيينه من هذا الفرع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => removeConfirm && handleRemoveStaff(removeConfirm)}
            >
              إزالة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Goal Dialog ── */}
      <Dialog open={showGoalDialog} onOpenChange={setShowGoalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editGoal ? "تعديل الهدف" : "هدف جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>نوع الفترة</Label>
                <Select
                  value={goalForm.periodType}
                  onValueChange={(v) => setGoalForm((f) => ({ ...f, periodType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">أسبوعي</SelectItem>
                    <SelectItem value="MONTHLY">شهري</SelectItem>
                    <SelectItem value="QUARTERLY">ربعي</SelectItem>
                    <SelectItem value="YEARLY">سنوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>هدف الإيراد</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="مثال: 50000"
                  value={goalForm.targetRevenue}
                  onChange={(e) => setGoalForm((f) => ({ ...f, targetRevenue: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>هدف الطلبات</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="مثال: 200"
                  value={goalForm.targetOrders}
                  onChange={(e) => setGoalForm((f) => ({ ...f, targetOrders: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>تاريخ البداية</Label>
                <Input
                  type="date"
                  value={goalForm.startDate}
                  onChange={(e) => setGoalForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>تاريخ النهاية</Label>
                <Input
                  type="date"
                  value={goalForm.endDate}
                  onChange={(e) => setGoalForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات (اختياري)</Label>
              <Input
                value={goalForm.notes}
                onChange={(e) => setGoalForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="ملاحظات إضافية..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGoalDialog(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveGoal} disabled={savingGoal}>
              {savingGoal ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              حفظ الهدف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Goal Confirm ── */}
      <AlertDialog open={!!deleteGoalId} onOpenChange={() => setDeleteGoalId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الهدف؟</AlertDialogTitle>
            <AlertDialogDescription>لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteGoalId && handleDeleteGoal(deleteGoalId)}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
