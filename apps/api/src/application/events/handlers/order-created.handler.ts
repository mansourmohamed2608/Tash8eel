import { Injectable, Logger, Inject, OnModuleInit } from "@nestjs/common";
import { IEventHandler, EventHandlerRegistry } from "../event-handler.registry";
import { OutboxEvent } from "../../../domain/entities/event.entity";
import { EVENT_TYPES, OrderCreatedPayload } from "../event-types";
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../../domain/ports/merchant.repository";
import {
  ICustomerRepository,
  CUSTOMER_REPOSITORY,
} from "../../../domain/ports/customer.repository";
import { OutboxService } from "../outbox.service";
import { WebSocketService } from "../../../infrastructure/websocket/websocket.service";

/**
 * Handles OrderCreated events - sends merchant alerts, updates customer stats, and pushes real-time notifications
 */
@Injectable()
export class OrderCreatedHandler implements IEventHandler, OnModuleInit {
  readonly eventType = EVENT_TYPES.ORDER_CREATED;
  private readonly logger = new Logger(OrderCreatedHandler.name);

  constructor(
    private readonly eventHandlerRegistry: EventHandlerRegistry,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepository: IMerchantRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
    private readonly outboxService: OutboxService,
    private readonly webSocketService: WebSocketService,
  ) {}

  onModuleInit(): void {
    this.eventHandlerRegistry.registerHandler(this);
  }

  async handle(event: OutboxEvent): Promise<void> {
    const payload = event.payload as unknown as OrderCreatedPayload;

    this.logger.log({
      msg: "Processing OrderCreated event",
      eventId: event.id,
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      total: payload.total,
    });

    // Send real-time WebSocket notification
    this.notifyViaWebSocket(event.merchantId, payload);

    // Update customer statistics
    if (payload.customerId) {
      await this.updateCustomerStats(
        payload.customerId,
        event.merchantId,
        payload.total,
      );
    }

    // Alert merchant about new order
    await this.alertMerchant(event.merchantId, payload, event.correlationId);
  }

  /**
   * Push real-time notification via WebSocket
   */
  private notifyViaWebSocket(
    merchantId: string,
    payload: OrderCreatedPayload,
  ): void {
    try {
      // Notify about new order
      this.webSocketService.notifyOrderCreated(merchantId, {
        id: payload.orderId,
        orderNumber: payload.orderNumber,
        customerName: "عميل جديد", // Will be enhanced with actual name
        total: payload.total,
        status: "CONFIRMED",
        items: [],
      });

      this.logger.debug({
        msg: "WebSocket notification sent for new order",
        merchantId,
        orderNumber: payload.orderNumber,
      });
    } catch (error: any) {
      this.logger.warn({
        msg: "Failed to send WebSocket notification",
        merchantId,
        error: error.message,
      });
      // Don't throw - WebSocket notification is not critical
    }
  }

  private async updateCustomerStats(
    customerId: string,
    merchantId: string,
    orderTotal: number,
  ): Promise<void> {
    try {
      const customer = await this.customerRepository.findById(customerId);

      if (customer) {
        await this.customerRepository.update(customerId, {
          totalOrders: customer.totalOrders + 1,
          totalSpent: customer.totalSpent + orderTotal,
        });

        this.logger.debug({
          message: "Customer stats updated",
          customerId,
          totalOrders: customer.totalOrders + 1,
          totalSpent: customer.totalSpent + orderTotal,
        });
      }
    } catch (error: any) {
      this.logger.error({
        message: "Failed to update customer stats",
        customerId,
        error: error.message,
      });
      // Don't throw - this is a side effect that shouldn't fail the main event
    }
  }

  private async alertMerchant(
    merchantId: string,
    orderPayload: OrderCreatedPayload,
    correlationId?: string,
  ): Promise<void> {
    try {
      const merchant = await this.merchantRepository.findById(merchantId);

      if (!merchant) {
        this.logger.warn({
          msg: "Merchant not found for order alert",
          merchantId,
        });
        return;
      }

      // Publish merchant alert event
      await this.outboxService.publishEvent({
        eventType: EVENT_TYPES.MERCHANT_ALERTED,
        aggregateType: "merchant",
        aggregateId: merchantId,
        merchantId,
        correlationId,
        payload: {
          merchantId,
          alertType: "new_order",
          message: `طلب جديد #${orderPayload.orderNumber} بقيمة ${orderPayload.total} جنيه`,
          metadata: {
            orderId: orderPayload.orderId,
            orderNumber: orderPayload.orderNumber,
            total: orderPayload.total,
            conversationId: orderPayload.conversationId,
          },
        },
      });

      this.logger.log({
        msg: "Merchant alert scheduled for new order",
        merchantId,
        orderNumber: orderPayload.orderNumber,
      });
    } catch (error: any) {
      this.logger.error({
        msg: "Failed to alert merchant",
        merchantId,
        error: error.message,
      });
    }
  }
}
