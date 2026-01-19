import { 
  IsString, IsNotEmpty, IsOptional, IsNumber, 
  IsBoolean, ValidateNested, IsArray, Min, Max 
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CatalogItemDto {
  @ApiPropertyOptional({ description: 'External SKU/ID' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiProperty({ description: 'Product name', example: 'تيشيرت قطن' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Product description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Price in local currency', example: 150 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Product category', example: 'ملابس رجالي' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Stock quantity', example: 100 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ description: 'Is product active/available', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ 
    description: 'Product variants (sizes, colors, etc.)',
    example: ['S', 'M', 'L', 'XL']
  })
  @IsArray()
  @IsOptional()
  variants?: string[];

  @ApiPropertyOptional({ description: 'Product image URL' })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}

export class CatalogUpsertDto {
  @ApiProperty({ description: 'Merchant ID' })
  @IsString()
  @IsNotEmpty()
  merchantId: string;

  @ApiProperty({ 
    description: 'List of catalog items to upsert',
    type: [CatalogItemDto]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogItemDto)
  items: CatalogItemDto[];
}

export class CatalogItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  merchantId: string;

  @ApiPropertyOptional()
  sku?: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  price: number;

  @ApiPropertyOptional()
  category?: string;

  @ApiPropertyOptional()
  stock?: number;

  @ApiProperty()
  isActive: boolean;

  @ApiPropertyOptional()
  variants?: string[];

  @ApiPropertyOptional()
  imageUrl?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CatalogUpsertResponseDto {
  @ApiProperty({ description: 'Number of items created' })
  created: number;

  @ApiProperty({ description: 'Number of items updated' })
  updated: number;

  @ApiProperty({ description: 'Total items processed' })
  total: number;

  @ApiProperty({ type: [CatalogItemResponseDto] })
  items: CatalogItemResponseDto[];
}
