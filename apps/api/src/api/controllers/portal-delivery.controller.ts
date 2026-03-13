import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { EntitlementGuard } from "../../shared/guards/entitlement.guard";
import { RolesGuard } from "../../shared/guards/roles.guard";
import {
  getMerchantId,
  toBoolean,
  getAutoAssignSettingsForMerchant,
  loadActiveDriversWithLoad,
  pickNextDriver,
} from "./portal-compat.helpers";

const DRIVER_ASSIGNABLE_ORDER_STATUSES = [
  "CONFIRMED",
  "BOOKED",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
];

@ApiTags("Merchant Portal Compatibility")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalDeliveryController {
  private readonly logger = new Logger(PortalDeliveryController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get("delivery/auto-assign-settings")
  @ApiOperation({ summary: "Get delivery auto-assign settings" })
  async getDeliveryAutoAssignSettings(@Req() req: Request) {
    return getAutoAssignSettingsForMerchant(getMerchantId(req), this.pool);
  }

  @Put("delivery/auto-assign-settings")
  @ApiOperation({ summary: "Update delivery auto-assign settings" })
  async updateDeliveryAutoAssignSettings(
    @Req() req: Request,
    @Body()
    body: { autoAssign?: boolean; mode?: string; notifyCustomer?: boolean },
  ) {
    const merchantId = getMerchantId(req);
    const current = await getAutoAssignSettingsForMerchant(merchantId, this.pool);
    const allowedModes = new Set(["least_load", "round_robin", "nearest"]);
    const next = {
      autoAssign:
        body.autoAssign !== undefined
          ? toBoolean(body.autoAssign)
          : current.autoAssign,
      mode: body.mode ? String(body.mode).toLowerCase() : current.mode,
      notifyCustomer:
        body.notifyCustomer !== undefined
          ? toBoolean(body.notifyCustomer)
          : current.notifyCustomer,
    };

    if (!allowedModes.has(next.mode)) {
      throw new BadRequestException("وضع التعيين غير مدعوم");
    }

    try {
      await this.pool.query(
        `UPDATE merchants
         SET auto_assign_delivery = $2,
             delivery_assignment_mode = $3,
             notify_customer_on_assign = $4,
             updated_at = NOW()
         WHERE id = $1`,
        [merchantId, next.autoAssign, next.mode, next.notifyCustomer],
      );
    } catch (error: any) {
      if (!["42703"].includes(error?.code)) throw error;
      await this.pool.query(
        `UPDATE merchants
         SET config = COALESCE(config, '{}'::jsonb)
           || jsonb_build_object(
             'autoAssignDelivery', $2::boolean,
             'deliveryAssignmentMode', $3::text,
             'notifyCustomerOnAssign', $4::boolean
           ),
             updated_at = NOW()
         WHERE id = $1`,
        [merchantId, next.autoAssign, next.mode, next.notifyCustomer],
      );
    }

    return next;
  }

  @Post("orders/:orderId/auto-assign-driver")
  @ApiOperation({ summary: "Auto-assign best available driver for one order" })
  @ApiParam({ name: "orderId", description: "Order id or order number" })
  async autoAssignDriverForOrder(
    @Req() req: Request,
    @Param("orderId") orderId: string,
  ) {
    const merchantId = getMerchantId(req);
    const settings = await getAutoAssignSettingsForMerchant(merchantId, this.pool);

    const orderResult = await this.pool.query<{
      id: string;
      order_number: string;
      status: string;
      assigned_driver_id: string | null;
    }>(
      `SELECT id::text as id, order_number, status::text as status, assigned_driver_id::text as assigned_driver_id
       FROM orders
       WHERE merchant_id = $1
         AND (id::text = $2 OR order_number = $2)
       LIMIT 1`,
      [merchantId, orderId],
    );

    if (orderResult.rows.length === 0) {
      throw new NotFoundException("الطلب غير موجود");
    }

    const order = orderResult.rows[0];
    const normalizedStatus = String(order.status || "").toUpperCase();
    if (order.assigned_driver_id) {
      return {
        assigned: false,
        reason: "already_assigned",
        orderId: order.id,
        orderNumber: order.order_number,
        driverId: order.assigned_driver_id,
      };
    }

    if (!DRIVER_ASSIGNABLE_ORDER_STATUSES.includes(normalizedStatus)) {
      return {
        assigned: false,
        reason: "not_assignable_status",
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        allowedStatuses: DRIVER_ASSIGNABLE_ORDER_STATUSES,
      };
    }

    const drivers = await loadActiveDriversWithLoad(merchantId, this.pool);
    const nextDriver = pickNextDriver(drivers);
    if (!nextDriver) {
      throw new BadRequestException("لا يوجد سائقون نشطون للتعيين");
    }

    const updateResult = await this.pool.query(
      `UPDATE orders
       SET assigned_driver_id = $1, updated_at = NOW()
       WHERE merchant_id = $2 AND id::text = $3 AND assigned_driver_id IS NULL
       RETURNING id::text as id, order_number`,
      [nextDriver.id, merchantId, order.id],
    );

    if (updateResult.rows.length === 0) {
      return {
        assigned: false,
        reason: "concurrent_update",
        orderId: order.id,
        orderNumber: order.order_number,
      };
    }

    return {
      assigned: true,
      orderId: order.id,
      orderNumber: order.order_number,
      mode: settings.mode,
      notifyCustomer: settings.notifyCustomer,
      driver: {
        id: nextDriver.id,
        name: nextDriver.name,
        phone: nextDriver.phone,
      },
    };
  }

  @Post("delivery/auto-assign-all")
  @ApiOperation({ summary: "Auto-assign all unassigned delivery orders" })
  async autoAssignAllOrders(@Req() req: Request) {
    const merchantId = getMerchantId(req);
    const settings = await getAutoAssignSettingsForMerchant(merchantId, this.pool);

    const unassignedOrdersResult = await this.pool.query<{
      id: string;
      order_number: string;
      status: string;
    }>(
      `SELECT id::text as id, order_number, status::text as status
       FROM orders
       WHERE merchant_id = $1
         AND assigned_driver_id IS NULL
         AND UPPER(status::text) = ANY($2::text[])
       ORDER BY created_at ASC
       LIMIT 300`,
      [merchantId, DRIVER_ASSIGNABLE_ORDER_STATUSES],
    );

    const orders = unassignedOrdersResult.rows;
    if (orders.length === 0) {
      return {
        success: true,
        assigned: 0,
        skipped: 0,
        totalUnassigned: 0,
        mode: settings.mode,
        message: "لا توجد طلبات غير معيّنة حالياً",
      };
    }

    const drivers = await loadActiveDriversWithLoad(merchantId, this.pool);
    if (drivers.length === 0) {
      throw new BadRequestException("لا يوجد سائقون نشطون للتعيين");
    }

    let assigned = 0;
    let skipped = 0;

    for (const order of orders) {
      const driver = pickNextDriver(drivers);
      if (!driver) {
        skipped += 1;
        continue;
      }

      const updateResult = await this.pool.query(
        `UPDATE orders
         SET assigned_driver_id = $1, updated_at = NOW()
         WHERE merchant_id = $2
           AND id::text = $3
           AND assigned_driver_id IS NULL
         RETURNING id`,
        [driver.id, merchantId, order.id],
      );

      if (updateResult.rows.length === 0) {
        skipped += 1;
        continue;
      }

      assigned += 1;
      driver.load += 1;
    }

    return {
      success: true,
      assigned,
      skipped,
      totalUnassigned: orders.length,
      mode: settings.mode,
      notifyCustomer: settings.notifyCustomer,
      message:
        assigned > 0
          ? `تم تعيين ${assigned} طلب تلقائياً`
          : "لم يتم تعيين أي طلب",
    };
  }

  /**
   * Returns the list of known delivery partners (couriers) supported for COD reconciliation.
   * Centralising this here means no frontend deploy is needed when a new courier is added.
   */
  @Get("delivery/partners")
  @ApiOperation({ summary: "List supported delivery partners (couriers)" })
  getDeliveryPartners() {
    return {
      partners: [
        { id: "aramex", nameAr: "أرامكس", nameEn: "Aramex" },
        { id: "bosta", nameAr: "بوسطة", nameEn: "Bosta" },
        { id: "fetchr", nameAr: "فيتشر", nameEn: "Fetchr" },
        { id: "sprint", nameAr: "سبرينت", nameEn: "Sprint" },
        { id: "mylerz", nameAr: "مايلرز", nameEn: "Mylerz" },
        { id: "vhubs", nameAr: "في هابز", nameEn: "vHubs" },
        { id: "other", nameAr: "أخرى", nameEn: "Other" },
      ],
    };
  }
}
