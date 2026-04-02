"use client";

import { useEffect, useState, Suspense } from "react";
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
import { AlertCircle, Loader2, Eye, EyeOff, Store } from "lucide-react";

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
    if (nextMerchantId) {
      setMerchantId(nextMerchantId);
    }
    if (nextEmail) {
      setEmail(nextEmail);
    }
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
        // Map known error codes; fall back to a friendly Arabic message
        // Never show raw API messages like "غير مصرح." or English text
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
        // Wait a moment for session to be established, then check role
        // This prevents the double-click issue
        await new Promise((resolve) => setTimeout(resolve, 100));
        const session = await getSession();

        // Redirect based on role
        // ADMIN goes to admin dashboard (system admin only)
        // OWNER, MANAGER, STAFF go to merchant dashboard
        const targetUrl =
          session?.user?.role === "ADMIN" &&
          session?.user?.merchantId === "system"
            ? "/admin/dashboard"
            : callbackUrl;

        // Keep client-side routing for immediate transition, then force full
        // navigation so the server picks up fresh auth session state.
        router.push(targetUrl);
        if (process.env.NODE_ENV !== "test") {
          window.location.href = targetUrl;
        }
        return; // Don't call setIsLoading(false) since we're navigating away
      }
    } catch (err) {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary-600 flex items-center justify-center">
            <Store className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl">تسجيل الدخول</CardTitle>
          <CardDescription>أدخل بياناتك للوصول إلى لوحة التحكم</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {successMessage && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 text-green-700 text-sm">
                <span>{successMessage}</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="merchantId">رقم المتجر</Label>
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
              <Label htmlFor="email">البريد الإلكتروني</Label>
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
              <Label htmlFor="password">كلمة المرور</Label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <Link
                href="/forgot-password"
                className="text-primary-600 hover:underline"
              >
                نسيت كلمة المرور؟
              </Link>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
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
              <Link href="/signup" className="text-primary-600 hover:underline">
                تواصل معنا
              </Link>
            </div>
          </form>

          {/* Demo credentials hint — click any value to auto-fill */}
          {process.env.NODE_ENV === "development" && (
            <div className="mt-6 p-3 bg-muted rounded-md text-xs text-muted-foreground">
              <p className="font-semibold mb-1">
                بيانات تجريبية (اضغط للملء التلقائي):
              </p>
              <button
                type="button"
                className="block w-full text-right hover:text-foreground transition-colors py-0.5 cursor-pointer"
                onClick={() => {
                  setMerchantId("demo-merchant");
                  setEmail("demo@tash8eel.com");
                  setPassword("demo123");
                }}
              >
                <span className="text-muted-foreground">المتجر: </span>
                <span className="text-primary underline">demo-merchant</span>
                <span className="text-muted-foreground"> · البريد: </span>
                <span className="text-primary underline">
                  demo@tash8eel.com
                </span>
                <span className="text-muted-foreground"> · كلمة المرور: </span>
                <span className="text-primary underline">demo123</span>
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Loading fallback for Suspense
function LoginFormSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary-600 flex items-center justify-center">
            <Store className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl">تسجيل الدخول</CardTitle>
          <CardDescription>أدخل بياناتك للوصول إلى لوحة التحكم</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-10 bg-muted animate-pulse rounded-md" />
            <div className="h-10 bg-muted animate-pulse rounded-md" />
            <div className="h-10 bg-muted animate-pulse rounded-md" />
            <div className="h-10 bg-muted animate-pulse rounded-md" />
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
