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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Pencil,
  Receipt,
  Calendar,
  DollarSign,
  RefreshCw,
  Filter,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";
import { authenticatedFetch } from "@/lib/client";
import {
  AiInsightsCard,
  generateExpenseInsights,
} from "@/components/ai/ai-insights-card";

interface Expense {
  id: string;
  category: string;
  subcategory?: string;
  amount: number;
  description?: string;
  expenseDate: string;
  isRecurring: boolean;
  recurringDay?: number;
  receiptUrl?: string;
  createdBy: string;
  createdAt: string;
}

interface ExpenseCategory {
  id: string;
  name: string;
  nameAr: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  inventory: "bg-blue-100 text-blue-800",
  purchases: "bg-blue-100 text-blue-800",
  shipping: "bg-yellow-100 text-yellow-800",
  marketing: "bg-purple-100 text-purple-800",
  rent: "bg-green-100 text-green-800",
  utilities: "bg-orange-100 text-orange-800",
  salaries: "bg-pink-100 text-pink-800",
  equipment: "bg-indigo-100 text-indigo-800",
  fees: "bg-red-100 text-red-800",
  other: "bg-gray-100 text-gray-800",
};

const CATEGORY_NAMES: Record<string, string> = {
  inventory: "المخزون",
  purchases: "مشتريات",
  shipping: "الشحن",
  marketing: "التسويق",
  rent: "الإيجار",
  utilities: "المرافق",
  salaries: "الرواتب",
  equipment: "المعدات",
  fees: "الرسوم",
  other: "أخرى",
};

const CATEGORY_ALIASES: Record<string, string> = {
  purchase: "purchases",
  purchases: "purchases",
  مشتريات: "purchases",
  المشتريات: "purchases",
  المخزون: "inventory",
  شحن: "shipping",
  الشحن: "shipping",
  تسويق: "marketing",
  التسويق: "marketing",
  ايجار: "rent",
  إيجار: "rent",
  الإيجار: "rent",
  مرتبات: "salaries",
  رواتب: "salaries",
  الرواتب: "salaries",
  مرافق: "utilities",
  المرافق: "utilities",
  معدات: "equipment",
  المعدات: "equipment",
  رسوم: "fees",
  الرسوم: "fees",
  أخرى: "other",
  اخرى: "other",
};

const normalizeCategoryKey = (value?: string): string => {
  if (!value) return "other";
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  return CATEGORY_ALIASES[trimmed] || CATEGORY_ALIASES[lowered] || lowered;
};

const getCategoryDisplayName = (value?: string): string => {
  const normalized = normalizeCategoryKey(value);
  return CATEGORY_NAMES[normalized] || CATEGORY_NAMES.other;
};

// Default categories as fallback
const DEFAULT_CATEGORIES: ExpenseCategory[] = [
  { id: "inventory", name: "المخزون", nameAr: "المخزون" },
  { id: "purchases", name: "مشتريات", nameAr: "مشتريات" },
  { id: "shipping", name: "الشحن", nameAr: "الشحن" },
  { id: "marketing", name: "التسويق", nameAr: "التسويق" },
  { id: "rent", name: "الإيجار", nameAr: "الإيجار" },
  { id: "utilities", name: "المرافق", nameAr: "المرافق" },
  { id: "salaries", name: "الرواتب", nameAr: "الرواتب" },
  { id: "equipment", name: "المعدات", nameAr: "المعدات" },
  { id: "fees", name: "الرسوم", nameAr: "الرسوم" },
  { id: "other", name: "أخرى", nameAr: "أخرى" },
];

