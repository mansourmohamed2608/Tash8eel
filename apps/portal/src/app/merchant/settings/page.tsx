"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertBanner } from "@/components/ui/alerts";
import { CardSkeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Settings,
  Store,
  Bell,
  Clock,
  Save,
  CreditCard,
  Smartphone,
  Building2,
  Wallet,
  AlertTriangle,
  ArrowUpRight,
  Shield,
} from "lucide-react";
import { merchantApi } from "@/lib/client";
import { useMerchant } from "@/hooks/use-merchant";
import { DeleteAccountPanel } from "@/components/merchant/settings/delete-account-panel";

// Settings structure matching API response
interface MerchantSettings {
  business: {
    name: string;
    category: string;
    city: string;
    currency: string;
    language: string;
  };
  notifications: {
    whatsappReportsEnabled: boolean;
    reportPeriodsEnabled: string[];
    notificationPhone: string | null;
    whatsappNumber: string | null;
    paymentRemindersEnabled: boolean;
    lowStockAlertsEnabled: boolean;
  };
  preferences: {
    timezone: string;
    workingHours: { start: string; end: string };
    autoResponseEnabled: boolean;
    followupDelayMinutes: number;
    requireReauthForFinance?: boolean;
    sessionTimeoutMinutes?: number;
  };
  payout: {
    instapayAlias: string | null;
    vodafoneCashNumber: string | null;
    bankName: string | null;
    bankAccountHolder: string | null;
    bankAccount: string | null;
    bankIban: string | null;
    preferredMethod: "INSTAPAY" | "VODAFONE_CASH" | "BANK_TRANSFER";
  };
  pos: {
    enabled: boolean;
    mode: "retail" | "restaurant" | "hybrid";
    tablesEnabled: boolean;
    suspendedSalesEnabled: boolean;
    splitPaymentsEnabled: boolean;
    returnsEnabled: boolean;
    requireActiveRegisterSession: boolean;
    defaultServiceMode: "delivery" | "pickup" | "dine_in";
    thermalReceiptWidth: "58mm" | "80mm" | "a4";
  };
}

// Default settings
const defaultSettings: MerchantSettings = {
  business: {
    name: "",
    category: "",
    city: "",
    currency: "EGP",
    language: "ar",
  },
  notifications: {
    whatsappReportsEnabled: true,
    reportPeriodsEnabled: ["daily"],
    notificationPhone: null,
    whatsappNumber: null,
    paymentRemindersEnabled: true,
    lowStockAlertsEnabled: true,
  },
  preferences: {
    timezone: "Africa/Cairo",
    workingHours: { start: "09:00", end: "21:00" },
    autoResponseEnabled: true,
    followupDelayMinutes: 60,
    requireReauthForFinance: true,
    sessionTimeoutMinutes: 60,
  },
  payout: {
    instapayAlias: null,
    vodafoneCashNumber: null,
    bankName: null,
    bankAccountHolder: null,
    bankAccount: null,
    bankIban: null,
    preferredMethod: "INSTAPAY",
  },
  pos: {
    enabled: true,
    mode: "retail",
    tablesEnabled: false,
    suspendedSalesEnabled: true,
    splitPaymentsEnabled: true,
    returnsEnabled: true,
    requireActiveRegisterSession: false,
    defaultServiceMode: "pickup",
    thermalReceiptWidth: "80mm",
  },
};

const CATEGORY_OPTIONS = [
  "عام",
  "تجزئة",
  "خدمات",
  "مطاعم",
  "مقاهي",
  "سوبرماركت",
  "ملابس",
  "إلكترونيات",
  "صيدلية",
  "تجميل",
  "أثاث",
  "مكتبة",
];

const CATEGORY_FROM_ENUM: Record<string, string> = {
  GENERIC: "عام",
  CLOTHES: "ملابس",
  FOOD: "مطاعم",
  SUPERMARKET: "سوبرماركت",
};

