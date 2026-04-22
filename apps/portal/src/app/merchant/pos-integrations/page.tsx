"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/layout/sidebar";
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
    logo: "OD",
    description: "ربط مع نظام Odoo ERP - مزامنة الطلبات والمخزون تلقائياً",
    color:
      "border-[var(--color-brand-primary)]/20 bg-[var(--color-brand-primary)]/10",
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
    logo: "FD",
    description: "ربط مع Foodics - أشهر نظام POS للمطاعم في الخليج ومصر",
    color: "border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/10",
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
    logo: "OR",
    description:
      "ربط مع Oracle MICROS Simphony - نظام POS للفنادق والمطاعم الكبيرة",
    color: "border-[var(--accent-danger)]/20 bg-[var(--accent-danger)]/10",
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
    logo: "SH",
    description: "ربط مع متجر Shopify - مزامنة المنتجات والطلبات",
    color: "border-[var(--accent-success)]/20 bg-[var(--accent-success)]/10",
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
    logo: "SQ",
    description: "ربط مع Square POS - نظام الدفع ونقاط البيع لتجارة التجزئة",
    color: "border-[var(--border-default)] bg-[var(--bg-surface-2)]",
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
    logo: "API",
    description: "ربط مع أي نظام POS أو ERP عبر API مخصص (REST/Webhook)",
    color: "border-[var(--border-default)] bg-[var(--bg-surface-2)]",
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
    logo: "GS",
    description:
      "ربط مع Google Slides لتوليد عروض تلقائية (تقارير يومية/أسبوعية أو عروض منتجات).",
    color: "border-[var(--accent-warning)]/20 bg-[var(--accent-warning)]/10",
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
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="الإعدادات / التكاملات"
        description="إدارة تكاملات POS ومزامنة الطلبات والمنتجات والمخزون من سطح إعدادات واحد."
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

      {/* Connected Integrations */}
      {integrations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[var(--accent-success)]" />
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
                    className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3 sm:items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-2)] font-mono text-xs font-semibold text-foreground">
                        {provider?.logo || "API"}
                      </div>
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
                            ? "border-0 bg-[var(--accent-success)]/15 text-[var(--accent-success)]"
                            : integration.status === "ERROR"
                              ? "border-0 bg-[var(--accent-danger)]/15 text-[var(--accent-danger)]"
                              : "border-0 bg-[var(--bg-surface-3)] text-muted-foreground"
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
                        className="self-start text-[var(--accent-danger)] sm:self-auto"
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
      <Card>
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
                  className={`rounded-xl border p-5 transition-colors hover:bg-[var(--bg-surface-2)] ${provider.color}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-1)] font-mono text-sm font-semibold text-foreground">
                      {provider.logo}
                    </div>
                    <div>
                      <h3 className="font-bold">{provider.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {provider.nameAr}
                      </p>
                    </div>
                    {isConnected && (
                      <Badge className="ms-auto border-0 bg-[var(--accent-success)]/15 text-[var(--accent-success)]">
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
      <Card className="border-[var(--accent-success)]/20 bg-[var(--bg-surface-2)]">
        <CardHeader>
          <CardTitle>كيف تعمل تكاملات POS؟ - تدفق البيانات</CardTitle>
          <CardDescription>
            بعد ربط نظام POS الخاص بك، البيانات تتحرك في الاتجاهين تلقائياً
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-4">
              <div className="flex items-center gap-2">
                <Badge className="border-0 bg-[var(--accent-success)]/15 text-[var(--accent-success)]">
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
              <p className="text-xs font-medium text-[var(--accent-success)]">
                POS → تشغيل (نسحب ونعرض البيانات)
              </p>
            </div>
            <div className="space-y-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-4">
              <div className="flex items-center gap-2">
                <Badge className="border-0 bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
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
              <p className="text-xs font-medium text-[var(--accent-blue)]">
                تشغيل → POS (نرسل البيانات والتحديثات)
              </p>
            </div>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 pt-2">
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-3 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/10">
                <Link2 className="h-5 w-5 text-[var(--accent-blue)]" />
              </div>
              <h4 className="font-medium text-sm">1. ربط النظام</h4>
              <p className="text-xs text-muted-foreground mt-1">
                أدخل بيانات الاتصال بنظام POS
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-3 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--accent-success)]/30 bg-[var(--accent-success)]/10">
                <RefreshCw className="h-5 w-5 text-[var(--accent-success)]" />
              </div>
              <h4 className="font-medium text-sm">2. مزامنة ثنائية</h4>
              <p className="text-xs text-muted-foreground mt-1">
                المنتجات والطلبات تتزامن في الاتجاهين
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-3 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10">
                <ShoppingBag className="h-5 w-5 text-[var(--accent-warning)]" />
              </div>
              <h4 className="font-medium text-sm">3. طلبات واتساب → POS</h4>
              <p className="text-xs text-muted-foreground mt-1">
                طلبات العملاء تنشأ مباشرة في POS
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-1)] p-3 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-brand-primary)]/30 bg-[var(--color-brand-primary)]/10">
                <Database className="h-5 w-5 text-[var(--color-brand-primary)]" />
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
                  {field.required && (
                    <span className="text-[var(--accent-danger)]">*</span>
                  )}
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

            <div className="rounded-lg border border-[var(--accent-blue)]/20 bg-[var(--accent-blue)]/10 p-3 text-sm text-[var(--text-secondary)]">
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
