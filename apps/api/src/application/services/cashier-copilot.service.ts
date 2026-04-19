import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { PlannerContextAssemblerService } from "../llm/planner-context-assembler.service";

export interface CashierCopilotSuggestion {
  id: string;
  type: "alert" | "insight" | "action";
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  action?: {
    kind: string;
    label: string;
    payload?: Record<string, unknown>;
    requiresApproval?: boolean;
  };
}

export interface CashierCopilotSuggestionsResponse {
  generatedAt: string;
  draftId?: string;
  branchId?: string;
  contextDigest: {
    todayCashierOrders: number;
    todayCashierRevenue: number;
    pendingApprovals: number;
    openRegisters: number;
    activeDrafts: number;
    forecastRisks: {
      lowConfidencePredictions: number;
      staleRuns: number;
      highUrgencyReplenishments: number;
    };
  };
  suggestions: CashierCopilotSuggestion[];
}

interface BuildSuggestionsParams {
  merchantId: string;
  draftId?: string;
  branchId?: string;
  query?: string;
}

@Injectable()
export class CashierCopilotService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly plannerContextAssembler: PlannerContextAssemblerService,
  ) {}

  async buildSuggestions(
    params: BuildSuggestionsParams,
  ): Promise<CashierCopilotSuggestionsResponse> {
    const planner = await this.plannerContextAssembler.assemble(
      params.merchantId,
    );
    const draft = params.draftId
      ? await this.loadDraft(params.merchantId, params.draftId)
      : null;

    const suggestions: CashierCopilotSuggestion[] = [];

    if (planner.pos.openRegisters === 0) {
      suggestions.push({
        id: "open-register",
        type: "alert",
        priority: "high",
        title: "لا توجد جلسة صندوق مفتوحة",
        body: "تشغيل الكاشير بدون جلسة مفتوحة يقلل دقة تقارير النقدية ويصعب التسوية اليومية.",
        action: {
          kind: "open_register",
          label: "فتح جلسة الآن",
        },
      });
    }

    if (planner.operational.pendingApprovals > 0) {
      suggestions.push({
        id: "pending-approvals",
        type: "alert",
        priority: "medium",
        title: "يوجد إجراءات Copilot بانتظار قرار",
        body: `عدد الإجراءات غير المحسومة الآن: ${planner.operational.pendingApprovals}. حسمها يمنع تراكم التنفيذ المؤجل.`,
        action: {
          kind: "review_approvals",
          label: "مراجعة الإجراءات",
          payload: {
            status: "pending",
          },
          requiresApproval: true,
        },
      });
    }

    if (planner.forecast.riskSignals.highUrgencyReplenishments > 0) {
      suggestions.push({
        id: "replenishment-risk",
        type: "insight",
        priority: "medium",
        title: "مخاطر نفاد مخزون متوقعة",
        body: `يوجد ${planner.forecast.riskSignals.highUrgencyReplenishments} توصية توريد عاجلة من منصة التنبؤ.`,
        action: {
          kind: "open_replenishment",
          label: "عرض التوصيات",
        },
      });
    }

    if (planner.forecast.riskSignals.staleRuns > 0) {
      suggestions.push({
        id: "stale-forecast-runs",
        type: "insight",
        priority: "low",
        title: "بعض توقعات التنبؤ قديمة",
        body: `تم رصد ${planner.forecast.riskSignals.staleRuns} تشغيلات Forecast بحالة stale خلال آخر 7 أيام.`,
        action: {
          kind: "open_forecast",
          label: "فتح لوحة التنبؤ",
        },
      });
    }

    if (draft) {
      const totalItems = Array.isArray(draft.items)
        ? (draft.items as Array<{ quantity?: number }>).reduce(
            (sum: number, item: { quantity?: number }) =>
              sum + Number(item.quantity || 0),
            0,
          )
        : 0;
      const totalValue = Number(draft.total || 0);

      if (totalItems >= 8) {
        suggestions.push({
          id: "high-item-count",
          type: "action",
          priority: "medium",
          title: "السلة كبيرة وعدد الأصناف مرتفع",
          body: "السلة الحالية تتضمن عدداً كبيراً من الأصناف؛ راجع الدقة قبل الإغلاق لتقليل أخطاء التحصيل.",
          action: {
            kind: "review_cart_items",
            label: "مراجعة السلة",
          },
        });
      }

      if (totalValue >= 1500) {
        suggestions.push({
          id: "large-ticket",
          type: "action",
          priority: "medium",
          title: "قيمة الطلب مرتفعة",
          body: "للطلبات الكبيرة يفضل تأكيد وسيلة التحصيل أو توزيع الدفع قبل الإغلاق النهائي.",
          action: {
            kind: "review_payment_split",
            label: "ضبط التحصيل",
          },
        });
      }

      const lowStockWarnings = await this.loadDraftLowStockWarnings(
        params.merchantId,
        draft.items,
      );
      suggestions.push(...lowStockWarnings);
    }

    const normalizedQuery = String(params.query || "")
      .trim()
      .toLowerCase();
    if (
      normalizedQuery.includes("خصم") ||
      normalizedQuery.includes("discount")
    ) {
      suggestions.push({
        id: "discount-guard",
        type: "action",
        priority: "low",
        title: "تحقق من أثر الخصم على الهامش",
        body: "اقتراح MVP: راجع إجمالي الخصم أمام تكلفة البضاعة قبل اعتماد تخفيضات إضافية.",
        action: {
          kind: "open_discount_report",
          label: "تحليل أثر الخصم",
        },
      });
    }

    if (suggestions.length === 0) {
      suggestions.push({
        id: "healthy-session",
        type: "insight",
        priority: "low",
        title: "الوضع التشغيلي مستقر",
        body: "لا توجد إشارات مخاطر فورية من سياق الكاشير الحالي. يمكنك متابعة البيع كالمعتاد.",
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      draftId: params.draftId,
      branchId: params.branchId,
      contextDigest: {
        todayCashierOrders: planner.pos.todayCashierOrders,
        todayCashierRevenue: planner.pos.todayCashierRevenue,
        pendingApprovals: planner.operational.pendingApprovals,
        openRegisters: planner.pos.openRegisters,
        activeDrafts: planner.pos.activeDrafts,
        forecastRisks: {
          lowConfidencePredictions:
            planner.forecast.riskSignals.lowConfidencePredictions,
          staleRuns: planner.forecast.riskSignals.staleRuns,
          highUrgencyReplenishments:
            planner.forecast.riskSignals.highUrgencyReplenishments,
        },
      },
      suggestions,
    };
  }

  private async loadDraft(
    merchantId: string,
    draftId: string,
  ): Promise<any | null> {
    const result = await this.pool.query<any>(
      `SELECT id::text as id, branch_id::text as branch_id, items, total
       FROM pos_drafts
       WHERE merchant_id = $1
         AND id::text = $2
       LIMIT 1`,
      [merchantId, draftId],
    );

    if (!result.rows.length) {
      return null;
    }

    return {
      id: result.rows[0].id,
      branchId: result.rows[0].branch_id || null,
      items: Array.isArray(result.rows[0].items) ? result.rows[0].items : [],
      total: Number(result.rows[0].total || 0),
    };
  }

  private async loadDraftLowStockWarnings(
    merchantId: string,
    items: Array<{ catalogItemId?: string; name?: string; quantity?: number }>,
  ): Promise<CashierCopilotSuggestion[]> {
    const ids = (Array.isArray(items) ? items : [])
      .map((item) => String(item.catalogItemId || "").trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return [];
    }

    try {
      const result = await this.pool.query<{
        id: string;
        name: string;
        stock_quantity: string;
      }>(
        `SELECT
           id::text as id,
           COALESCE(NULLIF(name_ar, ''), NULLIF(name_en, ''), NULLIF(sku, ''), id::text) as name,
           COALESCE(stock_quantity, 0)::text as stock_quantity
         FROM catalog_items
         WHERE merchant_id = $1
           AND id::text = ANY($2::text[])`,
        [merchantId, ids],
      );

      const byId = new Map(
        result.rows.map((row) => [
          String(row.id),
          {
            name: row.name,
            stock: Number(row.stock_quantity || 0),
          },
        ]),
      );

      const suggestions: CashierCopilotSuggestion[] = [];
      for (const item of items) {
        const id = String(item.catalogItemId || "").trim();
        if (!id) continue;
        const stock = byId.get(id);
        if (!stock) continue;
        if (stock.stock <= 3) {
          suggestions.push({
            id: `low-stock-${id}`,
            type: "alert",
            priority: "high",
            title: "تحذير مخزون منخفض",
            body: `الصنف ${stock.name} متبقٍ منه ${stock.stock} فقط. راجع الكمية قبل إغلاق الطلب.`,
            action: {
              kind: "open_inventory_item",
              label: "فتح المخزون",
              payload: { catalogItemId: id },
            },
          });
        }
      }

      return suggestions;
    } catch {
      return [];
    }
  }
}
