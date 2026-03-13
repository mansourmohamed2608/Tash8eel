"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertBanner } from "@/components/ui/alerts";
import { ShieldCheck } from "lucide-react";

export default function VisionPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Vision OCR"
        description="General OCR has been removed from merchant features."
      />

      <AlertBanner
        type="warning"
        title="OCR scope changed"
        message="OCR is now only used in WhatsApp payment proof verification with risk scoring and manual review."
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            Product/medicine/general text OCR is no longer available in the portal.
          </p>

          <Button asChild>
            <Link href="/merchant/payments/proofs">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Go to Payment Proof Verification
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
