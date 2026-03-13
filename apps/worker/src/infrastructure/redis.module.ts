import { Module, Global, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

export const REDIS_CLIENT = "REDIS_CLIENT";

// Mock Redis client for when Redis is disabled
class MockRedisClient {
  private logger = new Logger("MockRedisClient");

  async get() {
    return null;
  }
  async set() {
    return "OK";
  }
  async del() {
    return 0;
  }
  async exists() {
    return 0;
  }
  async expire() {
    return 0;
  }
  async ttl() {
    return -1;
  }
  async incr() {
    return 1;
  }
  async decr() {
    return 0;
  }
  async lpush() {
    return 1;
  }
  async rpush() {
    return 1;
  }
  async lpop() {
    return null;
  }
  async rpop() {
    return null;
  }
  async lrange() {
    return [];
  }
  async hset() {
    return 1;
  }
  async hget() {
    return null;
  }
  async hgetall() {
    return {};
  }
  async hdel() {
    return 0;
  }
  async sadd() {
    return 1;
  }
  async smembers() {
    return [];
  }
  async srem() {
    return 0;
  }
  async publish() {
    return 0;
  }
  async subscribe() {
    return;
  }
  async unsubscribe() {
    return;
  }
  async quit() {
    return "OK";
  }
  async ping() {
    return "PONG";
  }
  on() {
    return this;
  }
  duplicate() {
    return new MockRedisClient();
  }
}

const redisFactory = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const redisEnabled =
      configService.get<string>("REDIS_ENABLED", "true") === "true";
    const logger = new Logger("RedisModule");

    if (!redisEnabled) {
      logger.warn("Redis is DISABLED - using mock client (no caching/locks)");
      return new MockRedisClient();
    }

    const redisUrl = configService.get<string>("REDIS_URL");
    logger.log("Redis is ENABLED - connecting to Redis server");

    if (redisUrl) {
      // Full URL — supports rediss:// (TLS) for Upstash / Redis Cloud
      return new Redis(redisUrl, {
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
    }

    return new Redis({
      host: configService.get<string>("REDIS_HOST", "localhost"),
      port: configService.get<number>("REDIS_PORT", 6379),
      password: configService.get<string>("REDIS_PASSWORD"),
      db: configService.get<number>("REDIS_DB", 0),
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 3,
      lazyConnect: true, // Don't connect immediately
    });
  },
};

@Global()
@Module({
  providers: [redisFactory],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
