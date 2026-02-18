"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoleAccess } from "@/hooks/use-role-access";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Package,
  Users,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  FileDown,
  FileUp,
  HelpCircle,
  Eye,
  Trash2,
  Play,
  Pause,
  Loader2,
  UtensilsCrossed,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { portalApi } from "@/lib/authenticated-api";
import {
  AiInsightsCard,
  generateImportExportInsights,
} from "@/components/ai/ai-insights-card";

interface BulkOperation {
  id: string;
  operationType: "IMPORT" | "EXPORT";
  resourceType:
    | "PRODUCTS"
    | "CUSTOMERS"
    | "INVENTORY"
    | "INGREDIENTS"
    | "products"
    | "customers"
    | "inventory"
    | "ingredients";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  totalRecords: number | null;
  processedRecords: number;
  successCount: number;
  errorCount: number;
  fileUrl?: string;
  resultUrl?: string;
  errors?: { row: number; field?: string; message?: string; error?: string }[];
  failureReason?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  createdBy: string;
}

const productFields = [
  { key: "sku", keyAr: "رقم sku", label: "رقم SKU", required: true },
  { key: "name", keyAr: "اسم المنتج", label: "اسم المنتج", required: true },
  {
    key: "name_en",
    keyAr: "الاسم بالإنجليزية",
    label: "الاسم بالإنجليزية",
    required: false,
  },
  { key: "description", keyAr: "الوصف", label: "الوصف", required: false },
  { key: "price", keyAr: "السعر", label: "السعر", required: true },
  {
    key: "compare_price",
    keyAr: "السعر قبل الخصم",
    label: "السعر قبل الخصم",
    required: false,
  },
  { key: "category", keyAr: "الفئة", label: "الفئة", required: false },
  {
    key: "variants",
    keyAr: "المتغيرات",
    label: "المتغيرات (اللون، المقاس)",
    required: false,
  },
  {
    key: "inventory",
    keyAr: "الكمية المتوفرة",
    label: "الكمية المتوفرة",
    required: false,
  },
  {
    key: "images",
    keyAr: "روابط الصور",
    label: "روابط الصور",
    required: false,
  },
  {
    key: "status",
    keyAr: "الحالة",
    label: "الحالة (active/inactive)",
    required: false,
  },
];

const customerFields = [
  { key: "phone", keyAr: "رقم الهاتف", label: "رقم الهاتف", required: true },
  { key: "name", keyAr: "الاسم", label: "الاسم", required: false },
  {
    key: "email",
    keyAr: "البريد الإلكتروني",
    label: "البريد الإلكتروني",
    required: false,
  },
  { key: "city", keyAr: "المدينة", label: "المدينة", required: false },
  { key: "address", keyAr: "العنوان", label: "العنوان", required: false },
  { key: "tags", keyAr: "الوسوم", label: "الوسوم", required: false },
  { key: "notes", keyAr: "ملاحظات", label: "ملاحظات", required: false },
];

const inventoryFields = [
  { key: "sku", keyAr: "رقم sku", label: "رقم SKU", required: true },
  {
    key: "quantity",
    keyAr: "الكمية",
    label: "الكمية (مطلوبة إذا لم تُرسل بيانات الصلاحية)",
    required: false,
  },
  {
    key: "operation",
    keyAr: "العملية",
    label: "العملية (set/add/subtract)",
    required: false,
  },
  {
    key: "expiry_date",
    keyAr: "تاريخ الصلاحية",
    label: "تاريخ الصلاحية (YYYY-MM-DD)",
    required: false,
  },
  {
    key: "is_perishable",
    keyAr: "قابل للتلف",
    label: "منتج قابل للتلف (true/false)",
    required: false,
  },
  { key: "location", keyAr: "الموقع", label: "الموقع", required: false },
];

const ingredientFields = [
  {
    key: "product_sku",
    keyAr: "رقم المنتج",
    label: "رقم SKU للمنتج الأب",
    required: true,
  },
  {
    key: "ingredient_name",
    keyAr: "اسم المكون",
    label: "اسم المكون",
    required: true,
  },
  {
    key: "ingredient_sku",
    keyAr: "رقم المكون",
    label: "رقم SKU للمكون (اختياري)",
    required: false,
  },
  {
    key: "quantity_required",
    keyAr: "الكمية المطلوبة",
    label: "الكمية المطلوبة لكل وحدة",
    required: true,
  },
  {
    key: "unit",
    keyAr: "الوحدة",
    label: "الوحدة (piece/kg/g/ml/L)",
    required: false,
  },
  {
    key: "is_optional",
    keyAr: "اختياري",
    label: "مكون اختياري (true/false)",
    required: false,
  },
  {
    key: "waste_factor",
    keyAr: "معامل الهدر",
    label: "معامل الهدر (1.0 = بدون هدر)",
    required: false,
  },
  { key: "notes", keyAr: "ملاحظات", label: "ملاحظات", required: false },
];

