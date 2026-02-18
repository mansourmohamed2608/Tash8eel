import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";
import {
  ICustomerRepository,
  CUSTOMER_REPOSITORY,
} from "../../domain/ports/customer.repository";

export interface LoyaltyTier {
  id: string;
  merchantId: string;
  name: string;
  nameAr: string;
  minPoints: number;
  discountPercentage: number;
  freeShipping: boolean;
  prioritySupport: boolean;
  exclusiveAccess: boolean;
  multiplier: number;
  color: string;
  icon: string;
}

export interface CustomerPoints {
  id: string;
  merchantId: string;
  customerId: string;
  currentPoints: number;
  lifetimePoints: number;
  tier: LoyaltyTier | null;
  pointsExpiringAt?: Date;
  lastActivityAt: Date;
}

export interface PointsTransaction {
  id: string;
  customerId: string;
  type: "EARN" | "REDEEM" | "EXPIRE" | "ADJUST" | "BONUS";
  points: number;
  balanceAfter: number;
  source: string;
  referenceId?: string;
  description?: string;
  createdAt: Date;
}

export interface AddPointsDto {
  customerId: string;
  points: number;
  type: "EARN" | "REDEEM" | "ADJUST" | "BONUS";
  source: string;
  referenceId?: string;
  description?: string;
  expiresInDays?: number;
}

export interface Promotion {
  id: string;
  merchantId: string;
  name: string;
  nameAr?: string;
  description?: string;
  type:
    | "PERCENTAGE"
    | "FIXED_AMOUNT"
    | "FREE_SHIPPING"
    | "BUY_X_GET_Y"
    | "POINTS_MULTIPLIER";
  value: number;
  code?: string;
  autoApply: boolean;
  minOrderAmount: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usagePerCustomer: number;
  currentUsage: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}

