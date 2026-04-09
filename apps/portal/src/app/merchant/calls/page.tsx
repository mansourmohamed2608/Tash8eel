"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  Bot,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Minus,
  PhoneCall,
  Plus,
  Search,
  RefreshCw,
  ShoppingCart,
  Trash2,
  User,
} from "lucide-react";
import { merchantApi } from "@/lib/client";
import { formatCurrency } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { RealTimeEvent, useWebSocketEvent } from "@/hooks/use-websocket";

interface VoiceTranscriptTurn {
  speaker: string;
  text: string;
  at?: string;
}

interface VoiceCallRecord {
  id: string;
  customerPhone: string;
  callSid: string;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  handledBy: string;
  status: string;
  transcript: VoiceTranscriptTurn[];
  orderId?: string | null;
  orderNumber?: string | null;
  recordingUrl?: string | null;
}

interface VoiceCallStats {
  periodDays: number;
  callsToday: number;
  aiHandled: number;
  staffHandled: number;
  missedCalls: number;
  ordersFromCalls: number;
}

interface ActiveCallPayload {
  callSid?: string;
  customerPhone?: string;
  handledBy?: string;
  status?: string;
  durationSeconds?: number;
  orderId?: string;
}

interface ManualOrderItem {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  sku?: string;
  unitPrice: number;
  isAvailable: boolean;
}

const defaultStats: VoiceCallStats = {
  periodDays: 1,
  callsToday: 0,
  aiHandled: 0,
  staffHandled: 0,
  missedCalls: 0,
  ordersFromCalls: 0,
};

