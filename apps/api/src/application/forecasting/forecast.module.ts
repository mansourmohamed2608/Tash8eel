import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../infrastructure/database/database.module";
import { RedisModule } from "../../infrastructure/redis/redis.module";
import { ForecastEngineService } from "./forecast-engine.service";
import { ForecastScheduler } from "./forecast.scheduler";

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [ForecastEngineService, ForecastScheduler],
  exports: [ForecastEngineService, ForecastScheduler],
})
export class ForecastModule {}
