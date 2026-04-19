import { Injectable, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../database/database.module";
import { ICustomerRepository } from "../../domain/ports/customer.repository";
import {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
} from "../../domain/entities/customer.entity";
import { generateId } from "../../shared/utils/helpers";

@Injectable()
export class CustomerRepository implements ICustomerRepository {
  constructor(@Inject(DATABASE_POOL) private pool: Pool) {}

  async findById(id: string): Promise<Customer | null> {
    const result = await this.pool.query(
      `SELECT * FROM customers WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findByMerchantAndSender(
    merchantId: string,
    senderId: string,
  ): Promise<Customer | null> {
    const result = await this.pool.query(
      `SELECT * FROM customers WHERE merchant_id = $1 AND sender_id = $2`,
      [merchantId, senderId],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findByPhone(
    merchantId: string,
    phone: string,
  ): Promise<Customer | null> {
    const result = await this.pool.query(
      `SELECT * FROM customers WHERE merchant_id = $1 AND phone = $2`,
      [merchantId, phone],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async create(input: CreateCustomerInput): Promise<Customer> {
    const id = generateId();
    const result = await this.pool.query(
      `INSERT INTO customers (id, merchant_id, sender_id, phone, name, address, preferences, last_interaction_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        id,
        input.merchantId,
        input.senderId,
        input.phone || null,
        input.name || null,
        input.address ? JSON.stringify(input.address) : null,
        JSON.stringify({}),
      ],
    );
    return this.mapToEntity(result.rows[0]);
  }

  async update(
    id: string,
    input: UpdateCustomerInput,
  ): Promise<Customer | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(input.phone);
    }
    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(JSON.stringify(input.address));
    }
    if (input.preferences !== undefined) {
      updates.push(`preferences = $${paramIndex++}`);
      values.push(
        JSON.stringify({ ...existing.preferences, ...input.preferences }),
      );
    }
    if (input.totalOrders !== undefined) {
      updates.push(`total_orders = $${paramIndex++}`);
      values.push(input.totalOrders);
    }
    if (input.lastInteractionAt !== undefined) {
      updates.push(`last_interaction_at = $${paramIndex++}`);
      values.push(input.lastInteractionAt.toISOString());
    }

    if (updates.length === 0) return existing;

    values.push(id);
    const result = await this.pool.query(
      `UPDATE customers SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    return this.mapToEntity(result.rows[0]);
  }

  private mapToEntity(row: Record<string, unknown>): Customer {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      senderId: row.sender_id as string,
      phone: row.phone as string | undefined,
      name: row.name as string | undefined,
      address: row.address as Customer["address"],
      preferences: row.preferences as Customer["preferences"],
      totalOrders: row.total_orders as number,
      lastInteractionAt: row.last_interaction_at
        ? new Date(row.last_interaction_at as string)
        : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
