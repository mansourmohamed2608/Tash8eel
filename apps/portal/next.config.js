/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  env: {
    API_BASE_URL: process.env.API_BASE_URL || "http://localhost:3000/api",
  },

  // Proxy API requests to backend
  async rewrites() {
    const apiUrl = process.env.API_BASE_URL || "http://localhost:3000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
      {
        source: "/api/internal/:path*",
        destination: `${apiUrl}/api/internal/:path*`,
      },
      {
        source: "/api/merchants/:path*",
        destination: `${apiUrl}/api/merchants/:path*`,
      },
      {
        source: "/api/admin/:path*",
        destination: `${apiUrl}/api/admin/:path*`,
      },
      {
        source: "/health",
        destination: `${apiUrl}/health`,
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
          // Strict CSP in production
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Content-Security-Policy",
                  value:
                    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' " +
                    (process.env.NEXT_PUBLIC_API_URL || ""),
                },
              ]
            : []),
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
