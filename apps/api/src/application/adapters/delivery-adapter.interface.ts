import { Address } from "../../shared/schemas";

export interface DeliveryBookingRequest {
  orderId: string;
  merchantId: string;
  customerName: string;
  customerPhone: string;
  pickupAddress?: Address;
  deliveryAddress: Address;
  items: Array<{
    name: string;
    quantity: number;
    weight?: number;
  }>;
  totalValue: number;
  codAmount?: number;
  notes?: string;
}

export interface DeliveryBookingResponse {
  success: boolean;
  trackingId?: string;
  courier?: string;
  estimatedDelivery?: Date;
  error?: string;
}

export interface DeliveryStatusRequest {
  trackingId: string;
}

export interface DeliveryStatusResponse {
  trackingId: string;
  status: string;
  statusDescription: string;
  lastUpdate: Date;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  events: Array<{
    timestamp: Date;
    status: string;
    description: string;
    location?: string;
  }>;
}

export interface IDeliveryAdapter {
  readonly name: string;

  bookDelivery(
    request: DeliveryBookingRequest,
  ): Promise<DeliveryBookingResponse>;
  getStatus(request: DeliveryStatusRequest): Promise<DeliveryStatusResponse>;
  cancelDelivery(trackingId: string): Promise<boolean>;
}

export const DELIVERY_ADAPTER = Symbol("IDeliveryAdapter");
