/**
 * Finance Agent Handlers
 *
 * Implements payment automation, proof verification, and CFO reporting.
 * Phase 2 Finance Agent MVP - Production Ready
 */

import { Pool } from "pg";
import { Logger } from "@nestjs/common";
import { AgentTask } from "@tash8eel/agent-sdk";
import {
  CodStatementImportInput,
  RecordExpenseInput,
  GenerateAccountantPackInput,
  RequestProofInput,
} from "./finance.tasks";

const logger = new Logger("FinanceHandlers");

export interface PaymentLinkResult {
  action: "PAYMENT_LINK_CREATED" | "PAYMENT_LINK_EXISTS" | "SKIPPED" | "FAILED";
  paymentLinkId?: string;
  linkCode?: string;
  paymentUrl?: string;
  amount?: number;
  message: string;
}

export interface PaymentProofReviewResult {
  action: "AUTO_APPROVED" | "PENDING_REVIEW" | "AUTO_REJECTED" | "FAILED";
  proofId: string;
  confidence: number;
  verificationDetails?: {
    amountMatches: boolean;
    receiverMatches: boolean;
    referenceValid: boolean;
    duplicateCheck: boolean;
  };
  message: string;
  orderId?: string;
}

export interface CFOBriefResult {
  action: "BRIEF_GENERATED" | "NO_DATA" | "FAILED";
  report?: {
    periodStart: string;
    periodEnd: string;
    totalRevenue: number;
    paidOrders: number;
    pendingPayments: number;
    codPendingAmount: number;
    refundsCount: number;
    refundsAmount: number;
    averageOrderValue: number;
    paymentMethodBreakdown: Record<string, number>;
  };
  message: string;
  messageAr?: string;
  summaryAr?: string;
}

export class FinanceHandlers {
  private readonly logger = new Logger(FinanceHandlers.name);

  constructor(private readonly pool: Pool) {}

