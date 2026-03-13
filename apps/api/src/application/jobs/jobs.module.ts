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
import { ForecastModule } from "../forecasting/forecast.module";

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
  ],
  exports: [
    FollowupScheduler,
    DailyReportScheduler,
    WeeklyReportScheduler,
    DeliveryStatusPoller,
    MessageDeliveryWorker,
    SubscriptionExpiryScheduler,
    AutomationScheduler,
    ForecastModule,
  ],
})
export class JobsModule {}
