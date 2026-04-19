import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { MerchantDeletionService } from "../services/merchant-deletion.service";

@Injectable()
export class MerchantDeletionScheduler {
  private readonly logger = new Logger(MerchantDeletionScheduler.name);

  constructor(
    private readonly merchantDeletionService: MerchantDeletionService,
  ) {}

  @Cron("0 2 * * *", { timeZone: "UTC" })
  async runDailyDeletionSweep(): Promise<void> {
    try {
      const processed = await this.merchantDeletionService.processDueRequests();
      this.logger.log(
        `Merchant deletion sweep complete. Processed requests: ${processed}`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Merchant deletion sweep failed: ${err.message}`,
        err.stack,
      );
    }
  }
}
