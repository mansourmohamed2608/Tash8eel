import { Module } from "@nestjs/common";
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
import { WebhookService } from "./webhook.service";
import { StaffService } from "./staff.service";
import { BulkOperationsService } from "./bulk-operations.service";
import { LoyaltyService } from "./loyalty.service";
import { AnalyticsService } from "./analytics.service";
import { PaymentService } from "./payment.service";
import { KpiService } from "./kpi.service";
import { ProductOcrService } from "./product-ocr.service";
import { IntegrationService } from "./integration.service";
import { CustomerReorderService } from "./customer-reorder.service";
import { DriverStatusService } from "./driver-status.service";
import { SeedService } from "./seed.service";
import { BillingCatalogService } from "./billing-catalog.service";
import { RagRetrievalService } from "./rag-retrieval.service";
import { MerchantDeletionService } from "./merchant-deletion.service";
import { VoiceAiService } from "./voice-ai.service";
import { CommerceFactsService } from "./commerce-facts.service";
import { CashierCopilotService } from "./cashier-copilot.service";
import { DeliveryExecutionService } from "./delivery-execution.service";
import { ConnectorRuntimeService } from "./connector-runtime.service";
import { HqGovernanceService } from "./hq-governance.service";
import { IdempotencyService } from "../../shared/services/idempotency.service";
import { AiMetricsService } from "../../shared/services/ai-metrics.service";

// Infrastructure dependencies
import { RepositoriesModule } from "../../infrastructure/repositories/repositories.module";
import { RedisModule } from "../../infrastructure/redis/redis.module";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { LlmModule } from "../llm/llm.module";
import { AdaptersModule } from "../adapters/adapters.module";
import { EventsModule } from "../events/events.module";
import { PoliciesModule } from "../policies/policies.module";
import { SharedAiModule } from "../shared/shared-ai.module";

@Module({
  imports: [
    ConfigModule,
    RepositoriesModule,
    RedisModule,
    DatabaseModule,
    LlmModule,
    AdaptersModule,
    EventsModule,
    PoliciesModule,
    SharedAiModule,
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
    WebhookService,
    StaffService,
    BulkOperationsService,
    LoyaltyService,
    AnalyticsService,
    PaymentService,
    KpiService,
    ProductOcrService,
    IntegrationService,
    CustomerReorderService,
    DriverStatusService,
    SeedService,
    BillingCatalogService,
    RagRetrievalService,
    MerchantDeletionService,
    VoiceAiService,
    CommerceFactsService,
    CashierCopilotService,
    DeliveryExecutionService,
    ConnectorRuntimeService,
    HqGovernanceService,
    IdempotencyService,
    AiMetricsService,
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
    WebhookService,
    StaffService,
    BulkOperationsService,
    LoyaltyService,
    AnalyticsService,
    PaymentService,
    KpiService,
    ProductOcrService,
    IntegrationService,
    CustomerReorderService,
    DriverStatusService,
    SeedService,
    BillingCatalogService,
    RagRetrievalService,
    MerchantDeletionService,
    VoiceAiService,
    CommerceFactsService,
    CashierCopilotService,
    DeliveryExecutionService,
    ConnectorRuntimeService,
    HqGovernanceService,
    IdempotencyService,
    AiMetricsService,
    SharedAiModule,
  ],
})
export class ServicesModule {}
