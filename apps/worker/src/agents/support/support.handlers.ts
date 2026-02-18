/**
 * Support Agent Handlers
 * Ticket management, FAQ answers, escalations.
 */
import { Pool } from "pg";
import { Logger } from "@nestjs/common";
import { AgentTask } from "@tash8eel/agent-sdk";
import {
  CreateTicketInput,
  ResolveTicketInput,
  AnswerFaqInput,
  EscalateToHumanInput,
} from "./support.tasks";

export class SupportHandlers {
  private readonly logger = new Logger(SupportHandlers.name);

  constructor(private readonly pool: Pool) {}

  /**
   * Handle escalation to human agent
   * SDK task: ESCALATION_RESPONSE
   */
  async escalateToHuman(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as unknown as EscalateToHumanInput;
    const merchantId = input.merchantId || task.merchantId;
    if (!merchantId)
      return { action: "FAILED", message: "merchantId required" };

    try {
      // Mark conversation as escalated for human takeover flow.
      if (input.conversationId) {
        await this.pool.query(
          `UPDATE conversations
           SET human_takeover = true,
               human_takeover_at = NOW(),
               human_operator_id = COALESCE(human_operator_id, 'support-agent'),
               context = COALESCE(context, '{}'::jsonb) || $1::jsonb,
               updated_at = NOW()
           WHERE id = $2 AND merchant_id = $3`,
          [
            JSON.stringify({
              escalatedAt: new Date().toISOString(),
              escalationReason: input.reason,
              urgency: input.urgency,
            }),
            input.conversationId,
            merchantId,
          ],
        );
      }

      // Create notification for merchant team
      const urgencyLabels: Record<string, string> = {
        normal: "عادي",
        high: "مرتفع",
        critical: "حرج",
      };

      await this.pool.query(
        `INSERT INTO notifications (
           merchant_id, type, title, title_ar, message, message_ar, data, priority, channels, action_url, created_at
         )
         VALUES ($1, 'SYSTEM_ALERT', $2, $2, $3, $3, $4::jsonb, 'HIGH', '{"IN_APP","PUSH"}', '/merchant/conversations', NOW())`,
        [
          merchantId,
          `تصعيد محادثة - أولوية ${urgencyLabels[input.urgency] || input.urgency}`,
          `سبب التصعيد: ${input.reason}`,
          JSON.stringify({
            conversationId: input.conversationId,
            urgency: input.urgency,
            reason: input.reason,
          }),
        ],
      );

      this.logger.log(
        `Escalated conversation ${input.conversationId} for merchant ${merchantId}`,
      );

      return {
        action: "ESCALATED",
        conversationId: input.conversationId,
        urgency: input.urgency,
        reason: input.reason,
        status: "ESCALATED",
        message: `تم تصعيد المحادثة بأولوية ${urgencyLabels[input.urgency] || input.urgency}`,
        notificationSent: true,
      };
    } catch (error) {
      this.logger.error(`escalateToHuman failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Answer FAQ from knowledge base
   * SDK task: FAQ_RESPONSE
   */
  async answerFaq(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as unknown as AnswerFaqInput;
    const merchantId = input.merchantId || task.merchantId;
    if (!merchantId)
      return { action: "FAILED", message: "merchantId required" };

    try {
      const question = (input.question || "").toLowerCase();

      // Search knowledge base for matching entries
      const kbResult = await this.pool.query(
        `SELECT id, title, content, category, 
                similarity(LOWER(title), $2) as title_sim,
                similarity(LOWER(content), $2) as content_sim
         FROM knowledge_base
         WHERE merchant_id = $1
           AND (
             LOWER(title) LIKE '%' || $2 || '%'
             OR LOWER(content) LIKE '%' || $2 || '%'
           )
         ORDER BY title_sim DESC, content_sim DESC
         LIMIT 5`,
        [merchantId, question.substring(0, 100)],
      );

      if (kbResult.rows.length > 0) {
        const bestMatch = kbResult.rows[0];
        this.logger.log(
          `FAQ answered from knowledge base: "${bestMatch.title}"`,
        );

        return {
          action: "FAQ_ANSWERED",
          question: input.question,
          answer: bestMatch.content,
          source: {
            id: bestMatch.id,
            title: bestMatch.title,
            category: bestMatch.category,
          },
          confidence: "HIGH",
          alternativeAnswers: kbResult.rows.slice(1).map((r: any) => ({
            title: r.title,
            content: r.content.substring(0, 200),
          })),
        };
      }

      // Fallback: check for common FAQ patterns
      const commonFaqs: Record<string, string> = {
        "شحن|توصيل|delivery":
          "يتم الشحن خلال 2-5 أيام عمل حسب المنطقة. رسوم الشحن تُحسب تلقائياً عند الطلب.",
        "إرجاع|استرجاع|return":
          "يمكنك طلب الإرجاع خلال 14 يوم من استلام الطلب. تواصل معنا عبر واتساب.",
        "دفع|payment|cod":
          "نقبل الدفع عند الاستلام (COD) وتحويل بنكي وبطاقات الائتمان.",
        "خصم|عرض|discount|promo":
          "تابعنا على واتساب للحصول على أحدث العروض والخصومات.",
        "تتبع|tracking":
          "بعد شحن طلبك، ستصلك رسالة واتساب تحتوي على رابط التتبع.",
      };

      for (const [pattern, answer] of Object.entries(commonFaqs)) {
        if (new RegExp(pattern, "i").test(question)) {
          return {
            action: "FAQ_ANSWERED",
            question: input.question,
            answer,
            source: { type: "common_faq" },
            confidence: "MEDIUM",
          };
        }
      }

      // No answer found
      return {
        action: "FAQ_NOT_FOUND",
        question: input.question,
        message: "لم نجد إجابة مناسبة. سيتم تحويلك لأحد أفراد الفريق.",
        suggestEscalation: true,
      };
    } catch (error) {
      // If similarity() function doesn't exist, fall back to simpler search
      if ((error as Error).message?.includes("similarity")) {
        try {
          const fallbackQuestion = (
            (input.question as string) || ""
          ).toLowerCase();
          const kbResult = await this.pool.query(
            `SELECT id, title, content, category
             FROM knowledge_base
             WHERE merchant_id = $1
               AND (LOWER(title) LIKE '%' || $2 || '%' OR LOWER(content) LIKE '%' || $2 || '%')
             LIMIT 5`,
            [merchantId, fallbackQuestion.substring(0, 100)],
          );

          if (kbResult.rows.length > 0) {
            return {
              action: "FAQ_ANSWERED",
              question: input.question,
              answer: kbResult.rows[0].content,
              source: {
                id: kbResult.rows[0].id,
                title: kbResult.rows[0].title,
              },
              confidence: "MEDIUM",
            };
          }
        } catch (fallbackErr) {
          this.logger.error(
            `FAQ fallback search failed: ${(fallbackErr as Error).message}`,
          );
        }
      }

      this.logger.error(`answerFaq failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Create a support ticket
   */
  async createTicket(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as unknown as CreateTicketInput;
    const merchantId = input.merchantId || task.merchantId;
    if (!merchantId)
      return { action: "FAILED", message: "merchantId required" };

    try {
      const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;

      // Store ticket as a notification with ticket metadata
      await this.pool.query(
        `INSERT INTO notifications (
           merchant_id, type, title, title_ar, message, message_ar, data, priority, channels, action_url, created_at
         )
         VALUES ($1, 'SYSTEM_ALERT', $2, $2, $3, $3, $4::jsonb, 'MEDIUM', '{"IN_APP"}', '/merchant/notifications', NOW())`,
        [
          merchantId,
          `تذكرة دعم: ${input.subject}`,
          input.description,
          JSON.stringify({
            ticketId,
            customerId: input.customerId,
            conversationId: input.conversationId,
            priority: input.priority,
            status: "OPEN",
          }),
        ],
      );

      this.logger.log(
        `Created support ticket ${ticketId} for merchant ${merchantId}`,
      );

      return {
        action: "TICKET_CREATED",
        ticketId,
        subject: input.subject,
        priority: input.priority,
        status: "OPEN",
        message: `تم إنشاء تذكرة الدعم رقم ${ticketId}`,
      };
    } catch (error) {
      this.logger.error(`createTicket failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }

  /**
   * Resolve a support ticket
   */
  async resolveTicket(task: AgentTask): Promise<Record<string, unknown>> {
    const input = task.input as unknown as ResolveTicketInput;

    try {
      this.logger.log(
        `Resolved ticket ${input.ticketId} by ${input.resolvedBy}`,
      );

      return {
        action: "TICKET_RESOLVED",
        ticketId: input.ticketId,
        resolution: input.resolution,
        resolvedBy: input.resolvedBy,
        resolvedAt: new Date().toISOString(),
        status: "RESOLVED",
      };
    } catch (error) {
      this.logger.error(`resolveTicket failed: ${(error as Error).message}`);
      return { action: "FAILED", message: (error as Error).message };
    }
  }
}
