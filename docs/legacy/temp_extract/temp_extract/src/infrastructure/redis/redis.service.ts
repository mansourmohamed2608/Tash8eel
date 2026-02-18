import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import Redlock from "redlock";
import { createLogger } from "../../shared/logging/logger";

const logger = createLogger("RedisService");

export interface Lock {
  release(): Promise<void>;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private redlock: Redlock | null = null;
  private isEnabled = false;
  // In-memory locks for fallback when Redis is disabled
  private readonly inMemoryLocks = new Map<string, { expiresAt: number }>();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get<string>("REDIS_HOST");
    const redisEnabled = this.configService.get<string>(
      "REDIS_ENABLED",
      "false",
    );

    if (!host || redisEnabled === "false") {
      logger.info("Redis disabled or not configured, using fallback locking");
      return;
    }

    try {
      this.client = new Redis({
        host,
        port: this.configService.get<number>("REDIS_PORT", 6379),
        password: this.configService.get<string>("REDIS_PASSWORD") || undefined,
        db: this.configService.get<number>("REDIS_DB", 0),
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Don't retry - fail fast
        lazyConnect: true,
      });

      // Suppress connection error events
      this.client.on("error", () => {});

      await this.client.connect();
      await this.client.ping();

      this.redlock = new Redlock([this.client], {
        driftFactor: 0.01,
        retryCount: 3,
        retryDelay: 200,
        retryJitter: 200,
      });

      this.isEnabled = true;
      logger.info("Redis connected successfully");
    } catch (error) {
      logger.warn("Redis connection failed, using fallback locking", { error });
      if (this.client) {
        this.client.disconnect();
      }
      this.client = null;
      this.redlock = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  async acquireLock(
    resource: string,
    ttlMs: number = 30000,
  ): Promise<Lock | null> {
    // If Redis is disabled, use in-memory locking (single instance only)
    if (!this.redlock || !this.isEnabled) {
      return this.acquireInMemoryLock(resource, ttlMs);
    }

    try {
      const lock = await this.redlock.acquire([`lock:${resource}`], ttlMs);
      return {
        release: async () => {
          try {
            await lock.release();
          } catch (error) {
            logger.warn("Failed to release lock", { resource, error });
          }
        },
      };
    } catch (error) {
      logger.warn("Failed to acquire lock", { resource, error });
      return null;
    }
  }

  private acquireInMemoryLock(resource: string, ttlMs: number): Lock | null {
    const now = Date.now();
    const existing = this.inMemoryLocks.get(resource);

    // Check if existing lock is still valid
    if (existing && existing.expiresAt > now) {
      return null; // Lock is held
    }

    // Acquire the lock
    this.inMemoryLocks.set(resource, { expiresAt: now + ttlMs });

    return {
      release: async () => {
        this.inMemoryLocks.delete(resource);
      },
    };
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isEnabled) return null;
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    expirySeconds?: number,
  ): Promise<boolean> {
    if (!this.client || !this.isEnabled) return false;

    if (expirySeconds) {
      await this.client.setex(key, expirySeconds, value);
    } else {
      await this.client.set(key, value);
    }
    return true;
  }

  async del(key: string): Promise<boolean> {
    if (!this.client || !this.isEnabled) return false;
    await this.client.del(key);
    return true;
  }

  async incr(key: string): Promise<number> {
    if (!this.client || !this.isEnabled) return 0;
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client || !this.isEnabled) return false;
    await this.client.expire(key, seconds);
    return true;
  }

  async releaseLock(
    lock: { release: () => Promise<void> } | null,
  ): Promise<void> {
    if (lock) {
      await lock.release();
    }
  }
}
