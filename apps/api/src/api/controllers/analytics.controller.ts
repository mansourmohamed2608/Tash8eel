import {
  Controller,
  Get,
  Query,
  Param,
  Res,
  Headers,
  BadRequestException,
} from "@nestjs/common";
import { Response } from "express";
import {
  AnalyticsService,
  DateRange,
} from "../../application/services/analytics.service";
import { MerchantAuth } from "../../shared/guards/merchant-auth.guard";

@Controller("v1")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ==================== DASHBOARD ====================

  @Get("merchants/:merchantId/analytics/dashboard")
  @MerchantAuth()
  async getDashboard(
    @Param("merchantId") merchantId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("period") period?: string,
  ) {
    const range = this.parseRange(startDate, endDate, period);
    return this.analyticsService.getDashboardMetrics(merchantId, range);
  }

  // ==================== SALES ====================

  @Get("merchants/:merchantId/analytics/sales")
  @MerchantAuth()
  async getSalesBreakdown(
    @Param("merchantId") merchantId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("period") period?: string,
  ) {
    const range = this.parseRange(startDate, endDate, period);
    return this.analyticsService.getSalesBreakdown(merchantId, range);
  }

  // ==================== CUSTOMERS ====================

  @Get("merchants/:merchantId/analytics/customers")
  @MerchantAuth()
  async getCustomerInsights(
    @Param("merchantId") merchantId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("period") period?: string,
  ) {
    const range = this.parseRange(startDate, endDate, period);
    return this.analyticsService.getCustomerInsights(merchantId, range);
  }

  // ==================== CONVERSATIONS ====================

  @Get("merchants/:merchantId/analytics/conversations")
  @MerchantAuth()
  async getConversationAnalytics(
    @Param("merchantId") merchantId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("period") period?: string,
  ) {
    const range = this.parseRange(startDate, endDate, period);
    return this.analyticsService.getConversationAnalytics(merchantId, range);
  }

  // ==================== REAL-TIME ====================

  @Get("merchants/:merchantId/analytics/realtime")
  @MerchantAuth()
  async getRealTimeMetrics(@Param("merchantId") merchantId: string) {
    return this.analyticsService.getRealTimeMetrics(merchantId);
  }

  // ==================== EXPORT ====================

  @Get("merchants/:merchantId/analytics/export")
  @MerchantAuth()
  async exportReport(
    @Param("merchantId") merchantId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("format") format: "json" | "csv" = "json",
    @Res() res: Response,
  ) {
    const range = this.parseRange(startDate, endDate);
    const report = await this.analyticsService.exportReport(
      merchantId,
      range,
      format,
    );

    res.setHeader("Content-Type", report.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${report.filename}"`,
    );

    if (format === "csv") {
      res.send(report.data);
    } else {
      res.json(report.data);
    }
  }

  // ==================== PDF EXPORT ====================

  @Get("merchants/:merchantId/analytics/pdf")
  @MerchantAuth()
  async exportPDFReport(
    @Param("merchantId") merchantId: string,
    @Query("period") period: string = "30days",
    @Res() res: Response,
  ) {
    const range = this.parseRange(undefined, undefined, period);
    const dashboard = await this.analyticsService.getDashboardMetrics(
      merchantId,
      range,
    );

    // Generate HTML-based PDF content
    const periodLabel = this.getPeriodLabel(period);
    const html = this.generateReportHTML(dashboard, merchantId, periodLabel);

    // Set headers for HTML download (user can print to PDF)
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="report-${merchantId}-${new Date().toISOString().split("T")[0]}.html"`,
    );
    res.send(html);
  }

  private getPeriodLabel(period: string): string {
    const labels: Record<string, string> = {
      today: "اليوم",
      yesterday: "أمس",
      "7days": "آخر 7 أيام",
      "30days": "آخر 30 يوم",
      "90days": "آخر 90 يوم",
      thisMonth: "هذا الشهر",
      lastMonth: "الشهر الماضي",
      thisYear: "هذا العام",
    };
    return labels[period] || period;
  }

  private generateReportHTML(
    data: any,
    merchantId: string,
    period: string,
  ): string {
    const formatCurrency = (val: number) =>
      new Intl.NumberFormat("ar-EG", {
        style: "currency",
        currency: "EGP",
      }).format(val || 0);
    const formatNumber = (val: number) =>
      new Intl.NumberFormat("ar-EG").format(val || 0);
    const stats = data.stats || {};

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير الأداء - ${period}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #4a4e69; padding-bottom: 10px; }
    h2 { color: #4a4e69; margin-top: 30px; }
    .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
    .stat-card { background: #f8f9fa; border-radius: 8px; padding: 20px; }
    .stat-value { font-size: 28px; font-weight: bold; color: #1a1a2e; }
    .stat-label { color: #6c757d; margin-top: 5px; }
    .stat-change { font-size: 14px; margin-top: 5px; }
    .positive { color: #28a745; }
    .negative { color: #dc3545; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: right; border-bottom: 1px solid #dee2e6; }
    th { background: #f8f9fa; font-weight: 600; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>📊 تقرير الأداء</h1>
  <p>الفترة: ${period} | التاريخ: ${new Date().toLocaleDateString("ar-EG")}</p>
  
  <h2>ملخص الأداء</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value">${formatNumber(stats.totalOrders || 0)}</div>
      <div class="stat-label">إجمالي الطلبات</div>
      <div class="stat-change ${(stats.ordersChange || 0) >= 0 ? "positive" : "negative"}">
        ${(stats.ordersChange || 0) >= 0 ? "↑" : "↓"} ${Math.abs(stats.ordersChange || 0)}%
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${formatCurrency(stats.totalRevenue || 0)}</div>
      <div class="stat-label">إجمالي الإيرادات</div>
      <div class="stat-change ${(stats.revenueChange || 0) >= 0 ? "positive" : "negative"}">
        ${(stats.revenueChange || 0) >= 0 ? "↑" : "↓"} ${Math.abs(stats.revenueChange || 0)}%
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${formatNumber(stats.activeConversations || 0)}</div>
      <div class="stat-label">المحادثات النشطة</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${formatNumber(stats.pendingDeliveries || 0)}</div>
      <div class="stat-label">التوصيلات المعلقة</div>
    </div>
  </div>

  <h2>توزيع حالة الطلبات</h2>
  <table>
    <thead><tr><th>الحالة</th><th>العدد</th></tr></thead>
    <tbody>
      ${(data.statusDistribution || []).map((s: any) => `<tr><td>${s.name}</td><td>${formatNumber(s.value)}</td></tr>`).join("")}
    </tbody>
  </table>

  <div class="footer">
    <p>تم إنشاء هذا التقرير تلقائياً بواسطة تسهيل | ${new Date().toLocaleString("ar-EG")}</p>
    <p>يمكنك طباعة هذه الصفحة كـ PDF من خلال متصفحك (Ctrl+P)</p>
  </div>
</body>
</html>`;
  }

  // ==================== HELPER ====================

  private parseRange(
    startDate?: string,
    endDate?: string,
    period?: string,
  ): DateRange {
    // Handle predefined periods
    if (period) {
      const now = new Date();
      switch (period) {
        case "today":
          const today = new Date(now);
          today.setHours(0, 0, 0, 0);
          return { startDate: today, endDate: now };

        case "yesterday":
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(0, 0, 0, 0);
          const yesterdayEnd = new Date(yesterday);
          yesterdayEnd.setHours(23, 59, 59, 999);
          return { startDate: yesterday, endDate: yesterdayEnd };

        case "7days":
          const week = new Date(now);
          week.setDate(week.getDate() - 7);
          return { startDate: week, endDate: now };

        case "30days":
          const month = new Date(now);
          month.setDate(month.getDate() - 30);
          return { startDate: month, endDate: now };

        case "90days":
          const quarter = new Date(now);
          quarter.setDate(quarter.getDate() - 90);
          return { startDate: quarter, endDate: now };

        case "thisMonth":
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          return { startDate: monthStart, endDate: now };

        case "lastMonth":
          const lastMonthStart = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1,
          );
          const lastMonthEnd = new Date(
            now.getFullYear(),
            now.getMonth(),
            0,
            23,
            59,
            59,
            999,
          );
          return { startDate: lastMonthStart, endDate: lastMonthEnd };

        case "thisYear":
          const yearStart = new Date(now.getFullYear(), 0, 1);
          return { startDate: yearStart, endDate: now };

        default:
          throw new BadRequestException(`Invalid period: ${period}`);
      }
    }

    // Handle custom date range
    if (!startDate || !endDate) {
      // Default to last 30 days
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return { startDate: thirtyDaysAgo, endDate: now };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        "Invalid date format. Use ISO 8601 format.",
      );
    }

    if (start > end) {
      throw new BadRequestException("Start date must be before end date");
    }

    return { startDate: start, endDate: end };
  }
}
