export interface ShipmentStatusEntry {
    status: string;
    timestamp: Date;
    description?: string;
}
export interface Shipment {
    id: string;
    orderId: string;
    merchantId: string;
    trackingId?: string;
    courier?: string;
    status: string;
    statusHistory: ShipmentStatusEntry[];
    estimatedDelivery?: Date;
    actualDelivery?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface CreateShipmentInput {
    orderId: string;
    merchantId: string;
    trackingId?: string;
    courier?: string;
    estimatedDelivery?: Date;
}
export interface UpdateShipmentInput {
    trackingId?: string;
    courier?: string;
    status?: string;
    estimatedDelivery?: Date;
    actualDelivery?: Date;
}
