"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Plus,
  Pencil,
  Trash2,
  Loader2,
  RefreshCw,
  Phone,
  MessageSquare,
  Bell,
  BellOff,
  User,
  Truck,
  Send,
  AlertCircle,
  CheckCircle,
  Search,
  MapPin,
  Package,
  Star,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import portalApi from "@/lib/client";
const authenticatedApi = portalApi;
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  lead_time_days: number;
  notes: string | null;
  is_active: boolean;
  auto_notify_low_stock: boolean;
  notify_threshold: string;
  last_auto_notified_at: string | null;
}

interface BranchOption {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

type SupplierLookupMode = "internal" | "external";

interface SupplierLookupResult {
  supplierId?: string;
  name: string;
  address?: string;
  region?: string;
  type?: string;
  phone?: string;
  rating?: number;
  totalRatings?: number;
  searchTip?: string;
  notes?: string;
  source?: string;
  contactName?: string;
  email?: string;
  paymentTerms?: string;
  leadTimeDays?: number;
  linkedProducts?: string[];
  isPreferred?: boolean;
  matchReasons?: string[];
}

type NotifyThreshold = "critical" | "warning" | "all";

const THRESHOLD_LABELS: Record<NotifyThreshold, string> = {
  critical: "حرج (نفاد المخزون)",
  warning: "تحذير (قارب النفاد)",
  all: "أي انخفاض",
};

const emptyForm = {
  name: "",
  contactName: "",
  phone: "",
  whatsappPhone: "",
  email: "",
  address: "",
  paymentTerms: "",
  leadTimeDays: 7,
  notes: "",
  autoNotifyLowStock: false,
  notifyThreshold: "critical" as NotifyThreshold,
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [highlightedSupplierId, setHighlightedSupplierId] = useState<
    string | null
  >(null);
  const { toast } = useToast();
  const supplierCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Dialog state
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Quick message dialog
  const [msgTarget, setMsgTarget] = useState<Supplier | null>(null);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);

