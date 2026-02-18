"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
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
  AlertCircle,
  CreditCard,
  Smartphone,
  Building2,
  Wallet,
} from "lucide-react";
import { merchantApi } from "@/lib/api";
import { useMerchant } from "@/hooks/use-merchant";
import {
  AiInsightsCard,
  generateSettingsInsights,
} from "@/components/ai/ai-insights-card";

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
    autoPaymentLinkOnConfirm: boolean;
    requireCustomerContactForPaymentLink: boolean;
    paymentLinkChannel: string;
  };
  preferences: {
    timezone: string;
    workingHours: { start: string; end: string };
    autoResponseEnabled: boolean;
    followupDelayMinutes: number;
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
    autoPaymentLinkOnConfirm: false,
    requireCustomerContactForPaymentLink: true,
    paymentLinkChannel: "WHATSAPP",
  },
  preferences: {
    timezone: "Africa/Cairo",
    workingHours: { start: "09:00", end: "21:00" },
    autoResponseEnabled: true,
    followupDelayMinutes: 60,
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
};

const reportPeriodOptions = [
  { id: "daily", label: "يومي" },
  { id: "weekly", label: "أسبوعي" },
  { id: "monthly", label: "شهري" },
];

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
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams, activeTab]);

  const handleSave = async () => {
    if (!settings || !apiKey) return;

    setSaving(true);
    try {
      const categoryValue = settings.business.category?.trim();
      const normalizedCategory = categoryValue || "";
      const mappedCategory = normalizedCategory
        ? CATEGORY_TO_ENUM[normalizedCategory] || normalizedCategory
        : normalizedCategory;
      const payload: MerchantSettings = {
        ...settings,
        business: {
          ...settings.business,
          category: mappedCategory || "",
        },
      };
      await merchantApi.updateSettings(apiKey, payload);
      setInitialSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError(err instanceof Error ? err.message : "فشل في حفظ الإعدادات");
    } finally {
      setSaving(false);
    }
  };

  const notificationsDirty = useMemo(() => {
    if (!settings || !initialSettings) return false;
    return (
      JSON.stringify(settings.notifications) !==
      JSON.stringify(initialSettings.notifications)
    );
  }, [settings, initialSettings]);

  const handleResetNotifications = () => {
    if (!settings || !initialSettings) return;
    setSettings({
      ...settings,
      notifications: { ...initialSettings.notifications },
    });
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
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="الإعدادات"
        description="إدارة إعدادات المتجر والإشعارات"
        actions={
          activeTab !== "notifications" && (
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
          )
        }
      />

      <AiInsightsCard
        insights={generateSettingsInsights({
          hasKnowledgeBase: Boolean(settings?.business?.name),
          hasPayoutSetup: Boolean(
            settings?.payout?.instapayAlias ||
            settings?.payout?.vodafoneCashNumber ||
            settings?.payout?.bankAccount,
          ),
          hasDeliveryRules: Boolean(settings?.preferences?.workingHours?.start),
          hasWorkingHours: Boolean(
            settings?.preferences?.workingHours?.start &&
            settings?.preferences?.workingHours?.end,
          ),
        })}
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
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="business" className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            المتجر
          </TabsTrigger>
          <TabsTrigger value="payout" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            الدفع
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="flex items-center gap-2"
          >
            <Bell className="h-4 w-4" />
            الإشعارات
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            التفضيلات
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          {notificationsDirty && (
            <Card className="border-amber-200 bg-amber-50/60">
              <CardContent className="py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertCircle className="w-4 h-4" />
                  <span>لديك تغييرات غير محفوظة</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleResetNotifications}
                    disabled={saving}
                  >
                    إعادة الضبط
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                إعدادات الإشعارات
              </CardTitle>
              <CardDescription>تخصيص التنبيهات والتقارير</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">تقارير WhatsApp</label>
                  <p className="text-xs text-muted-foreground">
                    استلام التقارير الدورية عبر واتساب
                  </p>
                </div>
                <Switch
                  checked={settings.notifications.whatsappReportsEnabled}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        whatsappReportsEnabled: checked,
                      },
                    })
                  }
                />
              </div>

              {settings.notifications.whatsappReportsEnabled && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">فترات التقارير</label>
                  <div className="grid grid-cols-3 gap-2">
                    {reportPeriodOptions.map((option) => {
                      const enabled =
                        settings.notifications.reportPeriodsEnabled.includes(
                          option.id,
                        );
                      return (
                        <div
                          key={option.id}
                          className="flex items-center gap-2"
                        >
                          <Switch
                            checked={enabled}
                            onCheckedChange={(checked) => {
                              const current =
                                settings.notifications.reportPeriodsEnabled ||
                                [];
                              const next = checked
                                ? Array.from(new Set([...current, option.id]))
                                : current.filter((p) => p !== option.id);
                              setSettings({
                                ...settings,
                                notifications: {
                                  ...settings.notifications,
                                  reportPeriodsEnabled: next,
                                },
                              });
                            }}
                          />
                          <span className="text-sm">{option.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    اختر الفترات التي تريد استلام التقارير فيها
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">تذكير بالدفعات</label>
                  <p className="text-xs text-muted-foreground">
                    تنبيهات المدفوعات المعلقة
                  </p>
                </div>
                <Switch
                  checked={settings.notifications.paymentRemindersEnabled}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        paymentRemindersEnabled: checked,
                      },
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">
                    تنبيهات المخزون المنخفض
                  </label>
                  <p className="text-xs text-muted-foreground">
                    تنبيه عند انخفاض مستوى المخزون
                  </p>
                </div>
                <Switch
                  checked={settings.notifications.lowStockAlertsEnabled}
                  onCheckedChange={(checked) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        lowStockAlertsEnabled: checked,
                      },
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  رقمك لاستلام الإشعارات
                </label>
                <Input
                  value={settings.notifications.notificationPhone || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        notificationPhone: e.target.value || null,
                      },
                    })
                  }
                  placeholder="+966xxxxxxxxx"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  رقمك الشخصي الذي تستلم عليه إشعارات الطلبات والتقارير وتنبيهات
                  المخزون.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  رقم واتساب الأعمال (للتواصل مع العملاء)
                </label>
                <Input
                  value={settings.notifications.whatsappNumber || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notifications: {
                        ...settings.notifications,
                        whatsappNumber: e.target.value || null,
                      },
                    })
                  }
                  placeholder="+966xxxxxxxxx"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  الرقم الذي يراه العملاء ويتواصلون معه — يجب تسجيله في واتساب
                  بزنس عبر الدعم الفني.
                </p>
              </div>
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
              <div className="flex items-center justify-between">
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

              <div className="grid grid-cols-2 gap-4">
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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
