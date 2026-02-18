import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { createLogger } from "@tash8eel/shared";
import {
  AgentTask,
  AgentResult,
  AgentType,
  IAgent,
  SUPPORT_AGENT_TASK_TYPES,
} from "@tash8eel/agent-sdk";
import { SupportHandlers } from "./support.handlers";

const logger = createLogger("SupportAgent");

@Injectable()
export class SupportAgent implements IAgent {
  readonly agentType: AgentType = "SUPPORT_AGENT";
  readonly supportedTaskTypes = Object.values(SUPPORT_AGENT_TASK_TYPES);
  private readonly nestLogger = new Logger(SupportAgent.name);
  private readonly handlers: SupportHandlers;

  constructor(@Inject("DATABASE_POOL") private readonly pool: Pool) {
    this.handlers = new SupportHandlers(pool);
  }

  canHandle(taskType: string): boolean {
    return this.supportedTaskTypes.includes(taskType as any);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.nestLogger.log(`Executing support task: ${task.taskType}`);
    logger.info("SupportAgent executing", {
      taskType: task.taskType,
      taskId: task.id,
    });

    let output: Record<string, unknown>;

    try {
      switch (task.taskType) {
        case SUPPORT_AGENT_TASK_TYPES.ESCALATION_RESPONSE:
          output = await this.handlers.escalateToHuman(task);
          break;

        case SUPPORT_AGENT_TASK_TYPES.FAQ_RESPONSE:
          output = await this.handlers.answerFaq(task);
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
      this.nestLogger.error(`Support task failed: ${err.message}`, err.stack);
      logger.error("SupportAgent execution failed", {
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
