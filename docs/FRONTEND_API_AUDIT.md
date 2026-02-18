# Frontend Pages & API Calls — Comprehensive Audit

> **Scope:** `apps/portal/src/` · Next.js App Router  
> **Generated:** 2025  
> **API clients:** `portalApi` (JWT session, `authenticated-api.ts`) · `merchantApi` / `adminApi` / `paymentsApi` / `visionApi` / `kpisApi` (API-key, `api.ts`)

---

## Table of Contents

1. [Page-by-Page Audit](#1-page-by-page-audit)
2. [Components with API Calls](#2-components-with-api-calls)
3. [Hooks with API Calls](#3-hooks-with-api-calls)
4. [API Function Inventory — `portalApi`](#4-api-function-inventory--portalapi)
5. [API Function Inventory — `merchantApi`](#5-api-function-inventory--merchantapi)
6. [API Function Inventory — `adminApi` / `paymentsApi` / `visionApi` / `kpisApi`](#6-api-function-inventory--adminapi--paymentsapi--visionapi--kpisapi)
7. [Disconnected Features & Dead Code](#7-disconnected-features--dead-code)
8. [Issues & Recommendations](#8-issues--recommendations)

---

## 1. Page-by-Page Audit

### Public Pages

| #   | Route         | File                      | Reads                                     | Writes                                                     | Loading/Error   | Status                                                                     |
| --- | ------------- | ------------------------- | ----------------------------------------- | ---------------------------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| 1   | `/`           | `app/page.tsx`            | —                                         | —                                                          | N/A             | ✅ Static landing page, links to `/merchant` & `/admin`                    |
| 2   | `/login`      | `app/login/page.tsx`      | `getSession()`                            | `signIn('credentials')` (NextAuth)                         | ✅ Both         | ✅ Complete — demo creds shown in dev mode                                 |
| 3   | `/signup`     | `app/signup/page.tsx`     | —                                         | **NONE — `setTimeout` simulates**                          | ✅ Loading only | ⚠️ **PLACEHOLDER — form submission is FAKE, not connected to backend**     |
| 4   | `/pay/[code]` | `app/pay/[code]/page.tsx` | raw `fetch('/api/v1/payments/pay/:code')` | raw `fetch('/api/v1/payments/pay/:code/proof')` (FormData) | ✅ Both         | ⚠️ Raw `fetch`, no API helper — acceptable for public unauthenticated page |

### Merchant Area — Redirects & Static

| #   | Route                  | File                               | Reads | Writes | Loading/Error | Status                                                                     |
| --- | ---------------------- | ---------------------------------- | ----- | ------ | ------------- | -------------------------------------------------------------------------- |
| 5   | `/merchant`            | `app/merchant/page.tsx`            | —     | —      | N/A           | ✅ Redirect → `/merchant/dashboard`                                        |
| 6   | `/merchant/onboarding` | `app/merchant/onboarding/page.tsx` | —     | —      | N/A           | ⚠️ Static checklist, **no API call** — checklist completion is NOT dynamic |
| 7   | `/merchant/help`       | `app/merchant/help/page.tsx`       | —     | —      | N/A           | ✅ Static help center (links to other pages)                               |

### Merchant Area — Data Pages

| #   | Route                        | File                                     | Reads                                                                                                                                                       | Writes                                                                                                                                                                                                                                                                                                                                | Loading/Error   | Status                                                                                              |
| --- | ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| 8   | `/merchant/dashboard`        | `app/merchant/dashboard/page.tsx`        | `merchantApi.getDashboardStats()`                                                                                                                           | —                                                                                                                                                                                                                                                                                                                                     | ✅ Both         | ✅ Complete                                                                                         |
| 9   | `/merchant/orders`           | `app/merchant/orders/page.tsx`           | `merchantApi.getOrders()`                                                                                                                                   | raw `fetch('/api/v1/portal/orders/:id/reorder')`                                                                                                                                                                                                                                                                                      | ✅ Both + empty | ⚠️ Reorder uses raw `fetch` instead of API helper; CSV export is client-side only                   |
| 10  | `/merchant/customers`        | `app/merchant/customers/page.tsx`        | `portalApi.getCustomers()`, `portalApi.getCustomer()`                                                                                                       | —                                                                                                                                                                                                                                                                                                                                     | ✅ Both         | ✅ Complete (read-only)                                                                             |
| 11  | `/merchant/inventory`        | `app/merchant/inventory/page.tsx`        | `merchantApi.getInventoryItems()`, `.getInventorySummary()`, `.getInventoryAlerts()`, `.getVariants()`, `.getWarehouseLocations()`, `.getStockByLocation()` | `merchantApi.createInventoryItem()`, `.updateInventoryItem()`, `.deleteInventoryItem()`, `.updateStock()`, `.createVariant()`, `.updateVariant()`, `.deleteVariant()`, `.bulkUpdateStock()`, `.createWarehouseLocation()`, `.updateWarehouseLocation()`, `.deleteWarehouseLocation()`, `.createStockTransfer()`, `.recordShrinkage()` | ✅ Both         | ✅ Complete — full CRUD with tabs                                                                   |
| 12  | `/merchant/conversations`    | `app/merchant/conversations/page.tsx`    | `merchantApi.getConversations()`, `.getConversation()`                                                                                                      | `merchantApi.sendMessage()`, `.takeoverConversation()`, `.releaseConversation()`                                                                                                                                                                                                                                                      | ✅ Both         | ✅ Complete                                                                                         |
| 13  | `/merchant/analytics`        | `app/merchant/analytics/page.tsx`        | `merchantApi.getConversionAnalytics()`, `.getResponseTimeAnalytics()`, `.getPopularProductsAnalytics()`, `.getPeakHoursAnalytics()`                         | —                                                                                                                                                                                                                                                                                                                                     | ✅ Both         | ✅ Complete (read-only)                                                                             |
| 14  | `/merchant/settings`         | `app/merchant/settings/page.tsx`         | `merchantApi.getSettings()`                                                                                                                                 | `merchantApi.updateSettings()`                                                                                                                                                                                                                                                                                                        | ✅ Both         | ✅ Complete                                                                                         |
| 15  | `/merchant/payments`         | `app/merchant/payments/page.tsx`         | `paymentsApi.listPaymentLinks()`, `.listPaymentProofs()`                                                                                                    | `paymentsApi.createPaymentLink()`, `.cancelPaymentLink()`, `.verifyProof()`                                                                                                                                                                                                                                                           | ✅ Both         | ✅ Complete                                                                                         |
| 16  | `/merchant/payments/cod`     | `app/merchant/payments/cod/page.tsx`     | `portalApi.getCodSummary()`                                                                                                                                 | `portalApi.reconcileCodOrder()`, `.disputeCodOrder()`, raw `fetch('/api/v1/portal/cod/import-statement')`                                                                                                                                                                                                                             | ✅ Both         | ⚠️ COD import uses raw `fetch`                                                                      |
| 17  | `/merchant/payments/proofs`  | `app/merchant/payments/proofs/page.tsx`  | `merchantApi.getPaymentProofs()`                                                                                                                            | `merchantApi.verifyPaymentProof()`                                                                                                                                                                                                                                                                                                    | ✅ Both         | ✅ Complete                                                                                         |
| 18  | `/merchant/team`             | `app/merchant/team/page.tsx`             | `portalApi.getStaff()`                                                                                                                                      | `portalApi.inviteStaff()`, `.updateStaff()` (role + status), `.removeStaff()`                                                                                                                                                                                                                                                         | ✅ Both         | ✅ Complete                                                                                         |
| 19  | `/merchant/notifications`    | `app/merchant/notifications/page.tsx`    | `portalApi.getNotifications()`, `.getNotificationPreferences()`                                                                                             | `portalApi.markNotificationRead()`, `.markAllNotificationsRead()`, `.deleteNotification()`, `.updateNotificationPreferences()`                                                                                                                                                                                                        | ✅ Both         | ✅ Complete                                                                                         |
| 20  | `/merchant/webhooks`         | `app/merchant/webhooks/page.tsx`         | `portalApi.getWebhooks()`, `.getWebhookDeliveries()`                                                                                                        | `portalApi.createWebhook()`, `.updateWebhookStatus()`, `.testWebhookUrl()`, `.deleteWebhook()`, `.testWebhook()`, `.regenerateWebhookSecret()`                                                                                                                                                                                        | ✅ Both         | ✅ Complete                                                                                         |
| 21  | `/merchant/audit`            | `app/merchant/audit/page.tsx`            | `portalApi.getAuditLogs()`, `.getAuditSummary()`                                                                                                            | `portalApi.exportAuditCsv()` (download)                                                                                                                                                                                                                                                                                               | ✅ Both         | ✅ Complete                                                                                         |
| 22  | `/merchant/integrations`     | `app/merchant/integrations/page.tsx`     | `portalApi.getErpIntegration()`, `.getErpIntegrationEvents()`, `.getErpIntegrationConfig()`                                                                 | `portalApi.regenerateErpIntegrationSecret()`, `.sendErpIntegrationTest()`, `.updateErpIntegrationConfig()` ×2, `.pullErpIntegration()`                                                                                                                                                                                                | ✅ Both         | ✅ Complete                                                                                         |
| 23  | `/merchant/loyalty`          | `app/merchant/loyalty/page.tsx`          | `portalApi.getLoyaltyTiers()`, `.getPromotions()`, `.getLoyaltyAnalytics()`, `.getLoyaltyMembers()`                                                         | `portalApi.createLoyaltyTier()`, `.createPromotion()`, `.enrollLoyaltyMember()`, `.deactivatePromotion()`, `.activatePromotion()`                                                                                                                                                                                                     | ✅ Both         | ✅ Complete                                                                                         |
| 24  | `/merchant/expenses`         | `app/merchant/expenses/page.tsx`         | raw `fetch('/api/v1/portal/expenses')`, raw `fetch('/api/v1/portal/expenses/categories')`                                                                   | raw `fetch POST /api/v1/portal/expenses`, raw `fetch DELETE /api/v1/portal/expenses/:id`                                                                                                                                                                                                                                              | ✅ Both         | ⚠️ **Bypasses portalApi helper entirely — uses raw `fetch` with session token**                     |
| 25  | `/merchant/reports`          | `app/merchant/reports/page.tsx`          | `merchantApi.getDashboardStats()`, `.getConversionAnalytics()`, `.getPopularProductsAnalytics()`                                                            | `merchantApi.exportPDFReport()`                                                                                                                                                                                                                                                                                                       | ✅ Both         | ✅ Complete                                                                                         |
| 26  | `/merchant/reports/cfo`      | `app/merchant/reports/cfo/page.tsx`      | `portalApi.getCfoReport()`                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                                     | ✅ Both         | ✅ Complete (read-only)                                                                             |
| 27  | `/merchant/plan`             | `app/merchant/plan/page.tsx`             | `merchantApi.getMe()`, `.getBillingSummary()`, `.getBillingPlans()`, `.getBillingOffers()`, `.getEntitlementsCatalog()`, `.getQuotes()`                     | `merchantApi.createBillingCheckout()`, `.createFeatureRequest()`                                                                                                                                                                                                                                                                      | ✅ Both         | ⚠️ **Has hardcoded fallback data** (line 343: "Use API data when available, fallback to hardcoded") |
| 28  | `/merchant/kpis`             | `app/merchant/kpis/page.tsx`             | `kpisApi.getRecoveredCarts()`, `.getDeliveryFailures()`, `.getAgentPerformance()`, `.getRevenueKpis()`, `.getCustomerKpis()`                                | —                                                                                                                                                                                                                                                                                                                                     | ✅ Both         | ✅ Complete (read-only)                                                                             |
| 29  | `/merchant/security`         | `app/merchant/security/page.tsx`         | `portalApi.getSessions()`, `.getSecurityAudit()`                                                                                                            | `portalApi.revokeSession()`, `.revokeAllSessions()`                                                                                                                                                                                                                                                                                   | ✅ Both         | ✅ Complete                                                                                         |
| 30  | `/merchant/assistant`        | `app/merchant/assistant/page.tsx`        | —                                                                                                                                                           | `merchantApi.copilotMessage()`, `.copilotConfirm()`, `.copilotVoice()`                                                                                                                                                                                                                                                                | ✅ Both         | ✅ Complete                                                                                         |
| 31  | `/merchant/knowledge-base`   | `app/merchant/knowledge-base/page.tsx`   | `merchantApi.getCatalogItems()`, `.getKnowledgeBase()`, `.getPromotions()`                                                                                  | `merchantApi.updateCatalogItem()`, `.createCatalogItem()`, `.deleteCatalogItem()`, `.updateKnowledgeBase()` ×4, `.createPromotion()`                                                                                                                                                                                                  | ✅ Both         | ✅ Complete                                                                                         |
| 32  | `/merchant/feature-requests` | `app/merchant/feature-requests/page.tsx` | `merchantApi.getFeatureRequests()`, `.getQuotes()`, `.getQuoteEvents()`                                                                                     | `merchantApi.createQuoteEvent()`, `.acceptQuote()`, `.createFeatureRequest()`                                                                                                                                                                                                                                                         | ✅ Both         | ✅ Complete                                                                                         |
| 33  | `/merchant/import-export`    | `app/merchant/import-export/page.tsx`    | `portalApi.getBulkOperations()`                                                                                                                             | `portalApi.importProducts()`, `.importCustomers()`, `.importInventory()`, `.exportProducts()`, `.exportCustomers()`                                                                                                                                                                                                                   | ✅ Both         | ✅ Complete                                                                                         |
| 34  | `/merchant/vision`           | `app/merchant/vision/page.tsx`           | —                                                                                                                                                           | `visionApi.processReceipt()`, `.analyzeProduct()`, `.analyzeMedicine()`, `.extractText()`                                                                                                                                                                                                                                             | ✅ Both         | ✅ Complete                                                                                         |
| 35  | `/merchant/change-password`  | `app/merchant/change-password/page.tsx`  | —                                                                                                                                                           | `portalApi.changeStaffPassword()`                                                                                                                                                                                                                                                                                                     | ✅ Both         | ✅ Complete                                                                                         |
| 36  | `/merchant/roadmap`          | `app/merchant/roadmap/page.tsx`          | `portalApi.getEntitlementsCatalog()`, `.getEarlyAccessSignups()`                                                                                            | `portalApi.signupForEarlyAccess()`, `.toggleEarlyAccess()`                                                                                                                                                                                                                                                                            | ✅ Both         | ✅ Complete                                                                                         |

### Admin Area

| #   | Route                     | File                                  | Reads                                                                                | Writes                                                                                                                 | Loading/Error | Status                                                                         |
| --- | ------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| 37  | `/admin`                  | `app/admin/page.tsx`                  | —                                                                                    | —                                                                                                                      | N/A           | ✅ Redirect → `/admin/dashboard`                                               |
| 38  | `/admin/dashboard`        | `app/admin/dashboard/page.tsx`        | `portalApi.getAdminDashboardStats()`, `.getAdminSystemHealth()`                      | —                                                                                                                      | ✅ Both       | ✅ Complete                                                                    |
| 39  | `/admin/merchants`        | `app/admin/merchants/page.tsx`        | `portalApi.getAdminMerchants()`                                                      | `portalApi.toggleAdminMerchant()`, `.deleteAdminMerchant()`, `.createAdminMerchant()`                                  | ✅ Both       | ✅ Complete                                                                    |
| 40  | `/admin/analytics`        | `app/admin/analytics/page.tsx`        | `portalApi.getAdminAnalytics()`                                                      | —                                                                                                                      | ✅ Both       | ✅ Complete (read-only)                                                        |
| 41  | `/admin/dlq`              | `app/admin/dlq/page.tsx`              | `portalApi.getAdminDlqEvents()`                                                      | `portalApi.retryAdminDlqEvent()`, `.dismissAdminDlqEvent()`                                                            | ✅ Both       | ✅ Complete                                                                    |
| 42  | `/admin/entitlements`     | `app/admin/entitlements/page.tsx`     | `portalApi.getAdminEntitlements()`                                                   | `portalApi.updateMerchantEntitlement()`                                                                                | ✅ Both       | ✅ Complete                                                                    |
| 43  | `/admin/audit-logs`       | `app/admin/audit-logs/page.tsx`       | `portalApi.getAuditLogs()`                                                           | —                                                                                                                      | ✅ Both       | ⚠️ Uses **merchant-level** `getAuditLogs()` — no separate admin audit endpoint |
| 44  | `/admin/feature-requests` | `app/admin/feature-requests/page.tsx` | `portalApi.getAdminFeatureRequests()`, `.getAdminQuotes()`, `.getAdminQuoteEvents()` | `portalApi.updateAdminFeatureRequest()`, `.updateAdminQuote()`, `.createAdminQuoteEvent()`, `.applyPurchaseEvent()` ×2 | ✅ Both       | ✅ Complete                                                                    |
| 45  | `/admin/offers`           | `app/admin/offers/page.tsx`           | `portalApi.listSubscriptionOffers()`                                                 | `portalApi.updateSubscriptionOffer()`, `.createSubscriptionOffer()`, `.disableSubscriptionOffer()`                     | ✅ Both       | ✅ Complete                                                                    |

---

## 2. Components with API Calls

| Component                  | File                                                   | API Calls                                                                                                                                 | Type                                 |
| -------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Sidebar**                | `components/layout/sidebar.tsx`                        | `merchantApi.getKnowledgeBase()`, `merchantApi.getCatalogItems()`                                                                         | Read — onboarding-progress detection |
| **NotificationsPopover**   | `components/layout/notifications-popover.tsx`          | `portalApi.getPortalNotifications()`, `.markPortalNotificationRead()`, `.markAllPortalNotificationsRead()`, `.deletePortalNotification()` | Read + Write                         |
| **NotificationBell**       | `components/layout/notification-bell.tsx`              | `portalApi.getNotifications()`, `.markNotificationRead()`, `.markAllNotificationsRead()`                                                  | Read + Write                         |
| **ApiStatus**              | `components/layout/api-status.tsx`                     | `checkApiHealth()`                                                                                                                        | Read (health check)                  |
| **ApiStatusIndicator**     | `components/layout/api-status-indicator.tsx`           | `checkApiHealth()`, `getConnectionStatus()`                                                                                               | Read (health check)                  |
| **AiInsightsPanel**        | `components/inventory/ai-insights-panel.tsx`           | `portalApi.getSubstituteSuggestions()`, `portalApi.getRestockRecommendations()`                                                           | Read                                 |
| **RealtimeDashboard**      | `components/dashboard/realtime-dashboard.tsx`          | `portalApi.getRealTimeAnalytics()` + `useWebSocket`                                                                                       | Read + WebSocket                     |
| **WebSocketNotifications** | `components/notifications/websocket-notifications.tsx` | `useWebSocket` (no HTTP API)                                                                                                              | WebSocket events                     |

---

## 3. Hooks with API Calls

| Hook             | File                      | API Calls                           | Purpose                                                 |
| ---------------- | ------------------------- | ----------------------------------- | ------------------------------------------------------- |
| **useMerchant**  | `hooks/use-merchant.tsx`  | `merchantApi.getMe()`               | Context provider — current merchant data                |
| **useAnalytics** | `hooks/use-analytics.tsx` | `merchantApi.trackAnalyticsEvent()` | Fire-and-forget analytics events                        |
| **useWebSocket** | `hooks/use-websocket.ts`  | Socket.IO connection (no HTTP)      | Real-time events (orders, conversations, notifications) |

---

## 4. API Function Inventory — `portalApi`

> Source: `lib/authenticated-api.ts` · Auth: JWT Bearer token via NextAuth session

### Dashboard & Analytics

| Function                                          | Method | URL                                          | Used By                                       |
| ------------------------------------------------- | ------ | -------------------------------------------- | --------------------------------------------- |
| `getDashboardStats()`                             | GET    | `/api/v1/portal/dashboard/stats`             | — (pages use `merchantApi` version instead)   |
| `getDashboardAnalytics(merchantId, period?)`      | GET    | `/api/merchants/:id/analytics/dashboard`     | **⚠️ UNUSED**                                 |
| `getSalesAnalytics(merchantId, period?)`          | GET    | `/api/merchants/:id/analytics/sales`         | **⚠️ UNUSED**                                 |
| `getCustomerAnalytics(merchantId, period?)`       | GET    | `/api/merchants/:id/analytics/customers`     | **⚠️ UNUSED**                                 |
| `getConversationAnalytics(merchantId, period?)`   | GET    | `/api/merchants/:id/analytics/conversations` | **⚠️ UNUSED**                                 |
| `getRealTimeAnalytics(merchantId)`                | GET    | `/api/merchants/:id/analytics/realtime`      | `realtime-dashboard.tsx`                      |
| `exportAnalytics(merchantId, format, start, end)` | GET    | `/api/merchants/:id/analytics/export`        | **⚠️ UNUSED**                                 |
| `getAnalytics()`                                  | GET    | `/api/v1/portal/analytics`                   | — (pages use `merchantApi` analytics instead) |

### Orders

| Function                        | Method | URL                                | Used By                               |
| ------------------------------- | ------ | ---------------------------------- | ------------------------------------- |
| `getOrders(params?)`            | GET    | `/api/v1/portal/orders`            | — (pages use `merchantApi.getOrders`) |
| `getOrder(id)`                  | GET    | `/api/v1/portal/orders/:id`        | —                                     |
| `updateOrderStatus(id, status)` | PATCH  | `/api/v1/portal/orders/:id/status` | —                                     |

### Conversations

| Function                       | Method | URL                                         | Used By                     |
| ------------------------------ | ------ | ------------------------------------------- | --------------------------- |
| `getConversations(params?)`    | GET    | `/api/v1/portal/conversations`              | — (pages use `merchantApi`) |
| `getConversation(id)`          | GET    | `/api/v1/portal/conversations/:id`          | —                           |
| `takeoverConversation(id)`     | POST   | `/api/v1/portal/conversations/:id/takeover` | —                           |
| `releaseConversation(id)`      | POST   | `/api/v1/portal/conversations/:id/release`  | —                           |
| `sendMessage(convId, message)` | POST   | `/api/v1/portal/conversations/:id/messages` | —                           |

### Customers

| Function                | Method | URL                            | Used By               |
| ----------------------- | ------ | ------------------------------ | --------------------- |
| `getCustomers(params?)` | GET    | `/api/v1/portal/customers`     | `/merchant/customers` |
| `getCustomer(id)`       | GET    | `/api/v1/portal/customers/:id` | `/merchant/customers` |

### Inventory

| Function                           | Method | URL                                                | Used By                     |
| ---------------------------------- | ------ | -------------------------------------------------- | --------------------------- |
| `getInventory(params?)`            | GET    | `/api/v1/portal/inventory`                         | — (pages use `merchantApi`) |
| `updateStock(itemId, quantity)`    | PATCH  | `/api/v1/portal/inventory/:id/stock`               | —                           |
| `getSubstituteSuggestions(itemId)` | GET    | `/api/v1/portal/inventory/:id/substitutes`         | `ai-insights-panel.tsx`     |
| `getRestockRecommendations()`      | GET    | `/api/v1/portal/inventory/restock-recommendations` | `ai-insights-panel.tsx`     |

### Staff / Team

| Function                    | Method | URL                             | Used By                     |
| --------------------------- | ------ | ------------------------------- | --------------------------- |
| `getStaff()`                | GET    | `/api/v1/portal/staff`          | `/merchant/team`            |
| `inviteStaff(data)`         | POST   | `/api/v1/portal/staff`          | `/merchant/team`            |
| `updateStaff(id, data)`     | PUT    | `/api/v1/portal/staff/:id`      | `/merchant/team`            |
| `removeStaff(id)`           | DELETE | `/api/v1/portal/staff/:id`      | `/merchant/team`            |
| `changeStaffPassword(data)` | POST   | `/api/v1/staff/change-password` | `/merchant/change-password` |

### Webhooks

| Function                            | Method | URL                                             | Used By                                                 |
| ----------------------------------- | ------ | ----------------------------------------------- | ------------------------------------------------------- |
| `getWebhooks()`                     | GET    | `/api/v1/portal/webhooks`                       | `/merchant/webhooks`                                    |
| `createWebhook(data)`               | POST   | `/api/v1/portal/webhooks`                       | `/merchant/webhooks`                                    |
| `updateWebhook(id, data)`           | PUT    | `/api/v1/portal/webhooks/:id`                   | **⚠️ UNUSED** (pages use `updateWebhookStatus` instead) |
| `updateWebhookStatus(id, isActive)` | PUT    | `/api/v1/portal/webhooks/:id`                   | `/merchant/webhooks`                                    |
| `deleteWebhook(id)`                 | DELETE | `/api/v1/portal/webhooks/:id`                   | `/merchant/webhooks`                                    |
| `testWebhook(id)`                   | POST   | `/api/v1/portal/webhooks/:id/test`              | `/merchant/webhooks`                                    |
| `testWebhookUrl(url)`               | POST   | `/api/v1/portal/webhooks/test-url`              | `/merchant/webhooks`                                    |
| `regenerateWebhookSecret(id)`       | POST   | `/api/v1/portal/webhooks/:id/regenerate-secret` | `/merchant/webhooks`                                    |
| `getWebhookDeliveries(id)`          | GET    | `/api/v1/portal/webhooks/:id/deliveries`        | `/merchant/webhooks`                                    |

### ERP Integrations

| Function                           | Method | URL                                                 | Used By                  |
| ---------------------------------- | ------ | --------------------------------------------------- | ------------------------ |
| `getErpIntegration()`              | GET    | `/api/v1/portal/integrations/erp`                   | `/merchant/integrations` |
| `getErpIntegrationConfig()`        | GET    | `/api/v1/portal/integrations/erp/config`            | `/merchant/integrations` |
| `updateErpIntegrationConfig(data)` | PUT    | `/api/v1/portal/integrations/erp/config`            | `/merchant/integrations` |
| `regenerateErpIntegrationSecret()` | POST   | `/api/v1/portal/integrations/erp/regenerate-secret` | `/merchant/integrations` |
| `sendErpIntegrationTest()`         | POST   | `/api/v1/portal/integrations/erp/test`              | `/merchant/integrations` |
| `pullErpIntegration()`             | POST   | `/api/v1/portal/integrations/erp/pull`              | `/merchant/integrations` |
| `getErpIntegrationEvents(params?)` | GET    | `/api/v1/portal/integrations/erp/events`            | `/merchant/integrations` |

### Audit

| Function                  | Method | URL                            | Used By                                |
| ------------------------- | ------ | ------------------------------ | -------------------------------------- |
| `getAuditLogs(params?)`   | GET    | `/api/v1/portal/audit`         | `/merchant/audit`, `/admin/audit-logs` |
| `getAuditSummary()`       | GET    | `/api/v1/portal/audit/summary` | `/merchant/audit`                      |
| `exportAuditCsv(params?)` | GET    | `/api/v1/portal/audit/export`  | `/merchant/audit`                      |

### Bulk Import/Export

| Function                   | Method | URL                                          | Used By                   |
| -------------------------- | ------ | -------------------------------------------- | ------------------------- |
| `importProducts(file)`     | POST   | `/api/v1/portal/import/products` (FormData)  | `/merchant/import-export` |
| `importCustomers(file)`    | POST   | `/api/v1/portal/import/customers` (FormData) | `/merchant/import-export` |
| `importInventory(file)`    | POST   | `/api/v1/portal/import/inventory` (FormData) | `/merchant/import-export` |
| `exportProducts(format?)`  | GET    | `/api/v1/portal/export/products`             | `/merchant/import-export` |
| `exportCustomers(format?)` | GET    | `/api/v1/portal/export/customers`            | `/merchant/import-export` |
| `getBulkOperations()`      | GET    | `/api/v1/portal/bulk-operations`             | `/merchant/import-export` |

### Portal Notifications

| Function                           | Method | URL                                     | Used By                     |
| ---------------------------------- | ------ | --------------------------------------- | --------------------------- |
| `getPortalNotifications(params?)`  | GET    | `/api/v1/portal/notifications`          | `notifications-popover.tsx` |
| `markPortalNotificationRead(id)`   | PUT    | `/api/v1/portal/notifications/:id/read` | `notifications-popover.tsx` |
| `markAllPortalNotificationsRead()` | PUT    | `/api/v1/portal/notifications/read-all` | `notifications-popover.tsx` |
| `deletePortalNotification(id)`     | DELETE | `/api/v1/portal/notifications/:id`      | `notifications-popover.tsx` |

### Merchant Notifications (separate system)

| Function                                          | Method | URL                                            | Used By                                            |
| ------------------------------------------------- | ------ | ---------------------------------------------- | -------------------------------------------------- |
| `getNotifications(merchantId, params?)`           | GET    | `/api/merchants/:id/notifications`             | `/merchant/notifications`, `notification-bell.tsx` |
| `markNotificationRead(merchantId, notifId)`       | PUT    | `/api/merchants/:id/notifications/:nid/read`   | `/merchant/notifications`, `notification-bell.tsx` |
| `markAllNotificationsRead(merchantId)`            | PUT    | `/api/merchants/:id/notifications/read-all`    | `/merchant/notifications`, `notification-bell.tsx` |
| `deleteNotification(merchantId, notifId)`         | DELETE | `/api/merchants/:id/notifications/:nid`        | `/merchant/notifications`                          |
| `getNotificationPreferences(merchantId)`          | GET    | `/api/merchants/:id/notifications/preferences` | `/merchant/notifications`                          |
| `updateNotificationPreferences(merchantId, data)` | PUT    | `/api/merchants/:id/notifications/preferences` | `/merchant/notifications`                          |

### Notification Config & Push

| Function                         | Method | URL                                          | Used By       |
| -------------------------------- | ------ | -------------------------------------------- | ------------- |
| `getNotificationConfigStatus()`  | GET    | `/api/v1/portal/notifications/config-status` | **⚠️ UNUSED** |
| `sendNotificationTest(payload)`  | POST   | `/api/v1/portal/notifications/test`          | **⚠️ UNUSED** |
| `getPushSubscriptions()`         | GET    | `/api/v1/portal/push-subscriptions`          | **⚠️ UNUSED** |
| `registerPushSubscription(data)` | POST   | `/api/v1/portal/push-subscriptions`          | **⚠️ UNUSED** |
| `removePushSubscription(id)`     | DELETE | `/api/v1/portal/push-subscriptions/:id`      | **⚠️ UNUSED** |

### Settings

| Function               | Method | URL                       | Used By                                 |
| ---------------------- | ------ | ------------------------- | --------------------------------------- |
| `getSettings()`        | GET    | `/api/v1/portal/settings` | — (pages use `merchantApi.getSettings`) |
| `updateSettings(data)` | PUT    | `/api/v1/portal/settings` | —                                       |

### Loyalty & Promotions

| Function                                       | Method | URL                                                       | Used By             |
| ---------------------------------------------- | ------ | --------------------------------------------------------- | ------------------- |
| `getLoyaltyTiers(merchantId)`                  | GET    | `/api/merchants/:id/loyalty/tiers`                        | `/merchant/loyalty` |
| `createLoyaltyTier(merchantId, data)`          | POST   | `/api/merchants/:id/loyalty/tiers`                        | `/merchant/loyalty` |
| `getCustomerPoints(merchantId, phone)`         | GET    | `/api/merchants/:id/loyalty/points/:phone`                | **⚠️ UNUSED**       |
| `addCustomerPoints(merchantId, phone, data)`   | POST   | `/api/merchants/:id/loyalty/points/:phone`                | **⚠️ UNUSED**       |
| `redeemPoints(merchantId, phone, points)`      | POST   | `/api/merchants/:id/loyalty/points/:phone/redeem`         | **⚠️ UNUSED**       |
| `getPromotions(merchantId, params?)`           | GET    | `/api/merchants/:id/loyalty/promotions`                   | `/merchant/loyalty` |
| `createPromotion(merchantId, data)`            | POST   | `/api/merchants/:id/loyalty/promotions`                   | `/merchant/loyalty` |
| `validatePromoCode(merchantId, code, amount?)` | GET    | `/api/merchants/:id/loyalty/promotions/validate?code=...` | **⚠️ UNUSED**       |
| `deactivatePromotion(merchantId, id)`          | PATCH  | `/api/merchants/:id/loyalty/promotions/:pid/deactivate`   | `/merchant/loyalty` |
| `activatePromotion(merchantId, id)`            | PATCH  | `/api/merchants/:id/loyalty/promotions/:pid/activate`     | `/merchant/loyalty` |
| `getLoyaltyAnalytics(merchantId)`              | GET    | `/api/merchants/:id/loyalty/analytics`                    | `/merchant/loyalty` |
| `getLoyaltyMembers(merchantId, params?)`       | GET    | `/api/merchants/:id/loyalty/members`                      | `/merchant/loyalty` |
| `enrollLoyaltyMember(merchantId, data)`        | POST   | `/api/merchants/:id/loyalty/members`                      | `/merchant/loyalty` |

### Early Access & Roadmap

| Function                                       | Method | URL                                           | Used By             |
| ---------------------------------------------- | ------ | --------------------------------------------- | ------------------- |
| `getEarlyAccessSignups(merchantId)`            | GET    | `/api/merchants/:id/early-access`             | `/merchant/roadmap` |
| `signupForEarlyAccess(merchantId, featureKey)` | POST   | `/api/merchants/:id/early-access/:key`        | `/merchant/roadmap` |
| `toggleEarlyAccess(merchantId, featureKey)`    | PATCH  | `/api/merchants/:id/early-access/:key/toggle` | `/merchant/roadmap` |
| `removeEarlyAccess(merchantId, featureKey)`    | DELETE | `/api/merchants/:id/early-access/:key`        | **⚠️ UNUSED**       |

### Security

| Function              | Method | URL                                    | Used By              |
| --------------------- | ------ | -------------------------------------- | -------------------- |
| `getSessions()`       | GET    | `/api/v1/portal/security/sessions`     | `/merchant/security` |
| `revokeSession(id)`   | DELETE | `/api/v1/portal/security/sessions/:id` | `/merchant/security` |
| `revokeAllSessions()` | DELETE | `/api/v1/portal/security/sessions`     | `/merchant/security` |
| `getSecurityAudit()`  | GET    | `/api/v1/portal/security/audit`        | `/merchant/security` |

### COD (Cash on Delivery)

| Function                           | Method | URL                                       | Used By                  |
| ---------------------------------- | ------ | ----------------------------------------- | ------------------------ |
| `getCodSummary(params?)`           | GET    | `/api/v1/portal/cod/summary`              | `/merchant/payments/cod` |
| `reconcileCodOrder(orderId)`       | POST   | `/api/v1/portal/cod/orders/:id/reconcile` | `/merchant/payments/cod` |
| `disputeCodOrder(orderId, reason)` | POST   | `/api/v1/portal/cod/orders/:id/dispute`   | `/merchant/payments/cod` |

### CFO Report

| Function                | Method | URL                          | Used By                 |
| ----------------------- | ------ | ---------------------------- | ----------------------- |
| `getCfoReport(params?)` | GET    | `/api/v1/portal/reports/cfo` | `/merchant/reports/cfo` |

### Entitlements

| Function                   | Method | URL                                   | Used By                               |
| -------------------------- | ------ | ------------------------------------- | ------------------------------------- |
| `getEntitlementsCatalog()` | GET    | `/api/v1/portal/entitlements/catalog` | `/merchant/roadmap`, `/merchant/plan` |

### Admin Functions

| Function                               | Method | URL                                  | Used By                   |
| -------------------------------------- | ------ | ------------------------------------ | ------------------------- |
| `getAdminDashboardStats()`             | GET    | `/api/v1/admin/dashboard/stats`      | `/admin/dashboard`        |
| `getAdminSystemHealth()`               | GET    | `/api/v1/admin/system/health`        | `/admin/dashboard`        |
| `getAdminMerchants(params?)`           | GET    | `/api/v1/admin/merchants`            | `/admin/merchants`        |
| `getAdminMerchant(id)`                 | GET    | `/api/v1/admin/merchants/:id`        | —                         |
| `createAdminMerchant(data)`            | POST   | `/api/v1/admin/merchants`            | `/admin/merchants`        |
| `updateAdminMerchant(id, data)`        | PUT    | `/api/v1/admin/merchants/:id`        | —                         |
| `toggleAdminMerchant(id, active)`      | PUT    | `/api/v1/admin/merchants/:id`        | `/admin/merchants`        |
| `deleteAdminMerchant(id)`              | DELETE | `/api/v1/admin/merchants/:id`        | `/admin/merchants`        |
| `getAdminDlqEvents(params?)`           | GET    | `/api/v1/admin/dlq`                  | `/admin/dlq`              |
| `retryAdminDlqEvent(id)`               | POST   | `/api/v1/admin/dlq/:id/retry`        | `/admin/dlq`              |
| `dismissAdminDlqEvent(id)`             | DELETE | `/api/v1/admin/dlq/:id`              | `/admin/dlq`              |
| `getAdminEntitlements()`               | GET    | `/api/v1/admin/entitlements`         | `/admin/entitlements`     |
| `getMerchantEntitlements(id)`          | GET    | `/api/v1/admin/entitlements/:id`     | —                         |
| `updateMerchantEntitlement(id, data)`  | PUT    | `/api/v1/admin/entitlements/:id`     | `/admin/entitlements`     |
| `getAdminAnalytics(period?)`           | GET    | `/api/v1/admin/analytics`            | `/admin/analytics`        |
| `getAdminFeatureRequests(params?)`     | GET    | `/api/v1/admin/feature-requests`     | `/admin/feature-requests` |
| `updateAdminFeatureRequest(id, data)`  | PUT    | `/api/v1/admin/feature-requests/:id` | `/admin/feature-requests` |
| `getAdminQuotes(params?)`              | GET    | `/api/v1/admin/quotes`               | `/admin/feature-requests` |
| `updateAdminQuote(id, data)`           | PUT    | `/api/v1/admin/quotes/:id`           | `/admin/feature-requests` |
| `getAdminQuoteEvents(quoteId)`         | GET    | `/api/v1/admin/quotes/:id/events`    | `/admin/feature-requests` |
| `createAdminQuoteEvent(quoteId, data)` | POST   | `/api/v1/admin/quotes/:id/events`    | `/admin/feature-requests` |
| `applyPurchaseEvent(quoteId, data)`    | POST   | `/api/v1/admin/quotes/:id/purchase`  | `/admin/feature-requests` |

### Admin Billing / Offers

| Function                            | Method | URL                                        | Used By         |
| ----------------------------------- | ------ | ------------------------------------------ | --------------- |
| `listSubscriptionOffers()`          | GET    | `/api/v1/admin/billing/offers`             | `/admin/offers` |
| `createSubscriptionOffer(data)`     | POST   | `/api/v1/admin/billing/offers`             | `/admin/offers` |
| `updateSubscriptionOffer(id, data)` | PUT    | `/api/v1/admin/billing/offers/:id`         | `/admin/offers` |
| `disableSubscriptionOffer(id)`      | PATCH  | `/api/v1/admin/billing/offers/:id/disable` | `/admin/offers` |

---

## 5. API Function Inventory — `merchantApi`

> Source: `lib/api.ts` · Auth: API key parameter

### Core

| Function                                       | Method | URL                                  | Used By                                    |
| ---------------------------------------------- | ------ | ------------------------------------ | ------------------------------------------ |
| `getMe(merchantId, apiKey)`                    | GET    | `/api/merchants/:id`                 | `useMerchant` hook, `/merchant/plan`       |
| `getDashboardStats(merchantId, apiKey)`        | GET    | `/api/merchants/:id/dashboard-stats` | `/merchant/dashboard`, `/merchant/reports` |
| `getSettings(merchantId, apiKey)`              | GET    | `/api/merchants/:id/settings`        | `/merchant/settings`                       |
| `updateSettings(merchantId, apiKey, settings)` | PUT    | `/api/merchants/:id/settings`        | `/merchant/settings`                       |

### Orders

| Function                                 | Method | URL                         | Used By            |
| ---------------------------------------- | ------ | --------------------------- | ------------------ |
| `getOrders(merchantId, apiKey, params?)` | GET    | `/api/merchants/:id/orders` | `/merchant/orders` |

### Conversations

| Function                                           | Method | URL                                              | Used By                   |
| -------------------------------------------------- | ------ | ------------------------------------------------ | ------------------------- |
| `getConversations(merchantId, apiKey, params?)`    | GET    | `/api/merchants/:id/conversations`               | `/merchant/conversations` |
| `getConversation(merchantId, apiKey, convId)`      | GET    | `/api/merchants/:id/conversations/:cid`          | `/merchant/conversations` |
| `sendMessage(merchantId, apiKey, convId, msg)`     | POST   | `/api/merchants/:id/conversations/:cid/messages` | `/merchant/conversations` |
| `takeoverConversation(merchantId, apiKey, convId)` | POST   | `/api/merchants/:id/conversations/:cid/takeover` | `/merchant/conversations` |
| `releaseConversation(merchantId, apiKey, convId)`  | POST   | `/api/merchants/:id/conversations/:cid/release`  | `/merchant/conversations` |

### Inventory (comprehensive)

| Function                                         | Method | URL                                                     | Used By               |
| ------------------------------------------------ | ------ | ------------------------------------------------------- | --------------------- |
| `getInventoryItems(merchantId, apiKey, params?)` | GET    | `/api/merchants/:id/inventory/items`                    | `/merchant/inventory` |
| `getInventorySummary(merchantId, apiKey)`        | GET    | `/api/merchants/:id/inventory/summary`                  | `/merchant/inventory` |
| `getInventoryAlerts(merchantId, apiKey)`         | GET    | `/api/merchants/:id/inventory/alerts`                   | `/merchant/inventory` |
| `createInventoryItem(...)`                       | POST   | `/api/merchants/:id/inventory/items`                    | `/merchant/inventory` |
| `updateInventoryItem(...)`                       | PUT    | `/api/merchants/:id/inventory/items/:iid`               | `/merchant/inventory` |
| `deleteInventoryItem(...)`                       | DELETE | `/api/merchants/:id/inventory/items/:iid`               | `/merchant/inventory` |
| `updateStock(...)`                               | PATCH  | `/api/merchants/:id/inventory/items/:iid/stock`         | `/merchant/inventory` |
| `bulkUpdateStock(...)`                           | POST   | `/api/merchants/:id/inventory/items/bulk-stock`         | `/merchant/inventory` |
| `getVariants(...)`                               | GET    | `/api/merchants/:id/inventory/items/:iid/variants`      | `/merchant/inventory` |
| `createVariant(...)`                             | POST   | `/api/merchants/:id/inventory/items/:iid/variants`      | `/merchant/inventory` |
| `updateVariant(...)`                             | PUT    | `/api/merchants/:id/inventory/items/:iid/variants/:vid` | `/merchant/inventory` |
| `deleteVariant(...)`                             | DELETE | `/api/merchants/:id/inventory/items/:iid/variants/:vid` | `/merchant/inventory` |
| `getWarehouseLocations(...)`                     | GET    | `/api/merchants/:id/inventory/locations`                | `/merchant/inventory` |
| `createWarehouseLocation(...)`                   | POST   | `/api/merchants/:id/inventory/locations`                | `/merchant/inventory` |
| `updateWarehouseLocation(...)`                   | PUT    | `/api/merchants/:id/inventory/locations/:lid`           | `/merchant/inventory` |
| `deleteWarehouseLocation(...)`                   | DELETE | `/api/merchants/:id/inventory/locations/:lid`           | `/merchant/inventory` |
| `getStockByLocation(...)`                        | GET    | `/api/merchants/:id/inventory/stock-by-location`        | `/merchant/inventory` |
| `createStockTransfer(...)`                       | POST   | `/api/merchants/:id/inventory/transfers`                | `/merchant/inventory` |
| `recordShrinkage(...)`                           | POST   | `/api/merchants/:id/inventory/shrinkage`                | `/merchant/inventory` |
| `scanBarcode(...)`                               | GET    | `/api/merchants/:id/inventory/barcode/:code`            | —                     |

### Catalog / Knowledge Base

| Function                                        | Method | URL                                     | Used By                                   |
| ----------------------------------------------- | ------ | --------------------------------------- | ----------------------------------------- |
| `getCatalogItems(merchantId, apiKey)`           | GET    | `/api/merchants/:id/catalog/items`      | `/merchant/knowledge-base`, `sidebar.tsx` |
| `createCatalogItem(...)`                        | POST   | `/api/merchants/:id/catalog/items`      | `/merchant/knowledge-base`                |
| `updateCatalogItem(...)`                        | PUT    | `/api/merchants/:id/catalog/items/:cid` | `/merchant/knowledge-base`                |
| `deleteCatalogItem(...)`                        | DELETE | `/api/merchants/:id/catalog/items/:cid` | `/merchant/knowledge-base`                |
| `getKnowledgeBase(merchantId, apiKey)`          | GET    | `/api/merchants/:id/knowledge-base`     | `/merchant/knowledge-base`, `sidebar.tsx` |
| `updateKnowledgeBase(merchantId, apiKey, data)` | PUT    | `/api/merchants/:id/knowledge-base`     | `/merchant/knowledge-base`                |
| `getPromotions(merchantId, apiKey)`             | GET    | `/api/merchants/:id/promotions`         | `/merchant/knowledge-base`                |
| `createPromotion(merchantId, apiKey, promo)`    | POST   | `/api/merchants/:id/promotions`         | `/merchant/knowledge-base`                |

### Analytics

| Function                                         | Method | URL                                             | Used By                                    |
| ------------------------------------------------ | ------ | ----------------------------------------------- | ------------------------------------------ |
| `getConversionAnalytics(...)`                    | GET    | `/api/merchants/:id/analytics/conversion`       | `/merchant/analytics`, `/merchant/reports` |
| `getResponseTimeAnalytics(...)`                  | GET    | `/api/merchants/:id/analytics/response-times`   | `/merchant/analytics`                      |
| `getPopularProductsAnalytics(...)`               | GET    | `/api/merchants/:id/analytics/popular-products` | `/merchant/analytics`, `/merchant/reports` |
| `getPeakHoursAnalytics(...)`                     | GET    | `/api/merchants/:id/analytics/peak-hours`       | `/merchant/analytics`                      |
| `trackAnalyticsEvent(merchantId, apiKey, event)` | POST   | `/api/merchants/:id/analytics/events`           | `useAnalytics` hook                        |

### Feature Requests & Quotes

| Function                                          | Method | URL                                   | Used By                                        |
| ------------------------------------------------- | ------ | ------------------------------------- | ---------------------------------------------- |
| `getFeatureRequests(merchantId, apiKey, params?)` | GET    | `/api/merchants/:id/feature-requests` | `/merchant/feature-requests`                   |
| `createFeatureRequest(merchantId, apiKey, data)`  | POST   | `/api/merchants/:id/feature-requests` | `/merchant/feature-requests`, `/merchant/plan` |
| `getQuotes(merchantId, apiKey)`                   | GET    | `/api/merchants/:id/quotes`           | `/merchant/feature-requests`, `/merchant/plan` |
| `getQuoteEvents(quoteId, apiKey)`                 | GET    | `/api/v1/admin/quotes/:id/events`     | `/merchant/feature-requests`                   |
| `createQuoteEvent(quoteId, apiKey, data)`         | POST   | `/api/v1/admin/quotes/:id/events`     | `/merchant/feature-requests`                   |
| `acceptQuote(quoteId, apiKey)`                    | PUT    | `/api/v1/admin/quotes/:id`            | `/merchant/feature-requests`                   |

### Copilot / Assistant

| Function                                    | Method | URL                                | Used By               |
| ------------------------------------------- | ------ | ---------------------------------- | --------------------- |
| `copilotMessage(apiKey, message, context?)` | POST   | `/api/v1/copilot/message`          | `/merchant/assistant` |
| `copilotConfirm(apiKey, actionId)`          | POST   | `/api/v1/copilot/confirm`          | `/merchant/assistant` |
| `copilotVoice(apiKey, audioBlob)`           | POST   | `/api/v1/copilot/voice` (FormData) | `/merchant/assistant` |
| `copilotHistory(apiKey, limit?)`            | GET    | `/api/v1/copilot/history`          | **⚠️ UNUSED**         |

### Billing

| Function                                            | Method | URL                                       | Used By          |
| --------------------------------------------------- | ------ | ----------------------------------------- | ---------------- |
| `getBillingPlans(merchantId, apiKey)`               | GET    | `/api/merchants/:id/billing/plans`        | `/merchant/plan` |
| `getBillingSummary(merchantId, apiKey)`             | GET    | `/api/merchants/:id/billing/summary`      | `/merchant/plan` |
| `getBillingOffers(merchantId, apiKey)`              | GET    | `/api/merchants/:id/billing/offers`       | `/merchant/plan` |
| `createBillingCheckout(merchantId, apiKey, planId)` | POST   | `/api/merchants/:id/billing/checkout`     | `/merchant/plan` |
| `getEntitlementsCatalog(merchantId, apiKey)`        | GET    | `/api/merchants/:id/entitlements/catalog` | `/merchant/plan` |

### Reports

| Function                                       | Method | URL                                        | Used By             |
| ---------------------------------------------- | ------ | ------------------------------------------ | ------------------- |
| `exportPDFReport(merchantId, apiKey, type)`    | GET    | `/api/merchants/:id/reports/export`        | `/merchant/reports` |
| `getDailyReports(merchantId, apiKey, period?)` | GET    | `/api/merchants/:id/dashboard-stats/daily` | **⚠️ UNUSED**       |
| `getUsage(merchantId, apiKey, date?)`          | GET    | `/api/merchants/:id/usage`                 | **⚠️ UNUSED**       |
| `getFollowups(merchantId, apiKey, status?)`    | GET    | `/api/merchants/:id/followups`             | **⚠️ UNUSED**       |
| `cancelFollowup(followupId, apiKey)`           | POST   | `/api/v1/followups/:id/cancel`             | **⚠️ UNUSED**       |

### Payment Proofs (merchant side)

| Function                                        | Method | URL                                  | Used By                     |
| ----------------------------------------------- | ------ | ------------------------------------ | --------------------------- |
| `getPaymentProofs(merchantId, apiKey, params?)` | GET    | `/api/merchants/:id/payment-proofs`  | `/merchant/payments/proofs` |
| `verifyPaymentProof(proofId, apiKey, data)`     | PUT    | `/api/v1/payments/proofs/:id/verify` | `/merchant/payments/proofs` |

### Reservations

| Function                                      | Method | URL                               | Used By       |
| --------------------------------------------- | ------ | --------------------------------- | ------------- |
| `createReservation(merchantId, apiKey, data)` | POST   | `/api/merchants/:id/reservations` | **⚠️ UNUSED** |

### Webhooks (api.ts duplicate)

| Function                          | Method | URL                           | Used By                                        |
| --------------------------------- | ------ | ----------------------------- | ---------------------------------------------- |
| `updateWebhook(apiKey, id, data)` | PUT    | `/api/v1/portal/webhooks/:id` | **⚠️ UNUSED** (portalApi version used instead) |

---

## 6. API Function Inventory — `adminApi` / `paymentsApi` / `visionApi` / `kpisApi`

### `adminApi` (api.ts — API-key auth)

| Function                                    | Method | URL                                       | Used By                     |
| ------------------------------------------- | ------ | ----------------------------------------- | --------------------------- |
| `getMerchants(apiKey, params?)`             | GET    | `/api/v1/admin/merchants`                 | **⚠️ ENTIRE OBJECT UNUSED** |
| `getMerchant(apiKey, id)`                   | GET    | `/api/v1/admin/merchants/:id`             | **⚠️ UNUSED**               |
| `createMerchant(apiKey, data)`              | POST   | `/api/v1/admin/merchants`                 | **⚠️ UNUSED**               |
| `updateMerchantBudget(apiKey, id, budget)`  | PUT    | `/api/v1/admin/merchants/:id/budget`      | **⚠️ UNUSED**               |
| `updateMerchantAgents(apiKey, id, agents)`  | PUT    | `/api/v1/admin/merchants/:id/agents`      | **⚠️ UNUSED**               |
| `getDlqEvents(apiKey, params?)`             | GET    | `/api/v1/admin/dlq`                       | **⚠️ UNUSED**               |
| `replayDlqEvent(apiKey, id)`                | POST   | `/api/v1/admin/dlq/:id/replay`            | **⚠️ UNUSED**               |
| `getMetrics(apiKey)`                        | GET    | `/api/v1/admin/metrics`                   | **⚠️ UNUSED**               |
| `getReportsSummary(apiKey, period?)`        | GET    | `/api/v1/admin/reports/summary`           | **⚠️ UNUSED**               |
| `getAuditLogs(apiKey, params?)`             | GET    | `/api/v1/admin/audit`                     | **⚠️ UNUSED**               |
| `seedDatabase(apiKey)`                      | POST   | `/api/v1/admin/seed`                      | **⚠️ UNUSED**               |
| `getPendingProofs(apiKey, params?)`         | GET    | `/api/v1/admin/payment-proofs/pending`    | **⚠️ UNUSED**               |
| `verifyPaymentProof(apiKey, proofId, data)` | PUT    | `/api/v1/admin/payment-proofs/:id/verify` | **⚠️ UNUSED**               |

> **All admin pages use `portalApi` (JWT session auth) instead of `adminApi` (API key).** The entire `adminApi` object in `api.ts` is dead code.

### `paymentsApi` (api.ts)

| Function                             | Method | URL                                  | Used By                                 |
| ------------------------------------ | ------ | ------------------------------------ | --------------------------------------- |
| `createPaymentLink(apiKey, data)`    | POST   | `/api/v1/payments/links`             | `/merchant/payments`                    |
| `listPaymentLinks(apiKey, params?)`  | GET    | `/api/v1/payments/links`             | `/merchant/payments`                    |
| `getPaymentLink(apiKey, id)`         | GET    | `/api/v1/payments/links/:id`         | —                                       |
| `cancelPaymentLink(apiKey, id)`      | POST   | `/api/v1/payments/links/:id/cancel`  | `/merchant/payments`                    |
| `viewPaymentPage(code)`              | GET    | `/api/v1/payments/pay/:code`         | — (public `/pay/[code]` uses raw fetch) |
| `submitPaymentProof(code, formData)` | POST   | `/api/v1/payments/pay/:code/proof`   | — (public page uses raw fetch)          |
| `listPaymentProofs(apiKey, params?)` | GET    | `/api/v1/payments/proofs`            | `/merchant/payments`                    |
| `verifyProof(apiKey, id, data)`      | PUT    | `/api/v1/payments/proofs/:id/verify` | `/merchant/payments`                    |

### `visionApi` (api.ts)

| Function                         | Method | URL                           | Used By            |
| -------------------------------- | ------ | ----------------------------- | ------------------ |
| `processReceipt(apiKey, image)`  | POST   | `/api/v1/vision/receipt`      | `/merchant/vision` |
| `analyzeProduct(apiKey, image)`  | POST   | `/api/v1/vision/product`      | `/merchant/vision` |
| `analyzeMedicine(apiKey, image)` | POST   | `/api/v1/vision/medicine`     | `/merchant/vision` |
| `extractText(apiKey, image)`     | POST   | `/api/v1/vision/extract-text` | `/merchant/vision` |

### `kpisApi` (api.ts)

| Function                               | Method | URL                              | Used By          |
| -------------------------------------- | ------ | -------------------------------- | ---------------- |
| `getRecoveredCarts(apiKey, params?)`   | GET    | `/api/v1/kpis/recovered-carts`   | `/merchant/kpis` |
| `getDeliveryFailures(apiKey, params?)` | GET    | `/api/v1/kpis/delivery-failures` | `/merchant/kpis` |
| `getAgentPerformance(apiKey, params?)` | GET    | `/api/v1/kpis/agent-performance` | `/merchant/kpis` |
| `getRevenueKpis(apiKey, params?)`      | GET    | `/api/v1/kpis/revenue`           | `/merchant/kpis` |
| `getCustomerKpis(apiKey, params?)`     | GET    | `/api/v1/kpis/customers`         | `/merchant/kpis` |
| `getSummary(apiKey, params?)`          | GET    | `/api/v1/kpis/summary`           | —                |

---

## 7. Disconnected Features & Dead Code

### 7a. API Functions Defined but NEVER Used by Any Page/Component/Hook

| Function                                  | Client      | Category      |
| ----------------------------------------- | ----------- | ------------- |
| `portalApi.getDashboardAnalytics()`       | portalApi   | Analytics     |
| `portalApi.getSalesAnalytics()`           | portalApi   | Analytics     |
| `portalApi.getCustomerAnalytics()`        | portalApi   | Analytics     |
| `portalApi.getConversationAnalytics()`    | portalApi   | Analytics     |
| `portalApi.exportAnalytics()`             | portalApi   | Analytics     |
| `portalApi.getCustomerPoints()`           | portalApi   | Loyalty       |
| `portalApi.addCustomerPoints()`           | portalApi   | Loyalty       |
| `portalApi.redeemPoints()`                | portalApi   | Loyalty       |
| `portalApi.validatePromoCode()`           | portalApi   | Loyalty       |
| `portalApi.removeEarlyAccess()`           | portalApi   | Early Access  |
| `portalApi.getNotificationConfigStatus()` | portalApi   | Notifications |
| `portalApi.sendNotificationTest()`        | portalApi   | Notifications |
| `portalApi.getPushSubscriptions()`        | portalApi   | Push          |
| `portalApi.registerPushSubscription()`    | portalApi   | Push          |
| `portalApi.removePushSubscription()`      | portalApi   | Push          |
| `portalApi.updateWebhook()`               | portalApi   | Webhooks      |
| `merchantApi.copilotHistory()`            | merchantApi | Copilot       |
| `merchantApi.getDailyReports()`           | merchantApi | Reports       |
| `merchantApi.getUsage()`                  | merchantApi | Reports       |
| `merchantApi.getFollowups()`              | merchantApi | Followups     |
| `merchantApi.cancelFollowup()`            | merchantApi | Followups     |
| `merchantApi.createReservation()`         | merchantApi | Reservations  |
| `merchantApi.updateWebhook()`             | merchantApi | Webhooks      |
| **ALL `adminApi.*` (13 functions)**       | adminApi    | Admin         |

**Total: ~36 dead API functions**

### 7b. Backend Endpoints Likely Without Frontend

Based on the API function inventory, these likely have backend implementations but NO frontend UI:

- **Reservations** — `createReservation()` defined but no reservation page
- **Followups** — `getFollowups()`, `cancelFollowup()` defined but no followup page
- **Usage tracking** — `getUsage()` defined but no usage page
- **Daily reports** — `getDailyReports()` defined but no daily report page
- **Push notification management** — Full CRUD defined but no push subscription UI
- **Notification config/test** — Config status & test sending defined but no UI
- **Customer points management** — Points CRUD defined but no UI in loyalty page
- **Promo code validation** — `validatePromoCode()` defined but no UI
- **Copilot chat history** — `copilotHistory()` defined but assistant page doesn't load history

### 7c. Frontend Pages with No/Fake Backend Calls

| Page                   | Issue                                                                         |
| ---------------------- | ----------------------------------------------------------------------------- |
| `/signup`              | Form submission uses `setTimeout` — **not connected to any backend endpoint** |
| `/merchant/onboarding` | Static checklist — does NOT dynamically check completion status via API       |

---

## 8. Issues & Recommendations

### 🔴 Critical

| #   | Issue                                                                                                                                                        | Location                                   | Impact                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | -------------------------------------- |
| 1   | **Signup page is fake** — `setTimeout` simulates submission, no backend call                                                                                 | `app/signup/page.tsx`                      | Users cannot actually register         |
| 2   | **Dual API client architecture** — `portalApi` (JWT) and `merchantApi` (API key) duplicate many endpoints (orders, conversations, settings, inventory, etc.) | `lib/authenticated-api.ts` vs `lib/api.ts` | Maintenance burden, inconsistency risk |
| 3   | **`adminApi` object is 100% dead code** — all admin pages use `portalApi` instead                                                                            | `lib/api.ts` adminApi                      | ~200 lines of unused code              |

### 🟠 Major

| #   | Issue                                                                                                                                   | Location                                 | Impact                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| 4   | **Raw `fetch` instead of API helpers** in expenses page                                                                                 | `app/merchant/expenses/page.tsx`         | Bypasses error handling, auth refresh, retry logic |
| 5   | **Raw `fetch` for order reorder**                                                                                                       | `app/merchant/orders/page.tsx`           | No centralized error handling                      |
| 6   | **Raw `fetch` for COD import**                                                                                                          | `app/merchant/payments/cod/page.tsx`     | Inconsistent with rest of codebase                 |
| 7   | **Hardcoded fallback data in plan page**                                                                                                | `app/merchant/plan/page.tsx` (line 343)  | May show stale/incorrect pricing                   |
| 8   | **~36 unused API functions**                                                                                                            | `lib/authenticated-api.ts`, `lib/api.ts` | Dead code, false sense of coverage                 |
| 9   | **Dual notification systems** — `portalApi.getPortalNotifications()` (portal-level) AND `portalApi.getNotifications()` (merchant-level) | Multiple files                           | User confusion, duplicate notification UIs         |

### 🟡 Minor

| #   | Issue                                                                                              | Location                           | Impact                                    |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| 10  | Onboarding checklist is static, not API-driven                                                     | `app/merchant/onboarding/page.tsx` | Checklist can't reflect actual completion |
| 11  | Admin audit-logs page reuses merchant-level `getAuditLogs()`                                       | `app/admin/audit-logs/page.tsx`    | May show wrong scope of logs              |
| 12  | `paymentsApi.viewPaymentPage()` and `.submitPaymentProof()` exist but `/pay/[code]` uses raw fetch | `app/pay/[code]/page.tsx`          | Redundant API helpers unused              |
| 13  | `kpisApi.getSummary()` defined but unused                                                          | `lib/api.ts`                       | Dead code                                 |

### Recommended Actions

1. **Wire up `/signup`** to a real `POST /api/v1/staff/register` or similar endpoint
2. **Consolidate to one API client** — migrate all pages from `merchantApi` to `portalApi` (or vice-versa) to eliminate duplication
3. **Delete `adminApi`** from `api.ts` — it's 100% unused
4. **Refactor expenses page** to use `portalApi` like other pages
5. **Add missing UIs** for reservations, followups, usage, push subscriptions, customer points, or remove the dead API functions
6. **Make onboarding dynamic** — call APIs to check actual setup completion
7. **Audit notification systems** — decide if portal-level + merchant-level both need to exist, or consolidate
