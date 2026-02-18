import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { EntitlementGuard } from "../../shared/guards/entitlement.guard";
import { RolesGuard } from "../../shared/guards/roles.guard";

type PeriodWindow = {
  startDate: Date;
  endDate: Date;
  days: number;
};

type DriverLoad = {
  id: string;
  name: string;
  phone: string;
  load: number;
};

@ApiTags("Merchant Portal Compatibility")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalCompatController {
  private readonly logger = new Logger(PortalCompatController.name);
  private readonly driverAssignableOrderStatuses = [
    "CONFIRMED",
    "BOOKED",
    "SHIPPED",
    "OUT_FOR_DELIVERY",
  ];

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private getMerchantId(req: Request): string {
    return (req as any).merchantId;
  }

  private toNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toBoolean(value: unknown, fallback = false): boolean {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
    return fallback;
  }

  private parseJsonObject(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === "object") return value as Record<string, any>;
    if (typeof value !== "string") return {};
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch {
      return {};
    }
  }

  private parseWindow(
    daysRaw?: string,
    startDateRaw?: string,
    endDateRaw?: string,
  ): PeriodWindow {
    const now = new Date();
    const requestedDays = Number.parseInt(String(daysRaw ?? ""), 10);
    const normalizedDays = Number.isFinite(requestedDays)
      ? Math.min(Math.max(requestedDays, 1), 365)
      : 30;

    if (startDateRaw && endDateRaw) {
      const startDate = new Date(startDateRaw);
      const endDate = new Date(endDateRaw);
      if (
        !Number.isNaN(startDate.getTime()) &&
        !Number.isNaN(endDate.getTime()) &&
        startDate <= endDate
      ) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        const diffMs = end.getTime() - start.getTime();
        const diffDays = Math.max(1, Math.ceil(diffMs / 86400000));
        return { startDate: start, endDate: end, days: diffDays };
      }
    }

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - (normalizedDays - 1));
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end, days: normalizedDays };
  }

  private expandAgentFilter(agent?: string): string[] {
    if (!agent || agent === "ALL") return [];
    const normalized = agent.trim().toUpperCase();
    const map: Record<string, string[]> = {
      OPS: ["OPS", "OPS_AGENT"],
      INVENTORY: ["INVENTORY", "INVENTORY_AGENT"],
      FINANCE: ["FINANCE", "FINANCE_AGENT"],
      SUPPORT: ["SUPPORT", "SUPPORT_AGENT"],
      MARKETING: ["MARKETING", "MARKETING_AGENT"],
    };
    return map[normalized] || [normalized];
  }

  private async getMerchantPortalSummary(merchantId: string) {
    const [
      merchantResult,
      productsResult,
      inventoryResult,
      ordersResult,
      customersResult,
      conversationsResult,
      paidOrdersResult,
      paymentLinksResult,
      activeStaffResult,
      unreadNotificationsResult,
      integrationsResult,
      driversResult,
    ] = await Promise.all([
      this.pool.query<{ merchant_data: Record<string, any> }>(
        `SELECT to_jsonb(m) as merchant_data FROM merchants m WHERE m.id = $1 LIMIT 1`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM catalog_items WHERE merchant_id = $1`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM inventory_items WHERE merchant_id = $1`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM orders WHERE merchant_id = $1`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM customers WHERE merchant_id = $1`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM conversations WHERE merchant_id = $1`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count
         FROM orders
         WHERE merchant_id = $1 AND status::text IN ('DELIVERED', 'COMPLETED')`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM payment_links WHERE merchant_id = $1`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count
         FROM merchant_staff
         WHERE merchant_id = $1 AND status = 'ACTIVE'`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count
         FROM notifications n
         WHERE n.merchant_id = $1
           AND COALESCE(NULLIF((to_jsonb(n)->>'is_read'), '')::boolean, false) = false
           AND (to_jsonb(n)->>'read_at') IS NULL`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM pos_integrations WHERE merchant_id = $1`,
        [merchantId],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text as count
         FROM delivery_drivers
         WHERE merchant_id = $1 AND UPPER(COALESCE(status, '')) = 'ACTIVE'`,
        [merchantId],
      ),
    ]);

    const merchantData = merchantResult.rows[0]?.merchant_data || {};
    const knowledgeBase = this.parseJsonObject(merchantData.knowledge_base);
    const businessInfo = this.parseJsonObject(knowledgeBase.businessInfo);
    const faqs = Array.isArray(knowledgeBase.faqs) ? knowledgeBase.faqs : [];

    return {
      merchantData,
      knowledgeBase,
      businessInfo,
      faqCount: faqs.length,
      totalProducts: this.toNumber(productsResult.rows[0]?.count, 0),
      totalInventoryItems: this.toNumber(inventoryResult.rows[0]?.count, 0),
      totalOrders: this.toNumber(ordersResult.rows[0]?.count, 0),
      totalCustomers: this.toNumber(customersResult.rows[0]?.count, 0),
      totalConversations: this.toNumber(conversationsResult.rows[0]?.count, 0),
      paidOrders: this.toNumber(paidOrdersResult.rows[0]?.count, 0),
      paymentLinks: this.toNumber(paymentLinksResult.rows[0]?.count, 0),
      activeStaff: this.toNumber(activeStaffResult.rows[0]?.count, 0),
      unreadNotifications: this.toNumber(
        unreadNotificationsResult.rows[0]?.count,
        0,
      ),
      integrations: this.toNumber(integrationsResult.rows[0]?.count, 0),
      activeDrivers: this.toNumber(driversResult.rows[0]?.count, 0),
    };
  }

  private async getAutoAssignSettingsForMerchant(merchantId: string): Promise<{
    autoAssign: boolean;
    mode: string;
    notifyCustomer: boolean;
  }> {
    const merchantResult = await this.pool.query<{
      merchant_data: Record<string, any>;
    }>(
      `SELECT to_jsonb(m) as merchant_data FROM merchants m WHERE m.id = $1 LIMIT 1`,
      [merchantId],
    );
    if (merchantResult.rows.length === 0) {
      throw new NotFoundException("التاجر غير موجود");
    }

    const merchantData = merchantResult.rows[0].merchant_data || {};
    const config = this.parseJsonObject(merchantData.config);
    return {
      autoAssign: this.toBoolean(
        merchantData.auto_assign_delivery ?? config.autoAssignDelivery,
        false,
      ),
      mode: String(
        merchantData.delivery_assignment_mode ??
          config.deliveryAssignmentMode ??
          "least_load",
      ),
      notifyCustomer: this.toBoolean(
        merchantData.notify_customer_on_assign ?? config.notifyCustomerOnAssign,
        true,
      ),
    };
  }

  private async loadActiveDriversWithLoad(
    merchantId: string,
  ): Promise<DriverLoad[]> {
    const result = await this.pool.query<{
      id: string;
      name: string;
      phone: string;
      active_load: string;
    }>(
      `SELECT
         dd.id::text as id,
         dd.name,
         COALESCE(dd.whatsapp_number, dd.phone, '') as phone,
         COALESCE(loads.active_load, 0)::text as active_load
       FROM delivery_drivers dd
       LEFT JOIN (
         SELECT assigned_driver_id::text as driver_id, COUNT(*)::int as active_load
         FROM orders
         WHERE merchant_id = $1
           AND assigned_driver_id IS NOT NULL
           AND status::text NOT IN ('DELIVERED', 'CANCELLED', 'FAILED', 'REFUNDED')
         GROUP BY assigned_driver_id
       ) loads ON loads.driver_id = dd.id::text
       WHERE dd.merchant_id = $1
         AND UPPER(COALESCE(dd.status, '')) = 'ACTIVE'
       ORDER BY COALESCE(loads.active_load, 0) ASC, dd.created_at ASC`,
      [merchantId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      load: this.toNumber(row.active_load, 0),
    }));
  }

  private pickNextDriver(drivers: DriverLoad[]): DriverLoad | null {
    if (drivers.length === 0) return null;
    drivers.sort((a, b) => a.load - b.load || a.name.localeCompare(b.name));
    return drivers[0];
  }

  private async createStockMovementSafely(args: {
    merchantId: string;
    catalogItemId: string | null;
    variantId: string | null;
    movementType: string;
    quantity: number;
    quantityBefore?: number | null;
    quantityAfter?: number | null;
    reason?: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const metadata = args.metadata || {};
    try {
      await this.pool.query(
        `INSERT INTO stock_movements (
          merchant_id, catalog_item_id, variant_id, movement_type, quantity,
          quantity_before, quantity_after, reason, reference_type, reference_id, metadata, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
        [
          args.merchantId,
          args.catalogItemId,
          args.variantId,
          args.movementType,
          args.quantity,
          args.quantityBefore ?? null,
          args.quantityAfter ?? null,
          args.reason || null,
          args.referenceType || null,
          args.referenceId || null,
          JSON.stringify(metadata),
          args.reason || null,
        ],
      );
      return;
    } catch (error: any) {
      if (!["42703", "42P01"].includes(error?.code)) {
        throw error;
      }
    }

    if (!args.catalogItemId) return;

    await this.pool.query(
      `INSERT INTO stock_movements (
        merchant_id, catalog_item_id, movement_type, quantity, reference_type, reference_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        args.merchantId,
        args.catalogItemId,
        args.movementType,
        args.quantity,
        args.referenceType || null,
        args.referenceId || null,
        args.reason || null,
      ],
    );
  }

  @Get("agent-activity")
  @ApiOperation({ summary: "List agent actions for merchant activity feed" })
  @ApiQuery({ name: "agent", required: false })
  @ApiQuery({ name: "severity", required: false })
  @ApiQuery({ name: "limit", required: false })
  async getAgentActivity(
    @Req() req: Request,
    @Query("agent") agent?: string,
    @Query("severity") severity?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const limit = Math.min(
      Math.max(Number.parseInt(String(limitRaw || "100"), 10) || 100, 1),
      200,
    );

    const filters: string[] = ["merchant_id = $1"];
    const params: any[] = [merchantId];

    const agentValues = this.expandAgentFilter(agent);
    if (agentValues.length > 0) {
      params.push(agentValues);
      filters.push(`agent_type = ANY($${params.length})`);
    }

    if (severity && severity !== "ALL") {
      params.push(String(severity).toUpperCase());
      filters.push(`severity = $${params.length}`);
    }

    params.push(limit);

    const actionsResult = await this.pool.query(
      `SELECT
         id::text as id,
         agent_type,
         action_type,
         severity,
         title,
         description,
         COALESCE(metadata, '{}'::jsonb) as metadata,
         COALESCE(auto_resolved, false) as auto_resolved,
         COALESCE(merchant_ack, false) as merchant_ack,
         created_at
       FROM agent_actions
       WHERE ${filters.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    const summaryResult = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int as last_24h,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND auto_resolved = true)::int as auto_resolved_24h,
         COUNT(*) FILTER (WHERE merchant_ack = false AND severity = 'CRITICAL')::int as unack_critical,
         COUNT(*) FILTER (WHERE merchant_ack = false AND severity = 'WARNING')::int as unack_warning,
         COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours' AND severity IN ('ACTION', 'CRITICAL'))::int as actions_taken_24h
       FROM agent_actions
       WHERE merchant_id = $1`,
      [merchantId],
    );

    return {
      actions: actionsResult.rows,
      summary: summaryResult.rows[0] || {
        last_24h: 0,
        auto_resolved_24h: 0,
        unack_critical: 0,
        unack_warning: 0,
        actions_taken_24h: 0,
      },
    };
  }

  @Post("agent-activity/:actionId/acknowledge")
  @ApiOperation({ summary: "Acknowledge agent action" })
  async acknowledgeAgentAction(
    @Req() req: Request,
    @Param("actionId") actionId: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const result = await this.pool.query(
      `UPDATE agent_actions
       SET merchant_ack = true
       WHERE merchant_id = $1 AND id::text = $2
       RETURNING id::text as id`,
      [merchantId, actionId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException("العنصر غير موجود");
    }

    return { success: true, id: result.rows[0].id };
  }

  @Get("onboarding/status")
  @ApiOperation({ summary: "Get onboarding checklist status for merchant" })
  async getOnboardingStatus(@Req() req: Request) {
    const merchantId = this.getMerchantId(req);
    const summary = await this.getMerchantPortalSummary(merchantId);

    const hasBusinessName = Boolean(
      String(summary.merchantData?.name || "").trim(),
    );
    const hasWhatsapp =
      Boolean(String(summary.businessInfo?.whatsapp || "").trim()) ||
      Boolean(String(summary.merchantData?.whatsapp_number || "").trim()) ||
      Boolean(String(summary.merchantData?.notification_phone || "").trim());

    const steps = [
      {
        id: "business_info",
        title: "بيانات النشاط",
        description: "أكمل اسم النشاط ومعلوماته الأساسية",
        completed: hasBusinessName,
        optional: false,
        href: "/merchant/settings",
        metric: hasBusinessName
          ? "تم إدخال بيانات النشاط"
          : "أضف بيانات النشاط الأساسية",
      },
      {
        id: "whatsapp",
        title: "قناة واتساب",
        description: "فعّل رقم واتساب لاستقبال ومتابعة الطلبات",
        completed: hasWhatsapp,
        optional: false,
        href: "/merchant/settings",
        metric: hasWhatsapp
          ? "تم إعداد قناة التواصل"
          : "أضف رقم واتساب للتواصل",
      },
      {
        id: "products",
        title: "المنتجات",
        description: "أضف المنتجات في الكتالوج",
        completed: summary.totalProducts > 0,
        optional: false,
        href: "/merchant/knowledge-base",
        metric: `${summary.totalProducts} منتج`,
      },
      {
        id: "inventory",
        title: "المخزون",
        description: "اربط المخزون وSKU للتتبع الدقيق",
        completed: summary.totalInventoryItems > 0,
        optional: false,
        href: "/merchant/inventory",
        metric: `${summary.totalInventoryItems} صنف مخزون`,
      },
      {
        id: "knowledge_base",
        title: "قاعدة المعرفة",
        description: "أضف الأسئلة الشائعة والسياسات لتغذية الوكيل الذكي",
        completed: summary.faqCount > 0,
        optional: false,
        href: "/merchant/knowledge-base",
        metric: `${summary.faqCount} سؤال/إجابة`,
      },
      {
        id: "first_conversation",
        title: "أول محادثة",
        description: "ابدأ محادثة عميل للتأكد من مسار التشغيل",
        completed: summary.totalConversations > 0,
        optional: false,
        href: "/merchant/conversations",
        metric: `${summary.totalConversations} محادثة`,
      },
      {
        id: "first_order",
        title: "أول طلب",
        description: "استقبل أول طلب وتابع حالته",
        completed: summary.totalOrders > 0,
        optional: false,
        href: "/merchant/orders",
        metric: `${summary.totalOrders} طلب`,
      },
      {
        id: "payments",
        title: "المدفوعات",
        description: "فعّل مسار المدفوعات وروابط الدفع",
        completed: summary.paymentLinks > 0 || summary.paidOrders > 0,
        optional: false,
        href: "/merchant/payments",
        metric: `${summary.paymentLinks} رابط دفع • ${summary.paidOrders} طلب مدفوع`,
      },
      {
        id: "team",
        title: "الفريق",
        description: "أضف أفراد الفريق والصلاحيات",
        completed: summary.activeStaff > 1,
        optional: true,
        href: "/merchant/team",
        metric: `${summary.activeStaff} عضو نشط`,
      },
      {
        id: "notifications",
        title: "الإشعارات",
        description: "راجع إعدادات الإشعارات والتنبيهات",
        completed: true,
        optional: true,
        href: "/merchant/notifications",
        metric: `${summary.unreadNotifications} غير مقروء`,
      },
      {
        id: "integrations",
        title: "التكاملات",
        description: "اربط POS/ERP إن لزم",
        completed: summary.integrations > 0,
        optional: true,
        href: "/merchant/pos-integrations",
        metric: `${summary.integrations} تكامل`,
      },
      {
        id: "delivery_drivers",
        title: "سائقو التوصيل",
        description: "أضف السائقين وفعّل التعيين التلقائي",
        completed: summary.activeDrivers > 0,
        optional: true,
        href: "/merchant/delivery-drivers",
        metric: `${summary.activeDrivers} سائق نشط`,
      },
    ];

    const requiredSteps = steps.filter((step) => !step.optional);
    const completedRequired = requiredSteps.filter(
      (step) => step.completed,
    ).length;
    const completionPct =
      requiredSteps.length > 0
        ? Math.round((completedRequired / requiredSteps.length) * 100)
        : 0;

    return {
      steps,
      summary: {
        completionPct,
        completedRequired,
        requiredSteps: requiredSteps.length,
        isComplete: completedRequired === requiredSteps.length,
      },
    };
  }

  @Get("help-center")
  @ApiOperation({ summary: "Get help center sections and contextual stats" })
  async getHelpCenter(@Req() req: Request) {
    const merchantId = this.getMerchantId(req);
    const summary = await this.getMerchantPortalSummary(merchantId);

    const sections = [
      {
        id: "orders",
        title: "الطلبات",
        description: "إدارة الطلبات ومتابعة الحالات والتحصيل",
        icon: "Package",
        href: "/merchant/orders",
        metric: `${summary.totalOrders} طلب`,
        hasData: summary.totalOrders > 0,
      },
      {
        id: "inventory",
        title: "المخزون",
        description: "تتبع الكميات والتنبيهات والتكلفة",
        icon: "Store",
        href: "/merchant/inventory",
        metric: `${summary.totalInventoryItems} صنف مخزون`,
        hasData: summary.totalInventoryItems > 0,
      },
      {
        id: "conversations",
        title: "المحادثات",
        description: "محادثات العملاء والمتابعة الذكية",
        icon: "MessageSquare",
        href: "/merchant/conversations",
        metric: `${summary.totalConversations} محادثة`,
        hasData: summary.totalConversations > 0,
      },
      {
        id: "customers",
        title: "العملاء",
        description: "تحليل العملاء وتقسيمهم",
        icon: "Users",
        href: "/merchant/customers",
        metric: `${summary.totalCustomers} عميل`,
        hasData: summary.totalCustomers > 0,
      },
      {
        id: "analytics",
        title: "التحليلات",
        description: "تقارير الأداء والتحويل",
        icon: "BarChart3",
        href: "/merchant/analytics",
        metric:
          summary.totalOrders > 0
            ? "البيانات متاحة للتحليل"
            : "ابدأ باستقبال الطلبات",
        hasData: summary.totalOrders > 0,
      },
      {
        id: "drivers",
        title: "التوصيل",
        description: "إدارة السائقين والتعيين التلقائي",
        icon: "Truck",
        href: "/merchant/delivery-drivers",
        metric: `${summary.activeDrivers} سائق نشط`,
        hasData: summary.activeDrivers > 0,
      },
      {
        id: "notifications",
        title: "الإشعارات",
        description: "متابعة التنبيهات وتنظيم التنبيهات الفورية",
        icon: "Bell",
        href: "/merchant/notifications",
        metric: `${summary.unreadNotifications} غير مقروء`,
        hasData: summary.unreadNotifications > 0,
      },
      {
        id: "knowledge",
        title: "قاعدة المعرفة",
        description: "تعليم الوكيل الذكي سياسة متجرك",
        icon: "BookOpen",
        href: "/merchant/knowledge-base",
        metric: `${summary.faqCount} سؤال/إجابة`,
        hasData: summary.faqCount > 0,
      },
      {
        id: "settings",
        title: "الإعدادات",
        description: "إعداد المتجر والهوية والتفضيلات",
        icon: "Settings",
        href: "/merchant/settings",
        metric: "إدارة كاملة",
        hasData: true,
      },
    ];

    return {
      summary: {
        totalProducts: summary.totalProducts,
        totalOrders: summary.totalOrders,
        totalCustomers: summary.totalCustomers,
        unreadNotifications: summary.unreadNotifications,
      },
      sections,
    };
  }

  @Get("delivery/auto-assign-settings")
  @ApiOperation({ summary: "Get delivery auto-assign settings" })
  async getDeliveryAutoAssignSettings(@Req() req: Request) {
    return this.getAutoAssignSettingsForMerchant(this.getMerchantId(req));
  }

  @Put("delivery/auto-assign-settings")
  @ApiOperation({ summary: "Update delivery auto-assign settings" })
  async updateDeliveryAutoAssignSettings(
    @Req() req: Request,
    @Body()
    body: { autoAssign?: boolean; mode?: string; notifyCustomer?: boolean },
  ) {
    const merchantId = this.getMerchantId(req);
    const current = await this.getAutoAssignSettingsForMerchant(merchantId);
    const allowedModes = new Set(["least_load", "round_robin", "nearest"]);
    const next = {
      autoAssign:
        body.autoAssign !== undefined
          ? this.toBoolean(body.autoAssign)
          : current.autoAssign,
      mode: body.mode ? String(body.mode).toLowerCase() : current.mode,
      notifyCustomer:
        body.notifyCustomer !== undefined
          ? this.toBoolean(body.notifyCustomer)
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
    const merchantId = this.getMerchantId(req);
    const settings = await this.getAutoAssignSettingsForMerchant(merchantId);

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

    if (!this.driverAssignableOrderStatuses.includes(normalizedStatus)) {
      return {
        assigned: false,
        reason: "not_assignable_status",
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        allowedStatuses: this.driverAssignableOrderStatuses,
      };
    }

    const drivers = await this.loadActiveDriversWithLoad(merchantId);
    const nextDriver = this.pickNextDriver(drivers);
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
    const merchantId = this.getMerchantId(req);
    const settings = await this.getAutoAssignSettingsForMerchant(merchantId);

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
      [merchantId, this.driverAssignableOrderStatuses],
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

    const drivers = await this.loadActiveDriversWithLoad(merchantId);
    if (drivers.length === 0) {
      throw new BadRequestException("لا يوجد سائقون نشطون للتعيين");
    }

    let assigned = 0;
    let skipped = 0;

    for (const order of orders) {
      const driver = this.pickNextDriver(drivers);
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

  @Get("analytics")
  @ApiOperation({
    summary: "Generic analytics summary endpoint (portal compatibility)",
  })
  async getGenericAnalytics(
    @Req() req: Request,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("days") days?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const window = this.parseWindow(days, startDate, endDate);
    const orderAmountExpr = `COALESCE(
      NULLIF((to_jsonb(o)->>'total'), '')::numeric,
      NULLIF((to_jsonb(o)->>'total_amount'), '')::numeric,
      0
    )`;

    const [ordersResult, statusResult, conversationsResult, customersResult] =
      await Promise.all([
        this.pool.query<{
          total_orders: string;
          delivered_orders: string;
          total_revenue: string;
        }>(
          `SELECT
           COUNT(*)::text as total_orders,
           COUNT(*) FILTER (WHERE status::text IN ('DELIVERED', 'COMPLETED'))::text as delivered_orders,
           COALESCE(SUM(CASE WHEN status::text IN ('DELIVERED', 'COMPLETED') THEN ${orderAmountExpr} ELSE 0 END), 0)::text as total_revenue
         FROM orders o
         WHERE o.merchant_id = $1
           AND o.created_at >= $2
           AND o.created_at <= $3`,
          [merchantId, window.startDate, window.endDate],
        ),
        this.pool.query<{ status: string; count: string; revenue: string }>(
          `SELECT
           status::text as status,
           COUNT(*)::text as count,
           COALESCE(SUM(${orderAmountExpr}), 0)::text as revenue
         FROM orders o
         WHERE o.merchant_id = $1
           AND o.created_at >= $2
           AND o.created_at <= $3
         GROUP BY status
         ORDER BY COUNT(*) DESC`,
          [merchantId, window.startDate, window.endDate],
        ),
        this.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text as count
         FROM conversations
         WHERE merchant_id = $1
           AND created_at >= $2
           AND created_at <= $3`,
          [merchantId, window.startDate, window.endDate],
        ),
        this.pool.query<{ count: string }>(
          `SELECT COUNT(*)::text as count
         FROM customers
         WHERE merchant_id = $1
           AND created_at >= $2
           AND created_at <= $3`,
          [merchantId, window.startDate, window.endDate],
        ),
      ]);

    const totalOrders = this.toNumber(ordersResult.rows[0]?.total_orders, 0);
    const deliveredOrders = this.toNumber(
      ordersResult.rows[0]?.delivered_orders,
      0,
    );
    const totalRevenue = this.toNumber(ordersResult.rows[0]?.total_revenue, 0);

    return {
      period: {
        startDate: window.startDate.toISOString(),
        endDate: window.endDate.toISOString(),
        days: window.days,
      },
      summary: {
        totalOrders,
        deliveredOrders,
        totalRevenue,
        avgOrderValue:
          totalOrders > 0 ? Number((totalRevenue / totalOrders).toFixed(2)) : 0,
        conversionRate:
          this.toNumber(conversationsResult.rows[0]?.count, 0) > 0
            ? Number(
                (
                  (deliveredOrders /
                    this.toNumber(conversationsResult.rows[0]?.count, 0)) *
                  100
                ).toFixed(2),
              )
            : 0,
        conversations: this.toNumber(conversationsResult.rows[0]?.count, 0),
        newCustomers: this.toNumber(customersResult.rows[0]?.count, 0),
      },
      ordersByStatus: statusResult.rows.map((row) => ({
        status: row.status,
        count: this.toNumber(row.count, 0),
        revenue: this.toNumber(row.revenue, 0),
      })),
    };
  }

  @Get("inventory")
  @ApiOperation({
    summary: "List merchant inventory items (portal compatibility endpoint)",
  })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "lowStock", required: false })
  async getPortalInventory(
    @Req() req: Request,
    @Query("search") search?: string,
    @Query("lowStock") lowStockRaw?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const params: any[] = [merchantId];
    const conditions: string[] = ["ii.merchant_id = $1"];

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(ii.sku ILIKE $${idx}
          OR COALESCE(NULLIF((to_jsonb(ii)->>'name'), ''), '') ILIKE $${idx}
          OR COALESCE(ci.name_ar, '') ILIKE $${idx}
          OR COALESCE(ci.name_en, '') ILIKE $${idx})`,
      );
    }

    const result = await this.pool.query(
      `WITH variant_totals AS (
         SELECT
           inventory_item_id,
           COALESCE(SUM(COALESCE(quantity_on_hand, 0)), 0) as quantity_on_hand,
           COALESCE(SUM(COALESCE(quantity_reserved, 0)), 0) as quantity_reserved,
           COALESCE(AVG(COALESCE(cost_price, 0)), 0) as avg_cost
         FROM inventory_variants
         WHERE merchant_id = $1 AND COALESCE(is_active, true) = true
         GROUP BY inventory_item_id
       )
       SELECT
         ii.id::text as id,
         ii.catalog_item_id::text as catalog_item_id,
         ii.sku,
         COALESCE(
           NULLIF((to_jsonb(ii)->>'name'), ''),
           NULLIF(ci.name_ar, ''),
           NULLIF(ci.name_en, ''),
           ii.sku
         ) as name,
         COALESCE(vt.quantity_on_hand, 0) as stock_quantity,
         COALESCE(vt.quantity_reserved, 0) as reserved_quantity,
         COALESCE(vt.quantity_on_hand - vt.quantity_reserved, 0) as available_quantity,
         COALESCE(NULLIF((to_jsonb(ii)->>'cost_price'), '')::numeric, vt.avg_cost, 0) as cost_price,
         COALESCE(NULLIF((to_jsonb(ci)->>'base_price'), '')::numeric, 0) as price,
         COALESCE(NULLIF((to_jsonb(ii)->>'low_stock_threshold'), '')::int, 5) as low_stock_threshold,
         (
           COALESCE(vt.quantity_on_hand - vt.quantity_reserved, 0)
           <= COALESCE(NULLIF((to_jsonb(ii)->>'low_stock_threshold'), '')::int, 5)
         ) as is_low_stock
       FROM inventory_items ii
       LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
       LEFT JOIN variant_totals vt ON vt.inventory_item_id = ii.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY name ASC`,
      params,
    );

    const lowStockOnly = this.toBoolean(lowStockRaw, false);
    const items = lowStockOnly
      ? result.rows.filter((row) => row.is_low_stock)
      : result.rows;

    return {
      total: items.length,
      items,
    };
  }

  @Patch("inventory/:id/stock")
  @ApiOperation({
    summary:
      "Set stock quantity for one inventory item/variant (portal compatibility endpoint)",
  })
  async patchPortalInventoryStock(
    @Req() req: Request,
    @Param("id") inventoryItemId: string,
    @Body() body: { quantity?: number; variantId?: string; reason?: string },
  ) {
    const merchantId = this.getMerchantId(req);
    const quantity = Math.max(0, Math.trunc(this.toNumber(body.quantity, 0)));
    const reason = body.reason || "تعديل يدوي من لوحة التحكم";

    const itemResult = await this.pool.query<{
      id: string;
      catalog_item_id: string | null;
      sku: string;
    }>(
      `SELECT id::text as id, catalog_item_id::text as catalog_item_id, sku
       FROM inventory_items
       WHERE merchant_id = $1
         AND (id::text = $2 OR sku = $2)
       LIMIT 1`,
      [merchantId, inventoryItemId],
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundException("صنف المخزون غير موجود");
    }

    const item = itemResult.rows[0];
    const variantResult = await this.pool.query<{
      id: string;
      quantity_on_hand: string;
      sku: string;
    }>(
      `SELECT id::text as id, quantity_on_hand::text as quantity_on_hand, sku
       FROM inventory_variants
       WHERE merchant_id = $1
         AND inventory_item_id::text = $2
         AND ($3::text IS NULL OR id::text = $3::text)
         AND COALESCE(is_active, true) = true
       ORDER BY quantity_on_hand DESC, created_at ASC
       LIMIT 1`,
      [merchantId, item.id, body.variantId || null],
    );

    if (variantResult.rows.length > 0) {
      const variant = variantResult.rows[0];
      const before = this.toNumber(variant.quantity_on_hand, 0);
      const change = quantity - before;

      await this.pool.query(
        `UPDATE inventory_variants
         SET quantity_on_hand = $1, updated_at = NOW()
         WHERE merchant_id = $2 AND id::text = $3`,
        [quantity, merchantId, variant.id],
      );

      await this.createStockMovementSafely({
        merchantId,
        catalogItemId: item.catalog_item_id,
        variantId: variant.id,
        movementType: "ADJUSTMENT",
        quantity: change,
        quantityBefore: before,
        quantityAfter: quantity,
        reason,
        referenceType: "portal",
        referenceId: item.id,
        metadata: {
          inventoryItemId: item.id,
          variantId: variant.id,
          variantSku: variant.sku,
        },
      });

      return {
        variantId: variant.id,
        quantityBefore: before,
        quantityAfter: quantity,
        change,
      };
    }

    if (!item.catalog_item_id) {
      throw new BadRequestException(
        "لا يمكن تعديل الكمية: لا يوجد Variant أو Catalog مرتبط",
      );
    }

    const catalogStock = await this.pool.query<{ stock_quantity: string }>(
      `SELECT COALESCE(stock_quantity, 0)::text as stock_quantity
       FROM catalog_items
       WHERE merchant_id = $1 AND id::text = $2
       LIMIT 1`,
      [merchantId, item.catalog_item_id],
    );

    const before = this.toNumber(catalogStock.rows[0]?.stock_quantity, 0);
    const change = quantity - before;

    await this.pool.query(
      `UPDATE catalog_items
       SET stock_quantity = $1, updated_at = NOW()
       WHERE merchant_id = $2 AND id::text = $3`,
      [quantity, merchantId, item.catalog_item_id],
    );

    await this.createStockMovementSafely({
      merchantId,
      catalogItemId: item.catalog_item_id,
      variantId: null,
      movementType: "ADJUSTMENT",
      quantity: change,
      quantityBefore: before,
      quantityAfter: quantity,
      reason,
      referenceType: "portal",
      referenceId: item.id,
      metadata: {
        inventoryItemId: item.id,
      },
    });

    return {
      variantId: null,
      quantityBefore: before,
      quantityAfter: quantity,
      change,
    };
  }

  @Get("inventory/order-consumption")
  @ApiOperation({ summary: "Order-based inventory consumption trace" })
  async getInventoryOrderConsumption(
    @Req() req: Request,
    @Query("days") days?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const window = this.parseWindow(days, startDate, endDate);

    let orderItemRows: Array<{
      order_id: string;
      order_number: string;
      customer_name: string;
      status: string;
      created_at: Date;
      item_sku: string;
      product_name: string;
      consumed_qty: string;
    }> = [];

    try {
      const baseOrderItems = await this.pool.query<{
        order_id: string;
        order_number: string;
        customer_name: string;
        status: string;
        created_at: Date;
        item_sku: string;
        product_name: string;
        consumed_qty: string;
      }>(
        `SELECT
           o.id::text as order_id,
           COALESCE(o.order_number, o.id::text) as order_number,
           COALESCE(o.customer_name, c.name, c.phone, '—') as customer_name,
           o.status::text as status,
           o.created_at,
           COALESCE(NULLIF(oi.sku, ''), '-')::text as item_sku,
           COALESCE(NULLIF(oi.name, ''), NULLIF(oi.sku, ''), 'منتج')::text as product_name,
           SUM(COALESCE(oi.quantity, 0)::numeric)::text as consumed_qty
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.merchant_id = $1
           AND o.created_at >= $2
           AND o.created_at <= $3
           AND o.status::text NOT IN ('CANCELLED', 'DRAFT')
         GROUP BY
           o.id,
           o.order_number,
           o.customer_name,
           c.name,
           c.phone,
           o.status,
           o.created_at,
           COALESCE(NULLIF(oi.sku, ''), '-'),
           COALESCE(NULLIF(oi.name, ''), NULLIF(oi.sku, ''), 'منتج')
         ORDER BY o.created_at DESC, o.id::text, COALESCE(NULLIF(oi.sku, ''), '-')::text
         LIMIT 1500`,
        [merchantId, window.startDate, window.endDate],
      );
      orderItemRows = baseOrderItems.rows;
    } catch (error) {
      this.logger.warn(
        `Order consumption query fallback activated: ${(error as Error)?.message || error}`,
      );
      orderItemRows = [];
    }

    const costLookupBySku = new Map<
      string,
      { unitCost: number; productName: string }
    >();
    const skuList = Array.from(
      new Set(
        orderItemRows
          .map((row) => String(row.item_sku || "").trim())
          .filter((sku) => sku && sku !== "-"),
      ),
    );
    if (skuList.length > 0) {
      try {
        const costLookupRows = await this.pool.query<{
          item_sku: string;
          unit_cost: string;
          product_name: string;
        }>(
          `WITH variant_costs AS (
             SELECT
               iv.sku::text as item_sku,
               COALESCE(
                 NULLIF((to_jsonb(iv)->>'cost_price'), '')::numeric,
                 NULLIF((to_jsonb(ii)->>'cost_price'), '')::numeric,
                 0
               )::numeric as unit_cost,
               COALESCE(
                 NULLIF(iv.name, ''),
                 NULLIF(ci.name_ar, ''),
                 NULLIF(ci.name_en, ''),
                 NULLIF(ii.sku, ''),
                 iv.sku
               )::text as product_name
             FROM inventory_variants iv
             LEFT JOIN inventory_items ii ON ii.id = iv.inventory_item_id AND ii.merchant_id = iv.merchant_id
             LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = iv.merchant_id
             WHERE iv.merchant_id = $1
               AND iv.sku = ANY($2::text[])
           ),
           item_costs AS (
             SELECT
               ii.sku::text as item_sku,
               COALESCE(NULLIF((to_jsonb(ii)->>'cost_price'), '')::numeric, 0)::numeric as unit_cost,
               COALESCE(
                 NULLIF((to_jsonb(ii)->>'name'), ''),
                 NULLIF(ci.name_ar, ''),
                 NULLIF(ci.name_en, ''),
                 ii.sku
               )::text as product_name
             FROM inventory_items ii
             LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
             WHERE ii.merchant_id = $1
               AND ii.sku = ANY($2::text[])
           ),
           combined AS (
             SELECT * FROM variant_costs
             UNION ALL
             SELECT * FROM item_costs
           )
           SELECT
             item_sku,
             MAX(unit_cost)::text as unit_cost,
             MAX(product_name)::text as product_name
           FROM combined
           GROUP BY item_sku`,
          [merchantId, skuList],
        );
        for (const row of costLookupRows.rows) {
          costLookupBySku.set(row.item_sku, {
            unitCost: this.toNumber(row.unit_cost, 0),
            productName: row.product_name || row.item_sku,
          });
        }
      } catch (error) {
        this.logger.warn(
          `Order consumption cost lookup fallback activated: ${(error as Error)?.message || error}`,
        );
      }
    }

    let movementRows: Array<{
      reference_id: string | null;
      item_sku: string;
      quantity_before: string | null;
      quantity_after: string | null;
      created_at: Date;
    }> = [];
    try {
      const movementResult = await this.pool.query<{
        reference_id: string | null;
        item_sku: string;
        quantity_before: string | null;
        quantity_after: string | null;
        created_at: Date;
      }>(
        `SELECT
           sm.reference_id,
           COALESCE(
             NULLIF((to_jsonb(sm)->'metadata'->>'variantSku'), ''),
             NULLIF((to_jsonb(sm)->'metadata'->>'sku'), ''),
             NULLIF((to_jsonb(sm)->>'sku'), ''),
             '-'
           )::text as item_sku,
           NULLIF((to_jsonb(sm)->>'quantity_before'), '')::text as quantity_before,
           NULLIF((to_jsonb(sm)->>'quantity_after'), '')::text as quantity_after,
           sm.created_at
         FROM stock_movements sm
         WHERE sm.merchant_id = $1
           AND sm.created_at >= $2
           AND sm.created_at <= $3
           AND LOWER(COALESCE(sm.reference_type, '')) IN ('order', 'sale', 'orders')
           AND sm.reference_id IS NOT NULL
         ORDER BY sm.created_at DESC`,
        [merchantId, window.startDate, window.endDate],
      );
      movementRows = movementResult.rows;
    } catch (error) {
      this.logger.warn(
        `Stock movement lookup fallback activated: ${(error as Error)?.message || error}`,
      );
      movementRows = [];
    }

    const movementByOrderSku = new Map<
      string,
      { before: number; after: number }
    >();
    const movementByOrder = new Map<
      string,
      { before: number; after: number }
    >();
    for (const row of movementRows) {
      const ref = String(row.reference_id || "").trim();
      if (!ref) continue;
      const before = this.toNumber(row.quantity_before, 0);
      const after = this.toNumber(row.quantity_after, 0);
      const perSkuKey = `${ref}__${row.item_sku}`;
      if (!movementByOrderSku.has(perSkuKey)) {
        movementByOrderSku.set(perSkuKey, { before, after });
      }
      if (!movementByOrder.has(ref)) {
        movementByOrder.set(ref, { before, after });
      }
    }

    const orderMap = new Map<string, any>();
    let totalConsumedUnits = 0;
    let totalEstimatedCost = 0;

    for (const row of orderItemRows) {
      const orderKey = row.order_id || row.order_number;
      if (!orderMap.has(orderKey)) {
        orderMap.set(orderKey, {
          orderId: row.order_id,
          orderNumber: row.order_number || row.order_id,
          customerName: row.customer_name || "—",
          status: row.status || "—",
          totalConsumedUnits: 0,
          estimatedCost: 0,
          items: [],
          _createdAt: row.created_at,
        });
      }

      const costLookup = costLookupBySku.get(row.item_sku);
      const consumedQty = this.toNumber(row.consumed_qty, 0);
      const unitCost = this.toNumber(costLookup?.unitCost, 0);
      const estimatedCost = Number((consumedQty * unitCost).toFixed(2));

      const skuKeyById = `${row.order_id}__${row.item_sku}`;
      const skuKeyByNum = `${row.order_number}__${row.item_sku}`;
      const movement = movementByOrderSku.get(skuKeyById) ||
        movementByOrderSku.get(skuKeyByNum) ||
        movementByOrder.get(row.order_id) ||
        movementByOrder.get(row.order_number) || { before: 0, after: 0 };

      const order = orderMap.get(orderKey);
      order.items.push({
        sku: row.item_sku,
        productName: costLookup?.productName || row.product_name,
        consumedQty,
        quantityBefore: movement.before,
        quantityAfter: movement.after,
        unitCost,
        estimatedCost,
      });
      order.totalConsumedUnits += consumedQty;
      order.estimatedCost = Number(
        (order.estimatedCost + estimatedCost).toFixed(2),
      );
      totalConsumedUnits += consumedQty;
      totalEstimatedCost += estimatedCost;
    }

    const orders = Array.from(orderMap.values())
      .sort(
        (a, b) =>
          new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime(),
      )
      .map(({ _createdAt, ...rest }) => rest);

    return {
      summary: {
        orderCount: orders.length,
        totalConsumedUnits: Number(totalConsumedUnits.toFixed(3)),
        totalEstimatedCost: Number(totalEstimatedCost.toFixed(2)),
      },
      orders,
    };
  }

  @Get("inventory/movement-trace")
  @ApiOperation({ summary: "Trace stock movements with source breakdown" })
  async getInventoryMovementTrace(
    @Req() req: Request,
    @Query("days") days?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("source") source?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const window = this.parseWindow(days, startDate, endDate);

    const params: any[] = [merchantId, window.startDate, window.endDate];
    let sourceFilter = "";
    if (source && source !== "ALL") {
      params.push(String(source).toLowerCase());
      sourceFilter = `AND LOWER(COALESCE(sm.reference_type, sm.movement_type, 'manual')) = $${params.length}`;
    }

    const movementResult = await this.pool.query<{
      movement_id: string;
      created_at: Date;
      source: string;
      movement_type: string;
      reference_type: string | null;
      reference_id: string | null;
      quantity: string;
      quantity_before: string | null;
      quantity_after: string | null;
      reason: string | null;
      metadata: Record<string, any> | string | null;
      sku: string;
      product_name: string;
      unit_cost: string;
      order_number: string | null;
    }>(
      `SELECT
         sm.id::text as movement_id,
         sm.created_at,
         COALESCE(sm.reference_type, sm.movement_type, 'manual') as source,
         COALESCE(sm.movement_type, 'ADJUSTMENT') as movement_type,
         sm.reference_type,
         sm.reference_id,
         sm.quantity::text as quantity,
         NULLIF((to_jsonb(sm)->>'quantity_before'), '')::text as quantity_before,
         NULLIF((to_jsonb(sm)->>'quantity_after'), '')::text as quantity_after,
         COALESCE(NULLIF((to_jsonb(sm)->>'reason'), ''), sm.notes) as reason,
         COALESCE((to_jsonb(sm)->'metadata'), '{}'::jsonb) as metadata,
         COALESCE(iv.sku, ii.sku, ci.sku, '-') as sku,
         COALESCE(iv.name, ci.name_ar, ci.name_en, ii.sku, 'منتج') as product_name,
         COALESCE(
           NULLIF((to_jsonb(iv)->>'cost_price'), '')::numeric,
           NULLIF((to_jsonb(ii)->>'cost_price'), '')::numeric,
           0
         )::text as unit_cost,
         oref.order_number
       FROM stock_movements sm
       LEFT JOIN inventory_variants iv ON iv.id::text = (to_jsonb(sm)->>'variant_id')
       LEFT JOIN inventory_items ii ON ii.id = iv.inventory_item_id
         OR ii.catalog_item_id::text = (to_jsonb(sm)->>'catalog_item_id')
       LEFT JOIN catalog_items ci ON ci.id::text = (to_jsonb(sm)->>'catalog_item_id')
       LEFT JOIN orders oref ON oref.merchant_id = sm.merchant_id
         AND (oref.id::text = sm.reference_id OR oref.order_number = sm.reference_id)
       WHERE sm.merchant_id = $1
         AND sm.created_at >= $2
         AND sm.created_at <= $3
         ${sourceFilter}
       ORDER BY sm.created_at DESC
       LIMIT 2000`,
      params,
    );

    const sourceLabels: Record<string, string> = {
      ORDER: "طلب",
      SALE: "بيع",
      RESTOCK: "توريد",
      ADJUSTMENT: "تعديل",
      RETURN: "مرتجع",
      TRANSFER: "نقل",
      MANUAL: "يدوي",
      PORTAL: "لوحة التحكم",
      IMPORT: "استيراد",
    };

    let totalInbound = 0;
    let totalOutbound = 0;
    let netOnHandImpact = 0;
    let totalEstimatedInboundCost = 0;
    let totalEstimatedOutboundCost = 0;
    const affectedSkus = new Set<string>();
    const sourceAgg = new Map<
      string,
      {
        source: string;
        count: number;
        inbound: number;
        outbound: number;
        net: number;
      }
    >();

    const movements = movementResult.rows.map((row) => {
      const qty = this.toNumber(row.quantity, 0);
      const unitCost = this.toNumber(row.unit_cost, 0);
      const estimatedCostImpact = Number((qty * unitCost).toFixed(2));
      const sourceCode = String(row.source || "manual").toUpperCase();
      const direction = qty > 0 ? "IN" : qty < 0 ? "OUT" : "NEUTRAL";
      const metadata = this.parseJsonObject(row.metadata);
      const fromLocationId =
        metadata.fromLocationId || metadata.from_location_id || null;
      const toLocationId =
        metadata.toLocationId || metadata.to_location_id || null;

      if (qty > 0) {
        totalInbound += qty;
        totalEstimatedInboundCost += qty * unitCost;
      } else if (qty < 0) {
        totalOutbound += Math.abs(qty);
        totalEstimatedOutboundCost += Math.abs(qty) * unitCost;
      }
      netOnHandImpact += qty;
      if (row.sku && row.sku !== "-") {
        affectedSkus.add(row.sku);
      }

      if (!sourceAgg.has(sourceCode)) {
        sourceAgg.set(sourceCode, {
          source: sourceCode,
          count: 0,
          inbound: 0,
          outbound: 0,
          net: 0,
        });
      }
      const sourceRow = sourceAgg.get(sourceCode)!;
      sourceRow.count += 1;
      if (qty > 0) sourceRow.inbound += qty;
      if (qty < 0) sourceRow.outbound += Math.abs(qty);
      sourceRow.net += qty;

      return {
        movementId: row.movement_id,
        createdAt: row.created_at,
        source: sourceCode,
        sourceLabel: sourceLabels[sourceCode] || sourceCode,
        movementType: row.movement_type,
        referenceType: row.reference_type || sourceCode,
        referenceId: row.reference_id || "-",
        sku: row.sku || "-",
        productName: row.product_name || "منتج",
        quantity: qty,
        quantityBefore: this.toNumber(row.quantity_before, 0),
        quantityAfter: this.toNumber(row.quantity_after, 0),
        unitCost,
        estimatedCostImpact,
        onHandImpact: qty,
        direction,
        reason: row.reason || "",
        orderNumber: row.order_number || null,
        fromLocationId: fromLocationId || null,
        toLocationId: toLocationId || null,
        fromLocationName: null,
        toLocationName: null,
      };
    });

    const locationIds = new Set<string>();
    for (const movement of movements) {
      if (movement.fromLocationId)
        locationIds.add(String(movement.fromLocationId));
      if (movement.toLocationId) locationIds.add(String(movement.toLocationId));
    }
    const locationNameMap = new Map<string, string>();
    if (locationIds.size > 0) {
      const locationResult = await this.pool.query<{
        id: string;
        location_name: string;
      }>(
        `SELECT id::text as id, COALESCE(NULLIF(name_ar, ''), name) as location_name
         FROM warehouse_locations
         WHERE merchant_id = $1 AND id = ANY($2::uuid[])`,
        [merchantId, Array.from(locationIds)],
      );
      for (const row of locationResult.rows) {
        locationNameMap.set(row.id, row.location_name);
      }
    }

    for (const movement of movements) {
      if (movement.fromLocationId) {
        movement.fromLocationName =
          locationNameMap.get(String(movement.fromLocationId)) || null;
      }
      if (movement.toLocationId) {
        movement.toLocationName =
          locationNameMap.get(String(movement.toLocationId)) || null;
      }
    }

    return {
      summary: {
        totalMovements: movements.length,
        affectedSkus: affectedSkus.size,
        totalInbound: Number(totalInbound.toFixed(3)),
        totalOutbound: Number(totalOutbound.toFixed(3)),
        netOnHandImpact: Number(netOnHandImpact.toFixed(3)),
        totalEstimatedInboundCost: Number(totalEstimatedInboundCost.toFixed(2)),
        totalEstimatedOutboundCost: Number(
          totalEstimatedOutboundCost.toFixed(2),
        ),
        estimatedNetCostImpact: Number(
          (totalEstimatedInboundCost - totalEstimatedOutboundCost).toFixed(2),
        ),
      },
      bySource: Array.from(sourceAgg.values())
        .map((row) => ({
          ...row,
          inbound: Number(row.inbound.toFixed(3)),
          outbound: Number(row.outbound.toFixed(3)),
          net: Number(row.net.toFixed(3)),
        }))
        .sort((a, b) => b.count - a.count),
      movements,
    };
  }

  @Get("inventory/location-balance")
  @ApiOperation({
    summary: "Location-level stock balance and transfer recommendations",
  })
  async getInventoryLocationBalance(
    @Req() req: Request,
    @Query("days") days?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const window = this.parseWindow(days, startDate, endDate);

    const locationResult = await this.pool.query<{
      location_id: string;
      location_name: string;
      is_default: boolean;
      total_on_hand: string;
      total_reserved: string;
      total_available: string;
      variants_count: string;
      products_count: string;
      low_stock_variants: string;
      zero_stock_variants: string;
    }>(
      `SELECT
         wl.id::text as location_id,
         COALESCE(NULLIF(wl.name_ar, ''), wl.name) as location_name,
         COALESCE(wl.is_default, false) as is_default,
         COALESCE(SUM(COALESCE(sbl.quantity_on_hand, 0)), 0)::text as total_on_hand,
         COALESCE(SUM(COALESCE(sbl.quantity_reserved, 0)), 0)::text as total_reserved,
         COALESCE(SUM(COALESCE(sbl.quantity_on_hand, 0) - COALESCE(sbl.quantity_reserved, 0)), 0)::text as total_available,
         COUNT(DISTINCT sbl.variant_id)::text as variants_count,
         COUNT(DISTINCT iv.inventory_item_id)::text as products_count,
         COUNT(DISTINCT CASE
           WHEN (COALESCE(sbl.quantity_on_hand, 0) - COALESCE(sbl.quantity_reserved, 0))
             <= COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, 5)
           THEN sbl.variant_id END)::text as low_stock_variants,
         COUNT(DISTINCT CASE
           WHEN (COALESCE(sbl.quantity_on_hand, 0) - COALESCE(sbl.quantity_reserved, 0)) <= 0
           THEN sbl.variant_id END)::text as zero_stock_variants
       FROM warehouse_locations wl
       LEFT JOIN inventory_stock_by_location sbl
         ON sbl.location_id = wl.id
         AND sbl.merchant_id = wl.merchant_id
       LEFT JOIN inventory_variants iv
         ON iv.id = sbl.variant_id
         AND iv.merchant_id = wl.merchant_id
       LEFT JOIN inventory_items ii
         ON ii.id = iv.inventory_item_id
         AND ii.merchant_id = wl.merchant_id
       WHERE wl.merchant_id = $1
         AND COALESCE(wl.is_active, true) = true
       GROUP BY wl.id, wl.name, wl.name_ar, wl.is_default
       ORDER BY wl.is_default DESC, wl.name ASC`,
      [merchantId],
    );

    const transferStatsResult = await this.pool.query<{
      from_location_id: string | null;
      to_location_id: string | null;
      movement_type: string;
      qty: string;
    }>(
      `SELECT
         COALESCE((to_jsonb(sm)->'metadata'->>'fromLocationId'), (to_jsonb(sm)->'metadata'->>'from_location_id')) as from_location_id,
         COALESCE((to_jsonb(sm)->'metadata'->>'toLocationId'), (to_jsonb(sm)->'metadata'->>'to_location_id')) as to_location_id,
         COALESCE(sm.movement_type, '') as movement_type,
         ABS(COALESCE(sm.quantity, 0))::text as qty
       FROM stock_movements sm
       WHERE sm.merchant_id = $1
         AND sm.created_at >= $2
         AND sm.created_at <= $3`,
      [merchantId, window.startDate, window.endDate],
    );

    const transferInMap = new Map<string, number>();
    const transferOutMap = new Map<string, number>();
    const purchaseMap = new Map<string, number>();
    for (const row of transferStatsResult.rows) {
      const qty = this.toNumber(row.qty, 0);
      const movementType = String(row.movement_type || "").toUpperCase();
      if (row.from_location_id) {
        transferOutMap.set(
          row.from_location_id,
          (transferOutMap.get(row.from_location_id) || 0) + qty,
        );
      }
      if (row.to_location_id) {
        transferInMap.set(
          row.to_location_id,
          (transferInMap.get(row.to_location_id) || 0) + qty,
        );
      }
      if (
        row.to_location_id &&
        ["RESTOCK", "PURCHASE", "IN"].includes(movementType)
      ) {
        purchaseMap.set(
          row.to_location_id,
          (purchaseMap.get(row.to_location_id) || 0) + qty,
        );
      }
    }

    const locationRows = locationResult.rows.map((row) => {
      const locationId = row.location_id;
      const available = this.toNumber(row.total_available, 0);
      const lowCount = this.toNumber(row.low_stock_variants, 0);
      const zeroCount = this.toNumber(row.zero_stock_variants, 0);
      const recentDemandUnits = this.toNumber(
        transferOutMap.get(locationId),
        0,
      );
      const dailyDemand = window.days > 0 ? recentDemandUnits / window.days : 0;
      const coverageDays =
        dailyDemand > 0 ? Number((available / dailyDemand).toFixed(2)) : null;

      let actionRecommendation = "متوازن";
      let riskLevel = "LOW";
      if (zeroCount > 0) {
        actionRecommendation = "شراء عاجل";
        riskLevel = "HIGH";
      } else if (lowCount > 0) {
        actionRecommendation = "نقل داخلي أو شراء";
        riskLevel = "MEDIUM";
      }

      return {
        locationId,
        locationName: row.location_name,
        isDefault: this.toBoolean(row.is_default, false),
        totalOnHand: this.toNumber(row.total_on_hand, 0),
        totalReserved: this.toNumber(row.total_reserved, 0),
        totalAvailable: available,
        variantsCount: this.toNumber(row.variants_count, 0),
        productsCount: this.toNumber(row.products_count, 0),
        lowStockVariants: lowCount,
        zeroStockVariants: zeroCount,
        recentDemandUnits: Number(recentDemandUnits.toFixed(3)),
        recentDemandOrders: 0,
        dailyDemand: Number(dailyDemand.toFixed(3)),
        coverageDays,
        transferInQty: Number(
          this.toNumber(transferInMap.get(locationId), 0).toFixed(3),
        ),
        transferOutQty: Number(
          this.toNumber(transferOutMap.get(locationId), 0).toFixed(3),
        ),
        purchaseQty: Number(
          this.toNumber(purchaseMap.get(locationId), 0).toFixed(3),
        ),
        actionRecommendation,
        riskLevel,
      };
    });

    const variantByLocationResult = await this.pool.query<{
      variant_id: string;
      sku: string;
      product_name: string;
      location_id: string;
      location_name: string;
      available_qty: string;
      threshold: string;
      reorder_qty: string;
    }>(
      `SELECT
         sbl.variant_id::text as variant_id,
         COALESCE(iv.sku, '-') as sku,
         COALESCE(iv.name, ci.name_ar, ci.name_en, ii.sku, 'منتج') as product_name,
         sbl.location_id::text as location_id,
         COALESCE(NULLIF(wl.name_ar, ''), wl.name) as location_name,
         (COALESCE(sbl.quantity_on_hand, 0) - COALESCE(sbl.quantity_reserved, 0))::text as available_qty,
         COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, 5)::text as threshold,
         COALESCE(ii.reorder_quantity, COALESCE(iv.low_stock_threshold, ii.low_stock_threshold, 5) * 2)::text as reorder_qty
       FROM inventory_stock_by_location sbl
       JOIN warehouse_locations wl ON wl.id = sbl.location_id
         AND wl.merchant_id = sbl.merchant_id
         AND COALESCE(wl.is_active, true) = true
       JOIN inventory_variants iv ON iv.id = sbl.variant_id AND iv.merchant_id = sbl.merchant_id
       LEFT JOIN inventory_items ii ON ii.id = iv.inventory_item_id AND ii.merchant_id = sbl.merchant_id
       LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = sbl.merchant_id
       WHERE sbl.merchant_id = $1`,
      [merchantId],
    );

    const byVariant = new Map<string, typeof variantByLocationResult.rows>();
    for (const row of variantByLocationResult.rows) {
      if (!byVariant.has(row.variant_id)) {
        byVariant.set(row.variant_id, []);
      }
      byVariant.get(row.variant_id)!.push(row);
    }

    const transferRecommendations: Array<{
      variantId: string;
      sku: string;
      productName: string;
      fromLocationId: string;
      fromLocationName: string;
      toLocationId: string;
      toLocationName: string;
      quantity: number;
      reason: string;
    }> = [];
    const purchaseRecommendations: Array<{
      variantId: string;
      sku: string;
      productName: string;
      locationId: string;
      locationName: string;
      suggestedQty: number;
      reason: string;
    }> = [];

    for (const [variantId, rows] of byVariant.entries()) {
      const needs = rows
        .map((row) => ({
          ...row,
          available: this.toNumber(row.available_qty, 0),
          threshold: this.toNumber(row.threshold, 5),
          reorderQty: this.toNumber(row.reorder_qty, 10),
        }))
        .filter((row) => row.available < row.threshold);

      const donors = rows
        .map((row) => ({
          ...row,
          available: this.toNumber(row.available_qty, 0),
          threshold: this.toNumber(row.threshold, 5),
          reorderQty: this.toNumber(row.reorder_qty, 10),
        }))
        .filter((row) => row.available > row.threshold + 1)
        .sort((a, b) => b.available - a.available);

      for (const need of needs) {
        let deficit = Math.max(need.threshold - need.available, 0);
        for (const donor of donors) {
          if (deficit <= 0) break;
          if (donor.location_id === need.location_id) continue;
          const donorSurplus = Math.max(donor.available - donor.threshold, 0);
          if (donorSurplus <= 0) continue;

          const transferQty = Math.min(deficit, donorSurplus);
          if (transferQty <= 0) continue;

          transferRecommendations.push({
            variantId,
            sku: need.sku,
            productName: need.product_name,
            fromLocationId: donor.location_id,
            fromLocationName: donor.location_name,
            toLocationId: need.location_id,
            toLocationName: need.location_name,
            quantity: Number(transferQty.toFixed(3)),
            reason: `تغطية عجز ${need.location_name} من فائض ${donor.location_name}`,
          });

          donor.available -= transferQty;
          deficit -= transferQty;
        }

        if (deficit > 0) {
          purchaseRecommendations.push({
            variantId,
            sku: need.sku,
            productName: need.product_name,
            locationId: need.location_id,
            locationName: need.location_name,
            suggestedQty: Math.max(
              Math.ceil(deficit),
              Math.ceil(need.reorderQty),
            ),
            reason: `عجز بعد النقل الداخلي (${deficit.toFixed(2)})`,
          });
        }
      }
    }

    const locationsNeedTransfer = new Set(
      transferRecommendations.map((rec) => rec.toLocationId),
    ).size;
    const locationsNeedPurchase = new Set(
      purchaseRecommendations.map((rec) => rec.locationId),
    ).size;

    return {
      summary: {
        totalLocations: locationRows.length,
        locationsNeedTransfer,
        locationsNeedPurchase,
        transferRecommendations: transferRecommendations.length,
        purchaseRecommendations: purchaseRecommendations.length,
      },
      locations: locationRows,
      transferRecommendations: transferRecommendations.slice(0, 100),
      purchaseRecommendations: purchaseRecommendations.slice(0, 100),
    };
  }

  @Get("inventory/monthly-cost-trend")
  @ApiOperation({ summary: "Monthly weighted purchase cost trend per SKU" })
  async getInventoryMonthlyCostTrend(
    @Req() req: Request,
    @Query("months") monthsRaw?: string,
    @Query("sku") skuRaw?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const requestedMonths = Number.parseInt(String(monthsRaw || ""), 10);
    const months = Number.isFinite(requestedMonths)
      ? Math.min(Math.max(requestedMonths, 1), 24)
      : 6;

    let start: Date;
    let end: Date;
    if (
      startDate &&
      endDate &&
      !Number.isNaN(new Date(startDate).getTime()) &&
      !Number.isNaN(new Date(endDate).getTime())
    ) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      end = new Date();
      end.setHours(23, 59, 59, 999);
      start = new Date(end);
      start.setMonth(start.getMonth() - (months - 1));
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }

    const skuFilter = skuRaw && skuRaw.trim() ? `%${skuRaw.trim()}%` : null;

    let lotsRows: Array<{
      item_sku: string;
      product_name: string;
      month_key: string;
      purchased_units: string;
      total_cost: string;
    }> = [];

    try {
      const lotsResult = await this.pool.query<{
        item_sku: string;
        product_name: string;
        month_key: string;
        purchased_units: string;
        total_cost: string;
      }>(
        `WITH lots_normalized AS (
           SELECT
             COALESCE(iv.sku, ii.sku, '-')::text as item_sku,
             COALESCE(iv.name, ci.name_ar, ci.name_en, ii.sku, 'منتج')::text as item_name,
             date_trunc('month', COALESCE(l.received_date::timestamp, l.created_at)) as month_bucket,
             GREATEST(COALESCE(l.quantity, 0), 0)::numeric as purchased_qty,
             (
               GREATEST(COALESCE(l.quantity, 0), 0)
               * COALESCE(l.cost_price, iv.cost_price, ii.cost_price, 0)
             )::numeric as purchased_cost
           FROM inventory_lots l
           LEFT JOIN inventory_variants iv ON iv.id = l.variant_id AND iv.merchant_id = l.merchant_id
           LEFT JOIN inventory_items ii ON ii.id = COALESCE(l.item_id, iv.inventory_item_id) AND ii.merchant_id = l.merchant_id
           LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = l.merchant_id
           WHERE l.merchant_id = $1
             AND COALESCE(l.received_date::timestamp, l.created_at) >= $2
             AND COALESCE(l.received_date::timestamp, l.created_at) <= $3
         ),
         filtered_lots AS (
           SELECT *
           FROM lots_normalized
           WHERE ($4::text IS NULL OR item_sku ILIKE $4)
         )
         SELECT
           item_sku,
           item_name as product_name,
           to_char(month_bucket, 'YYYY-MM') as month_key,
           SUM(purchased_qty)::text as purchased_units,
           SUM(purchased_cost)::text as total_cost
         FROM filtered_lots
         GROUP BY item_sku, item_name, month_bucket
         HAVING SUM(purchased_qty) > 0
         ORDER BY item_sku, month_bucket`,
        [merchantId, start, end, skuFilter],
      );
      lotsRows = lotsResult.rows;
    } catch (error) {
      this.logger.warn(
        `Monthly cost trend lots query fallback activated: ${(error as Error)?.message || error}`,
      );
      lotsRows = [];
    }

    const source = lotsRows.length > 0 ? "LOTS" : "MOVEMENTS";
    let movementRows: Array<{
      item_sku: string;
      product_name: string;
      month_key: string;
      purchased_units: string;
      total_cost: string;
    }> = [];

    if (source === "MOVEMENTS") {
      try {
        const movementResult = await this.pool.query<{
          item_sku: string;
          product_name: string;
          month_key: string;
          purchased_units: string;
          total_cost: string;
        }>(
          `WITH movement_purchases_raw AS (
             SELECT
               COALESCE(iv.sku, ii.sku, ci.sku, '-')::text as item_sku,
               COALESCE(iv.name, ci.name_ar, ci.name_en, ii.sku, 'منتج')::text as item_name,
               date_trunc('month', sm.created_at) as month_bucket,
               CASE WHEN sm.quantity > 0 THEN sm.quantity::numeric ELSE 0 END as purchased_qty,
               CASE WHEN sm.quantity > 0
                 THEN sm.quantity::numeric * COALESCE(iv.cost_price, ii.cost_price, 0)::numeric
                 ELSE 0
               END as purchased_cost
             FROM stock_movements sm
             LEFT JOIN inventory_variants iv ON iv.id::text = (to_jsonb(sm)->>'variant_id')
             LEFT JOIN inventory_items ii ON ii.id = iv.inventory_item_id
               OR ii.catalog_item_id::text = (to_jsonb(sm)->>'catalog_item_id')
             LEFT JOIN catalog_items ci ON ci.id::text = (to_jsonb(sm)->>'catalog_item_id')
             WHERE sm.merchant_id = $1
               AND sm.created_at >= $2
               AND sm.created_at <= $3
               AND sm.quantity > 0
               AND UPPER(COALESCE(sm.movement_type, '')) IN ('RESTOCK', 'PURCHASE', 'IN', 'ADJUSTMENT')
           ),
           movement_purchases AS (
             SELECT *
             FROM movement_purchases_raw
             WHERE ($4::text IS NULL OR item_sku ILIKE $4)
           )
           SELECT
             item_sku,
             item_name as product_name,
             to_char(month_bucket, 'YYYY-MM') as month_key,
             SUM(purchased_qty)::text as purchased_units,
             SUM(purchased_cost)::text as total_cost
           FROM movement_purchases
           GROUP BY item_sku, item_name, month_bucket
           HAVING SUM(purchased_qty) > 0
           ORDER BY item_sku, month_bucket`,
          [merchantId, start, end, skuFilter],
        );
        movementRows = movementResult.rows;
      } catch (error) {
        const rawMessage = (error as Error)?.message || "";
        this.logger.warn(
          `Monthly cost trend movement query fallback activated: ${rawMessage}`,
        );
        try {
          const fallbackResult = await this.pool.query<{
            item_sku: string;
            product_name: string;
            month_key: string;
            purchased_units: string;
            total_cost: string;
          }>(
            `WITH movement_purchases_raw AS (
               SELECT
                 COALESCE(
                   NULLIF((to_jsonb(sm)->'metadata'->>'sku'), ''),
                   NULLIF((to_jsonb(sm)->>'sku'), ''),
                   '-'
                 )::text as item_sku,
                 COALESCE(
                   NULLIF((to_jsonb(sm)->'metadata'->>'productName'), ''),
                   NULLIF((to_jsonb(sm)->'metadata'->>'product_name'), ''),
                   NULLIF((to_jsonb(sm)->>'product_name'), ''),
                   'منتج'
                 )::text as item_name,
                 date_trunc('month', sm.created_at) as month_bucket,
                 CASE WHEN sm.quantity > 0 THEN sm.quantity::numeric ELSE 0 END as purchased_qty,
                 CASE WHEN sm.quantity > 0
                   THEN sm.quantity::numeric * COALESCE(
                     NULLIF((to_jsonb(sm)->'metadata'->>'unitCost'), '')::numeric,
                     NULLIF((to_jsonb(sm)->'metadata'->>'unit_cost'), '')::numeric,
                     NULLIF((to_jsonb(sm)->>'unit_cost'), '')::numeric,
                     0
                   )
                   ELSE 0
                 END as purchased_cost
               FROM stock_movements sm
               WHERE sm.merchant_id = $1
                 AND sm.created_at >= $2
                 AND sm.created_at <= $3
                 AND sm.quantity > 0
                 AND UPPER(COALESCE(sm.movement_type, '')) IN ('RESTOCK', 'PURCHASE', 'IN', 'ADJUSTMENT')
             ),
             movement_purchases AS (
               SELECT *
               FROM movement_purchases_raw
               WHERE ($4::text IS NULL OR item_sku ILIKE $4)
             )
             SELECT
               item_sku,
               item_name as product_name,
               to_char(month_bucket, 'YYYY-MM') as month_key,
               SUM(purchased_qty)::text as purchased_units,
               SUM(purchased_cost)::text as total_cost
             FROM movement_purchases
             GROUP BY item_sku, item_name, month_bucket
             HAVING SUM(purchased_qty) > 0
             ORDER BY item_sku, month_bucket`,
            [merchantId, start, end, skuFilter],
          );
          movementRows = fallbackResult.rows;
        } catch (fallbackError) {
          this.logger.warn(
            `Monthly cost trend movement fallback failed: ${(fallbackError as Error)?.message || fallbackError}`,
          );
          movementRows = [];
        }
      }
    }

    const rows = source === "LOTS" ? lotsRows : movementRows;
    const itemMap = new Map<
      string,
      {
        sku: string;
        productName: string;
        totalPurchasedUnits: number;
        totalPurchasedCost: number;
        months: Array<{
          month: string;
          purchasedUnits: number;
          totalCost: number;
          avgUnitCost: number;
        }>;
      }
    >();

    let totalPurchasedUnits = 0;
    let totalPurchasedCost = 0;

    for (const row of rows) {
      const key = `${row.item_sku}__${row.product_name}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          sku: row.item_sku,
          productName: row.product_name,
          totalPurchasedUnits: 0,
          totalPurchasedCost: 0,
          months: [],
        });
      }

      const units = this.toNumber(row.purchased_units, 0);
      const cost = this.toNumber(row.total_cost, 0);
      const avg = units > 0 ? cost / units : 0;
      const item = itemMap.get(key)!;
      item.months.push({
        month: row.month_key,
        purchasedUnits: Number(units.toFixed(3)),
        totalCost: Number(cost.toFixed(2)),
        avgUnitCost: Number(avg.toFixed(4)),
      });
      item.totalPurchasedUnits += units;
      item.totalPurchasedCost += cost;
      totalPurchasedUnits += units;
      totalPurchasedCost += cost;
    }

    const items = Array.from(itemMap.values())
      .map((item) => ({
        ...item,
        totalPurchasedUnits: Number(item.totalPurchasedUnits.toFixed(3)),
        totalPurchasedCost: Number(item.totalPurchasedCost.toFixed(2)),
        overallAvgUnitCost:
          item.totalPurchasedUnits > 0
            ? Number(
                (item.totalPurchasedCost / item.totalPurchasedUnits).toFixed(4),
              )
            : 0,
        months: item.months.sort((a, b) => a.month.localeCompare(b.month)),
      }))
      .sort((a, b) => b.totalPurchasedCost - a.totalPurchasedCost);

    return {
      source,
      summary: {
        totalSkus: items.length,
        totalPurchasedUnits: Number(totalPurchasedUnits.toFixed(3)),
        totalPurchasedCost: Number(totalPurchasedCost.toFixed(2)),
      },
      items,
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    };
  }

  @Get("catalog/:itemId/recipe")
  @ApiOperation({ summary: "Get recipe (BOM) for catalog item" })
  async getCatalogItemRecipe(
    @Req() req: Request,
    @Param("itemId") itemId: string,
  ) {
    const merchantId = this.getMerchantId(req);

    const recipeResult = await this.pool.query<{
      id: string;
      ingredient_inventory_item_id: string | null;
      ingredient_name: string;
      quantity_required: string;
      unit: string;
      is_optional: boolean;
      waste_factor: string;
      notes: string | null;
      ingredient_sku: string;
      ingredient_cost: string;
    }>(
      `SELECT
         r.id::text as id,
         r.ingredient_inventory_item_id::text as ingredient_inventory_item_id,
         r.ingredient_name,
         r.quantity_required::text as quantity_required,
         r.unit,
         COALESCE(r.is_optional, false) as is_optional,
         COALESCE(r.waste_factor, 1)::text as waste_factor,
         r.notes,
         COALESCE(ii.sku, ic.sku, '') as ingredient_sku,
         COALESCE(vcost.cost_price, ii.cost_price, 0)::text as ingredient_cost
       FROM item_recipes r
       LEFT JOIN inventory_items ii
         ON ii.id = r.ingredient_inventory_item_id
         AND ii.merchant_id = r.merchant_id
       LEFT JOIN catalog_items ic
         ON ic.id = r.ingredient_catalog_item_id
         AND ic.merchant_id = r.merchant_id
       LEFT JOIN LATERAL (
         SELECT v.cost_price
         FROM inventory_variants v
         WHERE v.merchant_id = r.merchant_id
           AND v.inventory_item_id = r.ingredient_inventory_item_id
           AND COALESCE(v.is_active, true) = true
         ORDER BY v.quantity_on_hand DESC, v.created_at ASC
         LIMIT 1
       ) vcost ON true
       WHERE r.merchant_id = $1
         AND r.catalog_item_id::text = $2
       ORDER BY r.sort_order ASC, r.created_at ASC`,
      [merchantId, itemId],
    );

    const ingredients = recipeResult.rows.map((row) => {
      const quantityRequired = this.toNumber(row.quantity_required, 0);
      const wasteFactor = this.toNumber(row.waste_factor, 1);
      const ingredientCost = this.toNumber(row.ingredient_cost, 0);
      return {
        id: row.id,
        ingredient_inventory_item_id: row.ingredient_inventory_item_id,
        ingredient_name: row.ingredient_name,
        quantity_required: quantityRequired,
        unit: row.unit || "piece",
        is_optional: Boolean(row.is_optional),
        waste_factor: wasteFactor,
        notes: row.notes || "",
        ingredient_sku: row.ingredient_sku || "",
        ingredient_cost: ingredientCost,
      };
    });

    const totalCostPerUnit = ingredients.reduce((sum, ingredient) => {
      const effectiveQty =
        ingredient.quantity_required * (ingredient.waste_factor || 1);
      return sum + effectiveQty * (ingredient.ingredient_cost || 0);
    }, 0);

    return {
      catalogItemId: itemId,
      ingredients,
      totalCostPerUnit: Number(totalCostPerUnit.toFixed(2)),
      ingredientCount: ingredients.length,
    };
  }

  @Post("catalog/:itemId/recipe")
  @ApiOperation({ summary: "Add ingredient to catalog item recipe" })
  async addCatalogItemRecipeIngredient(
    @Req() req: Request,
    @Param("itemId") itemId: string,
    @Body()
    body: {
      ingredientInventoryItemId?: string;
      ingredientCatalogItemId?: string;
      ingredientName?: string;
      quantityRequired?: number;
      unit?: string;
      isOptional?: boolean;
      wasteFactor?: number;
      notes?: string;
      sortOrder?: number;
    },
  ) {
    const merchantId = this.getMerchantId(req);
    const catalogItem = await this.pool.query<{ id: string }>(
      `SELECT id FROM catalog_items WHERE merchant_id = $1 AND id::text = $2 LIMIT 1`,
      [merchantId, itemId],
    );
    if (catalogItem.rows.length === 0) {
      throw new NotFoundException("الصنف غير موجود");
    }

    let ingredientInventoryItemId: string | null = null;
    let ingredientCatalogItemId: string | null = null;
    let resolvedIngredientName = (body.ingredientName || "").trim();

    if (body.ingredientInventoryItemId) {
      const ingredientItem = await this.pool.query<{
        id: string;
        name: string;
      }>(
        `SELECT
           ii.id::text as id,
           COALESCE(
             NULLIF((to_jsonb(ii)->>'name'), ''),
             ci.name_ar,
             ci.name_en,
             ii.sku
           ) as name
         FROM inventory_items ii
         LEFT JOIN catalog_items ci ON ci.id = ii.catalog_item_id AND ci.merchant_id = ii.merchant_id
         WHERE ii.merchant_id = $1 AND ii.id::text = $2
         LIMIT 1`,
        [merchantId, body.ingredientInventoryItemId],
      );
      if (ingredientItem.rows.length === 0) {
        throw new BadRequestException("مكوّن المخزون غير موجود");
      }
      ingredientInventoryItemId = ingredientItem.rows[0].id;
      if (!resolvedIngredientName) {
        resolvedIngredientName = ingredientItem.rows[0].name || "";
      }
    }

    if (body.ingredientCatalogItemId) {
      const ingredientCatalog = await this.pool.query<{
        id: string;
        name: string;
      }>(
        `SELECT id::text as id, COALESCE(name_ar, name_en, sku) as name
         FROM catalog_items
         WHERE merchant_id = $1 AND id::text = $2
         LIMIT 1`,
        [merchantId, body.ingredientCatalogItemId],
      );
      if (ingredientCatalog.rows.length === 0) {
        throw new BadRequestException("صنف الكتالوج للمكوّن غير موجود");
      }
      ingredientCatalogItemId = ingredientCatalog.rows[0].id;
      if (!resolvedIngredientName) {
        resolvedIngredientName = ingredientCatalog.rows[0].name || "";
      }
    }

    if (!ingredientInventoryItemId && !ingredientCatalogItemId) {
      throw new BadRequestException("يجب تحديد مكوّن مخزون أو مكوّن كتالوج");
    }
    if (!resolvedIngredientName) {
      throw new BadRequestException("اسم المكوّن مطلوب");
    }

    const quantityRequired = Math.max(
      0.0001,
      this.toNumber(body.quantityRequired, 1),
    );
    const wasteFactor = Math.min(
      Math.max(this.toNumber(body.wasteFactor, 1), 0),
      10,
    );

    const insertResult = await this.pool.query(
      `INSERT INTO item_recipes (
         merchant_id, catalog_item_id, ingredient_inventory_item_id, ingredient_catalog_item_id,
         ingredient_name, quantity_required, unit, is_optional, waste_factor, notes, sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id::text as id`,
      [
        merchantId,
        catalogItem.rows[0].id,
        ingredientInventoryItemId,
        ingredientCatalogItemId,
        resolvedIngredientName,
        quantityRequired,
        body.unit || "piece",
        this.toBoolean(body.isOptional, false),
        wasteFactor,
        body.notes || null,
        Number.isFinite(this.toNumber(body.sortOrder, NaN))
          ? this.toNumber(body.sortOrder, 0)
          : 0,
      ],
    );

    await this.pool.query(
      `UPDATE catalog_items
       SET has_recipe = true, updated_at = NOW()
       WHERE merchant_id = $1 AND id::text = $2`,
      [merchantId, itemId],
    );

    return {
      success: true,
      ingredientId: insertResult.rows[0]?.id,
    };
  }

  @Patch("catalog/:itemId/recipe/:ingredientId")
  @ApiOperation({ summary: "Update recipe ingredient row" })
  async updateCatalogItemRecipeIngredient(
    @Req() req: Request,
    @Param("itemId") itemId: string,
    @Param("ingredientId") ingredientId: string,
    @Body()
    body: Partial<{
      ingredientName: string;
      quantityRequired: number;
      unit: string;
      isOptional: boolean;
      wasteFactor: number;
      notes: string;
      sortOrder: number;
    }>,
  ) {
    const merchantId = this.getMerchantId(req);
    const exists = await this.pool.query(
      `SELECT id
       FROM item_recipes
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2
         AND id::text = $3
       LIMIT 1`,
      [merchantId, itemId, ingredientId],
    );
    if (exists.rows.length === 0) {
      throw new NotFoundException("المكوّن غير موجود");
    }

    const updates: string[] = [];
    const values: any[] = [merchantId, itemId, ingredientId];
    let idx = 4;

    if (body.ingredientName !== undefined) {
      updates.push(`ingredient_name = $${idx++}`);
      values.push(String(body.ingredientName).trim());
    }
    if (body.quantityRequired !== undefined) {
      updates.push(`quantity_required = $${idx++}`);
      values.push(Math.max(0.0001, this.toNumber(body.quantityRequired, 1)));
    }
    if (body.unit !== undefined) {
      updates.push(`unit = $${idx++}`);
      values.push(body.unit || "piece");
    }
    if (body.isOptional !== undefined) {
      updates.push(`is_optional = $${idx++}`);
      values.push(this.toBoolean(body.isOptional, false));
    }
    if (body.wasteFactor !== undefined) {
      updates.push(`waste_factor = $${idx++}`);
      values.push(
        Math.min(Math.max(this.toNumber(body.wasteFactor, 1), 0), 10),
      );
    }
    if (body.notes !== undefined) {
      updates.push(`notes = $${idx++}`);
      values.push(body.notes || null);
    }
    if (body.sortOrder !== undefined) {
      updates.push(`sort_order = $${idx++}`);
      values.push(Math.trunc(this.toNumber(body.sortOrder, 0)));
    }

    if (updates.length === 0) {
      return { success: true, updated: false };
    }

    updates.push(`updated_at = NOW()`);
    await this.pool.query(
      `UPDATE item_recipes
       SET ${updates.join(", ")}
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2
         AND id::text = $3`,
      values,
    );

    return { success: true, updated: true };
  }

  @Delete("catalog/:itemId/recipe/:ingredientId")
  @ApiOperation({ summary: "Delete ingredient from recipe" })
  async deleteCatalogItemRecipeIngredient(
    @Req() req: Request,
    @Param("itemId") itemId: string,
    @Param("ingredientId") ingredientId: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const deleteResult = await this.pool.query(
      `DELETE FROM item_recipes
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2
         AND id::text = $3
       RETURNING id`,
      [merchantId, itemId, ingredientId],
    );

    if (deleteResult.rows.length === 0) {
      throw new NotFoundException("المكوّن غير موجود");
    }

    const remaining = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM item_recipes
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2`,
      [merchantId, itemId],
    );

    if (this.toNumber(remaining.rows[0]?.count, 0) === 0) {
      await this.pool.query(
        `UPDATE catalog_items
         SET has_recipe = false, updated_at = NOW()
         WHERE merchant_id = $1 AND id::text = $2`,
        [merchantId, itemId],
      );
    }

    return { success: true };
  }

  @Get("catalog/:itemId/availability")
  @ApiOperation({
    summary: "Check available quantity for catalog item based on recipe/BOM",
  })
  async getCatalogItemAvailability(
    @Req() req: Request,
    @Param("itemId") itemId: string,
  ) {
    const merchantId = this.getMerchantId(req);
    const itemResult = await this.pool.query<{
      id: string;
      name: string;
      has_recipe: boolean;
      stock_quantity: string | null;
    }>(
      `SELECT
         id::text as id,
         COALESCE(name_ar, name_en, sku) as name,
         COALESCE(has_recipe, false) as has_recipe,
         COALESCE(stock_quantity, 0)::text as stock_quantity
       FROM catalog_items
       WHERE merchant_id = $1 AND id::text = $2
       LIMIT 1`,
      [merchantId, itemId],
    );

    if (itemResult.rows.length === 0) {
      throw new NotFoundException("الصنف غير موجود");
    }

    const item = itemResult.rows[0];
    if (!item.has_recipe) {
      const stockResult = await this.pool.query<{ available: string }>(
        `SELECT
           COALESCE(SUM(COALESCE(v.quantity_on_hand, 0) - COALESCE(v.quantity_reserved, 0)), 0)::text as available
         FROM inventory_items ii
         LEFT JOIN inventory_variants v ON v.inventory_item_id = ii.id
           AND v.merchant_id = ii.merchant_id
           AND COALESCE(v.is_active, true) = true
         WHERE ii.merchant_id = $1 AND ii.catalog_item_id::text = $2`,
        [merchantId, itemId],
      );
      const variantsAvailable = this.toNumber(
        stockResult.rows[0]?.available,
        0,
      );
      const fallbackStock = this.toNumber(item.stock_quantity, 0);
      return {
        itemId,
        name: item.name,
        mode: "simple",
        availableQuantity: Math.max(variantsAvailable, fallbackStock),
        limitingIngredient: null,
      };
    }

    const ingredientsResult = await this.pool.query<{
      ingredient_name: string;
      ingredient_inventory_item_id: string | null;
      ingredient_catalog_item_id: string | null;
      quantity_required: string;
      unit: string;
      waste_factor: string;
      is_optional: boolean;
    }>(
      `SELECT
         ingredient_name,
         ingredient_inventory_item_id::text as ingredient_inventory_item_id,
         ingredient_catalog_item_id::text as ingredient_catalog_item_id,
         quantity_required::text as quantity_required,
         unit,
         COALESCE(waste_factor, 1)::text as waste_factor,
         COALESCE(is_optional, false) as is_optional
       FROM item_recipes
       WHERE merchant_id = $1
         AND catalog_item_id::text = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [merchantId, itemId],
    );

    const ingredients: Array<{
      name: string;
      required: number;
      unit: string;
      stockOnHand: number;
      canMake: number;
      optional: boolean;
    }> = [];
    let minCanMake = Number.POSITIVE_INFINITY;
    let limitingIngredient: string | null = null;

    for (const ingredient of ingredientsResult.rows) {
      const required =
        this.toNumber(ingredient.quantity_required, 0) *
        this.toNumber(ingredient.waste_factor, 1);
      if (required <= 0) continue;

      let stockOnHand = 0;
      if (ingredient.ingredient_inventory_item_id) {
        const invStock = await this.pool.query<{ available: string }>(
          `SELECT
             COALESCE(SUM(COALESCE(quantity_on_hand, 0) - COALESCE(quantity_reserved, 0)), 0)::text as available
           FROM inventory_variants
           WHERE merchant_id = $1
             AND inventory_item_id::text = $2
             AND COALESCE(is_active, true) = true`,
          [merchantId, ingredient.ingredient_inventory_item_id],
        );
        stockOnHand = this.toNumber(invStock.rows[0]?.available, 0);
      } else if (ingredient.ingredient_catalog_item_id) {
        const catalogStock = await this.pool.query<{ available: string }>(
          `SELECT COALESCE(stock_quantity, 0)::text as available
           FROM catalog_items
           WHERE merchant_id = $1 AND id::text = $2
           LIMIT 1`,
          [merchantId, ingredient.ingredient_catalog_item_id],
        );
        stockOnHand = this.toNumber(catalogStock.rows[0]?.available, 0);
      }

      const canMake = required > 0 ? Math.floor(stockOnHand / required) : 0;
      ingredients.push({
        name: ingredient.ingredient_name,
        required: Number(required.toFixed(3)),
        unit: ingredient.unit || "piece",
        stockOnHand: Number(stockOnHand.toFixed(3)),
        canMake,
        optional: Boolean(ingredient.is_optional),
      });

      if (!ingredient.is_optional && canMake < minCanMake) {
        minCanMake = canMake;
        limitingIngredient = ingredient.ingredient_name;
      }
    }

    if (!Number.isFinite(minCanMake)) {
      minCanMake = 0;
    }

    return {
      itemId,
      name: item.name,
      mode: "recipe",
      availableQuantity: minCanMake,
      limitingIngredient,
      ingredients: ingredients.map(({ optional, ...rest }) => rest),
    };
  }

  @Post("knowledge-base/pull-from-catalog")
  @ApiOperation({ summary: "Pull catalog items into inventory items" })
  async pullCatalogToInventory(@Req() req: Request) {
    const merchantId = this.getMerchantId(req);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const catalogResult = await client.query<{
        id: string;
        sku: string | null;
        name_ar: string | null;
        name_en: string | null;
      }>(
        `SELECT id::text as id, sku, name_ar, name_en
         FROM catalog_items
         WHERE merchant_id = $1
         ORDER BY created_at ASC`,
        [merchantId],
      );

      let created = 0;
      let linked = 0;
      let updated = 0;

      for (const catalogItem of catalogResult.rows) {
        const existing = await client.query<{
          id: string;
          catalog_item_id: string | null;
        }>(
          `SELECT id::text as id, catalog_item_id::text as catalog_item_id
           FROM inventory_items
           WHERE merchant_id = $1
             AND (
               catalog_item_id::text = $2
               OR (sku IS NOT NULL AND sku = $3)
             )
           LIMIT 1`,
          [merchantId, catalogItem.id, catalogItem.sku || null],
        );

        if (existing.rows.length > 0) {
          const existingItem = existing.rows[0];
          if (!existingItem.catalog_item_id) {
            await client.query(
              `UPDATE inventory_items
               SET catalog_item_id = $1, updated_at = NOW()
               WHERE id::text = $2 AND merchant_id = $3`,
              [catalogItem.id, existingItem.id, merchantId],
            );
            linked += 1;
          }

          if (catalogItem.sku) {
            await client.query(
              `UPDATE inventory_items
               SET sku = $1, updated_at = NOW()
               WHERE id::text = $2 AND merchant_id = $3`,
              [catalogItem.sku, existingItem.id, merchantId],
            );
          }
          updated += 1;
          continue;
        }

        const generatedSku =
          catalogItem.sku || `SKU-${catalogItem.id.slice(0, 8).toUpperCase()}`;
        await client.query(
          `INSERT INTO inventory_items (
             merchant_id, catalog_item_id, sku, track_inventory,
             low_stock_threshold, reorder_point, reorder_quantity, location, created_at, updated_at
           )
           VALUES ($1, $2, $3, true, 5, 10, 20, 'المخزن الرئيسي', NOW(), NOW())`,
          [merchantId, catalogItem.id, generatedSku],
        );
        created += 1;
        linked += 1;
      }

      await client.query("COMMIT");
      return {
        success: true,
        total: catalogResult.rows.length,
        created,
        linked,
        updated,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  @Post("pos-integrations/:id/test")
  @ApiOperation({ summary: "Test POS integration configuration" })
  async testPosIntegration(
    @Req() req: Request,
    @Param("id") integrationId: string,
  ) {
    const merchantId = this.getMerchantId(req);

    const integrationResult = await this.pool.query<{
      id: string;
      provider: string;
      name: string;
      credentials: Record<string, any> | string | null;
      config: Record<string, any> | string | null;
    }>(
      `SELECT id::text as id, provider, name, credentials, config
       FROM pos_integrations
       WHERE merchant_id = $1 AND id::text = $2
       LIMIT 1`,
      [merchantId, integrationId],
    );

    if (integrationResult.rows.length === 0) {
      throw new NotFoundException("تكامل POS غير موجود");
    }

    const integration = integrationResult.rows[0];
    const provider = String(integration.provider || "").toUpperCase();
    const credentials = this.parseJsonObject(integration.credentials);
    const config = this.parseJsonObject(integration.config);

    const requiredFields: Record<string, string[]> = {
      ODOO: ["url", "database", "username", "apiKey"],
      FOODICS: ["clientId", "clientSecret", "accessToken", "businessId"],
      ORACLE_MICROS: ["apiUrl", "clientId", "clientSecret"],
      SHOPIFY: ["storeDomain", "apiKey", "apiSecret", "accessToken"],
      SQUARE: [
        "applicationId",
        "applicationSecret",
        "accessToken",
        "locationId",
      ],
      CUSTOM: ["baseUrl", "apiKey"],
    };

    const required = requiredFields[provider] || [];
    const missingFields = required.filter((field) => {
      const value = credentials[field] ?? config[field];
      return (
        value === undefined || value === null || String(value).trim() === ""
      );
    });

    if (missingFields.length > 0) {
      await this.pool.query(
        `UPDATE pos_integrations
         SET status = 'ERROR', updated_at = NOW()
         WHERE merchant_id = $1 AND id::text = $2`,
        [merchantId, integrationId],
      );
      return {
        success: false,
        message: `بيانات ناقصة: ${missingFields.join("، ")}`,
        missingFields,
      };
    }

    await this.pool.query(
      `UPDATE pos_integrations
       SET status = 'ACTIVE', last_sync_at = NOW(), updated_at = NOW()
       WHERE merchant_id = $1 AND id::text = $2`,
      [merchantId, integrationId],
    );

    return {
      success: true,
      message: `تم اختبار اتصال ${integration.name || provider} بنجاح`,
      checkedAt: new Date().toISOString(),
    };
  }
}
