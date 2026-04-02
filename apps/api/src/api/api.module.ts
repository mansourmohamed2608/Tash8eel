import { Module } from "@nestjs/common";
import {
  InboxController,
  MerchantsController,
  CatalogController,
  MerchantCatalogController,
  ConversationsController,
  OrdersController,
  HealthController,
  InventoryController,
  MetaWebhookController,
  NotificationsController,
  EarlyAccessController,
  LoyaltyController,
  FeatureRequestsController,
  FeatureRequestsAdminController,
  MerchantAssistantController,
  AnalyticsEventsController,
  AnalyticsEventsAdminController,
  BillingAdminController,
  QuoteRequestsController,
  QuoteRequestsAdminController,
  IntegrationsController,
  IntegrationsPublicController,
  CopilotController,
} from "./controllers";
import { AnalyticsController } from "./controllers/analytics.controller";
import { FollowupsController } from "./controllers/followups.controller";
import { MerchantPortalController } from "./controllers/merchant-portal.controller";
// Portal sub-controllers (replaced portal-compat.controller.ts)
import { PortalAgentActivityController } from "./controllers/portal-agent-activity.controller";
import { PortalOnboardingController } from "./controllers/portal-onboarding.controller";
import { PortalAnalyticsController } from "./controllers/portal-analytics.controller";
import { PortalDeliveryController } from "./controllers/portal-delivery.controller";
import { PortalInventoryController } from "./controllers/portal-inventory.controller";
import { PortalCatalogController } from "./controllers/portal-catalog.controller";
import { PortalKnowledgeBaseController } from "./controllers/portal-knowledge-base.controller";
// Billing sub-controllers (replaced billing.controller.ts)
import { BillingPlansController } from "./controllers/billing-plans.controller";
import { BillingCheckoutController } from "./controllers/billing-checkout.controller";
import { BillingSubscriptionsController } from "./controllers/billing-subscriptions.controller";
// Admin sub-controllers (replaced admin.controller.ts)
import { AdminOpsController } from "./controllers/admin-ops.controller";
import { AdminMerchantsController } from "./controllers/admin-merchants.controller";
import { InternalAiController } from "./controllers/internal-ai.controller";
import {
  ProductionFeaturesController,
  StaffAuthController,
  PublicAuthController,
} from "./controllers/production-features.controller";
import { VisionController } from "./controllers/vision.controller";
import { PaymentsController } from "./controllers/payments.controller";
import { PublicOrdersController } from "./controllers/public-orders.controller";
import { KpiController } from "./controllers/kpi.controller";
import { AgentTeamsController } from "./controllers/agent-teams.controller";
import { VoiceController } from "./controllers/voice.controller";
import { PortalCallsController } from "./controllers/portal-calls.controller";
import {
  FinanceReportsController,
  AdvancedInventoryController,
  CustomerIntelligenceController,
} from "./controllers/advanced-reports.controller";
import { SeedController } from "./controllers/seed.controller";
import {
  BranchesController,
  BranchAnalyticsController,
} from "./controllers/branches.controller";
import {
  BranchStaffController,
  BranchGoalsController,
  BranchShiftsController,
  BranchPLController,
  BranchAlertsController,
  BranchInventoryController,
} from "./controllers/branch-extensions.controller";

// Infrastructure imports
import { DatabaseModule } from "../infrastructure/database/database.module";
import { RepositoriesModule } from "../infrastructure/repositories/repositories.module";
import { RedisModule } from "../infrastructure/redis/redis.module";

// Application imports
import { LlmModule } from "../application/llm/llm.module";
import { EventsModule } from "../application/events/events.module";
import { DlqModule } from "../application/dlq/dlq.module";
import { AdaptersModule } from "../application/adapters/adapters.module";
import { ServicesModule } from "../application/services/services.module";
import { JobsModule } from "../application/jobs/jobs.module";

// Category strategies
import { CategoriesModule } from "../categories/categories.module";

// Guards and services needed by controllers
import { RateLimitService } from "../shared/guards/rate-limit.guard";
import { CopilotPlanGuard } from "../shared/guards/copilot-plan.guard";

@Module({
  imports: [
    DatabaseModule,
    RepositoriesModule,
    RedisModule,
    LlmModule,
    EventsModule,
    DlqModule,
    AdaptersModule,
    ServicesModule,
    CategoriesModule,
    JobsModule,
  ],
  controllers: [
    HealthController,
    InboxController,
    MerchantsController,
    CatalogController,
    MerchantCatalogController,
    ConversationsController,
    OrdersController,
    FollowupsController,
    MerchantPortalController,
    // Portal sub-controllers
    PortalAgentActivityController,
    PortalOnboardingController,
    PortalAnalyticsController,
    PortalDeliveryController,
    PortalInventoryController,
    PortalCatalogController,
    PortalKnowledgeBaseController,
    InventoryController,
    MetaWebhookController,
    InternalAiController,
    ProductionFeaturesController,
    StaffAuthController,
    PublicAuthController,
    NotificationsController,
    AnalyticsController,
    VisionController,
    PaymentsController,
    PublicOrdersController,
    KpiController,
    VoiceController,
    PortalCallsController,
    EarlyAccessController,
    LoyaltyController,
    FeatureRequestsController,
    FeatureRequestsAdminController,
    MerchantAssistantController,
    AnalyticsEventsController,
    AnalyticsEventsAdminController,
    // Billing sub-controllers
    BillingPlansController,
    BillingCheckoutController,
    BillingSubscriptionsController,
    BillingAdminController,
    QuoteRequestsController,
    QuoteRequestsAdminController,
    IntegrationsController,
    IntegrationsPublicController,
    CopilotController,
    AgentTeamsController,
    FinanceReportsController,
    AdvancedInventoryController,
    CustomerIntelligenceController,
    BranchesController,
    BranchAnalyticsController,
    BranchStaffController,
    BranchGoalsController,
    BranchShiftsController,
    BranchPLController,
    BranchAlertsController,
    BranchInventoryController,
    SeedController,
    // Admin sub-controllers
    AdminOpsController,
    AdminMerchantsController,
  ],
  providers: [RateLimitService, CopilotPlanGuard],
})
export class ApiModule {}