  // Supplier discovery
  const [showDiscover, setShowDiscover] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discoverResults, setDiscoverResults] = useState<
    SupplierLookupResult[]
  >([]);
  const [discoverMessage, setDiscoverMessage] = useState("");
  const [discoverContext, setDiscoverContext] = useState<{
    branchName?: string | null;
    city?: string | null;
    address?: string | null;
  } | null>(null);
  const [discoverMode, setDiscoverMode] =
    useState<SupplierLookupMode>("internal");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedDiscoverBranchId, setSelectedDiscoverBranchId] =
    useState<string>("all");
  const [discoverPaymentTerms, setDiscoverPaymentTerms] =
    useState<string>("all");
  const [discoverMaxLeadTimeDays, setDiscoverMaxLeadTimeDays] =
    useState<string>("");

  // Product linking
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(
    null,
  );
  const [supplierProducts, setSupplierProducts] = useState<
    Record<string, any[]>
  >({});
  const [loadingProducts, setLoadingProducts] = useState<string | null>(null);
  const [allInventory, setAllInventory] = useState<any[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<
    Record<string, string>
  >({});

  // Auto-suggestions from background scheduler
  const [autoSuggestions, setAutoSuggestions] = useState<any[]>([]);
  const [showAutoSuggestions, setShowAutoSuggestions] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [suppData, suggData] = await Promise.allSettled([
        authenticatedApi.getSuppliers(),
        (authenticatedApi as any).getSupplierSuggestions(),
      ]);
      if (suppData.status === "fulfilled")
        setSuppliers(suppData.value.suppliers);
      if (suggData.status === "fulfilled" && suggData.value.count > 0) {
        setAutoSuggestions(suggData.value.suggestions);
      }
    } catch (e: any) {
      setError(e?.message ?? "فشل تحميل الموردين");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    authenticatedApi
      .getBranches()
      .then((data) => {
        const nextBranches = data.branches ?? [];
        setBranches(nextBranches);
        const defaultBranch = nextBranches.find((branch) => branch.is_default);
        if (defaultBranch) {
          setSelectedDiscoverBranchId(defaultBranch.id);
        }
      })
      .catch(() => {
        setBranches([]);
      });
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      contactName: s.contact_name ?? "",
      phone: s.phone ?? "",
      whatsappPhone: s.whatsapp_phone ?? "",
      email: s.email ?? "",
      address: s.address ?? "",
      paymentTerms: s.payment_terms ?? "",
      leadTimeDays: s.lead_time_days ?? 7,
      notes: s.notes ?? "",
      autoNotifyLowStock: s.auto_notify_low_stock,
      notifyThreshold: (s.notify_threshold as NotifyThreshold) || "critical",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "اسم المورّد مطلوب" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await authenticatedApi.updateSupplier(editing.id, {
          name: form.name.trim(),
          contactName: form.contactName || undefined,
          phone: form.phone || undefined,
          whatsappPhone: form.whatsappPhone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          paymentTerms: form.paymentTerms || undefined,
          leadTimeDays: form.leadTimeDays,
          notes: form.notes || undefined,
          autoNotifyLowStock: form.autoNotifyLowStock,
          notifyThreshold: form.notifyThreshold,
        });
        toast({ title: "تم تحديث المورّد" });
      } else {
        await authenticatedApi.createSupplier({
          name: form.name.trim(),
          contactName: form.contactName || undefined,
          phone: form.phone || undefined,
          whatsappPhone: form.whatsappPhone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          paymentTerms: form.paymentTerms || undefined,
          leadTimeDays: form.leadTimeDays,
          notes: form.notes || undefined,
          autoNotifyLowStock: form.autoNotifyLowStock,
          notifyThreshold: form.notifyThreshold,
        });
        toast({ title: "تمت إضافة المورّد" });
      }
      setShowForm(false);
      await loadSuppliers();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "حدث خطأ",
        description: e?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNotify = async (s: Supplier) => {
    try {
      await authenticatedApi.updateSupplier(s.id, {
        autoNotifyLowStock: !s.auto_notify_low_stock,
      });
      setSuppliers((prev) =>
        prev.map((x) =>
          x.id === s.id
            ? { ...x, auto_notify_low_stock: !x.auto_notify_low_stock }
            : x,
        ),
      );
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "فشل التحديث",
        description: e?.message,
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await authenticatedApi.deleteSupplier(deleteTarget.id);
      toast({ title: "تم حذف المورّد" });
      setDeleteTarget(null);
      await loadSuppliers();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "فشل الحذف",
        description: e?.message,
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!msgTarget || !msgText.trim()) return;
    setSending(true);
    try {
      const phone = msgTarget.whatsapp_phone || msgTarget.phone;
      if (!phone) throw new Error("لا يوجد رقم واتساب للمورّد");
      await authenticatedApi.sendSupplierMessage({
        supplierPhone: phone,
        message: msgText.trim(),
        supplierName: msgTarget.name,
      });
      toast({ title: "تم إرسال الرسالة بنجاح" });
      setMsgTarget(null);
      setMsgText("");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "فشل الإرسال",
        description: e?.message,
      });
    } finally {
      setSending(false);
    }
  };

  const filtered = suppliers.filter(
    (s) =>
      highlightedSupplierId === s.id ||
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.contact_name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    if (!highlightedSupplierId) return;
    const node = supplierCardRefs.current[highlightedSupplierId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedSupplierId, filtered.length]);

  useEffect(() => {
    if (!highlightedSupplierId) return;
    const timeoutId = window.setTimeout(() => {
      setHighlightedSupplierId(null);
    }, 6000);
    return () => window.clearTimeout(timeoutId);
  }, [highlightedSupplierId]);

  // ── Supplier discovery ─────────────────────────────────────────────────
  const openSupplierLookup = (
    mode: SupplierLookupMode,
    results?: SupplierLookupResult[],
  ) => {
    setDiscoverMode(mode);
    setDiscoverResults(results ?? []);
    setDiscoverMessage("");
    setDiscoverContext(null);
    setShowDiscover(true);
  };

  const handleDiscover = async () => {
    if (!discoverQuery.trim()) return;
    setDiscovering(true);
    setDiscoverMessage("");
    try {
      const data =
        discoverMode === "internal"
          ? await authenticatedApi.searchSuppliers(discoverQuery.trim(), {
              branchId:
                selectedDiscoverBranchId !== "all"
                  ? selectedDiscoverBranchId
                  : undefined,
              paymentTerms:
                discoverPaymentTerms !== "all"
                  ? discoverPaymentTerms
                  : undefined,
              maxLeadTimeDays: discoverMaxLeadTimeDays.trim()
                ? Number(discoverMaxLeadTimeDays)
                : undefined,
            })
          : await authenticatedApi.discoverSuppliers(discoverQuery.trim(), {
              branchId:
                selectedDiscoverBranchId !== "all"
                  ? selectedDiscoverBranchId
                  : undefined,
            });
      setDiscoverResults(data.results);
      setDiscoverMessage(
        typeof (data as any).message === "string" ? (data as any).message : "",
      );
      setDiscoverContext((data as any).context ?? null);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "فشل البحث",
        description: e?.message,
      });
    } finally {
      setDiscovering(false);
    }
  };

  const focusSupplierCard = async (
    supplierId: string,
    supplierName: string,
  ) => {
    setShowDiscover(false);
    setSearch("");
    setHighlightedSupplierId(supplierId);
    setExpandedSupplierId(supplierId);
    if (!supplierProducts[supplierId]) {
      setLoadingProducts(supplierId);
      try {
        const linked = await authenticatedApi.getSupplierProducts(supplierId);
        setSupplierProducts((prev) => ({
          ...prev,
          [supplierId]: linked.products,
        }));
      } catch {
        toast({ variant: "destructive", title: "تعذّر تحميل منتجات المورّد" });
      } finally {
        setLoadingProducts(null);
      }
    }
    toast({ title: `تم تحديد المورّد ${supplierName}` });
  };

  // ── Product linking ────────────────────────────────────────────────────
  const toggleProductPanel = async (supplierId: string) => {
    if (expandedSupplierId === supplierId) {
      setExpandedSupplierId(null);
      return;
    }
    setExpandedSupplierId(supplierId);
    if (supplierProducts[supplierId]) return; // already loaded
    setLoadingProducts(supplierId);
    try {
      const [linked, inv] = await Promise.all([
        authenticatedApi.getSupplierProducts(supplierId),
        allInventory.length
          ? Promise.resolve({ products: allInventory })
          : authenticatedApi.getSuppliers(), // fallback
      ]);
      setSupplierProducts((prev) => ({
        ...prev,
        [supplierId]: linked.products,
      }));
      // Pre-load inventory list once
      if (!allInventory.length) {
        // Use inventory endpoint if available, otherwise skip
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "تعذّر تحميل المنتجات" });
    } finally {
      setLoadingProducts(null);
    }
  };

  const handleLinkProduct = async (supplierId: string) => {
    const productId = selectedProductId[supplierId];
    if (!productId) return;
    setLinking(supplierId);
    try {
      await authenticatedApi.linkSupplierProduct(supplierId, { productId });
      const fresh = await authenticatedApi.getSupplierProducts(supplierId);
      setSupplierProducts((prev) => ({
        ...prev,
        [supplierId]: fresh.products,
      }));
      setSelectedProductId((prev) => ({ ...prev, [supplierId]: "" }));
      toast({ title: "تم ربط المنتج بالمورّد" });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "فشل الربط",
        description: e?.message,
      });
    } finally {
      setLinking(null);
    }
  };

  const handleUnlinkProduct = async (supplierId: string, productId: string) => {
    try {
      await authenticatedApi.unlinkSupplierProduct(supplierId, productId);
      setSupplierProducts((prev) => ({
        ...prev,
        [supplierId]: (prev[supplierId] ?? []).filter(
          (p) => p.product_id !== productId,
        ),
      }));
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشل إزالة الربط" });
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="إدارة الموردين"
        description="أضف موردّيك وفعّل التنبيهات التلقائية عند انخفاض المخزون"
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="بحث باسم المورّد..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button onClick={openCreate} className="mr-auto">
          <Plus className="w-4 h-4 ml-1" />
          إضافة مورّد
        </Button>
        <Button
          variant="outline"
          onClick={() => openSupplierLookup("internal")}
        >
          <Search className="w-4 h-4 ml-1" />
          ابحث في مورديك
        </Button>
        <Button
          variant="outline"
          onClick={() => openSupplierLookup("external")}
        >
          <Sparkles className="w-4 h-4 ml-1 text-purple-500" />
          اكتشف موردين جدد
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={loadSuppliers}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Auto-discovered supplier suggestions banner */}
      {autoSuggestions.length > 0 && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-purple-800">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="font-medium text-sm">
                  الذكاء الاصطناعي اكتشف {autoSuggestions.length} مورّد محتمل
                  لمنتجاتك الحرجة
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-purple-300 text-purple-700 hover:bg-purple-100"
                onClick={() => {
                  openSupplierLookup("external", autoSuggestions.slice(0, 8));
                }}
              >
                <Search className="w-3.5 h-3.5 ml-1" />
                عرض الاقتراحات
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 flex gap-2 items-center text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Truck className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="font-medium">لا يوجد موردون حتى الآن</p>
            <p className="text-sm mt-1">
              أضف موردّيك للبدء في إدارة المخزون التلقائي
            </p>
          </CardContent>
        </Card>
      )}

      {/* Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => (
          <Card
            key={s.id}
            ref={(node) => {
              supplierCardRefs.current[s.id] = node;
            }}
            className={`relative ${!s.is_active ? "opacity-60" : ""} ${highlightedSupplierId === s.id ? "ring-2 ring-blue-500 shadow-lg" : ""}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  {s.contact_name && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <User className="w-3 h-3" />
                      {s.contact_name}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openEdit(s)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(s)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Contact info */}
              <div className="flex flex-wrap gap-2 text-sm">
                {s.whatsapp_phone && (
                  <span className="flex items-center gap-1 text-green-700">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {s.whatsapp_phone}
                  </span>
                )}
                {s.phone && !s.whatsapp_phone && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Phone className="w-3.5 h-3.5" />
                    {s.phone}
                  </span>
                )}
              </div>

              {/* Auto-notify toggle */}
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  {s.auto_notify_low_stock ? (
                    <Bell className="w-4 h-4 text-amber-500" />
                  ) : (
                    <BellOff className="w-4 h-4 text-muted-foreground" />
                  )}
                  <div className="text-xs">
                    <p className="font-medium">
                      {s.auto_notify_low_stock
                        ? "تنبيه تلقائي مفعّل"
                        : "تنبيه تلقائي معطّل"}
                    </p>
                    {s.auto_notify_low_stock && (
                      <p className="text-muted-foreground">
                        {THRESHOLD_LABELS[
                          s.notify_threshold as NotifyThreshold
                        ] ?? s.notify_threshold}
                      </p>
                    )}
                  </div>
                </div>
                <Switch
                  checked={s.auto_notify_low_stock}
                  onCheckedChange={() => handleToggleNotify(s)}
                />
              </div>

              {s.last_auto_notified_at && (
                <p className="text-[11px] text-muted-foreground">
                  آخر إشعار:{" "}
                  {new Date(s.last_auto_notified_at).toLocaleDateString(
                    "ar-SA",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    },
                  )}
                </p>
              )}

              {/* No WA phone warning */}
              {!s.whatsapp_phone && !s.phone && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>لا يوجد رقم واتساب – </span>
                  <button
                    className="underline font-medium"
                    onClick={() => {
                      setDiscoverQuery(s.name);
                      openSupplierLookup("external");
                    }}
                  >
                    ابحث عن رقم
                  </button>
                </div>
              )}

              {/* Send message button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setMsgTarget(s);
                  setMsgText("");
                }}
                disabled={!s.whatsapp_phone && !s.phone}
              >
                <Send className="w-3.5 h-3.5 ml-1" />
                إرسال رسالة واتساب
              </Button>

              {/* Product linking panel */}
              <div className="border-t pt-2">
                <button
                  className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => toggleProductPanel(s.id)}
                >
                  <span className="flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    منتجات المورّد
                    {supplierProducts[s.id]?.length > 0 && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {supplierProducts[s.id].length}
                      </Badge>
                    )}
                  </span>
                  {expandedSupplierId === s.id ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {expandedSupplierId === s.id && (
                  <div className="mt-2 space-y-1.5">
                    {loadingProducts === s.id ? (
                      <div className="flex justify-center py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        {(supplierProducts[s.id] ?? []).map((p) => (
                          <div
                            key={p.product_id}
                            className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1"
                          >
                            <div>
                              <span className="font-medium">
                                {p.product_name}
                              </span>
                              <span className="text-muted-foreground mr-1">
                                ({p.quantity_in_stock ?? 0})
                              </span>
                            </div>
                            <button
                              className="text-destructive hover:opacity-80"
                              onClick={() =>
                                handleUnlinkProduct(s.id, p.product_id)
                              }
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-1.5">
                          <Input
                            placeholder="معرّف المنتج..."
                            value={selectedProductId[s.id] ?? ""}
                            onChange={(e) =>
                              setSelectedProductId((prev) => ({
                                ...prev,
                                [s.id]: e.target.value,
                              }))
                            }
                            className="h-7 text-xs"
                          />
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={
                              !selectedProductId[s.id] || linking === s.id
                            }
                            onClick={() => handleLinkProduct(s.id)}
                          >
                            {linking === s.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              "ربط"
                            )}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Create / Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "تعديل المورّد" : "إضافة مورّد جديد"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "عدّل بيانات المورّد وفعّل التنبيه التلقائي إذا أردت"
                : "أدخل بيانات المورّد وفعّل التنبيه التلقائي عند انخفاض المخزون"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
            {/* Name */}
            <div>
              <Label>اسم المورّد *</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="مثال: مورّد الأجهزة الكهربائية"
              />
            </div>

            {/* Contact name */}
            <div>
              <Label>اسم جهة الاتصال</Label>
              <Input
                value={form.contactName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, contactName: e.target.value }))
                }
                placeholder="المسؤول / مندوب المبيعات"
              />
            </div>

            {/* Phones */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>رقم الهاتف</Label>
                <Input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="+966..."
                  dir="ltr"
                />
              </div>
              <div>
                <Label>رقم واتساب</Label>
                <Input
                  value={form.whatsappPhone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, whatsappPhone: e.target.value }))
                  }
                  placeholder="+966... (للإشعارات)"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input
                value={form.email}
                type="email"
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
                placeholder="supplier@example.com"
                dir="ltr"
              />
            </div>

            {/* Lead time + payment */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>مدة التوريد (أيام)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.leadTimeDays}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      leadTimeDays: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <Label>شروط الدفع</Label>
                <Input
                  value={form.paymentTerms}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, paymentTerms: e.target.value }))
                  }
                  placeholder="نقداً / 30 يوم..."
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>ملاحظات</Label>
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                rows={2}
                placeholder="أي تفاصيل إضافية..."
              />
            </div>

            {/* Auto-notify section */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">
                    تنبيه تلقائي عند انخفاض المخزون
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    يُرسل رسالة واتساب تلقائية للمورّد يومياً
                  </p>
                </div>
                <Switch
                  checked={form.autoNotifyLowStock}
                  onCheckedChange={(v) =>
                    setForm((p) => ({ ...p, autoNotifyLowStock: v }))
                  }
                />
              </div>

              {form.autoNotifyLowStock && (
                <div>
                  <Label>حد التنبيه</Label>
                  <Select
                    value={form.notifyThreshold}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        notifyThreshold: v as NotifyThreshold,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(THRESHOLD_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              {editing ? "حفظ التغييرات" : "إضافة المورّد"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Send Message Dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!msgTarget} onOpenChange={(o) => !o && setMsgTarget(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إرسال رسالة واتساب</DialogTitle>
            <DialogDescription>
              إرسال رسالة مباشرة إلى {msgTarget?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <MessageSquare className="w-3.5 h-3.5 inline ml-1 text-green-600" />
              {msgTarget?.whatsapp_phone || msgTarget?.phone}
            </p>
            <Textarea
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              rows={4}
              placeholder="اكتب رسالتك هنا..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMsgTarget(null)}>
              إلغاء
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={sending || !msgText.trim()}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 ml-2" />
              )}
              إرسال
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المورّد</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف <strong>{deleteTarget?.name}</strong>؟ لا يمكن
              التراجع عن هذه العملية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Discover Suppliers Dialog ─────────────────────────────────────── */}
      <Dialog open={showDiscover} onOpenChange={setShowDiscover}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {discoverMode === "internal" ? (
                <Search className="w-5 h-5 text-blue-600" />
              ) : (
                <Sparkles className="w-5 h-5 text-purple-500" />
              )}
              {discoverMode === "internal"
                ? "ابحث في مورديك"
                : "اكتشف موردين جدد"}
            </DialogTitle>
            <DialogDescription>
              {discoverMode === "internal"
                ? "ابحث داخل الموردين الموجودين في نظامك مع ترجيح الفرع الرسمي والمنتجات المرتبطة"
                : "ابحث عن موردين جدد بالمنتج أو الفئة - يستخدم خرائط Google والذكاء الاصطناعي"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              variant={discoverMode === "internal" ? "default" : "outline"}
              onClick={() => {
                setDiscoverMode("internal");
                setDiscoverResults([]);
                setDiscoverMessage("");
                setDiscoverContext(null);
              }}
            >
              <Search className="w-4 h-4 ml-1" />
              ابحث في مورديك
            </Button>
            <Button
              type="button"
              variant={discoverMode === "external" ? "default" : "outline"}
              onClick={() => {
                setDiscoverMode("external");
                setDiscoverResults([]);
                setDiscoverMessage("");
                setDiscoverContext(null);
              }}
            >
              <Sparkles className="w-4 h-4 ml-1" />
              اكتشف موردين جدد
            </Button>
          </div>

          {branches.length > 0 && (
            <div className="space-y-2">
              <Label>الفرع المرجعي</Label>
              <Select
                value={selectedDiscoverBranchId}
                onValueChange={setSelectedDiscoverBranchId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الفرع الافتراضي / أي فرع</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                      {branch.city ? ` - ${branch.city}` : ""}
                      {branch.is_default ? " (افتراضي)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {discoverMode === "internal" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>شروط الدفع</Label>
                <Select
                  value={discoverPaymentTerms}
                  onValueChange={setDiscoverPaymentTerms}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="كل الشروط" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الشروط</SelectItem>
                    <SelectItem value="COD">COD</SelectItem>
                    <SelectItem value="NET30">NET30</SelectItem>
                    <SelectItem value="PREPAID">PREPAID</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>أقصى مدة توريد بالأيام</Label>
                <Input
                  type="number"
                  min={1}
                  value={discoverMaxLeadTimeDays}
                  onChange={(e) => setDiscoverMaxLeadTimeDays(e.target.value)}
                  placeholder="مثال: 7"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={discoverQuery}
              onChange={(e) => setDiscoverQuery(e.target.value)}
              placeholder={
                discoverMode === "internal"
                  ? "مثال: أقمشة / كراتين / خيط / مورد تغليف..."
                  : "مثال: أجهزة كهربائية / حلويات / خضروات..."
              }
              onKeyDown={(e) => e.key === "Enter" && handleDiscover()}
              className="flex-1"
            />
            <Button
              onClick={handleDiscover}
              disabled={discovering || !discoverQuery.trim()}
            >
              {discovering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>

          {discoverContext &&
            (discoverContext.branchName ||
              discoverContext.city ||
              discoverContext.address) && (
              <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                سيتم استخدام موقع
                {discoverContext.branchName
                  ? ` ${discoverContext.branchName}`
                  : " الفرع المرجعي"}
                {discoverContext.city ? ` في ${discoverContext.city}` : ""}
                {discoverContext.address ? `، ${discoverContext.address}` : ""}
                {discoverMode === "internal"
                  ? " لترتيب الموردين الأنسب داخل نظامك."
                  : " كنقطة مرجعية للبحث الخارجي."}
              </div>
            )}

          {discoverMessage && (
            <div className="rounded-lg border bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {discoverMessage}
            </div>
          )}

          {discoverResults.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              <div
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${discoverMode === "internal" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-purple-200 bg-purple-50 text-purple-800"}`}
              >
                {discoverMode === "internal"
                  ? "نتائج من داخل نظامك"
                  : "نتائج خارجية لاكتشاف موردين جدد"}
              </div>
              {discoverResults.map((r, i) => (
                <Card key={i} className="p-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{r.name}</p>
                      {r.address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{r.address}</span>
                        </p>
                      )}
                      {(r.region || r.type) && (
                        <p className="text-xs text-muted-foreground">
                          {[r.region, r.type].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {typeof r.leadTimeDays === "number" && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          مهلة التوريد: {r.leadTimeDays} يوم
                          {r.paymentTerms ? ` · الدفع: ${r.paymentTerms}` : ""}
                        </p>
                      )}
                      {r.rating != null && (
                        <p className="text-xs flex items-center gap-1 mt-0.5">
                          <Star className="w-3 h-3 text-yellow-500" />
                          {r.rating}
                          {r.totalRatings != null && (
                            <span className="text-muted-foreground">
                              ({r.totalRatings})
                            </span>
                          )}
                        </p>
                      )}
                      {r.searchTip && (
                        <p className="text-xs text-blue-600 mt-1">
                          💡 {r.searchTip}
                        </p>
                      )}
                      {r.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.notes}
                        </p>
                      )}
                      {r.linkedProducts && r.linkedProducts.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          منتجات مرتبطة:{" "}
                          {r.linkedProducts.slice(0, 3).join("، ")}
                        </p>
                      )}
                      {r.matchReasons && r.matchReasons.length > 0 && (
                        <p className="text-xs text-blue-700 mt-1">
                          {r.matchReasons.join(" · ")}
                        </p>
                      )}
                      <Badge variant="outline" className="text-[10px] mt-1.5">
                        {r.source === "internal_existing"
                          ? "موجود في نظامك"
                          : r.source === "google_maps"
                            ? "خرائط Google"
                            : "اقتراح ذكاء اصطناعي"}
                      </Badge>
                    </div>
                    {r.source === "internal_existing" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          if (r.supplierId) {
                            void focusSupplierCard(r.supplierId, r.name);
                          }
                        }}
                      >
                        <Search className="w-3 h-3 ml-1" />
                        عرض المورد
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            name: r.name,
                            address: r.address ?? "",
                            phone: r.phone ?? "",
                            whatsappPhone: r.phone ?? "",
                          }));
                          setEditing(null);
                          setShowDiscover(false);
                          setShowForm(true);
                        }}
                      >
                        <Plus className="w-3 h-3 ml-1" />
                        إضافة
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {!discovering && discoverResults.length === 0 && discoverQuery && (
            <p className="text-center text-muted-foreground py-4 text-sm">
              {discoverMessage || "لا توجد نتائج - جرّب كلمات مختلفة"}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
