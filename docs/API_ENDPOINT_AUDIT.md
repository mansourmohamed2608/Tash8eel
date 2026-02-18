# Comprehensive Backend API Endpoint Audit

> **Generated**: Connectivity audit of ALL NestJS controllers and services  
> **Scope**: `apps/api/src/api/controllers/` (33 files) · `apps/api/src/application/services/` (21 files)

---

## CONTROLLERS

---

### CONTROLLER: admin.controller.ts

- **Prefix**: `v1/admin`
- **Guard**: `AdminApiKeyGuard`

| Method | Route                                         | Service Calls                                                                                                                        |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `v1/admin/metrics`                            | getMerchantStats(), getOrderStats(), getConversationStats(), getMessageStats(), outboxService.getEventStats(), dlqService.getStats() |
| POST   | `v1/admin/replay/:dlqEventId`                 | dlqService.replayEvent()                                                                                                             |
| GET    | `v1/admin/dlq`                                | dlqService.listEvents()                                                                                                              |
| GET    | `v1/admin/reports`                            | pool.query (cross-merchant reports)                                                                                                  |
| GET    | `v1/admin/reports/summary`                    | pool.query (platform summary)                                                                                                        |
| GET    | `v1/admin/merchants`                          | pool.query (list merchants)                                                                                                          |
| PUT    | `v1/admin/merchants/:merchantId/budget`       | merchantRepo.findById(), pool.query update                                                                                           |
| PUT    | `v1/admin/merchants/:merchantId/agents`       | merchantRepo.findById(), pool.query update                                                                                           |
| PUT    | `v1/admin/merchants/:merchantId/plan`         | applyPlanEntitlements() (internal)                                                                                                   |
| PUT    | `v1/admin/merchants/:merchantId/entitlements` | applyPlanEntitlements() (internal)                                                                                                   |
| GET    | `v1/admin/plans`                              | returns PLAN_ENTITLEMENTS constant                                                                                                   |
| GET    | `v1/admin/merchants/:merchantId`              | merchantRepo.findById(), pool queries                                                                                                |
| POST   | `v1/admin/seed`                               | merchantRepo.create(), seedCatalogItems()                                                                                            |
| POST   | `v1/admin/promotion/:merchantId`              | merchantRepo.findById(), pool.query update                                                                                           |

---

### CONTROLLER: analytics-events.controller.ts

Two classes in one file.

**Class: AnalyticsEventsController**

- **Prefix**: `v1/portal/analytics`
- **Guard**: `MerchantApiKeyGuard`

| Method | Route                        | Service Calls     |
| ------ | ---------------------------- | ----------------- |
| POST   | `v1/portal/analytics/events` | pool.query insert |
| GET    | `v1/portal/analytics/events` | pool.query select |

**Class: AnalyticsEventsAdminController**

- **Prefix**: `admin/analytics/events`
- **Guard**: `AdminApiKeyGuard`

| Method | Route                    | Service Calls     |
| ------ | ------------------------ | ----------------- |
| GET    | `admin/analytics/events` | pool.query select |

---

### CONTROLLER: analytics.controller.ts

- **Prefix**: `v1`
- **Guard**: `MerchantAuth()`

| Method | Route                                              | Service Calls                                               |
| ------ | -------------------------------------------------- | ----------------------------------------------------------- |
| GET    | `v1/merchants/:merchantId/analytics/dashboard`     | analyticsService.getDashboardMetrics()                      |
| GET    | `v1/merchants/:merchantId/analytics/sales`         | analyticsService.getSalesBreakdown()                        |
| GET    | `v1/merchants/:merchantId/analytics/customers`     | analyticsService.getCustomerInsights()                      |
| GET    | `v1/merchants/:merchantId/analytics/conversations` | analyticsService.getConversationAnalytics()                 |
| GET    | `v1/merchants/:merchantId/analytics/realtime`      | analyticsService.getRealTimeMetrics()                       |
| GET    | `v1/merchants/:merchantId/analytics/export`        | analyticsService.exportReport()                             |
| GET    | `v1/merchants/:merchantId/analytics/pdf`           | analyticsService.getDashboardMetrics() (generates HTML PDF) |

---

### CONTROLLER: assistant.controller.ts

- **Prefix**: `v1/portal/assistant`
- **Guard**: `MerchantApiKeyGuard`

| Method | Route                      | Service Calls           |
| ------ | -------------------------- | ----------------------- |
| POST   | `v1/portal/assistant/chat` | assistantService.chat() |

---

### CONTROLLER: billing-admin.controller.ts

- **Prefix**: `v1/admin/billing`
- **Guard**: `AdminApiKeyGuard`

| Method | Route                              | Service Calls               |
| ------ | ---------------------------------- | --------------------------- |
| POST   | `v1/admin/billing/purchase-events` | pool queries (entitlements) |
| GET    | `v1/admin/billing/offers`          | pool.query                  |
| POST   | `v1/admin/billing/offers`          | pool.query insert           |
| PUT    | `v1/admin/billing/offers/:id`      | pool.query update           |
| DELETE | `v1/admin/billing/offers/:id`      | pool.query (soft disable)   |

---

### CONTROLLER: billing.controller.ts

- **Prefix**: `v1/portal/billing`
- **Guard**: `MerchantApiKeyGuard`

| Method | Route                        | Service Calls     |
| ------ | ---------------------------- | ----------------- |
| GET    | `v1/portal/billing/plans`    | pool.query        |
| GET    | `v1/portal/billing/summary`  | pool.query        |
| GET    | `v1/portal/billing/offers`   | pool.query        |
| POST   | `v1/portal/billing/checkout` | pool.query insert |

---

### CONTROLLER: catalog.controller.ts

- **Prefix**: `v1/catalog`
- **Guard**: `AdminApiKeyGuard`

| Method | Route                                  | Service Calls                                                             |
| ------ | -------------------------------------- | ------------------------------------------------------------------------- |
| POST   | `v1/catalog/upsert`                    | catalogRepo.findByName/findBySku/create/update(), merchantRepo.findById() |
| GET    | `v1/catalog/:merchantId/items`         | catalogRepo.findByMerchant(), merchantRepo.findById()                     |
| GET    | `v1/catalog/:merchantId/items/:itemId` | catalogRepo.findById()                                                    |
| POST   | `v1/catalog/:merchantId/items`         | catalogRepo.create(), merchantRepo.findById()                             |
| PUT    | `v1/catalog/:merchantId/items/:itemId` | catalogRepo.findById(), catalogRepo.update()                              |
| DELETE | `v1/catalog/:merchantId/items/:itemId` | catalogRepo.findById(), catalogRepo.delete()                              |
| POST   | `v1/catalog/:merchantId/search`        | catalogRepo.findByMerchant() + in-memory scoring                          |

---

### CONTROLLER: conversations.controller.ts

- **Prefix**: `v1/conversations`
- **Guard**: `AdminApiKeyGuard`

| Method | Route                               | Service Calls                                                 |
| ------ | ----------------------------------- | ------------------------------------------------------------- |
| GET    | `v1/conversations/:id`              | conversationRepo.findById(), messageRepo.findByConversation() |
| GET    | `v1/conversations`                  | conversationRepo.findByMerchant()                             |
| POST   | `v1/conversations/:id/takeover`     | conversationRepo.update()                                     |
| POST   | `v1/conversations/:id/release`      | conversationRepo.update()                                     |
| POST   | `v1/conversations/:id/lock`         | redisService.set/get()                                        |
| POST   | `v1/conversations/:id/unlock`       | redisService.get/del()                                        |
| POST   | `v1/conversations/:id/send-message` | messageRepo.create(), conversationRepo.update()               |

---

### CONTROLLER: copilot.controller.ts

