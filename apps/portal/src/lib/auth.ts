import { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

// Extend the User type to include our custom fields
declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    merchantId: string;
    accessToken: string;
    refreshToken: string;
    adminKey?: string;
    requiresPasswordChange?: boolean;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      merchantId: string;
    };
    accessToken?: string;
    refreshToken?: string;
    adminKey?: string;
    error?: string;
    requiresPasswordChange?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    name: string;
    role: string;
    merchantId: string;
    accessToken: string;
    refreshToken: string;
    adminKey?: string;
    accessTokenExpires: number;
    error?: string;
    requiresPasswordChange?: boolean;
  }
}

const normalizeBaseUrl = (value?: string) => (value || "").replace(/\/+$/, "");

const API_PATH_PREFIXES = ["/api/v1", "/v1"] as const;

const buildApiBaseCandidates = (): string[] => {
  const candidates: string[] = [];

  const add = (raw?: string) => {
    const value = normalizeBaseUrl(raw);
    if (!value) return;

    if (!candidates.includes(value)) {
      candidates.push(value);
    }

    if (value.endsWith("/api")) {
      const stripped = normalizeBaseUrl(value.slice(0, -4));
      if (stripped && !candidates.includes(stripped)) {
        candidates.push(stripped);
      }
    }
  };

  add(process.env.API_BASE_URL);
  add(process.env.NEXT_PUBLIC_API_URL);
  add(
    process.env.NODE_ENV === "production"
      ? "http://api:3000"
      : "http://localhost:3000",
  );

  return candidates;
};

const API_URL =
  normalizeBaseUrl(process.env.API_BASE_URL) ||
  normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL) ||
  (process.env.NODE_ENV === "production"
    ? "http://api:3000"
    : "http://localhost:3000");
const useSecureCookies = process.env.NODE_ENV === "production";
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

type RefreshResultCacheEntry = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpires: number;
  cachedAt: number;
};

// Mitigate refresh-token rotation races by briefly caching successful
// refresh results keyed by the previous refresh token.
const RECENT_REFRESH_CACHE_TTL_MS = 60_000;
const recentRefreshByPreviousToken = new Map<string, RefreshResultCacheEntry>();

const getRecentRefreshResult = (
  previousRefreshToken: string,
): RefreshResultCacheEntry | null => {
  const cached = recentRefreshByPreviousToken.get(previousRefreshToken);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > RECENT_REFRESH_CACHE_TTL_MS) {
    recentRefreshByPreviousToken.delete(previousRefreshToken);
    return null;
  }
  return cached;
};

const setRecentRefreshResult = (
  previousRefreshToken: string,
  next: Omit<RefreshResultCacheEntry, "cachedAt">,
) => {
  recentRefreshByPreviousToken.set(previousRefreshToken, {
    ...next,
    cachedAt: Date.now(),
  });
};

