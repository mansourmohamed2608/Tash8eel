import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const auth = NextAuth(authOptions);

type RouteContext = {
  params?: { nextauth?: string[] } | Promise<{ nextauth?: string[] }>;
};

function extractNextAuthParamsFromPath(request: Request): string[] {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const authIndex = parts.findIndex((part) => part === "auth");
  return authIndex >= 0 ? parts.slice(authIndex + 1) : [];
}

async function handler(request: Request, context?: RouteContext) {
  const resolvedParams = context?.params ? await context.params : undefined;
  const nextauth =
    Array.isArray(resolvedParams?.nextauth) &&
    resolvedParams.nextauth.length > 0
      ? resolvedParams.nextauth
      : extractNextAuthParamsFromPath(request);

  return auth(request as any, { params: { nextauth } } as any);
}

export { handler as GET, handler as POST };
