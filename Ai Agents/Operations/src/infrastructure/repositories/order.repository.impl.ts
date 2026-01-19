import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { IOrderRepository } from '../../domain/ports/order.repository';
import { Order, CreateOrderInput, UpdateOrderInput } from '../../domain/entities/order.entity';
import { OrderStatus } from '../../shared/constants/enums';
import { generateId } from '../../shared/utils/helpers';

@Injectable()
export class OrderRepository implements IOrderRepository {
  constructor(@Inject(DATABASE_POOL) private pool: Pool) {}

  async findById(id: string): Promise<Order | null> {
    const result = await this.pool.query(`SELECT * FROM orders WHERE id = $1`, [id]);
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findByOrderNumber(merchantId: string, orderNumber: string): Promise<Order | null> {
    const result = await this.pool.query(
      `SELECT * FROM orders WHERE merchant_id = $1 AND order_number = $2`,
      [merchantId, orderNumber],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Order | null> {
    const result = await this.pool.query(
      `SELECT * FROM orders WHERE idempotency_key = $1`,
      [key],
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async findByMerchant(merchantId: string, limit = 100): Promise<Order[]> {
    const result = await this.pool.query(
      `SELECT * FROM orders WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [merchantId, limit],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapToEntity(row));
  }

  async findByMerchantAndDateRange(
    merchantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Order[]> {
    const result = await this.pool.query(
      `SELECT * FROM orders 
       WHERE merchant_id = $1 AND created_at >= $2 AND created_at < $3
       ORDER BY created_at DESC`,
      [merchantId, startDate.toISOString(), endDate.toISOString()],
    );
    return result.rows.map((row: Record<string, unknown>) => this.mapToEntity(row));
  }

  async create(input: CreateOrderInput): Promise<Order> {
    const id = generateId();
    const result = await this.pool.query(
      `INSERT INTO orders (id, merchant_id, conversation_id, customer_id, order_number, status, items, subtotal, discount, delivery_fee, total, customer_name, customer_phone, delivery_address, delivery_notes, delivery_preference, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        id,
        input.merchantId,
        input.conversationId,
        input.customerId || null,
        input.orderNumber,
        OrderStatus.DRAFT,
        JSON.stringify(input.items),
        input.subtotal,
        input.discount || 0,
        input.deliveryFee || 0,
        input.total,
        input.customerName || null,
        input.customerPhone || null,
        input.deliveryAddress ? JSON.stringify(input.deliveryAddress) : null,
        input.deliveryNotes || null,
        input.deliveryPreference || null,
        input.idempotencyKey || null,
      ],
    );
    return this.mapToEntity(result.rows[0]);
  }

  async update(id: string, input: UpdateOrderInput): Promise<Order | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.deliveryFee !== undefined) {
      updates.push(`delivery_fee = $${paramIndex++}`);
      values.push(input.deliveryFee);
    }
    if (input.total !== undefined) {
      updates.push(`total = $${paramIndex++}`);
      values.push(input.total);
    }

    if (updates.length === 0) return this.findById(id);

    values.push(id);
    const result = await this.pool.query(
      `UPDATE orders SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );
    return result.rows[0] ? this.mapToEntity(result.rows[0]) : null;
  }

  async countByMerchantAndDate(merchantId: string, date: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND DATE(created_at) = $2`,
      [merchantId, date],
    );
    return parseInt(result.rows[0].count, 10);
  }

  async sumRevenueByMerchantAndDate(merchantId: string, date: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT COALESCE(SUM(total), 0) as revenue FROM orders 
       WHERE merchant_id = $1 AND DATE(created_at) = $2 AND status NOT IN ('CANCELLED', 'DRAFT')`,
      [merchantId, date],
    );
    return parseFloat(result.rows[0].revenue);
  }

  async countByMerchantDateAndStatus(merchantId: string, date: string, status: OrderStatus): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) FROM orders WHERE merchant_id = $1 AND DATE(created_at) = $2 AND status = $3`,
      [merchantId, date, status],
    );
    return parseInt(result.rows[0].count, 10);
  }

  private mapToEntity(row: Record<string, unknown>): Order {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      conversationId: row.conversation_id as string,
      customerId: row.customer_id as string | undefined,
      orderNumber: row.order_number as string,
      status: row.status as OrderStatus,
      items: row.items as Order['items'],
      subtotal: parseFloat(row.subtotal as string),
      discount: parseFloat(row.discount as string),
      deliveryFee: parseFloat(row.delivery_fee as string),
      total: parseFloat(row.total as string),
      customerName: row.customer_name as string | undefined,
      customerPhone: row.customer_phone as string | undefined,
      deliveryAddress: row.delivery_address as Order['deliveryAddress'],
      deliveryNotes: row.delivery_notes as string | undefined,
      deliveryPreference: row.delivery_preference as string | undefined,
      idempotencyKey: row.idempotency_key as string | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
