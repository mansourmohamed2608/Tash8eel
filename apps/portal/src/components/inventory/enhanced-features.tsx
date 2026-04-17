"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  FileSpreadsheet,
  Upload,
  Download,
  RefreshCw,
  History,
  Scan,
  Boxes,
  Tags,
  Percent,
  ArrowLeftRight,
  Warehouse,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Inventory Movement History Component
interface InventoryMovement {
  id: string;
  type: "in" | "out" | "adjustment" | "transfer";
  quantity: number;
  reason: string;
  reference?: string;
  createdAt: string;
  createdBy: string;
}

interface MovementHistoryProps {
  movements: InventoryMovement[];
  itemName: string;
}

export function MovementHistory({ movements, itemName }: MovementHistoryProps) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "in":
        return <TrendingUp className="h-4 w-4 text-[var(--accent-success)]" />;
      case "out":
        return <TrendingDown className="h-4 w-4 text-[var(--accent-danger)]" />;
      case "adjustment":
        return <RefreshCw className="h-4 w-4 text-[var(--accent-blue)]" />;
      case "transfer":
        return (
          <ArrowLeftRight className="h-4 w-4 text-[var(--accent-warning)]" />
        );
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, string> = {
      in: "bg-[color:rgba(34,197,94,0.12)] text-[var(--accent-success)]",
      out: "bg-[color:rgba(239,68,68,0.12)] text-[var(--accent-danger)]",
      adjustment: "bg-[color:rgba(59,130,246,0.12)] text-[var(--accent-blue)]",
      transfer: "bg-[color:rgba(45,107,228,0.10)] text-[var(--brand-blue)]",
    };
    const labels: Record<string, string> = {
      in: "إضافة",
      out: "صرف",
      adjustment: "تسوية",
      transfer: "نقل",
    };
    return (
      <Badge
        className={cn(
          "text-xs",
          variants[type] ||
            "bg-[var(--bg-surface-2)] text-[var(--text-secondary)]",
        )}
      >
        {labels[type] || type}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          سجل الحركات - {itemName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              لا توجد حركات مسجلة
            </p>
          ) : (
            movements.map((movement) => (
              <div
                key={movement.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                {getTypeIcon(movement.type)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getTypeBadge(movement.type)}
                    <span
                      className={cn(
                        "font-semibold",
                        movement.type === "in" ||
                          (movement.type === "adjustment" &&
                            movement.quantity > 0)
                          ? "text-green-600"
                          : "text-red-600",
                      )}
                    >
                      {movement.quantity > 0 ? "+" : ""}
                      {movement.quantity}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {movement.reason}
                  </p>
                  {movement.reference && (
                    <p className="text-xs text-muted-foreground">
                      مرجع: {movement.reference}
                    </p>
                  )}
                </div>
                <div className="text-left text-xs text-muted-foreground">
                  <p>
                    {new Date(movement.createdAt).toLocaleDateString("ar-SA")}
                  </p>
                  <p>{movement.createdBy}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Stock Transfer Dialog Component
interface VariantOption {
  id: string;
  name: string;
  sku: string;
  quantity_on_hand: number;
}

interface LocationOption {
  id: string;
  name: string;
  name_ar?: string;
}

interface StockTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: (data: {
    variantId?: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
    reason: string;
  }) => void;
  itemName?: string;
  currentStock?: number;
  locations?: LocationOption[];
  variants?: VariantOption[];
  selectedVariantId?: string;
}

export function StockTransferDialog({
  open,
  onOpenChange,
  onTransfer,
  itemName,
  currentStock,
  locations = [],
  variants = [],
  selectedVariantId,
}: StockTransferDialogProps) {
  const [variantId, setVariantId] = React.useState(selectedVariantId || "");
  const [fromLocationId, setFromLocationId] = React.useState("");
  const [toLocationId, setToLocationId] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [reason, setReason] = React.useState("");

  // Get selected variant info
  const selectedVariant = variants.find((v) => v.id === variantId);
  const displayName = selectedVariant?.name || itemName || "نقل المخزون";
  const displayStock = selectedVariant?.quantity_on_hand ?? currentStock ?? 0;

  // Reset variantId when dialog opens with a new selection
  React.useEffect(() => {
    if (open) {
      setVariantId(selectedVariantId || "");
      setFromLocationId("");
      setToLocationId("");
      setQuantity(1);
      setReason("");
    }
  }, [open, selectedVariantId]);

  const handleSubmit = () => {
    // Need either a pre-selected variant or a variant selected from the list
    const finalVariantId = variantId || selectedVariantId;
    if (
      fromLocationId &&
      toLocationId &&
      quantity > 0 &&
      fromLocationId !== toLocationId &&
      (finalVariantId || variants.length === 0)
    ) {
      onTransfer({
        variantId: finalVariantId,
        fromLocationId,
        toLocationId,
        quantity,
        reason,
      });
      onOpenChange(false);
      // Reset form
      setVariantId("");
      setFromLocationId("");
      setToLocationId("");
      setQuantity(1);
      setReason("");
    }
  };

  const needsVariantSelection = variants.length > 0 && !selectedVariantId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            نقل المخزون
          </DialogTitle>
          <DialogDescription>
            نقل المنتج: {displayName} (المتوفر: {displayStock})
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Variant selector - only show when no variant is pre-selected */}
          {needsVariantSelection && (
            <div className="grid gap-2">
              <Label htmlFor="variant">اختر المنتج</Label>
              <Select value={variantId} onValueChange={setVariantId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المنتج للنقل" />
                </SelectTrigger>
                <SelectContent>
                  {variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} ({v.sku}) - {v.quantity_on_hand} وحدة
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="fromLocation">من الموقع</Label>
            <Select value={fromLocationId} onValueChange={setFromLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الموقع المصدر" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem
                    key={loc.id}
                    value={loc.id}
                    disabled={loc.id === toLocationId}
                  >
                    {loc.name_ar || loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {locations.length === 0 && (
              <p className="text-xs text-muted-foreground">
                لا توجد مواقع مخزون بعد. أضف موقعاً أولاً.
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="toLocation">إلى الموقع</Label>
            <Select value={toLocationId} onValueChange={setToLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الموقع الوجهة" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem
                    key={loc.id}
                    value={loc.id}
                    disabled={loc.id === fromLocationId}
                  >
                    {loc.name_ar || loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="quantity">الكمية</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              max={displayStock}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reason">سبب النقل (اختياري)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="أدخل سبب النقل"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !fromLocationId ||
              !toLocationId ||
              quantity <= 0 ||
              fromLocationId === toLocationId ||
              (needsVariantSelection && !variantId)
            }
          >
            تأكيد النقل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Bulk Import Dialog Component
interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: File) => void;
}

export function BulkImportDialog({
  open,
  onOpenChange,
  onImport,
}: BulkImportDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (file) {
      onImport(file);
      onOpenChange(false);
      setFile(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            استيراد المخزون
          </DialogTitle>
          <DialogDescription>
            قم برفع ملف Excel أو CSV لتحديث المخزون بشكل مجمّع
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50",
              file && "border-green-500 bg-green-50",
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
            />
            {file ? (
              <div className="space-y-2">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-[var(--accent-success)]" />
                <p className="font-medium text-[var(--accent-success)]">
                  {file.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                <p className="font-medium">اسحب الملف هنا أو اضغط للاختيار</p>
                <p className="text-sm text-muted-foreground">
                  يدعم ملفات Excel و CSV
                </p>
              </div>
            )}
          </div>
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium mb-2">صيغة الملف المطلوبة:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>SKU (رمز المنتج) - مطلوب</li>
              <li>الكمية - مطلوب</li>
              <li>السعر (اختياري)</li>
              <li>حد المخزون المنخفض (اختياري)</li>
            </ul>
            <a
              href="/templates/inventory-template.xlsx"
              download
              className="inline-flex items-center text-sm text-primary hover:underline mt-2"
            >
              <Download className="h-3 w-3 ml-1" />
              تحميل قالب الملف
            </a>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={!file}>
            <Upload className="h-4 w-4 ml-2" />
            استيراد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Inventory Summary Cards Component
interface InventorySummaryCardsProps {
  summary: {
    totalItems: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    healthScore: number;
  };
  loading?: boolean;
}

export function InventorySummaryCards({
  summary,
  loading,
}: InventorySummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-16 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-[var(--accent-success)]";
    if (score >= 60) return "text-[var(--accent-warning)]";
    return "text-[var(--accent-danger)]";
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(value);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Boxes className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">إجمالي المنتجات</p>
              <p className="text-2xl font-bold">{summary.totalItems}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Warehouse className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">قيمة المخزون</p>
              <p className="text-2xl font-bold">
                {formatCurrency(summary.totalValue)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">مخزون منخفض</p>
              <p className="text-2xl font-bold">{summary.lowStockCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[var(--accent-gold-dim)] p-2">
              <BarChart3 className="h-5 w-5 text-[var(--accent-gold)]" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">صحة المخزون</p>
              <div className="flex items-center gap-2">
                <p
                  className={cn(
                    "text-2xl font-bold",
                    getHealthColor(summary.healthScore),
                  )}
                >
                  {summary.healthScore}%
                </p>
              </div>
              <Progress value={summary.healthScore} className="h-1 mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Quick Actions Panel for Inventory
interface QuickActionsPanelProps {
  onAddProduct: () => void;
  onBulkImport: () => void;
  onExport: () => void;
  onScanBarcode: () => void;
  onStockCount: () => void;
  canCreate?: boolean;
  canImport?: boolean;
  canExport?: boolean;
}

export function InventoryQuickActions({
  onAddProduct,
  onBulkImport,
  onExport,
  onScanBarcode,
  onStockCount,
  canCreate = true,
  canImport = true,
  canExport = true,
}: QuickActionsPanelProps) {
  const actions = [
    {
      icon: Package,
      label: "إضافة منتج",
      onClick: onAddProduct,
      disabled: !canCreate,
    },
    {
      icon: Upload,
      label: "استيراد مجمّع",
      onClick: onBulkImport,
      disabled: !canImport,
    },
    {
      icon: Download,
      label: "تصدير البيانات",
      onClick: onExport,
      disabled: !canExport,
    },
    {
      icon: Scan,
      label: "مسح الباركود",
      onClick: onScanBarcode,
      disabled: false,
    },
    // Viewing shrinkage/stock-count report should always be allowed, even in read-only mode.
    {
      icon: ClipboardList,
      label: "جرد المخزون",
      onClick: onStockCount,
      disabled: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="outline"
          className={cn(
            "h-10 justify-center gap-2 border-[var(--border-default)] bg-[var(--bg-surface-1)] px-3 text-[var(--text-secondary)] hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]",
            action.disabled && "cursor-not-allowed opacity-40",
          )}
          onClick={action.disabled ? undefined : action.onClick}
          disabled={action.disabled}
        >
          <action.icon className="h-4 w-4" />
          <span className="text-xs font-medium">{action.label}</span>
        </Button>
      ))}
    </div>
  );
}

// Category Management Component
interface CategoryBadgeProps {
  categories: Array<{ name: string; count: number; color?: string }>;
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
}

export function CategoryFilter({
  categories,
  selectedCategory,
  onSelect,
}: CategoryBadgeProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={selectedCategory === null ? "default" : "outline"}
        className="cursor-pointer hover:bg-primary/80"
        onClick={() => onSelect(null)}
      >
        <Tags className="h-3 w-3 ml-1" />
        الكل
      </Badge>
      {categories.map((cat) => (
        <Badge
          key={cat.name}
          variant={selectedCategory === cat.name ? "default" : "outline"}
          className={cn("cursor-pointer hover:bg-primary/80", cat.color)}
          onClick={() => onSelect(cat.name)}
        >
          {cat.name} ({cat.count})
        </Badge>
      ))}
    </div>
  );
}

// Price Tag Component
interface PriceTagProps {
  price: number;
  originalPrice?: number;
  currency?: string;
  size?: "sm" | "md" | "lg";
}

export function PriceTag({
  price,
  originalPrice,
  currency = "SAR",
  size = "md",
}: PriceTagProps) {
  const formatPrice = (value: number) =>
    new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency,
    }).format(value);

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  const hasDiscount = originalPrice && originalPrice > price;
  const discountPercent = hasDiscount
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;

  return (
    <div className="flex items-center gap-2">
      <span className={cn("font-bold", sizeClasses[size])}>
        {formatPrice(price)}
      </span>
      {hasDiscount && (
        <>
          <span className="text-muted-foreground line-through text-sm">
            {formatPrice(originalPrice)}
          </span>
          <Badge className="bg-red-500 text-white text-xs">
            <Percent className="h-3 w-3 ml-0.5" />
            {discountPercent}
          </Badge>
        </>
      )}
    </div>
  );
}

// Stock Level Indicator Component
interface StockLevelProps {
  current: number;
  threshold: number;
  max?: number;
  showLabel?: boolean;
}

export function StockLevel({
  current,
  threshold,
  max = 100,
  showLabel = true,
}: StockLevelProps) {
  const percentage = Math.min((current / max) * 100, 100);
  const status = current === 0 ? "out" : current <= threshold ? "low" : "ok";

  const statusConfig = {
    out: {
      color: "bg-[var(--accent-danger)]",
      label: "نفد",
      badge: "bg-[var(--danger-muted)] text-[var(--accent-danger)]",
    },
    low: {
      color: "bg-[var(--accent-warning)]",
      label: "منخفض",
      badge: "bg-[var(--warning-muted)] text-[var(--accent-warning)]",
    },
    ok: {
      color: "bg-[var(--accent-success)]",
      label: "متوفر",
      badge: "bg-[var(--success-muted)] text-[var(--accent-success)]",
    },
  };

  const config = statusConfig[status];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{current} وحدة</span>
        {showLabel && (
          <Badge className={cn("text-xs", config.badge)}>{config.label}</Badge>
        )}
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", config.color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {threshold > 0 && (
        <p className="text-xs text-muted-foreground">
          حد التنبيه: {threshold} وحدة
        </p>
      )}
    </div>
  );
}
