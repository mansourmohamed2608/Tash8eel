import { applyDecorators, UseGuards } from "@nestjs/common";
import { MerchantApiKeyGuard } from "./merchant-api-key.guard";

/**
 * Merchant Authentication Decorator
 *
 * Combines the MerchantApiKeyGuard for protecting merchant-only endpoints.
 * Use this decorator on controller methods that require merchant authentication.
 *
 * @example
 * @Get('merchants/:merchantId/analytics')
 * @MerchantAuth()
 * async getAnalytics(@Param('merchantId') merchantId: string) {
 *   // Only authenticated merchants can access this
 * }
 */
export function MerchantAuth() {
  return applyDecorators(UseGuards(MerchantApiKeyGuard));
}
