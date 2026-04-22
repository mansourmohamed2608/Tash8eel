"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/ui/alerts";
import { ShieldCheck } from "lucide-react";

export default function PaymentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="المدفوعات"
        description="إدارة مسارات التحقق اليدوي، ومراجعة الإثباتات بدل روابط الدفع المباشرة."
      />

      <div className="flex flex-wrap gap-2">
        {[
          ["روابط الدفع", "متوقفة"],
          ["المسار النشط", "إثباتات الدفع"],
          ["المراجعة", "يدوية + OCR"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex h-8 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-surface-2)] px-3 text-xs"
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono text-[var(--color-brand-primary)]">
              {value}
            </span>
          </div>
        ))}
      </div>

      <AlertBanner
        type="warning"
        title="تم إيقاف روابط الدفع"
        message="لأسباب تتعلق بمكافحة الاحتيال والتحقق اليدوي، لم تعد روابط الدفع متاحة داخل النظام."
      />

      <Card className="app-data-card">
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            يتم استخدام OCR فقط للمساعدة في استخراج بيانات إثبات الدفع ورصد
            المخاطر. كل إثبات يحتاج مراجعة فعلية قبل اعتماده.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/merchant/payments/proofs">
                <ShieldCheck className="ml-2 h-4 w-4" />
                افتح مراجعة إثباتات الدفع
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/merchant/payments/cod">
                راجع التحصيل عند الاستلام
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
