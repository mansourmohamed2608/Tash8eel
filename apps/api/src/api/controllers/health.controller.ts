import { Controller, Get, Inject } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { RedisService } from "../../infrastructure/redis/redis.service";

interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
  };
}

interface ComponentHealth {
  status: "healthy" | "unhealthy";
  latencyMs?: number;
  error?: string;
}

@ApiTags("Health")
@Controller()
@SkipThrottle()
export class HealthController {
  private readonly startTime = Date.now();
  private readonly version = process.env.npm_package_version || "1.0.0";

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Simple liveness probe
   * Returns 200 if the service is running
   */
  @Get("health")
  @ApiOperation({ summary: "Liveness probe" })
  @ApiResponse({ status: 200, description: "Service is alive" })
  async getHealth(): Promise<{ status: string; timestamp: string }> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe with dependency checks
   * Returns 200 only if all dependencies are healthy
   */
  @Get("ready")
  @ApiOperation({ summary: "Readiness probe with dependency checks" })
  @ApiResponse({ status: 200, description: "Service is ready" })
  @ApiResponse({ status: 503, description: "Service is not ready" })
  async getReadiness(): Promise<HealthStatus> {
    const checks = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
    };

    const allHealthy = Object.values(checks).every(
      (c) => c.status === "healthy",
    );
    const anyUnhealthy = Object.values(checks).some(
      (c) => c.status === "unhealthy",
    );

    let overallStatus: "healthy" | "unhealthy" | "degraded";
    if (allHealthy) {
      overallStatus = "healthy";
    } else if (anyUnhealthy) {
      overallStatus = "degraded";
    } else {
      overallStatus = "unhealthy";
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks,
    };
  }

  /**
   * Detailed health check for monitoring systems
   */
  @Get("health/detailed")
  @ApiOperation({ summary: "Detailed health status" })
  @ApiResponse({ status: 200, description: "Detailed health information" })
  async getDetailedHealth(): Promise<
    HealthStatus & {
      memory: NodeJS.MemoryUsage;
      pid: number;
    }
  > {
    const readiness = await this.getReadiness();

    return {
      ...readiness,
      memory: process.memoryUsage(),
      pid: process.pid,
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.pool.query("SELECT 1");
      return {
        status: "healthy",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        latencyMs: Date.now() - start,
        error: (error as Error).message,
      };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.redisService.set("health:ping", "pong", 10);
      const result = await this.redisService.get("health:ping");

      if (result !== "pong") {
        throw new Error("Redis read/write mismatch");
      }

      return {
        status: "healthy",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        latencyMs: Date.now() - start,
        error: (error as Error).message,
      };
    }
  }
}
