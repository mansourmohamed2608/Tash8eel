"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import portalApi from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
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

export default function ForceChangePasswordPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
    if (session && session.requiresPasswordChange === false) {
      router.replace("/merchant/dashboard");
    }
  }, [status, session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session?.user?.id) {
      toast({
        title: "خطأ",
        description: "تعذر تحديد المستخدم الحالي",
        variant: "destructive",
      });
      return;
    }

    if (!currentPassword || !newPassword) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال جميع الحقول",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "خطأ",
        description: "كلمات المرور غير متطابقة",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      await portalApi.changeStaffPassword({
        currentPassword,
        newPassword,
      });

      const result = await signIn("credentials", {
        email: session.user.email,
        password: newPassword,
        merchantId: session.user.merchantId,
        redirect: false,
      });

      if (result?.error) {
        toast({
          title: "تم تغيير كلمة المرور",
          description: "يرجى تسجيل الدخول مرة أخرى.",
        });
        router.replace("/login");
        return;
      }

      toast({ title: "تم التحديث", description: "تم تغيير كلمة المرور بنجاح" });
      router.replace("/merchant/dashboard");
    } catch (error: any) {
      const message = error?.message || "فشل تغيير كلمة المرور";
      toast({ title: "خطأ", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              تغيير كلمة المرور
            </CardTitle>
            <CardDescription>
              يجب تغيير كلمة المرور المؤقتة قبل متابعة استخدام النظام.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">كلمة المرور الحالية</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  dir="rtl"
                  autoComplete="off"
                  className="[&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  dir="rtl"
                  autoComplete="new-password"
                  className="[&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  dir="rtl"
                  autoComplete="new-password"
                  className="[&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جارٍ التحديث...
                  </>
                ) : (
                  "تحديث كلمة المرور"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
