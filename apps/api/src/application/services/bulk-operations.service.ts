import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { Pool } from "pg";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import * as Papa from "papaparse";

export type BulkOperationType = "IMPORT" | "EXPORT" | "UPDATE" | "DELETE";
export type BulkOperationStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
export type ResourceType = "products" | "customers" | "orders" | "inventory";

export interface BulkOperation {
  id: string;
  merchantId: string;
  staffId?: string;
  operationType: BulkOperationType;
  resourceType: ResourceType;
  status: BulkOperationStatus;
  fileUrl?: string;
  resultUrl?: string;
  totalRecords?: number;
  processedRecords: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; field?: string; error: string }>;
  options: Record<string, any>;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface ImportOptions {
  skipHeader?: boolean;
  updateExisting?: boolean;
  dryRun?: boolean;
  fieldMapping?: Record<string, string>;
}

export interface ExportOptions {
  fields?: string[];
  filters?: Record<string, any>;
  format?: "csv" | "json";
  includeHeaders?: boolean;
}

// Arabic to English header mapping
const HEADER_MAPPING: Record<string, string> = {
  // Product fields
  "رقم sku": "sku",
  "اسم المنتج": "name",
  "الاسم بالإنجليزية": "name_en",
  الوصف: "description",
  السعر: "price",
  "السعر قبل الخصم": "compare_price",
  الفئة: "category",
  "المتغيرات (اللون، المقاس)": "variants",
  "الكمية المتوفرة": "inventory",
  "روابط الصور": "images",
  "الحالة (active/inactive)": "status",
  // Customer fields
  "رقم الهاتف": "phone",
  الاسم: "name",
  "البريد الإلكتروني": "email",
  المدينة: "city",
  العنوان: "address",
  الوسوم: "tags",
  ملاحظات: "notes",
  // Inventory fields
  الكمية: "quantity",
  "العملية (set/add/subtract)": "operation",
  الموقع: "location",
  "تاريخ الصلاحية": "expiry_date",
  "تاريخ الانتهاء": "expiry_date",
  "قابل للتلف": "is_perishable",
};

function normalizeHeader(header: string): string {
  const cleaned = header
    .trim()
    .toLowerCase()
    .replace(/^\ufeff/, ""); // Remove BOM
  return HEADER_MAPPING[cleaned] || HEADER_MAPPING[header.trim()] || cleaned;
}