const CATEGORY_TO_ENUM: Record<string, string> = {
  عام: "GENERIC",
  تجزئة: "GENERIC",
  خدمات: "GENERIC",
  مطاعم: "FOOD",
  مقاهي: "FOOD",
  سوبرماركت: "SUPERMARKET",
  ملابس: "CLOTHES",
  إلكترونيات: "GENERIC",
  صيدلية: "GENERIC",
  تجميل: "GENERIC",
  أثاث: "GENERIC",
  مكتبة: "GENERIC",
};

export default function SettingsPage() {
  const { apiKey } = useMerchant();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<MerchantSettings | null>(null);
  const [initialSettings, setInitialSettings] =
    useState<MerchantSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get("tab") || "business";
  const [activeTab, setActiveTab] = useState(initialTab);
  const showGlobalSave =
    activeTab === "business" ||
    activeTab === "payout" ||
    activeTab === "preferences" ||
    activeTab === "pos";
  const categoryOptions = useMemo(() => {
    const current = settings?.business.category?.trim();
    if (current && !CATEGORY_OPTIONS.includes(current)) {
      return [current, ...CATEGORY_OPTIONS];
    }
    return CATEGORY_OPTIONS;
  }, [settings?.business.category]);

  const fetchSettings = useCallback(async () => {
    if (!apiKey) return;

    setError(null);
    try {
      const result = await merchantApi.getSettings(apiKey);
      const merged = {
        business: { ...defaultSettings.business, ...result.business },
        notifications: {
          ...defaultSettings.notifications,
          ...result.notifications,
        },
        preferences: { ...defaultSettings.preferences, ...result.preferences },
        payout: { ...defaultSettings.payout, ...(result.payout || {}) },
        pos: { ...defaultSettings.pos, ...(result.pos || {}) },
      };
      const normalizedCategory = merged.business.category
        ? CATEGORY_FROM_ENUM[merged.business.category] ||
          merged.business.category
        : merged.business.category;
      const normalized: MerchantSettings = {
        ...merged,
        business: { ...merged.business, category: normalizedCategory },
      };
      setSettings(normalized);
      setInitialSettings(normalized);
    } catch (err) {
      console.error("Failed to load settings:", err);
      setError(err instanceof Error ? err.message : "فشل في تحميل الإعدادات");
      setSettings(defaultSettings);
      setInitialSettings(defaultSettings);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (
      tab === "business" ||
      tab === "payout" ||
      tab === "notifications" ||
      tab === "preferences" ||
      tab === "pos" ||
      tab === "danger"
    ) {
      setActiveTab(tab);
      return;
    }
    setActiveTab("business");
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (tab === "business") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const handleSave = async () => {
    if (!settings || !apiKey) return;

    setSaving(true);
    try {
      if (activeTab === "business") {
        const categoryValue = settings.business.category?.trim();
        const normalizedCategory = categoryValue || "";
        const mappedCategory = normalizedCategory
          ? CATEGORY_TO_ENUM[normalizedCategory] || normalizedCategory
          : normalizedCategory;

        await merchantApi.updateSettings(apiKey, {
          business: {
            ...settings.business,
            category: mappedCategory || "",
          },
        } as any);

        setInitialSettings((prev) =>
          prev
            ? {
                ...prev,
                business: settings.business,
              }
            : settings,
        );
      }

      if (activeTab === "payout") {
        await merchantApi.updateSettings(apiKey, {
          payout: settings.payout,
        } as any);

        setInitialSettings((prev) =>
          prev
            ? {
                ...prev,
                payout: settings.payout,
              }
            : settings,
        );
      }

      if (activeTab === "preferences") {
        await merchantApi.updateSettings(apiKey, {
          preferences: settings.preferences,
        } as any);

        setInitialSettings((prev) =>
          prev
            ? {
                ...prev,
                preferences: settings.preferences,
              }
            : settings,
        );
      }

      if (activeTab === "pos") {
        await merchantApi.updateSettings(apiKey, {
          pos: settings.pos,
        } as any);

        setInitialSettings((prev) =>
          prev
            ? {
                ...prev,
                pos: settings.pos,
              }
            : settings,
        );
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError(err instanceof Error ? err.message : "فشل في حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div>
        <PageHeader title="الإعدادات" />
        <div className="grid gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn p-4 sm:p-6">
      <PageHeader
        title="الإعدادات"
        description="إدارة إعدادات المتجر والإشعارات"
        actions={
          showGlobalSave && (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              <Save className="h-4 w-4" />
              {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
          )
        }
      />
      {error && (
        <AlertBanner
          type="error"
          title="خطأ"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {saved && (
        <AlertBanner
          type="success"
          message="تم حفظ الإعدادات بنجاح"
          onDismiss={() => setSaved(false)}
        />
      )}

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
          <TabsTrigger
            value="business"
            className="flex w-full items-center gap-2"
          >
            <Store className="h-4 w-4" />
            المتجر
          </TabsTrigger>
          <TabsTrigger
            value="payout"
            className="flex w-full items-center gap-2"
          >
            <Wallet className="h-4 w-4" />
            الدفع
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="flex w-full items-center gap-2"
          >
            <Bell className="h-4 w-4" />
            الإشعارات
          </TabsTrigger>
          <TabsTrigger
            value="preferences"
            className="flex w-full items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            التفضيلات
          </TabsTrigger>
          <TabsTrigger value="pos" className="flex w-full items-center gap-2">
            <CreditCard className="h-4 w-4" />
            نقطة البيع
          </TabsTrigger>
          <TabsTrigger
            value="danger"
            className="flex w-full items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            الحذف
          </TabsTrigger>
        </TabsList>

        {/* Business Tab */}
        <TabsContent value="business">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                معلومات المتجر
              </CardTitle>
              <CardDescription>بيانات المتجر الأساسية</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">اسم المتجر</label>
                  <Input
                    value={settings.business.name}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        business: {
                          ...settings.business,
                          name: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">الفئة</label>
                  <Select
                    value={settings.business.category || "عام"}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        business: { ...settings.business, category: value },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الفئة" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">المدينة</label>
                  <Input
                    value={settings.business.city}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        business: {
                          ...settings.business,
                          city: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">العملة</label>
                  <Select
                    value={settings.business.currency || "EGP"}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        business: { ...settings.business, currency: value },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAR">ريال سعودي</SelectItem>
                      <SelectItem value="EGP">جنيه مصري</SelectItem>
                      <SelectItem value="AED">درهم إماراتي</SelectItem>
                      <SelectItem value="USD">دولار أمريكي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payout Settings Tab */}
        <TabsContent value="payout">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                إعدادات استلام الدفع
              </CardTitle>
              <CardDescription>
                بيانات حساباتك لاستلام المدفوعات من العملاء. سيتم عرض هذه
                البيانات للعميل عند اختيار طريقة الدفع.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Preferred Method */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  طريقة الدفع المفضلة
                </label>
                <Select
                  value={settings.payout?.preferredMethod || "INSTAPAY"}
                  onValueChange={(
                    value: "INSTAPAY" | "VODAFONE_CASH" | "BANK_TRANSFER",
                  ) =>
                    setSettings({
                      ...settings,
                      payout: { ...settings.payout, preferredMethod: value },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INSTAPAY">InstaPay</SelectItem>
                    <SelectItem value="VODAFONE_CASH">فودافون كاش</SelectItem>
                    <SelectItem value="BANK_TRANSFER">تحويل بنكي</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  سيتم عرض هذه الطريقة أولاً للعملاء
                </p>
              </div>

              {/* InstaPay Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-orange-600" />
                  <span className="font-medium">InstaPay</span>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    اسم المستخدم / الاسم المستعار
                  </label>
                  <Input
                    value={settings.payout?.instapayAlias || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        payout: {
                          ...settings.payout,
                          instapayAlias: e.target.value || null,
                        },
                      })
                    }
                    placeholder="مثال: ahmed.shop أو 01012345678"
                    dir="ltr"
                  />
                  <p className="text-xs text-muted-foreground">
                    الاسم الذي يحوّل عليه العميل عبر InstaPay
                  </p>
                </div>
              </div>

              {/* Vodafone Cash Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-red-600" />
                  <span className="font-medium">فودافون كاش</span>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">رقم فودافون كاش</label>
                  <Input
                    value={settings.payout?.vodafoneCashNumber || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        payout: {
                          ...settings.payout,
                          vodafoneCashNumber: e.target.value || null,
                        },
                      })
                    }
                    placeholder="01012345678"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Bank Transfer Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">تحويل بنكي</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">اسم البنك</label>
                    <Input
                      value={settings.payout?.bankName || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          payout: {
                            ...settings.payout,
                            bankName: e.target.value || null,
                          },
                        })
                      }
                      placeholder="مثال: البنك الأهلي المصري"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      اسم صاحب الحساب
                    </label>
                    <Input
                      value={settings.payout?.bankAccountHolder || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          payout: {
                            ...settings.payout,
                            bankAccountHolder: e.target.value || null,
                          },
                        })
                      }
                      placeholder="الاسم كما يظهر في البنك"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">رقم الحساب</label>
                    <Input
                      value={settings.payout?.bankAccount || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          payout: {
                            ...settings.payout,
                            bankAccount: e.target.value || null,
                          },
                        })
                      }
                      placeholder="رقم الحساب البنكي"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    رقم IBAN (اختياري)
                  </label>
                  <Input
                    value={settings.payout?.bankIban || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        payout: {
                          ...settings.payout,
                          bankIban: e.target.value || null,
                        },
                      })
                    }
                    placeholder="EG12 3456 7890 1234 5678 9012 345"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>ملاحظة:</strong> هذه البيانات ستظهر للعملاء عند اختيارهم
                طريقة الدفع. تأكد من صحة البيانات.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                إعدادات الإشعارات
              </CardTitle>
              <CardDescription>
                تم توحيد إعدادات الإشعارات في مركز الإشعارات.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                إعدادات القنوات، تفضيلات التنبيهات، فترات التقارير، وأرقام
                الإشعارات تم دمجها في صفحة واحدة.
              </div>
              <Button asChild className="w-full sm:w-fit">
                <Link href="/merchant/notifications?tab=settings">
                  الانتقال إلى مركز الإشعارات
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                التفضيلات
              </CardTitle>
              <CardDescription>إعدادات العمل والردود التلقائية</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    الردود التلقائية
                  </label>
                  <p className="text-xs text-muted-foreground">
                    تفعيل الرد الآلي على الرسائل
                  </p>
                </div>
                <Switch
                  checked={settings.preferences.autoResponseEnabled}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      preferences: {
                        ...settings.preferences,
                        autoResponseEnabled: checked,
                      },
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">المنطقة الزمنية</label>
                <Select
                  value={settings.preferences.timezone}
                  onValueChange={(value) =>
                    setSettings({
                      ...settings,
                      preferences: { ...settings.preferences, timezone: value },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Riyadh">
                      الرياض (توقيت السعودية)
                    </SelectItem>
                    <SelectItem value="Africa/Cairo">
                      القاهرة (توقيت مصر)
                    </SelectItem>
                    <SelectItem value="Asia/Dubai">
                      دبي (توقيت الإمارات)
                    </SelectItem>
                    <SelectItem value="Asia/Kuwait">الكويت</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    بداية ساعات العمل
                  </label>
                  <Input
                    type="time"
                    value={settings.preferences.workingHours.start}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        preferences: {
                          ...settings.preferences,
                          workingHours: {
                            ...settings.preferences.workingHours,
                            start: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    نهاية ساعات العمل
                  </label>
                  <Input
                    type="time"
                    value={settings.preferences.workingHours.end}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        preferences: {
                          ...settings.preferences,
                          workingHours: {
                            ...settings.preferences.workingHours,
                            end: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  تأخير المتابعة (بالدقائق)
                </label>
                <Input
                  type="number"
                  value={settings.preferences.followupDelayMinutes}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      preferences: {
                        ...settings.preferences,
                        followupDelayMinutes: parseInt(e.target.value) || 60,
                      },
                    })
                  }
                  min={15}
                  max={1440}
                />
                <p className="text-xs text-muted-foreground">
                  الوقت قبل إرسال رسالة متابعة للعملاء
                </p>
              </div>

              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Shield className="h-4 w-4" />
                  تفضيلات الأمان (منقولة من صفحة الأمان)
                </div>

                <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium">
                      حماية العمليات المالية
                    </label>
                    <p className="text-xs text-muted-foreground">
                      طلب إعادة المصادقة قبل العمليات الحساسة
                    </p>
                  </div>
                  <Switch
                    checked={
                      settings.preferences.requireReauthForFinance ?? true
                    }
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        preferences: {
                          ...settings.preferences,
                          requireReauthForFinance: checked,
                        },
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">مهلة الجلسة</label>
                  <Select
                    value={String(
                      settings.preferences.sessionTimeoutMinutes ?? 60,
                    )}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        preferences: {
                          ...settings.preferences,
                          sessionTimeoutMinutes: parseInt(value) || 60,
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 دقيقة</SelectItem>
                      <SelectItem value="30">30 دقيقة</SelectItem>
                      <SelectItem value="60">ساعة واحدة</SelectItem>
                      <SelectItem value="120">ساعتين</SelectItem>
                      <SelectItem value="480">8 ساعات</SelectItem>
                      <SelectItem value="0">بدون مهلة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                إعدادات نقطة البيع
              </CardTitle>
              <CardDescription>
                ربط الكاشير بالنظام الرئيسي مع التحكم في الجلسات، الجداول،
                الطلبات المعلقة، المدفوعات، والإيصالات.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">وضع نقطة البيع</label>
                  <Select
                    value={settings.pos.mode}
                    onValueChange={(
                      value: "retail" | "restaurant" | "hybrid",
                    ) =>
                      setSettings({
                        ...settings,
                        pos: { ...settings.pos, mode: value },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retail">تجزئة</SelectItem>
                      <SelectItem value="restaurant">مطاعم</SelectItem>
                      <SelectItem value="hybrid">هجين</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    الخدمة الافتراضية
                  </label>
                  <Select
                    value={settings.pos.defaultServiceMode}
                    onValueChange={(value: "delivery" | "pickup" | "dine_in") =>
                      setSettings({
                        ...settings,
                        pos: { ...settings.pos, defaultServiceMode: value },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pickup">استلام</SelectItem>
                      <SelectItem value="delivery">توصيل</SelectItem>
                      <SelectItem value="dine_in">داخل الفرع</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">مقاس الإيصال</label>
                  <Select
                    value={settings.pos.thermalReceiptWidth}
                    onValueChange={(value: "58mm" | "80mm" | "a4") =>
                      setSettings({
                        ...settings,
                        pos: { ...settings.pos, thermalReceiptWidth: value },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58mm">58mm</SelectItem>
                      <SelectItem value="80mm">80mm</SelectItem>
                      <SelectItem value="a4">A4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {[
                  [
                    "enabled",
                    "تفعيل نقطة البيع",
                    "تفعيل وظائف الكاشير وربطها بالطلبات والمخزون.",
                  ],
                  [
                    "tablesEnabled",
                    "تفعيل الجداول",
                    "تمكين إدارة الطاولات للمطاعم والكافيهات.",
                  ],
                  [
                    "suspendedSalesEnabled",
                    "الطلبات المعلقة",
                    "حفظ السلال مؤقتاً ثم استكمالها لاحقاً.",
                  ],
                  [
                    "splitPaymentsEnabled",
                    "الدفع المتعدد",
                    "تحصيل نفس الطلب بأكثر من وسيلة دفع.",
                  ],
                  [
                    "returnsEnabled",
                    "المرتجعات والاستبدال",
                    "السماح بعمليات الاسترجاع والاستبدال من الكاشير.",
                  ],
                  [
                    "requireActiveRegisterSession",
                    "إلزام جلسة كاشير",
                    "منع تنفيذ البيع قبل فتح جلسة كاشير فعلية.",
                  ],
                ].map(([key, label, description]) => (
                  <div
                    key={key}
                    className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                    <Switch
                      checked={Boolean(
                        settings.pos[key as keyof typeof settings.pos],
                      )}
                      onCheckedChange={(checked) =>
                        setSettings({
                          ...settings,
                          pos: {
                            ...settings.pos,
                            [key]: checked,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="danger">
          <DeleteAccountPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
