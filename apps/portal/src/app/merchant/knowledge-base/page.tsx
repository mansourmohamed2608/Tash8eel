"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { EmptyState, AlertBanner } from "@/components/ui/alerts";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Package,
  HelpCircle,
  Clock,
  MapPin,
  FileText,
  Search,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Info,
  Store,
  Phone,
  Globe,
  MessageSquare,
  ChefHat,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useToast } from "@/hooks/use-toast";
import { RecipeManager } from "@/components/inventory/recipe-manager";

// ==================== INTERFACES ====================

interface MenuItem {
  id: string;
  name: string;
  nameEn?: string;
  description?: string;
  price: number;
  category: string;
  isAvailable: boolean;
  has_recipe?: boolean;
  variants?: Array<{
    name: string;
    priceModifier: number;
  }>;
  options?: Array<{
    name: string;
    choices: string[];
    required: boolean;
  }>;
  imageUrl?: string;
  tags?: string[];
}

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  isActive: boolean;
}

interface Offer {
  id: string;
  name: string;
  nameAr?: string;
  description?: string;
  type: string;
  value: number;
  code?: string;
  autoApply?: boolean;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}

interface BusinessInfo {
  name: string;
  nameEn?: string;
  description?: string;
  category: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  address?: string;
  city?: string;
  deliveryPricing?: {
    mode: "UNIFIED" | "BY_CITY";
    unifiedPrice?: number | null;
    byCity?: Array<{
      id?: string;
      city?: string;
      area?: string;
      price: number;
    }>;
    notes?: string;
  };
  workingHours?: {
    [day: string]: { open: string; close: string; closed?: boolean };
  };
  policies?: {
    returnPolicy?: string;
    deliveryInfo?: string;
    paymentMethods?: string[];
  };
  socialMedia?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
  };
}

// ==================== DEFAULT DATA ====================

const defaultBusinessInfo: BusinessInfo = {
  name: "",
  category: "عام",
  deliveryPricing: {
    mode: "UNIFIED",
    unifiedPrice: null,
    byCity: [],
  },
  workingHours: {
    sunday: { open: "09:00", close: "22:00" },
    monday: { open: "09:00", close: "22:00" },
    tuesday: { open: "09:00", close: "22:00" },
    wednesday: { open: "09:00", close: "22:00" },
    thursday: { open: "09:00", close: "22:00" },
    friday: { open: "14:00", close: "23:00" },
    saturday: { open: "09:00", close: "23:00" },
  },
  policies: {
    paymentMethods: ["كاش", "تحويل بنكي"],
  },
};

const defaultMenuItem: Omit<MenuItem, "id"> = {
  name: "",
  price: 0,
  category: "عام",
  isAvailable: true,
};

const defaultFAQ: Omit<FAQ, "id"> = {
  question: "",
  answer: "",
  category: "عام",
  isActive: true,
};

const dayNames: Record<string, string> = {
  sunday: "الأحد",
  monday: "الاثنين",
  tuesday: "الثلاثاء",
  wednesday: "الأربعاء",
  thursday: "الخميس",
  friday: "الجمعة",
  saturday: "السبت",
};

const menuCategories = [
  "عام",
  "تجزئة",
  "ملابس",
  "إلكترونيات",
  "إكسسوارات",
  "منزل وحديقة",
  "صحة وجمال",
  "منتجات رقمية",
  "خدمات",
  "تعليم/تدريب",
  "أخرى",
];

const faqCategories = [
  "عام",
  "التوصيل",
  "الدفع",
  "الطلبات",
  "الاسترجاع",
  "أخرى",
];

const businessCategories = [
  "عام",
  "تجارة إلكترونية",
  "تجزئة/متجر",
  "خدمات",
  "ملابس",
  "إلكترونيات",
  "صحة وجمال",
  "تعليم/تدريب",
  "مطعم",
  "مقهى",
  "أخرى",
];

// ==================== COMPONENT ====================

