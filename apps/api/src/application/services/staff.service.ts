import {
  Injectable,
  Inject,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { Pool } from "pg";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

export type StaffRole = "OWNER" | "ADMIN" | "MANAGER" | "AGENT" | "VIEWER";
export type StaffStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "PENDING_INVITE";

export interface Staff {
  id: string;
  merchantId: string;
  email: string;
  name: string;
  role: StaffRole;
  status: StaffStatus;
  permissions: Record<string, any>;
  mfaEnabled: boolean;
  lastLoginAt?: Date;
  lastActivityAt?: Date;
  createdAt: Date;
}

export interface CreateStaffDto {
  merchantId: string;
  email: string;
  name: string;
  role: StaffRole;
  permissions?: Record<string, any>;
  invitedBy?: string;
}

export interface StaffTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface StaffLoginResult {
  staff: Staff;
  tokens: StaffTokens;
  requiresMfa?: boolean;
  requiresPasswordChange?: boolean;
}

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly accessTokenExpiry = "15m";
  private readonly refreshTokenExpiry = "7d";
  private readonly saltRounds = 12;
  private readonly maxLoginAttempts = 5;
  private readonly lockoutDuration = 60 * 1000; // 1 minute (was 15 min — too harsh for merchants)
  private readonly portalBaseUrl: string;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService,
  ) {
    // SECURITY: JWT secrets are required, no defaults allowed
    const jwtSecret = configService.get<string>("JWT_SECRET");
    const jwtRefreshSecret = configService.get<string>("JWT_REFRESH_SECRET");

    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error("JWT_SECRET must be set and at least 32 characters long");
    }
    if (!jwtRefreshSecret || jwtRefreshSecret.length < 32) {
      throw new Error(
        "JWT_REFRESH_SECRET must be set and at least 32 characters long",
      );
    }

    this.jwtSecret = jwtSecret;
    this.jwtRefreshSecret = jwtRefreshSecret;
    this.portalBaseUrl =
      this.configService.get<string>("PORTAL_BASE_URL") ||
      "http://localhost:3001";
  }

  /**
   * Invite a new staff member
   */
  async invite(
    dto: CreateStaffDto,
  ): Promise<{ staff: Staff; inviteToken?: string; tempPassword?: string }> {
    try {
      const teamLimit = await this.getTeamLimit(dto.merchantId);
      if (teamLimit !== null && teamLimit >= 0) {
        const countResult = await this.pool.query(
          `SELECT COUNT(*) as count FROM merchant_staff WHERE merchant_id = $1`,
          [dto.merchantId],
        );
        const currentCount = parseInt(countResult.rows[0]?.count || "0", 10);
        if (currentCount >= teamLimit) {
          throw new BadRequestException(
            "لا يمكن إضافة أعضاء جدد ضمن خطتك الحالية.",
          );
        }
      }

      // Check if email already exists for this merchant
      const existing = await this.pool.query(
        `SELECT id FROM merchant_staff WHERE merchant_id = $1 AND email = $2`,
        [dto.merchantId, dto.email.toLowerCase()],
      );

      if (existing.rows.length > 0) {
        throw new ConflictException("هذا البريد موجود بالفعل ضمن الفريق");
      }

      // Get default permissions for role if not provided
      const permissions =
        dto.permissions || (await this.getDefaultPermissions(dto.role));

      const tempPassword = this.generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, this.saltRounds);

      const result = await this.pool.query(
        `INSERT INTO merchant_staff (
          merchant_id, email, name, role, permissions, status,
          password_hash, must_change_password, temp_password_set_at
        ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, true, NOW())
        RETURNING *`,
        [
          dto.merchantId,
          dto.email.toLowerCase(),
          dto.name,
          dto.role,
          JSON.stringify(permissions),
          passwordHash,
        ],
      );

      await this.sendInviteEmail(dto.email, dto.name, tempPassword);

      return {
        staff: this.mapStaff(result.rows[0]),
        tempPassword:
          process.env.NODE_ENV !== "production" ? tempPassword : undefined,
      };
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        throw new BadRequestException(
          "ميزة الفريق غير مهيأة بعد. حاول لاحقاً أو تواصل مع الدعم.",
        );
      }
      throw error;
    }
  }

  private async getTeamLimit(merchantId: string): Promise<number | null> {
    try {
      const result = await this.pool.query(
        `SELECT bp.limits->>'teamMembers' as team_limit
         FROM merchant_subscriptions ms
         JOIN billing_plans bp ON bp.id = ms.plan_id
         WHERE ms.merchant_id = $1
         ORDER BY ms.created_at DESC
         LIMIT 1`,
        [merchantId],
      );
      const raw = result.rows[0]?.team_limit;
      if (raw === undefined || raw === null) return null;
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Accept invite and set password
   */
  async acceptInvite(
    inviteToken: string,
    password: string,
  ): Promise<StaffLoginResult> {
    const result = await this.pool.query(
      `SELECT * FROM merchant_staff 
       WHERE invite_token = $1 AND status = 'PENDING_INVITE' AND invite_expires_at > NOW()`,
      [inviteToken],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException("Invalid or expired invite token");
    }

    const staff = result.rows[0];

    // Validate password strength
    this.validatePassword(password);

    // Hash password and activate account
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    await this.pool.query(
      `UPDATE merchant_staff SET 
        password_hash = $1, 
        status = 'ACTIVE',
        invite_token = NULL,
        invite_expires_at = NULL,
        must_change_password = false,
        temp_password_set_at = NULL,
        updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, staff.id],
    );

    // Generate tokens and return
    const updatedStaff = await this.findById(staff.id);
    const tokens = await this.generateTokens(updatedStaff!);

    return {
      staff: updatedStaff!,
      tokens,
    };
  }

  /**
   * Login with email and password
   */
  async login(
    merchantId: string,
    email: string,
    password: string,
    deviceInfo?: any,
  ): Promise<StaffLoginResult> {
    const result = await this.pool.query(
      `SELECT * FROM merchant_staff WHERE merchant_id = $1 AND email = $2`,
      [merchantId, email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const staff = result.rows[0];

    // Check if account is locked
    if (staff.locked_until && new Date(staff.locked_until) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(staff.locked_until).getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `Account is locked. Try again in ${remainingMinutes} minutes.`,
      );
    }

    // Check status
    if (staff.status === "PENDING_INVITE") {
      throw new UnauthorizedException("Please accept your invite first");
    }
    if (staff.status === "INACTIVE") {
      throw new UnauthorizedException("Account is inactive");
    }
    if (staff.status === "SUSPENDED") {
      throw new UnauthorizedException("Account is suspended");
    }

    // Verify password
    if (!staff.password_hash) {
      throw new UnauthorizedException(
        "Password not set. Please reset your password.",
      );
    }
    const isValid = await bcrypt.compare(password, staff.password_hash);
    if (!isValid) {
      await this.handleFailedLogin(staff.id, staff.failed_login_attempts);
      throw new UnauthorizedException("Invalid email or password");
    }

    // Reset failed attempts and update last login
    await this.pool.query(
      `UPDATE merchant_staff SET 
        failed_login_attempts = 0,
        locked_until = NULL,
        last_login_at = NOW(),
        last_activity_at = NOW()
       WHERE id = $1`,
      [staff.id],
    );

    // Check if MFA is required
    if (staff.mfa_enabled) {
      // Return partial response - MFA verification needed
      return {
        staff: this.mapStaff(staff),
        tokens: { accessToken: "", refreshToken: "", expiresIn: 0 },
        requiresMfa: true,
      };
    }

    // Generate tokens
    const mappedStaff = this.mapStaff(staff);
    const tokens = await this.generateTokens(mappedStaff, deviceInfo);

    return {
      staff: mappedStaff,
      tokens,
      requiresPasswordChange: !!staff.must_change_password,
    };
  }

  /**
   * Verify a refresh token and return its payload without performing rotation.
   * Used by logout endpoint to derive staffId from token instead of body (IDOR prevention).
   */
  async verifyRefreshTokenPayload(
    refreshToken: string,
  ): Promise<{ staffId: string; merchantId: string } | null> {
    try {
      const payload = jwt.verify(refreshToken, this.jwtRefreshSecret) as any;
      if (!payload?.staffId) return null;
      return { staffId: payload.staffId, merchantId: payload.merchantId };
    } catch {
      return null;
    }
  }

  /**
   * Refresh access token
   */
  async refreshTokens(refreshToken: string): Promise<StaffTokens> {
    try {
      const payload = jwt.verify(refreshToken, this.jwtRefreshSecret) as any;

      // Verify refresh token exists in database
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
      const sessionResult = await this.pool.query(
        `SELECT * FROM staff_sessions 
         WHERE refresh_token_hash = $1 AND staff_id = $2 AND expires_at > NOW()`,
        [tokenHash, payload.staffId],
      );

      if (sessionResult.rows.length === 0) {
        throw new UnauthorizedException("Invalid refresh token");
      }

      const staff = await this.findById(payload.staffId);
      if (!staff || staff.status !== "ACTIVE") {
        throw new UnauthorizedException("Account is not active");
      }

      // Generate new tokens
      const tokens = await this.generateTokens(staff);

      // Delete old session
      await this.pool.query(
        `DELETE FROM staff_sessions WHERE refresh_token_hash = $1`,
        [tokenHash],
      );

      return tokens;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException("Refresh token expired");
      }
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  /**
   * Logout - invalidate refresh token
   */
  async logout(staffId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");
      await this.pool.query(
        `DELETE FROM staff_sessions WHERE staff_id = $1 AND refresh_token_hash = $2`,
        [staffId, tokenHash],
      );
    } else {
      // Logout from all devices
      await this.pool.query(`DELETE FROM staff_sessions WHERE staff_id = $1`, [
        staffId,
      ]);
    }
  }

  /**
   * Get staff by ID
   */
  async findById(id: string): Promise<Staff | null> {
    const result = await this.pool.query(
      `SELECT * FROM merchant_staff WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? this.mapStaff(result.rows[0]) : null;
  }

  /**
   * Get all staff for a merchant
   */
  async findByMerchant(merchantId: string): Promise<Staff[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM merchant_staff WHERE merchant_id = $1 ORDER BY created_at`,
        [merchantId],
      );
      return result.rows.map((row) => this.mapStaff(row));
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Update staff member
   */
  async update(
    id: string,
    merchantId: string,
    updates: {
      name?: string;
      role?: StaffRole;
      permissions?: Record<string, any>;
      status?: StaffStatus;
    },
  ): Promise<Staff | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.role !== undefined) {
      setClauses.push(`role = $${paramIndex++}`);
      values.push(updates.role);
    }
    if (updates.permissions !== undefined) {
      setClauses.push(`permissions = $${paramIndex++}`);
      values.push(JSON.stringify(updates.permissions));
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }

    if (setClauses.length === 0) return this.findById(id);

    values.push(id, merchantId);
    const result = await this.pool.query(
      `UPDATE merchant_staff SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND merchant_id = $${paramIndex}
       RETURNING *`,
      values,
    );

    return result.rows.length > 0 ? this.mapStaff(result.rows[0]) : null;
  }

  /**
   * Change password
   */
  async changePassword(
    staffId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `SELECT password_hash FROM merchant_staff WHERE id = $1`,
      [staffId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException("Staff not found");
    }

    const isValid = await bcrypt.compare(
      currentPassword,
      result.rows[0].password_hash,
    );
    if (!isValid) {
      throw new BadRequestException("Current password is incorrect");
    }

    // Prevent reusing the same password
    const isSamePassword = await bcrypt.compare(
      newPassword,
      result.rows[0].password_hash,
    );
    if (isSamePassword) {
      throw new BadRequestException(
        "New password must be different from current password",
      );
    }

    this.validatePassword(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);

    const updateResult = await this.pool.query(
      `UPDATE merchant_staff SET 
        password_hash = $1, 
        must_change_password = false,
        temp_password_set_at = NULL,
        updated_at = NOW() 
       WHERE id = $2
       RETURNING id`,
      [passwordHash, staffId],
    );

    if (updateResult.rowCount === 0) {
      throw new BadRequestException("Password update failed — staff not found");
    }

    this.logger.log(`Password changed successfully for staff ${staffId}`);

    // Invalidate all sessions (forces re-login with new password)
    await this.pool.query(`DELETE FROM staff_sessions WHERE staff_id = $1`, [
      staffId,
    ]);
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(
    merchantId: string,
    email: string,
  ): Promise<string> {
    const result = await this.pool.query(
      `SELECT id FROM merchant_staff 
       WHERE merchant_id = $1 AND email = $2 AND status = 'ACTIVE'`,
      [merchantId, email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists
      return "If this email exists, a reset link will be sent";
    }

    // Generate reset token (would normally send via email)
    const resetToken = crypto.randomBytes(32).toString("base64url");

    await this.pool.query(
      `UPDATE merchant_staff SET 
        invite_token = $1,
        invite_expires_at = NOW() + INTERVAL '1 hour'
       WHERE id = $2`,
      [resetToken, result.rows[0].id],
    );

    return resetToken; // In production, this would be sent via email
  }

  /**
   * Reset password with token
   */
  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    const result = await this.pool.query(
      `SELECT id FROM merchant_staff 
       WHERE invite_token = $1 AND invite_expires_at > NOW()`,
      [resetToken],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    this.validatePassword(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, this.saltRounds);

    await this.pool.query(
      `UPDATE merchant_staff SET 
        password_hash = $1,
        invite_token = NULL,
        invite_expires_at = NULL,
        failed_login_attempts = 0,
        locked_until = NULL,
        must_change_password = false,
        temp_password_set_at = NULL,
        updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, result.rows[0].id],
    );

    // Invalidate all sessions
    await this.pool.query(`DELETE FROM staff_sessions WHERE staff_id = $1`, [
      result.rows[0].id,
    ]);
  }

  /**
   * Delete staff member
   */
  async delete(id: string, merchantId: string): Promise<boolean> {
    // Prevent deleting the last owner
    const ownerCount = await this.pool.query(
      `SELECT COUNT(*) FROM merchant_staff 
       WHERE merchant_id = $1 AND role = 'OWNER' AND id != $2`,
      [merchantId, id],
    );

    const staffResult = await this.pool.query(
      `SELECT role FROM merchant_staff WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );

    if (
      staffResult.rows[0]?.role === "OWNER" &&
      parseInt(ownerCount.rows[0].count) === 0
    ) {
      throw new BadRequestException("Cannot delete the last owner");
    }

    const result = await this.pool.query(
      `DELETE FROM merchant_staff WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );

    return result.rowCount! > 0;
  }

  /**
   * Get active sessions for a staff member
   */
  async getSessions(staffId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT id, device_info, ip_address, last_used_at, created_at
       FROM staff_sessions WHERE staff_id = $1 AND expires_at > NOW()
       ORDER BY last_used_at DESC`,
      [staffId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      deviceInfo: row.device_info,
      ipAddress: row.ip_address,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * Revoke a specific session
   */
  async revokeSession(staffId: string, sessionId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM staff_sessions WHERE id = $1 AND staff_id = $2`,
      [sessionId, staffId],
    );
  }

  /**
   * Update last activity timestamp
   */
  async updateActivity(staffId: string): Promise<void> {
    await this.pool.query(
      `UPDATE merchant_staff SET last_activity_at = NOW() WHERE id = $1`,
      [staffId],
    );
  }

  /**
   * Check if staff has permission
   */
  hasPermission(staff: Staff, resource: string, action: string): boolean {
    const permissions = staff.permissions;
    if (!permissions || !permissions[resource]) return false;
    return permissions[resource][action] === true;
  }

  /**
   * Verify JWT token and return staff
   */
  async verifyToken(token: string): Promise<Staff | null> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as any;
      const staff = await this.findById(payload.staffId);

      if (!staff || staff.status !== "ACTIVE") {
        return null;
      }

      // Reject tokens issued before last password change / session revocation
      // updated_at is set during changePassword and other critical security events
      if (payload.iat) {
        const result = await this.pool.query(
          `SELECT updated_at FROM merchant_staff WHERE id = $1`,
          [payload.staffId],
        );
        if (result.rows.length > 0 && result.rows[0].updated_at) {
          const updatedAt = new Date(result.rows[0].updated_at).getTime();
          const issuedAt = payload.iat * 1000; // JWT iat is in seconds
          if (issuedAt < updatedAt) {
            this.logger.debug(
              `Token for staff ${payload.staffId} rejected: issued before last security update`,
            );
            return null;
          }
        }
      }

      return staff;
    } catch {
      return null;
    }
  }

  // Private helpers

  private async generateTokens(
    staff: Staff,
    deviceInfo?: any,
  ): Promise<StaffTokens> {
    const accessToken = jwt.sign(
      {
        staffId: staff.id,
        merchantId: staff.merchantId,
        role: staff.role,
        email: staff.email,
      },
      this.jwtSecret,
      { expiresIn: this.accessTokenExpiry },
    );

    const refreshToken = jwt.sign(
      { staffId: staff.id, type: "refresh", jti: crypto.randomBytes(16).toString("hex") },
      this.jwtRefreshSecret,
      { expiresIn: this.refreshTokenExpiry },
    );

    // Store refresh token hash
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO staff_sessions (staff_id, refresh_token_hash, device_info, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [staff.id, tokenHash, JSON.stringify(deviceInfo || {}), expiresAt],
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  private async handleFailedLogin(
    staffId: string,
    currentAttempts: number,
  ): Promise<void> {
    const newAttempts = currentAttempts + 1;

    if (newAttempts >= this.maxLoginAttempts) {
      await this.pool.query(
        `UPDATE merchant_staff SET 
          failed_login_attempts = $1,
          locked_until = $2
         WHERE id = $3`,
        [newAttempts, new Date(Date.now() + this.lockoutDuration), staffId],
      );
    } else {
      await this.pool.query(
        `UPDATE merchant_staff SET failed_login_attempts = $1 WHERE id = $2`,
        [newAttempts, staffId],
      );
    }
  }

  private async getDefaultPermissions(
    role: StaffRole,
  ): Promise<Record<string, any>> {
    const result = await this.pool.query(
      `SELECT permissions FROM permission_templates WHERE name = $1 AND is_system = true`,
      [`${role.toLowerCase()}_access`],
    );

    if (result.rows.length > 0) {
      return result.rows[0].permissions;
    }

    // Fallback minimal permissions
    return {
      orders: { read: true },
      conversations: { read: true },
    };
  }

  private validatePassword(password: string): void {
    if (password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }
    if (!/[A-Z]/.test(password)) {
      throw new BadRequestException(
        "Password must contain at least one uppercase letter",
      );
    }
    if (!/[a-z]/.test(password)) {
      throw new BadRequestException(
        "Password must contain at least one lowercase letter",
      );
    }
    if (!/[0-9]/.test(password)) {
      throw new BadRequestException(
        "Password must contain at least one number",
      );
    }
  }

  private mapStaff(row: any): Staff {
    return {
      id: row.id,
      merchantId: row.merchant_id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      permissions: row.permissions || {},
      mfaEnabled: row.mfa_enabled,
      lastLoginAt: row.last_login_at,
      lastActivityAt: row.last_activity_at,
      createdAt: row.created_at,
    };
  }

  private generateTempPassword(): string {
    const raw = crypto.randomBytes(9).toString("base64url");
    return raw.slice(0, 12);
  }

  private async sendInviteEmail(
    email: string,
    name: string,
    tempPassword: string,
  ): Promise<void> {
    const host = this.configService.get<string>("SMTP_HOST");
    const port = parseInt(
      this.configService.get<string>("SMTP_PORT", "587"),
      10,
    );
    const user = this.configService.get<string>("SMTP_USER");
    const pass = this.configService.get<string>("SMTP_PASS");
    const from = this.configService.get<string>("SMTP_FROM");
    const secure =
      this.configService.get<string>("SMTP_SECURE", "false") === "true";

    if (!host || !from) {
      this.logger.warn(
        "[EMAIL] SMTP not configured - skipping staff invite email",
      );
      return;
    }

    let nodemailer: any;
    try {
      nodemailer = await import("nodemailer");
    } catch (error) {
      this.logger.warn(
        "[EMAIL] nodemailer not installed - skipping staff invite email",
      );
      return;
    }

    const loginUrl = `${this.portalBaseUrl}/login`;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>دعوة للانضمام إلى الفريق</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f9; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f6f9; padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%); padding:40px 32px; text-align:center;">
              <div style="width:64px; height:64px; background-color:rgba(255,255,255,0.2); border-radius:16px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:16px;">
                <span style="font-size:32px;">🚀</span>
              </div>
              <h1 style="color:#ffffff; font-size:26px; font-weight:700; margin:0 0 8px 0; letter-spacing:-0.5px;">
                مرحباً بك في الفريق!
              </h1>
              <p style="color:rgba(255,255,255,0.85); font-size:15px; margin:0;">
                تمت دعوتك للانضمام إلى منصة <strong>تشغيل</strong>
              </p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 32px 0 32px;">
              <p style="color:#1e293b; font-size:17px; margin:0 0 8px 0; font-weight:600;">
                أهلاً ${name || "بك"} 👋
              </p>
              <p style="color:#64748b; font-size:14px; margin:0; line-height:1.7;">
                تمت إضافتك كعضو في فريق المتجر. يمكنك الآن تسجيل الدخول والبدء فوراً.
              </p>
            </td>
          </tr>

          <!-- Credentials Card -->
          <tr>
            <td style="padding:24px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:24px;">
                    <p style="color:#94a3b8; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0 0 16px 0; font-weight:600;">
                      بيانات تسجيل الدخول
                    </p>
                    
                    <!-- Email -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:12px;">
                      <tr>
                        <td style="padding:12px 16px; background-color:#ffffff; border-radius:8px; border:1px solid #e2e8f0;">
                          <p style="color:#94a3b8; font-size:11px; margin:0 0 4px 0; font-weight:500;">البريد الإلكتروني</p>
                          <p style="color:#1e293b; font-size:15px; margin:0; font-weight:600; direction:ltr; text-align:right;">${email}</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Password -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:12px 16px; background-color:#ffffff; border-radius:8px; border:1px solid #e2e8f0;">
                          <p style="color:#94a3b8; font-size:11px; margin:0 0 4px 0; font-weight:500;">كلمة المرور المؤقتة</p>
                          <p style="color:#1e293b; font-size:18px; margin:0; font-weight:700; font-family:monospace; letter-spacing:2px; direction:ltr; text-align:right;">${tempPassword}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:0 32px 16px 32px; text-align:center;">
              <a href="${loginUrl}" 
                 style="display:inline-block; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#ffffff; text-decoration:none; padding:14px 48px; border-radius:10px; font-size:16px; font-weight:600; letter-spacing:-0.3px; box-shadow:0 4px 12px rgba(99,102,241,0.4);">
                تسجيل الدخول الآن
              </a>
            </td>
          </tr>

          <!-- Security Notice -->
          <tr>
            <td style="padding:0 32px 32px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#fef3c7; border-radius:10px; border:1px solid #fde68a;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="color:#92400e; font-size:13px; margin:0; line-height:1.6;">
                      ⚠️ <strong>هام:</strong> يرجى تغيير كلمة المرور فوراً بعد تسجيل الدخول الأول للحفاظ على أمان حسابك.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none; border-top:1px solid #e2e8f0; margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 32px 32px; text-align:center;">
              <p style="color:#94a3b8; font-size:12px; margin:0 0 8px 0;">
                هذه رسالة آلية من منصة <strong style="color:#6366f1;">تشغيل</strong>
              </p>
              <p style="color:#cbd5e1; font-size:11px; margin:0;">
                إذا لم تكن تتوقع هذه الرسالة، يرجى تجاهلها.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await transporter.sendMail({
      from,
      to: email,
      subject: "🚀 دعوة للانضمام إلى فريقك | تشغيل",
      text: `مرحباً ${name || ""}\n\nتمت إضافتك إلى فريق المتجر.\nالبريد: ${email}\nكلمة المرور المؤقتة: ${tempPassword}\nرابط الدخول: ${loginUrl}\n\nيرجى تغيير كلمة المرور بعد تسجيل الدخول.`,
      html: htmlContent,
    });
  }
}
