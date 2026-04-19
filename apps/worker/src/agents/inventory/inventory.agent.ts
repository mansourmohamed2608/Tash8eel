import { Injectable, Logger, Inject, Optional } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database.module";
import { LLM_CLIENT, ILlmClient } from "../../infrastructure/llm-client.module";
import { createLogger } from "@tash8eel/shared";
import {
  AgentTask,
  AgentResult,
  AgentType,
  IAgent,
  INVENTORY_AGENT_TASK_TYPES,
} from "@tash8eel/agent-sdk";
import { InventoryHandlers } from "./inventory.handlers";
import {
  StockCheckInput,
  StockUpdateInput,
  ReserveStockInput,
  ConfirmReservationInput,
  ReleaseReservationInput,
  DeductStockInput,
  InventoryReportInput,
  SubstitutionSuggestionInput,
  RestockRecommendationInput,
  SupplierOrderDraftInput,
} from "./inventory.tasks";

const logger = createLogger("InventoryAgent");

@Injectable()
export class InventoryAgent implements IAgent {
  readonly agentType: AgentType = "INVENTORY_AGENT";
  readonly supportedTaskTypes = Object.values(INVENTORY_AGENT_TASK_TYPES);
  private readonly nestLogger = new Logger(InventoryAgent.name);
  private readonly handlers: InventoryHandlers;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Optional() @Inject(LLM_CLIENT) private readonly llmClient?: ILlmClient,
  ) {
    // LLM client is optional - premium AI features work without it (deterministic only)
    // When available, provides AI-enhanced rankings, explanations, and Arabic messages
    this.handlers = new InventoryHandlers(pool, llmClient);
  }

  canHandle(taskType: string): boolean {
    return this.supportedTaskTypes.includes(taskType as any);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.nestLogger.log(`Executing inventory task: ${task.taskType}`);
    logger.info("InventoryAgent executing", {
      taskType: task.taskType,
      taskId: task.id,
    });

    try {
      let output: Record<string, unknown>;
      const input = task.input as unknown; // Type-safe cast via unknown

      switch (task.taskType) {
        case INVENTORY_AGENT_TASK_TYPES.CHECK_STOCK:
          output = await this.handlers.checkStock(input as StockCheckInput);
          break;

        case INVENTORY_AGENT_TASK_TYPES.UPDATE_STOCK:
          output = await this.handlers.updateStock(input as StockUpdateInput);
          break;

        case INVENTORY_AGENT_TASK_TYPES.RESERVE_STOCK:
          output = await this.handlers.reserveStock(input as ReserveStockInput);
          break;

        case INVENTORY_AGENT_TASK_TYPES.CONFIRM_RESERVATION:
          output = await this.handlers.confirmReservation(
            input as ConfirmReservationInput,
          );
          break;

        case INVENTORY_AGENT_TASK_TYPES.RELEASE_RESERVATION:
          output = await this.handlers.releaseReservation(
            input as ReleaseReservationInput,
          );
          break;

        case INVENTORY_AGENT_TASK_TYPES.DEDUCT_STOCK:
          output = await this.handlers.deductStock(input as DeductStockInput);
          break;

        case INVENTORY_AGENT_TASK_TYPES.LOW_STOCK_ALERT:
          output = await this.handlers.processLowStockAlerts(task.merchantId!);
          break;

        case INVENTORY_AGENT_TASK_TYPES.GENERATE_REPORT:
          output = await this.handlers.generateReport(
            input as InventoryReportInput,
          );
          break;

        case INVENTORY_AGENT_TASK_TYPES.CLEANUP_EXPIRED_RESERVATIONS:
          output = await this.handlers.cleanupExpiredReservations();
          break;

        // PREMIUM AI FEATURES (deterministic + AI-enhanced when LLM available)
        case INVENTORY_AGENT_TASK_TYPES.SUBSTITUTION_SUGGESTIONS:
          output = await this.handlers.getSubstitutionSuggestions(
            input as SubstitutionSuggestionInput,
          );
          break;

        case INVENTORY_AGENT_TASK_TYPES.RESTOCK_RECOMMENDATIONS:
          output = await this.handlers.getRestockRecommendations(
            input as RestockRecommendationInput,
          );
          break;

        case INVENTORY_AGENT_TASK_TYPES.SUPPLIER_ORDER_DRAFT:
          output = await this.handlers.generateSupplierOrderDraft(
            input as SupplierOrderDraftInput,
          );
          break;

        // PERISHABLE / LOT / FIFO / SKU MERGE
        case INVENTORY_AGENT_TASK_TYPES.CHECK_EXPIRY_ALERTS:
          output = await this.handlers.checkExpiryAlerts(
            (input as any).merchantId,
          );
          break;
        case INVENTORY_AGENT_TASK_TYPES.EXPIRY_REPORT:
          output = await this.handlers.getExpiryReport(
            (input as any).merchantId,
          );
          break;
        case INVENTORY_AGENT_TASK_TYPES.RECEIVE_LOT:
          output = await this.handlers.receiveLot(input as any);
          break;
        case INVENTORY_AGENT_TASK_TYPES.LOT_REPORT:
          output = await this.handlers.getLotReport(
            (input as any).merchantId,
            (input as any).itemId,
          );
          break;
        case INVENTORY_AGENT_TASK_TYPES.FIFO_COGS:
          output = (await this.handlers.calculateFifoCogs(
            (input as any).merchantId,
            (input as any).itemId,
            (input as any).quantitySold,
          )) as any;
          break;
        case INVENTORY_AGENT_TASK_TYPES.INVENTORY_VALUATION_FIFO:
          output = await this.handlers.getInventoryValuationFifo(
            (input as any).merchantId,
          );
          break;
        case INVENTORY_AGENT_TASK_TYPES.DETECT_DUPLICATE_SKUS:
          output = await this.handlers.detectDuplicateSkus(
            (input as any).merchantId,
          );
          break;
        case INVENTORY_AGENT_TASK_TYPES.MERGE_SKUS:
          output = await this.handlers.mergeSkus(input as any);
          break;

        default:
          output = {
            action: "NO_ACTION",
            message: `Unknown task type: ${task.taskType}`,
          };
      }

      const hasActionFailure =
        String((output as any)?.action || "").toUpperCase() === "FAILED";
      const hasExplicitError =
        typeof (output as any)?.error === "string" &&
        (output as any).error.trim().length > 0;
      const success = !hasActionFailure && !hasExplicitError;

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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("InventoryAgent error", {
        taskId: task.id,
        error: errorMessage,
      });

      return {
        id: `result-${task.id}`,
        taskId: task.id,
        agentType: this.agentType,
        success: false,
        error: errorMessage,
        tokensUsed: 0,
        executionTimeMs: Date.now() - startTime,
        createdAt: new Date(),
      };
    }
  }
}