- **Prefix**: `v1/portal/copilot`
- **Guards**: `MerchantApiKeyGuard`, `RolesGuard`

| Method | Route                                 | Service Calls                                                                                        |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| POST   | `v1/portal/copilot/message`           | copilotAiService.parseCommand(), dispatcherService.executeQuery(), auditService.log()                |
| POST   | `v1/portal/copilot/voice`             | transcriptionFactory.getAdapter(), copilotAiService.parseCommand(), dispatcherService.executeQuery() |
| POST   | `v1/portal/copilot/confirm`           | copilotAiService.getPendingAction/confirmAction(), dispatcherService.execute(), auditService.log()   |
| GET    | `v1/portal/copilot/history`           | copilotAiService.getHistory()                                                                        |
| GET    | `v1/portal/copilot/pending/:actionId` | copilotAiService.getPendingAction()                                                                  |

---

### CONTROLLER: early-access.controller.ts

- **Prefix**: root `@Controller()`
- **Guards**: `MerchantAuth()` (merchant routes), `AdminApiKeyGuard` (admin route)

| Method | Route                                            | Service Calls                 |
| ------ | ------------------------------------------------ | ----------------------------- |
| GET    | `merchants/:merchantId/early-access`             | pool.query                    |
| POST   | `merchants/:merchantId/early-access`             | pool.query upsert             |
| POST   | `merchants/:merchantId/early-access/toggle`      | pool.query                    |
| DELETE | `merchants/:merchantId/early-access/:featureKey` | pool.query                    |
| GET    | `admin/early-access`                             | pool.query (AdminApiKeyGuard) |

---

### CONTROLLER: feature-requests.controller.ts

Two classes in one file.

**Class: FeatureRequestsController**

- **Prefix**: `v1/portal/feature-requests`
- **Guard**: `MerchantApiKeyGuard`

| Method | Route                        | Service Calls                                               |
| ------ | ---------------------------- | ----------------------------------------------------------- |
| GET    | `v1/portal/feature-requests` | pool.query                                                  |
| POST   | `v1/portal/feature-requests` | pool.query (also creates quote_requests for QUOTE category) |

**Class: FeatureRequestsAdminController**

- **Prefix**: `v1/admin/feature-requests`
- **Guard**: `AdminApiKeyGuard`

| Method | Route                                  | Service Calls     |
| ------ | -------------------------------------- | ----------------- |
| GET    | `v1/admin/feature-requests`            | pool.query        |
| PUT    | `v1/admin/feature-requests/:id/status` | pool.query update |

---

### CONTROLLER: followups.controller.ts

- **Prefix**: `v1/merchants/:merchantId/followups`
- **Guard**: `AdminApiKeyGuard`

| Method | Route                                             | Service Calls     |
| ------ | ------------------------------------------------- | ----------------- |
| GET    | `v1/merchants/:merchantId/followups`              | pool.query        |
| GET    | `v1/merchants/:merchantId/followups/:id`          | pool.query        |
| POST   | `v1/merchants/:merchantId/followups`              | pool.query insert |
| POST   | `v1/merchants/:merchantId/followups/:id/cancel`   | pool.query update |
| POST   | `v1/merchants/:merchantId/followups/:id/send-now` | pool.query update |

---

### CONTROLLER: health.controller.ts

- **Prefix**: root `@Controller()`
- **Guard**: NONE (`@SkipThrottle()`)

| Method | Route             | Service Calls                                   |
| ------ | ----------------- | ----------------------------------------------- |
| GET    | `health`          | liveness probe (returns OK)                     |
| GET    | `ready`           | pool.query('SELECT 1'), redisService.set/get()  |
| GET    | `health/detailed` | pool.query, redisService, process.memoryUsage() |

---

### CONTROLLER: inbox.controller.ts

- **Prefix**: `v1/inbox`
- **Guard**: `MerchantApiKeyGuard`

| Method | Route              | Service Calls                 |
| ------ | ------------------ | ----------------------------- |
| POST   | `v1/inbox/message` | inboxService.processMessage() |

---

### CONTROLLER: integrations-public.controller.ts

- **Prefix**: `v1/integrations/erp`
- **Guard**: NONE (uses manual `x-integration-secret` header validation)

| Method | Route                                    | Service Calls                                                                     |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------------- |
| POST   | `v1/integrations/erp/:merchantId/events` | integrationService.getOrCreateErpEndpoint(), integrationService.processErpEvent() |

---

### CONTROLLER: integrations.controller.ts

- **Prefix**: `v1/portal/integrations`
- **Guard**: `MerchantApiKeyGuard`

| Method | Route                                          | Service Calls                                                           |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `v1/portal/integrations/erp`                   | integrationService.getOrCreateErpEndpoint()                             |
| GET    | `v1/portal/integrations/erp/config`            | integrationService.getErpConfig()                                       |
| PUT    | `v1/portal/integrations/erp/config`            | integrationService.updateErpConfig(), auditService.logFromRequest()     |
| POST   | `v1/portal/integrations/erp/regenerate-secret` | integrationService.regenerateErpSecret(), auditService.logFromRequest() |
| POST   | `v1/portal/integrations/erp/test`              | integrationService.processErpEvent() (test.ping)                        |
| POST   | `v1/portal/integrations/erp/pull`              | integrationService.pullErpEvents()                                      |
| GET    | `v1/portal/integrations/erp/events`            | integrationService.listEvents()                                         |

---

### CONTROLLER: internal-ai.controller.ts

- **Prefix**: `internal/ai`
- **Guard**: `InternalApiGuard`

| Method | Route                                        | Service Calls                                    |
| ------ | -------------------------------------------- | ------------------------------------------------ |
| POST   | `internal/ai/inventory/substitution-ranking` | inventoryAiService.generateSubstitutionRanking() |
| POST   | `internal/ai/inventory/restock-insight`      | inventoryAiService.generateRestockInsight()      |
| POST   | `internal/ai/inventory/supplier-message`     | inventoryAiService.generateSupplierMessage()     |
| GET    | `internal/ai/token-usage/:merchantId`        | inventoryAiService.getTokenUsage()               |
| POST   | `internal/ai/ops/lead-score`                 | opsAiService.calculateLeadScore()                |
| POST   | `internal/ai/ops/detect-objection`           | opsAiService.detectObjection()                   |
| POST   | `internal/ai/ops/next-best-action`           | opsAiService.determineNextBestAction()           |
| POST   | `internal/ai/ops/order-confirmation`         | opsAiService.generateOrderConfirmationSummary()  |
| POST   | `internal/ai/ops/objection-response`         | opsAiService.generateObjectionResponse()         |
| POST   | `internal/ai/finance/calculate-profit`       | financeAiService.calculateProfitMetrics()        |
| POST   | `internal/ai/finance/cod-reconciliation`     | financeAiService.calculateCodReconciliation()    |
| POST   | `internal/ai/finance/margin-alerts`          | financeAiService.detectMarginAlerts()            |
| POST   | `internal/ai/finance/spending-alert`         | financeAiService.detectSpendingAlert()           |
| POST   | `internal/ai/finance/anomaly-narrative`      | financeAiService.generateAnomalyNarrative()      |
| POST   | `internal/ai/finance/cfo-brief`              | financeAiService.generateCfoBrief()              |

---

### CONTROLLER: inventory.controller.ts

- **Prefix**: `v1/inventory`
- **Guards**: `MerchantApiKeyGuard`, `EntitlementGuard`
- **Entitlements**: `@RequiresFeature('INVENTORY')`, `@RequiresAgent('INVENTORY_AGENT')`

