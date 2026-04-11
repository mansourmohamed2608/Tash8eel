import type { Metadata } from "next";
import { Cairo, IBM_Plex_Sans_Arabic, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/providers/auth-provider";
import { Toaster } from "@/components/ui/toaster";

const headingFont = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["600", "700", "900"],
  display: "swap",
  variable: "--font-cairo",
});

const bodyFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-ibm-plex-arabic",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Tash8eel AI",
  description:
    "تشغيل AI - منصة تشغيل ذكية للمطاعم والمقاهي ومتاجر التجزئة في مصر",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head />
      <body
        className={`${headingFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
      >
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
