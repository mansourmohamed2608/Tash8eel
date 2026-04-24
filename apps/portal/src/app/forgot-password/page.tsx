"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { publicAuthApi } from "@/lib/client";

function ForgotPasswordForm() {
  const [merchantId, setMerchantId] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await publicAuthApi.requestPasswordReset(merchantId, email);
      setSuccess(true);
    } catch (err: any) {
      setError(
        err?.message || "حدث خطأ غير متوقع. حاول مرة أخرى.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="w-full max-w-md rounded-2xl sm:rounded-xl">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">
              تم إرسال رابط إعادة التعيين
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              إذا كان البريد الإلكتروني مسجلاً في النظام، ستصل رسالة خلال دقائق.
            </p>
          </div>
          <Link
            href="/login"
            className="block text-sm text-primary-600 hover:underline"
          >
            العودة لتسجيل الدخول
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md rounded-2xl sm:rounded-xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">نسيت كلمة المرور؟</CardTitle>
        <CardDescription>
          أدخل رقم المتجر والبريد الإلكتروني لإرسال رابط إعادة التعيين
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
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              className="text-right"
              dir="rtl"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري الإرسال...
              </>
            ) : (
              "إرسال رابط إعادة التعيين"
            )}
          </Button>

          <div className="text-center text-sm">
            <Link href="/login" className="text-primary-600 hover:underline">
              العودة لتسجيل الدخول
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 p-3 sm:p-4">
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
