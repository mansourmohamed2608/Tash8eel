import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiParam,
  ApiBody,
} from "@nestjs/swagger";
import {
  PaymentService,
  SubmitPaymentProofInput,
} from "../../application/services/payment.service";
import { MerchantApiKeyGuard } from "../../shared/guards/merchant-api-key.guard";
import {
  EntitlementGuard,
  RequiresFeature,
} from "../../shared/guards/entitlement.guard";
import { MerchantId } from "../../shared/decorators/merchant-id.decorator";
import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";

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
  approved!: boolean;

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
      staffId ?? "",
      dto.approved,
      dto.rejectionReason,
    );
  }
}
