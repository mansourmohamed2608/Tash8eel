import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

export interface CommerceFinanceSummary {
  totalOrders: number;
  bookedOrders: number;
  realizedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  uniqueCustomers: number;
  bookedSales: number;
  realizedRevenue: number;
  deliveredRevenue: number;
  pendingCollections: number;
  pendingCod: number;
  pendingOnline: number;
  paidCashAmount: number;
  paidOnlineAmount: number;
  totalExpenses: number;
  refundsAmount: number;
  netCashFlow: number;
  averageOrderValue: number;
}

type ReportedOrder = {
  customerName: string;
  customerPhone: string;
  total: number;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  realizedAmount: number;
  paidCashAmount: number;
  paidOnlineAmount: number;
  outstandingAmount: number;
};

@Injectable()
export class CommerceFactsService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async buildFinanceSummary(
    merchantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<CommerceFinanceSummary> {
    return this.buildFinanceSummaryForScope(merchantId, startDate, endDate);
  }

  async buildPlatformFinanceSummary(
    startDate: Date,
    endDate: Date,
  ): Promise<CommerceFinanceSummary> {
    return this.buildFinanceSummaryForScope(null, startDate, endDate);
  }

  async buildBranchFinanceSummary(
    merchantId: string,
    branchId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<CommerceFinanceSummary> {
    return this.buildFinanceSummaryForScope(
      merchantId,
      startDate,
      endDate,
      branchId,
    );
  }

  private async buildFinanceSummaryForScope(
    merchantId: string | null,
    startDate: Date,
    endDate: Date,
    branchId?: string,
  ): Promise<CommerceFinanceSummary> {
    const [orders, totalExpenses, refundsAmount] = await Promise.all([
      this.loadReportedOrders(merchantId, startDate, endDate, branchId),
      this.getExpensesTotal(merchantId, startDate, endDate, branchId),
      this.getRefundsTotal(merchantId, startDate, endDate, branchId),
    ]);

    let bookedOrders = 0;
    let realizedOrders = 0;
    let deliveredOrders = 0;
    let cancelledOrders = 0;
    let bookedSales = 0;
    let realizedRevenue = 0;
    let deliveredRevenue = 0;
    let pendingCollections = 0;
    let pendingCod = 0;
    let pendingOnline = 0;
    let paidCashAmount = 0;
    let paidOnlineAmount = 0;
    const customerKeys = new Set<string>();

    for (const order of orders) {
      const paymentMethod = String(order.paymentMethod || "")
        .trim()
        .toUpperCase();
      const isDraft = this.isDraftOrder(order.status);
      const isCancelled = this.isCancelledOrder(order.status);
      const isCompleted = this.isCompletedOrder(order.status);
      const isBooked = !isDraft && !isCancelled;

      if (isBooked) {
        bookedOrders += 1;
        bookedSales += order.total;
      }
      if (isCancelled) cancelledOrders += 1;
      if (isCompleted) {
        deliveredOrders += 1;
        deliveredRevenue += order.total;
      }
      if (order.realizedAmount >= order.total - 0.009 && isBooked) {
        realizedOrders += 1;
      }

      realizedRevenue += order.realizedAmount;
      paidCashAmount += order.paidCashAmount;
      paidOnlineAmount += order.paidOnlineAmount;

      if (isBooked && order.outstandingAmount > 0) {
        pendingCollections += order.outstandingAmount;
        if (paymentMethod === "COD" || paymentMethod === "CASH") {
          pendingCod += order.outstandingAmount;
        } else {
          pendingOnline += order.outstandingAmount;
        }
      }

      const customerKey = order.customerPhone || order.customerName || "";
      if (customerKey && isBooked) {
        customerKeys.add(customerKey);
      }
    }

    const realizedRounded = this.roundMoney(realizedRevenue);
    const expensesRounded = this.roundMoney(totalExpenses);
    const refundsRounded = this.roundMoney(refundsAmount);

    return {
      totalOrders: orders.filter((order) => !this.isDraftOrder(order.status))
        .length,
      bookedOrders,
      realizedOrders,
      deliveredOrders,
      cancelledOrders,
      uniqueCustomers: customerKeys.size,
      bookedSales: this.roundMoney(bookedSales),
      realizedRevenue: realizedRounded,
      deliveredRevenue: this.roundMoney(deliveredRevenue),
      pendingCollections: this.roundMoney(pendingCollections),
      pendingCod: this.roundMoney(pendingCod),
      pendingOnline: this.roundMoney(pendingOnline),
      paidCashAmount: this.roundMoney(paidCashAmount),
      paidOnlineAmount: this.roundMoney(paidOnlineAmount),
      totalExpenses: expensesRounded,
      refundsAmount: refundsRounded,
      netCashFlow: this.roundMoney(
        realizedRounded - expensesRounded - refundsRounded,
      ),
      averageOrderValue:
        realizedOrders > 0
          ? this.roundMoney(realizedRounded / realizedOrders)
          : 0,
    };
  }

  private async loadReportedOrders(
    merchantId: string | null,
    startDate: Date,
    endDate: Date,
    branchId?: string,
  ): Promise<ReportedOrder[]> {
    const merchantFilter = merchantId ? `WHERE merchant_id = $1` : "";
    const paymentMerchantFilter = merchantId ? `WHERE merchant_id = $1` : "";
    const dateStartParam = merchantId ? 2 : 1;
    const dateEndParam = merchantId ? 3 : 2;
    const branchParam = merchantId ? 4 : 3;
    const params = merchantId
      ? branchId
        ? [merchantId, startDate, endDate, branchId]
        : [merchantId, startDate, endDate]
      : branchId
        ? [startDate, endDate, branchId]
        : [startDate, endDate];

    const result = await this.pool.query<{
      order_data: Record<string, any>;
      paid_amount: string;
      payment_rows: string;
      cash_paid: string;
      online_paid: string;
    }>(
      `SELECT
         to_jsonb(o) as order_data,
         COALESCE(pay.paid_amount, 0)::text as paid_amount,
         COALESCE(pay.payment_rows, 0)::text as payment_rows,
         COALESCE(pay.cash_paid, 0)::text as cash_paid,
         COALESCE(pay.online_paid, 0)::text as online_paid
       FROM orders o
       LEFT JOIN (
         SELECT
           order_id::text as order_id,
           COALESCE(SUM(amount) FILTER (
             WHERE UPPER(COALESCE(status, 'PAID')) = 'PAID'
           ), 0) as paid_amount,
           COUNT(*)::int as payment_rows,
           COALESCE(SUM(amount) FILTER (
             WHERE UPPER(COALESCE(status, 'PAID')) = 'PAID'
               AND UPPER(COALESCE(method, '')) = 'COD'
           ), 0) as cash_paid,
           COALESCE(SUM(amount) FILTER (
             WHERE UPPER(COALESCE(status, 'PAID')) = 'PAID'
               AND UPPER(COALESCE(method, '')) IN ('CARD', 'BANK_TRANSFER')
           ), 0) as online_paid
         FROM order_payments
         ${paymentMerchantFilter}
         GROUP BY order_id::text
       ) pay ON pay.order_id = o.id::text
       WHERE 1=1
         ${merchantId ? `AND o.merchant_id = $1` : ""}
         AND o.created_at >= $${dateStartParam}
         AND o.created_at <= $${dateEndParam}
         ${branchId ? `AND NULLIF(to_jsonb(o)->>'branch_id', '') = $${branchParam}` : ""}
       ORDER BY o.created_at DESC`,
      params,
    );

    return result.rows.map((row) => {
      const order = row.order_data || {};
      const total = this.roundMoney(
        Number(order.total || order.total_amount || 0),
      );
      const status = String(order.status || "");
      const paymentMethod = String(
        order.payment_method || order.paymentMethod || "",
      );
      const paymentStatus = String(
        order.payment_status || order.paymentStatus || "",
      )
        .trim()
        .toUpperCase();
      const paymentRows = Number(row.payment_rows || 0);
      const paidAmountFromRows = this.roundMoney(Number(row.paid_amount || 0));
      const realizedAmount =
        paymentRows > 0
          ? Math.min(total, paidAmountFromRows)
          : paymentStatus === "PAID" &&
              !this.isDraftOrder(status) &&
              !this.isCancelledOrder(status)
            ? total
            : 0;
      const normalizedPaymentMethod = paymentMethod.trim().toUpperCase();
      const paidCashAmount =
        paymentRows > 0
          ? this.roundMoney(Number(row.cash_paid || 0))
          : ["COD", "CASH"].includes(normalizedPaymentMethod) &&
              realizedAmount > 0
            ? realizedAmount
            : 0;
      const paidOnlineAmount =
        paymentRows > 0
          ? this.roundMoney(Number(row.online_paid || 0))
          : ["CARD", "BANK_TRANSFER", "TRANSFER"].includes(
                normalizedPaymentMethod,
              ) && realizedAmount > 0
            ? realizedAmount
            : 0;
      const outstandingAmount =
        !this.isDraftOrder(status) && !this.isCancelledOrder(status)
          ? this.roundMoney(Math.max(0, total - realizedAmount))
          : 0;

      return {
        customerName:
          String(order.customer_name || order.customerName || "عميل").trim() ||
          "عميل",
        customerPhone: String(
          order.customer_phone || order.customerPhone || "",
        ).trim(),
        total,
        status,
        paymentMethod,
        paymentStatus,
        realizedAmount,
        paidCashAmount,
        paidOnlineAmount,
        outstandingAmount,
      };
    });
  }

  private async getExpensesTotal(
    merchantId: string | null,
    startDate: Date,
    endDate: Date,
    branchId?: string,
  ): Promise<number> {
    try {
      const merchantFilter = merchantId ? `AND e.merchant_id = $1` : "";
      const dateStartParam = merchantId ? 2 : 1;
      const dateEndParam = merchantId ? 3 : 2;
      const branchParam = merchantId ? 4 : 3;
      const params = merchantId
        ? branchId
          ? [merchantId, startDate, endDate, branchId]
          : [merchantId, startDate, endDate]
        : branchId
          ? [startDate, endDate, branchId]
          : [startDate, endDate];
      const result = await this.pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text as total
         FROM expenses e
         WHERE 1=1
           ${merchantFilter}
           AND COALESCE(NULLIF(to_jsonb(e)->>'expense_date', '')::timestamp, e.created_at) >= $${dateStartParam}
           AND COALESCE(NULLIF(to_jsonb(e)->>'expense_date', '')::timestamp, e.created_at) <= $${dateEndParam}
           ${branchId ? `AND NULLIF(to_jsonb(e)->>'branch_id', '') = $${branchParam}` : ""}`,
        params,
      );
      return this.roundMoney(Number(result.rows[0]?.total || 0));
    } catch {
      return 0;
    }
  }

  private async getRefundsTotal(
    merchantId: string | null,
    startDate: Date,
    endDate: Date,
    branchId?: string,
  ): Promise<number> {
    try {
      const merchantFilter = merchantId ? `AND r.merchant_id = $1` : "";
      const dateStartParam = merchantId ? 2 : 1;
      const dateEndParam = merchantId ? 3 : 2;
      const branchParam = merchantId ? 4 : 3;
      const params = merchantId
        ? branchId
          ? [merchantId, startDate, endDate, branchId]
          : [merchantId, startDate, endDate]
        : branchId
          ? [startDate, endDate, branchId]
          : [startDate, endDate];
      const result = await this.pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text as total
         FROM refunds r
         WHERE 1=1
           ${merchantFilter}
           AND r.created_at >= $${dateStartParam}
           AND r.created_at <= $${dateEndParam}
           ${branchId ? `AND NULLIF(to_jsonb(r)->>'branch_id', '') = $${branchParam}` : ""}
           AND UPPER(COALESCE(r.status, 'APPROVED')) = 'APPROVED'`,
        params,
      );
      return this.roundMoney(Number(result.rows[0]?.total || 0));
    } catch {
      return 0;
    }
  }

  private normalizeOrderStatus(status: unknown): string {
    return String(status || "")
      .trim()
      .toUpperCase();
  }

  private isDraftOrder(status: unknown): boolean {
    return this.normalizeOrderStatus(status) === "DRAFT";
  }

  private isCancelledOrder(status: unknown): boolean {
    return ["CANCELLED", "RETURNED", "FAILED"].includes(
      this.normalizeOrderStatus(status),
    );
  }

  private isCompletedOrder(status: unknown): boolean {
    return ["DELIVERED", "COMPLETED"].includes(
      this.normalizeOrderStatus(status),
    );
  }

  private roundMoney(value: number): number {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }
}
