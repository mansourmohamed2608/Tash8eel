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

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const useSecureCookies = process.env.NODE_ENV === "production";
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

async function refreshAccessToken(token: any) {
  if (!API_URL) {
    return {
      ...token,
      error: "RefreshAccessTokenError",
      accessTokenExpires: Date.now() + 5 * 60 * 1000,
    };
  }

  if (!token?.refreshToken) {
    return {
      ...token,
      error: "RefreshAccessTokenError",
      accessTokenExpires: Date.now() + 5 * 60 * 1000,
    };
  }

  try {
    const response = await fetch(`${API_URL}/api/v1/staff/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
    });

    const contentType = response.headers.get("content-type") || "";
    const refreshedTokens = contentType.includes("application/json")
      ? await response.json()
      : { message: await response.text() };

    if (!response.ok) {
      throw refreshedTokens;
    }

    if (!refreshedTokens?.accessToken) {
      throw new Error("Missing access token in refresh response");
    }

    return {
      ...token,
      accessToken: refreshedTokens.accessToken,
      refreshToken: refreshedTokens.refreshToken ?? token.refreshToken,
      accessTokenExpires: Date.now() + 14 * 60 * 1000, // 14 minutes
      error: undefined, // clear any previous error on successful refresh
    };
  } catch (error) {
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

        if (!API_URL) {
          throw new Error("NEXT_PUBLIC_API_URL is not configured");
        }

        try {
          const response = await fetch(`${API_URL}/api/v1/staff/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
              merchantId: credentials.merchantId,
            }),
          });

          const data = await response.json();

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
