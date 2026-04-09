"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/ui/alerts";
import { ShieldCheck } from "lucide-react";

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="المدفوعات"
        description="تم إيقاف روابط الدفع. استخدم مراجعة إثباتات الدفع بدلًا منها."
      />

      <AlertBanner
        type="warning"
        title="تم إيقاف روابط الدفع"
        message="لأسباب تتعلق بمكافحة الاحتيال والتحقق اليدوي، لم تعد روابط الدفع متاحة داخل النظام."
      />

      <Card>
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
