import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { createLogger } from "@tash8eel/shared";
import {
  AgentTask,
  AgentResult,
  AgentType,
  IAgent,
  CONTENT_AGENT_TASK_TYPES,
} from "@tash8eel/agent-sdk";
import { ContentHandlers } from "./content.handlers";

const logger = createLogger("ContentAgent");

@Injectable()
export class ContentAgent implements IAgent {
  readonly agentType: AgentType = "CONTENT_AGENT";
  readonly supportedTaskTypes = Object.values(CONTENT_AGENT_TASK_TYPES);
  private readonly nestLogger = new Logger(ContentAgent.name);
  private readonly handlers: ContentHandlers;

  constructor(@Inject("DATABASE_POOL") private readonly pool: Pool) {
    this.handlers = new ContentHandlers(pool);
  }

  canHandle(taskType: string): boolean {
    return this.supportedTaskTypes.includes(taskType as any);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.nestLogger.log(`Executing content task: ${task.taskType}`);
    logger.info("ContentAgent executing", {
      taskType: task.taskType,
      taskId: task.id,
    });

    let output: Record<string, unknown>;

    try {
      switch (task.taskType) {
        case CONTENT_AGENT_TASK_TYPES.GENERATE_DESCRIPTION:
          output = await this.handlers.generateDescription(task);
          break;

        case CONTENT_AGENT_TASK_TYPES.TRANSLATE_CONTENT:
          output = await this.handlers.translateContent(task);
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
      this.nestLogger.error(`Content task failed: ${err.message}`, err.stack);
      logger.error("ContentAgent execution failed", {
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
