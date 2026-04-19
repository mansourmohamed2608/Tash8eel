import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { SlotGraphNode } from "./slot-plan";

export interface MerchantSalesPlaybook {
  merchantId: string;
  slotGraph: SlotGraphNode[];
  constraintDims: string[];
  nextQuestionTemplates: Record<string, string>;
  intentExamples: Record<string, string[]>;
  slotExtractors: Record<string, unknown>;
  version: number;
}

interface PlaybookRow {
  merchant_id: string;
  slot_graph: unknown;
  constraint_dims: unknown;
  next_question_templates: unknown;
  intent_examples: unknown;
  slot_extractors: unknown;
  version: number;
}

const GENERIC_PLAYBOOK: MerchantSalesPlaybook = {
  merchantId: "generic",
  slotGraph: [
    { key: "need", required: true },
    { key: "budget", required: false },
    { key: "delivery_city", required: false },
    { key: "payment", required: false },
  ],
  constraintDims: ["budget", "date", "stock", "delivery_window"],
  nextQuestionTemplates: {
    need: "اسأل العميل عن النوع أو الاستخدام المطلوب بشكل طبيعي.",
    budget: "اسأل عن الميزانية لو الاختيار واسع.",
    delivery_city: "اسأل عن المدينة فقط لو التوصيل مهم للرد الحالي.",
    payment: "اسأل عن الدفع فقط بعد وضوح الطلب.",
  },
  intentExamples: {},
  slotExtractors: {},
  version: 1,
};

@Injectable()
export class DialogPlaybookService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async getForMerchant(merchantId: string): Promise<MerchantSalesPlaybook> {
    try {
      const result = await this.pool.query<PlaybookRow>(
        `SELECT merchant_id, slot_graph, constraint_dims, next_question_templates,
                intent_examples, slot_extractors, version
         FROM merchant_sales_playbooks
         WHERE merchant_id = $1
         LIMIT 1`,
        [merchantId],
      );

      const row = result.rows[0];
      if (!row) return { ...GENERIC_PLAYBOOK, merchantId };

      return {
        merchantId: row.merchant_id,
        slotGraph: this.asArray(row.slot_graph) as SlotGraphNode[],
        constraintDims: this.asStringArray(row.constraint_dims),
        nextQuestionTemplates: this.asRecord(row.next_question_templates),
        intentExamples: this.asRecord(row.intent_examples) as Record<
          string,
          string[]
        >,
        slotExtractors: this.asRecord(row.slot_extractors),
        version: Number(row.version || 1),
      };
    } catch {
      return { ...GENERIC_PLAYBOOK, merchantId };
    }
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }
}
