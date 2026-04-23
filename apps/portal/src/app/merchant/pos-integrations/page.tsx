"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Store,
  Plus,
  Settings,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Link2,
  Trash2,
  Zap,
  ShoppingBag,
  Database,
  Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import portalApi from "@/lib/client";

// POS provider definitions
interface PosProvider {
  id: string;
  name: string;
  nameAr: string;
  logo: string;
  description: string;
  fields: {
    key: string;
    label: string;
    placeholder: string;
    type?: string;
    required?: boolean;
  }[];
  color: string;
}

const POS_PROVIDERS: PosProvider[] = [
  {
    id: "odoo",
    name: "Odoo",
    nameAr: "أودو",
    logo: "🟣",
    description: "ربط مع نظام Odoo ERP - مزامنة الطلبات والمخزون تلقائياً",
    color: "border-purple-200 bg-purple-50",
    fields: [
      {
        key: "url",
        label: "عنوان خادم Odoo",
        placeholder: "https://mycompany.odoo.com",
        required: true,
      },
      {
        key: "database",
        label: "اسم قاعدة البيانات",
        placeholder: "mycompany",
        required: true,
      },
      {
        key: "username",
        label: "اسم المستخدم",
        placeholder: "admin@company.com",
        required: true,
      },
      {
        key: "apiKey",
        label: "مفتاح API",
        placeholder: "odoo-api-key-xxx",
        type: "password",
        required: true,
      },
    ],
  },
  {
    id: "foodics",
    name: "Foodics",
    nameAr: "فودكس",
    logo: "🔵",
    description: "ربط مع Foodics - أشهر نظام POS للمطاعم في الخليج ومصر",
    color: "border-blue-200 bg-blue-50",
    fields: [
      {
        key: "clientId",
        label: "Client ID",
        placeholder: "foodics-client-id",
        required: true,
      },
      {
        key: "clientSecret",
        label: "Client Secret",
        placeholder: "foodics-client-secret",
        type: "password",
        required: true,
      },
      {
        key: "accessToken",
        label: "Access Token",
        placeholder: "access-token",
        type: "password",
        required: true,
      },
      {
        key: "businessId",
        label: "Business ID",
        placeholder: "business-uuid",
        required: true,
      },
    ],
  },
  {
    id: "oracle",
    name: "Oracle MICROS",
    nameAr: "أوراكل ميكروس",
    logo: "🔴",
    description:
      "ربط مع Oracle MICROS Simphony - نظام POS للفنادق والمطاعم الكبيرة",
    color: "border-red-200 bg-red-50",
    fields: [
      {
        key: "apiUrl",
        label: "عنوان API",
        placeholder: "https://api.micros.oracle.com",
        required: true,
      },
      {
        key: "clientId",
        label: "Client ID",
        placeholder: "oracle-client-id",
        required: true,
      },
      {
        key: "clientSecret",
        label: "Client Secret",
        placeholder: "oracle-secret",
        type: "password",
        required: true,
      },
      {
        key: "orgShortName",
        label: "اسم المنظمة القصير",
        placeholder: "myorg",
        required: true,
      },
      { key: "locationRef", label: "مرجع الموقع", placeholder: "LOC001" },
    ],
  },
  {
    id: "shopify",
    name: "Shopify",
    nameAr: "شوبيفاي",
    logo: "🟢",
    description: "ربط مع متجر Shopify - مزامنة المنتجات والطلبات",
    color: "border-green-200 bg-green-50",
    fields: [
      {
        key: "storeDomain",
        label: "دومين المتجر",
        placeholder: "mystore.myshopify.com",
        required: true,
      },
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "shopify-api-key",
        required: true,
      },
      {
        key: "apiSecret",
        label: "API Secret",
        placeholder: "shopify-api-secret",
        type: "password",
        required: true,
      },
      {
        key: "accessToken",
        label: "Access Token",
        placeholder: "shpat_xxx",
        type: "password",
        required: true,
      },
    ],
  },
  {
    id: "square",
    name: "Square",
    nameAr: "سكوير",
    logo: "⬛",
    description: "ربط مع Square POS - نظام الدفع ونقاط البيع لتجارة التجزئة",
    color: "border-gray-200 bg-gray-50",
    fields: [
      {
        key: "applicationId",
        label: "Application ID",
        placeholder: "sq0idp-xxx",
        required: true,
      },
      {
        key: "applicationSecret",
        label: "Application Secret",
        placeholder: "sq0csp-xxx",
        type: "password",
        required: true,
      },
      {
        key: "accessToken",
        label: "Access Token",
        placeholder: "EAAA...",
        type: "password",
        required: true,
      },
      {
        key: "locationId",
        label: "Location ID",
        placeholder: "LXXX",
        required: true,
      },
    ],
  },
  {
    id: "custom",
    name: "Custom API",
    nameAr: "API مخصص",
    logo: "⚙️",
    description: "ربط مع أي نظام POS أو ERP عبر API مخصص (REST/Webhook)",
    color: "border-slate-200 bg-slate-50",
    fields: [
      {
        key: "baseUrl",
        label: "عنوان API",
        placeholder: "https://api.mypos.com/v1",
        required: true,
      },
      {
        key: "authType",
        label: "نوع المصادقة",
        placeholder: "bearer / basic / api-key",
      },
      {
        key: "apiKey",
        label: "مفتاح API أو Token",
        placeholder: "my-api-key",
        type: "password",
        required: true,
      },
      {
        key: "webhookSecret",
        label: "Webhook Secret (اختياري)",
        placeholder: "webhook-hmac-secret",
        type: "password",
      },
    ],
  },
  {
    id: "google_slides",
    name: "Google Slides",
    nameAr: "جوجل سلايدز",
    logo: "🟨",
    description:
      "ربط مع Google Slides لتوليد عروض تلقائية (تقارير يومية/أسبوعية أو عروض منتجات).",
    color: "border-amber-200 bg-amber-50",
    fields: [
      {
        key: "presentationId",
        label: "Presentation ID",
        placeholder: "1AbCDefGhIJkLmNoPqRsTuVwXyZ",
        required: true,
      },
      {
        key: "serviceAccountEmail",
        label: "Service Account Email",
        placeholder: "slides-bot@project.iam.gserviceaccount.com",
        required: true,
      },
      {
        key: "privateKey",
        label: "Private Key",
        placeholder: "-----BEGIN PRIVATE KEY-----...",
        type: "password",
        required: true,
      },
      {
        key: "templateSlideId",
        label: "Template Slide ID (اختياري)",
        placeholder: "g1234567890",
      },
    ],
  },
];

