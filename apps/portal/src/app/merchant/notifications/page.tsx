"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Settings,
  ShoppingCart,
  MessageSquare,
  Package,
  DollarSign,
  Shield,
  TrendingUp,
  Mail,
  Clock,
  ExternalLink,
} from "lucide-react";
import { portalApi } from "@/lib/client";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import {
  AiInsightsCard,
  generateNotificationsInsights,
} from "@/components/ai/ai-insights-card";
import { useMerchant } from "@/hooks/use-merchant";

interface Notification {
  id: string;
  type: string;
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  priority: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
}

interface NotificationPreferences {
  emailEnabled: boolean;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  enabledTypes: string[];
  emailAddress?: string;
  whatsappNumber?: string;
}

const NOTIFICATION_TYPES = [
  { value: "ORDER_PLACED", label: "طلب جديد", icon: ShoppingCart },
  { value: "ORDER_CONFIRMED", label: "تأكيد طلب", icon: Check },
  { value: "ORDER_SHIPPED", label: "شحن طلب", icon: Package },
  { value: "ORDER_DELIVERED", label: "تسليم طلب", icon: CheckCheck },
  { value: "LOW_STOCK", label: "انخفاض المخزون", icon: AlertCircle },
  {
    value: "ESCALATED_CONVERSATION",
    label: "محادثة مصعدة",
    icon: MessageSquare,
  },
  { value: "PAYMENT_RECEIVED", label: "دفعة جديدة", icon: DollarSign },
  { value: "DAILY_SUMMARY", label: "الملخص اليومي", icon: TrendingUp },
  { value: "SECURITY_ALERT", label: "تنبيهات الأمان", icon: Shield },
  { value: "ANOMALY_ALERT", label: "تنبيه ذكي", icon: AlertTriangle },
];

const getNotificationIcon = (type: string) => {
  const config = NOTIFICATION_TYPES.find((t) => t.value === type);
  return config?.icon || Bell;
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "URGENT":
      return "bg-red-100 text-red-800 border-red-200";
    case "HIGH":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "MEDIUM":
      return "bg-blue-100 text-blue-800 border-blue-200";
    default:
      return "bg-muted text-muted-foreground border";
  }
};

