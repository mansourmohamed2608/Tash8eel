import { Module, Global } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { RedisModule } from "../../infrastructure/redis/redis.module";
import { RepositoriesModule } from "../../infrastructure/repositories/repositories.module";
import { SharedAiModule } from "../shared/shared-ai.module";
import { EventHandlerRegistry } from "./event-handler.registry";
import { OutboxService } from "./outbox.service";
import { OutboxWorker } from "./outbox.worker";
import {
  ShipmentBookedHandler,
  DeliveryStatusHandler,
  FollowupHandler,
  MerchantAlertHandler,
  OrderCreatedHandler,
} from "./handlers";

@Global()
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    ScheduleModule.forRoot(),
    RepositoriesModule,
    SharedAiModule,
  ],
  providers: [
    EventHandlerRegistry,
    OutboxService,
    OutboxWorker,
    // Event handlers (auto-register on init)
    ShipmentBookedHandler,
    DeliveryStatusHandler,
    FollowupHandler,
    MerchantAlertHandler,
    OrderCreatedHandler,
  ],
  exports: [EventHandlerRegistry, OutboxService],
})
export class EventsModule {}
