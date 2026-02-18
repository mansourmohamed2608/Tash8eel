import { Injectable, Inject, Logger, OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../infrastructure/database.module";
import { createLogger } from "@tash8eel/shared";
import { OutboxEvent } from "@tash8eel/agent-sdk";

/**
 * Event types matching what's stored in the outbox by the API.
 * These must match apps/api/src/application/events/event-types.ts
 */
const EVENT_TYPES = {
  MESSAGE_RECEIVED: "MessageReceived",
  ORDER_CREATED: "OrderCreated",
  SHIPMENT_BOOKED: "ShipmentBooked",
  FOLLOWUP_SCHEDULED: "FollowupScheduled",
  DAILY_REPORT_GENERATED: "DailyReportGenerated",
  ESCALATION_REQUIRED: "EscalationRequired",
  PAYMENT_PROOF_SUBMITTED: "PaymentProofSubmitted",
} as const;

const logger = createLogger("OutboxPoller");

@Injectable()
export class OutboxPollerService implements OnModuleInit {
  private readonly nestLogger = new Logger(OutboxPollerService.name);
  private isProcessing = false;
  private readonly batchSize = 50;
  private readonly pollIntervalMs = 1000;

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  onModuleInit(): void {
    this.nestLogger.log("Outbox poller initialized");
  }

  @Interval(1000)
  async pollOutbox(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const client = await this.pool.connect();

      try {
        await client.query("BEGIN");

        // Select pending events with FOR UPDATE SKIP LOCKED to prevent duplicate processing
        const result = await client.query<OutboxEvent>(
          `SELECT 
                  id,
                  event_type as "eventType",
                  aggregate_type as "aggregateType",
                  aggregate_id as "aggregateId",
                  merchant_id as "merchantId",
                  correlation_id as "correlationId",
                  payload,
                  status,
                  retry_count as "retryCount",
                  created_at as "createdAt"
           FROM outbox_events
           WHERE status = 'PENDING'
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED`,
          [this.batchSize],
        );

        if (result.rows.length === 0) {
          await client.query("COMMIT");
          return;
        }

        logger.info(`Processing ${result.rows.length} outbox events`);

        for (const event of result.rows) {
          try {
            // Update status to PROCESSING
            await client.query(
              `UPDATE outbox_events SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1`,
              [event.id],
            );

            // Process the event
            await this.processEvent(event);

            // Mark as COMPLETED
            await client.query(
              `UPDATE outbox_events SET status = 'COMPLETED', processed_at = NOW(), updated_at = NOW() WHERE id = $1`,
              [event.id],
            );

            logger.info("Event processed successfully", {
              eventId: event.id,
              eventType: event.eventType,
            });
          } catch (error) {
            const err = error as Error;
            logger.error(`Failed to process event ${event.id}`, err);

            // Update retry count or move to DLQ
            const newRetryCount = (event.retryCount || 0) + 1;

            if (newRetryCount >= 5) {
              // Move to DLQ
              await client.query(
                `INSERT INTO dlq_events (original_event_id, event_type, payload, error, stack, correlation_id, merchant_id, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')`,
                [
                  event.id,
                  event.eventType,
                  event.payload,
                  err.message,
                  err.stack,
                  event.correlationId,
                  event.merchantId,
                ],
              );

              await client.query(
                `UPDATE outbox_events SET status = 'FAILED', error = $2, updated_at = NOW() WHERE id = $1`,
                [event.id, err.message],
              );
            } else {
              // Retry later
              await client.query(
                `UPDATE outbox_events SET status = 'PENDING', retry_count = $2, error = $3, updated_at = NOW() WHERE id = $1`,
                [event.id, newRetryCount, err.message],
              );
            }
          }
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      const err = error as Error & { code?: string };
      logger.error(
        {
          err: {
            message: err.message,
            stack: err.stack,
            code: (err as any)?.code,
          },
        },
        "Outbox polling error",
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private async processEvent(event: any): Promise<void> {
    const eventType = event.eventType;

    switch (eventType) {
      case EVENT_TYPES.MESSAGE_RECEIVED:
        await this.handleMessageReceived(event);
        break;
      case EVENT_TYPES.ORDER_CREATED:
        await this.handleOrderCreated(event);
        break;
      case EVENT_TYPES.SHIPMENT_BOOKED:
        await this.handleShipmentBooked(event);
        break;
      case EVENT_TYPES.FOLLOWUP_SCHEDULED:
        await this.handleFollowupScheduled(event);
        break;
      case EVENT_TYPES.DAILY_REPORT_GENERATED:
        await this.handleDailyReportGenerated(event);
        break;
      case EVENT_TYPES.ESCALATION_REQUIRED:
        await this.handleEscalationRequired(event);
        break;
      case EVENT_TYPES.PAYMENT_PROOF_SUBMITTED:
        await this.handlePaymentProofSubmitted(event);
        break;
      default:
        logger.warn(`Unknown event type: ${eventType}`);
    }
  }

  private async handleMessageReceived(event: any): Promise<void> {
    // Create agent task for OPS_AGENT
    await this.createAgentTask(
      "OPS_AGENT",
      "process_message",
      event.payload,
      event.merchantId,
      event.correlationId,
    );
  }
  private async handleOrderCreated(event: any): Promise<void> {
    // Create tasks for relevant agents
    await this.createAgentTask(
      "INVENTORY_AGENT",
      "check_stock",
      event.payload,
      event.merchantId,
      event.correlationId,
    );

    // Auto-create payment link task (Finance Agent MVP)
    const paymentLinkInput = {
      orderId: event.payload.orderId,
      merchantId: event.merchantId,
      amount: event.payload.total,
      customerName: event.payload.customerName,
      customerPhone: event.payload.customerPhone,
      orderNumber: event.payload.orderNumber,
    };
    await this.createAgentTask(
      "FINANCE_AGENT",
      "auto_create_payment_link",
      paymentLinkInput,
      event.merchantId,
      event.correlationId,
    );
  }

  private async handlePaymentProofSubmitted(event: any): Promise<void> {
    // Create Finance Agent task to review payment proof
    const proofReviewInput = {
      proofId: event.payload.proofId,
      merchantId: event.merchantId,
      paymentLinkId: event.payload.paymentLinkId,
      orderId: event.payload.orderId,
      extractedAmount: event.payload.extractedAmount,
      ocrConfidence: event.payload.ocrConfidence,
    };
    await this.createAgentTask(
      "FINANCE_AGENT",
      "payment_proof_review",
      proofReviewInput,
      event.merchantId,
      event.correlationId,
    );
  }

  private async handleShipmentBooked(event: any): Promise<void> {
    // Notify customer about shipment
    logger.info("Shipment booked event processed", {
      orderId: event.payload.orderId,
    });
  }

  private async handleFollowupScheduled(event: any): Promise<void> {
    // Store followup for scheduler
    logger.info("Followup scheduled", { followupId: event.payload.followupId });
  }

  private async handleDailyReportGenerated(event: any): Promise<void> {
    // Create notification for merchant
    try {
      await this.pool.query(
        `INSERT INTO notifications (merchant_id, type, title, title_ar, message, message_ar, priority, channels, action_url, data)
         VALUES ($1, 'DAILY_SUMMARY', 'Daily summary ready', 'ملخص اليوم جاهز', $2, $3, 'LOW', ARRAY['IN_APP'], '/merchant/reports', $4)`,
        [
          event.merchantId,
          "Daily sales summary is ready for review.",
          "تقرير المبيعات اليومي جاهز للمراجعة.",
          JSON.stringify(event.payload),
        ],
      );
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        logger.warn(
          "Notifications table not ready, skipping daily report notification.",
        );
        return;
      }
      throw error;
    }
  }

  private async handleEscalationRequired(event: any): Promise<void> {
    // Create escalation notification
    try {
      await this.pool.query(
        `INSERT INTO notifications (merchant_id, type, title, title_ar, message, message_ar, priority, channels, action_url, data)
         VALUES ($1, 'ESCALATED_CONVERSATION', 'Conversation needs attention', 'محادثة تحتاج انتباهك', $2, $3, 'URGENT', ARRAY['IN_APP', 'PUSH'], $4, $5)`,
        [
          event.merchantId,
          event.payload.reason || "Escalation required",
          event.payload.reason || "تم تصعيد المحادثة وتحتاج متابعة",
          event.payload.conversationId
            ? `/merchant/conversations/${event.payload.conversationId}`
            : "/merchant/conversations",
          JSON.stringify(event.payload),
        ],
      );
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        logger.warn(
          "Notifications table not ready, skipping escalation notification.",
        );
        return;
      }
      throw error;
    }
  }

  private async createAgentTask(
    agentType: string,
    taskType: string,
    input: Record<string, unknown>,
    merchantId?: string,
    correlationId?: string,
  ): Promise<void> {
    const payload = [
      agentType,
      taskType,
      merchantId,
      correlationId,
      JSON.stringify(input),
    ];
    try {
      await this.pool.query(
        `INSERT INTO agent_tasks (agent_type, task_type, merchant_id, correlation_id, input, status, priority)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', 3)`,
        payload,
      );
    } catch (error) {
      const err = error as Error;
      const legacyAgentType = agentType.replace("_AGENT", "").toLowerCase();
      if (
        err.message?.includes("invalid input value for enum") &&
        legacyAgentType
      ) {
        await this.pool.query(
          `INSERT INTO agent_tasks (agent_type, task_type, merchant_id, correlation_id, input, status, priority)
           VALUES ($1, $2, $3, $4, $5, 'PENDING', 3)`,
          [
            legacyAgentType,
            taskType,
            merchantId,
            correlationId,
            JSON.stringify(input),
          ],
        );
        return;
      }
      throw err;
    }
  }
}
