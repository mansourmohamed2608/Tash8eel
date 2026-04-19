import { Pool } from "pg";
import { IShipmentRepository } from "../../domain/ports/shipment.repository";
import { Shipment, CreateShipmentInput, UpdateShipmentInput } from "../../domain/entities/shipment.entity";
export declare class ShipmentRepository implements IShipmentRepository {
    private pool;
    constructor(pool: Pool);
    findById(id: string): Promise<Shipment | null>;
    findByOrderId(orderId: string): Promise<Shipment | null>;
    findByTrackingId(trackingId: string): Promise<Shipment | null>;
    create(input: CreateShipmentInput): Promise<Shipment>;
    update(id: string, input: UpdateShipmentInput): Promise<Shipment | null>;
    addStatusEntry(id: string, status: string, description?: string): Promise<Shipment | null>;
    updateStatus(id: string, status: string, description?: string): Promise<Shipment | null>;
    private mapToEntity;
}
