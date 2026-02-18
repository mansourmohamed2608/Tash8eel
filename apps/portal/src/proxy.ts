import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// Role hierarchy: OWNER(100) > ADMIN(80) > MANAGER(60) > AGENT(40) > VIEWER(20)
const ROLE_LEVEL: Record<string, number> = {
  OWNER: 100,
  ADMIN: 80,
  MANAGER: 60,
  AGENT: 40,
  VIEWER: 20,
};

// Route restrictions: minRole required to access each route group
const ROUTE_RESTRICTIONS: Array<{ paths: string[]; minRole: string }> = [
  // Team management - OWNER only
  { paths: ["/merchant/team"], minRole: "OWNER" },
  // Settings, Webhooks, Integrations, Audit - OWNER & ADMIN only
  {
    paths: [
      "/merchant/settings",
      "/merchant/webhooks",
      "/merchant/integrations",
      "/merchant/audit",
    ],
    minRole: "ADMIN",
  },
];

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/signup",
  "/pay",
];

function hasAccess(userRole: string | undefined, minRole: string): boolean {
  const userLevel = ROLE_LEVEL[userRole || ""] ?? 0;
  const requiredLevel = ROLE_LEVEL[minRole] ?? 100;
  return userLevel >= requiredLevel;
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow NextAuth API routes (session, csrf, signin, signout, etc.)
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Always allow other API routes (backend proxy handles auth)
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Always allow public routes
  if (
    pathname === "/" ||
    PUBLIC_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + "/"),
    )
  ) {
    return NextResponse.next();
  }

  // Always allow static assets and health check
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/health"
  ) {
    return NextResponse.next();
  }

  // For protected routes, check for a valid JWT token
  const token = await getToken({
    req: req as any,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    // Not authenticated — redirect to login
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const userRole = token.role as string | undefined;

  // Admin routes - require OWNER or ADMIN role
  if (pathname.startsWith("/admin")) {
    if (!hasAccess(userRole, "ADMIN")) {
      return NextResponse.redirect(new URL("/merchant/dashboard", req.url));
    }
  }

  // Check route restrictions based on permissions matrix
  if (pathname.startsWith("/merchant/")) {
    for (const restriction of ROUTE_RESTRICTIONS) {
      const isRestricted = restriction.paths.some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
      );
      if (isRestricted && !hasAccess(userRole, restriction.minRole)) {
        return NextResponse.redirect(new URL("/merchant/dashboard", req.url));
      }
    }
  }

  // If access token refresh failed, redirect to login
  if (token?.error === "RefreshAccessTokenError") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
