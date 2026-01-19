import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { IEventHandler, EventHandlerRegistry } from '../event-handler.registry';
import { OutboxEvent } from '../../../domain/entities/event.entity';
import { EVENT_TYPES, ShipmentBookedPayload } from '../event-types';
import { IOrderRepository, ORDER_REPOSITORY } from '../../../domain/ports/order.repository';
import { OrderStatus } from '../../../shared/constants/enums';

/**
 * Handles ShipmentBooked events - updates order with shipment info
 */
@Injectable()
export class ShipmentBookedHandler implements IEventHandler, OnModuleInit {
  readonly eventType = EVENT_TYPES.SHIPMENT_BOOKED;
  private readonly logger = new Logger(ShipmentBookedHandler.name);

  constructor(
    private readonly eventHandlerRegistry: EventHandlerRegistry,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
  ) {}

  onModuleInit(): void {
    this.eventHandlerRegistry.registerHandler(this);
  }

  async handle(event: OutboxEvent): Promise<void> {
    const payload = event.payload as unknown as ShipmentBookedPayload;

    this.logger.log({
      msg: 'Processing ShipmentBooked event',
      eventId: event.id,
      orderId: payload.orderId,
      trackingId: payload.trackingId,
      courier: payload.courier,
    });

    // Update order status
    const order = await this.orderRepository.findById(payload.orderId);
    
    if (order) {
      await this.orderRepository.update(order.id, {
        status: OrderStatus.SHIPPED,
      });

      this.logger.log({
        message: 'Order status updated to shipped',
        orderId: payload.orderId,
        orderNumber: order.orderNumber,
      });
    } else {
      this.logger.warn({
        message: 'Order not found for shipment event',
        orderId: payload.orderId,
        merchantId: event.merchantId,
      });
    }
  }
}
