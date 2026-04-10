import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeBaseUrl = (value?: string) =>
  (value || "").trim().replace(/\/+$/, "");

const API_BASE_URL =
  normalizeBaseUrl(process.env.API_BASE_URL) ||
  normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL) ||
  (process.env.NODE_ENV === "production"
    ? "http://api:3000"
    : "http://localhost:3000");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const forwardRequest = async (request: NextRequest) => {
  if (!API_BASE_URL) {
    return NextResponse.json(
      { message: "API base URL is not configured" },
      { status: 500 },
    );
  }

  const targetUrl = `${API_BASE_URL}${request.nextUrl.pathname}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);

  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    responseHeaders.delete(header);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
};

export async function GET(request: NextRequest) {
  return forwardRequest(request);
}

export async function POST(request: NextRequest) {
  return forwardRequest(request);
}

export async function PUT(request: NextRequest) {
  return forwardRequest(request);
}

export async function PATCH(request: NextRequest) {
  return forwardRequest(request);
}

export async function DELETE(request: NextRequest) {
  return forwardRequest(request);
}

export async function HEAD(request: NextRequest) {
  return forwardRequest(request);
}

export async function OPTIONS(request: NextRequest) {
  return forwardRequest(request);
}
