"use client";

import { useState, useCallback, useRef } from "react";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ScanLine,
  Receipt,
  Package,
  Pill,
  FileText,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  Trash2,
  ImageIcon,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { visionApi } from "@/lib/api";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";

interface ReceiptData {
  senderName: string | null;
  senderAccount: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
  amount: number | null;
  currency: string | null;
  referenceNumber: string | null;
  transactionDate: string | null;
  paymentMethod: string | null;
  confidence: number;
}
interface ProductData {
  productName: string | null;
  productNameAr: string | null;
  category: string | null;
  brand: string | null;
  colors: string[];
  sizes: string[];
  suggestedPrice: number | null;
  description: string | null;
  descriptionAr: string | null;
  confidence: number;
}
interface MedicineData {
  medicineName: string | null;
  medicineNameAr: string | null;
  activeIngredient: string | null;
  dosage: string | null;
  form: string | null;
  manufacturer: string | null;
  instructions: string | null;
  warnings: string[];
  confidence: number;
}
interface AnalysisResult {
  receipt?: ReceiptData;
  product?: ProductData;
  medicine?: MedicineData;
  text?: string;
  lines?: string[];
  rawText?: string;
  error?: string;
}

const tabs = [
  {
    id: "receipt",
    label: "إيصال الدفع",
    icon: Receipt,
    description: "تحليل إيصالات InstaPay والتحويلات البنكية",
  },
  {
    id: "product",
    label: "منتج",
    icon: Package,
    description: "تحليل صور المنتجات لإضافتها للكتالوج",
  },
  {
    id: "medicine",
    label: "دواء",
    icon: Pill,
    description: "تحليل صور الأدوية والمستحضرات الطبية",
  },
  {
    id: "text",
    label: "نص عام",
    icon: FileText,
    description: "استخراج النص من أي صورة (OCR)",
  },
];

