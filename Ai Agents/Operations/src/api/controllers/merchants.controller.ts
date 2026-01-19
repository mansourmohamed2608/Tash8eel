import { 
  Controller, Get, Post, Put, Param, Body, 
  HttpCode, HttpStatus, Logger, NotFoundException, Inject 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { MerchantConfigDto, MerchantResponseDto } from '../dto/merchant.dto';
import { IMerchantRepository, MERCHANT_REPOSITORY } from '../../domain/ports/merchant.repository';
import { Merchant } from '../../domain/entities/merchant.entity';
import { MerchantCategory } from '../../shared/constants/enums';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('Merchants')
@Controller('v1/merchants')
export class MerchantsController {
  private readonly logger = new Logger(MerchantsController.name);

  constructor(
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get merchant by ID' })
  @ApiParam({ name: 'id', description: 'Merchant ID' })
  @ApiResponse({ status: 200, description: 'Merchant found', type: MerchantResponseDto })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getMerchant(@Param('id') id: string): Promise<MerchantResponseDto> {
    const merchant = await this.merchantRepo.findById(id);
    
    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    return this.toResponseDto(merchant);
  }

  @Post(':id/config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Update merchant configuration',
    description: 'Update merchant settings including negotiation rules, delivery fee, token budget, etc.'
  })
  @ApiParam({ name: 'id', description: 'Merchant ID' })
  @ApiResponse({ status: 200, description: 'Configuration updated', type: MerchantResponseDto })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: MerchantConfigDto,
  ): Promise<MerchantResponseDto> {
    let merchant = await this.merchantRepo.findById(id);
    
    if (!merchant) {
      // Create new merchant if not exists
      this.logger.log({
        msg: 'Creating new merchant',
        merchantId: id,
      });

      merchant = {
        id,
        name: dto.name || `Merchant ${id}`,
        category: dto.category || MerchantCategory.GENERIC,
        apiKey: this.generateApiKey(),
        isActive: true,
        city: dto.city || 'cairo',
        currency: dto.currency || 'EGP',
        language: dto.language || 'ar-EG',
        dailyTokenBudget: dto.dailyTokenBudget || 100000,
        defaultDeliveryFee: dto.defaultDeliveryFee || 30,
        autoBookDelivery: dto.autoBookDelivery ?? false,
        enableFollowups: dto.enableFollowups ?? true,
        greetingTemplate: dto.greetingTemplate,
        negotiationRules: dto.negotiationRules || { maxDiscountPercent: 10, allowNegotiation: true },
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
      if (dto.dailyTokenBudget !== undefined) updates.dailyTokenBudget = dto.dailyTokenBudget;
      if (dto.defaultDeliveryFee !== undefined) updates.defaultDeliveryFee = dto.defaultDeliveryFee;
      if (dto.autoBookDelivery !== undefined) updates.autoBookDelivery = dto.autoBookDelivery;
      if (dto.enableFollowups !== undefined) updates.enableFollowups = dto.enableFollowups;
      if (dto.greetingTemplate !== undefined) updates.greetingTemplate = dto.greetingTemplate;
      if (dto.negotiationRules !== undefined) updates.negotiationRules = dto.negotiationRules;
      if (dto.workingHours !== undefined) updates.workingHours = dto.workingHours;

      await this.merchantRepo.update(id, updates as any);
      merchant = await this.merchantRepo.findById(id);
    }

    this.logger.log({
      msg: 'Merchant config updated',
      merchantId: id,
    });

    return this.toResponseDto(merchant!);
  }

  @Put(':id/toggle-active')
  @ApiOperation({ summary: 'Toggle merchant active status' })
  @ApiParam({ name: 'id', description: 'Merchant ID' })
  @ApiResponse({ status: 200, type: MerchantResponseDto })
  async toggleActive(@Param('id') id: string): Promise<MerchantResponseDto> {
    const merchant = await this.merchantRepo.findById(id);
    
    if (!merchant) {
      throw new NotFoundException(`Merchant ${id} not found`);
    }

    await this.merchantRepo.update(id, {
      isActive: !merchant.isActive,
    });

    const updated = await this.merchantRepo.findById(id);
    return this.toResponseDto(updated!);
  }

  private toResponseDto(merchant: Merchant): MerchantResponseDto {
    return {
      id: merchant.id,
      name: merchant.name,
      category: merchant.category,
      city: merchant.city || 'cairo',
      currency: merchant.currency || 'EGP',
      language: merchant.language || 'ar-EG',
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
    return `mk_${uuidv4().replace(/-/g, '')}`;
  }
}