| Method | Route                                                          | Service Calls                  |
| ------ | -------------------------------------------------------------- | ------------------------------ |
| GET    | `v1/inventory/:merchantId/items`                               | pool.query                     |
| GET    | `v1/inventory/:merchantId/items/:itemId`                       | pool.query                     |
| POST   | `v1/inventory/:merchantId/items`                               | pool.query insert              |
| PUT    | `v1/inventory/:merchantId/items/:itemId`                       | pool.query update              |
| DELETE | `v1/inventory/:merchantId/items/:itemId`                       | pool.query                     |
| GET    | `v1/inventory/:merchantId/variants`                            | pool.query                     |
| POST   | `v1/inventory/:merchantId/variants`                            | pool.query insert              |
| PUT    | `v1/inventory/:merchantId/variants/:variantId`                 | pool.query update              |
| DELETE | `v1/inventory/:merchantId/variants/:variantId`                 | pool.query                     |
| POST   | `v1/inventory/:merchantId/variants/:variantId/stock`           | pool.query                     |
| POST   | `v1/inventory/:merchantId/stock/bulk`                          | pool.query (bulk stock update) |
| POST   | `v1/inventory/:merchantId/stock/transfer`                      | pool.query                     |
| POST   | `v1/inventory/:merchantId/stock/import`                        | pool.query                     |
| GET    | `v1/inventory/:merchantId/barcode/:barcode`                    | pool.query                     |
| GET    | `v1/inventory/:merchantId/locations`                           | pool.query                     |
| POST   | `v1/inventory/:merchantId/reservations`                        | pool.query                     |
| POST   | `v1/inventory/:merchantId/reservations/:reservationId/confirm` | pool.query                     |
| POST   | `v1/inventory/:merchantId/reservations/:reservationId/release` | pool.query                     |
| GET    | `v1/inventory/:merchantId/reports/summary`                     | pool.query                     |
| GET    | `v1/inventory/:merchantId/reports/low-stock`                   | pool.query                     |
| GET    | `v1/inventory/:merchantId/reports/movements`                   | pool.query                     |
| GET    | `v1/inventory/:merchantId/alerts`                              | pool.query                     |
| PUT    | `v1/inventory/:merchantId/alerts/:alertId/acknowledge`         | pool.query                     |
| PUT    | `v1/inventory/:merchantId/alerts/:alertId/dismiss`             | pool.query                     |
| GET    | `v1/inventory/:merchantId/warehouse-locations`                 | pool.query                     |
| POST   | `v1/inventory/:merchantId/warehouse-locations`                 | pool.query                     |
| DELETE | `v1/inventory/:merchantId/warehouse-locations/:locationId`     | pool.query                     |
| GET    | `v1/inventory/:merchantId/stock-by-location`                   | pool.query                     |
| POST   | `v1/inventory/:merchantId/stock-by-location`                   | pool.query                     |
| POST   | `v1/inventory/:merchantId/stock-by-location/transfer`          | pool.query                     |

---

### CONTROLLER: kpi.controller.ts

- **Prefix**: `v1/kpis`
- **Guards**: `MerchantApiKeyGuard`, `EntitlementGuard`
- **Entitlement**: `@RequiresFeature('KPI_DASHBOARD')`

| Method | Route                       | Service Calls                         |
| ------ | --------------------------- | ------------------------------------- |
| GET    | `v1/kpis/recovered-carts`   | kpiService.getRecoveredCartStats()    |
| GET    | `v1/kpis/delivery-failures` | kpiService.getDeliveryFailureStats()  |
| GET    | `v1/kpis/agent-performance` | kpiService.getAgentPerformanceStats() |
| GET    | `v1/kpis/revenue`           | kpiService.getRevenueKpis()           |
| GET    | `v1/kpis/customers`         | kpiService.getCustomerKpis()          |
| GET    | `v1/kpis/summary`           | all 5 kpiService methods in parallel  |

---

### CONTROLLER: loyalty.controller.ts

- **Prefix**: `merchants/:merchantId/loyalty`
- **Guards**: `MerchantApiKeyGuard`, `EntitlementGuard`
- **Entitlements**: `@RequiresFeature('LOYALTY')`, `@RequiresAgent('MARKETING_AGENT')`

| Method | Route                                                              | Service Calls                        |
| ------ | ------------------------------------------------------------------ | ------------------------------------ |
| GET    | `merchants/:merchantId/loyalty/tiers`                              | loyaltyService.getTiers()            |
| POST   | `merchants/:merchantId/loyalty/tiers`                              | loyaltyService.createTier()          |
| GET    | `merchants/:merchantId/loyalty/customers/:customerPhone/points`    | loyaltyService.getCustomerPoints()   |
| POST   | `merchants/:merchantId/loyalty/customers/:customerPhone/points`    | loyaltyService.addPoints()           |
| POST   | `merchants/:merchantId/loyalty/customers/:customerPhone/redeem`    | loyaltyService.redeemPoints()        |
| GET    | `merchants/:merchantId/loyalty/promotions`                         | loyaltyService.getPromotions()       |
| POST   | `merchants/:merchantId/loyalty/promotions`                         | loyaltyService.createPromotion()     |
| GET    | `merchants/:merchantId/loyalty/promotions/validate/:code`          | loyaltyService.validatePromoCode()   |
| POST   | `merchants/:merchantId/loyalty/promotions/:promotionId/deactivate` | loyaltyService.deactivatePromotion() |
| POST   | `merchants/:merchantId/loyalty/promotions/:promotionId/activate`   | loyaltyService.activatePromotion()   |
| POST   | `merchants/:merchantId/loyalty/members/enroll`                     | loyaltyService.enrollMember()        |
| GET    | `merchants/:merchantId/loyalty/members`                            | loyaltyService.getLoyaltyMembers()   |
| GET    | `merchants/:merchantId/loyalty/analytics`                          | loyaltyService.getLoyaltyAnalytics() |

---

### CONTROLLER: merchant-catalog.controller.ts

- **Prefix**: `v1/portal/catalog`
- **Guard**: `MerchantApiKeyGuard`

| Method | Route                             | Service Calls                                |
| ------ | --------------------------------- | -------------------------------------------- |
| GET    | `v1/portal/catalog/items`         | catalogRepo.findByMerchant()                 |
| POST   | `v1/portal/catalog/items`         | catalogRepo.create()                         |
| PUT    | `v1/portal/catalog/items/:itemId` | catalogRepo.findById(), catalogRepo.update() |
| DELETE | `v1/portal/catalog/items/:itemId` | catalogRepo.findById(), catalogRepo.delete() |

---

### CONTROLLER: merchant-portal.controller.ts _(4914 lines — largest)_

- **Prefix**: `v1/portal`
- **Guards**: `MerchantApiKeyGuard`, `RolesGuard`

