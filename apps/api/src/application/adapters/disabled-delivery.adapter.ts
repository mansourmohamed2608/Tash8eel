import { Injectable } from "@nestjs/common";
import {
  IDeliveryAdapter,
  DeliveryBookingRequest,
  DeliveryBookingResponse,
  DeliveryStatusRequest,
  DeliveryStatusResponse,
} from "./delivery-adapter.interface";

@Injectable()
export class DisabledDeliveryAdapter implements IDeliveryAdapter {
  readonly name = "disabled";

  async bookDelivery(
    _request: DeliveryBookingRequest,
  ): Promise<DeliveryBookingResponse> {
    return {
      success: false,
      error: "Delivery provider not configured",
    };
  }

  async getStatus(
    request: DeliveryStatusRequest,
  ): Promise<DeliveryStatusResponse> {
    return {
      trackingId: request.trackingId,
      status: "unknown",
      statusDescription: "Delivery provider not configured",
      lastUpdate: new Date(),
      events: [],
    };
  }

  async cancelDelivery(_trackingId: string): Promise<boolean> {
    return false;
  }
}
