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
@Throttle({ default: { limit: 3, ttl: 60000 } }) // BL-002: 3 req/min per IP for unauthenticated public endpoints
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
    throw new BadRequestException(
      "Payment links are removed. Submit payment proofs through merchant review channels only.",
    );
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
    throw new BadRequestException(
      "Public payment-link proof submission is removed.",
    );
  }
}