| Method | Route                                         | Extra Guards / Decorators         | Service Calls                                   |
| ------ | --------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| GET    | `v1/portal/dashboard/stats`                   |                                   | orderRepo.findByMerchant(), pool queries        |
| GET    | `v1/portal/dashboard/cart-recovery`           |                                   | analyticsService.getCartRecoveryMetrics()       |
| GET    | `v1/portal/conversations`                     | @RequiresFeature('CONVERSATIONS') | conversationRepo.findByMerchant()               |
| GET    | `v1/portal/conversations/:id`                 |                                   | conversationRepo.findById()                     |
| POST   | `v1/portal/conversations/:id/takeover`        | @RequireRole('AGENT')             | conversationRepo.update(), redisService         |
| POST   | `v1/portal/conversations/:id/release`         | @RequireRole('AGENT')             | conversationRepo.update()                       |
| POST   | `v1/portal/conversations/:id/send`            | @RequireRole('AGENT')             | send message logic                              |
| GET    | `v1/portal/orders`                            |                                   | orderRepo.findByMerchant()                      |
| GET    | `v1/portal/orders/:id`                        |                                   | orderRepo.findById()                            |
| POST   | `v1/portal/orders/:id/reorder`                |                                   | reorder logic                                   |
| GET    | `v1/portal/analytics/conversion`              |                                   | pool queries                                    |
| GET    | `v1/portal/analytics/response-times`          |                                   | pool queries                                    |
| GET    | `v1/portal/analytics/popular-products`        |                                   | pool queries                                    |
| GET    | `v1/portal/analytics/peak-hours`              |                                   | pool queries                                    |
| GET    | `v1/portal/me`                                |                                   | merchant profile query                          |
| GET    | `v1/portal/profile`                           |                                   | pool queries                                    |
| GET    | `v1/portal/usage`                             |                                   | pool queries                                    |
| GET    | `v1/portal/reports`                           |                                   | pool queries                                    |
| GET    | `v1/portal/notifications`                     |                                   | pool queries                                    |
| PUT    | `v1/portal/notifications/:id/read`            |                                   | pool.query update                               |
| PUT    | `v1/portal/notifications/read-all`            |                                   | pool.query update                               |
| DELETE | `v1/portal/notifications/:id`                 |                                   | pool.query delete                               |
| GET    | `v1/portal/followups`                         |                                   | pool queries                                    |
| GET    | `v1/portal/catalog`                           |                                   | pool queries                                    |
| GET    | `v1/portal/entitlements/catalog`              |                                   | pool queries                                    |
| GET    | `v1/portal/agents`                            |                                   | agentSubscriptionService                        |
| POST   | `v1/portal/agents/:agentType/subscribe`       |                                   | agentSubscriptionService.subscribeToAgent()     |
| POST   | `v1/portal/agents/:agentType/unsubscribe`     |                                   | agentSubscriptionService.unsubscribeFromAgent() |
| POST   | `v1/portal/agents/:agentType/config`          |                                   | agentSubscriptionService.updateAgentConfig()    |
| GET    | `v1/portal/settings`                          |                                   | pool queries                                    |
| PUT    | `v1/portal/settings`                          |                                   | pool.query update                               |
| GET    | `v1/portal/notifications/status`              |                                   | notificationsService                            |
| POST   | `v1/portal/notifications/test`                |                                   | notificationsService.sendTest()                 |
| GET    | `v1/portal/push-subscriptions`                |                                   | pool queries                                    |
| POST   | `v1/portal/push-subscriptions`                |                                   | pool.query insert                               |
| DELETE | `v1/portal/push-subscriptions/:id`            |                                   | pool.query delete                               |
| GET    | `v1/portal/settings/reports`                  |                                   | pool queries                                    |
| POST   | `v1/portal/settings/reports`                  |                                   | pool.query upsert                               |
| GET    | `v1/portal/customers`                         |                                   | pool queries                                    |
| GET    | `v1/portal/customers/:id`                     |                                   | pool queries                                    |
| GET    | `v1/portal/customers/segments`                |                                   | pool queries                                    |
| GET    | `v1/portal/customers/:customerId/insights`    |                                   | pool queries                                    |
| POST   | `v1/portal/campaigns/winback`                 |                                   | pool queries                                    |
| GET    | `v1/portal/reports/daily`                     |                                   | pool queries                                    |
| POST   | `v1/portal/inventory/batch-update`            |                                   | pool queries                                    |
| GET    | `v1/portal/inventory/valuation`               |                                   | pool queries                                    |
| GET    | `v1/portal/inventory/dead-stock`              |                                   | pool queries                                    |
| GET    | `v1/portal/inventory/forecast`                |                                   | pool queries                                    |
| GET    | `v1/portal/inventory/restock-recommendations` |                                   | pool queries                                    |
| GET    | `v1/portal/inventory/substitute-suggestions`  |                                   | pool queries                                    |
| GET    | `v1/portal/expenses`                          |                                   | pool queries                                    |
| POST   | `v1/portal/expenses`                          |                                   | pool.query insert                               |
| DELETE | `v1/portal/expenses/:id`                      |                                   | pool.query delete                               |
| GET    | `v1/portal/expenses/categories`               |                                   | pool queries                                    |
| GET    | `v1/portal/expenses/summary`                  |                                   | pool queries                                    |
| GET    | `v1/portal/payments/proofs`                   |                                   | pool queries                                    |
| GET    | `v1/portal/payments/pending`                  |                                   | pool queries                                    |
| POST   | `v1/portal/payments/verify`                   |                                   | pool.query update                               |
| GET    | `v1/portal/payments/:proofId`                 |                                   | pool queries                                    |
| GET    | `v1/portal/payments/links`                    |                                   | pool queries                                    |
| POST   | `v1/portal/payments/links`                    |                                   | pool.query insert                               |
| POST   | `v1/portal/payments/links/:linkId/cancel`     |                                   | pool.query update                               |
| POST   | `v1/portal/payments/links/:linkId/remind`     |                                   | pool queries                                    |
| POST   | `v1/portal/cod/import-statement`              |                                   | pool.query insert                               |
| GET    | `v1/portal/cod/statements`                    |                                   | pool queries                                    |
| GET    | `v1/portal/cod/statements/:statementId`       |                                   | pool queries                                    |
| GET    | `v1/portal/cod/summary`                       |                                   | pool queries                                    |
| POST   | `v1/portal/cod/reconcile/:orderId`            |                                   | pool.query update                               |
| POST   | `v1/portal/cod/dispute/:orderId`              |                                   | pool.query update                               |
| GET    | `v1/portal/products/ocr/confirmations`        |                                   | pool queries                                    |
| GET    | `v1/portal/knowledge-base`                    |                                   | pool queries                                    |
| PUT    | `v1/portal/knowledge-base`                    |                                   | pool.query update                               |
| POST   | `v1/portal/knowledge-base/sync-inventory`     |                                   | pool queries                                    |
| GET    | `v1/portal/security/sessions`                 |                                   | pool queries                                    |
| DELETE | `v1/portal/security/sessions/:sessionId`      |                                   | pool.query delete                               |
| DELETE | `v1/portal/security/sessions`                 |                                   | pool.query delete (all)                         |
| GET    | `v1/portal/security/audit`                    |                                   | pool queries                                    |
| GET    | `v1/portal/reports/cfo`                       |                                   | pool queries                                    |

---

### CONTROLLER: merchants.controller.ts

- **Prefix**: `v1/merchants`
- **Guard**: `AdminApiKeyGuard`

| Method | Route                                                 | Service Calls                                         |
| ------ | ----------------------------------------------------- | ----------------------------------------------------- |
| GET    | `v1/merchants/:id`                                    | merchantRepo.findById()                               |
| POST   | `v1/merchants/:id/config`                             | merchantRepo.findById(), merchantRepo.create/update() |
| PUT    | `v1/merchants/:id/toggle-active`                      | merchantRepo.update()                                 |
| POST   | `v1/merchants`                                        | merchantRepo.create() (onboarding)                    |
| GET    | `v1/merchants/:id/usage`                              | merchantRepo.getUsage()                               |
| GET    | `v1/merchants/:id/reports/daily`                      | merchantRepo.getDailyReports()                        |
| POST   | `v1/merchants/:id/reports/send-whatsapp`              | dailyReportScheduler.generateReportForMerchant()      |
| GET    | `v1/merchants/:id/notifications`                      | merchantRepo.getNotifications()                       |
| PUT    | `v1/merchants/:id/notifications/:notificationId/read` | merchantRepo.markNotificationRead()                   |
| POST   | `v1/merchants/:id/regenerate-api-key`                 | merchantRepo.update()                                 |

---

### CONTROLLER: notifications.controller.ts

- **Prefix**: root `@Controller()`
- **Guard**: `MerchantAuth()`

