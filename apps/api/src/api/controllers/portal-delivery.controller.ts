import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { RequireRole, RolesGuard } from "../../shared/guards/roles.guard";
import { DeliveryExecutionService } from "../../application/services/delivery-execution.service";
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

const DELIVERY_ASSIGNMENT_MODES = ["least_load", "round_robin", "nearest"];
const DELIVERY_EXECUTION_EVENT_TYPES = [
  "delivery.assigned",
  "delivery.picked_up",
  "delivery.out_for_delivery",
  "delivery.arrived",
  "delivery.delivered",
  "delivery.failed",
  "delivery.disputed",
  "pod.captured",
  "driver.location",
  "sla.updated",
] as const;
const DELIVERY_POD_TYPES = ["photo", "signature", "otp", "note"] as const;
const DELIVERY_SLA_STATUSES = ["OK", "AT_RISK", "BREACHED"] as const;

class UpdateDeliveryAutoAssignSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoAssign?: boolean;

  @IsOptional()
  @IsIn(DELIVERY_ASSIGNMENT_MODES)
  mode?: string;

  @IsOptional()
  @IsBoolean()
  notifyCustomer?: boolean;
}

class RecordDeliveryExecutionEventDto {
  @IsIn(DELIVERY_EXECUTION_EVENT_TYPES)
  eventType!:
    | "delivery.assigned"
    | "delivery.picked_up"
    | "delivery.out_for_delivery"
    | "delivery.arrived"
    | "delivery.delivered"
    | "delivery.failed"
    | "delivery.disputed"
    | "pod.captured"
    | "driver.location"
    | "sla.updated";

  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  correlationId?: string;

  @IsOptional()
  @IsISO8601()
  eventTime?: string;
}

class CapturePodDto {
  @IsIn(DELIVERY_POD_TYPES)
  proofType!: "photo" | "signature" | "otp" | "note";

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  proofUrl?: string;

  @IsOptional()
  @IsObject()
  proofPayload?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  capturedBy?: string;

  @IsOptional()
  @IsISO8601()
  capturedAt?: string;
}

class MarkPodDisputeDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  disputeNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  disputedBy?: string;

  @IsOptional()
  @IsISO8601()
  disputedAt?: string;
}

class RecordLocationPingDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20000)
  accuracyMeters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(350)
  speedKmh?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  headingDeg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsISO8601()
  recordedAt?: string;
}

class RecordDeliverySlaEventDto {
  @IsString()
  @MaxLength(32)
  slaType!: string;

  @IsIn(DELIVERY_SLA_STATUSES)
  status!: "OK" | "AT_RISK" | "BREACHED";

  @IsOptional()
  @IsISO8601()
  targetAt?: string;

  @IsOptional()
  @IsISO8601()
  observedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(-10080)
  @Max(10080)
  minutesDelta?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

@ApiTags("Merchant Portal Compatibility")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@RequiresFeature("ORDERS")
@Controller("v1/portal")
export class PortalDeliveryController {
  private readonly logger = new Logger(PortalDeliveryController.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly deliveryExecutionService: DeliveryExecutionService,
  ) {}

  @Get("delivery/auto-assign-settings")
  @RequireRole("AGENT")
  @ApiOperation({ summary: "Get delivery auto-assign settings" })
  async getDeliveryAutoAssignSettings(@Req() req: Request) {
    return getAutoAssignSettingsForMerchant(getMerchantId(req), this.pool);
  }

