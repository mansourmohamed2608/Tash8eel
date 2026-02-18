import {
  Module,
  Global,
  OnModuleDestroy,
  Inject,
  Logger,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RedisService } from "./redis.service";
import Redis from "ioredis";

export const REDIS_CLIENT = "REDIS_CLIENT";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RedisService,
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>("REDIS_HOST");
        const redisEnabled = configService.get<string>(
          "REDIS_ENABLED",
          "false",
        );

        if (!host || redisEnabled === "false") {
          // Return a mock Redis client that does nothing
          return null;
        }

        return new Redis({
          host,
          port: configService.get<number>("REDIS_PORT", 6379),
          password: configService.get<string>("REDIS_PASSWORD") || undefined,
          db: configService.get<number>("REDIS_DB", 0),
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.logger.log("Closing Redis connection...");
      await this.redis.quit();
      this.logger.log("Redis connection closed");
    }
  }
}
