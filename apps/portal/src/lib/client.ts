const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const getApiBaseUrl = () => {
  if (typeof window !== "undefined") {
    // Always use the Next.js proxy in browsers to avoid cross-origin CORS issues.
    return "/api";
  }

  const internalBase = normalizeBaseUrl(process.env.API_BASE_URL || "");
  if (internalBase) {
    return `${internalBase}/api`;
  }

  const publicBase = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL || "");
  if (publicBase) {
    return `${publicBase}/api`;
  }

  const fallbackBase = normalizeBaseUrl(
    process.env.NODE_ENV === "production"
      ? "http://api:3000"
      : "http://localhost:3000",
  );

  return `${fallbackBase}/api`;
};

// Connection status tracking
let lastConnectionStatus: "connected" | "disconnected" | "unknown" = "unknown";
let lastConnectionError: string | null = null;

// Prevent multiple concurrent 401s from each triggering their own redirect
let isSigningOut = false;

const sanitizeErrorMessage = (message: unknown, status?: number) => {
  if (message === undefined || message === null) return "";
  const safeMessage = typeof message === "string" ? message : String(message);
  const lower = safeMessage.toLowerCase();

  if (status === 401) {
    return "غير مصرح.";
  }

  const technicalErrorPatterns = [
    /cannot\s+(get|post|put|patch|delete)\s+\//i,
    /column\s+.+\s+does not exist/i,
    /relation\s+.+\s+does not exist/i,
    /invalid input syntax for type/i,
    /syntax error at or near/i,
    /duplicate key value violates unique constraint/i,
    /null value in column/i,
    /exceptionfilter/i,
    /unhandled exception/i,
    /stack/i,
    /<!doctype html>/i,
    /<html/i,
  ];

  if (technicalErrorPatterns.some((pattern) => pattern.test(safeMessage))) {
    return "حدث خطأ تقني أثناء تحميل البيانات. حاول مرة أخرى بعد قليل.";
  }

  if (status === 404) {
    return "الخدمة المطلوبة غير متاحة حالياً.";
  }

  if (status !== undefined && status >= 500) {
    return "حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.";
  }

  if (
    lower.includes("incorrect api key") ||
    lower.includes("invalid or missing api key") ||
    lower.includes("api key provided") ||
    lower.includes("openai")
  ) {
    return "تعذر الاتصال بخدمة الذكاء الاصطناعي حالياً. يمكنك شراء/ترقية حزمة الذكاء الاصطناعي ثم إعادة المحاولة.";
  }
  if (
    lower.includes("invalid or missing admin api key") ||
    lower.includes("forbidden")
  ) {
    return "غير مصرح.";
  }
  if (lower.includes("request entity too large")) {
    return "حجم الملف كبير جداً.";
  }
  if (lower.startsWith("api error") || lower.startsWith("http ")) {
    return "تعذر إكمال الطلب حالياً. حاول مرة أخرى.";
  }
  return safeMessage;
};

export function getConnectionStatus() {
  return { status: lastConnectionStatus, error: lastConnectionError };
}

interface FetchOptions extends RequestInit {
  apiKey?: string;
  adminKey?: string;
}

function buildApiAuthHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!apiKey) return headers;

  const looksLikeJwt = apiKey.split(".").length === 3;
  const isApiKeyFormat =
    apiKey.startsWith("tash8eel_") ||
    apiKey.startsWith("mkey_") ||
    apiKey.startsWith("mk_");

  if (apiKey.startsWith("demo-token-") || looksLikeJwt) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (isApiKeyFormat) {
    headers["x-api-key"] = apiKey;
  } else {
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

export async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const { apiKey, adminKey, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (apiKey) {
    const looksLikeJwt = apiKey.split(".").length === 3;
    const isApiKeyFormat =
      apiKey.startsWith("tash8eel_") ||
      apiKey.startsWith("mkey_") ||
      apiKey.startsWith("mk_");

    if (apiKey.startsWith("demo-token-") || looksLikeJwt) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (isApiKeyFormat) {
      headers["x-api-key"] = apiKey;
    } else {
      // Fallback to API key header for unknown formats
      headers["x-api-key"] = apiKey;
    }
  }
  if (adminKey) {
    headers["x-admin-api-key"] = adminKey;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "API Error" }));
      lastConnectionStatus = "connected"; // Server responded, just with an error

      // 401 = invalid/expired token → redirect to login
      if (response.status === 401 && typeof window !== "undefined") {
        if (!isSigningOut) {
          isSigningOut = true;
          window.location.href = "/login";
        }
        return new Promise(() => {}) as T; // never resolves, page is redirecting
      }

      // 503 = server/DB temporarily unavailable - do NOT sign the user out.
      // Throw a retryable error so the UI can show a friendly message.
      if (response.status === 503) {
        lastConnectionStatus = "disconnected";
        const msg = (error as any)?.message;
        throw new Error(
          typeof msg === "string" && msg
            ? sanitizeErrorMessage(msg, 503)
            : "الخادم غير متاح مؤقتاً. حاول مرة أخرى بعد لحظة.",
        );
      }

      const rawMessage = error.message || `HTTP ${response.status}`;
      throw new Error(sanitizeErrorMessage(rawMessage, response.status));
    }

    lastConnectionStatus = "connected";
    lastConnectionError = null;

    // Handle 204 No Content responses
    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    ) {
      return { success: true } as T;
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      lastConnectionStatus = "disconnected";
      lastConnectionError = "Could not connect to API server";
      throw new Error("تعذر الاتصال بالخادم حالياً. حاول مرة أخرى.");
    }
    if (error instanceof Error) {
      throw new Error(sanitizeErrorMessage(error.message));
    }
    throw new Error("تعذر إكمال الطلب حالياً. حاول مرة أخرى.");
  }
}

// Health check function
export async function checkApiHealth(): Promise<{
  healthy: boolean;
  message: string;
}> {
  try {
    const healthUrl = `${getApiBaseUrl().replace(/\/api$/, "")}/health`;
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      lastConnectionStatus = "connected";
      lastConnectionError = null;
      return { healthy: true, message: "API is connected" };
    }
    lastConnectionStatus = "disconnected";
    lastConnectionError = `API returned status ${response.status}`;
    return {
      healthy: false,
      message: `API returned status ${response.status}`,
    };
  } catch (error) {
    lastConnectionStatus = "disconnected";
    lastConnectionError =
      error instanceof Error ? error.message : "Connection failed";
    return { healthy: false, message: lastConnectionError };
  }
}

