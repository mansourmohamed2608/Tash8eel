import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { createLogger } from "@tash8eel/shared";
import {
  AgentTask,
  AgentResult,
  AgentType,
  IAgent,
  MARKETING_AGENT_TASK_TYPES,
} from "@tash8eel/agent-sdk";
import { MarketingHandlers } from "./marketing.handlers";

const logger = createLogger("MarketingAgent");

@Injectable()
export class MarketingAgent implements IAgent {
  readonly agentType: AgentType = "MARKETING_AGENT";
  readonly supportedTaskTypes = Object.values(MARKETING_AGENT_TASK_TYPES);
  private readonly nestLogger = new Logger(MarketingAgent.name);
  private readonly handlers: MarketingHandlers;

  constructor(@Inject("DATABASE_POOL") private readonly pool: Pool) {
    this.handlers = new MarketingHandlers(pool);
  }

  canHandle(taskType: string): boolean {
    return this.supportedTaskTypes.includes(taskType as any);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.nestLogger.log(`Executing marketing task: ${task.taskType}`);
    logger.info("MarketingAgent executing", {
      taskType: task.taskType,
      taskId: task.id,
    });

    let output: Record<string, unknown>;

    try {
      switch (task.taskType) {
        case MARKETING_AGENT_TASK_TYPES.GENERATE_PROMO:
          output = await this.handlers.createCampaign(task);
          break;

        case MARKETING_AGENT_TASK_TYPES.CUSTOMER_SEGMENT:
          output = await this.handlers.segmentCustomers(task);
          break;

        default:
          output = {
            action: "NO_ACTION",
            message: `Unknown task type: ${task.taskType}`,
          };
      }

      const success = output.action !== "FAILED";

      return {
        id: `result-${task.id}`,
        taskId: task.id,
        agentType: this.agentType,
        success,
        output,
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        createdAt: new Date(),
      };
    } catch (error) {
      const err = error as Error;
      this.nestLogger.error(`Marketing task failed: ${err.message}`, err.stack);
      logger.error("MarketingAgent execution failed", {
        error: err.message,
        taskId: task.id,
      });

      return {
        id: `result-${task.id}`,
        taskId: task.id,
        agentType: this.agentType,
        success: false,
        error: err.message,
        output: { action: "FAILED", message: err.message },
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        createdAt: new Date(),
      };
    }
  }
}
