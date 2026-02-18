import { OrderStatus } from "../../shared/constants/enums";
import { CartItem, Address } from "../../shared/schemas";

export interface Order {
  id: string;
  merchantId: string;
  conversationId: string;
  customerId?: string;
  orderNumber: string;
  status: OrderStatus;
  items: CartItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: Address;
  deliveryNotes?: string;
  deliveryPreference?: string;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
  // Additional properties
  shippingAddress?: string;
  paymentMethod?: string;
}

export interface CreateOrderInput {
  merchantId: string;
  conversationId: string;
  customerId?: string;
  orderNumber: string;
  items: CartItem[];
  subtotal: number;
  discount?: number;
  deliveryFee?: number;
  total: number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: Address;
  deliveryNotes?: string;
  deliveryPreference?: string;
  idempotencyKey?: string;
}

export interface UpdateOrderInput {
  status?: OrderStatus;
  deliveryFee?: number;
  total?: number;
}