| Method | Route                                                      | Service Calls                            |
| ------ | ---------------------------------------------------------- | ---------------------------------------- |
| GET    | `merchants/:merchantId/notifications`                      | notificationsService.getForMerchant()    |
| PUT    | `merchants/:merchantId/notifications/:notificationId/read` | notificationsService.markAsRead()        |
| PUT    | `merchants/:merchantId/notifications/read-all`             | notificationsService.markAllAsRead()     |
| DELETE | `merchants/:merchantId/notifications/:notificationId`      | notificationsService.delete()            |
| GET    | `merchants/:merchantId/notification-preferences`           | notificationsService.getPreferences()    |
| PUT    | `merchants/:merchantId/notification-preferences`           | notificationsService.updatePreferences() |
| POST   | `merchants/:merchantId/notifications/test`                 | notificationsService.create() (dev only) |

---

### CONTROLLER: orders.controller.ts

- **Prefix**: `v1/orders`
- **Guard**: `AdminApiKeyGuard`

| Method | Route                              | Service Calls                                               |
| ------ | ---------------------------------- | ----------------------------------------------------------- |
| GET    | `v1/orders/:id`                    | orderRepo.findById(), shipmentRepo.findByOrderId()          |
| GET    | `v1/orders`                        | orderRepo.findByMerchant()                                  |
| GET    | `v1/orders/by-number/:orderNumber` | orderRepo.findByOrderNumber(), shipmentRepo.findByOrderId() |

---

### CONTROLLER: payments.controller.ts

- **Prefix**: `v1/payments`
- **Guards**: `MerchantApiKeyGuard`, `EntitlementGuard`
- **Entitlement**: `@RequiresFeature('PAYMENTS')`

| Method | Route                           | Service Calls                        |
| ------ | ------------------------------- | ------------------------------------ |
| POST   | `v1/payments/links`             | paymentService.createPaymentLink()   |
| GET    | `v1/payments/links`             | paymentService.listPaymentLinks()    |
| GET    | `v1/payments/links/:id`         | paymentService.getPaymentLinkById()  |
| DELETE | `v1/payments/links/:id`         | paymentService.cancelPaymentLink()   |
| POST   | `v1/payments/proofs`            | paymentService.submitPaymentProof()  |
| GET    | `v1/payments/proofs/pending`    | paymentService.listPendingProofs()   |
| GET    | `v1/payments/proofs/:id`        | paymentService.getPaymentProofById() |
| PUT    | `v1/payments/proofs/:id/verify` | paymentService.verifyPaymentProof()  |

---

### CONTROLLER: production-features.controller.ts

- **Prefix**: `v1/portal`
- **Guards**: `MerchantApiKeyGuard`, `RolesGuard`

| Method | Route                                            | Extra Decorators      | Service Calls                        |
| ------ | ------------------------------------------------ | --------------------- | ------------------------------------ |
| GET    | `v1/portal/audit`                                |                       | auditService.query()                 |
| GET    | `v1/portal/audit/export`                         |                       | auditService.query() (CSV export)    |
| GET    | `v1/portal/audit/summary`                        |                       | auditService.getActivitySummary()    |
| GET    | `v1/portal/audit/resource/:resource/:resourceId` |                       | auditService.getResourceHistory()    |
| GET    | `v1/portal/webhooks`                             |                       | webhookService.findByMerchant()      |
| POST   | `v1/portal/webhooks`                             | @RequireRole('ADMIN') | webhookService.create()              |
| PUT    | `v1/portal/webhooks/:id`                         | @RequireRole('ADMIN') | webhookService.update()              |
| PUT    | `v1/portal/webhooks/:id/status`                  |                       | webhookService.updateStatus()        |
| DELETE | `v1/portal/webhooks/:id`                         |                       | webhookService.delete()              |
| POST   | `v1/portal/webhooks/:id/test`                    |                       | webhookService.test()                |
| POST   | `v1/portal/webhooks/test-url`                    |                       | webhookService.testUrl()             |
| POST   | `v1/portal/webhooks/:id/regenerate-secret`       |                       | webhookService.regenerateSecret()    |
| GET    | `v1/portal/webhooks/:id/deliveries`              |                       | webhookService.getDeliveryHistory()  |
| GET    | `v1/portal/webhooks/deliveries`                  |                       | webhookService.getRecentDeliveries() |
| GET    | `v1/portal/webhooks/stats`                       |                       | webhookService.getStats()            |
| GET    | `v1/portal/staff`                                |                       | staffService.findByMerchant()        |
| POST   | `v1/portal/staff/invite`                         | @RequireRole('ADMIN') | staffService.invite()                |
| PUT    | `v1/portal/staff/:id`                            |                       | staffService.update()                |
| DELETE | `v1/portal/staff/:id`                            |                       | staffService.delete()                |
| GET    | `v1/portal/staff/:id/sessions`                   |                       | staffService.getSessions()           |
| DELETE | `v1/portal/staff/:id/sessions/:sessionId`        |                       | staffService.revokeSession()         |
| GET    | `v1/portal/bulk-operations`                      |                       | bulkOpsService.getOperations()       |
| GET    | `v1/portal/bulk-operations/:id`                  |                       | bulkOpsService.getOperation()        |
| POST   | `v1/portal/bulk-operations/:id/cancel`           |                       | bulkOpsService.cancelOperation()     |
| POST   | `v1/portal/products/import`                      |                       | bulkOpsService.importProducts()      |
| GET    | `v1/portal/products/export`                      |                       | bulkOpsService.exportProducts()      |
| POST   | `v1/portal/customers/import`                     |                       | bulkOpsService.importCustomers()     |
| GET    | `v1/portal/customers/export`                     |                       | bulkOpsService.exportCustomers()     |
| POST   | `v1/portal/inventory/import`                     |                       | bulkOpsService.importInventory()     |
| POST   | `v1/portal/inventory/bulk-update`                |                       | bulkOpsService.bulkUpdateInventory() |
| GET    | `v1/portal/rate-limits/violations`               |                       | rateLimitService (violations)        |
| GET    | `v1/portal/rate-limits/stats`                    |                       | rateLimitService (stats)             |
| POST   | `v1/portal/login`                                | NONE (public)         | staffService.login()                 |
| POST   | `v1/portal/refresh`                              | NONE (public)         | staffService.refreshTokens()         |
| POST   | `v1/portal/logout`                               |                       | staffService.logout()                |
| POST   | `v1/portal/accept-invite`                        | NONE (public)         | staffService.acceptInvite()          |
| POST   | `v1/portal/forgot-password`                      | NONE (public)         | staffService.requestPasswordReset()  |
| POST   | `v1/portal/reset-password`                       | NONE (public)         | staffService.resetPassword()         |
| POST   | `v1/portal/change-password`                      |                       | staffService.changePassword()        |

---

### CONTROLLER: public-payments.controller.ts

- **Prefix**: `v1/payments`
- **Guard**: NONE (public customer-facing)

| Method | Route                         | Service Calls                                                                    |
| ------ | ----------------------------- | -------------------------------------------------------------------------------- |
| GET    | `v1/payments/pay/:code`       | paymentService.getPaymentLinkByCode(), paymentService.getMerchantPayoutDetails() |
| POST   | `v1/payments/pay/:code/proof` | paymentService.getPaymentLinkByCode(), paymentService.submitPaymentProof()       |

---

### CONTROLLER: quote-requests.controller.ts

Two classes in one file.

**Class: QuoteRequestsController**

- **Prefix**: `v1/portal/quotes`
- **Guard**: `MerchantApiKeyGuard`

| Method | Route                         | Service Calls                        |
| ------ | ----------------------------- | ------------------------------------ |
| GET    | `v1/portal/quotes`            | pool.query                           |
| GET    | `v1/portal/quotes/:id/events` | pool.query                           |
| POST   | `v1/portal/quotes/:id/events` | pool.query insert                    |
| POST   | `v1/portal/quotes/:id/accept` | pool queries (activate entitlements) |

