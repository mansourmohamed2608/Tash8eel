import { Injectable, Logger } from "@nestjs/common";
import { EventsGateway } from "./events.gateway";

/**
 * Real-time WebSocket events
 */
export enum RealTimeEvent {
  // Order events
  ORDER_CREATED = "order:created",
  ORDER_UPDATED = "order:updated",
  ORDER_STATUS_CHANGED = "order:status_changed",
  ORDER_CANCELLED = "order:cancelled",

  // Delivery events
  DELIVERY_STATUS_UPDATED = "delivery:status_updated",
  DELIVERY_LOCATION_UPDATED = "delivery:location_updated",
  DELIVERY_COMPLETED = "delivery:completed",

  // Chat/Conversation events
  MESSAGE_RECEIVED = "message:received",
  MESSAGE_SENT = "message:sent",
  CONVERSATION_STARTED = "conversation:started",
  CONVERSATION_CLOSED = "conversation:closed",

  // Notification events
  NOTIFICATION = "notification",
  ALERT = "alert",

  // Dashboard events
  STATS_UPDATED = "stats:updated",
  REVENUE_UPDATED = "revenue:updated",

  // Inventory events
  STOCK_LOW = "stock:low",
  STOCK_OUT = "stock:out",
  STOCK_UPDATED = "stock:updated",

  // Customer events
  CUSTOMER_CREATED = "customer:created",
  CUSTOMER_UPDATED = "customer:updated",
}

export interface WebSocketPayload<T = any> {
  event: RealTimeEvent;
  data: T;
  timestamp: string;
  correlationId?: string;
}

@Injectable()
export class WebSocketService {
  private readonly logger = new Logger(WebSocketService.name);

  constructor(private readonly gateway: EventsGateway) {}

  /**
   * Emit an event to all connected clients of a merchant
   */
  emit<T>(
    merchantId: string,
    event: RealTimeEvent,
    data: T,
    correlationId?: string,
  ): void {
    const payload: WebSocketPayload<T> = {
      event,
      data,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    this.gateway.emitToMerchant(merchantId, event, payload);
    this.logger.debug(
      `WebSocket event emitted: ${event} to merchant ${merchantId}`,
    );
  }

  /**
   * Emit to specific event subscribers only
   */
  emitToSubscribers<T>(
    merchantId: string,
    event: RealTimeEvent,
    data: T,
  ): void {
    const payload: WebSocketPayload<T> = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    this.gateway.emitToSubscribers(merchantId, event, payload);
  }

  // ============================================
  // Convenience methods for common events
  // ============================================

  /**
   * Notify about new order
   */
  notifyOrderCreated(merchantId: string, order: any): void {
    this.emit(merchantId, RealTimeEvent.ORDER_CREATED, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: order.total,
      status: order.status,
      itemCount: order.items?.length || 0,
    });
  }

  /**
   * Notify about order status change
   */
  notifyOrderStatusChanged(
    merchantId: string,
    order: any,
    previousStatus: string,
  ): void {
    this.emit(merchantId, RealTimeEvent.ORDER_STATUS_CHANGED, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      previousStatus,
      newStatus: order.status,
      customerName: order.customerName,
    });
  }

  /**
   * Notify about delivery status update
   */
  notifyDeliveryStatusUpdated(merchantId: string, delivery: any): void {
    this.emit(merchantId, RealTimeEvent.DELIVERY_STATUS_UPDATED, {
      orderId: delivery.orderId,
      trackingNumber: delivery.trackingNumber,
      status: delivery.status,
      estimatedDelivery: delivery.estimatedDelivery,
      currentLocation: delivery.currentLocation,
    });
  }

  /**
   * Notify about new message received
   */
  notifyMessageReceived(merchantId: string, message: any): void {
    this.emit(merchantId, RealTimeEvent.MESSAGE_RECEIVED, {
      conversationId: message.conversationId,
      messageId: message.id,
      content: message.content,
      senderPhone: message.senderPhone,
      customerName: message.customerName,
      timestamp: message.createdAt,
    });
  }

  /**
   * Notify about message sent
   */
  notifyMessageSent(merchantId: string, message: any): void {
    this.emit(merchantId, RealTimeEvent.MESSAGE_SENT, {
      conversationId: message.conversationId,
      messageId: message.id,
      content: message.content,
      recipientPhone: message.recipientPhone,
    });
  }

  /**
   * Send notification to merchant
   */
  sendNotification(
    merchantId: string,
    notification: {
      title: string;
      message: string;
      type: "info" | "success" | "warning" | "error";
      action?: { label: string; url: string };
    },
  ): void {
    this.emit(merchantId, RealTimeEvent.NOTIFICATION, notification);
  }

  /**
   * Notify about low stock
   */
  notifyLowStock(merchantId: string, product: any): void {
    this.emit(merchantId, RealTimeEvent.STOCK_LOW, {
      productId: product.id,
      productName: product.name,
      currentStock: product.quantity,
      reorderLevel: product.reorderLevel,
    });
  }

  /**
   * Notify about out of stock
   */
  notifyOutOfStock(merchantId: string, product: any): void {
    this.emit(merchantId, RealTimeEvent.STOCK_OUT, {
      productId: product.id,
      productName: product.name,
    });
  }

  /**
   * Update dashboard stats in real-time
   */
  updateDashboardStats(
    merchantId: string,
    stats: {
      totalOrders?: number;
      pendingOrders?: number;
      todayRevenue?: number;
      activeConversations?: number;
    },
  ): void {
    this.emit(merchantId, RealTimeEvent.STATS_UPDATED, stats);
  }

  /**
   * Get count of connected clients for a merchant
   */
  getConnectedClientCount(merchantId: string): number {
    return this.gateway.getConnectedCount(merchantId);
  }
}