const postJsonWithFallback = async (
  route: string,
  body: Record<string, unknown>,
): Promise<{ response: Response; data: any }> => {
  const errors: unknown[] = [];

  for (const base of buildApiBaseCandidates()) {
    for (const prefix of API_PATH_PREFIXES) {
      const url = `${base}${prefix}${route}`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
          ? await response.json().catch(() => ({ message: "API Error" }))
          : { message: await response.text() };

        // Try next candidate for route-mismatch 404s.
        if (response.status === 404) {
          errors.push({ url, status: response.status, data });
          continue;
        }

        return { response, data };
      } catch (error) {
        errors.push({ url, error });
      }
    }
  }

  const last = errors.at(-1);
  if (last && typeof last === "object" && "error" in last) {
    throw (last as { error: unknown }).error;
  }

  return {
    response: new Response(JSON.stringify({ message: "API Error" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
    data: { message: "الخدمة المطلوبة غير متاحة حالياً." },
  };
};

async function refreshAccessToken(token: any) {
  if (!token?.refreshToken) {
    return {
      ...token,
      error: "RefreshAccessTokenError",
      accessTokenExpires: Date.now() + 5 * 60 * 1000,
    };
  }

  const previousRefreshToken = String(token.refreshToken);
  const cachedRefresh = getRecentRefreshResult(previousRefreshToken);
  if (cachedRefresh) {
    return {
      ...token,
      accessToken: cachedRefresh.accessToken,
      refreshToken: cachedRefresh.refreshToken,
      accessTokenExpires: cachedRefresh.accessTokenExpires,
      error: undefined,
    };
  }

  try {
    const { response, data: refreshedTokens } = await postJsonWithFallback(
      "/staff/refresh",
      {
        refreshToken: token.refreshToken,
      },
    );

    if (!response.ok) {
      throw refreshedTokens;
    }

    if (!refreshedTokens?.accessToken) {
      throw new Error("Missing access token in refresh response");
    }

    const nextRefreshToken =
      typeof refreshedTokens.refreshToken === "string" &&
      refreshedTokens.refreshToken.length > 0
        ? refreshedTokens.refreshToken
        : previousRefreshToken;

    const refreshed = {
      ...token,
      accessToken: refreshedTokens.accessToken,
      refreshToken: nextRefreshToken,
      accessTokenExpires: Date.now() + 14 * 60 * 1000, // 14 minutes
      error: undefined, // clear any previous error on successful refresh
    };

    setRecentRefreshResult(previousRefreshToken, {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accessTokenExpires: refreshed.accessTokenExpires,
    });

    return refreshed;
  } catch (error) {
    const fallback = getRecentRefreshResult(previousRefreshToken);
    if (fallback) {
      return {
        ...token,
        accessToken: fallback.accessToken,
        refreshToken: fallback.refreshToken,
        accessTokenExpires: fallback.accessTokenExpires,
        error: undefined,
      };
    }

    console.error("Error refreshing access token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
      accessTokenExpires: Date.now() + 5 * 60 * 1000, // backoff to avoid tight retry loop
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        merchantId: { label: "Merchant ID", type: "text" },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("البريد الإلكتروني وكلمة المرور مطلوبان");
        }

        try {
          const { response, data } = await postJsonWithFallback(
            "/staff/login",
            {
              email: credentials.email,
              password: credentials.password,
              merchantId: credentials.merchantId,
            },
          );

          if (!response.ok) {
            // Always use a consistent, user-friendly Arabic message for auth failures
            // to avoid leaking sanitized/English API error text like "غير مصرح."
            if (response.status === 401 || response.status === 403) {
              throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
            }
            throw new Error(
              data.message || "البريد الإلكتروني أو كلمة المرور غير صحيحة",
            );
          }

          return {
            id: data.staff.id,
            email: data.staff.email,
            name: data.staff.name,
            role: data.staff.role,
            merchantId: data.staff.merchantId,
            accessToken: data.tokens.accessToken,
            refreshToken: data.tokens.refreshToken,
            adminKey:
              typeof data.adminKey === "string" ? data.adminKey : undefined,
            requiresPasswordChange: false,
          };
        } catch (error) {
          console.error("Auth error:", error);
          // Network error (API not reachable / restarting)
          if (
            error instanceof TypeError &&
            (error.message.includes("fetch") ||
              (error as any)?.cause?.code === "ECONNREFUSED")
          ) {
            throw new Error(
              "تعذر الاتصال بالخادم. تأكد من تشغيل الخادم وأعد المحاولة.",
            );
          }
          // Re-throw if it's our custom error message
          if (error instanceof Error) {
            throw new Error(
              error.message || "البريد الإلكتروني أو كلمة المرور غير صحيحة",
            );
          }
          throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        return {
          ...token,
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          merchantId: user.merchantId,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          adminKey: user.adminKey,
          requiresPasswordChange: false,
          accessTokenExpires: Date.now() + 14 * 60 * 1000, // 14 minutes
          error: undefined, // clear any stale error from a previous session
        };
      }

      const expiresAt =
        typeof token.accessTokenExpires === "number"
          ? token.accessTokenExpires
          : 0;

      // Return previous token if the access token has not expired
      if (expiresAt > Date.now()) {
        return token;
      }

      // No refresh token available, force re-auth rather than throwing
      if (!token.refreshToken) {
        return {
          ...token,
          error: "RefreshAccessTokenError",
          accessTokenExpires: Date.now() + 5 * 60 * 1000,
        };
      }

      // Access token has expired, try to refresh
      return refreshAccessToken(token);
    },

    async session({ session, token }) {
      session.user = {
        id: String(token.id ?? ""),
        email: String(token.email ?? ""),
        name: String(token.name ?? ""),
        role: String(token.role ?? ""),
        merchantId: String(token.merchantId ?? ""),
      };
      session.accessToken =
        typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.refreshToken =
        typeof token.refreshToken === "string" ? token.refreshToken : undefined;
      session.adminKey =
        typeof token.adminKey === "string" ? token.adminKey : undefined;
      session.error = token.error;
      session.requiresPasswordChange = false;
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: `${cookiePrefix}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};
