import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Logger,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from "@nestjs/swagger";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import {
  PaymentService,
  SubmitPaymentProofInput,
} from "../../application/services/payment.service";
import { IsOptional, IsString, IsObject, MaxLength } from "class-validator";

/**
 * Maximum allowed base64 image size: ~5MB decoded (≈6.67MB base64).
 * This prevents denial-of-service via oversized payloads.
 */
const MAX_BASE64_LENGTH = 7_000_000; // ~5MB decoded

class PublicSubmitProofDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_BASE64_LENGTH)
  imageBase64?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  proofType?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * Public Payments Controller
 *
 * These endpoints are customer-facing and do NOT require authentication.
 * Customers access them via payment link codes (unguessable, time-limited).
 *
 * Security model:
 * - Link codes are 8+ char random tokens — not sequential IDs
 * - Links expire (configurable, default 72h)
 * - Proof submissions are rate-limited by IP at the infrastructure level
 * - Image payloads are size-limited to prevent abuse
 */
@ApiTags("Public Payments")
@Controller("v1/payments")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute for public endpoints
export class PublicPaymentsController {
  private readonly logger = new Logger(PublicPaymentsController.name);
  private static readonly PROOF_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
  private static readonly PROOF_UPLOAD_OPTIONS = {
    storage: memoryStorage(),
    limits: { fileSize: PublicPaymentsController.PROOF_UPLOAD_LIMIT_BYTES },
    fileFilter: (
      _req: any,
      file: Express.Multer.File,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      if (
        typeof file?.mimetype === "string" &&
        file.mimetype.startsWith("image/")
      ) {
        cb(null, true);
        return;
      }
      cb(new BadRequestException("Only image files are allowed."), false);
    },
  };

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Customer views payment link details (public, no auth).
   * Returns merchant payout info so customer knows where to send money.
   */
  @Get("pay/:code")
  @ApiOperation({ summary: "View payment link details (public, for customer)" })
  @ApiParam({
    name: "code",
    description: "Payment link code (e.g., PAY-XXXXXX)",
  })
  @ApiResponse({
    status: 200,
    description: "Payment link details with merchant payout info",
  })
  @ApiResponse({ status: 404, description: "Payment link not found" })
  async viewPaymentLink(@Param("code") code: string) {
    // Validate code format (prevent injection / abuse)
    if (
      !code ||
      code.length < 4 ||
      code.length > 50 ||
      !/^[A-Za-z0-9_-]+$/.test(code)
    ) {
      throw new NotFoundException("Payment link not found");
    }

    const link = await this.paymentService.getPaymentLinkByCode(code);
    if (!link) {
      throw new NotFoundException("Payment link not found");
    }

    // Check if expired
    if (link.status === "PENDING" || link.status === "VIEWED") {
      if (new Date() > link.expiresAt) {
        return { ...link, status: "EXPIRED", isExpired: true };
      }
    }

    // Get merchant payout details for the customer to use
    const payoutDetails = await this.paymentService.getMerchantPayoutDetails(
      link.merchantId,
    );

    return {
      linkCode: link.linkCode,
      amount: link.amount,
      currency: link.currency,
      description: link.description,
      status: link.status,
      expiresAt: link.expiresAt,
      customerName: link.customerName,
      allowedMethods: link.allowedMethods,
      isPaid: link.status === "PAID",
      isExpired: new Date() > link.expiresAt,
      payoutDetails: {
        instapay: payoutDetails.instapayAlias
          ? { alias: payoutDetails.instapayAlias }
          : null,
        vodafoneCash: payoutDetails.vodafoneCashNumber
          ? { number: payoutDetails.vodafoneCashNumber }
          : null,
        bankTransfer: payoutDetails.bankName
          ? {
              bankName: payoutDetails.bankName,
              accountHolder: payoutDetails.bankAccountHolder,
              accountNumber: payoutDetails.bankAccount,
              iban: payoutDetails.bankIban,
            }
          : null,
        preferredMethod: payoutDetails.preferredMethod,
        merchantName: payoutDetails.merchantName,
      },
      proofInstructionAr:
        "بعد التحويل ابعت صورة/سكرينشوت للإيصال هنا للتأكيد ✅",
    };
  }

