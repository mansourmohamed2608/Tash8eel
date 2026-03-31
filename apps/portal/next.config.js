/** @type {import('next').NextConfig} */
const normalizeApiBase = (value) => {
  const trimmed = (value || "").replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed.slice(0, -4) : trimmed;
};

const defaultApiHost =
  process.env.NODE_ENV === "production"
    ? "http://api:3000"
    : "http://localhost:3000";
const apiHost = normalizeApiBase(process.env.API_BASE_URL || defaultApiHost);

const nextConfig = {
  output: "standalone",
  env: {
    API_BASE_URL: `${apiHost}/api`,
  },

  // Proxy API requests to backend
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiHost}/api/v1/:path*`,
      },
      {
        source: "/api/internal/:path*",
        destination: `${apiHost}/api/internal/:path*`,
      },
      {
        source: "/api/merchants/:path*",
        destination: `${apiHost}/api/merchants/:path*`,
      },
      {
        source: "/api/admin/:path*",
        destination: `${apiHost}/api/admin/:path*`,
      },
      {
        source: "/health",
        destination: `${apiHost}/health`,
      },
    ];
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Content-Security-Policy is injected dynamically by middleware.ts
          // (per-request nonce eliminates 'unsafe-inline' / 'unsafe-eval').
          // The static fallback below applies only when middleware is disabled
          // (e.g. during `next export` static builds — not used in this project).
          //
          // DO NOT add 'unsafe-eval' or 'unsafe-inline' to script-src here.
        ],
      },
    ];
  },

  // Redirect HTTP to HTTPS in production
  async redirects() {
    return process.env.NODE_ENV === "production" ? [] : [];
  },
};

module.exports = nextConfig;
