import { IOrderRepository } from "../../domain/ports/order.repository";
import { IShipmentRepository } from "../../domain/ports/shipment.repository";
interface OrderResponseDto {
    id: string;
    orderNumber: string;
    merchantId: string;
    conversationId: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: unknown;
    deliveryNotes?: string;
    items: unknown[];
    subtotal: number;
    deliveryFee: number;
    discount: number;
    total: number;
    status: string;
    shipment?: ShipmentDto;
    createdAt: Date;
    updatedAt: Date;
}
interface ShipmentDto {
    id: string;
    trackingId?: string;
    courier?: string;
    status: string;
    estimatedDelivery?: Date;
    statusHistory: unknown[];
}
export declare class OrdersController {
    private readonly orderRepo;
    private readonly shipmentRepo;
    private readonly logger;
    constructor(orderRepo: IOrderRepository, shipmentRepo: IShipmentRepository);
    getOrder(id: string, merchantId: string): Promise<OrderResponseDto>;
    listOrders(merchantId: string, status?: string, limit?: number, offset?: number): Promise<{
        orders: OrderResponseDto[];
        total: number;
    }>;
    getOrderByNumber(orderNumber: string, merchantId: string): Promise<OrderResponseDto>;
    private mapOrderToDto;
}
export {};
