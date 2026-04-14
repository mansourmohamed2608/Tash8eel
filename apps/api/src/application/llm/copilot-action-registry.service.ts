import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  CopilotCommand,
  CopilotIntent,
  DESTRUCTIVE_INTENTS,
} from "./copilot-schema";
import { evaluateCopilotActionRisk } from "./copilot-risk-policy";
import {
  PlannerActionContract,
  PlannerCompensationMetadata,
} from "./planner-context.contract";

interface ActionRegistrySeed {
  preconditions: string[];
  compensationHints: string[];
  compensation: PlannerCompensationMetadata;
}

export interface ActionPreconditionResult {
  ok: boolean;
  failures: string[];
  advisories: string[];
  action: PlannerActionContract;
}

const READ_ONLY_COMPENSATION: PlannerCompensationMetadata = {
  strategy: "none",
  requiresManagerReview: false,
  runbookHints: [],
};

const REVERSE_COMPENSATION: PlannerCompensationMetadata = {
  strategy: "reverse_operation",
  requiresManagerReview: false,
  runbookHints: ["audit_before_reverse", "notify_shift_manager"],
};

const REVIEW_COMPENSATION: PlannerCompensationMetadata = {
  strategy: "manual_followup",
  requiresManagerReview: true,
  runbookHints: ["open_manual_review_case", "attach_action_context"],
};

const ACTION_REGISTRY_SEED: Record<CopilotIntent, ActionRegistrySeed> = {
  ADD_EXPENSE: {
    preconditions: ["expense.amount > 0"],
    compensationHints: ["create_reversal_expense", "annotate_month_close"],
    compensation: REVERSE_COMPENSATION,
  },
  ASK_EXPENSE_SUMMARY: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  CREATE_PAYMENT_LINK: {
    preconditions: ["paymentLink.amount > 0", "customerPhone exists"],
    compensationHints: ["disable_payment_link", "issue_refund"],
    compensation: REVERSE_COMPENSATION,
  },
  APPROVE_PAYMENT_PROOF: {
    preconditions: ["payment proof exists", "staff role >= ADMIN"],
    compensationHints: ["revoke_approval", "trigger_manual_review"],
    compensation: REVIEW_COMPENSATION,
  },
  ASK_COD_STATUS: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  CLOSE_MONTH: {
    preconditions: ["staff role >= ADMIN", "finance window locked"],
    compensationHints: ["reopen_month_with_audit"],
    compensation: REVIEW_COMPENSATION,
  },
  UPDATE_STOCK: {
    preconditions: [
      "stockUpdate has sku or productName",
      "stockUpdate has quantity delta or absolute quantity",
    ],
    compensationHints: ["create_inverse_stock_adjustment"],
    compensation: REVERSE_COMPENSATION,
  },
  ASK_LOW_STOCK: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  ASK_SHRINKAGE: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  IMPORT_SUPPLIER_CSV: {
    preconditions: ["staff role >= ADMIN", "csv validated"],
    compensationHints: ["archive_import_batch", "run_reverse_import"],
    compensation: REVIEW_COMPENSATION,
  },
  ASK_TOP_MOVERS: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  TAG_VIP: {
    preconditions: ["vipTag has customer identifier"],
    compensationHints: ["remove_vip"],
    compensation: REVERSE_COMPENSATION,
  },
  REMOVE_VIP: {
    preconditions: ["vipTag has customer identifier"],
    compensationHints: ["re_tag_vip"],
    compensation: REVERSE_COMPENSATION,
  },
  REORDER_LAST: {
    preconditions: ["customer exists with previous order"],
    compensationHints: ["cancel_created_order"],
    compensation: REVERSE_COMPENSATION,
  },
  ASK_HIGH_RISK: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  ASK_NEEDS_FOLLOWUP: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  ASK_RECOVERED_CARTS: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  CREATE_ORDER: {
    preconditions: ["order has at least one item"],
    compensationHints: ["cancel_created_order"],
    compensation: REVERSE_COMPENSATION,
  },
  ASK_KPI: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  ASK_REVENUE: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  ASK_ORDER_COUNT: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  UNKNOWN: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
  CLARIFY: {
    preconditions: [],
    compensationHints: [],
    compensation: READ_ONLY_COMPENSATION,
  },
};

