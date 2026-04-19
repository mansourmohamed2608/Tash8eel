import { Injectable, Logger, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { createLogger } from "@tash8eel/shared";
import {
  AgentTask,
  AgentResult,
  AgentType,
  IAgent,
  FINANCE_AGENT_TASK_TYPES,
} from "@tash8eel/agent-sdk";
import { FinanceHandlers } from "./finance.handlers";

const logger = createLogger("FinanceAgent");

@Injectable()
export class FinanceAgent implements IAgent {
  readonly agentType: AgentType = "FINANCE_AGENT";
  readonly supportedTaskTypes = Object.values(FINANCE_AGENT_TASK_TYPES);
  private readonly nestLogger = new Logger(FinanceAgent.name);
  private readonly handlers: FinanceHandlers;

  constructor(@Inject("DATABASE_POOL") private readonly pool: Pool) {
    this.handlers = new FinanceHandlers(pool);
  }

  canHandle(taskType: string): boolean {
    return this.supportedTaskTypes.includes(taskType as any);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.nestLogger.log(`Executing finance task: ${task.taskType}`);
    logger.info("FinanceAgent executing", {
      taskType: task.taskType,
      taskId: task.id,
    });

    let output: Record<string, unknown>;

    try {
      switch (task.taskType) {
        case FINANCE_AGENT_TASK_TYPES.PAYMENT_PROOF_REVIEW:
          output = (await this.handlers.reviewPaymentProof(
            task,
          )) as unknown as Record<string, unknown>;
          break;

        case FINANCE_AGENT_TASK_TYPES.WEEKLY_CFO_BRIEF:
          output = (await this.handlers.generateWeeklyCFOBrief(
            task,
          )) as unknown as Record<string, unknown>;
          break;

        case FINANCE_AGENT_TASK_TYPES.DAILY_REVENUE_SUMMARY:
          // Reuse weekly brief with modified date range - MVP approach
          output = (await this.handlers.generateWeeklyCFOBrief(
            task,
          )) as unknown as Record<string, unknown>;
          break;

        case FINANCE_AGENT_TASK_TYPES.PROCESS_PAYMENT:
          output = await this.handlers.processPayment(task.input);
          break;

        case FINANCE_AGENT_TASK_TYPES.GENERATE_INVOICE:
          output = await this.handlers.generateInvoice(task.input);
          break;

        case FINANCE_AGENT_TASK_TYPES.CALCULATE_FEES:
          output = await this.handlers.calculateFees(task.input);
          break;

        // TAX / CASH FLOW / DISCOUNT / REVENUE / REFUNDS
        case FINANCE_AGENT_TASK_TYPES.TAX_REPORT:
          output = await this.handlers.generateTaxReport(task.input as any);
          break;
        case FINANCE_AGENT_TASK_TYPES.CASH_FLOW_FORECAST:
          output = await this.handlers.forecastCashFlow(task.input as any);
          break;
        case FINANCE_AGENT_TASK_TYPES.DISCOUNT_IMPACT:
          output = await this.handlers.analyzeDiscountImpact(task.input as any);
          break;
        case FINANCE_AGENT_TASK_TYPES.REVENUE_BY_CHANNEL:
          output = await this.handlers.getRevenueByChannel(task.input as any);
          break;
        case FINANCE_AGENT_TASK_TYPES.REFUND_ANALYSIS:
          output = await this.handlers.getRefundAnalysis(task.input as any);
          break;
        case FINANCE_AGENT_TASK_TYPES.RECONCILE_TRANSACTIONS:
          output = await this.handlers.reconcileTransactions(task.input as any);
          break;
        case FINANCE_AGENT_TASK_TYPES.IMPORT_COD_STATEMENT:
          output = await this.handlers.importCodStatement(task.input as any);
          break;
        case FINANCE_AGENT_TASK_TYPES.RECORD_EXPENSE:
          output = await this.handlers.recordExpense(task.input as any);
          break;
        case FINANCE_AGENT_TASK_TYPES.EXPENSE_SUMMARY:
          output = await this.handlers.getExpenseSummary(task.input as any);
          break;
        case FINANCE_AGENT_TASK_TYPES.MONTHLY_CLOSE:
          output = await this.handlers.generateMonthlyClose(task.input as any);
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
      this.nestLogger.error(`Finance task failed: ${err.message}`, err.stack);
      logger.error("FinanceAgent error", {
        taskId: task.id,
        error: err.message,
      });

      return {
        id: `result-${task.id}`,
        taskId: task.id,
        agentType: this.agentType,
        success: false,
        output: { action: "FAILED", message: err.message, error: err.stack },
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        createdAt: new Date(),
      };
    }
  }
}
