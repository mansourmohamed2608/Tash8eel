import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database.module";
import { createLogger } from "@tash8eel/shared";
import {
  AgentTask,
  AgentResult,
  AgentType,
  IAgent,
  OPS_AGENT_TASK_TYPES,
} from "@tash8eel/agent-sdk";
import { OpsHandlers } from "./ops.handlers";

const logger = createLogger("OpsAgent");

@Injectable()
export class OpsAgent implements IAgent {
  readonly agentType: AgentType = "OPS_AGENT";
  readonly supportedTaskTypes = Object.values(OPS_AGENT_TASK_TYPES);
  private readonly nestLogger = new Logger(OpsAgent.name);
  private readonly handlers: OpsHandlers;

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {
    this.handlers = new OpsHandlers(pool);
  }

  canHandle(taskType: string): boolean {
    return this.supportedTaskTypes.includes(taskType as any);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.nestLogger.log(`Executing task: ${task.taskType}`);

    try {
      let output: Record<string, unknown> = {};

      switch (task.taskType) {
        case OPS_AGENT_TASK_TYPES.PROCESS_MESSAGE:
          output = await this.handlers.processMessage(task);
          break;
        case OPS_AGENT_TASK_TYPES.CREATE_ORDER:
          output = await this.handlers.createOrder(task);
          break;
        case OPS_AGENT_TASK_TYPES.BOOK_DELIVERY:
          output = await this.handlers.bookDelivery(task);
          break;
        case OPS_AGENT_TASK_TYPES.SEND_FOLLOWUP:
          output = await this.handlers.sendFollowup(task);
          break;
        case OPS_AGENT_TASK_TYPES.HANDLE_ESCALATION:
          output = await this.handlers.handleEscalation(task);
          break;
        case OPS_AGENT_TASK_TYPES.UPSELL_SUGGESTIONS:
          output = await this.handlers.getUpsellSuggestions(task);
          break;
        case OPS_AGENT_TASK_TYPES.RECORD_UPSELL_CONVERSION:
          output = await this.handlers.recordUpsellConversion(task);
          break;
        case OPS_AGENT_TASK_TYPES.CALCULATE_DELIVERY_ETA:
          output = await this.handlers.calculateDeliveryEta(task);
          break;
        case OPS_AGENT_TASK_TYPES.HANDLE_COMPLAINT:
          output = await this.handlers.handleComplaint(task);
          break;
        case OPS_AGENT_TASK_TYPES.ADVANCE_COMPLAINT:
          output = await this.handlers.advanceComplaintStep(task);
          break;
        case OPS_AGENT_TASK_TYPES.SAVE_CUSTOMER_MEMORY:
          output = await this.handlers.saveCustomerMemory(task.input as any);
          break;
        case OPS_AGENT_TASK_TYPES.GET_CUSTOMER_MEMORY:
          output = await this.handlers.getCustomerMemory(task.input as any);
          break;
        case OPS_AGENT_TASK_TYPES.LOG_AI_DECISION:
          output = await this.handlers.logAiDecision(task.input as any);
          break;
        case OPS_AGENT_TASK_TYPES.GET_AI_DECISION_LOG:
          output = await this.handlers.getAiDecisionLog(task.input as any);
          break;
        case OPS_AGENT_TASK_TYPES.CUSTOMER_INSIGHTS:
          output = await this.handlers.getCustomerInsights(task.input as any);
          break;
        case OPS_AGENT_TASK_TYPES.SEGMENT_CUSTOMERS:
          output = await this.handlers.segmentCustomers(task.input as any);
          break;
        case OPS_AGENT_TASK_TYPES.DAILY_REPORT:
          output = await this.handlers.generateDailyReport(task.input as any);
          break;
        case OPS_AGENT_TASK_TYPES.CUSTOMER_RISK_SCORE:
          output = await this.handlers.getCustomerRiskScore(task.input as any);
          break;
        case OPS_AGENT_TASK_TYPES.REORDER_ITEMS:
          output = await this.handlers.getReorderItems(task.input as any);
          break;
        default:
          throw new Error(`Unknown task type: ${task.taskType}`);
      }

      return {
        id: `result-${task.id}`,
        taskId: task.id,
        agentType: this.agentType,
        success: true,
        output,
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        createdAt: new Date(),
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`OpsAgent task failed: ${task.taskType}`, err);

      return {
        id: `result-${task.id}`,
        taskId: task.id,
        agentType: this.agentType,
        success: false,
        error: err.message,
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        createdAt: new Date(),
      };
    }
  }
}
