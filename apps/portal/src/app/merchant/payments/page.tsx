"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/ui/alerts";
import { ShieldCheck } from "lucide-react";

export default function PaymentsPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Payments"
        description="Payment links have been removed. Use proof verification workflow."
      />

      <AlertBanner
        type="warning"
        title="Payment links removed"
        message="For fraud control and manual verification, payment links are no longer available."
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            OCR is used only to assist payment proof extraction and risk flags. Every proof requires review.
          </p>

          <Button asChild>
            <Link href="/merchant/payments/proofs">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Open Payment Proof Verification
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
