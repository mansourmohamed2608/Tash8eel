import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_FILTER } from "@nestjs/core";

// API module
import { ApiModule } from "./api/api.module";

// Infrastructure modules
import { DatabaseModule } from "./infrastructure/database/database.module";
import { RedisModule } from "./infrastructure/redis/redis.module";

// Application modules
import { EventsModule } from "./application/events/events.module";
import { JobsModule } from "./application/jobs/jobs.module";
import { DlqModule } from "./application/dlq/dlq.module";

// Shared
import { CorrelationIdMiddleware } from "./shared/middleware/correlation-id.middleware";
import { AllExceptionsFilter } from "./shared/filters/all-exceptions.filter";

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Infrastructure
    DatabaseModule,
    RedisModule,

    // Application
    EventsModule,
    JobsModule,
    DlqModule,

    // API
    ApiModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes("*");
  }
}
