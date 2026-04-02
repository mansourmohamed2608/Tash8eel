"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { merchantApi } from "@/lib/client";
import { formatCurrency } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { RealTimeEvent, useWebSocketEvent } from "@/hooks/use-websocket";

interface ActiveCallPayload {
  callSid?: string;
  customerPhone?: string;
}

interface ManualOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export function ActiveCallOrderFab() {
  const pathname = usePathname();
  const { merchantId, apiKey } = useMerchant();
  const { toast } = useToast();

  const [activeCall, setActiveCall] = useState<ActiveCallPayload | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryType, setDeliveryType] = useState<
    "delivery" | "pickup" | "dine_in"
  >("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "transfer"
  >("cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [items, setItems] = useState<ManualOrderItem[]>([
    { name: "", quantity: 1, unitPrice: 0 },
  ]);

  useWebSocketEvent<ActiveCallPayload>(RealTimeEvent.CALL_ACTIVE, (payload) => {
    setActiveCall(payload);
    const phone = String(payload.customerPhone || "").trim();
    if (phone) {
      setCustomerPhone((prev) => (prev.trim().length > 0 ? prev : phone));
    }
  });

  useWebSocketEvent<ActiveCallPayload>(RealTimeEvent.CALL_ENDED, (payload) => {
    const endedSid = String(payload.callSid || "").trim();
    setActiveCall((current) => {
      if (!current) return null;
      if (!endedSid) return null;
      return String(current.callSid || "") === endedSid ? null : current;
    });
  });

  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone(String(activeCall?.customerPhone || ""));
    setDeliveryType("delivery");
    setDeliveryAddress("");
    setPaymentMethod("cash");
    setOrderNotes("");
    setItems([{ name: "", quantity: 1, unitPrice: 0 }]);
  };

  const updateItem = (
    index: number,
    patch: Partial<
      Pick<ManualOrderItem, "name" | "quantity" | "unitPrice" | "notes">
    >,
  ) => {
    setItems((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const quantity =
          patch.quantity !== undefined
            ? Math.max(1, Number(patch.quantity) || 1)
            : item.quantity;
        const unitPrice =
          patch.unitPrice !== undefined
            ? Math.max(0, Number(patch.unitPrice) || 0)
            : item.unitPrice;

        return {
          ...item,
          ...patch,
          quantity,
          unitPrice,
        };
      }),
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, { name: "", quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const total = Number(
    items
      .reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0,
      )
      .toFixed(2),
  );

  const submitOrder = async () => {
    if (!apiKey) return;

    const normalizedItems = items
      .map((item) => ({
        name: String(item.name || "").trim(),
        quantity: Math.max(1, Number(item.quantity || 1)),
        unitPrice: Math.max(0, Number(item.unitPrice || 0)),
        notes: item.notes?.trim() || undefined,
      }))
      .filter((item) => item.name.length > 0);

    if (!customerName.trim()) {
      toast({
        title: "بيانات ناقصة",
        description: "يرجى إدخال اسم العميل",
        variant: "destructive",
      });
      return;
    }

    if (!customerPhone.trim()) {
      toast({
        title: "بيانات ناقصة",
        description: "يرجى إدخال رقم الهاتف",
        variant: "destructive",
      });
      return;
    }

    if (normalizedItems.length === 0) {
      toast({
        title: "بيانات ناقصة",
        description: "أضف عنصراً واحداً على الأقل",
        variant: "destructive",
      });
      return;
    }

    if (deliveryType === "delivery" && !deliveryAddress.trim()) {
      toast({
        title: "بيانات ناقصة",
        description: "عنوان التوصيل مطلوب",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const created = await merchantApi.createManualOrder(merchantId, apiKey, {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        items: normalizedItems,
        deliveryType,
        deliveryAddress:
          deliveryType === "delivery" ? deliveryAddress.trim() : undefined,
        paymentMethod,
        notes: orderNotes.trim() || undefined,
        source: "manual",
      });

      toast({
        title: "تم إنشاء الطلب",
        description: `رقم الطلب: ${String(created.orderNumber || "-")}`,
      });

      setOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: "فشل إنشاء الطلب",
        description:
          error instanceof Error ? error.message : "تعذر إنشاء الطلب حالياً",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeCall || pathname.startsWith("/merchant/calls")) {
    return null;
  }

  return (
    <>
      <Button
        className="fixed bottom-6 left-6 z-[55] rounded-full shadow-xl h-12 px-5"
        onClick={() => setOpen(true)}
      >
        <ShoppingCart className="ml-2 h-4 w-4" />
        إنشاء طلب
      </Button>

      <Badge className="fixed bottom-20 left-6 z-[55] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        مكالمة نشطة
      </Badge>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (submitting) return;
          setOpen(next);
          if (!next) {
            resetForm();
          }
        }}
      >
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle>إنشاء طلب أثناء المكالمة</DialogTitle>
            <DialogDescription>
              النموذج متاح من أي صفحة بدون مغادرة السياق الحالي.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">اسم العميل</p>
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="اسم العميل"
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">رقم الهاتف</p>
                <Input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="01000000000"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <p className="text-sm font-medium">عناصر الطلب</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addItem}
                >
                  <Plus className="ml-1 h-3.5 w-3.5" />
                  إضافة عنصر
                </Button>
              </div>

              <div className="divide-y">
                {items.map((item, index) => (
                  <div key={`fab-item-${index}`} className="p-3 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <Input
                        value={item.name}
                        onChange={(event) =>
                          updateItem(index, { name: event.target.value })
                        }
                        placeholder="اسم المنتج"
                        className="md:col-span-2"
                      />
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(index, {
                            quantity: Number(event.target.value || 1),
                          })
                        }
                        placeholder="الكمية"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(event) =>
                          updateItem(index, {
                            unitPrice: Number(event.target.value || 0),
                          })
                        }
                        placeholder="سعر الوحدة"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        value={item.notes || ""}
                        onChange={(event) =>
                          updateItem(index, { notes: event.target.value })
                        }
                        placeholder="ملاحظات (اختياري)"
                      />
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">نوع الطلب</p>
                <Select
                  value={deliveryType}
                  onValueChange={(value: "delivery" | "pickup" | "dine_in") =>
                    setDeliveryType(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivery">توصيل</SelectItem>
                    <SelectItem value="pickup">استلام</SelectItem>
                    <SelectItem value="dine_in">داخل الفرع</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">طريقة الدفع</p>
                <Select
                  value={paymentMethod}
                  onValueChange={(value: "cash" | "card" | "transfer") =>
                    setPaymentMethod(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">كاش</SelectItem>
                    <SelectItem value="card">كارت</SelectItem>
                    <SelectItem value="transfer">تحويل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {deliveryType === "delivery" && (
              <div className="space-y-1">
                <p className="text-sm font-medium">عنوان التوصيل</p>
                <Input
                  value={deliveryAddress}
                  onChange={(event) => setDeliveryAddress(event.target.value)}
                  placeholder="الحي، الشارع، رقم العمارة"
                />
              </div>
            )}

            <div className="space-y-1">
              <p className="text-sm font-medium">ملاحظات الطلب</p>
              <Textarea
                rows={3}
                value={orderNotes}
                onChange={(event) => setOrderNotes(event.target.value)}
                placeholder="ملاحظات إضافية"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm font-medium">الإجمالي</span>
              <span className="text-sm font-bold">{formatCurrency(total)}</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  if (submitting) return;
                  setOpen(false);
                  resetForm();
                }}
              >
                إلغاء
              </Button>

              <Button onClick={() => void submitOrder()} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري الإنشاء...
                  </>
                ) : (
                  "حفظ الطلب"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
