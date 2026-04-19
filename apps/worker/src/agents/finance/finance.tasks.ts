/**
 * Finance Agent Task Definitions
 * Phase 2 Finance Agent - Production Ready
 */

export interface ProcessPaymentInput {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
}

export interface GenerateInvoiceInput {
  orderId: string;
  merchantId: string;
  customerId: string;
}

export interface CheckBudgetInput {
  merchantId: string;
  amount: number;
  category?: string;
}

export interface PaymentProofReviewInput {
  proofId: string;
  merchantId: string;
}

export interface WeeklyCFOBriefInput {
  merchantId: string;
}

// ============================================================================
// COD RECONCILIATION TASKS (Growth+ Feature)
// ============================================================================

export interface CodStatementImportInput {
  merchantId: string;
  courierName: string;
  filename: string;
  statementDate: string;
  rows: Array<{
    trackingNumber?: string;
    orderNumber?: string;
    customerName?: string;
    collectedAmount?: number;
    deliveryFee?: number;
    codFee?: number;
    deliveryDate?: string;
    status?: string;
  }>;
}

export interface CodStatementImportOutput {
  action: "COD_STATEMENT_IMPORTED" | "FAILED";
  statementId?: string;
  summary?: {
    totalOrders: number;
    totalCollected: number;
    totalFees: number;
    netAmount: number;
    matchedOrders: number;
    unmatchedOrders: number;
    discrepancyCount: number;
  };
  discrepancies?: Array<{
    orderNumber: string;
    expected: number;
    reported: number;
    diff: number;
  }>;
}

export interface ScheduleCodRemindersInput {
  merchantId: string;
  daysPastDue?: number;
}

export interface ScheduleCodRemindersOutput {
  action: "REMINDERS_SCHEDULED";
  merchantId: string;
  scheduled: number;
}

// ============================================================================
// EXPENSE TRACKING TASKS (Starter+ Feature)
// ============================================================================

export interface RecordExpenseInput {
  merchantId: string;
  category: string;
  subcategory?: string;
  amount: number;
  description?: string;
  expenseDate?: string;
  isRecurring?: boolean;
  recurringDay?: number;
  receiptUrl?: string;
  createdBy?: string;
}

export interface RecordExpenseOutput {
  action: "EXPENSE_RECORDED";
  expenseId: string;
  category: string;
  amount: number;
}

export interface GetExpenseSummaryInput {
  merchantId: string;
  startDate: string;
  endDate: string;
}

export interface GetExpenseSummaryOutput {
  merchantId: string;
  period: { startDate: string; endDate: string };
  totals: { count: number; total: number };
  byCategory: Record<string, number>;
  breakdown: Array<{
    category: string;
    subcategory?: string;
    count: number;
    total: number;
  }>;
}

// ============================================================================
// MONTHLY CLOSE TASKS (Growth+ Feature)
// ============================================================================

export interface GenerateMonthlyCloseInput {
  merchantId: string;
  year: number;
  month: number;
}

export interface GenerateMonthlyCloseOutput {
  action: "MONTHLY_CLOSE_GENERATED";
  merchantId: string;
  period: { year: number; month: number };
  report: {
    revenue: { total: number; orders: number };
    cogs: number;
    grossProfit: number;
    grossMarginPct: number;
    expenses: { total: number; breakdown: Record<string, number> };
    netProfit: number;
    netMarginPct: number;
    cod: { expected: number; collected: number; outstanding: number };
    refunds: { count: number; total: number };
  };
}

// ============================================================================
// ACCOUNTANT PACK TASKS (Pro Feature)
// ============================================================================

export interface GenerateAccountantPackInput {
  merchantId: string;
  startDate: string;
  endDate: string;
  includes: Array<
    "orders" | "expenses" | "cod_reconciliation" | "inventory_movements"
  >;
}

export interface GenerateAccountantPackOutput {
  action: "ACCOUNTANT_PACK_GENERATED";
  merchantId: string;
  period: { startDate: string; endDate: string };
  generatedAt: string;
  sections: {
    orders?: { count: number; data: any[] };
    expenses?: { count: number; data: any[] };
    codReconciliation?: { count: number; data: any[] };
    inventoryMovements?: { count: number; data: any[] };
    monthlyCloses?: any[];
  };
}

// ============================================================================
// PAYMENT PROOF REQUEST TASKS
// ============================================================================

export interface RequestProofInput {
  merchantId: string;
  conversationId?: string;
  orderId?: string;
  paymentLinkId?: string;
  customerPhone?: string;
  amount?: number;
  paymentMethod?: "INSTAPAY" | "VODAFONE_CASH" | "BANK_TRANSFER";
}

export interface RequestProofOutput {
  action: "PROOF_REQUEST_CREATED";
  requestId: string;
  expiresAt: string;
}