**Class: QuoteRequestsAdminController**

- **Prefix**: `v1/admin/quotes`
- **Guard**: `AdminApiKeyGuard`

| Method | Route                        | Service Calls                                    |
| ------ | ---------------------------- | ------------------------------------------------ |
| GET    | `v1/admin/quotes`            | pool.query                                       |
| GET    | `v1/admin/quotes/:id/events` | pool.query                                       |
| POST   | `v1/admin/quotes/:id/events` | pool.query insert                                |
| PUT    | `v1/admin/quotes/:id`        | pool.query update, notificationsService.create() |

---

### CONTROLLER: twilio-webhook.controller.ts

- **Prefix**: `v1/webhooks/twilio`
- **Guard**: NONE (uses Twilio signature validation internally)

| Method | Route                         | Service Calls                                                                                                                                                                        |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `v1/webhooks/twilio/whatsapp` | twilioAdapter.validateSignature(), twilioAdapter.parseWebhook(), twilioAdapter.getMerchantByWhatsAppNumber(), inboxService.processMessage(), productOcrService, transcriptionFactory |

---

### CONTROLLER: vision.controller.ts

- **Prefix**: `v1/vision`
- **Guards**: `MerchantApiKeyGuard`, `EntitlementGuard`
- **Entitlement**: `@RequiresFeature('VISION_OCR')`

| Method | Route                    | Service Calls                         |
| ------ | ------------------------ | ------------------------------------- |
| POST   | `v1/vision/receipt`      | visionService.processPaymentReceipt() |
| POST   | `v1/vision/product`      | visionService.analyzeProductImage()   |
| POST   | `v1/vision/medicine`     | visionService.analyzeMedicineImage()  |
| POST   | `v1/vision/extract-text` | visionService.extractText()           |

---

### CONTROLLER: webhooks.controller.ts

- **Prefix**: `v1/webhooks`
- **Guard**: NONE (`@SkipThrottle()`)

| Method | Route                          | Service Calls                                 |
| ------ | ------------------------------ | --------------------------------------------- |
| POST   | `v1/webhooks/delivery-receipt` | messageDeliveryService.updateDeliveryStatus() |
| POST   | `v1/webhooks/whatsapp`         | messageDeliveryService.updateDeliveryStatus() |

---

## SERVICES

---

### SERVICE: address-depth.service.ts

| Method                         | Visibility | Description                            |
| ------------------------------ | ---------- | -------------------------------------- |
| `analyzeDepth(address, city?)` | public     | Analyzes address depth/completeness    |
| `parseGoogleMapsUrl(url)`      | public     | Extracts location from Google Maps URL |

---

### SERVICE: agent-subscription.service.ts

| Method                                             | Visibility | Description                                   |
| -------------------------------------------------- | ---------- | --------------------------------------------- |
| `getMerchantSubscriptions(merchantId)`             | public     | List all agent subscriptions for a merchant   |
| `subscribeToAgent(merchantId, agentType, ...)`     | public     | Subscribe merchant to an agent type           |
| `unsubscribeFromAgent(merchantId, agentType)`      | public     | Unsubscribe merchant from an agent            |
| `updateAgentConfig(merchantId, agentType, config)` | public     | Update agent configuration                    |
| `isAgentEnabled(merchantId, agentType)`            | public     | Check if agent is enabled for merchant        |
| `getMerchantsWithAgent(agentType)`                 | public     | List merchants with a specific agent enabled  |
| `initializeMerchantSubscriptions(merchantId)`      | public     | Set up default subscriptions for new merchant |
| `getAgentStats()`                                  | public     | Get enabled/disabled counts per agent type    |

---

### SERVICE: analytics.service.ts

| Method                                        | Visibility | Description                                               |
| --------------------------------------------- | ---------- | --------------------------------------------------------- |
| `getDashboardMetrics(merchantId, range)`      | public     | Full dashboard metrics (orders, customers, conversations) |
| `getSalesBreakdown(merchantId, range)`        | public     | Sales by product, category, hour, day-of-week             |
| `getCustomerInsights(merchantId, range)`      | public     | Top customers, segments, acquisition channels             |
| `getConversationAnalytics(merchantId, range)` | public     | Conversation volume, topics, sentiment, resolution time   |
| `getRealTimeMetrics(merchantId)`              | public     | Live metrics (active conversations, pending orders)       |
| `exportReport(merchantId, range, format)`     | public     | Export analytics as JSON or CSV                           |

---

### SERVICE: audit.service.ts

| Method                                                 | Visibility | Description                                  |
| ------------------------------------------------------ | ---------- | -------------------------------------------- |
| `log(entry)`                                           | public     | Write an audit log entry                     |
| `logFromRequest(req, action, resource, ...)`           | public     | Create audit entry from HTTP request context |
| `query(params)`                                        | public     | Query audit logs with filters & pagination   |
| `getResourceHistory(merchantId, resource, resourceId)` | public     | Get audit trail for a specific resource      |
| `getActivitySummary(merchantId, days)`                 | public     | Aggregated activity summary                  |
| `cleanup(daysToKeep)`                                  | public     | Purge old audit logs                         |

---

### SERVICE: bulk-operations.service.ts

| Method                                     | Visibility | Description                                     |
| ------------------------------------------ | ---------- | ----------------------------------------------- |
| `createOperation(merchantId, type, ...)`   | public     | Create a new bulk operation record              |
| `importProducts(merchantId, file, ...)`    | public     | Import products from CSV/JSON                   |
| `exportProducts(merchantId, format)`       | public     | Export products to CSV/JSON                     |
| `importCustomers(merchantId, file, ...)`   | public     | Import customers from CSV/JSON                  |
| `exportCustomers(merchantId, format)`      | public     | Export customers to CSV/JSON                    |
| `importInventory(merchantId, file, ...)`   | public     | Import inventory from CSV/JSON                  |
| `bulkUpdateInventory(merchantId, updates)` | public     | Bulk stock level updates                        |
| `getOperation(id, merchantId)`             | public     | Get single bulk operation by ID                 |
| `getOperations(merchantId, filters)`       | public     | List bulk operations with filters               |
| `cancelOperation(id, merchantId)`          | public     | Cancel a pending/in-progress operation          |
| `cleanupOldOperations()`                   | public     | Purge completed operations older than threshold |

---

### SERVICE: candidate-retrieval.service.ts

| Method                                  | Visibility | Description                                           |
| --------------------------------------- | ---------- | ----------------------------------------------------- |
| `retrieveCandidates(context)`           | public     | Retrieve product/response candidates for conversation |
| `findBestMatch(merchantId, query, ...)` | public     | Find best matching catalog item                       |
| `batchRetrieve(contexts)`               | public     | Batch candidate retrieval                             |
| `clearMerchantCache(merchantId)`        | public     | Invalidate cached candidates for merchant             |

---

### SERVICE: continuity-mode.service.ts

| Method                                        | Visibility | Description                                     |
| --------------------------------------------- | ---------- | ----------------------------------------------- |
| `isInFallbackMode()`                          | public     | Check if system is in fallback/degraded mode    |
| `getState()`                                  | public     | Get current continuity state                    |
| `reportServiceDegraded(serviceName, reason?)` | public     | Report a degraded dependency                    |
| `reportServiceRecovered(serviceName)`         | public     | Report a dependency recovery                    |
| `activateFallbackMode(reason)`                | public     | Manually activate fallback mode                 |
| `deactivateFallbackMode()`                    | public     | Deactivate fallback mode, drain queued messages |
| `loadState()`                                 | public     | Load persisted continuity state from Redis      |
| `performHealthCheck()`                        | public     | Run health checks on all dependencies           |

