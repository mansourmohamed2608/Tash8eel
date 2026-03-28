import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
  UseGuards,
  Req,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiHeader,
  ApiSecurity,
  ApiParam,
} from "@nestjs/swagger";
import { Request } from "express";
import {
  CreateCatalogItemDto,
  UpdateCatalogItemDto,
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
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

@ApiTags("Catalog (Portal)")
@ApiSecurity("x-api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard)
@Controller("v1/portal/catalog")
export class MerchantCatalogController {
  private readonly logger = new Logger(MerchantCatalogController.name);

  constructor(
    @Inject(CATALOG_REPOSITORY)
    private readonly catalogRepo: ICatalogRepository,
    @Inject(MERCHANT_REPOSITORY)
    private readonly merchantRepo: IMerchantRepository,
    @Inject(DATABASE_POOL)
    private readonly pool: Pool,
  ) {}

  /** Fire-and-forget: enqueue catalog item for embedding generation */
  private enqueueEmbedding(catalogItemId: string): void {
    this.pool
      .query(
        `INSERT INTO catalog_embedding_jobs (id, catalog_item_id, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'pending', NOW(), NOW())
         ON CONFLICT (catalog_item_id) DO UPDATE
           SET status = 'pending', updated_at = NOW()`,
        [catalogItemId],
      )
      .catch((err) =>
        this.logger.warn(
          `Failed to enqueue embedding for ${catalogItemId}: ${err.message}`,
        ),
      );
  }

  private getMerchantId(req: Request): string {
    return (req as any).merchantId as string;
  }

  private toResponseDto(item: CatalogItem): CatalogItemResponseDto {
    return {
      id: item.id,
      merchantId: item.merchantId,
      sku: item.sku,
      name: item.name || item.nameAr,
      nameEn: item.nameEn,
      description: item.description || item.descriptionAr,
      descriptionEn: item.descriptionEn,
      price: item.price || item.basePrice,
      category: item.category,
      stock: item.stock,
      isActive: item.isActive ?? item.isAvailable,
      hasRecipe: item.hasRecipe || false,
      variants: item.variants?.map((v) => v.name) || [],
      imageUrl: item.imageUrl,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  @Get("items")
  @ApiOperation({ summary: "List catalog items for authenticated merchant" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "pageSize", required: false })
  @ApiQuery({ name: "category", required: false })
  @ApiQuery({ name: "search", required: false })
  @ApiQuery({ name: "isActive", required: false })
  @ApiResponse({ status: 200, description: "List of catalog items" })
  async listItems(
    @Req() req: Request,
    @Query("page") page = 1,
    @Query("pageSize") pageSize = 20,
    @Query("category") category?: string,
    @Query("search") search?: string,
    @Query("isActive") isActive?: string,
  ): Promise<PaginatedResponse<CatalogItemResponseDto>> {
    const merchantId = this.getMerchantId(req);
    const pageNum = Math.max(1, Number(page) || 1);
    const pageSizeNum = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const pageOffset = (pageNum - 1) * pageSizeNum;
    const filters = [`merchant_id = $1`];
    const values: any[] = [merchantId];

    if (category) {
      values.push(category);
      filters.push(`category = $${values.length}`);
    }

    if (typeof isActive === "string") {
      values.push(isActive === "true");
      filters.push(`is_available = $${values.length}`);
    }

    if (search) {
      values.push(`%${search}%`);
      const searchParam = `$${values.length}`;
      filters.push(
        `(COALESCE(name_ar, '') ILIKE ${searchParam}
          OR COALESCE(name_en, '') ILIKE ${searchParam}
          OR COALESCE(sku, '') ILIKE ${searchParam}
          OR COALESCE(category, '') ILIKE ${searchParam}
          OR COALESCE(array_to_string(tags, ' '), '') ILIKE ${searchParam})`,
      );
    }

    const whereClause = filters.join(" AND ");
    const countResult = await this.pool.query(
      `SELECT COUNT(*) AS total FROM catalog_items WHERE ${whereClause}`,
      values,
    );

    values.push(pageSizeNum, pageOffset);
    const itemsResult = await this.pool.query(
      `SELECT *
       FROM catalog_items
       WHERE ${whereClause}
       ORDER BY name_ar
       LIMIT $${values.length - 1}
       OFFSET $${values.length}`,
      values,
    );
    const paginatedItems = itemsResult.rows.map((row: any) =>
      (this.catalogRepo as any).mapToEntity
        ? (this.catalogRepo as any).mapToEntity(row)
        : row,
    );

    return {
      data: paginatedItems.map((item) => this.toResponseDto(item)),
      totalCount: parseInt(countResult.rows[0]?.total || "0", 10),
      page: pageNum,
      pageSize: pageSizeNum,
    };
  }

  @Post("items")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create catalog item for authenticated merchant" })
  @ApiResponse({ status: 201, description: "Item created" })
  async createItem(
    @Req() req: Request,
    @Body() dto: CreateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    const merchantId = this.getMerchantId(req);
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }

    if (dto.sku) {
      const existingBySku = await this.catalogRepo.findBySku(
        dto.sku,
        merchantId,
      );
      if (existingBySku) {
        throw new BadRequestException(
          `Item with SKU ${dto.sku} already exists`,
        );
      }
    }

    const existingByName = await this.catalogRepo.findByName(
      dto.name,
      merchantId,
    );
    if (existingByName) {
      throw new BadRequestException(
        `Item with name "${dto.name}" already exists`,
      );
    }

    const item = await this.catalogRepo.create({
      merchantId,
      sku: dto.sku,
      nameAr: dto.name,
      nameEn: dto.nameEn,
      descriptionAr: dto.description,
      descriptionEn: dto.descriptionEn,
      basePrice: dto.price,
      category: dto.category,
      isAvailable: dto.isActive ?? true,
      variants: dto.variants?.map((v) => ({ name: v, values: [] })) || [],
    });

    this.logger.log({
      message: "Catalog item created (portal)",
      merchantId,
      itemId: item.id,
    });

    this.enqueueEmbedding(item.id);

    return this.toResponseDto(item);
  }

  @Put("items/:itemId")
  @ApiOperation({ summary: "Update catalog item for authenticated merchant" })
  @ApiParam({ name: "itemId", description: "Item ID" })
  @ApiResponse({ status: 200, description: "Item updated" })
  async updateItem(
    @Req() req: Request,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    const merchantId = this.getMerchantId(req);
    const item = await this.catalogRepo.findById(itemId);
    if (!item || item.merchantId !== merchantId) {
      throw new NotFoundException(`Item ${itemId} not found`);
    }

    if (dto.sku && dto.sku !== item.sku) {
      const existingBySku = await this.catalogRepo.findBySku(
        dto.sku,
        merchantId,
      );
      if (existingBySku && existingBySku.id !== itemId) {
        throw new BadRequestException(
          `Item with SKU ${dto.sku} already exists`,
        );
      }
    }

    const updateData: Record<string, any> = {};
    if (dto.name !== undefined) updateData.nameAr = dto.name;
    if (dto.nameEn !== undefined) updateData.nameEn = dto.nameEn;
    if (dto.description !== undefined)
      updateData.descriptionAr = dto.description;
    if (dto.descriptionEn !== undefined)
      updateData.descriptionEn = dto.descriptionEn;
    if (dto.price !== undefined) updateData.basePrice = dto.price;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.isActive !== undefined) updateData.isAvailable = dto.isActive;
    if (dto.sku !== undefined) updateData.sku = dto.sku;
    if (dto.variants !== undefined) {
      updateData.variants = dto.variants.map((v) => ({
        name: v,
        values: [],
        priceModifier: 0,
      }));
    }

    await this.catalogRepo.update(itemId, updateData as any);
    const updated = await this.catalogRepo.findById(itemId);

    this.enqueueEmbedding(itemId);

    return this.toResponseDto(updated!);
  }

  @Delete("items/:itemId")
  @ApiOperation({ summary: "Delete catalog item for authenticated merchant" })
  @ApiParam({ name: "itemId", description: "Item ID" })
  @ApiResponse({ status: 200, description: "Item deleted" })
  async deleteItem(@Req() req: Request, @Param("itemId") itemId: string) {
    const merchantId = this.getMerchantId(req);
    const item = await this.catalogRepo.findById(itemId);
    if (!item || item.merchantId !== merchantId) {
      throw new NotFoundException(`Item ${itemId} not found`);
    }

    await this.catalogRepo.delete(itemId);

    return { success: true };
  }
}
