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
    accessToken: string;
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
    accessTokenExpires: number;
    error?: string;
    requiresPasswordChange?: boolean;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// Demo users — ONLY available in development mode
// In production (NODE_ENV=production), demo login is completely disabled
const IS_DEV = process.env.NODE_ENV !== "production";
const DEMO_USERS = IS_DEV
  ? [
      {
        id: "demo-owner-001",
        email: "demo@tash8eel.com",
        password: "demo123",
        name: "صاحب المتجر",
        role: "OWNER",
        merchantId: "demo-merchant",
      },
      {
        id: "demo-admin-001",
        email: "admin@tash8eel.com",
        password: "Admin123!",
        name: "مدير النظام",
        role: "ADMIN",
        merchantId: "system",
      },
      {
        id: "demo-staff-001",
        email: "staff@demo-merchant.com",
        password: "Staff123!",
        name: "موظف المبيعات",
        role: "AGENT",
        merchantId: "demo-merchant",
      },
    ]
  : []; // Empty in production — no backdoor

async function refreshAccessToken(token: any) {
  if (
    token?.accessToken?.startsWith("demo-token-") ||
    token?.refreshToken?.startsWith("demo-refresh-")
  ) {
    return {
      ...token,
      accessTokenExpires: Date.now() + 14 * 60 * 1000,
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

        // Demo authentication — only in development (DEMO_USERS is [] in production)
        const demoUser = DEMO_USERS.find(
          (u) =>
            u.email === credentials.email &&
            u.password === credentials.password &&
            (!credentials.merchantId ||
              u.merchantId === credentials.merchantId),
        );

        if (demoUser) {
          console.warn(
            "[AUTH] ⚠️ Demo login used — this is disabled in production",
          );
          return {
            id: demoUser.id,
            email: demoUser.email,
            name: demoUser.name,
            role: demoUser.role,
            merchantId: demoUser.merchantId,
            accessToken: `demo-token-${Date.now()}`,
            refreshToken: `demo-refresh-${Date.now()}`,
            requiresPasswordChange: false,
          };
        }

        // If not a demo user, try the real API
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
            requiresPasswordChange: !!data.requiresPasswordChange,
          };
        } catch (error) {
          console.error("Auth error:", error);
          // If it's a network error (API not running), show friendly message
          if (error instanceof TypeError && error.message.includes("fetch")) {
            throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
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
          requiresPasswordChange: user.requiresPasswordChange,
          accessTokenExpires: Date.now() + 14 * 60 * 1000, // 14 minutes
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
      session.accessToken = String(token.accessToken ?? "");
      session.error = token.error;
      session.requiresPasswordChange = token.requiresPasswordChange;
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

  secret: process.env.NEXTAUTH_SECRET,
};