export default function KnowledgeBasePage() {
  const { merchantId, apiKey, isDemo, merchant } = useMerchant();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { canCreate, canEdit, canDelete, isReadOnly } =
    useRoleAccess("knowledge-base");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("menu");

  // Data states
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [businessInfo, setBusinessInfo] =
    useState<BusinessInfo>(defaultBusinessInfo);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Dialog states
  const [showMenuDialog, setShowMenuDialog] = useState(false);
  const [showFAQDialog, setShowFAQDialog] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [editingFAQ, setEditingFAQ] = useState<FAQ | null>(null);
  const [menuItemToDelete, setMenuItemToDelete] = useState<MenuItem | null>(
    null,
  );
  const [faqToDelete, setFaqToDelete] = useState<FAQ | null>(null);
  const [showAutoFaqDialog, setShowAutoFaqDialog] = useState(false);
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [offerForm, setOfferForm] = useState({
    name: "",
    nameAr: "",
    description: "",
    type: "PERCENTAGE",
    value: 10,
    code: "",
    endDate: "",
  });
  const [autoFaqs, setAutoFaqs] = useState<FAQ[]>([]);
  const [autoFaqMode, setAutoFaqMode] = useState<
    "both" | "products" | "policies"
  >("both");
  const [autoFaqLimit, setAutoFaqLimit] = useState<5 | 10>(5);
  const [menuFormData, setMenuFormData] = useState(defaultMenuItem);
  const [faqFormData, setFaqFormData] = useState(defaultFAQ);
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const showError = (description: string) => {
    toast({ title: "خطأ", description, variant: "destructive" });
  };

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return fallback;
  };

  // ==================== LOAD DATA ====================

  const loadData = useCallback(async () => {
    if (!merchantId || !apiKey) return;

    setLoading(true);
    try {
      // Load catalog items
      const catalogResponse = await merchantApi.getCatalogItems(
        merchantId,
        apiKey,
      );
      if (catalogResponse?.items) {
        const items: MenuItem[] = catalogResponse.items.map((item: any) => ({
          id: item.id,
          name: item.name_ar || item.name,
          nameEn: item.nameEn || item.name_en,
          description: item.description_ar || item.description,
          price: parseFloat(item.base_price || item.price || "0"),
          category: item.category || "الرئيسي",
          isAvailable: item.isActive ?? item.is_available !== false,
          has_recipe: item.has_recipe || item.hasRecipe || false,
          variants: item.variants,
          options: item.options,
          imageUrl: item.image_url,
          tags: item.tags,
        }));
        setMenuItems(items);
      }

      // Load FAQs from merchant knowledge base
      try {
        const kbResponse = await merchantApi.getKnowledgeBase(
          merchantId,
          apiKey,
        );
        if (kbResponse?.faqs) {
          setFaqs(kbResponse.faqs);
        }
        if (kbResponse?.businessInfo) {
          setBusinessInfo({
            ...defaultBusinessInfo,
            ...kbResponse.businessInfo,
          });
        }
        if (kbResponse?.offers) {
          setOffers(kbResponse.offers as Offer[]);
        } else {
          const promos = await merchantApi.getPromotions(merchantId, apiKey);
          setOffers(promos?.promotions || []);
        }
        if ((kbResponse as any)?.updatedAt) {
          setLastSavedAt((kbResponse as any).updatedAt);
        }
      } catch {
        // KB might not exist yet, use defaults
        // KB might not exist yet - use defaults
      }

      // Set business name from merchant if available
      if (merchant?.name) {
        setBusinessInfo((prev) => ({
          ...prev,
          name: prev.name || merchant.name,
        }));
      }
    } catch (err) {
      console.error("Failed to load knowledge base:", err);
    }
    setLoading(false);
  }, [merchantId, apiKey, merchant]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "menu" || tab === "faqs" || tab === "business") {
      setActiveTab(tab);
      return;
    }
    setActiveTab("menu");
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "menu") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  // ==================== MENU HANDLERS ====================

  const handleSaveMenuItem = async () => {
    const trimmedName = menuFormData.name.trim();
    if (!canEdit) {
      showError("غير مصرح بتنفيذ هذا الإجراء");
      return;
    }

    if (
      !merchantId ||
      !apiKey ||
      !trimmedName ||
      !Number.isFinite(menuFormData.price) ||
      menuFormData.price < 0
    )
      return;

    setSaving(true);
    try {
      if (editingMenuItem) {
        // Update existing
        await merchantApi.updateCatalogItem(
          merchantId,
          editingMenuItem.id,
          {
            name: trimmedName,
            nameEn: menuFormData.nameEn,
            description: menuFormData.description,
            price: menuFormData.price,
            category: menuFormData.category,
            isAvailable: menuFormData.isAvailable,
          },
          apiKey,
        );
      } else {
        // Create new
        await merchantApi.createCatalogItem(
          merchantId,
          {
            name: trimmedName,
            nameEn: menuFormData.nameEn,
            description: menuFormData.description,
            price: menuFormData.price,
            category: menuFormData.category,
            isAvailable: menuFormData.isAvailable,
          },
          apiKey,
        );
      }

      setShowMenuDialog(false);
      setEditingMenuItem(null);
      setMenuFormData(defaultMenuItem);
      setLastSavedAt(new Date().toISOString());
      await loadData();
    } catch (err) {
      console.error("Failed to save menu item:", err);
      showError(getErrorMessage(err, "فشل في حفظ المنتج/الخدمة"));
    }
    setSaving(false);
  };

  const handleDeleteMenuItem = async () => {
    if (!merchantId || !apiKey || !menuItemToDelete) return;

    try {
      await merchantApi.deleteCatalogItem(
        merchantId,
        menuItemToDelete.id,
        apiKey,
      );
      setMenuItemToDelete(null);
      await loadData();
    } catch (err) {
      console.error("Failed to delete menu item:", err);
      showError("فشل في حذف المنتج/الخدمة");
    }
  };

  const openEditMenuItem = (item: MenuItem) => {
    setEditingMenuItem(item);
    setMenuFormData({
      name: item.name,
      nameEn: item.nameEn,
      description: item.description,
      price: item.price,
      category: item.category,
      isAvailable: item.isAvailable,
    });
    setShowMenuDialog(true);
  };

  // ==================== FAQ HANDLERS ====================

  const handleSaveFAQ = async () => {
    if (!merchantId || !apiKey || !faqFormData.question || !faqFormData.answer)
      return;

    setSaving(true);
    try {
      const updatedFaqs = editingFAQ
        ? faqs.map((f) =>
            f.id === editingFAQ.id ? { ...faqFormData, id: editingFAQ.id } : f,
          )
        : [...faqs, { ...faqFormData, id: `faq-${Date.now()}` }];

      await merchantApi.updateKnowledgeBase(
        merchantId,
        {
          faqs: updatedFaqs,
          businessInfo,
        },
        apiKey,
      );

      setFaqs(updatedFaqs);
      setShowFAQDialog(false);
      setEditingFAQ(null);
      setFaqFormData(defaultFAQ);
      setLastSavedAt(new Date().toISOString());
    } catch (err) {
      console.error("Failed to save FAQ:", err);
      showError("فشل في حفظ السؤال");
    }
    setSaving(false);
  };

  const buildAutoFaqsFromTemplates = (
    mode: "both" | "products" | "policies",
    limit: 5 | 10,
  ) => {
    const existingQuestions = new Set(faqs.map((f) => f.question));
    const suggestions: FAQ[] = [];

    const addFaq = (question: string, answer: string, category: string) => {
      if (!question || !answer) return;
      if (existingQuestions.has(question)) return;
      existingQuestions.add(question);
      suggestions.push({
        id: `faq-auto-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        question,
        answer,
        category,
        isActive: true,
      });
    };

    if (mode === "both" || mode === "products") {
      // Top products (first N from catalog)
      menuItems.slice(0, limit).forEach((item) => {
        const question = `ما هو سعر "${item.name}"؟`;
        const availability = item.isAvailable
          ? "ومتوفر حالياً"
          : "وحالياً غير متوفر";
        const answer = `سعر "${item.name}" هو ${formatCurrency(item.price)} ${availability}.`;
        addFaq(question, answer, "الطلبات");
      });
    }

    if (mode === "both" || mode === "policies") {
      // Policies templates
      if (businessInfo.policies?.deliveryInfo) {
        addFaq(
          "ما هي سياسة التوصيل؟",
          businessInfo.policies.deliveryInfo,
          "التوصيل",
        );
      }
      if (businessInfo.policies?.returnPolicy) {
        addFaq(
          "ما هي سياسة الاسترجاع؟",
          businessInfo.policies.returnPolicy,
          "الاسترجاع",
        );
      }
      if (
        businessInfo.policies?.paymentMethods &&
        businessInfo.policies.paymentMethods.length > 0
      ) {
        addFaq(
          "ما طرق الدفع المتاحة؟",
          `طرق الدفع المتاحة: ${businessInfo.policies.paymentMethods.join("، ")}`,
          "الدفع",
        );
      }
    }

    return suggestions;
  };

  const openAutoFaqsDialog = (
    mode: "both" | "products" | "policies" = "both",
    limit: 5 | 10 = autoFaqLimit,
  ) => {
    setAutoFaqMode(mode);
    setAutoFaqLimit(limit);
    const generated = buildAutoFaqsFromTemplates(mode, limit);
    setAutoFaqs(generated);
    setShowAutoFaqDialog(true);
  };

  const handleApplyAutoFaqs = async () => {
    if (!merchantId || !apiKey) return;
    if (autoFaqs.length === 0) {
      showError("لا توجد أسئلة جديدة لإنشائها");
      return;
    }
    setSaving(true);
    try {
      const updatedFaqs = [...faqs, ...autoFaqs];
      await merchantApi.updateKnowledgeBase(
        merchantId,
        {
          faqs: updatedFaqs,
          businessInfo,
        },
        apiKey,
      );
      setFaqs(updatedFaqs);
      setAutoFaqs([]);
      setShowAutoFaqDialog(false);
      setLastSavedAt(new Date().toISOString());
      toast({ title: "تم", description: "تم إنشاء أسئلة تلقائية من الكتالوج" });
    } catch (err) {
      console.error("Failed to auto-generate FAQs:", err);
      showError("فشل في إنشاء الأسئلة تلقائياً");
    }
    setSaving(false);
  };

  const handleDeleteFAQ = async () => {
    if (!merchantId || !apiKey || !faqToDelete) return;

    try {
      const updatedFaqs = faqs.filter((f) => f.id !== faqToDelete.id);
      await merchantApi.updateKnowledgeBase(
        merchantId,
        {
          faqs: updatedFaqs,
          businessInfo,
        },
        apiKey,
      );
      setFaqs(updatedFaqs);
      setFaqToDelete(null);
      setLastSavedAt(new Date().toISOString());
    } catch (err) {
      console.error("Failed to delete FAQ:", err);
      showError("فشل في حذف السؤال");
    }
  };

  const openEditFAQ = (faq: FAQ) => {
    setEditingFAQ(faq);
    setFaqFormData({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      isActive: faq.isActive,
    });
    setShowFAQDialog(true);
  };

  // ==================== BUSINESS INFO HANDLERS ====================

  const handleSaveBusinessInfo = async () => {
    if (!merchantId || !apiKey) return;
    if (!hasValidDeliveryPricing) {
      showError("يرجى إدخال أسعار التوصيل (سعر موحّد أو أسعار حسب المنطقة).");
      return;
    }

    setSaving(true);
    try {
      await merchantApi.updateKnowledgeBase(
        merchantId,
        {
          faqs,
          businessInfo,
        },
        apiKey,
      );
      toast({ title: "تم", description: "تم حفظ معلومات النشاط بنجاح" });
      setLastSavedAt(new Date().toISOString());
    } catch (err) {
      console.error("Failed to save business info:", err);
      showError("فشل في حفظ المعلومات");
    }
    setSaving(false);
  };

  const updateDeliveryPricing = (
    updates: Partial<NonNullable<BusinessInfo["deliveryPricing"]>>,
  ) => {
    setBusinessInfo((prev) => {
      const current = prev.deliveryPricing || {
        mode: "UNIFIED" as const,
        unifiedPrice: null,
        byCity: [],
      };
      return {
        ...prev,
        deliveryPricing: {
          ...current,
          ...updates,
        },
      };
    });
  };

  const makeDeliveryEntryId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as Crypto).randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const handleAddDeliveryCity = () => {
    const entries = deliveryPricing.byCity || [];
    updateDeliveryPricing({
      mode: "BY_CITY",
      byCity: [
        ...entries,
        { id: makeDeliveryEntryId(), area: "", city: "", price: 0 },
      ],
    });
  };

  const handleUpdateDeliveryCity = (
    index: number,
    updates: { area?: string; city?: string; price?: number },
  ) => {
    const entries = (deliveryPricing.byCity || []).map((entry, idx) =>
      idx === index ? { ...entry, ...updates } : entry,
    );
    updateDeliveryPricing({ mode: "BY_CITY", byCity: entries });
  };

  const handleRemoveDeliveryCity = (index: number) => {
    const entries = (deliveryPricing.byCity || []).filter(
      (_, idx) => idx !== index,
    );
    updateDeliveryPricing({ mode: "BY_CITY", byCity: entries });
  };

  // ==================== OFFERS HANDLERS ====================

  const handleCreateOffer = async () => {
    if (!merchantId || !apiKey) return;
    if (!offerForm.name && !offerForm.nameAr) {
      showError("اسم العرض مطلوب");
      return;
    }
    setSavingOffer(true);
    try {
      await merchantApi.createPromotion(merchantId, apiKey, {
        name: offerForm.name || offerForm.nameAr,
        nameAr: offerForm.nameAr || undefined,
        description: offerForm.description || undefined,
        type: offerForm.type,
        value: Number(offerForm.value) || 0,
        code: offerForm.code || undefined,
        autoApply: !offerForm.code,
        minOrderAmount: 0,
        startDate: new Date().toISOString(),
        endDate: offerForm.endDate
          ? new Date(offerForm.endDate).toISOString()
          : null,
      });
      setShowOfferDialog(false);
      setOfferForm({
        name: "",
        nameAr: "",
        description: "",
        type: "PERCENTAGE",
        value: 10,
        code: "",
        endDate: "",
      });
      await loadData();
      toast({ title: "تم", description: "تمت إضافة العرض" });
    } catch (err) {
      console.error("Failed to create offer:", err);
      showError("فشل في إنشاء العرض");
    } finally {
      setSavingOffer(false);
    }
  };

  // ==================== FILTERED DATA ====================

  const filteredMenuItems = searchQuery
    ? menuItems.filter(
        (item) =>
          item.name.includes(searchQuery) ||
          item.category.includes(searchQuery) ||
          item.description?.includes(searchQuery),
      )
    : menuItems;

  const filteredFAQs = searchQuery
    ? faqs.filter(
        (faq) =>
          faq.question.includes(searchQuery) ||
          faq.answer.includes(searchQuery) ||
          faq.category.includes(searchQuery),
      )
    : faqs;

  const deliveryPricing = businessInfo.deliveryPricing || {
    mode: "UNIFIED",
    unifiedPrice: null,
    byCity: [] as Array<{
      id?: string;
      city?: string;
      area?: string;
      price: number;
    }>,
  };
  useEffect(() => {
    const entries = deliveryPricing.byCity || [];
    if (entries.length === 0) return;
    if (entries.every((entry) => entry.id)) return;
    updateDeliveryPricing({
      byCity: entries.map((entry) => ({
        ...entry,
        id: entry.id || makeDeliveryEntryId(),
      })),
    });
  }, [deliveryPricing.byCity]);
  const hasValidDeliveryPricing = (() => {
    if (deliveryPricing.mode === "UNIFIED") {
      return Number.isFinite(Number(deliveryPricing.unifiedPrice));
    }
    const entries = deliveryPricing.byCity || [];
    if (entries.length === 0) return false;
    return entries.every(
      (entry) =>
        (entry.area || entry.city)?.trim() &&
        Number.isFinite(Number(entry.price)),
    );
  })();

  const checklistItems = [
    {
      label: "أضف اسم النشاط + الفئة",
      done: Boolean(businessInfo.name) && Boolean(businessInfo.category),
    },
    {
      label: "أضف بيانات التواصل (هاتف/واتساب/موقع)",
      done: Boolean(
        businessInfo.phone || businessInfo.whatsapp || businessInfo.website,
      ),
    },
    {
      label: "أضف 5 منتجات/خدمات على الأقل",
      done: menuItems.length >= 5,
    },
    {
      label: "أضف 3 أسئلة شائعة على الأقل",
      done: faqs.length >= 3,
    },
    {
      label: "أضف سياسات التوصيل والدفع/الاسترجاع",
      done: Boolean(
        businessInfo.policies?.deliveryInfo ||
        businessInfo.policies?.returnPolicy ||
        (businessInfo.policies?.paymentMethods &&
          businessInfo.policies.paymentMethods.length > 0),
      ),
    },
    {
      label: "أضف أسعار التوصيل (موحّد أو حسب المنطقة)",
      done: hasValidDeliveryPricing,
    },
  ];
  const completedChecklist = checklistItems.filter((item) => item.done).length;
  const checklistPercent = Math.round(
    (completedChecklist / checklistItems.length) * 100,
  );

  useEffect(() => {
    if (!merchantId || typeof window === "undefined") return;
    const value = Number.isFinite(checklistPercent) ? checklistPercent : 0;
    const payload = { value, ts: Date.now() };
    window.localStorage.setItem(
      `kbCompletion:${merchantId}`,
      JSON.stringify(payload),
    );
    window.dispatchEvent(
      new CustomEvent("kb:completion", { detail: { merchantId, ...payload } }),
    );
  }, [merchantId, checklistPercent]);

  // ==================== STATS ====================

  const stats = {
    menuItems: menuItems.length,
    availableItems: menuItems.filter((i) => i.isAvailable).length,
    faqs: faqs.length,
    activeFaqs: faqs.filter((f) => f.isActive).length,
  };

  // ==================== RENDER ====================

  if (loading) {
    return (
      <div>
        <PageHeader title="قاعدة المعرفة" />
        <TableSkeleton rows={5} columns={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="قاعدة المعرفة"
        description="أضف المعلومات التي يستخدمها الذكاء الاصطناعي للرد على عملائك"
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            {lastSavedAt && (
              <span className="text-xs text-muted-foreground">
                آخر حفظ: {new Date(lastSavedAt).toLocaleString("ar-SA")}
              </span>
            )}
            <Button
              variant="outline"
              onClick={loadData}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4 ml-2" />
              تحديث
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <Package className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
          <span className="text-muted-foreground">العناصر</span>
          <span className="font-mono text-[var(--accent-gold)]">
            {menuItems.length ?? 0}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <HelpCircle className="h-3.5 w-3.5 text-[var(--accent-blue)]" />
          <span className="text-muted-foreground">الأسئلة الشائعة</span>
          <span className="font-mono text-[var(--accent-blue)]">
            {faqs.length}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent-success)]" />
          <span className="text-muted-foreground">العروض</span>
          <span className="font-mono text-[var(--accent-success)]">
            {offers.length}
          </span>
        </div>
      </div>

      {/* AI Info Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h4 className="font-medium text-primary">
                كيف يستخدم الذكاء الاصطناعي هذه المعلومات؟
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                عندما يسأل عميل عن منتج أو سعر أو معلومة، يستخدم الذكاء
                الاصطناعي البيانات التي تضيفها هنا للرد بدقة. كلما أضفت معلومات
                أكثر، كانت الردود أفضل وأدق.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {checklistPercent < 100 && (
        <Card className="border-[color:color-mix(in_srgb,var(--accent-warning)_20%,transparent)] bg-[var(--warning-muted)]">
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-[var(--accent-warning)]">
                استكمال قاعدة المعرفة
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                نسبة اكتمالك الحالية {checklistPercent}% - أكمل النقاط لتحسين
                دقة ردود الذكاء الاصطناعي.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => openAutoFaqsDialog("both")}
              >
                إعادة توليد الأسئلة
              </Button>
              <Link href="/merchant/onboarding" className={buttonVariants({})}>
                البدء السريع
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Onboarding Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            البداية السريعة
          </CardTitle>
          <CardDescription>
            أكمل هذه النقاط لتحسين ردود الذكاء الاصطناعي
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Progress value={checklistPercent} className="h-2 flex-1" />
            <span className="text-sm text-muted-foreground">
              {checklistPercent}%
            </span>
          </div>
          <div className="space-y-2">
            {checklistItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                {item.done ? (
                  <CheckCircle className="h-4 w-4 text-[var(--accent-success)]" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-[var(--accent-warning)]" />
                )}
                <span
                  className={
                    item.done ? "text-foreground" : "text-muted-foreground"
                  }
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <h4 className="font-medium">
                ما الفرق بين المخزون وقاعدة المعرفة؟
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                <strong>المخزون</strong> لإدارة الكميات الفعلية والمواقع
                والتوريد.
                <strong className="ml-1">قاعدة المعرفة</strong> لتجميع معلومات
                النشاط والأسئلة الشائعة وسياساتك حتى يستخدمها الذكاء الاصطناعي
                في الردود. لا يوجد ربط تلقائي بينهما.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suggested Prompts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            ماذا يكتب العميل؟ (أمثلة)
          </CardTitle>
          <CardDescription>
            نماذج أسئلة متوقعة تساعدك على تنظيم القاعدة
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              "عندكم المنتج الفلاني؟",
              "سعره كام؟",
              "التوصيل بيحتاج وقت قد إيه؟",
              "طرق الدفع المتاحة؟",
              "هل فيه ضمان أو استرجاع؟",
              "أوقات العمل؟",
            ].map((prompt) => (
              <Badge key={prompt} variant="secondary">
                {prompt}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">عناصر الكتالوج</p>
                <p className="text-2xl font-bold">{stats.menuItems}</p>
              </div>
              <Package className="h-8 w-8 text-[var(--accent-warning)]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">متاح للبيع</p>
                <p className="text-2xl font-bold text-[var(--accent-success)]">
                  {stats.availableItems}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-[var(--accent-success)]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">الأسئلة الشائعة</p>
                <p className="text-2xl font-bold">{stats.faqs}</p>
              </div>
              <HelpCircle className="h-8 w-8 text-[var(--accent-blue)]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">أسئلة مفعّلة</p>
                <p className="text-2xl font-bold text-[var(--accent-success)]">
                  {stats.activeFaqs}
                </p>
              </div>
              <MessageSquare className="h-8 w-8 text-[var(--accent-gold)]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="بحث في قاعدة المعرفة..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <TabsTrigger value="menu" className="flex w-full items-center gap-2">
            <Package className="h-4 w-4" />
            المنتجات والخدمات
          </TabsTrigger>
          <TabsTrigger value="faqs" className="flex w-full items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            الأسئلة الشائعة
          </TabsTrigger>
          <TabsTrigger
            value="business"
            className="flex w-full items-center gap-2"
          >
            <Store className="h-4 w-4" />
            معلومات النشاط
          </TabsTrigger>
        </TabsList>

        {/* ==================== MENU TAB ==================== */}
        <TabsContent value="menu" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-medium">المنتجات والخدمات</h3>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                variant="outline"
                size="sm"
                disabled={syncing || !canEdit}
                onClick={async () => {
                  if (!merchantId || !apiKey) return;
                  if (!canEdit) {
                    showError("غير مصرح بتنفيذ هذا الإجراء");
                    return;
                  }
                  setSyncing(true);
                  try {
                    const result = await merchantApi.pullCatalogToInventory(
                      merchantId,
                      apiKey,
                    );

                    if (result.total === 0) {
                      toast({
                        title: "تنبيه",
                        description:
                          "لا توجد عناصر في الكتالوج لإرسالها إلى المخزون",
                      });
                      return;
                    }

                    const parts: string[] = [];
                    if (result.created > 0)
                      parts.push(`تم إنشاء ${result.created} منتج في المخزون`);
                    if ((result as any).variantsCreated > 0)
                      parts.push(`${(result as any).variantsCreated} متغير`);
                    if ((result.updated || 0) > 0)
                      parts.push(`تم تحديث ${result.updated} منتج في المخزون`);
                    if (result.linked > 0)
                      parts.push(`تم ربط ${result.linked}`);
                    const msg =
                      parts.length > 0
                        ? parts.join(" + ")
                        : "جميع عناصر الكتالوج مرتبطة بالمخزون بالفعل";
                    toast({
                      title: parts.length > 0 ? "تم" : "تنبيه",
                      description: msg,
                    });
                    await loadData();
                  } catch (err) {
                    showError(
                      getErrorMessage(err, "فشل في إرسال المنتجات للمخزون"),
                    );
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                <Package
                  className={`h-4 w-4 ml-2 ${syncing ? "animate-pulse" : ""}`}
                />
                إرسال للمخزون
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={syncing || !canEdit}
                onClick={async () => {
                  if (!merchantId || !apiKey) return;
                  if (!canEdit) {
                    showError("غير مصرح بتنفيذ هذا الإجراء");
                    return;
                  }
                  setSyncing(true);
                  try {
                    const result = await merchantApi.pushInventoryToCatalog(
                      merchantId,
                      apiKey,
                    );

                    if (result.total === 0) {
                      toast({
                        title: "تنبيه",
                        description:
                          "لا توجد عناصر في المخزون لاستيرادها إلى الكتالوج",
                      });
                      await loadData();
                      return;
                    }

                    const parts: string[] = [];
                    if (result.created > 0)
                      parts.push(`تم إضافة ${result.created} منتج من المخزون`);
                    if (result.updated > 0)
                      parts.push(`تم تحديث ${result.updated} منتج من المخزون`);
                    if (result.linked > 0)
                      parts.push(`تم ربط ${result.linked} منتج مع الكتالوج`);

                    const msg =
                      parts.length > 0
                        ? parts.join(" + ")
                        : "لا توجد تغييرات جديدة عند الاستيراد من المخزون";
                    toast({
                      title: parts.length > 0 ? "تم" : "تنبيه",
                      description: msg,
                    });
                    await loadData();
                  } catch (err) {
                    showError(
                      getErrorMessage(
                        err,
                        "فشل في استيراد المنتجات من المخزون",
                      ),
                    );
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                <RefreshCw
                  className={`h-4 w-4 ml-2 ${syncing ? "animate-spin" : ""}`}
                />
                استيراد من المخزون
              </Button>
              {canCreate && (
                <Button
                  onClick={() => {
                    setEditingMenuItem(null);
                    setMenuFormData(defaultMenuItem);
                    setShowMenuDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة منتج/خدمة
                </Button>
              )}
            </div>
          </div>

          {filteredMenuItems.length === 0 ? (
            <EmptyState
              icon={<Package className="h-12 w-12" />}
              title="لا توجد منتجات أو خدمات"
              description="أضف منتجاتك أو خدماتك ليتمكن الذكاء الاصطناعي من الإجابة عن أسئلة العملاء"
              action={
                canCreate ? (
                  <Button onClick={() => setShowMenuDialog(true)}>
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة منتج/خدمة
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMenuItems.map((item) => (
                <Card
                  key={item.id}
                  className={cn(!item.isAvailable && "opacity-60")}
                >
                  <CardContent className="p-4">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h4 className="font-medium">{item.name}</h4>
                        {item.nameEn && (
                          <p className="text-sm text-muted-foreground">
                            {item.nameEn}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={item.isAvailable ? "default" : "secondary"}
                      >
                        {item.isAvailable ? "متاح" : "غير متاح"}
                      </Badge>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <span className="text-lg font-bold text-primary">
                          {formatCurrency(item.price)}
                        </span>
                        <Badge variant="outline" className="ml-2">
                          {item.category}
                        </Badge>
                        {item.has_recipe && (
                          <Badge className="mr-1 border-0 bg-[var(--accent-warning)]/15 text-xs text-[var(--accent-warning)]">
                            <ChefHat className="h-3 w-3 ml-1" />
                            وصفة
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="إدارة الوصفة"
                          onClick={() => setRecipeItem(item)}
                          disabled={!canEdit}
                          className={
                            item.has_recipe
                              ? "text-[var(--accent-warning)]"
                              : "text-muted-foreground"
                          }
                        >
                          <ChefHat className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditMenuItem(item)}
                          disabled={!canEdit}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setMenuItemToDelete(item)}
                          disabled={!canDelete}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Recipe Management Panel */}
          {recipeItem && (
            <Card className="border-[var(--accent-warning)]/20 bg-[color:rgba(245,158,11,0.06)]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ChefHat className="h-5 w-5 text-[var(--accent-warning)]" />
                    <CardTitle className="text-base">
                      وصفة: {recipeItem.name}
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRecipeItem(null);
                      loadData();
                    }}
                  >
                    اغلاق
                  </Button>
                </div>
                <CardDescription>
                  اربط مكونات المخزون بهذا الصنف - عند كل طلب يتم خصم المكونات
                  تلقائيا
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecipeManager
                  catalogItemId={recipeItem.id}
                  catalogItemName={recipeItem.name}
                  onClose={() => {
                    setRecipeItem(null);
                    loadData();
                  }}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ==================== FAQS TAB ==================== */}
        <TabsContent value="faqs" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-medium">الأسئلة الشائعة</h3>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                variant="outline"
                onClick={() => openAutoFaqsDialog("both")}
              >
                إعادة توليد الأسئلة
              </Button>
              <Button
                onClick={() => {
                  setEditingFAQ(null);
                  setFaqFormData(defaultFAQ);
                  setShowFAQDialog(true);
                }}
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة سؤال
              </Button>
            </div>
          </div>

          {filteredFAQs.length === 0 ? (
            <EmptyState
              icon={<HelpCircle className="h-12 w-12" />}
              title="لا توجد أسئلة شائعة"
              description="أضف الأسئلة المتكررة وإجاباتها ليتمكن الذكاء الاصطناعي من الرد على العملاء تلقائياً"
              action={
                <Button onClick={() => setShowFAQDialog(true)}>
                  <Plus className="h-4 w-4 ml-2" />
                  إضافة سؤال
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredFAQs.map((faq) => (
                <Card
                  key={faq.id}
                  className={cn(!faq.isActive && "opacity-60")}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <HelpCircle className="h-4 w-4 text-[var(--accent-blue)]" />
                          <h4 className="font-medium">{faq.question}</h4>
                          <Badge variant="outline">{faq.category}</Badge>
                          {!faq.isActive && (
                            <Badge variant="secondary">معطّل</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground pr-6">
                          {faq.answer}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditFAQ(faq)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setFaqToDelete(faq)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ==================== BUSINESS INFO TAB ==================== */}
        <TabsContent value="business" className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                المعلومات الأساسية
              </CardTitle>
              <CardDescription>معلومات عامة عن نشاطك التجاري</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">
                    اسم النشاط (عربي)
                  </label>
                  <Input
                    value={businessInfo.name}
                    onChange={(e) =>
                      setBusinessInfo((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="متجر النخبة"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">
                    اسم النشاط (إنجليزي)
                  </label>
                  <Input
                    value={businessInfo.nameEn || ""}
                    onChange={(e) =>
                      setBusinessInfo((prev) => ({
                        ...prev,
                        nameEn: e.target.value,
                      }))
                    }
                    placeholder="Elite Store"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">وصف النشاط</label>
                <Textarea
                  value={businessInfo.description || ""}
                  onChange={(e) =>
                    setBusinessInfo((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="نشاط متخصص في تقديم منتجات وخدمات بجودة عالية..."
                  rows={3}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">نوع النشاط</label>
                  <Select
                    value={businessInfo.category}
                    onValueChange={(value) =>
                      setBusinessInfo((prev) => ({ ...prev, category: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {businessCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">المدينة</label>
                  <Input
                    value={businessInfo.city || ""}
                    onChange={(e) =>
                      setBusinessInfo((prev) => ({
                        ...prev,
                        city: e.target.value,
                      }))
                    }
                    placeholder="الرياض"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                معلومات التواصل
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">رقم الهاتف</label>
                  <Input
                    value={businessInfo.phone || ""}
                    onChange={(e) =>
                      setBusinessInfo((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    placeholder="+966501234567"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">واتساب</label>
                  <Input
                    value={businessInfo.whatsapp || ""}
                    onChange={(e) =>
                      setBusinessInfo((prev) => ({
                        ...prev,
                        whatsapp: e.target.value,
                      }))
                    }
                    placeholder="+966501234567"
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">الموقع الإلكتروني</label>
                <Input
                  value={businessInfo.website || ""}
                  onChange={(e) =>
                    setBusinessInfo((prev) => ({
                      ...prev,
                      website: e.target.value,
                    }))
                  }
                  placeholder="https://example.com"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-sm font-medium">العنوان</label>
                <Textarea
                  value={businessInfo.address || ""}
                  onChange={(e) =>
                    setBusinessInfo((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }))
                  }
                  placeholder="شارع الملك فهد، حي العليا، الرياض"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Working Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                أوقات العمل
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(dayNames).map(([dayKey, dayName]) => {
                  const hours = businessInfo.workingHours?.[dayKey] || {
                    open: "09:00",
                    close: "22:00",
                  };
                  return (
                    <div
                      key={dayKey}
                      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                    >
                      <div className="font-medium sm:w-24">{dayName}</div>
                      <div className="flex flex-col gap-2 sm:flex-1 sm:flex-row sm:items-center">
                        <Input
                          type="time"
                          value={hours.open}
                          onChange={(e) =>
                            setBusinessInfo((prev) => ({
                              ...prev,
                              workingHours: {
                                ...prev.workingHours,
                                [dayKey]: { ...hours, open: e.target.value },
                              },
                            }))
                          }
                          className="w-full sm:w-32"
                          disabled={hours.closed}
                        />
                        <span className="text-muted-foreground sm:block">
                          إلى
                        </span>
                        <Input
                          type="time"
                          value={hours.close}
                          onChange={(e) =>
                            setBusinessInfo((prev) => ({
                              ...prev,
                              workingHours: {
                                ...prev.workingHours,
                                [dayKey]: { ...hours, close: e.target.value },
                              },
                            }))
                          }
                          className="w-full sm:w-32"
                          disabled={hours.closed}
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={hours.closed || false}
                            onCheckedChange={(checked) =>
                              setBusinessInfo((prev) => ({
                                ...prev,
                                workingHours: {
                                  ...prev.workingHours,
                                  [dayKey]: { ...hours, closed: checked },
                                },
                              }))
                            }
                          />
                          مغلق
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Policies */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                السياسات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">سياسة الاسترجاع</label>
                <Textarea
                  value={businessInfo.policies?.returnPolicy || ""}
                  onChange={(e) =>
                    setBusinessInfo((prev) => ({
                      ...prev,
                      policies: {
                        ...prev.policies,
                        returnPolicy: e.target.value,
                      },
                    }))
                  }
                  placeholder="يمكن استرجاع المنتجات خلال 7 أيام من تاريخ الشراء..."
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium">معلومات التوصيل</label>
                <Textarea
                  value={businessInfo.policies?.deliveryInfo || ""}
                  onChange={(e) =>
                    setBusinessInfo((prev) => ({
                      ...prev,
                      policies: {
                        ...prev.policies,
                        deliveryInfo: e.target.value,
                      },
                    }))
                  }
                  placeholder="التوصيل متاح داخل المنطقة، ورسوم التوصيل حسب المنطقة..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Delivery Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                أسعار التوصيل
              </CardTitle>
              <CardDescription>
                حدد رسوم التوصيل (موحّد أو حسب المنطقة)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">طريقة التسعير</label>
                  <Select
                    value={deliveryPricing.mode}
                    onValueChange={(value) =>
                      updateDeliveryPricing({
                        mode: value as "UNIFIED" | "BY_CITY",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNIFIED">سعر موحّد</SelectItem>
                      <SelectItem value="BY_CITY">حسب المنطقة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {deliveryPricing.mode === "UNIFIED" && (
                  <div>
                    <label className="text-sm font-medium">
                      سعر التوصيل الموحّد
                    </label>
                    <Input
                      type="number"
                      value={deliveryPricing.unifiedPrice ?? ""}
                      onChange={(e) =>
                        updateDeliveryPricing({
                          unifiedPrice:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      placeholder="مثال: 30"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      يمكن إدخال 0 للتوصيل المجاني.
                    </p>
                  </div>
                )}
              </div>

              {deliveryPricing.mode === "BY_CITY" && (
                <div className="space-y-3">
                  {(deliveryPricing.byCity || []).map((entry, idx) => (
                    <div
                      key={
                        entry.id ||
                        `${entry.city || entry.area || "area"}-${idx}`
                      }
                      className="grid sm:grid-cols-[1fr_160px_auto] gap-2 items-end"
                    >
                      <div>
                        <label className="text-sm font-medium">المنطقة</label>
                        <Input
                          value={entry.area ?? entry.city ?? ""}
                          onChange={(e) =>
                            handleUpdateDeliveryCity(idx, {
                              area: e.target.value,
                              city: e.target.value,
                            })
                          }
                          placeholder="المعادي"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">السعر</label>
                        <Input
                          type="number"
                          value={
                            Number.isFinite(Number(entry.price))
                              ? entry.price
                              : ""
                          }
                          onChange={(e) =>
                            handleUpdateDeliveryCity(idx, {
                              price: Number(e.target.value),
                            })
                          }
                          placeholder="30"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleRemoveDeliveryCity(idx)}
                      >
                        حذف
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" onClick={handleAddDeliveryCity}>
                    <Plus className="h-4 w-4 ml-2" />
                    إضافة منطقة
                  </Button>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">ملاحظات إضافية</label>
                <Textarea
                  value={deliveryPricing.notes || ""}
                  onChange={(e) =>
                    updateDeliveryPricing({ notes: e.target.value })
                  }
                  placeholder="مثال: تختلف الرسوم حسب المناطق البعيدة أو الطلبات الكبيرة."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Offers */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  العروض والخصومات
                </CardTitle>
                <CardDescription>
                  عروضك الحالية التي سيعرضها المساعد للعملاء
                </CardDescription>
              </div>
              <Button
                onClick={() => setShowOfferDialog(true)}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة عرض
              </Button>
            </CardHeader>
            <CardContent>
              {offers.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="h-12 w-12" />}
                  title="لا توجد عروض بعد"
                  description="أنشئ عروضاً ترويجية لتظهر للعملاء داخل المحادثة"
                  action={
                    <Button onClick={() => setShowOfferDialog(true)}>
                      <Plus className="h-4 w-4 ml-2" />
                      إضافة عرض
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {offers.map((offer) => {
                    const valueLabel =
                      offer.type === "PERCENTAGE"
                        ? `${offer.value}%`
                        : offer.type === "FREE_SHIPPING"
                          ? "شحن مجاني"
                          : offer.value !== undefined
                            ? formatCurrency(offer.value)
                            : "";
                    return (
                      <Card key={offer.id}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <h4 className="font-medium">
                                {offer.nameAr || offer.name}
                              </h4>
                              {offer.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {offer.description}
                                </p>
                              )}
                            </div>
                            <Badge
                              variant={offer.isActive ? "default" : "secondary"}
                            >
                              {offer.isActive ? "نشط" : "غير نشط"}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {valueLabel && (
                              <span className="rounded-full bg-muted px-2 py-1">
                                {valueLabel}
                              </span>
                            )}
                            {offer.code ? (
                              <span className="rounded-full bg-muted px-2 py-1">
                                كود: {offer.code}
                              </span>
                            ) : (
                              <span className="rounded-full bg-muted px-2 py-1">
                                بدون كود
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSaveBusinessInfo}
              disabled={!canEdit || saving}
              size="lg"
              className="w-full sm:w-auto"
            >
              {saving ? "جاري الحفظ..." : "حفظ معلومات النشاط"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* ==================== OFFER DIALOG ==================== */}
      <Dialog open={showOfferDialog} onOpenChange={setShowOfferDialog}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة عرض ترويجي</DialogTitle>
            <DialogDescription>
              أدخل تفاصيل العرض ليظهر للعميل في المحادثات
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">الاسم (عربي)</label>
                <Input
                  value={offerForm.nameAr}
                  onChange={(e) =>
                    setOfferForm((prev) => ({
                      ...prev,
                      nameAr: e.target.value,
                    }))
                  }
                  placeholder="خصم الصيف"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">الاسم (إنجليزي)</label>
                <Input
                  value={offerForm.name}
                  onChange={(e) =>
                    setOfferForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Summer Offer"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">وصف العرض</label>
              <Textarea
                value={offerForm.description}
                onChange={(e) =>
                  setOfferForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="خصم على المنتجات المختارة لمدة محدودة"
                rows={3}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">نوع الخصم</label>
                <Select
                  value={offerForm.type}
                  onValueChange={(value) =>
                    setOfferForm((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">نسبة مئوية</SelectItem>
                    <SelectItem value="FIXED_AMOUNT">مبلغ ثابت</SelectItem>
                    <SelectItem value="FREE_SHIPPING">شحن مجاني</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">قيمة الخصم</label>
                <Input
                  type="number"
                  value={offerForm.value}
                  onChange={(e) =>
                    setOfferForm((prev) => ({
                      ...prev,
                      value: Number(e.target.value),
                    }))
                  }
                  min={0}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  كود الخصم (اختياري)
                </label>
                <Input
                  value={offerForm.code}
                  onChange={(e) =>
                    setOfferForm((prev) => ({
                      ...prev,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="SUMMER20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  تاريخ الانتهاء (اختياري)
                </label>
                <Input
                  type="date"
                  value={offerForm.endDate}
                  onChange={(e) =>
                    setOfferForm((prev) => ({
                      ...prev,
                      endDate: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowOfferDialog(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleCreateOffer}
              disabled={savingOffer}
              className="w-full sm:w-auto"
            >
              {savingOffer ? "جاري الحفظ..." : "إضافة العرض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== DELETE CONFIRMATIONS ==================== */}
      <Dialog open={showAutoFaqDialog} onOpenChange={setShowAutoFaqDialog}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>توليد أسئلة من المنتجات والسياسات</DialogTitle>
            <DialogDescription>
              سننشئ أسئلة شائعة من المنتجات الأعلى في الكتالوج وسياسات النشاط.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">اختر المصدر</label>
              <Select
                value={autoFaqMode}
                onValueChange={(value) => {
                  const mode = value as "both" | "products" | "policies";
                  setAutoFaqMode(mode);
                  const generated = buildAutoFaqsFromTemplates(
                    mode,
                    autoFaqLimit,
                  );
                  setAutoFaqs(generated);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">المنتجات والسياسات</SelectItem>
                  <SelectItem value="products">المنتجات فقط</SelectItem>
                  <SelectItem value="policies">السياسات فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">عدد المنتجات</label>
              <Select
                value={String(autoFaqLimit)}
                onValueChange={(value) => {
                  const limit = (parseInt(value, 10) === 10 ? 10 : 5) as 5 | 10;
                  setAutoFaqLimit(limit);
                  const generated = buildAutoFaqsFromTemplates(
                    autoFaqMode,
                    limit,
                  );
                  setAutoFaqs(generated);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">أفضل 5 منتجات</SelectItem>
                  <SelectItem value="10">أفضل 10 منتجات</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {autoFaqs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا توجد أسئلة جديدة لإنشائها (ربما لديك أسئلة مشابهة بالفعل).
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                سيتم إنشاء <strong>{autoFaqs.length}</strong> سؤالاً جديداً.
              </p>
              <div className="max-h-40 overflow-y-auto space-y-2 text-sm text-muted-foreground">
                {autoFaqs.slice(0, 6).map((faq) => (
                  <div key={faq.id} className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 text-[var(--accent-success)]" />
                    <span>{faq.question}</span>
                  </div>
                ))}
                {autoFaqs.length > 6 && (
                  <div>+ {autoFaqs.length - 6} أسئلة أخرى</div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowAutoFaqDialog(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleApplyAutoFaqs}
              disabled={!canCreate || saving || autoFaqs.length === 0}
              className="w-full sm:w-auto"
            >
              {saving ? "جاري الإنشاء..." : "تأكيد الإنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!menuItemToDelete}
        onOpenChange={(open) => !open && setMenuItemToDelete(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>حذف المنتج/الخدمة</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            هل أنت متأكد من حذف "{menuItemToDelete?.name}"؟ لا يمكن التراجع عن
            هذا الإجراء.
          </p>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setMenuItemToDelete(null)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteMenuItem}
              disabled={!canDelete}
              className="w-full sm:w-auto"
            >
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!faqToDelete}
        onOpenChange={(open) => !open && setFaqToDelete(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>حذف السؤال</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            هل أنت متأكد من حذف "{faqToDelete?.question}"؟ لا يمكن التراجع عن
            هذا الإجراء.
          </p>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setFaqToDelete(null)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFAQ}
              disabled={!canDelete}
              className="w-full sm:w-auto"
            >
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== MENU ITEM DIALOG ==================== */}
      <Dialog open={showMenuDialog} onOpenChange={setShowMenuDialog}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingMenuItem ? "تعديل المنتج/الخدمة" : "إضافة منتج/خدمة جديد"}
            </DialogTitle>
            <DialogDescription>
              أضف منتج أو خدمة من الكتالوج ليتمكن الذكاء الاصطناعي من الإجابة عن
              أسئلة العملاء
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">
                اسم المنتج/الخدمة (عربي) *
              </label>
              <Input
                value={menuFormData.name}
                onChange={(e) =>
                  setMenuFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="تيشيرت قطن"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                اسم المنتج/الخدمة (إنجليزي)
              </label>
              <Input
                value={menuFormData.nameEn || ""}
                onChange={(e) =>
                  setMenuFormData((prev) => ({
                    ...prev,
                    nameEn: e.target.value,
                  }))
                }
                placeholder="Cotton T-Shirt"
              />
            </div>
            <div>
              <label className="text-sm font-medium">الوصف</label>
              <Textarea
                value={menuFormData.description || ""}
                onChange={(e) =>
                  setMenuFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="وصف مختصر للمنتج أو الخدمة..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">السعر *</label>
                <Input
                  type="number"
                  value={menuFormData.price}
                  onChange={(e) =>
                    setMenuFormData((prev) => ({
                      ...prev,
                      price: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="100"
                  min={0}
                />
              </div>
              <div>
                <label className="text-sm font-medium">التصنيف</label>
                <Select
                  value={menuFormData.category}
                  onValueChange={(value) =>
                    setMenuFormData((prev) => ({ ...prev, category: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {menuCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={menuFormData.isAvailable}
                onCheckedChange={(checked) =>
                  setMenuFormData((prev) => ({ ...prev, isAvailable: checked }))
                }
              />
              <label className="text-sm font-medium">متاح للبيع</label>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowMenuDialog(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSaveMenuItem}
              disabled={!canEdit || saving || !menuFormData.name}
              className="w-full sm:w-auto"
            >
              {saving
                ? "جاري الحفظ..."
                : editingMenuItem
                  ? "حفظ التعديلات"
                  : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== FAQ DIALOG ==================== */}
      <Dialog open={showFAQDialog} onOpenChange={setShowFAQDialog}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingFAQ ? "تعديل السؤال" : "إضافة سؤال جديد"}
            </DialogTitle>
            <DialogDescription>
              أضف سؤالاً متكرراً وإجابته ليتمكن الذكاء الاصطناعي من الرد
              تلقائياً
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">السؤال *</label>
              <Input
                value={faqFormData.question}
                onChange={(e) =>
                  setFaqFormData((prev) => ({
                    ...prev,
                    question: e.target.value,
                  }))
                }
                placeholder="ما هي سياسة الاسترجاع؟"
              />
            </div>
            <div>
              <label className="text-sm font-medium">الإجابة *</label>
              <Textarea
                value={faqFormData.answer}
                onChange={(e) =>
                  setFaqFormData((prev) => ({
                    ...prev,
                    answer: e.target.value,
                  }))
                }
                placeholder="يمكن استرجاع المنتجات خلال 7 أيام من تاريخ الشراء وفق الشروط."
                rows={4}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">التصنيف</label>
                <Select
                  value={faqFormData.category}
                  onValueChange={(value) =>
                    setFaqFormData((prev) => ({ ...prev, category: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {faqCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={faqFormData.isActive}
                  onCheckedChange={(checked) =>
                    setFaqFormData((prev) => ({ ...prev, isActive: checked }))
                  }
                />
                <label className="text-sm font-medium">مفعّل</label>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowFAQDialog(false)}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSaveFAQ}
              disabled={
                !canEdit ||
                saving ||
                !faqFormData.question ||
                !faqFormData.answer
              }
              className="w-full sm:w-auto"
            >
              {saving
                ? "جاري الحفظ..."
                : editingFAQ
                  ? "حفظ التعديلات"
                  : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
