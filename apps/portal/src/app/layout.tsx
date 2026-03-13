import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/providers/auth-provider";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Tash8eel - لوحة التحكم",
  description:
    "منصة التجارة الإلكترونية الذكية للشركات الصغيرة والمتوسطة في مصر",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the per-request nonce injected by middleware.ts.
  // This is forwarded to any <Script> or inline <script> components so
  // the browser's CSP allows execution without 'unsafe-inline'.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="ar" dir="rtl">
      {/* Pass nonce to <head> so that any inline scripts Next.js may inject
          during SSR hydration are authorised by the CSP nonce directive. */}
      <head>
        {nonce && (
          <meta
            httpEquiv="Content-Security-Policy"
            content={`script-src 'nonce-${nonce}'`}
          />
        )}
      </head>
      <body>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
