import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Inject,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { Pool } from "pg";
import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

/**
 * Merchant API Key Guard
 *
 * Validates merchant API keys for authenticated endpoints.
 * The API key should be passed in the X-API-Key header.
 *
 * Supports multiple API key formats:
 * - tash8eel_<random_32_chars> (production format, hashed)
 * - mkey_<random_chars> (demo/development format, plain)
 * - demo-token-<timestamp> (NextAuth demo tokens)
 */
@Injectable()
export class MerchantApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(MerchantApiKeyGuard.name);

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers["x-api-key"] as string;
    const authHeader = request.headers["authorization"] as string;

    // Check for Bearer token (staff JWT via NextAuth)
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      // Handle demo tokens from NextAuth - ONLY in development
      const isDev = process.env.NODE_ENV !== "production";
      if (isDev && token.startsWith("demo-token-")) {
        const merchantResult = await this.pool.query<{ id: string }>(
          `SELECT id FROM merchants WHERE id = 'demo-merchant' AND is_active = true`,
        );

        if (merchantResult.rows.length > 0) {
          const demoMerchantId = merchantResult.rows[0].id;
          (request as any).merchantId = demoMerchantId;

          // Look up a real staff member for this merchant (UUID required for DB queries)
          const staffResult = await this.pool.query<{
            id: string;
            role: string;
          }>(
            `SELECT id, role FROM merchant_staff WHERE merchant_id = $1 AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1`,
            [demoMerchantId],
          );
          if (staffResult.rows.length > 0) {
            (request as any).staffId = staffResult.rows[0].id;
            (request as any).staffRole = staffResult.rows[0].role || "OWNER";
          } else {
            (request as any).staffId = null;
            (request as any).staffRole = "OWNER";
          }

          this.assertMerchantScope(request, demoMerchantId);
          return true;
        }
      } else if (!isDev && token.startsWith("demo-token-")) {
        // Reject demo tokens in production
        throw new UnauthorizedException(
          "Demo tokens are not allowed in production.",
        );
      } else {
        const jwtSecret = this.configService.get<string>("JWT_SECRET");
        if (!jwtSecret || jwtSecret.length < 16) {
          throw new UnauthorizedException("JWT authentication not configured.");
        }

        try {
          const payload = jwt.verify(token, jwtSecret) as any;
          const staffId = payload?.staffId;
          const tokenMerchantId = payload?.merchantId;

          if (!staffId || !tokenMerchantId) {
            throw new UnauthorizedException("Invalid token payload.");
          }

          const staffResult = await this.pool.query<{
            id: string;
            merchant_id: string;
            status: string;
            role: string;
            updated_at: Date;
          }>(
            `SELECT id, merchant_id, status, role, updated_at 
             FROM merchant_staff 
             WHERE id = $1`,
            [staffId],
          );

          if (staffResult.rows.length === 0) {
            throw new UnauthorizedException("Staff not found.");
          }

          const staff = staffResult.rows[0];
          if (staff.status !== "ACTIVE") {
            throw new UnauthorizedException("Staff account is inactive.");
          }

          // Reject tokens issued before last password change or security event
          if (payload.iat && staff.updated_at) {
            const updatedAt = new Date(staff.updated_at).getTime();
            const issuedAt = payload.iat * 1000;
            if (issuedAt < updatedAt) {
              throw new UnauthorizedException(
                "Token invalidated by security event. Please log in again.",
              );
            }
          }

          const staffMerchantId = staff.merchant_id;
          (request as any).merchantId = staffMerchantId;
          (request as any).staffId = staff.id;
          (request as any).staffRole = staff.role;
          this.assertMerchantScope(request, staffMerchantId);
          return true;
        } catch (error) {
          throw new UnauthorizedException("Invalid or expired token.");
        }
      }
    }

    if (!apiKey) {
      throw new UnauthorizedException(
        "Missing API key. Provide X-API-Key header.",
      );
    }

    // Support multiple API key formats
    const isProductionFormat =
      apiKey.startsWith("tash8eel_") && apiKey.length >= 40;
    const isDemoFormat = apiKey.startsWith("mkey_") && apiKey.length >= 20;
    const isLegacyFormat = apiKey.startsWith("mk_") && apiKey.length >= 20;

    if (!isProductionFormat && !isDemoFormat && !isLegacyFormat) {
      throw new UnauthorizedException("Invalid API key format.");
    }

    // For demo/legacy formats, check direct api_key column on merchants table first
    if (isDemoFormat || isLegacyFormat) {
      const directResult = await this.pool.query<{
        id: string;
        is_active: boolean;
      }>(`SELECT id, is_active FROM merchants WHERE api_key = $1`, [apiKey]);

      if (directResult.rows.length > 0) {
        const merchant = directResult.rows[0];

        if (!merchant.is_active) {
          throw new UnauthorizedException("Merchant account is disabled.");
        }

        const merchantId = merchant.id;
        (request as any).merchantId = merchantId;
        (request as any).apiKeyScopes = ["*"]; // Full access for direct API keys
        this.assertMerchantScope(request, merchantId);
        return true;
      }
    }

    // Production format: Hash the API key and look up in merchant_api_keys table
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    // Look up the API key in the database
    const result = await this.pool.query<{
      merchant_id: string;
      is_active: boolean;
      expires_at: Date | null;
      scopes: string[];
    }>(
      `SELECT merchant_id, is_active, expires_at, scopes 
       FROM merchant_api_keys 
       WHERE key_hash = $1`,
      [keyHash],
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException("Invalid API key.");
    }

    const apiKeyRecord = result.rows[0];

    // Check if the key is active
    if (!apiKeyRecord.is_active) {
      throw new UnauthorizedException("API key is disabled.");
    }

    // Check if the key has expired
    if (
      apiKeyRecord.expires_at &&
      new Date() > new Date(apiKeyRecord.expires_at)
    ) {
      throw new UnauthorizedException("API key has expired.");
    }

    // Update last used timestamp (non-blocking)
    this.pool
      .query(
        `UPDATE merchant_api_keys SET last_used_at = NOW() WHERE key_hash = $1`,
        [keyHash],
      )
      .catch((e) =>
        this.logger.warn(`Failed to update API key last_used_at: ${e.message}`),
      );

    // Attach merchant info to the request for downstream use
    const merchantId = apiKeyRecord.merchant_id;
    (request as any).merchantId = merchantId;
    (request as any).apiKeyScopes = apiKeyRecord.scopes;

    this.assertMerchantScope(request, merchantId);
    return true;
  }

  private assertMerchantScope(request: Request, merchantId: string): void {
    const paramsId = request.params?.merchantId;
    const queryValue = (request.query as any)?.merchantId;
    const queryId = Array.isArray(queryValue) ? queryValue[0] : queryValue;
    const bodyAny = request.body as any;
    const bodyId = bodyAny?.merchantId || bodyAny?.merchant_id;

    const provided = paramsId || queryId || bodyId;
    if (provided && provided !== merchantId) {
      throw new ForbiddenException("Merchant scope mismatch.");
    }
  }
}

/**
 * Decorator to extract merchant ID from request
 * Use with @MerchantId() decorator in controller methods
 */
export function getMerchantIdFromRequest(request: Request): string | undefined {
  return (request as any).merchantId;
}

/**
 * Utility function to generate a new API key
 */
export function generateApiKey(): {
  key: string;
  hash: string;
  prefix: string;
} {
  const randomPart = crypto.randomBytes(24).toString("base64url");
  const key = `tash8eel_${randomPart}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.substring(0, 12);

  return { key, hash, prefix };
}
