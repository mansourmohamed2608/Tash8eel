import { Module } from "@nestjs/common";
import { OrchestratorService } from "./orchestrator.service";
import { TeamOrchestratorService } from "./team-orchestrator.service";
import { AgentsModule } from "../agents/agents.module";

@Module({
  imports: [AgentsModule],
  providers: [OrchestratorService, TeamOrchestratorService],
  exports: [OrchestratorService, TeamOrchestratorService],
})
export class OrchestratorModule {}