// Merchant API - Uses merchant portal endpoints with x-api-key
export const merchantApi = {
  // Merchant Context (for sidebar/feature flags)
  async getMe(apiKey: string) {
    return apiFetch<{
      id: string;
      name: string;
      category: string;
      enabledAgents: string[];
      enabledFeatures?: string[];
      plan: string;
      role: string;
      features: {
        inventory: boolean;
        reports: boolean;
        conversations: boolean;
        analytics: boolean;
        webhooks: boolean;
        team: boolean;
        audit: boolean;
        payments: boolean;
        vision: boolean;
        kpis: boolean;
        loyalty: boolean;
        voiceNotes: boolean;
        notifications: boolean;
        apiAccess: boolean;
      };
    }>("/v1/portal/me", { apiKey });
  },

  // Dashboard
  async getDashboardStats(merchantId: string, apiKey: string, days?: number) {
    const query =
      typeof days === "number" && Number.isFinite(days)
        ? `?days=${Math.trunc(days)}`
        : "";
    return apiFetch<{
      period?: {
        days: number;
        startDate: string;
        endDate: string;
      };
      stats: {
        totalOrders: number;
        ordersChange: number;
        totalRevenue: number;
        revenueChange: number;
        activeConversations: number;
        conversationsChange: number;
        pendingDeliveries: number;
        deliveriesChange: number;
      };
      revenueByDay: Array<{ name: string; value: number }>;
      ordersByDay: Array<{
        name: string;
        completed: number;
        pending: number;
        cancelled: number;
      }>;
      statusDistribution: Array<{ name: string; value: number; color: string }>;
      recentOrders: Array<{
        id: string;
        customer: string;
        total: number;
        status: string;
        createdAt: string;
      }>;
      premium?: {
        recoveredCarts: { count: number; revenue: number };
        deliveryFailures: {
          count: number;
          reasons: Array<{ reason: string; count: number }>;
        };
        financeSummary: {
          profitEstimate: number;
          codPending: number;
          spendingAlert: boolean;
          grossMargin: number;
        };
      };
    }>(`/v1/portal/dashboard/stats${query}`, { apiKey });
  },

  // PDF Export
  async exportPDFReport(
    merchantId: string,
    apiKey: string,
    period: string = "30days",
  ) {
    const headers: Record<string, string> = buildApiAuthHeaders(apiKey);
    const apiBaseUrl = getApiBaseUrl();

    const response = await fetch(
      `${apiBaseUrl}/v1/merchants/${merchantId}/analytics/pdf?period=${encodeURIComponent(period)}`,
      { headers },
    );
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        sanitizeErrorMessage(
          errorBody || `HTTP ${response.status}`,
          response.status,
        ),
      );
    }
    const blob = await response.blob();
    return blob;
  },

  // Settings
  async getSettings(apiKey: string) {
    return apiFetch<{
      business: {
        name: string;
        category: string;
        city: string;
        currency: string;
        language: string;
      };
      notifications: {
        whatsappReportsEnabled: boolean;
        reportPeriodsEnabled: string[];
        notificationPhone: string | null;
        paymentRemindersEnabled: boolean;
        lowStockAlertsEnabled: boolean;
      };
      preferences: {
        timezone: string;
        workingHours: { start: string; end: string };
        autoResponseEnabled: boolean;
        followupDelayMinutes: number;
      };
      payout?: {
        instapayAlias: string | null;
        vodafoneCashNumber: string | null;
        bankName: string | null;
        bankAccountNumber: string | null;
        bankIban: string | null;
        preferredPayoutMethod: string | null;
      };
    }>("/v1/portal/settings", { apiKey });
  },

  async updateSettings(
    apiKey: string,
    settings: {
      business?: { name?: string; category?: string; city?: string };
      notifications?: {
        whatsappReportsEnabled?: boolean;
        reportPeriodsEnabled?: string[];
        notificationPhone?: string | null;
        paymentRemindersEnabled?: boolean;
        lowStockAlertsEnabled?: boolean;
      };
      preferences?: {
        timezone?: string;
        autoResponseEnabled?: boolean;
        followupDelayMinutes?: number;
      };
      payout?: {
        instapayAlias?: string | null;
        vodafoneCashNumber?: string | null;
        bankName?: string | null;
        bankAccountNumber?: string | null;
        bankIban?: string | null;
        preferredPayoutMethod?: string | null;
      };
    },
  ) {
    return apiFetch<{ success: boolean; message: string }>(
      "/v1/portal/settings",
      {
        method: "PUT",
        apiKey,
        body: JSON.stringify(settings),
      },
    );
  },

  async getDeletionRequest(apiKey: string) {
    return apiFetch<{
      id: string;
      merchantId: string;
      requestedByStaffId: string;
      requestedAt: string;
      scheduledFor: string;
      status: "PENDING" | "CANCELLED" | "COMPLETED";
    } | null>("/v1/portal/account/delete-request", { apiKey });
  },

  async createDeletionRequest(apiKey: string) {
    return apiFetch<{
      requestId: string;
      scheduledFor: string;
      message: string;
    }>("/v1/portal/account/delete-request", {
      method: "POST",
      apiKey,
    });
  },

  async cancelDeletionRequest(apiKey: string, requestId: string) {
    return apiFetch<{ message: string }>(
      `/v1/portal/account/delete-request/${requestId}`,
      {
        method: "DELETE",
        apiKey,
      },
    );
  },

  async getOrders(
    merchantId: string,
    apiKey: string,
    filtersOrStatus?:
      | string
      | {
          status?: string;
          branchId?: string;
          source?: string;
          limit?: number;
          offset?: number;
        },
    branchIdArg?: string,
  ) {
    let status: string | undefined;
    let branchId: string | undefined;
    let source: string | undefined;
    let limit: number | undefined;
    let offset: number | undefined;

    if (typeof filtersOrStatus === "string" || filtersOrStatus === undefined) {
      status = filtersOrStatus;
      branchId = branchIdArg;
    } else {
      status = filtersOrStatus.status;
      branchId = filtersOrStatus.branchId;
      source = filtersOrStatus.source;
      limit = filtersOrStatus.limit;
      offset = filtersOrStatus.offset;
    }

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (branchId && branchId !== "all") params.set("branchId", branchId);
    if (source && source !== "all") params.set("source", source);
    if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
      params.set("limit", String(Math.floor(Number(limit))));
    }
    if (Number.isFinite(Number(offset)) && Number(offset) >= 0) {
      params.set("offset", String(Math.floor(Number(offset))));
    }

    const qs = params.toString();
    const url = `/v1/portal/orders${qs ? `?${qs}` : ""}`;
    return apiFetch<{ orders: any[]; total: number }>(url, { apiKey });
  },

  async createManualOrder(
    merchantId: string,
    apiKey: string,
    payload: {
      customerName: string;
      customerPhone: string;
      items: Array<{
        catalogItemId?: string;
        name?: string;
        quantity: number;
        unitPrice: number;
        notes?: string;
      }>;
      deliveryType: "delivery" | "pickup" | "dine_in";
      deliveryAddress?: string;
      paymentMethod: "cash" | "card" | "transfer";
      notes?: string;
      source: "manual" | "manual_button" | "cashier" | "calls";
    },
  ) {
    return apiFetch<any>("/v1/portal/orders", {
      method: "POST",
      apiKey,
      body: JSON.stringify(payload),
    });
  },

  async getCalls(
    merchantId: string,
    apiKey: string,
    options?: {
      limit?: number;
      offset?: number;
      handledBy?: string;
      status?: string;
    },
  ) {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.offset) params.set("offset", String(options.offset));
    if (options?.handledBy) params.set("handledBy", options.handledBy);
    if (options?.status) params.set("status", options.status);

    const qs = params.toString();
    const url = `/v1/portal/calls${qs ? `?${qs}` : ""}`;
    return apiFetch<{ calls: any[]; total: number }>(url, { apiKey });
  },

  async getCallStats(merchantId: string, apiKey: string, days = 1) {
    const safeDays = Math.max(1, Math.min(90, Number(days) || 1));
    return apiFetch<{
      periodDays: number;
      callsToday: number;
      aiHandled: number;
      staffHandled: number;
      missedCalls: number;
      ordersFromCalls: number;
    }>(`/v1/portal/calls/stats?days=${safeDays}`, { apiKey });
  },

  async getConversations(merchantId: string, apiKey: string, status?: string) {
    let url = "/v1/portal/conversations";
    if (status) url += `?state=${status}`;
    return apiFetch<{ conversations: any[]; total: number }>(url, { apiKey });
  },

  async getConversation(conversationId: string, apiKey: string) {
    return apiFetch<any>(
      `/v1/portal/conversations/${conversationId}?includeMessages=true`,
      { apiKey },
    );
  },

  async takeoverConversation(
    conversationId: string,
    apiKey: string,
    userId: string,
  ) {
    return apiFetch<any>(
      `/v1/portal/conversations/${conversationId}/takeover`,
      {
        method: "POST",
        apiKey,
        body: JSON.stringify({ userId }),
      },
    );
  },

  async releaseConversation(conversationId: string, apiKey: string) {
    return apiFetch<any>(`/v1/portal/conversations/${conversationId}/release`, {
      method: "POST",
      apiKey,
    });
  },

  async closeConversation(conversationId: string, apiKey: string) {
    return apiFetch<any>(`/v1/portal/conversations/${conversationId}/close`, {
      method: "POST",
      apiKey,
    });
  },

  async sendMessage(conversationId: string, apiKey: string, text: string) {
    return apiFetch<any>(`/v1/portal/conversations/${conversationId}/send`, {
      method: "POST",
      apiKey,
      body: JSON.stringify({ text }),
    });
  },

  async getUsage(merchantId: string, apiKey: string, date?: string) {
    let url = "/v1/portal/usage";
    if (date) url += `?date=${date}`;
    return apiFetch<any>(url, { apiKey });
  },

  async getDailyReports(merchantId: string, apiKey: string, period?: string) {
    let url = "/v1/portal/reports";
    if (period) url += `?period=${period}`;
    return apiFetch<{ reports: any[] }>(url, { apiKey });
  },

  async getNotifications(merchantId: string, apiKey: string) {
    return apiFetch<{ notifications: any[] }>("/v1/portal/notifications", {
      apiKey,
    });
  },

  async getFollowups(merchantId: string, apiKey: string, status?: string) {
    let url = "/v1/portal/followups";
    if (status) url += `?status=${status}`;
    return apiFetch<{ followups: any[] }>(url, { apiKey });
  },

  async cancelFollowup(followupId: string, apiKey: string) {
    return apiFetch<any>(`/v1/followups/${followupId}/cancel`, {
      method: "POST",
      apiKey,
    });
  },

  async getCatalog(merchantId: string, apiKey: string) {
    return apiFetch<{ items: any[] }>("/v1/portal/catalog", { apiKey });
  },

  // Inventory API
  async getInventorySummary(merchantId: string, apiKey: string) {
    return apiFetch<{
      total_items: string;
      total_variants: string;
      total_on_hand: string;
      total_reserved: string;
      total_available: string;
      inventory_value: string;
      low_stock_count: string;
      out_of_stock_count: string;
    }>(`/v1/inventory/${merchantId}/reports/summary`, { apiKey });
  },

  async getInventoryItems(
    merchantId: string,
    apiKey: string,
    page = 1,
    limit = 50,
    search?: string,
  ) {
    let url = `/v1/inventory/${merchantId}/items?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return apiFetch<{
      items: any[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(url, { apiKey });
  },

  async getInventoryItem(merchantId: string, itemId: string, apiKey: string) {
    return apiFetch<any>(`/v1/inventory/${merchantId}/items/${itemId}`, {
      apiKey,
    });
  },

  async createInventoryItem(merchantId: string, apiKey: string, item: any) {
    return apiFetch<any>(`/v1/inventory/${merchantId}/items`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(item),
    });
  },

  async updateInventoryItem(
    merchantId: string,
    itemId: string,
    apiKey: string,
    item: any,
  ) {
    return apiFetch<any>(`/v1/inventory/${merchantId}/items/${itemId}`, {
      method: "PUT",
      apiKey,
      body: JSON.stringify(item),
    });
  },

  async deleteInventoryItem(
    merchantId: string,
    itemId: string,
    apiKey: string,
  ) {
    return apiFetch<{ success: boolean }>(
      `/v1/inventory/${merchantId}/items/${itemId}`,
      {
        method: "DELETE",
        apiKey,
      },
    );
  },

  async getVariants(merchantId: string, apiKey: string, lowStockOnly = false) {
    let url = `/v1/inventory/${merchantId}/variants`;
    if (lowStockOnly) url += "?lowStockOnly=true";
    return apiFetch<any[]>(url, { apiKey });
  },

  async createVariant(merchantId: string, apiKey: string, variant: any) {
    return apiFetch<any>(`/v1/inventory/${merchantId}/variants`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(variant),
    });
  },

  async updateVariant(
    merchantId: string,
    variantId: string,
    apiKey: string,
    data: any,
  ) {
    return apiFetch<any>(`/v1/inventory/${merchantId}/variants/${variantId}`, {
      method: "PUT",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  async deleteVariant(merchantId: string, variantId: string, apiKey: string) {
    return apiFetch<{ success: boolean }>(
      `/v1/inventory/${merchantId}/variants/${variantId}`,
      {
        method: "DELETE",
        apiKey,
      },
    );
  },

  async updateStock(
    merchantId: string,
    variantId: string,
    apiKey: string,
    update: {
      quantity: number;
      movementType: "purchase" | "adjustment" | "return" | "transfer";
      reason?: string;
      referenceId?: string;
    },
  ) {
    return apiFetch<{
      variantId: string;
      quantityBefore: number;
      quantityAfter: number;
      change: number;
    }>(`/v1/inventory/${merchantId}/variants/${variantId}/stock`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(update),
    });
  },

  async bulkUpdateStock(merchantId: string, apiKey: string, updates: any[]) {
    return apiFetch<{
      successful: any[];
      failed: any[];
    }>(`/v1/inventory/${merchantId}/stock/bulk`, {
      method: "POST",
      apiKey,
      body: JSON.stringify({ updates }),
    });
  },

  async getLowStockItems(merchantId: string, apiKey: string) {
    return apiFetch<any[]>(`/v1/inventory/${merchantId}/reports/low-stock`, {
      apiKey,
    });
  },

  async getStockMovements(
    merchantId: string,
    apiKey: string,
    days = 7,
    variantId?: string,
  ) {
    let url = `/v1/inventory/${merchantId}/reports/movements?days=${days}`;
    if (variantId) url += `&variantId=${variantId}`;
    return apiFetch<any[]>(url, { apiKey });
  },

  async getInventoryAlerts(merchantId: string, apiKey: string) {
    return apiFetch<any[]>(`/v1/inventory/${merchantId}/alerts`, { apiKey });
  },

  async acknowledgeAlert(merchantId: string, alertId: string, apiKey: string) {
    return apiFetch<{ success: boolean }>(
      `/v1/inventory/${merchantId}/alerts/${alertId}/acknowledge`,
      {
        method: "PUT",
        apiKey,
      },
    );
  },

  async dismissAlert(merchantId: string, alertId: string, apiKey: string) {
    return apiFetch<{ success: boolean }>(
      `/v1/inventory/${merchantId}/alerts/${alertId}/dismiss`,
      {
        method: "PUT",
        apiKey,
      },
    );
  },

  // Stock Transfer
  async transferStock(
    merchantId: string,
    apiKey: string,
    transfer: {
      variantId: string;
      quantity: number;
      fromLocation: string;
      toLocation: string;
      reason?: string;
    },
  ) {
    return apiFetch<{
      success: boolean;
      transfer: {
        variantId: string;
        variantName: string;
        quantity: number;
        fromLocation: string;
        toLocation: string;
        reason?: string;
        timestamp: string;
      };
    }>(`/v1/inventory/${merchantId}/stock/transfer`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(transfer),
    });
  },

  // Bulk Import
  async bulkImportInventory(
    merchantId: string,
    apiKey: string,
    items: Array<{
      sku: string;
      name?: string;
      quantity?: number;
      costPrice?: number;
      lowStockThreshold?: number;
      barcode?: string;
      location?: string;
    }>,
    updateExisting = true,
  ) {
    return apiFetch<{
      success: boolean;
      summary: {
        total: number;
        created: number;
        updated: number;
        errors: number;
      };
      results: { created: any[]; updated: any[]; errors: any[] };
    }>(`/v1/inventory/${merchantId}/stock/import`, {
      method: "POST",
      apiKey,
      body: JSON.stringify({ items, updateExisting }),
    });
  },

  // Barcode Lookup
  async findByBarcode(merchantId: string, apiKey: string, barcode: string) {
    return apiFetch<{
      found: boolean;
      type?: "variant" | "item";
      data?: any;
      barcode?: string;
    }>(`/v1/inventory/${merchantId}/barcode/${encodeURIComponent(barcode)}`, {
      apiKey,
    });
  },

  // Locations
  async getLocations(merchantId: string, apiKey: string) {
    return apiFetch<
      Array<{
        location: string;
        item_count: number;
        total_quantity: number;
      }>
    >(`/v1/inventory/${merchantId}/locations`, { apiKey });
  },

  // Warehouse Locations (multi-location inventory)
  async getWarehouseLocations(merchantId: string, apiKey: string) {
    return apiFetch<{
      locations: Array<{
        id: string;
        name: string;
        name_ar: string;
        address?: string;
        city?: string;
        is_default: boolean;
        is_active: boolean;
        created_at: string;
      }>;
    }>(`/v1/inventory/${merchantId}/warehouse-locations`, { apiKey });
  },

  async createWarehouseLocation(
    merchantId: string,
    apiKey: string,
    location: {
      name: string;
      nameAr?: string;
      address?: string;
      city?: string;
      isDefault?: boolean;
    },
  ) {
    return apiFetch<any>(`/v1/inventory/${merchantId}/warehouse-locations`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(location),
    });
  },

  async deleteWarehouseLocation(
    merchantId: string,
    locationId: string,
    apiKey: string,
  ) {
    return apiFetch<{ success: boolean }>(
      `/v1/inventory/${merchantId}/warehouse-locations/${locationId}`,
      {
        method: "DELETE",
        apiKey,
      },
    );
  },

  // Stock by Location
  async getStockByLocation(
    merchantId: string,
    apiKey: string,
    locationId?: string,
  ) {
    let url = `/v1/inventory/${merchantId}/stock-by-location`;
    if (locationId) url += `?locationId=${locationId}`;
    return apiFetch<{
      stockByLocation: Array<{
        id: string;
        variant_id: string;
        location_id: string;
        quantity_on_hand: number;
        quantity_reserved: number;
        quantity_available: number;
        bin_location?: string;
        sku: string;
        variant_name: string;
        location_name: string;
        location_name_ar: string;
      }>;
      locationSummary: Array<{
        location_id: string;
        location_name: string;
        location_name_ar: string;
        total_on_hand: number;
        total_reserved: number;
        total_available: number;
        variant_count: number;
        product_count?: number;
      }>;
    }>(url, { apiKey });
  },

  async setStockByLocation(
    merchantId: string,
    apiKey: string,
    data: {
      variantId: string;
      locationId: string;
      quantity: number;
      binLocation?: string;
    },
  ) {
    return apiFetch<any>(`/v1/inventory/${merchantId}/stock-by-location`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  async transferStockBetweenLocations(
    merchantId: string,
    apiKey: string,
    transfer: {
      variantId: string;
      fromLocationId: string;
      toLocationId: string;
      quantity: number;
      reason?: string;
    },
  ) {
    return apiFetch<{ success: boolean; quantity: number }>(
      `/v1/inventory/${merchantId}/stock-by-location/transfer`,
      {
        method: "POST",
        apiKey,
        body: JSON.stringify(transfer),
      },
    );
  },

  // ==================== Catalog / Menu ====================

  async getCatalogItems(
    _merchantId: string,
    apiKey: string,
    page = 1,
    pageSize = 100,
  ) {
    return apiFetch<{
      items: Array<{
        id: string;
        sku?: string;
        name: string;
        name_ar?: string;
        nameEn?: string;
        description?: string;
        description_ar?: string;
        descriptionEn?: string;
        base_price?: number;
        price?: number;
        category?: string;
        is_available?: boolean;
        isActive?: boolean;
        has_recipe?: boolean;
        hasRecipe?: boolean;
        variants?: any[];
        options?: any[];
        image_url?: string;
        tags?: string[];
      }>;
      total: number;
      page: number;
      pageSize: number;
    }>(`/v1/portal/catalog/items?page=${page}&pageSize=${pageSize}`, {
      apiKey,
    });
  },

  async createCatalogItem(
    _merchantId: string,
    item: {
      name: string;
      nameEn?: string;
      description?: string;
      descriptionEn?: string;
      price: number;
      category?: string;
      isAvailable?: boolean;
      imageUrl?: string;
    },
    apiKey: string,
  ) {
    const payload: any = { ...item };
    if (payload.isAvailable !== undefined) {
      payload.isActive = payload.isAvailable;
      delete payload.isAvailable;
    }
    return apiFetch<any>(`/v1/portal/catalog/items`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(payload),
    });
  },

  async updateCatalogItem(
    _merchantId: string,
    itemId: string,
    item: {
      name?: string;
      nameEn?: string;
      description?: string;
      descriptionEn?: string;
      price?: number;
      category?: string;
      isAvailable?: boolean;
      imageUrl?: string;
    },
    apiKey: string,
  ) {
    const payload: any = { ...item };
    if (payload.isAvailable !== undefined) {
      payload.isActive = payload.isAvailable;
      delete payload.isAvailable;
    }
    return apiFetch<any>(`/v1/portal/catalog/items/${itemId}`, {
      method: "PUT",
      apiKey,
      body: JSON.stringify(payload),
    });
  },

  async deleteCatalogItem(_merchantId: string, itemId: string, apiKey: string) {
    return apiFetch<{ success: boolean }>(
      `/v1/portal/catalog/items/${itemId}`,
      {
        method: "DELETE",
        apiKey,
      },
    );
  },

  // ==================== Knowledge Base ====================

  async getKnowledgeBase(merchantId: string, apiKey: string) {
    return apiFetch<{
      faqs: Array<{
        id: string;
        question: string;
        answer: string;
        category: string;
        isActive: boolean;
      }>;
      businessInfo: {
        name: string;
        nameEn?: string;
        description?: string;
        category: string;
        phone?: string;
        whatsapp?: string;
        website?: string;
        address?: string;
        city?: string;
        workingHours?: Record<
          string,
          { open: string; close: string; closed?: boolean }
        >;
        policies?: {
          returnPolicy?: string;
          deliveryInfo?: string;
          paymentMethods?: string[];
        };
        socialMedia?: {
          instagram?: string;
          twitter?: string;
          facebook?: string;
        };
      };
      offers?: Array<Record<string, any>>;
    }>(`/v1/portal/knowledge-base`, { apiKey });
  },

  async updateKnowledgeBase(
    merchantId: string,
    data: {
      faqs?: Array<{
        id: string;
        question: string;
        answer: string;
        category: string;
        isActive: boolean;
      }>;
      businessInfo?: Record<string, any>;
      offers?: Array<Record<string, any>>;
    },
    apiKey: string,
  ) {
    return apiFetch<{ success: boolean }>(`/v1/portal/knowledge-base`, {
      method: "PUT",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  async pushInventoryToCatalog(merchantId: string, apiKey: string) {
    return apiFetch<{
      success: boolean;
      total: number;
      created: number;
      updated: number;
      linked: number;
    }>(`/v1/portal/knowledge-base/sync-inventory`, {
      method: "POST",
      apiKey,
    });
  },

  async pullCatalogToInventory(merchantId: string, apiKey: string) {
    return apiFetch<{
      success: boolean;
      total: number;
      created: number;
      linked: number;
    }>(`/v1/portal/knowledge-base/pull-from-catalog`, {
      method: "POST",
      apiKey,
    });
  },

  async getPromotions(
    merchantId: string,
    apiKey: string,
    activeOnly?: boolean,
  ) {
    const query = activeOnly ? "?activeOnly=true" : "";
    return apiFetch<{ promotions: any[] }>(
      `/merchants/${merchantId}/loyalty/promotions${query}`,
      { apiKey },
    );
  },

  async createPromotion(merchantId: string, apiKey: string, data: any) {
    return apiFetch<{ promotion: any }>(
      `/merchants/${merchantId}/loyalty/promotions`,
      {
        method: "POST",
        apiKey,
        body: JSON.stringify(data),
      },
    );
  },

  // ==================== Feature Requests ====================

  async getFeatureRequests(
    merchantId: string,
    apiKey: string,
    status?: string,
    category?: string,
  ) {
    const queryParams = new URLSearchParams();
    if (status) queryParams.set("status", status);
    if (category) queryParams.set("category", category);
    const query = queryParams.toString() ? `?${queryParams.toString()}` : "";
    return apiFetch<{ requests: any[] }>(
      `/v1/portal/feature-requests${query}`,
      { apiKey },
    );
  },

  async createFeatureRequest(
    merchantId: string,
    apiKey: string,
    data: {
      title: string;
      description?: string;
      category?: string;
      priority?: string;
      metadata?: Record<string, any>;
    },
  ) {
    return apiFetch<{ request: any }>(`/v1/portal/feature-requests`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  // ==================== Quotes ====================

  async getQuotes(apiKey: string, status?: string) {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return apiFetch<{ quotes: any[] }>(`/v1/portal/quotes${query}`, { apiKey });
  },

  async getQuoteEvents(apiKey: string, quoteId: string) {
    return apiFetch<{ events: any[] }>(`/v1/portal/quotes/${quoteId}/events`, {
      apiKey,
    });
  },

  async createQuoteEvent(
    apiKey: string,
    quoteId: string,
    data: { note: string; action?: string },
  ) {
    return apiFetch<{ event: any }>(`/v1/portal/quotes/${quoteId}/events`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  async acceptQuote(apiKey: string, quoteId: string) {
    return apiFetch<{ success: boolean; quote: any }>(
      `/v1/portal/quotes/${quoteId}/accept`,
      {
        method: "POST",
        apiKey,
      },
    );
  },

  // ==================== Agent Teams ====================

  async getTeamTemplates(apiKey: string) {
    return apiFetch<{
      templates: any[];
      totalAvailable: number;
      totalTemplates: number;
    }>(`/v1/portal/teams/templates`, { apiKey });
  },

  async listTeamTasks(apiKey: string) {
    return apiFetch<{ tasks: any[]; total: number }>(`/v1/portal/teams/tasks`, {
      apiKey,
    });
  },

  async getTeamTaskStatus(apiKey: string, taskId: string) {
    return apiFetch<any>(`/v1/portal/teams/tasks/${taskId}`, { apiKey });
  },

  async getTeamTaskReport(
    apiKey: string,
    taskId: string,
    format: "json" | "txt" | "html" = "json",
  ) {
    return apiFetch<any>(
      `/v1/portal/teams/tasks/${taskId}/report?format=${encodeURIComponent(format)}`,
      { apiKey },
    );
  },

  async downloadTeamTaskReport(
    apiKey: string,
    taskId: string,
    format: "txt" | "html" = "txt",
  ) {
    const apiBaseUrl = getApiBaseUrl();
    const response = await fetch(
      `${apiBaseUrl}/v1/portal/teams/tasks/${encodeURIComponent(taskId)}/report?format=${encodeURIComponent(format)}`,
      {
        method: "GET",
        headers: buildApiAuthHeaders(apiKey),
      },
    );
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        sanitizeErrorMessage(
          errText || `HTTP ${response.status}`,
          response.status,
        ),
      );
    }
    return response.blob();
  },

  async executeTeamTemplate(
    apiKey: string,
    templateId: string,
    data?: { input?: Record<string, unknown>; priority?: string },
  ) {
    return apiFetch<{ success: boolean; teamTaskId: string; message: string }>(
      `/v1/portal/teams/execute/${templateId}`,
      {
        method: "POST",
        apiKey,
        body: JSON.stringify(data || { priority: "MEDIUM" }),
      },
    );
  },

  async cancelTeamTask(apiKey: string, taskId: string) {
    return apiFetch<{ success: boolean; message: string }>(
      `/v1/portal/teams/tasks/${taskId}`,
      {
        method: "DELETE",
        apiKey,
      },
    );
  },

  async getTeamIntents(apiKey: string) {
    return apiFetch<{ intents: any[] }>(`/v1/portal/teams/intents`, { apiKey });
  },

  // ==================== Merchant Assistant ====================

  async chatWithAssistant(
    merchantId: string,
    apiKey: string,
    data: {
      message: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    },
  ) {
    return apiFetch<{ reply: string }>(`/v1/portal/assistant/chat`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  // ==================== Merchant Copilot ====================

  async copilotMessage(
    apiKey: string,
    data: {
      message: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    },
  ) {
    return apiFetch<{
      success: boolean;
      intent?: string;
      reply: string;
      error?: string;
      data?: Record<string, any>;
      requiresConfirmation?: boolean;
      pendingActionId?: string;
      featureBlocked?: boolean;
      blockedFeatures?: string[];
      upgradeRequired?: boolean;
    }>(`/v1/portal/copilot/message`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  async copilotConfirm(apiKey: string, actionId: string, confirm: boolean) {
    return apiFetch<{
      success: boolean;
      action: "confirmed" | "cancelled" | "expired" | "not_found";
      reply?: string;
      data?: Record<string, any>;
    }>(`/v1/portal/copilot/confirm`, {
      method: "POST",
      apiKey,
      body: JSON.stringify({ actionId, confirm }),
    });
  },

  async copilotHistory(apiKey: string, limit = 50) {
    return apiFetch<{
      history: Array<{
        id: string;
        source: "portal" | "whatsapp";
        inputType: "text" | "voice";
        inputText: string;
        intent?: string;
        actionTaken: boolean;
        createdAt: string;
      }>;
    }>(`/v1/portal/copilot/history?limit=${limit}`, { apiKey });
  },

  async copilotStatus(apiKey: string) {
    return apiFetch<{
      ai: {
        connected: boolean;
        provider: string;
        model: string;
        message: string;
      };
      cache: {
        hits: number;
        misses: number;
        hitRate: number;
        memoryEntries: number;
      };
      voice: { transcriptionAvailable: boolean; provider: string };
      vision: { ocrAvailable: boolean; provider: string };
    }>(`/v1/portal/copilot/status`, { apiKey });
  },

  async copilotVoice(
    apiKey: string,
    data: {
      audioBase64: string;
      mimeType: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    },
  ) {
    return apiFetch<{
      success: boolean;
      transcribedText?: string;
      intent?: string;
      reply: string;
      data?: Record<string, any>;
      requiresConfirmation?: boolean;
      pendingActionId?: string;
      featureBlocked?: boolean;
      blockedFeatures?: string[];
      upgradeRequired?: boolean;
    }>(`/v1/portal/copilot/voice`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  // ==================== Analytics Events ====================

  async trackAnalyticsEvent(
    merchantId: string,
    apiKey: string,
    data: {
      eventName: string;
      properties?: Record<string, any>;
      sessionId?: string;
      source?: string;
      path?: string;
    },
  ) {
    return apiFetch<{ success: boolean }>(`/v1/portal/analytics/events`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  // ==================== Entitlements & Catalog ====================

  async getEntitlementsCatalog(apiKey: string) {
    return apiFetch<{
      currentPlan: string;
      enabledAgents: string[];
      enabledFeatures: string[];
      agents: Array<{
        id: string;
        nameAr: string;
        nameEn: string;
        descriptionAr: string;
        descriptionEn: string;
        status: "available" | "beta" | "coming_soon";
        eta?: string;
        color: string;
        dependencies: string[];
        features: string[];
        isEnabled: boolean;
        isIncludedInPlan: boolean;
      }>;
      features: Array<{
        id: string;
        nameAr: string;
        nameEn: string;
        descriptionAr: string;
        descriptionEn: string;
        status: "available" | "beta" | "coming_soon";
        eta?: string;
        requiredAgent?: string;
        dependencies: string[];
        isEnabled: boolean;
        isIncludedInPlan: boolean;
      }>;
      plans: Array<{
        id: string;
        enabledAgents: string[];
        enabledFeatures: string[];
        limits: {
          messagesPerMonth: number;
          whatsappNumbers: number;
          teamMembers: number;
          tokenBudgetDaily: number;
        };
        price?: number;
        currency?: string;
      }>;
      agentDependencies: Record<string, string[]>;
      featureDependencies: Record<string, string[]>;
      featureAgentMap: Record<string, string>;
    }>(`/v1/portal/entitlements/catalog`, { apiKey });
  },

  // ==================== Billing ====================

  async getBillingPlans(apiKey: string) {
    return apiFetch<{ plans: any[] }>(`/v1/portal/billing/plans`, { apiKey });
  },

  async getBillingCatalog(
    apiKey: string,
    regionCode?: "EG" | "SA" | "AE" | "OM" | "KW",
  ) {
    const query =
      regionCode && ["EG", "SA", "AE", "OM", "KW"].includes(regionCode)
        ? `?region=${regionCode}`
        : "";
    return apiFetch<{
      regionCode: "EG" | "SA" | "AE" | "OM" | "KW";
      currency: string;
      byoMarkup: number;
      cycles: Array<{ cycleMonths: number; discountPercent: number }>;
      bundles: Array<{
        code: string;
        name: string;
        tierRank: number;
        description: string;
        features: Array<{ key: string; label: string; tier: string }>;
        limits: {
          messagesPerMonth: number;
          whatsappNumbers: number;
          teamMembers: number;
          aiCallsPerDay: number;
          tokenBudgetDaily: number;
          paidTemplatesPerMonth: number;
          paymentProofScansPerMonth: number;
          voiceMinutesPerMonth: number;
          mapsLookupsPerMonth: number;
          posConnections: number;
          branches: number;
        };
        prices: Array<{
          cycleMonths: number;
          basePriceCents: number;
          discountPercent: number;
          totalPriceCents: number;
          effectiveMonthlyCents: number;
          currency: string;
        }>;
      }>;
      bundleAddOns: {
        capacityAddOns: Array<{
          code: string;
          name: string;
          category: string;
          description: string;
          scope: "BUNDLE" | "BYO" | "BOTH";
          addonType: "CORE" | "FEATURE" | "CAPACITY";
          isCore: boolean;
          isSubscription: boolean;
          featureEnables: string[];
          limitFloorUpdates: Record<string, number>;
          limitIncrements: Record<string, number>;
          prices: Array<{
            cycleMonths: number;
            basePriceCents: number;
            discountPercent: number;
            totalPriceCents: number;
            effectiveMonthlyCents: number;
            currency: string;
          }>;
        }>;
        usagePacks: Array<{
          code: string;
          name: string;
          metricKey: string;
          tierCode: string;
          includedUnits: number | null;
          includedAiCallsPerDay: number | null;
          includedTokenBudgetDaily: number | null;
          limitDeltas: Record<string, number>;
          priceCents: number | null;
          currency: string;
        }>;
      };
      byo: {
        coreAddOn: {
          code: string;
          name: string;
          category: string;
          description: string;
          scope: "BUNDLE" | "BYO" | "BOTH";
          addonType: "CORE" | "FEATURE" | "CAPACITY";
          isCore: boolean;
          isSubscription: boolean;
          featureEnables: string[];
          limitFloorUpdates: Record<string, number>;
          limitIncrements: Record<string, number>;
          prices: Array<{
            cycleMonths: number;
            basePriceCents: number;
            discountPercent: number;
            totalPriceCents: number;
            effectiveMonthlyCents: number;
            currency: string;
          }>;
        } | null;
        featureAddOns: Array<{
          code: string;
          name: string;
          category: string;
          description: string;
          scope: "BUNDLE" | "BYO" | "BOTH";
          addonType: "CORE" | "FEATURE" | "CAPACITY";
          isCore: boolean;
          isSubscription: boolean;
          featureEnables: string[];
          limitFloorUpdates: Record<string, number>;
          limitIncrements: Record<string, number>;
          prices: Array<{
            cycleMonths: number;
            basePriceCents: number;
            discountPercent: number;
            totalPriceCents: number;
            effectiveMonthlyCents: number;
            currency: string;
          }>;
        }>;
        usagePacks: Array<{
          code: string;
          name: string;
          metricKey: string;
          tierCode: string;
          includedUnits: number | null;
          includedAiCallsPerDay: number | null;
          includedTokenBudgetDaily: number | null;
          limitDeltas: Record<string, number>;
          priceCents: number | null;
          currency: string;
        }>;
      };
      addOns: Array<{
        code: string;
        name: string;
        category: string;
        description: string;
        isCore: boolean;
        isSubscription: boolean;
        prices: Array<{
          cycleMonths: number;
          basePriceCents: number;
          discountPercent: number;
          totalPriceCents: number;
          effectiveMonthlyCents: number;
          currency: string;
        }>;
      }>;
      usagePacks: Array<{
        code: string;
        name: string;
        metricKey: string;
        tierCode: string;
        includedUnits: number | null;
        includedAiCallsPerDay: number | null;
        includedTokenBudgetDaily: number | null;
        limitDeltas: Record<string, number>;
        priceCents: number | null;
        currency: string;
      }>;
    }>(`/v1/portal/billing/catalog${query}`, { apiKey });
  },

  async calculateByoPricing(
    apiKey: string,
    payload: {
      regionCode?: "EG" | "SA" | "AE" | "OM" | "KW";
      cycleMonths?: 1 | 3 | 6 | 12;
      addOns: Array<{ code: string; quantity?: number }>;
      usagePacks: Array<{ code: string; quantity?: number }>;
    },
  ) {
    return apiFetch<any>(`/v1/portal/billing/byo/calculate`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(payload),
    });
  },

  async subscribeBundlePlan(
    apiKey: string,
    payload: {
      planCode: string;
      regionCode?: "EG" | "SA" | "AE" | "OM" | "KW";
      cycleMonths?: 1 | 3 | 6 | 12;
    },
  ) {
    return apiFetch<any>(`/v1/portal/billing/subscribe`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(payload),
    });
  },

  async buyBillingTopup(
    apiKey: string,
    payload: {
      type: "USAGE_PACK" | "CAPACITY_ADDON";
      code: string;
      quantity?: number;
    },
  ) {
    return apiFetch<any>(`/v1/portal/billing/topups`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(payload),
    });
  },

  async getBillingUsageStatus(apiKey: string) {
    return apiFetch<{
      merchantId: string;
      limits: Record<string, number>;
      metrics: Record<
        string,
        {
          metric: string;
          periodType: "DAILY" | "MONTHLY";
          periodStart: string;
          periodEnd: string;
          used: number;
          limit: number;
          remaining: number;
          allowed: boolean;
        }
      >;
      checkedAt: string;
    }>(`/v1/portal/billing/usage-status`, { apiKey });
  },

  async getBillingOffers(apiKey: string) {
    return apiFetch<{ offers: any[] }>(`/v1/portal/billing/offers`, { apiKey });
  },

  async getBillingSummary(apiKey: string) {
    return apiFetch<{ status: string; subscription: any | null }>(
      `/v1/portal/billing/summary`,
      { apiKey },
    );
  },

  async getBillingHistory(apiKey: string) {
    return apiFetch<{ subscriptions: any[]; invoices: any[] }>(
      `/v1/portal/billing/history`,
      { apiKey },
    );
  },

  async createBillingCheckout(apiKey: string, planCode: string) {
    return apiFetch<{
      status: string;
      message: string;
      subscriptionId: string;
    }>(`/v1/portal/billing/checkout`, {
      method: "POST",
      apiKey,
      body: JSON.stringify({ planCode }),
    });
  },

  // Pricing calculator
  async getPricing(apiKey: string) {
    return apiFetch<{
      plans: any[];
      featurePrices: Record<string, number>;
      agentPrices: Record<string, number>;
      aiUsageTiers: Record<
        string,
        { aiCallsPerDay: number; price: number; label: string }
      >;
      messageTiers: Record<
        string,
        { messagesPerMonth: number; price: number; label: string }
      >;
      agents: any[];
      features: any[];
    }>(`/v1/portal/billing/pricing`, { apiKey });
  },

  async calculatePrice(
    apiKey: string,
    data: {
      agents: string[];
      features: string[];
      aiTier?: string;
      messageTier?: string;
    },
  ) {
    return apiFetch<{
      totalMonthly: number;
      currency: string;
      breakdown: Array<{ item: string; nameAr: string; price: number }>;
      recommendedPlan: string | null;
      recommendedPlanPrice: number | null;
      savingsVsCustom: number;
    }>(`/v1/portal/billing/calculate`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  async createReservation(
    merchantId: string,
    apiKey: string,
    reservation: {
      variantId: string;
      quantity: number;
      orderId?: string;
      conversationId?: string;
      expiresInMinutes?: number;
    },
  ) {
    return apiFetch<{
      success: boolean;
      reservation?: any;
      reason?: string;
      available?: number;
    }>(`/v1/inventory/${merchantId}/reservations`, {
      method: "POST",
      apiKey,
      body: JSON.stringify(reservation),
    });
  },

  async confirmReservation(
    merchantId: string,
    reservationId: string,
    apiKey: string,
  ) {
    return apiFetch<{ success: boolean }>(
      `/v1/inventory/${merchantId}/reservations/${reservationId}/confirm`,
      {
        method: "POST",
        apiKey,
      },
    );
  },

  async releaseReservation(
    merchantId: string,
    reservationId: string,
    apiKey: string,
    reason?: string,
  ) {
    return apiFetch<{ success: boolean }>(
      `/v1/inventory/${merchantId}/reservations/${reservationId}/release`,
      {
        method: "POST",
        apiKey,
        body: JSON.stringify({ reason }),
      },
    );
  },

  // Analytics API
  async getConversionAnalytics(apiKey: string, days?: number) {
    let url = "/v1/portal/analytics/conversion";
    if (days) url += `?days=${days}`;
    return apiFetch<{
      period: { days: number; startDate: string };
      funnel: {
        totalConversations: number;
        addedToCart: number;
        startedCheckout: number;
        completedOrder: number;
      };
      rates: {
        cartRate: number;
        checkoutRate: number;
        conversionRate: number;
        cartToCheckout: number;
        checkoutToOrder: number;
      };
    }>(url, { apiKey });
  },

  async getResponseTimeAnalytics(apiKey: string, days?: number) {
    let url = "/v1/portal/analytics/response-times";
    if (days) url += `?days=${days}`;
    return apiFetch<{
      period: { days: number; startDate: string };
      hasData?: boolean;
      responseTimes: {
        sampleCount?: number;
        averageSeconds: number;
        minSeconds: number;
        maxSeconds: number;
        medianSeconds: number;
      };
      formatted: {
        average: string;
        min: string;
        max: string;
        median: string;
      };
    }>(url, { apiKey });
  },

  async getPopularProductsAnalytics(
    apiKey: string,
    days?: number,
    limit?: number,
  ) {
    let url = "/v1/portal/analytics/popular-products";
    const params: string[] = [];
    if (days) params.push(`days=${days}`);
    if (limit) params.push(`limit=${limit}`);
    if (params.length) url += `?${params.join("&")}`;
    return apiFetch<{
      period: { days: number; startDate: string };
      products: Array<{
        rank: number;
        itemId: string;
        name: string;
        totalQuantity: number;
        totalRevenue: number;
        orderCount: number;
      }>;
    }>(url, { apiKey });
  },

  async getPeakHoursAnalytics(apiKey: string, days?: number) {
    let url = "/v1/portal/analytics/peak-hours";
    if (days) url += `?days=${days}`;
    return apiFetch<{
      period: { days: number; startDate: string };
      hasData?: boolean;
      hourlyStats: Array<{
        hour: number;
        hourLabel: string;
        messageCount: number;
        inboundCount: number;
        outboundCount: number;
        orderCount: number;
      }>;
      peaks: {
        messages: { hour: number; label: string; count: number };
        orders: { hour: number; label: string; count: number };
      };
    }>(url, { apiKey });
  },

  // Audit Logs
  async getAuditLogs(
    apiKey: string,
    filters?: {
      action?: string;
      resource?: string;
      staffId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const params = new URLSearchParams();
    if (filters?.action) params.append("action", filters.action);
    if (filters?.resource) params.append("resource", filters.resource);
    if (filters?.staffId) params.append("staffId", filters.staffId);
    if (filters?.startDate) params.append("startDate", filters.startDate);
    if (filters?.endDate) params.append("endDate", filters.endDate);
    if (filters?.limit) params.append("limit", filters.limit.toString());
    if (filters?.offset) params.append("offset", filters.offset.toString());

    const url = `/v1/portal/audit${params.toString() ? `?${params.toString()}` : ""}`;
    return apiFetch<{ logs: any[]; total: number }>(url, { apiKey });
  },

  async getAuditSummary(apiKey: string, days?: number) {
    let url = "/v1/portal/audit/summary";
    if (days) url += `?days=${days}`;
    return apiFetch<any>(url, { apiKey });
  },

  // Webhooks
  async getWebhooks(apiKey: string) {
    return apiFetch<any[]>("/v1/portal/webhooks", { apiKey });
  },

  async createWebhook(
    apiKey: string,
    webhook: {
      name: string;
      url: string;
      events: string[];
      headers?: Record<string, string>;
    },
  ) {
    return apiFetch<any>("/v1/portal/webhooks", {
      method: "POST",
      apiKey,
      body: JSON.stringify(webhook),
    });
  },

  async updateWebhook(
    apiKey: string,
    id: string,
    webhook: {
      name?: string;
      url?: string;
      events?: string[];
    },
  ) {
    return apiFetch<any>(`/v1/portal/webhooks/${id}`, {
      method: "PUT",
      apiKey,
      body: JSON.stringify(webhook),
    });
  },

  async deleteWebhook(apiKey: string, id: string) {
    return apiFetch<{ success: boolean }>(`/v1/portal/webhooks/${id}`, {
      method: "DELETE",
      apiKey,
    });
  },

  async testWebhook(apiKey: string, id: string) {
    return apiFetch<any>(`/v1/portal/webhooks/${id}/test`, {
      method: "POST",
      apiKey,
    });
  },

  async getWebhookDeliveries(apiKey: string, id: string, limit?: number) {
    let url = `/v1/portal/webhooks/${id}/deliveries`;
    if (limit) url += `?limit=${limit}`;
    return apiFetch<any[]>(url, { apiKey });
  },

  // Staff/Team
  async getStaff(apiKey: string) {
    return apiFetch<any[]>("/v1/portal/staff", { apiKey });
  },

  async inviteStaff(
    apiKey: string,
    staff: {
      email: string;
      name: string;
      role: string;
      permissions?: Record<string, any>;
    },
  ) {
    return apiFetch<any>("/v1/portal/staff/invite", {
      method: "POST",
      apiKey,
      body: JSON.stringify(staff),
    });
  },

  async updateStaff(
    apiKey: string,
    id: string,
    updates: {
      name?: string;
      role?: string;
      status?: string;
    },
  ) {
    return apiFetch<any>(`/v1/portal/staff/${id}`, {
      method: "PUT",
      apiKey,
      body: JSON.stringify(updates),
    });
  },

  async deleteStaff(apiKey: string, id: string) {
    return apiFetch<{ success: boolean }>(`/v1/portal/staff/${id}`, {
      method: "DELETE",
      apiKey,
    });
  },

  // Bulk Operations / Import-Export
  async getBulkOperations(
    apiKey: string,
    filters?: {
      status?: string;
      resourceType?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.resourceType)
      params.append("resourceType", filters.resourceType);
    if (filters?.limit) params.append("limit", filters.limit.toString());
    if (filters?.offset) params.append("offset", filters.offset.toString());

    const url = `/v1/portal/bulk-operations${params.toString() ? `?${params.toString()}` : ""}`;
    return apiFetch<{ operations: any[]; total: number }>(url, { apiKey });
  },

  async importProducts(
    apiKey: string,
    csvData: string,
    options?: {
      skipHeader?: boolean;
      updateExisting?: boolean;
      dryRun?: boolean;
    },
  ) {
    return apiFetch<any>("/v1/portal/products/import", {
      method: "POST",
      apiKey,
      body: JSON.stringify({ csvData, options }),
    });
  },

  async exportProducts(apiKey: string, format?: string) {
    let url = "/v1/portal/products/export";
    if (format) url += `?format=${format}`;
    return apiFetch<{ downloadUrl?: string; csvData?: string }>(url, {
      method: "POST",
      apiKey,
    });
  },

  // Daily Reports
  async getDailyReport(apiKey: string, date?: string) {
    let url = "/v1/portal/reports/daily";
    if (date) url += `?date=${date}`;
    return apiFetch<any>(url, { apiKey });
  },

  // ==================== Vision / OCR API ====================
  async processPaymentReceipt(apiKey: string, imageBase64: string) {
    return apiFetch<{
      success: boolean;
      text?: string;
      confidence: number;
      receipt?: {
        paymentMethod: string;
        amount: number;
        currency: string;
        referenceNumber?: string;
        date?: string;
        senderName?: string;
        receiverName?: string;
        bankName?: string;
      };
      error?: string;
    }>("/v1/vision/receipt", {
      method: "POST",
      apiKey,
      body: JSON.stringify({ imageBase64 }),
    });
  },

  async getPendingPaymentProofs(apiKey: string) {
    return apiFetch<
      Array<{
        id: string;
        paymentLinkId?: string;
        orderId?: string;
        proofType: string;
        imageUrl?: string;
        extractedAmount?: number;
        extractedReference?: string;
        ocrConfidence?: number;
        status: string;
        createdAt: string;
      }>
    >("/v1/payments/proofs/pending", { apiKey });
  },

  async submitPaymentProof(
    apiKey: string,
    data: {
      paymentLinkId?: string;
      orderId?: string;
      imageBase64?: string;
      imageUrl?: string;
      referenceNumber?: string;
    },
  ) {
    return apiFetch<any>("/v1/payments/proofs", {
      method: "POST",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  async verifyPaymentProof(
    apiKey: string,
    proofId: string,
    approved: boolean,
    rejectionReason?: string,
  ) {
    return apiFetch<any>(`/v1/payments/proofs/${proofId}/verify`, {
      method: "PUT",
      apiKey,
      body: JSON.stringify({ approved, rejectionReason }),
    });
  },

  // ==================== KPI API ====================
  async getRecoveredCartStats(apiKey: string, days?: number) {
    let url = "/v1/kpis/recovered-carts";
    if (days) url += `?days=${days}`;
    return apiFetch<{
      totalAbandonedCarts: number;
      recoveredCarts: number;
      recoveryRate: number;
      recoveredRevenue: number;
      pendingRecovery: number;
      byDay: Array<{ date: string; abandoned: number; recovered: number }>;
    }>(url, { apiKey });
  },

  async getDeliveryFailureStats(apiKey: string, days?: number) {
    let url = "/v1/kpis/delivery-failures";
    if (days) url += `?days=${days}`;
    return apiFetch<{
      totalDeliveries: number;
      failedDeliveries: number;
      failureRate: number;
      failureReasons: Array<{
        reason: string;
        count: number;
        percentage: number;
      }>;
      byDay: Array<{ date: string; total: number; failed: number }>;
      avgDeliveryTime: number;
      pendingDeliveries: number;
    }>(url, { apiKey });
  },

  async getAgentPerformanceStats(apiKey: string, days?: number) {
    let url = "/v1/kpis/agent-performance";
    if (days) url += `?days=${days}`;
    return apiFetch<{
      totalAgentInteractions: number;
      humanTakeovers: number;
      takoverRate: number;
      avgConfidence: number;
      byAgent: Array<{
        agentType: string;
        tasks: number;
        completed: number;
        failed: number;
        avgTime: number;
      }>;
      tokensUsed: number;
      tokenBudgetRemaining: number;
    }>(url, { apiKey });
  },

  async getRevenueKpis(apiKey: string, days?: number) {
    let url = "/v1/kpis/revenue";
    if (days) url += `?days=${days}`;
    return apiFetch<{
      totalRevenue: number;
      revenueChange: number;
      avgOrderValue: number;
      avgOrderValueChange: number;
      discountsGiven: number;
      deliveryFeesCollected: number;
      topProducts: Array<{ name: string; revenue: number; quantity: number }>;
      revenueByPaymentMethod: Array<{
        method: string;
        amount: number;
        count: number;
      }>;
      pendingPayments: number;
      codAtRisk: number;
    }>(url, { apiKey });
  },

  async getCustomerKpis(apiKey: string, days?: number) {
    let url = "/v1/kpis/customers";
    if (days) url += `?days=${days}`;
    return apiFetch<{
      totalCustomers: number;
      newCustomers: number;
      returningCustomers: number;
      repeatRate: number;
      avgOrdersPerCustomer: number;
      topCustomers: Array<{
        name: string;
        phone: string;
        orders: number;
        revenue: number;
      }>;
      customersByArea: Array<{ area: string; count: number }>;
    }>(url, { apiKey });
  },

  async getAllKpisSummary(apiKey: string, days?: number) {
    let url = "/v1/kpis/summary";
    if (days) url += `?days=${days}`;
    return apiFetch<{
      periodDays: number;
      recoveredCarts: any;
      deliveryFailures: any;
      agentPerformance: any;
      revenue: any;
      customers: any;
    }>(url, { apiKey });
  },

  // Payment Proofs
  async getPaymentProofs(
    apiKey: string,
    options?: { status?: string; limit?: number; offset?: number },
  ) {
    let url = "/v1/portal/payments/proofs";
    const params = new URLSearchParams();
    if (options?.status) params.append("status", options.status);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.offset) params.append("offset", options.offset.toString());
    if (params.toString()) url += `?${params.toString()}`;
    return apiFetch<{
      proofs: any[];
      total: number;
      limit: number;
      offset: number;
      summary?: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
      };
    }>(url, { apiKey });
  },

  // ============================================================================
  // FINANCE REPORTS API
  // ============================================================================

  async generateTaxReport(
    merchantId: string,
    apiKey: string,
    periodStart: string,
    periodEnd: string,
  ) {
    return apiFetch<any>(`/v1/finance-reports/${merchantId}/tax-report`, {
      apiKey,
      method: "POST",
      body: JSON.stringify({ periodStart, periodEnd }),
    });
  },

  async listTaxReports(merchantId: string, apiKey: string) {
    return apiFetch<{ reports: any[] }>(
      `/v1/finance-reports/${merchantId}/tax-reports`,
      { apiKey },
    );
  },

  async getCashFlowForecast(
    merchantId: string,
    apiKey: string,
    options?: { forecastDays?: number; startDate?: string; endDate?: string },
  ) {
    const params = new URLSearchParams();
    if (options?.forecastDays)
      params.set("forecastDays", String(options.forecastDays));
    if (options?.startDate) params.set("startDate", options.startDate);
    if (options?.endDate) params.set("endDate", options.endDate);
    const query = params.toString();
    return apiFetch<any>(
      `/v1/finance-reports/${merchantId}/cash-flow-forecast${query ? `?${query}` : ""}`,
      { apiKey },
    );
  },

  async getDiscountImpact(merchantId: string, apiKey: string, periodDays = 30) {
    return apiFetch<any>(
      `/v1/finance-reports/${merchantId}/discount-impact?periodDays=${periodDays}`,
      { apiKey },
    );
  },

  async getRevenueByChannel(
    merchantId: string,
    apiKey: string,
    periodDays = 30,
  ) {
    return apiFetch<any>(
      `/v1/finance-reports/${merchantId}/revenue-by-channel?periodDays=${periodDays}`,
      { apiKey },
    );
  },

  async getRefundAnalysis(merchantId: string, apiKey: string, periodDays = 30) {
    return apiFetch<any>(
      `/v1/finance-reports/${merchantId}/refund-analysis?periodDays=${periodDays}`,
      { apiKey },
    );
  },

  // ============================================================================
  // ADVANCED INVENTORY API
  // ============================================================================

  async getExpiryAlerts(merchantId: string, apiKey: string) {
    return apiFetch<any>(`/v1/inventory-advanced/${merchantId}/expiry-alerts`, {
      apiKey,
    });
  },

  async acknowledgeExpiryAlert(
    merchantId: string,
    alertId: string,
    apiKey: string,
  ) {
    return apiFetch<any>(
      `/v1/inventory-advanced/${merchantId}/expiry-alerts/${alertId}/acknowledge`,
      {
        apiKey,
        method: "POST",
      },
    );
  },

  async receiveLot(merchantId: string, apiKey: string, data: any) {
    return apiFetch<any>(`/v1/inventory-advanced/${merchantId}/lots`, {
      apiKey,
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getLotReport(merchantId: string, apiKey: string, itemId?: string) {
    const url = itemId
      ? `/v1/inventory-advanced/${merchantId}/lots?itemId=${itemId}`
      : `/v1/inventory-advanced/${merchantId}/lots`;
    return apiFetch<any>(url, { apiKey });
  },

  async getInventoryValuationFifo(merchantId: string, apiKey: string) {
    return apiFetch<any>(
      `/v1/inventory-advanced/${merchantId}/valuation-fifo`,
      { apiKey },
    );
  },

  async calculateFifoCogs(
    merchantId: string,
    apiKey: string,
    itemId: string,
    quantitySold: number,
  ) {
    return apiFetch<any>(`/v1/inventory-advanced/${merchantId}/fifo-cogs`, {
      apiKey,
      method: "POST",
      body: JSON.stringify({ itemId, quantitySold }),
    });
  },

  async getDuplicateSkus(merchantId: string, apiKey: string) {
    return apiFetch<any>(
      `/v1/inventory-advanced/${merchantId}/duplicate-skus`,
      { apiKey },
    );
  },

  async mergeSkus(
    merchantId: string,
    apiKey: string,
    sourceItemId: string,
    targetItemId: string,
    reason?: string,
  ) {
    return apiFetch<any>(`/v1/inventory-advanced/${merchantId}/merge-skus`, {
      apiKey,
      method: "POST",
      body: JSON.stringify({ sourceItemId, targetItemId, reason }),
    });
  },

  // ============================================================================
  // CUSTOMER INTELLIGENCE API
  // ============================================================================

  async getCustomerMemory(
    merchantId: string,
    customerId: string,
    apiKey: string,
    memoryType?: string,
  ) {
    const url = memoryType
      ? `/v1/intelligence/${merchantId}/customer-memory/${customerId}?type=${memoryType}`
      : `/v1/intelligence/${merchantId}/customer-memory/${customerId}`;
    return apiFetch<any>(url, { apiKey });
  },

  async saveCustomerMemory(merchantId: string, apiKey: string, data: any) {
    return apiFetch<any>(`/v1/intelligence/${merchantId}/customer-memory`, {
      apiKey,
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getAiDecisionLog(
    merchantId: string,
    apiKey: string,
    filters?: { agentType?: string; decisionType?: string; limit?: number },
  ) {
    const params = new URLSearchParams();
    if (filters?.agentType) params.append("agentType", filters.agentType);
    if (filters?.decisionType)
      params.append("decisionType", filters.decisionType);
    if (filters?.limit) params.append("limit", filters.limit.toString());
    const qs = params.toString() ? `?${params.toString()}` : "";
    return apiFetch<any>(`/v1/intelligence/${merchantId}/ai-decisions${qs}`, {
      apiKey,
    });
  },
};

// Admin API
export const adminApi = {
  async getMerchants(adminKey: string) {
    return apiFetch<{ merchants: any[]; total: number }>(
      "/v1/admin/merchants",
      { adminKey },
    );
  },

  async getMerchant(adminKey: string, merchantId: string) {
    return apiFetch<any>(`/v1/admin/merchants/${merchantId}`, { adminKey });
  },

  async createMerchant(
    adminKey: string,
    merchant: {
      name: string;
      category: string;
      city?: string;
      dailyTokenBudget?: number;
    },
  ) {
    return apiFetch<any>("/v1/admin/merchants", {
      method: "POST",
      adminKey,
      body: JSON.stringify(merchant),
    });
  },

  async updateMerchantBudget(
    adminKey: string,
    merchantId: string,
    dailyTokenBudget: number,
  ) {
    return apiFetch<any>(`/v1/admin/merchants/${merchantId}/budget`, {
      method: "PUT",
      adminKey,
      body: JSON.stringify({ dailyTokenBudget }),
    });
  },

  async updateMerchantAgents(
    adminKey: string,
    merchantId: string,
    enabledAgents: string[],
  ) {
    return apiFetch<any>(`/v1/admin/merchants/${merchantId}/agents`, {
      method: "PUT",
      adminKey,
      body: JSON.stringify({ enabledAgents }),
    });
  },

  async getDlqEvents(adminKey: string, limit?: number) {
    let url = "/v1/admin/dlq";
    if (limit) url += `?limit=${limit}`;
    return apiFetch<{ events: any[]; total: number }>(url, { adminKey });
  },

  async replayDlqEvent(adminKey: string, eventId: string) {
    return apiFetch<any>(`/v1/admin/replay/${eventId}`, {
      method: "POST",
      adminKey,
    });
  },

  async getMetrics(adminKey: string) {
    return apiFetch<any>("/v1/admin/metrics", { adminKey });
  },

  async getReportsSummary(adminKey: string, days?: number) {
    let url = "/v1/admin/reports/summary";
    if (days) url += `?days=${days}`;
    return apiFetch<any>(url, { adminKey });
  },

  async getAuditLogs(
    adminKey: string,
    filters?: {
      merchantId?: string;
      action?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const params = new URLSearchParams();
    if (filters?.merchantId) params.append("merchantId", filters.merchantId);
    if (filters?.action) params.append("action", filters.action);
    if (filters?.limit) params.append("limit", filters.limit.toString());
    if (filters?.offset) params.append("offset", filters.offset.toString());

    const url = `/v1/admin/audit${params.toString() ? `?${params.toString()}` : ""}`;
    return apiFetch<{ logs: any[]; total: number }>(url, { adminKey });
  },

  async seedDatabase(adminKey: string) {
    return apiFetch<any>("/v1/admin/seed", {
      method: "POST",
      adminKey,
    });
  },

  // Admin Payment Proofs (for approval)
  async getPendingProofs(adminKey: string, limit = 50, offset = 0) {
    return apiFetch<{ proofs: any[]; total: number }>(
      `/v1/admin/payments/proofs?status=PENDING_REVIEW&limit=${limit}&offset=${offset}`,
      { adminKey },
    );
  },

  async verifyPaymentProof(
    adminKey: string,
    proofId: string,
    approved: boolean,
    rejectionReason?: string,
  ) {
    return apiFetch<any>(`/v1/admin/payments/proofs/${proofId}/verify`, {
      method: "PUT",
      adminKey,
      body: JSON.stringify({ approved, rejectionReason }),
    });
  },
};

/**
 * @deprecated Use merchantApi instead. This is a convenience alias kept for backward compatibility.
 */
// Payment Links & Proofs API
export const paymentsApi = {
  // Submit payment proof (customer)
  async submitPaymentProof(
    apiKey: string,
    data: {
      paymentLinkId?: string;
      orderId?: string;
      imageBase64?: string;
      imageUrl?: string;
      referenceNumber?: string;
      proofType?: string;
    },
  ) {
    return apiFetch<any>("/v1/payments/proofs", {
      method: "POST",
      apiKey,
      body: JSON.stringify(data),
    });
  },

  // List proofs for merchant
  async listPaymentProofs(
    apiKey: string,
    filters?: {
      status?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const params = new URLSearchParams();
    if (filters?.status) params.append("status", filters.status);
    if (filters?.limit) params.append("limit", filters.limit.toString());
    if (filters?.offset) params.append("offset", filters.offset.toString());

    const url = `/v1/portal/payments/proofs${params.toString() ? `?${params.toString()}` : ""}`;
    return apiFetch<{ proofs: any[]; total: number }>(url, { apiKey });
  },

  // Verify/reject proof (merchant)
  async verifyProof(
    apiKey: string,
    proofId: string,
    approved: boolean,
    rejectionReason?: string,
  ) {
    return apiFetch<any>(`/v1/portal/payments/proofs/${proofId}/verify`, {
      method: "POST",
      apiKey,
      body: JSON.stringify({ approved, rejectionReason }),
    });
  },
};

/**
 * @deprecated Use merchantApi instead. This is a convenience alias kept for backward compatibility.
 * All vision methods are available on merchantApi (e.g., merchantApi.processReceipt).
 */
// Vision/OCR API
export const visionApi = {
  // Process payment receipt
  async processReceipt(apiKey: string, imageBase64: string) {
    return apiFetch<{
      success: boolean;
      data?: {
        senderName: string | null;
        senderAccount: string | null;
        receiverName: string | null;
        receiverAccount: string | null;
        amount: number | null;
        currency: string | null;
        referenceNumber: string | null;
        transactionDate: string | null;
        paymentMethod: string | null;
        confidence: number;
      };
      rawText?: string;
      error?: string;
    }>("/v1/vision/receipt", {
      method: "POST",
      apiKey,
      body: JSON.stringify({ imageBase64 }),
    });
  },
};

/**
 * @deprecated Use merchantApi instead. This is a convenience alias kept for backward compatibility.
 * All KPI methods are available on merchantApi (e.g., merchantApi.getRecoveredCarts).
 */
// KPIs API
export const kpisApi = {
  // Cart recovery stats
  async getRecoveredCarts(apiKey: string, days = 30) {
    return apiFetch<{
      totalAbandoned: number;
      totalRecovered: number;
      recoveryRate: number;
      recoveredValue: number;
      averageRecoveryTime: number;
      byDay: Array<{ date: string; abandoned: number; recovered: number }>;
    }>(`/v1/kpis/recovered-carts?days=${days}`, { apiKey });
  },

  // Delivery failure stats
  async getDeliveryFailures(apiKey: string, days = 30) {
    return apiFetch<{
      totalDeliveries: number;
      totalFailures: number;
      failureRate: number;
      failuresByReason: Array<{
        reason: string;
        count: number;
        percentage: number;
      }>;
      failuresByDay: Array<{ date: string; failures: number }>;
      topFailureAreas: Array<{ area: string; failures: number }>;
    }>(`/v1/kpis/delivery-failures?days=${days}`, { apiKey });
  },

  // Agent performance stats
  async getAgentPerformance(apiKey: string, days = 30) {
    return apiFetch<{
      totalInteractions: number;
      totalTasks: number;
      successfulTasks: number;
      successRate: number;
      averageConfidence: number;
      totalTakeovers: number;
      takeoverRate: number;
      tokenUsage: { total: number; byAgent: Record<string, number> };
      byAgent: Array<{
        agent: string;
        tasks: number;
        successRate: number;
        avgConfidence: number;
      }>;
    }>(`/v1/kpis/agent-performance?days=${days}`, { apiKey });
  },

  // Revenue KPIs
  async getRevenueKpis(apiKey: string, days = 30) {
    return apiFetch<{
      totalRevenue: number;
      previousPeriodRevenue: number;
      revenueChange: number;
      averageOrderValue: number;
      topProducts: Array<{ name: string; revenue: number; quantity: number }>;
      revenueByDay: Array<{ date: string; revenue: number }>;
      paymentMethods: Array<{
        method: string;
        amount: number;
        percentage: number;
      }>;
    }>(`/v1/kpis/revenue?days=${days}`, { apiKey });
  },

  // Customer KPIs
  async getCustomerKpis(apiKey: string, days = 30) {
    return apiFetch<{
      totalCustomers: number;
      newCustomers: number;
      returningCustomers: number;
      retentionRate: number;
      avgOrdersPerCustomer?: number;
      topCustomers: Array<{
        name: string;
        phone: string;
        totalOrders: number;
        totalSpent: number;
      }>;
      customersByRegion: Array<{ region: string; count: number }>;
    }>(`/v1/kpis/customers?days=${days}`, { apiKey });
  },

  // All KPIs summary
  async getSummary(apiKey: string, days = 30) {
    return apiFetch<{
      recoveredCarts: any;
      deliveryFailures: any;
      agentPerformance: any;
      revenue: any;
      customers: any;
    }>(`/v1/kpis/summary?days=${days}`, { apiKey });
  },
};

// ============================================================================
// BRANCHES API
// ============================================================================

export interface Branch {
  id: string;
  merchant_id: string;
  name: string;
  name_en?: string;
  city?: string;
  address?: string;
  phone?: string;
  manager_name?: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BranchSummary {
  branchId: string;
  periodDays: number;
  revenue: number;
  revenueChange: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgOrderValue: number;
  deliveryFeesCollected: number;
  discountsGiven: number;
  totalExpenses: number;
  netProfit: number;
  margin: number;
}

export interface BranchComparison {
  periodDays: number;
  totalRevenue: number;
  branches: Array<{
    branchId: string | null;
    branchName: string;
    branchNameEn?: string;
    isActive: boolean;
    revenue: number;
    totalOrders: number;
    completedOrders: number;
    avgOrderValue: number;
    totalExpenses: number;
    netProfit: number;
    margin: number;
    revenuePct: number;
  }>;
}

export const branchesApi = {
  async list(apiKey: string) {
    return apiFetch<{ branches: Branch[] }>(`/v1/branches`, { apiKey });
  },

  async get(apiKey: string, branchId: string) {
    return apiFetch<Branch>(`/v1/branches/${branchId}`, { apiKey });
  },

  async create(
    apiKey: string,
    dto: {
      name: string;
      name_en?: string;
      city?: string;
      address?: string;
      phone?: string;
      manager_name?: string;
      is_default?: boolean;
      sort_order?: number;
    },
  ) {
    return apiFetch<Branch>(`/v1/branches`, {
      apiKey,
      method: "POST",
      body: JSON.stringify(dto),
    });
  },

  async update(
    apiKey: string,
    branchId: string,
    dto: Partial<
      Omit<Branch, "id" | "merchant_id" | "created_at" | "updated_at">
    >,
  ) {
    return apiFetch<Branch>(`/v1/branches/${branchId}`, {
      apiKey,
      method: "PATCH",
      body: JSON.stringify(dto),
    });
  },

  async remove(apiKey: string, branchId: string) {
    return apiFetch<void>(`/v1/branches/${branchId}`, {
      apiKey,
      method: "DELETE",
    });
  },

  // Analytics

  async getSummary(apiKey: string, branchId: string, days = 30) {
    return apiFetch<BranchSummary>(
      `/v1/branches/${branchId}/analytics/summary?days=${days}`,
      { apiKey },
    );
  },

  async getRevenueByDay(apiKey: string, branchId: string, days = 30) {
    return apiFetch<{
      branchId: string;
      periodDays: number;
      series: Array<{ date: string; revenue: number; orders: number }>;
    }>(`/v1/branches/${branchId}/analytics/revenue-by-day?days=${days}`, {
      apiKey,
    });
  },

  async getComparison(apiKey: string, days = 30) {
    return apiFetch<BranchComparison>(`/v1/branches/_comparison?days=${days}`, {
      apiKey,
    });
  },

  async getTopProducts(
    apiKey: string,
    branchId: string,
    days = 30,
    limit = 10,
  ) {
    return apiFetch<{
      branchId: string;
      periodDays: number;
      products: Array<{ name: string; revenue: number; quantity: number }>;
    }>(
      `/v1/branches/${branchId}/analytics/top-products?days=${days}&limit=${limit}`,
      { apiKey },
    );
  },

  async getExpensesBreakdown(apiKey: string, branchId: string, days = 30) {
    return apiFetch<{
      branchId: string;
      periodDays: number;
      total: number;
      categories: Array<{
        category: string;
        total: number;
        count: number;
        pct: number;
      }>;
    }>(`/v1/branches/${branchId}/analytics/expenses-breakdown?days=${days}`, {
      apiKey,
    });
  },

  // Goals
  async listGoals(apiKey: string, branchId: string, withProgress = false) {
    return apiFetch<{ data: any[] }>(
      `/v1/branches/${branchId}/goals?withProgress=${withProgress}`,
      { apiKey },
    );
  },

  async createGoal(
    apiKey: string,
    branchId: string,
    dto: {
      periodType?: string;
      targetRevenue?: number;
      targetOrders?: number;
      startDate: string;
      endDate: string;
      notes?: string;
    },
  ) {
    return apiFetch<{ data: any }>(`/v1/branches/${branchId}/goals`, {
      apiKey,
      method: "POST",
      body: JSON.stringify(dto),
    });
  },

  async updateGoal(
    apiKey: string,
    branchId: string,
    goalId: string,
    dto: { targetRevenue?: number; targetOrders?: number; notes?: string },
  ) {
    return apiFetch<{ data: any }>(`/v1/branches/${branchId}/goals/${goalId}`, {
      apiKey,
      method: "PATCH",
      body: JSON.stringify(dto),
    });
  },

  async deleteGoal(apiKey: string, branchId: string, goalId: string) {
    return apiFetch<void>(`/v1/branches/${branchId}/goals/${goalId}`, {
      apiKey,
      method: "DELETE",
    });
  },

  // Staff assignments
  async listStaff(apiKey: string, branchId: string) {
    return apiFetch<{ data: any[] }>(`/v1/branches/${branchId}/staff`, {
      apiKey,
    });
  },

  async availableStaff(apiKey: string, branchId: string) {
    return apiFetch<{ data: any[] }>(
      `/v1/branches/${branchId}/staff/available`,
      { apiKey },
    );
  },

  async assignStaff(
    apiKey: string,
    branchId: string,
    dto: { staffId: string; role?: string; isPrimary?: boolean },
  ) {
    return apiFetch<{ data: any }>(`/v1/branches/${branchId}/staff`, {
      apiKey,
      method: "POST",
      body: JSON.stringify(dto),
    });
  },

  async removeStaff(apiKey: string, branchId: string, assignmentId: string) {
    return apiFetch<void>(`/v1/branches/${branchId}/staff/${assignmentId}`, {
      apiKey,
      method: "DELETE",
    });
  },

  // Shifts
  async listShifts(
    apiKey: string,
    branchId: string,
    params?: { status?: string; limit?: number; offset?: number },
  ) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    return apiFetch<{ data: any[]; total: number }>(
      `/v1/branches/${branchId}/shifts?${qs.toString()}`,
      { apiKey },
    );
  },

  async getCurrentShift(apiKey: string, branchId: string) {
    return apiFetch<{ data: any | null }>(
      `/v1/branches/${branchId}/shifts/current`,
      { apiKey },
    );
  },

  async openShift(
    apiKey: string,
    branchId: string,
    dto: { openingCash?: number; notes?: string },
  ) {
    return apiFetch<{ data: any }>(`/v1/branches/${branchId}/shifts/open`, {
      apiKey,
      method: "POST",
      body: JSON.stringify(dto),
    });
  },

  async closeShift(
    apiKey: string,
    branchId: string,
    shiftId: string,
    dto: { closingCash?: number; closingNotes?: string },
  ) {
    return apiFetch<{ data: any }>(
      `/v1/branches/${branchId}/shifts/${shiftId}/close`,
      { apiKey, method: "PATCH", body: JSON.stringify(dto) },
    );
  },

  // P&L Report
  async getPLReport(apiKey: string, branchId: string, month?: string) {
    const qs = month ? `?month=${month}` : "";
    return apiFetch<any>(`/v1/branches/${branchId}/pl-report${qs}`, { apiKey });
  },

  // Branch Alerts
  async getBranchAlerts(apiKey: string, branchId: string) {
    return apiFetch<any>(`/v1/branches/${branchId}/alerts`, { apiKey });
  },
  async updateBranchAlerts(
    apiKey: string,
    branchId: string,
    data: {
      expiryThresholdDays?: number;
      cashFlowForecastDays?: number;
      demandSpikeMultiplier?: number;
      isActive?: boolean;
      noOrdersThresholdMinutes?: number;
      lowCashThreshold?: number | null;
      alertEmail?: string | null;
      alertWhatsapp?: string | null;
    },
  ) {
    return apiFetch<any>(`/v1/branches/${branchId}/alerts`, {
      apiKey,
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  async getAlertsSummary(apiKey: string) {
    return apiFetch<any[]>(`/v1/branches/_alerts/summary`, { apiKey });
  },

  // Branch Inventory
  async getBranchInventory(
    apiKey: string,
    branchId: string,
    opts?: { search?: string; lowStock?: boolean },
  ) {
    const qs = new URLSearchParams();
    if (opts?.search) qs.set("search", opts.search);
    if (opts?.lowStock) qs.set("lowStock", "true");
    const q = qs.toString();
    return apiFetch<any>(
      `/v1/branches/${branchId}/inventory${q ? `?${q}` : ""}`,
      { apiKey },
    );
  },
};

const AUTHENTICATED_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_BASE_URL ||
  (process.env.NODE_ENV === "production"
    ? "http://api:3000"
    : "http://localhost:3000");

// Client-side requests should go through the Next.js proxy (relative URL)
// to avoid CORS. Server-side requests can hit the API directly.
const getBaseUrl = () =>
  typeof window !== "undefined" ? "" : AUTHENTICATED_API_BASE_URL;

// Prevent multiple concurrent 401s from each triggering their own signOut
let authenticatedIsSigningOut = false;
let cachedAuthTokens: {
  accessToken?: string;
  adminKey?: string;
  expiresAt: number;
} | null = null;
let authTokenRequest: Promise<{
  accessToken?: string;
  adminKey?: string;
}> | null = null;
let unauthorizedStreak = 0;
let unauthorizedFirstAt = 0;

const AUTH_RECOVERY_GRACE_MS = 90_000;
const MAX_UNAUTHORIZED_RECOVERY_ATTEMPTS = 3;

const resetUnauthorizedRecovery = () => {
  unauthorizedStreak = 0;
  unauthorizedFirstAt = 0;
};

export interface ApiError extends Error {
  status: number;
  code?: string;
}

interface AuthenticatedFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  apiKey?: string;
  skipAuth?: boolean;
  timeout?: number;
  retryOnUnauthorized?: boolean;
}

const sanitizeAuthenticatedErrorMessage = (
  message: unknown,
  status?: number,
) => {
  if (message === undefined || message === null) return "";
  const safeMessage = typeof message === "string" ? message : String(message);
  const lower = safeMessage.toLowerCase();

  if (status === 401) {
    return "غير مصرح.";
  }

  const technicalErrorPatterns = [
    /cannot\s+(get|post|put|patch|delete)\s+\//i,
    /column\s+.+\s+does not exist/i,
    /relation\s+.+\s+does not exist/i,
    /invalid input syntax for type/i,
    /syntax error at or near/i,
    /duplicate key value violates unique constraint/i,
    /null value in column/i,
    /exceptionfilter/i,
    /unhandled exception/i,
    /stack/i,
    /<!doctype html>/i,
    /<html/i,
  ];

  if (technicalErrorPatterns.some((pattern) => pattern.test(safeMessage))) {
    return "حدث خطأ تقني أثناء تحميل البيانات. حاول مرة أخرى بعد قليل.";
  }

  if (status === 404) {
    return "الخدمة المطلوبة غير متاحة حالياً.";
  }

  if (status !== undefined && status >= 500) {
    return "حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.";
  }

  if (
    lower.includes("incorrect api key") ||
    lower.includes("invalid or missing api key") ||
    lower.includes("api key provided") ||
    lower.includes("openai")
  ) {
    return "تعذر الاتصال بخدمة الذكاء الاصطناعي حالياً. يمكنك شراء/ترقية حزمة الذكاء الاصطناعي ثم إعادة المحاولة.";
  }
  if (
    lower.includes("invalid or missing admin api key") ||
    lower.includes("forbidden")
  ) {
    return "غير مصرح.";
  }
  if (lower.includes("request entity too large")) {
    return "حجم الملف كبير جداً.";
  }
  if (lower.startsWith("api error") || lower.startsWith("http ")) {
    return "تعذر إكمال الطلب حالياً. حاول مرة أخرى.";
  }
  return safeMessage;
};

const getTokenRouteUrl = () => {
  if (typeof window !== "undefined") {
    return "/api/auth/token";
  }

  const nextAuthUrl = process.env.NEXTAUTH_URL;
  return nextAuthUrl ? `${nextAuthUrl}/api/auth/token` : null;
};

async function getAuthTokens(): Promise<{
  accessToken?: string;
  adminKey?: string;
}> {
  if (cachedAuthTokens && cachedAuthTokens.expiresAt > Date.now()) {
    return {
      accessToken: cachedAuthTokens.accessToken,
      adminKey: cachedAuthTokens.adminKey,
    };
  }

  if (authTokenRequest) {
    return authTokenRequest;
  }

  const tokenRouteUrl = getTokenRouteUrl();
  if (!tokenRouteUrl) {
    return {};
  }

  authTokenRequest = fetch(tokenRouteUrl, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        return {};
      }

      const data = (await response.json()) as {
        accessToken?: string;
        adminKey?: string;
      };

      cachedAuthTokens = {
        accessToken:
          typeof data.accessToken === "string" ? data.accessToken : undefined,
        adminKey: typeof data.adminKey === "string" ? data.adminKey : undefined,
        expiresAt: Date.now() + 30_000,
      };

      return {
        accessToken: cachedAuthTokens.accessToken,
        adminKey: cachedAuthTokens.adminKey,
      };
    })
    .catch(() => ({}))
    .finally(() => {
      authTokenRequest = null;
    });

  return authTokenRequest;
}

/**
 * Authenticated API client that automatically includes access tokens
 */
export async function authenticatedFetch<T>(
  endpoint: string,
  options: AuthenticatedFetchOptions = {},
): Promise<T> {
  const {
    body,
    apiKey,
    skipAuth = false,
    timeout = 30000,
    retryOnUnauthorized = true,
    ...fetchOptions
  } = options;

  // Check if body is FormData - if so, don't set Content-Type
  const isFormData = body instanceof FormData;

  const headers: Record<string, string> = {
    // Only set Content-Type for non-FormData requests
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (typeof window !== "undefined") {
    headers["x-page-path"] = window.location.pathname;
    const title = document?.title || window.location.pathname;
    const isLatin1 = (value: string) => {
      for (let i = 0; i < value.length; i += 1) {
        if (value.charCodeAt(i) > 255) return false;
      }
      return true;
    };
    if (title && isLatin1(title)) {
      headers["x-page-name"] = title;
    } else if (title) {
      // Encode non‑Latin1 titles to avoid fetch header errors
      const encoded =
        typeof btoa !== "undefined"
          ? btoa(unescape(encodeURIComponent(title)))
          : "";
      if (encoded) {
        headers["x-page-name-b64"] = encoded;
      }
    }
  }

  const authTokens = !skipAuth ? await getAuthTokens() : null;
  if (!skipAuth) {
    if (authTokens?.accessToken) {
      headers["Authorization"] = `Bearer ${authTokens.accessToken}`;
    }
  }

  // Admin API key support for admin routes
  const isAdminRoute =
    endpoint.startsWith("/api/v1/admin") || endpoint.startsWith("/api/admin");
  if (isAdminRoute && authTokens?.adminKey) {
    headers["x-admin-api-key"] = authTokens.adminKey;
  }

  // Legacy API key support
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Handle FormData differently - don't stringify
    const finalBody = isFormData
      ? body
      : body
        ? JSON.stringify(body)
        : undefined;

    const response = await fetch(`${getBaseUrl()}${endpoint}`, {
      ...fetchOptions,
      headers,
      body: finalBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle different response types
    const contentType = response.headers.get("content-type");
    let data: T;

    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else if (contentType?.includes("text/")) {
      data = (await response.text()) as T;
    } else {
      data = (await response.blob()) as T;
    }

    if (!response.ok) {
      // 401 = invalid/expired token → force redirect to login
      if (response.status === 401 && typeof window !== "undefined") {
        if (!skipAuth && retryOnUnauthorized) {
          cachedAuthTokens = null;
          authTokenRequest = null;
          return authenticatedFetch<T>(endpoint, {
            ...options,
            retryOnUnauthorized: false,
          });
        }

        if (unauthorizedFirstAt === 0) {
          unauthorizedFirstAt = Date.now();
        }
        unauthorizedStreak += 1;

        const inRecoveryWindow =
          Date.now() - unauthorizedFirstAt <= AUTH_RECOVERY_GRACE_MS;
        if (
          inRecoveryWindow &&
          unauthorizedStreak <= MAX_UNAUTHORIZED_RECOVERY_ATTEMPTS
        ) {
          window.dispatchEvent(
            new CustomEvent("app:auth-recovering", {
              detail: {
                endpoint,
                status: 401,
                attempt: unauthorizedStreak,
                maxAttempts: MAX_UNAUTHORIZED_RECOVERY_ATTEMPTS,
                at: Date.now(),
              },
            }),
          );

          const recoveringError = new Error(
            "نقوم باستعادة الجلسة تلقائياً. الرجاء المحاولة بعد لحظات.",
          ) as ApiError;
          recoveringError.status = 503;
          recoveringError.code = "AUTH_RECOVERING";
          throw recoveringError;
        }

        if (!authenticatedIsSigningOut) {
          authenticatedIsSigningOut = true;
          window.dispatchEvent(
            new CustomEvent("app:session-expired", {
              detail: {
                endpoint,
                status: 401,
                at: Date.now(),
              },
            }),
          );
          const { signOut } = await import("next-auth/react");
          await signOut({
            callbackUrl: "/login?reason=session_expired",
            redirect: true,
          });
        }
        return new Promise(() => {}) as T; // never resolves, page is redirecting
      }

      const error = new Error(
        sanitizeAuthenticatedErrorMessage(
          (data as any)?.message || `API Error: ${response.status}`,
          response.status,
        ),
      ) as ApiError;
      error.status = response.status;
      error.code = (data as any)?.code;
      throw error;
    }

    resetUnauthorizedRecovery();

    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        const apiError = new Error(
          "انتهت مهلة الطلب. حاول مرة أخرى.",
        ) as ApiError;
        apiError.status = 408;
        apiError.code = "TIMEOUT";
        throw apiError;
      }
      if (error instanceof TypeError && error.message.includes("fetch")) {
        const apiError = new Error(
          "تعذر الاتصال بالخادم حالياً. حاول مرة أخرى.",
        ) as ApiError;
        apiError.status = 503;
        apiError.code = "NETWORK";
        throw apiError;
      }
      const apiError = new Error(
        sanitizeAuthenticatedErrorMessage(error.message),
      ) as ApiError;
      apiError.status = (error as ApiError).status || 500;
      apiError.code = (error as ApiError).code;
      throw apiError;
    }

    const unknownError = new Error(
      "تعذر إكمال الطلب حالياً. حاول مرة أخرى.",
    ) as ApiError;
    unknownError.status = 500;
    unknownError.code = "UNKNOWN";
    throw unknownError;
  }
}

/**
 * Portal API endpoints using authenticated fetch
 */
export const portalApi = {
  // Dashboard
  getDashboardStats: (days?: number) =>
    authenticatedFetch<any>(
      `/api/v1/portal/dashboard/stats${typeof days === "number" ? `?days=${Math.trunc(days)}` : ""}`,
    ),

  // Orders
  getOrders: (params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    return authenticatedFetch<any>(`/api/v1/portal/orders?${query}`);
  },

  getOrder: (orderId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/orders/${orderId}`),

  updateOrderStatus: (orderId: string, status: string, note?: string) =>
    authenticatedFetch<any>(`/api/v1/portal/orders/${orderId}/status`, {
      method: "PATCH",
      body: { status, note },
    }),

  // Conversations
  getConversations: (params?: { state?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.state) query.set("state", params.state);
    if (params?.limit) query.set("limit", String(params.limit));
    return authenticatedFetch<any>(`/api/v1/portal/conversations?${query}`);
  },

  getConversation: (conversationId: string) =>
    authenticatedFetch<any>(
      `/api/v1/portal/conversations/${conversationId}?includeMessages=true`,
    ),

  takeoverConversation: (conversationId: string) =>
    authenticatedFetch<any>(
      `/api/v1/portal/conversations/${conversationId}/takeover`,
      {
        method: "POST",
      },
    ),

  releaseConversation: (conversationId: string) =>
    authenticatedFetch<any>(
      `/api/v1/portal/conversations/${conversationId}/release`,
      {
        method: "POST",
      },
    ),

  sendMessage: (conversationId: string, text: string) =>
    authenticatedFetch<any>(
      `/api/v1/portal/conversations/${conversationId}/send`,
      {
        method: "POST",
        body: { text },
      },
    ),

  // Inventory
  getInventory: (params?: { search?: string; lowStock?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.lowStock) query.set("lowStock", "true");
    return authenticatedFetch<any>(`/api/v1/portal/inventory?${query}`);
  },

  updateStock: (productId: string, quantity: number, variantId?: string) =>
    authenticatedFetch<any>(`/api/v1/portal/inventory/${productId}/stock`, {
      method: "PATCH",
      body: { quantity, variantId },
    }),

  // Customers
  getCustomers: (params?: {
    search?: string;
    segment?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.segment) query.set("segment", params.segment);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    return authenticatedFetch<any>(`/api/v1/portal/customers?${query}`);
  },

  getCustomer: (customerId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/customers/${customerId}`),

  // Analytics
  getAnalytics: (params?: { startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    return authenticatedFetch<any>(`/api/v1/portal/analytics?${query}`);
  },

  // Team Management
  getStaff: () => authenticatedFetch<any>("/api/v1/portal/staff"),

  inviteStaff: (data: { email: string; name: string; role: string }) =>
    authenticatedFetch<any>("/api/v1/portal/staff/invite", {
      method: "POST",
      body: data,
    }),

  changeStaffPassword: (data: {
    currentPassword: string;
    newPassword: string;
  }) =>
    authenticatedFetch<any>("/api/v1/staff/change-password", {
      method: "POST",
      body: data,
    }),

  updateStaff: (
    staffId: string,
    data: {
      role?: string;
      status?: string;
      permissions?: Record<string, string[]>;
    },
  ) =>
    authenticatedFetch<any>(`/api/v1/portal/staff/${staffId}`, {
      method: "PUT",
      body: data,
    }),

  removeStaff: (staffId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/staff/${staffId}`, {
      method: "DELETE",
    }),

  // Delivery Drivers
  getDeliveryDrivers: () =>
    authenticatedFetch<any>("/api/v1/portal/delivery-drivers"),

  createDeliveryDriver: (data: {
    name: string;
    phone: string;
    whatsappNumber?: string;
    vehicleType?: string;
    notes?: string;
  }) =>
    authenticatedFetch<any>("/api/v1/portal/delivery-drivers", {
      method: "POST",
      body: data,
    }),

  updateDeliveryDriver: (
    id: string,
    data: {
      name?: string;
      phone?: string;
      whatsappNumber?: string;
      status?: string;
      vehicleType?: string;
      notes?: string;
    },
  ) =>
    authenticatedFetch<any>(`/api/v1/portal/delivery-drivers/${id}`, {
      method: "PUT",
      body: data,
    }),

  deleteDeliveryDriver: (id: string) =>
    authenticatedFetch<any>(`/api/v1/portal/delivery-drivers/${id}`, {
      method: "DELETE",
    }),

  assignDriverToOrder: (orderId: string, driverId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/orders/${orderId}/assign-driver`, {
      method: "POST",
      body: { driverId },
    }),

  autoAssignDriverToOrder: (orderId: string) =>
    authenticatedFetch<any>(
      `/api/v1/portal/orders/${orderId}/auto-assign-driver`,
      {
        method: "POST",
      },
    ),

  autoAssignAllUnassigned: () =>
    authenticatedFetch<any>("/api/v1/portal/delivery/auto-assign-all", {
      method: "POST",
    }),

  getAutoAssignSettings: () =>
    authenticatedFetch<any>("/api/v1/portal/delivery/auto-assign-settings"),

  getDeliveryPartners: () =>
    authenticatedFetch<{
      partners: Array<{ id: string; nameAr: string; nameEn: string }>;
    }>("/api/v1/portal/delivery/partners"),

  updateAutoAssignSettings: (data: {
    autoAssign?: boolean;
    mode?: string;
    notifyCustomer?: boolean;
  }) =>
    authenticatedFetch<any>("/api/v1/portal/delivery/auto-assign-settings", {
      method: "PUT",
      body: data,
    }),

  // Webhooks
  getWebhooks: () => authenticatedFetch<any>("/api/v1/portal/webhooks"),

  createWebhook: (data: { name: string; url: string; events: string[] }) =>
    authenticatedFetch<any>("/api/v1/portal/webhooks", {
      method: "POST",
      body: data,
    }),

  updateWebhook: (
    webhookId: string,
    data: Partial<{
      name: string;
      url: string;
      events: string[];
      isActive: boolean;
    }>,
  ) =>
    authenticatedFetch<any>(`/api/v1/portal/webhooks/${webhookId}`, {
      method: "PUT",
      body: data,
    }),

  updateWebhookStatus: (webhookId: string, status: "ACTIVE" | "PAUSED") =>
    authenticatedFetch<any>(`/api/v1/portal/webhooks/${webhookId}/status`, {
      method: "PUT",
      body: { status },
    }),

  deleteWebhook: (webhookId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/webhooks/${webhookId}`, {
      method: "DELETE",
    }),

  testWebhook: (webhookId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/webhooks/${webhookId}/test`, {
      method: "POST",
    }),

  testWebhookUrl: (data: { url: string; headers?: Record<string, string> }) =>
    authenticatedFetch<any>(`/api/v1/portal/webhooks/test-url`, {
      method: "POST",
      body: data,
    }),

  regenerateWebhookSecret: (webhookId: string) =>
    authenticatedFetch<any>(
      `/api/v1/portal/webhooks/${webhookId}/regenerate-secret`,
      {
        method: "POST",
      },
    ),

  getWebhookDeliveries: (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    return authenticatedFetch<any>(
      `/api/v1/portal/webhooks/deliveries${query.toString() ? `?${query}` : ""}`,
    );
  },

  // Integrations (ERP inbound)
  getErpIntegration: () =>
    authenticatedFetch<any>("/api/v1/portal/integrations/erp"),

  getErpIntegrationConfig: () =>
    authenticatedFetch<any>("/api/v1/portal/integrations/erp/config"),

  updateErpIntegrationConfig: (data: any) =>
    authenticatedFetch<any>("/api/v1/portal/integrations/erp/config", {
      method: "PUT",
      body: data,
    }),

  regenerateErpIntegrationSecret: () =>
    authenticatedFetch<any>(
      "/api/v1/portal/integrations/erp/regenerate-secret",
      {
        method: "POST",
      },
    ),

  sendErpIntegrationTest: () =>
    authenticatedFetch<any>("/api/v1/portal/integrations/erp/test", {
      method: "POST",
    }),

  pullErpIntegration: (data?: { mode?: "orders" | "payments" | "both" }) =>
    authenticatedFetch<any>("/api/v1/portal/integrations/erp/pull", {
      method: "POST",
      body: data || {},
    }),

  getErpIntegrationEvents: (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    return authenticatedFetch<any>(
      `/api/v1/portal/integrations/erp/events${query.toString() ? `?${query}` : ""}`,
    );
  },

  // Audit Logs
  getAuditLogs: (params?: {
    action?: string;
    resource?: string;
    staffId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.action) query.set("action", params.action);
    if (params?.resource) query.set("resource", params.resource);
    if (params?.staffId) query.set("staffId", params.staffId);
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    if (params?.limit) query.set("limit", String(params.limit));
    return authenticatedFetch<any>(`/api/v1/portal/audit?${query}`);
  },

  getAuditSummary: () =>
    authenticatedFetch<any>("/api/v1/portal/audit/summary"),

  exportAuditCsv: async (params?: {
    startDate?: string;
    endDate?: string;
    action?: string;
    resource?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    if (params?.action) query.set("action", params.action);
    if (params?.resource) query.set("resource", params.resource);
    const authTokens = await getAuthTokens();
    const headers: Record<string, string> = { Accept: "text/csv" };
    if (authTokens?.accessToken) {
      headers["Authorization"] = `Bearer ${authTokens.accessToken}`;
    }
    const response = await fetch(
      `${getBaseUrl()}/api/v1/portal/audit/export?${query.toString()}`,
      {
        headers,
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        sanitizeAuthenticatedErrorMessage(
          text || `HTTP ${response.status}`,
          response.status,
        ),
      );
    }
    return response.blob();
  },

  // Bulk Operations
  importProducts: (
    file: File,
    options?: { updateExisting?: boolean; dryRun?: boolean },
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.updateExisting) formData.append("updateExisting", "true");
    if (options?.dryRun) formData.append("dryRun", "true");

    return authenticatedFetch<any>("/api/v1/portal/products/import", {
      method: "POST",
      body: formData,
    });
  },

  importCustomers: (
    file: File,
    options?: { updateExisting?: boolean; dryRun?: boolean },
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.updateExisting) formData.append("updateExisting", "true");
    if (options?.dryRun) formData.append("dryRun", "true");

    return authenticatedFetch<any>("/api/v1/portal/customers/import", {
      method: "POST",
      body: formData,
    });
  },

  importInventory: (
    file: File,
    options?: { updateExisting?: boolean; dryRun?: boolean },
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.updateExisting) formData.append("updateExisting", "true");
    if (options?.dryRun) formData.append("dryRun", "true");

    return authenticatedFetch<any>("/api/v1/portal/inventory/import", {
      method: "POST",
      body: formData,
    });
  },

  importIngredients: (
    file: File,
    options?: { updateExisting?: boolean; dryRun?: boolean },
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    if (options?.updateExisting) formData.append("updateExisting", "true");
    if (options?.dryRun) formData.append("dryRun", "true");

    return authenticatedFetch<any>("/api/v1/portal/ingredients/import", {
      method: "POST",
      body: formData,
    });
  },

  exportProducts: (format: "csv" | "json" = "csv") =>
    authenticatedFetch<Blob>(`/api/v1/portal/products/export?format=${format}`),

  exportCustomers: (format: "csv" | "json" = "csv") =>
    authenticatedFetch<Blob>(
      `/api/v1/portal/customers/export?format=${format}`,
    ),

  exportInventory: (format: "csv" | "json" = "csv") =>
    authenticatedFetch<Blob>(
      `/api/v1/portal/inventory/export?format=${format}`,
    ),

  exportIngredients: (format: "csv" | "json" = "csv") =>
    authenticatedFetch<Blob>(
      `/api/v1/portal/ingredients/export?format=${format}`,
    ),

  getBulkOperations: () =>
    authenticatedFetch<any>("/api/v1/portal/bulk-operations"),

  // Notifications (portal-level)
  getPortalNotifications: (params?: { unreadOnly?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.unreadOnly) query.set("unreadOnly", "true");
    const qs = query.toString();
    return authenticatedFetch<any>(
      `/api/v1/portal/notifications${qs ? `?${qs}` : ""}`,
    );
  },

  markPortalNotificationRead: (notificationId: string) =>
    authenticatedFetch<any>(
      `/api/v1/portal/notifications/${notificationId}/read`,
      {
        method: "PUT",
      },
    ),

  markAllPortalNotificationsRead: () =>
    authenticatedFetch<any>("/api/v1/portal/notifications/read-all", {
      method: "PUT",
    }),

  deletePortalNotification: (notificationId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/notifications/${notificationId}`, {
      method: "DELETE",
    }),

  // Settings
  getSettings: () => authenticatedFetch<any>("/api/v1/portal/settings"),

  updateSettings: (data: any) =>
    authenticatedFetch<any>("/api/v1/portal/settings", {
      method: "PUT",
      body: data,
    }),

  // ==================== ONBOARDING & HELP ====================

  getOnboardingStatus: () =>
    authenticatedFetch<any>("/api/v1/portal/onboarding/status"),

  getHelpCenterData: () =>
    authenticatedFetch<any>("/api/v1/portal/help-center"),

  // ==================== AGENT ACTIVITY ====================

  getAgentActivity: (params?: {
    agent?: string;
    severity?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.agent) qs.set("agent", params.agent);
    if (params?.severity) qs.set("severity", params.severity);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return authenticatedFetch<any>(
      `/api/v1/portal/agent-activity${q ? "?" + q : ""}`,
    );
  },

  acknowledgeAgentAction: (actionId: string) =>
    authenticatedFetch<any>(
      `/api/v1/portal/agent-activity/${actionId}/acknowledge`,
      {
        method: "POST",
      },
    ),

  // ==================== LOYALTY ====================

  getLoyaltyTiers: (merchantId: string) =>
    authenticatedFetch<any>(`/api/merchants/${merchantId}/loyalty/tiers`),

  createLoyaltyTier: (merchantId: string, data: any) =>
    authenticatedFetch<any>(`/api/merchants/${merchantId}/loyalty/tiers`, {
      method: "POST",
      body: data,
    }),

  getCustomerPoints: (merchantId: string, customerPhone: string) =>
    authenticatedFetch<any>(
      `/api/merchants/${merchantId}/loyalty/customers/${encodeURIComponent(customerPhone)}/points`,
    ),

  addCustomerPoints: (
    merchantId: string,
    customerPhone: string,
    data: { points: number; reason: string; orderId?: string },
  ) =>
    authenticatedFetch<any>(
      `/api/merchants/${merchantId}/loyalty/customers/${encodeURIComponent(customerPhone)}/points`,
      {
        method: "POST",
        body: data,
      },
    ),

  redeemPoints: (merchantId: string, customerPhone: string, points: number) =>
    authenticatedFetch<any>(
      `/api/merchants/${merchantId}/loyalty/customers/${encodeURIComponent(customerPhone)}/redeem`,
      {
        method: "POST",
        body: { points },
      },
    ),

  getPromotions: (merchantId: string, activeOnly?: boolean) => {
    const query = activeOnly ? "?activeOnly=true" : "";
    return authenticatedFetch<any>(
      `/api/merchants/${merchantId}/loyalty/promotions${query}`,
    );
  },

  createPromotion: (merchantId: string, data: any) =>
    authenticatedFetch<any>(`/api/merchants/${merchantId}/loyalty/promotions`, {
      method: "POST",
      body: data,
    }),

  validatePromoCode: (
    merchantId: string,
    code: string,
    orderAmount?: number,
  ) => {
    const query = orderAmount ? `?orderAmount=${orderAmount}` : "";
    return authenticatedFetch<any>(
      `/api/merchants/${merchantId}/loyalty/promotions/validate/${code}${query}`,
    );
  },

  deactivatePromotion: (merchantId: string, promotionId: string) =>
    authenticatedFetch<any>(
      `/api/merchants/${merchantId}/loyalty/promotions/${promotionId}/deactivate`,
      {
        method: "POST",
      },
    ),

  activatePromotion: (merchantId: string, promotionId: string) =>
    authenticatedFetch<any>(
      `/api/merchants/${merchantId}/loyalty/promotions/${promotionId}/activate`,
      {
        method: "POST",
      },
    ),

  getLoyaltyAnalytics: (merchantId: string) =>
    authenticatedFetch<any>(`/api/merchants/${merchantId}/loyalty/analytics`),

  // Get loyalty members (customers with points)
  getLoyaltyMembers: (merchantId: string, page = 1, limit = 50) =>
    authenticatedFetch<any>(
      `/api/merchants/${merchantId}/loyalty/members?page=${page}&limit=${limit}`,
    ),

  enrollLoyaltyMember: (
    merchantId: string,
    data: { phone: string; name?: string },
  ) =>
    authenticatedFetch<any>(
      `/api/merchants/${merchantId}/loyalty/members/enroll`,
      {
        method: "POST",
        body: data,
      },
    ),

  // ==================== NOTIFICATIONS ====================

  getNotifications: (
    merchantId: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number },
  ) => {
    const query = new URLSearchParams();
    if (options?.unreadOnly) query.set("unreadOnly", "true");
    if (options?.limit) query.set("limit", String(options.limit));
    if (options?.offset) query.set("offset", String(options.offset));
    return authenticatedFetch<any>(
      `/api/v1/merchants/${merchantId}/notifications?${query}`,
    );
  },

  markNotificationRead: (merchantId: string, notificationId: string) =>
    authenticatedFetch<any>(
      `/api/v1/portal/notifications/${notificationId}/read`,
      {
        method: "PUT",
      },
    ),

  markAllNotificationsRead: (merchantId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/notifications/read-all`, {
      method: "PUT",
    }),

  deleteNotification: (merchantId: string, notificationId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/notifications/${notificationId}`, {
      method: "DELETE",
    }),

  getNotificationPreferences: async (merchantId: string) => {
    const settings = await authenticatedFetch<any>(`/api/v1/portal/settings`);
    const n = settings?.notifications || {};
    return {
      emailEnabled: !!n.notificationEmail,
      pushEnabled: true,
      whatsappEnabled: n.whatsappReportsEnabled || false,
      emailAddress: n.notificationEmail || "",
      whatsappNumber: n.whatsappNumber || n.notificationPhone || "",
      quietHoursStart: n.quietHoursStart || "",
      quietHoursEnd: n.quietHoursEnd || "",
      enabledTypes: n.enabledNotificationTypes || [
        "ORDER_PLACED",
        "ORDER_CONFIRMED",
        "ORDER_SHIPPED",
        "ORDER_DELIVERED",
        "LOW_STOCK",
        "ESCALATED_CONVERSATION",
        "PAYMENT_RECEIVED",
        "DAILY_SUMMARY",
        "SECURITY_ALERT",
        "ANOMALY_ALERT",
      ],
    };
  },

  updateNotificationPreferences: (merchantId: string, prefs: any) =>
    authenticatedFetch<any>(`/api/v1/portal/settings`, {
      method: "PATCH",
      body: {
        notifications: {
          whatsappReportsEnabled: prefs.whatsappEnabled ?? false,
          notificationEmail: prefs.emailEnabled
            ? prefs.emailAddress || null
            : null,
          whatsappNumber: prefs.whatsappEnabled
            ? prefs.whatsappNumber || null
            : null,
          quietHoursStart: prefs.quietHoursStart || null,
          quietHoursEnd: prefs.quietHoursEnd || null,
          enabledNotificationTypes: prefs.enabledTypes || [],
        },
      },
    }),

  // Portal notification config (SMTP/WhatsApp) + test send
  getNotificationConfigStatus: () =>
    authenticatedFetch<any>(`/api/v1/portal/notifications/status`),

  sendNotificationTest: (payload: {
    channel: "EMAIL" | "WHATSAPP" | "PUSH";
    target?: string;
  }) =>
    authenticatedFetch<any>(`/api/v1/portal/notifications/test`, {
      method: "POST",
      body: payload,
    }),

  // Push subscriptions (FCM/APNs/Web)
  getPushSubscriptions: () =>
    authenticatedFetch<any>(`/api/v1/portal/push-subscriptions`),

  registerPushSubscription: (payload: {
    provider: "FCM" | "APNS" | "WEB_PUSH";
    token?: string;
    platform?: string;
    userAgent?: string;
    subscription?: { endpoint: string; keys?: Record<string, string> };
  }) =>
    authenticatedFetch<any>(`/api/v1/portal/push-subscriptions`, {
      method: "POST",
      body: payload,
    }),

  removePushSubscription: (id: string) =>
    authenticatedFetch<any>(`/api/v1/portal/push-subscriptions/${id}`, {
      method: "DELETE",
    }),

  // POS Integrations
  getPosIntegrations: () =>
    authenticatedFetch<any[]>("/api/v1/portal/pos-integrations"),

  createPosIntegration: (data: {
    provider: string;
    name: string;
    credentials: Record<string, string>;
    config?: Record<string, any>;
  }) =>
    authenticatedFetch<any>("/api/v1/portal/pos-integrations", {
      method: "POST",
      body: data,
    }),

  updatePosIntegration: (
    id: string,
    data: Partial<{
      name: string;
      credentials: Record<string, string>;
      config: Record<string, any>;
      status: "ACTIVE" | "INACTIVE" | "ERROR";
      sync_interval_minutes: number;
      field_mapping: Record<string, string>;
    }>,
  ) =>
    authenticatedFetch<any>(`/api/v1/portal/pos-integrations/${id}`, {
      method: "PUT",
      body: data,
    }),

  deletePosIntegration: (id: string) =>
    authenticatedFetch<any>(`/api/v1/portal/pos-integrations/${id}`, {
      method: "DELETE",
    }),

  testPosIntegration: (id: string) =>
    authenticatedFetch<any>(`/api/v1/portal/pos-integrations/${id}/test`, {
      method: "POST",
    }),

  // ==================== ANALYTICS ====================

  getDashboardAnalytics: (merchantId: string, period?: string) => {
    const query = period ? `?period=${period}` : "";
    return authenticatedFetch<any>(
      `/api/merchants/${merchantId}/analytics/dashboard${query}`,
    );
  },

  getSalesAnalytics: (merchantId: string, period?: string) => {
    const query = period ? `?period=${period}` : "";
    return authenticatedFetch<any>(
      `/api/merchants/${merchantId}/analytics/sales${query}`,
    );
  },

  getCustomerAnalytics: (merchantId: string, period?: string) => {
    const query = period ? `?period=${period}` : "";
    return authenticatedFetch<any>(
      `/api/merchants/${merchantId}/analytics/customers${query}`,
    );
  },

  getConversationAnalytics: (merchantId: string, period?: string) => {
    const query = period ? `?period=${period}` : "";
    return authenticatedFetch<any>(
      `/api/merchants/${merchantId}/analytics/conversations${query}`,
    );
  },

  getRealTimeAnalytics: (merchantId: string) =>
    authenticatedFetch<any>(`/api/merchants/${merchantId}/analytics/realtime`),

  exportAnalytics: (
    merchantId: string,
    format: "json" | "csv",
    startDate: string,
    endDate: string,
  ) =>
    authenticatedFetch<any>(
      `/api/merchants/${merchantId}/analytics/export?format=${format}&startDate=${startDate}&endDate=${endDate}`,
    ),

  // ==================== EARLY ACCESS / WAITLIST ====================

  getEarlyAccessSignups: (merchantId: string) =>
    authenticatedFetch<{ signups: any[] }>(
      `/api/merchants/${merchantId}/early-access`,
    ),

  signupForEarlyAccess: (
    merchantId: string,
    data: {
      featureKey: string;
      email?: string;
      phone?: string;
      notes?: string;
    },
  ) =>
    authenticatedFetch<any>(`/api/merchants/${merchantId}/early-access`, {
      method: "POST",
      body: data,
    }),

  toggleEarlyAccess: (
    merchantId: string,
    data: {
      featureKey: string;
      enabled: boolean;
      email?: string;
      phone?: string;
    },
  ) =>
    authenticatedFetch<{ enabled: boolean; signup?: any }>(
      `/api/merchants/${merchantId}/early-access/toggle`,
      {
        method: "POST",
        body: data,
      },
    ),

  removeEarlyAccess: (merchantId: string, featureKey: string) =>
    authenticatedFetch<void>(
      `/api/merchants/${merchantId}/early-access/${featureKey}`,
      {
        method: "DELETE",
      },
    ),

  // ==================== ADMIN ====================

  // Admin Dashboard
  getAdminDashboardStats: () =>
    authenticatedFetch<any>("/api/v1/admin/dashboard/stats"),

  getAdminSystemHealth: () =>
    authenticatedFetch<any>("/api/v1/admin/system/health"),

  // Admin Merchants
  getAdminMerchants: (params?: {
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.category) query.set("category", params.category);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    return authenticatedFetch<any>(`/api/v1/admin/merchants?${query}`);
  },

  getAdminMerchant: (merchantId: string) =>
    authenticatedFetch<any>(`/api/v1/admin/merchants/${merchantId}`),

  createAdminMerchant: (data: any) =>
    authenticatedFetch<any>("/api/v1/admin/merchants", {
      method: "POST",
      body: data,
    }),

  updateAdminMerchant: (merchantId: string, data: any) =>
    authenticatedFetch<any>(`/api/v1/admin/merchants/${merchantId}`, {
      method: "PUT",
      body: data,
    }),

  toggleAdminMerchant: (merchantId: string, isActive: boolean) =>
    authenticatedFetch<any>(`/api/v1/admin/merchants/${merchantId}/toggle`, {
      method: "POST",
      body: { isActive },
    }),

  deleteAdminMerchant: (merchantId: string) =>
    authenticatedFetch<any>(`/api/v1/admin/merchants/${merchantId}`, {
      method: "DELETE",
    }),

  // Admin DLQ
  getAdminDlqEvents: (params?: {
    status?: string;
    type?: string;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.type) query.set("type", params.type);
    if (params?.limit) query.set("limit", String(params.limit));
    return authenticatedFetch<any>(`/api/v1/admin/dlq?${query}`);
  },

  retryAdminDlqEvent: (eventId: string) =>
    authenticatedFetch<any>(`/api/v1/admin/dlq/${eventId}/retry`, {
      method: "POST",
    }),

  dismissAdminDlqEvent: (eventId: string) =>
    authenticatedFetch<any>(`/api/v1/admin/dlq/${eventId}/dismiss`, {
      method: "POST",
    }),

  // Admin Entitlements
  getAdminEntitlements: (params?: {
    search?: string;
    plan?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.plan) query.set("plan", params.plan);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    return authenticatedFetch<any>(`/api/v1/admin/entitlements?${query}`);
  },

  getMerchantEntitlements: (merchantId: string) =>
    authenticatedFetch<any>(
      `/api/v1/admin/merchants/${merchantId}/entitlements`,
    ),

  updateMerchantEntitlement: (merchantId: string, data: any) =>
    authenticatedFetch<any>(
      `/api/v1/admin/merchants/${merchantId}/entitlements`,
      {
        method: "PUT",
        body: data,
      },
    ),

  // Admin Analytics
  getAdminAnalytics: (params?: {
    startDate?: string;
    endDate?: string;
    period?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    if (params?.period) query.set("period", params.period);
    return authenticatedFetch<any>(`/api/v1/admin/analytics?${query}`);
  },

  // Admin Feature Requests
  getAdminFeatureRequests: (params?: {
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.category) query.set("category", params.category);
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    return authenticatedFetch<any>(`/api/v1/admin/feature-requests?${query}`);
  },

  updateAdminFeatureRequest: (
    id: string,
    data: { status?: string; priority?: string },
  ) =>
    authenticatedFetch<any>(`/api/v1/admin/feature-requests/${id}/status`, {
      method: "PUT",
      body: data,
    }),

  // Admin Quotes
  getAdminQuotes: (params?: { status?: string; merchantId?: string }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set("status", params.status);
    if (params?.merchantId) query.set("merchantId", params.merchantId);
    return authenticatedFetch<any>(`/api/v1/admin/quotes?${query}`);
  },

  updateAdminQuote: (
    quoteId: string,
    data: {
      status?: string;
      quotedPriceCents?: number;
      currency?: string;
      notes?: string;
    },
  ) =>
    authenticatedFetch<any>(`/api/v1/admin/quotes/${quoteId}`, {
      method: "PUT",
      body: data,
    }),

  getAdminQuoteEvents: (quoteId: string) =>
    authenticatedFetch<any>(`/api/v1/admin/quotes/${quoteId}/events`),

  createAdminQuoteEvent: (
    quoteId: string,
    data: { note: string; action?: string },
  ) =>
    authenticatedFetch<any>(`/api/v1/admin/quotes/${quoteId}/events`, {
      method: "POST",
      body: data,
    }),

  applyPurchaseEvent: (payload: {
    merchantId: string;
    planCode: string;
    status?: string;
    source?: string;
    subscriptionId?: string;
    entitlements?: {
      enabledAgents?: string[];
      enabledFeatures?: string[];
      limits?: Record<string, any>;
      customPrice?: number | null;
    };
  }) =>
    authenticatedFetch<any>(`/api/v1/admin/billing/purchase-events`, {
      method: "POST",
      body: payload,
    }),

  // Subscription offers (admin)
  listSubscriptionOffers: () =>
    authenticatedFetch<{ offers: any[] }>(`/api/v1/admin/billing/offers`),
  createSubscriptionOffer: (payload: {
    code?: string;
    name: string;
    nameAr?: string;
    description?: string;
    descriptionAr?: string;
    discountType: "PERCENT" | "AMOUNT";
    discountValue: number;
    currency?: string;
    appliesToPlan?: string | null;
    startsAt?: string;
    endsAt?: string | null;
    isActive?: boolean;
    metadata?: Record<string, any>;
  }) =>
    authenticatedFetch<{ offer: any }>(`/api/v1/admin/billing/offers`, {
      method: "POST",
      body: payload,
    }),
  updateSubscriptionOffer: (
    offerId: string,
    payload: Partial<{
      code: string;
      name: string;
      nameAr: string;
      description: string;
      descriptionAr: string;
      discountType: "PERCENT" | "AMOUNT";
      discountValue: number;
      currency: string;
      appliesToPlan: string | null;
      startsAt: string;
      endsAt: string | null;
      isActive: boolean;
      metadata: Record<string, any>;
    }>,
  ) =>
    authenticatedFetch<{ offer: any }>(
      `/api/v1/admin/billing/offers/${offerId}`,
      {
        method: "PUT",
        body: payload,
      },
    ),
  disableSubscriptionOffer: (offerId: string) =>
    authenticatedFetch<{ success: boolean }>(
      `/api/v1/admin/billing/offers/${offerId}`,
      {
        method: "DELETE",
      },
    ),

  // AI Insights
  getSubstituteSuggestions: (_merchantId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/inventory/substitute-suggestions`),

  getRestockRecommendations: (_merchantId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/inventory/restock-recommendations`),

  getInventoryAiStatus: (_merchantId: string) =>
    authenticatedFetch<any>(`/api/v1/portal/inventory/ai-status`),

  getInventoryOrderConsumption: (params?: {
    days?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (typeof params?.days === "number" && Number.isFinite(params.days)) {
      query.set("days", String(Math.trunc(params.days)));
    }
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    const qs = query.toString();
    return authenticatedFetch<any>(
      `/api/v1/portal/inventory/order-consumption${qs ? `?${qs}` : ""}`,
    );
  },

  getInventoryMovementTrace: (params?: {
    days?: number;
    startDate?: string;
    endDate?: string;
    source?: string;
  }) => {
    const query = new URLSearchParams();
    if (typeof params?.days === "number" && Number.isFinite(params.days)) {
      query.set("days", String(Math.trunc(params.days)));
    }
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    if (params?.source) query.set("source", params.source);
    const qs = query.toString();
    return authenticatedFetch<any>(
      `/api/v1/portal/inventory/movement-trace${qs ? `?${qs}` : ""}`,
    );
  },

  getInventoryLocationBalance: (params?: {
    days?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (typeof params?.days === "number" && Number.isFinite(params.days)) {
      query.set("days", String(Math.trunc(params.days)));
    }
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    const qs = query.toString();
    return authenticatedFetch<any>(
      `/api/v1/portal/inventory/location-balance${qs ? `?${qs}` : ""}`,
    );
  },

  getInventoryMonthlyCostTrend: (params?: {
    months?: number;
    sku?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const query = new URLSearchParams();
    if (typeof params?.months === "number" && Number.isFinite(params.months)) {
      query.set("months", String(Math.trunc(params.months)));
    }
    if (params?.sku) query.set("sku", params.sku);
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    const qs = query.toString();
    return authenticatedFetch<any>(
      `/api/v1/portal/inventory/monthly-cost-trend${qs ? `?${qs}` : ""}`,
    );
  },

  // Security
  getSessions: () =>
    authenticatedFetch<{
      sessions: Array<{
        id: string;
        userAgent?: string;
        ipAddress?: string;
        createdAt: string;
        lastUsedAt: string;
        isCurrent: boolean;
      }>;
    }>(`/api/v1/portal/security/sessions`),

  revokeSession: (sessionId: string) =>
    authenticatedFetch<{ success: boolean }>(
      `/api/v1/portal/security/sessions/${sessionId}`,
      {
        method: "DELETE",
      },
    ),

  revokeAllSessions: () =>
    authenticatedFetch<{ success: boolean; revoked: number }>(
      `/api/v1/portal/security/sessions`,
      {
        method: "DELETE",
      },
    ),

  getSecurityAudit: (params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return authenticatedFetch<{
      logs: Array<{
        id: string;
        action: string;
        resource: string;
        resourceId?: string;
        ipAddress?: string;
        userAgent?: string;
        createdAt: string;
        metadata?: Record<string, any>;
      }>;
    }>(`/api/v1/portal/security/audit${qs ? `?${qs}` : ""}`);
  },

  // COD
  getCodSummary: (params?: {
    period?: "today" | "week" | "month" | "quarter" | "year" | "all";
    days?: number;
    startDate?: string;
    endDate?: string;
    courier?: string;
    branchId?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.period) query.set("period", params.period);
    if (typeof params?.days === "number" && Number.isFinite(params.days)) {
      query.set("days", String(Math.trunc(params.days)));
    }
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    if (params?.courier) query.set("courier", params.courier);
    if (params?.branchId) query.set("branchId", params.branchId);
    const qs = query.toString();
    return authenticatedFetch<{
      summary: {
        totalCodOrders: number;
        totalCodAmount: number;
        deliveredOrders: number;
        deliveredAmount: number;
        pendingOrders: number;
        pendingAmount: number;
        cancelledOrders: number;
        returnedOrders: number;
        collectedOrders?: number;
        collectedAmount?: number;
        reconciledOrders?: number;
        reconciledAmount?: number;
        disputedOrders?: number;
        disputedAmount?: number;
      };
      reconciliation: {
        totalStatements: number;
        reconciledStatements: number;
        totalCollected: number;
        totalFees: number;
        netReceived: number;
        matchedOrders: number;
        unmatchedOrders: number;
      };
      recentOrders: Array<{
        id: string;
        orderNumber: string;
        customerName: string;
        total: number;
        status: string;
        paymentStatus?: string;
        codStatus?: "pending" | "collected" | "reconciled" | "disputed";
        courier?: string;
        courierKey?: string;
        trackingNumber?: string;
        createdAt: string;
        codCollectedAt?: string;
        codReconciledAt?: string;
      }>;
      period?: {
        requested?: string | null;
        days?: number | null;
        startDate?: string | null;
        endDate?: string | null;
      };
      courier?: string;
    }>(`/api/v1/portal/cod/summary${qs ? `?${qs}` : ""}`);
  },

  reconcileCodOrder: (
    orderId: string,
    payload: { amountReceived?: number; notes?: string },
  ) =>
    authenticatedFetch<{ success: boolean }>(
      `/api/v1/portal/cod/reconcile/${orderId}`,
      {
        method: "POST",
        body: payload,
      },
    ),

  disputeCodOrder: (
    orderId: string,
    payload: { reason: string; expectedAmount?: number; actualAmount?: number },
  ) =>
    authenticatedFetch<{ success: boolean }>(
      `/api/v1/portal/cod/dispute/${orderId}`,
      {
        method: "POST",
        body: payload,
      },
    ),

  // CFO Report
  getCfoReport: (period?: "today" | "week" | "month" | "quarter" | "year") =>
    authenticatedFetch<{
      period: string;
      generatedAt: string;
      summary: {
        revenue: number;
        revenueGrowth: number;
        orderCount: number;
        orderGrowth: number;
        aov: number;
        uniqueCustomers: number;
      };
      orders: {
        total: number;
        delivered: number;
        cancelled: number;
        returned: number;
        deliveryRate: number;
      };
      cashFlow: {
        revenue: number;
        expenses: number;
        profit: number;
        profitMargin: number;
        pendingCod?: number;
        pendingOnline?: number;
        cashInHand?: number;
        netCashFlow?: number;
      };
      expenseBreakdown: Array<{
        category: string;
        amount: number;
      }>;
      topProducts: Array<{
        name: string;
        quantity: number;
        revenue: number;
      }>;
      inventory?: {
        available: boolean;
        totalValue: number;
        slowMovingValue: number;
        turnoverRate: number;
      };
      customers?: {
        totalCount: number;
        newCount: number;
        repeatCount: number;
        repeatRate: number;
        avgLtv: number;
      };
      alerts: Array<{
        type: string;
        message: string;
        severity: string;
      }>;
    }>(`/api/v1/portal/reports/cfo${period ? `?period=${period}` : ""}`),

  // AI-generated Weekly CFO Brief (from worker finance agent)
  getCfoAiBrief: () =>
    authenticatedFetch<{
      available: boolean;
      brief: {
        data: {
          totalRevenue: number;
          paidOrders: number;
          pendingPayments: number;
          codPendingAmount: number;
          refundsCount: number;
          refundsAmount: number;
          averageOrderValue: number;
          paymentMethodBreakdown: Record<string, number>;
          periodStart: string;
          periodEnd: string;
        };
        periodStart: string;
        periodEnd: string;
        generatedAt: string;
      } | null;
    }>("/api/v1/portal/reports/cfo/ai-brief"),

  // Accountant Pack Export
  getAccountantPack: (
    startDate: string,
    endDate: string,
    includes?: string[],
  ) => {
    const query = new URLSearchParams({ startDate, endDate });
    if (includes?.length) query.set("includes", includes.join(","));
    return authenticatedFetch<any>(`/api/v1/portal/accountant-pack?${query}`);
  },

  // COD Collection Reminders
  getCodReminders: () =>
    authenticatedFetch<{ reminders: any[] }>("/api/v1/portal/cod/reminders"),

  scheduleCodReminders: (daysPastDue?: number) =>
    authenticatedFetch<{ scheduled: number; totalOverdue: number }>(
      "/api/v1/portal/cod/reminders/schedule",
      {
        method: "POST",
        body: { daysPastDue: daysPastDue || 3 },
      },
    ),

  // Customer Segments
  getCustomerSegments: () =>
    authenticatedFetch<{ segments: any[]; total: number }>(
      "/api/v1/portal/customer-segments",
    ),

  // Followups
  getFollowups: (type?: string) => {
    const query = type ? `?type=${encodeURIComponent(type)}` : "";
    return authenticatedFetch<{ followups: any[] }>(
      `/api/v1/portal/followups${query}`,
    );
  },

  // Entitlements Catalog
  getEntitlementsCatalog: () =>
    authenticatedFetch<{
      currentPlan: string;
      enabledAgents: string[];
      enabledFeatures: string[];
      agents: Array<{
        id: string;
        nameAr: string;
        nameEn: string;
        descriptionAr: string;
        descriptionEn: string;
        status: "available" | "beta" | "coming_soon";
        eta?: string;
        color: string;
        dependencies: string[];
        features: string[];
        isEnabled: boolean;
        isIncludedInPlan: boolean;
      }>;
      features: Array<{
        id: string;
        nameAr: string;
        nameEn: string;
        descriptionAr: string;
        descriptionEn: string;
        status: "available" | "beta" | "coming_soon";
        eta?: string;
        requiredAgent?: string;
        dependencies: string[];
        isEnabled: boolean;
        isIncludedInPlan: boolean;
      }>;
      plans: Array<{
        id: string;
        enabledAgents: string[];
        enabledFeatures: string[];
        limits: {
          messagesPerMonth: number;
          whatsappNumbers: number;
          teamMembers: number;
          tokenBudgetDaily: number;
        };
        price?: number;
        currency?: string;
      }>;
      agentDependencies: Record<string, string[]>;
      featureDependencies: Record<string, string[]>;
      featureAgentMap: Record<string, string>;
    }>(`/api/v1/portal/entitlements/catalog`),

  // --- Cart Recovery ---
  getCartRecoveryKpi: (days?: number) =>
    authenticatedFetch<any>(
      `/api/v1/portal/dashboard/cart-recovery${days ? `?days=${days}` : ""}`,
    ),

  // --- Winback Campaign ---
  createWinbackCampaign: (options?: {
    discountPercent?: number;
    message?: string;
    validDays?: number;
  }) =>
    authenticatedFetch<any>("/api/v1/portal/campaigns/winback", {
      method: "POST",
      body: options || {},
    }),

  // --- Seasonal Campaign ---
  createSeasonalCampaign: (options: {
    message: string;
    segment?: "all" | "vip" | "loyal" | "regular" | "new" | "at_risk";
    occasion?: string;
    discountCode?: string;
  }) =>
    authenticatedFetch<{
      sent: number;
      totalTargeted: number;
      message: string;
    }>("/api/v1/portal/campaigns/seasonal", { method: "POST", body: options }),

  // --- Re-engagement Campaign ---
  createReengagementCampaign: (options: {
    message: string;
    inactiveDays?: number;
    discountCode?: string;
  }) =>
    authenticatedFetch<{
      sent: number;
      totalTargeted: number;
      message: string;
    }>("/api/v1/portal/campaigns/reengagement", {
      method: "POST",
      body: options,
    }),

  // --- Supplier Message ---
  sendSupplierMessage: (options: {
    supplierPhone: string;
    message: string;
    supplierName?: string;
  }) =>
    authenticatedFetch<{ success: boolean; message: string }>(
      "/api/v1/portal/campaigns/supplier-message",
      { method: "POST", body: options },
    ),

  // --- Supplier Management ---
  getSuppliers: () =>
    authenticatedFetch<{ suppliers: any[] }>("/api/v1/portal/suppliers"),

  createSupplier: (data: {
    name: string;
    contactName?: string;
    phone?: string;
    whatsappPhone?: string;
    email?: string;
    address?: string;
    paymentTerms?: string;
    leadTimeDays?: number;
    notes?: string;
    autoNotifyLowStock?: boolean;
    notifyThreshold?: string;
  }) =>
    authenticatedFetch<{ supplier: any }>("/api/v1/portal/suppliers", {
      method: "POST",
      body: data,
    }),

  updateSupplier: (id: string, data: Record<string, any>) =>
    authenticatedFetch<{ supplier: any }>(`/api/v1/portal/suppliers/${id}`, {
      method: "PATCH",
      body: data,
    }),

  deleteSupplier: (id: string) =>
    authenticatedFetch<{ success: boolean }>(`/api/v1/portal/suppliers/${id}`, {
      method: "DELETE",
    }),

  // --- Automation Center ---
  getAutomations: () =>
    authenticatedFetch<{ automations: any[]; recentLogs: any[] }>(
      "/api/v1/portal/automations",
    ),

  updateAutomation: (
    type: string,
    data: { isEnabled?: boolean; config?: Record<string, any> },
  ) =>
    authenticatedFetch<{ automation: any }>(
      `/api/v1/portal/automations/${type}`,
      { method: "PATCH", body: data },
    ),

  setAutomationSchedule: (type: string, checkIntervalHours: number) =>
    authenticatedFetch<{ automation: any }>(
      `/api/v1/portal/automations/${type}/schedule`,
      { method: "PATCH", body: { checkIntervalHours } },
    ),

  // --- Demand Forecasting ---
  getDemandForecast: (
    refreshOrParams:
      | boolean
      | {
          productId?: string;
          urgency?: string;
          page?: number;
          limit?: number;
        } = false,
  ) => {
    if (typeof refreshOrParams === "boolean") {
      return authenticatedFetch<{
        forecasts: any[];
        summary: Record<string, number>;
        fresh: boolean;
        computedAt: string;
      }>(
        `/api/v1/portal/analytics/forecast${refreshOrParams ? "?refresh=true" : ""}`,
      );
    }

    const qs = new URLSearchParams();
    if (refreshOrParams?.productId)
      qs.set("productId", refreshOrParams.productId);
    if (refreshOrParams?.urgency) qs.set("urgency", refreshOrParams.urgency);
    if (refreshOrParams?.page) qs.set("page", String(refreshOrParams.page));
    if (refreshOrParams?.limit) qs.set("limit", String(refreshOrParams.limit));

    return authenticatedFetch<{
      items: any[];
      total: number;
      page: number;
      limit: number;
      summary: { critical: number; high: number; medium: number; ok: number };
    }>(`/api/v1/portal/forecast/demand?${qs.toString()}`);
  },

  // --- Supplier Discovery ---
  getBranches: () =>
    authenticatedFetch<{
      branches: Array<{
        id: string;
        name: string;
        city?: string | null;
        address?: string | null;
        is_default?: boolean;
        is_active?: boolean;
      }>;
    }>("/api/v1/branches"),

  searchSuppliers: (
    query: string,
    options?: {
      branchId?: string;
      paymentTerms?: string;
      maxLeadTimeDays?: number;
    },
  ) =>
    authenticatedFetch<{
      results: any[];
      context?: {
        branchName?: string | null;
        city?: string | null;
        address?: string | null;
      };
      message?: string;
    }>(
      `/api/v1/portal/suppliers/search?q=${encodeURIComponent(query)}${options?.branchId ? `&branchId=${encodeURIComponent(options.branchId)}` : ""}${options?.paymentTerms ? `&paymentTerms=${encodeURIComponent(options.paymentTerms)}` : ""}${typeof options?.maxLeadTimeDays === "number" ? `&maxLeadTimeDays=${encodeURIComponent(String(options.maxLeadTimeDays))}` : ""}`,
    ),

  discoverSuppliers: (
    query: string,
    options?: { city?: string; branchId?: string },
  ) =>
    authenticatedFetch<{
      results: any[];
      fromCache: boolean;
      discoveryMode?: string;
      message?: string;
      context?: {
        branchName?: string | null;
        city?: string | null;
        address?: string | null;
      };
    }>(
      `/api/v1/portal/suppliers/discover?q=${encodeURIComponent(query)}${options?.city ? `&city=${encodeURIComponent(options.city)}` : ""}${options?.branchId ? `&branchId=${encodeURIComponent(options.branchId)}` : ""}`,
    ),

  getSupplierSuggestions: () =>
    authenticatedFetch<{ suggestions: any[]; count: number }>(
      `/api/v1/portal/suppliers/suggestions`,
    ),

  // --- Supplier ↔ Product linking ---
  getSupplierProducts: (supplierId: string) =>
    authenticatedFetch<{ products: any[] }>(
      `/api/v1/portal/suppliers/${supplierId}/products`,
    ),

  linkSupplierProduct: (
    supplierId: string,
    data: {
      productId: string;
      unitCost?: number;
      isPreferred?: boolean;
      notes?: string;
    },
  ) =>
    authenticatedFetch<{ link: any }>(
      `/api/v1/portal/suppliers/${supplierId}/products`,
      { method: "POST", body: data },
    ),

  unlinkSupplierProduct: (supplierId: string, productId: string) =>
    authenticatedFetch<{ success: boolean }>(
      `/api/v1/portal/suppliers/${supplierId}/products/${productId}`,
      { method: "DELETE" },
    ),

  // --- Daily Report ---
  getDailyReport: (date?: string) =>
    authenticatedFetch<any>(
      `/api/v1/portal/reports/daily${date ? `?date=${date}` : ""}`,
    ),

  // --- OCR Product Confirmations ---
  getOcrConfirmations: (status?: string) =>
    authenticatedFetch<{ confirmations: any[]; total: number }>(
      `/api/v1/portal/products/ocr/confirmations${status ? `?status=${status}` : ""}`,
    ),

  reviewOcrConfirmation: (id: string, action: "approve" | "reject") =>
    authenticatedFetch<{ success: boolean }>(
      `/api/v1/portal/products/ocr/confirmations/${id}/${action}`,
      { method: "POST" },
    ),

  // --- Followups ---
  completeFollowup: (followupId: string) =>
    authenticatedFetch<{ success: boolean }>(
      `/api/v1/portal/followups/${followupId}/complete`,
      { method: "POST" },
    ),

  // --- AI Assistant (GPT) ---
  chatWithAssistant: (
    message: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ) =>
    authenticatedFetch<{ reply: string }>(`/api/v1/portal/assistant/chat`, {
      method: "POST",
      body: { message, history: history || [] },
    }),

  // --- COD Collection Reminders ---
  sendCodReminders: () =>
    authenticatedFetch<{
      success: boolean;
      message: string;
      reminders: number;
      totalDrivers: number;
      totalPendingAmount: number;
      details: Array<{
        driver: string;
        sent: boolean;
        orderCount: number;
        totalAmount: number;
      }>;
    }>(`/api/v1/portal/delivery/cod-reminders`, { method: "POST" }),

  // --- Recipe / Ingredients (BOM) ---
  getRecipe: (catalogItemId: string) =>
    authenticatedFetch<{
      catalogItemId: string;
      ingredients: Array<{
        id: string;
        ingredient_inventory_item_id: string;
        ingredient_name: string;
        quantity_required: number;
        unit: string;
        is_optional: boolean;
        waste_factor: number;
        notes: string;
        ingredient_sku: string;
        ingredient_cost: number;
      }>;
      totalCostPerUnit: number;
      ingredientCount: number;
    }>(`/api/v1/portal/catalog/${catalogItemId}/recipe`),

  addRecipeIngredient: (
    catalogItemId: string,
    data: {
      ingredientInventoryItemId?: string;
      ingredientCatalogItemId?: string;
      ingredientName: string;
      quantityRequired: number;
      unit?: string;
      isOptional?: boolean;
      wasteFactor?: number;
      notes?: string;
      sortOrder?: number;
    },
  ) =>
    authenticatedFetch<any>(`/api/v1/portal/catalog/${catalogItemId}/recipe`, {
      method: "POST",
      body: data,
    }),

  updateRecipeIngredient: (
    catalogItemId: string,
    ingredientId: string,
    data: Partial<{
      ingredientName: string;
      quantityRequired: number;
      unit: string;
      isOptional: boolean;
      wasteFactor: number;
      notes: string;
      sortOrder: number;
    }>,
  ) =>
    authenticatedFetch<any>(
      `/api/v1/portal/catalog/${catalogItemId}/recipe/${ingredientId}`,
      { method: "PATCH", body: data },
    ),

  deleteRecipeIngredient: (catalogItemId: string, ingredientId: string) =>
    authenticatedFetch<{ success: boolean }>(
      `/api/v1/portal/catalog/${catalogItemId}/recipe/${ingredientId}`,
      { method: "DELETE" },
    ),

  checkItemAvailability: (catalogItemId: string) =>
    authenticatedFetch<{
      itemId: string;
      name: string;
      mode: "simple" | "recipe";
      availableQuantity: number;
      limitingIngredient: string | null;
      ingredients?: Array<{
        name: string;
        required: number;
        unit: string;
        stockOnHand: number;
        canMake: number;
      }>;
    }>(`/api/v1/portal/catalog/${catalogItemId}/availability`),

  // ─── AI: Generate product description ──────────────────────────────────
  generateProductDescription: (productId: string) =>
    authenticatedFetch<{ description: string }>(
      `/api/v1/portal/inventory/${productId}/ai-description`,
      { method: "POST" },
    ),

  // ─── AI: Suggest campaign audience ─────────────────────────────────────
  suggestCampaignAudience: (goal: string) =>
    authenticatedFetch<{
      recommendedSegmentId: string | null;
      segmentName: string;
      reason: string;
      estimatedSize: number;
      segments: Array<{
        id: string;
        name: string;
        size: number;
        match_score: number;
      }>;
    }>(`/api/v1/portal/campaigns/suggest-audience`, {
      method: "POST",
      body: { goal },
    }),

  // ─── Analytics: Subscription / token usage ──────────────────────────────
  getSubscriptionUsage: () =>
    authenticatedFetch<{
      tokensUsed: number;
      tokenLimit: number;
      tokenPct: number;
      conversationsUsed: number;
      conversationLimit: number;
      conversationPct: number;
      planName: string;
      periodEnd: string | null;
    }>(`/api/v1/portal/analytics/subscription-usage`),

  // ─── Analytics: WhatsApp delivery trend ────────────────────────────────
  getWhatsappDeliveryTrend: (days = 14) =>
    authenticatedFetch<{
      trend: Array<{
        date: string;
        sent: number;
        delivered: number;
        failed: number;
        rate: number;
      }>;
      overallRate: number;
    }>(`/api/v1/portal/analytics/whatsapp-delivery-trend?days=${days}`),

  // ─── Advanced Forecast Platform ────────────────────────────────────────

  getDemandForecastHistory: (productId: string) =>
    authenticatedFetch<{
      productId: string;
      productName: string;
      historicalData: Array<{ date: string; value: number }>;
      forecast7d: number;
      forecast14d: number;
      forecast30d: number;
      lower7d: number;
      upper7d: number;
      lower30d: number;
      upper30d: number;
      mape7d: number;
      confidence: number;
      trendPct: number;
      reasonCodes: Array<{ code: string; label: string; weight: number }>;
    }>(`/api/v1/portal/forecast/demand/${productId}/history`),

  getCashFlowForecast: (days = 30) =>
    authenticatedFetch<{
      merchantId: string;
      currentBalance: number;
      projection: Array<{
        date: string;
        inflow: number;
        outflow: number;
        balance: number;
      }>;
      runwayDays: number | null;
      riskDays: Array<{ date: string; reason: string }>;
      avgDailyInflow: number;
      avgDailyOutflow: number;
      forecastPeriodDays: number;
      confidence: number;
    }>(`/api/v1/portal/forecast/cashflow?days=${days}`),

  getChurnForecast: (limit = 50) =>
    authenticatedFetch<{
      items: Array<{
        customerId: string;
        customerName: string;
        customerPhone: string;
        daysSinceLastOrder: number;
        avgOrderCycleDays: number;
        churnProbability: number;
        lifetimeValue: number;
        riskLevel: string;
        recommendedAction: string;
      }>;
      summary: {
        critical: number;
        high: number;
        medium: number;
        total: number;
      };
    }>(`/api/v1/portal/forecast/churn?limit=${limit}`),

  getWorkforceForecast: () =>
    authenticatedFetch<{
      dayPattern: Array<{
        dayOfWeek: number;
        dayName: string;
        avgMessages: number;
      }>;
      hourPattern: Array<{
        hour: number;
        avgMessages: number;
        peakDay: string;
      }>;
      nextSevenDays: Array<{
        date: string;
        dayOfWeek: number;
        forecastMessages: number;
        forecastConversations: number;
      }>;
      peakHour: number;
      peakDay: string;
      confidence: number;
    }>(`/api/v1/portal/forecast/workforce`),

  getDeliveryRiskForecast: () =>
    authenticatedFetch<{
      items: Array<{
        orderId: string;
        orderNumber: string;
        customerName: string;
        zone: string;
        courier: string;
        delayProbability: number;
        estimatedDeliveryDate: string | null;
        riskFactors: string[];
      }>;
      highRiskCount: number;
    }>(`/api/v1/portal/forecast/delivery-risk`),

  getForecastModelMetrics: () =>
    authenticatedFetch<{
      latest: {
        mape: number;
        wmape: number;
        bias: number;
        mae: number;
        sampleSize: number;
      };
      history: any[];
    }>(`/api/v1/portal/forecast/model-metrics`),

  getReplenishmentList: (status = "pending") =>
    authenticatedFetch<{ items: any[]; total: number }>(
      `/api/v1/portal/forecast/replenishment?status=${status}`,
    ),

  runWhatIfScenario: (body: {
    type: "demand" | "cashflow" | "campaign" | "pricing";
    params: Record<string, any>;
  }) =>
    authenticatedFetch<{
      scenarioType: string;
      baselineValue: number;
      adjustedValue: number;
      delta: number;
      deltaPct: number;
      breakdownByItem?: Array<{
        id: string;
        name: string;
        baseline: number;
        adjusted: number;
      }>;
    }>(`/api/v1/portal/forecast/what-if`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  approveReplenishment: (id: string, poReference?: string) =>
    authenticatedFetch<{ ok: boolean; updated: any }>(
      `/api/v1/portal/forecast/replenishment/${id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poReference }),
      },
    ),
};

export default portalApi;

export const client = {
  auth: { apiFetch, authenticatedFetch, checkApiHealth, getConnectionStatus },
  merchants: merchantApi,
  admin: adminApi,
  payments: paymentsApi,
  ai: { portal: portalApi, vision: visionApi },
  team: portalApi,
  inventory: {
    merchant: merchantApi,
    portal: portalApi,
    branches: branchesApi,
  },
  billing: merchantApi,
  orders: { merchant: merchantApi, portal: portalApi, branches: branchesApi },
  conversations: merchantApi,
  branches: branchesApi,
  kpis: kpisApi,
};