  @Put("delivery/auto-assign-settings")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Update delivery auto-assign settings" })
  async updateDeliveryAutoAssignSettings(
    @Req() req: Request,
    @Body() body: UpdateDeliveryAutoAssignSettingsDto,
  ) {
    const merchantId = getMerchantId(req);
    const current = await getAutoAssignSettingsForMerchant(
      merchantId,
      this.pool,
    );
    const allowedModes = new Set(DELIVERY_ASSIGNMENT_MODES);
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
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Auto-assign best available driver for one order" })
  @ApiParam({ name: "orderId", description: "Order id or order number" })
  async autoAssignDriverForOrder(
    @Req() req: Request,
    @Param("orderId") orderId: string,
  ) {
    const merchantId = getMerchantId(req);
    const settings = await getAutoAssignSettingsForMerchant(
      merchantId,
      this.pool,
    );

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
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Auto-assign all unassigned delivery orders" })
  async autoAssignAllOrders(@Req() req: Request) {
    const merchantId = getMerchantId(req);
    const settings = await getAutoAssignSettingsForMerchant(
      merchantId,
      this.pool,
    );

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

  @Post("delivery/orders/:orderId/events")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Record delivery execution event (foundation)" })
  @ApiParam({ name: "orderId", description: "Order id or order number" })
  async recordDeliveryExecutionEvent(
    @Req() req: Request,
    @Param("orderId") orderId: string,
    @Body() body: RecordDeliveryExecutionEventDto,
  ) {
    return this.deliveryExecutionService.recordEvent({
      merchantId: getMerchantId(req),
      orderRef: orderId,
      eventType: body.eventType,
      source: body.source,
      status: body.status,
      payload: body.payload,
      correlationId: body.correlationId,
      eventTime: body.eventTime,
    });
  }

  @Post("delivery/orders/:orderId/pod")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Capture delivery proof-of-delivery (foundation)" })
  @ApiParam({ name: "orderId", description: "Order id or order number" })
  async capturePod(
    @Req() req: Request,
    @Param("orderId") orderId: string,
    @Body() body: CapturePodDto,
  ) {
    return this.deliveryExecutionService.capturePod({
      merchantId: getMerchantId(req),
      orderRef: orderId,
      proofType: body.proofType,
      proofUrl: body.proofUrl,
      proofPayload: body.proofPayload,
      capturedBy: body.capturedBy,
      capturedAt: body.capturedAt,
    });
  }

  @Post("delivery/orders/:orderId/pod/:podId/dispute")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Mark delivery POD as disputed (foundation)" })
  @ApiParam({ name: "orderId", description: "Order id or order number" })
  @ApiParam({ name: "podId", description: "POD record id (UUID)" })
  async markPodDispute(
    @Req() req: Request,
    @Param("orderId") orderId: string,
    @Param("podId", new ParseUUIDPipe()) podId: string,
    @Body() body: MarkPodDisputeDto,
  ) {
    return this.deliveryExecutionService.markPodDispute({
      merchantId: getMerchantId(req),
      orderRef: orderId,
      podId,
      disputeNote: body.disputeNote,
      disputedBy: body.disputedBy,
      disputedAt: body.disputedAt,
    });
  }

  @Post("delivery/orders/:orderId/location")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Record delivery live location ping (foundation)" })
  @ApiParam({ name: "orderId", description: "Order id or order number" })
  async recordLocationPing(
    @Req() req: Request,
    @Param("orderId") orderId: string,
    @Body() body: RecordLocationPingDto,
  ) {
    return this.deliveryExecutionService.recordLocation({
      merchantId: getMerchantId(req),
      orderRef: orderId,
      latitude: body.latitude,
      longitude: body.longitude,
      accuracyMeters: body.accuracyMeters,
      speedKmh: body.speedKmh,
      headingDeg: body.headingDeg,
      source: body.source,
      metadata: body.metadata,
      recordedAt: body.recordedAt,
    });
  }

  @Post("delivery/orders/:orderId/sla-events")
  @RequireRole("MANAGER")
  @ApiOperation({ summary: "Record delivery SLA event (foundation)" })
  @ApiParam({ name: "orderId", description: "Order id or order number" })
  async recordDeliverySlaEvent(
    @Req() req: Request,
    @Param("orderId") orderId: string,
    @Body() body: RecordDeliverySlaEventDto,
  ) {
    return this.deliveryExecutionService.recordSlaEvent({
      merchantId: getMerchantId(req),
      orderRef: orderId,
      slaType: String(body.slaType),
      status: body.status,
      targetAt: body.targetAt,
      observedAt: body.observedAt,
      minutesDelta: body.minutesDelta,
      reason: body.reason,
      metadata: body.metadata,
    });
  }

  @Get("delivery/orders/:orderId/timeline")
  @RequireRole("AGENT")
  @ApiOperation({
    summary: "Get unified delivery execution timeline (foundation)",
  })
  @ApiParam({ name: "orderId", description: "Order id or order number" })
  async getDeliveryTimeline(
    @Req() req: Request,
    @Param("orderId") orderId: string,
  ) {
    return this.deliveryExecutionService.getTimeline(
      getMerchantId(req),
      orderId,
    );
  }

  @Get("delivery/orders/:orderId/live-snapshot")
  @RequireRole("AGENT")
  @ApiOperation({ summary: "Get delivery live snapshot for operations" })
  @ApiParam({ name: "orderId", description: "Order id or order number" })
  async getDeliveryLiveSnapshot(
    @Req() req: Request,
    @Param("orderId") orderId: string,
  ) {
    return this.deliveryExecutionService.getLiveSnapshot(
      getMerchantId(req),
      orderId,
    );
  }

  /**
   * Returns the list of known delivery partners (couriers) supported for COD reconciliation.
   * Centralising this here means no frontend deploy is needed when a new courier is added.
   */
  @Get("delivery/partners")
  @RequireRole("AGENT")
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
