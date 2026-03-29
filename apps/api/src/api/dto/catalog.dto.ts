import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  ValidateNested,
  IsArray,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CatalogItemDto {
  @ApiPropertyOptional({ description: "External SKU/ID" })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiProperty({ description: "Product name", example: "تيشيرت قطن" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: "Product description" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: "Price in local currency", example: 150 })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({
    description: "Product category",
    example: "ملابس رجالي",
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: "Stock quantity", example: 100 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({
    description: "Is product active/available",
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: "Product variants (sizes, colors, etc.)",
    example: ["S", "M", "L", "XL"],
  })
  @IsArray()
  @IsOptional()
  variants?: string[];

  @ApiPropertyOptional({ description: "Product image URL" })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}

export class CatalogUpsertDto {
  @ApiProperty({ description: "Merchant ID" })
  @IsString()
  @IsNotEmpty()
  merchantId!: string;

  @ApiProperty({
    description: "List of catalog items to upsert",
    type: [CatalogItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogItemDto)
  items!: CatalogItemDto[];
}

export class CatalogItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  merchantId!: string;

  @ApiPropertyOptional()
  sku?: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  nameEn?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  descriptionEn?: string;

  @ApiProperty()
  price!: number;

  @ApiPropertyOptional()
  category?: string;

  @ApiPropertyOptional()
  stock?: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional()
  hasRecipe?: boolean;

  @ApiPropertyOptional()
  variants?: string[];

  @ApiPropertyOptional()
  imageUrl?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class CatalogUpsertResponseDto {
  @ApiProperty({ description: "Number of items created" })
  created!: number;

  @ApiProperty({ description: "Number of items updated" })
  updated!: number;

  @ApiProperty({ description: "Total items processed" })
  total!: number;

  @ApiProperty({ type: [CatalogItemResponseDto] })
  items!: CatalogItemResponseDto[];
}

// New DTOs for full CRUD operations

export class CreateCatalogItemDto {
  @ApiPropertyOptional({ description: "External SKU/ID" })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiProperty({ description: "Product name", example: "تيشيرت قطن" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: "Product name (English)",
    example: "Cotton T-Shirt",
  })
  @IsString()
  @IsOptional()
  nameEn?: string;

  @ApiPropertyOptional({ description: "Product description" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: "Product description (English)" })
  @IsString()
  @IsOptional()
  descriptionEn?: string;

  @ApiProperty({ description: "Price in local currency", example: 150 })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({
    description: "Product category",
    example: "ملابس رجالي",
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: "Stock quantity", example: 100 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({
    description: "Is product active/available",
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: "Product variants (sizes, colors, etc.)",
    example: ["S", "M", "L", "XL"],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variants?: string[];

  @ApiPropertyOptional({ description: "Product image URL" })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}

export class UpdateCatalogItemDto {
  @ApiPropertyOptional({ description: "External SKU/ID" })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ description: "Product name" })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: "Product name (English)" })
  @IsString()
  @IsOptional()
  nameEn?: string;

  @ApiPropertyOptional({ description: "Product description" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: "Product description (English)" })
  @IsString()
  @IsOptional()
  descriptionEn?: string;

  @ApiPropertyOptional({ description: "Price in local currency" })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ description: "Product category" })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: "Stock quantity" })
  @IsNumber()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiPropertyOptional({ description: "Is product active/available" })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "Product variants" })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variants?: string[];

  @ApiPropertyOptional({ description: "Product image URL" })
  @IsString()
  @IsOptional()
  imageUrl?: string;
}

export class CatalogSearchDto {
  @ApiProperty({
    description: "Search query in natural language (Arabic or English)",
    example: "قميص أزرق مقاس M",
  })
  @IsString()
  @IsNotEmpty()
  query!: string;

  @ApiPropertyOptional({
    description: "Maximum number of results to return",
    default: 10,
    example: 10,
  })
  @IsNumber()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: "Filter by category" })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    description: "Include out-of-stock items",
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  includeOutOfStock?: boolean;
}
