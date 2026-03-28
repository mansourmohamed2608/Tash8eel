import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Inject,
  BadRequestException,
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
  MerchantConfigDto,
  MerchantResponseDto,
  MerchantOnboardingDto,
  MerchantUsageResponseDto,
} from "../dto/merchant.dto";
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../domain/ports/merchant.repository";
import { Merchant } from "../../domain/entities/merchant.entity";
import { MerchantCategory } from "../../shared/constants/enums";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";
import { DailyReportScheduler } from "../../application/jobs/daily-report.scheduler";
import { StaffService } from "../../application/services/staff.service";
import { v4 as uuidv4 } from "uuid";
import { randomBytes } from "crypto";

@ApiTags("Merchants")
@ApiSecurity("admin-api-key")
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
@UseGuards(AdminApiKeyGuard)
@Controller("v1/merchants")
export class MerchantsController {
  private readonly logger = new Logger(MerchantsController.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
    private readonly dailyReportScheduler: DailyReportScheduler,
    private readonly staffService: StaffService,
  ) {}

  @Get(":id")
  @ApiOperation({ summary: "Get merchant by ID" })
  @ApiParam({ name: "id", description: "Merchant ID" })
  @ApiResponse({
    status: 200,
    description: "Merchant found",
    type: MerchantResponseDto,
  })
  @ApiResponse({ status: 404, description: "Merchant not found" })
  async getMerchant(@Param("id") id: string): Promise<MerchantResponseDto> {
    const merchant = await this.merchantRepo.findById(id);

    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    return this.toResponseDto(merchant);
  }

