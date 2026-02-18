import { Module } from "@nestjs/common";
import { FollowupSchedulerService } from "./followup-scheduler.service";
import { DailyReportSchedulerService } from "./daily-report-scheduler.service";
import { AnomalyDetectionSchedulerService } from "./anomaly-detection-scheduler.service";
import { ProactiveAlertsSchedulerService } from "./proactive-alerts-scheduler.service";
import { AutonomousAgentBrainService } from "./autonomous-agent-brain.service";
import { LlmClientModule } from "../infrastructure/llm-client.module";

@Module({
  imports: [LlmClientModule],
  providers: [
    FollowupSchedulerService,
    DailyReportSchedulerService,
    AnomalyDetectionSchedulerService,
    ProactiveAlertsSchedulerService,
    AutonomousAgentBrainService,
  ],
  exports: [
    FollowupSchedulerService,
    DailyReportSchedulerService,
    AnomalyDetectionSchedulerService,
    ProactiveAlertsSchedulerService,
    AutonomousAgentBrainService,
  ],
})
export class JobsModule {}
