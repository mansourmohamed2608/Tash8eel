import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiQuery,
  ApiParam,
  ApiBody,
} from "@nestjs/swagger";
import {
  PaymentService,
  CreatePaymentLinkInput,
  SubmitPaymentProofInput,
} from "../../application/services/payment.service";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { MerchantId } from "../../shared/decorators/merchant-id.decorator";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

class CreatePaymentLinkDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsArray()
  allowedMethods?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresInHours?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class SubmitProofDto {
  @IsOptional()
  @IsString()
  paymentLinkId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  imageBase64?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  proofType?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class VerifyProofDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

@ApiTags("Payments")
@ApiSecurity("x-api-key")
@UseGuards(MerchantApiKeyGuard, EntitlementGuard)
@RequiresFeature("PAYMENTS")
@Controller("v1/payments")
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentService: PaymentService) {}

  // ==================== Payment Links ====================

  @Post("links")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a payment link" })
  @ApiBody({ type: CreatePaymentLinkDto })
  @ApiResponse({ status: 201, description: "Payment link created" })
  async createPaymentLink(
    @MerchantId() merchantId: string,
    @Body() dto: CreatePaymentLinkDto,
  ) {
    const input: CreatePaymentLinkInput = { ...dto, merchantId };
    const link = await this.paymentService.createPaymentLink(input);

    return {
      ...link,
      paymentUrl: this.paymentService.getPaymentLinkUrl(link.linkCode),
    };
  }

  @Get("links")
  @ApiOperation({ summary: "List payment links for merchant" })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["PENDING", "VIEWED", "PAID", "EXPIRED", "CANCELLED"],
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  async listPaymentLinks(
    @MerchantId() merchantId: string,
    @Query("status") status?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ) {
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 20;
    const safeOffset = Number.isFinite(Number(offset)) ? Number(offset) : 0;
    const result = await this.paymentService.listPaymentLinks(merchantId, {
      status,
      limit: safeLimit,
      offset: safeOffset,
    });
    return {
      links: result.links.map((link) => ({
        ...link,
        paymentUrl: this.paymentService.getPaymentLinkUrl(link.linkCode),
      })),
      total: result.total,
    };
  }

  @Get("links/:id")
  @ApiOperation({ summary: "Get payment link by ID" })
  @ApiParam({ name: "id", description: "Payment link ID" })
  async getPaymentLink(
    @MerchantId() merchantId: string,
    @Param("id") id: string,
  ) {
    const link = await this.paymentService.getPaymentLinkById(id, merchantId);
    if (!link) {
      throw new NotFoundException("Payment link not found");
    }
    return {
      ...link,
      paymentUrl: this.paymentService.getPaymentLinkUrl(link.linkCode),
    };
  }

  @Delete("links/:id")
  @ApiOperation({ summary: "Cancel a payment link" })
  @ApiParam({ name: "id", description: "Payment link ID" })
  async cancelPaymentLink(
    @MerchantId() merchantId: string,
    @Param("id") id: string,
  ) {
    return this.paymentService.cancelPaymentLink(id, merchantId);
  }

  // NOTE: Public payment link view endpoint moved to PublicPaymentsController
  // (no auth required for customer-facing payment pages)

  // ==================== Payment Proofs ====================

  @Post("proofs")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Submit payment proof",
    description:
      "Submit payment proof with receipt image or reference number. OCR will auto-extract payment details.",
  })
  @ApiBody({ type: SubmitProofDto })
  async submitPaymentProof(
    @MerchantId() merchantId: string,
    @Body() dto: SubmitProofDto,
  ) {
    const input: SubmitPaymentProofInput = { ...dto, merchantId };
    return this.paymentService.submitPaymentProof(input);
  }

  // NOTE: Public proof submission endpoint moved to PublicPaymentsController
  // (no auth required for customer-facing proof uploads)

  @Get("proofs/pending")
  @ApiOperation({
    summary: "List pending payment proofs awaiting verification",
  })
  async listPendingProofs(@MerchantId() merchantId: string) {
    return this.paymentService.listPendingProofs(merchantId);
  }

  @Get("proofs/:id")
  @ApiOperation({ summary: "Get payment proof by ID" })
  @ApiParam({ name: "id", description: "Payment proof ID" })
  async getPaymentProof(
    @MerchantId() merchantId: string,
    @Param("id") id: string,
  ) {
    const proof = await this.paymentService.getPaymentProofById(id, merchantId);
    if (!proof) {
      throw new NotFoundException("Payment proof not found");
    }
    return proof;
  }

  @Put("proofs/:id/verify")
  @ApiOperation({ summary: "Verify/approve or reject a payment proof" })
  @ApiParam({ name: "id", description: "Payment proof ID" })
  @ApiBody({ type: VerifyProofDto })
  async verifyPaymentProof(
    @MerchantId() merchantId: string,
    @Param("id") id: string,
    @Body() dto: VerifyProofDto,
    @Query("staffId") staffId: string = "system",
  ) {
    return this.paymentService.verifyPaymentProof(
      id,
      merchantId,
      staffId,
      dto.approved,
      dto.rejectionReason,
    );
  }
}
