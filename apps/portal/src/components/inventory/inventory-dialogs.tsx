"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Scan } from "lucide-react";
import type {
  InventoryItem,
  InventoryVariant,
  ProductFormData,
  VariantFormData,
  WarehouseLocation,
} from "./types";

// ── Delete Location Dialog ──────────────────────────────────────────
interface DeleteLocationDialogProps {
  locationToDelete: { id: string; name: string; isDefault?: boolean } | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteLocationDialog({
  locationToDelete,
  onClose,
  onConfirm,
}: DeleteLocationDialogProps) {
  return (
    <Dialog
      open={!!locationToDelete}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف الموقع</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground">
          هل أنت متأكد من حذف &quot;{locationToDelete?.name}&quot;؟ سيتم إخفاؤه
          من القائمة.
        </p>
        {locationToDelete?.isDefault && (
          <p className="text-xs text-muted-foreground">
            سيتم تعيين موقع آخر كافتراضي تلقائياً إذا كان متوفراً.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            حذف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Stock Update Dialog ─────────────────────────────────────────────
interface StockUpdateDialogProps {
  open: boolean;
  onClose: () => void;
  selectedItem: InventoryItem | null;
  selectedVariant: InventoryVariant | null;
  stockChange: { quantity: number; type: string; reason: string };
  onStockChangeUpdate: (change: {
    quantity?: number;
    type?: string;
    reason?: string;
  }) => void;
  onConfirm: () => void;
  canEdit: boolean;
}

export function StockUpdateDialog({
  open,
  onClose,
  selectedItem,
  selectedVariant,
  stockChange,
  onStockChangeUpdate,
  onConfirm,
  canEdit,
}: StockUpdateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            تعديل المخزون - {selectedVariant?.name || selectedItem?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {selectedVariant && (
            <div className="rounded-lg bg-[var(--accent-blue-dim)] p-2 text-sm">
              <span className="text-[var(--accent-blue)]">متغير: </span>
              <span className="font-mono">{selectedVariant.sku}</span>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">الكمية الحالية</label>
            <p className="text-2xl font-bold">
              {selectedVariant?.quantity_on_hand ?? selectedItem?.stock ?? 0}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">نوع التعديل</label>
            <Select
              value={stockChange.type}
              onValueChange={(v) => onStockChangeUpdate({ type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">شراء (إضافة)</SelectItem>
                <SelectItem value="adjustment">تعديل</SelectItem>
                <SelectItem value="return">إرجاع</SelectItem>
                <SelectItem value="transfer">تحويل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">الكمية (سالبة للخصم)</label>
            <Input
              type="number"
              value={stockChange.quantity}
              onChange={(e) =>
                onStockChangeUpdate({ quantity: parseInt(e.target.value) || 0 })
              }
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-sm font-medium">السبب (اختياري)</label>
            <Input
              value={stockChange.reason}
              onChange={(e) => onStockChangeUpdate({ reason: e.target.value })}
              placeholder="سبب التعديل..."
            />
          </div>
          {stockChange.quantity !== 0 && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                الكمية الجديدة:{" "}
                <strong>
                  {(selectedVariant?.quantity_on_hand ??
                    selectedItem?.stock ??
                    0) + stockChange.quantity}
                </strong>
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canEdit || stockChange.quantity === 0}
          >
            تأكيد التعديل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Product Dialog ───────────────────────────────────────────
interface DeleteProductDialogProps {
  deleteItem: InventoryItem | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteProductDialog({
  deleteItem,
  onClose,
  onConfirm,
}: DeleteProductDialogProps) {
  return (
    <Dialog open={!!deleteItem} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف المنتج</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground">
          هل أنت متأكد من حذف &quot;{deleteItem?.name}&quot;؟ لا يمكن التراجع عن
          هذا الإجراء.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            حذف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add/Edit Product Dialog ─────────────────────────────────────────
interface ProductDialogProps {
  open: boolean;
  editItem: InventoryItem | null;
  formData: ProductFormData;
  skuError: string;
  saving: boolean;
  canCreate: boolean;
  canEdit: boolean;
  onFormChange: (data: Partial<ProductFormData>) => void;
  onSkuErrorClear: () => void;
  onClose: () => void;
  onSave: () => void;
}

export function ProductDialog({
  open,
  editItem,
  formData,
  skuError,
  saving,
  canCreate,
  canEdit,
  onFormChange,
  onSkuErrorClear,
  onClose,
  onSave,
}: ProductDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editItem ? "تعديل المنتج" : "إضافة منتج جديد"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">الرمز (SKU)</label>
            <Input
              value={formData.sku}
              onChange={(e) => {
                onFormChange({ sku: e.target.value });
                onSkuErrorClear();
              }}
              placeholder="SKU001"
              className={skuError ? "border-red-500" : ""}
            />
            {skuError && (
              <p className="text-sm text-red-500 mt-1">{skuError}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">الاسم</label>
            <Input
              value={formData.name}
              onChange={(e) => onFormChange({ name: e.target.value })}
              placeholder="اسم المنتج"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">سعر التكلفة</label>
              <Input
                type="number"
                value={formData.costPrice}
                onChange={(e) =>
                  onFormChange({ costPrice: parseFloat(e.target.value) || 0 })
                }
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground mt-1">سعر الشراء</p>
            </div>
            <div>
              <label className="text-sm font-medium">سعر البيع</label>
              <Input
                type="number"
                value={formData.price}
                onChange={(e) =>
                  onFormChange({ price: parseFloat(e.target.value) || 0 })
                }
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                سعر البيع للعميل
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">
                الكمية{editItem ? " (استخدم تعديل المخزون)" : ""}
              </label>
              <Input
                type="number"
                value={formData.stock}
                onChange={(e) =>
                  onFormChange({ stock: parseInt(e.target.value) || 0 })
                }
                placeholder="0"
                disabled={!!editItem}
              />
              {editItem && (
                <p className="text-xs text-muted-foreground mt-1">
                  لتعديل الكمية، استخدم زر تعديل المخزون
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">حد المخزون المنخفض</label>
              <Input
                type="number"
                value={formData.lowStockThreshold}
                onChange={(e) =>
                  onFormChange({
                    lowStockThreshold: parseInt(e.target.value) || 5,
                  })
                }
                placeholder="5"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">الفئة</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.category}
              onChange={(e) => onFormChange({ category: e.target.value })}
            >
              <option value="ملابس">ملابس</option>
              <option value="إلكترونيات">إلكترونيات</option>
              <option value="أغذية">أغذية</option>
              <option value="أدوات منزلية">أدوات منزلية</option>
              <option value="عام">عام</option>
            </select>
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">منتج قابل للتلف</label>
              <input
                type="checkbox"
                checked={!!formData.isPerishable}
                onChange={(e) => {
                  const checked = e.target.checked;
                  onFormChange({
                    isPerishable: checked,
                    expiryDate: checked ? formData.expiryDate : "",
                  });
                }}
                className="h-4 w-4"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                تاريخ الصلاحية (اختياري)
              </label>
              <Input
                type="date"
                value={formData.expiryDate || ""}
                onChange={(e) =>
                  onFormChange({
                    expiryDate: e.target.value,
                    isPerishable: e.target.value ? true : formData.isPerishable,
                  })
                }
                disabled={!formData.isPerishable}
              />
              <p className="text-xs text-muted-foreground mt-1">
                يُستخدم هذا التاريخ في صفحة تنبيهات الصلاحية.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || (editItem ? !canEdit : !canCreate)}
          >
            {saving ? "جاري الحفظ..." : editItem ? "حفظ التعديلات" : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Barcode Scanner Dialog ──────────────────────────────────────────
interface BarcodeScannerDialogProps {
  open: boolean;
  onClose: () => void;
  barcodeInput: string;
  onBarcodeInputChange: (value: string) => void;
  onSearch: () => void;
  searching: boolean;
}

export function BarcodeScannerDialog({
  open,
  onClose,
  barcodeInput,
  onBarcodeInputChange,
  onSearch,
  searching,
}: BarcodeScannerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            مسح الباركود
          </DialogTitle>
          <DialogDescription>
            أدخل رقم الباركود أو SKU للبحث عن المنتج
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Input
            placeholder="أدخل الباركود أو SKU..."
            value={barcodeInput}
            onChange={(e) => onBarcodeInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            autoFocus
            dir="ltr"
            className="text-center text-lg font-mono"
          />
          <p className="text-xs text-muted-foreground text-center">
            يمكنك استخدام قارئ الباركود مباشرة - سيتم البحث تلقائياً
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={onSearch}
            disabled={searching || !barcodeInput.trim()}
          >
            {searching ? "جاري البحث..." : "بحث"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add/Edit Variant Dialog ─────────────────────────────────────────
interface VariantDialogProps {
  open: boolean;
  isEdit: boolean;
  parentItem: InventoryItem | null;
  formData: VariantFormData;
  editVariant: InventoryVariant | null;
  saving: boolean;
  canCreate: boolean;
  canEdit: boolean;
  onFormChange: (data: Partial<VariantFormData>) => void;
  onAttributeChange: (key: string, value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function VariantDialog({
  open,
  isEdit,
  parentItem,
  formData,
  editVariant,
  saving,
  canCreate,
  canEdit,
  onFormChange,
  onAttributeChange,
  onClose,
  onSave,
}: VariantDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "تعديل المتغير" : "إضافة متغير جديد"}
          </DialogTitle>
        </DialogHeader>
        {parentItem && (
          <div className="p-3 bg-muted rounded-lg mb-4">
            <p className="text-sm text-muted-foreground">المنتج الأصلي:</p>
            <p className="font-medium">
              {parentItem.name} ({parentItem.sku})
            </p>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">رمز المتغير (SKU)</label>
            <Input
              value={formData.sku}
              onChange={(e) => onFormChange({ sku: e.target.value })}
              placeholder={!isEdit ? `${parentItem?.sku}-RED-M` : undefined}
            />
            {!isEdit && (
              <p className="text-xs text-muted-foreground mt-1">
                مثال: TSHIRT-001-RED-M
              </p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">اسم المتغير</label>
            <Input
              value={formData.name}
              onChange={(e) => onFormChange({ name: e.target.value })}
              placeholder="تيشيرت أحمر - وسط"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">اللون</label>
              <Input
                value={formData.attributes.color || ""}
                onChange={(e) => onAttributeChange("color", e.target.value)}
                placeholder="أحمر"
              />
            </div>
            <div>
              <label className="text-sm font-medium">المقاس</label>
              <Input
                value={formData.attributes.size || ""}
                onChange={(e) => onAttributeChange("size", e.target.value)}
                placeholder="M, L, XL..."
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">سعر التكلفة</label>
              <Input
                type="number"
                value={formData.costPrice}
                onChange={(e) =>
                  onFormChange({ costPrice: parseFloat(e.target.value) || 0 })
                }
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground mt-1">سعر الشراء</p>
            </div>
            <div>
              <label className="text-sm font-medium">سعر البيع</label>
              <Input
                type="number"
                value={formData.sellingPrice}
                onChange={(e) =>
                  onFormChange({
                    sellingPrice: parseFloat(e.target.value) || 0,
                  })
                }
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                سعر البيع للعميل
              </p>
            </div>
          </div>
          {!isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">الكمية الابتدائية</label>
                <Input
                  type="number"
                  value={formData.stock}
                  onChange={(e) =>
                    onFormChange({ stock: parseInt(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">حد المخزون المنخفض</label>
            <Input
              type="number"
              value={formData.lowStockThreshold}
              onChange={(e) =>
                onFormChange({
                  lowStockThreshold: parseInt(e.target.value) || 5,
                })
              }
              placeholder="5"
            />
          </div>
          {isEdit && editVariant && (
            <div className="rounded-lg bg-[var(--accent-blue-dim)] p-3">
              <p className="text-sm text-[var(--text-primary)]">
                الكمية الحالية:{" "}
                <strong>{editVariant.quantity_on_hand || 0}</strong>
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                لتعديل الكمية، استخدم زر تعديل المخزون
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || (isEdit ? !canEdit : !canCreate)}
          >
            {saving
              ? "جاري الحفظ..."
              : isEdit
                ? "حفظ التعديلات"
                : "إضافة المتغير"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Variant Dialog ───────────────────────────────────────────
interface DeleteVariantDialogProps {
  deleteVariant: InventoryVariant | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteVariantDialog({
  deleteVariant,
  onClose,
  onConfirm,
}: DeleteVariantDialogProps) {
  return (
    <Dialog open={!!deleteVariant} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف المتغير</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground">
          هل أنت متأكد من حذف المتغير &quot;{deleteVariant?.name}&quot; (
          {deleteVariant?.sku})؟
        </p>
        <p className="text-sm text-yellow-600">
          سيتم حذف {deleteVariant?.quantity_on_hand || 0} وحدة من المخزون.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            حذف المتغير
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
