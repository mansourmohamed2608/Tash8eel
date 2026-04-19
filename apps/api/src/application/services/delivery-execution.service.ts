import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../infrastructure/database/database.module";

export type DeliveryExecutionEventType =
  | "delivery.assigned"
  | "delivery.picked_up"
  | "delivery.out_for_delivery"
  | "delivery.arrived"
  | "delivery.delivered"
  | "delivery.failed"
  | "delivery.disputed"
  | "pod.captured"
  | "driver.location"
  | "sla.updated";

export type DeliveryPodType = "photo" | "signature" | "otp" | "note";

interface OrderContext {
  orderId: string;
  orderNumber: string;
  shipmentId: string | null;
}

const MAX_DELIVERY_EVENT_PAYLOAD_BYTES = 64 * 1024;
const MAX_DELIVERY_METADATA_BYTES = 32 * 1024;

@Injectable()
export class DeliveryExecutionService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async recordEvent(input: {
    merchantId: string;
    orderRef: string;
    eventType: DeliveryExecutionEventType;
    source?: string;
    status?: string;
    payload?: Record<string, any>;
    correlationId?: string;
    eventTime?: string;
  }) {
    const ctx = await this.resolveOrderContext(
      input.merchantId,
      input.orderRef,
    );
    this.assertJsonWithinLimit(
      input.payload,
      MAX_DELIVERY_EVENT_PAYLOAD_BYTES,
      "event payload",
    );

    const normalizedEventTime = this.normalizeTimestamp(
      input.eventTime,
      "eventTime",
    );
    const normalizedSource =
      String(input.source || "system").trim() || "system";
    const normalizedStatus =
      String(input.status || "RECORDED").trim() || "RECORDED";

    const eventResult = await this.pool.query<{
      id: string;
      event_type: string;
      source: string;
      status: string;
      event_time: Date;
      payload: Record<string, any>;
      correlation_id: string | null;
    }>(
      `INSERT INTO delivery_execution_events (
         merchant_id,
         order_id,
         shipment_id,
         event_type,
         source,
         status,
         event_time,
         payload,
         correlation_id
       ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), $8::jsonb, $9)
       RETURNING
         id::text as id,
         event_type,
         source,
         status,
         event_time,
         payload,
         correlation_id`,
      [
        input.merchantId,
        ctx.orderId,
        ctx.shipmentId,
        input.eventType,
        normalizedSource.slice(0, 32),
        normalizedStatus.slice(0, 32),
        normalizedEventTime || null,
        JSON.stringify(input.payload || {}),
        input.correlationId || null,
      ],
    );

    return {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      shipmentId: ctx.shipmentId,
      event: {
        id: eventResult.rows[0].id,
        eventType: eventResult.rows[0].event_type,
        source: eventResult.rows[0].source,
        status: eventResult.rows[0].status,
        eventTime: eventResult.rows[0].event_time,
        payload: eventResult.rows[0].payload || {},
        correlationId: eventResult.rows[0].correlation_id,
      },
    };
  }

  async capturePod(input: {
    merchantId: string;
    orderRef: string;
    proofType: DeliveryPodType;
    proofUrl?: string;
    proofPayload?: Record<string, any>;
    capturedBy?: string;
    capturedAt?: string;
  }) {
    const ctx = await this.resolveOrderContext(
      input.merchantId,
      input.orderRef,
    );
    this.assertJsonWithinLimit(
      input.proofPayload,
      MAX_DELIVERY_METADATA_BYTES,
      "proofPayload",
    );

    const capturedAt = this.normalizeTimestamp(input.capturedAt, "capturedAt");

    const podResult = await this.pool.query<{
      id: string;
      proof_type: string;
      proof_url: string | null;
      proof_payload: Record<string, any>;
      captured_by: string | null;
      captured_at: Date;
    }>(
      `INSERT INTO delivery_pod_records (
         merchant_id,
         order_id,
         shipment_id,
         proof_type,
         proof_url,
         proof_payload,
         captured_by,
         captured_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, COALESCE($8::timestamptz, NOW()))
       RETURNING
         id::text as id,
         proof_type,
         proof_url,
         proof_payload,
         captured_by,
         captured_at`,
      [
        input.merchantId,
        ctx.orderId,
        ctx.shipmentId,
        input.proofType,
        input.proofUrl || null,
        JSON.stringify(input.proofPayload || {}),
        input.capturedBy || null,
        capturedAt || null,
      ],
    );

    await this.recordEvent({
      merchantId: input.merchantId,
      orderRef: input.orderRef,
      eventType: "pod.captured",
      source: "driver_app",
      payload: {
        podId: podResult.rows[0].id,
        proofType: podResult.rows[0].proof_type,
        proofUrl: podResult.rows[0].proof_url,
      },
      eventTime: podResult.rows[0].captured_at.toISOString(),
    });

    return {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      shipmentId: ctx.shipmentId,
      pod: {
        id: podResult.rows[0].id,
        proofType: podResult.rows[0].proof_type,
        proofUrl: podResult.rows[0].proof_url,
        proofPayload: podResult.rows[0].proof_payload || {},
        capturedBy: podResult.rows[0].captured_by,
        capturedAt: podResult.rows[0].captured_at,
      },
    };
  }

  async markPodDispute(input: {
    merchantId: string;
    orderRef: string;
    podId: string;
    disputeNote?: string;
    disputedBy?: string;
    disputedAt?: string;
  }) {
    const ctx = await this.resolveOrderContext(
      input.merchantId,
      input.orderRef,
    );
    const disputedAt = this.normalizeTimestamp(input.disputedAt, "disputedAt");

    const result = await this.pool.query<{
      id: string;
      dispute_status: string;
      disputed_at: Date;
      dispute_note: string | null;
    }>(
      `UPDATE delivery_pod_records
       SET dispute_status = 'OPEN',
           disputed_at = COALESCE($4::timestamptz, NOW()),
           dispute_note = $5,
           updated_at = NOW()
       WHERE merchant_id = $1
         AND order_id = $2
         AND id::text = $3
       RETURNING
         id::text as id,
         dispute_status,
         disputed_at,
         dispute_note`,
      [
        input.merchantId,
        ctx.orderId,
        input.podId,
        disputedAt || null,
        String(input.disputeNote || "").trim() || null,
      ],
    );

    if (!result.rows.length) {
      throw new NotFoundException("POD record not found");
    }

    await this.recordEvent({
      merchantId: input.merchantId,
      orderRef: input.orderRef,
      eventType: "delivery.disputed",
      source: "system",
      payload: {
        podId: result.rows[0].id,
        disputeStatus: result.rows[0].dispute_status,
        disputeNote: result.rows[0].dispute_note,
        disputedBy: String(input.disputedBy || "").trim() || null,
      },
      eventTime: result.rows[0].disputed_at.toISOString(),
    });

    return {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      shipmentId: ctx.shipmentId,
      dispute: {
        podId: result.rows[0].id,
        status: result.rows[0].dispute_status,
        disputedAt: result.rows[0].disputed_at,
        disputeNote: result.rows[0].dispute_note,
        disputedBy: String(input.disputedBy || "").trim() || null,
      },
    };
  }

  async recordLocation(input: {
    merchantId: string;
    orderRef: string;
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    speedKmh?: number;
    headingDeg?: number;
    source?: string;
    metadata?: Record<string, any>;
    recordedAt?: string;
  }) {
    if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
      throw new BadRequestException("latitude and longitude are required");
    }
    if (input.latitude < -90 || input.latitude > 90) {
      throw new BadRequestException("latitude must be between -90 and 90");
    }
    if (input.longitude < -180 || input.longitude > 180) {
      throw new BadRequestException("longitude must be between -180 and 180");
    }
    if (
      input.accuracyMeters !== undefined &&
      (!Number.isFinite(input.accuracyMeters) || input.accuracyMeters < 0)
    ) {
      throw new BadRequestException(
        "accuracyMeters must be a non-negative number",
      );
    }
    if (
      input.speedKmh !== undefined &&
      (!Number.isFinite(input.speedKmh) ||
        input.speedKmh < 0 ||
        input.speedKmh > 350)
    ) {
      throw new BadRequestException("speedKmh must be between 0 and 350");
    }
    if (
      input.headingDeg !== undefined &&
      (!Number.isFinite(input.headingDeg) ||
        input.headingDeg < 0 ||
        input.headingDeg > 360)
    ) {
      throw new BadRequestException("headingDeg must be between 0 and 360");
    }
    this.assertJsonWithinLimit(
      input.metadata,
      MAX_DELIVERY_METADATA_BYTES,
      "location metadata",
    );

    const recordedAt = this.normalizeTimestamp(input.recordedAt, "recordedAt");

    const ctx = await this.resolveOrderContext(
      input.merchantId,
      input.orderRef,
    );

    const row = await this.pool.query<{
      id: string;
      latitude: string;
      longitude: string;
      accuracy_meters: string | null;
      speed_kmh: string | null;
      heading_deg: string | null;
      source: string;
      metadata: Record<string, any>;
      recorded_at: Date;
    }>(
      `INSERT INTO delivery_location_timeline (
         merchant_id,
         order_id,
         shipment_id,
         latitude,
         longitude,
         accuracy_meters,
         speed_kmh,
         heading_deg,
         source,
         metadata,
         recorded_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, COALESCE($11::timestamptz, NOW()))
       RETURNING
         id::text as id,
         latitude::text as latitude,
         longitude::text as longitude,
         accuracy_meters::text as accuracy_meters,
         speed_kmh::text as speed_kmh,
         heading_deg::text as heading_deg,
         source,
         metadata,
         recorded_at`,
      [
        input.merchantId,
        ctx.orderId,
        ctx.shipmentId,
        input.latitude,
        input.longitude,
        input.accuracyMeters || null,
        input.speedKmh || null,
        input.headingDeg || null,
        input.source || "driver_app",
        JSON.stringify(input.metadata || {}),
        recordedAt || null,
      ],
    );

    await this.recordEvent({
      merchantId: input.merchantId,
      orderRef: input.orderRef,
      eventType: "driver.location",
      source: input.source || "driver_app",
      payload: {
        locationTimelineId: row.rows[0].id,
        latitude: Number(row.rows[0].latitude || input.latitude),
        longitude: Number(row.rows[0].longitude || input.longitude),
      },
      eventTime: row.rows[0].recorded_at.toISOString(),
    });

    return {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      shipmentId: ctx.shipmentId,
      location: {
        id: row.rows[0].id,
        latitude: Number(row.rows[0].latitude || 0),
        longitude: Number(row.rows[0].longitude || 0),
        accuracyMeters:
          row.rows[0].accuracy_meters !== null
            ? Number(row.rows[0].accuracy_meters)
            : null,
        speedKmh:
          row.rows[0].speed_kmh !== null ? Number(row.rows[0].speed_kmh) : null,
        headingDeg:
          row.rows[0].heading_deg !== null
            ? Number(row.rows[0].heading_deg)
            : null,
        source: row.rows[0].source,
        metadata: row.rows[0].metadata || {},
        recordedAt: row.rows[0].recorded_at,
      },
    };
  }

  async recordSlaEvent(input: {
    merchantId: string;
    orderRef: string;
    slaType: string;
    status: "OK" | "AT_RISK" | "BREACHED";
    targetAt?: string;
    observedAt?: string;
    minutesDelta?: number;
    reason?: string;
    metadata?: Record<string, any>;
  }) {
    const normalizedSlaType = String(input.slaType || "").trim();
    if (!normalizedSlaType) {
      throw new BadRequestException("slaType is required");
    }

    if (!["OK", "AT_RISK", "BREACHED"].includes(input.status)) {
      throw new BadRequestException(
        "status must be one of OK, AT_RISK, BREACHED",
      );
    }

    if (
      input.minutesDelta !== undefined &&
      (!Number.isFinite(input.minutesDelta) ||
        input.minutesDelta < -10080 ||
        input.minutesDelta > 10080)
    ) {
      throw new BadRequestException(
        "minutesDelta must be between -10080 and 10080",
      );
    }

    this.assertJsonWithinLimit(
      input.metadata,
      MAX_DELIVERY_METADATA_BYTES,
      "sla metadata",
    );

    const targetAt = this.normalizeTimestamp(input.targetAt, "targetAt");
    const observedAt = this.normalizeTimestamp(input.observedAt, "observedAt");

    const ctx = await this.resolveOrderContext(
      input.merchantId,
      input.orderRef,
    );

    const result = await this.pool.query<{
      id: string;
      sla_type: string;
      status: string;
      target_at: Date | null;
      observed_at: Date;
      minutes_delta: number | null;
      reason: string | null;
      metadata: Record<string, any>;
    }>(
      `INSERT INTO delivery_sla_events (
         merchant_id,
         order_id,
         shipment_id,
         sla_type,
         status,
         target_at,
         observed_at,
         minutes_delta,
         reason,
         metadata
       ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, COALESCE($7::timestamptz, NOW()), $8, $9, $10::jsonb)
       RETURNING
         id::text as id,
         sla_type,
         status,
         target_at,
         observed_at,
         minutes_delta,
         reason,
         metadata`,
      [
        input.merchantId,
        ctx.orderId,
        ctx.shipmentId,
        normalizedSlaType,
        input.status,
        targetAt || null,
        observedAt || null,
        input.minutesDelta ?? null,
        input.reason || null,
        JSON.stringify(input.metadata || {}),
      ],
    );

    await this.recordEvent({
      merchantId: input.merchantId,
      orderRef: input.orderRef,
      eventType: "sla.updated",
      source: "system",
      payload: {
        slaEventId: result.rows[0].id,
        slaType: result.rows[0].sla_type,
        status: result.rows[0].status,
      },
      eventTime: result.rows[0].observed_at.toISOString(),
    });

    return {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      shipmentId: ctx.shipmentId,
      slaEvent: {
        id: result.rows[0].id,
        slaType: result.rows[0].sla_type,
        status: result.rows[0].status,
        targetAt: result.rows[0].target_at,
        observedAt: result.rows[0].observed_at,
        minutesDelta: result.rows[0].minutes_delta,
        reason: result.rows[0].reason,
        metadata: result.rows[0].metadata || {},
      },
    };
  }

  async getTimeline(merchantId: string, orderRef: string) {
    const ctx = await this.resolveOrderContext(merchantId, orderRef);

    const [events, pod, locations, sla] = await Promise.all([
      this.pool.query(
        `SELECT
           id::text as id,
           event_type,
           source,
           status,
           event_time,
           payload,
           correlation_id
         FROM delivery_execution_events
         WHERE merchant_id = $1 AND order_id = $2
         ORDER BY event_time DESC
         LIMIT 300`,
        [merchantId, ctx.orderId],
      ),
      this.pool.query(
        `SELECT
           id::text as id,
           proof_type,
           proof_url,
           proof_payload,
           captured_by,
           captured_at,
           dispute_status,
           disputed_at,
           dispute_note
         FROM delivery_pod_records
         WHERE merchant_id = $1 AND order_id = $2
         ORDER BY captured_at DESC
         LIMIT 50`,
        [merchantId, ctx.orderId],
      ),
      this.pool.query(
        `SELECT
           id::text as id,
           latitude,
           longitude,
           accuracy_meters,
           speed_kmh,
           heading_deg,
           source,
           metadata,
           recorded_at
         FROM delivery_location_timeline
         WHERE merchant_id = $1 AND order_id = $2
         ORDER BY recorded_at DESC
         LIMIT 500`,
        [merchantId, ctx.orderId],
      ),
      this.pool.query(
        `SELECT
           id::text as id,
           sla_type,
           status,
           target_at,
           observed_at,
           minutes_delta,
           reason,
           metadata
         FROM delivery_sla_events
         WHERE merchant_id = $1 AND order_id = $2
         ORDER BY observed_at DESC
         LIMIT 150`,
        [merchantId, ctx.orderId],
      ),
    ]);

    return {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      shipmentId: ctx.shipmentId,
      timeline: {
        events: events.rows,
        pod: pod.rows,
        locations: locations.rows,
        slaEvents: sla.rows,
      },
    };
  }

  async getLiveSnapshot(merchantId: string, orderRef: string) {
    const ctx = await this.resolveOrderContext(merchantId, orderRef);

    const [latestEvent, latestLocation, latestSla, latestPod] =
      await Promise.all([
        this.pool.query<{
          id: string;
          event_type: string;
          source: string;
          status: string;
          event_time: Date;
          payload: Record<string, any>;
          correlation_id: string | null;
        }>(
          `SELECT
             id::text as id,
             event_type,
             source,
             status,
             event_time,
             payload,
             correlation_id
           FROM delivery_execution_events
           WHERE merchant_id = $1
             AND order_id = $2
           ORDER BY event_time DESC
           LIMIT 1`,
          [merchantId, ctx.orderId],
        ),
        this.pool.query<{
          id: string;
          latitude: string;
          longitude: string;
          accuracy_meters: string | null;
          speed_kmh: string | null;
          heading_deg: string | null;
          source: string;
          metadata: Record<string, any>;
          recorded_at: Date;
        }>(
          `SELECT
             id::text as id,
             latitude::text as latitude,
             longitude::text as longitude,
             accuracy_meters::text as accuracy_meters,
             speed_kmh::text as speed_kmh,
             heading_deg::text as heading_deg,
             source,
             metadata,
             recorded_at
           FROM delivery_location_timeline
           WHERE merchant_id = $1
             AND order_id = $2
           ORDER BY recorded_at DESC
           LIMIT 1`,
          [merchantId, ctx.orderId],
        ),
        this.pool.query<{
          id: string;
          sla_type: string;
          status: "OK" | "AT_RISK" | "BREACHED";
          target_at: Date | null;
          observed_at: Date;
          minutes_delta: number | null;
          reason: string | null;
          metadata: Record<string, any>;
        }>(
          `SELECT
             id::text as id,
             sla_type,
             status,
             target_at,
             observed_at,
             minutes_delta,
             reason,
             metadata
           FROM delivery_sla_events
           WHERE merchant_id = $1
             AND order_id = $2
           ORDER BY observed_at DESC
           LIMIT 1`,
          [merchantId, ctx.orderId],
        ),
        this.pool.query<{
          id: string;
          proof_type: string;
          captured_at: Date;
          dispute_status: string;
          disputed_at: Date | null;
          dispute_note: string | null;
        }>(
          `SELECT
             id::text as id,
             proof_type,
             captured_at,
             dispute_status,
             disputed_at,
             dispute_note
           FROM delivery_pod_records
           WHERE merchant_id = $1
             AND order_id = $2
           ORDER BY captured_at DESC
           LIMIT 1`,
          [merchantId, ctx.orderId],
        ),
      ]);

    const lastSlaStatus = latestSla.rows[0]?.status || null;
    const lastPodDispute = String(
      latestPod.rows[0]?.dispute_status || "NONE",
    ).toUpperCase();

    return {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      shipmentId: ctx.shipmentId,
      snapshot: {
        lastEvent: latestEvent.rows[0] || null,
        lastLocation: latestLocation.rows[0] && {
          ...latestLocation.rows[0],
          latitude: Number(latestLocation.rows[0].latitude || 0),
          longitude: Number(latestLocation.rows[0].longitude || 0),
          accuracy_meters:
            latestLocation.rows[0].accuracy_meters !== null
              ? Number(latestLocation.rows[0].accuracy_meters)
              : null,
          speed_kmh:
            latestLocation.rows[0].speed_kmh !== null
              ? Number(latestLocation.rows[0].speed_kmh)
              : null,
          heading_deg:
            latestLocation.rows[0].heading_deg !== null
              ? Number(latestLocation.rows[0].heading_deg)
              : null,
        },
        lastSla: latestSla.rows[0] || null,
        lastPod: latestPod.rows[0] || null,
        flags: {
          atRisk: lastSlaStatus === "AT_RISK" || lastSlaStatus === "BREACHED",
          breached: lastSlaStatus === "BREACHED",
          podDisputed: lastPodDispute === "OPEN",
        },
      },
    };
  }

  private normalizeTimestamp(
    raw: string | undefined,
    fieldName: string,
  ): string | undefined {
    if (!raw) {
      return undefined;
    }

    const ts = new Date(raw);
    if (Number.isNaN(ts.getTime())) {
      throw new BadRequestException(
        `${fieldName} must be a valid ISO timestamp`,
      );
    }

    // Guardrails against accidental historical/future timestamp pollution.
    const now = Date.now();
    const maxFutureMs = 15 * 60 * 1000;
    const maxPastMs = 90 * 24 * 60 * 60 * 1000;
    if (ts.getTime() > now + maxFutureMs) {
      throw new BadRequestException(`${fieldName} cannot be in the far future`);
    }
    if (ts.getTime() < now - maxPastMs) {
      throw new BadRequestException(
        `${fieldName} is too old for runtime ingestion`,
      );
    }

    return ts.toISOString();
  }

  private assertJsonWithinLimit(
    value: Record<string, any> | undefined,
    maxBytes: number,
    label: string,
  ): void {
    if (!value) {
      return;
    }
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
      throw new BadRequestException(`${label} exceeds allowed size`);
    }
  }

  private async resolveOrderContext(
    merchantId: string,
    orderRef: string,
  ): Promise<OrderContext> {
    const normalized = String(orderRef || "").trim();
    if (!normalized) {
      throw new BadRequestException("orderId is required");
    }

    const result = await this.pool.query<{
      order_id: string;
      order_number: string;
      shipment_id: string | null;
    }>(
      `SELECT
         o.id::text as order_id,
         o.order_number,
         s.id::text as shipment_id
       FROM orders o
       LEFT JOIN LATERAL (
         SELECT id
         FROM shipments
         WHERE order_id = o.id
         ORDER BY created_at DESC
         LIMIT 1
       ) s ON true
       WHERE o.merchant_id = $1
         AND (o.id::text = $2 OR o.order_number = $2)
       LIMIT 1`,
      [merchantId, normalized],
    );

    if (!result.rows.length) {
      throw new NotFoundException("Order not found");
    }

    return {
      orderId: result.rows[0].order_id,
      orderNumber: result.rows[0].order_number,
      shipmentId: result.rows[0].shipment_id || null,
    };
  }
}
