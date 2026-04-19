import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import {
  CatalogUpsertDto,
  CatalogUpsertResponseDto,
  CatalogItemResponseDto,
} from "../dto/catalog.dto";
import {
  ICatalogRepository,
  CATALOG_REPOSITORY,
} from "../../domain/ports/catalog.repository";
import {
  IMerchantRepository,
  MERCHANT_REPOSITORY,
} from "../../domain/ports/merchant.repository";
import { CatalogItem } from "../../domain/entities/catalog.entity";
import { v4 as uuidv4 } from "uuid";
import { NotFoundException } from "@nestjs/common";

@ApiTags("Catalog")
@Controller("v1/catalog")
export class CatalogController {
  private readonly logger = new Logger(CatalogController.name);

  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogRepo: ICatalogRepository,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
  ) {}

  @Post("upsert")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Upsert catalog items",
    description:
      "Create or update catalog items for a merchant. Items are matched by name or SKU.",
  })
  @ApiResponse({
    status: 200,
    description: "Items upserted successfully",
    type: CatalogUpsertResponseDto,
  })
  @ApiResponse({ status: 404, description: "Merchant not found" })
  async upsertItems(
    @Body() dto: CatalogUpsertDto,
  ): Promise<CatalogUpsertResponseDto> {
    // Verify merchant exists
    const merchant = await this.merchantRepo.findById(dto.merchantId);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${dto.merchantId} not found`);
    }

    let created = 0;
    let updated = 0;
    const processedItems: CatalogItem[] = [];

    for (const itemDto of dto.items) {
      // Check if item exists by name or SKU
      let existingItem = await this.catalogRepo.findByName(
        itemDto.name,
        dto.merchantId,
      );

      if (!existingItem && itemDto.sku) {
        existingItem = await this.catalogRepo.findBySku(
          itemDto.sku,
          dto.merchantId,
        );
      }

      if (existingItem) {
        // Update existing item
        const updatedItem: CatalogItem = {
          ...existingItem,
          name: itemDto.name,
          description: itemDto.description ?? existingItem.description,
          price: itemDto.price,
          category: itemDto.category ?? existingItem.category,
          stock: itemDto.stock ?? existingItem.stock,
          isActive: itemDto.isActive ?? existingItem.isActive,
          variants: existingItem.variants,
          imageUrl: itemDto.imageUrl ?? existingItem.imageUrl,
          updatedAt: new Date(),
        };

        await this.catalogRepo.update(existingItem.id, updatedItem as any);
        processedItems.push(updatedItem);
        updated++;
      } else {
        // Create new item - use create input, not full CatalogItem
        await this.catalogRepo.create({
          merchantId: dto.merchantId,
          sku: itemDto.sku,
          nameAr: itemDto.name,
          basePrice: itemDto.price ?? 0,
          category: itemDto.category,
          isAvailable: itemDto.isActive ?? true,
        });

        const createdItem = await this.catalogRepo.findByName(
          itemDto.name,
          dto.merchantId,
        );
        if (createdItem) processedItems.push(createdItem);
        created++;
      }
    }

    this.logger.log({
      message: "Catalog items upserted",
      merchantId: dto.merchantId,
      created,
      updated,
      total: dto.items.length,
    });

    return {
      created,
      updated,
      total: dto.items.length,
      items: processedItems.map((item) => this.toResponseDto(item)),
    };
  }

  private toResponseDto(item: CatalogItem): CatalogItemResponseDto {
    return {
      id: item.id,
      merchantId: item.merchantId,
      sku: item.sku,
      name: item.name || item.nameAr,
      description: item.description || item.descriptionAr,
      price: item.price || item.basePrice,
      category: item.category,
      stock: item.stock,
      isActive: item.isActive ?? item.isAvailable,
      variants: item.variants?.map((v) => v.name) || [],
      imageUrl: item.imageUrl,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
