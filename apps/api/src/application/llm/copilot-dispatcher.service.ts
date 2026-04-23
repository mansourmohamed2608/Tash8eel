/**
 * Copilot Action Dispatcher
 *
 * Maps copilot intents to deterministic service calls.
 * All business logic is deterministic - no AI in execution.
 */

import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { AuditService } from "../services/audit.service";
import { createLogger } from "../../shared/logging/logger";
import { CopilotCommand, CopilotIntent, PendingAction } from "./copilot-schema";

const logger = createLogger("CopilotDispatcher");

export interface DispatchResult {
  success: boolean;
  message?: string; // Defaults to replyAr
  intent: CopilotIntent;
  action: string;
  data?: Record<string, unknown>;
  error?: string;
  replyAr: string;
}

// Helper to ensure message is set
function withMessage(
  result: Omit<DispatchResult, "message"> & { message?: string },
): DispatchResult {
  return {
    ...result,
    message: result.message || result.replyAr,
  };
}

@Injectable()
export class CopilotDispatcherService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Execute a confirmed action
   */
  async execute(
    merchantId: string,
    pendingAction: PendingAction,
  ): Promise<DispatchResult> {
    const { intent, command } = pendingAction;
    const executionCacheKey = this.getExecutionCacheKey(
      merchantId,
      pendingAction.id,
    );

    logger.info("Executing copilot action", { merchantId, intent });

    const inlineStoredResult = this.coerceDispatchResult(
      pendingAction.executionResult,
      intent,
    );
    if (inlineStoredResult) {
      return withMessage(inlineStoredResult);
    }

    const cachedState = await this.readExecutionCacheState(
      executionCacheKey,
      intent,
    );
    if (cachedState.kind === "cached") {
      return withMessage(cachedState.result);
    }
    if (cachedState.kind === "in_progress") {
      return withMessage({
        success: false,
        intent,
        action: "IN_PROGRESS",
        replyAr: "يتم تنفيذ هذا الإجراء حالياً. انتظر لحظات ثم أعد المحاولة.",
      });
    }

    const lockAcquired = await this.acquireExecutionLease(executionCacheKey);
    if (!lockAcquired) {
      const retryState = await this.readExecutionCacheState(
        executionCacheKey,
        intent,
      );
      if (retryState.kind === "cached") {
        return withMessage(retryState.result);
      }
      return withMessage({
        success: false,
        intent,
        action: "IN_PROGRESS",
        replyAr: "يتم تنفيذ هذا الإجراء حالياً. انتظر لحظات ثم أعد المحاولة.",
      });
    }

    await this.updateApprovalExecutionState(pendingAction.id, "executing");

    let result: DispatchResult;

    try {
      switch (intent) {
        // === Finance Actions ===
        case "ADD_EXPENSE":
          result = await this.executeAddExpense(merchantId, command);
          break;
        case "ASK_EXPENSE_SUMMARY":
          result = await this.executeAskExpenseSummary(merchantId, command);
          break;
        case "CREATE_PAYMENT_LINK":
          result = {
            success: false,
            intent: "CREATE_PAYMENT_LINK",
            action: "UNSUPPORTED",
            replyAr:
              "ميزة روابط الدفع اتشالت. استخدم صفحة مراجعة إثباتات الدفع داخل النظام.",
          };
          break;
        case "ASK_COD_STATUS":
          result = await this.executeAskCodStatus(merchantId, command);
          break;

        // === Inventory Actions ===
        case "UPDATE_STOCK":
          result = await this.executeUpdateStock(merchantId, command);
          break;
        case "ASK_LOW_STOCK":
          result = await this.executeAskLowStock(merchantId, command);
          break;
        case "ASK_TOP_MOVERS":
          result = await this.executeAskTopMovers(merchantId, command);
          break;
        case "ASK_SHRINKAGE":
          result = await this.executeAskShrinkage(merchantId, command);
          break;

        // === Ops Actions ===
        case "TAG_VIP":
          result = await this.executeTagVip(merchantId, command);
          break;
        case "REMOVE_VIP":
          result = await this.executeRemoveVip(merchantId, command);
          break;
        case "ASK_HIGH_RISK":
          result = await this.executeAskHighRisk(merchantId, command);
          break;
        case "ASK_RECOVERED_CARTS":
          result = await this.executeAskRecoveredCarts(merchantId, command);
          break;
        case "REORDER_LAST":
          result = await this.executeReorderLast(merchantId, command);
          break;

        // === Finance Extra ===
        case "CLOSE_MONTH":
          result = await this.executeCloseMonth(merchantId, command);
          break;

        // === Analytics Actions ===
        case "ASK_KPI":
          result = await this.executeAskKpi(merchantId, command);
          break;
        case "ASK_REVENUE":
          result = await this.executeAskRevenue(merchantId, command);
          break;
        case "ASK_ORDER_COUNT":
          result = await this.executeAskOrderCount(merchantId, command);
          break;

        default:
          result = {
            success: false,
            intent,
            action: "UNKNOWN",
            error: "Intent not implemented",
            replyAr: "هذا الأمر غير مدعوم حالياً",
          };
      }

      // Audit log
      await this.auditService.log({
        merchantId,
        action: "API_CALL",
        resource: "MERCHANT",
        resourceId: merchantId,
        newValues: { intent, success: result.success },
        metadata: { source: "copilot", pendingActionId: pendingAction.id },
      });
    } catch (error) {
      logger.error("Copilot action execution failed", error as Error);
      result = {
        success: false,
        intent,
        action: "ERROR",
        error: (error as Error).message,
        replyAr: "حدث خطأ أثناء تنفيذ الأمر",
      };
    }

    await this.persistExecutionResult(pendingAction.id, result);
    await this.saveExecutionCache(executionCacheKey, result);
    await this.updateApprovalExecutionState(
      pendingAction.id,
      result.success ? "executed_success" : "executed_failed",
      result,
    );

    return withMessage(result);
  }

  /**
   * Execute read-only queries (no confirmation needed)
   */
  async executeQuery(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    const intent = command.intent;

    switch (intent) {
      case "ASK_EXPENSE_SUMMARY":
        return withMessage(
          await this.executeAskExpenseSummary(merchantId, command),
        );
      case "ASK_LOW_STOCK":
        return withMessage(await this.executeAskLowStock(merchantId, command));
      case "ASK_TOP_MOVERS":
        return withMessage(await this.executeAskTopMovers(merchantId, command));
      case "ASK_SHRINKAGE":
        return withMessage(await this.executeAskShrinkage(merchantId, command));
      case "ASK_HIGH_RISK":
        return withMessage(await this.executeAskHighRisk(merchantId, command));
      case "ASK_RECOVERED_CARTS":
        return withMessage(
          await this.executeAskRecoveredCarts(merchantId, command),
        );
      case "ASK_COD_STATUS":
        return withMessage(await this.executeAskCodStatus(merchantId, command));
      case "ASK_KPI":
        return withMessage(await this.executeAskKpi(merchantId, command));
      case "ASK_REVENUE":
        return withMessage(await this.executeAskRevenue(merchantId, command));
      case "ASK_ORDER_COUNT":
        return withMessage(
          await this.executeAskOrderCount(merchantId, command),
        );
      default:
        return withMessage({
          success: false,
          intent,
          action: "UNKNOWN",
          replyAr: "هذا الاستعلام غير مدعوم",
        });
    }
  }

  private getExecutionCacheKey(merchantId: string, actionId: string): string {
    return `copilot:action:${merchantId}:${actionId}`;
  }

  private async readExecutionCacheState(
    key: string,
    fallbackIntent: CopilotIntent,
  ): Promise<
    | { kind: "none" }
    | { kind: "in_progress" }
    | { kind: "cached"; result: DispatchResult }
  > {
    try {
      const result = await this.pool.query<{ response_body: any }>(
        `SELECT response_body
         FROM idempotency_records
         WHERE key = $1
           AND expires_at > NOW()
         LIMIT 1`,
        [key],
      );

      const body = result.rows[0]?.response_body;
      if (!body) {
        return { kind: "none" };
      }
      if (body.__inProgress === true) {
        return { kind: "in_progress" };
      }

      const cached = this.coerceDispatchResult(body, fallbackIntent);
      if (cached) {
        return { kind: "cached", result: cached };
      }
      return { kind: "none" };
    } catch {
      return { kind: "none" };
    }
  }

  private async acquireExecutionLease(key: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `INSERT INTO idempotency_records (key, merchant_id, response_body)
         VALUES ($1, NULL, '{"__inProgress": true}'::jsonb)
         ON CONFLICT (key) DO NOTHING
         RETURNING key`,
        [key],
      );
      return result.rows.length > 0;
    } catch {
      return true;
    }
  }

  private async saveExecutionCache(
    key: string,
    result: DispatchResult,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO idempotency_records (key, merchant_id, response_body)
         VALUES ($1, NULL, $2::jsonb)
         ON CONFLICT (key) DO UPDATE
         SET response_body = EXCLUDED.response_body`,
        [key, JSON.stringify(result)],
      );
    } catch {
      // non-fatal cache write failure
    }
  }

  private async persistExecutionResult(
    actionId: string,
    result: DispatchResult,
  ): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE copilot_pending_actions
         SET execution_result = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(result), actionId],
      );
    } catch (error) {
      logger.warn("Failed to persist pending action execution result", {
        actionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async updateApprovalExecutionState(
    actionId: string,
    status: "executing" | "executed_success" | "executed_failed",
    result?: DispatchResult,
  ): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE copilot_action_approvals
         SET status = $2,
             executing_at = CASE
               WHEN $2 = 'executing' THEN COALESCE(executing_at, NOW())
               ELSE executing_at
             END,
             executed_at = CASE
               WHEN $2 IN ('executed_success', 'executed_failed') THEN COALESCE(executed_at, NOW())
               ELSE executed_at
             END,
             execution_result = COALESCE($3::jsonb, execution_result),
             updated_at = NOW()
         WHERE action_id = $1`,
        [actionId, status, result ? JSON.stringify(result) : null],
      );
    } catch {
      // non-fatal when migration is not applied yet
    }
  }

  private coerceDispatchResult(
    raw: unknown,
    fallbackIntent: CopilotIntent,
  ): DispatchResult | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const payload = raw as Record<string, unknown>;
    const intent = (payload.intent as CopilotIntent) || fallbackIntent;
    const action = String(payload.action || "UNKNOWN");
    const replyAr = String(
      payload.replyAr || payload.message || "تم تنفيذ الإجراء مسبقاً",
    );

    return {
      success: Boolean(payload.success),
      intent,
      action,
      replyAr,
      message:
        typeof payload.message === "string" ? payload.message : undefined,
      data:
        payload.data && typeof payload.data === "object"
          ? (payload.data as Record<string, unknown>)
          : undefined,
      error: typeof payload.error === "string" ? payload.error : undefined,
    };
  }

  // ============= Finance Actions =============

  private async executeAddExpense(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    const { expense } = command.entities;

    if (!expense?.amount) {
      return {
        success: false,
        intent: "ADD_EXPENSE",
        action: "ADD_EXPENSE",
        error: "Amount is required",
        replyAr: "المبلغ مطلوب",
      };
    }

    const result = await this.pool.query(
      `INSERT INTO expenses 
       (merchant_id, amount, category, subcategory, description, expense_date, created_by)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), 'copilot')
       RETURNING id, amount, category`,
      [
        merchantId,
        expense.amount,
        expense.category || "أخرى",
        null,
        expense.description,
        expense.date,
      ],
    );

    const created = result.rows[0];
    return {
      success: true,
      intent: "ADD_EXPENSE",
      action: "EXPENSE_CREATED",
      data: {
        expenseId: created.id,
        amount: created.amount,
        category: created.category,
      },
      replyAr: `✅ تم إضافة مصروف ${created.amount} جنيه (${created.category})`,
    };
  }

  private async executeAskExpenseSummary(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    const { dateRange } = command.entities;
    const { startDate, endDate } = this.resolveDateRange(
      dateRange?.period || "this_month",
    );

    const result = await this.pool.query(
      `SELECT 
         COALESCE(category, 'أخرى') as category,
         COUNT(*) as count,
         SUM(amount) as total
       FROM expenses
       WHERE merchant_id = $1 
         AND expense_date >= $2 
         AND expense_date <= $3
       GROUP BY category
       ORDER BY total DESC`,
      [merchantId, startDate, endDate],
    );

    const total = result.rows.reduce(
      (sum, r) => sum + parseFloat(r.total || 0),
      0,
    );
    const breakdown = result.rows.map(
      (r) => `- ${r.category}: ${parseFloat(r.total).toLocaleString()} جنيه`,
    );

    return {
      success: true,
      intent: "ASK_EXPENSE_SUMMARY",
      action: "EXPENSE_SUMMARY",
      data: {
        total,
        categories: result.rows,
        period: { startDate, endDate },
      },
      replyAr: `📊 ملخص المصاريف:\n\nالإجمالي: ${total.toLocaleString()} جنيه\n\n${breakdown.join("\n")}`,
    };
  }

  private async executeCreatePaymentLink(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    return {
      success: false,
      intent: "CREATE_PAYMENT_LINK",
      action: "UNSUPPORTED",
      replyAr:
        "ميزة روابط الدفع اتشالت. استخدم صفحة مراجعة إثباتات الدفع داخل النظام.",
    };
  }

  private async executeAskCodStatus(
    merchantId: string,
    _command: CopilotCommand,
  ): Promise<DispatchResult> {
    const result = await this.pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE payment_method = 'COD' AND payment_status = 'PENDING') as pending_count,
         COALESCE(SUM(total) FILTER (WHERE payment_method = 'COD' AND payment_status = 'PENDING'), 0) as pending_amount,
         COUNT(*) FILTER (WHERE payment_method = 'COD' AND payment_status = 'PAID') as collected_count,
         COALESCE(SUM(total) FILTER (WHERE payment_method = 'COD' AND payment_status = 'PAID'), 0) as collected_amount
       FROM orders
       WHERE merchant_id = $1 
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [merchantId],
    );

    const data = result.rows[0];
    return {
      success: true,
      intent: "ASK_COD_STATUS",
      action: "COD_STATUS",
      data: {
        pendingCount: parseInt(data.pending_count),
        pendingAmount: parseFloat(data.pending_amount),
        collectedCount: parseInt(data.collected_count),
        collectedAmount: parseFloat(data.collected_amount),
      },
      replyAr: `💵 حالة الكاش (آخر 30 يوم):\n\n⏳ قيد التحصيل: ${data.pending_count} طلب (${parseFloat(data.pending_amount).toLocaleString()} جنيه)\n✅ تم تحصيله: ${data.collected_count} طلب (${parseFloat(data.collected_amount).toLocaleString()} جنيه)`,
    };
  }

  // ============= Inventory Actions =============

  private async executeUpdateStock(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    const { stockUpdate } = command.entities;

    if (!stockUpdate?.productName && !stockUpdate?.sku) {
      return {
        success: false,
        intent: "UPDATE_STOCK",
        action: "UPDATE_STOCK",
        error: "Product name or SKU required",
        replyAr: "اسم المنتج أو الكود مطلوب",
      };
    }

    // Find product
    const productResult = await this.pool.query(
      `SELECT v.id, v.sku, v.name, v.quantity_on_hand, i.name as item_name
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       WHERE v.merchant_id = $1 
         AND (LOWER(v.name) LIKE $2 OR LOWER(i.name) LIKE $2 OR v.sku = $3)
       LIMIT 1`,
      [
        merchantId,
        `%${stockUpdate.productName?.toLowerCase() || ""}%`,
        stockUpdate.sku || "",
      ],
    );

    if (productResult.rows.length === 0) {
      return {
        success: false,
        intent: "UPDATE_STOCK",
        action: "UPDATE_STOCK",
        error: "Product not found",
        replyAr: `لم يتم العثور على المنتج "${stockUpdate.productName || stockUpdate.sku}"`,
      };
    }

    const variant = productResult.rows[0];
    const quantityBefore = parseInt(variant.quantity_on_hand);
    let quantityAfter: number;

    if (
      stockUpdate.absoluteQuantity !== null &&
      stockUpdate.absoluteQuantity !== undefined
    ) {
      quantityAfter = stockUpdate.absoluteQuantity;
    } else if (
      stockUpdate.quantityChange !== null &&
      stockUpdate.quantityChange !== undefined
    ) {
      quantityAfter = quantityBefore + stockUpdate.quantityChange;
    } else {
      return {
        success: false,
        intent: "UPDATE_STOCK",
        action: "UPDATE_STOCK",
        error: "Quantity change required",
        replyAr: "كمية التعديل مطلوبة",
      };
    }

    // Update stock
    await this.pool.query(
      `UPDATE inventory_variants SET quantity_on_hand = $1, updated_at = NOW() WHERE id = $2`,
      [quantityAfter, variant.id],
    );

    // Record movement
    const movementType =
      quantityAfter > quantityBefore ? "adjustment_in" : "adjustment_out";
    await this.pool.query(
      `INSERT INTO stock_movements 
       (merchant_id, variant_id, movement_type, quantity, quantity_before, quantity_after, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'Copilot update', 'copilot')`,
      [
        merchantId,
        variant.id,
        movementType,
        Math.abs(quantityAfter - quantityBefore),
        quantityBefore,
        quantityAfter,
      ],
    );

    return {
      success: true,
      intent: "UPDATE_STOCK",
      action: "STOCK_UPDATED",
      data: {
        variantId: variant.id,
        productName: variant.name || variant.item_name,
        quantityBefore,
        quantityAfter,
        change: quantityAfter - quantityBefore,
      },
      replyAr: `✅ تم تحديث مخزون "${variant.name || variant.item_name}":\n📦 قبل: ${quantityBefore}\n📦 بعد: ${quantityAfter}`,
    };
  }

  private async executeAskLowStock(
    merchantId: string,
    _command: CopilotCommand,
  ): Promise<DispatchResult> {
    const result = await this.pool.query(
      `SELECT v.sku, COALESCE(v.name, i.name) as name, v.quantity_on_hand, v.low_stock_threshold
       FROM inventory_variants v
       JOIN inventory_items i ON v.inventory_item_id = i.id
       WHERE v.merchant_id = $1 
         AND v.quantity_on_hand <= COALESCE(v.low_stock_threshold, 5)
         AND v.is_active = true
       ORDER BY v.quantity_on_hand ASC
       LIMIT 10`,
      [merchantId],
    );

    if (result.rows.length === 0) {
      return {
        success: true,
        intent: "ASK_LOW_STOCK",
        action: "LOW_STOCK_LIST",
        data: { items: [] },
        replyAr: "✅ كل المنتجات متوفرة في المخزون",
      };
    }

    const items = result.rows.map(
      (r) => `- ${r.name}: ${r.quantity_on_hand} قطعة`,
    );
    return {
      success: true,
      intent: "ASK_LOW_STOCK",
      action: "LOW_STOCK_LIST",
      data: { items: result.rows },
      replyAr: `⚠️ منتجات ناقصة (${result.rows.length}):\n\n${items.join("\n")}`,
    };
  }

  private async executeAskTopMovers(
    merchantId: string,
    _command: CopilotCommand,
  ): Promise<DispatchResult> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const result = await this.pool.query(
      `SELECT 
         v.sku, COALESCE(v.name, i.name) as name,
         SUM(ABS(sm.quantity)) as qty_sold
       FROM stock_movements sm
       JOIN inventory_variants v ON sm.variant_id = v.id
       JOIN inventory_items i ON v.inventory_item_id = i.id
       WHERE sm.merchant_id = $1 
         AND sm.movement_type = 'sale'
         AND sm.created_at >= $2
       GROUP BY v.id, v.sku, v.name, i.name
       ORDER BY qty_sold DESC
       LIMIT 5`,
      [merchantId, weekAgo],
    );

    if (result.rows.length === 0) {
      return {
        success: true,
        intent: "ASK_TOP_MOVERS",
        action: "TOP_MOVERS",
        data: { items: [] },
        replyAr: "لا توجد مبيعات مسجلة هذا الأسبوع",
      };
    }

    const items = result.rows.map(
      (r, i) => `${i + 1}. ${r.name}: ${r.qty_sold} قطعة`,
    );
    return {
      success: true,
      intent: "ASK_TOP_MOVERS",
      action: "TOP_MOVERS",
      data: { items: result.rows },
      replyAr: `🔥 الأكثر مبيعاً هذا الأسبوع:\n\n${items.join("\n")}`,
    };
  }

  private async executeAskShrinkage(
    merchantId: string,
    _command: CopilotCommand,
  ): Promise<DispatchResult> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Query shrinkage data from stock_movements
    const result = await this.pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE movement_type IN ('shrinkage', 'adjustment_out', 'damage')) as shrinkage_count,
         COALESCE(SUM(ABS(quantity)) FILTER (WHERE movement_type IN ('shrinkage', 'adjustment_out', 'damage')), 0) as shrinkage_qty,
         COALESCE(SUM(ABS(quantity) * COALESCE(v.unit_cost, 0)) FILTER (WHERE movement_type IN ('shrinkage', 'adjustment_out', 'damage')), 0) as shrinkage_value
       FROM stock_movements sm
       JOIN inventory_variants v ON sm.variant_id = v.id
       WHERE sm.merchant_id = $1 
         AND sm.created_at >= $2`,
      [merchantId, thirtyDaysAgo],
    );

    // Get top shrinkage items
    const topItems = await this.pool.query(
      `SELECT 
         COALESCE(v.name, i.name) as name,
         SUM(ABS(sm.quantity)) as qty
       FROM stock_movements sm
       JOIN inventory_variants v ON sm.variant_id = v.id
       JOIN inventory_items i ON v.inventory_item_id = i.id
       WHERE sm.merchant_id = $1 
         AND sm.movement_type IN ('shrinkage', 'adjustment_out', 'damage')
         AND sm.created_at >= $2
       GROUP BY v.id, v.name, i.name
       ORDER BY qty DESC
       LIMIT 5`,
      [merchantId, thirtyDaysAgo],
    );

    const data = result.rows[0];
    const shrinkageCount = parseInt(data.shrinkage_count) || 0;
    const shrinkageQty = parseInt(data.shrinkage_qty) || 0;
    const shrinkageValue = parseFloat(data.shrinkage_value) || 0;

    if (shrinkageCount === 0) {
      return {
        success: true,
        intent: "ASK_SHRINKAGE",
        action: "SHRINKAGE_REPORT",
        data: {
          shrinkageCount: 0,
          shrinkageQty: 0,
          shrinkageValue: 0,
          items: [],
        },
        replyAr: "✅ لا يوجد عجز مسجل خلال آخر 30 يوم",
      };
    }

    const itemsList = topItems.rows.map(
      (r, i) => `${i + 1}. ${r.name}: ${r.qty} قطعة`,
    );
    return {
      success: true,
      intent: "ASK_SHRINKAGE",
      action: "SHRINKAGE_REPORT",
      data: {
        shrinkageCount,
        shrinkageQty,
        shrinkageValue,
        items: topItems.rows,
      },
      replyAr: `📉 تقرير العجز (آخر 30 يوم):\n\n⚠️ إجمالي العجز: ${shrinkageQty} قطعة\n💰 القيمة: ${shrinkageValue.toLocaleString()} جنيه\n\nأعلى المنتجات عجزاً:\n${itemsList.join("\n")}`,
    };
  }

  // ============= Ops Actions =============

  private async executeTagVip(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    const { vipTag } = command.entities;

    // Find customer
    let customerId = vipTag?.customerId;
    if (!customerId && (vipTag?.customerPhone || vipTag?.customerName)) {
      const customerResult = await this.pool.query(
        `SELECT id, name, phone FROM customers 
         WHERE merchant_id = $1 
           AND (phone = $2 OR LOWER(name) LIKE $3)
         LIMIT 1`,
        [
          merchantId,
          vipTag?.customerPhone || "",
          `%${(vipTag?.customerName || "").toLowerCase()}%`,
        ],
      );
      if (customerResult.rows.length > 0) {
        customerId = customerResult.rows[0].id;
      }
    }

    if (!customerId) {
      return {
        success: false,
        intent: "TAG_VIP",
        action: "TAG_VIP",
        error: "Customer not found",
        replyAr: "لم يتم العثور على العميل",
      };
    }

    // Add VIP tag
    await this.pool.query(
      `INSERT INTO customer_tags (merchant_id, customer_id, tag, added_by, metadata)
       VALUES ($1, $2, 'VIP', 'copilot', '{"source": "copilot"}')
       ON CONFLICT (merchant_id, customer_id, tag) DO NOTHING`,
      [merchantId, customerId],
    );

    return {
      success: true,
      intent: "TAG_VIP",
      action: "VIP_TAGGED",
      data: { customerId },
      replyAr: "✅ تم إضافة علامة VIP للعميل",
    };
  }

  private async executeRemoveVip(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    const { vipTag } = command.entities;

    // Find customer (same logic as TAG_VIP)
    let customerId = vipTag?.customerId;
    if (!customerId && (vipTag?.customerPhone || vipTag?.customerName)) {
      const customerResult = await this.pool.query(
        `SELECT id FROM customers 
         WHERE merchant_id = $1 
           AND (phone = $2 OR LOWER(name) LIKE $3)
         LIMIT 1`,
        [
          merchantId,
          vipTag?.customerPhone || "",
          `%${(vipTag?.customerName || "").toLowerCase()}%`,
        ],
      );
      if (customerResult.rows.length > 0) {
        customerId = customerResult.rows[0].id;
      }
    }

    if (!customerId) {
      return {
        success: false,
        intent: "REMOVE_VIP",
        action: "REMOVE_VIP",
        error: "Customer not found",
        replyAr: "لم يتم العثور على العميل",
      };
    }

    await this.pool.query(
      `DELETE FROM customer_tags WHERE merchant_id = $1 AND customer_id = $2 AND tag = 'VIP'`,
      [merchantId, customerId],
    );

    return {
      success: true,
      intent: "REMOVE_VIP",
      action: "VIP_REMOVED",
      data: { customerId },
      replyAr: "✅ تم إزالة علامة VIP من العميل",
    };
  }

  private async executeAskHighRisk(
    merchantId: string,
    _command: CopilotCommand,
  ): Promise<DispatchResult> {
    const result = await this.pool.query(
      `SELECT c.id, c.name, c.phone, crs.score, crs.factors
       FROM customer_risk_scores crs
       JOIN customers c ON crs.customer_id = c.id
       WHERE crs.merchant_id = $1 AND crs.score >= 60
       ORDER BY crs.score DESC
       LIMIT 10`,
      [merchantId],
    );

    if (result.rows.length === 0) {
      return {
        success: true,
        intent: "ASK_HIGH_RISK",
        action: "HIGH_RISK_LIST",
        data: { customers: [] },
        replyAr: "✅ لا يوجد عملاء عالية المخاطر",
      };
    }

    const items = result.rows.map((r) => `- ${r.name || r.phone}: ${r.score}%`);
    return {
      success: true,
      intent: "ASK_HIGH_RISK",
      action: "HIGH_RISK_LIST",
      data: { customers: result.rows },
      replyAr: `⚠️ عملاء عالية المخاطر (${result.rows.length}):\n\n${items.join("\n")}`,
    };
  }

  private async executeAskRecoveredCarts(
    merchantId: string,
    _command: CopilotCommand,
  ): Promise<DispatchResult> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const result = await this.pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total
       FROM orders
       WHERE merchant_id = $1 
         AND was_abandoned = true 
         AND status NOT IN ('ABANDONED', 'CANCELLED')
         AND created_at >= $2`,
      [merchantId, weekAgo],
    );

    const data = result.rows[0];
    return {
      success: true,
      intent: "ASK_RECOVERED_CARTS",
      action: "RECOVERED_CARTS",
      data: {
        count: parseInt(data.count),
        total: parseFloat(data.total),
      },
      replyAr: `🛒 السلات المستردة هذا الأسبوع:\n\n✅ ${data.count} سلة مستردة\n💰 بقيمة ${parseFloat(data.total).toLocaleString()} جنيه`,
    };
  }

  private async executeReorderLast(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    const { vipTag } = command.entities; // Uses vipTag for customer identification

    // Find customer
    let customerId: string | undefined;
    if (vipTag?.customerId) {
      customerId = vipTag.customerId;
    } else if (vipTag?.customerPhone || vipTag?.customerName) {
      const customerResult = await this.pool.query(
        `SELECT id, name, phone FROM customers 
         WHERE merchant_id = $1 
           AND (phone = $2 OR LOWER(name) LIKE $3)
         LIMIT 1`,
        [
          merchantId,
          vipTag?.customerPhone || "",
          `%${(vipTag?.customerName || "").toLowerCase()}%`,
        ],
      );
      if (customerResult.rows.length > 0) {
        customerId = customerResult.rows[0].id;
      }
    }

    if (!customerId) {
      return {
        success: false,
        intent: "REORDER_LAST",
        action: "REORDER_LAST",
        error: "Customer not found",
        replyAr: "لم يتم العثور على العميل",
      };
    }

    // Get last order for customer
    const orderResult = await this.pool.query(
      `SELECT o.id, o.order_number, o.total, o.status,
              json_agg(json_build_object('name', oi.product_name, 'qty', oi.quantity, 'price', oi.unit_price)) as items
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.merchant_id = $1 AND o.customer_id = $2
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT 1`,
      [merchantId, customerId],
    );

    if (orderResult.rows.length === 0) {
      return {
        success: false,
        intent: "REORDER_LAST",
        action: "REORDER_LAST",
        error: "No previous orders",
        replyAr: "لا توجد طلبات سابقة لهذا العميل",
      };
    }

    const lastOrder = orderResult.rows[0];

    // Create new order
    const newOrderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;
    const newOrder = await this.pool.query(
      `INSERT INTO orders (merchant_id, customer_id, order_number, status, total, payment_method, source)
       VALUES ($1, $2, $3, 'PENDING', $4, 'COD', 'copilot')
       RETURNING id, order_number, total`,
      [merchantId, customerId, newOrderNumber, lastOrder.total],
    );

    // Copy order items
    const items = lastOrder.items as {
      name: string;
      qty: number;
      price: number;
    }[];
    for (const item of items) {
      await this.pool.query(
        `INSERT INTO order_items (order_id, merchant_id, product_name, quantity, unit_price, total_price)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          newOrder.rows[0].id,
          merchantId,
          item.name,
          item.qty,
          item.price,
          item.qty * item.price,
        ],
      );
    }

    return {
      success: true,
      intent: "REORDER_LAST",
      action: "ORDER_CREATED",
      data: {
        orderId: newOrder.rows[0].id,
        orderNumber: newOrder.rows[0].order_number,
        total: parseFloat(newOrder.rows[0].total),
        itemCount: items.length,
      },
      replyAr: `✅ تم إنشاء طلب جديد #${newOrder.rows[0].order_number}\n📦 ${items.length} منتج\n💰 ${parseFloat(newOrder.rows[0].total).toLocaleString()} جنيه`,
    };
  }

  private async executeCloseMonth(
    merchantId: string,
    _command: CopilotCommand,
  ): Promise<DispatchResult> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );
    const monthName = monthStart.toLocaleString("ar-EG", {
      month: "long",
      year: "numeric",
    });

    // Calculate month summary
    const summaryResult = await this.pool.query(
      `SELECT 
         COUNT(*) as order_count,
         COALESCE(SUM(total), 0) as revenue,
         COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
         COUNT(*) FILTER (WHERE status::text IN ('CANCELLED', 'REFUNDED')) as cancelled,
         COALESCE(SUM(total) FILTER (WHERE payment_status = 'PAID'), 0) as collected
       FROM orders
       WHERE merchant_id = $1 
         AND created_at >= $2 
         AND created_at <= $3`,
      [merchantId, monthStart, monthEnd],
    );

    const expenseResult = await this.pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE merchant_id = $1 
         AND expense_date >= $2 
         AND expense_date <= $3`,
      [merchantId, monthStart, monthEnd],
    );

    const summary = summaryResult.rows[0];
    const expenses = parseFloat(expenseResult.rows[0].total);
    const revenue = parseFloat(summary.revenue);
    const netProfit = revenue - expenses;
    const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const closeYear = monthStart.getFullYear();
    const closeMonth = monthStart.getMonth() + 1;

    // Create canonical monthly close record.
    await this.pool.query(
      `INSERT INTO monthly_closes (
         merchant_id,
         year,
         month,
         period_start,
         period_end,
         total_revenue,
         total_orders,
         completed_orders,
         cancelled_orders,
         total_expenses,
         net_profit,
         net_margin_pct,
         status,
         closed_at,
         closed_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'closed', NOW(), 'copilot')
       ON CONFLICT (merchant_id, year, month)
       DO UPDATE SET 
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end,
         total_revenue = EXCLUDED.total_revenue,
         total_orders = EXCLUDED.total_orders,
         completed_orders = EXCLUDED.completed_orders,
         cancelled_orders = EXCLUDED.cancelled_orders,
         total_expenses = EXCLUDED.total_expenses,
         net_profit = EXCLUDED.net_profit,
         net_margin_pct = EXCLUDED.net_margin_pct,
         status = 'closed',
         closed_at = NOW(),
         closed_by = 'copilot',
         updated_at = NOW()`,
      [
        merchantId,
        closeYear,
        closeMonth,
        monthStart,
        monthEnd,
        revenue,
        parseInt(summary.order_count),
        parseInt(summary.delivered),
        parseInt(summary.cancelled),
        expenses,
        netProfit,
        netMarginPct,
      ],
    );

    return {
      success: true,
      intent: "CLOSE_MONTH",
      action: "MONTH_CLOSED",
      data: {
        month: monthStart.toISOString(),
        orderCount: parseInt(summary.order_count),
        revenue,
        expenses,
        netProfit,
        collected: parseFloat(summary.collected),
      },
      replyAr: `✅ تم قفل شهر ${monthName}\n\n📊 ملخص الشهر:\n📦 الطلبات: ${summary.order_count}\n💰 الإيرادات: ${revenue.toLocaleString()} جنيه\n📉 المصاريف: ${expenses.toLocaleString()} جنيه\n✨ صافي الربح: ${netProfit.toLocaleString()} جنيه`,
    };
  }

  // ============= Analytics Actions =============

  private async executeAskKpi(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    const { dateRange } = command.entities;
    const { startDate, endDate } = this.resolveDateRange(
      dateRange?.period || "this_week",
    );

    const result = await this.pool.query(
      `SELECT 
         COUNT(*) as order_count,
         COALESCE(SUM(total), 0) as revenue,
         COALESCE(AVG(total), 0) as aov,
         COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
         COUNT(*) FILTER (WHERE status::text IN ('CANCELLED', 'REFUNDED')) as cancelled
       FROM orders
       WHERE merchant_id = $1 
         AND created_at >= $2 
         AND created_at <= $3`,
      [merchantId, startDate, endDate],
    );

    const data = result.rows[0];
    const deliveryRate =
      data.order_count > 0
        ? Math.round((data.delivered / data.order_count) * 100)
        : 0;

    return {
      success: true,
      intent: "ASK_KPI",
      action: "KPI_SUMMARY",
      data: {
        orderCount: parseInt(data.order_count),
        revenue: parseFloat(data.revenue),
        aov: parseFloat(data.aov),
        delivered: parseInt(data.delivered),
        cancelled: parseInt(data.cancelled),
        deliveryRate,
      },
      replyAr: `📊 ملخص الأداء:\n\n📦 الطلبات: ${data.order_count}\n💰 الإيرادات: ${parseFloat(data.revenue).toLocaleString()} جنيه\n📈 متوسط الطلب: ${parseFloat(data.aov).toFixed(0)} جنيه\n✅ نسبة التسليم: ${deliveryRate}%`,
    };
  }

  private async executeAskRevenue(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    const { dateRange } = command.entities;
    const { startDate, endDate } = this.resolveDateRange(
      dateRange?.period || "today",
    );

    const result = await this.pool.query(
      `SELECT COALESCE(SUM(total), 0) as revenue, COUNT(*) as order_count
       FROM orders
       WHERE merchant_id = $1 
         AND created_at >= $2 
         AND created_at <= $3
         AND status::text NOT IN ('CANCELLED', 'REFUNDED')`,
      [merchantId, startDate, endDate],
    );

    const data = result.rows[0];
    const periodLabel =
      dateRange?.period === "today"
        ? "اليوم"
        : dateRange?.period === "this_week"
          ? "هذا الأسبوع"
          : "هذا الشهر";

    return {
      success: true,
      intent: "ASK_REVENUE",
      action: "REVENUE",
      data: {
        revenue: parseFloat(data.revenue),
        orderCount: parseInt(data.order_count),
      },
      replyAr: `💰 الإيرادات ${periodLabel}:\n\n${parseFloat(data.revenue).toLocaleString()} جنيه\nمن ${data.order_count} طلب`,
    };
  }

  private async executeAskOrderCount(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<DispatchResult> {
    const { dateRange } = command.entities;
    const { startDate, endDate } = this.resolveDateRange(
      dateRange?.period || "today",
    );

    const result = await this.pool.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
         COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing,
         COUNT(*) FILTER (WHERE status = 'SHIPPED') as shipped,
         COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered
       FROM orders
       WHERE merchant_id = $1 
         AND created_at >= $2 
         AND created_at <= $3`,
      [merchantId, startDate, endDate],
    );

    const data = result.rows[0];
    return {
      success: true,
      intent: "ASK_ORDER_COUNT",
      action: "ORDER_COUNT",
      data: {
        total: parseInt(data.total),
        pending: parseInt(data.pending),
        processing: parseInt(data.processing),
        shipped: parseInt(data.shipped),
        delivered: parseInt(data.delivered),
      },
      replyAr: `📦 الطلبات:\n\n📊 الإجمالي: ${data.total}\n⏳ قيد الانتظار: ${data.pending}\n🔄 قيد التجهيز: ${data.processing}\n🚚 في الطريق: ${data.shipped}\n✅ تم التسليم: ${data.delivered}`,
    };
  }

  // ============= Helpers =============

  private resolveDateRange(period: string): { startDate: Date; endDate: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (period) {
      case "today":
        return { startDate: today, endDate: now };
      case "yesterday":
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { startDate: yesterday, endDate: today };
      case "this_week":
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        return { startDate: weekStart, endDate: now };
      case "last_week":
        const lastWeekEnd = new Date(today);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay());
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        return { startDate: lastWeekStart, endDate: lastWeekEnd };
      case "this_month":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { startDate: monthStart, endDate: now };
      case "last_month":
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1,
        );
        return { startDate: lastMonthStart, endDate: lastMonthEnd };
      default:
        return { startDate: today, endDate: now };
    }
  }
}