export default function CallsPage() {
  const { merchantId, apiKey } = useMerchant();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<VoiceCallRecord[]>([]);
  const [stats, setStats] = useState<VoiceCallStats>(defaultStats);
  const [expandedCallIds, setExpandedCallIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [activeCall, setActiveCall] = useState<ActiveCallPayload | null>(null);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

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
  const [orderItems, setOrderItems] = useState<ManualOrderItem[]>([
    { name: "", quantity: 1, unitPrice: 0 },
  ]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const loadCalls = useCallback(async () => {
    if (!apiKey) return;

    const response = await merchantApi.getCalls(merchantId, apiKey, {
      limit: 50,
      offset: 0,
    });

    setCalls(
      (response.calls || []).map((row: any) => ({
        id: String(row.id || ""),
        customerPhone: String(row.customerPhone || ""),
        callSid: String(row.callSid || ""),
        startedAt: String(row.startedAt || ""),
        endedAt: row.endedAt || null,
        durationSeconds: Number.isFinite(Number(row.durationSeconds))
          ? Number(row.durationSeconds)
          : null,
        handledBy: String(row.handledBy || "ai"),
        status: String(row.status || "active"),
        transcript: Array.isArray(row.transcript) ? row.transcript : [],
        orderId: row.orderId || null,
        orderNumber: row.orderNumber || null,
        recordingUrl: row.recordingUrl || null,
      })),
    );
  }, [merchantId, apiKey]);

  const loadStats = useCallback(async () => {
    if (!apiKey) return;

    const response = await merchantApi.getCallStats(merchantId, apiKey, 1);
    setStats({
      periodDays: Number(response.periodDays || 1),
      callsToday: Number(response.callsToday || 0),
      aiHandled: Number(response.aiHandled || 0),
      staffHandled: Number(response.staffHandled || 0),
      missedCalls: Number(response.missedCalls || 0),
      ordersFromCalls: Number(response.ordersFromCalls || 0),
    });
  }, [merchantId, apiKey]);

  const loadCatalog = useCallback(async () => {
    if (!apiKey) {
      setCatalogProducts([]);
      setCatalogLoading(false);
      return;
    }

    setCatalogLoading(true);
    try {
      const response = await merchantApi.getCatalogItems(
        merchantId,
        apiKey,
        1,
        600,
      );

      const mapped: CatalogProduct[] = (response.items || [])
        .map((item: any) => {
          const name =
            String(
              item?.name_ar ||
                item?.nameAr ||
                item?.name ||
                item?.title ||
                item?.sku ||
                "",
            ).trim() || "منتج";
          const unitPrice = Number(
            item?.base_price ?? item?.price ?? item?.unit_price ?? 0,
          );

          return {
            id: String(item?.id || "").trim(),
            name,
            sku: String(item?.sku || "").trim() || undefined,
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
            isAvailable:
              item?.is_available !== false && item?.isActive !== false,
          };
        })
        .filter(
          (item: CatalogProduct) => item.id.length > 0 && item.isAvailable,
        );

      setCatalogProducts(mapped);
    } catch (error) {
      toast({
        title: "تعذر تحميل الكتالوج",
        description:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء تحميل المنتجات",
        variant: "destructive",
      });
    } finally {
      setCatalogLoading(false);
    }
  }, [merchantId, apiKey, toast]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadCalls(), loadStats()]);
    } catch (error) {
      toast({
        title: "تعذر تحديث البيانات",
        description:
          error instanceof Error
            ? error.message
            : "حدث خطأ أثناء تحميل بيانات المكالمات",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [loadCalls, loadStats, toast]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useWebSocketEvent<ActiveCallPayload>(
    RealTimeEvent.CALL_ACTIVE,
    (payload) => {
      setActiveCall(payload);
      const incomingPhone = String(payload.customerPhone || "").trim();
      if (incomingPhone.length > 0) {
        setCustomerPhone((prev) =>
          prev.trim().length > 0 ? prev : incomingPhone,
        );
      }
      void refreshAll();
    },
    [refreshAll],
  );

  useWebSocketEvent<ActiveCallPayload>(
    RealTimeEvent.CALL_ENDED,
    (payload) => {
      const endedSid = String(payload.callSid || "").trim();
      setActiveCall((current) => {
        if (!current) return null;
        if (!endedSid) return null;
        return String(current.callSid || "") === endedSid ? null : current;
      });
      void refreshAll();
    },
    [refreshAll],
  );

  const toggleTranscript = (callId: string) => {
    setExpandedCallIds((prev) =>
      prev.includes(callId)
        ? prev.filter((id) => id !== callId)
        : [...prev, callId],
    );
  };

  const addItem = () => {
    setOrderItems((prev) => [...prev, { name: "", quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateItem = (
    index: number,
    patch: Partial<{
      name: string;
      quantity: number;
      unitPrice: number;
      notes: string;
    }>,
  ) => {
    setOrderItems((prev) =>
      prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item;

        const nextQuantity =
          patch.quantity !== undefined
            ? Math.max(1, Number(patch.quantity) || 1)
            : item.quantity;
        const nextPrice =
          patch.unitPrice !== undefined
            ? Math.max(0, Number(patch.unitPrice) || 0)
            : item.unitPrice;

        return {
          ...item,
          ...patch,
          quantity: nextQuantity,
          unitPrice: nextPrice,
        };
      }),
    );
  };

  const resetOrderForm = () => {
    setCustomerName("");
    setCustomerPhone(String(activeCall?.customerPhone || ""));
    setDeliveryType("delivery");
    setDeliveryAddress("");
    setPaymentMethod("cash");
    setOrderNotes("");
    setProductSearch("");
    setOrderItems([{ name: "", quantity: 1, unitPrice: 0 }]);
  };

  const filteredCatalogProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return [];

    return catalogProducts
      .filter((item) => {
        return (
          item.name.toLowerCase().includes(query) ||
          String(item.sku || "")
            .toLowerCase()
            .includes(query)
        );
      })
      .slice(0, 8);
  }, [catalogProducts, productSearch]);

  const addCatalogItemToOrder = useCallback((product: CatalogProduct) => {
    setOrderItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) =>
          item.catalogItemId === product.id ||
          (!item.catalogItemId && item.name === product.name),
      );

      if (existingIndex >= 0) {
        return prev.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...prev,
        {
          catalogItemId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.unitPrice,
        },
      ];
    });

    setProductSearch("");
  }, []);

  const orderTotal = useMemo(
    () =>
      Number(
        orderItems
          .reduce(
            (sum, item) =>
              sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
            0,
          )
          .toFixed(2),
      ),
    [orderItems],
  );

  const submitManualOrder = async () => {
    if (!apiKey) return;

    const cleanedName = customerName.trim();
    const cleanedPhone = customerPhone.trim();
    const cleanedAddress = deliveryAddress.trim();

    const normalizedItems = orderItems
      .map((item) => ({
        catalogItemId: item.catalogItemId,
        name: String(item.name || "").trim(),
        quantity: Math.max(1, Number(item.quantity || 1)),
        unitPrice: Math.max(0, Number(item.unitPrice || 0)),
        notes: item.notes?.trim() || undefined,
      }))
      .filter((item) => item.name.length > 0);

    if (!cleanedName) {
      toast({
        title: "بيانات ناقصة",
        description: "يرجى إدخال اسم العميل",
        variant: "destructive",
      });
      return;
    }

    if (!cleanedPhone) {
      toast({
        title: "بيانات ناقصة",
        description: "يرجى إدخال رقم هاتف العميل",
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

    if (deliveryType === "delivery" && !cleanedAddress) {
      toast({
        title: "بيانات ناقصة",
        description: "عنوان التوصيل مطلوب لهذا النوع من الطلب",
        variant: "destructive",
      });
      return;
    }

    setCreatingOrder(true);
    try {
      const created = await merchantApi.createManualOrder(merchantId, apiKey, {
        customerName: cleanedName,
        customerPhone: cleanedPhone,
        items: normalizedItems,
        deliveryType,
        deliveryAddress:
          deliveryType === "delivery" ? cleanedAddress : undefined,
        paymentMethod,
        notes: orderNotes.trim() || undefined,
        source: "calls",
      });

      toast({
        title: "تم إنشاء الطلب",
        description: `رقم الطلب: ${String(created.orderNumber || "-")}`,
      });

      setCreateOrderOpen(false);
      resetOrderForm();
      await refreshAll();
    } catch (error) {
      toast({
        title: "فشل إنشاء الطلب",
        description:
          error instanceof Error ? error.message : "تعذر إنشاء الطلب حالياً",
        variant: "destructive",
      });
    } finally {
      setCreatingOrder(false);
    }
  };

  const activeCallBadge = activeCall ? (
    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
      <PhoneCall className="ml-1 h-3.5 w-3.5" />
      مكالمة نشطة
    </Badge>
  ) : (
    <Badge variant="secondary">لا توجد مكالمة نشطة</Badge>
  );

  return (
    <>
      <PageHeader
        title="المكالمات"
        description="متابعة المكالمات الفائتة والمكالمات التي تعامل معها الذكاء الاصطناعي"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {activeCallBadge}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshAll()}
              disabled={refreshing}
              className="w-full sm:w-auto"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">مكالمات اليوم</p>
            <p className="mt-1 text-2xl font-bold">{stats.callsToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">تمت بواسطة الذكاء</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">
              {stats.aiHandled}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">طلبات من المكالمات</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {stats.ordersFromCalls}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">مكالمات فائتة</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">
              {stats.missedCalls}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4" />
            آخر المكالمات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <TableSkeleton rows={5} columns={1} />
          ) : calls.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              لا توجد مكالمات مسجلة بعد.
            </div>
          ) : (
            calls.map((call) => {
              const isExpanded = expandedCallIds.includes(call.id);
              const isAi = String(call.handledBy || "").toLowerCase() === "ai";

              return (
                <div key={call.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {call.customerPhone || "غير معروف"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {call.startedAt
                          ? new Date(call.startedAt).toLocaleString("ar-EG")
                          : "-"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={
                          isAi
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                        }
                      >
                        {isAi ? (
                          <Bot className="ml-1 h-3.5 w-3.5" />
                        ) : (
                          <User className="ml-1 h-3.5 w-3.5" />
                        )}
                        {isAi ? "AI" : "Staff"}
                      </Badge>

                      <Badge variant="outline">
                        {call.durationSeconds
                          ? `${call.durationSeconds} ثانية`
                          : "-"}
                      </Badge>

                      {call.orderNumber ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          طلب #{call.orderNumber}
                        </Badge>
                      ) : (
                        <Badge variant="outline">بدون طلب</Badge>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleTranscript(call.id)}
                        className="w-full sm:w-auto"
                      >
                        سجل المكالمة
                        {isExpanded ? (
                          <ChevronUp className="mr-1 h-4 w-4" />
                        ) : (
                          <ChevronDown className="mr-1 h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="rounded-md bg-muted/40 p-3 space-y-2">
                      {call.transcript.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          لا يوجد نص محادثة محفوظ.
                        </p>
                      ) : (
                        call.transcript.map((entry, index) => (
                          <div
                            key={`${call.id}-${index}`}
                            className="rounded-md bg-background p-2"
                          >
                            <p className="text-xs text-muted-foreground">
                              {entry.speaker === "ai" ? "المساعد" : "العميل"}
                              {entry.at
                                ? ` • ${new Date(entry.at).toLocaleTimeString("ar-EG")}`
                                : ""}
                            </p>
                            <p className="text-sm mt-1 leading-6">
                              {entry.text}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {activeCall && (
        <Button
          className="fixed bottom-6 left-6 z-50 rounded-full shadow-xl h-12 px-5"
          onClick={() => setCreateOrderOpen(true)}
        >
          <ShoppingCart className="ml-2 h-4 w-4" />
          إنشاء طلب
        </Button>
      )}

      <Dialog
        open={createOrderOpen}
        onOpenChange={(open) => {
          if (creatingOrder) return;
          setCreateOrderOpen(open);
          if (!open) {
            resetOrderForm();
          }
        }}
      >
        <DialogContent
          className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle>إنشاء طلب أثناء المكالمة</DialogTitle>
            <DialogDescription>
              يمكنك تسجيل الطلب فوراً بدون مغادرة الصفحة الحالية.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">اسم العميل</p>
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="مثال: أحمد محمد"
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

            <div className="space-y-2">
              <p className="text-sm font-medium">بحث المنتجات وإضافتها</p>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="اكتب اسم المنتج أو SKU..."
                  className="pr-9"
                />

                {productSearch.trim().length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border bg-background shadow-md max-h-56 overflow-y-auto">
                    {catalogLoading ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري تحميل المنتجات...
                      </div>
                    ) : filteredCatalogProducts.length > 0 ? (
                      filteredCatalogProducts.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          className="w-full text-right px-3 py-2 hover:bg-muted transition-colors"
                          onClick={() => addCatalogItemToOrder(product)}
                        >
                          <div className="font-medium text-sm">
                            {product.name}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center justify-between">
                            <span dir="ltr">{product.sku || "-"}</span>
                            <span>{formatCurrency(product.unitPrice)}</span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        لا توجد منتجات مطابقة
                      </div>
                    )}
                  </div>
                )}
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
                {orderItems.map((item, index) => (
                  <div key={`order-item-${index}`} className="p-3 space-y-2">
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
                        placeholder="ملاحظات العنصر (اختياري)"
                      />
                      {orderItems.length > 1 && (
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
                  placeholder="الحي، الشارع، رقم العمارة..."
                />
              </div>
            )}

            <div className="space-y-1">
              <p className="text-sm font-medium">ملاحظات الطلب</p>
              <Textarea
                rows={3}
                value={orderNotes}
                onChange={(event) => setOrderNotes(event.target.value)}
                placeholder="أي تفاصيل إضافية"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm font-medium">إجمالي الطلب</span>
              <span className="text-sm font-bold">
                {formatCurrency(orderTotal)}
              </span>
            </div>

            <div className="flex flex-col justify-end gap-2 pt-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  if (creatingOrder) return;
                  setCreateOrderOpen(false);
                  resetOrderForm();
                }}
                disabled={creatingOrder}
                className="w-full sm:w-auto"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => void submitManualOrder()}
                disabled={creatingOrder}
                className="w-full sm:w-auto"
              >
                {creatingOrder ? (
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
