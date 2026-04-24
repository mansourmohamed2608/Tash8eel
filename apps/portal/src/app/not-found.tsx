import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4 text-center">
      <div className="space-y-2">
        <p className="text-7xl font-bold text-primary-600">404</p>
        <p className="text-xl font-semibold text-foreground">الصفحة غير موجودة</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          الرابط الذي أدخلته غير صحيح أو تم نقل هذه الصفحة.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild variant="default">
          <Link href="/merchant/dashboard">لوحة التحكم</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/login">تسجيل الدخول</Link>
        </Button>
      </div>
    </div>
  );
}