interface PosIntegration {
  id: string;
  merchant_id: string;
  provider: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "ERROR";
  config: Record<string, any>;
  credentials: Record<string, string>;
  last_sync_at: string | null;
  sync_interval_minutes: number;
  field_mapping: Record<string, string>;
  created_at: string;
}

export default function PosIntegrationsPage() {
  const [integrations, setIntegrations] = useState<PosIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<PosProvider | null>(
    null,
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [integrationName, setIntegrationName] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await portalApi.getPosIntegrations();
      setIntegrations(Array.isArray(data) ? data : []);
    } catch {
      // POS endpoints may not exist yet - graceful fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const openSetup = (provider: PosProvider) => {
    setSelectedProvider(provider);
    setCredentials({});
    setIntegrationName(provider.name);
    setIsSetupOpen(true);
  };

  const handleSave = async () => {
    if (!selectedProvider) return;
    const missingRequired = selectedProvider.fields
      .filter((f) => f.required && !credentials[f.key])
      .map((f) => f.label);

    if (missingRequired.length > 0) {
      toast({
        title: "حقول مطلوبة",
        description: `يرجى ملء: ${missingRequired.join("، ")}`,
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const data = await portalApi.createPosIntegration({
        provider: selectedProvider.id,
        name: integrationName || selectedProvider.name,
        credentials,
        config: {},
      });

      setIntegrations((prev) => [...prev, data]);
      setIsSetupOpen(false);
      toast({
        title: "تم الربط",
        description: `تم ربط ${selectedProvider.nameAr} بنجاح`,
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error?.message || "فشل في الربط",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (integration: PosIntegration) => {
    try {
      await portalApi.deletePosIntegration(integration.id);
      setIntegrations((prev) => prev.filter((i) => i.id !== integration.id));
      toast({ title: "تم الحذف", description: `تم إزالة ${integration.name}` });
    } catch {
      toast({
        title: "خطأ",
        description: "فشل في الحذف",
        variant: "destructive",
      });
    }
  };

  const handleTestConnection = async (integrationId: string) => {
    setTesting(integrationId);
    try {
      const data = await portalApi.testPosIntegration(integrationId);
      if (data.success) {
        toast({
          title: "الاتصال ناجح",
          description: data.message || "تم التحقق من الاتصال بنجاح",
        });
        // Update status locally
        setIntegrations((prev) =>
          prev.map((i) =>
            i.id === integrationId ? { ...i, status: "ACTIVE" } : i,
          ),
        );
      } else {
        toast({
          title: "فشل الاتصال",
          description: data.message || "تعذر الاتصال بالنظام",
          variant: "destructive",
        });
        setIntegrations((prev) =>
          prev.map((i) =>
            i.id === integrationId ? { ...i, status: "ERROR" } : i,
          ),
        );
      }
    } catch {
      toast({
        title: "خطأ",
        description: "تعذر اختبار الاتصال",
        variant: "destructive",
      });
    } finally {
      setTesting(null);
    }
  };

  const connectedProviders = integrations.map((i) => i.provider);

  return (
    <div className="app-page-frame space-y-6 p-4 pb-8 sm:p-6">
      <PageHeader
        title="تكاملات أنظمة نقاط البيع (POS)"
        description="اربط نظام نقاط البيع الخاص بك لمزامنة الطلبات والمنتجات تلقائياً"
        actions={
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={fetchIntegrations}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        }
      />

      <section className="app-hero-band app-hero-band--subtle">
        <div className="app-hero-band__grid">
          <div className="space-y-4">
            <span className="app-hero-band__eyebrow">POS Integrations</span>
            <div className="space-y-3">
              <h2 className="app-hero-band__title">
                وحّد بين قنوات البيع، المخزون، والطلبات ضمن مسار تكامل أوضح.
              </h2>
              <p className="app-hero-band__copy">
                الصفحة تبقي الربط مع أنظمة نقاط البيع ضمن الحقيقة الحالية
                للتشغيل: حالة أوضح، بطاقات أبسط، وتجهيز أسرع للاتصال دون تغيير
                سلوك الطلبات أو المخزون.
              </p>
            </div>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">
                التكاملات المفعلة
              </span>
              <strong className="app-hero-band__metric-value">
                {integrations.length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">النظم المتاحة</span>
              <strong className="app-hero-band__metric-value">
                {POS_PROVIDERS.length}
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">جاهزة للربط</span>
              <strong className="app-hero-band__metric-value">
                {POS_PROVIDERS.length - connectedProviders.length}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* Connected Integrations */}
      {integrations.length > 0 && (
        <Card className="app-data-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-green-500" />
              التكاملات المفعّلة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {integrations.map((integration) => {
                const provider = POS_PROVIDERS.find(
                  (p) => p.id === integration.provider,
                );
                return (
                  <div
                    key={integration.id}
                    className="app-filter-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3 sm:items-center">
                      <span className="text-2xl">{provider?.logo || "⚙️"}</span>
                      <div>
                        <h4 className="font-medium">{integration.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {provider?.nameAr || integration.provider}
                          {integration.last_sync_at && (
                            <span>
                              {" "}
                              · آخر مزامنة:{" "}
                              {new Date(
                                integration.last_sync_at,
                              ).toLocaleDateString("ar-SA")}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Badge
                        variant={
                          integration.status === "ACTIVE"
                            ? "default"
                            : "secondary"
                        }
                        className={
                          integration.status === "ACTIVE"
                            ? "bg-green-500"
                            : integration.status === "ERROR"
                              ? "bg-red-500 text-white"
                              : ""
                        }
                      >
                        {integration.status === "ACTIVE"
                          ? "مفعّل"
                          : integration.status === "ERROR"
                            ? "خطأ"
                            : "غير مفعّل"}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => handleTestConnection(integration.id)}
                        disabled={testing === integration.id}
                      >
                        {testing === integration.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Zap className="h-3 w-3" />
                        )}
                        اختبار
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 self-start sm:self-auto"
                        onClick={() => handleDelete(integration)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available Providers */}
      <Card className="app-data-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            أنظمة نقاط البيع المتاحة
          </CardTitle>
          <CardDescription>
            اختر نظام POS لربطه بمتجرك - الطلبات والمنتجات ستتزامن تلقائياً
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {POS_PROVIDERS.map((provider) => {
              const isConnected = connectedProviders.includes(provider.id);
              return (
                <div
                  key={provider.id}
                  className={`app-filter-card p-5 transition-all hover:shadow-md ${provider.color}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{provider.logo}</span>
                    <div>
                      <h3 className="font-bold">{provider.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {provider.nameAr}
                      </p>
                    </div>
                    {isConnected && (
                      <Badge className="bg-green-500 text-white ms-auto">
                        مربوط
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    {provider.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      className="w-full"
                      variant={isConnected ? "outline" : "default"}
                      onClick={() => openSetup(provider)}
                    >
                      {isConnected ? (
                        <>
                          <Settings className="h-4 w-4" />
                          إعدادات
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          ربط الآن
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* How it works - Data Flow */}
      <Card className="app-data-card app-data-card--muted border-green-200 bg-green-50/40">
        <CardHeader>
          <CardTitle>كيف تعمل تكاملات POS؟ - تدفق البيانات</CardTitle>
          <CardDescription>
            بعد ربط نظام POS الخاص بك، البيانات تتحرك في الاتجاهين تلقائياً
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500 text-white">
                  ← استقبال من POS
                </Badge>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>
                  • <strong>المنتجات:</strong> نسحب كتالوج المنتجات والأسعار من
                  POS إلى نظامنا
                </li>
                <li>
                  • <strong>المخزون:</strong> كميات المخزون تتحدث تلقائياً من
                  POS
                </li>
                <li>
                  • <strong>الطلبات:</strong> طلبات POS الجديدة تظهر عندك في
                  لوحة التحكم
                </li>
              </ul>
              <p className="text-xs font-medium text-green-700">
                POS → تشغيل (نسحب ونعرض البيانات)
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-500 text-white">
                  → إرسال إلى POS
                </Badge>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>
                  • <strong>طلبات واتساب:</strong> طلبات العملاء عبر واتساب ترسل
                  لـ POS تلقائياً
                </li>
                <li>
                  • <strong>تحديث المخزون:</strong> تعديلات المخزون من نظامنا
                  ترسل لـ POS
                </li>
                <li>
                  • <strong>حالة الطلب:</strong> تحديثات حالة الطلب تتزامن بين
                  النظامين
                </li>
              </ul>
              <p className="text-xs font-medium text-blue-700">
                تشغيل → POS (نرسل البيانات والتحديثات)
              </p>
            </div>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 pt-2">
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-2">
                <Link2 className="h-5 w-5 text-blue-600" />
              </div>
              <h4 className="font-medium text-sm">1. ربط النظام</h4>
              <p className="text-xs text-muted-foreground mt-1">
                أدخل بيانات الاتصال بنظام POS
              </p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                <RefreshCw className="h-5 w-5 text-green-600" />
              </div>
              <h4 className="font-medium text-sm">2. مزامنة ثنائية</h4>
              <p className="text-xs text-muted-foreground mt-1">
                المنتجات والطلبات تتزامن في الاتجاهين
              </p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-2">
                <ShoppingBag className="h-5 w-5 text-orange-600" />
              </div>
              <h4 className="font-medium text-sm">3. طلبات واتساب → POS</h4>
              <p className="text-xs text-muted-foreground mt-1">
                طلبات العملاء تنشأ مباشرة في POS
              </p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg border">
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-2">
                <Database className="h-5 w-5 text-purple-600" />
              </div>
              <h4 className="font-medium text-sm">4. مخزون موحّد</h4>
              <p className="text-xs text-muted-foreground mt-1">
                كمية واحدة في كل الأنظمة
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup Dialog */}
      <Dialog open={isSetupOpen} onOpenChange={setIsSetupOpen}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{selectedProvider?.logo}</span>
              ربط {selectedProvider?.nameAr}
            </DialogTitle>
            <DialogDescription>
              أدخل بيانات الاتصال لربط {selectedProvider?.name} مع تشغيل
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>اسم التكامل</Label>
              <Input
                value={integrationName}
                onChange={(e) => setIntegrationName(e.target.value)}
                placeholder={selectedProvider?.name || "اسم التكامل"}
              />
            </div>

            {selectedProvider?.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label className="flex items-center gap-1">
                  {field.label}
                  {field.required && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  type={field.type || "text"}
                  dir="ltr"
                  placeholder={field.placeholder}
                  value={credentials[field.key] || ""}
                  onChange={(e) =>
                    setCredentials({
                      ...credentials,
                      [field.key]: e.target.value,
                    })
                  }
                />
              </div>
            ))}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <AlertCircle className="h-4 w-4 inline mr-1" />
              البيانات مشفرة ولا يمكن لأحد كشفها - نحتفظ بها بشكل آمن فقط
              للاتصال بنظامك
            </div>
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setIsSetupOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              ربط وتفعيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
