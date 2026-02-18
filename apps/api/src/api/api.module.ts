import { Module } from "@nestjs/common";
import {
  InboxController,
  MerchantsController,
  CatalogController,
  MerchantCatalogController,
  ConversationsController,
  OrdersController,
  AdminController,
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
  BillingController,
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
import { PortalCompatController } from "./controllers/portal-compat.controller";
import { InternalAiController } from "./controllers/internal-ai.controller";
import {
  ProductionFeaturesController,
  StaffAuthController,
} from "./controllers/production-features.controller";
import { VisionController } from "./controllers/vision.controller";
import { PaymentsController } from "./controllers/payments.controller";
import { PublicPaymentsController } from "./controllers/public-payments.controller";
import { KpiController } from "./controllers/kpi.controller";
import { AgentTeamsController } from "./controllers/agent-teams.controller";
import {
  FinanceReportsController,
  AdvancedInventoryController,
  CustomerIntelligenceController,
} from "./controllers/advanced-reports.controller";
import { SeedController } from "./controllers/seed.controller";

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
    AdminController,
    MerchantPortalController,
    PortalCompatController,
    InventoryController,
    MetaWebhookController,
    InternalAiController,
    ProductionFeaturesController,
    StaffAuthController,
    NotificationsController,
    AnalyticsController,
    VisionController,
    PaymentsController,
    PublicPaymentsController,
    KpiController,
    EarlyAccessController,
    LoyaltyController,
    FeatureRequestsController,
    FeatureRequestsAdminController,
    MerchantAssistantController,
    AnalyticsEventsController,
    AnalyticsEventsAdminController,
    BillingController,
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
    SeedController,
  ],
  providers: [RateLimitService],
})
export class ApiModule {}