  /**
   * AUTO_CREATE_PAYMENT_LINK handler
   * Creates payment link when order is created with payment_mode=LINK
   */
  async autoCreatePaymentLink(task: AgentTask): Promise<PaymentLinkResult> {
    const {
      orderId,
      merchantId,
      amount,
      customerName,
      customerPhone,
      orderNumber,
    } = task.input as {
      orderId: string;
      merchantId: string;
      amount: number;
      customerName?: string;
      customerPhone?: string;
      orderNumber?: string;
    };

    try {
      // Check if payment link already exists for this order
      const existingLink = await this.pool.query(
        `SELECT id, link_code FROM payment_links WHERE order_id = $1 AND merchant_id = $2 AND status != 'CANCELLED'`,
        [orderId, merchantId],
      );

      if (existingLink.rows.length > 0) {
        this.logger.log(`Payment link already exists for order ${orderId}`);
        return {
          action: "PAYMENT_LINK_EXISTS",
          paymentLinkId: existingLink.rows[0].id,
          linkCode: existingLink.rows[0].link_code,
          message: "Payment link already exists for this order",
        };
      }

      // Get merchant settings for payment configuration
      const merchantResult = await this.pool.query(
        `SELECT currency, payment_config FROM merchants WHERE id = $1`,
        [merchantId],
      );

      if (merchantResult.rows.length === 0) {
        return { action: "FAILED", message: "Merchant not found" };
      }

      const merchant = merchantResult.rows[0];
      const currency = merchant.currency || "EGP";
      const paymentConfig = merchant.payment_config || {};
      const expiresInHours = paymentConfig.linkExpiryHours || 24;

      // Generate unique link code
      const linkCode = this.generateLinkCode();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiresInHours);

      // Create the payment link
      const result = await this.pool.query(
        `INSERT INTO payment_links (
          merchant_id, order_id, link_code, amount, currency,
          description, customer_phone, customer_name,
          allowed_methods, expires_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, link_code`,
        [
          merchantId,
          orderId,
          linkCode,
          amount,
          currency,
          `طلب رقم ${orderNumber || orderId}`,
          customerPhone || null,
          customerName || null,
          ["INSTAPAY", "BANK_TRANSFER", "VODAFONE_CASH"],
          expiresAt,
          JSON.stringify({ source: "finance_agent", taskId: task.id }),
        ],
      );

      const paymentLink = result.rows[0];
      const baseUrl = process.env.APP_URL || "https://tash8eel.app";
      const paymentUrl = `${baseUrl}/pay/${linkCode}`;

      this.logger.log(`Created payment link ${linkCode} for order ${orderId}`);

      // Create notification for merchant
      await this.createNotification(merchantId, {
        type: "PAYMENT_LINK_CREATED",
        title: "تم إنشاء رابط دفع",
        message: `تم إنشاء رابط دفع تلقائي للطلب ${orderNumber || orderId} بقيمة ${amount} ${currency}`,
        metadata: { orderId, paymentLinkId: paymentLink.id, amount },
      });

      return {
        action: "PAYMENT_LINK_CREATED",
        paymentLinkId: paymentLink.id,
        linkCode: paymentLink.link_code,
        paymentUrl,
        amount,
        message: `Payment link created successfully for order ${orderNumber || orderId}`,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to create payment link: ${err.message}`,
        err.stack,
      );
      return { action: "FAILED", message: err.message };
    }
  }

  /**
   * PAYMENT_PROOF_REVIEW handler
   * Automatically reviews payment proofs using Egypt verification rules
   */
  async reviewPaymentProof(task: AgentTask): Promise<PaymentProofReviewResult> {
    const { proofId, merchantId } = task.input as {
      proofId: string;
      merchantId: string;
    };

    try {
      // Get proof details with linked payment link and order
      const proofResult = await this.pool.query(
        `SELECT pp.*, pl.amount as expected_amount, pl.order_id, o.total as order_total
         FROM payment_proofs pp
         LEFT JOIN payment_links pl ON pp.payment_link_id = pl.id
         LEFT JOIN orders o ON pl.order_id = o.id
         WHERE pp.id = $1 AND pp.merchant_id = $2`,
        [proofId, merchantId],
      );

      if (proofResult.rows.length === 0) {
        return {
          action: "FAILED",
          proofId,
          confidence: 0,
          message: "Payment proof not found",
        };
      }

      const proof = proofResult.rows[0];
      const expectedAmount = proof.expected_amount || proof.order_total;

      // Get merchant verification config
      const configResult = await this.pool.query(
        `SELECT payment_verification_config FROM merchants WHERE id = $1`,
        [merchantId],
      );

      const config = configResult.rows[0]?.payment_verification_config || {
        ocrConfidenceThreshold: 0.8,
        amountTolerancePercent: 2,
        requireReceiverMatch: true,
        allowedReceivers: [],
        checkDuplicateReference: true,
      };

      // Run Egypt verification rules
      const verificationResult = await this.verifyEgyptPayment(
        proof,
        expectedAmount,
        config,
      );

      // Determine action based on verification
      let action: PaymentProofReviewResult["action"];

      if (
        verificationResult.allPassed &&
        verificationResult.confidence >= config.ocrConfidenceThreshold
      ) {
        action = "AUTO_APPROVED";

        // Auto-approve: Update proof status and mark payment link as paid
        await this.pool.query(
          `UPDATE payment_proofs 
           SET status = 'APPROVED', verified_at = NOW(), verified_by = 'finance_agent', 
               verification_result = $1
           WHERE id = $2`,
          [JSON.stringify(verificationResult), proofId],
        );

        if (proof.payment_link_id) {
          await this.pool.query(
            `UPDATE payment_links SET status = 'PAID', paid_at = NOW() WHERE id = $1`,
            [proof.payment_link_id],
          );
        }

        // Update order to PAID if exists
        if (proof.order_id) {
          await this.pool.query(
            `UPDATE orders SET payment_status = 'PAID', updated_at = NOW() WHERE id = $1`,
            [proof.order_id],
          );
        }

        // Notify merchant of auto-approval
        await this.createNotification(merchantId, {
          type: "PAYMENT_AUTO_APPROVED",
          title: "تم قبول إثبات الدفع تلقائياً",
          message: `تم التحقق من إثبات الدفع وقبوله تلقائياً - المبلغ: ${proof.extracted_amount || expectedAmount} ج.م`,
          metadata: { proofId, orderId: proof.order_id },
        });
      } else if (verificationResult.confidence < 0.5) {
        action = "AUTO_REJECTED";

        await this.pool.query(
          `UPDATE payment_proofs 
           SET status = 'REJECTED', verified_at = NOW(), verified_by = 'finance_agent',
               rejection_reason = $1, verification_result = $2
           WHERE id = $3`,
          [
            "Low confidence verification",
            JSON.stringify(verificationResult),
            proofId,
          ],
        );

        await this.createNotification(merchantId, {
          type: "PAYMENT_PROOF_REJECTED",
          title: "رُفض إثبات الدفع",
          message: "تم رفض إثبات الدفع تلقائياً - يرجى مراجعة الصورة",
          metadata: { proofId, orderId: proof.order_id },
        });
      } else {
        action = "PENDING_REVIEW";

        await this.pool.query(
          `UPDATE payment_proofs SET verification_result = $1 WHERE id = $2`,
          [JSON.stringify(verificationResult), proofId],
        );

        await this.createNotification(merchantId, {
          type: "PAYMENT_PROOF_NEEDS_REVIEW",
          title: "إثبات دفع يحتاج مراجعة",
          message: "تم تقديم إثبات دفع يحتاج إلى مراجعتك للموافقة عليه",
          metadata: {
            proofId,
            orderId: proof.order_id,
            confidence: verificationResult.confidence,
          },
        });
      }

      this.logger.log(
        `Payment proof ${proofId} reviewed: ${action} (confidence: ${verificationResult.confidence})`,
      );

      return {
        action,
        proofId,
        confidence: verificationResult.confidence,
        verificationDetails: {
          amountMatches: verificationResult.amountMatches,
          receiverMatches: verificationResult.receiverMatches,
          referenceValid: verificationResult.referenceValid,
          duplicateCheck: verificationResult.noDuplicate,
        },
        message: `Payment proof reviewed: ${action}`,
        orderId: proof.order_id,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to review payment proof: ${err.message}`,
        err.stack,
      );
      return { action: "FAILED", proofId, confidence: 0, message: err.message };
    }
  }

  /**
   * WEEKLY_CFO_BRIEF handler
   * Generates weekly financial summary for merchant
   */
  async generateWeeklyCFOBrief(task: AgentTask): Promise<CFOBriefResult> {
    const { merchantId } = task.input as { merchantId: string };

    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const periodStart = weekAgo.toISOString().split("T")[0];
      const periodEnd = now.toISOString().split("T")[0];

      // Get all orders for the week
      const ordersResult = await this.pool.query(
        `SELECT id, total, status, payment_status, payment_method, created_at
         FROM orders
         WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3`,
        [merchantId, weekAgo, now],
      );

      const orders = ordersResult.rows;

      if (orders.length === 0) {
        return {
          action: "NO_DATA",
          message: "لا توجد طلبات في الفترة المحددة للتقرير",
          summaryAr: "لا توجد طلبات في الفترة المحددة للتقرير.",
        };
      }

      // Calculate metrics
      const paidOrders = orders.filter((o) => o.payment_status === "PAID");
      const pendingOrders = orders.filter(
        (o) => o.payment_status === "PENDING" || !o.payment_status,
      );
      const codOrders = orders.filter(
        (o) => o.payment_method === "COD" && o.payment_status !== "PAID",
      );

      const totalRevenue = paidOrders.reduce(
        (sum, o) => sum + parseFloat(o.total || 0),
        0,
      );
      const pendingPayments = pendingOrders.reduce(
        (sum, o) => sum + parseFloat(o.total || 0),
        0,
      );
      const codPendingAmount = codOrders.reduce(
        (sum, o) => sum + parseFloat(o.total || 0),
        0,
      );
      const averageOrderValue =
        paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

      // Get refunds (handle case where table might not exist)
      let refundsCount = 0;
      let refundsAmount = 0;
      try {
        const refundsResult = await this.pool.query(
          `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
           FROM refunds
           WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3`,
          [merchantId, weekAgo, now],
        );
        refundsCount = parseInt(refundsResult.rows[0]?.count || "0");
        refundsAmount = parseFloat(refundsResult.rows[0]?.total || "0");
      } catch {
        // Refunds table might not exist
      }

      // Payment method breakdown
      const paymentMethodBreakdown: Record<string, number> = {};
      for (const order of paidOrders) {
        const method = order.payment_method || "UNKNOWN";
        paymentMethodBreakdown[method] =
          (paymentMethodBreakdown[method] || 0) + parseFloat(order.total || 0);
      }

      const report = {
        periodStart,
        periodEnd,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        paidOrders: paidOrders.length,
        pendingPayments: Math.round(pendingPayments * 100) / 100,
        codPendingAmount: Math.round(codPendingAmount * 100) / 100,
        refundsCount,
        refundsAmount: Math.round(refundsAmount * 100) / 100,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        paymentMethodBreakdown,
      };

      // Store the report (handle case where table might not exist)
      try {
        await this.pool.query(
          `INSERT INTO merchant_reports (merchant_id, report_date, period_type, period_start, period_end, summary, created_at)
           VALUES ($1, $2, 'WEEKLY_CFO_BRIEF', $2, $3, $4, NOW())
           ON CONFLICT (merchant_id, report_date, period_type) DO UPDATE SET summary = $4, period_end = $3, created_at = NOW()`,
          [merchantId, periodStart, periodEnd, JSON.stringify(report)],
        );
      } catch {
        this.logger.warn("Could not store report in merchant_reports table");
      }

      // Create notification
      await this.createNotification(merchantId, {
        type: "CFO_BRIEF_READY",
        title: "التقرير المالي الأسبوعي جاهز",
        message: `إيرادات الأسبوع: ${report.totalRevenue} ج.م | طلبات مدفوعة: ${report.paidOrders}`,
        metadata: { reportType: "WEEKLY_CFO_BRIEF", periodStart, periodEnd },
      });

      this.logger.log(`Generated weekly CFO brief for merchant ${merchantId}`);

      return {
        action: "BRIEF_GENERATED",
        report,
        message: "تم إنشاء الملخص المالي بنجاح",
        summaryAr: `تم إعداد ملخص مالي للفترة. الإيرادات ${report.totalRevenue} ج.م من ${report.paidOrders} طلب مدفوع.`,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to generate CFO brief: ${err.message}`,
        err.stack,
      );
      return { action: "FAILED", message: err.message };
    }
  }

  // ============================================================================
  // COD STATEMENT IMPORT & RECONCILIATION (Growth+ Feature)
  // ============================================================================

  /**
   * Import courier COD statement CSV
   */
  async importCodStatement(
    input: CodStatementImportInput,
  ): Promise<Record<string, unknown>> {
    const { merchantId, courierName, filename, statementDate, rows } = input;

    this.logger.log(`Importing COD statement from ${courierName}`, {
      merchantId,
      rowCount: rows.length,
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Create import record
      const importResult = await client.query(
        `INSERT INTO cod_statement_imports 
         (merchant_id, courier_name, filename, statement_date, total_orders, status)
         VALUES ($1, $2, $3, $4, $5, 'processing')
         RETURNING id`,
        [merchantId, courierName, filename, statementDate, rows.length],
      );
      const statementId = importResult.rows[0].id;

      let totalCollected = 0;
      let totalFees = 0;
      let matchedOrders = 0;
      let unmatchedOrders = 0;
      const discrepancies: Array<{
        orderNumber: string;
        expected: number;
        reported: number;
        diff: number;
      }> = [];

      for (const row of rows) {
        const {
          trackingNumber,
          orderNumber,
          customerName,
          collectedAmount,
          deliveryFee,
          codFee,
          deliveryDate,
          status,
        } = row;

        totalCollected += collectedAmount || 0;
        totalFees += (deliveryFee || 0) + (codFee || 0);
        const netAmount =
          (collectedAmount || 0) - (deliveryFee || 0) - (codFee || 0);

        // Try to match with our order
        const orderMatch = await client.query(
          `SELECT id, total, order_number FROM orders 
           WHERE merchant_id = $1 AND (order_number = $2 OR tracking_number = $3)`,
          [merchantId, orderNumber, trackingNumber],
        );

        let orderId = null;
        let matchStatus = "unmatched";
        let ourAmount = null;
        let discrepancyAmount = null;

        if (orderMatch.rows.length > 0) {
          orderId = orderMatch.rows[0].id;
          ourAmount = parseFloat(orderMatch.rows[0].total);
          matchStatus = "matched";
          matchedOrders++;

          // Check for discrepancy (deterministic comparison)
          const tolerance = 1; // 1 EGP tolerance
          if (
            collectedAmount &&
            Math.abs(collectedAmount - ourAmount) > tolerance
          ) {
            matchStatus = "discrepancy";
            discrepancyAmount = collectedAmount - ourAmount;
            discrepancies.push({
              orderNumber: orderMatch.rows[0].order_number,
              expected: ourAmount,
              reported: collectedAmount,
              diff: discrepancyAmount,
            });
          }

          // Update order COD collection status
          if (status === "delivered" && collectedAmount) {
            await client.query(
              `UPDATE orders SET payment_status = 'PAID', cod_collected = true, cod_collected_at = $1 
               WHERE id = $2`,
              [deliveryDate, orderId],
            );
          }
        } else {
          unmatchedOrders++;
        }

        // Insert line item
        await client.query(
          `INSERT INTO cod_statement_lines 
           (statement_id, merchant_id, tracking_number, order_number, order_id, customer_name,
            collected_amount, delivery_fee, cod_fee, net_amount, delivery_date, status, match_status,
            our_amount, discrepancy_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            statementId,
            merchantId,
            trackingNumber,
            orderNumber,
            orderId,
            customerName,
            collectedAmount,
            deliveryFee,
            codFee,
            netAmount,
            deliveryDate,
            status,
            matchStatus,
            ourAmount,
            discrepancyAmount,
          ],
        );
      }

      const netAmount = totalCollected - totalFees;

      // Update statement totals
      await client.query(
        `UPDATE cod_statement_imports SET
         total_collected = $1, total_fees = $2, net_amount = $3,
         matched_orders = $4, unmatched_orders = $5, discrepancies = $6,
         status = 'reconciled', reconciled_at = NOW()
         WHERE id = $7`,
        [
          totalCollected,
          totalFees,
          netAmount,
          matchedOrders,
          unmatchedOrders,
          JSON.stringify(discrepancies),
          statementId,
        ],
      );

      await client.query("COMMIT");

      return {
        action: "COD_STATEMENT_IMPORTED",
        statementId,
        courierName,
        summary: {
          totalOrders: rows.length,
          totalCollected,
          totalFees,
          netAmount,
          matchedOrders,
          unmatchedOrders,
          discrepancyCount: discrepancies.length,
        },
        discrepancies: discrepancies.slice(0, 10), // First 10
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Schedule COD collection reminders
   */
  async scheduleCodReminders(input: {
    merchantId: string;
    daysPastDue?: number;
  }): Promise<Record<string, unknown>> {
    const { merchantId, daysPastDue = 3 } = input;

    // Find orders with pending COD
    const pendingCod = await this.pool.query(
      `SELECT o.id, o.order_number, o.total, o.customer_id, o.customer_phone, o.created_at, c.name as customer_name
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id AND o.merchant_id = c.merchant_id
       WHERE o.merchant_id = $1 
         AND o.payment_method = 'COD'
         AND (o.payment_status IS NULL OR o.payment_status = 'PENDING')
         AND o.status = 'DELIVERED'
         AND o.created_at < NOW() - ($2 || ' days')::INTERVAL
         AND NOT EXISTS (
           SELECT 1 FROM cod_reminders cr 
           WHERE cr.order_id = o.id AND cr.status IN ('pending', 'sent') AND cr.scheduled_at > NOW() - INTERVAL '24 hours'
         )`,
      [merchantId, daysPastDue],
    );

    let scheduled = 0;
    for (const order of pendingCod.rows) {
      const daysSinceOrder = Math.floor(
        (Date.now() - new Date(order.created_at).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      // Determine reminder type based on days past due
      let reminderType = "first_reminder";
      if (daysSinceOrder > 7) reminderType = "second_reminder";
      if (daysSinceOrder > 14) reminderType = "final_notice";

      await this.pool.query(
        `INSERT INTO cod_reminders 
         (merchant_id, order_id, customer_id, customer_phone, amount_due, reminder_type, scheduled_at, message_template)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '1 hour', $7)`,
        [
          merchantId,
          order.id,
          order.customer_id,
          order.customer_phone,
          order.total,
          reminderType,
          reminderType,
        ],
      );
      scheduled++;
    }

    return {
      action: "REMINDERS_SCHEDULED",
      merchantId,
      scheduled,
      daysPastDue,
    };
  }

  // ============================================================================
  // EXPENSE TRACKING & CATEGORIES (Starter+ Feature)
  // ============================================================================

  /**
   * Record an expense with category
   */
  async recordExpense(
    input: RecordExpenseInput,
  ): Promise<Record<string, unknown>> {
    const {
      merchantId,
      category,
      subcategory,
      amount,
      description,
      expenseDate,
      isRecurring,
      recurringDay,
      receiptUrl,
      createdBy,
    } = input;

    const result = await this.pool.query(
      `INSERT INTO expenses 
       (merchant_id, category, subcategory, amount, description, expense_date, is_recurring, recurring_day, receipt_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        merchantId,
        category,
        subcategory,
        amount,
        description,
        expenseDate || new Date(),
        isRecurring || false,
        recurringDay,
        receiptUrl,
        createdBy || "finance_agent",
      ],
    );

    return {
      action: "EXPENSE_RECORDED",
      expenseId: result.rows[0].id,
      category,
      amount,
    };
  }

  /**
   * Get expense summary by category for a period
   */
  async getExpenseSummary(input: {
    merchantId: string;
    startDate: string;
    endDate: string;
  }): Promise<Record<string, unknown>> {
    const { merchantId, startDate, endDate } = input;

    const byCategory = await this.pool.query(
      `SELECT category, subcategory, 
              COUNT(*) as count, 
              SUM(amount) as total
       FROM expenses
       WHERE merchant_id = $1 AND expense_date >= $2 AND expense_date <= $3
       GROUP BY category, subcategory
       ORDER BY total DESC`,
      [merchantId, startDate, endDate],
    );

    const totals = byCategory.rows.reduce(
      (acc, row) => ({
        count: acc.count + parseInt(row.count),
        total: acc.total + parseFloat(row.total),
      }),
      { count: 0, total: 0 },
    );

    // Group by main category
    const categoryTotals: Record<string, number> = {};
    for (const row of byCategory.rows) {
      categoryTotals[row.category] =
        (categoryTotals[row.category] || 0) + parseFloat(row.total);
    }

    return {
      merchantId,
      period: { startDate, endDate },
      totals,
      byCategory: categoryTotals,
      breakdown: byCategory.rows.map((r) => ({
        category: r.category,
        subcategory: r.subcategory,
        count: parseInt(r.count),
        total: parseFloat(r.total),
      })),
    };
  }

  // ============================================================================
  // MONTHLY CLOSE REPORT (Growth+ Feature)
  // ============================================================================

  /**
   * Generate monthly close report - all calculations deterministic
   */
  async generateMonthlyClose(input: {
    merchantId: string;
    year: number;
    month: number;
  }): Promise<Record<string, unknown>> {
    const { merchantId, year, month } = input;

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0); // Last day of month

    this.logger.log("Generating monthly close", { merchantId, year, month });

    // Revenue from orders
    const revenueResult = await this.pool.query(
      `SELECT 
         COUNT(*) as total_orders,
         COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) as completed_orders,
         COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_orders,
         COALESCE(SUM(CASE WHEN status NOT IN ('CANCELLED', 'REJECTED') THEN total END), 0) as total_revenue
       FROM orders
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [merchantId, periodStart, periodEnd],
    );

    // COGS (from order items with cost prices)
    const cogsResult = await this.pool.query(
      `SELECT COALESCE(SUM(oi.quantity * COALESCE(v.cost_price, i.cost_price, 0)), 0) as total_cogs
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       LEFT JOIN inventory_variants v ON oi.variant_id = v.id
       LEFT JOIN inventory_items i ON v.inventory_item_id = i.id
       WHERE o.merchant_id = $1 
         AND o.created_at >= $2 AND o.created_at <= $3
         AND o.status NOT IN ('CANCELLED', 'REJECTED')`,
      [merchantId, periodStart, periodEnd],
    );

    // Expenses
    const expensesResult = await this.pool.query(
      `SELECT category, COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE merchant_id = $1 AND expense_date >= $2 AND expense_date <= $3
       GROUP BY category`,
      [merchantId, periodStart, periodEnd],
    );

    // COD
    const codResult = await this.pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN payment_method = 'COD' THEN total END), 0) as cod_expected,
         COALESCE(SUM(CASE WHEN payment_method = 'COD' AND cod_collected = true THEN total END), 0) as cod_collected
       FROM orders
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
         AND status = 'DELIVERED'`,
      [merchantId, periodStart, periodEnd],
    );

    // Refunds
    const refundsResult = await this.pool.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM refunds
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [merchantId, periodStart, periodEnd],
    );

    // Deterministic calculations
    const totalRevenue = parseFloat(revenueResult.rows[0].total_revenue) || 0;
    const totalCogs = parseFloat(cogsResult.rows[0].total_cogs) || 0;
    const grossProfit = totalRevenue - totalCogs;
    const grossMarginPct =
      totalRevenue > 0
        ? Math.round((grossProfit / totalRevenue) * 10000) / 100
        : 0;

    const expensesBreakdown: Record<string, number> = {};
    let totalExpenses = 0;
    for (const row of expensesResult.rows) {
      expensesBreakdown[row.category] = parseFloat(row.total);
      totalExpenses += parseFloat(row.total);
    }

    const netProfit = grossProfit - totalExpenses;
    const netMarginPct =
      totalRevenue > 0
        ? Math.round((netProfit / totalRevenue) * 10000) / 100
        : 0;

    const codExpected = parseFloat(codResult.rows[0].cod_expected) || 0;
    const codCollected = parseFloat(codResult.rows[0].cod_collected) || 0;
    const codOutstanding = codExpected - codCollected;

    // Upsert monthly close
    await this.pool.query(
      `INSERT INTO monthly_closes 
       (merchant_id, year, month, period_start, period_end,
        total_revenue, total_orders, completed_orders, cancelled_orders,
        total_cogs, gross_profit, gross_margin_pct,
        expenses_breakdown, total_expenses, net_profit, net_margin_pct,
        cod_expected, cod_collected, cod_outstanding,
        total_refunds, refund_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'open')
       ON CONFLICT (merchant_id, year, month) DO UPDATE SET
         total_revenue = EXCLUDED.total_revenue,
         total_orders = EXCLUDED.total_orders,
         completed_orders = EXCLUDED.completed_orders,
         cancelled_orders = EXCLUDED.cancelled_orders,
         total_cogs = EXCLUDED.total_cogs,
         gross_profit = EXCLUDED.gross_profit,
         gross_margin_pct = EXCLUDED.gross_margin_pct,
         expenses_breakdown = EXCLUDED.expenses_breakdown,
         total_expenses = EXCLUDED.total_expenses,
         net_profit = EXCLUDED.net_profit,
         net_margin_pct = EXCLUDED.net_margin_pct,
         cod_expected = EXCLUDED.cod_expected,
         cod_collected = EXCLUDED.cod_collected,
         cod_outstanding = EXCLUDED.cod_outstanding,
         total_refunds = EXCLUDED.total_refunds,
         refund_count = EXCLUDED.refund_count,
         updated_at = NOW()
       RETURNING id`,
      [
        merchantId,
        year,
        month,
        periodStart,
        periodEnd,
        totalRevenue,
        parseInt(revenueResult.rows[0].total_orders),
        parseInt(revenueResult.rows[0].completed_orders),
        parseInt(revenueResult.rows[0].cancelled_orders),
        totalCogs,
        grossProfit,
        grossMarginPct,
        JSON.stringify(expensesBreakdown),
        totalExpenses,
        netProfit,
        netMarginPct,
        codExpected,
        codCollected,
        codOutstanding,
        parseFloat(refundsResult.rows[0].total) || 0,
        parseInt(refundsResult.rows[0].count) || 0,
      ],
    );

    return {
      action: "MONTHLY_CLOSE_GENERATED",
      merchantId,
      period: { year, month },
      report: {
        revenue: {
          total: totalRevenue,
          orders: parseInt(revenueResult.rows[0].total_orders),
        },
        cogs: totalCogs,
        grossProfit,
        grossMarginPct,
        expenses: { total: totalExpenses, breakdown: expensesBreakdown },
        netProfit,
        netMarginPct,
        cod: {
          expected: codExpected,
          collected: codCollected,
          outstanding: codOutstanding,
        },
        refunds: {
          count: parseInt(refundsResult.rows[0].count) || 0,
          total: parseFloat(refundsResult.rows[0].total) || 0,
        },
      },
    };
  }

  // ============================================================================
  // ACCOUNTANT PACK EXPORT (Pro Feature)
  // ============================================================================

  /**
   * Generate accountant export pack (returns data for CSV/PDF generation)
   */
  async generateAccountantPack(
    input: GenerateAccountantPackInput,
  ): Promise<Record<string, unknown>> {
    const { merchantId, startDate, endDate, includes } = input;

    this.logger.log("Generating accountant pack", {
      merchantId,
      startDate,
      endDate,
    });

    const pack: Record<string, any> = {
      merchantId,
      period: { startDate, endDate },
      generatedAt: new Date().toISOString(),
      sections: {},
    };

    // Orders summary
    if (includes.includes("orders")) {
      const orders = await this.pool.query(
        `SELECT order_number, created_at, customer_name, total, payment_method, payment_status, status
         FROM orders
         WHERE merchant_id = $1 AND created_at >= $2 AND created_at <= $3
         ORDER BY created_at`,
        [merchantId, startDate, endDate],
      );
      pack.sections.orders = {
        count: orders.rows.length,
        data: orders.rows,
      };
    }

    // Expenses
    if (includes.includes("expenses")) {
      const expenses = await this.pool.query(
        `SELECT expense_date, category, subcategory, description, amount, receipt_url
         FROM expenses
         WHERE merchant_id = $1 AND expense_date >= $2 AND expense_date <= $3
         ORDER BY expense_date`,
        [merchantId, startDate, endDate],
      );
      pack.sections.expenses = {
        count: expenses.rows.length,
        data: expenses.rows,
      };
    }

    // COD reconciliation
    if (includes.includes("cod_reconciliation")) {
      const codStatements = await this.pool.query(
        `SELECT courier_name, statement_date, total_orders, total_collected, total_fees, net_amount, 
                matched_orders, unmatched_orders, discrepancies
         FROM cod_statement_imports
         WHERE merchant_id = $1 AND statement_date >= $2 AND statement_date <= $3
         ORDER BY statement_date`,
        [merchantId, startDate, endDate],
      );
      pack.sections.codReconciliation = {
        count: codStatements.rows.length,
        data: codStatements.rows,
      };
    }

    // Inventory movements
    if (includes.includes("inventory_movements")) {
      const movements = await this.pool.query(
        `SELECT sm.created_at, v.sku, v.name, sm.movement_type, sm.quantity, sm.quantity_before, sm.quantity_after, sm.reason
         FROM stock_movements sm
         JOIN inventory_variants v ON sm.variant_id = v.id
         WHERE sm.merchant_id = $1 AND sm.created_at >= $2 AND sm.created_at <= $3
         ORDER BY sm.created_at`,
        [merchantId, startDate, endDate],
      );
      pack.sections.inventoryMovements = {
        count: movements.rows.length,
        data: movements.rows,
      };
    }

    // Monthly close summary
    const closeResult = await this.pool.query(
      `SELECT * FROM monthly_closes
       WHERE merchant_id = $1 
         AND (year > EXTRACT(YEAR FROM $2::date) OR (year = EXTRACT(YEAR FROM $2::date) AND month >= EXTRACT(MONTH FROM $2::date)))
         AND (year < EXTRACT(YEAR FROM $3::date) OR (year = EXTRACT(YEAR FROM $3::date) AND month <= EXTRACT(MONTH FROM $3::date)))
       ORDER BY year, month`,
      [merchantId, startDate, endDate],
    );
    pack.sections.monthlyCloses = closeResult.rows;

    // Record export
    await this.pool.query(
      `INSERT INTO accountant_exports (merchant_id, export_type, period_start, period_end, includes, generated_by)
       VALUES ($1, 'custom', $2, $3, $4, 'finance_agent')`,
      [merchantId, startDate, endDate, JSON.stringify(includes)],
    );

    return {
      action: "ACCOUNTANT_PACK_GENERATED",
      ...pack,
    };
  }

  // ============================================================================
  // PAYMENT PROOF REQUEST (for Ops Agent integration)
  // ============================================================================

  /**
   * Record that we've requested payment proof from customer
   */
  async requestPaymentProof(
    input: RequestProofInput,
  ): Promise<Record<string, unknown>> {
    const {
      merchantId,
      conversationId,
      orderId,
      paymentLinkId,
      customerPhone,
      amount,
      paymentMethod,
    } = input;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const result = await this.pool.query(
      `INSERT INTO proof_requests 
       (merchant_id, conversation_id, order_id, payment_link_id, customer_phone, amount, payment_method, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        merchantId,
        conversationId,
        orderId,
        paymentLinkId,
        customerPhone,
        amount,
        paymentMethod,
        expiresAt,
      ],
    );

    return {
      action: "PROOF_REQUEST_CREATED",
      requestId: result.rows[0].id,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Egypt-specific payment verification
   */
  private async verifyEgyptPayment(
    proof: any,
    expectedAmount: number,
    config: any,
  ): Promise<{
    allPassed: boolean;
    confidence: number;
    amountMatches: boolean;
    receiverMatches: boolean;
    referenceValid: boolean;
    noDuplicate: boolean;
  }> {
    const extractedAmount = proof.extracted_amount || 0;
    const extractedReceiver = proof.extracted_receiver || "";
    const referenceNumber = proof.reference_number || "";
    const ocrConfidence = proof.ocr_confidence || 0.7;

    // Amount tolerance check (default 2%)
    const tolerance = (config.amountTolerancePercent / 100) * expectedAmount;
    const amountMatches = expectedAmount
      ? Math.abs(extractedAmount - expectedAmount) <= tolerance
      : true;

    // Receiver match check
    let receiverMatches = true;
    if (config.requireReceiverMatch && config.allowedReceivers?.length > 0) {
      receiverMatches = config.allowedReceivers.some((r: string) =>
        extractedReceiver.toLowerCase().includes(r.toLowerCase()),
      );
    }

    // Reference number validation (not empty for InstaPay/Bank)
    const referenceValid = referenceNumber.length >= 4;

    // Duplicate check
    let noDuplicate = true;
    if (config.checkDuplicateReference && referenceNumber) {
      const duplicateCheck = await this.pool.query(
        `SELECT id FROM payment_proofs 
         WHERE reference_number = $1 AND merchant_id = $2 AND id != $3 AND status = 'APPROVED'`,
        [referenceNumber, proof.merchant_id, proof.id],
      );
      noDuplicate = duplicateCheck.rows.length === 0;
    }

    const allPassed =
      amountMatches && receiverMatches && referenceValid && noDuplicate;
    const confidence =
      ((amountMatches ? 0.4 : 0) +
        (receiverMatches ? 0.2 : 0) +
        (referenceValid ? 0.2 : 0) +
        (noDuplicate ? 0.2 : 0)) *
      ocrConfidence;

    return {
      allPassed,
      confidence,
      amountMatches,
      receiverMatches,
      referenceValid,
      noDuplicate,
    };
  }

  private async createNotification(
    merchantId: string,
    data: {
      type: string;
      title: string;
      message: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO notifications (
           merchant_id, type, title, title_ar, message, message_ar, data, priority, channels, created_at
         )
         VALUES ($1, 'SYSTEM_ALERT', $2, $2, $3, $3, $4::jsonb, 'MEDIUM', '{"IN_APP"}', NOW())`,
        [
          merchantId,
          data.title,
          data.message,
          JSON.stringify({ kind: data.type, ...(data.metadata || {}) }),
        ],
      );
    } catch (error) {
      this.logger.warn(
        `Failed to create notification: ${(error as Error).message}`,
      );
    }
  }

  private generateLinkCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // ===== Core Finance Handlers =====

  /**
   * Process a payment — records a payment against an order.
   * For payment-link flows use auto_create_payment_link instead.
   * This handles manual / cash / bank-transfer / VodafoneCash reconciliation.
   */
  async processPayment(input: unknown): Promise<Record<string, unknown>> {
    const { orderId, merchantId, amount, method, referenceNumber, notes } =
      input as {
        orderId: string;
        merchantId: string;
        amount: number;
        method?: string;
        referenceNumber?: string;
        notes?: string;
      };

    if (!orderId || !merchantId || !amount) {
      return {
        action: "FAILED",
        message: "orderId, merchantId, and amount are required",
      };
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Verify order exists and belongs to merchant
      const orderResult = await client.query(
        `SELECT id, total, payment_status FROM orders WHERE id = $1 AND merchant_id = $2`,
        [orderId, merchantId],
      );
      if (orderResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return { action: "FAILED", message: "Order not found" };
      }

      const order = orderResult.rows[0];
      if (order.payment_status === "PAID") {
        await client.query("ROLLBACK");
        return { action: "SKIPPED", message: "Order is already paid" };
      }

      // Record the payment
      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await client.query(
        `INSERT INTO payment_proofs (id, merchant_id, order_id, amount, payment_method, reference_number, notes, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'VERIFIED', NOW())
         ON CONFLICT DO NOTHING`,
        [
          paymentId,
          merchantId,
          orderId,
          amount,
          method || "MANUAL",
          referenceNumber || null,
          notes || null,
        ],
      );

      // Update order payment status
      await client.query(
        `UPDATE orders SET payment_status = 'PAID', payment_method = $1, updated_at = NOW() WHERE id = $2`,
        [method || "MANUAL", orderId],
      );

      await client.query("COMMIT");

      this.logger.log(`Payment processed: ${paymentId} for order ${orderId}`);
      return {
        action: "PAYMENT_RECORDED",
        paymentId,
        orderId,
        amount,
        method: method || "MANUAL",
        message: `تم تسجيل دفعة ${amount} جنيه للطلب ${orderId}`,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      this.logger.error(`processPayment failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    } finally {
      client.release();
    }
  }

  /**
   * Generate an invoice for an order — produces a structured invoice object
   * with line items, tax, totals, and merchant details.
   */
  async generateInvoice(input: unknown): Promise<Record<string, unknown>> {
    const { orderId, merchantId } = input as {
      orderId: string;
      merchantId: string;
    };

    if (!orderId || !merchantId) {
      return {
        action: "FAILED",
        message: "orderId and merchantId are required",
      };
    }

    try {
      // Fetch order with items
      const orderResult = await this.pool.query(
        `SELECT o.id, o.order_number, o.total as total_amount, 'EGP' as currency, o.status, o.payment_status,
                o.payment_method, o.customer_name, o.customer_phone, o.delivery_address as shipping_address,
                o.delivery_notes as notes, o.created_at
         FROM orders o WHERE o.id = $1 AND o.merchant_id = $2`,
        [orderId, merchantId],
      );
      if (orderResult.rows.length === 0) {
        return { action: "FAILED", message: "Order not found" };
      }
      const order = orderResult.rows[0];

      // Fetch line items
      const itemsResult = await this.pool.query(
        `SELECT oi.product_name, oi.variant_name, oi.quantity, oi.unit_price, oi.total_price, oi.sku
         FROM order_items oi WHERE oi.order_id = $1 ORDER BY oi.created_at`,
        [orderId],
      );

      // Fetch merchant details
      const merchantResult = await this.pool.query(
        `SELECT business_name, phone, currency, address FROM merchants WHERE id = $1`,
        [merchantId],
      );
      const merchant = merchantResult.rows[0] || {};

      const invoiceNumber = `INV-${order.order_number || orderId.substring(0, 8).toUpperCase()}`;
      const subtotal = itemsResult.rows.reduce(
        (sum: number, item: any) => sum + parseFloat(item.total_price || 0),
        0,
      );
      const tax = 0; // Egypt VAT can be added here when needed
      const total = parseFloat(order.total_amount) || subtotal;

      return {
        action: "INVOICE_GENERATED",
        invoice: {
          invoiceNumber,
          date: order.created_at,
          merchant: {
            name: merchant.business_name || "N/A",
            phone: merchant.phone || "",
            address: merchant.address || "",
          },
          customer: {
            name: order.customer_name || "عميل",
            phone: order.customer_phone || "",
            address: order.shipping_address || "",
          },
          items: itemsResult.rows.map((item: any) => ({
            name: item.product_name,
            variant: item.variant_name,
            sku: item.sku,
            quantity: parseInt(item.quantity),
            unitPrice: parseFloat(item.unit_price),
            total: parseFloat(item.total_price),
          })),
          subtotal,
          tax,
          total,
          currency: order.currency || merchant.currency || "EGP",
          paymentStatus: order.payment_status,
          paymentMethod: order.payment_method,
          notes: order.notes,
        },
        message: `فاتورة ${invoiceNumber} - ${total} ${order.currency || "EGP"}`,
      };
    } catch (error) {
      this.logger.error(`generateInvoice failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Calculate platform fees for a merchant based on their plan and transaction volume.
   * Returns fee breakdown: platform %, payment-gateway %, total for period.
   */
  async calculateFees(input: unknown): Promise<Record<string, unknown>> {
    const { merchantId, periodDays } = input as {
      merchantId: string;
      periodDays?: number;
    };

    if (!merchantId) {
      return { action: "FAILED", message: "merchantId is required" };
    }

    const days = Math.max(1, Math.min(365, parseInt(String(periodDays || 30))));
    try {
      // Get merchant plan
      const merchantResult = await this.pool.query(
        `SELECT plan, currency FROM merchants WHERE id = $1`,
        [merchantId],
      );
      if (merchantResult.rows.length === 0) {
        return { action: "FAILED", message: "Merchant not found" };
      }
      const plan = merchantResult.rows[0].plan || "STARTER";
      const currency = merchantResult.rows[0].currency || "EGP";

      // Platform fee schedule by plan
      const FEE_SCHEDULE: Record<string, number> = {
        FREE: 0,
        STARTER: 0, // subscription-only, no transaction fee
        GROWTH: 0,
        PRO: 0,
        ENTERPRISE: 0,
        CUSTOM: 0,
      };
      const platformFeePct = FEE_SCHEDULE[plan] ?? 0;

      // Payment gateway fee (InstaPay / VodafoneCash typical ~1%)
      const gatewayFeePct = 1.0;

      // Transaction volume in period
      const txResult = await this.pool.query(
        `SELECT COUNT(*) as tx_count, COALESCE(SUM(total_amount), 0) as total_volume
         FROM orders
         WHERE merchant_id = $1 AND payment_status = 'PAID'
           AND created_at >= NOW() - make_interval(days := $2)`,
        [merchantId, days],
      );
      const volume = parseFloat(txResult.rows[0].total_volume) || 0;
      const txCount = parseInt(txResult.rows[0].tx_count) || 0;

      const platformFee =
        Math.round(volume * (platformFeePct / 100) * 100) / 100;
      const gatewayFee = Math.round(volume * (gatewayFeePct / 100) * 100) / 100;

      return {
        action: "FEES_CALCULATED",
        fees: {
          periodDays: days,
          plan,
          transactionCount: txCount,
          totalVolume: volume,
          platformFeePct,
          platformFee,
          gatewayFeePct,
          gatewayFee,
          totalFees: platformFee + gatewayFee,
          currency,
        },
        message: `رسوم الفترة (${days} يوم): ${platformFee + gatewayFee} ${currency} على حجم ${volume} ${currency}`,
      };
    } catch (error) {
      this.logger.error(`calculateFees failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Reconcile transactions — matches payment proofs against orders
   * and flags discrepancies.
   */
  async reconcileTransactions(
    input: unknown,
  ): Promise<Record<string, unknown>> {
    const { merchantId, periodDays } = input as {
      merchantId: string;
      periodDays?: number;
    };

    if (!merchantId) {
      return { action: "FAILED", message: "merchantId is required" };
    }

    const days = Math.max(1, Math.min(365, parseInt(String(periodDays || 7))));
    try {
      // Orders marked PAID but no matching proof
      const missingProofs = await this.pool.query(
        `SELECT o.id, o.order_number, o.total_amount, o.payment_method, o.created_at
         FROM orders o
         WHERE o.merchant_id = $1
           AND o.payment_status = 'PAID'
           AND o.created_at >= NOW() - make_interval(days := $2)
           AND NOT EXISTS (
             SELECT 1 FROM payment_proofs pp WHERE pp.order_id = o.id AND pp.status = 'VERIFIED'
           )`,
        [merchantId, days],
      );

      // Proofs that don't match any order amount
      const amountMismatches = await this.pool.query(
        `SELECT pp.id as proof_id, pp.order_id, pp.amount as proof_amount,
                o.total_amount as order_amount,
                ABS(pp.amount - o.total_amount) as difference
         FROM payment_proofs pp
         JOIN orders o ON o.id = pp.order_id
         WHERE pp.merchant_id = $1
           AND pp.created_at >= NOW() - make_interval(days := $2)
           AND pp.status = 'VERIFIED'
           AND ABS(pp.amount - o.total_amount) > 1`,
        [merchantId, days],
      );

      // Summary
      const summaryResult = await this.pool.query(
        `SELECT
           COUNT(DISTINCT o.id) as total_orders,
           COUNT(DISTINCT pp.id) as total_proofs,
           COALESCE(SUM(DISTINCT o.total_amount), 0) as order_total,
           COALESCE(SUM(DISTINCT pp.amount), 0) as proof_total
         FROM orders o
         LEFT JOIN payment_proofs pp ON pp.order_id = o.id AND pp.status = 'VERIFIED'
         WHERE o.merchant_id = $1
           AND o.payment_status = 'PAID'
           AND o.created_at >= NOW() - make_interval(days := $2)`,
        [merchantId, days],
      );
      const summary = summaryResult.rows[0];

      return {
        action: "RECONCILIATION_COMPLETE",
        reconciliation: {
          periodDays: days,
          totalOrders: parseInt(summary.total_orders),
          totalProofs: parseInt(summary.total_proofs),
          orderTotal: parseFloat(summary.order_total),
          proofTotal: parseFloat(summary.proof_total),
          discrepancy: Math.abs(
            parseFloat(summary.order_total) - parseFloat(summary.proof_total),
          ),
          missingProofs: missingProofs.rows.map((r: any) => ({
            orderId: r.id,
            orderNumber: r.order_number,
            amount: parseFloat(r.total_amount),
            method: r.payment_method,
            date: r.created_at,
          })),
          amountMismatches: amountMismatches.rows.map((r: any) => ({
            proofId: r.proof_id,
            orderId: r.order_id,
            proofAmount: parseFloat(r.proof_amount),
            orderAmount: parseFloat(r.order_amount),
            difference: parseFloat(r.difference),
          })),
        },
        message: `مطابقة ${days} يوم: ${missingProofs.rows.length} طلب بدون إثبات، ${amountMismatches.rows.length} فرق مبلغ`,
      };
    } catch (error) {
      this.logger.error(
        `reconcileTransactions failed: ${(error as Error).message}`,
      );
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  // ============================================================================
  // TAX REPORT — VAT 14% (EGYPT)
  // ============================================================================

  /**
   * Generate tax report for a given period with VAT 14% calculations
   */
  async generateTaxReport(input: {
    merchantId: string;
    periodStart: string;
    periodEnd: string;
    includeExempt?: boolean;
  }): Promise<Record<string, unknown>> {
    try {
      const VAT_RATE = 0.14;

      // Get merchant tax config
      const configResult = await this.pool.query(
        `SELECT * FROM merchant_tax_config WHERE merchant_id = $1 LIMIT 1`,
        [input.merchantId],
      );
      const taxConfig = configResult.rows[0];
      const effectiveVatRate = taxConfig?.vat_rate
        ? parseFloat(taxConfig.vat_rate) / 100
        : VAT_RATE;

      // Get all completed orders in period
      const ordersResult = await this.pool.query(
        `SELECT
           COUNT(*) as total_orders,
           COALESCE(SUM(total_amount), 0) as gross_revenue,
           COALESCE(SUM(CASE WHEN discount_amount > 0 THEN discount_amount ELSE 0 END), 0) as total_discounts
         FROM orders
         WHERE merchant_id = $1
           AND status IN ('DELIVERED', 'COMPLETED')
           AND created_at >= $2 AND created_at < $3`,
        [input.merchantId, input.periodStart, input.periodEnd],
      );
      const orders = ordersResult.rows[0];

      const grossRevenue = parseFloat(orders.gross_revenue);
      const totalDiscounts = parseFloat(orders.total_discounts);
      const netRevenue = grossRevenue - totalDiscounts;
      const vatOnSales = Math.round(netRevenue * effectiveVatRate * 100) / 100;

      // Get expenses (deductible VAT on purchases)
      const expensesResult = await this.pool.query(
        `SELECT
           COALESCE(SUM(amount), 0) as total_expenses
         FROM expenses
         WHERE merchant_id = $1
           AND date >= $2 AND date < $3
           AND status != 'REJECTED'`,
        [input.merchantId, input.periodStart, input.periodEnd],
      );
      const totalExpenses = parseFloat(expensesResult.rows[0].total_expenses);
      const vatOnPurchases =
        Math.round(totalExpenses * effectiveVatRate * 100) / 100;

      // Refunds in period (reduce tax liability)
      const refundsResult = await this.pool.query(
        `SELECT
           COUNT(*) as total_refunds,
           COALESCE(SUM(amount), 0) as refund_total
         FROM refunds
         WHERE merchant_id = $1
           AND created_at >= $2 AND created_at < $3
           AND status = 'APPROVED'`,
        [input.merchantId, input.periodStart, input.periodEnd],
      );
      const refundTotal = parseFloat(refundsResult.rows[0].refund_total);
      const vatOnRefunds =
        Math.round(refundTotal * effectiveVatRate * 100) / 100;

      const netVatPayable =
        Math.round((vatOnSales - vatOnPurchases - vatOnRefunds) * 100) / 100;

      // Store tax report
      await this.pool.query(
        `INSERT INTO tax_reports (merchant_id, period_start, period_end, gross_revenue, net_revenue, vat_collected, expenses_vat, refunds_vat, net_vat_payable, vat_rate, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'GENERATED')
         ON CONFLICT (merchant_id, period_start, period_end) DO UPDATE SET
           gross_revenue = EXCLUDED.gross_revenue, net_revenue = EXCLUDED.net_revenue,
           vat_collected = EXCLUDED.vat_collected, expenses_vat = EXCLUDED.expenses_vat,
           refunds_vat = EXCLUDED.refunds_vat, net_vat_payable = EXCLUDED.net_vat_payable,
           updated_at = NOW()`,
        [
          input.merchantId,
          input.periodStart,
          input.periodEnd,
          grossRevenue,
          netRevenue,
          vatOnSales,
          vatOnPurchases,
          vatOnRefunds,
          netVatPayable,
          effectiveVatRate * 100,
        ],
      );

      return {
        action: "TAX_REPORT_GENERATED",
        report: {
          period: { start: input.periodStart, end: input.periodEnd },
          vatRate: `${effectiveVatRate * 100}%`,
          totalOrders: parseInt(orders.total_orders),
          grossRevenue,
          totalDiscounts,
          netRevenue,
          vatOnSales,
          totalExpenses,
          vatOnPurchases,
          refundTotal,
          vatOnRefunds,
          netVatPayable,
          taxRegistrationNo: taxConfig?.tax_registration_no || null,
        },
        message: `تقرير ضريبي ${input.periodStart} إلى ${input.periodEnd}: ضريبة مستحقة ${netVatPayable} ج.م`,
      };
    } catch (error) {
      this.logger.error(
        `generateTaxReport failed: ${(error as Error).message}`,
      );
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  // ============================================================================
  // CASH FLOW FORECASTING
  // ============================================================================

  /**
   * Forecast cash flow for the next N days based on historical data
   */
  async forecastCashFlow(input: {
    merchantId: string;
    forecastDays?: number;
  }): Promise<Record<string, unknown>> {
    try {
      const forecastDays = input.forecastDays || 30;

      // 1. Get historical daily revenue (last 90 days)
      const revenueHistory = await this.pool.query(
        `SELECT DATE(created_at) as day,
                SUM(total_amount) as revenue,
                COUNT(*) as order_count
         FROM orders
         WHERE merchant_id = $1
           AND status IN ('DELIVERED', 'COMPLETED')
           AND created_at >= NOW() - INTERVAL '90 days'
         GROUP BY DATE(created_at)
         ORDER BY day`,
        [input.merchantId],
      );

      // 2. Get historical daily expenses (last 90 days)
      const expenseHistory = await this.pool.query(
        `SELECT DATE(date) as day,
                SUM(amount) as expenses
         FROM expenses
         WHERE merchant_id = $1
           AND date >= NOW() - INTERVAL '90 days'
           AND status != 'REJECTED'
         GROUP BY DATE(date)
         ORDER BY day`,
        [input.merchantId],
      );

      // 3. Calculate averages (weekly cycles for day-of-week patterns)
      const revenueByDow: Record<number, number[]> = {};
      for (const r of revenueHistory.rows) {
        const dow = new Date(r.day).getDay();
        if (!revenueByDow[dow]) revenueByDow[dow] = [];
        revenueByDow[dow].push(parseFloat(r.revenue));
      }

      const avgRevenueByDow: Record<number, number> = {};
      for (const dow in revenueByDow) {
        const values = revenueByDow[dow];
        avgRevenueByDow[dow] =
          values.reduce((s, v) => s + v, 0) / values.length;
      }

      const expenseMap = new Map<string, number>();
      for (const e of expenseHistory.rows) {
        expenseMap.set(e.day, parseFloat(e.expenses));
      }
      const avgDailyExpense =
        expenseHistory.rows.length > 0
          ? expenseHistory.rows.reduce(
              (s: number, e: any) => s + parseFloat(e.expenses),
              0,
            ) / 90
          : 0;

      // 4. Overall averages for fallback
      const overallAvgDailyRevenue =
        revenueHistory.rows.length > 0
          ? revenueHistory.rows.reduce(
              (s: number, r: any) => s + parseFloat(r.revenue),
              0,
            ) / 90
          : 0;

      // 5. Build forecast
      const forecast: Array<{
        date: string;
        projectedRevenue: number;
        projectedExpenses: number;
        netCashFlow: number;
      }> = [];
      let cumulativeNet = 0;
      const today = new Date();

      for (let i = 1; i <= forecastDays; i++) {
        const forecastDate = new Date(today);
        forecastDate.setDate(today.getDate() + i);
        const dow = forecastDate.getDay();

        const projectedRevenue =
          Math.round((avgRevenueByDow[dow] || overallAvgDailyRevenue) * 100) /
          100;
        const projectedExpenses = Math.round(avgDailyExpense * 100) / 100;
        const net =
          Math.round((projectedRevenue - projectedExpenses) * 100) / 100;
        cumulativeNet += net;

        forecast.push({
          date: forecastDate.toISOString().split("T")[0],
          projectedRevenue,
          projectedExpenses,
          netCashFlow: net,
        });
      }

      // 6. Store forecast
      await this.pool
        .query(
          `INSERT INTO cash_flow_forecasts (merchant_id, forecast_date, projected_income, projected_expenses, net_cash_flow, confidence_level)
         SELECT $1, f.date::date, f.revenue, f.expenses, f.net, 'MEDIUM'
         FROM UNNEST($2::date[], $3::numeric[], $4::numeric[], $5::numeric[]) AS f(date, revenue, expenses, net)
         ON CONFLICT DO NOTHING`,
          [
            input.merchantId,
            forecast.map((f) => f.date),
            forecast.map((f) => f.projectedRevenue),
            forecast.map((f) => f.projectedExpenses),
            forecast.map((f) => f.netCashFlow),
          ],
        )
        .catch((e) =>
          this.logger.warn(`Cash flow forecast storage failed: ${e.message}`),
        );

      // 7. Key insights
      const weeklyRevenue = forecast
        .slice(0, 7)
        .reduce((s, f) => s + f.projectedRevenue, 0);
      const monthlyRevenue = forecast.reduce(
        (s, f) => s + f.projectedRevenue,
        0,
      );
      const lowestDay = forecast.reduce(
        (min, f) => (f.netCashFlow < min.netCashFlow ? f : min),
        forecast[0],
      );
      const bestDay = forecast.reduce(
        (max, f) => (f.netCashFlow > max.netCashFlow ? f : max),
        forecast[0],
      );

      return {
        action: "CASH_FLOW_FORECAST",
        forecast,
        summary: {
          forecastDays,
          projectedMonthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
          projectedMonthlyExpenses:
            Math.round(
              forecast.reduce((s, f) => s + f.projectedExpenses, 0) * 100,
            ) / 100,
          projectedNetCashFlow: Math.round(cumulativeNet * 100) / 100,
          bestDay: { date: bestDay.date, net: bestDay.netCashFlow },
          worstDay: { date: lowestDay.date, net: lowestDay.netCashFlow },
          weeklyAvgRevenue: Math.round(weeklyRevenue * 100) / 100,
          confidenceLevel:
            revenueHistory.rows.length >= 60
              ? "HIGH"
              : revenueHistory.rows.length >= 30
                ? "MEDIUM"
                : "LOW",
        },
        message: `توقعات ${forecastDays} يوم: إيرادات متوقعة ${Math.round(monthlyRevenue)} ج.م، صافي ${Math.round(cumulativeNet)} ج.م`,
      };
    } catch (error) {
      this.logger.error(`forecastCashFlow failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  // ============================================================================
  // DISCOUNT IMPACT ANALYSIS
  // ============================================================================

  /**
   * Analyze impact of discounts on revenue and profitability
   */
  async analyzeDiscountImpact(input: {
    merchantId: string;
    periodDays?: number;
  }): Promise<Record<string, unknown>> {
    try {
      const days = Math.max(
        1,
        Math.min(365, parseInt(String(input.periodDays || 30))),
      );

      // Orders with discounts vs without
      const comparison = await this.pool.query(
        `SELECT
           CASE WHEN discount_amount > 0 THEN 'DISCOUNTED' ELSE 'FULL_PRICE' END as category,
           COUNT(*) as order_count,
           COALESCE(SUM(total_amount), 0) as revenue,
           COALESCE(AVG(total_amount), 0) as avg_order_value,
           COALESCE(SUM(discount_amount), 0) as total_discount
         FROM orders
         WHERE merchant_id = $1
           AND status IN ('DELIVERED', 'COMPLETED')
           AND created_at >= NOW() - make_interval(days := $2)
         GROUP BY CASE WHEN discount_amount > 0 THEN 'DISCOUNTED' ELSE 'FULL_PRICE' END`,
        [input.merchantId, days],
      );

      // By discount type
      const byType = await this.pool.query(
        `SELECT
           COALESCE(discount_type, 'NONE') as discount_type,
           COUNT(*) as order_count,
           SUM(total_amount) as revenue,
           SUM(discount_amount) as total_discount,
           AVG(total_amount) as avg_order_value
         FROM orders
         WHERE merchant_id = $1
           AND status IN ('DELIVERED', 'COMPLETED')
           AND created_at >= NOW() - make_interval(days := $2)
           AND discount_amount > 0
         GROUP BY discount_type
         ORDER BY total_discount DESC`,
        [input.merchantId, days],
      );

      // By discount code
      const byCode = await this.pool.query(
        `SELECT
           COALESCE(discount_code, 'NO_CODE') as discount_code,
           COUNT(*) as order_count,
           SUM(total_amount) as revenue,
           SUM(discount_amount) as total_discount,
           AVG(total_amount) as avg_order_value,
           COUNT(DISTINCT customer_phone) as unique_customers
         FROM orders
         WHERE merchant_id = $1
           AND status IN ('DELIVERED', 'COMPLETED')
           AND created_at >= NOW() - make_interval(days := $2)
           AND discount_amount > 0
         GROUP BY discount_code
         ORDER BY total_discount DESC
         LIMIT 20`,
        [input.merchantId, days],
      );

      // Conversion comparison
      const discountedRow = comparison.rows.find(
        (r: any) => r.category === "DISCOUNTED",
      );
      const fullPriceRow = comparison.rows.find(
        (r: any) => r.category === "FULL_PRICE",
      );

      const discountedOrders = parseInt(discountedRow?.order_count || "0");
      const fullPriceOrders = parseInt(fullPriceRow?.order_count || "0");
      const totalDiscount = parseFloat(discountedRow?.total_discount || "0");
      const discountedRevenue = parseFloat(discountedRow?.revenue || "0");
      const fullPriceRevenue = parseFloat(fullPriceRow?.revenue || "0");
      const totalRevenue = discountedRevenue + fullPriceRevenue;

      return {
        action: "DISCOUNT_IMPACT_ANALYSIS",
        analysis: {
          period: `${days} days`,
          overview: {
            totalOrders: discountedOrders + fullPriceOrders,
            discountedOrders,
            fullPriceOrders,
            discountedPct:
              totalRevenue > 0
                ? Math.round(
                    (discountedOrders / (discountedOrders + fullPriceOrders)) *
                      100,
                  )
                : 0,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalDiscount: Math.round(totalDiscount * 100) / 100,
            revenueWithoutDiscount:
              Math.round((totalRevenue + totalDiscount) * 100) / 100,
            discountToRevenuePct:
              totalRevenue > 0
                ? Math.round(
                    (totalDiscount / (totalRevenue + totalDiscount)) * 10000,
                  ) / 100
                : 0,
          },
          avgOrderValue: {
            discounted:
              Math.round(
                parseFloat(discountedRow?.avg_order_value || "0") * 100,
              ) / 100,
            fullPrice:
              Math.round(
                parseFloat(fullPriceRow?.avg_order_value || "0") * 100,
              ) / 100,
          },
          byType: byType.rows.map((r: any) => ({
            type: r.discount_type,
            orders: parseInt(r.order_count),
            discount: Math.round(parseFloat(r.total_discount) * 100) / 100,
            avgOrderValue:
              Math.round(parseFloat(r.avg_order_value) * 100) / 100,
          })),
          byCode: byCode.rows.map((r: any) => ({
            code: r.discount_code,
            orders: parseInt(r.order_count),
            uniqueCustomers: parseInt(r.unique_customers),
            discount: Math.round(parseFloat(r.total_discount) * 100) / 100,
            revenue: Math.round(parseFloat(r.revenue) * 100) / 100,
          })),
        },
        message: `تحليل خصومات ${days} يوم: ${discountedOrders} طلب مخصوم (${Math.round(totalDiscount)} ج.م خصم)`,
      };
    } catch (error) {
      this.logger.error(
        `analyzeDiscountImpact failed: ${(error as Error).message}`,
      );
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  // ============================================================================
  // REVENUE PER CHANNEL
  // ============================================================================

  /**
   * Break down revenue by source channel (WhatsApp, Portal, API, etc.)
   */
  async getRevenueByChannel(input: {
    merchantId: string;
    periodDays?: number;
  }): Promise<Record<string, unknown>> {
    try {
      const days = Math.max(
        1,
        Math.min(365, parseInt(String(input.periodDays || 30))),
      );

      const result = await this.pool.query(
        `SELECT
           COALESCE(source_channel, 'WHATSAPP') as channel,
           COUNT(*) as order_count,
           SUM(total_amount) as revenue,
           AVG(total_amount) as avg_order_value,
           COUNT(DISTINCT customer_phone) as unique_customers,
           SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
           SUM(CASE WHEN payment_status = 'PAID' THEN total_amount ELSE 0 END) as collected_revenue
         FROM orders
         WHERE merchant_id = $1
           AND created_at >= NOW() - make_interval(days := $2)
         GROUP BY COALESCE(source_channel, 'WHATSAPP')
         ORDER BY revenue DESC`,
        [input.merchantId, days],
      );

      // Daily trend per channel
      const dailyTrend = await this.pool.query(
        `SELECT
           DATE(created_at) as day,
           COALESCE(source_channel, 'WHATSAPP') as channel,
           COUNT(*) as orders,
           SUM(total_amount) as revenue
         FROM orders
         WHERE merchant_id = $1
           AND created_at >= NOW() - make_interval(days := $2)
           AND status IN ('DELIVERED', 'COMPLETED')
         GROUP BY DATE(created_at), COALESCE(source_channel, 'WHATSAPP')
         ORDER BY day`,
        [input.merchantId, days],
      );

      const totalRevenue = result.rows.reduce(
        (s: number, r: any) => s + parseFloat(r.revenue || "0"),
        0,
      );

      return {
        action: "REVENUE_BY_CHANNEL",
        channels: result.rows.map((r: any) => ({
          channel: r.channel,
          orders: parseInt(r.order_count),
          revenue: Math.round(parseFloat(r.revenue) * 100) / 100,
          revenuePct:
            totalRevenue > 0
              ? Math.round((parseFloat(r.revenue) / totalRevenue) * 10000) / 100
              : 0,
          avgOrderValue: Math.round(parseFloat(r.avg_order_value) * 100) / 100,
          uniqueCustomers: parseInt(r.unique_customers),
          cancelledOrders: parseInt(r.cancelled),
          collectedRevenue:
            Math.round(parseFloat(r.collected_revenue) * 100) / 100,
          collectionRate:
            parseFloat(r.revenue) > 0
              ? Math.round(
                  (parseFloat(r.collected_revenue) / parseFloat(r.revenue)) *
                    10000,
                ) / 100
              : 0,
        })),
        dailyTrend: dailyTrend.rows.map((r: any) => ({
          date: r.day,
          channel: r.channel,
          orders: parseInt(r.orders),
          revenue: parseFloat(r.revenue),
        })),
        summary: {
          periodDays: days,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          channelCount: result.rows.length,
          topChannel: result.rows[0]?.channel || "N/A",
        },
        message: `إيرادات ${days} يوم حسب القناة: ${result.rows.map((r: any) => `${r.channel} ${Math.round(parseFloat(r.revenue))} ج.م`).join(", ")}`,
      };
    } catch (error) {
      this.logger.error(
        `getRevenueByChannel failed: ${(error as Error).message}`,
      );
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  // ============================================================================
  // REFUND TRACKING & ANALYSIS
  // ============================================================================

  /**
   * Full refund analysis with trends and breakdown
   */
  async getRefundAnalysis(input: {
    merchantId: string;
    periodDays?: number;
  }): Promise<Record<string, unknown>> {
    try {
      const days = Math.max(
        1,
        Math.min(365, parseInt(String(input.periodDays || 30))),
      );

      // Summary
      const summary = await this.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'APPROVED') as approved_refunds,
           COUNT(*) FILTER (WHERE status = 'PENDING') as pending_refunds,
           COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected_refunds,
           COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED'), 0) as total_refunded,
           COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0) as pending_amount,
           COALESCE(AVG(amount) FILTER (WHERE status = 'APPROVED'), 0) as avg_refund
         FROM refunds
         WHERE merchant_id = $1
           AND created_at >= NOW() - make_interval(days := $2)`,
        [input.merchantId, days],
      );

      // By reason
      const byReason = await this.pool.query(
        `SELECT
           COALESCE(reason, 'UNSPECIFIED') as reason,
           COUNT(*) as count,
           SUM(amount) as total_amount,
           AVG(amount) as avg_amount
         FROM refunds
         WHERE merchant_id = $1
           AND created_at >= NOW() - make_interval(days := $2)
           AND status = 'APPROVED'
         GROUP BY reason
         ORDER BY total_amount DESC`,
        [input.merchantId, days],
      );

      // By refund method
      const byMethod = await this.pool.query(
        `SELECT
           COALESCE(refund_method, 'WALLET') as refund_method,
           COUNT(*) as count,
           SUM(amount) as total_amount
         FROM refunds
         WHERE merchant_id = $1
           AND created_at >= NOW() - make_interval(days := $2)
           AND status = 'APPROVED'
         GROUP BY refund_method
         ORDER BY total_amount DESC`,
        [input.merchantId, days],
      );

      // Refund rate (refunds vs orders)
      const ordersCount = await this.pool.query(
        `SELECT COUNT(*) as total_orders, COALESCE(SUM(total_amount), 0) as total_revenue
         FROM orders
         WHERE merchant_id = $1
           AND created_at >= NOW() - make_interval(days := $2)
           AND status IN ('DELIVERED', 'COMPLETED')`,
        [input.merchantId, days],
      );

      const totalOrders = parseInt(ordersCount.rows[0].total_orders);
      const totalRevenue = parseFloat(ordersCount.rows[0].total_revenue);
      const totalRefunded = parseFloat(summary.rows[0].total_refunded);

      // Top customers requesting refunds
      const topRefunders = await this.pool.query(
        `SELECT
           r.customer_id,
           c.name as customer_name,
           c.phone as customer_phone,
           COUNT(*) as refund_count,
           SUM(r.amount) as total_refunded
         FROM refunds r
         LEFT JOIN customers c ON c.id = r.customer_id
         WHERE r.merchant_id = $1
           AND r.created_at >= NOW() - make_interval(days := $2)
           AND r.status = 'APPROVED'
           AND r.customer_id IS NOT NULL
         GROUP BY r.customer_id, c.name, c.phone
         HAVING COUNT(*) > 1
         ORDER BY total_refunded DESC
         LIMIT 10`,
        [input.merchantId, days],
      );

      return {
        action: "REFUND_ANALYSIS",
        analysis: {
          period: `${days} days`,
          summary: {
            approvedRefunds: parseInt(summary.rows[0].approved_refunds),
            pendingRefunds: parseInt(summary.rows[0].pending_refunds),
            rejectedRefunds: parseInt(summary.rows[0].rejected_refunds),
            totalRefunded: Math.round(totalRefunded * 100) / 100,
            pendingAmount:
              Math.round(parseFloat(summary.rows[0].pending_amount) * 100) /
              100,
            avgRefund:
              Math.round(parseFloat(summary.rows[0].avg_refund) * 100) / 100,
            refundRate:
              totalOrders > 0
                ? Math.round(
                    (parseInt(summary.rows[0].approved_refunds) / totalOrders) *
                      10000,
                  ) / 100
                : 0,
            refundToRevenuePct:
              totalRevenue > 0
                ? Math.round((totalRefunded / totalRevenue) * 10000) / 100
                : 0,
          },
          byReason: byReason.rows.map((r: any) => ({
            reason: r.reason,
            count: parseInt(r.count),
            totalAmount: Math.round(parseFloat(r.total_amount) * 100) / 100,
          })),
          byMethod: byMethod.rows.map((r: any) => ({
            method: r.refund_method,
            count: parseInt(r.count),
            totalAmount: Math.round(parseFloat(r.total_amount) * 100) / 100,
          })),
          repeatRefunders: topRefunders.rows.map((r: any) => ({
            customerId: r.customer_id,
            name: r.customer_name,
            phone: r.customer_phone,
            refundCount: parseInt(r.refund_count),
            totalRefunded: Math.round(parseFloat(r.total_refunded) * 100) / 100,
          })),
        },
        message: `تحليل استرجاع ${days} يوم: ${parseInt(summary.rows[0].approved_refunds)} استرجاع بقيمة ${Math.round(totalRefunded)} ج.م (${totalOrders > 0 ? Math.round((parseInt(summary.rows[0].approved_refunds) / totalOrders) * 100) : 0}% من الطلبات)`,
      };
    } catch (error) {
      this.logger.error(
        `getRefundAnalysis failed: ${(error as Error).message}`,
      );
      return { action: "FAILED", message: (error as Error).message };
    }
  }
}
