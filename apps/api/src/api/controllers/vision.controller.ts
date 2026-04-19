import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiBody,
} from "@nestjs/swagger";
import { VisionService } from "../../application/llm/vision.service";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { RolesGuard, RequireRole } from "../../shared/guards/roles.guard";
import { ProcessReceiptDto } from "../dto/vision.dto";
import {
  EnhancedRateLimitGuard,
  RateLimit,
} from "../../shared/guards/rate-limit.guard";

@ApiTags("Vision/OCR")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, RolesGuard, EntitlementGuard)
@RequireRole("AGENT") // BL-003: only AGENT+ staff (not VIEWER) may submit images to Vision OCR
@RequiresFeature("PAYMENTS") // Payment proof OCR — only active use case
@Controller("v1/vision")
export class VisionController {
  private readonly logger = new Logger(VisionController.name);

  constructor(private readonly visionService: VisionService) {}

  @Post("receipt")
  @UseGuards(EnhancedRateLimitGuard)
  @RateLimit({ limit: 10, window: 60, keyType: "merchant" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Process payment receipt",
    description:
      "OCR-assisted extraction for WhatsApp payment proof verification",
  })
  @ApiBody({ type: ProcessReceiptDto })
  @ApiResponse({ status: 200, description: "Receipt processed successfully" })
  @ApiResponse({
    status: 400,
    description: "Invalid image or processing failed",
  })
  async processReceipt(@Body() dto: ProcessReceiptDto) {
    this.logger.log("Processing payment receipt");
    const result = await this.visionService.processPaymentReceipt(
      dto.imageBase64,
    );
    return result;
  }

  /**
   * BL-010: Wire classifyPaymentProof as a first-class endpoint.
   * Useful when the caller only needs to know the payment method (INSTAPAY,
   * VODAFONE_CASH, etc.) without spending tokens on full receipt extraction.
   */
  @Post("classify")
  @UseGuards(EnhancedRateLimitGuard)
  @RateLimit({ limit: 10, window: 60, keyType: "merchant" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Classify payment proof — detect payment method only",
    description:
      "Returns the detected payment method, confidence score, and key indicators. " +
      "Cheaper than /receipt when full extraction is not required.",
  })
  @ApiBody({ type: ProcessReceiptDto })
  @ApiResponse({ status: 200, description: "Payment method classified" })
  @ApiResponse({ status: 400, description: "Classification failed" })
  async classifyPaymentProof(@Body() dto: ProcessReceiptDto) {
    this.logger.log("Classifying payment proof");
    const result = await this.visionService.classifyPaymentProof(
      dto.imageBase64,
    );
    return result;
  }
}
