import { Injectable, Inject, BadRequestException } from "@nestjs/common";
import { Pool } from "pg";
import * as crypto from "crypto";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

export const INTEGRATION_EVENT_TAXONOMY = [
  "order.created",
  "order.updated",
  "order.cancelled",
  "order.status_changed",
  "payment.received",
  "shipment.status_changed",
  "inventory.adjusted",
  "catalog.updated",
  "customer.updated",
  "refund.created",
  "test.ping",
] as const;

export type IntegrationEventType = (typeof INTEGRATION_EVENT_TAXONOMY)[number];

export function isIntegrationEventType(
  value: string,
): value is IntegrationEventType {
  return (INTEGRATION_EVENT_TAXONOMY as readonly string[]).includes(value);
}

export interface IntegrationEndpoint {
  id: string;
  merchantId: string;
  provider: string;
  type: string;
  secret: string;
  status: string;
  config: Record<string, any>;
  lastEventAt?: Date;
}

@Injectable()
export class IntegrationService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  private generateSecret(): string {
    return `int_${crypto.randomBytes(24).toString("base64url")}`;
  }

  async getOrCreateErpEndpoint(
    merchantId: string,
  ): Promise<IntegrationEndpoint> {
    const existing = await this.pool.query(
      `SELECT * FROM integration_endpoints WHERE merchant_id = $1 AND provider = 'ERP' AND type = 'INBOUND_WEBHOOK'`,
      [merchantId],
    );
    if (existing.rows.length > 0) return this.mapEndpoint(existing.rows[0]);

    const secret = this.generateSecret();
    const created = await this.pool.query(
      `INSERT INTO integration_endpoints (merchant_id, provider, type, secret, status)
       VALUES ($1, 'ERP', 'INBOUND_WEBHOOK', $2, 'ACTIVE')
       RETURNING *`,
      [merchantId, secret],
    );
    return this.mapEndpoint(created.rows[0]);
  }

  async regenerateErpSecret(merchantId: string): Promise<string> {
    const secret = this.generateSecret();
    await this.pool.query(
      `UPDATE integration_endpoints
       SET secret = $1, updated_at = NOW()
       WHERE merchant_id = $2 AND provider = 'ERP' AND type = 'INBOUND_WEBHOOK'`,
      [secret, merchantId],
    );
    return secret;
  }

  async listEvents(merchantId: string, limit = 50, offset = 0) {
    const result = await this.pool.query(
      `SELECT * FROM integration_events
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [merchantId, limit, offset],
    );
    const count = await this.pool.query(
      `SELECT COUNT(*) FROM integration_events WHERE merchant_id = $1`,
      [merchantId],
    );
    return {
      events: result.rows,
      total: parseInt(count.rows[0]?.count || "0", 10),
    };
  }

  async getErpConfig(merchantId: string): Promise<Record<string, any>> {
    const endpoint = await this.getOrCreateErpEndpoint(merchantId);
    return endpoint.config || {};
  }

  async updateErpConfig(
    merchantId: string,
    configPatch: Record<string, any>,
  ): Promise<Record<string, any>> {
    const endpoint = await this.getOrCreateErpEndpoint(merchantId);
    const existing = endpoint.config || {};
    const merged = {
      ...existing,
      ...configPatch,
      mapping: { ...(existing.mapping || {}), ...(configPatch.mapping || {}) },
      pull: { ...(existing.pull || {}), ...(configPatch.pull || {}) },
    };
    await this.pool.query(
      `UPDATE integration_endpoints SET config = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(merged), endpoint.id],
    );
    return merged;
  }

  async pullErpEvents(
    merchantId: string,
    mode: "orders" | "payments" | "both" = "both",
  ) {
    const endpoint = await this.getOrCreateErpEndpoint(merchantId);
    const config = endpoint.config || {};
    const pull = config.pull || {};

    if (!pull.enabled) {
      throw new BadRequestException("ERP pull is not enabled");
    }
    if (!pull.baseUrl) {
      throw new BadRequestException("ERP pull baseUrl is required");
    }

    const headers: Record<string, string> = {};
    if (pull.authHeader && pull.authToken) {
      headers[pull.authHeader] = pull.authToken;
    }
    if (Array.isArray(pull.headers)) {
      for (const h of pull.headers) {
        if (h?.key && h?.value) headers[h.key] = h.value;
      }
    }

    const results: Record<string, any> = {};

    if (mode === "orders" || mode === "both") {
      results.orders = await this.pullAndProcess(
        endpoint,
        pull.baseUrl,
        pull.ordersPath,
        pull.ordersItemsPath,
        headers,
        "order.created",
      );
    }

    if (mode === "payments" || mode === "both") {
      results.payments = await this.pullAndProcess(
        endpoint,
        pull.baseUrl,
        pull.paymentsPath,
        pull.paymentsItemsPath,
        headers,
        "payment.received",
      );
    }

    return { success: true, results };
  }

  async recordEvent(
    endpointId: string,
    merchantId: string,
    eventType: string,
    payload: any,
    status = "RECEIVED",
    error?: string,
  ) {
    await this.pool.query(
      `INSERT INTO integration_events (
         endpoint_id,
         merchant_id,
         event_type,
         payload,
         status,
         error,
         processed_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         CASE WHEN UPPER($5) IN ('PROCESSED', 'FAILED') THEN NOW() ELSE NULL END
       )`,
      [
        endpointId,
        merchantId,
        eventType,
        JSON.stringify(payload),
        status,
        error || null,
      ],
    );
    await this.pool.query(
      `UPDATE integration_endpoints SET last_event_at = NOW() WHERE id = $1`,
      [endpointId],
    );
  }

  async processErpEvent(
    merchantId: string,
    endpointId: string,
    eventType: IntegrationEventType,
    data: any,
  ) {
    const endpointConfig = await this.getEndpointConfig(endpointId);
    const mapped = this.applyMapping(
      data,
      endpointConfig?.mapping || {},
      eventType,
    );
    const payload = mapped || data;

    if (eventType === "test.ping") {
      await this.recordEvent(
        endpointId,
        merchantId,
        eventType,
        { test: true },
        "PROCESSED",
      );
      return { success: true, message: "Test event received" };
    }

    if (eventType === "order.created") {
      const orderNumber =
        payload?.orderNumber || payload?.order_number || `ERP-${Date.now()}`;
      const existing = await this.pool.query(
        `SELECT id FROM orders WHERE merchant_id = $1 AND order_number = $2`,
        [merchantId, orderNumber],
      );
      if (existing.rows.length > 0) {
        await this.recordEvent(
          endpointId,
          merchantId,
          eventType,
          payload,
          "PROCESSED",
        );
        return { success: true, message: "Order already exists" };
      }

      let customerId: string | null = null;
      let senderId = `erp-${crypto.randomUUID()}`;
      const customer = payload?.customer || {};
      if (customer?.phone) {
        const found = await this.pool.query(
          `SELECT id, sender_id FROM customers WHERE merchant_id = $1 AND phone = $2 LIMIT 1`,
          [merchantId, customer.phone],
        );
        if (found.rows.length > 0) {
          customerId = found.rows[0].id;
          senderId = found.rows[0].sender_id;
        } else {
          const created = await this.pool.query(
            `INSERT INTO customers (merchant_id, sender_id, phone, name, address)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [
              merchantId,
              `erp-${customer.phone}`,
              customer.phone,
              customer.name || null,
              customer.address ? JSON.stringify(customer.address) : null,
            ],
          );
          customerId = created.rows[0].id;
          senderId = `erp-${customer.phone}`;
        }
      }

      const conversationId = `erp-${crypto.randomUUID()}`;
      await this.pool.query(
        `INSERT INTO conversations (id, merchant_id, sender_id, customer_id)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, merchantId, senderId, customerId],
      );

      const items = Array.isArray(payload?.items) ? payload.items : [];
      const subtotal = Number(payload?.subtotal ?? payload?.total ?? 0);
      const discount = Number(payload?.discount ?? 0);
      const deliveryFee = Number(
        payload?.deliveryFee ?? payload?.delivery_fee ?? 0,
      );
      const total = Number(payload?.total ?? subtotal - discount + deliveryFee);

      await this.pool.query(
        `INSERT INTO orders (
          merchant_id, conversation_id, customer_id, order_number, status,
          items, subtotal, discount, delivery_fee, total, customer_name, customer_phone,
          delivery_address, delivery_notes, delivery_preference
        ) VALUES ($1, $2, $3, $4, 'CONFIRMED', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          merchantId,
          conversationId,
          customerId,
          orderNumber,
          JSON.stringify(items),
          subtotal,
          discount,
          deliveryFee,
          total,
          customer.name || null,
          customer.phone || null,
          customer.address ? JSON.stringify(customer.address) : null,
          payload?.notes || null,
          payload?.deliveryPreference || null,
        ],
      );

      await this.recordEvent(
        endpointId,
        merchantId,
        eventType,
        payload,
        "PROCESSED",
      );
      return { success: true, message: "Order created" };
    }

    if (eventType === "payment.received") {
      const orderNumber = payload?.orderNumber || payload?.order_number;
      if (!orderNumber) {
        await this.recordEvent(
          endpointId,
          merchantId,
          eventType,
          payload,
          "FAILED",
          "Missing orderNumber",
        );
        return { success: false, message: "Missing orderNumber" };
      }

      const result = await this.pool.query(
        `UPDATE orders
         SET payment_status = 'PAID',
             payment_method = $1,
             paid_at = COALESCE($2, NOW())
         WHERE merchant_id = $3 AND order_number = $4
         RETURNING id`,
        [
          payload?.method || "OTHER",
          payload?.paidAt || null,
          merchantId,
          orderNumber,
        ],
      );

      if (result.rows.length === 0) {
        await this.recordEvent(
          endpointId,
          merchantId,
          eventType,
          payload,
          "FAILED",
          "Order not found",
        );
        return { success: false, message: "Order not found" };
      }

      await this.recordEvent(
        endpointId,
        merchantId,
        eventType,
        payload,
        "PROCESSED",
      );
      return { success: true, message: "Payment applied" };
    }

    const runtimeScaffoldEvents = new Set<IntegrationEventType>([
      "order.updated",
      "order.cancelled",
      "order.status_changed",
      "shipment.status_changed",
      "inventory.adjusted",
      "catalog.updated",
      "customer.updated",
      "refund.created",
    ]);

    if (runtimeScaffoldEvents.has(eventType)) {
      await this.recordEvent(
        endpointId,
        merchantId,
        eventType,
        {
          ...payload,
          _runtimeMode: "foundation_scaffold",
          _note:
            "Accepted by Connector Runtime v2 foundation. Domain-specific mutation handlers will be added incrementally.",
        },
        "PROCESSED",
      );

      return {
        success: true,
        message:
          "Event accepted by runtime scaffold; domain mutation handler pending",
      };
    }

    await this.recordEvent(
      endpointId,
      merchantId,
      eventType,
      data,
      "FAILED",
      "Unsupported event",
    );
    return { success: false, message: "Unsupported event type" };
  }

  private mapEndpoint(row: any): IntegrationEndpoint {
    return {
      id: row.id,
      merchantId: row.merchant_id,
      provider: row.provider,
      type: row.type,
      secret: row.secret,
      status: row.status,
      config: row.config || {},
      lastEventAt: row.last_event_at,
    };
  }

  private async getEndpointConfig(
    endpointId: string,
  ): Promise<Record<string, any>> {
    const result = await this.pool.query(
      `SELECT config FROM integration_endpoints WHERE id = $1`,
      [endpointId],
    );
    return result.rows[0]?.config || {};
  }

  private applyMapping(
    payload: any,
    mapping: Record<string, any>,
    eventType: IntegrationEventType,
  ) {
    if (!mapping || Object.keys(mapping).length === 0) return null;
    if (eventType === "test.ping") return null;

    if (eventType === "order.created") {
      const orderMap = mapping.order || {};
      const customerMap = mapping.customer || {};
      const itemsMap = mapping.items || {};

      const orderNumber = this.resolveField(payload, orderMap, "orderNumber", [
        "orderNumber",
        "order_number",
        "id",
      ]);
      const subtotal = this.resolveField(payload, orderMap, "subtotal", [
        "subtotal",
      ]);
      const discount = this.resolveField(payload, orderMap, "discount", [
        "discount",
      ]);
      const deliveryFee = this.resolveField(payload, orderMap, "deliveryFee", [
        "deliveryFee",
        "delivery_fee",
      ]);
      const total = this.resolveField(payload, orderMap, "total", ["total"]);
      const notes = this.resolveField(payload, orderMap, "notes", ["notes"]);
      const deliveryPreference = this.resolveField(
        payload,
        orderMap,
        "deliveryPreference",
        ["deliveryPreference", "delivery_preference"],
      );

      const customerName = this.resolveField(payload, customerMap, "name", [
        "customer.name",
        "customer_name",
      ]);
      const customerPhone = this.resolveField(payload, customerMap, "phone", [
        "customer.phone",
        "customer_phone",
      ]);
      const customerAddress = this.resolveField(
        payload,
        customerMap,
        "address",
        ["customer.address", "customer_address"],
      );

      const itemsPath = itemsMap.path || itemsMap.itemsPath || null;
      const items = this.resolveItems(payload, itemsPath, [
        "items",
        "lines",
        "line_items",
      ]);

      return {
        orderNumber,
        subtotal,
        discount,
        deliveryFee,
        total,
        notes,
        deliveryPreference,
        customer: {
          name: customerName,
          phone: customerPhone,
          address: customerAddress,
        },
        items,
      };
    }

    if (eventType === "payment.received") {
      const paymentMap = mapping.payment || {};
      const orderNumber = this.resolveField(
        payload,
        paymentMap,
        "orderNumber",
        ["orderNumber", "order_number"],
      );
      const amount = this.resolveField(payload, paymentMap, "amount", [
        "amount",
        "total",
      ]);
      const method = this.resolveField(payload, paymentMap, "method", [
        "method",
        "payment_method",
      ]);
      const paidAt = this.resolveField(payload, paymentMap, "paidAt", [
        "paidAt",
        "paid_at",
      ]);
      return { orderNumber, amount, method, paidAt };
    }

    return null;
  }

  private resolveField(
    payload: any,
    mapSection: Record<string, any>,
    key: string,
    fallbacks: string[],
  ) {
    const mappedPath = mapSection?.[key];
    if (mappedPath) {
      const resolved = this.getByPath(payload, mappedPath);
      if (resolved !== undefined) return resolved;
    }
    for (const path of fallbacks) {
      const resolved = this.getByPath(payload, path);
      if (resolved !== undefined) return resolved;
    }
    return undefined;
  }

  private resolveItems(
    payload: any,
    explicitPath?: string | null,
    fallbackPaths: string[] = [],
  ) {
    if (explicitPath) {
      const resolved = this.getByPath(payload, explicitPath);
      return Array.isArray(resolved) ? resolved : [];
    }
    for (const path of fallbackPaths) {
      const resolved = this.getByPath(payload, path);
      if (Array.isArray(resolved)) return resolved;
    }
    return Array.isArray(payload) ? payload : [];
  }

  private getByPath(payload: any, path: string) {
    if (!path) return undefined;
    const normalized = String(path).replace(/\[(\d+)\]/g, ".$1");
    const segments = normalized.split(".").filter(Boolean);
    let current: any = payload;
    for (const segment of segments) {
      if (current === null || current === undefined) return undefined;
      current = current[segment];
    }
    return current;
  }

  private async pullAndProcess(
    endpoint: IntegrationEndpoint,
    baseUrl: string,
    path: string,
    itemsPath: string,
    headers: Record<string, string>,
    eventType: IntegrationEventType,
  ) {
    if (!path) return { skipped: true, reason: "path not configured" };
    const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
    const response = await fetch(url, { headers });
    if (!response.ok) {
      await this.recordEvent(
        endpoint.id,
        endpoint.merchantId,
        eventType,
        { url },
        "FAILED",
        `HTTP ${response.status}`,
      );
      return { success: false, status: response.status };
    }
    const json = (await response.json()) as any;
    const items = itemsPath
      ? this.getByPath(json, itemsPath)
      : Array.isArray(json)
        ? json
        : (json && json.data) || [];
    if (!Array.isArray(items)) {
      return { success: false, reason: "items not array" };
    }

    let processed = 0;
    for (const item of items) {
      await this.processErpEvent(
        endpoint.merchantId,
        endpoint.id,
        eventType,
        item,
      );
      processed += 1;
    }
    return { success: true, processed };
  }
}