export interface CreatePromotionDto {
  name: string;
  nameAr?: string;
  description?: string;
  type: Promotion["type"];
  value: number;
  code?: string;
  autoApply?: boolean;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usagePerCustomer?: number;
  startDate: Date;
  endDate: Date;
  applicableProducts?: string[];
  excludedProducts?: string[];
  tierRestriction?: string[];
}

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);
  // Points earned per currency unit (e.g., 1 point per 10 EGP)
  private readonly pointsPerCurrency = 0.1;
  // Default points expiration in days
  private readonly defaultExpirationDays = 365;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepo: ICustomerRepository,
  ) {}

  // ==================== LOYALTY TIERS ====================

  async getTiers(merchantId: string): Promise<LoyaltyTier[]> {
    const result = await this.pool.query(
      `SELECT id, merchant_id, name, name_ar, min_points, discount_percentage,
              free_shipping, priority_support, exclusive_access, multiplier, color, icon
       FROM loyalty_tiers
       WHERE merchant_id = $1
       ORDER BY min_points ASC`,
      [merchantId],
    );

    return result.rows.map(this.mapTier);
  }

  async createTier(
    merchantId: string,
    data: Partial<LoyaltyTier>,
  ): Promise<LoyaltyTier> {
    const result = await this.pool.query(
      `INSERT INTO loyalty_tiers (
        merchant_id, name, name_ar, min_points, discount_percentage,
        free_shipping, priority_support, exclusive_access, multiplier, color, icon
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        merchantId,
        data.name,
        data.nameAr,
        data.minPoints || 0,
        data.discountPercentage || 0,
        data.freeShipping || false,
        data.prioritySupport || false,
        data.exclusiveAccess || false,
        data.multiplier || 1.0,
        data.color || "#6B7280",
        data.icon || "star",
      ],
    );

    return this.mapTier(result.rows[0]);
  }

  async initializeDefaultTiers(merchantId: string): Promise<void> {
    await this.pool.query("SELECT create_default_loyalty_tiers($1)", [
      merchantId,
    ]);
  }

  // ==================== CUSTOMER POINTS ====================

  async getCustomerPoints(
    merchantId: string,
    customerId: string,
  ): Promise<CustomerPoints | null> {
    const result = await this.pool.query(
      `SELECT cp.*, lt.id as tier_id, lt.name as tier_name, lt.name_ar as tier_name_ar,
              lt.min_points as tier_min_points, lt.discount_percentage as tier_discount,
              lt.free_shipping as tier_free_shipping, lt.multiplier as tier_multiplier,
              lt.color as tier_color, lt.icon as tier_icon
       FROM customer_points cp
       LEFT JOIN loyalty_tiers lt ON cp.tier_id = lt.id
       WHERE cp.merchant_id = $1 AND cp.customer_id = $2`,
      [merchantId, customerId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      merchantId: row.merchant_id,
      customerId: row.customer_id,
      currentPoints: row.current_points,
      lifetimePoints: row.lifetime_points,
      tier: row.tier_id
        ? {
            id: row.tier_id,
            merchantId: row.merchant_id,
            name: row.tier_name,
            nameAr: row.tier_name_ar,
            minPoints: row.tier_min_points,
            discountPercentage: parseFloat(row.tier_discount),
            freeShipping: row.tier_free_shipping,
            prioritySupport: false,
            exclusiveAccess: false,
            multiplier: parseFloat(row.tier_multiplier),
            color: row.tier_color,
            icon: row.tier_icon,
          }
        : null,
      pointsExpiringAt: row.points_expiring_at,
      lastActivityAt: row.last_activity_at,
    };
  }

  async addPoints(
    merchantId: string,
    dto: AddPointsDto,
  ): Promise<CustomerPoints> {
    const expiresAt = dto.expiresInDays
      ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
      : dto.type === "EARN"
        ? new Date(
            Date.now() + this.defaultExpirationDays * 24 * 60 * 60 * 1000,
          )
        : null;

    await this.pool.query(
      `SELECT add_customer_points($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        merchantId,
        dto.customerId,
        dto.points,
        dto.type,
        dto.source,
        dto.referenceId || null,
        dto.description || null,
        expiresAt,
      ],
    );

    const points = await this.getCustomerPoints(merchantId, dto.customerId);
    return points!;
  }

  async redeemPoints(
    merchantId: string,
    customerId: string,
    points: number,
    orderId?: string,
  ): Promise<CustomerPoints> {
    const current = await this.getCustomerPoints(merchantId, customerId);

    if (!current || current.currentPoints < points) {
      throw new BadRequestException("Insufficient points");
    }

    return this.addPoints(merchantId, {
      customerId,
      points: -points,
      type: "REDEEM",
      source: "ORDER_REDEMPTION",
      referenceId: orderId,
      description: `Redeemed ${points} points`,
    });
  }

  async earnPointsFromOrder(
    merchantId: string,
    customerId: string,
    orderAmount: number,
    orderId: string,
  ): Promise<CustomerPoints> {
    // Get customer tier for multiplier
    const current = await this.getCustomerPoints(merchantId, customerId);
    const multiplier = current?.tier?.multiplier || 1.0;

    const basePoints = Math.floor(orderAmount * this.pointsPerCurrency);
    const earnedPoints = Math.floor(basePoints * multiplier);

    return this.addPoints(merchantId, {
      customerId,
      points: earnedPoints,
      type: "EARN",
      source: "ORDER",
      referenceId: orderId,
      description: `Earned from order (${multiplier}x multiplier)`,
    });
  }

  async getPointsHistory(
    merchantId: string,
    customerId: string,
    limit = 50,
  ): Promise<PointsTransaction[]> {
    const result = await this.pool.query(
      `SELECT id, customer_id, type, points, balance_after, source,
              reference_id, description, created_at
       FROM points_transactions
       WHERE merchant_id = $1 AND customer_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [merchantId, customerId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      type: row.type,
      points: row.points,
      balanceAfter: row.balance_after,
      source: row.source,
      referenceId: row.reference_id,
      description: row.description,
      createdAt: row.created_at,
    }));
  }

  // ==================== MEMBERSHIP ====================

  async enrollMember(
    merchantId: string,
    payload: { phone: string; name?: string },
  ): Promise<{
    customerId: string;
    phone: string;
    name?: string | null;
    tierName?: string | null;
  }> {
    const phone = payload.phone?.replace(/\s/g, "");
    if (!phone) {
      throw new BadRequestException("رقم الهاتف مطلوب.");
    }

    let customer = await this.customerRepo.findByPhone(merchantId, phone);
    if (!customer) {
      customer = await this.customerRepo.create({
        merchantId,
        senderId: phone,
        phone,
        name: payload.name,
      });
    } else if (!customer.phone) {
      await this.customerRepo.update(customer.id, { phone });
    }

    await this.pool.query(
      `INSERT INTO customer_points (merchant_id, customer_id, current_points, lifetime_points)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (merchant_id, customer_id) DO NOTHING`,
      [merchantId, customer.id],
    );

    await this.pool.query(
      `UPDATE customer_points
       SET tier_id = calculate_customer_tier($1, lifetime_points), updated_at = NOW()
       WHERE merchant_id = $1 AND customer_id = $2`,
      [merchantId, customer.id],
    );

    const tierResult = await this.pool.query(
      `SELECT lt.name as tier_name
       FROM customer_points cp
       LEFT JOIN loyalty_tiers lt ON cp.tier_id = lt.id
       WHERE cp.merchant_id = $1 AND cp.customer_id = $2`,
      [merchantId, customer.id],
    );

    return {
      customerId: customer.id,
      phone: customer.phone || phone,
      name: customer.name || payload.name || null,
      tierName: tierResult.rows[0]?.tier_name || null,
    };
  }

  // ==================== PROMOTIONS ====================

  async createPromotion(
    merchantId: string,
    dto: CreatePromotionDto,
    staffId?: string,
  ): Promise<Promotion> {
    // Generate code if not provided
    const code = dto.code || (dto.autoApply ? null : this.generatePromoCode());

    const result = await this.pool.query(
      `INSERT INTO promotions (
        merchant_id, name, name_ar, description, type, value, code,
        auto_apply, min_order_amount, max_discount_amount,
        usage_limit, usage_per_customer, start_date, end_date,
        applicable_products, excluded_products, tier_restriction, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        merchantId,
        dto.name,
        dto.nameAr,
        dto.description,
        dto.type,
        dto.value,
        code,
        dto.autoApply || false,
        dto.minOrderAmount || 0,
        dto.maxDiscountAmount,
        dto.usageLimit,
        dto.usagePerCustomer || 1,
        dto.startDate,
        dto.endDate,
        JSON.stringify(dto.applicableProducts || []),
        JSON.stringify(dto.excludedProducts || []),
        dto.tierRestriction || null,
        staffId,
      ],
    );

    const promotion = this.mapPromotion(result.rows[0]);
    await this.syncPromotionsToKnowledgeBase(merchantId).catch((e) =>
      this.logger.warn(`KB sync after promo creation failed: ${e.message}`),
    );
    return promotion;
  }

  async getPromotions(
    merchantId: string,
    activeOnly = false,
  ): Promise<Promotion[]> {
    let query = `SELECT * FROM promotions WHERE merchant_id = $1`;
    const params: any[] = [merchantId];

    if (activeOnly) {
      query += ` AND is_active = true AND start_date <= NOW() AND end_date >= NOW()`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map(this.mapPromotion);
  }

  async getPromotion(
    merchantId: string,
    promotionId: string,
  ): Promise<Promotion | null> {
    const result = await this.pool.query(
      `SELECT * FROM promotions WHERE merchant_id = $1 AND id = $2`,
      [merchantId, promotionId],
    );

    return result.rows.length > 0 ? this.mapPromotion(result.rows[0]) : null;
  }

  async validatePromoCode(
    merchantId: string,
    code: string,
    customerId: string,
    orderAmount: number,
  ): Promise<{
    valid: boolean;
    promotion?: Promotion;
    discount?: number;
    message?: string;
  }> {
    const result = await this.pool.query(
      `SELECT * FROM promotions 
       WHERE merchant_id = $1 AND UPPER(code) = UPPER($2)
         AND is_active = true AND start_date <= NOW() AND end_date >= NOW()`,
      [merchantId, code],
    );

    if (result.rows.length === 0) {
      return { valid: false, message: "كود الخصم غير صالح" };
    }

    const promo = this.mapPromotion(result.rows[0]);

    // Check usage limits
    if (promo.usageLimit && promo.currentUsage >= promo.usageLimit) {
      return { valid: false, message: "تم استنفاد كود الخصم" };
    }

    // Check per-customer usage
    const usageResult = await this.pool.query(
      `SELECT COUNT(*) FROM promotion_usage 
       WHERE promotion_id = $1 AND customer_id = $2`,
      [promo.id, customerId],
    );

    if (parseInt(usageResult.rows[0].count) >= promo.usagePerCustomer) {
      return { valid: false, message: "لقد استخدمت هذا الكود من قبل" };
    }

    // Check minimum order amount
    if (orderAmount < promo.minOrderAmount) {
      return {
        valid: false,
        message: `الحد الأدنى للطلب ${promo.minOrderAmount} جنيه`,
      };
    }

    // Calculate discount
    let discount = 0;
    switch (promo.type) {
      case "PERCENTAGE":
        discount = orderAmount * (promo.value / 100);
        if (promo.maxDiscountAmount) {
          discount = Math.min(discount, promo.maxDiscountAmount);
        }
        break;
      case "FIXED_AMOUNT":
        discount = Math.min(promo.value, orderAmount);
        break;
      case "FREE_SHIPPING":
        discount = 0; // Handled separately
        break;
    }

    return { valid: true, promotion: promo, discount };
  }

  async applyPromotion(
    merchantId: string,
    promotionId: string,
    customerId: string,
    orderId: string,
    discountAmount: number,
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Record usage
      await client.query(
        `INSERT INTO promotion_usage (promotion_id, merchant_id, customer_id, order_id, discount_amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [promotionId, merchantId, customerId, orderId, discountAmount],
      );

      // Update usage count
      await client.query(
        `UPDATE promotions SET current_usage = current_usage + 1 WHERE id = $1`,
        [promotionId],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deactivatePromotion(
    merchantId: string,
    promotionId: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE promotions SET is_active = false, updated_at = NOW()
       WHERE merchant_id = $1 AND id = $2`,
      [merchantId, promotionId],
    );
    await this.syncPromotionsToKnowledgeBase(merchantId).catch((e) =>
      this.logger.warn(`KB sync after promo deactivation failed: ${e.message}`),
    );
  }

  async activatePromotion(
    merchantId: string,
    promotionId: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE promotions SET is_active = true, updated_at = NOW()
       WHERE merchant_id = $1 AND id = $2`,
      [merchantId, promotionId],
    );
    await this.syncPromotionsToKnowledgeBase(merchantId).catch((e) =>
      this.logger.warn(`KB sync after promo activation failed: ${e.message}`),
    );
  }

  // ==================== REFERRALS ====================

  async generateReferralCode(
    merchantId: string,
    customerId: string,
  ): Promise<string> {
    // Check if customer already has a referral code
    const existing = await this.pool.query(
      `SELECT referral_code FROM customer_referrals
       WHERE merchant_id = $1 AND referrer_customer_id = $2
       LIMIT 1`,
      [merchantId, customerId],
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].referral_code;
    }

    const code = this.generatePromoCode();

    await this.pool.query(
      `INSERT INTO customer_referrals (merchant_id, referrer_customer_id, referred_customer_id, referral_code, status)
       VALUES ($1, $2, $2, $3, 'PENDING')`,
      [merchantId, customerId, code],
    );

    return code;
  }

  async processReferral(
    merchantId: string,
    referralCode: string,
    newCustomerId: string,
    referrerPoints = 100,
    referredPoints = 50,
  ): Promise<void> {
    const referral = await this.pool.query(
      `SELECT * FROM customer_referrals
       WHERE merchant_id = $1 AND referral_code = $2 AND status = 'PENDING'`,
      [merchantId, referralCode],
    );

    if (referral.rows.length === 0) {
      return; // Invalid or used referral code
    }

    const referrerId = referral.rows[0].referrer_customer_id;

    if (referrerId === newCustomerId) {
      return; // Can't refer yourself
    }

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      // Award points to referrer
      await this.addPoints(merchantId, {
        customerId: referrerId,
        points: referrerPoints,
        type: "BONUS",
        source: "REFERRAL",
        referenceId: newCustomerId,
        description: "نقاط إحالة صديق",
      });

      // Award points to new customer
      await this.addPoints(merchantId, {
        customerId: newCustomerId,
        points: referredPoints,
        type: "BONUS",
        source: "REFERRAL",
        referenceId: referrerId,
        description: "مكافأة الانضمام عبر إحالة",
      });

      // Update referral status
      await client.query(
        `UPDATE customer_referrals 
         SET referred_customer_id = $1, status = 'COMPLETED', completed_at = NOW(),
             referrer_points = $2, referred_points = $3
         WHERE merchant_id = $4 AND referral_code = $5`,
        [
          newCustomerId,
          referrerPoints,
          referredPoints,
          merchantId,
          referralCode,
        ],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ==================== ANALYTICS ====================

  async getLoyaltyMembers(
    merchantId: string,
    page = 1,
    limit = 50,
  ): Promise<{
    members: Array<{
      customerId: string;
      customerPhone: string;
      customerName: string | null;
      currentPoints: number;
      lifetimePoints: number;
      tierName: string | null;
      lastActivityAt: Date;
      createdAt: Date;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const offset = (page - 1) * limit;

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM customer_points WHERE merchant_id = $1`,
      [merchantId],
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await this.pool.query(
      `SELECT 
         cp.customer_id,
         c.phone as customer_phone,
         c.name as customer_name,
         cp.current_points, cp.lifetime_points, COALESCE(lt.name_ar, lt.name) as tier_name,
         cp.last_activity_at, cp.created_at
       FROM customer_points cp
       LEFT JOIN loyalty_tiers lt ON cp.tier_id = lt.id
       LEFT JOIN customers c ON cp.customer_id = c.id
       WHERE cp.merchant_id = $1
       ORDER BY cp.lifetime_points DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, limit, offset],
    );

    return {
      members: result.rows.map((row) => ({
        customerId: row.customer_id,
        customerPhone: row.customer_phone,
        customerName: row.customer_name,
        currentPoints: parseInt(row.current_points) || 0,
        lifetimePoints: parseInt(row.lifetime_points) || 0,
        tierName: row.tier_name,
        lastActivityAt: row.last_activity_at,
        createdAt: row.created_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async syncPromotionsToKnowledgeBase(
    merchantId: string,
  ): Promise<void> {
    const promotions = await this.getPromotions(merchantId, false);
    const offers = promotions.map((promo) => ({
      id: promo.id,
      name: promo.name,
      nameAr: promo.nameAr,
      description: promo.description,
      type: promo.type,
      value: promo.value,
      code: promo.code,
      autoApply: promo.autoApply,
      minOrderAmount: promo.minOrderAmount,
      maxDiscountAmount: promo.maxDiscountAmount,
      usageLimit: promo.usageLimit,
      usagePerCustomer: promo.usagePerCustomer,
      currentUsage: promo.currentUsage,
      startDate: promo.startDate,
      endDate: promo.endDate,
      isActive: promo.isActive,
    }));

    const current = await this.pool.query(
      `SELECT knowledge_base FROM merchants WHERE id = $1`,
      [merchantId],
    );
    const existingKb = current.rows[0]?.knowledge_base || {};
    const updatedKb = {
      ...existingKb,
      offers,
      updatedAt: new Date().toISOString(),
    };

    await this.pool.query(
      `UPDATE merchants SET knowledge_base = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updatedKb), merchantId],
    );
  }

  async getLoyaltyAnalytics(merchantId: string): Promise<{
    totalMembers: number;
    activeMembers: number;
    totalOutstandingPoints: number;
    averageLifetimePoints: number;
    tierDistribution: { tier: string; count: number }[];
    monthlyPointsEarned: { month: string; points: number }[];
  }> {
    const summaryResult = await this.pool.query(
      `SELECT 
        COUNT(*) as total_members,
        COUNT(*) FILTER (WHERE current_points > 0) as active_members,
        COALESCE(SUM(current_points), 0) as total_outstanding,
        COALESCE(AVG(lifetime_points), 0) as avg_lifetime
       FROM customer_points WHERE merchant_id = $1`,
      [merchantId],
    );

    const tierResult = await this.pool.query(
      `SELECT COALESCE(lt.name_ar, lt.name) as tier, COUNT(*) as count
       FROM customer_points cp
       LEFT JOIN loyalty_tiers lt ON cp.tier_id = lt.id
       WHERE cp.merchant_id = $1
       GROUP BY COALESCE(lt.name_ar, lt.name)
       ORDER BY COUNT(*) DESC`,
      [merchantId],
    );

    const monthlyResult = await this.pool.query(
      `SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        SUM(points) FILTER (WHERE type = 'EARN') as points
       FROM points_transactions
       WHERE merchant_id = $1 AND created_at > NOW() - INTERVAL '12 months'
       GROUP BY TO_CHAR(created_at, 'YYYY-MM')
       ORDER BY month`,
      [merchantId],
    );

    const summary = summaryResult.rows[0];

    return {
      totalMembers: parseInt(summary.total_members),
      activeMembers: parseInt(summary.active_members),
      totalOutstandingPoints: parseInt(summary.total_outstanding),
      averageLifetimePoints: parseFloat(summary.avg_lifetime),
      tierDistribution: tierResult.rows.map((r) => ({
        tier: r.tier || "None",
        count: parseInt(r.count),
      })),
      monthlyPointsEarned: monthlyResult.rows.map((r) => ({
        month: r.month,
        points: parseInt(r.points) || 0,
      })),
    };
  }

  // ==================== HELPERS ====================

  private generatePromoCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private mapTier(row: any): LoyaltyTier {
    return {
      id: row.id,
      merchantId: row.merchant_id,
      name: row.name,
      nameAr: row.name_ar,
      minPoints: row.min_points,
      discountPercentage: parseFloat(row.discount_percentage),
      freeShipping: row.free_shipping,
      prioritySupport: row.priority_support,
      exclusiveAccess: row.exclusive_access,
      multiplier: parseFloat(row.multiplier),
      color: row.color,
      icon: row.icon,
    };
  }

  private mapPromotion(row: any): Promotion {
    return {
      id: row.id,
      merchantId: row.merchant_id,
      name: row.name,
      nameAr: row.name_ar,
      description: row.description,
      type: row.type,
      value: parseFloat(row.value),
      code: row.code,
      autoApply: row.auto_apply,
      minOrderAmount: parseFloat(row.min_order_amount),
      maxDiscountAmount: row.max_discount_amount
        ? parseFloat(row.max_discount_amount)
        : undefined,
      usageLimit: row.usage_limit,
      usagePerCustomer: row.usage_per_customer,
      currentUsage: row.current_usage,
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active,
    };
  }
}