export default function NotificationsPage() {
  const { merchantId } = useMerchant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  // Data
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [draftPreferences, setDraftPreferences] =
    useState<NotificationPreferences | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Filter
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { toast } = useToast();

  const fetchNotifications = useCallback(async () => {
    if (!merchantId) return;
    setLoading(true);
    setError(null);
    const loadNotifications = async () => {
      let response: any = null;
      try {
        response = await portalApi.getPortalNotifications({ unreadOnly });
      } catch {
        response = null;
      }

      if (
        (!response?.notifications || response.notifications.length === 0) &&
        merchantId
      ) {
        response = await portalApi.getNotifications(merchantId, {
          unreadOnly,
          limit: 100,
          offset: 0,
        });
      }

      const rows = (response?.notifications || []) as Notification[];
      const sortedNotifications = [...rows].sort(
        (a: Notification, b: Notification) => {
          const aTime = Date.parse(a.createdAt || "");
          const bTime = Date.parse(b.createdAt || "");
          return (
            (Number.isNaN(bTime) ? 0 : bTime) -
            (Number.isNaN(aTime) ? 0 : aTime)
          );
        },
      );

      const computedUnread = sortedNotifications.filter(
        (item) => !item.isRead,
      ).length;
      const unreadFromApi = Number(response?.unreadCount);
      const totalFromApi = Number(response?.total);
      return {
        notifications: sortedNotifications,
        unreadCount: Number.isFinite(unreadFromApi)
          ? unreadFromApi
          : computedUnread,
        total: Number.isFinite(totalFromApi)
          ? totalFromApi
          : sortedNotifications.length,
      };
    };

    try {
      const result = await loadNotifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
      setTotal(result.total);
    } catch (err: any) {
      try {
        const result = await loadNotifications();
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
        setTotal(result.total);
      } catch (retryErr: any) {
        setError(
          retryErr?.message || err?.message || "Failed to load notifications",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [merchantId, unreadOnly]);

  const fetchPreferences = useCallback(async () => {
    if (!merchantId) return;
    try {
      const prefs = await portalApi.getNotificationPreferences(merchantId);
      setPreferences(prefs);
      setDraftPreferences(prefs);
    } catch (err: any) {
      console.error("Failed to load preferences:", err);
    }
  }, [merchantId]);

  useEffect(() => {
    fetchNotifications();
    fetchPreferences();
  }, [fetchNotifications, fetchPreferences]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await portalApi.markNotificationRead(merchantId, notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await portalApi.markAllNotificationsRead(merchantId);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await portalApi.deleteNotification(merchantId, notificationId);
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      setTotal((prev) => prev - 1);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateDraftPreferences = (
    updates: Partial<NotificationPreferences>,
  ) => {
    setDraftPreferences((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const handleSavePreferences = async () => {
    if (!draftPreferences) return;
    setSavingPreferences(true);
    setError(null);
    try {
      await portalApi.updateNotificationPreferences(
        merchantId,
        draftPreferences,
      );
      // Re-fetch to get the persisted state from the server
      const freshPrefs = await portalApi.getNotificationPreferences(merchantId);
      setPreferences(freshPrefs);
      setDraftPreferences(freshPrefs);
      toast({
        title: "تم الحفظ",
        description: "تم حفظ تفضيلات الإشعارات بنجاح",
      });
    } catch (err: any) {
      setError(err.message || "Failed to save preferences");
      toast({
        title: "خطأ",
        description: "فشل في حفظ التفضيلات",
        variant: "destructive",
      });
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleResetPreferences = () => {
    if (!preferences) return;
    setDraftPreferences(preferences);
  };

  const handleToggleType = (type: string, enabled: boolean) => {
    if (!draftPreferences) return;
    const current = draftPreferences.enabledTypes || [];
    const enabledTypes = enabled
      ? Array.from(new Set([...current, type]))
      : current.filter((t) => t !== type);
    updateDraftPreferences({ enabledTypes });
  };

  const preferencesDirty = useMemo(() => {
    if (!preferences || !draftPreferences) return false;
    return JSON.stringify(preferences) !== JSON.stringify(draftPreferences);
  }, [preferences, draftPreferences]);

  if (loading && notifications.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="مركز الإشعارات"
          titleEn="Notifications Center"
          description="إدارة الإشعارات والتنبيهات"
        />
        {unreadCount > 0 && (
          <Badge variant="destructive" className="text-lg px-3 py-1">
            {unreadCount} غير مقروء
          </Badge>
        )}
      </div>

      {/* AI Notifications Insights */}
      <AiInsightsCard
        title="مساعد الإشعارات"
        insights={generateNotificationsInsights({
          unreadCount,
          totalNotifications: total,
          whatsappEnabled: preferences?.whatsappEnabled,
          emailEnabled: preferences?.emailEnabled,
        })}
        loading={loading}
      />

      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="py-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <span className="text-destructive">{error}</span>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            الإشعارات
            {unreadCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            الإعدادات
          </TabsTrigger>
        </TabsList>

        {/* Notifications Tab */}
        <TabsContent value="all" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUnreadOnly(!unreadOnly)}
              >
                {unreadOnly ? (
                  <BellOff className="w-4 h-4" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {unreadOnly ? "إظهار الكل" : "غير المقروء فقط"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {total} إشعار
              </span>
            </div>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead}>
                <CheckCheck className="w-4 h-4" />
                قراءة الكل
              </Button>
            )}
          </div>

          <ScrollArea className="h-[600px]">
            <div className="space-y-3">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type);
                return (
                  <Card
                    key={notification.id}
                    className={`transition-all ${!notification.isRead ? "border-primary bg-primary/5" : ""}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div
                          className={`p-2 rounded-full ${getPriorityColor(notification.priority)}`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4
                              className={`font-semibold ${!notification.isRead ? "text-primary" : ""}`}
                            >
                              {notification.titleAr}
                            </h4>
                            <Badge variant="outline" className="text-xs">
                              {notification.priority === "URGENT"
                                ? "عاجل"
                                : notification.priority === "HIGH"
                                  ? "مهم"
                                  : notification.priority === "MEDIUM"
                                    ? "متوسط"
                                    : "عادي"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {notification.messageAr}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDistanceToNow(
                                new Date(notification.createdAt),
                                {
                                  addSuffix: true,
                                  locale: ar,
                                },
                              )}
                            </span>
                            {notification.actionUrl && (
                              <a
                                href={notification.actionUrl}
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                                عرض التفاصيل
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!notification.isRead && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleMarkAsRead(notification.id)}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(notification.id)}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {notifications.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <BellOff className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">لا توجد إشعارات</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          {preferencesDirty && (
            <Card className="border-amber-200 bg-amber-50/60">
              <CardContent className="py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertCircle className="w-4 h-4" />
                  <span>لديك تغييرات غير محفوظة</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleResetPreferences}
                    disabled={savingPreferences}
                  >
                    إعادة الضبط
                  </Button>
                  <Button
                    onClick={handleSavePreferences}
                    disabled={savingPreferences}
                  >
                    {savingPreferences ? (
                      <>
                        <RefreshCw className="w-4 h-4 ml-2 animate-spin" />
                        جارٍ الحفظ
                      </>
                    ) : (
                      "حفظ التغييرات"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="py-3 text-sm text-blue-900">
              أدخل بريدك ورقم واتساب فقط. إعدادات مزوّد البريد والواتساب تُدار
              مركزياً بواسطة النظام.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>قنوات الإشعارات</CardTitle>
              <CardDescription>اختر كيف تريد تلقي الإشعارات</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <Label>إشعارات التطبيق</Label>
                    <p className="text-sm text-muted-foreground">
                      إشعارات داخل التطبيق
                    </p>
                  </div>
                </div>
                <Badge>دائماً مفعل</Badge>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <Label>البريد الإلكتروني</Label>
                    <p className="text-sm text-muted-foreground">
                      تلقي الإشعارات عبر البريد
                    </p>
                  </div>
                </div>
                <Switch
                  checked={draftPreferences?.emailEnabled ?? true}
                  onCheckedChange={(v) =>
                    updateDraftPreferences({ emailEnabled: v })
                  }
                />
              </div>

              {draftPreferences?.emailEnabled && (
                <div className="ml-8">
                  <Label>البريد الإلكتروني</Label>
                  <Input
                    type="email"
                    value={draftPreferences?.emailAddress || ""}
                    onChange={(e) =>
                      updateDraftPreferences({ emailAddress: e.target.value })
                    }
                    placeholder="email@example.com"
                    className="mt-1"
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <Label>واتساب</Label>
                    <p className="text-sm text-muted-foreground">
                      تلقي الإشعارات العاجلة على واتساب
                    </p>
                  </div>
                </div>
                <Switch
                  checked={draftPreferences?.whatsappEnabled ?? false}
                  onCheckedChange={(v) =>
                    updateDraftPreferences({ whatsappEnabled: v })
                  }
                />
              </div>

              {draftPreferences?.whatsappEnabled && (
                <div className="ml-8">
                  <Label>رقم واتساب</Label>
                  <Input
                    type="tel"
                    value={draftPreferences?.whatsappNumber || ""}
                    onChange={(e) =>
                      updateDraftPreferences({ whatsappNumber: e.target.value })
                    }
                    placeholder="+20 10 xxx xxx"
                    className="mt-1"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ساعات الهدوء</CardTitle>
              <CardDescription>
                إيقاف الإشعارات غير العاجلة في أوقات محددة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>من</Label>
                  <Input
                    type="time"
                    value={draftPreferences?.quietHoursStart || ""}
                    onChange={(e) =>
                      updateDraftPreferences({
                        quietHoursStart: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>إلى</Label>
                  <Input
                    type="time"
                    value={draftPreferences?.quietHoursEnd || ""}
                    onChange={(e) =>
                      updateDraftPreferences({ quietHoursEnd: e.target.value })
                    }
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                الإشعارات العاجلة ستصلك دائماً
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>أنواع الإشعارات</CardTitle>
              <CardDescription>اختر الإشعارات التي تريد تلقيها</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {NOTIFICATION_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isEnabled =
                    draftPreferences?.enabledTypes?.includes(type.value) ??
                    true;
                  return (
                    <div
                      key={type.value}
                      className="flex items-center space-x-3 space-x-reverse"
                    >
                      <Checkbox
                        id={type.value}
                        checked={isEnabled}
                        onCheckedChange={(v) =>
                          handleToggleType(type.value, v as boolean)
                        }
                      />
                      <Label
                        htmlFor={type.value}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        {type.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
