/**
 * Shared utility functions for portal-compat sub-controllers.
 * Extracted from the monolithic PortalCompatController refactor.
 */
import { NotFoundException } from "@nestjs/common";
import { Request } from "express";
import { Pool } from "pg";

export type PeriodWindow = {
  startDate: Date;
  endDate: Date;
  days: number;
};

export type DriverLoad = {
  id: string;
  name: string;
  phone: string;
  load: number;
};

export function getMerchantId(req: Request): string {
  return (req as any).merchantId;
}

export function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toBoolean(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

export function parseJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function parseWindow(
  daysRaw?: string,
  startDateRaw?: string,
  endDateRaw?: string,
): PeriodWindow {
  const now = new Date();
  const requestedDays = Number.parseInt(String(daysRaw ?? ""), 10);
  const normalizedDays = Number.isFinite(requestedDays)
    ? Math.min(Math.max(requestedDays, 1), 365)
    : 30;

  if (startDateRaw && endDateRaw) {
    const startDate = new Date(startDateRaw);
    const endDate = new Date(endDateRaw);
    if (
      !Number.isNaN(startDate.getTime()) &&
      !Number.isNaN(endDate.getTime()) &&
      startDate <= endDate
    ) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.max(1, Math.ceil(diffMs / 86400000));
      return { startDate: start, endDate: end, days: diffDays };
    }
  }

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (normalizedDays - 1));
  start.setHours(0, 0, 0, 0);
  return { startDate: start, endDate: end, days: normalizedDays };
}

export function expandAgentFilter(agent?: string): string[] {
  if (!agent || agent === "ALL") return [];
  const normalized = agent.trim().toUpperCase();
  const map: Record<string, string[]> = {
    OPS: ["OPS", "OPS_AGENT"],
    INVENTORY: ["INVENTORY", "INVENTORY_AGENT"],
    FINANCE: ["FINANCE", "FINANCE_AGENT"],
    SUPPORT: ["SUPPORT", "SUPPORT_AGENT"],
    MARKETING: ["MARKETING", "MARKETING_AGENT"],
  };
  return map[normalized] || [normalized];
}

