import { Module, Global } from "@nestjs/common";
import { AiCacheService } from "./ai-cache.service";

@Global()
@Module({
  providers: [AiCacheService],
  exports: [AiCacheService],
})
export class CacheModule {}
