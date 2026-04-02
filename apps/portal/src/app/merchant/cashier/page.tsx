"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
} from "lucide-react";
import { useMerchant } from "@/hooks/use-merchant";
import { useToast } from "@/hooks/use-toast";
import { merchantApi } from "@/lib/client";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type DeliveryType = "delivery" | "pickup" | "dine_in";
type PaymentMethod = "cash" | "card" | "transfer";

interface CatalogProduct {
  id: string;
  name: string;
  unitPrice: number;
  category: string;
  sku?: string;
  imageUrl?: string;
  isAvailable: boolean;
}

interface CartItem {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

interface CreatedOrderSummary {
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  deliveryType: DeliveryType;
  address?: string;
  subtotal: number;
  discount: number;
  total: number;
  notes?: string;
  items: CartItem[];
}

const DELIVERY_OPTIONS: Array<{
  key: DeliveryType;
  label: string;
  icon: typeof Truck;
}> = [
  { key: "delivery", label: "توصيل", icon: Truck },
  { key: "pickup", label: "استلام", icon: Package },
  { key: "dine_in", label: "داخل الفرع", icon: ShoppingCart },
];

const PAYMENT_OPTIONS: Array<{
  key: PaymentMethod;
  label: string;
  icon: typeof Banknote;
}> = [
  { key: "cash", label: "نقدي", icon: Banknote },
  { key: "card", label: "بطاقة", icon: CreditCard },
  { key: "transfer", label: "تحويل", icon: RefreshCw },
];

const round2 = (value: number) => Math.round(value * 100) / 100;

function buildDiscountedItems(items: CartItem[], discount: number): CartItem[] {
  if (items.length === 0) return [];

  const subtotal = round2(
    items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
      0,
    ),
  );

  const normalizedDiscount = Math.max(0, Math.min(round2(discount), subtotal));
  if (normalizedDiscount <= 0 || subtotal <= 0) {
    return items.map((item) => ({
      ...item,
      unitPrice: round2(Number(item.unitPrice)),
    }));
  }

  let remainingDiscount = normalizedDiscount;
  const adjusted = items.map((item, index) => {
    const lineTotal = round2(Number(item.quantity) * Number(item.unitPrice));

    let lineDiscount = 0;
    if (index === items.length - 1) {
      lineDiscount = Math.min(remainingDiscount, lineTotal);
    } else {
      const proportional =
        subtotal > 0 ? round2((lineTotal / subtotal) * normalizedDiscount) : 0;
      lineDiscount = Math.min(remainingDiscount, lineTotal, proportional);
    }

    remainingDiscount = round2(remainingDiscount - lineDiscount);

    const discountedLine = round2(Math.max(0, lineTotal - lineDiscount));
    const unitPrice =
      item.quantity > 0 ? round2(discountedLine / item.quantity) : 0;

    return {
      ...item,
      unitPrice,
    };
  });

  const desiredTotal = round2(subtotal - normalizedDiscount);
  const adjustedTotal = round2(
    adjusted.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
      0,
    ),
  );
  const difference = round2(desiredTotal - adjustedTotal);

  if (Math.abs(difference) >= 0.01 && adjusted.length > 0) {
    const lastIndex = adjusted.length - 1;
    const lastItem = adjusted[lastIndex];
    const patchedUnitPrice = round2(
      Math.max(
        0,
        Number(lastItem.unitPrice) +
          difference / Math.max(1, Number(lastItem.quantity)),
      ),
    );

    adjusted[lastIndex] = {
      ...lastItem,
      unitPrice: patchedUnitPrice,
    };
  }

  return adjusted;
}

