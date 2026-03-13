import { IDeliveryAdapter, DeliveryBookingRequest, DeliveryBookingResponse, DeliveryStatusRequest, DeliveryStatusResponse } from "./delivery-adapter.interface";
export declare class MockDeliveryAdapter implements IDeliveryAdapter {
    readonly name = "mock";
    private shipments;
    bookDelivery(request: DeliveryBookingRequest): Promise<DeliveryBookingResponse>;
    getStatus(request: DeliveryStatusRequest): Promise<DeliveryStatusResponse>;
    cancelDelivery(trackingId: string): Promise<boolean>;
    private getStatusDescription;
}
