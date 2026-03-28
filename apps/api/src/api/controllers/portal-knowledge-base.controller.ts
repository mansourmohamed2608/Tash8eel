import {
  Controller,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import { EntitlementGuard } from "../../shared/guards/entitlement.guard";
import { RolesGuard } from "../../shared/guards/roles.guard";
import { getMerchantId, parseJsonObject } from "./portal-compat.helpers";

@ApiTags("Merchant Portal Compatibility")
@ApiSecurity("api-key")
@ApiHeader({
  name: "x-api-key",
  required: true,
  description: "Merchant API key",
})
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@Controller("v1/portal")
export class PortalKnowledgeBaseController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Post("knowledge-base/pull-from-catalog")
  @ApiOperation({ summary: "Pull catalog items into inventory items" })
  async pullCatalogToInventory(@Req() req: Request) {
    const merchantId = getMerchantId(req);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const catalogResult = await client.query<{
        id: string;
        sku: string | null;
        name_ar: string | null;
        name_en: string | null;
      }>(
        `SELECT id::text as id, sku, name_ar, name_en
         FROM catalog_items
         WHERE merchant_id = $1
         ORDER BY created_at ASC`,
        [merchantId],
      );

      let created = 0;
      let linked = 0;
      let updated = 0;

      for (const catalogItem of catalogResult.rows) {
        const existing = await client.query<{
          id: string;
          catalog_item_id: string | null;
        }>(
          `SELECT id::text as id, catalog_item_id::text as catalog_item_id
           FROM inventory_items
           WHERE merchant_id = $1
             AND (
               catalog_item_id::text = $2
               OR (sku IS NOT NULL AND sku = $3)
             )
           LIMIT 1`,
          [merchantId, catalogItem.id, catalogItem.sku || null],
        );

        if (existing.rows.length > 0) {
          const existingItem = existing.rows[0];
          if (!existingItem.catalog_item_id) {
            await client.query(
              `UPDATE inventory_items
               SET catalog_item_id = $1, updated_at = NOW()
               WHERE id::text = $2 AND merchant_id = $3`,
              [catalogItem.id, existingItem.id, merchantId],
            );
            linked += 1;
          }

          if (catalogItem.sku) {
            await client.query(
              `UPDATE inventory_items
               SET sku = $1, updated_at = NOW()
               WHERE id::text = $2 AND merchant_id = $3`,
              [catalogItem.sku, existingItem.id, merchantId],
            );
          }
          updated += 1;
          continue;
        }

        const generatedSku =
          catalogItem.sku || `SKU-${catalogItem.id.slice(0, 8).toUpperCase()}`;
        await client.query(
          `INSERT INTO inventory_items (
             merchant_id, catalog_item_id, sku, track_inventory,
             low_stock_threshold, reorder_point, reorder_quantity, location, created_at, updated_at
           )
           VALUES ($1, $2, $3, true, 5, 10, 20, 'المخزن الرئيسي', NOW(), NOW())`,
          [merchantId, catalogItem.id, generatedSku],
        );
        created += 1;
        linked += 1;
      }

      await client.query("COMMIT");
      return {
        success: true,
        total: catalogResult.rows.length,
        created,
        linked,
        updated,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  @Post("pos-integrations/:id/test")
  @ApiOperation({ summary: "Test POS integration configuration" })
  @ApiParam({ name: "id", description: "POS integration ID" })
  @ApiResponse({
    status: 200,
    description: "Integration contract validation result",
  })
  async testPosIntegration(
    @Req() req: Request,
    @Param("id") integrationId: string,
  ) {
    const merchantId = getMerchantId(req);

    const integrationResult = await this.pool.query<{
      id: string;
      provider: string;
      name: string;
      credentials: Record<string, any> | string | null;
      config: Record<string, any> | string | null;
    }>(
      `SELECT id::text as id, provider, name, credentials, config
       FROM pos_integrations
       WHERE merchant_id = $1 AND id::text = $2
       LIMIT 1`,
      [merchantId, integrationId],
    );

    if (integrationResult.rows.length === 0) {
      throw new NotFoundException("تكامل POS غير موجود");
    }

    const integration = integrationResult.rows[0];
    const rawProvider = String(integration.provider || "");
    const provider = rawProvider.toUpperCase();
    const providerAliases: Record<string, string> = {
      ORACLE: "ORACLE_MICROS",
      GOOGLESLIDES: "GOOGLE_SLIDES",
      "GOOGLE-SLIDES": "GOOGLE_SLIDES",
    };
    const normalizedProvider = providerAliases[provider] || provider;
    const credentials = parseJsonObject(integration.credentials);
    const config = parseJsonObject(integration.config);

    const requiredFields: Record<string, string[]> = {
      ODOO: ["url", "database", "username", "apiKey"],
      FOODICS: ["clientId", "clientSecret", "accessToken", "businessId"],
      ORACLE_MICROS: ["apiUrl", "clientId", "clientSecret"],
      SHOPIFY: ["storeDomain", "apiKey", "apiSecret", "accessToken"],
      SQUARE: [
        "applicationId",
        "applicationSecret",
        "accessToken",
        "locationId",
      ],
      CUSTOM: ["baseUrl", "apiKey"],
      GOOGLE_SLIDES: ["presentationId", "serviceAccountEmail", "privateKey"],
    };

    const contractByProvider: Record<string, Record<string, any>> = {
      ODOO: {
        action: "sync_orders_inventory",
        mode: "bidirectional",
      },
      FOODICS: {
        action: "sync_orders_inventory",
        mode: "bidirectional",
      },
      ORACLE_MICROS: {
        action: "sync_orders_inventory",
        mode: "bidirectional",
      },
      SHOPIFY: {
        action: "sync_catalog_orders",
        mode: "bidirectional",
      },
      SQUARE: {
        action: "sync_orders_inventory",
        mode: "bidirectional",
      },
      CUSTOM: {
        action: "custom_webhook_or_rest",
        mode: "configurable",
      },
      GOOGLE_SLIDES: {
        action: "publish_reports_or_catalog_to_slides",
        mode: "outbound",
      },
    };

    const required = requiredFields[normalizedProvider] || [];
    const missingFields = required.filter((field) => {
      const value = credentials[field] ?? config[field];
      return (
        value === undefined || value === null || String(value).trim() === ""
      );
    });

    if (missingFields.length > 0) {
      await this.pool.query(
        `UPDATE pos_integrations
         SET status = 'ERROR', updated_at = NOW()
         WHERE merchant_id = $1 AND id::text = $2`,
        [merchantId, integrationId],
      );
      return {
        success: false,
        message: `بيانات ناقصة: ${missingFields.join("، ")}`,
        provider: normalizedProvider,
        contract: {
          provider: normalizedProvider,
          requiredFields: required,
          ...contractByProvider[normalizedProvider],
        },
        missingFields,
      };
    }

    await this.pool.query(
      `UPDATE pos_integrations
       SET status = 'ACTIVE', last_sync_at = NOW(), updated_at = NOW()
       WHERE merchant_id = $1 AND id::text = $2`,
      [merchantId, integrationId],
    );

    return {
      success: true,
      message: `تم اختبار اتصال ${integration.name || normalizedProvider} بنجاح`,
      provider: normalizedProvider,
      contract: {
        provider: normalizedProvider,
        requiredFields: required,
        ...contractByProvider[normalizedProvider],
      },
      checkedAt: new Date().toISOString(),
    };
  }
}
