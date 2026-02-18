import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

// Services
import { InboxService } from "./inbox.service";
import { AddressDepthService } from "./address-depth.service";
import { MemoryCompressionService } from "./memory-compression.service";
import { CandidateRetrievalService } from "./candidate-retrieval.service";
import { ContinuityModeService } from "./continuity-mode.service";
import { MessageDeliveryService } from "./message-delivery.service";
import { AgentSubscriptionService } from "./agent-subscription.service";
import { InventoryService } from "./inventory.service";
import { AuditService } from "./audit.service";
import { WebhookService } from "./webhook.service";
import { StaffService } from "./staff.service";
import { BulkOperationsService } from "./bulk-operations.service";
import { LoyaltyService } from "./loyalty.service";
import { NotificationsService } from "./notifications.service";
import { AnalyticsService } from "./analytics.service";
import { PaymentService } from "./payment.service";
import { KpiService } from "./kpi.service";
import { ProductOcrService } from "./product-ocr.service";
import { IntegrationService } from "./integration.service";
import { CustomerReorderService } from "./customer-reorder.service";
import { DriverStatusService } from "./driver-status.service";
import { SeedService } from "./seed.service";

// Infrastructure dependencies
import { RepositoriesModule } from "../../infrastructure/repositories/repositories.module";
import { RedisModule } from "../../infrastructure/redis/redis.module";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { LlmModule } from "../llm/llm.module";
import { AdaptersModule } from "../adapters/adapters.module";
import { EventsModule } from "../events/events.module";
import { PoliciesModule } from "../policies/policies.module";

@Module({
  imports: [
    ConfigModule,
    RepositoriesModule,
    RedisModule,
    DatabaseModule,
    forwardRef(() => LlmModule),
    AdaptersModule,
    EventsModule,
    PoliciesModule,
  ],
  providers: [
    InboxService,
    AddressDepthService,
    MemoryCompressionService,
    CandidateRetrievalService,
    ContinuityModeService,
    MessageDeliveryService,
    AgentSubscriptionService,
    InventoryService,
    AuditService,
    WebhookService,
    StaffService,
    BulkOperationsService,
    LoyaltyService,
    NotificationsService,
    AnalyticsService,
    PaymentService,
    KpiService,
    ProductOcrService,
    IntegrationService,
    CustomerReorderService,
    DriverStatusService,
    SeedService,
  ],
  exports: [
    InboxService,
    AddressDepthService,
    MemoryCompressionService,
    CandidateRetrievalService,
    ContinuityModeService,
    MessageDeliveryService,
    AgentSubscriptionService,
    InventoryService,
    AuditService,
    WebhookService,
    StaffService,
    BulkOperationsService,
    LoyaltyService,
    NotificationsService,
    AnalyticsService,
    PaymentService,
    KpiService,
    ProductOcrService,
    IntegrationService,
    CustomerReorderService,
    DriverStatusService,
    SeedService,
  ],
})
export class ServicesModule {}
