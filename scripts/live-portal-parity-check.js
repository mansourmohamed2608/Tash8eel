const DEFAULT_BASE_URL =
  process.env.PORTAL_BASE_URL ||
  process.env.API_BASE_URL ||
  "https://158-220-100-133.nip.io";

const MERCHANT_CREDS = {
  merchantId: process.env.PORTAL_LIVE_MERCHANT_ID || "demo-merchant",
  email: process.env.PORTAL_LIVE_MERCHANT_EMAIL || "owner@tash8eel.com",
  password: process.env.PORTAL_LIVE_MERCHANT_PASSWORD || "Demo@1234",
};

const ADMIN_CREDS = {
  merchantId: process.env.PORTAL_LIVE_ADMIN_MERCHANT_ID || "system",
  email: process.env.PORTAL_LIVE_ADMIN_EMAIL || "admin@tash8eel.com",
  password: process.env.PORTAL_LIVE_ADMIN_PASSWORD || "Admin123!",
};

const SKU_LIKE_NAME = /^[A-Z0-9]{2,}(?:-[A-Z0-9]+)+$/;

function normalizeBaseUrl(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function apiUrl(path) {
  const base = normalizeBaseUrl(DEFAULT_BASE_URL);
  return `${base}${path.startsWith("/api/") ? path : `/api${path}`}`;
}

function roundMoney(value) {
  const amount = Number(value || 0);
  return Math.round(amount * 100) / 100;
}

function assertClose(label, values, tolerance = 1) {
  const normalized = values.map((entry) => ({
    source: entry.source,
    value: roundMoney(entry.value),
  }));
  const min = Math.min(...normalized.map((entry) => entry.value));
  const max = Math.max(...normalized.map((entry) => entry.value));
  if (max - min > tolerance) {
    throw new Error(
      `${label} mismatch: ${normalized.map((entry) => `${entry.source}=${entry.value}`).join(", ")}`,
    );
  }
  return normalized;
}

function formatError(error) {
  return String(error?.message || error);
}

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(apiUrl(path), {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `${method} ${path} => ${response.status} ${typeof data === "string" ? data : JSON.stringify(data)}`,
    );
  }

  return data;
}

async function login(creds) {
  const response = await request("/v1/staff/login", {
    method: "POST",
    body: creds,
  });
  const token = response?.tokens?.accessToken;
  if (!token) {
    throw new Error(`No access token returned for ${creds.email}`);
  }
  return { token, profile: response.staff };
}

function findSkuLikeNames(value, hits = []) {
  if (!value) return hits;

  if (Array.isArray(value)) {
    for (const item of value) findSkuLikeNames(item, hits);
    return hits;
  }

  if (typeof value !== "object") return hits;

  for (const [key, nested] of Object.entries(value)) {
    if (
      typeof nested === "string" &&
      /name/i.test(key) &&
      SKU_LIKE_NAME.test(nested)
    ) {
      hits.push(nested);
    } else {
      findSkuLikeNames(nested, hits);
    }
  }

  return hits;
}

async function runMerchantChecks() {
  const { token, profile } = await login(MERCHANT_CREDS);

  const [dashboard, analytics, cfo, kpis, forecast] = await Promise.all([
    request("/v1/portal/dashboard/stats?days=30", { token }),
    request("/v1/portal/analytics?days=30", { token }),
    request("/v1/portal/reports/cfo?period=month", { token }),
    request("/v1/kpis/revenue?days=30", { token }),
    request("/v1/portal/forecast/what-if", {
      method: "POST",
      token,
      body: { type: "pricing", params: { priceDeltaPct: 10 } },
    }),
  ]);

  const dashboardSummary = dashboard?.summary || dashboard || {};
  const analyticsSummary = analytics?.summary || analytics || {};
  const cfoSummary = cfo?.summary || cfo || {};
  const kpiSummary = kpis?.summary || kpis || {};

  const realizedRevenue = assertClose("realizedRevenue", [
    {
      source: "dashboard",
      value: dashboardSummary.realizedRevenue ?? dashboardSummary.totalRevenue,
    },
    {
      source: "analytics",
      value: analyticsSummary.realizedRevenue ?? analyticsSummary.totalRevenue,
    },
    {
      source: "cfo",
      value:
        cfoSummary.realizedRevenue ??
        cfoSummary.totalRevenue ??
        cfoSummary.revenue,
    },
    {
      source: "kpis",
      value: kpiSummary.realizedRevenue ?? kpiSummary.totalRevenue,
    },
  ]);

  const bookedSales = assertClose("bookedSales", [
    { source: "dashboard", value: dashboardSummary.bookedSales },
    { source: "analytics", value: analyticsSummary.bookedSales },
    { source: "cfo", value: cfoSummary.bookedSales },
    { source: "kpis", value: kpiSummary.bookedSales },
  ]);

  const pendingCollections = assertClose("pendingCollections", [
    { source: "dashboard", value: dashboardSummary.pendingCollections },
    { source: "analytics", value: analyticsSummary.pendingCollections },
    { source: "cfo", value: cfoSummary.pendingCollections },
    { source: "kpis", value: kpiSummary.pendingCollections },
  ]);

  const refundsAmount = assertClose("refundsAmount", [
    { source: "dashboard", value: dashboardSummary.refundsAmount },
    { source: "analytics", value: analyticsSummary.refundsAmount },
    { source: "cfo", value: cfoSummary.refundsAmount },
    { source: "kpis", value: kpiSummary.refundsAmount },
  ]);

  const skuLeakHits = [
    ...findSkuLikeNames(dashboard),
    ...findSkuLikeNames(analytics),
    ...findSkuLikeNames(cfo),
    ...findSkuLikeNames(kpis),
  ];

  if (skuLeakHits.length > 0) {
    throw new Error(
      `SKU-like names leaked into reporting payloads: ${[...new Set(skuLeakHits)].join(", ")}`,
    );
  }

  if (!forecast?.scenarioType) {
    throw new Error(
      "Forecast what-if pricing scenario did not return a scenarioType",
    );
  }

  return {
    merchantId: profile?.merchantId,
    email: profile?.email,
    parity: {
      realizedRevenue,
      bookedSales,
      pendingCollections,
      refundsAmount,
    },
    forecast: {
      scenarioType: forecast.scenarioType,
      baseline: roundMoney(forecast.baseline),
      projected: roundMoney(forecast.projected),
    },
  };
}

async function runAdminChecks() {
  const { token, profile } = await login(ADMIN_CREDS);
  const analytics = await request("/v1/admin/analytics?period=month", {
    token,
  });
  const realizedRevenue = roundMoney(
    analytics?.revenue?.realizedRevenue ??
      analytics?.revenue?.totalRevenue ??
      analytics?.summary?.realizedRevenue ??
      analytics?.summary?.totalRevenue,
  );

  return {
    merchantId: profile?.merchantId,
    email: profile?.email,
    realizedRevenue,
  };
}

(async () => {
  const result = {
    ok: true,
    baseUrl: normalizeBaseUrl(DEFAULT_BASE_URL),
    merchant: null,
    admin: null,
    errors: [],
  };

  try {
    result.merchant = await runMerchantChecks();
  } catch (error) {
    result.ok = false;
    result.errors.push({
      scope: "merchant",
      error: formatError(error),
    });
  }

  try {
    result.admin = await runAdminChecks();
  } catch (error) {
    result.ok = false;
    result.errors.push({
      scope: "admin",
      error: formatError(error),
    });
  }

  const output = JSON.stringify(result, null, 2);
  if (result.ok) {
    console.log(output);
  } else {
    console.error(output);
    process.exit(1);
  }
})();
