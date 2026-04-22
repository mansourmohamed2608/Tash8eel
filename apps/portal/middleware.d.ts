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
export declare function middleware(request: NextRequest): NextResponse<unknown>;
export declare const config: {
  matcher: string[];
};
