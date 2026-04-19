"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  ArrowUpLeft,
  BarChart3,
  Bot,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  ShoppingCart,
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
        <section className="app-auth-panel hidden lg:flex lg:flex-col lg:justify-between">
          <div className="space-y-8">
            <span className="app-auth-kicker">
              <Sparkles className="h-4 w-4" />
              Merchant Operating System
            </span>
            <div className="space-y-4">
              <h1 className="app-auth-title">تشغيل AI</h1>
              <p className="app-auth-copy">
                منصة التشغيل الذكية للمتاجر والمطاعم. المحادثات، الطلبات،
                الكاشير، والتقارير في مساحة عربية واحدة واضحة وسريعة.
              </p>
            </div>
            <div className="app-auth-feature-list">
              <div className="app-auth-feature">
                <Bot className="h-4 w-4" />
                <span>ذكاء اصطناعي على واتساب وإنستاجرام</span>
              </div>
              <div className="app-auth-feature">
                <ShoppingCart className="h-4 w-4" />
                <span>كاشير وإدارة طلبات متكاملة</span>
              </div>
              <div className="app-auth-feature">
                <BarChart3 className="h-4 w-4" />
                <span>تقارير ذكية وتحليلات فورية</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] tracking-[0.16em] text-[var(--text-muted)]">
            MERCHANT OPERATING SYSTEM
          </p>
        </section>

        <section className="app-auth-form-shell">
          <div className="app-auth-card">
            <div className="space-y-6 p-8 sm:p-10">
              <div className="app-auth-form-head">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--accent-gold)]">
                  <Store className="h-7 w-7" />
                </div>
                <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">
                  تسجيل الدخول
                </h1>
                <p className="text-sm leading-7 text-[var(--text-secondary)]">
                  أدخل بيانات متجرك للوصول إلى لوحة التحكم ومساحة العمل
                  التشغيلية.
                </p>
              </div>

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
                    placeholder="example@email.com"
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
                      className="pr-10 text-right [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
                      dir="rtl"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[10px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)]"
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
                  <span className="text-[var(--text-secondary)]">
                    استخدم حساب المتجر للوصول إلى الفريق والبيانات التشغيلية.
                  </span>
                  <Link
                    href="/forgot-password"
                    className="font-semibold text-[var(--accent-gold)] hover:underline"
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

                <div className="text-center text-sm text-[var(--text-secondary)]">
                  <span>ليس لديك حساب؟ </span>
                  <Link
                    href="/signup"
                    className="font-semibold text-[var(--accent-gold)] hover:underline"
                  >
                    إنشاء حساب
                  </Link>
                </div>
              </form>

              {process.env.NODE_ENV === "development" && (
                <div className="rounded-[14px] border border-[var(--border-default)] bg-[var(--bg-surface-2)] p-4 text-xs text-[var(--text-secondary)]">
                  <p className="mb-2 font-semibold text-[var(--text-primary)]">
                    بيانات تجريبية
                  </p>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 rounded-[12px] border border-transparent px-3 py-3 text-right transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)]"
                    onClick={() => {
                      setMerchantId("demo-merchant");
                      setEmail("demo@tash8eel.com");
                      setPassword("demo123");
                    }}
                  >
                    <span className="space-y-1">
                      <span className="block">
                        المتجر:{" "}
                        <span className="font-semibold text-[var(--accent-gold)]">
                          demo-merchant
                        </span>
                      </span>
                      <span className="block">
                        البريد:{" "}
                        <span className="font-semibold text-[var(--accent-gold)]">
                          demo@tash8eel.com
                        </span>
                      </span>
                      <span className="block">
                        كلمة المرور:{" "}
                        <span className="font-semibold text-[var(--accent-gold)]">
                          demo123
                        </span>
                      </span>
                    </span>
                    <ArrowUpLeft className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--accent-gold)]" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <section className="app-auth-panel hidden lg:block" />
        <section className="app-auth-form-shell">
          <div className="app-auth-card max-w-md p-8">
            <div className="space-y-4">
              <div className="assistant-skeleton h-11 rounded-[14px]" />
              <div className="assistant-skeleton h-11 rounded-[14px]" />
              <div className="assistant-skeleton h-11 rounded-[14px]" />
              <div className="assistant-skeleton h-11 rounded-[14px]" />
            </div>
          </div>
        </section>
      </div>
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
