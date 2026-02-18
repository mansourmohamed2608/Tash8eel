import { getSession } from "next-auth/react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// Client-side requests should go through the Next.js proxy (relative URL)
// to avoid CORS. Server-side requests can hit the API directly.
const getBaseUrl = () => (typeof window !== "undefined" ? "" : API_BASE_URL);

export interface ApiError extends Error {
  status: number;
  code?: string;
}

interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  apiKey?: string;
  skipAuth?: boolean;
  timeout?: number;
}

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

/**
 * Authenticated API client that automatically includes access tokens
 */
export async function authenticatedFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const {
    body,
    apiKey,
    skipAuth = false,
    timeout = 30000,
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

  // Get session for access token
  const session = !skipAuth ? await getSession() : null;
  if (!skipAuth) {
    if (session?.accessToken) {
      headers["Authorization"] = `Bearer ${session.accessToken}`;
    }
  }

  // Admin API key support for admin routes
  if ((session as any)?.adminKey) {
    const isAdminRoute =
      endpoint.startsWith("/api/v1/admin") || endpoint.startsWith("/api/admin");
    if (isAdminRoute) {
      headers["x-admin-api-key"] = (session as any).adminKey as string;
    }
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
        // Clear the session and redirect
        const { signOut } = await import("next-auth/react");
        await signOut({ callbackUrl: "/login", redirect: true });
        return new Promise(() => {}) as T; // never resolves, page is redirecting
      }

      const error = new Error(
        sanitizeErrorMessage(
          (data as any)?.message || `API Error: ${response.status}`,
          response.status,
        ),
      ) as ApiError;
      error.status = response.status;
      error.code = (data as any)?.code;
      throw error;
    }

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
        sanitizeErrorMessage(error.message),
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
    const session = await getSession();
    const headers: Record<string, string> = { Accept: "text/csv" };
    if (session?.accessToken) {
      headers["Authorization"] = `Bearer ${session.accessToken}`;
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
        sanitizeErrorMessage(
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
    return authenticatedFetch<any>(`/api/v1/portal/notifications?${query}`);
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
  }) => {
    const query = new URLSearchParams();
    if (params?.period) query.set("period", params.period);
    if (typeof params?.days === "number" && Number.isFinite(params.days)) {
      query.set("days", String(Math.trunc(params.days)));
    }
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    if (params?.courier) query.set("courier", params.courier);
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
};

export default portalApi;
