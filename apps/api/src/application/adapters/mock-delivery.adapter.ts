import { Injectable } from "@nestjs/common";
import {
  IDeliveryAdapter,
  DeliveryBookingRequest,
  DeliveryBookingResponse,
  DeliveryStatusRequest,
  DeliveryStatusResponse,
} from "./delivery-adapter.interface";
import { generateTrackingId } from "../../shared/utils/helpers";
import { createLogger } from "../../shared/logging/logger";

const logger = createLogger("MockDeliveryAdapter");

@Injectable()
export class MockDeliveryAdapter implements IDeliveryAdapter {
  readonly name = "mock";

  private shipments = new Map<
    string,
    {
      trackingId: string;
      status: string;
      events: Array<{
        timestamp: Date;
        status: string;
        description: string;
        location?: string;
      }>;
      estimatedDelivery: Date;
    }
  >();

  async bookDelivery(
    request: DeliveryBookingRequest,
  ): Promise<DeliveryBookingResponse> {
    logger.info("Mock: Booking delivery", { orderId: request.orderId });

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate occasional failures (10% failure rate)
    if (Math.random() < 0.1) {
      return {
        success: false,
        error: "Mock delivery booking failed - please try again",
      };
    }

    const trackingId = generateTrackingId();
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 2); // 2 days from now

    // Store in mock database
    this.shipments.set(trackingId, {
      trackingId,
      status: "pending",
      events: [
        {
          timestamp: new Date(),
          status: "pending",
          description: "Shipment created - awaiting pickup",
        },
      ],
      estimatedDelivery,
    });

    return {
      success: true,
      trackingId,
      courier: "MockCourier",
      estimatedDelivery,
    };
  }

  async getStatus(
    request: DeliveryStatusRequest,
  ): Promise<DeliveryStatusResponse> {
    logger.info("Mock: Getting delivery status", {
      trackingId: request.trackingId,
    });

    const shipment = this.shipments.get(request.trackingId);

    if (!shipment) {
      // Return a simulated status for unknown tracking IDs
      return {
        trackingId: request.trackingId,
        status: "unknown",
        statusDescription: "Tracking ID not found",
        lastUpdate: new Date(),
        events: [],
      };
    }

    // Simulate status progression
    const statusProgression = [
      "pending",
      "picked_up",
      "in_transit",
      "out_for_delivery",
      "delivered",
    ];
    const currentIndex = statusProgression.indexOf(shipment.status);

    // Randomly advance status (for demo purposes)
    if (currentIndex < statusProgression.length - 1 && Math.random() < 0.3) {
      const newStatus = statusProgression[currentIndex + 1];
      shipment.status = newStatus;
      shipment.events.push({
        timestamp: new Date(),
        status: newStatus,
        description: this.getStatusDescription(newStatus),
        location: "Cairo, Egypt",
      });
    }

    return {
      trackingId: shipment.trackingId,
      status: shipment.status,
      statusDescription: this.getStatusDescription(shipment.status),
      lastUpdate: shipment.events[shipment.events.length - 1].timestamp,
      estimatedDelivery: shipment.estimatedDelivery,
      actualDelivery: shipment.status === "delivered" ? new Date() : undefined,
      events: shipment.events,
    };
  }

  async cancelDelivery(trackingId: string): Promise<boolean> {
    logger.info("Mock: Cancelling delivery", { trackingId });

    const shipment = this.shipments.get(trackingId);

    if (!shipment) {
      return false;
    }

    if (
      shipment.status === "delivered" ||
      shipment.status === "out_for_delivery"
    ) {
      return false; // Cannot cancel delivered or out for delivery
    }

    shipment.status = "cancelled";
    shipment.events.push({
      timestamp: new Date(),
      status: "cancelled",
      description: "Shipment cancelled by merchant",
    });

    return true;
  }

  private getStatusDescription(status: string): string {
    const descriptions: Record<string, string> = {
      pending: "الشحنة في انتظار الاستلام من المتجر",
      picked_up: "تم استلام الشحنة من المتجر",
      in_transit: "الشحنة في الطريق",
      out_for_delivery: "الشحنة خرجت للتوصيل",
      delivered: "تم التوصيل بنجاح",
      cancelled: "تم إلغاء الشحنة",
      unknown: "حالة غير معروفة",
    };
    return descriptions[status] || "حالة غير معروفة";
  }
}