---

### SERVICE: customer-reorder.service.ts

| Method                                                  | Visibility | Description                                             |
| ------------------------------------------------------- | ---------- | ------------------------------------------------------- |
| `checkReorderAvailability(merchantId, customerId, ...)` | public     | Check if previous order items are available for reorder |
| `generateReorderConfirmationMessage(result)`            | public     | Generate WhatsApp confirmation message for reorder      |
| `confirmReorder(merchantId, customerId, orderId, ...)`  | public     | Execute reorder and create new order                    |
| `isReorderRequest(message)`                             | public     | Detect if a message is a reorder intent                 |

---

### SERVICE: inbox.service.ts

| Method                   | Visibility | Description                                                              |
| ------------------------ | ---------- | ------------------------------------------------------------------------ |
| `processMessage(params)` | public     | Main entry point — process incoming WhatsApp message through AI pipeline |

_(Internal pipeline: transcribeVoiceNote → processMessageWithLock → processLlmAction → updateCart → createOrder → maybeCreatePaymentLink → handleEscalation → createNewConversation → createNewCustomer)_

---

### SERVICE: integration.service.ts

| Method                                                     | Visibility | Description                                               |
| ---------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| `getOrCreateErpEndpoint(merchantId)`                       | public     | Get or create ERP integration endpoint                    |
| `regenerateErpSecret(merchantId)`                          | public     | Regenerate ERP webhook secret                             |
| `listEvents(merchantId, limit, offset)`                    | public     | List integration events                                   |
| `getErpConfig(merchantId)`                                 | public     | Get ERP configuration                                     |
| `updateErpConfig(merchantId, configPatch)`                 | public     | Update ERP configuration                                  |
| `pullErpEvents(merchantId, mode)`                          | public     | Pull events from external ERP                             |
| `recordEvent(endpointId, merchantId, ...)`                 | public     | Record an integration event                               |
| `processErpEvent(merchantId, endpointId, eventType, data)` | public     | Process incoming ERP event (order/payment/inventory sync) |

---

### SERVICE: inventory.service.ts

| Method                                             | Visibility | Description                                 |
| -------------------------------------------------- | ---------- | ------------------------------------------- |
| `isInventoryEnabled(merchantId)`                   | public     | Check if inventory feature is enabled       |
| `getStockLevel(merchantId, itemId, ...)`           | public     | Get current stock level for an item         |
| `checkAvailability(merchantId, items)`             | public     | Check stock availability for multiple items |
| `reserveStock(merchantId, items, orderId)`         | public     | Reserve stock for an order                  |
| `releaseReservation(merchantId, reservationId)`    | public     | Release a stock reservation                 |
| `confirmStockDeduction(merchantId, reservationId)` | public     | Confirm reservation → deduct stock          |
| `adjustStock(merchantId, itemId, adjustment, ...)` | public     | Manual stock adjustment                     |
| `getAlerts(merchantId, filters)`                   | public     | Get inventory alerts (low stock, etc.)      |
| `acknowledgeAlert(alertId, merchantId)`            | public     | Acknowledge an alert                        |
| `getMovementHistory(merchantId, itemId, ...)`      | public     | Get stock movement history                  |

---

### SERVICE: kpi.service.ts

| Method                                       | Visibility | Description                         |
| -------------------------------------------- | ---------- | ----------------------------------- |
| `getRecoveredCartStats(merchantId, days)`    | public     | Cart recovery KPIs                  |
| `getDeliveryFailureStats(merchantId, days)`  | public     | Delivery failure rate KPIs          |
| `getAgentPerformanceStats(merchantId, days)` | public     | AI agent performance KPIs           |
| `getRevenueKpis(merchantId, days)`           | public     | Revenue breakdown KPIs              |
| `getCustomerKpis(merchantId, days)`          | public     | Customer acquisition/retention KPIs |

---

### SERVICE: loyalty.service.ts

| Method                                                              | Visibility | Description                             |
| ------------------------------------------------------------------- | ---------- | --------------------------------------- |
| `getTiers(merchantId)`                                              | public     | Get loyalty tiers                       |
| `createTier(merchantId, data)`                                      | public     | Create a loyalty tier                   |
| `initializeDefaultTiers(merchantId)`                                | public     | Set up default Bronze/Silver/Gold tiers |
| `getCustomerPoints(merchantId, customerId)`                         | public     | Get customer loyalty points             |
| `addPoints(merchantId, dto)`                                        | public     | Add points to a customer                |
| `redeemPoints(merchantId, customerId, points, orderId?)`            | public     | Redeem loyalty points                   |
| `earnPointsFromOrder(merchantId, customerId, orderAmount, orderId)` | public     | Auto-earn points from order             |
| `getPointsHistory(merchantId, customerId, limit)`                   | public     | Get points transaction history          |
| `enrollMember(merchantId, phone, name?, ...)`                       | public     | Enroll new loyalty member               |
| `createPromotion(merchantId, dto, staffId?)`                        | public     | Create a promotion/coupon               |
| `getPromotions(merchantId, activeOnly)`                             | public     | List promotions                         |
| `getPromotion(merchantId, promotionId)`                             | public     | Get single promotion                    |
| `validatePromoCode(merchantId, code, orderAmount?, ...)`            | public     | Validate a promo code                   |
| `applyPromotion(merchantId, code, orderAmount, ...)`                | public     | Apply a promotion to order              |
| `deactivatePromotion(merchantId, promotionId)`                      | public     | Deactivate a promotion                  |
| `activatePromotion(merchantId, promotionId)`                        | public     | Reactivate a promotion                  |
| `generateReferralCode(merchantId, customerId)`                      | public     | Generate referral code for customer     |
| `processReferral(merchantId, referralCode, newCustomerId)`          | public     | Process a referral                      |
| `getLoyaltyMembers(merchantId, page, limit)`                        | public     | List loyalty members with pagination    |
| `getLoyaltyAnalytics(merchantId)`                                   | public     | Loyalty program analytics               |

---

### SERVICE: memory-compression.service.ts

| Method                                  | Visibility | Description                             |
| --------------------------------------- | ---------- | --------------------------------------- |
| `getConversationMemory(conversationId)` | public     | Get compressed conversation memory      |
| `needsCompression(conversationId)`      | public     | Check if conversation needs compression |
| `compressConversation(conversationId)`  | public     | Compress old messages into summary      |
| `getMemoryStats(conversationId)`        | public     | Get memory usage stats for conversation |

---

### SERVICE: message-delivery.service.ts

| Method                                          | Visibility | Description                                 |
| ----------------------------------------------- | ---------- | ------------------------------------------- |
| `queueMessage(merchantId, conversationId, ...)` | public     | Queue a message for delivery                |
| `updateDeliveryStatus(update)`                  | public     | Update message delivery status from webhook |
| `getMessagesForDelivery(limit)`                 | public     | Get pending messages for delivery worker    |
| `scheduleRetry(messageId, error)`               | public     | Schedule a retry for failed delivery        |
| `getFailedMessages(merchantId, filters)`        | public     | List failed messages                        |
| `retryFailedMessage(messageId, merchantId)`     | public     | Retry a specific failed message             |
| `getDeliveryStats(merchantId, date?)`           | public     | Get delivery success/failure stats          |

---

### SERVICE: notifications.service.ts

