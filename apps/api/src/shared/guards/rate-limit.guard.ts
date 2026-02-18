import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Pool } from "pg";
import { Request } from "express";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { REDIS_CLIENT } from "../../infrastructure/redis/redis.module";

export const RATE_LIMIT_KEY = "rate_limit";

export interface RateLimitConfig {
  limit: number; // Max requests
  window: number; // Window in seconds
  keyType?: "ip" | "merchant" | "user" | "api_key";
  skipIf?: (req: Request) => boolean;
}

/**
 * Decorator to set rate limit on a route
 */
export function RateLimit(config: RateLimitConfig) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(RATE_LIMIT_KEY, config, descriptor.value);
    return descriptor;
  };
}

@Injectable()
export class EnhancedRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(EnhancedRateLimitGuard.name);
  private readonly defaultLimit: number;
  private readonly defaultWindow: number;

  constructor(
    private readonly reflector: Reflector,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.defaultLimit = configService.get<number>("RATE_LIMIT_DEFAULT", 100);
    this.defaultWindow = configService.get<number>("RATE_LIMIT_WINDOW", 60);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Get rate limit config from decorator or use defaults
    const config = this.reflector.get<RateLimitConfig>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    ) || {
      limit: this.defaultLimit,
      window: this.defaultWindow,
      keyType: "ip",
    };

    // Check skip condition
    if (config.skipIf && config.skipIf(request)) {
      return true;
    }

    const key = this.buildKey(request, config.keyType || "ip");
    const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / (config.window * 1000))}`;

    try {
      // Use Redis for rate limiting (more performant than DB)
      const current = await this.redis.incr(windowKey);

      if (current === 1) {
        // First request in window, set expiry
        await this.redis.expire(windowKey, config.window);
      }

      // Set rate limit headers
      const response = context.switchToHttp().getResponse();
      response.setHeader("X-RateLimit-Limit", config.limit);
      response.setHeader(
        "X-RateLimit-Remaining",
        Math.max(0, config.limit - current),
      );
      response.setHeader(
        "X-RateLimit-Reset",
        Math.ceil(Date.now() / 1000) + config.window,
      );

      if (current > config.limit) {
        // Log violation
        await this.logViolation(request, config, current);

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: "Rate limit exceeded. Please try again later.",
            retryAfter: config.window,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      // If Redis fails, fall back to allowing the request (fail-open)
      this.logger.error("Rate limit check failed:", error);
      return true;
    }
  }

  private buildKey(request: Request, keyType: string): string {
    const merchantId = (request as any).merchantId;
    const staffId = (request as any).staffId;
    const ip = this.getClientIp(request);
    const endpoint = `${request.method}:${request.route?.path || request.path}`;

    switch (keyType) {
      case "merchant":
        return `merchant:${merchantId || "unknown"}:${endpoint}`;
      case "user":
        return `user:${staffId || merchantId || ip}:${endpoint}`;
      case "api_key":
        return `apikey:${merchantId || "unknown"}:${endpoint}`;
      case "ip":
      default:
        return `ip:${ip}:${endpoint}`;
    }
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers["x-forwarded-for"];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(",")[0].trim();
    }
    return request.ip || request.socket?.remoteAddress || "unknown";
  }

  private async logViolation(
    request: Request,
    config: RateLimitConfig,
    current: number,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO rate_limit_violations (
          merchant_id, identifier, limit_type, limit_value, current_value, endpoint, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          (request as any).merchantId || null,
          this.buildKey(request, config.keyType || "ip"),
          config.keyType || "ip",
          config.limit,
          current,
          `${request.method} ${request.path}`,
          this.getClientIp(request),
        ],
      );
    } catch (error) {
      // Non-blocking, just log
      this.logger.error("Failed to log rate limit violation:", error);
    }
  }
}

/**
 * Service for advanced rate limiting operations
 */
@Injectable()
export class RateLimitService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Check if an identifier is currently rate limited
   */
  async isRateLimited(
    identifier: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{
    limited: boolean;
    current: number;
    remaining: number;
    resetAt: number;
  }> {
    const windowKey = `ratelimit:${identifier}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const current = parseInt((await this.redis.get(windowKey)) || "0");
    const resetAt = Math.ceil(Date.now() / 1000) + windowSeconds;

    return {
      limited: current >= limit,
      current,
      remaining: Math.max(0, limit - current),
      resetAt,
    };
  }

  /**
   * Manually increment rate limit counter
   */
  async increment(identifier: string, windowSeconds: number): Promise<number> {
    const windowKey = `ratelimit:${identifier}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const current = await this.redis.incr(windowKey);
    if (current === 1) {
      await this.redis.expire(windowKey, windowSeconds);
    }
    return current;
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string): Promise<void> {
    const pattern = `ratelimit:${identifier}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Get rate limit violations for a merchant
   */
  async getViolations(merchantId: string, days: number = 7): Promise<any[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.pool.query(
      `SELECT * FROM rate_limit_violations 
       WHERE merchant_id = $1 AND created_at >= $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [merchantId, startDate],
    );

    return result.rows.map((row) => ({
      id: row.id,
      identifier: row.identifier,
      limitType: row.limit_type,
      limitValue: row.limit_value,
      currentValue: row.current_value,
      endpoint: row.endpoint,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get violation stats
   */
  async getViolationStats(
    merchantId: string,
    days: number = 7,
  ): Promise<{
    total: number;
    byEndpoint: Record<string, number>;
    byIp: Record<string, number>;
    timeline: Array<{ date: string; count: number }>;
  }> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalResult, endpointResult, ipResult, timelineResult] =
      await Promise.all([
        this.pool.query(
          `SELECT COUNT(*) FROM rate_limit_violations WHERE merchant_id = $1 AND created_at >= $2`,
          [merchantId, startDate],
        ),
        this.pool.query(
          `SELECT endpoint, COUNT(*) as count FROM rate_limit_violations 
         WHERE merchant_id = $1 AND created_at >= $2
         GROUP BY endpoint ORDER BY count DESC LIMIT 10`,
          [merchantId, startDate],
        ),
        this.pool.query(
          `SELECT ip_address, COUNT(*) as count FROM rate_limit_violations 
         WHERE merchant_id = $1 AND created_at >= $2
         GROUP BY ip_address ORDER BY count DESC LIMIT 10`,
          [merchantId, startDate],
        ),
        this.pool.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count FROM rate_limit_violations 
         WHERE merchant_id = $1 AND created_at >= $2
         GROUP BY DATE(created_at) ORDER BY date`,
          [merchantId, startDate],
        ),
      ]);

    const byEndpoint: Record<string, number> = {};
    endpointResult.rows.forEach((r) => {
      byEndpoint[r.endpoint] = parseInt(r.count);
    });

    const byIp: Record<string, number> = {};
    ipResult.rows.forEach((r) => {
      byIp[r.ip_address] = parseInt(r.count);
    });

    return {
      total: parseInt(totalResult.rows[0].count),
      byEndpoint,
      byIp,
      timeline: timelineResult.rows.map((r) => ({
        date: r.date.toISOString().split("T")[0],
        count: parseInt(r.count),
      })),
    };
  }

  /**
   * Block an IP address
   */
  async blockIp(ip: string, durationMinutes: number = 60): Promise<void> {
    const key = `blocked:ip:${ip}`;
    await this.redis.setex(key, durationMinutes * 60, "1");
  }

  /**
   * Check if IP is blocked
   */
  async isIpBlocked(ip: string): Promise<boolean> {
    const key = `blocked:ip:${ip}`;
    const blocked = await this.redis.get(key);
    return blocked === "1";
  }

  /**
   * Unblock an IP address
   */
  async unblockIp(ip: string): Promise<void> {
    const key = `blocked:ip:${ip}`;
    await this.redis.del(key);
  }
}
