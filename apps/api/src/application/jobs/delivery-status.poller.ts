import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  IDeliveryAdapter,
  DELIVERY_ADAPTER,
} from "../adapters/delivery-adapter.interface";
import { OutboxService } from "../events/outbox.service";
import { EVENT_TYPES } from "../events/event-types";
import { RedisService } from "../../infrastructure/redis/redis.service";

/**
 * Polls delivery status updates from courier APIs
 */
@Injectable()
export class DeliveryStatusPoller {
  private readonly logger = new Logger(DeliveryStatusPoller.name);
  private supportsStatusDescriptionColumn: boolean | null = null;
  private readonly lockKey = "delivery-status-poller-lock";
  private readonly lockTtl = 120000; // 2 minutes

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(DELIVERY_ADAPTER)
    private readonly deliveryAdapter: IDeliveryAdapter,
    private readonly outboxService: OutboxService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Poll for delivery status updates every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollDeliveryStatus(): Promise<void> {
    const lock = await this.redisService.acquireLock(
      this.lockKey,
      this.lockTtl,
    );
    if (!lock) {
      this.logger.debug("Could not acquire delivery poller lock");
      return;
    }

    try {
      await this.processActiveShipments();
    } catch (error: any) {
      this.logger.error({
        msg: "Error in delivery status poller",
        error: error.message,
      });
      try {
        await this.pool.query(
          `INSERT INTO job_failure_events (job_name, error_message, error_stack)
           VALUES ($1, $2, $3)`,
          ["delivery-status-poller", error.message, error.stack ?? null],
        );
      } catch { /* non-fatal */ }
    } finally {
      await this.redisService.releaseLock(lock);
    }
  }

  private async processActiveShipments(): Promise<void> {
    // Find shipments that are not in final state
    const query = `
      SELECT s.*, o.order_number, o.customer_name
      FROM shipments s
      JOIN orders o ON s.order_id = o.id
      WHERE s.status NOT IN ('delivered', 'returned', 'cancelled')
        AND s.updated_at < NOW() - INTERVAL '5 minutes'
      ORDER BY s.updated_at ASC
      LIMIT 100
    `;

    const result = await this.pool.query(query);

    if (result.rows.length === 0) {
      this.logger.debug("No shipments to poll");
      return;
    }

    this.logger.log({
      msg: "Polling delivery status for shipments",
      count: result.rows.length,
    });

    let updatedCount = 0;

    for (const shipment of result.rows) {
      try {
        if (!shipment.tracking_id) {
          this.logger.warn({
            msg: "Skipping shipment poll because tracking_id is missing",
            shipmentId: shipment.id,
            orderId: shipment.order_id,
          });
          await this.pool.query(
            `UPDATE shipments SET updated_at = NOW() WHERE id = $1`,
            [shipment.id],
          );
          continue;
        }

        const status = await this.deliveryAdapter.getStatus(
          shipment.tracking_id,
        );

        if (status.status !== shipment.status) {
          // Status changed - update and emit event
          await this.updateShipmentStatus(shipment, status);
          updatedCount++;
        } else {
          // Just update the updated_at to prevent re-polling too soon
          await this.pool.query(
            `UPDATE shipments SET updated_at = NOW() WHERE id = $1`,
            [shipment.id],
          );
        }
      } catch (error: any) {
        this.logger.error({
          msg: "Failed to poll shipment status",
          shipmentId: shipment.id,
          trackingId: shipment.tracking_id,
          error: error.message,
        });
      }
    }

    this.logger.log({
      msg: "Delivery status polling completed",
      polled: result.rows.length,
      updated: updatedCount,
    });
  }

  private async updateShipmentStatus(
    shipment: any,
    status: {
      status: string;
      statusDescription: string;
      estimatedDelivery?: Date;
    },
  ): Promise<void> {
    // Update status history
    const statusHistory = shipment.status_history || [];
    statusHistory.push({
      status: status.status,
      timestamp: new Date(),
      description: status.statusDescription,
    });

    // Update shipment with schema compatibility for legacy DBs without status_description.
    const params = [
      shipment.id,
      status.status,
      status.statusDescription,
      JSON.stringify(statusHistory),
      status.estimatedDelivery,
    ];

    const updateWithDescriptionSql = `UPDATE shipments 
       SET status = $2, 
           status_description = $3,
           status_history = $4, 
           estimated_delivery = $5,
           updated_at = NOW()
       WHERE id = $1`;
    const updateLegacySql = `UPDATE shipments
       SET status = $2,
           status_history = $4,
           estimated_delivery = $5,
           updated_at = NOW()
       WHERE id = $1`;

    if (this.supportsStatusDescriptionColumn === false) {
      await this.pool.query(updateLegacySql, params);
    } else {
      try {
        await this.pool.query(updateWithDescriptionSql, params);
        this.supportsStatusDescriptionColumn = true;
      } catch (error: any) {
        if (error?.code !== "42703") {
          throw error;
        }
        this.supportsStatusDescriptionColumn = false;
        await this.pool.query(updateLegacySql, params);
      }
    }

    // Emit delivery status updated event
    await this.outboxService.publishEvent({
      eventType: EVENT_TYPES.DELIVERY_STATUS_UPDATED,
      aggregateType: "shipment",
      aggregateId: shipment.id,
      merchantId: shipment.merchant_id,
      payload: {
        shipmentId: shipment.id,
        orderId: shipment.order_id,
        merchantId: shipment.merchant_id,
        trackingId: shipment.tracking_id,
        status: status.status,
        statusDescription: status.statusDescription,
      },
    });

    this.logger.log({
      msg: "Shipment status updated",
      shipmentId: shipment.id,
      trackingId: shipment.tracking_id,
      oldStatus: shipment.status,
      newStatus: status.status,
    });
  }
}