export default function CashierPage() {
  const { merchant, merchantId, apiKey } = useMerchant();
  const { toast } = useToast();

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [catalogItems, setCatalogItems] = useState<CatalogProduct[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [discountInput, setDiscountInput] = useState("0");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [activeCartIndex, setActiveCartIndex] = useState(-1);
  const [lastCreatedOrder, setLastCreatedOrder] =
    useState<CreatedOrderSummary | null>(null);

  const merchantName = merchant?.name || "الكاشير";

  const loadCatalog = useCallback(async () => {
    if (!apiKey) {
      setCatalogItems([]);
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
          const category =
            String(item?.category || "بدون تصنيف").trim() || "بدون تصنيف";
          const unitPrice = Number(
            item?.base_price ?? item?.price ?? item?.unit_price ?? 0,
          );

          return {
            id: String(item?.id || "").trim(),
            name,
            sku: String(item?.sku || "").trim() || undefined,
            category,
            imageUrl: String(item?.image_url || "").trim() || undefined,
            unitPrice: Number.isFinite(unitPrice) ? round2(unitPrice) : 0,
            isAvailable:
              item?.is_available !== false && item?.isActive !== false,
          };
        })
        .filter(
          (item: CatalogProduct) => item.id.length > 0 && item.isAvailable,
        );

      setCatalogItems(mapped);
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
  }, [apiKey, merchantId, toast]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    catalogItems.forEach((item) => {
      set.add(item.category || "بدون تصنيف");
    });
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, "ar"))];
  }, [catalogItems]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    return catalogItems.filter((item) => {
      const matchesCategory =
        activeCategory === "all" || item.category === activeCategory;
      const matchesQuery =
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        String(item.sku || "")
          .toLowerCase()
          .includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [catalogItems, productSearch, activeCategory]);

  const subtotal = useMemo(
    () =>
      round2(
        cartItems.reduce(
          (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
          0,
        ),
      ),
    [cartItems],
  );

  const discount = useMemo(() => {
    const parsed = Number(discountInput);
    if (!Number.isFinite(parsed)) return 0;
    return round2(Math.max(0, Math.min(parsed, subtotal)));
  }, [discountInput, subtotal]);

  const totalAfterDiscount = useMemo(
    () => round2(Math.max(0, subtotal - discount)),
    [subtotal, discount],
  );

  const cartItemsCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.quantity), 0),
    [cartItems],
  );

  const addToCart = useCallback((product: CatalogProduct) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.catalogItemId === product.id,
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
  }, []);

  const updateCartItem = useCallback(
    (
      index: number,
      patch: Partial<Pick<CartItem, "quantity" | "unitPrice" | "notes">>,
    ) => {
      setCartItems((prev) =>
        prev
          .map((item, itemIndex) => {
            if (itemIndex !== index) return item;

            const nextQuantity =
              patch.quantity !== undefined
                ? Math.max(0, Number(patch.quantity) || 0)
                : Number(item.quantity);
            const nextPrice =
              patch.unitPrice !== undefined
                ? Math.max(0, Number(patch.unitPrice) || 0)
                : Number(item.unitPrice);

            return {
              ...item,
              ...patch,
              quantity: nextQuantity,
              unitPrice: round2(nextPrice),
            };
          })
          .filter((item) => item.quantity > 0),
      );
    },
    [],
  );

  const removeCartItem = useCallback((index: number) => {
    setCartItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  useEffect(() => {
    setActiveCartIndex((previous) => {
      if (cartItems.length === 0) return -1;
      if (previous < 0 || previous >= cartItems.length)
        return cartItems.length - 1;
      return previous;
    });
  }, [cartItems.length]);

  const clearOrderDraft = useCallback(() => {
    setCartItems([]);
    setDiscountInput("0");
    setDeliveryType("delivery");
    setDeliveryAddress("");
    setPaymentMethod("cash");
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
  }, []);

  const startNewOrder = useCallback(() => {
    setLastCreatedOrder(null);
    clearOrderDraft();
  }, [clearOrderDraft]);

  const printReceipt = useCallback(() => {
    if (!lastCreatedOrder) {
      toast({
        title: "لا يوجد إيصال للطباعة",
        description: "نفذ طلباً أولاً ثم اطبع الإيصال",
      });
      return;
    }
    window.print();
  }, [lastCreatedOrder, toast]);

  const handleCheckout = useCallback(async () => {
    if (!apiKey) {
      toast({
        title: "تعذر تنفيذ العملية",
        description: "مفتاح التاجر غير متوفر حالياً",
        variant: "destructive",
      });
      return;
    }

    if (cartItems.length === 0) {
      toast({
        title: "السلة فارغة",
        description: "أضف منتجاً واحداً على الأقل قبل تنفيذ الطلب",
        variant: "destructive",
      });
      return;
    }

    const normalizedAddress = deliveryAddress.trim();
    if (deliveryType === "delivery" && !normalizedAddress) {
      toast({
        title: "عنوان التوصيل مطلوب",
        description: "أدخل عنوان التوصيل أو اختر نوع طلب مختلف",
        variant: "destructive",
      });
      return;
    }

    const normalizedName = customerName.trim() || "عميل نقدي";
    const normalizedPhone = customerPhone.trim() || "0000000000";
    const normalizedNotes = notes.trim();

    const discountedItems = buildDiscountedItems(cartItems, discount);
    const mergedOrderNotes = [
      discount > 0 ? `خصم نقدي: ${formatCurrency(discount)}` : "",
      normalizedNotes,
    ]
      .filter(Boolean)
      .join(" | ");

    setCheckoutLoading(true);
    try {
      const created = await merchantApi.createManualOrder(merchantId, apiKey, {
        customerName: normalizedName,
        customerPhone: normalizedPhone,
        items: discountedItems.map((item) => ({
          catalogItemId: item.catalogItemId,
          name: item.name,
          quantity: Number(item.quantity),
          unitPrice: round2(Number(item.unitPrice)),
          notes: item.notes?.trim() || undefined,
        })),
        deliveryType,
        deliveryAddress:
          deliveryType === "delivery" ? normalizedAddress : undefined,
        paymentMethod,
        notes: mergedOrderNotes || undefined,
        source: "cashier",
      });

      const responseTotal = Number(
        created?.totalPrice ?? created?.total ?? totalAfterDiscount,
      );

      setLastCreatedOrder({
        orderNumber: String(created?.orderNumber || "---"),
        createdAt: new Date().toISOString(),
        customerName: normalizedName,
        customerPhone: normalizedPhone,
        paymentMethod,
        deliveryType,
        address: deliveryType === "delivery" ? normalizedAddress : undefined,
        subtotal,
        discount,
        total: Number.isFinite(responseTotal)
          ? round2(responseTotal)
          : totalAfterDiscount,
        notes: mergedOrderNotes || undefined,
        items: discountedItems,
      });

      toast({
        title: "تم تنفيذ الطلب بنجاح",
        description: `رقم الطلب: ${String(created?.orderNumber || "---")}`,
      });

      clearOrderDraft();
    } catch (error) {
      toast({
        title: "فشل تنفيذ الطلب",
        description:
          error instanceof Error
            ? error.message
            : "تعذر إتمام عملية الدفع حالياً",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(false);
    }
  }, [
    apiKey,
    cartItems,
    clearOrderDraft,
    customerName,
    customerPhone,
    deliveryAddress,
    deliveryType,
    discount,
    merchantId,
    notes,
    paymentMethod,
    subtotal,
    toast,
    totalAfterDiscount,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditableTarget =
        !!target &&
        (target.isContentEditable ||
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select");

      if (isEditableTarget) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        printReceipt();
        return;
      }

      if (lastCreatedOrder) {
        if (event.key === "Enter") {
          event.preventDefault();
          startNewOrder();
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void handleCheckout();
        return;
      }

      if (cartItems.length === 0) return;

      const isPlusKey =
        event.key === "+" ||
        event.key === "=" ||
        event.key === "Add" ||
        event.code === "NumpadAdd";
      const isMinusKey =
        event.key === "-" ||
        event.key === "_" ||
        event.key === "Subtract" ||
        event.code === "NumpadSubtract";

      if (!isPlusKey && !isMinusKey) return;

      event.preventDefault();

      const resolvedIndex =
        activeCartIndex >= 0 && activeCartIndex < cartItems.length
          ? activeCartIndex
          : cartItems.length - 1;
      const selectedItem = cartItems[resolvedIndex];
      if (!selectedItem) return;

      const nextQuantity = isPlusKey
        ? selectedItem.quantity + 1
        : Math.max(1, selectedItem.quantity - 1);

      updateCartItem(resolvedIndex, { quantity: nextQuantity });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeCartIndex,
    cartItems,
    handleCheckout,
    lastCreatedOrder,
    printReceipt,
    startNewOrder,
    updateCartItem,
  ]);

  return (
    <div dir="rtl" className="cashier-shell min-h-screen bg-slate-100">
      <div className="mx-auto flex h-screen max-w-[1700px] flex-col px-3 py-3 lg:px-5">
        <header className="mb-3 rounded-2xl border bg-card px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {merchantName}
                </p>
                <p className="text-sm text-muted-foreground">
                  نقطة البيع السريعة - وضع الكاشير
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="h-9 rounded-full px-3 text-sm"
              >
                <ShoppingCart className="ml-1 h-4 w-4" />
                {cartItemsCount} عنصر
              </Badge>
              <Badge
                variant="secondary"
                className="h-9 rounded-full px-3 text-sm"
              >
                <Banknote className="ml-1 h-4 w-4" />
                {formatCurrency(totalAfterDiscount)}
              </Badge>
              <Button
                asChild
                variant="outline"
                className="h-9 rounded-full px-4"
              >
                <Link href="/merchant/orders">
                  <ArrowRight className="ml-1 h-4 w-4" />
                  الخروج من الكاشير
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row-reverse">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-emerald-600" />
                كتالوج المنتجات
              </CardTitle>
              <div className="relative">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="ابحث بالاسم أو SKU"
                  className="h-10 rounded-xl pr-9"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {categories.map((category) => {
                  const isActive = activeCategory === category;
                  return (
                    <Button
                      key={category}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      className={cn(
                        "h-8 rounded-full px-3 text-xs",
                        isActive && "bg-emerald-600 hover:bg-emerald-700",
                      )}
                      onClick={() => setActiveCategory(category)}
                    >
                      {category === "all" ? "الكل" : category}
                    </Button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto pb-4">
              {catalogLoading ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                  جاري تحميل المنتجات...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                  لا توجد منتجات مطابقة للبحث الحالي
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addToCart(product)}
                      className="flex min-h-[132px] flex-col justify-between rounded-2xl border bg-white p-3 text-right transition hover:border-emerald-300 hover:shadow-sm"
                    >
                      <div>
                        <p className="line-clamp-2 text-sm font-semibold text-slate-900">
                          {product.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {product.category}
                        </p>
                        {product.sku && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                            {product.sku}
                          </p>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-bold text-emerald-700">
                          {formatCurrency(product.unitPrice)}
                        </span>
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                          <Plus className="h-4 w-4" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex min-h-0 w-full flex-col lg:w-[40%] xl:w-[37%]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  سلة الطلب
                </span>
                <Badge variant="outline" className="rounded-full">
                  {cartItemsCount} عنصر
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                الاختصارات: <strong>Enter</strong> تنفيذ الطلب،{" "}
                <strong>+</strong> زيادة الكمية، <strong>-</strong> تقليل
                الكمية، <strong>Ctrl+P</strong> طباعة الإيصال
              </p>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-3">
              {lastCreatedOrder ? (
                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="text-base font-semibold text-emerald-900">
                        تم تنفيذ الطلب بنجاح
                      </p>
                      <p className="text-sm text-emerald-800">
                        رقم الطلب: {lastCreatedOrder.orderNumber}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 rounded-xl bg-white/80 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">الإجمالي</span>
                      <span className="font-semibold">
                        {formatCurrency(lastCreatedOrder.total)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">الدفع</span>
                      <span className="font-medium">
                        {
                          PAYMENT_OPTIONS.find(
                            (option) =>
                              option.key === lastCreatedOrder.paymentMethod,
                          )?.label
                        }
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">الوقت</span>
                      <span className="font-medium">
                        {new Date(lastCreatedOrder.createdAt).toLocaleString(
                          "ar-SA",
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      className="h-10 flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                      onClick={printReceipt}
                    >
                      <Printer className="ml-2 h-4 w-4" />
                      طباعة الإيصال
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 flex-1 rounded-xl"
                      onClick={startNewOrder}
                    >
                      <Plus className="ml-2 h-4 w-4" />
                      طلب جديد
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2 rounded-2xl border bg-muted/20 p-3">
                    {cartItems.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        ابدأ بإضافة منتجات إلى السلة
                      </p>
                    ) : (
                      cartItems.map((item, index) => (
                        <div
                          key={`${item.catalogItemId || item.name}-${index}`}
                          className={cn(
                            "rounded-xl border bg-background p-3 transition",
                            activeCartIndex === index &&
                              "border-emerald-400 ring-2 ring-emerald-200",
                          )}
                          onClick={() => setActiveCartIndex(index)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {item.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatCurrency(item.unitPrice)} للوحدة
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCartItem(index)}
                              className="rounded-full p-1 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                              aria-label="حذف عنصر"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              onClick={() =>
                                updateCartItem(index, {
                                  quantity: item.quantity - 1,
                                })
                              }
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onFocus={() => setActiveCartIndex(index)}
                              onChange={(event) =>
                                updateCartItem(index, {
                                  quantity: Number(event.target.value),
                                })
                              }
                              className="h-8 w-20 text-center"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              onClick={() =>
                                updateCartItem(index, {
                                  quantity: item.quantity + 1,
                                })
                              }
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="mr-auto text-sm font-semibold text-slate-900">
                              {formatCurrency(item.quantity * item.unitPrice)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-2 rounded-2xl border bg-background p-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          اسم العميل (اختياري)
                        </label>
                        <Input
                          value={customerName}
                          onChange={(event) =>
                            setCustomerName(event.target.value)
                          }
                          className="h-9 rounded-lg"
                          placeholder="عميل نقدي"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          رقم الهاتف (اختياري)
                        </label>
                        <Input
                          value={customerPhone}
                          onChange={(event) =>
                            setCustomerPhone(event.target.value)
                          }
                          className="h-9 rounded-lg"
                          placeholder="01000000000"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        نوع الطلب
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {DELIVERY_OPTIONS.map((option) => {
                          const isActive = deliveryType === option.key;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setDeliveryType(option.key)}
                              className={cn(
                                "flex h-9 items-center justify-center gap-1 rounded-lg border text-xs font-medium transition",
                                isActive
                                  ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                                  : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              <option.icon className="h-3.5 w-3.5" />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {deliveryType === "delivery" && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          عنوان التوصيل
                        </label>
                        <Input
                          value={deliveryAddress}
                          onChange={(event) =>
                            setDeliveryAddress(event.target.value)
                          }
                          className="h-9 rounded-lg"
                          placeholder="الحي - الشارع - رقم المبنى"
                        />
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        طريقة الدفع
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {PAYMENT_OPTIONS.map((option) => {
                          const isActive = paymentMethod === option.key;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setPaymentMethod(option.key)}
                              className={cn(
                                "flex h-9 items-center justify-center gap-1 rounded-lg border text-xs font-medium transition",
                                isActive
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-muted-foreground hover:bg-muted",
                              )}
                            >
                              <option.icon className="h-3.5 w-3.5" />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        خصم (اختياري)
                      </label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={discountInput}
                        onChange={(event) =>
                          setDiscountInput(event.target.value)
                        }
                        className="h-9 rounded-lg"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        ملاحظات الطلب
                      </label>
                      <Textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        className="min-h-[70px] rounded-lg"
                        placeholder="تعليمات إضافية للكاشير أو التوصيل"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-background p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        الإجمالي الفرعي
                      </span>
                      <span className="font-medium">
                        {formatCurrency(subtotal)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">الخصم</span>
                      <span className="font-medium text-red-600">
                        -{formatCurrency(discount)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t pt-2 text-base font-semibold">
                      <span>المطلوب تحصيله</span>
                      <span>{formatCurrency(totalAfterDiscount)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-xl"
                        onClick={clearOrderDraft}
                        disabled={checkoutLoading}
                      >
                        تفريغ السلة
                      </Button>
                      <Button
                        type="button"
                        className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700"
                        onClick={handleCheckout}
                        disabled={checkoutLoading || cartItems.length === 0}
                      >
                        {checkoutLoading ? (
                          <>
                            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                            جاري التنفيذ...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="ml-2 h-4 w-4" />
                            تنفيذ الطلب
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <section id="cashier-receipt" className="hidden" dir="rtl">
        {lastCreatedOrder && (
          <div className="receipt-inner">
            <div className="receipt-head">
              <h2>{merchantName}</h2>
              <p>إيصال كاشير</p>
              <p>رقم الطلب: {lastCreatedOrder.orderNumber}</p>
              <p>
                {new Date(lastCreatedOrder.createdAt).toLocaleString("ar-SA")}
              </p>
            </div>

            <div className="receipt-block">
              <p>العميل: {lastCreatedOrder.customerName}</p>
              <p>الهاتف: {lastCreatedOrder.customerPhone}</p>
              <p>
                النوع:{" "}
                {
                  DELIVERY_OPTIONS.find(
                    (option) => option.key === lastCreatedOrder.deliveryType,
                  )?.label
                }
              </p>
              {lastCreatedOrder.address && (
                <p>العنوان: {lastCreatedOrder.address}</p>
              )}
            </div>

            <div className="receipt-items">
              {lastCreatedOrder.items.map((item, index) => (
                <div
                  className="receipt-row"
                  key={`${item.catalogItemId || item.name}-${index}`}
                >
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span>{formatCurrency(item.quantity * item.unitPrice)}</span>
                </div>
              ))}
            </div>

            <div className="receipt-summary">
              <div className="receipt-row">
                <span>الإجمالي الفرعي</span>
                <span>{formatCurrency(lastCreatedOrder.subtotal)}</span>
              </div>
              <div className="receipt-row">
                <span>الخصم</span>
                <span>-{formatCurrency(lastCreatedOrder.discount)}</span>
              </div>
              <div className="receipt-row total">
                <span>الإجمالي</span>
                <span>{formatCurrency(lastCreatedOrder.total)}</span>
              </div>
            </div>

            <div className="receipt-foot">
              <p>
                الدفع:{" "}
                {
                  PAYMENT_OPTIONS.find(
                    (option) => option.key === lastCreatedOrder.paymentMethod,
                  )?.label
                }
              </p>
              {lastCreatedOrder.notes ? <p>{lastCreatedOrder.notes}</p> : null}
              <p>شكراً لزيارتكم</p>
            </div>
          </div>
        )}
      </section>

      <style jsx global>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          body {
            margin: 0;
            background: #fff;
          }

          .cashier-shell {
            display: none !important;
          }

          #cashier-receipt {
            display: block !important;
            width: 80mm;
            margin: 0 auto;
            padding: 3mm;
            font-size: 11px;
            color: #111;
            font-family: "Arial", sans-serif;
            direction: rtl;
          }

          #cashier-receipt .receipt-inner {
            border: 1px dashed #9ca3af;
            padding: 3mm;
          }

          #cashier-receipt .receipt-head {
            text-align: center;
            border-bottom: 1px dashed #9ca3af;
            padding-bottom: 2mm;
            margin-bottom: 2mm;
          }

          #cashier-receipt .receipt-head h2 {
            font-size: 14px;
            margin: 0 0 1mm 0;
          }

          #cashier-receipt .receipt-head p {
            margin: 0.5mm 0;
          }

          #cashier-receipt .receipt-block {
            border-bottom: 1px dashed #9ca3af;
            margin-bottom: 2mm;
            padding-bottom: 2mm;
          }

          #cashier-receipt .receipt-block p {
            margin: 0.5mm 0;
          }

          #cashier-receipt .receipt-items,
          #cashier-receipt .receipt-summary {
            border-bottom: 1px dashed #9ca3af;
            margin-bottom: 2mm;
            padding-bottom: 2mm;
          }

          #cashier-receipt .receipt-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 4mm;
            margin: 1mm 0;
          }

          #cashier-receipt .receipt-row.total {
            font-weight: 700;
            margin-top: 1.5mm;
          }

          #cashier-receipt .receipt-foot {
            text-align: center;
          }

          #cashier-receipt .receipt-foot p {
            margin: 0.8mm 0;
          }
        }
      `}</style>
    </div>
  );
}
