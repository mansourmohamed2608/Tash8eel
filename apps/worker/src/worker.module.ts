import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";

// Infrastructure
import { DatabaseModule } from "./infrastructure/database.module";
import { RedisModule } from "./infrastructure/redis.module";

// Worker modules
import { OutboxModule } from "./outbox/outbox.module";
import { OrchestratorModule } from "./orchestrator/orchestrator.module";
import { JobsModule } from "./jobs/jobs.module";
import { AgentsModule } from "./agents/agents.module";

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env", "../../.env"],
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Infrastructure
    DatabaseModule,
    RedisModule,

    // Worker modules
    OutboxModule,
    OrchestratorModule,
    JobsModule,
    AgentsModule,
  ],
})
export class WorkerModule {}
