import {
  Shipment,
  CreateShipmentInput,
  UpdateShipmentInput,
} from '../entities/shipment.entity';

export interface IShipmentRepository {
  findById(id: string): Promise<Shipment | null>;
  findByOrderId(orderId: string): Promise<Shipment | null>;
  findByTrackingId(trackingId: string): Promise<Shipment | null>;
  create(input: CreateShipmentInput): Promise<Shipment>;
  update(id: string, input: UpdateShipmentInput): Promise<Shipment | null>;
  updateStatus(id: string, status: string, description?: string): Promise<Shipment | null>;
  addStatusEntry(id: string, status: string, description?: string): Promise<Shipment | null>;
}

export const SHIPMENT_REPOSITORY = Symbol('IShipmentRepository');