| Method                                                 | Visibility | Description                             |
| ------------------------------------------------------ | ---------- | --------------------------------------- |
| `getDeliveryConfigStatus()`                            | public     | Check email/push/WhatsApp config status |
| `sendTest(channel, target?, merchantId?)`              | public     | Send test notification to a channel     |
| `create(dto)`                                          | public     | Create and deliver a notification       |
| `getForMerchant(merchantId, filters)`                  | public     | Get notifications for merchant          |
| `markAsRead(merchantId, notificationId, staffId?)`     | public     | Mark notification as read               |
| `markAllAsRead(merchantId, staffId?)`                  | public     | Mark all notifications as read          |
| `delete(merchantId, notificationId)`                   | public     | Delete a notification                   |
| `deleteOld(olderThanDays)`                             | public     | Purge old notifications                 |
| `notifyOrderPlaced(merchantId, orderId, ...)`          | public     | Send order-placed notification          |
| `notifyLowStock(merchantId, productId, ...)`           | public     | Send low-stock alert                    |
| `notifyEscalation(merchantId, conversationId, ...)`    | public     | Send escalation notification            |
| `notifyDailySummary(merchantId, summary)`              | public     | Send daily summary notification         |
| `notifySecurityAlert(merchantId, staffId, ...)`        | public     | Send security alert                     |
| `getPreferences(merchantId, staffId?)`                 | public     | Get notification preferences            |
| `updatePreferences(merchantId, preferences, staffId?)` | public     | Update notification preferences         |

---

### SERVICE: payment.service.ts

| Method                                              | Visibility | Description                                |
| --------------------------------------------------- | ---------- | ------------------------------------------ |
| `verifyPaymentProofEgypt(merchantId, proofId, ...)` | public     | Egypt-specific payment proof verification  |
| `createPaymentLink(input)`                          | public     | Create a payment link                      |
| `getPaymentLinkByCode(linkCode)`                    | public     | Get payment link by public code            |
| `getMerchantPayoutDetails(merchantId)`              | public     | Get merchant payout/bank details           |
| `getPaymentLinkById(id, merchantId)`                | public     | Get payment link by ID                     |
| `listPaymentLinks(merchantId, filters)`             | public     | List payment links                         |
| `cancelPaymentLink(id, merchantId)`                 | public     | Cancel a payment link                      |
| `submitPaymentProof(input)`                         | public     | Submit payment proof (receipt photo, etc.) |
| `verifyPaymentProof(proofId, merchantId, ...)`      | public     | Verify/approve a payment proof             |
| `listPendingProofs(merchantId)`                     | public     | List pending payment proofs                |
| `getPaymentProofById(id, merchantId)`               | public     | Get single payment proof                   |
| `getPaymentLinkUrl(linkCode)`                       | public     | Generate public payment URL                |

---

### SERVICE: product-ocr.service.ts

| Method                                                    | Visibility | Description                                  |
| --------------------------------------------------------- | ---------- | -------------------------------------------- |
| `isProcessableImage(contentType)`                         | public     | Check if content type is a processable image |
| `processProductImage(merchantId, imageUrl, ...)`          | public     | Process product image via OCR                |
| `handleConfirmationResponse(merchantId, phone, response)` | public     | Handle customer confirmation of OCR results  |
| `cleanupExpired()`                                        | public     | Cleanup expired pending confirmations        |

---

### SERVICE: staff.service.ts

| Method                                                  | Visibility | Description                     |
| ------------------------------------------------------- | ---------- | ------------------------------- |
| `invite(dto)`                                           | public     | Invite a new staff member       |
| `acceptInvite(inviteToken, password)`                   | public     | Accept staff invitation         |
| `login(merchantId, email, password, deviceInfo?)`       | public     | Staff login → JWT tokens        |
| `verifyRefreshTokenPayload(refreshToken)`               | public     | Verify refresh token validity   |
| `refreshTokens(refreshToken)`                           | public     | Refresh access + refresh tokens |
| `logout(staffId, refreshToken?)`                        | public     | Logout (revoke session)         |
| `findById(id)`                                          | public     | Find staff by ID                |
| `findByMerchant(merchantId)`                            | public     | List staff for a merchant       |
| `update(id, merchantId, updates)`                       | public     | Update staff profile/role       |
| `changePassword(staffId, currentPassword, newPassword)` | public     | Change password                 |
| `requestPasswordReset(merchantId, email)`               | public     | Request password reset email    |
| `resetPassword(resetToken, newPassword)`                | public     | Reset password via token        |
| `delete(id, merchantId)`                                | public     | Delete/deactivate staff member  |
| `getSessions(staffId)`                                  | public     | List active sessions            |
| `revokeSession(staffId, sessionId)`                     | public     | Revoke a specific session       |
| `updateActivity(staffId)`                               | public     | Update last-activity timestamp  |
| `hasPermission(staff, resource, action)`                | public     | Check RBAC permission           |
| `verifyToken(token)`                                    | public     | Verify JWT access token         |

---

### SERVICE: webhook.service.ts

| Method                                           | Visibility | Description                           |
| ------------------------------------------------ | ---------- | ------------------------------------- |
| `create(dto)`                                    | public     | Register a new webhook                |
| `findByMerchant(merchantId)`                     | public     | List webhooks for merchant            |
| `findById(id, merchantId)`                       | public     | Get webhook by ID                     |
| `update(id, merchantId, updates)`                | public     | Update webhook config                 |
| `updateStatus(id, merchantId, status)`           | public     | Enable/disable a webhook              |
| `delete(id, merchantId)`                         | public     | Delete a webhook                      |
| `regenerateSecret(id, merchantId)`               | public     | Regenerate webhook signing secret     |
| `trigger(merchantId, event, data)`               | public     | Trigger webhook delivery for an event |
| `processPendingDeliveries()`                     | public     | Process queued webhook deliveries     |
| `test(id, merchantId)`                           | public     | Send test delivery to a webhook       |
| `getDeliveryHistory(webhookId, merchantId, ...)` | public     | Delivery history for a webhook        |
| `testUrl(input)`                                 | public     | Test arbitrary URL reachability       |
| `getRecentDeliveries(merchantId, ...)`           | public     | Recent deliveries across all webhooks |
| `getDeliverySummaryByWebhook(merchantId)`        | public     | Delivery stats grouped by webhook     |
| `getStats(merchantId, days)`                     | public     | Webhook performance stats             |
| `cleanupOldDeliveries()`                         | public     | Purge old delivery records            |
| `generateSecret()`                               | public     | Generate a new signing secret         |

---

## SUMMARY

| Category                  | Count                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Controller files          | 33                                                                                                               |
| Service files             | 21 (+ index.ts, services.module.ts)                                                                              |
| Total unique routes       | **~260+**                                                                                                        |
| Auth guard types          | 6 (AdminApiKeyGuard, MerchantApiKeyGuard, MerchantAuth, InternalApiGuard, EntitlementGuard, RolesGuard)          |
| Unguarded / public routes | health, ready, public-payments, webhooks, twilio-webhook, integrations-public, portal login/register/reset flows |
| Feature entitlements      | INVENTORY, KPI_DASHBOARD, LOYALTY, PAYMENTS, VISION_OCR, CONVERSATIONS                                           |
| Agent entitlements        | INVENTORY_AGENT, MARKETING_AGENT                                                                                 |

### Auth Guard Reference

| Guard                    | Header / Mechanism                                                                |
| ------------------------ | --------------------------------------------------------------------------------- |
| `AdminApiKeyGuard`       | `x-admin-api-key` header                                                          |
| `MerchantApiKeyGuard`    | `x-api-key` header                                                                |
| `MerchantAuth()`         | Decorator — validates merchant ownership of `:merchantId` param                   |
| `InternalApiGuard`       | Internal API key for service-to-service calls                                     |
| `EntitlementGuard`       | Checks `@RequiresFeature()` / `@RequiresAgent()` decorators against merchant plan |
| `RolesGuard`             | Checks `@RequireRole()` / `@Roles()` decorators against staff JWT                 |
| `EnhancedRateLimitGuard` | Rate limiting (applied globally, skipped with `@SkipThrottle()`)                  |
