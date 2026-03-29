import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdaptersModule } from "../adapters/adapters.module";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { RedisModule } from "../../infrastructure/redis/redis.module";
import { AuditService } from "../services/audit.service";
import { NotificationsService } from "../services/notifications.service";
import { UsageGuardService } from "../services/usage-guard.service";

@Module({
  imports: [ConfigModule, DatabaseModule, RedisModule, AdaptersModule],
  providers: [AuditService, NotificationsService, UsageGuardService],
  exports: [AuditService, NotificationsService, UsageGuardService],
})
export class SharedAiModule {}
