import {
  Controller,
  Post,
  Get,
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
  CatalogUpsertDto,
  CatalogUpsertResponseDto,
  CatalogItemResponseDto,
  CreateCatalogItemDto,
  UpdateCatalogItemDto,
  CatalogSearchDto,
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
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";
import { v4 as uuidv4 } from "uuid";
import { NotFoundException, BadRequestException } from "@nestjs/common";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@ApiTags("Catalog")
@ApiSecurity("admin-api-key")
@ApiHeader({
  name: "x-admin-api-key",
  required: true,
  description: "Admin API key",
})
@UseGuards(AdminApiKeyGuard)
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

  @Get(":merchantId/items")
  @ApiOperation({
    summary: "List catalog items for a merchant",
    description: "Get paginated list of catalog items with optional filters",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiQuery({ name: "page", description: "Page number", required: false })
  @ApiQuery({
    name: "pageSize",
    description: "Items per page",
    required: false,
  })
  @ApiQuery({
    name: "category",
    description: "Filter by category",
    required: false,
  })
  @ApiQuery({
    name: "search",
    description: "Search by name or SKU",
    required: false,
  })
  @ApiQuery({
    name: "isActive",
    description: "Filter by active status",
    required: false,
  })
  @ApiResponse({ status: 200, description: "List of catalog items" })
  async listItems(
    @Param("merchantId") merchantId: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "20",
    @Query("category") category?: string,
    @Query("search") search?: string,
    @Query("isActive") isActive?: string,
  ): Promise<PaginatedResponse<CatalogItemResponseDto>> {
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNum = Math.min(
      100,
      Math.max(1, parseInt(pageSize, 10) || 20),
    );

    // Use findByMerchant and filter in memory for now
    // In production, this should be a proper paginated query
    let items = await this.catalogRepo.findByMerchant(merchantId);

    // Apply filters
    if (category) {
      items = items.filter((item) => item.category === category);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      items = items.filter(
        (item) =>
          (item.name || item.nameAr || "")
            .toLowerCase()
            .includes(searchLower) ||
          (item.sku || "").toLowerCase().includes(searchLower),
      );
    }
    if (isActive !== undefined) {
      const activeFilter = isActive === "true";
      items = items.filter(
        (item) => (item.isActive ?? item.isAvailable) === activeFilter,
      );
    }

    const total = items.length;
    const totalPages = Math.ceil(total / pageSizeNum);
    const startIndex = (pageNum - 1) * pageSizeNum;
    const paginatedItems = items.slice(startIndex, startIndex + pageSizeNum);

    return {
      items: paginatedItems.map((item) => this.toResponseDto(item)),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages,
    };
  }

  @Get(":merchantId/items/:itemId")
  @ApiOperation({ summary: "Get a specific catalog item" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiParam({ name: "itemId", description: "Item ID" })
  @ApiResponse({ status: 200, description: "Catalog item details" })
  @ApiResponse({ status: 404, description: "Item not found" })
  async getItem(
    @Param("merchantId") merchantId: string,
    @Param("itemId") itemId: string,
  ): Promise<CatalogItemResponseDto> {
    const item = await this.catalogRepo.findById(itemId);

    if (!item || item.merchantId !== merchantId) {
      throw new NotFoundException(`Item ${itemId} not found`);
    }

    return this.toResponseDto(item);
  }

  @Post(":merchantId/items")
  @ApiOperation({ summary: "Create a new catalog item" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiResponse({ status: 201, description: "Item created" })
  @ApiResponse({ status: 400, description: "Invalid input" })
  async createItem(
    @Param("merchantId") merchantId: string,
    @Body() dto: CreateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }

    // Check for duplicate SKU
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

    // Check for duplicate name
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
      message: "Catalog item created",
      merchantId,
      itemId: item.id,
      name: dto.name,
    });

    return this.toResponseDto(item);
  }

  @Put(":merchantId/items/:itemId")
  @ApiOperation({ summary: "Update a catalog item" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiParam({ name: "itemId", description: "Item ID" })
  @ApiResponse({ status: 200, description: "Item updated" })
  @ApiResponse({ status: 404, description: "Item not found" })
  async updateItem(
    @Param("merchantId") merchantId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    const item = await this.catalogRepo.findById(itemId);

    if (!item || item.merchantId !== merchantId) {
      throw new NotFoundException(`Item ${itemId} not found`);
    }

    // Check for duplicate SKU if changing it
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
    const updatedItem = await this.catalogRepo.findById(itemId);

    this.logger.log({
      message: "Catalog item updated",
      merchantId,
      itemId,
    });

    return this.toResponseDto(updatedItem!);
  }

  @Delete(":merchantId/items/:itemId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a catalog item" })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiParam({ name: "itemId", description: "Item ID" })
  @ApiResponse({ status: 204, description: "Item deleted" })
  @ApiResponse({ status: 404, description: "Item not found" })
  async deleteItem(
    @Param("merchantId") merchantId: string,
    @Param("itemId") itemId: string,
  ): Promise<void> {
    const item = await this.catalogRepo.findById(itemId);

    if (!item || item.merchantId !== merchantId) {
      throw new NotFoundException(`Item ${itemId} not found`);
    }

    await this.catalogRepo.delete(itemId);

    this.logger.log({
      message: "Catalog item deleted",
      merchantId,
      itemId,
    });
  }

  @Post(":merchantId/search")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Search catalog items",
    description:
      "Search for items with full-text matching and candidate retrieval",
  })
  @ApiParam({ name: "merchantId", description: "Merchant ID" })
  @ApiResponse({
    status: 200,
    description: "Search results with matching items",
  })
  async searchItems(
    @Param("merchantId") merchantId: string,
    @Body() dto: CatalogSearchDto,
  ): Promise<{
    items: CatalogItemResponseDto[];
    totalMatches: number;
    searchTerms: string[];
  }> {
    const merchant = await this.merchantRepo.findById(merchantId);
    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found`);
    }

    // Candidate retrieval - search database before LLM
    const searchTerms = this.extractSearchTerms(dto.query);
    let items = await this.catalogRepo.findByMerchant(merchantId);

    // Filter active items only
    items = items.filter((item) => item.isActive ?? item.isAvailable);

    // Score and rank items based on search terms
    const scoredItems = items.map((item) => {
      let score = 0;
      const name = (item.name || item.nameAr || "").toLowerCase();
      const description = (
        item.description ||
        item.descriptionAr ||
        ""
      ).toLowerCase();
      const category = (item.category || "").toLowerCase();

      for (const term of searchTerms) {
        const termLower = term.toLowerCase();
        // Exact name match = high score
        if (name === termLower) score += 100;
        // Name contains term
        else if (name.includes(termLower)) score += 50;
        // Description contains term
        if (description.includes(termLower)) score += 20;
        // Category match
        if (category.includes(termLower)) score += 30;
      }

      return { item, score };
    });

    // Sort by score and filter items with any match
    const rankedItems = scoredItems
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, dto.limit || 10)
      .map((s) => s.item);

    this.logger.log({
      message: "Catalog search completed",
      merchantId,
      query: dto.query,
      searchTerms,
      totalMatches: rankedItems.length,
    });

    return {
      items: rankedItems.map((item) => this.toResponseDto(item)),
      totalMatches: rankedItems.length,
      searchTerms,
    };
  }

  private extractSearchTerms(query: string): string[] {
    // Basic term extraction - split by common delimiters
    // In production, use NLP or LLM for better extraction
    const terms = query
      .toLowerCase()
      .replace(/[،,\.]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 1)
      // Filter out common Arabic and English stop words
      .filter(
        (term) =>
          ![
            "و",
            "في",
            "من",
            "على",
            "the",
            "a",
            "an",
            "and",
            "or",
            "is",
          ].includes(term),
      );

    return [...new Set(terms)];
  }
}
