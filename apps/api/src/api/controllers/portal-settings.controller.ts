import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
  UseGuards,
  Req,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiSecurity,
  ApiBody,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../domain/ports/merchant.repository";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { RolesGuard, RequireRole } from "../../shared/guards/roles.guard";
import { AuditService } from "../../application/services/audit.service";

/**
 * Portal Settings Controller
 *
 * Handles merchant settings and report-settings endpoints,
 * extracted from the monolithic MerchantPortalController.
 *
 * Routes:
 *   GET  v1/portal/settings
 *   PUT  v1/portal/settings
 *   GET  v1/portal/settings/reports
 *   POST v1/portal/settings/reports
 */
@ApiTags("Merchant Portal")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalSettingsController {
  private readonly logger = new Logger(PortalSettingsController.name);
  private posSchemaInitPromise: Promise<void> | null = null;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
    private readonly auditService: AuditService,
  ) {}

  private getMerchantId(req: Request): string {
    return (req as any).merchantId;
  }

  // ============== MERCHANT SETTINGS ==============

  @Get("settings")
  @ApiOperation({
    summary: "Get merchant settings",
    description:
      "Returns all merchant settings including business info, notifications, and preferences",
  })
  @ApiResponse({ status: 200, description: "Settings retrieved successfully" })
  async getMerchantSettings(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const merchant = await this.merchantRepo.findById(merchantId);

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    const pos = this.getMerchantPosSettings(merchant);

    return {
      business: {
        name: merchant.name,
        category: merchant.category,
        city: merchant.city,
        currency: merchant.currency,
        language: merchant.language,
      },
      notifications: {
        whatsappReportsEnabled:
          (merchant as any).whatsappReportsEnabled || false,
        reportPeriodsEnabled: (merchant as any).reportPeriodsEnabled || [
          "daily",
        ],
        notificationPhone: (merchant as any).notificationPhone || null,
        notificationEmail: (merchant as any).notificationEmail || null,
        whatsappNumber: (merchant as any).whatsappNumber || null,
        paymentRemindersEnabled:
          (merchant as any).paymentRemindersEnabled ?? true,
        lowStockAlertsEnabled: (merchant as any).lowStockAlertsEnabled ?? true,
      },
      preferences: {
        timezone: (merchant as any).timezone || "Africa/Cairo",
        workingHours: (merchant as any).workingHours || {
          start: "09:00",
          end: "21:00",
        },
        autoResponseEnabled: (merchant as any).autoResponseEnabled ?? true,
        followupDelayMinutes: (merchant as any).followupDelayMinutes || 60,
      },
      payout: {
        instapayAlias: (merchant as any).payoutInstapayAlias || null,
        vodafoneCashNumber: (merchant as any).payoutVodafoneCash || null,
        bankName: (merchant as any).payoutBankName || null,
        bankAccountHolder: (merchant as any).payoutBankAccountHolder || null,
        bankAccount: (merchant as any).payoutBankAccount || null,
        bankIban: (merchant as any).payoutBankIban || null,
        preferredMethod: (merchant as any).payoutPreferredMethod || "INSTAPAY",
      },
      pos,
    };
  }

  @Put("settings")
  @RequireRole("ADMIN")
  @ApiOperation({
    summary: "Update merchant settings",
    description:
      "Update merchant business info, notifications, and preferences",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        business: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: { type: "string" },
            city: { type: "string" },
          },
        },
        notifications: {
          type: "object",
          properties: {
            whatsappReportsEnabled: { type: "boolean" },
            reportPeriodsEnabled: { type: "array", items: { type: "string" } },
            notificationPhone: { type: "string" },
            notificationEmail: { type: "string" },
            paymentRemindersEnabled: { type: "boolean" },
            lowStockAlertsEnabled: { type: "boolean" },
          },
        },
        preferences: {
          type: "object",
          properties: {
            timezone: { type: "string" },
            autoResponseEnabled: { type: "boolean" },
            followupDelayMinutes: { type: "number" },
          },
        },
        payout: {
          type: "object",
          properties: {
            instapayAlias: { type: "string", nullable: true },
            vodafoneCashNumber: { type: "string", nullable: true },
            bankName: { type: "string", nullable: true },
            bankAccountHolder: { type: "string", nullable: true },
            bankAccount: { type: "string", nullable: true },
            bankIban: { type: "string", nullable: true },
            preferredMethod: {
              type: "string",
              enum: ["INSTAPAY", "VODAFONE_CASH", "BANK_TRANSFER"],
            },
          },
        },
        pos: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            mode: { type: "string", enum: ["retail", "restaurant", "hybrid"] },
            tablesEnabled: { type: "boolean" },
            suspendedSalesEnabled: { type: "boolean" },
            splitPaymentsEnabled: { type: "boolean" },
            returnsEnabled: { type: "boolean" },
            requireActiveRegisterSession: { type: "boolean" },
            defaultServiceMode: {
              type: "string",
              enum: ["delivery", "pickup", "dine_in"],
            },
            thermalReceiptWidth: {
              type: "string",
              enum: ["58mm", "80mm", "a4"],
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Settings updated successfully" })
  async updateMerchantSettings(
    @Req() req: Request,
    @Body()
    body: {
      business?: { name?: string; category?: string; city?: string };
      notifications?: {
        whatsappReportsEnabled?: boolean;
        reportPeriodsEnabled?: string[];
        notificationPhone?: string;
        notificationEmail?: string;
        whatsappNumber?: string;
        paymentRemindersEnabled?: boolean;
        lowStockAlertsEnabled?: boolean;
      };
      preferences?: {
        timezone?: string;
        autoResponseEnabled?: boolean;
        followupDelayMinutes?: number;
      };
      payout?: {
        instapayAlias?: string | null;
        vodafoneCashNumber?: string | null;
        bankName?: string | null;
        bankAccountHolder?: string | null;
        bankAccount?: string | null;
        bankIban?: string | null;
        preferredMethod?: "INSTAPAY" | "VODAFONE_CASH" | "BANK_TRANSFER";
      };
      pos?: {
        enabled?: boolean;
        mode?: "retail" | "restaurant" | "hybrid";
        tablesEnabled?: boolean;
        suspendedSalesEnabled?: boolean;
        splitPaymentsEnabled?: boolean;
        returnsEnabled?: boolean;
        requireActiveRegisterSession?: boolean;
        defaultServiceMode?: "delivery" | "pickup" | "dine_in";
        thermalReceiptWidth?: "58mm" | "80mm" | "a4";
      };
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const merchant = await this.merchantRepo.findById(merchantId);

    const updateEntries: Array<{ column: string; value: any }> = [];

    if (body.business?.name)
      updateEntries.push({ column: "name", value: body.business.name });
    if (body.business?.category)
      updateEntries.push({ column: "category", value: body.business.category });
    if (body.business?.city)
      updateEntries.push({ column: "city", value: body.business.city });
    if (body.notifications?.paymentRemindersEnabled !== undefined) {
      updateEntries.push({
        column: "payment_reminders_enabled",
        value: body.notifications.paymentRemindersEnabled,
      });
    }
    if (body.notifications?.lowStockAlertsEnabled !== undefined) {
      updateEntries.push({
        column: "low_stock_alerts_enabled",
        value: body.notifications.lowStockAlertsEnabled,
      });
    }
    if (body.notifications?.whatsappReportsEnabled !== undefined) {
      updateEntries.push({
        column: "whatsapp_reports_enabled",
        value: body.notifications.whatsappReportsEnabled,
      });
    }
    if (body.notifications?.reportPeriodsEnabled !== undefined) {
      updateEntries.push({
        column: "report_periods_enabled",
        value: body.notifications.reportPeriodsEnabled,
      });
    }
    if (body.notifications?.notificationPhone !== undefined) {
      updateEntries.push({
        column: "notification_phone",
        value: body.notifications.notificationPhone?.replace(/\s/g, "") || null,
      });
    }
    if (body.notifications?.notificationEmail !== undefined) {
      updateEntries.push({
        column: "notification_email",
        value: body.notifications.notificationEmail?.trim() || null,
      });
    }
    if (body.notifications?.whatsappNumber !== undefined) {
      updateEntries.push({
        column: "whatsapp_number",
        value: body.notifications.whatsappNumber?.replace(/\s/g, "") || null,
      });
    }
    if (body.preferences?.timezone)
      updateEntries.push({
        column: "timezone",
        value: body.preferences.timezone,
      });
    if (body.preferences?.autoResponseEnabled !== undefined) {
      updateEntries.push({
        column: "auto_response_enabled",
        value: body.preferences.autoResponseEnabled,
      });
    }
    if (body.preferences?.followupDelayMinutes !== undefined) {
      updateEntries.push({
        column: "followup_delay_minutes",
        value: body.preferences.followupDelayMinutes,
      });
    }

    // Payout settings (Egypt payment methods)
    if (body.payout?.instapayAlias !== undefined) {
      updateEntries.push({
        column: "payout_instapay_alias",
        value: body.payout.instapayAlias || null,
      });
    }
    if (body.payout?.vodafoneCashNumber !== undefined) {
      updateEntries.push({
        column: "payout_vodafone_cash",
        value: body.payout.vodafoneCashNumber || null,
      });
    }
    if (body.payout?.bankName !== undefined) {
      updateEntries.push({
        column: "payout_bank_name",
        value: body.payout.bankName || null,
      });
    }
    if (body.payout?.bankAccountHolder !== undefined) {
      updateEntries.push({
        column: "payout_bank_account_holder",
        value: body.payout.bankAccountHolder || null,
      });
    }
    if (body.payout?.bankAccount !== undefined) {
      updateEntries.push({
        column: "payout_bank_account",
        value: body.payout.bankAccount || null,
      });
    }
    if (body.payout?.bankIban !== undefined) {
      updateEntries.push({
        column: "payout_bank_iban",
        value: body.payout.bankIban || null,
      });
    }
    if (body.payout?.preferredMethod !== undefined) {
      updateEntries.push({
        column: "payout_preferred_method",
        value: body.payout.preferredMethod,
      });
    }

    if (body.pos) {
      await this.updateMerchantPosSettings(merchantId, merchant, body.pos);
    }

    const runUpdate = async (
      entries: Array<{ column: string; value: any }>,
    ) => {
      if (entries.length === 0) return;
      const sets = entries.map((entry, idx) => `${entry.column} = $${idx + 1}`);
      const values = entries.map((entry) => entry.value);
      sets.push("updated_at = NOW()");
      values.push(merchantId);
      await this.pool.query(
        `UPDATE merchants SET ${sets.join(", ")} WHERE id = $${entries.length + 1}`,
        values,
      );
    };

    if (updateEntries.length > 0) {
      let remaining = [...updateEntries];
      while (remaining.length > 0) {
        try {
          await runUpdate(remaining);
          break;
        } catch (error: any) {
          if (error?.code !== "42703") {
            throw error;
          }
          const match = /column \"([^\"]+)\"/i.exec(error.message || "");
          const missingColumn = match?.[1];
          if (!missingColumn) throw error;
          remaining = remaining.filter(
            (entry) => entry.column !== missingColumn,
          );
          if (remaining.length === 0) break;
        }
      }
    }

    const sections: string[] = [];
    if (body.business) sections.push("business");
    if (body.notifications) sections.push("notifications");
    if (body.preferences) sections.push("preferences");
    if (body.payout) sections.push("payout");
    if (body.pos) sections.push("pos");
    if (sections.length > 0) {
      await this.auditService.logFromRequest(
        req,
        "UPDATE",
        "SETTINGS",
        merchantId,
        {
          metadata: { sections },
        },
      );
    }

    return {
      success: true,
      message: "تم تحديث الإعدادات بنجاح",
    };
  }

  // ============== WHATSAPP REPORT SETTINGS ==============

  @Get("settings/reports")
  @RequiresFeature("REPORTS")
  @ApiOperation({
    summary: "Get WhatsApp report settings",
    description:
      "Returns the current WhatsApp report delivery settings for the merchant",
  })
  @ApiResponse({ status: 200, description: "Settings retrieved successfully" })
  async getReportSettings(@Req() req: Request): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const merchant = await this.merchantRepo.findById(merchantId);

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    return {
      whatsappReportsEnabled: (merchant as any).whatsappReportsEnabled || false,
      reportPeriodsEnabled: (merchant as any).reportPeriodsEnabled || ["daily"],
      notificationPhone: (merchant as any).notificationPhone || null,
      availablePeriods: [
        {
          id: "daily",
          name: "يومي",
          description: "تقرير كل يوم الساعة 8 صباحاً",
        },
        {
          id: "weekly",
          name: "أسبوعي",
          description: "تقرير كل أحد الساعة 9 صباحاً",
        },
        {
          id: "monthly",
          name: "شهري",
          description: "تقرير أول كل شهر الساعة 9 صباحاً",
        },
      ],
    };
  }

  @Post("settings/reports")
  @RequiresFeature("REPORTS")
  @RequireRole("ADMIN")
  @ApiOperation({
    summary: "Update WhatsApp report settings",
    description: "Configure WhatsApp report delivery preferences",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        whatsappReportsEnabled: {
          type: "boolean",
          description: "Enable/disable WhatsApp reports",
        },
        reportPeriodsEnabled: {
          type: "array",
          items: { type: "string", enum: ["daily", "weekly", "monthly"] },
          description: "Which report periods to receive",
        },
        notificationPhone: {
          type: "string",
          description: "Phone number for reports (with country code)",
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Settings updated successfully" })
  @ApiResponse({ status: 400, description: "Invalid settings" })
  async updateReportSettings(
    @Req() req: Request,
    @Body()
    body: {
      whatsappReportsEnabled?: boolean;
      reportPeriodsEnabled?: string[];
      notificationPhone?: string;
    },
  ): Promise<any> {
    const merchantId = this.getMerchantId(req);
    const merchant = await this.merchantRepo.findById(merchantId);

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    // Validate phone number if enabling reports
    if (body.whatsappReportsEnabled && body.notificationPhone) {
      const phoneRegex = /^\+?[1-9]\d{9,14}$/;
      if (!phoneRegex.test(body.notificationPhone.replace(/\s/g, ""))) {
        throw new BadRequestException(
          "رقم الهاتف غير صحيح. يجب أن يحتوي على كود الدولة",
        );
      }
    }

    // Validate report periods
    const validPeriods = ["daily", "weekly", "monthly"];
    if (body.reportPeriodsEnabled) {
      const invalidPeriods = body.reportPeriodsEnabled.filter(
        (p) => !validPeriods.includes(p),
      );
      if (invalidPeriods.length > 0) {
        throw new BadRequestException(
          `فترات غير صحيحة: ${invalidPeriods.join(", ")}`,
        );
      }
    }

    // Update database directly (these fields are on merchants table)
    const updates: string[] = [];
    const values: (string | boolean | string[])[] = [];
    let paramIndex = 1;

    if (body.whatsappReportsEnabled !== undefined) {
      updates.push(`whatsapp_reports_enabled = $${paramIndex++}`);
      values.push(body.whatsappReportsEnabled);
    }
    if (body.reportPeriodsEnabled !== undefined) {
      updates.push(`report_periods_enabled = $${paramIndex++}`);
      values.push(body.reportPeriodsEnabled);
    }
    if (body.notificationPhone !== undefined) {
      updates.push(`notification_phone = $${paramIndex++}`);
      values.push(body.notificationPhone?.replace(/\s/g, "") || "");
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(merchantId);

      await this.pool.query(
        `UPDATE merchants SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
        values,
      );
    }

    this.logger.log({
      msg: "WhatsApp report settings updated",
      merchantId,
      settings: body,
    });

    await this.auditService.logFromRequest(
      req,
      "UPDATE",
      "SETTINGS",
      merchantId,
      {
        metadata: { sections: ["reports", "notifications"] },
      },
    );

    return {
      success: true,
      message: body.whatsappReportsEnabled
        ? "تم تفعيل التقارير عبر واتساب"
        : "تم تحديث إعدادات التقارير",
      settings: {
        whatsappReportsEnabled:
          body.whatsappReportsEnabled ??
          (merchant as any).whatsappReportsEnabled,
        reportPeriodsEnabled:
          body.reportPeriodsEnabled ?? (merchant as any).reportPeriodsEnabled,
        notificationPhone:
          body.notificationPhone ?? (merchant as any).notificationPhone,
      },
    };
  }

  // ============== POS SETTINGS HELPERS ==============
  // Copied verbatim from MerchantPortalController — kept there too
  // since other POS endpoints in that controller still depend on them.

  private parseConfigObject(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {};
      } catch {
        return {};
      }
    }
    return typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private buildDefaultPosSettings(category?: unknown) {
    const normalizedCategory = String(category || "GENERIC")
      .trim()
      .toUpperCase();
    const isFood = normalizedCategory === "FOOD";

    return {
      enabled: true,
      mode: isFood ? "restaurant" : "retail",
      tablesEnabled: isFood,
      suspendedSalesEnabled: true,
      splitPaymentsEnabled: true,
      returnsEnabled: true,
      requireActiveRegisterSession: false,
      defaultServiceMode: isFood ? "dine_in" : "pickup",
      thermalReceiptWidth: "80mm",
    } as const;
  }

  private normalizePosMode(value: unknown): "retail" | "restaurant" | "hybrid" {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (normalized === "restaurant" || normalized === "hybrid") {
      return normalized;
    }
    return "retail";
  }

  private normalizeManualDeliveryType(
    value: unknown,
  ): "delivery" | "pickup" | "dine_in" {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();

    if (["delivery", "pickup", "dine_in"].includes(normalized)) {
      return normalized as "delivery" | "pickup" | "dine_in";
    }

    throw new BadRequestException(
      "deliveryType must be one of: delivery, pickup, dine_in",
    );
  }

  private normalizeThermalReceiptWidth(value: unknown): "58mm" | "80mm" | "a4" {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (normalized === "58mm" || normalized === "a4") {
      return normalized;
    }
    return "80mm";
  }

  private getMerchantPosSettings(merchant: any) {
    const defaults = this.buildDefaultPosSettings(merchant?.category);
    const config = this.parseConfigObject((merchant as any)?.config);
    const pos = this.parseConfigObject(config.pos);

    return {
      enabled:
        typeof pos.enabled === "boolean" ? pos.enabled : defaults.enabled,
      mode: this.normalizePosMode(pos.mode || defaults.mode),
      tablesEnabled:
        typeof pos.tablesEnabled === "boolean"
          ? pos.tablesEnabled
          : defaults.tablesEnabled,
      suspendedSalesEnabled:
        typeof pos.suspendedSalesEnabled === "boolean"
          ? pos.suspendedSalesEnabled
          : defaults.suspendedSalesEnabled,
      splitPaymentsEnabled:
        typeof pos.splitPaymentsEnabled === "boolean"
          ? pos.splitPaymentsEnabled
          : defaults.splitPaymentsEnabled,
      returnsEnabled:
        typeof pos.returnsEnabled === "boolean"
          ? pos.returnsEnabled
          : defaults.returnsEnabled,
      requireActiveRegisterSession:
        typeof pos.requireActiveRegisterSession === "boolean"
          ? pos.requireActiveRegisterSession
          : defaults.requireActiveRegisterSession,
      defaultServiceMode: this.normalizeManualDeliveryType(
        pos.defaultServiceMode || defaults.defaultServiceMode,
      ),
      thermalReceiptWidth: this.normalizeThermalReceiptWidth(
        pos.thermalReceiptWidth || defaults.thermalReceiptWidth,
      ),
    };
  }

  private async updateMerchantPosSettings(
    merchantId: string,
    merchant: any,
    patch: Record<string, unknown>,
  ): Promise<void> {
    await this.ensurePosSchema();

    const currentConfig = this.parseConfigObject((merchant as any)?.config);
    const currentPos = this.getMerchantPosSettings(merchant);
    const mergedPos = {
      ...currentPos,
      ...patch,
    };
    mergedPos.mode = this.normalizePosMode(mergedPos.mode);
    mergedPos.defaultServiceMode = this.normalizeManualDeliveryType(
      mergedPos.defaultServiceMode,
    );
    mergedPos.thermalReceiptWidth = this.normalizeThermalReceiptWidth(
      mergedPos.thermalReceiptWidth,
    );

    const nextConfig = {
      ...currentConfig,
      pos: mergedPos,
    };

    await this.pool.query(
      `UPDATE merchants
       SET config = $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(nextConfig), merchantId],
    );
  }

  private async ensurePosSchema(): Promise<void> {
    if (!this.posSchemaInitPromise) {
      this.posSchemaInitPromise = this.ensurePosSchemaInternal().catch(
        (error) => {
          this.posSchemaInitPromise = null;
          throw error;
        },
      );
    }
    await this.posSchemaInitPromise;
  }

  private async ensurePosSchemaInternal(): Promise<void> {
    await this.pool.query(`
      ALTER TABLE merchants
      ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS branch_id UUID,
      ADD COLUMN IF NOT EXISTS shift_id UUID,
      ADD COLUMN IF NOT EXISTS register_session_id UUID,
      ADD COLUMN IF NOT EXISTS table_id UUID,
      ADD COLUMN IF NOT EXISTS tax_total DECIMAL(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS source_channel VARCHAR(50),
      ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(255),
      ADD COLUMN IF NOT EXISTS delivery_address JSONB,
      ADD COLUMN IF NOT EXISTS delivery_notes TEXT,
      ADD COLUMN IF NOT EXISTS delivery_preference VARCHAR(50);

      CREATE TABLE IF NOT EXISTS pos_register_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL,
        shift_id UUID,
        opened_by VARCHAR(255),
        opening_float DECIMAL(12,2) NOT NULL DEFAULT 0,
        expected_cash DECIMAL(12,2) NOT NULL DEFAULT 0,
        counted_cash DECIMAL(12,2),
        variance DECIMAL(12,2),
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        notes TEXT,
        opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
        closed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pos_drafts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        branch_id UUID,
        shift_id UUID,
        register_session_id UUID,
        customer_id VARCHAR(255),
        customer_name VARCHAR(255),
        customer_phone VARCHAR(255),
        service_mode VARCHAR(20) NOT NULL DEFAULT 'pickup',
        table_id UUID,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        discount DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        payment_method VARCHAR(50),
        payments JSONB NOT NULL DEFAULT '[]'::jsonb,
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        tax_total DECIMAL(12,2) NOT NULL DEFAULT 0,
        delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
        total DECIMAL(12,2) NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by VARCHAR(255),
        checked_out_order_id VARCHAR(255),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        method VARCHAR(50) NOT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        reference TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'PAID',
        collected_by VARCHAR(255),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS pos_tables (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        branch_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        area VARCHAR(255),
        capacity INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'FREE',
        sort_order INTEGER NOT NULL DEFAULT 0,
        current_draft_id UUID,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        order_id VARCHAR(255),
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        reason TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'APPROVED',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_pos_register_sessions_merchant_branch_status
        ON pos_register_sessions(merchant_id, branch_id, status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_register_sessions_open_branch
        ON pos_register_sessions(merchant_id, branch_id)
        WHERE status = 'OPEN';
      CREATE INDEX IF NOT EXISTS idx_pos_drafts_merchant_status
        ON pos_drafts(merchant_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pos_drafts_branch
        ON pos_drafts(merchant_id, branch_id, status);
      CREATE INDEX IF NOT EXISTS idx_order_payments_order
        ON order_payments(order_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pos_tables_branch
        ON pos_tables(merchant_id, branch_id, status, sort_order, name);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tables_name
        ON pos_tables(merchant_id, branch_id, name);
      CREATE INDEX IF NOT EXISTS idx_refunds_merchant_order
        ON refunds(merchant_id, order_id, created_at DESC);
    `);
  }
}