  @Post(":id/config")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Update merchant configuration",
    description:
      "Update merchant settings including negotiation rules, delivery fee, token budget, etc.",
  })
  @ApiParam({ name: "id", description: "Merchant ID" })
  @ApiResponse({
    status: 200,
    description: "Configuration updated",
    type: MerchantResponseDto,
  })
  @ApiResponse({ status: 404, description: "Merchant not found" })
  async updateConfig(
    @Param("id") id: string,
    @Body() dto: MerchantConfigDto,
  ): Promise<MerchantResponseDto> {
    let merchant = await this.merchantRepo.findById(id);

    if (!merchant) {
      // Create new merchant if not exists
      this.logger.log({
        msg: "Creating new merchant",
        merchantId: id,
      });

      merchant = {
        id,
        name: dto.name || `Merchant ${id}`,
        category: dto.category || MerchantCategory.GENERIC,
        apiKey: this.generateApiKey(),
        isActive: true,
        city: dto.city || "cairo",
        currency: dto.currency || "EGP",
        language: dto.language || "ar-EG",
        dailyTokenBudget: dto.dailyTokenBudget || 100000,
        defaultDeliveryFee: dto.defaultDeliveryFee || 30,
        autoBookDelivery: dto.autoBookDelivery ?? false,
        enableFollowups: dto.enableFollowups ?? true,
        greetingTemplate: dto.greetingTemplate,
        negotiationRules: dto.negotiationRules || {
          maxDiscountPercent: 10,
          allowNegotiation: true,
        },
        workingHours: dto.workingHours,
        config: {},
        branding: {},
        deliveryRules: { defaultFee: dto.defaultDeliveryFee || 30 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.merchantRepo.create(merchant as any);
    } else {
      // Update existing merchant
      const updates: Partial<Merchant> = {
        ...merchant,
        updatedAt: new Date(),
      };

      if (dto.name !== undefined) updates.name = dto.name;
      if (dto.category !== undefined) updates.category = dto.category;
      if (dto.city !== undefined) updates.city = dto.city;
      if (dto.currency !== undefined) updates.currency = dto.currency;
      if (dto.language !== undefined) updates.language = dto.language;
      if (dto.dailyTokenBudget !== undefined)
        updates.dailyTokenBudget = dto.dailyTokenBudget;
      if (dto.defaultDeliveryFee !== undefined)
        updates.defaultDeliveryFee = dto.defaultDeliveryFee;
      if (dto.autoBookDelivery !== undefined)
        updates.autoBookDelivery = dto.autoBookDelivery;
      if (dto.enableFollowups !== undefined)
        updates.enableFollowups = dto.enableFollowups;
      if (dto.greetingTemplate !== undefined)
        updates.greetingTemplate = dto.greetingTemplate;
      if (dto.negotiationRules !== undefined)
        updates.negotiationRules = dto.negotiationRules;
      if (dto.workingHours !== undefined)
        updates.workingHours = dto.workingHours;

      await this.merchantRepo.update(id, updates as any);
      merchant = await this.merchantRepo.findById(id);
    }

    this.logger.log({
      msg: "Merchant config updated",
      merchantId: id,
    });

    return this.toResponseDto(merchant!);
  }

  @Put(":id/toggle-active")
  @ApiOperation({ summary: "Toggle merchant active status" })
  @ApiParam({ name: "id", description: "Merchant ID" })
  @ApiResponse({ status: 200, type: MerchantResponseDto })
  async toggleActive(@Param("id") id: string): Promise<MerchantResponseDto> {
    const merchant = await this.merchantRepo.findById(id);

    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    await this.merchantRepo.update(id, {
      isActive: !merchant.isActive,
    });

    if (merchant.isActive) {
      await this.staffService.revokeAllMerchantSessions(id);
    }

    const updated = await this.merchantRepo.findById(id);
    return this.toResponseDto(updated!);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Onboard new merchant",
    description:
      "Create a new merchant with auto-generated API key. Returns the API key only once.",
  })
  @ApiResponse({ status: 201, description: "Merchant created with API key" })
  @ApiResponse({ status: 400, description: "Invalid request body" })
  async onboardMerchant(
    @Body() dto: MerchantOnboardingDto,
  ): Promise<{ merchant: MerchantResponseDto; apiKey: string }> {
    // Generate unique ID and API key
    const merchantId = dto.id || uuidv4().substring(0, 8);
    const apiKey = this.generateApiKey();

    // Validate category
    if (
      dto.category &&
      !Object.values(MerchantCategory).includes(dto.category)
    ) {
      throw new BadRequestException(`Invalid category: ${dto.category}`);
    }

    const merchant: any = {
      id: merchantId,
      name: dto.tradeName || dto.name,
      tradeName: dto.tradeName,
      category: dto.category || MerchantCategory.GENERIC,
      apiKey,
      isActive: true,
      city: dto.city || "cairo",
      currency: dto.currency || "EGP",
      language: dto.language || "ar-EG",
      dailyTokenBudget: dto.dailyTokenBudget || 100000,
      defaultDeliveryFee: dto.defaultDeliveryFee || 30,
      autoBookDelivery: dto.autoBookDelivery ?? false,
      enableFollowups: dto.enableFollowups ?? true,
      greetingTemplate: dto.greetingTemplate,
      negotiationRules: dto.negotiationRules || {
        maxDiscountPercent: 10,
        allowNegotiation: true,
      },
      workingHours: dto.workingHours,
      config: {},
      branding: {},
      deliveryRules: { defaultFee: dto.defaultDeliveryFee || 30 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.merchantRepo.create(merchant);

    this.logger.log({
      msg: "New merchant onboarded",
      merchantId,
      category: merchant.category,
    });

    return {
      merchant: this.toResponseDto(merchant),
      apiKey, // Only returned once during onboarding
    };
  }

  @Get(":id/usage")
  @ApiOperation({
    summary: "Get merchant token usage",
    description: "Get token usage statistics for a merchant",
  })
  @ApiParam({ name: "id", description: "Merchant ID" })
  @ApiQuery({
    name: "date",
    required: false,
    description: "Usage date (YYYY-MM-DD), defaults to today",
  })
  @ApiResponse({
    status: 200,
    description: "Usage data",
    type: MerchantUsageResponseDto,
  })
  async getUsage(
    @Param("id") id: string,
    @Query("date") date?: string,
  ): Promise<MerchantUsageResponseDto> {
    const merchant = await this.merchantRepo.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    const usageDate = date || new Date().toISOString().split("T")[0];
    const usage = await this.merchantRepo.getUsage(id, usageDate);

    return {
      merchantId: id,
      date: usageDate,
      tokensUsed: usage?.tokensUsed || 0,
      llmCalls: usage?.llmCalls || 0,
      budget: merchant.dailyTokenBudget || 100000,
      remaining:
        (merchant.dailyTokenBudget || 100000) - (usage?.tokensUsed || 0),
    };
  }

  @Get(":id/reports/daily")
  @ApiOperation({
    summary: "Get daily reports for merchant",
    description: "Get daily operational reports",
  })
  @ApiParam({ name: "id", description: "Merchant ID" })
  @ApiQuery({ name: "startDate", required: false })
  @ApiQuery({ name: "endDate", required: false })
  @ApiQuery({ name: "limit", required: false })
  async getDailyReports(
    @Param("id") id: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("limit") limit?: number,
  ): Promise<any[]> {
    const merchant = await this.merchantRepo.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    return this.merchantRepo.getDailyReports(id, {
      startDate,
      endDate,
      limit: limit || 30,
    });
  }

  @Post(":id/reports/send-whatsapp")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Send daily report to merchant via WhatsApp",
    description:
      "Triggers a daily report generation and sends it to the merchant's WhatsApp. The report includes conversations, orders, revenue, and token usage for yesterday.",
  })
  @ApiParam({ name: "id", description: "Merchant ID" })
  @ApiResponse({ status: 200, description: "Report sent successfully" })
  @ApiResponse({ status: 404, description: "Merchant not found" })
  async sendWhatsAppReport(@Param("id") id: string): Promise<{
    success: boolean;
    report: {
      date: string;
      totalConversations: number;
      ordersCreated: number;
      totalRevenue: number;
      conversionRate: number;
      tokenUsage: number;
    };
    message: string;
  }> {
    const merchant = await this.merchantRepo.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    if (!merchant.isActive) {
      throw new BadRequestException(`Merchant ${id} is not active`);
    }

    this.logger.log({
      msg: "Manual daily report requested",
      merchantId: id,
      merchantName: merchant.name,
    });

    // Generate and send the report (publishes to outbox for WhatsApp delivery)
    const stats = await this.dailyReportScheduler.generateReportForMerchant(id);

    return {
      success: true,
      report: {
        date: stats.date,
        totalConversations: stats.totalConversations,
        ordersCreated: stats.ordersCreated,
        totalRevenue: stats.totalRevenue,
        conversionRate: stats.conversionRate,
        tokenUsage: stats.tokenUsage,
      },
      message: "تم إرسال التقرير اليومي بنجاح / Daily report sent successfully",
    };
  }

  @Get(":id/notifications")
  @ApiOperation({ summary: "Get merchant notifications" })
  @ApiParam({ name: "id", description: "Merchant ID" })
  @ApiQuery({ name: "unreadOnly", required: false })
  async getNotifications(
    @Param("id") id: string,
    @Query("unreadOnly") unreadOnly?: string,
  ): Promise<any[]> {
    const merchant = await this.merchantRepo.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    return this.merchantRepo.getNotifications(id, unreadOnly === "true");
  }

  @Put(":id/notifications/:notificationId/read")
  @ApiOperation({ summary: "Mark notification as read" })
  async markNotificationRead(
    @Param("id") id: string,
    @Param("notificationId") notificationId: string,
  ): Promise<{ success: boolean }> {
    await this.merchantRepo.markNotificationRead(id, notificationId);
    return { success: true };
  }

  @Post(":id/regenerate-api-key")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Regenerate API key",
    description:
      "Generate a new API key for the merchant. Old key will be invalidated.",
  })
  async regenerateApiKey(@Param("id") id: string): Promise<{ apiKey: string }> {
    const merchant = await this.merchantRepo.findById(id);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    const newApiKey = this.generateApiKey();
    await this.merchantRepo.update(id, { apiKey: newApiKey });

    this.logger.log({
      msg: "API key regenerated",
      merchantId: id,
    });

    return { apiKey: newApiKey };
  }

  private toResponseDto(merchant: Merchant): MerchantResponseDto {
    return {
      id: merchant.id,
      name: merchant.name,
      tradeName: (merchant as any).tradeName,
      category: merchant.category,
      city: merchant.city || "cairo",
      currency: merchant.currency || "EGP",
      language: merchant.language || "ar-EG",
      dailyTokenBudget: merchant.dailyTokenBudget || 100000,
      defaultDeliveryFee: merchant.defaultDeliveryFee || 30,
      autoBookDelivery: merchant.autoBookDelivery || false,
      enableFollowups: merchant.enableFollowups ?? true,
      isActive: merchant.isActive,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    };
  }

  private generateApiKey(): string {
    return `mapi_${randomBytes(32).toString("hex")}`;
  }
}