export default function ExpensesPage() {
  const { merchantId, apiKey } = useMerchant();
  const { canCreate, canDelete, isReadOnly } = useRoleAccess("expenses");
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] =
    useState<ExpenseCategory[]>(DEFAULT_CATEGORIES);
  const [totalAmount, setTotalAmount] = useState(0);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [periodType, setPeriodType] = useState<"month" | "year" | "all">(
    "month",
  );
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedYear, setSelectedYear] = useState(() =>
    String(new Date().getFullYear()),
  );
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state (shared for add/edit)
  const emptyForm = {
    category: "",
    subcategory: "",
    amount: "",
    description: "",
    expenseDate: new Date().toISOString().split("T")[0],
    isRecurring: false,
  };
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchExpenses = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (periodType === "month") params.set("month", selectedMonth);
      else if (periodType === "year") params.set("year", selectedYear);
      // "all" sends no date filter
      if (filterCategory !== "all") params.append("category", filterCategory);
      const data = await authenticatedFetch<any>(
        `/api/v1/portal/expenses?${params}`,
        { apiKey },
      );
      setExpenses(data.expenses || []);
      setTotalAmount(data.totalAmount || 0);
      setByCategory(data.byCategory || {});
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
    } finally {
      setLoading(false);
    }
  }, [
    merchantId,
    apiKey,
    periodType,
    selectedMonth,
    selectedYear,
    filterCategory,
  ]);

  const fetchCategories = useCallback(async () => {
    if (!merchantId || !apiKey) return;
    try {
      const data = await authenticatedFetch<any>(
        "/api/v1/portal/expenses/categories",
        { apiKey },
      );
      if (data.categories?.length > 0) setCategories(data.categories);
    } catch {
      // Keep default categories on error
    }
  }, [merchantId, apiKey]);

  useEffect(() => {
    fetchExpenses();
    fetchCategories();
  }, [fetchExpenses, fetchCategories]);

  // ── Add ──
  const openAddDialog = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setIsAddDialogOpen(true);
  };

  const handleAddExpense = async () => {
    const parsed = parseFloat(formData.amount);
    if (!merchantId || !apiKey || !formData.category || !parsed || parsed <= 0)
      return;
    try {
      setSubmitting(true);
      await authenticatedFetch("/api/v1/portal/expenses", {
        method: "POST",
        apiKey,
        body: {
          category: formData.category,
          subcategory: formData.subcategory || undefined,
          amount: parsed,
          description: formData.description || undefined,
          expenseDate: formData.expenseDate,
          isRecurring: formData.isRecurring,
        },
      });
      setIsAddDialogOpen(false);
      fetchExpenses();
    } catch (error) {
      console.error("Failed to add expense:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit ──
  const openEditDialog = (expense: Expense) => {
    setEditingId(expense.id);
    setFormData({
      category: expense.category,
      subcategory: expense.subcategory || "",
      amount: String(expense.amount),
      description: expense.description || "",
      expenseDate: expense.expenseDate
        ? new Date(expense.expenseDate).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      isRecurring: expense.isRecurring,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateExpense = async () => {
    const parsed = parseFloat(formData.amount);
    if (
      !merchantId ||
      !apiKey ||
      !editingId ||
      !formData.category ||
      !parsed ||
      parsed <= 0
    )
      return;
    try {
      setSubmitting(true);
      await authenticatedFetch(`/api/v1/portal/expenses/${editingId}`, {
        method: "PUT",
        apiKey,
        body: {
          category: formData.category,
          subcategory: formData.subcategory || undefined,
          amount: parsed,
          description: formData.description || undefined,
          expenseDate: formData.expenseDate,
          isRecurring: formData.isRecurring,
        },
      });
      setIsEditDialogOpen(false);
      setEditingId(null);
      fetchExpenses();
    } catch (error) {
      console.error("Failed to update expense:", error);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ──
  const handleDeleteExpense = async () => {
    if (!merchantId || !apiKey || !deleteTarget) return;
    try {
      await authenticatedFetch(`/api/v1/portal/expenses/${deleteTarget.id}`, {
        method: "DELETE",
        apiKey,
      });
      setDeleteTarget(null);
      fetchExpenses();
    } catch (error) {
      console.error("Failed to delete expense:", error);
    }
  };

  // ── Form fields (reused for Add + Edit) ──
  const renderFormFields = () => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label>الفئة *</Label>
        <Select
          value={formData.category}
          onValueChange={(v) => setFormData((p) => ({ ...p, category: v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="اختر الفئة" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.nameAr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>المبلغ (ج.م) *</Label>
        <Input
          type="number"
          min="0.01"
          step="0.01"
          placeholder="100.00"
          value={formData.amount}
          onChange={(e) =>
            setFormData((p) => ({ ...p, amount: e.target.value }))
          }
        />
      </div>
      <div className="grid gap-2">
        <Label>الوصف</Label>
        <Input
          placeholder="وصف المصروف (اختياري)"
          value={formData.description}
          onChange={(e) =>
            setFormData((p) => ({ ...p, description: e.target.value }))
          }
        />
      </div>
      <div className="grid gap-2">
        <Label>التاريخ</Label>
        <Input
          type="date"
          value={formData.expenseDate}
          onChange={(e) =>
            setFormData((p) => ({ ...p, expenseDate: e.target.value }))
          }
        />
      </div>
    </div>
  );

  const isFormValid =
    formData.category && formData.amount && parseFloat(formData.amount) > 0;

  const columns = [
    {
      key: "expenseDate",
      header: "التاريخ",
      render: (item: Expense) => (
        <span className="text-sm">
          {new Date(item.expenseDate).toLocaleDateString("ar-EG")}
        </span>
      ),
    },
    {
      key: "category",
      header: "الفئة",
      render: (item: Expense) => {
        const normalizedCategory = normalizeCategoryKey(item.category);
        return (
          <Badge
            className={cn(
              "font-normal",
              CATEGORY_COLORS[normalizedCategory] || CATEGORY_COLORS.other,
            )}
          >
            {getCategoryDisplayName(item.category)}
          </Badge>
        );
      },
    },
    {
      key: "description",
      header: "الوصف",
      render: (item: Expense) => (
        <span className="text-sm text-muted-foreground">
          {item.description || "-"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "المبلغ",
      render: (item: Expense) => (
        <span className="font-semibold text-red-600">
          - {formatCurrency(item.amount)}
        </span>
      ),
    },
    {
      key: "isRecurring",
      header: "متكرر",
      render: (item: Expense) =>
        item.isRecurring ? <Badge variant="outline">متكرر</Badge> : null,
    },
    {
      key: "actions",
      header: "",
      render: (item: Expense) => (
        <div className="flex gap-1">
          {canCreate && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openEditDialog(item)}
              title="تعديل"
            >
              <Pencil className="h-4 w-4 text-blue-500" />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteTarget(item)}
              title="حذف"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Period options
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("ar-EG", {
        month: "long",
        year: "numeric",
      }),
    });
  }
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) {
    years.push({ value: String(y), label: `${y}` });
  }
  const normalizedByCategory = Object.entries(byCategory).reduce(
    (acc, [category, amount]) => {
      const normalized = normalizeCategoryKey(category);
      acc[normalized] = (acc[normalized] || 0) + amount;
      return acc;
    },
    {} as Record<string, number>,
  );

  const sortedCategories = Object.entries(normalizedByCategory).sort(
    (a, b) => b[1] - a[1],
  );

  const prioritizedCategories = ["purchases", "inventory"].filter(
    (category) => (normalizedByCategory[category] || 0) > 0,
  );

  const summaryCategoryKeys = Array.from(
    new Set([
      ...prioritizedCategories,
      ...sortedCategories.map(([category]) => category),
    ]),
  ).filter((category) => (normalizedByCategory[category] || 0) > 0);

  const topCategories = summaryCategoryKeys.map(
    (category) =>
      [category, normalizedByCategory[category] || 0] as [string, number],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="المصروفات"
        description="إدارة وتتبع مصروفات العمل"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchExpenses}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4 ml-2" />
              تحديث
            </Button>
            {canCreate && (
              <Button
                size="sm"
                onClick={openAddDialog}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة مصروف
              </Button>
            )}
          </div>
        }
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div>
            <p className="app-hero-band__eyebrow">مصروفات وتشغيل</p>
            <h2 className="app-hero-band__title">
              رؤية مباشرة لتكلفة التشغيل وتوزيع الصرف
            </h2>
            <p className="app-hero-band__copy">
              راقب حجم الإنفاق، واعزل أكثر الفئات استهلاكًا، وراجع السجل المالي
              من نفس المساحة دون تفكيك السياق.
            </p>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                الإجمالي الحالي
              </span>
              <strong className="app-hero-band__metric-value">
                {formatCurrency(totalAmount)}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">عدد العمليات</span>
              <strong className="app-hero-band__metric-value">
                {expenses.length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                أعلى فئة إنفاق
              </span>
              <strong className="app-hero-band__metric-value">
                {topCategories[0]
                  ? getCategoryDisplayName(topCategories[0][0])
                  : "لا يوجد"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* AI Expense Insights */}
      <AiInsightsCard
        title="تحليلات المصروفات"
        insights={generateExpenseInsights({
          totalExpenses: totalAmount,
          expensesByCategory: normalizedByCategory,
          monthlyTrend: [expenses.length],
        })}
        loading={loading}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Card className="app-data-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {periodType === "month"
                ? "إجمالي الشهر"
                : periodType === "year"
                  ? "إجمالي السنة"
                  : "الإجمالي الكلي"}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              {expenses.length} مصروف
            </p>
          </CardContent>
        </Card>
        {topCategories.map(([category, amount]) => (
          <Card key={category} className="app-data-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {getCategoryDisplayName(category)}
              </CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(amount)}</div>
              <p className="text-xs text-muted-foreground">
                {totalAmount > 0 ? Math.round((amount / totalAmount) * 100) : 0}
                % من الإجمالي
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="app-data-card app-data-card--muted">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select
                value={periodType}
                onValueChange={(v: "month" | "year" | "all") =>
                  setPeriodType(v)
                }
              >
                <SelectTrigger className="w-full sm:w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">شهري</SelectItem>
                  <SelectItem value="year">سنوي</SelectItem>
                  <SelectItem value="all">الكل</SelectItem>
                </SelectContent>
              </Select>
              {periodType === "month" && (
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {periodType === "year" && (
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-full sm:w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y.value} value={y.value}>
                        {y.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الفئات</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card className="app-data-card">
        <CardHeader>
          <CardTitle>سجل المصروفات</CardTitle>
          <CardDescription>
            جميع المصروفات المسجلة للفترة المحددة
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              جاري التحميل...
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد مصروفات مسجلة لهذه الفترة
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {expenses.map((expense) => {
                  const normalizedCategory = normalizeCategoryKey(
                    expense.category,
                  );
                  return (
                    <div
                      key={expense.id}
                      className="space-y-3 rounded-lg border p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div>
                            <Badge
                              className={cn(
                                "font-normal",
                                CATEGORY_COLORS[normalizedCategory] ||
                                  CATEGORY_COLORS.other,
                              )}
                            >
                              {getCategoryDisplayName(expense.category)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(expense.expenseDate).toLocaleDateString(
                              "ar-EG",
                            )}
                          </p>
                        </div>
                        <p className="font-semibold text-red-600">
                          - {formatCurrency(expense.amount)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm">
                          {expense.description || "بدون وصف"}
                        </p>
                        {expense.isRecurring && (
                          <Badge variant="outline">متكرر</Badge>
                        )}
                      </div>
                      {(canCreate || canDelete) && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          {canCreate && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto"
                              onClick={() => openEditDialog(expense)}
                            >
                              <Pencil className="ml-2 h-4 w-4 text-blue-500" />
                              تعديل
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-red-600 sm:w-auto"
                              onClick={() => setDeleteTarget(expense)}
                            >
                              <Trash2 className="ml-2 h-4 w-4 text-red-500" />
                              حذف
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block">
                <DataTable columns={columns} data={expenses} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Add Dialog ── */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>إضافة مصروف جديد</DialogTitle>
            <DialogDescription>أدخل تفاصيل المصروف الجديد</DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleAddExpense}
              disabled={!isFormValid || submitting}
              className="w-full sm:w-auto"
            >
              {submitting ? "جاري الإضافة..." : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>تعديل المصروف</DialogTitle>
            <DialogDescription>عدّل تفاصيل المصروف</DialogDescription>
          </DialogHeader>
          {renderFormFields()}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleUpdateExpense}
              disabled={!isFormValid || submitting}
              className="w-full sm:w-auto"
            >
              {submitting ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المصروف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا المصروف؟
              {deleteTarget && (
                <span className="block mt-2 font-semibold text-foreground">
                  {getCategoryDisplayName(deleteTarget.category)} -{" "}
                  {formatCurrency(deleteTarget.amount)}
                </span>
              )}
              <span className="block mt-1 text-xs">
                لا يمكن التراجع عن هذا الإجراء.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogCancel className="w-full sm:w-auto">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto"
              onClick={handleDeleteExpense}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
