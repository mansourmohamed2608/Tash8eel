"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertCircle,
  ArrowUpLeft,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/merchant/dashboard";

  useEffect(() => {
    const signup = searchParams.get("signup");
    const nextMerchantId = searchParams.get("merchantId");
    const nextEmail = searchParams.get("email");
    const reason = searchParams.get("reason");

    if (signup === "success") {
      setSuccessMessage(
        "تم إنشاء الحساب التجريبي بنجاح. استخدم رقم المتجر والبريد الإلكتروني لإتمام تسجيل الدخول.",
      );
    }
    if (reason === "idle") {
      setSuccessMessage(
        "تم تسجيل الخروج تلقائياً بسبب عدم النشاط. سجّل الدخول للمتابعة.",
      );
    } else if (reason === "session_expired") {
      setSuccessMessage(
        "انتهت صلاحية الجلسة أو تعذر تحديثها. سجّل الدخول مرة أخرى.",
      );
    }
    if (nextMerchantId) setMerchantId(nextMerchantId);
    if (nextEmail) setEmail(nextEmail);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        merchantId,
        redirect: false,
      });

      if (result?.error) {
        const errorMessages: Record<string, string> = {
          CredentialsSignin: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
          "fetch failed":
            "تعذر الاتصال بالخادم. تأكد من تشغيل الخادم وأعد المحاولة.",
          Configuration: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
          "تعذر الاتصال بالخادم. تأكد من تشغيل الخادم وأعد المحاولة.":
            "تعذر الاتصال بالخادم. تأكد من تشغيل الخادم وأعد المحاولة.",
        };
        setError(
          errorMessages[result.error] ??
            "البريد الإلكتروني أو كلمة المرور غير صحيحة",
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const session = await getSession();
        const targetUrl =
          session?.user?.role === "ADMIN" &&
          session?.user?.merchantId === "system"
            ? "/admin/dashboard"
            : session?.user?.role === "CASHIER"
              ? "/merchant/cashier"
              : callbackUrl;

        router.push(targetUrl);
        if (process.env.NODE_ENV !== "test") {
          window.location.href = targetUrl;
        }
        return;
      }
    } catch {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <section className="app-auth-panel hidden lg:grid">
          <div className="space-y-6">
            <span className="app-auth-kicker">
              <Sparkles className="h-4 w-4" />
              Merchant Workspace
            </span>
            <div className="space-y-4">
              <h1 className="app-auth-title">
                تشغيل يومي أوضح
                <br />
                للتاجر وفريقه
              </h1>
              <p className="app-auth-copy">
                من المحادثات والطلبات إلى التقارير والكاشير، كل شيء مجمّع في
                مساحة عمل واحدة بهدوء بصري أوضح وترتيب أسهل للفريق.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="app-surface rounded-[20px] p-5">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-bold tracking-[-0.02em]">دخول آمن</h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                ادخل إلى لوحة تشغيل موحدة تحافظ على نفس مسارات الطلبات،
                المحادثات، والتقارير الحالية.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="app-surface rounded-[20px] p-5">
                <p className="app-page-header-eyebrow">Flows</p>
                <p className="mt-3 text-base font-bold">
                  طلبات، متابعات، وتقارير
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  مساحات أوضح للتشغيل اليومي بدل التكدس البصري والتنقل المربك.
                </p>
              </div>
              <div className="app-surface rounded-[20px] p-5">
                <p className="app-page-header-eyebrow">Control</p>
                <p className="mt-3 text-base font-bold">وصول أسرع للأدوار</p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  التاجر، الفريق، والكاشير يدخلون إلى نفس الحقيقة التشغيلية من
                  دون تغيير المسارات الحالية.
                </p>
              </div>
            </div>
          </div>
        </section>

        <Card className="app-auth-card w-full">
          <CardHeader className="space-y-5 pb-6 text-right">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-[16px] bg-primary text-primary-foreground shadow-[0_18px_48px_rgba(31,111,255,0.18)]">
              <Store className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-[1.85rem]">تسجيل الدخول</CardTitle>
              <CardDescription className="text-sm leading-7">
                أدخل بيانات المتجر للوصول إلى اللوحة التشغيلية الحالية.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {successMessage && (
                <div className="app-inline-note app-inline-note--success">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {error && (
                <div className="app-inline-note app-inline-note--error">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="merchantId" className="app-input-label">
                  رقم المتجر
                </Label>
                <Input
                  id="merchantId"
                  type="text"
                  placeholder="مثال: demo-merchant"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  required
                  disabled={isLoading}
                  className="text-right"
                  dir="rtl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="app-input-label">
                  البريد الإلكتروني
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com :مثال"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="text-right"
                  dir="rtl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="app-input-label">
                  كلمة المرور
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="أدخل كلمة المرور"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="text-right pr-10 [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
                    dir="rtl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  استخدم حساب المتجر للوصول إلى الفريق والبيانات التشغيلية.
                </span>
                <Link
                  href="/forgot-password"
                  className="font-semibold text-primary hover:underline"
                >
                  نسيت كلمة المرور؟
                </Link>
              </div>

              <Button
                type="submit"
                className="w-full justify-center"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري تسجيل الدخول...
                  </>
                ) : (
                  "تسجيل الدخول"
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                <span>ليس لديك حساب؟ </span>
                <Link
                  href="/signup"
                  className="font-semibold text-primary hover:underline"
                >
                  تواصل معنا
                </Link>
              </div>
            </form>

            {process.env.NODE_ENV === "development" && (
              <div className="mt-6 rounded-[16px] border border-border/70 bg-background/80 p-4 text-xs text-muted-foreground">
                <p className="mb-2 font-semibold text-foreground">
                  بيانات تجريبية (اضغط للملء التلقائي):
                </p>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 rounded-[14px] border border-transparent px-3 py-3 text-right transition-colors hover:border-border/70 hover:bg-accent/40 hover:text-foreground"
                  onClick={() => {
                    setMerchantId("demo-merchant");
                    setEmail("demo@tash8eel.com");
                    setPassword("demo123");
                  }}
                >
                  <span className="space-y-1">
                    <span className="block text-muted-foreground">
                      المتجر:{" "}
                      <span className="font-semibold text-primary">
                        demo-merchant
                      </span>
                    </span>
                    <span className="block text-muted-foreground">
                      البريد:{" "}
                      <span className="font-semibold text-primary">
                        demo@tash8eel.com
                      </span>
                    </span>
                    <span className="block text-muted-foreground">
                      كلمة المرور:{" "}
                      <span className="font-semibold text-primary">
                        demo123
                      </span>
                    </span>
                  </span>
                  <ArrowUpLeft className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="app-auth-shell">
      <Card className="app-auth-card w-full max-w-md">
        <CardHeader className="text-right">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-[16px] bg-primary text-primary-foreground">
            <Store className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl">تسجيل الدخول</CardTitle>
          <CardDescription>أدخل بياناتك للوصول إلى لوحة التحكم</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="assistant-skeleton h-11 rounded-[14px]" />
            <div className="assistant-skeleton h-11 rounded-[14px]" />
            <div className="assistant-skeleton h-11 rounded-[14px]" />
            <div className="assistant-skeleton h-11 rounded-[14px]" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