export default function VisionPage() {
  const { apiKey } = useMerchant();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("receipt");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "خطأ",
          description:
            "نوع الملف غير مدعوم. يرجى استخدام JPEG, PNG, WebP أو GIF",
          variant: "destructive",
        });
        return;
      }
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({
          title: "خطأ",
          description: "حجم الملف كبير جداً. الحد الأقصى 5MB",
          variant: "destructive",
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImagePreview(dataUrl);
        setImageBase64(dataUrl.split(",")[1]);
        setResult(null);
      };
      reader.readAsDataURL(file);
    },
    [toast],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const file = event.dataTransfer.files?.[0];
      if (file && file.type.startsWith("image/")) {
        const input = fileInputRef.current;
        if (input) {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          handleFileSelect({
            target: input,
          } as React.ChangeEvent<HTMLInputElement>);
        }
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  const clearImage = () => {
    setImageBase64(null);
    setImagePreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processImage = async () => {
    if (!apiKey || !imageBase64) {
      toast({
        title: "خطأ",
        description: "يرجى تحديد صورة أولاً",
        variant: "destructive",
      });
      return;
    }
    setProcessing(true);
    setResult(null);
    try {
      let response;
      switch (activeTab) {
        case "receipt":
          response = await visionApi.processReceipt(apiKey, imageBase64);
          setResult(
            response.success && response.data
              ? { receipt: response.data, rawText: response.rawText }
              : { error: response.error || "فشل في تحليل الإيصال" },
          );
          break;
        case "product":
          response = await visionApi.analyzeProduct(apiKey, imageBase64);
          setResult(
            response.success && response.data
              ? { product: response.data }
              : { error: response.error || "فشل في تحليل المنتج" },
          );
          break;
        case "medicine":
          response = await visionApi.analyzeMedicine(apiKey, imageBase64);
          setResult(
            response.success && response.data
              ? { medicine: response.data }
              : { error: response.error || "فشل في تحليل الدواء" },
          );
          break;
        case "text":
          response = await visionApi.extractText(apiKey, imageBase64);
          setResult(
            response.success
              ? { text: response.text, lines: response.lines }
              : { error: response.error || "فشل في استخراج النص" },
          );
          break;
      }
      toast({
        title: "تم",
        description: "تم التحليل بنجاح",
        variant: "success",
      });
    } catch (err) {
      console.error("Vision analysis failed:", err);
      setResult({ error: "حدث خطأ أثناء التحليل" });
      toast({
        title: "خطأ",
        description: "فشل في تحليل الصورة",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "تم", description: "تم النسخ" });
  };

  const ConfidenceBadge = ({ confidence }: { confidence: number }) => {
    const percent = Math.round(confidence * 100);
    const color =
      percent >= 80
        ? "bg-green-100 text-green-800"
        : percent >= 60
          ? "bg-yellow-100 text-yellow-800"
          : "bg-red-100 text-red-800";
    return (
      <Badge className={cn("flex items-center gap-1", color)}>
        {percent >= 80 ? (
          <CheckCircle className="h-3 w-3" />
        ) : (
          <AlertCircle className="h-3 w-3" />
        )}
        {percent}% دقة
      </Badge>
    );
  };

  const ResultField = ({
    label,
    value,
    copyable = false,
  }: {
    label: string;
    value: string | number | null | undefined;
    copyable?: boolean;
  }) => {
    if (!value) return null;
    const displayValue = typeof value === "number" ? value.toString() : value;
    return (
      <div className="flex justify-between items-start py-2 border-b last:border-0">
        <span className="text-muted-foreground text-sm">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-end font-medium">{displayValue}</span>
          {copyable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => copyToClipboard(displayValue)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الذكاء البصري"
        description="تحليل الصور واستخراج البيانات باستخدام الذكاء الاصطناعي"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              رفع صورة للتحليل
            </CardTitle>
            <CardDescription>
              اسحب وأفلت صورة أو اضغط لاختيار ملف
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs
              value={activeTab}
              onValueChange={(val) => {
                setActiveTab(val);
                setResult(null);
              }}
            >
              <TabsList className="grid grid-cols-4 w-full">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex items-center gap-1 text-xs sm:text-sm"
                  >
                    <tab.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {tabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id} className="mt-2">
                  <p className="text-sm text-muted-foreground">
                    {tab.description}
                  </p>
                </TabsContent>
              ))}
            </Tabs>

            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                "hover:border-primary/50 hover:bg-muted/50",
                imagePreview
                  ? "border-primary bg-muted/30"
                  : "border-muted-foreground/30",
              )}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileSelect}
              />
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="max-h-64 mx-auto rounded-lg shadow-md"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 left-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearImage();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="p-4 rounded-full bg-muted">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">
                      اسحب صورة هنا أو اضغط للاختيار
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      JPEG, PNG, WebP, GIF حتى 5MB
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={processImage}
              disabled={!imageBase64 || processing}
            >
              {processing ? (
                <>
                  <Loader2 className="h-5 w-5 ml-2 animate-spin" />
                  جاري التحليل...
                </>
              ) : (
                <>
                  <ScanLine className="h-5 w-5 ml-2" />
                  تحليل الصورة
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              نتائج التحليل
            </CardTitle>
          </CardHeader>
          <CardContent>
            {processing ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">جاري تحليل الصورة...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  قد يستغرق ذلك بضع ثوانٍ
                </p>
              </div>
            ) : result?.error ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                <p className="text-red-600 font-medium">{result.error}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  حاول رفع صورة أوضح
                </p>
              </div>
            ) : result?.receipt ? (
              <div className="space-y-1">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-medium">بيانات الإيصال</span>
                  <ConfidenceBadge confidence={result.receipt.confidence} />
                </div>
                <ResultField label="المرسل" value={result.receipt.senderName} />
                <ResultField
                  label="حساب المرسل"
                  value={result.receipt.senderAccount}
                  copyable
                />
                <ResultField
                  label="المستلم"
                  value={result.receipt.receiverName}
                />
                <ResultField
                  label="حساب المستلم"
                  value={result.receipt.receiverAccount}
                  copyable
                />
                <ResultField
                  label="المبلغ"
                  value={
                    result.receipt.amount
                      ? formatCurrency(
                          result.receipt.amount,
                          result.receipt.currency || "EGP",
                        )
                      : null
                  }
                />
                <ResultField
                  label="رقم المرجع"
                  value={result.receipt.referenceNumber}
                  copyable
                />
                <ResultField
                  label="التاريخ"
                  value={result.receipt.transactionDate}
                />
                <ResultField
                  label="طريقة الدفع"
                  value={result.receipt.paymentMethod}
                />
              </div>
            ) : result?.product ? (
              <div className="space-y-1">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-medium">بيانات المنتج</span>
                  <ConfidenceBadge confidence={result.product.confidence} />
                </div>
                <ResultField
                  label="اسم المنتج"
                  value={result.product.productName}
                />
                <ResultField
                  label="الاسم بالعربية"
                  value={result.product.productNameAr}
                />
                <ResultField label="التصنيف" value={result.product.category} />
                <ResultField
                  label="العلامة التجارية"
                  value={result.product.brand}
                />
                <ResultField
                  label="الألوان"
                  value={result.product.colors?.join(", ")}
                />
                <ResultField
                  label="المقاسات"
                  value={result.product.sizes?.join(", ")}
                />
                <ResultField
                  label="السعر المقترح"
                  value={
                    result.product.suggestedPrice
                      ? formatCurrency(result.product.suggestedPrice, "EGP")
                      : null
                  }
                />
                {result.product.description && (
                  <div className="pt-4">
                    <Label className="text-muted-foreground">الوصف</Label>
                    <p className="mt-1 text-sm">{result.product.description}</p>
                  </div>
                )}
              </div>
            ) : result?.medicine ? (
              <div className="space-y-1">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-medium">بيانات الدواء</span>
                  <ConfidenceBadge confidence={result.medicine.confidence} />
                </div>
                <ResultField
                  label="اسم الدواء"
                  value={result.medicine.medicineName}
                />
                <ResultField
                  label="الاسم بالعربية"
                  value={result.medicine.medicineNameAr}
                />
                <ResultField
                  label="المادة الفعالة"
                  value={result.medicine.activeIngredient}
                />
                <ResultField label="الجرعة" value={result.medicine.dosage} />
                <ResultField
                  label="الشكل الدوائي"
                  value={result.medicine.form}
                />
                <ResultField
                  label="الشركة المصنعة"
                  value={result.medicine.manufacturer}
                />
                {result.medicine.instructions && (
                  <div className="pt-4">
                    <Label className="text-muted-foreground">التعليمات</Label>
                    <p className="mt-1 text-sm">
                      {result.medicine.instructions}
                    </p>
                  </div>
                )}
                {result.medicine.warnings &&
                  result.medicine.warnings.length > 0 && (
                    <div className="pt-4">
                      <Label className="text-muted-foreground text-red-600">
                        التحذيرات
                      </Label>
                      <ul className="mt-1 text-sm text-red-600 list-disc list-inside">
                        {result.medicine.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            ) : result?.text ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">النص المستخرج</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(result.text || "")}
                  >
                    <Copy className="h-4 w-4 ml-2" />
                    نسخ الكل
                  </Button>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <pre
                    className="whitespace-pre-wrap text-sm font-mono"
                    dir="auto"
                  >
                    {result.text}
                  </pre>
                </div>
                {result.lines && result.lines.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground">
                      الأسطر المكتشفة ({result.lines.length})
                    </Label>
                    <ul className="mt-2 space-y-1">
                      {result.lines.map((line, i) => (
                        <li
                          key={i}
                          className="text-sm flex justify-between items-center p-2 bg-muted/50 rounded"
                        >
                          <span dir="auto">{line}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(line)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ScanLine className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  ارفع صورة واضغط "تحليل" لاستخراج البيانات
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tabs.map((tab) => (
          <Card
            key={tab.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              activeTab === tab.id && "border-primary ring-1 ring-primary",
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "p-3 rounded-lg",
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                  )}
                >
                  <tab.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-medium">{tab.label}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {tab.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
