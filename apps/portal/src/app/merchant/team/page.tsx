"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  UserPlus,
  Shield,
  MoreHorizontal,
  Mail,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Trash2,
  Edit,
  Ban,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { portalApi } from "@/lib/client";
import { PageHeader } from "@/components/layout";

interface Staff {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "AGENT" | "CASHIER" | "VIEWER";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING_INVITE";
  permissions?: Record<string, string[]>;
  lastLoginAt?: string;
  lastActivityAt?: string;
  createdAt: string;
}

// Default permissions per role
const defaultPermissionsByRole: Record<string, Record<string, string[]>> = {
  OWNER: {
    orders: ["create", "read", "update", "delete", "export"],
    conversations: ["read", "respond", "takeover", "close"],
    customers: ["read", "update", "delete", "export"],
    customer_segments: ["create", "read", "update", "delete"],
    products: ["create", "read", "update", "delete", "import", "export"],
    inventory: ["read", "update"],
    delivery_drivers: ["create", "read", "update", "delete"],
    payments_cod: ["read", "update", "export"],
    quotes: ["read", "update"],
    expenses: ["create", "read", "update", "delete", "export"],
    followups: ["create", "read", "update", "delete"],
    campaigns: ["create", "read", "update", "delete"],
    notifications: ["read", "update"],
    analytics: ["read", "export"],
    kpis: ["read"],
    loyalty: ["create", "read", "update", "delete"],
    knowledge_base: ["create", "read", "update", "delete"],
    agents: ["read", "update"],
    reports: ["read", "export"],
    integrations: ["read", "update"],
    import_export: ["import", "export"],
    staff: ["invite", "read", "update", "remove"],
    settings: ["read", "update"],
    webhooks: ["create", "read", "update", "delete", "test"],
    audit: ["read"],
  },
  ADMIN: {
    orders: ["create", "read", "update", "delete", "export"],
    conversations: ["read", "respond", "takeover", "close"],
    customers: ["read", "update", "delete", "export"],
    customer_segments: ["create", "read", "update", "delete"],
    products: ["create", "read", "update", "delete", "import", "export"],
    inventory: ["read", "update"],
    delivery_drivers: ["create", "read", "update", "delete"],
    payments_cod: ["read", "update", "export"],
    quotes: ["read", "update"],
    expenses: ["create", "read", "update", "delete", "export"],
    followups: ["create", "read", "update", "delete"],
    campaigns: ["create", "read", "update", "delete"],
    notifications: ["read", "update"],
    analytics: ["read", "export"],
    kpis: ["read"],
    loyalty: ["create", "read", "update", "delete"],
    knowledge_base: ["create", "read", "update", "delete"],
    agents: ["read", "update"],
    reports: ["read", "export"],
    integrations: ["read", "update"],
    import_export: ["import", "export"],
    settings: ["read", "update"],
    webhooks: ["create", "read", "update", "delete", "test"],
    audit: ["read"],
  },
  MANAGER: {
    orders: ["create", "read", "update", "export"],
    conversations: ["read", "respond", "takeover", "close"],
    customers: ["read", "update", "export"],
    customer_segments: ["read", "update"],
    products: ["create", "read", "update", "import", "export"],
    inventory: ["read", "update"],
    delivery_drivers: ["read", "update"],
    payments_cod: ["read", "update"],
    quotes: ["read", "update"],
    expenses: ["create", "read", "update", "export"],
    followups: ["create", "read", "update"],
    campaigns: ["read"],
    notifications: ["read"],
    analytics: ["read", "export"],
    kpis: ["read"],
    loyalty: ["read", "update"],
    knowledge_base: ["create", "read", "update"],
    agents: ["read"],
    reports: ["read", "export"],
    integrations: ["read"],
    import_export: ["import", "export"],
  },
  AGENT: {
    orders: ["read"],
    conversations: ["read", "respond"],
    customers: ["read"],
    products: ["read"],
    inventory: ["read"],
    delivery_drivers: ["read"],
    quotes: ["read"],
    followups: ["read"],
    notifications: ["read"],
    knowledge_base: ["read"],
    reports: ["read"],
  },
  CASHIER: {
    orders: ["create", "read", "update"],
    customers: ["read", "update"],
    products: ["read"],
    inventory: ["read"],
    expenses: ["create", "read", "update"],
    payments_cod: ["read"],
    notifications: ["read"],
  },
  VIEWER: {
    orders: ["read"],
    conversations: ["read"],
    customers: ["read"],
    products: ["read"],
    inventory: ["read"],
    reports: ["read"],
    analytics: ["read"],
    kpis: ["read"],
  },
};

