"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Plus,
  Pencil,
  Trash2,
  Building2,
  MapPin,
  Phone,
  User,
  BarChart3,
  Star,
  RefreshCw,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useToast } from "@/hooks/use-toast";
import { type Branch, branchesApi } from "@/lib/api";

const emptyForm = {
  name: "",
  name_en: "",
  city: "",
  address: "",
  phone: "",
  manager_name: "",
  is_default: false,
  sort_order: 0,
};

export default function BranchesPage() {
  const router = useRouter();
  const { merchantId, apiKey } = useMerchant();
  const { canCreate, canDelete, isReadOnly } = useRoleAccess("settings");
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  const fetchBranches = useCallback(async () => {
    if (!apiKey) return;
    try {
      setLoading(true);
      const data = await branchesApi.list(apiKey);
      setBranches(data.branches);
    } catch {
      toast({ title: "تعذر تحميل الفروع", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiKey, toast]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // ── Open Add/Edit dialog ──────────────────────────────────────────
  const openAdd = () => {
    setEditingBranch(null);
    setFormData(emptyForm);
    setIsFormOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      name_en: branch.name_en ?? "",
      city: branch.city ?? "",
      address: branch.address ?? "",
      phone: branch.phone ?? "",
      manager_name: branch.manager_name ?? "",
      is_default: branch.is_default,
      sort_order: branch.sort_order,
    });
    setIsFormOpen(true);
  };

  // ── Submit ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!apiKey || !formData.name.trim()) {
      toast({ title: "اسم الفرع مطلوب", variant: "destructive" });
      return;
    }
    try {
      setSubmitting(true);
      const dto = {
        ...formData,
        name: formData.name.trim(),
        name_en: formData.name_en.trim() || undefined,
        city: formData.city.trim() || undefined,
        address: formData.address.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        manager_name: formData.manager_name.trim() || undefined,
      };
      if (editingBranch) {
        await branchesApi.update(apiKey, editingBranch.id, dto);
        toast({ title: "تم تحديث الفرع بنجاح" });
      } else {
        await branchesApi.create(apiKey, dto);
        toast({ title: "تم إنشاء الفرع بنجاح" });
      }
      setIsFormOpen(false);
      fetchBranches();
    } catch (err: any) {
      toast({
        title: "حدث خطأ",
        description: err?.message ?? "تعذر حفظ الفرع",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!apiKey || !deleteTarget) return;
    try {
      await branchesApi.remove(apiKey, deleteTarget.id);
      toast({ title: "تم حذف الفرع" });
      setDeleteTarget(null);
      fetchBranches();
    } catch (err: any) {
      toast({
        title: "تعذر الحذف",
        description: err?.message ?? "حاول مرة أخرى",
        variant: "destructive",
      });
    }
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الفروع"
        description="إنشاء وإدارة فروع متعددة ومتابعة أداء كل فرع"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchBranches}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              تحديث
            </Button>
            {canCreate && (
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4" />
                فرع جديد
              </Button>
            )}
          </div>
        }
      />

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Building2 className="h-4 w-4" />
              إجمالي الفروع
            </div>
            <p className="text-2xl font-bold">{branches.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              فروع نشطة
            </div>
            <p className="text-2xl font-bold text-green-600">
              {branches.filter((b) => b.is_active).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <XCircle className="h-4 w-4 text-red-400" />
              فروع معطلة
            </div>
            <p className="text-2xl font-bold text-red-500">
              {branches.filter((b) => !b.is_active).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Branch cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-5 w-40 bg-muted rounded mb-3" />
                <div className="h-4 w-32 bg-muted rounded mb-2" />
                <div className="h-4 w-24 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">لا يوجد فروع حتى الآن</p>
            {canCreate && (
              <Button className="mt-4" onClick={openAdd}>
                <Plus className="h-4 w-4 ml-1" />
                أضف أول فرع
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((branch) => (
            <Card
              key={branch.id}
              className={cn(
                "relative overflow-hidden transition-shadow hover:shadow-md",
                !branch.is_active && "opacity-60",
              )}
            >
              {branch.is_default && (
                <div className="absolute top-3 left-3">
                  <Badge
                    variant="secondary"
                    className="text-xs bg-amber-100 text-amber-700 border-amber-200"
                  >
                    <Star className="h-3 w-3 ml-1 fill-amber-500 text-amber-500" />
                    افتراضي
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">
                      {branch.name}
                    </CardTitle>
                    {branch.name_en && (
                      <p className="text-xs text-muted-foreground truncate">
                        {branch.name_en}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={branch.is_active ? "default" : "secondary"}
                    className={cn(
                      "text-xs shrink-0",
                      branch.is_active
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {branch.is_active ? "نشط" : "معطل"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1.5">
                {branch.city && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{branch.city}</span>
                  </div>
                )}
                {branch.phone && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span dir="ltr">{branch.phone}</span>
                  </div>
                )}
                {branch.manager_name && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{branch.manager_name}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8"
                    onClick={() =>
                      router.push(`/merchant/branches/${branch.id}`)
                    }
                  >
                    <BarChart3 className="h-3.5 w-3.5 ml-1" />
                    التحليلات
                  </Button>
                  {!isReadOnly && (
                    <>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(branch)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {!branch.is_default && canDelete && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(branch)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editingBranch ? "تعديل الفرع" : "إنشاء فرع جديد"}
            </DialogTitle>
            <DialogDescription>
              {editingBranch
                ? "قم بتعديل بيانات الفرع"
                : "أدخل بيانات الفرع الجديد"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>اسم الفرع (عربي) *</Label>
              <Input
                placeholder="مثال: الفرع الرئيسي"
                value={formData.name}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>اسم الفرع (إنجليزي)</Label>
              <Input
                placeholder="Main Branch"
                dir="ltr"
                value={formData.name_en}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, name_en: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>المدينة</Label>
                <Input
                  placeholder="القاهرة"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, city: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>رقم الهاتف</Label>
                <Input
                  dir="ltr"
                  placeholder="+20 10..."
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, phone: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>العنوان</Label>
              <Input
                placeholder="العنوان التفصيلي"
                value={formData.address}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, address: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>مدير الفرع</Label>
              <Input
                placeholder="اسم المسؤول"
                value={formData.manager_name}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, manager_name: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                className="rounded"
                checked={formData.is_default}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    is_default: e.target.checked,
                  }))
                }
              />
              <Label htmlFor="is_default" className="cursor-pointer">
                تعيين كفرع افتراضي
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsFormOpen(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <RefreshCw className="h-4 w-4 animate-spin ml-1" />
              ) : null}
              {editingBranch ? "حفظ التعديلات" : "إنشاء الفرع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الفرع</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف فرع &quot;{deleteTarget?.name}&quot;؟ سيتم
              إلغاء ربط جميع الطلبات والمصاريف بهذا الفرع. لا يمكن التراجع عن
              هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              حذف الفرع
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
