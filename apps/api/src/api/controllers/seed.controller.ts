/**
 * Internal Seed Controller
 * Provides API endpoint for seeding demo data.
 * Protected: only available in non-production environments.
 */
import {
  Controller,
  Post,
  Delete,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { SeedService } from "../../application/services/seed.service";

@Controller("internal/seed")
export class SeedController {
  private readonly logger = new Logger(SeedController.name);

  constructor(private readonly seedService: SeedService) {}

  /**
   * POST /internal/seed/demo
   * Seeds the full demo dataset (~85 tables).
   * Blocked in production.
   */
  @Post("demo")
  @HttpCode(HttpStatus.OK)
  async seedDemo() {
    this.guardNonProduction();
    this.logger.log("🌱 Seed demo request received");
    const result = await this.seedService.seedDemo();
    return {
      success: true,
      message: `Demo data seeded: ${result.tables} tables in ${result.duration}ms`,
      ...result,
    };
  }

  /**
   * DELETE /internal/seed/demo
   * Cleans all demo data (merchant_id = 'demo-merchant').
   * Blocked in production.
   */
  @Delete("demo")
  @HttpCode(HttpStatus.OK)
  async cleanDemo() {
    this.guardNonProduction();
    this.logger.log("🧹 Clean demo request received");
    const result = await this.seedService.cleanDemo();
    return {
      success: true,
      message: "Demo data cleaned",
      ...result,
    };
  }

  private guardNonProduction(): void {
    const env = process.env.NODE_ENV || "development";
    if (env === "production") {
      throw new ForbiddenException("Seed endpoints are disabled in production");
    }
  }
}