const actionLabels: Record<string, string> = {
  create: "إنشاء",
  read: "عرض",
  update: "تعديل",
  delete: "حذف",
  export: "تصدير",
  import: "استيراد",
  respond: "رد",
  takeover: "استلام",
  close: "إغلاق",
  invite: "دعوة",
  remove: "حذف",
  test: "اختبار",
};

const roleColors: Record<string, string> = {
  OWNER: "bg-yellow-500",
  ADMIN: "bg-purple-500",
  MANAGER: "bg-blue-500",
  AGENT: "bg-green-500",
  CASHIER: "bg-orange-500",
  VIEWER: "bg-gray-500",
};

const roleLabels: Record<string, string> = {
  OWNER: "مالك",
  ADMIN: "مدير",
  MANAGER: "مشرف",
  AGENT: "وكيل",
  CASHIER: "كاشير",
  VIEWER: "مشاهد",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "نشط",
  INACTIVE: "غير نشط",
  SUSPENDED: "موقوف",
  PENDING_INVITE: "بانتظار القبول",
};

const statusIcons: Record<string, any> = {
  ACTIVE: CheckCircle,
  INACTIVE: XCircle,
  SUSPENDED: Ban,
  PENDING_INVITE: Clock,
};

const permissions = [
  {
    key: "orders",
    label: "الطلبات",
    actions: ["create", "read", "update", "delete", "export"],
  },
  {
    key: "conversations",
    label: "المحادثات",
    actions: ["read", "respond", "takeover", "close"],
  },
  {
    key: "customers",
    label: "العملاء",
    actions: ["read", "update", "delete", "export"],
  },
  {
    key: "customer_segments",
    label: "شرائح العملاء",
    actions: ["create", "read", "update", "delete"],
  },
  {
    key: "products",
    label: "المنتجات",
    actions: ["create", "read", "update", "delete", "import", "export"],
  },
  { key: "inventory", label: "المخزون", actions: ["read", "update"] },
  {
    key: "delivery_drivers",
    label: "سائقي التوصيل",
    actions: ["create", "read", "update", "delete"],
  },
  {
    key: "payments_cod",
    label: "تحصيل COD",
    actions: ["read", "update", "export"],
  },
  { key: "quotes", label: "عروض الأسعار", actions: ["read", "update"] },
  {
    key: "expenses",
    label: "المصروفات",
    actions: ["create", "read", "update", "delete", "export"],
  },
  {
    key: "followups",
    label: "المتابعات",
    actions: ["create", "read", "update", "delete"],
  },
  {
    key: "campaigns",
    label: "الحملات",
    actions: ["create", "read", "update", "delete"],
  },
  { key: "notifications", label: "الإشعارات", actions: ["read", "update"] },
  { key: "analytics", label: "التحليلات", actions: ["read", "export"] },
  { key: "kpis", label: "مؤشرات الأداء", actions: ["read"] },
  {
    key: "loyalty",
    label: "برنامج الولاء",
    actions: ["create", "read", "update", "delete"],
  },
  {
    key: "knowledge_base",
    label: "قاعدة المعرفة",
    actions: ["create", "read", "update", "delete"],
  },
  { key: "agents", label: "مركز الذكاء", actions: ["read", "update"] },
  { key: "reports", label: "التقارير", actions: ["read", "export"] },
  { key: "integrations", label: "التكاملات", actions: ["read", "update"] },
  {
    key: "import_export",
    label: "استيراد/تصدير",
    actions: ["import", "export"],
  },
  {
    key: "staff",
    label: "الفريق",
    actions: ["invite", "read", "update", "remove"],
  },
  { key: "settings", label: "الإعدادات", actions: ["read", "update"] },
  {
    key: "webhooks",
    label: "POS Integrations",
    actions: ["create", "read", "update", "delete", "test"],
  },
  { key: "audit", label: "سجل التدقيق", actions: ["read"] },
];

