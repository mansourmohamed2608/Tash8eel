import { 
  IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, 
  IsBoolean, ValidateNested, IsArray, Min, Max 
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MerchantCategory } from '../../shared/constants/enums';

class NegotiationRulesDto {
  @ApiProperty({ description: 'Maximum discount percentage allowed', example: 10 })
  @IsNumber()
  @Min(0)
  @Max(50)
  maxDiscountPercent: number;

  @ApiPropertyOptional({ description: 'Allow negotiation on quantities', example: true })
  @IsBoolean()
  @IsOptional()
  allowQuantityNegotiation?: boolean;

  @ApiPropertyOptional({ description: 'Allow negotiation on delivery fee', example: false })
  @IsBoolean()
  @IsOptional()
  allowDeliveryFeeNegotiation?: boolean;

  @ApiPropertyOptional({ description: 'Minimum order for free delivery', example: 500 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  freeDeliveryThreshold?: number;
}

class WorkingHoursDto {
  @ApiProperty({ description: 'Opening time', example: '09:00' })
  @IsString()
  @IsNotEmpty()
  open: string;

  @ApiProperty({ description: 'Closing time', example: '22:00' })
  @IsString()
  @IsNotEmpty()
  close: string;
}

export class MerchantConfigDto {
  @ApiPropertyOptional({ description: 'Merchant display name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ 
    description: 'Business category',
    enum: MerchantCategory 
  })
  @IsEnum(MerchantCategory)
  @IsOptional()
  category?: MerchantCategory;

  @ApiPropertyOptional({ description: 'City for delivery area validation', example: 'cairo' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'Default delivery fee', example: 30 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  defaultDeliveryFee?: number;

  @ApiPropertyOptional({ description: 'Currency code', example: 'EGP' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: 'Language code', example: 'ar-EG' })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ description: 'Daily token budget limit', example: 100000 })
  @IsNumber()
  @IsOptional()
  @Min(1000)
  dailyTokenBudget?: number;

  @ApiPropertyOptional({ description: 'Auto-book delivery on order confirmation' })
  @IsBoolean()
  @IsOptional()
  autoBookDelivery?: boolean;

  @ApiPropertyOptional({ description: 'Enable follow-up messages for abandoned carts' })
  @IsBoolean()
  @IsOptional()
  enableFollowups?: boolean;

  @ApiPropertyOptional({ description: 'Custom greeting message template' })
  @IsString()
  @IsOptional()
  greetingTemplate?: string;

  @ApiPropertyOptional({ 
    description: 'Negotiation rules',
    type: NegotiationRulesDto 
  })
  @ValidateNested()
  @Type(() => NegotiationRulesDto)
  @IsOptional()
  negotiationRules?: NegotiationRulesDto;

  @ApiPropertyOptional({ 
    description: 'Working hours',
    type: WorkingHoursDto 
  })
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  @IsOptional()
  workingHours?: WorkingHoursDto;
}

export class MerchantResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: MerchantCategory })
  category: MerchantCategory;

  @ApiProperty()
  city: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  language: string;

  @ApiProperty()
  dailyTokenBudget: number;

  @ApiProperty()
  defaultDeliveryFee: number;

  @ApiProperty()
  autoBookDelivery: boolean;

  @ApiProperty()
  enableFollowups: boolean;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
