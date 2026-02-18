import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module";
import { IShipmentRepository } from "../../domain/ports/shipment.repository";
import {
  Shipment,
  CreateShipmentInput,
  UpdateShipmentInput,
} from "../../domain/entities/shipment.entity";
import { generateId } from "../../shared/utils/helpers";

@Injectable()
export class ShipmentRepository implements IShipmentRepository {
  constructor(@Inject(DATABASE_POOL) private pool: Pool) {}

  async findById(id: string): Promise<Shipment | null> {
    const result = await this.pool.query(
      `SELECT * FROM shipments WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findByOrderId(orderId: string): Promise<Shipment | null> {
    const result = await this.pool.query(
      `SELECT * FROM shipments WHERE order_id = $1`,
      [orderId],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findByTrackingId(trackingId: string): Promise<Shipment | null> {
    const result = await this.pool.query(
      `SELECT * FROM shipments WHERE tracking_id = $1`,
      [trackingId],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async create(input: CreateShipmentInput): Promise<Shipment> {
    const id = generateId();
    const initialStatus = {
      status: "pending",
      timestamp: new Date(),
      description: "Shipment created",
    };

    const result = await this.pool.query(
      `INSERT INTO shipments (id, order_id, merchant_id, tracking_id, courier, status, status_history, estimated_delivery)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        input.orderId,
        input.merchantId,
        input.trackingId || null,
        input.courier || null,
        "pending",
        JSON.stringify([initialStatus]),
        input.estimatedDelivery?.toISOString() || null,
      ],
    );
    return this.mapToEntity(result.rows[0]);
  }

  async update(
    id: string,
    input: UpdateShipmentInput,
  ): Promise<Shipment | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.trackingId !== undefined) {
      updates.push(`tracking_id = $${paramIndex++}`);
      values.push(input.trackingId);
    }
    if (input.courier !== undefined) {
      updates.push(`courier = $${paramIndex++}`);
      values.push(input.courier);
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.estimatedDelivery !== undefined) {
      updates.push(`estimated_delivery = $${paramIndex++}`);
      values.push(input.estimatedDelivery.toISOString());
    }
    if (input.actualDelivery !== undefined) {
      updates.push(`actual_delivery = $${paramIndex++}`);
      values.push(input.actualDelivery.toISOString());
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    const result = await this.pool.query(
      `UPDATE shipments SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async addStatusEntry(
    id: string,
    status: string,
    description?: string,
  ): Promise<Shipment | null> {
    const entry = { status, timestamp: new Date(), description };
    const result = await this.pool.query(
      `UPDATE shipments 
       SET status = $1, status_history = status_history || $2::jsonb
       WHERE id = $3
       RETURNING *`,
      [status, JSON.stringify(entry), id],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async updateStatus(
    id: string,
    status: string,
    description?: string,
  ): Promise<Shipment | null> {
    return this.addStatusEntry(id, status, description);
  }

  private mapToEntity(row: Record<string, unknown>): Shipment {
    return {
      id: row.id as string,
      orderId: row.order_id as string,
      merchantId: row.merchant_id as string,
      trackingId: row.tracking_id as string | undefined,
      courier: row.courier as string | undefined,
      status: row.status as string,
      statusHistory: row.status_history as Shipment["statusHistory"],
      estimatedDelivery: row.estimated_delivery
        ? new Date(row.estimated_delivery as string)
        : undefined,
      actualDelivery: row.actual_delivery
        ? new Date(row.actual_delivery as string)
        : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
