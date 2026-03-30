import {
  Controller,
  Get,
  Param,
  Logger,
  NotFoundException,
  Inject,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { UseGuards } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

/**
 * Public Order Tracking Controller
 *
 * Customer-facing, no authentication required.
 * Identified by order_number (shown on WhatsApp confirmation).
 * Returns only safe, customer-visible fields.
 */
@ApiTags("Public Order Tracking")
@Controller("v1/public/orders")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class PublicOrdersController {
  private readonly logger = new Logger(PublicOrdersController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get(":orderNumber")
  @ApiOperation({ summary: "Track order by order number (public, no auth)" })
  @ApiParam({
    name: "orderNumber",
    description: "Order number as shown in WhatsApp confirmation",
  })
  @ApiResponse({ status: 200, description: "Order tracking info" })
  @ApiResponse({ status: 404, description: "Order not found" })
  async trackOrder(@Param("orderNumber") orderNumber: string): Promise<any> {
    if (!orderNumber || orderNumber.length < 3 || orderNumber.length > 50) {
      throw new NotFoundException("Order not found");
    }

    // Find order by order_number (publicly visible)
    const orderResult = await this.pool.query(
      `SELECT
         o.id,
         o.order_number,
         o.status,
         o.created_at,
         o.updated_at,
         o.total_price,
         o.currency,
         o.notes,
         s.tracking_id,
         s.courier,
         s.status AS shipment_status,
         s.estimated_delivery
       FROM orders o
       LEFT JOIN shipments s ON s.order_id = o.id
       WHERE o.order_number = $1
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [orderNumber.toUpperCase()],
    );

    if (orderResult.rows.length === 0) {
      throw new NotFoundException("Order not found");
    }

    const row = orderResult.rows[0];

    // Load items
    let items: any[] = [];
    try {
      // Try order_items table first
      const itemsResult = await this.pool.query(
        `SELECT
           name,
           quantity,
           unit_price,
           total_price
         FROM order_items
         WHERE order_id = $1
         ORDER BY id`,
        [row.id],
      );
      if (itemsResult.rows.length > 0) {
        items = itemsResult.rows.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: Number(i.unit_price) || 0,
          totalPrice: Number(i.total_price) || 0,
        }));
      } else {
        // Fallback: parse items from orders.items JSON column
        const rawResult = await this.pool.query(
          `SELECT items FROM orders WHERE id = $1`,
          [row.id],
        );
        const raw = rawResult.rows[0]?.items;
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed)) {
            items = parsed.map((i: any) => ({
              name: i.name || i.productName || i.product_name || "منتج",
              quantity: Number(i.quantity || i.qty || 1),
              unitPrice: Number(i.unitPrice || i.unit_price || i.price || 0),
              totalPrice: Number(i.totalPrice || i.total_price || i.total || 0),
            }));
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to load order items for public tracking: ${String(err)}`,
      );
    }

    const statusLabels: Record<string, string> = {
      PENDING: "قيد الانتظار",
      DRAFT: "مسودة",
      CONFIRMED: "مؤكد",
      BOOKED: "تم الحجز",
      SHIPPED: "تم الشحن",
      OUT_FOR_DELIVERY: "قيد التوصيل",
      DELIVERED: "تم التوصيل",
      COMPLETED: "مكتمل",
      CANCELLED: "ملغي",
      FAILED: "فشل",
    };

    const statusOrder = [
      "DRAFT",
      "PENDING",
      "CONFIRMED",
      "BOOKED",
      "SHIPPED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "COMPLETED",
    ];

    const currentStatus = (row.status || "PENDING").toUpperCase();
    const currentStep = statusOrder.indexOf(currentStatus);

    const timeline = statusOrder
      .filter((s) => !["CANCELLED", "FAILED"].includes(s))
      .map((s, idx) => ({
        status: s,
        label: statusLabels[s] || s,
        completed: idx <= currentStep,
        active: s === currentStatus,
      }));

    return {
      orderNumber: row.order_number,
      status: currentStatus,
      statusLabel: statusLabels[currentStatus] || currentStatus,
      isCancelled: currentStatus === "CANCELLED" || currentStatus === "FAILED",
      isDelivered:
        currentStatus === "DELIVERED" || currentStatus === "COMPLETED",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      totalPrice: Number(row.total_price) || 0,
      currency: row.currency || "EGP",
      notes: row.notes || null,
      tracking: row.tracking_id
        ? {
            trackingId: row.tracking_id,
            courier: row.courier || null,
            shipmentStatus: row.shipment_status || null,
            estimatedDelivery: row.estimated_delivery || null,
          }
        : null,
      items,
      timeline,
    };
  }
}
