import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { RedisModule } from "../../infrastructure/redis/redis.module";
import { EventsModule } from "../events/events.module";
import { AdaptersModule } from "../adapters/adapters.module";
import { ServicesModule } from "../services/services.module";
import { FollowupScheduler } from "./followup.scheduler";
import { DailyReportScheduler } from "./daily-report.scheduler";
import { DeliveryStatusPoller } from "./delivery-status.poller";
import { MessageDeliveryWorker } from "./message-delivery.worker";
import { WeeklyReportScheduler } from "./weekly-report.scheduler";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    EventsModule,
    AdaptersModule,
    ServicesModule,
  ],
  providers: [
    FollowupScheduler,
    DailyReportScheduler,
    WeeklyReportScheduler,
    DeliveryStatusPoller,
    MessageDeliveryWorker,
  ],
  exports: [
    FollowupScheduler,
    DailyReportScheduler,
    WeeklyReportScheduler,
    DeliveryStatusPoller,
    MessageDeliveryWorker,
  ],
})
export class JobsModule {}