export default function TeamPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [editRole, setEditRole] = useState<Staff["role"]>("AGENT");
  const [editPermissions, setEditPermissions] = useState<
    Record<string, string[]>
  >({});
  const [inviteForm, setInviteForm] = useState({
    email: "",
    name: "",
    role: "AGENT" as Staff["role"],
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const isOnline = (member: Staff) => {
    if (!member.lastLoginAt) return false;
    const lastLogin = new Date(member.lastLoginAt).getTime();
    const now = Date.now();
    return now - lastLogin < 15 * 60 * 1000; // online if logged in within 15 min
  };

  const openPermissionsDialog = (member: Staff) => {
    setSelectedStaff(member);
    const currentPerms =
      member.permissions && Object.keys(member.permissions).length > 0
        ? member.permissions
        : defaultPermissionsByRole[member.role] || {};
    // Normalize permissions to ensure all values are arrays
    const normalized: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(currentPerms)) {
      normalized[key] = Array.isArray(value) ? value : [];
    }
    setEditPermissions(normalized);
    setIsPermissionsOpen(true);
  };

  const togglePermission = (section: string, action: string) => {
    setEditPermissions((prev) => {
      const current = Array.isArray(prev[section]) ? prev[section] : [];
      const updated = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      return { ...prev, [section]: updated };
    });
  };

  const toggleAllSection = (section: string, actions: string[]) => {
    setEditPermissions((prev) => {
      const current = Array.isArray(prev[section]) ? prev[section] : [];
      const allEnabled = actions.every((a) => current.includes(a));
      return { ...prev, [section]: allEnabled ? [] : [...actions] };
    });
  };

  const handlePermissionsSave = async () => {
    if (!selectedStaff) return;
    try {
      setSaving(true);
      await portalApi.updateStaff(selectedStaff.id, {
        permissions: editPermissions,
      });
      setStaff(
        staff.map((s) =>
          s.id === selectedStaff.id
            ? { ...s, permissions: editPermissions }
            : s,
        ),
      );
      toast({
        title: "تم التحديث",
        description: `تم تحديث صلاحيات ${selectedStaff.name}`,
      });
      setIsPermissionsOpen(false);
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error?.message || "فشل في تحديث الصلاحيات",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetToRoleDefaults = () => {
    if (!selectedStaff) return;
    const rolePerms = defaultPermissionsByRole[selectedStaff.role] || {};
    const normalized: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(rolePerms)) {
      normalized[key] = Array.isArray(value) ? value : [];
    }
    setEditPermissions(normalized);
  };

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const data = await portalApi.getStaff();
      setStaff(data.staff || data || []);
    } catch (error) {
      console.error("Failed to fetch staff:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل بيانات الفريق",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleInvite = async () => {
    if (!inviteForm.email || !inviteForm.name) {
      toast({
        title: "خطأ",
        description: "يرجى ملء جميع الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      await portalApi.inviteStaff({
        email: inviteForm.email,
        name: inviteForm.name,
        role: inviteForm.role,
      });

      setInviteForm({ email: "", name: "", role: "AGENT" });
      setIsInviteOpen(false);
      toast({
        title: "تم إرسال الدعوة",
        description: `تم إرسال دعوة إلى ${inviteForm.email}`,
      });
      fetchStaff();
    } catch (error: any) {
      const message = error?.message || "فشل في إرسال الدعوة";
      toast({ title: "خطأ", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (member: Staff) => {
    setSelectedStaff(member);
    setEditRole(member.role);
    setIsEditOpen(true);
  };

  const handleRoleChange = async () => {
    if (!selectedStaff || editRole === selectedStaff.role) {
      setIsEditOpen(false);
      return;
    }
    try {
      setSaving(true);
      await portalApi.updateStaff(selectedStaff.id, { role: editRole });
      setStaff(
        staff.map((s) =>
          s.id === selectedStaff.id ? { ...s, role: editRole } : s,
        ),
      );
      toast({
        title: "تم التحديث",
        description: `تم تغيير دور ${selectedStaff.name} إلى ${roleLabels[editRole]}`,
      });
      setIsEditOpen(false);
      setSelectedStaff(null);
    } catch (error: any) {
      const message = error?.message || "فشل في تحديث الدور";
      toast({ title: "خطأ", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (
    staffId: string,
    newStatus: Staff["status"],
  ) => {
    try {
      await portalApi.updateStaff(staffId, { status: newStatus });
      setStaff(
        staff.map((s) => (s.id === staffId ? { ...s, status: newStatus } : s)),
      );
      toast({ title: "تم التحديث", description: "تم تحديث حالة العضو" });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في تحديث الحالة",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (staffId: string) => {
    const staffMember = staff.find((s) => s.id === staffId);
    if (staffMember?.role === "OWNER") {
      toast({
        title: "خطأ",
        description: "لا يمكن حذف المالك",
        variant: "destructive",
      });
      return;
    }
    try {
      await portalApi.removeStaff(staffId);
      setStaff(staff.filter((s) => s.id !== staffId));
      toast({ title: "تم الحذف", description: "تم حذف العضو من الفريق" });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في حذف العضو",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const getTimeSince = (dateString?: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `منذ ${days} يوم`;
    if (hours > 0) return `منذ ${hours} ساعة`;
    if (minutes > 0) return `منذ ${minutes} دقيقة`;
    return "الآن";
  };

  return (
    <div className="app-page-frame space-y-6 p-4 pb-8 sm:p-6">
      <PageHeader
        title="إدارة الفريق"
        description="إدارة الأدوار، الدعوات، وحوكمة الوصول داخل النشاط من واجهة واحدة."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              onClick={fetchStaff}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              تحديث
            </Button>
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
                  <UserPlus className="h-4 w-4" />
                  دعوة عضو جديد
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>دعوة عضو جديد</DialogTitle>
                  <DialogDescription>
                    أرسل دعوة لعضو جديد للانضمام إلى فريقك
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">البريد الإلكتروني</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@example.com"
                      value={inviteForm.email}
                      onChange={(e) =>
                        setInviteForm({ ...inviteForm, email: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">الاسم</Label>
                    <Input
                      id="name"
                      placeholder="اسم العضو"
                      value={inviteForm.name}
                      onChange={(e) =>
                        setInviteForm({ ...inviteForm, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">الدور</Label>
                    <Select
                      value={inviteForm.role}
                      onValueChange={(value) =>
                        setInviteForm({
                          ...inviteForm,
                          role: value as Staff["role"],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">
                          مدير - صلاحيات كاملة
                        </SelectItem>
                        <SelectItem value="MANAGER">
                          مشرف - إدارة العمليات
                        </SelectItem>
                        <SelectItem value="AGENT">
                          وكيل - خدمة العملاء
                        </SelectItem>
                        <SelectItem value="CASHIER">
                          كاشير - نقطة البيع ومشتريات الفرع
                        </SelectItem>
                        <SelectItem value="VIEWER">مشاهد - عرض فقط</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col justify-end gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={() => setIsInviteOpen(false)}
                    className="w-full sm:w-auto"
                  >
                    إلغاء
                  </Button>
                  <Button
                    onClick={handleInvite}
                    disabled={saving}
                    className="w-full sm:w-auto"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    إرسال الدعوة
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div className="space-y-4">
            <span className="app-hero-band__eyebrow">Team Access Control</span>
            <div className="space-y-3">
              <h2 className="app-hero-band__title">
                ابْنِ الفريق بصلاحيات واضحة بدل مشاركة الوصول العشوائي.
              </h2>
              <p className="app-hero-band__copy">
                من هنا تدير الدعوات، تتابع حالة القبول، وتراجع صلاحيات كل دور
                بما في ذلك الكاشير والوكلاء والمشرفين. الهدف ليس فقط إضافة
                أعضاء، بل ضبط من يرى ماذا ومن يستطيع تنفيذ ماذا.
              </p>
            </div>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                إجمالي الأعضاء
              </span>
              <strong className="app-hero-band__metric-value">
                {staff.length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">نشطون</span>
              <strong className="app-hero-band__metric-value">
                {staff.filter((s) => s.status === "ACTIVE").length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                بانتظار القبول
              </span>
              <strong className="app-hero-band__metric-value">
                {staff.filter((s) => s.status === "PENDING_INVITE").length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">موقوفون</span>
              <strong className="app-hero-band__metric-value">
                {staff.filter((s) => s.status === "SUSPENDED").length}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="app-data-card">
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="app-data-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  إجمالي الأعضاء
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{staff.length}</div>
              </CardContent>
            </Card>
            <Card className="app-data-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">نشطون</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {staff.filter((s) => s.status === "ACTIVE").length}
                </div>
              </CardContent>
            </Card>
            <Card className="app-data-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  بانتظار القبول
                </CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {staff.filter((s) => s.status === "PENDING_INVITE").length}
                </div>
              </CardContent>
            </Card>
            <Card className="app-data-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">موقوفون</CardTitle>
                <Ban className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {staff.filter((s) => s.status === "SUSPENDED").length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Staff Table */}
          <Card className="app-data-card">
            <CardHeader>
              <CardTitle>أعضاء الفريق</CardTitle>
              <CardDescription>
                قائمة بجميع أعضاء الفريق وصلاحياتهم
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {staff.map((member) => {
                  const StatusIcon = statusIcons[member.status];
                  return (
                    <div
                      key={member.id}
                      className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--border-strong)_86%,transparent)] p-4 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.4)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-500 font-bold text-white">
                              {member.name.charAt(0)}
                            </div>
                            {isOnline(member) && (
                              <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {member.email}
                            </p>
                          </div>
                        </div>
                        <Badge
                          className={`${roleColors[member.role]} text-white`}
                        >
                          {roleLabels[member.role]}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-muted-foreground">الحالة</p>
                          <div className="mt-1 flex items-center gap-2">
                            <StatusIcon
                              className={`h-4 w-4 ${
                                member.status === "ACTIVE"
                                  ? "text-green-500"
                                  : member.status === "PENDING_INVITE"
                                    ? "text-yellow-500"
                                    : "text-red-500"
                              }`}
                            />
                            <span>{statusLabels[member.status]}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-muted-foreground">آخر دخول</p>
                          <p>{getTimeSince(member.lastLoginAt)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">آخر نشاط</p>
                          <p>{getTimeSince(member.lastActivityAt)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العضو</TableHead>
                      <TableHead>الدور</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>آخر دخول</TableHead>
                      <TableHead>آخر نشاط</TableHead>
                      <TableHead className="text-end">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staff.map((member) => {
                      const StatusIcon = statusIcons[member.status];
                      return (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                                  {member.name.charAt(0)}
                                </div>
                                {isOnline(member) && (
                                  <div
                                    className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-white"
                                    title="متصل الآن"
                                  />
                                )}
                              </div>
                              <div>
                                <div className="font-medium flex items-center gap-2">
                                  {member.name}
                                  {isOnline(member) && (
                                    <span className="text-xs text-green-600">
                                      متصل
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {member.email}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={`${roleColors[member.role]} text-white`}
                            >
                              {roleLabels[member.role]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <StatusIcon
                                className={`h-4 w-4 ${
                                  member.status === "ACTIVE"
                                    ? "text-green-500"
                                    : member.status === "PENDING_INVITE"
                                      ? "text-yellow-500"
                                      : "text-red-500"
                                }`}
                              />
                              <span>{statusLabels[member.status]}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getTimeSince(member.lastLoginAt)}
                          </TableCell>
                          <TableCell>
                            {getTimeSince(member.lastActivityAt)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={member.role === "OWNER"}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => openEditDialog(member)}
                                >
                                  <Edit className="h-4 w-4" />
                                  تعديل الدور
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => openPermissionsDialog(member)}
                                >
                                  <Shield className="h-4 w-4" />
                                  تعديل الصلاحيات
                                </DropdownMenuItem>
                                {member.status === "ACTIVE" && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleStatusChange(member.id, "SUSPENDED")
                                    }
                                  >
                                    <Ban className="h-4 w-4" />
                                    إيقاف
                                  </DropdownMenuItem>
                                )}
                                {member.status === "SUSPENDED" && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleStatusChange(member.id, "ACTIVE")
                                    }
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                    تفعيل
                                  </DropdownMenuItem>
                                )}
                                {member.status === "PENDING_INVITE" && (
                                  <DropdownMenuItem>
                                    <RefreshCw className="h-4 w-4" />
                                    إعادة إرسال الدعوة
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => handleDelete(member.id)}
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
            </CardContent>
          </Card>

          {/* Edit Role Dialog */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>تعديل دور العضو</DialogTitle>
                <DialogDescription>
                  تغيير دور {selectedStaff?.name} في الفريق
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                    {selectedStaff?.name?.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium">{selectedStaff?.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedStaff?.email}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>الدور الحالي</Label>
                  <Badge
                    className={`${roleColors[selectedStaff?.role || "AGENT"]} text-white`}
                  >
                    {roleLabels[selectedStaff?.role || "AGENT"]}
                  </Badge>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editRole">الدور الجديد</Label>
                  <Select
                    value={editRole}
                    onValueChange={(v) => setEditRole(v as Staff["role"])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${roleColors.ADMIN}`}
                          />
                          مدير - صلاحيات كاملة (إعدادات، تكاملات، تدقيق)
                        </div>
                      </SelectItem>
                      <SelectItem value="MANAGER">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${roleColors.MANAGER}`}
                          />
                          مشرف - إدارة العمليات (طلبات، مخزون، تقارير)
                        </div>
                      </SelectItem>
                      <SelectItem value="AGENT">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${roleColors.AGENT}`}
                          />
                          وكيل - خدمة العملاء (محادثات، طلبات - قراءة)
                        </div>
                      </SelectItem>
                      <SelectItem value="CASHIER">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${roleColors.CASHIER}`}
                          />
                          كاشير - بيع مباشر ومشتريات الفرع
                        </div>
                      </SelectItem>
                      <SelectItem value="VIEWER">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${roleColors.VIEWER}`}
                          />
                          مشاهد - عرض فقط (بدون تعديل أو إنشاء)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editRole !== selectedStaff?.role && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                    <AlertCircle className="h-4 w-4 inline mr-1" />
                    سيتم تغيير صلاحيات هذا العضو فوراً بعد الحفظ
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-end gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setIsEditOpen(false)}
                  className="w-full sm:w-auto"
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleRoleChange}
                  disabled={saving || editRole === selectedStaff?.role}
                  className="w-full sm:w-auto"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  حفظ التغييرات
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Permissions Reference */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                مرجع الصلاحيات
              </CardTitle>
              <CardDescription>الصلاحيات الافتراضية لكل دور</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {permissions.map((perm) => (
                  <div
                    key={perm.key}
                    className="rounded-lg border p-4 space-y-2"
                  >
                    <div className="font-medium">{perm.label}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>مالك</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {perm.key !== "staff" ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span>مدير</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {[
                          "orders",
                          "conversations",
                          "customers",
                          "products",
                          "inventory",
                          "reports",
                        ].includes(perm.key) ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span>مشرف</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {[
                          "orders",
                          "conversations",
                          "customers",
                          "products",
                          "inventory",
                          "reports",
                        ].includes(perm.key) ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span>وكيل</span>
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        {[
                          "orders",
                          "conversations",
                          "customers",
                          "products",
                          "inventory",
                          "reports",
                        ].includes(perm.key) ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span>مشاهد</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>القسم</TableHead>
                      <TableHead className="text-center">مالك</TableHead>
                      <TableHead className="text-center">مدير</TableHead>
                      <TableHead className="text-center">مشرف</TableHead>
                      <TableHead className="text-center">وكيل</TableHead>
                      <TableHead className="text-center">مشاهد</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permissions.map((perm) => (
                      <TableRow key={perm.key}>
                        <TableCell className="font-medium">
                          {perm.label}
                        </TableCell>
                        <TableCell className="text-center">
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        </TableCell>
                        <TableCell className="text-center">
                          {perm.key !== "staff" ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {[
                            "orders",
                            "conversations",
                            "customers",
                            "products",
                            "inventory",
                            "reports",
                          ].includes(perm.key) ? (
                            <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {[
                            "orders",
                            "conversations",
                            "customers",
                            "products",
                            "inventory",
                            "reports",
                          ].includes(perm.key) ? (
                            <span title="جزئي">
                              <AlertCircle className="h-4 w-4 text-yellow-500 mx-auto" />
                            </span>
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {[
                            "orders",
                            "conversations",
                            "customers",
                            "products",
                            "inventory",
                            "reports",
                          ].includes(perm.key) ? (
                            <span title="قراءة فقط">
                              <AlertCircle className="h-4 w-4 text-yellow-500 mx-auto" />
                            </span>
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-4">
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>كامل</span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  <span>جزئي</span>
                </div>
                <div className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span>غير مسموح</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Custom Permissions Dialog */}
          <Dialog open={isPermissionsOpen} onOpenChange={setIsPermissionsOpen}>
            <DialogContent className="max-h-[85vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  تعديل صلاحيات {selectedStaff?.name}
                </DialogTitle>
                <DialogDescription>
                  خصّص صلاحيات هذا العضو - أو اضغط &quot;إعادة للافتراضي&quot;
                  للعودة لصلاحيات الدور
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Badge
                    className={`${roleColors[selectedStaff?.role || "AGENT"]} text-white`}
                  >
                    {roleLabels[selectedStaff?.role || "AGENT"]}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {selectedStaff?.email}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetToRoleDefaults}
                >
                  <RefreshCw className="h-3 w-3" />
                  إعادة للافتراضي
                </Button>
              </div>

              <div className="space-y-3">
                {permissions.map((perm) => {
                  const rawPerms = editPermissions[perm.key];
                  const sectionPerms = Array.isArray(rawPerms) ? rawPerms : [];
                  const allEnabled = perm.actions.every((a) =>
                    sectionPerms.includes(a),
                  );
                  const someEnabled = perm.actions.some((a) =>
                    sectionPerms.includes(a),
                  );

                  return (
                    <div key={perm.key} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          type="button"
                          className="font-medium text-sm flex items-center gap-2 hover:text-blue-600 transition-colors"
                          onClick={() =>
                            toggleAllSection(perm.key, perm.actions)
                          }
                        >
                          <div
                            className={`h-4 w-4 rounded border flex items-center justify-center text-white text-xs ${
                              allEnabled
                                ? "bg-green-500 border-green-500"
                                : someEnabled
                                  ? "bg-yellow-400 border-yellow-400"
                                  : "border-gray-300"
                            }`}
                          >
                            {allEnabled ? "✓" : someEnabled ? "-" : ""}
                          </div>
                          {perm.label}
                        </button>
                        <span className="text-xs text-muted-foreground">
                          {sectionPerms.length}/{perm.actions.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {perm.actions.map((action) => {
                          const enabled = sectionPerms.includes(action);
                          return (
                            <button
                              key={action}
                              type="button"
                              onClick={() => togglePermission(perm.key, action)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                enabled
                                  ? "bg-green-100 text-green-700 border border-green-300 hover:bg-green-200"
                                  : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200"
                              }`}
                            >
                              {enabled ? "✓ " : ""}
                              {actionLabels[action] || action}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => setIsPermissionsOpen(false)}
                  className="w-full sm:w-auto"
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handlePermissionsSave}
                  disabled={saving}
                  className="w-full sm:w-auto"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4" />
                  )}
                  حفظ الصلاحيات
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
