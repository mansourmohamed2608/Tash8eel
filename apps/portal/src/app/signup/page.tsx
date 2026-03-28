"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Loader2,
  Store,
  Phone,
  Mail,
  MessageSquare,
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
    if (Array.isArray(payload?.message)) {
      return payload.message.join("، ");
    }
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
        headers: {
          "Content-Type": "application/json",
        },
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary-600 flex items-center justify-center">
            <Store className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl">إنشاء حساب جديد</CardTitle>
          <CardDescription>
            أدخل بيانات نشاطك لبدء التجربة المجانية
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="businessName">اسم المتجر / الشركة</Label>
                <Input
                  id="businessName"
                  type="text"
                  placeholder="مثال: متجر الأناقة"
                  value={formData.businessName}
                  onChange={(e) =>
                    setFormData({ ...formData, businessName: e.target.value })
                  }
                  required
                  disabled={isLoading}
                  className="text-right"
                  dir="rtl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">رقم الهاتف</Label>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
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
                <Label htmlFor="password">كلمة المرور</Label>
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

            <div className="text-center text-sm text-muted-foreground">
              <span>لديك حساب بالفعل؟ </span>
              <Link href="/login" className="text-primary-600 hover:underline">
                تسجيل الدخول
              </Link>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-muted-foreground text-center mb-4">
              أو تواصل معنا مباشرة
            </p>
            <div className="flex justify-center gap-6 text-sm">
              <a
                href="tel:+966500000000"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary-600 transition-colors"
              >
                <Phone className="h-4 w-4" />
                <span>اتصل بنا</span>
              </a>
              <a
                href="mailto:support@tash8eel.com"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary-600 transition-colors"
              >
                <Mail className="h-4 w-4" />
                <span>راسلنا</span>
              </a>
              <a
                href="https://wa.me/966500000000"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-muted-foreground hover:text-primary-600 transition-colors"
              >
                <MessageSquare className="h-4 w-4" />
                <span>واتساب</span>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
