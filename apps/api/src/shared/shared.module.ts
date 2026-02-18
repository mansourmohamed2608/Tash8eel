import { Module, Global } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AdminApiKeyGuard } from "./guards/admin-api-key.guard";
import { MerchantApiKeyGuard } from "./guards/merchant-api-key.guard";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AdminApiKeyGuard, MerchantApiKeyGuard, ConfigService],
  exports: [AdminApiKeyGuard, MerchantApiKeyGuard, ConfigService],
})
export class SharedModule {}
