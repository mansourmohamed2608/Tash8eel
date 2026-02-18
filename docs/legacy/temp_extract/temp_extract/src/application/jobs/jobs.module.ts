import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { RedisModule } from "../../infrastructure/redis/redis.module";
import { EventsModule } from "../events/events.module";
import { AdaptersModule } from "../adapters/adapters.module";
import { FollowupScheduler } from "./followup.scheduler";
import { DailyReportScheduler } from "./daily-report.scheduler";
import { DeliveryStatusPoller } from "./delivery-status.poller";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    EventsModule,
    AdaptersModule,
  ],
  providers: [FollowupScheduler, DailyReportScheduler, DeliveryStatusPoller],
  exports: [FollowupScheduler, DailyReportScheduler, DeliveryStatusPoller],
})
export class JobsModule {}
