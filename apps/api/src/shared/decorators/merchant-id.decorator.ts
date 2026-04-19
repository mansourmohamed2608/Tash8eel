import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Extracts the merchant ID from the request object.
 * The merchant ID is set by the MerchantApiKeyGuard after validating the API key.
 *
 * Usage:
 * @Get('endpoint')
 * @UseGuards(MerchantApiKeyGuard)
 * async myMethod(@MerchantId() merchantId: string) {
 *   // merchantId is now available
 * }
 */
export const MerchantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.merchantId;
  },
);
