import { Injectable, Logger, Inject, OnModuleInit } from "@nestjs/common";
import { IEventHandler, EventHandlerRegistry } from "../event-handler.registry";
import { OutboxEvent } from "../../../domain/entities/event.entity";
import { EVENT_TYPES, DeliveryStatusUpdatedPayload } from "../event-types";
import {
  IShipmentRepository,
  SHIPMENT_REPOSITORY,
} from "../../../domain/ports/shipment.repository";
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from "../../../domain/ports/order.repository";
import {
  IConversationRepository,
  CONVERSATION_REPOSITORY,
} from "../../../domain/ports/conversation.repository";
import { OutboxService } from "../outbox.service";
import {
  OrderStatus,
  ConversationState,
} from "../../../shared/constants/enums";
import { WebSocketService } from "../../../infrastructure/websocket/websocket.service";

/**
 * Handles DeliveryStatusUpdated events - updates shipment and order status, sends real-time notifications
 */
@Injectable()
export class DeliveryStatusHandler implements IEventHandler, OnModuleInit {
  readonly eventType = EVENT_TYPES.DELIVERY_STATUS_UPDATED;
  private readonly logger = new Logger(DeliveryStatusHandler.name);

  constructor(
    private readonly eventHandlerRegistry: EventHandlerRegistry,
    @Inject(SHIPMENT_REPOSITORY)
    private readonly shipmentRepository: IShipmentRepository,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
    private readonly outboxService: OutboxService,
    private readonly webSocketService: WebSocketService,
  ) {}

  onModuleInit(): void {
    this.eventHandlerRegistry.registerHandler(this);
  }

  async handle(event: OutboxEvent): Promise<void> {
    const payload = event.payload as unknown as DeliveryStatusUpdatedPayload;
    const merchantId = event.merchantId;

    if (!merchantId) {
      this.logger.warn({
        msg: "Skipping DeliveryStatusUpdated event without merchantId",
        eventId: event.id,
      });
      return;
    }

    this.logger.log({
      msg: "Processing DeliveryStatusUpdated event",
      eventId: event.id,
      shipmentId: payload.shipmentId,
      status: payload.status,
    });

    // Update shipment status
    const shipment = await this.shipmentRepository.findById(payload.shipmentId);

    if (!shipment) {
      this.logger.warn({
        msg: "Shipment not found",
        shipmentId: payload.shipmentId,
      });
      return;
    }

    await this.shipmentRepository.updateStatus(
      payload.shipmentId,
      payload.status,
      payload.statusDescription,
    );

    // Update order status based on delivery status
    const order = await this.orderRepository.findById(payload.orderId);

    if (order) {
      let newOrderStatus = order.status;

      if (payload.status === "delivered") {
        newOrderStatus = OrderStatus.DELIVERED;

        // Also close the conversation
        const conversation = order.customerId
          ? await this.conversationRepository.findByMerchantAndSender(
              merchantId,
              order.customerId,
            )
          : null;

        if (conversation) {
          await this.conversationRepository.update(conversation.id, {
            state: ConversationState.CLOSED,
            closedAt: new Date(),
          });

          // Emit conversation closed event
          await this.outboxService.publishEvent({
            eventType: EVENT_TYPES.CONVERSATION_CLOSED,
            aggregateType: "conversation",
            aggregateId: conversation.id,
            merchantId,
            correlationId: event.correlationId,
            payload: {
              conversationId: conversation.id,
              merchantId,
              reason: "Order delivered",
            },
          });
        }
      } else if (payload.status === "failed" || payload.status === "returned") {
        newOrderStatus = OrderStatus.CANCELLED;
      } else if (payload.status === "out_for_delivery") {
        newOrderStatus = OrderStatus.OUT_FOR_DELIVERY;
      }

      if (newOrderStatus !== order.status) {
        await this.orderRepository.update(order.id, {
          status: newOrderStatus,
        });

        // Send real-time WebSocket notification
        this.webSocketService.notifyDeliveryStatusUpdated(merchantId, {
          orderId: order.id,
          trackingNumber: payload.trackingId,
          status: payload.status,
          estimatedDelivery: undefined,
          currentLocation: undefined,
        });

        // Also notify about order status change
        this.webSocketService.notifyOrderStatusChanged(
          merchantId,
          {
            id: order.id,
            orderNumber: order.orderNumber,
            status: newOrderStatus,
          },
          order.status,
        );

        this.logger.log({
          msg: "Order status updated",
          orderId: order.id,
          oldStatus: order.status,
          newStatus: newOrderStatus,
        });
      }
    }
  }
}
