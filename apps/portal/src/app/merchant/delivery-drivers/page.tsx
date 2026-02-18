"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/sidebar";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Truck,
  UserPlus,
  MoreHorizontal,
  Phone,
  MessageSquare,
  Bike,
  Car,
  Ban,
  CheckCircle,
  Trash2,
  Edit,
  RefreshCw,
  Loader2,
  MapPin,
  DollarSign,
  Zap,
  Settings2,
  Bell,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { portalApi } from "@/lib/authenticated-api";
import { Switch } from "@/components/ui/switch";

interface Driver {
  id: string;
  merchant_id: string;
  name: string;
  phone: string;
  whatsapp_number: string;
  status: "ACTIVE" | "INACTIVE";
  vehicle_type: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const vehicleIcons: Record<string, any> = {
  motorcycle: Bike,
  car: Car,
  bicycle: Bike,
  van: Truck,
};

const vehicleLabels: Record<string, string> = {
  motorcycle: "موتوسيكل",
  car: "سيارة",
  bicycle: "دراجة",
  van: "فان",
};

export default function DeliveryDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [saving, setSaving] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    whatsappNumber: "",
    vehicleType: "motorcycle",
    notes: "",
  });
  const [autoAssign, setAutoAssign] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const { toast } = useToast();

  const fetchDrivers = useCallback(async () => {
    try {
      setLoading(true);
      const [data, settings] = await Promise.all([
        portalApi.getDeliveryDrivers(),
        portalApi.getAutoAssignSettings().catch(() => null),
      ]);
      setDrivers(Array.isArray(data) ? data : []);
      if (settings) {
        setAutoAssign(settings.autoAssign || false);
        setNotifyCustomer(settings.notifyCustomer !== false);
      }
    } catch (error) {
      console.error("Failed to fetch drivers:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل بيانات السائقين",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const resetForm = () =>
    setForm({
      name: "",
      phone: "",
      whatsappNumber: "",
      vehicleType: "motorcycle",
      notes: "",
    });

  const handleAdd = async () => {
    if (!form.name || !form.phone) {
      toast({
        title: "خطأ",
        description: "يرجى ملء الاسم ورقم الهاتف",
        variant: "destructive",
      });
      return;
    }
    try {
      setSaving(true);
      const driver = await portalApi.createDeliveryDriver({
        name: form.name,
        phone: form.phone,
        whatsappNumber: form.whatsappNumber || form.phone,
        vehicleType: form.vehicleType,
        notes: form.notes || undefined,
      });
      setDrivers([driver, ...drivers]);
      resetForm();
      setIsAddOpen(false);
      toast({
        title: "تم الإضافة",
        description: `تم إضافة السائق ${form.name}`,
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error?.message || "فشل في إضافة السائق",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (driver: Driver) => {
    setSelectedDriver(driver);
    setForm({
      name: driver.name,
      phone: driver.phone,
      whatsappNumber: driver.whatsapp_number || "",
      vehicleType: driver.vehicle_type || "motorcycle",
      notes: driver.notes || "",
    });
    setIsEditOpen(true);
  };

  const handleEdit = async () => {
    if (!selectedDriver) return;
    try {
      setSaving(true);
      const updated = await portalApi.updateDeliveryDriver(selectedDriver.id, {
        name: form.name,
        phone: form.phone,
        whatsappNumber: form.whatsappNumber || form.phone,
        vehicleType: form.vehicleType,
        notes: form.notes || undefined,
      });
      setDrivers(
        drivers.map((d) => (d.id === selectedDriver.id ? updated : d)),
      );
      setIsEditOpen(false);
      toast({
        title: "تم التحديث",
        description: `تم تحديث بيانات ${form.name}`,
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error?.message || "فشل في التحديث",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (driver: Driver) => {
    const newStatus = driver.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await portalApi.updateDeliveryDriver(driver.id, { status: newStatus });
      setDrivers(
        drivers.map((d) =>
          d.id === driver.id ? { ...d, status: newStatus } : d,
        ),
      );
      toast({
        title: "تم التحديث",
        description: `${driver.name} الآن ${newStatus === "ACTIVE" ? "نشط" : "غير نشط"}`,
      });
    } catch {
      toast({
        title: "خطأ",
        description: "فشل في تحديث الحالة",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (driver: Driver) => {
    try {
      await portalApi.deleteDeliveryDriver(driver.id);
      setDrivers(drivers.filter((d) => d.id !== driver.id));
      toast({ title: "تم الحذف", description: `تم حذف السائق ${driver.name}` });
    } catch {
      toast({
        title: "خطأ",
        description: "فشل في حذف السائق",
        variant: "destructive",
      });
    }
  };

  const activeDrivers = drivers.filter((d) => d.status === "ACTIVE");

  const DriverForm = ({
    onSubmit,
    submitLabel,
  }: {
    onSubmit: () => void;
    submitLabel: string;
  }) => (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>الاسم *</Label>
          <Input
            placeholder="اسم السائق"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>رقم الهاتف *</Label>
          <Input
            dir="ltr"
            placeholder="+201xxxxxxxxx"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>رقم واتساب (اختياري)</Label>
          <Input
            dir="ltr"
            placeholder="نفس رقم الهاتف إذا فارغ"
            value={form.whatsappNumber}
            onChange={(e) =>
              setForm({ ...form, whatsappNumber: e.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>نوع المركبة</Label>
          <Select
            value={form.vehicleType}
            onValueChange={(v) => setForm({ ...form, vehicleType: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="motorcycle">🏍️ موتوسيكل</SelectItem>
              <SelectItem value="car">🚗 سيارة</SelectItem>
              <SelectItem value="bicycle">🚲 دراجة</SelectItem>
              <SelectItem value="van">🚐 فان</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>ملاحظات</Label>
        <Input
          placeholder="ملاحظات اختيارية عن السائق"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => {
            setIsAddOpen(false);
            setIsEditOpen(false);
          }}
        >
          إلغاء
        </Button>
        <Button onClick={onSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="سائقي التوصيل"
        description="إدارة سائقي التوصيل وإشعارات واتساب التلقائية"
        actions={
          <>
            <Button
              variant="outline"
              onClick={async () => {
                setSendingReminders(true);
                try {
                  const result = await portalApi.sendCodReminders();
                  toast({
                    title: "تذكير COD",
                    description:
                      result.message || `تم إرسال ${result.reminders} تذكير`,
                  });
                } catch (err) {
                  toast({
                    title: "خطأ",
                    description: "فشل في إرسال التذكيرات",
                    variant: "destructive",
                  });
                } finally {
                  setSendingReminders(false);
                }
              }}
              disabled={sendingReminders || drivers.length === 0}
              className="text-green-700 border-green-300 hover:bg-green-50"
            >
              {sendingReminders ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <DollarSign className="h-4 w-4" />
              )}
              تذكير تحصيل COD
            </Button>
            <Button variant="outline" onClick={fetchDrivers} disabled={loading}>
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              تحديث
            </Button>
            <Button
              onClick={() => {
                resetForm();
                setIsAddOpen(true);
              }}
            >
              <UserPlus className="h-4 w-4" />
              إضافة سائق
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              إجمالي السائقين
            </CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{drivers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">نشطون</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {activeDrivers.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">واتساب مفعّل</CardTitle>
            <MessageSquare className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {drivers.filter((d) => d.whatsapp_number).length}
            </div>
            <p className="text-xs text-muted-foreground">
              يتلقون إشعارات فورية
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Auto-Assign Settings */}
      <Card className="border-blue-200 dark:border-blue-800/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-500" />
            التعيين التلقائي للسائقين
          </CardTitle>
          <CardDescription>
            يقوم النظام بتوزيع الطلبات الجديدة تلقائياً على السائقين النشطين
            بالتساوي (الأقل طلبات يستلم أولاً)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  تعيين تلقائي للطلبات الجديدة
                </p>
                <p className="text-xs text-muted-foreground">
                  كل طلب جديد يتم تعيينه تلقائياً لأقل سائق أعباء
                </p>
              </div>
            </div>
            <Switch
              checked={autoAssign}
              onCheckedChange={async (checked) => {
                setAutoAssign(checked);
                try {
                  await portalApi.updateAutoAssignSettings({
                    autoAssign: checked,
                  });
                  toast({
                    title: "تم الحفظ",
                    description: checked
                      ? "تم تفعيل التعيين التلقائي"
                      : "تم إيقاف التعيين التلقائي",
                  });
                } catch {
                  setAutoAssign(!checked);
                  toast({
                    title: "خطأ",
                    description: "فشل في تحديث الإعداد",
                    variant: "destructive",
                  });
                }
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">إشعار العميل عند التعيين</p>
                <p className="text-xs text-muted-foreground">
                  يتلقى العميل رسالة واتساب باسم السائق وهاتفه
                </p>
              </div>
            </div>
            <Switch
              checked={notifyCustomer}
              onCheckedChange={async (checked) => {
                setNotifyCustomer(checked);
                try {
                  await portalApi.updateAutoAssignSettings({
                    notifyCustomer: checked,
                  });
                  toast({ title: "تم الحفظ" });
                } catch {
                  setNotifyCustomer(!checked);
                }
              }}
            />
          </div>
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                setAutoAssigning(true);
                try {
                  const result = await portalApi.autoAssignAllUnassigned();
                  toast({
                    title: "تم التوزيع",
                    description:
                      result.message || `تم تعيين ${result.assigned} طلب`,
                  });
                } catch (err: any) {
                  toast({
                    title: "خطأ",
                    description: err?.message || "فشل في التوزيع التلقائي",
                    variant: "destructive",
                  });
                } finally {
                  setAutoAssigning(false);
                }
              }}
              disabled={autoAssigning || activeDrivers.length === 0}
            >
              {autoAssigning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              توزيع جميع الطلبات المعلقة الآن
            </Button>
            {activeDrivers.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                أضف سائقين نشطين أولاً
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Drivers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            قائمة السائقين
          </CardTitle>
          <CardDescription>
            عند تعيين سائق لطلب، يتم إرسال رسالة واتساب تلقائية تحتوي على تفاصيل
            الطلب والعميل
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">لا يوجد سائقين بعد</p>
              <p className="text-sm mt-1">
                أضف سائقين ليتم إشعارهم تلقائياً عبر واتساب عند تعيينهم لطلب
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  resetForm();
                  setIsAddOpen(true);
                }}
              >
                <UserPlus className="h-4 w-4" />
                إضافة أول سائق
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[22%] text-right">السائق</TableHead>
                    <TableHead className="w-[18%] text-right">الهاتف</TableHead>
                    <TableHead className="w-[18%] text-right">واتساب</TableHead>
                    <TableHead className="w-[16%] text-right">
                      المركبة
                    </TableHead>
                    <TableHead className="w-[13%] text-right">الحالة</TableHead>
                    <TableHead className="w-[13%] text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.map((driver) => {
                    const VehicleIcon =
                      vehicleIcons[driver.vehicle_type] || Truck;
                    return (
                      <TableRow key={driver.id}>
                        <TableCell className="w-[22%]">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                              {driver.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {driver.name}
                              </div>
                              {driver.notes && (
                                <div className="text-xs text-muted-foreground truncate">
                                  {driver.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="w-[18%]">
                          <span
                            className="inline-flex items-center gap-1 text-sm"
                            dir="ltr"
                          >
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{driver.phone}</span>
                          </span>
                        </TableCell>
                        <TableCell className="w-[18%]">
                          <span
                            className="inline-flex items-center gap-1 text-sm"
                            dir="ltr"
                          >
                            <MessageSquare className="h-3 w-3 text-green-500 flex-shrink-0" />
                            <span className="truncate">
                              {driver.whatsapp_number || driver.phone}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="w-[16%]">
                          <div className="flex items-center gap-1">
                            <VehicleIcon className="h-4 w-4 flex-shrink-0" />
                            <span className="text-sm">
                              {vehicleLabels[driver.vehicle_type] ||
                                driver.vehicle_type}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="w-[13%]">
                          <Badge
                            variant={
                              driver.status === "ACTIVE"
                                ? "default"
                                : "secondary"
                            }
                            className={
                              driver.status === "ACTIVE" ? "bg-green-500" : ""
                            }
                          >
                            {driver.status === "ACTIVE" ? "نشط" : "غير نشط"}
                          </Badge>
                        </TableCell>
                        <TableCell className="w-[13%] text-left">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openEdit(driver)}
                              >
                                <Edit className="h-4 w-4" />
                                تعديل
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleStatusToggle(driver)}
                              >
                                {driver.status === "ACTIVE" ? (
                                  <>
                                    <Ban className="h-4 w-4" />
                                    إيقاف
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4" />
                                    تفعيل
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleDelete(driver)}
                              >
                                <Trash2 className="h-4 w-4" />
                                حذف
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-500" />
            كيف يعمل إشعار واتساب؟
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-2">
                <MapPin className="h-5 w-5 text-blue-600" />
              </div>
              <h4 className="font-medium text-sm">1. طلب جديد</h4>
              <p className="text-xs text-muted-foreground mt-1">
                يصل طلب من العميل عبر واتساب أو النظام
              </p>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-2">
                <Truck className="h-5 w-5 text-orange-600" />
              </div>
              <h4 className="font-medium text-sm">2. تعيين السائق</h4>
              <p className="text-xs text-muted-foreground mt-1">
                اختر السائق المناسب من صفحة الطلبات
              </p>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
              </div>
              <h4 className="font-medium text-sm">3. إشعار تلقائي</h4>
              <p className="text-xs text-muted-foreground mt-1">
                يتلقى السائق رسالة واتساب بتفاصيل الطلب والعنوان
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة سائق جديد</DialogTitle>
            <DialogDescription>
              أضف سائق توصيل ليتم إشعاره تلقائياً عبر واتساب
            </DialogDescription>
          </DialogHeader>
          {DriverForm({ onSubmit: handleAdd, submitLabel: "إضافة السائق" })}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل بيانات السائق</DialogTitle>
            <DialogDescription>
              تحديث بيانات {selectedDriver?.name}
            </DialogDescription>
          </DialogHeader>
          {DriverForm({ onSubmit: handleEdit, submitLabel: "حفظ التغييرات" })}
        </DialogContent>
      </Dialog>
    </div>
  );
}