@Injectable()
export class BulkOperationsService {
  private readonly logger = new Logger(BulkOperationsService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * Create a bulk operation record
   */
  async createOperation(
    merchantId: string,
    operationType: BulkOperationType,
    resourceType: ResourceType,
    options: Record<string, any> = {},
    staffId?: string,
  ): Promise<BulkOperation> {
    const result = await this.pool.query(
      `INSERT INTO bulk_operations (
        merchant_id, staff_id, operation_type, resource_type, options
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        merchantId,
        staffId || null,
        operationType,
        resourceType,
        JSON.stringify(options),
      ],
    );

    return this.mapOperation(result.rows[0]);
  }

  /**
   * Import products from CSV data
   */
  async importProducts(
    merchantId: string,
    csvData: string,
    options: ImportOptions = {},
    staffId?: string,
  ): Promise<BulkOperation> {
    // Create operation record
    const operation = await this.createOperation(
      merchantId,
      "IMPORT",
      "products",
      options,
      staffId,
    );

    try {
      // Parse CSV
      const parsed = Papa.parse(csvData, {
        header: options.skipHeader !== false,
        skipEmptyLines: true,
        transformHeader: (header) => {
          const normalized = normalizeHeader(header);
          return normalized;
        },
      });

      if (parsed.errors.length > 0) {
        this.logger.warn(
          `CSV parse errors: ${parsed.errors.map((e) => e.message).join(", ")}`,
        );
        throw new BadRequestException(
          `CSV parsing errors: ${parsed.errors.map((e) => e.message).join(", ")}`,
        );
      }

      const rows = parsed.data as any[];
      this.logger.log(`Parsed ${rows.length} product rows for bulk import`);
      await this.updateOperationProgress(operation.id, {
        totalRecords: rows.length,
        status: "PROCESSING",
      });

      const errors: Array<{ row: number; field?: string; error: string }> = [];
      let successCount = 0;

      // Process in batches
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);

        for (let j = 0; j < batch.length; j++) {
          const rowIndex = i + j + 2; // +2 for header and 0-index
          const row = batch[j];

          try {
            // Map fields
            const mapped = options.fieldMapping
              ? this.applyFieldMapping(row, options.fieldMapping)
              : row;

            // Validate required fields
            if (!mapped.name && !mapped.name_ar) {
              errors.push({
                row: rowIndex,
                field: "name",
                error: "اسم المنتج مطلوب - استخدم عمود name أو اسم المنتج",
              });
              continue;
            }

            if (!mapped.price && !mapped.base_price) {
              errors.push({
                row: rowIndex,
                field: "price",
                error: "السعر مطلوب - استخدم عمود price أو السعر",
              });
              continue;
            }

            if (options.dryRun) {
              successCount++;
              continue;
            }

            // Check for existing product by SKU
            const existing = mapped.sku
              ? await this.pool.query(
                  `SELECT id FROM catalog_items WHERE merchant_id = $1 AND sku = $2`,
                  [merchantId, mapped.sku],
                )
              : { rows: [] };

            if (existing.rows.length > 0 && options.updateExisting) {
              // Update existing
              await this.pool.query(
                `UPDATE catalog_items SET 
                  name_ar = COALESCE($1, name_ar),
                  name_en = COALESCE($2, name_en),
                  description_ar = COALESCE($3, description_ar),
                  category = COALESCE($4, category),
                  base_price = COALESCE($5, base_price),
                  is_active = COALESCE($6, is_active),
                  updated_at = NOW()
                 WHERE id = $7`,
                [
                  mapped.name_ar || mapped.name,
                  mapped.name_en,
                  mapped.description_ar || mapped.description,
                  mapped.category,
                  parseFloat(mapped.price || mapped.base_price),
                  mapped.status !== "inactive" &&
                    mapped.status !== "false" &&
                    mapped.status !== "0",
                  existing.rows[0].id,
                ],
              );
            } else if (existing.rows.length === 0) {
              // Insert new
              await this.pool.query(
                `INSERT INTO catalog_items (
                  merchant_id, sku, name_ar, name_en, description_ar, category, base_price, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  merchantId,
                  mapped.sku || null,
                  mapped.name_ar || mapped.name,
                  mapped.name_en || null,
                  mapped.description_ar || mapped.description || null,
                  mapped.category || null,
                  parseFloat(mapped.price || mapped.base_price),
                  mapped.status !== "inactive" &&
                    mapped.status !== "false" &&
                    mapped.status !== "0",
                ],
              );
            } else {
              errors.push({
                row: rowIndex,
                error: "Product with this SKU already exists",
              });
              continue;
            }

            successCount++;
          } catch (err: any) {
            errors.push({ row: rowIndex, error: err.message });
          }
        }

        // Update progress
        await this.updateOperationProgress(operation.id, {
          processedRecords: Math.min(i + batchSize, rows.length),
          successCount,
          errorCount: errors.length,
        });
      }

      // Complete operation
      await this.completeOperation(operation.id, successCount, errors);

      return this.getOperation(
        operation.id,
        merchantId,
      ) as Promise<BulkOperation>;
    } catch (error: any) {
      await this.failOperation(operation.id, error.message);
      throw error;
    }
  }

  /**
   * Export products to CSV
   */
  async exportProducts(
    merchantId: string,
    options: ExportOptions = {},
    staffId?: string,
  ): Promise<{ operation: BulkOperation; data: string }> {
    const operation = await this.createOperation(
      merchantId,
      "EXPORT",
      "products",
      options,
      staffId,
    );

    try {
      await this.updateOperationProgress(operation.id, {
        status: "PROCESSING",
      });

      // Build query
      let query = `SELECT * FROM catalog_items WHERE merchant_id = $1`;
      const params: any[] = [merchantId];
      let paramIndex = 2;

      if (options.filters?.category) {
        query += ` AND category = $${paramIndex++}`;
        params.push(options.filters.category);
      }

      if (options.filters?.isActive !== undefined) {
        query += ` AND is_active = $${paramIndex++}`;
        params.push(options.filters.isActive);
      }

      query += " ORDER BY created_at DESC";

      const result = await this.pool.query(query, params);

      // Map fields for export
      const fields = options.fields || [
        "sku",
        "name_ar",
        "name_en",
        "category",
        "base_price",
        "is_active",
      ];
      const rows = result.rows.map((row) => {
        const mapped: Record<string, any> = {};
        fields.forEach((field) => {
          mapped[field] = row[field];
        });
        return mapped;
      });

      await this.updateOperationProgress(operation.id, {
        totalRecords: rows.length,
        processedRecords: rows.length,
        successCount: rows.length,
      });

      let data: string;
      if (options.format === "json") {
        data = JSON.stringify(rows, null, 2);
      } else {
        data = Papa.unparse(rows, {
          header: options.includeHeaders !== false,
        });
      }

      await this.completeOperation(operation.id, rows.length, []);

      const completedOperation = await this.getOperation(
        operation.id,
        merchantId,
      );
      return { operation: completedOperation!, data };
    } catch (error: any) {
      await this.failOperation(operation.id, error.message);
      throw error;
    }
  }

  /**
   * Import customers from CSV
   */
  async importCustomers(
    merchantId: string,
    csvData: string,
    options: ImportOptions = {},
    staffId?: string,
  ): Promise<BulkOperation> {
    const operation = await this.createOperation(
      merchantId,
      "IMPORT",
      "customers",
      options,
      staffId,
    );

    try {
      const parsed = Papa.parse(csvData, {
        header: options.skipHeader !== false,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
      });

      const rows = parsed.data as any[];
      await this.updateOperationProgress(operation.id, {
        totalRecords: rows.length,
        status: "PROCESSING",
      });

      const errors: Array<{ row: number; field?: string; error: string }> = [];
      let successCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const rowIndex = i + 2;
        const row = options.fieldMapping
          ? this.applyFieldMapping(rows[i], options.fieldMapping)
          : rows[i];

        try {
          if (!row.phone && !row.whatsapp_id) {
            errors.push({
              row: rowIndex,
              field: "phone",
              error: "رقم الهاتف مطلوب - استخدم عمود phone أو رقم الهاتف",
            });
            continue;
          }

          if (options.dryRun) {
            successCount++;
            continue;
          }

          const phone = row.phone || row.whatsapp_id;
          const whatsappId = row.whatsapp_id || row.phone;

          // Upsert customer - use ON CONFLICT (merchant_id, phone) as that's the actual unique constraint
          await this.pool.query(
            `INSERT INTO customers (merchant_id, phone, whatsapp_id, name, email, address, tags, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (merchant_id, phone) DO UPDATE SET
               whatsapp_id = COALESCE(EXCLUDED.whatsapp_id, customers.whatsapp_id),
               name = COALESCE(EXCLUDED.name, customers.name),
               email = COALESCE(EXCLUDED.email, customers.email),
               address = COALESCE(EXCLUDED.address, customers.address),
               tags = COALESCE(EXCLUDED.tags, customers.tags),
               notes = COALESCE(EXCLUDED.notes, customers.notes),
               updated_at = NOW()`,
            [
              merchantId,
              phone,
              whatsappId,
              row.name || null,
              row.email || null,
              row.address || null,
              row.tags
                ? Array.isArray(row.tags)
                  ? row.tags
                  : row.tags.split(",").map((t: string) => t.trim())
                : null,
              row.notes || null,
            ],
          );

          successCount++;
        } catch (err: any) {
          errors.push({ row: rowIndex, error: err.message });
        }

        if ((i + 1) % 100 === 0) {
          await this.updateOperationProgress(operation.id, {
            processedRecords: i + 1,
            successCount,
            errorCount: errors.length,
          });
        }
      }

      await this.completeOperation(operation.id, successCount, errors);
      return this.getOperation(
        operation.id,
        merchantId,
      ) as Promise<BulkOperation>;
    } catch (error: any) {
      await this.failOperation(operation.id, error.message);
      throw error;
    }
  }

  /**
   * Export customers to CSV
   */
  async exportCustomers(
    merchantId: string,
    options: ExportOptions = {},
    staffId?: string,
  ): Promise<{ operation: BulkOperation; data: string }> {
    const operation = await this.createOperation(
      merchantId,
      "EXPORT",
      "customers",
      options,
      staffId,
    );

    try {
      await this.updateOperationProgress(operation.id, {
        status: "PROCESSING",
      });

      const result = await this.pool.query(
        `SELECT 
          c.*,
          COUNT(DISTINCT o.id) as order_count,
          COALESCE(SUM(o.total), 0) as total_spent
         FROM customers c
         LEFT JOIN orders o ON c.id = o.customer_id AND o.status NOT IN ('CANCELLED')
         WHERE c.merchant_id = $1
         GROUP BY c.id
         ORDER BY c.created_at DESC`,
        [merchantId],
      );

      const fields = options.fields || [
        "phone",
        "name",
        "order_count",
        "total_spent",
        "created_at",
      ];
      const rows = result.rows.map((row) => {
        const mapped: Record<string, any> = {};
        fields.forEach((field) => {
          mapped[field] = row[field];
        });
        return mapped;
      });

      const data =
        options.format === "json"
          ? JSON.stringify(rows, null, 2)
          : Papa.unparse(rows, { header: options.includeHeaders !== false });

      await this.completeOperation(operation.id, rows.length, []);

      const completedOperation = await this.getOperation(
        operation.id,
        merchantId,
      );
      return { operation: completedOperation!, data };
    } catch (error: any) {
      await this.failOperation(operation.id, error.message);
      throw error;
    }
  }

  /**
   * Import inventory from CSV
   */
  async importInventory(
    merchantId: string,
    csvData: string,
    options: ImportOptions = {},
    staffId?: string,
  ): Promise<BulkOperation> {
    const operation = await this.createOperation(
      merchantId,
      "IMPORT",
      "inventory",
      options,
      staffId,
    );

    try {
      const parsed = Papa.parse(csvData, {
        header: options.skipHeader !== false,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
      });

      const rows = parsed.data as any[];
      await this.updateOperationProgress(operation.id, {
        totalRecords: rows.length,
        status: "PROCESSING",
      });

      const errors: Array<{ row: number; field?: string; error: string }> = [];
      let successCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const rowIndex = i + 2;
        const row = options.fieldMapping
          ? this.applyFieldMapping(rows[i], options.fieldMapping)
          : rows[i];

        try {
          if (!row.sku) {
            errors.push({
              row: rowIndex,
              field: "sku",
              error: "رقم SKU مطلوب - استخدم عمود sku أو رقم sku",
            });
            continue;
          }

          const hasQuantity =
            row.quantity !== undefined &&
            row.quantity !== null &&
            String(row.quantity).trim() !== "";
          const hasExpiryDate =
            row.expiry_date !== undefined &&
            row.expiry_date !== null &&
            String(row.expiry_date).trim() !== "";
          const hasPerishableFlag =
            row.is_perishable !== undefined &&
            row.is_perishable !== null &&
            String(row.is_perishable).trim() !== "";

          if (!hasQuantity && !hasExpiryDate && !hasPerishableFlag) {
            errors.push({
              row: rowIndex,
              field: "quantity",
              error: "يجب توفير quantity أو expiry_date أو is_perishable",
            });
            continue;
          }

          if (options.dryRun) {
            successCount++;
            continue;
          }

          // Find product by SKU in catalog_items
          const product = await this.pool.query(
            `SELECT id, stock_quantity FROM catalog_items WHERE merchant_id = $1 AND sku = $2`,
            [merchantId, row.sku],
          );

          if (product.rows.length === 0) {
            errors.push({
              row: rowIndex,
              error: `رقم SKU غير موجود: ${row.sku} - تأكد من إضافة المنتج أولاً`,
            });
            continue;
          }

          const currentQty = parseInt(product.rows[0].stock_quantity) || 0;
          const quantity = hasQuantity
            ? parseInt(String(row.quantity), 10)
            : NaN;
          const op = String(row.operation || "set").toLowerCase();

          let newQuantity = currentQty;
          if (hasQuantity) {
            if (Number.isNaN(quantity)) {
              errors.push({
                row: rowIndex,
                field: "quantity",
                error: "قيمة quantity غير صالحة",
              });
              continue;
            }
            switch (op) {
              case "add":
                newQuantity = currentQty + quantity;
                break;
              case "subtract":
                newQuantity = Math.max(0, currentQty - quantity);
                break;
              case "set":
              default:
                newQuantity = quantity;
            }
          }

          const normalizedExpiryDate = hasExpiryDate
            ? String(row.expiry_date).trim()
            : null;
          const parsedIsPerishable = this.parseBooleanish(row.is_perishable);

          await this.pool.query(
            `UPDATE catalog_items
             SET stock_quantity = $1,
                 expiry_date = COALESCE($2::date, expiry_date),
                 is_perishable = COALESCE(
                   $3::boolean,
                   CASE WHEN $2::date IS NOT NULL THEN true ELSE is_perishable END
                 ),
                 updated_at = NOW()
             WHERE id = $4`,
            [
              newQuantity,
              normalizedExpiryDate,
              parsedIsPerishable,
              product.rows[0].id,
            ],
          );

          successCount++;
        } catch (err: any) {
          errors.push({ row: rowIndex, error: err.message });
        }

        if ((i + 1) % 100 === 0) {
          await this.updateOperationProgress(operation.id, {
            processedRecords: i + 1,
            successCount,
            errorCount: errors.length,
          });
        }
      }

      await this.completeOperation(operation.id, successCount, errors);
      return this.getOperation(
        operation.id,
        merchantId,
      ) as Promise<BulkOperation>;
    } catch (error: any) {
      await this.failOperation(operation.id, error.message);
      throw error;
    }
  }

  /**
   * Bulk update inventory
   */
  async bulkUpdateInventory(
    merchantId: string,
    updates: Array<{
      sku: string;
      quantity: number;
      operation?: "SET" | "ADD" | "SUBTRACT";
    }>,
    staffId?: string,
  ): Promise<BulkOperation> {
    const operation = await this.createOperation(
      merchantId,
      "UPDATE",
      "inventory",
      {},
      staffId,
    );

    try {
      await this.updateOperationProgress(operation.id, {
        totalRecords: updates.length,
        status: "PROCESSING",
      });

      const errors: Array<{ row: number; field?: string; error: string }> = [];
      let successCount = 0;

      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");

        for (let i = 0; i < updates.length; i++) {
          const update = updates[i];

          try {
            // Find product variant by SKU
            const variant = await client.query(
              `SELECT pv.id, pv.stock_quantity 
               FROM product_variants pv
               JOIN products p ON pv.product_id = p.id
               WHERE pv.sku = $1 AND p.merchant_id = $2`,
              [update.sku, merchantId],
            );

            if (variant.rows.length === 0) {
              errors.push({
                row: i + 1,
                error: `رقم SKU غير موجود: ${update.sku} - تأكد من إضافة المنتج أولاً`,
              });
              continue;
            }

            let newQuantity: number;
            const currentQty = parseInt(variant.rows[0].stock_quantity);

            switch (update.operation) {
              case "ADD":
                newQuantity = currentQty + update.quantity;
                break;
              case "SUBTRACT":
                newQuantity = Math.max(0, currentQty - update.quantity);
                break;
              case "SET":
              default:
                newQuantity = update.quantity;
            }

            await client.query(
              `UPDATE product_variants SET stock_quantity = $1, updated_at = NOW() WHERE id = $2`,
              [newQuantity, variant.rows[0].id],
            );

            successCount++;
          } catch (err: any) {
            errors.push({ row: i + 1, error: err.message });
          }
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      await this.completeOperation(operation.id, successCount, errors);
      return this.getOperation(
        operation.id,
        merchantId,
      ) as Promise<BulkOperation>;
    } catch (error: any) {
      await this.failOperation(operation.id, error.message);
      throw error;
    }
  }

  async exportInventory(
    merchantId: string,
    options: ExportOptions = {},
    staffId?: string,
  ): Promise<{ operation: BulkOperation; data: string }> {
    const operation = await this.createOperation(
      merchantId,
      "EXPORT",
      "inventory",
      options,
      staffId,
    );

    try {
      await this.updateOperationProgress(operation.id, {
        status: "PROCESSING",
      });

      const result = await this.pool.query(
        `SELECT
           sku,
           COALESCE(name_ar, name_en) AS name,
           stock_quantity AS quantity,
           'set'::text AS operation,
           expiry_date,
           is_perishable,
           category
         FROM catalog_items
         WHERE merchant_id = $1
         ORDER BY created_at DESC`,
        [merchantId],
      );

      const fields = options.fields || [
        "sku",
        "name",
        "quantity",
        "operation",
        "expiry_date",
        "is_perishable",
        "category",
      ];
      const rows = result.rows.map((row) => {
        const mapped: Record<string, any> = {};
        fields.forEach((field) => {
          mapped[field] = row[field];
        });
        return mapped;
      });

      const data =
        options.format === "json"
          ? JSON.stringify(rows, null, 2)
          : Papa.unparse(rows, { header: options.includeHeaders !== false });

      await this.completeOperation(operation.id, rows.length, []);
      const completedOperation = await this.getOperation(
        operation.id,
        merchantId,
      );
      return { operation: completedOperation!, data };
    } catch (error: any) {
      await this.failOperation(operation.id, error.message);
      throw error;
    }
  }

  /**
   * Get operation by ID
   */
  async getOperation(
    id: string,
    merchantId: string,
  ): Promise<BulkOperation | null> {
    const result = await this.pool.query(
      `SELECT * FROM bulk_operations WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );
    return result.rows.length > 0 ? this.mapOperation(result.rows[0]) : null;
  }

  /**
   * Get operations for a merchant
   */
  async getOperations(
    merchantId: string,
    filters?: { status?: BulkOperationStatus; resourceType?: ResourceType },
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ operations: BulkOperation[]; total: number }> {
    let query = `SELECT * FROM bulk_operations WHERE merchant_id = $1`;
    const params: any[] = [merchantId];
    let paramIndex = 2;

    if (filters?.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters?.resourceType) {
      query += ` AND resource_type = $${paramIndex++}`;
      params.push(filters.resourceType);
    }

    const countResult = await this.pool.query(
      query.replace("SELECT *", "SELECT COUNT(*)"),
      params,
    );

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    return {
      operations: result.rows.map((row) => this.mapOperation(row)),
      total: parseInt(countResult.rows[0].count),
    };
  }

  /**
   * Cancel a pending operation
   */
  async cancelOperation(id: string, merchantId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE bulk_operations SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1 AND merchant_id = $2 AND status = 'PENDING'
       RETURNING id`,
      [id, merchantId],
    );
    return result.rows.length > 0;
  }

  // Private helpers

  private async updateOperationProgress(
    id: string,
    updates: {
      totalRecords?: number;
      processedRecords?: number;
      successCount?: number;
      errorCount?: number;
      status?: BulkOperationStatus;
    },
  ): Promise<void> {
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.totalRecords !== undefined) {
      setClauses.push(`total_records = $${paramIndex++}`);
      values.push(updates.totalRecords);
    }
    if (updates.processedRecords !== undefined) {
      setClauses.push(`processed_records = $${paramIndex++}`);
      values.push(updates.processedRecords);
    }
    if (updates.successCount !== undefined) {
      setClauses.push(`success_count = $${paramIndex++}`);
      values.push(updates.successCount);
    }
    if (updates.errorCount !== undefined) {
      setClauses.push(`error_count = $${paramIndex++}`);
      values.push(updates.errorCount);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
      if (updates.status === "PROCESSING") {
        setClauses.push(`started_at = NOW()`);
      }
    }

    values.push(id);
    await this.pool.query(
      `UPDATE bulk_operations SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
      values,
    );
  }

  private async completeOperation(
    id: string,
    successCount: number,
    errors: Array<{ row: number; field?: string; error: string }>,
  ): Promise<void> {
    // First get the total records to set processed_records equal to total
    const result = await this.pool.query(
      `SELECT total_records FROM bulk_operations WHERE id = $1`,
      [id],
    );
    const totalRecords =
      result.rows[0]?.total_records || successCount + errors.length;

    await this.pool.query(
      `UPDATE bulk_operations SET 
        status = 'COMPLETED',
        processed_records = $1,
        success_count = $2,
        error_count = $3,
        errors = $4,
        completed_at = NOW(),
        updated_at = NOW()
       WHERE id = $5`,
      [
        totalRecords,
        successCount,
        errors.length,
        JSON.stringify(errors.slice(0, 1000)),
        id,
      ],
    );
  }

  private async failOperation(id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE bulk_operations SET 
        status = 'FAILED',
        errors = $1,
        completed_at = NOW(),
        updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify([{ row: 0, error }]), id],
    );
  }

  private applyFieldMapping(row: any, mapping: Record<string, string>): any {
    const result: any = {};
    for (const [targetField, sourceField] of Object.entries(mapping)) {
      if (row[sourceField] !== undefined) {
        result[targetField] = row[sourceField];
      }
    }
    // Also include unmapped fields
    for (const [key, value] of Object.entries(row)) {
      if (!Object.values(mapping).includes(key) && !result[key]) {
        result[key] = value;
      }
    }
    return result;
  }

  private parseBooleanish(value: unknown): boolean | null {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return null;
    if (["true", "1", "yes", "y", "نعم", "صح", "صحيح"].includes(normalized))
      return true;
    if (["false", "0", "no", "n", "لا", "خطأ", "غلط"].includes(normalized))
      return false;
    return null;
  }

  private mapOperation(row: any): BulkOperation {
    return {
      id: row.id,
      merchantId: row.merchant_id,
      staffId: row.staff_id,
      operationType: row.operation_type,
      resourceType: row.resource_type,
      status: row.status,
      fileUrl: row.file_url,
      resultUrl: row.result_url,
      totalRecords: row.total_records,
      processedRecords: row.processed_records,
      successCount: row.success_count,
      errorCount: row.error_count,
      errors: row.errors || [],
      options: row.options || {},
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Import recipe ingredients from CSV
   * Expected columns: product_sku, ingredient_name, ingredient_sku, quantity_required, unit, is_optional, waste_factor, notes
   */
  async importIngredients(
    merchantId: string,
    csvData: string,
    options: ImportOptions = {},
    staffId?: string,
  ): Promise<BulkOperation> {
    const operation = await this.createOperation(
      merchantId,
      "IMPORT",
      "products",
      options,
      staffId,
    );

    try {
      const parsed = Papa.parse(csvData, {
        header: options.skipHeader !== false,
        skipEmptyLines: true,
        transformHeader: (header: string) => {
          const normalized = header?.trim().toLowerCase();
          return HEADER_MAPPING[normalized] || normalized;
        },
      });

      const rows = parsed.data as Record<string, any>[];
      this.logger.log(`Parsed ${rows.length} ingredient rows for bulk import`);

      await this.updateOperationProgress(operation.id, {
        status: "PROCESSING",
        totalRecords: rows.length,
      });

      let successCount = 0;
      let errorCount = 0;
      const errors: Array<{ row: number; field?: string; error: string }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowIndex = i + 2; // 1-indexed + header

        try {
          const productSku = row.product_sku || row["رقم المنتج"];
          const ingredientName = row.ingredient_name || row["اسم المكون"];
          const ingredientSku = row.ingredient_sku || row["رقم المكون"];
          const quantityRequired = parseFloat(
            row.quantity_required || row["الكمية المطلوبة"] || "1",
          );
          const unit = row.unit || row["الوحدة"] || "piece";
          const isOptional = ["true", "1", "نعم"].includes(
            String(row.is_optional || row["اختياري"] || "false").toLowerCase(),
          );
          const wasteFactor = parseFloat(
            row.waste_factor || row["معامل الهدر"] || "1.0",
          );
          const notes = row.notes || row["ملاحظات"] || null;

          if (!productSku) {
            errors.push({
              row: rowIndex,
              field: "product_sku",
              error: "رقم المنتج مطلوب",
            });
            errorCount++;
            continue;
          }
          if (!ingredientName) {
            errors.push({
              row: rowIndex,
              field: "ingredient_name",
              error: "اسم المكون مطلوب",
            });
            errorCount++;
            continue;
          }

          if (options.dryRun) {
            successCount++;
            continue;
          }

          // Find the parent catalog item by SKU
          const catalogRes = await this.pool.query(
            `SELECT id FROM catalog_items WHERE sku = $1 AND merchant_id = $2`,
            [productSku, merchantId],
          );
          if (catalogRes.rows.length === 0) {
            errors.push({
              row: rowIndex,
              field: "product_sku",
              error: `المنتج ${productSku} غير موجود`,
            });
            errorCount++;
            continue;
          }
          const catalogItemId = catalogRes.rows[0].id;

          // Optionally find ingredient inventory item by SKU
          let ingredientInventoryItemId = null;
          if (ingredientSku) {
            const invRes = await this.pool.query(
              `SELECT id FROM inventory_items WHERE sku = $1 AND merchant_id = $2`,
              [ingredientSku, merchantId],
            );
            if (invRes.rows.length > 0) {
              ingredientInventoryItemId = invRes.rows[0].id;
            }
          }

          // Check if this ingredient already exists for this item (update if updateExisting)
          if (options.updateExisting) {
            const existing = await this.pool.query(
              `SELECT id FROM item_recipes WHERE catalog_item_id = $1 AND ingredient_name = $2 AND merchant_id = $3`,
              [catalogItemId, ingredientName, merchantId],
            );
            if (existing.rows.length > 0) {
              await this.pool.query(
                `UPDATE item_recipes SET quantity_required = $1, unit = $2, is_optional = $3, waste_factor = $4, notes = $5, ingredient_inventory_item_id = $6
                 WHERE id = $7`,
                [
                  quantityRequired,
                  unit,
                  isOptional,
                  wasteFactor,
                  notes,
                  ingredientInventoryItemId,
                  existing.rows[0].id,
                ],
              );
              successCount++;
              continue;
            }
          }

          // Insert new ingredient
          await this.pool.query(
            `INSERT INTO item_recipes (merchant_id, catalog_item_id, ingredient_inventory_item_id, ingredient_name, quantity_required, unit, is_optional, waste_factor, notes, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              merchantId,
              catalogItemId,
              ingredientInventoryItemId,
              ingredientName,
              quantityRequired,
              unit,
              isOptional,
              wasteFactor,
              notes,
              0,
            ],
          );

          // Mark catalog item as having a recipe
          await this.pool.query(
            `UPDATE catalog_items SET has_recipe = true, updated_at = NOW() WHERE id = $1 AND merchant_id = $2`,
            [catalogItemId, merchantId],
          );

          successCount++;
        } catch (err: any) {
          errors.push({ row: rowIndex, error: err.message });
          errorCount++;
        }

        if (i % 10 === 0) {
          await this.updateOperationProgress(operation.id, {
            processedRecords: i + 1,
            successCount,
            errorCount,
          });
        }
      }

      await this.completeOperation(operation.id, rows.length, errors);
      return (await this.getOperation(operation.id, merchantId))!;
    } catch (error: any) {
      await this.failOperation(operation.id, error.message);
      throw error;
    }
  }

  /**
   * Export recipe ingredients to CSV
   */
  async exportIngredients(
    merchantId: string,
    options: ExportOptions = {},
    staffId?: string,
  ): Promise<{ operation: BulkOperation; data: string }> {
    const operation = await this.createOperation(
      merchantId,
      "EXPORT",
      "products",
      options,
      staffId,
    );

    try {
      await this.updateOperationProgress(operation.id, {
        status: "PROCESSING",
      });

      const result = await this.pool.query(
        `SELECT r.ingredient_name, r.quantity_required, r.unit, r.is_optional, r.waste_factor, r.notes,
                ci.sku as product_sku, ci.name_ar as product_name,
                ii.sku as ingredient_sku
         FROM item_recipes r
         JOIN catalog_items ci ON ci.id = r.catalog_item_id
         LEFT JOIN inventory_items ii ON ii.id = r.ingredient_inventory_item_id
         WHERE r.merchant_id = $1
         ORDER BY ci.sku, r.sort_order`,
        [merchantId],
      );

      const rows = result.rows.map((row) => ({
        product_sku: row.product_sku,
        product_name: row.product_name,
        ingredient_name: row.ingredient_name,
        ingredient_sku: row.ingredient_sku || "",
        quantity_required: row.quantity_required,
        unit: row.unit,
        is_optional: row.is_optional ? "true" : "false",
        waste_factor: row.waste_factor,
        notes: row.notes || "",
      }));

      await this.updateOperationProgress(operation.id, {
        totalRecords: rows.length,
        processedRecords: rows.length,
        successCount: rows.length,
      });

      let data: string;
      if (options.format === "json") {
        data = JSON.stringify(rows, null, 2);
      } else {
        data = Papa.unparse(rows, { header: options.includeHeaders !== false });
      }

      await this.completeOperation(operation.id, rows.length, []);
      const completedOperation = await this.getOperation(
        operation.id,
        merchantId,
      );
      return { operation: completedOperation!, data };
    } catch (error: any) {
      await this.failOperation(operation.id, error.message);
      throw error;
    }
  }

  /**
   * Cleanup old completed operations (runs daily)
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupOldOperations(): Promise<void> {
    await this.pool.query(
      `DELETE FROM bulk_operations 
       WHERE status IN ('COMPLETED', 'FAILED', 'CANCELLED') 
       AND created_at < NOW() - INTERVAL '30 days'`,
    );
  }
}
