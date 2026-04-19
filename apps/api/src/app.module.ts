import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";

// API module
import { ApiModule } from "./api/api.module";

// Infrastructure modules
import { DatabaseModule } from "./infrastructure/database/database.module";
import { RedisModule } from "./infrastructure/redis/redis.module";
import { CacheModule } from "./infrastructure/cache/cache.module";
import { WebSocketModule } from "./infrastructure/websocket/websocket.module";

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
      envFilePath: [".env.local", ".env", "../../.env"],
    }),

    // Rate Limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: "short",
            ttl: config.get<number>("RATE_LIMIT_TTL", 60) * 1000,
            limit: config.get<number>("RATE_LIMIT_MAX", 100),
          },
          {
            name: "long",
            ttl: 60000, // 1 minute
            limit: config.get<number>("RATE_LIMIT_MAX_PER_MINUTE", 300),
          },
        ],
      }),
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Infrastructure
    DatabaseModule,
    RedisModule,
    CacheModule,
    WebSocketModule,

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
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes("*");
  }
}
