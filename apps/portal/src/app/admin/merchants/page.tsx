"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Users,
  Search,
  Plus,
  Edit,
  Trash2,
  Eye,
  Power,
  Store,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  Check,
  X,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { cn, formatCurrency, formatDate, getStatusColor } from "@/lib/utils";
import { portalApi } from "@/lib/client";

interface Merchant {
  id: string;
  tradeName: string;
  whatsappNumber: string;
  email: string;
  category: string;
  isActive: boolean;
  dailyBudget: number;
  createdAt: string;
  ordersCount: number;
  conversationsCount: number;
}

const categoryLabels: Record<string, string> = {
  CLOTHES: "ملابس",
  FOOD: "طعام",
  SUPERMARKET: "سوبر ماركت",
  ACCESSORIES: "إكسسوارات",
  GENERIC: "عام",
};

export default function MerchantsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(
    null,
  );
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [merchantToDelete, setMerchantToDelete] = useState<Merchant | null>(
    null,
  );
  const [newMerchant, setNewMerchant] = useState({
    tradeName: "",
    whatsappNumber: "",
    email: "",
    category: "",
    dailyBudget: "",
  });
  const itemsPerPage = 10;

  const fetchMerchants = useCallback(async () => {
    try {
      const data = await portalApi.getAdminMerchants();
      setMerchants(data || []);
    } catch (error) {
      console.error("Failed to fetch merchants:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMerchants();
    setRefreshing(false);
  };

  const filteredMerchants = merchants.filter((merchant) => {
    const matchesSearch =
      merchant.tradeName.includes(searchQuery) ||
      merchant.whatsappNumber.includes(searchQuery) ||
      merchant.email.includes(searchQuery);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && merchant.isActive) ||
      (statusFilter === "inactive" && !merchant.isActive);
    const matchesCategory =
      categoryFilter === "all" || merchant.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const totalPages = Math.ceil(filteredMerchants.length / itemsPerPage);
  const paginatedMerchants = filteredMerchants.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleToggleStatus = async (merchant: Merchant) => {
    try {
      await portalApi.toggleAdminMerchant(merchant.id, !merchant.isActive);
      setMerchants((prev) =>
        prev.map((m) =>
          m.id === merchant.id ? { ...m, isActive: !m.isActive } : m,
        ),
      );
    } catch (error) {
      console.error("Failed to toggle merchant status:", error);
    }
  };

  const handleDelete = async () => {
    if (!merchantToDelete) return;
    try {
      await portalApi.deleteAdminMerchant(merchantToDelete.id);
      setMerchants((prev) => prev.filter((m) => m.id !== merchantToDelete.id));
      setMerchantToDelete(null);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Failed to delete merchant:", error);
    }
  };

  const handleCreate = async () => {
    if (
      !newMerchant.tradeName ||
      !newMerchant.whatsappNumber ||
      !newMerchant.email
    )
      return;
    setSaving(true);
    try {
      const created = await portalApi.createAdminMerchant({
        tradeName: newMerchant.tradeName,
        whatsappNumber: newMerchant.whatsappNumber,
        email: newMerchant.email,
        category: newMerchant.category || "GENERIC",
        dailyBudget: parseInt(newMerchant.dailyBudget) || 50000,
      });
      if (created) {
        setMerchants((prev) => [...prev, created]);
      }
      setShowCreateDialog(false);
      setNewMerchant({
        tradeName: "",
        whatsappNumber: "",
        email: "",
        category: "",
        dailyBudget: "",
      });
    } catch (error) {
      console.error("Failed to create merchant:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="إدارة التجار" />
        <TableSkeleton rows={5} columns={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="إدارة التجار"
        description="إنشاء وتعديل وإدارة حسابات التجار"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full sm:w-auto"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              تحديث
            </Button>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              تاجر جديد
            </Button>
          </div>
        }
      />

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">إجمالي التجار</p>
                <p className="text-2xl font-bold">{merchants.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">نشط</p>
                <p className="text-2xl font-bold text-green-600">
                  {merchants.filter((m) => m.isActive).length}
                </p>
              </div>
              <Check className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">معطل</p>
                <p className="text-2xl font-bold text-red-600">
                  {merchants.filter((m) => !m.isActive).length}
                </p>
              </div>
              <X className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث باسم المتجر، رقم الهاتف، أو البريد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">معطل</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="الفئة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الفئات</SelectItem>
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Merchants Table */}
      <Card>
        <CardContent className="p-0">
          {filteredMerchants.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title="لا يوجد تجار"
              description="لم يتم العثور على تجار مطابقين للبحث"
            />
          ) : (
            <>
              <div className="divide-y md:hidden">
                {paginatedMerchants.map((merchant) => (
                  <div key={merchant.id} className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                          <Store className="h-5 w-5 text-primary-600" />
                        </div>
                        <div>
                          <p className="font-medium">{merchant.tradeName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(merchant.createdAt)}
                          </p>
                        </div>
                      </div>
                      <Badge
                        className={cn(
                          merchant.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800",
                        )}
                      >
                        {merchant.isActive ? "نشط" : "معطل"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-muted-foreground">التواصل</p>
                        <p dir="ltr">{merchant.whatsappNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {merchant.email}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">الفئة</p>
                        <Badge variant="outline">
                          {categoryLabels[merchant.category]}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-muted-foreground">
                          الميزانية اليومية
                        </p>
                        <p>{formatCurrency(merchant.dailyBudget)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">النشاط</p>
                        <p>{merchant.ordersCount} طلب</p>
                        <p className="text-xs text-muted-foreground">
                          {merchant.conversationsCount} محادثة
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => setSelectedMerchant(merchant)}
                      >
                        <Eye className="ml-2 h-4 w-4" />
                        عرض
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => handleToggleStatus(merchant)}
                      >
                        <Power
                          className={cn(
                            "ml-2 h-4 w-4",
                            merchant.isActive
                              ? "text-green-600"
                              : "text-red-600",
                          )}
                        />
                        {merchant.isActive ? "تعطيل" : "تفعيل"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-red-600 sm:w-auto"
                        onClick={() => {
                          setMerchantToDelete(merchant);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="ml-2 h-4 w-4 text-red-500" />
                        حذف
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-right p-4 font-medium text-sm">
                        المتجر
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        التواصل
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        الفئة
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        الحالة
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        الميزانية
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        النشاط
                      </th>
                      <th className="text-right p-4 font-medium text-sm">
                        إجراءات
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginatedMerchants.map((merchant) => (
                      <tr key={merchant.id} className="hover:bg-muted/30">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                              <Store className="h-5 w-5 text-primary-600" />
                            </div>
                            <div>
                              <p className="font-medium">
                                {merchant.tradeName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(merchant.createdAt)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3" />
                              <span dir="ltr">{merchant.whatsappNumber}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {merchant.email}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline">
                            {categoryLabels[merchant.category]}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <Badge
                            className={cn(
                              merchant.isActive
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800",
                            )}
                          >
                            {merchant.isActive ? "نشط" : "معطل"}
                          </Badge>
                        </td>
                        <td className="p-4">
                          <p className="text-sm">
                            {formatCurrency(merchant.dailyBudget)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            يومياً
                          </p>
                        </td>
                        <td className="p-4">
                          <div className="text-sm">
                            <p>{merchant.ordersCount} طلب</p>
                            <p className="text-xs text-muted-foreground">
                              {merchant.conversationsCount} محادثة
                            </p>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setSelectedMerchant(merchant)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleStatus(merchant)}
                            >
                              <Power
                                className={cn(
                                  "h-4 w-4",
                                  merchant.isActive
                                    ? "text-green-600"
                                    : "text-red-600",
                                )}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setMerchantToDelete(merchant);
                                setShowDeleteDialog(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="p-4 border-t">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Merchant Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة تاجر جديد</DialogTitle>
            <DialogDescription>أدخل بيانات التاجر الجديد</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">اسم المتجر</label>
              <Input
                placeholder="مثال: متجر الموضة"
                value={newMerchant.tradeName}
                onChange={(e) =>
                  setNewMerchant({ ...newMerchant, tradeName: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">رقم WhatsApp</label>
              <Input
                placeholder="+201234567890"
                dir="ltr"
                value={newMerchant.whatsappNumber}
                onChange={(e) =>
                  setNewMerchant({
                    ...newMerchant,
                    whatsappNumber: e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">البريد الإلكتروني</label>
              <Input
                type="email"
                placeholder="store@example.com"
                dir="ltr"
                value={newMerchant.email}
                onChange={(e) =>
                  setNewMerchant({ ...newMerchant, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">الفئة</label>
              <Select
                value={newMerchant.category}
                onValueChange={(value) =>
                  setNewMerchant({ ...newMerchant, category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفئة" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">الميزانية اليومية</label>
              <Input
                type="number"
                placeholder="100000"
                value={newMerchant.dailyBudget}
                onChange={(e) =>
                  setNewMerchant({
                    ...newMerchant,
                    dailyBudget: e.target.value,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              إنشاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Merchant Dialog */}
      <Dialog
        open={!!selectedMerchant}
        onOpenChange={() => setSelectedMerchant(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل التاجر</DialogTitle>
          </DialogHeader>
          {selectedMerchant && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary-100 flex items-center justify-center">
                  <Store className="h-8 w-8 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {selectedMerchant.tradeName}
                  </h3>
                  <Badge
                    className={cn(
                      selectedMerchant.isActive
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800",
                    )}
                  >
                    {selectedMerchant.isActive ? "نشط" : "معطل"}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">رقم WhatsApp</p>
                  <p className="font-medium" dir="ltr">
                    {selectedMerchant.whatsappNumber}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    البريد الإلكتروني
                  </p>
                  <p className="font-medium" dir="ltr">
                    {selectedMerchant.email}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">الفئة</p>
                  <p className="font-medium">
                    {categoryLabels[selectedMerchant.category]}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    الميزانية اليومية
                  </p>
                  <p className="font-medium">
                    {formatCurrency(selectedMerchant.dailyBudget)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    إجمالي الطلبات
                  </p>
                  <p className="font-medium">{selectedMerchant.ordersCount}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    إجمالي المحادثات
                  </p>
                  <p className="font-medium">
                    {selectedMerchant.conversationsCount}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">تاريخ الإنشاء</p>
                <p className="font-medium">
                  {formatDate(selectedMerchant.createdAt, "long")}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setSelectedMerchant(null)}
              className="w-full sm:w-auto"
            >
              إغلاق
            </Button>
            <Button className="w-full sm:w-auto">
              <Edit className="h-4 w-4" />
              تعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف التاجر "{merchantToDelete?.tradeName}"؟ هذا
              الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              className="w-full sm:w-auto"
            >
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
