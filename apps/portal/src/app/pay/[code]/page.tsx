import Link from "next/link";

export default function PublicPaymentLinkPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-semibold">Payment links are no longer available</h1>
      <p className="text-sm text-muted-foreground">
        This payment method has been removed. Please contact the merchant through WhatsApp and submit payment proof for manual verification.
      </p>
      <Link href="/" className="text-sm underline">
        Back to home
      </Link>
    </main>
  );
}
