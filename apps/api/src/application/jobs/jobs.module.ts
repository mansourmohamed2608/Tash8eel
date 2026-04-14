import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { RedisModule } from "../../infrastructure/redis/redis.module";
import { EventsModule } from "../events/events.module";
import { AdaptersModule } from "../adapters/adapters.module";
import { ServicesModule } from "../services/services.module";
import { LlmModule } from "../llm/llm.module";
import { FollowupScheduler } from "./followup.scheduler";
import { DailyReportScheduler } from "./daily-report.scheduler";
import { DeliveryStatusPoller } from "./delivery-status.poller";
import { MessageDeliveryWorker } from "./message-delivery.worker";
import { WeeklyReportScheduler } from "./weekly-report.scheduler";
import { SubscriptionExpiryScheduler } from "./subscription-expiry.scheduler";
import { AutomationScheduler } from "./automation.scheduler";
import { MerchantDeletionScheduler } from "./merchant-deletion.scheduler";
import { ForecastModule } from "../forecasting/forecast.module";
import { OverageService } from "../services/overage.service";
import { InventoryReservationReconciliationScheduler } from "./inventory-reservation-reconciliation.scheduler";
import { ConnectorRuntimeWorkerScheduler } from "./connector-runtime-worker.scheduler";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    EventsModule,
    AdaptersModule,
    ServicesModule,
    LlmModule,
    ForecastModule,
  ],
  providers: [
    FollowupScheduler,
    DailyReportScheduler,
    WeeklyReportScheduler,
    DeliveryStatusPoller,
    MessageDeliveryWorker,
    SubscriptionExpiryScheduler,
    AutomationScheduler,
    MerchantDeletionScheduler,
    InventoryReservationReconciliationScheduler,
    ConnectorRuntimeWorkerScheduler,
    OverageService,
  ],
  exports: [
    FollowupScheduler,
    DailyReportScheduler,
    WeeklyReportScheduler,
    DeliveryStatusPoller,
    MessageDeliveryWorker,
    SubscriptionExpiryScheduler,
    AutomationScheduler,
    MerchantDeletionScheduler,
    InventoryReservationReconciliationScheduler,
    ConnectorRuntimeWorkerScheduler,
    OverageService,
    ForecastModule,
  ],
})
export class JobsModule {}