@Injectable()
export class CopilotActionRegistryService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  listDefinitions(): PlannerActionContract[] {
    return Object.keys(ACTION_REGISTRY_SEED).map((key) =>
      this.getDefinition(key as CopilotIntent),
    );
  }

  getDefinition(intent: CopilotIntent): PlannerActionContract {
    const seed = ACTION_REGISTRY_SEED[intent] || {
      preconditions: [],
      compensationHints: [],
      compensation: READ_ONLY_COMPENSATION,
    };
    const riskProfile = evaluateCopilotActionRisk(intent);

    return {
      intent,
      destructive: DESTRUCTIVE_INTENTS.includes(intent),
      riskTier: riskProfile.tier,
      preconditions: seed.preconditions,
      compensationHints: seed.compensationHints,
      compensation: seed.compensation,
    };
  }

  async evaluatePreconditions(
    merchantId: string,
    command: CopilotCommand,
  ): Promise<ActionPreconditionResult> {
    const action = this.getDefinition(command.intent);
    const failures: string[] = [];
    const advisories: string[] = [];

    switch (command.intent) {
      case "ADD_EXPENSE": {
        const amount = Number(command.entities.expense?.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
          failures.push("expense.amount must be greater than zero");
        }
        if (amount >= 10000) {
          advisories.push(
            "Large expense amount detected; attach invoice in audit trail",
          );
        }
        break;
      }
      case "CREATE_PAYMENT_LINK": {
        const amount = Number(command.entities.paymentLink?.amount || 0);
        const phone = String(
          command.entities.paymentLink?.customerPhone || "",
        ).trim().length;
        if (!Number.isFinite(amount) || amount <= 0) {
          failures.push("paymentLink.amount must be greater than zero");
        }
        if (!phone) {
          failures.push("paymentLink.customerPhone is required");
        }
        break;
      }
      case "UPDATE_STOCK": {
        const sku = String(command.entities.stockUpdate?.sku || "").trim();
        const productName = String(
          command.entities.stockUpdate?.productName || "",
        ).trim();
        const quantityChange = command.entities.stockUpdate?.quantityChange;
        const absoluteQuantity = command.entities.stockUpdate?.absoluteQuantity;

        if (!sku && !productName) {
          failures.push("stockUpdate requires sku or productName");
        }

        if (
          quantityChange !== null &&
          quantityChange !== undefined &&
          !Number.isFinite(Number(quantityChange))
        ) {
          failures.push("stockUpdate.quantityChange must be numeric");
        }
        if (
          absoluteQuantity !== null &&
          absoluteQuantity !== undefined &&
          (!Number.isFinite(Number(absoluteQuantity)) ||
            Number(absoluteQuantity) < 0)
        ) {
          failures.push(
            "stockUpdate.absoluteQuantity must be a non-negative number",
          );
        }

        if (
          quantityChange === null &&
          quantityChange === undefined &&
          absoluteQuantity === null &&
          absoluteQuantity === undefined
        ) {
          failures.push(
            "stockUpdate requires quantityChange or absoluteQuantity",
          );
        }

        if (sku || productName) {
          const resolved = await this.resolveCatalogTargetExists(
            merchantId,
            sku,
            productName,
          );
          if (!resolved) {
            failures.push(
              "stockUpdate target item could not be resolved in catalog",
            );
          }
        }

        if (Math.abs(Number(quantityChange || 0)) >= 200) {
          advisories.push(
            "High-volume stock adjustment detected; keep manager audit note",
          );
        }
        break;
      }
      case "TAG_VIP":
      case "REMOVE_VIP": {
        const customerId = String(
          command.entities.vipTag?.customerId || "",
        ).trim();
        const customerPhone = String(
          command.entities.vipTag?.customerPhone || "",
        ).trim();
        const customerName = String(
          command.entities.vipTag?.customerName || "",
        ).trim();

        if (!customerId && !customerPhone && !customerName) {
          failures.push("vipTag requires customer identifier");
        } else {
          const customerExists = await this.customerExists(
            merchantId,
            customerId,
            customerPhone,
            customerName,
          );
          if (!customerExists) {
            failures.push("vipTag customer could not be found");
          }
        }
        break;
      }
      case "REORDER_LAST": {
        const customerId = String(
          command.entities.vipTag?.customerId || "",
        ).trim();
        const customerPhone = String(
          command.entities.vipTag?.customerPhone || "",
        ).trim();
        const customerName = String(
          command.entities.vipTag?.customerName || "",
        ).trim();

        if (!customerId && !customerPhone && !customerName) {
          failures.push("reorder requires customer identifier");
          break;
        }

        const hasHistory = await this.customerHasPreviousOrders(
          merchantId,
          customerId,
          customerPhone,
          customerName,
        );
        if (!hasHistory) {
          failures.push("customer has no previous orders to reorder");
        }
        break;
      }
      case "CREATE_ORDER": {
        if (!Array.isArray(command.entities.order?.items)) {
          failures.push("order.items must be present");
          break;
        }
        const validItems = command.entities.order.items.filter(
          (item) => Number(item.quantity || 0) > 0,
        );
        if (validItems.length === 0) {
          failures.push(
            "order.items must include at least one positive quantity",
          );
        }

        const hasOpenRegister = await this.hasOpenRegister(merchantId);
        if (!hasOpenRegister) {
          advisories.push(
            "No open POS register session detected; cashier checkout should open a session first",
          );
        }
        break;
      }
      case "CLOSE_MONTH": {
        const hasOpenRegister = await this.hasOpenRegister(merchantId);
        if (hasOpenRegister) {
          failures.push(
            "close month requires all POS register sessions to be closed first",
          );
        }
        break;
      }
      default:
        break;
    }

    return {
      ok: failures.length === 0,
      failures,
      advisories,
      action,
    };
  }

  private async resolveCatalogTargetExists(
    merchantId: string,
    sku: string,
    productName: string,
  ): Promise<boolean> {
    try {
      const clauses: string[] = [];
      const values: any[] = [merchantId];

      if (sku) {
        values.push(sku);
        clauses.push(`LOWER(COALESCE(sku, '')) = LOWER($${values.length})`);
      }

      if (productName) {
        values.push(productName);
        clauses.push(
          `LOWER(COALESCE(name_ar, name_en, '')) = LOWER($${values.length})`,
        );
      }

      if (!clauses.length) {
        return false;
      }

      const result = await this.pool.query(
        `SELECT 1
         FROM catalog_items
         WHERE merchant_id = $1
           AND (${clauses.join(" OR ")})
         LIMIT 1`,
        values,
      );

      return result.rows.length > 0;
    } catch {
      return true;
    }
  }

  private async customerExists(
    merchantId: string,
    customerId: string,
    customerPhone: string,
    customerName: string,
  ): Promise<boolean> {
    try {
      const filters: string[] = [];
      const values: any[] = [merchantId];

      if (customerId) {
        values.push(customerId);
        filters.push(`id::text = $${values.length}`);
      }
      if (customerPhone) {
        values.push(customerPhone);
        filters.push(`phone = $${values.length}`);
      }
      if (customerName) {
        values.push(customerName);
        filters.push(`LOWER(name) = LOWER($${values.length})`);
      }

      if (!filters.length) {
        return false;
      }

      const result = await this.pool.query(
        `SELECT 1
         FROM customers
         WHERE merchant_id = $1
           AND (${filters.join(" OR ")})
         LIMIT 1`,
        values,
      );
      return result.rows.length > 0;
    } catch {
      return true;
    }
  }

  private async customerHasPreviousOrders(
    merchantId: string,
    customerId: string,
    customerPhone: string,
    customerName: string,
  ): Promise<boolean> {
    try {
      const filters: string[] = [];
      const values: any[] = [merchantId];

      if (customerId) {
        values.push(customerId);
        filters.push(`o.customer_id = $${values.length}`);
      }
      if (customerPhone) {
        values.push(customerPhone);
        filters.push(`o.customer_phone = $${values.length}`);
      }
      if (customerName) {
        values.push(customerName);
        filters.push(`LOWER(o.customer_name) = LOWER($${values.length})`);
      }

      if (!filters.length) {
        return false;
      }

      const result = await this.pool.query(
        `SELECT 1
         FROM orders o
         WHERE o.merchant_id = $1
           AND (${filters.join(" OR ")})
           AND UPPER(COALESCE(o.status, '')) <> 'CANCELLED'
         LIMIT 1`,
        values,
      );
      return result.rows.length > 0;
    } catch {
      return true;
    }
  }

  private async hasOpenRegister(merchantId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT 1
         FROM pos_register_sessions
         WHERE merchant_id = $1
           AND status = 'OPEN'
         LIMIT 1`,
        [merchantId],
      );
      return result.rows.length > 0;
    } catch {
      return true;
    }
  }
}
