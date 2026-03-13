import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import sharp from "sharp";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import { VisionService } from "../llm/vision.service";
import { AuditService } from "./audit.service";
import { OutboxService } from "../events/outbox.service";
import { EVENT_TYPES } from "../events/event-types";
import { UsageGuardService } from "./usage-guard.service";

export interface PaymentLink {
  id: string;
  merchantId: string;
  orderId?: string;
  conversationId?: string;
  customerId?: string;
  linkCode: string;
  amount: number;
  currency: string;
  description?: string;
  status: "PENDING" | "VIEWED" | "PAID" | "EXPIRED" | "CANCELLED";
  viewedAt?: Date;
  paidAt?: Date;
  expiresAt: Date;
  customerPhone?: string;
  customerName?: string;
  allowedMethods: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentProof {
  id: string;
  merchantId: string;
  paymentLinkId?: string;
  orderId?: string;
  conversationId?: string;
  proofType: string;
  imageUrl?: string;
  referenceNumber?: string;
  ocrResult?: Record<string, unknown>;
  extractedAmount?: number;
  extractedReference?: string;
  extractedSender?: string;
  extractedDate?: Date;
  ocrConfidence?: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  verifiedAt?: Date;
  verifiedBy?: string;
  rejectionReason?: string;
  autoVerified: boolean; // retained for backward compatibility
  autoVerificationScore?: number;
  imagePhash?: string;
  duplicateOfProofId?: string;
  duplicateDistance?: number;
  riskScore?: number;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  riskFlags?: string[];
  manualReviewRequired?: boolean;
  reviewNotes?: string;
  reviewOutcome?: "APPROVED" | "REJECTED" | null;
  ocrProvider?: string;
  ocrGuaranteed?: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentLinkInput {
  merchantId: string;
  orderId?: string;
  conversationId?: string;
  customerId?: string;
  amount: number;
  currency?: string;
  description?: string;
  customerPhone?: string;
  customerName?: string;
  allowedMethods?: string[];
  expiresInHours?: number;
  metadata?: Record<string, unknown>;
}

export interface SubmitPaymentProofInput {
  merchantId: string;
  paymentLinkId?: string;
  orderId?: string;
  conversationId?: string;
  imageBase64?: string;
  imageUrl?: string;
  referenceNumber?: string;
  proofType?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentVerificationConfig {
  ocrConfidenceThreshold: number;
  amountTolerancePercent: number;
  requireReceiverMatch: boolean;
  allowedReceivers: string[];
  checkDuplicateReference: boolean;
}

export interface PaymentVerificationResult {
  canAutoApprove: boolean;
  score: number;
  checks: {
    ocrConfidence: { passed: boolean; value: number; threshold: number };
    amountMatch: {
      passed: boolean;
      extracted: number | null;
      expected: number | null;
      tolerance: number;
    };
    receiverMatch: {
      passed: boolean;
      extracted: string | null;
      allowed: string[];
    };
    duplicateCheck: {
      passed: boolean;
      isDuplicate: boolean;
      existingProofId?: string;
    };
  };
  reason?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly baseUrl: string;
  private readonly autoVerifyThreshold: number;
  private readonly amountTolerancePct: number;
  private readonly perceptualHashDistanceThreshold = 8;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly visionService: VisionService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly usageGuard: UsageGuardService,
  ) {
    this.baseUrl = this.configService.get<string>(
      "APP_URL",
      "https://tash8eel.app",
    );
    this.autoVerifyThreshold = parseFloat(
      this.configService.get<string>("PAYMENT_AUTO_VERIFY_THRESHOLD", "0.85"),
    );
    this.amountTolerancePct = parseFloat(
      this.configService.get<string>("PAYMENT_AMOUNT_TOLERANCE_PCT", "5"),
    );
  }

  /**
   * Verify payment proof with Egypt-ready rules
   * Auto-approve only when all conditions are met
   */
  async verifyPaymentProofEgypt(
    proof: PaymentProof,
    merchantId: string,
    expectedAmount?: number,
    merchantConfig?: PaymentVerificationConfig,
  ): Promise<PaymentVerificationResult> {
    const config: PaymentVerificationConfig = merchantConfig || {
      ocrConfidenceThreshold: this.autoVerifyThreshold,
      amountTolerancePercent: this.amountTolerancePct,
      requireReceiverMatch: false,
      allowedReceivers: [],
      checkDuplicateReference: true,
    };

    const result: PaymentVerificationResult = {
      canAutoApprove: true,
      score: 0,
      checks: {
        ocrConfidence: {
          passed: false,
          value: proof.ocrConfidence || 0,
          threshold: config.ocrConfidenceThreshold,
        },
        amountMatch: {
          passed: false,
          extracted: proof.extractedAmount || null,
          expected: expectedAmount || null,
          tolerance: config.amountTolerancePercent,
        },
        receiverMatch: {
          passed: !config.requireReceiverMatch,
          extracted: proof.extractedSender || null,
          allowed: config.allowedReceivers,
        },
        duplicateCheck: { passed: true, isDuplicate: false },
      },
    };

    // Check 1: OCR confidence
    if (
      proof.ocrConfidence &&
      proof.ocrConfidence >= config.ocrConfidenceThreshold
    ) {
      result.checks.ocrConfidence.passed = true;
      result.score += 30;
    } else {
      result.canAutoApprove = false;
      result.reason = "OCR confidence too low";
    }

    // Check 2: Amount match with tolerance
    if (expectedAmount && proof.extractedAmount) {
      const tolerance = expectedAmount * (config.amountTolerancePercent / 100);
      const diff = Math.abs(expectedAmount - proof.extractedAmount);
      if (diff <= tolerance) {
        result.checks.amountMatch.passed = true;
        result.score += 40;
      } else {
        result.canAutoApprove = false;
        result.reason =
          result.reason ||
          `Amount mismatch: expected ${expectedAmount}, got ${proof.extractedAmount}`;
      }
    } else if (expectedAmount) {
      result.canAutoApprove = false;
      result.reason = result.reason || "Could not extract amount from receipt";
    }

    // Check 3: Receiver match (for InstaPay/VodafoneCash)
    if (config.requireReceiverMatch && config.allowedReceivers.length > 0) {
      const receiverMatches = config.allowedReceivers.some((allowed) =>
        proof.extractedSender?.toLowerCase().includes(allowed.toLowerCase()),
      );
      if (receiverMatches) {
        result.checks.receiverMatch.passed = true;
        result.score += 15;
      } else {
        result.canAutoApprove = false;
        result.reason =
          result.reason || "Receiver does not match merchant account";
      }
    } else {
      result.score += 15; // Give points if not required
    }

    // Check 4: Duplicate reference check
    if (config.checkDuplicateReference && proof.extractedReference) {
      const duplicateCheck = await this.pool.query(
        `SELECT id FROM payment_proofs 
         WHERE merchant_id = $1 
         AND extracted_reference = $2 
         AND status = 'APPROVED'
         AND id != $3`,
        [merchantId, proof.extractedReference, proof.id],
      );
      if (duplicateCheck.rows.length > 0) {
        result.checks.duplicateCheck.passed = false;
        result.checks.duplicateCheck.isDuplicate = true;
        result.checks.duplicateCheck.existingProofId =
          duplicateCheck.rows[0].id;
        result.canAutoApprove = false;
        result.reason = result.reason || "Reference number already used";
      } else {
        result.score += 15;
      }
    } else {
      result.score += 15;
    }

    this.logger.log({
      msg: "Payment verification result",
      proofId: proof.id,
      canAutoApprove: result.canAutoApprove,
      score: result.score,
      reason: result.reason,
    });

    return result;
  }

  /**
   * Create a new payment link
   */
  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLink> {
    const {
      merchantId,
      orderId,
      conversationId,
      customerId,
      amount,
      currency = "EGP",
      description,
      customerPhone,
      customerName,
      allowedMethods = ["INSTAPAY", "BANK_TRANSFER", "VODAFONE_CASH"],
      expiresInHours = 24,
      metadata = {},
    } = input;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const result = await this.pool.query(
      `INSERT INTO payment_links (
        merchant_id, order_id, conversation_id, customer_id,
        amount, currency, description,
        customer_phone, customer_name, allowed_methods,
        expires_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        merchantId,
        orderId,
        conversationId,
        customerId,
        amount,
        currency,
        description,
        customerPhone,
        customerName,
        allowedMethods,
        expiresAt,
        JSON.stringify(metadata),
      ],
    );

    const link = this.mapPaymentLink(result.rows[0]);
    this.logger.log({
      msg: "Payment link created",
      correlationId: `link-${link.linkCode}`, // BL-006: trace full payment lifecycle with this ID
      linkCode: link.linkCode,
      merchantId,
      amount,
    });

    // Audit log
    await this.auditService
      .log({
        merchantId,
        action: "CREATE",
        resource: "PAYMENT_LINK",
        resourceId: link.id,
        newValues: { amount, currency, linkCode: link.linkCode, expiresAt },
        metadata: { orderId, conversationId, customerId },
      })
      .catch((err) =>
        this.logger.warn({ msg: "Audit log failed", error: err.message }),
      );

    return link;
  }

  /**
   * Get payment link by code (for customer view)
   */
  async getPaymentLinkByCode(linkCode: string): Promise<PaymentLink | null> {
    const result = await this.pool.query(
      "SELECT * FROM payment_links WHERE link_code = $1",
      [linkCode],
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Mark as viewed if first view
    const link = result.rows[0];
    if (link.status === "PENDING" && !link.viewed_at) {
      await this.pool.query(
        "UPDATE payment_links SET viewed_at = NOW(), status = $1 WHERE id = $2",
        ["VIEWED", link.id],
      );
      link.viewed_at = new Date();
      link.status = "VIEWED";
    }

    return this.mapPaymentLink(link);
  }

  /**
   * Get merchant payout details for customer payment page
   */
  async getMerchantPayoutDetails(merchantId: string): Promise<{
    merchantName: string;
    instapayAlias: string | null;
    vodafoneCashNumber: string | null;
    bankName: string | null;
    bankAccountHolder: string | null;
    bankAccount: string | null;
    bankIban: string | null;
    preferredMethod: "INSTAPAY" | "VODAFONE_CASH" | "BANK_TRANSFER";
  }> {
    const result = await this.pool.query(
      `SELECT name, 
              payout_instapay_alias, 
              payout_vodafone_cash,
              payout_bank_name,
              payout_bank_account_holder,
              payout_bank_account,
              payout_bank_iban,
              payout_preferred_method
       FROM merchants WHERE id = $1`,
      [merchantId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException("Merchant not found");
    }

    const m = result.rows[0];
    return {
      merchantName: m.name || "",
      instapayAlias: m.payout_instapay_alias || null,
      vodafoneCashNumber: m.payout_vodafone_cash || null,
      bankName: m.payout_bank_name || null,
      bankAccountHolder: m.payout_bank_account_holder || null,
      bankAccount: m.payout_bank_account || null,
      bankIban: m.payout_bank_iban || null,
      preferredMethod: m.payout_preferred_method || "INSTAPAY",
    };
  }

  /**
   * Get payment link by ID
   */
  async getPaymentLinkById(
    id: string,
    merchantId: string,
  ): Promise<PaymentLink | null> {
    const result = await this.pool.query(
      "SELECT * FROM payment_links WHERE id = $1 AND merchant_id = $2",
      [id, merchantId],
    );

    return result.rows.length > 0 ? this.mapPaymentLink(result.rows[0]) : null;
  }

  /**
   * List payment links for merchant
   */
  async listPaymentLinks(
    merchantId: string,
    options: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ links: PaymentLink[]; total: number }> {
    const { status, limit = 20, offset = 0 } = options;

    try {
      let query = "SELECT * FROM payment_links WHERE merchant_id = $1";
      const params: unknown[] = [merchantId];

      if (status) {
        query += " AND status = $2";
        params.push(status);
      }

      query +=
        " ORDER BY created_at DESC LIMIT $" +
        (params.length + 1) +
        " OFFSET $" +
        (params.length + 2);
      params.push(limit, offset);

      const result = await this.pool.query(query, params);

      // Get total count
      let countQuery =
        "SELECT COUNT(*) FROM payment_links WHERE merchant_id = $1";
      const countParams: unknown[] = [merchantId];
      if (status) {
        countQuery += " AND status = $2";
        countParams.push(status);
      }
      const countResult = await this.pool.query(countQuery, countParams);

      return {
        links: result.rows.map(this.mapPaymentLink),
        total: parseInt(countResult.rows[0].count, 10),
      };
    } catch (error: any) {
      if (error?.code === "42P01") {
        return { links: [], total: 0 };
      }
      throw error;
    }
  }

  /**
   * Cancel a payment link
   */
  async cancelPaymentLink(
    id: string,
    merchantId: string,
  ): Promise<PaymentLink> {
    const result = await this.pool.query(
      `UPDATE payment_links 
       SET status = 'CANCELLED', updated_at = NOW() 
       WHERE id = $1 AND merchant_id = $2 AND status IN ('PENDING', 'VIEWED')
       RETURNING *`,
      [id, merchantId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        "Payment link not found or cannot be cancelled",
      );
    }

    const link = this.mapPaymentLink(result.rows[0]);

    // Audit log
    await this.auditService
      .log({
        merchantId,
        action: "CANCEL",
        resource: "PAYMENT_LINK",
        resourceId: id,
        newValues: { status: "CANCELLED" },
        metadata: { linkCode: link.linkCode, amount: link.amount },
      })
      .catch((err) =>
        this.logger.warn({ msg: "Audit log failed", error: err.message }),
      );

    return link;
  }

  /**
   * Submit payment proof (with OCR processing and multi-method detection)
   */
  async submitPaymentProof(
    input: SubmitPaymentProofInput,
  ): Promise<PaymentProof> {
    const {
      merchantId,
      paymentLinkId,
      orderId,
      conversationId,
      imageBase64,
      imageUrl,
      referenceNumber,
      proofType: inputProofType,
      metadata = {},
    } = input;

    if (imageBase64 || imageUrl) {
      const usage = await this.usageGuard.consume(
        merchantId,
        "PAYMENT_PROOF_SCANS",
        1,
        {
          metadata: {
            source: "PAYMENT_PROOF_SUBMISSION",
          },
        },
      );
      if (!usage.allowed) {
        throw new BadRequestException(
          `Payment proof checks limit exceeded (${usage.used}/${usage.limit})`,
        );
      }
    }

    // Process image with OCR if provided
    let ocrResult: Record<string, unknown> | undefined;
    let extractedAmount: number | undefined;
    let extractedReference: string | undefined;
    let extractedSender: string | undefined;
    let extractedDate: string | undefined;
    let ocrConfidence: number | undefined;
    let detectedPaymentMethod: string | undefined;

    if (imageBase64) {
      // Security: validate base64 image size (max ~5MB decoded = ~6.67MB base64)
      const MAX_BASE64_LENGTH = 7_000_000;
      if (imageBase64.length > MAX_BASE64_LENGTH) {
        throw new BadRequestException("Image too large. Maximum 5MB.");
      }
      // Validate MIME prefix if present
      if (
        imageBase64.startsWith("data:") &&
        !imageBase64.startsWith("data:image/")
      ) {
        throw new BadRequestException(
          "Only image files are accepted as payment proof.",
        );
      }

      const ocrResponse =
        await this.visionService.processPaymentReceipt(imageBase64);
      if (ocrResponse.success && ocrResponse.receipt) {
        ocrResult = ocrResponse.extractedData;
        extractedAmount = ocrResponse.receipt.amount;
        extractedReference = ocrResponse.receipt.referenceNumber;
        extractedSender = ocrResponse.receipt.senderName;
        extractedDate = ocrResponse.receipt.date;
        ocrConfidence = ocrResponse.confidence;
        detectedPaymentMethod = ocrResponse.receipt.paymentMethod;
      }
    }

    // Determine final proof type: use input if specified, otherwise use OCR detection
    const proofType = inputProofType || detectedPaymentMethod || "UNKNOWN";
    const normalizedImageUrl =
      imageUrl ||
      (imageBase64
        ? imageBase64.startsWith("data:image/")
          ? imageBase64
          : `data:image/jpeg;base64,${imageBase64}`
        : null);

    const imageBuffer = await this.readProofImageBuffer(imageBase64, imageUrl);
    const imagePhash = imageBuffer
      ? await this.computePerceptualHash(imageBuffer).catch(() => null)
      : null;
    const duplicateHashMatch = imagePhash
      ? await this.findDuplicateByPerceptualHash(merchantId, imagePhash)
      : null;
    const duplicateReferenceMatch = extractedReference
      ? await this.findDuplicateByReference(merchantId, extractedReference)
      : null;

    const expectedAmount = await this.getExpectedAmount(paymentLinkId, orderId);
    const riskAssessment = this.evaluateProofRisk({
      ocrConfidence,
      extractedAmount,
      expectedAmount,
      extractedReference,
      hasImage: Boolean(imageBase64 || imageUrl),
      duplicateHashMatch,
      duplicateReferenceMatch,
      proofType,
    });

    // Hard product rule: OCR is advisory only and never guarantees verification.
    // Every proof starts as pending manual review.
    const status: "PENDING" = "PENDING";
    const autoVerified = false;
    const autoVerificationScore: number | null = null;

    const result = await this.pool.query(
      `INSERT INTO payment_proofs (
        merchant_id, payment_link_id, order_id, conversation_id,
        proof_type, image_url, reference_number,
        ocr_result, extracted_amount, extracted_reference, extracted_sender, extracted_date,
        ocr_confidence, status, auto_verified, auto_verification_score,
        image_phash, duplicate_of_proof_id, duplicate_distance,
        risk_score, risk_level, risk_flags, manual_review_required,
        ocr_provider, ocr_guaranteed, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25, $26
      )
      RETURNING *`,
      [
        merchantId,
        paymentLinkId,
        orderId,
        conversationId,
        proofType,
        normalizedImageUrl,
        referenceNumber || extractedReference,
        ocrResult ? JSON.stringify(ocrResult) : null,
        extractedAmount,
        extractedReference,
        extractedSender,
        extractedDate,
        ocrConfidence,
        status,
        autoVerified,
        autoVerificationScore,
        imagePhash,
        riskAssessment.duplicateOfProofId,
        riskAssessment.duplicateDistance,
        riskAssessment.riskScore,
        riskAssessment.riskLevel,
        JSON.stringify(riskAssessment.flags),
        true,
        ocrResult ? "OPENAI_VISION" : null,
        false,
        JSON.stringify(metadata),
      ],
    );

    const proof = this.mapPaymentProof(result.rows[0]);

    this.logger.log({
      msg: "Payment proof submitted",
      proofId: proof.id,
      merchantId,
      riskScore: riskAssessment.riskScore,
      riskLevel: riskAssessment.riskLevel,
      ocrConfidence,
    });

    // Audit log for proof submission
    await this.auditService
      .log({
        merchantId,
        action: "CREATE",
        resource: "PAYMENT_PROOF",
        resourceId: proof.id,
        newValues: {
          status,
          autoVerified: false,
          ocrConfidence,
          extractedAmount,
          extractedReference,
          riskScore: riskAssessment.riskScore,
          riskLevel: riskAssessment.riskLevel,
          riskFlags: riskAssessment.flags,
        },
        metadata: {
          paymentLinkId,
          orderId,
          conversationId,
          proofType,
          expectedAmount,
          duplicateByHash: riskAssessment.duplicateOfProofId || null,
          duplicateByReference: duplicateReferenceMatch || null,
        },
      })
      .catch((err) =>
        this.logger.warn({ msg: "Audit log failed", error: err.message }),
      );

    // Queue every proof for manual review.
    await this.outboxService
      .publishEvent({
        eventType: EVENT_TYPES.PAYMENT_PROOF_SUBMITTED,
        aggregateType: "payment_proof",
        aggregateId: proof.id,
        merchantId,
        correlationId: `proof-${proof.id}`,
        payload: {
          proofId: proof.id,
          merchantId,
          paymentLinkId,
          orderId,
          conversationId,
          extractedAmount,
          extractedReference,
          ocrConfidence,
          riskScore: riskAssessment.riskScore,
          riskLevel: riskAssessment.riskLevel,
          riskFlags: riskAssessment.flags,
          duplicateOfProofId: riskAssessment.duplicateOfProofId,
          duplicateDistance: riskAssessment.duplicateDistance,
          manualReviewRequired: true,
        },
      })
      .catch((err) =>
        this.logger.warn({ msg: "Outbox event failed", error: err.message }),
      );

    return proof;
  }

  /**
   * Verify/approve a payment proof (manual)
   */
  async verifyPaymentProof(
    proofId: string,
    merchantId: string,
    staffId: string,
    approved: boolean,
    rejectionReason?: string,
  ): Promise<PaymentProof> {
    const status = approved ? "APPROVED" : "REJECTED";

    const result = await this.pool.query(
      `UPDATE payment_proofs 
       SET status = $1,
           verified_at = NOW(),
           verified_by = $2,
           rejection_reason = $3,
           review_outcome = $1,
           reviewed_by_staff_id = $2,
           review_notes = $3,
           manual_review_required = false,
           updated_at = NOW()
       WHERE id = $4 AND merchant_id = $5 AND status = 'PENDING'
       RETURNING *`,
      [status, staffId, rejectionReason, proofId, merchantId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(
        "Payment proof not found or already processed",
      );
    }

    const proof = this.mapPaymentProof(result.rows[0]);

    // If approved, update payment link status
    if (approved && proof.paymentLinkId) {
      await this.markPaymentLinkAsPaid(proof.paymentLinkId, proof.id);
    }

    this.logger.log({
      msg: "Payment proof verified",
      proofId,
      approved,
      verifiedBy: staffId,
    });

    // Audit log
    await this.auditService
      .log({
        merchantId,
        staffId,
        action: approved ? "APPROVE" : "REJECT",
        resource: "PAYMENT_PROOF",
        resourceId: proofId,
        newValues: { status, rejectionReason },
        metadata: {
          paymentLinkId: proof.paymentLinkId,
          extractedAmount: proof.extractedAmount,
          ocrConfidence: proof.ocrConfidence,
        },
      })
      .catch((err) =>
        this.logger.warn({ msg: "Audit log failed", error: err.message }),
      );

    return proof;
  }

  /**
   * List pending payment proofs for merchant
   */
  async listPendingProofs(merchantId: string): Promise<PaymentProof[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM payment_proofs 
         WHERE merchant_id = $1 AND status = 'PENDING' 
         ORDER BY risk_score DESC NULLS LAST, created_at ASC`,
        [merchantId],
      );

      return result.rows.map(this.mapPaymentProof);
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get payment proof by ID
   */
  async getPaymentProofById(
    id: string,
    merchantId: string,
  ): Promise<PaymentProof | null> {
    const result = await this.pool.query(
      "SELECT * FROM payment_proofs WHERE id = $1 AND merchant_id = $2",
      [id, merchantId],
    );

    return result.rows.length > 0 ? this.mapPaymentProof(result.rows[0]) : null;
  }

  /**
   * Get public payment link URL
   */
  getPaymentLinkUrl(linkCode: string): string {
    return `${this.baseUrl}/pay/${linkCode}`;
  }

  // Private helpers
  private async getPaymentLinkByIdInternal(
    id: string,
  ): Promise<PaymentLink | null> {
    const result = await this.pool.query(
      "SELECT * FROM payment_links WHERE id = $1",
      [id],
    );
    return result.rows.length > 0 ? this.mapPaymentLink(result.rows[0]) : null;
  }

  private async markPaymentLinkAsPaid(
    linkId: string,
    proofId: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE payment_links 
       SET status = 'PAID', paid_at = NOW(), updated_at = NOW() 
       WHERE id = $1`,
      [linkId],
    );

    // Also update the order if linked
    await this.pool.query(
      `UPDATE orders 
       SET payment_status = 'PAID', payment_proof_id = $1, paid_at = NOW(), updated_at = NOW()
       WHERE id = (SELECT order_id FROM payment_links WHERE id = $2)`,
      [proofId, linkId],
    );
  }

  private async readProofImageBuffer(
    imageBase64?: string,
    imageUrl?: string,
  ): Promise<Buffer | null> {
    if (imageBase64) {
      const normalized = imageBase64.includes(",")
        ? imageBase64.split(",").pop() || ""
        : imageBase64;
      if (!normalized) return null;
      try {
        return Buffer.from(normalized, "base64");
      } catch {
        return null;
      }
    }

    if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
      try {
        const response = await fetch(imageUrl, {
          signal: AbortSignal.timeout(7000),
        });
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch {
        return null;
      }
    }

    return null;
  }

  private async computePerceptualHash(imageBuffer: Buffer): Promise<string> {
    const pixels = await sharp(imageBuffer)
      .rotate()
      .resize(9, 8, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();

    let bits = "";
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const left = pixels[y * 9 + x];
        const right = pixels[y * 9 + x + 1];
        bits += left > right ? "1" : "0";
      }
    }

    const chunked = bits.match(/.{1,4}/g) || [];
    return chunked
      .map((chunk) => Number.parseInt(chunk, 2).toString(16))
      .join("");
  }

  private hammingDistance(hashA: string, hashB: string): number {
    if (!hashA || !hashB || hashA.length !== hashB.length) {
      return Number.MAX_SAFE_INTEGER;
    }
    let distance = 0;
    for (let i = 0; i < hashA.length; i += 1) {
      const nibbleA = Number.parseInt(hashA[i], 16);
      const nibbleB = Number.parseInt(hashB[i], 16);
      const xor = nibbleA ^ nibbleB;
      distance += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
    }
    return distance;
  }

  private async findDuplicateByPerceptualHash(
    merchantId: string,
    hash: string,
  ): Promise<{ proofId: string; distance: number } | null> {
    try {
      const result = await this.pool.query(
        `SELECT id, image_phash
         FROM payment_proofs
         WHERE merchant_id = $1
           AND image_phash IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 300`,
        [merchantId],
      );

      let best: { proofId: string; distance: number } | null = null;
      for (const row of result.rows) {
        const candidate = String(row.image_phash || "");
        if (!candidate) continue;
        const distance = this.hammingDistance(hash, candidate);
        if (distance > this.perceptualHashDistanceThreshold) continue;
        if (!best || distance < best.distance) {
          best = { proofId: String(row.id), distance };
        }
      }
      return best;
    } catch {
      return null;
    }
  }

  private async findDuplicateByReference(
    merchantId: string,
    reference: string,
  ): Promise<string | null> {
    if (!reference) return null;
    try {
      const result = await this.pool.query(
        `SELECT id
         FROM payment_proofs
         WHERE merchant_id = $1
           AND extracted_reference = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [merchantId, reference],
      );
      return result.rows[0]?.id ? String(result.rows[0].id) : null;
    } catch {
      return null;
    }
  }

  private async getExpectedAmount(
    paymentLinkId?: string,
    orderId?: string,
  ): Promise<number | null> {
    if (paymentLinkId) {
      try {
        const link = await this.getPaymentLinkByIdInternal(paymentLinkId);
        if (link?.amount !== undefined && link?.amount !== null) {
          return Number(link.amount);
        }
      } catch {
        // continue fallback
      }
    }
    if (orderId) {
      try {
        const result = await this.pool.query(
          `SELECT total FROM orders WHERE id = $1 LIMIT 1`,
          [orderId],
        );
        if (result.rows[0]?.total !== undefined) {
          const value = Number(result.rows[0].total);
          return Number.isFinite(value) ? value : null;
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  private evaluateProofRisk(input: {
    ocrConfidence?: number;
    extractedAmount?: number;
    expectedAmount?: number | null;
    extractedReference?: string;
    hasImage: boolean;
    duplicateHashMatch: { proofId: string; distance: number } | null;
    duplicateReferenceMatch: string | null;
    proofType?: string;
  }): {
    riskScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    flags: string[];
    duplicateOfProofId: string | null;
    duplicateDistance: number | null;
  } {
    const flags: string[] = [];
    let score = 0;

    if (!input.hasImage) {
      score += 35;
      flags.push("MISSING_IMAGE");
    }

    const confidence = Number(input.ocrConfidence || 0);
    if (confidence <= 0) {
      score += 25;
      flags.push("NO_OCR_CONFIDENCE");
    } else if (confidence < 0.5) {
      score += 35;
      flags.push("LOW_OCR_CONFIDENCE");
    } else if (confidence < 0.75) {
      score += 15;
      flags.push("MEDIUM_OCR_CONFIDENCE");
    }

    if (input.expectedAmount != null) {
      if (input.extractedAmount == null) {
        score += 25;
        flags.push("AMOUNT_NOT_EXTRACTED");
      } else {
        const expected = Number(input.expectedAmount);
        const extracted = Number(input.extractedAmount);
        const diff = Math.abs(expected - extracted);
        const ratio = expected > 0 ? (diff / expected) * 100 : 0;
        if (ratio > 10) {
          score += 40;
          flags.push("AMOUNT_MISMATCH_HIGH");
        } else if (ratio > 5) {
          score += 20;
          flags.push("AMOUNT_MISMATCH_MEDIUM");
        }
      }
    }

    if (input.duplicateHashMatch) {
      if (input.duplicateHashMatch.distance <= 3) {
        score += 65;
        flags.push("DUPLICATE_IMAGE_EXACT_OR_NEAR");
      } else {
        score += 45;
        flags.push("DUPLICATE_IMAGE_POSSIBLE");
      }
    }

    if (input.duplicateReferenceMatch) {
      score += 40;
      flags.push("DUPLICATE_REFERENCE");
    }

    if (!input.proofType || input.proofType === "UNKNOWN") {
      score += 10;
      flags.push("PROOF_TYPE_UNKNOWN");
    }

    let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    if (score >= 70) riskLevel = "HIGH";
    else if (score >= 35) riskLevel = "MEDIUM";

    return {
      riskScore: Math.min(100, Math.max(0, Math.round(score))),
      riskLevel,
      flags: Array.from(new Set(flags)),
      duplicateOfProofId: input.duplicateHashMatch?.proofId || null,
      duplicateDistance: input.duplicateHashMatch?.distance ?? null,
    };
  }

  private mapPaymentLink(row: Record<string, unknown>): PaymentLink {
    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      orderId: row.order_id as string | undefined,
      conversationId: row.conversation_id as string | undefined,
      customerId: row.customer_id as string | undefined,
      linkCode: row.link_code as string,
      amount: parseFloat(row.amount as string),
      currency: row.currency as string,
      description: row.description as string | undefined,
      status: row.status as PaymentLink["status"],
      viewedAt: row.viewed_at ? new Date(row.viewed_at as string) : undefined,
      paidAt: row.paid_at ? new Date(row.paid_at as string) : undefined,
      expiresAt: new Date(row.expires_at as string),
      customerPhone: row.customer_phone as string | undefined,
      customerName: row.customer_name as string | undefined,
      allowedMethods: row.allowed_methods as string[],
      metadata: (row.metadata as Record<string, unknown>) || {},
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private mapPaymentProof(row: Record<string, unknown>): PaymentProof {
    const toOptionalNumber = (value: unknown): number | undefined => {
      if (value === null || value === undefined || value === "")
        return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    return {
      id: row.id as string,
      merchantId: row.merchant_id as string,
      paymentLinkId: row.payment_link_id as string | undefined,
      orderId: row.order_id as string | undefined,
      conversationId: row.conversation_id as string | undefined,
      proofType: row.proof_type as string,
      imageUrl: row.image_url as string | undefined,
      referenceNumber: row.reference_number as string | undefined,
      ocrResult: row.ocr_result as Record<string, unknown> | undefined,
      extractedAmount: toOptionalNumber(row.extracted_amount),
      extractedReference: row.extracted_reference as string | undefined,
      extractedSender: row.extracted_sender as string | undefined,
      extractedDate: row.extracted_date
        ? new Date(row.extracted_date as string)
        : undefined,
      ocrConfidence: toOptionalNumber(row.ocr_confidence),
      status: row.status as PaymentProof["status"],
      verifiedAt: row.verified_at
        ? new Date(row.verified_at as string)
        : undefined,
      verifiedBy: row.verified_by as string | undefined,
      rejectionReason: row.rejection_reason as string | undefined,
      autoVerified: row.auto_verified as boolean,
      autoVerificationScore: toOptionalNumber(row.auto_verification_score),
      imagePhash: row.image_phash as string | undefined,
      duplicateOfProofId: row.duplicate_of_proof_id as string | undefined,
      duplicateDistance: toOptionalNumber(row.duplicate_distance),
      riskScore: toOptionalNumber(row.risk_score),
      riskLevel: (row.risk_level as PaymentProof["riskLevel"]) || undefined,
      riskFlags: Array.isArray(row.risk_flags)
        ? (row.risk_flags as string[])
        : typeof row.risk_flags === "string"
          ? (() => {
              try {
                const parsed = JSON.parse(row.risk_flags as string);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          : [],
      manualReviewRequired:
        row.manual_review_required === null ||
        row.manual_review_required === undefined
          ? undefined
          : Boolean(row.manual_review_required),
      reviewNotes: row.review_notes as string | undefined,
      reviewOutcome:
        (row.review_outcome as PaymentProof["reviewOutcome"]) || undefined,
      ocrProvider: row.ocr_provider as string | undefined,
      ocrGuaranteed:
        row.ocr_guaranteed === null || row.ocr_guaranteed === undefined
          ? undefined
          : Boolean(row.ocr_guaranteed),
      metadata: (row.metadata as Record<string, unknown>) || {},
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
