"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  BarChart3,
  Bot,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  ShoppingCart,
  Sparkles,
  Store,
} from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    businessName: "",
    email: "",
    password: "",
    phone: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const getErrorMessage = (payload: any) => {
    if (Array.isArray(payload?.message)) return payload.message.join("، ");
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    return "حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة مرة أخرى.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(getErrorMessage(payload));
        return;
      }

      router.push(
        `/login?signup=success&merchantId=${encodeURIComponent(
          payload?.merchantId || "",
        )}&email=${encodeURIComponent(payload?.email || formData.email)}`,
      );
    } catch {
      setError("حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة مرة أخرى.");
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
              Start your workspace
            </span>
            <div className="space-y-4">
              <h1 className="app-auth-title">ابدأ تشغيل نشاطك بواجهة واحدة</h1>
              <p className="app-auth-copy">
                أنشئ حساب المتجر وابدأ تشغيل المحادثات، الطلبات، الكاشير،
                والمخزون من مساحة واحدة مصممة للعربية من البداية.
              </p>
            </div>
            <div className="app-auth-feature-list">
              <div className="app-auth-feature">
                <Bot className="h-4 w-4" />
                <span>استقبال الطلبات والرد الآلي على القنوات المختلفة</span>
              </div>
              <div className="app-auth-feature">
                <ShoppingCart className="h-4 w-4" />
                <span>كاشير، عمليات، ومتابعة تنفيذ يومية</span>
              </div>
              <div className="app-auth-feature">
                <BarChart3 className="h-4 w-4" />
                <span>تقارير وإشعارات ذكية من أول يوم تشغيل</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            Merchant Operating System
          </p>
        </section>

        <section className="app-auth-form-shell">
          <div className="app-auth-card">
            <div className="space-y-6 p-8 sm:p-10">
              <div className="app-auth-form-head">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-[18px] border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-[var(--accent-gold)]">
                  <Store className="h-7 w-7" />
                </div>
                <h1 className="text-[24px] font-bold">إنشاء حساب جديد</h1>
                <p className="text-sm leading-7 text-[var(--text-secondary)]">
                  أدخل بيانات نشاطك لبدء التجربة المجانية.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="app-inline-note app-inline-note--error">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="businessName" className="app-input-label">
                      اسم المتجر / الشركة
                    </Label>
                    <Input
                      id="businessName"
                      type="text"
                      placeholder="مثال: متجر الأناقة"
                      value={formData.businessName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          businessName: e.target.value,
                        })
                      }
                      required
                      disabled={isLoading}
                      className="text-right"
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="app-input-label">
                      رقم الهاتف
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="05xxxxxxxx"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      required
                      disabled={isLoading}
                      className="text-right"
                      dir="rtl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="app-input-label">
                      البريد الإلكتروني
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="example@email.com"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
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
                    <Input
                      id="password"
                      type="password"
                      placeholder="8 أحرف على الأقل"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      required
                      disabled={isLoading}
                      className="text-right"
                      dir="rtl"
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      جاري إنشاء الحساب...
                    </>
                  ) : (
                    "إنشاء الحساب"
                  )}
                </Button>

                <div className="text-center text-sm text-[var(--text-secondary)]">
                  <span>لديك حساب بالفعل؟ </span>
                  <Link
                    href="/login"
                    className="font-semibold text-[var(--accent-gold)] hover:underline"
                  >
                    تسجيل الدخول
                  </Link>
                </div>
              </form>

              <div className="mt-6 border-t border-[var(--border-subtle)] pt-6">
                <p className="mb-4 text-center text-sm text-[var(--text-secondary)]">
                  أو تواصل معنا مباشرة
                </p>
                <div className="flex justify-center gap-6 text-sm">
                  <a
                    href="tel:+966500000000"
                    className="flex items-center gap-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    <Phone className="h-4 w-4" />
                    <span>اتصل بنا</span>
                  </a>
                  <a
                    href="mailto:support@tash8eel.com"
                    className="flex items-center gap-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    <Mail className="h-4 w-4" />
                    <span>راسلنا</span>
                  </a>
                  <a
                    href="https://wa.me/966500000000"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>واتساب</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
