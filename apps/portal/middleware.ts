/**
 * middleware.ts
 *
 * Generates a per-request cryptographic nonce and injects it into the
 * Content-Security-Policy header, eliminating the need for 'unsafe-inline'
 * and 'unsafe-eval' in script-src.
 *
 * How it works:
 *   1. A fresh nonce (base64-encoded UUID) is generated for every request.
 *   2. The nonce is forwarded as the x-nonce request header so that
 *      layout.tsx can read it via next/headers and pass it to <Script> tags.
 *   3. The full CSP string is set on the *response* headers, overriding the
 *      static CSP configured in next.config.js for production.
 *
 * Note: static assets (_next/static, images, favicon) are excluded from the
 * matcher — they do not need a CSP nonce and bypassing them avoids unnecessary
 * middleware overhead.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Build the connect-src directive — include the API URL if set.
  const connectSrc = [
    "'self'",
    process.env.NEXT_PUBLIC_API_URL || "",
    // Add WebSocket origins for hot-reload in staging (non-production builds)
    process.env.NODE_ENV !== "production" ? "ws://localhost:*" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const cspParts = [
    "default-src 'self'",
    // Keep nonce support for inline scripts while explicitly allowing
    // same-origin chunk files emitted by Next.js.
    `script-src 'self' 'nonce-${nonce}'`,
    `script-src-elem 'self' 'nonce-${nonce}'`,
    // Inline styles are still needed for CSS-in-JS / Radix UI animations.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src ${connectSrc}`,
    // Prevent embedding this page in an iframe.
    "frame-ancestors 'none'",
    // Only allow form submissions to the same origin.
    "form-action 'self'",
    // Block <object>, <embed>, <applet>.
    "object-src 'none'",
    // Restrict base URIs to the same origin.
    "base-uri 'self'",
  ];

  const cspHeader = cspParts.join("; ");

  // Forward the nonce to server components via a request header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Also forward the final CSP so server components can read it if needed.
  requestHeaders.set("x-csp", cspHeader);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set the CSP on the response.
  response.headers.set("Content-Security-Policy", cspHeader);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static  (static files like JS/CSS bundles)
     *  - _next/image   (Next.js image optimisation)
     *  - favicon.ico
     *  - api/auth      (NextAuth internal routes — must not be intercepted)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|api/auth).*)",
  ],
};
