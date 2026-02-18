import {
  Controller,
  Get,
  Param,
  Query,
  Logger,
  Inject,
  NotFoundException,
  ForbiddenException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiHeader,
  ApiSecurity,
} from "@nestjs/swagger";
import {
  IOrderRepository,
  ORDER_REPOSITORY,
} from "../../domain/ports/order.repository";
import {
  IShipmentRepository,
  SHIPMENT_REPOSITORY,
} from "../../domain/ports/shipment.repository";
import { Order } from "../../domain/entities/order.entity";
import { Shipment } from "../../domain/entities/shipment.entity";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";

interface OrderResponseDto {
  id: string;
  orderNumber: string;
  merchantId: string;
  conversationId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: unknown;
  deliveryNotes?: string;
  items: unknown[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  status: string;
  shipment?: ShipmentDto;
  createdAt: Date;
  updatedAt: Date;
}

interface ShipmentDto {
  id: string;
  trackingId?: string;
  courier?: string;
  status: string;
  estimatedDelivery?: Date;
  statusHistory: unknown[];
}

@ApiTags("Orders")
@ApiSecurity("admin-api-key")
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
@UseGuards(AdminApiKeyGuard)
@Controller("v1/orders")
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepo: IOrderRepository,
    @Inject(SHIPMENT_REPOSITORY)
    private readonly shipmentRepo: IShipmentRepository,
  ) {}

  @Get(":id")
  @ApiOperation({
    summary: "Get order by ID",
    description: "Retrieve order details including shipment information",
  })
  @ApiParam({ name: "id", description: "Order ID" })
  @ApiQuery({
    name: "merchantId",
    description: "Merchant ID for tenant isolation",
  })
  @ApiResponse({ status: 200, description: "Order found" })
  @ApiResponse({ status: 404, description: "Order not found" })
  async getOrder(
    @Param("id") id: string,
    @Query("merchantId") merchantId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepo.findById(id);

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    // Verify merchant ownership
    if (order.merchantId !== merchantId) {
      throw new ForbiddenException("Access denied");
    }

    // Get shipment if exists
    const shipment = await this.shipmentRepo.findByOrderId(order.id);

    return this.mapOrderToDto(order, shipment);
  }

  @Get()
  @ApiOperation({ summary: "List orders for merchant" })
  @ApiQuery({ name: "merchantId", description: "Merchant ID" })
  @ApiQuery({
    name: "status",
    description: "Filter by status",
    required: false,
  })
  @ApiQuery({ name: "limit", description: "Max results", required: false })
  @ApiQuery({
    name: "offset",
    description: "Pagination offset",
    required: false,
  })
  async listOrders(
    @Query("merchantId") merchantId: string,
    @Query("status") status?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ): Promise<{ orders: OrderResponseDto[]; total: number }> {
    const orders = await this.orderRepo.findByMerchant(merchantId, limit);

    // Filter by status if provided
    let filtered = orders;
    if (status) {
      filtered = orders.filter((o: Order) => o.status === status);
    }

    // Apply pagination
    const start = offset || 0;
    const end = start + (limit || 20);
    const paginated = filtered.slice(start, end);

    const result = paginated.map((order: Order) =>
      this.mapOrderToDto(order, null),
    );

    return {
      orders: result,
      total: filtered.length,
    };
  }

  @Get("by-number/:orderNumber")
  @ApiOperation({ summary: "Get order by order number" })
  @ApiParam({
    name: "orderNumber",
    description: "Order number (e.g., ORD-240115-ABC1)",
  })
  @ApiQuery({
    name: "merchantId",
    description: "Merchant ID for tenant isolation",
  })
  async getOrderByNumber(
    @Param("orderNumber") orderNumber: string,
    @Query("merchantId") merchantId: string,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepo.findByOrderNumber(
      merchantId,
      orderNumber,
    );

    if (!order) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }

    const shipment = await this.shipmentRepo.findByOrderId(order.id);

    return this.mapOrderToDto(order, shipment);
  }

  private mapOrderToDto(
    order: Order,
    shipment: Shipment | null,
  ): OrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      merchantId: order.merchantId,
      conversationId: order.conversationId,
      customerId: order.customerId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      deliveryNotes: order.deliveryNotes,
      items: order.items,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      total: order.total,
      status: order.status,
      shipment: shipment
        ? {
            id: shipment.id,
            trackingId: shipment.trackingId,
            courier: shipment.courier,
            status: shipment.status,
            estimatedDelivery: shipment.estimatedDelivery,
            statusHistory: shipment.statusHistory,
          }
        : undefined,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