  /**
   * Customer submits payment proof for a payment link (public, no auth).
   * The link code acts as the authorization token.
   */
  @Post("pay/:code/proof")
  @UseInterceptors(
    FileInterceptor(
      "proofImage",
      PublicPaymentsController.PROOF_UPLOAD_OPTIONS,
    ),
  )
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Stricter: 5 proof submissions per minute
  @ApiOperation({ summary: "Submit payment proof for a payment link (public)" })
  @ApiParam({ name: "code", description: "Payment link code" })
  @ApiConsumes("application/json", "multipart/form-data")
  @ApiBody({ type: PublicSubmitProofDto })
  @ApiResponse({ status: 201, description: "Proof submitted" })
  @ApiResponse({ status: 404, description: "Payment link not found" })
  @ApiResponse({
    status: 400,
    description: "Link expired/cancelled or invalid payload",
  })
  async submitProofForLink(
    @Param("code") code: string,
    @Body() dto: PublicSubmitProofDto,
    @UploadedFile() proofImage?: Express.Multer.File,
  ) {
    // Validate code format
    if (
      !code ||
      code.length < 4 ||
      code.length > 50 ||
      !/^[A-Za-z0-9_-]+$/.test(code)
    ) {
      throw new NotFoundException("Payment link not found");
    }

    const uploadedImageBase64 = proofImage?.buffer?.length
      ? `data:${proofImage.mimetype || "image/jpeg"};base64,${proofImage.buffer.toString("base64")}`
      : undefined;
    const imageBase64 = dto.imageBase64 || uploadedImageBase64;

    // Validate base64 image if provided — prevent size bombs
    if (imageBase64) {
      if (imageBase64.length > MAX_BASE64_LENGTH) {
        throw new BadRequestException("Image too large. Maximum 5MB.");
      }
      // Basic MIME validation: must start with data:image/ or be raw base64
      if (
        imageBase64.startsWith("data:") &&
        !imageBase64.startsWith("data:image/")
      ) {
        throw new BadRequestException("Only image files are allowed.");
      }
    }

    // Validate imageUrl if provided — prevent SSRF
    if (dto.imageUrl) {
      try {
        const url = new URL(dto.imageUrl);
        if (!["http:", "https:"].includes(url.protocol)) {
          throw new BadRequestException("Invalid image URL protocol.");
        }
        // Block private IPs
        const hostname = url.hostname.toLowerCase();
        if (
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname === "0.0.0.0" ||
          hostname.startsWith("10.") ||
          hostname.startsWith("192.168.") ||
          hostname === "::1" ||
          hostname.startsWith("169.254.")
        ) {
          throw new BadRequestException("Invalid image URL.");
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException("Invalid image URL format.");
      }
    }

    const link = await this.paymentService.getPaymentLinkByCode(code);
    if (!link) {
      throw new NotFoundException("Payment link not found");
    }

    if (link.status === "PAID") {
      return { message: "تم تأكيد الدفع لهذا الرابط بالفعل" };
    }

    if (link.status === "CANCELLED" || new Date() > link.expiresAt) {
      throw new BadRequestException("رابط الدفع منتهي الصلاحية أو ملغي");
    }

    const input: SubmitPaymentProofInput = {
      ...dto,
      imageBase64,
      merchantId: link.merchantId,
      paymentLinkId: link.id,
      orderId: link.orderId,
      conversationId: link.conversationId,
    };

    this.logger.log({
      msg: "Public proof submission",
      linkCode: code,
      proofType: dto.proofType,
      hasImage: !!imageBase64,
      hasRef: !!dto.referenceNumber,
    });

    return this.paymentService.submitPaymentProof(input);
  }
}
