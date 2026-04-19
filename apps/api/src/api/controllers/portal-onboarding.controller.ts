import {
  Controller,
  Get,
  Inject,
  Logger,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { EntitlementGuard } from "../../shared/guards/entitlement.guard";
import { RolesGuard } from "../../shared/guards/roles.guard";
import {
  getMerchantId,
  toBoolean,
  getMerchantPortalSummary,
} from "./portal-compat.helpers";

@ApiTags("Merchant Portal Compatibility")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalOnboardingController {
  private readonly logger = new Logger(PortalOnboardingController.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get("onboarding/status")
  @ApiOperation({ summary: "Get onboarding checklist status for merchant" })
  async getOnboardingStatus(@Req() req: Request) {
    const merchantId = getMerchantId(req);
    const summary = await getMerchantPortalSummary(merchantId, this.pool);

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
        description: "فعّل مسار التحقق من إثباتات الدفع",
        completed: summary.paidOrders > 0,
        optional: false,
        href: "/merchant/payments",
        metric: `${summary.paidOrders} طلب مدفوع`,
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
    const merchantId = getMerchantId(req);
    const summary = await getMerchantPortalSummary(merchantId, this.pool);

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
}
