import {
  Order,
  CreateOrderInput,
  UpdateOrderInput,
} from "../entities/order.entity";
import { OrderStatus } from "../../shared/constants/enums";

export interface IOrderRepository {
  findById(id: string): Promise<Order | null>;
  findByOrderNumber(
    merchantId: string,
    orderNumber: string,
  ): Promise<Order | null>;
  findByIdempotencyKey(key: string): Promise<Order | null>;
  findByMerchant(merchantId: string, limit?: number): Promise<Order[]>;
  findByMerchantAndDateRange(
    merchantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Order[]>;
  create(input: CreateOrderInput): Promise<Order>;
  update(id: string, input: UpdateOrderInput): Promise<Order | null>;
  countByMerchantAndDate(merchantId: string, date: string): Promise<number>;
  sumRevenueByMerchantAndDate(
    merchantId: string,
    date: string,
  ): Promise<number>;
  countByMerchantDateAndStatus(
    merchantId: string,
    date: string,
    status: OrderStatus,
  ): Promise<number>;
}

export const ORDER_REPOSITORY = Symbol("IOrderRepository");
