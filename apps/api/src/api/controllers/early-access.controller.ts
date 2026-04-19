import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { MerchantAuth } from "../../shared/guards/merchant-auth.guard";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiSecurity,
} from "@nestjs/swagger";
import { AdminApiKeyGuard } from "../../shared/guards/admin-api-key.guard";

interface EarlyAccessSignup {
  id: string;
  merchantId: string;
  featureKey: string;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@ApiTags("Early Access")
@Controller()
export class EarlyAccessController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get("merchants/:merchantId/early-access")
  @MerchantAuth()
  @ApiOperation({ summary: "Get all early access signups for a merchant" })
  async getSignups(
    @Param("merchantId") merchantId: string,
  ): Promise<{ signups: EarlyAccessSignup[] }> {
    const result = await this.pool.query(
      `SELECT id, merchant_id, feature_key, email, phone, status, notes, created_at, updated_at
       FROM early_access_waitlist
       WHERE merchant_id = $1
       ORDER BY created_at DESC`,
      [merchantId],
    );

    const signups = result.rows.map((row) => ({
      id: row.id,
      merchantId: row.merchant_id,
      featureKey: row.feature_key,
      email: row.email,
      phone: row.phone,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { signups };
  }

  @Post("merchants/:merchantId/early-access")
  @MerchantAuth()
  @ApiOperation({ summary: "Sign up for early access to a feature" })
  @ApiResponse({ status: 201, description: "Signed up successfully" })
  async signup(
    @Param("merchantId") merchantId: string,
    @Body()
    body: {
      featureKey: string;
      email?: string;
      phone?: string;
      notes?: string;
    },
  ): Promise<EarlyAccessSignup> {
    if (!body.featureKey) {
      throw new BadRequestException("featureKey is required");
    }

    if (!body.email && !body.phone) {
      throw new BadRequestException("Either email or phone is required");
    }

    // Upsert - update if exists, insert if not
    const result = await this.pool.query(
      `INSERT INTO early_access_waitlist (merchant_id, feature_key, email, phone, notes, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (merchant_id, feature_key) 
       DO UPDATE SET 
         email = COALESCE(EXCLUDED.email, early_access_waitlist.email),
         phone = COALESCE(EXCLUDED.phone, early_access_waitlist.phone),
         notes = COALESCE(EXCLUDED.notes, early_access_waitlist.notes),
         status = 'pending',
         updated_at = NOW()
       RETURNING id, merchant_id, feature_key, email, phone, status, notes, created_at, updated_at`,
      [
        merchantId,
        body.featureKey,
        body.email || null,
        body.phone || null,
        body.notes || null,
      ],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      merchantId: row.merchant_id,
      featureKey: row.feature_key,
      email: row.email,
      phone: row.phone,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  @Post("merchants/:merchantId/early-access/toggle")
  @MerchantAuth()
  @ApiOperation({
    summary: "Toggle early access for a feature (subscribe/unsubscribe)",
  })
  async toggle(
    @Param("merchantId") merchantId: string,
    @Body()
    body: {
      featureKey: string;
      enabled: boolean;
      email?: string;
      phone?: string;
    },
  ): Promise<{ enabled: boolean; signup?: EarlyAccessSignup }> {
    if (!body.featureKey) {
      throw new BadRequestException("featureKey is required");
    }

    if (body.enabled) {
      // Sign up
      const result = await this.pool.query(
        `INSERT INTO early_access_waitlist (merchant_id, feature_key, email, phone, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (merchant_id, feature_key) 
         DO UPDATE SET status = 'pending', updated_at = NOW()
         RETURNING id, merchant_id, feature_key, email, phone, status, notes, created_at, updated_at`,
        [merchantId, body.featureKey, body.email || null, body.phone || null],
      );

      const row = result.rows[0];
      return {
        enabled: true,
        signup: {
          id: row.id,
          merchantId: row.merchant_id,
          featureKey: row.feature_key,
          email: row.email,
          phone: row.phone,
          status: row.status,
          notes: row.notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    } else {
      // Unsubscribe - set status to cancelled
      await this.pool.query(
        `UPDATE early_access_waitlist 
         SET status = 'cancelled', updated_at = NOW()
         WHERE merchant_id = $1 AND feature_key = $2`,
        [merchantId, body.featureKey],
      );
      return { enabled: false };
    }
  }

  @Delete("merchants/:merchantId/early-access/:featureKey")
  @MerchantAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove early access signup" })
  async remove(
    @Param("merchantId") merchantId: string,
    @Param("featureKey") featureKey: string,
  ): Promise<void> {
    await this.pool.query(
      `DELETE FROM early_access_waitlist WHERE merchant_id = $1 AND feature_key = $2`,
      [merchantId, featureKey],
    );
  }

  // Admin endpoint to get all waitlist signups
  @Get("admin/early-access")
  @UseGuards(AdminApiKeyGuard)
  @ApiSecurity("admin-api-key")
  @ApiHeader({
    name: "x-admin-api-key",
    required: true,
    description: "Admin API key",
  })
  @ApiOperation({ summary: "Get all early access signups (admin)" })
  async getAllSignups(
    @Query("featureKey") featureKey?: string,
    @Query("status") status?: string,
  ): Promise<{ signups: EarlyAccessSignup[]; total: number }> {
    let query = `
      SELECT id, merchant_id, feature_key, email, phone, status, notes, created_at, updated_at
      FROM early_access_waitlist
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (featureKey) {
      query += ` AND feature_key = $${paramIndex++}`;
      params.push(featureKey);
    }
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.pool.query(query, params);

    const signups = result.rows.map((row) => ({
      id: row.id,
      merchantId: row.merchant_id,
      featureKey: row.feature_key,
      email: row.email,
      phone: row.phone,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { signups, total: signups.length };
  }
}
