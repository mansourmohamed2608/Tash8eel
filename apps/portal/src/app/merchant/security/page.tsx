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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Shield,
  Smartphone,
  Laptop,
  Clock,
  LogOut,
  Key,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Fingerprint,
  History,
  MapPin,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMerchant } from "@/hooks/use-merchant";
import portalApi from "@/lib/client";

interface Session {
  id: string;
  deviceType: "mobile" | "desktop" | "tablet";
  browser: string;
  os: string;
  ip: string;
  location?: string;
  lastActive: string;
  createdAt: string;
  isCurrent: boolean;
}

interface AuditLog {
  id: string;
  action: string;
  details: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  status: "success" | "failure";
}

interface SecuritySettings {
  twoFactorEnabled: boolean;
  twoFactorMethod?: "sms" | "email" | "authenticator";
  allowedIps?: string[];
  lastPasswordChange?: string;
}

const DEVICE_ICONS = {
  mobile: Smartphone,
  desktop: Laptop,
  tablet: Smartphone,
};

export default function SecurityPage() {
  const { merchantId, apiKey } = useMerchant();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("sessions");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<SecuritySettings>({
    twoFactorEnabled: false,
  });
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const fetchSecurityData = useCallback(async () => {
    if (!merchantId || !apiKey) return;

    try {
      setLoading(true);

      // Fetch sessions and audit logs from API
      const [sessionsRes, auditRes] = await Promise.all([
        portalApi.getSessions(),
        portalApi.getSecurityAudit({ limit: 50 }),
      ]);

      // Transform sessions to match UI format
      const transformedSessions: Session[] = sessionsRes.sessions.map((s) => {
        const ua = s.userAgent || "";
        const isMobile = /mobile|iphone|android/i.test(ua);
        const isTablet = /ipad|tablet/i.test(ua);
        const deviceType = isTablet
          ? "tablet"
          : isMobile
            ? "mobile"
            : "desktop";

        // Parse browser/OS from user agent
        let browser = "Unknown";
        let os = "Unknown";
        if (ua.includes("Chrome")) browser = "Chrome";
        else if (ua.includes("Firefox")) browser = "Firefox";
        else if (ua.includes("Safari")) browser = "Safari";
        else if (ua.includes("Edge")) browser = "Edge";

        if (ua.includes("Windows")) os = "Windows";
        else if (ua.includes("Mac")) os = "macOS";
        else if (ua.includes("iPhone") || ua.includes("iOS")) os = "iOS";
        else if (ua.includes("Android")) os = "Android";
        else if (ua.includes("Linux")) os = "Linux";

        return {
          id: s.id,
          deviceType,
          browser,
          os,
          ip: s.ipAddress?.replace(/\.\d+$/, ".xxx") || "Unknown",
          lastActive: s.lastUsedAt || s.createdAt,
          createdAt: s.createdAt,
          isCurrent: s.isCurrent,
        };
      });

      // Transform audit logs
      const ACTION_LABELS: Record<string, string> = {
        LOGIN: "تسجيل الدخول",
        LOGOUT: "تسجيل الخروج",
        PASSWORD_CHANGED: "تغيير كلمة المرور",
        PASSWORD_CHANGE: "تغيير كلمة المرور",
        PASSWORD_RESET: "إعادة تعيين كلمة المرور",
        LOGIN_FAILED: "محاولة دخول فاشلة",
        ACCOUNT_LOCKED: "تم قفل الحساب",
        ACCOUNT_UNLOCKED: "تم فتح الحساب",
        SESSION_REVOKED: "إنهاء جلسة",
        ALL_SESSIONS_REVOKED: "إنهاء جميع الجلسات",
        API_KEY_ROTATED: "تحديث مفتاح API",
        PERMISSIONS_CHANGED: "تغيير الصلاحيات",
      };

      const transformedLogs: AuditLog[] = auditRes.logs.map((log) => ({
        id: log.id,
        action: ACTION_LABELS[log.action] || log.action,
        details: log.metadata ? JSON.stringify(log.metadata) : "",
        ip: log.ipAddress?.replace(/\.\d+$/, ".xxx") || "Unknown",
        userAgent: log.userAgent || "Unknown",
        createdAt: log.createdAt,
        status:
          log.action.includes("FAIL") || log.action === "ACCOUNT_LOCKED"
            ? "failure"
            : "success",
      }));

      setSessions(transformedSessions);
      setAuditLogs(transformedLogs);
      setSettings({
        twoFactorEnabled: false,
        lastPasswordChange: new Date(
          Date.now() - 45 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      });
    } catch (error) {
      console.error("Failed to fetch security data:", error);
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey]);

  useEffect(() => {
    fetchSecurityData();
  }, [fetchSecurityData]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "sessions" || tab === "settings" || tab === "audit") {
      setActiveTab(tab);
      return;
    }
    setActiveTab("sessions");
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "sessions") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await portalApi.revokeSession(sessionId);
      setSessions(sessions.filter((s) => s.id !== sessionId));
    } catch (error) {
      console.error("Failed to revoke session:", error);
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      await portalApi.revokeAllSessions();
      setSessions(sessions.filter((s) => s.isCurrent));
    } catch (error) {
      console.error("Failed to revoke sessions:", error);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim()) {
      setPasswordError("يرجى إدخال كلمة المرور الحالية");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError("كلمة المرور الجديدة يجب أن تختلف عن الحالية");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("كلمة المرور الجديدة وتأكيدها غير متطابقتين");
      return;
    }
    setPasswordError("");

    try {
      setSubmitting(true);
      await portalApi.changeStaffPassword({
        currentPassword: currentPassword,
        newPassword: newPassword,
      });

      setChangePasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSettings((prev) => ({
        ...prev,
        lastPasswordChange: new Date().toISOString(),
      }));
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        "فشل في تغيير كلمة المرور";
      setPasswordError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "الآن";
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    return `منذ ${diffDays} يوم`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="الأمان والخصوصية"
        description="إدارة الجلسات النشطة وإعدادات الأمان"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" size="sm" onClick={fetchSecurityData}>
              <RefreshCw className="h-4 w-4 ml-2" />
              تحديث
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">الجلسات النشطة</span>
          <span className="font-mono text-foreground">{sessions.length}</span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <Fingerprint className="h-3.5 w-3.5 text-[var(--accent-gold)]" />
          <span className="text-muted-foreground">المصادقة الثنائية</span>
          <span className="font-mono text-[var(--accent-gold)]">
            {settings?.twoFactorEnabled ? "مفعلة" : "معطلة"}
          </span>
        </div>
        <div className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs">
          <Clock className="h-3.5 w-3.5 text-[var(--accent-blue)]" />
          <span className="text-muted-foreground">آخر تغيير كلمة مرور</span>
          <span className="font-mono text-[var(--accent-blue)]">
            {settings?.lastPasswordChange || "—"}
          </span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <TabsTrigger value="sessions" className="w-full gap-2">
            <Laptop className="h-4 w-4" />
            الجلسات النشطة
          </TabsTrigger>
          <TabsTrigger value="settings" className="w-full gap-2">
            <Shield className="h-4 w-4" />
            إعدادات الأمان
          </TabsTrigger>
          <TabsTrigger value="audit" className="w-full gap-2">
            <History className="h-4 w-4" />
            سجل النشاط
          </TabsTrigger>
        </TabsList>

        {/* Sessions Tab */}
        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>الأجهزة المتصلة</CardTitle>
                <CardDescription>
                  {sessions.length} جهاز متصل بحسابك
                </CardDescription>
              </div>
              {sessions.length > 1 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full sm:w-auto"
                    >
                      <LogOut className="h-4 w-4 ml-2" />
                      إنهاء جميع الجلسات
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
                    <AlertDialogHeader>
                      <AlertDialogTitle>إنهاء جميع الجلسات؟</AlertDialogTitle>
                      <AlertDialogDescription>
                        سيتم تسجيل الخروج من جميع الأجهزة الأخرى. ستحتاج إلى
                        تسجيل الدخول مرة أخرى على تلك الأجهزة.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
                      <AlertDialogCancel className="w-full sm:w-auto">
                        إلغاء
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleRevokeAllSessions}
                        className="w-full sm:w-auto"
                      >
                        إنهاء الجلسات
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sessions.length === 0 && (
                  <div className="text-center py-6">
                    <Laptop className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">
                      لا توجد جلسات نشطة
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      ستظهر الأجهزة المتصلة عند تسجيل الدخول عبر حساب فريق العمل
                      (Staff Login)
                    </p>
                  </div>
                )}
                {sessions.map((session) => {
                  const DeviceIcon = DEVICE_ICONS[session.deviceType];
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
                        session.isCurrent && "bg-primary/5 border-primary",
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={cn(
                            "p-2 rounded-full",
                            session.isCurrent ? "bg-primary/10" : "bg-muted",
                          )}
                        >
                          <DeviceIcon
                            className={cn(
                              "h-5 w-5",
                              session.isCurrent
                                ? "text-primary"
                                : "text-muted-foreground",
                            )}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {session.browser} • {session.os}
                            </span>
                            {session.isCurrent && (
                              <Badge variant="default" className="text-xs">
                                هذا الجهاز
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <MapPin className="h-3 w-3" />
                            {session.location || "غير معروف"} • {session.ip}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3" />
                            آخر نشاط: {formatTimeAgo(session.lastActive)}
                          </div>
                        </div>
                      </div>
                      {!session.isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeSession(session.id)}
                          className="w-full text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10 hover:text-[var(--accent-danger)] sm:w-auto"
                        >
                          <LogOut className="h-4 w-4 ml-1" />
                          إنهاء
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          {/* Password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                كلمة المرور
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm">
                    آخر تغيير:{" "}
                    {settings.lastPasswordChange
                      ? formatTimeAgo(settings.lastPasswordChange)
                      : "لم يتم التغيير"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    يُنصح بتغيير كلمة المرور كل 90 يوم
                  </p>
                </div>
                <Dialog
                  open={changePasswordOpen}
                  onOpenChange={setChangePasswordOpen}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline">تغيير كلمة المرور</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>تغيير كلمة المرور</DialogTitle>
                      <DialogDescription>
                        أدخل كلمة المرور الحالية والجديدة
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="currentPassword">
                          كلمة المرور الحالية
                        </Label>
                        <div className="relative">
                          <Input
                            id="currentPassword"
                            type={showCurrentPw ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            autoComplete="off"
                            data-lpignore="true"
                            className="pl-10 [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
                          />
                          <button
                            type="button"
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowCurrentPw(!showCurrentPw)}
                            tabIndex={-1}
                          >
                            {showCurrentPw ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
                        <div className="relative">
                          <Input
                            id="newPassword"
                            type={showNewPw ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            autoComplete="new-password"
                            data-lpignore="true"
                            className="pl-10 [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
                          />
                          <button
                            type="button"
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowNewPw(!showNewPw)}
                            tabIndex={-1}
                          >
                            {showNewPw ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {newPassword.length > 0 && newPassword.length < 8 && (
                          <p className="text-xs text-[var(--accent-warning)]">
                            يجب أن تكون 8 أحرف على الأقل
                          </p>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="confirmPassword">
                          تأكيد كلمة المرور
                        </Label>
                        <div className="relative">
                          <Input
                            id="confirmPassword"
                            type={showConfirmPw ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                            data-lpignore="true"
                            className="pl-10 [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
                          />
                          <button
                            type="button"
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowConfirmPw(!showConfirmPw)}
                            tabIndex={-1}
                          >
                            {showConfirmPw ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {confirmPassword.length > 0 &&
                          newPassword !== confirmPassword && (
                            <p className="text-xs text-[var(--accent-danger)]">
                              كلمتا المرور غير متطابقتين
                            </p>
                          )}
                      </div>
                      {passwordError && (
                        <p className="text-sm font-medium text-[var(--accent-danger)]">
                          {passwordError}
                        </p>
                      )}
                    </div>
                    <DialogFooter className="flex-col gap-2 sm:flex-row">
                      <Button
                        variant="outline"
                        onClick={() => setChangePasswordOpen(false)}
                      >
                        إلغاء
                      </Button>
                      <Button
                        onClick={handleChangePassword}
                        disabled={submitting}
                      >
                        {submitting ? "جاري التغيير..." : "تغيير"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          {/* Two-Factor Authentication */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5" />
                المصادقة الثنائية (2FA)
                <Badge variant="secondary" className="text-[10px]">
                  قريباً
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    هذه الميزة قيد التطوير وستكون متاحة قريباً لإضافة طبقة حماية
                    إضافية لحسابك
                  </p>
                </div>
                <Switch checked={false} disabled={true} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>تم نقل تفضيلات الأمان التشغيلية</CardTitle>
              <CardDescription>
                إعدادات مهلة الجلسة وحماية العمليات المالية أصبحت ضمن صفحة
                التفضيلات في الإعدادات.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link href="/merchant/settings?tab=preferences">
                  فتح تفضيلات الإعدادات
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>سجل النشاط</CardTitle>
              <CardDescription>آخر الأنشطة على حسابك</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 p-1 rounded-full",
                          log.status === "success"
                            ? "bg-[var(--accent-success)]/10"
                            : "bg-[var(--accent-danger)]/10",
                        )}
                      >
                        {log.status === "success" ? (
                          <CheckCircle2 className="h-4 w-4 text-[var(--accent-success)]" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-[var(--accent-danger)]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{log.action}</div>
                        <div className="text-sm text-muted-foreground break-words">
                          {log.details}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground break-all">
                          {log.ip} • {log.userAgent}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground sm:whitespace-nowrap">
                      {formatTimeAgo(log.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
