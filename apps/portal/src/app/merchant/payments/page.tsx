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
        description="تم إيقاف روابط الدفع. استخدم مراجعة إثباتات الدفع بدلًا منها."
      />

      <section className="app-hero-band">
        <div className="app-hero-band__grid">
          <div>
            <p className="app-hero-band__eyebrow">مراجعة وتحكم</p>
            <h2 className="app-hero-band__title">
              المدفوعات تمر الآن عبر مراجعة إثباتات أكثر صرامة
            </h2>
            <p className="app-hero-band__copy">
              هذا المسار يوضح قرار المنصة الحالي: إيقاف الروابط المباشرة
              والاعتماد على التحقق اليدوي المدعوم باستخراج OCR لتقليل المخاطر.
            </p>
          </div>
          <div className="app-hero-band__metrics">
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">روابط الدفع</span>
              <strong className="app-hero-band__metric-value">متوقفة</strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">المسار البديل</span>
              <strong className="app-hero-band__metric-value">
                إثباتات الدفع
              </strong>
            </div>
            <div className="app-hero-band__metric">
              <span className="app-hero-band__metric-label">المراجعة</span>
              <strong className="app-hero-band__metric-value">
                يدوية + OCR
              </strong>
            </div>
          </div>
        </div>
      </section>

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

          <Button asChild>
            <Link href="/merchant/payments/proofs">
              <ShieldCheck className="ml-2 h-4 w-4" />
              افتح مراجعة إثباتات الدفع
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