export default function BulkOperationsPage() {
  const [operations, setOperations] = useState<BulkOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("products");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importOptions, setImportOptions] = useState({
    updateExisting: true,
    dryRun: false,
    skipErrors: false,
  });
  const [selectedOperation, setSelectedOperation] =
    useState<BulkOperation | null>(null);
  const { toast } = useToast();
  const { canImport, canExport } = useRoleAccess("import-export");

  const fetchOperations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await portalApi.getBulkOperations();
      setOperations(data.operations || data || []);
    } catch (error) {
      console.error("Failed to fetch bulk operations:", error);
      toast({
        title: "خطأ",
        description: "فشل في تحميل العمليات المجمعة",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchOperations();
  }, [fetchOperations]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".csv")) {
        toast({
          title: "خطأ",
          description: "يجب أن يكون الملف بصيغة CSV",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast({
        title: "خطأ",
        description: "يرجى اختيار ملف",
        variant: "destructive",
      });
      return;
    }

    try {
      const resourceType = activeTab.toUpperCase() as
        | "PRODUCTS"
        | "CUSTOMERS"
        | "INVENTORY"
        | "INGREDIENTS";

      // Starting import

      const importOptions_api = {
        updateExisting: importOptions.updateExisting,
        dryRun: importOptions.dryRun,
      };

      let result;
      switch (resourceType) {
        case "PRODUCTS":
          result = await portalApi.importProducts(
            selectedFile,
            importOptions_api,
          );
          break;
        case "CUSTOMERS":
          result = await portalApi.importCustomers(
            selectedFile,
            importOptions_api,
          );
          break;
        case "INVENTORY":
          result = await portalApi.importInventory(
            selectedFile,
            importOptions_api,
          );
          break;
        case "INGREDIENTS":
          result = await portalApi.importIngredients(
            selectedFile,
            importOptions_api,
          );
          break;
      }

      // Import completed

      setIsImportOpen(false);
      setSelectedFile(null);

      // Show detailed result if available
      if (result?.operation) {
        const op = result.operation;
        if (op.errorCount > 0 && op.errors?.length > 0) {
          toast({
            title: `تم الاستيراد مع ${op.errorCount} خطأ`,
            description: `نجح: ${op.successCount} | فشل: ${op.errorCount} — راجع سجل العمليات للتفاصيل`,
            variant: "destructive",
          });
        } else if (importOptions.dryRun) {
          toast({
            title: "نتيجة التشغيل التجريبي",
            description: `${op.successCount || result.totalRecords || 0} سجل جاهز للاستيراد بدون أخطاء`,
          });
        } else {
          toast({
            title: "تم الاستيراد بنجاح",
            description: `تم معالجة ${op.successCount || op.totalRecords || 0} سجل بنجاح`,
          });
        }
      } else {
        toast({ title: "بدأ الاستيراد", description: "يتم معالجة الملف..." });
      }
      fetchOperations();
    } catch (error: any) {
      console.error("Import error:", error);
      // Extract detailed error info from API response
      let errorDetail = "فشل في بدء عملية الاستيراد";
      if (error?.response?.data?.message) {
        errorDetail = error.response.data.message;
      } else if (error?.message) {
        errorDetail = error.message;
      }
      // Check if error has specific field/row info
      if (error?.response?.data?.errors?.length > 0) {
        const firstErrors = error.response.data.errors.slice(0, 3);
        const errorLines = firstErrors
          .map(
            (e: any) =>
              `صف ${e.row}: ${e.field ? e.field + " — " : ""}${e.message || e.error}`,
          )
          .join("\n");
        errorDetail += `\n${errorLines}`;
        if (error.response.data.errors.length > 3) {
          errorDetail += `\n+${error.response.data.errors.length - 3} أخطاء أخرى`;
        }
      }
      toast({
        title: "فشل الاستيراد",
        description: errorDetail,
        variant: "destructive",
      });
    }
  };

  const handleExport = async (
    resourceType: "PRODUCTS" | "CUSTOMERS" | "INVENTORY" | "INGREDIENTS",
  ) => {
    const labels = {
      PRODUCTS: "المنتجات",
      CUSTOMERS: "العملاء",
      INVENTORY: "المخزون",
      INGREDIENTS: "المكونات",
    };

    toast({
      title: "بدأ التصدير",
      description: `يتم تصدير ${labels[resourceType]}...`,
    });

    try {
      let blob: Blob;
      let filename: string;

      switch (resourceType) {
        case "PRODUCTS":
          blob = await portalApi.exportProducts("csv");
          filename = `products_export_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.csv`;
          break;
        case "CUSTOMERS":
          blob = await portalApi.exportCustomers("csv");
          filename = `customers_export_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.csv`;
          break;
        case "INVENTORY":
          blob = await portalApi.exportInventory("csv");
          filename = `inventory_export_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.csv`;
          break;
        case "INGREDIENTS":
          blob = await portalApi.exportIngredients("csv");
          filename = `ingredients_export_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.csv`;
          break;
        default:
          throw new Error("Unknown resource type");
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "تم التصدير", description: "تم تحميل الملف بنجاح" });
      fetchOperations();
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل في تصدير الملف",
        variant: "destructive",
      });
    }
  };

  const handleCancel = (operationId: string) => {
    setOperations((ops) =>
      ops.map((op) =>
        op.id === operationId ? { ...op, status: "CANCELLED" } : op,
      ),
    );
    toast({ title: "تم الإلغاء", description: "تم إلغاء العملية" });
  };

  const getStatusBadge = (status: BulkOperation["status"]) => {
    switch (status) {
      case "COMPLETED":
        return (
          <Badge className="bg-green-500">
            <CheckCircle className="w-3 h-3 mr-1" /> مكتمل
          </Badge>
        );
      case "PROCESSING":
        return (
          <Badge className="bg-blue-500">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> جاري المعالجة
          </Badge>
        );
      case "FAILED":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" /> فشل
          </Badge>
        );
      case "CANCELLED":
        return (
          <Badge variant="secondary">
            <Pause className="w-3 h-3 mr-1" /> ملغي
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" /> قيد الانتظار
          </Badge>
        );
    }
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return "-";
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(dateString));
  };

  const getFieldsForType = () => {
    switch (activeTab) {
      case "products":
        return productFields;
      case "customers":
        return customerFields;
      case "inventory":
        return inventoryFields;
      case "ingredients":
        return ingredientFields;
      default:
        return productFields;
    }
  };

  const downloadTemplate = (type: string) => {
    let fields: { key: string; label: string; required: boolean }[] = [];
    let filename = "";

    switch (type) {
      case "products":
        fields = productFields;
        filename = "products_template.csv";
        break;
      case "customers":
        fields = customerFields;
        filename = "customers_template.csv";
        break;
      case "inventory":
        fields = inventoryFields;
        filename = "inventory_template.csv";
        break;
      case "ingredients":
        fields = ingredientFields;
        filename = "ingredients_template.csv";
        break;
    }

    // Create CSV header row
    const header = fields.map((f) => f.key).join(",");
    // Create example row
    const exampleRow = fields
      .map((f) => {
        if (f.key === "sku") return "SKU001";
        if (f.key === "name") return "اسم المنتج";
        if (f.key === "nameEn") return "Product Name";
        if (f.key === "price") return "100";
        if (f.key === "phone") return "+966501234567";
        if (f.key === "quantity") return "50";
        if (f.key === "operation") return "set";
        if (f.key === "expiry_date") return "2026-12-31";
        if (f.key === "is_perishable") return "true";
        return "";
      })
      .join(",");

    const csvContent = `${header}\n${exampleRow}`;
    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({ title: "تم التحميل", description: "تم تحميل نموذج CSV" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="استيراد وتصدير البيانات"
        description="إدارة البيانات بالجملة عبر ملفات CSV"
        actions={
          <Button variant="outline" onClick={fetchOperations}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        }
      />

      {/* AI Import/Export Insights */}
      <AiInsightsCard
        title="مساعد الاستيراد والتصدير"
        insights={generateImportExportInsights({
          totalOperations: operations.length,
          failedOperations: operations.filter((op) => op.status === "FAILED")
            .length,
        })}
        loading={loading}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            المنتجات
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            العملاء
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            المخزون
          </TabsTrigger>
          <TabsTrigger value="ingredients" className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4" />
            المكونات
          </TabsTrigger>
        </TabsList>

        {["products", "customers", "inventory", "ingredients"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-6 space-y-6">
            {/* Action Cards */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Import Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileUp className="h-5 w-5 text-green-500" />
                    استيراد{" "}
                    {tab === "products"
                      ? "المنتجات"
                      : tab === "customers"
                        ? "العملاء"
                        : tab === "ingredients"
                          ? "المكونات"
                          : "المخزون"}
                  </CardTitle>
                  <CardDescription>
                    رفع ملف CSV لإضافة أو تحديث البيانات
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      اسحب ملف CSV هنا أو انقر للاختيار
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                  {selectedFile && (
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-green-500" />
                        <span className="text-sm">{selectedFile.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedFile(null)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full" disabled={!selectedFile}>
                        <Upload className="h-4 w-4" />
                        استيراد
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>خيارات الاستيراد</DialogTitle>
                        <DialogDescription>
                          اختر كيفية معالجة البيانات
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>تحديث السجلات الموجودة</Label>
                            <p className="text-sm text-muted-foreground">
                              تحديث البيانات إذا كان SKU موجود
                            </p>
                          </div>
                          <Switch
                            checked={importOptions.updateExisting}
                            onCheckedChange={(v) =>
                              setImportOptions({
                                ...importOptions,
                                updateExisting: v,
                              })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>تشغيل تجريبي</Label>
                            <p className="text-sm text-muted-foreground">
                              التحقق من الأخطاء دون حفظ البيانات
                            </p>
                          </div>
                          <Switch
                            checked={importOptions.dryRun}
                            onCheckedChange={(v) =>
                              setImportOptions({ ...importOptions, dryRun: v })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>تخطي الأخطاء</Label>
                            <p className="text-sm text-muted-foreground">
                              متابعة الاستيراد عند وجود أخطاء
                            </p>
                          </div>
                          <Switch
                            checked={importOptions.skipErrors}
                            onCheckedChange={(v) =>
                              setImportOptions({
                                ...importOptions,
                                skipErrors: v,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setIsImportOpen(false)}
                        >
                          إلغاء
                        </Button>
                        <Button onClick={handleImport} disabled={!canImport}>
                          بدء الاستيراد
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Export Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileDown className="h-5 w-5 text-blue-500" />
                    تصدير{" "}
                    {tab === "products"
                      ? "المنتجات"
                      : tab === "customers"
                        ? "العملاء"
                        : tab === "ingredients"
                          ? "المكونات"
                          : "المخزون"}
                  </CardTitle>
                  <CardDescription>تحميل البيانات كملف CSV</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>الصيغة</Label>
                    <Select defaultValue="csv">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="csv">CSV</SelectItem>
                        <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                        <SelectItem value="json">JSON</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>الحقول</Label>
                    <Select defaultValue="all">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع الحقول</SelectItem>
                        <SelectItem value="basic">الحقول الأساسية</SelectItem>
                        <SelectItem value="custom">اختيار مخصص</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => handleExport(tab.toUpperCase() as any)}
                    disabled={!canExport}
                  >
                    <Download className="h-4 w-4" />
                    تصدير
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Field Reference */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  مرجع الحقول
                </CardTitle>
                <CardDescription>
                  الحقول المتاحة في ملف CSV - يمكنك استخدام الاسم بالعربية أو
                  الإنجليزية
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم الحقل (إنجليزي)</TableHead>
                      <TableHead>اسم الحقل (عربي)</TableHead>
                      <TableHead>الوصف</TableHead>
                      <TableHead>مطلوب</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFieldsForType().map((field: any) => (
                      <TableRow key={field.key}>
                        <TableCell className="font-mono text-sm">
                          {field.key}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {field.keyAr}
                        </TableCell>
                        <TableCell>{field.label}</TableCell>
                        <TableCell>
                          {field.required ? (
                            <Badge className="bg-red-500">مطلوب</Badge>
                          ) : (
                            <Badge variant="outline">اختياري</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4">
                  {canImport && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadTemplate(tab)}
                    >
                      <Download className="h-4 w-4" />
                      تحميل نموذج CSV
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Operations History */}
      <Card>
        <CardHeader>
          <CardTitle>سجل العمليات</CardTitle>
          <CardDescription>آخر عمليات الاستيراد والتصدير</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>النوع</TableHead>
                <TableHead>المورد</TableHead>
                <TableHead>الملف</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>التقدم</TableHead>
                <TableHead>النتيجة</TableHead>
                <TableHead>الوقت</TableHead>
                <TableHead className="text-end">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {operations.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    لا توجد عمليات بعد
                  </TableCell>
                </TableRow>
              ) : (
                operations.map((op) => {
                  const progress = op.totalRecords
                    ? Math.round((op.processedRecords / op.totalRecords) * 100)
                    : 0;
                  const resourceLabel =
                    op.resourceType?.toUpperCase() === "PRODUCTS" ||
                    op.resourceType === "products"
                      ? "المنتجات"
                      : op.resourceType?.toUpperCase() === "CUSTOMERS" ||
                          op.resourceType === "customers"
                        ? "العملاء"
                        : op.resourceType?.toUpperCase() === "INGREDIENTS" ||
                            op.resourceType === "ingredients"
                          ? "المكونات"
                          : "المخزون";
                  return (
                    <TableRow key={op.id}>
                      <TableCell>
                        {op.operationType === "IMPORT" ? (
                          <Badge variant="outline" className="bg-green-50">
                            <FileUp className="w-3 h-3 mr-1" />
                            استيراد
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-50">
                            <FileDown className="w-3 h-3 mr-1" />
                            تصدير
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{resourceLabel}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {op.fileUrl ? "CSV" : "-"}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(op.status)}
                        {op.status === "FAILED" && op.failureReason && (
                          <p
                            className="text-[11px] text-red-500 mt-1 max-w-[180px] truncate"
                            title={op.failureReason}
                          >
                            {op.failureReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="w-24">
                          <Progress value={progress} className="h-2" />
                          <span className="text-xs text-muted-foreground">
                            {progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="text-green-600">
                            {op.successCount} ✓
                          </span>
                          {op.errorCount > 0 && (
                            <>
                              <span className="text-muted-foreground"> / </span>
                              <span className="text-red-600">
                                {op.errorCount} ✗
                              </span>
                            </>
                          )}
                        </div>
                        {/* Inline error summary */}
                        {op.errors && op.errors.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {op.errors.slice(0, 2).map((err, i) => (
                              <p
                                key={i}
                                className="text-[11px] text-red-500 truncate max-w-[200px]"
                                title={`صف ${err.row}: ${err.field ? err.field + " — " : ""}${err.message || err.error || ""}`}
                              >
                                صف {err.row}:{" "}
                                {err.field ? `${err.field} — ` : ""}
                                {err.message || err.error || ""}
                              </p>
                            ))}
                            {op.errors.length > 2 && (
                              <p className="text-[11px] text-muted-foreground">
                                +{op.errors.length - 2} أخطاء أخرى...
                              </p>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatTime(op.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {op.status === "COMPLETED" &&
                            op.operationType === "EXPORT" &&
                            op.resultUrl && (
                              <Button variant="ghost" size="icon">
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                          {op.errors && op.errors.length > 0 && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedOperation(op)}
                                >
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>
                                    الأخطاء ({op.errors.length})
                                  </DialogTitle>
                                  <DialogDescription>
                                    الأخطاء التي حدثت أثناء المعالجة
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="max-h-96 overflow-y-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>الصف</TableHead>
                                        <TableHead>الحقل</TableHead>
                                        <TableHead>الخطأ</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {op.errors.map((error, i) => (
                                        <TableRow key={i}>
                                          <TableCell className="font-mono">
                                            {error.row}
                                          </TableCell>
                                          <TableCell className="font-mono">
                                            {error.field || "-"}
                                          </TableCell>
                                          <TableCell className="text-red-600">
                                            {error.message ||
                                              error.error ||
                                              "خطأ غير محدد"}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                          {op.status === "PROCESSING" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCancel(op.id)}
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle>نصائح للاستيراد</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>تأكد من أن الملف بصيغة CSV مع ترميز UTF-8</li>
            <li>الصف الأول يجب أن يحتوي على أسماء الأعمدة</li>
            <li>استخدم الفاصلة (,) كفاصل بين الأعمدة</li>
            <li>للمتغيرات المتعددة، استخدم الشرطة المائلة (|) كفاصل</li>
            <li>حقل SKU هو المعرف الفريد لتحديث المنتجات الموجودة</li>
            <li>
              استخدم خيار "تشغيل تجريبي" للتحقق من الأخطاء قبل الاستيراد الفعلي
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