export async function getMerchantPortalSummary(merchantId: string, pool: Pool) {
  const [
    merchantResult,
    productsResult,
    inventoryResult,
    ordersResult,
    customersResult,
    conversationsResult,
    paidOrdersResult,
    paymentLinksResult,
    activeStaffResult,
    unreadNotificationsResult,
    integrationsResult,
    driversResult,
  ] = await Promise.all([
    pool.query<{ merchant_data: Record<string, any> }>(
      `SELECT to_jsonb(m) as merchant_data FROM merchants m WHERE m.id = $1 LIMIT 1`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM catalog_items WHERE merchant_id = $1`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM inventory_items WHERE merchant_id = $1`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM orders WHERE merchant_id = $1`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM customers WHERE merchant_id = $1`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM conversations WHERE merchant_id = $1`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM orders
       WHERE merchant_id = $1 AND status::text IN ('DELIVERED', 'COMPLETED')`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM payment_links WHERE merchant_id = $1`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM merchant_staff
       WHERE merchant_id = $1 AND status = 'ACTIVE'`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM notifications n
       WHERE n.merchant_id = $1
         AND COALESCE(NULLIF((to_jsonb(n)->>'is_read'), '')::boolean, false) = false
         AND (to_jsonb(n)->>'read_at') IS NULL`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM pos_integrations WHERE merchant_id = $1`,
      [merchantId],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM delivery_drivers
       WHERE merchant_id = $1 AND UPPER(COALESCE(status, '')) = 'ACTIVE'`,
      [merchantId],
    ),
  ]);

  const merchantData = merchantResult.rows[0]?.merchant_data || {};
  const knowledgeBase = parseJsonObject(merchantData.knowledge_base);
  const businessInfo = parseJsonObject(knowledgeBase.businessInfo);
  const faqs = Array.isArray(knowledgeBase.faqs) ? knowledgeBase.faqs : [];

  return {
    merchantData,
    knowledgeBase,
    businessInfo,
    faqCount: faqs.length,
    totalProducts: toNumber(productsResult.rows[0]?.count, 0),
    totalInventoryItems: toNumber(inventoryResult.rows[0]?.count, 0),
    totalOrders: toNumber(ordersResult.rows[0]?.count, 0),
    totalCustomers: toNumber(customersResult.rows[0]?.count, 0),
    totalConversations: toNumber(conversationsResult.rows[0]?.count, 0),
    paidOrders: toNumber(paidOrdersResult.rows[0]?.count, 0),
    paymentLinks: toNumber(paymentLinksResult.rows[0]?.count, 0),
    activeStaff: toNumber(activeStaffResult.rows[0]?.count, 0),
    unreadNotifications: toNumber(unreadNotificationsResult.rows[0]?.count, 0),
    integrations: toNumber(integrationsResult.rows[0]?.count, 0),
    activeDrivers: toNumber(driversResult.rows[0]?.count, 0),
  };
}

export async function getAutoAssignSettingsForMerchant(
  merchantId: string,
  pool: Pool,
): Promise<{ autoAssign: boolean; mode: string; notifyCustomer: boolean }> {
  const merchantResult = await pool.query<{
    merchant_data: Record<string, any>;
  }>(
    `SELECT to_jsonb(m) as merchant_data FROM merchants m WHERE m.id = $1 LIMIT 1`,
    [merchantId],
  );
  if (merchantResult.rows.length === 0) {
    throw new NotFoundException("التاجر غير موجود");
  }

  const merchantData = merchantResult.rows[0].merchant_data || {};
  const config = parseJsonObject(merchantData.config);
  return {
    autoAssign: toBoolean(
      merchantData.auto_assign_delivery ?? config.autoAssignDelivery,
      false,
    ),
    mode: String(
      merchantData.delivery_assignment_mode ??
        config.deliveryAssignmentMode ??
        "least_load",
    ),
    notifyCustomer: toBoolean(
      merchantData.notify_customer_on_assign ?? config.notifyCustomerOnAssign,
      true,
    ),
  };
}

export async function loadActiveDriversWithLoad(
  merchantId: string,
  pool: Pool,
): Promise<DriverLoad[]> {
  const result = await pool.query<{
    id: string;
    name: string;
    phone: string;
    active_load: string;
  }>(
    `SELECT
       dd.id::text as id,
       dd.name,
       COALESCE(dd.whatsapp_number, dd.phone, '') as phone,
       COALESCE(loads.active_load, 0)::text as active_load
     FROM delivery_drivers dd
     LEFT JOIN (
       SELECT assigned_driver_id::text as driver_id, COUNT(*)::int as active_load
       FROM orders
       WHERE merchant_id = $1
         AND assigned_driver_id IS NOT NULL
         AND status::text NOT IN ('DELIVERED', 'CANCELLED', 'FAILED', 'REFUNDED')
       GROUP BY assigned_driver_id
     ) loads ON loads.driver_id = dd.id::text
     WHERE dd.merchant_id = $1
       AND UPPER(COALESCE(dd.status, '')) = 'ACTIVE'
     ORDER BY COALESCE(loads.active_load, 0) ASC, dd.created_at ASC`,
    [merchantId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    load: toNumber(row.active_load, 0),
  }));
}

export function pickNextDriver(drivers: DriverLoad[]): DriverLoad | null {
  if (drivers.length === 0) return null;
  drivers.sort((a, b) => a.load - b.load || a.name.localeCompare(b.name));
  return drivers[0];
}

export async function createStockMovementSafely(
  args: {
    merchantId: string;
    catalogItemId: string | null;
    variantId: string | null;
    movementType: string;
    quantity: number;
    quantityBefore?: number | null;
    quantityAfter?: number | null;
    reason?: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
  },
  pool: Pool,
): Promise<void> {
  const metadata = args.metadata || {};
  try {
    await pool.query(
      `INSERT INTO stock_movements (
        merchant_id, catalog_item_id, variant_id, movement_type, quantity,
        quantity_before, quantity_after, reason, reference_type, reference_id, metadata, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
      [
        args.merchantId,
        args.catalogItemId,
        args.variantId,
        args.movementType,
        args.quantity,
        args.quantityBefore ?? null,
        args.quantityAfter ?? null,
        args.reason || null,
        args.referenceType || null,
        args.referenceId || null,
        JSON.stringify(metadata),
        args.reason || null,
      ],
    );
    return;
  } catch (error: any) {
    if (!["42703", "42P01"].includes(error?.code)) {
      throw error;
    }
  }

  if (!args.catalogItemId) return;

  await pool.query(
    `INSERT INTO stock_movements (
      merchant_id, catalog_item_id, movement_type, quantity, reference_type, reference_id, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      args.merchantId,
      args.catalogItemId,
      args.movementType,
      args.quantity,
      args.referenceType || null,
      args.referenceId || null,
      args.reason || null,
    ],
  );
}
