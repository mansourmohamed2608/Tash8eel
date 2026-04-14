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
type PodDisputeQueueStatus = "OPEN" | "RESOLVED" | "ALL";
export type DeliveryDriverExceptionType =
  | "BREACHED_SLA"
  | "STALE_TRACKING"
  | "OPEN_POD_DISPUTE"
  | "UNASSIGNED";

type DeliverySlaRemediationState =
  | "PENDING_ACK"
  | "ACKNOWLEDGED"
  | "ESCALATION_REQUIRED"
  | "RECOVERED";

type DeliverySlaEscalationLevel = "L0" | "L1" | "L2" | "L3";

interface OrderContext {
  orderId: string;
  orderNumber: string;
  shipmentId: string | null;
}

interface SlaBreachProjection {
  breach_event_id: string;
  order_id: string;
  order_number: string;
  order_status: string;
  branch_id: string | null;
  assigned_driver_id: string | null;
  sla_type: string;
  target_at: Date | null;
  observed_at: Date;
  minutes_delta: number | null;
  reason: string | null;
  metadata: Record<string, any> | null;
  recovered: boolean;
  total_count?: string;
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

  async resolvePodDispute(input: {
    merchantId: string;
    orderRef: string;
    podId: string;
    resolutionNote?: string;
    resolvedBy?: string;
    resolvedAt?: string;
  }) {
    const ctx = await this.resolveOrderContext(
      input.merchantId,
      input.orderRef,
    );
    const resolvedAt = this.normalizeTimestamp(input.resolvedAt, "resolvedAt");
    const resolutionNote = String(input.resolutionNote || "").trim() || null;

    const result = await this.pool.query<{
      id: string;
      dispute_status: string;
      disputed_at: Date | null;
      dispute_note: string | null;
      updated_at: Date;
    }>(
      `UPDATE delivery_pod_records
       SET dispute_status = 'RESOLVED',
           dispute_note = COALESCE($5, dispute_note),
           disputed_at = COALESCE(disputed_at, $4::timestamptz, NOW()),
           updated_at = NOW()
       WHERE merchant_id = $1
         AND order_id = $2
         AND id::text = $3
         AND dispute_status = 'OPEN'
       RETURNING
         id::text as id,
         dispute_status,
         disputed_at,
         dispute_note,
         updated_at`,
      [
        input.merchantId,
        ctx.orderId,
        input.podId,
        resolvedAt || null,
        resolutionNote,
      ],
    );

    if (!result.rows.length) {
      const existing = await this.pool.query<{ dispute_status: string }>(
        `SELECT dispute_status
         FROM delivery_pod_records
         WHERE merchant_id = $1
           AND order_id = $2
           AND id::text = $3
         LIMIT 1`,
        [input.merchantId, ctx.orderId, input.podId],
      );

      if (!existing.rows.length) {
        throw new NotFoundException("POD record not found");
      }

      throw new BadRequestException("POD dispute is not open");
    }

    await this.recordEvent({
      merchantId: input.merchantId,
      orderRef: input.orderRef,
      eventType: "delivery.disputed",
      source: "system",
      status: "RESOLVED",
      payload: {
        podId: result.rows[0].id,
        disputeStatus: result.rows[0].dispute_status,
        resolutionNote: result.rows[0].dispute_note,
        resolvedBy: String(input.resolvedBy || "").trim() || null,
      },
      eventTime: result.rows[0].updated_at.toISOString(),
    });

    return {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      shipmentId: ctx.shipmentId,
      dispute: {
        podId: result.rows[0].id,
        status: result.rows[0].dispute_status,
        disputedAt: result.rows[0].disputed_at,
        resolutionNote: result.rows[0].dispute_note,
        resolvedBy: String(input.resolvedBy || "").trim() || null,
        resolvedAt: result.rows[0].updated_at,
      },
    };
  }

  async listPodDisputesQueue(input: {
    merchantId: string;
    branchId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const safeLimit = Math.max(1, Math.min(Number(input.limit || 50), 200));
    const safeOffset = Math.max(0, Number(input.offset || 0));
    const branchId = String(input.branchId || "").trim() || null;
    const status = this.normalizePodDisputeQueueStatus(input.status);

    const rows = await this.pool.query<{
      pod_id: string;
      order_id: string;
      order_number: string;
      order_status: string;
      branch_id: string | null;
      assigned_driver_id: string | null;
      proof_type: string;
      proof_url: string | null;
      captured_at: Date;
      dispute_status: string;
      disputed_at: Date | null;
      dispute_note: string | null;
      total_count: string;
    }>(
      `SELECT
         p.id::text as pod_id,
         p.order_id::text as order_id,
         o.order_number,
         o.status::text as order_status,
         NULLIF(to_jsonb(o)->>'branch_id', '') as branch_id,
         NULLIF(to_jsonb(o)->>'assigned_driver_id', '') as assigned_driver_id,
         p.proof_type,
         p.proof_url,
         p.captured_at,
         p.dispute_status,
         p.disputed_at,
         p.dispute_note,
         COUNT(*) OVER()::text as total_count
       FROM delivery_pod_records p
       JOIN orders o
         ON o.id::text = p.order_id::text
        AND o.merchant_id = p.merchant_id
       WHERE p.merchant_id = $1
         AND ($2::text IS NULL OR COALESCE(NULLIF(to_jsonb(o)->>'branch_id', ''), '') = $2)
         AND ($3::text = 'ALL' OR p.dispute_status = $3)
       ORDER BY COALESCE(p.disputed_at, p.updated_at, p.captured_at) DESC
       LIMIT $4 OFFSET $5`,
      [input.merchantId, branchId, status, safeLimit, safeOffset],
    );

    const total = Number(rows.rows[0]?.total_count || 0);
    const items = rows.rows.map((row) => ({
      podId: row.pod_id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      orderStatus: row.order_status,
      branchId: row.branch_id,
      assignedDriverId: row.assigned_driver_id,
      proofType: row.proof_type,
      proofUrl: row.proof_url,
      capturedAt: row.captured_at,
      disputeStatus: row.dispute_status,
      disputedAt: row.disputed_at,
      disputeNote: row.dispute_note,
    }));

    return {
      branchId,
      status,
      total,
      limit: safeLimit,
      offset: safeOffset,
      paging: {
        limit: safeLimit,
        offset: safeOffset,
        hasMore: safeOffset + items.length < total,
      },
      items,
    };
  }

  async resolvePodDisputesBatch(input: {
    merchantId: string;
    podIds: string[];
    resolvedBy?: string;
    resolutionNote?: string;
  }) {
    const podIds = this.normalizePodDisputeBatchIds(input.podIds);
    const normalizedResolvedBy = String(input.resolvedBy || "").trim() || null;
    const resolutionNote = String(input.resolutionNote || "").trim() || null;

    const existing = await this.pool.query<{
      pod_id: string;
      order_id: string;
      order_number: string;
      order_status: string;
      branch_id: string | null;
      assigned_driver_id: string | null;
      shipment_id: string | null;
      dispute_status: string;
      disputed_at: Date | null;
      dispute_note: string | null;
    }>(
      `SELECT
         p.id::text as pod_id,
         p.order_id::text as order_id,
         o.order_number,
         o.status::text as order_status,
         NULLIF(to_jsonb(o)->>'branch_id', '') as branch_id,
         NULLIF(to_jsonb(o)->>'assigned_driver_id', '') as assigned_driver_id,
         p.shipment_id::text as shipment_id,
         p.dispute_status,
         p.disputed_at,
         p.dispute_note
       FROM delivery_pod_records p
       JOIN orders o
         ON o.id::text = p.order_id::text
        AND o.merchant_id = p.merchant_id
       WHERE p.merchant_id = $1
         AND p.id::text = ANY($2::text[])`,
      [input.merchantId, podIds],
    );

    const existingByPodId = new Map(
      existing.rows.map((row) => [row.pod_id, row]),
    );
    const openPodIds = existing.rows
      .filter(
        (row) => String(row.dispute_status || "").toUpperCase() === "OPEN",
      )
      .map((row) => row.pod_id);

    let resolvedRows: Array<{
      pod_id: string;
      order_id: string;
      shipment_id: string | null;
      dispute_status: string;
      disputed_at: Date | null;
      dispute_note: string | null;
      updated_at: Date;
    }> = [];

    if (openPodIds.length) {
      const updated = await this.pool.query<{
        pod_id: string;
        order_id: string;
        shipment_id: string | null;
        dispute_status: string;
        disputed_at: Date | null;
        dispute_note: string | null;
        updated_at: Date;
      }>(
        `UPDATE delivery_pod_records
         SET dispute_status = 'RESOLVED',
             dispute_note = COALESCE($3, dispute_note),
             disputed_at = COALESCE(disputed_at, NOW()),
             updated_at = NOW()
         WHERE merchant_id = $1
           AND id::text = ANY($2::text[])
           AND dispute_status = 'OPEN'
         RETURNING
           id::text as pod_id,
           order_id::text as order_id,
           shipment_id::text as shipment_id,
           dispute_status,
           disputed_at,
           dispute_note,
           updated_at`,
        [input.merchantId, openPodIds, resolutionNote],
      );
      resolvedRows = updated.rows;
    }

    for (const row of resolvedRows) {
      await this.pool.query(
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
         ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), $8::jsonb, NULL)`,
        [
          input.merchantId,
          row.order_id,
          row.shipment_id,
          "delivery.disputed",
          "system",
          "RESOLVED",
          row.updated_at,
          JSON.stringify({
            podId: row.pod_id,
            disputeStatus: row.dispute_status,
            resolutionNote: row.dispute_note,
            resolvedBy: normalizedResolvedBy,
          }),
        ],
      );
    }

    const resolvedByPodId = new Map(
      resolvedRows.map((row) => [row.pod_id, row]),
    );

    const items = podIds.map((podId) => {
      const existingRow = existingByPodId.get(podId);
      const resolvedRow = resolvedByPodId.get(podId);

      if (resolvedRow) {
        const orderRow = existingRow || null;
        return {
          podId,
          orderId: resolvedRow.order_id,
          orderNumber: orderRow?.order_number || null,
          orderStatus: orderRow?.order_status || null,
          branchId: orderRow?.branch_id || null,
          assignedDriverId: orderRow?.assigned_driver_id || null,
          disputeStatus: resolvedRow.dispute_status,
          disputedAt: resolvedRow.disputed_at,
          disputeNote: resolvedRow.dispute_note,
          resolvedAt: resolvedRow.updated_at,
          resolvedBy: normalizedResolvedBy,
          resolved: true,
          skipped: false,
          skipReason: null,
        };
      }

      if (!existingRow) {
        return {
          podId,
          orderId: null,
          orderNumber: null,
          orderStatus: null,
          branchId: null,
          assignedDriverId: null,
          disputeStatus: null,
          disputedAt: null,
          disputeNote: null,
          resolvedAt: null,
          resolvedBy: null,
          resolved: false,
          skipped: true,
          skipReason: "NOT_FOUND",
        };
      }

      return {
        podId,
        orderId: existingRow.order_id,
        orderNumber: existingRow.order_number,
        orderStatus: existingRow.order_status,
        branchId: existingRow.branch_id,
        assignedDriverId: existingRow.assigned_driver_id,
        disputeStatus: existingRow.dispute_status,
        disputedAt: existingRow.disputed_at,
        disputeNote: existingRow.dispute_note,
        resolvedAt: null,
        resolvedBy: null,
        resolved: false,
        skipped: true,
        skipReason: "NOT_OPEN",
      };
    });

    const resolvedCount = resolvedRows.length;

    return {
      total: podIds.length,
      resolvedCount,
      skippedCount: items.length - resolvedCount,
      resolutionNote,
      resolvedBy: normalizedResolvedBy,
      items,
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

  async getOpsLiveBoard(input: {
    merchantId: string;
    branchId?: string;
    limit?: number;
    includeCompleted?: boolean;
  }) {
    const safeLimit = Math.max(1, Math.min(Number(input.limit || 50), 200));
    const branchId = String(input.branchId || "").trim() || null;
    const includeCompleted = input.includeCompleted === true;
    const activeStatuses = [
      "CONFIRMED",
      "BOOKED",
      "SHIPPED",
      "OUT_FOR_DELIVERY",
    ];

    const params: any[] = [input.merchantId, branchId];
    let statusFilterSql = "";

    if (!includeCompleted) {
      params.push(activeStatuses);
      statusFilterSql = `AND UPPER(o.status::text) = ANY($${params.length}::text[])`;
    }

    params.push(safeLimit);
    const limitParam = params.length;

    const rows = await this.pool.query<{
      order_id: string;
      order_number: string;
      order_status: string;
      branch_id: string | null;
      assigned_driver_id: string | null;
      assigned_driver_name: string | null;
      created_at: Date;
      last_event_type: string | null;
      last_event_status: string | null;
      last_event_time: Date | null;
      last_location_at: Date | null;
      last_latitude: string | null;
      last_longitude: string | null;
      last_sla_status: string | null;
      last_sla_minutes_delta: number | null;
      last_sla_observed_at: Date | null;
      pod_dispute_status: string | null;
      pod_dispute_note: string | null;
    }>(
      `SELECT
         o.id::text as order_id,
         o.order_number,
         o.status::text as order_status,
         NULLIF(to_jsonb(o)->>'branch_id', '') as branch_id,
         NULLIF(to_jsonb(o)->>'assigned_driver_id', '') as assigned_driver_id,
         sdr.name as assigned_driver_name,
         o.created_at,
         ev.event_type as last_event_type,
         ev.status as last_event_status,
         ev.event_time as last_event_time,
         loc.recorded_at as last_location_at,
         loc.latitude::text as last_latitude,
         loc.longitude::text as last_longitude,
         sla.status as last_sla_status,
         sla.minutes_delta as last_sla_minutes_delta,
         sla.observed_at as last_sla_observed_at,
         pod.dispute_status as pod_dispute_status,
         pod.dispute_note as pod_dispute_note
       FROM orders o
       LEFT JOIN merchant_staff sdr
         ON sdr.merchant_id = o.merchant_id
        AND sdr.id::text = NULLIF(to_jsonb(o)->>'assigned_driver_id', '')
       LEFT JOIN LATERAL (
         SELECT event_type, status, event_time
         FROM delivery_execution_events
         WHERE merchant_id = o.merchant_id
           AND order_id::text = o.id::text
         ORDER BY event_time DESC
         LIMIT 1
       ) ev ON true
       LEFT JOIN LATERAL (
         SELECT latitude, longitude, recorded_at
         FROM delivery_location_timeline
         WHERE merchant_id = o.merchant_id
           AND order_id::text = o.id::text
         ORDER BY recorded_at DESC
         LIMIT 1
       ) loc ON true
       LEFT JOIN LATERAL (
         SELECT status, minutes_delta, observed_at
         FROM delivery_sla_events
         WHERE merchant_id = o.merchant_id
           AND order_id::text = o.id::text
         ORDER BY observed_at DESC
         LIMIT 1
       ) sla ON true
       LEFT JOIN LATERAL (
         SELECT dispute_status, dispute_note
         FROM delivery_pod_records
         WHERE merchant_id = o.merchant_id
           AND order_id::text = o.id::text
         ORDER BY captured_at DESC
         LIMIT 1
       ) pod ON true
       WHERE o.merchant_id = $1
         AND ($2::text IS NULL OR COALESCE(NULLIF(to_jsonb(o)->>'branch_id', ''), '') = $2)
         ${statusFilterSql}
       ORDER BY COALESCE(sla.observed_at, ev.event_time, o.created_at) DESC
       LIMIT $${limitParam}`,
      params,
    );

    const now = Date.now();
    const staleThresholdMs = 20 * 60 * 1000;

    const items = rows.rows.map((row) => {
      const normalizedStatus = String(row.order_status || "").toUpperCase();
      const lastLocationAt = row.last_location_at
        ? new Date(row.last_location_at)
        : null;
      const trackingStale =
        normalizedStatus === "OUT_FOR_DELIVERY" &&
        (!lastLocationAt || now - lastLocationAt.getTime() > staleThresholdMs);
      const podDisputed =
        String(row.pod_dispute_status || "NONE").toUpperCase() === "OPEN";
      const breached = String(row.last_sla_status || "") === "BREACHED";
      const atRisk =
        String(row.last_sla_status || "") === "AT_RISK" || breached;
      const unassigned =
        !row.assigned_driver_id && activeStatuses.includes(normalizedStatus);
      const needsAttention = breached || podDisputed || trackingStale;

      return {
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderStatus: row.order_status,
        branchId: row.branch_id,
        assignedDriver: row.assigned_driver_id
          ? {
              id: row.assigned_driver_id,
              name: row.assigned_driver_name,
            }
          : null,
        createdAt: row.created_at,
        lastEvent: row.last_event_type
          ? {
              type: row.last_event_type,
              status: row.last_event_status,
              at: row.last_event_time,
            }
          : null,
        lastLocation: row.last_location_at
          ? {
              at: row.last_location_at,
              latitude:
                row.last_latitude !== null ? Number(row.last_latitude) : null,
              longitude:
                row.last_longitude !== null ? Number(row.last_longitude) : null,
            }
          : null,
        lastSla: row.last_sla_status
          ? {
              status: row.last_sla_status,
              minutesDelta: row.last_sla_minutes_delta,
              observedAt: row.last_sla_observed_at,
            }
          : null,
        pod: row.pod_dispute_status
          ? {
              disputeStatus: row.pod_dispute_status,
              disputeNote: row.pod_dispute_note,
            }
          : null,
        flags: {
          atRisk,
          breached,
          podDisputed,
          trackingStale,
          unassigned,
          needsAttention,
        },
      };
    });

    const summary = items.reduce(
      (acc, item) => {
        if (item.flags.atRisk) acc.atRisk += 1;
        if (item.flags.breached) acc.breached += 1;
        if (item.flags.podDisputed) acc.podDisputed += 1;
        if (item.flags.trackingStale) acc.trackingStale += 1;
        if (item.flags.unassigned) acc.unassigned += 1;
        if (item.flags.needsAttention) acc.needsAttention += 1;
        return acc;
      },
      {
        total: items.length,
        atRisk: 0,
        breached: 0,
        podDisputed: 0,
        trackingStale: 0,
        unassigned: 0,
        needsAttention: 0,
      },
    );

    return {
      branchId,
      limit: safeLimit,
      includeCompleted,
      summary,
      items,
    };
  }

  async getDriverWorkloadBoard(input: {
    merchantId: string;
    branchId?: string;
    limit?: number;
    includeIdle?: boolean;
  }) {
    const safeLimit = Math.max(1, Math.min(Number(input.limit || 50), 200));
    const branchId = String(input.branchId || "").trim() || null;
    const includeIdle = input.includeIdle === true;
    const activeStatuses = [
      "CONFIRMED",
      "BOOKED",
      "SHIPPED",
      "OUT_FOR_DELIVERY",
    ];

    const rows = await this.pool.query<{
      driver_id: string;
      driver_name: string;
      driver_phone: string;
      driver_status: string;
      active_assigned_count: string;
      out_for_delivery_count: string;
      breached_sla_assigned_count: string;
      stale_tracking_assigned_count: string;
      last_location_at: Date | null;
      last_latitude: string | null;
      last_longitude: string | null;
    }>(
      `WITH assigned_orders AS (
         SELECT
           o.id::text as order_id,
           NULLIF(to_jsonb(o)->>'assigned_driver_id', '') as driver_id,
           UPPER(o.status::text) as order_status
         FROM orders o
         WHERE o.merchant_id = $1
           AND NULLIF(to_jsonb(o)->>'assigned_driver_id', '') IS NOT NULL
           AND UPPER(o.status::text) = ANY($5::text[])
           AND ($2::text IS NULL OR COALESCE(NULLIF(to_jsonb(o)->>'branch_id', ''), '') = $2)
       ),
       latest_sla AS (
         SELECT DISTINCT ON (s.order_id::text)
           s.order_id::text as order_id,
           s.status as sla_status
         FROM delivery_sla_events s
         JOIN assigned_orders ao
           ON ao.order_id = s.order_id::text
         WHERE s.merchant_id = $1
         ORDER BY s.order_id::text, s.observed_at DESC
       ),
       latest_location AS (
         SELECT DISTINCT ON (l.order_id::text)
           l.order_id::text as order_id,
           l.recorded_at,
           l.latitude::text as latitude,
           l.longitude::text as longitude
         FROM delivery_location_timeline l
         JOIN assigned_orders ao
           ON ao.order_id = l.order_id::text
         WHERE l.merchant_id = $1
         ORDER BY l.order_id::text, l.recorded_at DESC
       ),
       driver_metrics AS (
         SELECT
           ao.driver_id,
           COUNT(*)::int as active_assigned_count,
           COUNT(*) FILTER (
             WHERE ao.order_status = 'OUT_FOR_DELIVERY'
           )::int as out_for_delivery_count,
           COUNT(*) FILTER (
             WHERE ls.sla_status = 'BREACHED'
           )::int as breached_sla_assigned_count,
           COUNT(*) FILTER (
             WHERE ao.order_status = 'OUT_FOR_DELIVERY'
               AND (
                 ll.recorded_at IS NULL
                 OR ll.recorded_at < NOW() - INTERVAL '20 minutes'
               )
           )::int as stale_tracking_assigned_count
         FROM assigned_orders ao
         LEFT JOIN latest_sla ls
           ON ls.order_id = ao.order_id
         LEFT JOIN latest_location ll
           ON ll.order_id = ao.order_id
         GROUP BY ao.driver_id
       ),
       driver_last_location AS (
         SELECT
           ao.driver_id,
           ll.recorded_at as last_location_at,
           ll.latitude as last_latitude,
           ll.longitude as last_longitude,
           ROW_NUMBER() OVER (
             PARTITION BY ao.driver_id
             ORDER BY ll.recorded_at DESC NULLS LAST
           ) as rn
         FROM assigned_orders ao
         LEFT JOIN latest_location ll
           ON ll.order_id = ao.order_id
       )
       SELECT
         dd.id::text as driver_id,
         dd.name as driver_name,
         COALESCE(dd.whatsapp_number, dd.phone, '') as driver_phone,
         COALESCE(dd.status, 'UNKNOWN') as driver_status,
         COALESCE(dm.active_assigned_count, 0)::text as active_assigned_count,
         COALESCE(dm.out_for_delivery_count, 0)::text as out_for_delivery_count,
         COALESCE(dm.breached_sla_assigned_count, 0)::text as breached_sla_assigned_count,
         COALESCE(dm.stale_tracking_assigned_count, 0)::text as stale_tracking_assigned_count,
         dll.last_location_at,
         dll.last_latitude,
         dll.last_longitude
       FROM delivery_drivers dd
       LEFT JOIN driver_metrics dm
         ON dm.driver_id = dd.id::text
       LEFT JOIN driver_last_location dll
         ON dll.driver_id = dd.id::text
        AND dll.rn = 1
       WHERE dd.merchant_id = $1
         AND ($3::boolean = true OR COALESCE(dm.active_assigned_count, 0) > 0)
       ORDER BY
         COALESCE(dm.breached_sla_assigned_count, 0) DESC,
         COALESCE(dm.stale_tracking_assigned_count, 0) DESC,
         COALESCE(dm.out_for_delivery_count, 0) DESC,
         COALESCE(dm.active_assigned_count, 0) DESC,
         dd.created_at ASC
       LIMIT $4`,
      [input.merchantId, branchId, includeIdle, safeLimit, activeStatuses],
    );

    const items = rows.rows.map((row) => {
      const activeAssignedCount = Number(row.active_assigned_count || 0);
      const outForDeliveryCount = Number(row.out_for_delivery_count || 0);
      const breachedSlaAssignedCount = Number(
        row.breached_sla_assigned_count || 0,
      );
      const staleTrackingAssignedCount = Number(
        row.stale_tracking_assigned_count || 0,
      );
      const idle = activeAssignedCount === 0;

      return {
        driverId: row.driver_id,
        driverName: row.driver_name,
        driverPhone: row.driver_phone,
        driverStatus: row.driver_status,
        activeAssignedCount,
        outForDeliveryCount,
        breachedSlaAssignedCount,
        staleTrackingAssignedCount,
        lastLocation: row.last_location_at
          ? {
              at: row.last_location_at,
              latitude:
                row.last_latitude !== null ? Number(row.last_latitude) : null,
              longitude:
                row.last_longitude !== null ? Number(row.last_longitude) : null,
            }
          : null,
        flags: {
          idle,
          trackingStale: staleTrackingAssignedCount > 0,
          needsAttention:
            breachedSlaAssignedCount > 0 || staleTrackingAssignedCount > 0,
        },
      };
    });

    const summary = items.reduce(
      (acc, item) => {
        acc.totalDrivers += 1;
        acc.totalActiveAssigned += item.activeAssignedCount;
        acc.totalOutForDelivery += item.outForDeliveryCount;
        acc.totalBreachedSlaAssigned += item.breachedSlaAssignedCount;
        acc.totalStaleTrackingAssigned += item.staleTrackingAssignedCount;
        if (item.flags.idle) acc.idleDrivers += 1;
        if (item.flags.needsAttention) acc.driversNeedingAttention += 1;
        return acc;
      },
      {
        totalDrivers: 0,
        idleDrivers: 0,
        driversNeedingAttention: 0,
        totalActiveAssigned: 0,
        totalOutForDelivery: 0,
        totalBreachedSlaAssigned: 0,
        totalStaleTrackingAssigned: 0,
      },
    );

    return {
      branchId,
      includeIdle,
      limit: safeLimit,
      staleTrackingThresholdMinutes: 20,
      summary,
      items,
    };
  }

  async getDriverExceptionQueue(input: {
    merchantId: string;
    branchId?: string;
    exceptionTypes?: string[];
    limit?: number;
    offset?: number;
  }) {
    const safeLimit = Math.max(1, Math.min(Number(input.limit || 50), 200));
    const safeOffset = Math.max(0, Number(input.offset || 0));
    const branchId = String(input.branchId || "").trim() || null;
    const activeStatuses = [
      "CONFIRMED",
      "BOOKED",
      "SHIPPED",
      "OUT_FOR_DELIVERY",
    ];
    const exceptionTypes = this.normalizeDriverExceptionTypes(
      input.exceptionTypes,
    );
    const exceptionTypeFilterEnabled = exceptionTypes.length > 0;
    const includeBreachedSla = exceptionTypes.includes("BREACHED_SLA");
    const includeStaleTracking = exceptionTypes.includes("STALE_TRACKING");
    const includeOpenPodDispute = exceptionTypes.includes("OPEN_POD_DISPUTE");
    const includeUnassigned = exceptionTypes.includes("UNASSIGNED");

    const sharedParams: any[] = [
      input.merchantId,
      branchId,
      includeBreachedSla,
      includeStaleTracking,
      includeOpenPodDispute,
      includeUnassigned,
      activeStatuses,
      safeLimit,
      safeOffset,
      exceptionTypeFilterEnabled,
    ];

    const baseCteSql = `WITH active_orders AS (
         SELECT
           o.merchant_id,
           o.id::text as order_id,
           o.order_number,
           o.status::text as order_status,
           NULLIF(to_jsonb(o)->>'branch_id', '') as branch_id,
           NULLIF(to_jsonb(o)->>'assigned_driver_id', '') as assigned_driver_id,
           o.created_at
         FROM orders o
         WHERE o.merchant_id = $1
           AND UPPER(o.status::text) = ANY($7::text[])
           AND ($2::text IS NULL OR COALESCE(NULLIF(to_jsonb(o)->>'branch_id', ''), '') = $2)
       ),
       latest_sla AS (
         SELECT DISTINCT ON (s.order_id::text)
           s.order_id::text as order_id,
           s.status as sla_status,
           s.minutes_delta,
           s.observed_at
         FROM delivery_sla_events s
         JOIN active_orders ao
           ON ao.order_id = s.order_id::text
         WHERE s.merchant_id = $1
         ORDER BY s.order_id::text, s.observed_at DESC
       ),
       latest_location AS (
         SELECT DISTINCT ON (l.order_id::text)
           l.order_id::text as order_id,
           l.recorded_at,
           l.latitude::text as latitude,
           l.longitude::text as longitude
         FROM delivery_location_timeline l
         JOIN active_orders ao
           ON ao.order_id = l.order_id::text
         WHERE l.merchant_id = $1
         ORDER BY l.order_id::text, l.recorded_at DESC
       ),
       latest_pod AS (
         SELECT DISTINCT ON (p.order_id::text)
           p.order_id::text as order_id,
           p.dispute_status,
           p.dispute_note,
           p.disputed_at
         FROM delivery_pod_records p
         JOIN active_orders ao
           ON ao.order_id = p.order_id::text
         WHERE p.merchant_id = $1
         ORDER BY
           p.order_id::text,
           COALESCE(p.disputed_at, p.updated_at, p.captured_at) DESC
       ),
       enriched AS (
         SELECT
           ao.order_id,
           ao.order_number,
           ao.order_status,
           ao.branch_id,
           ao.assigned_driver_id,
           ao.created_at,
           COALESCE(dd.name, ms.name) as driver_name,
           dd.status as driver_status,
           ls.sla_status as last_sla_status,
           ls.minutes_delta as last_sla_minutes_delta,
           ls.observed_at as last_sla_observed_at,
           ll.recorded_at as last_location_at,
           ll.latitude as last_latitude,
           ll.longitude as last_longitude,
           lp.dispute_status as pod_dispute_status,
           lp.dispute_note as pod_dispute_note,
           lp.disputed_at as pod_disputed_at
         FROM active_orders ao
         LEFT JOIN delivery_drivers dd
           ON dd.merchant_id = ao.merchant_id
          AND dd.id::text = ao.assigned_driver_id
         LEFT JOIN merchant_staff ms
           ON ms.merchant_id = ao.merchant_id
          AND ms.id::text = ao.assigned_driver_id
         LEFT JOIN latest_sla ls
           ON ls.order_id = ao.order_id
         LEFT JOIN latest_location ll
           ON ll.order_id = ao.order_id
         LEFT JOIN latest_pod lp
           ON lp.order_id = ao.order_id
       ),
       flagged AS (
         SELECT
           e.*,
           (e.last_sla_status = 'BREACHED') as flag_breached_sla,
           (
             UPPER(e.order_status::text) = 'OUT_FOR_DELIVERY'
             AND (
               e.last_location_at IS NULL
               OR e.last_location_at < NOW() - INTERVAL '20 minutes'
             )
           ) as flag_stale_tracking,
           (COALESCE(UPPER(e.pod_dispute_status), 'NONE') = 'OPEN') as flag_open_pod_dispute,
           (e.assigned_driver_id IS NULL) as flag_unassigned
         FROM enriched e
       ),
       filtered AS (
         SELECT *
         FROM flagged f
         WHERE (
             f.flag_breached_sla
             OR f.flag_stale_tracking
             OR f.flag_open_pod_dispute
             OR f.flag_unassigned
           )
           AND (
             $10::boolean = false
             OR ($3::boolean = true AND f.flag_breached_sla)
             OR ($4::boolean = true AND f.flag_stale_tracking)
             OR ($5::boolean = true AND f.flag_open_pod_dispute)
             OR ($6::boolean = true AND f.flag_unassigned)
           )
       )`;

    const itemsRows = await this.pool.query<{
      order_id: string;
      order_number: string;
      order_status: string;
      branch_id: string | null;
      assigned_driver_id: string | null;
      driver_name: string | null;
      driver_status: string | null;
      created_at: Date;
      last_sla_status: string | null;
      last_sla_minutes_delta: number | null;
      last_sla_observed_at: Date | null;
      last_location_at: Date | null;
      last_latitude: string | null;
      last_longitude: string | null;
      pod_dispute_status: string | null;
      pod_dispute_note: string | null;
      flag_breached_sla: boolean;
      flag_stale_tracking: boolean;
      flag_open_pod_dispute: boolean;
      flag_unassigned: boolean;
      total_count: string;
    }>(
      `${baseCteSql}
       SELECT
         order_id,
         order_number,
         order_status,
         branch_id,
         assigned_driver_id,
         driver_name,
         driver_status,
         created_at,
         last_sla_status,
         last_sla_minutes_delta,
         last_sla_observed_at,
         last_location_at,
         last_latitude,
         last_longitude,
         pod_dispute_status,
         pod_dispute_note,
         flag_breached_sla,
         flag_stale_tracking,
         flag_open_pod_dispute,
         flag_unassigned,
         COUNT(*) OVER()::text as total_count
       FROM filtered
       ORDER BY
         GREATEST(
           CASE WHEN flag_breached_sla THEN 4 ELSE 0 END,
           CASE WHEN flag_open_pod_dispute THEN 3 ELSE 0 END,
           CASE WHEN flag_stale_tracking THEN 2 ELSE 0 END,
           CASE WHEN flag_unassigned THEN 1 ELSE 0 END
         ) DESC,
         COALESCE(last_sla_observed_at, last_location_at, created_at) DESC
       LIMIT $8 OFFSET $9`,
      sharedParams,
    );

    const summaryRows = await this.pool.query<{
      total_orders: string;
      total_drivers: string;
      breached_sla_orders: string;
      stale_tracking_orders: string;
      open_pod_dispute_orders: string;
      unassigned_orders: string;
    }>(
      `${baseCteSql}
       SELECT
         COUNT(*)::text as total_orders,
         COUNT(DISTINCT assigned_driver_id)::text as total_drivers,
         COUNT(*) FILTER (WHERE flag_breached_sla)::text as breached_sla_orders,
         COUNT(*) FILTER (WHERE flag_stale_tracking)::text as stale_tracking_orders,
         COUNT(*) FILTER (WHERE flag_open_pod_dispute)::text as open_pod_dispute_orders,
         COUNT(*) FILTER (WHERE flag_unassigned)::text as unassigned_orders
       FROM filtered`,
      sharedParams,
    );

    const driversRows = await this.pool.query<{
      assigned_driver_id: string | null;
      driver_name: string | null;
      driver_status: string | null;
      exception_orders: string;
      breached_sla_orders: string;
      stale_tracking_orders: string;
      open_pod_dispute_orders: string;
      unassigned_orders: string;
    }>(
      `${baseCteSql}
       SELECT
         assigned_driver_id,
         MAX(driver_name) as driver_name,
         MAX(driver_status) as driver_status,
         COUNT(*)::text as exception_orders,
         COUNT(*) FILTER (WHERE flag_breached_sla)::text as breached_sla_orders,
         COUNT(*) FILTER (WHERE flag_stale_tracking)::text as stale_tracking_orders,
         COUNT(*) FILTER (WHERE flag_open_pod_dispute)::text as open_pod_dispute_orders,
         COUNT(*) FILTER (WHERE flag_unassigned)::text as unassigned_orders
       FROM filtered
       GROUP BY assigned_driver_id
       ORDER BY COUNT(*) DESC, MAX(driver_name) ASC NULLS LAST
       LIMIT 200`,
      sharedParams,
    );

    const total = Number(itemsRows.rows[0]?.total_count || 0);

    const items = itemsRows.rows.map((row) => {
      const orderExceptionTypes: DeliveryDriverExceptionType[] = [];
      if (row.flag_breached_sla) orderExceptionTypes.push("BREACHED_SLA");
      if (row.flag_stale_tracking) orderExceptionTypes.push("STALE_TRACKING");
      if (row.flag_open_pod_dispute)
        orderExceptionTypes.push("OPEN_POD_DISPUTE");
      if (row.flag_unassigned) orderExceptionTypes.push("UNASSIGNED");

      return {
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderStatus: row.order_status,
        branchId: row.branch_id,
        createdAt: row.created_at,
        driver: row.assigned_driver_id
          ? {
              id: row.assigned_driver_id,
              name: row.driver_name,
              status: row.driver_status,
            }
          : null,
        lastSla: row.last_sla_status
          ? {
              status: row.last_sla_status,
              minutesDelta: row.last_sla_minutes_delta,
              observedAt: row.last_sla_observed_at,
            }
          : null,
        lastLocation: row.last_location_at
          ? {
              at: row.last_location_at,
              latitude:
                row.last_latitude !== null ? Number(row.last_latitude) : null,
              longitude:
                row.last_longitude !== null ? Number(row.last_longitude) : null,
            }
          : null,
        podDispute:
          String(row.pod_dispute_status || "").toUpperCase() === "OPEN"
            ? {
                status: row.pod_dispute_status,
                note: row.pod_dispute_note,
              }
            : null,
        exceptionTypes: orderExceptionTypes,
        flags: {
          breachedSla: row.flag_breached_sla,
          staleTracking: row.flag_stale_tracking,
          openPodDispute: row.flag_open_pod_dispute,
          unassigned: row.flag_unassigned,
        },
        remediation: this.buildDriverExceptionRemediation({
          breachedSla: row.flag_breached_sla,
          staleTracking: row.flag_stale_tracking,
          openPodDispute: row.flag_open_pod_dispute,
          unassigned: row.flag_unassigned,
        }),
      };
    });

    const summaryRow = summaryRows.rows[0] || {
      total_orders: "0",
      total_drivers: "0",
      breached_sla_orders: "0",
      stale_tracking_orders: "0",
      open_pod_dispute_orders: "0",
      unassigned_orders: "0",
    };

    const summary = {
      totalOrders: Number(summaryRow.total_orders || 0),
      totalDrivers: Number(summaryRow.total_drivers || 0),
      breachedSlaOrders: Number(summaryRow.breached_sla_orders || 0),
      staleTrackingOrders: Number(summaryRow.stale_tracking_orders || 0),
      openPodDisputeOrders: Number(summaryRow.open_pod_dispute_orders || 0),
      unassignedOrders: Number(summaryRow.unassigned_orders || 0),
    };

    const drivers = driversRows.rows.map((row) => ({
      driverId: row.assigned_driver_id,
      driverName: row.assigned_driver_id ? row.driver_name : "Unassigned",
      driverStatus: row.assigned_driver_id
        ? row.driver_status || "UNKNOWN"
        : "UNASSIGNED",
      exceptionOrders: Number(row.exception_orders || 0),
      breachedSlaOrders: Number(row.breached_sla_orders || 0),
      staleTrackingOrders: Number(row.stale_tracking_orders || 0),
      openPodDisputeOrders: Number(row.open_pod_dispute_orders || 0),
      unassignedOrders: Number(row.unassigned_orders || 0),
    }));

    return {
      branchId,
      exceptionTypes,
      limit: safeLimit,
      offset: safeOffset,
      staleTrackingThresholdMinutes: 20,
      total,
      paging: {
        limit: safeLimit,
        offset: safeOffset,
        hasMore: safeOffset + items.length < total,
      },
      summary,
      drivers,
      items,
    };
  }

  async listSlaBreaches(input: {
    merchantId: string;
    branchId?: string;
    limit?: number;
    offset?: number;
    includeRecovered?: boolean;
  }) {
    const safeLimit = Math.max(1, Math.min(Number(input.limit || 50), 200));
    const safeOffset = Math.max(0, Number(input.offset || 0));
    const branchId = String(input.branchId || "").trim() || null;
    const includeRecovered = input.includeRecovered === true;

    const rows = await this.pool.query<SlaBreachProjection>(
      `WITH breaches AS (
         SELECT
           b.id::text as breach_event_id,
           b.order_id::text as order_id,
           o.order_number,
           o.status::text as order_status,
           NULLIF(to_jsonb(o)->>'branch_id', '') as branch_id,
           NULLIF(to_jsonb(o)->>'assigned_driver_id', '') as assigned_driver_id,
           b.sla_type,
           b.target_at,
           b.observed_at,
           b.minutes_delta,
           b.reason,
           b.metadata,
           EXISTS (
             SELECT 1
             FROM delivery_sla_events ok
             WHERE ok.merchant_id = b.merchant_id
               AND ok.order_id::text = b.order_id::text
               AND ok.sla_type = b.sla_type
               AND ok.status = 'OK'
               AND ok.observed_at > b.observed_at
           ) as recovered
         FROM delivery_sla_events b
         JOIN orders o
           ON o.id::text = b.order_id::text
          AND o.merchant_id = b.merchant_id
         WHERE b.merchant_id = $1
           AND b.status = 'BREACHED'
           AND ($2::text IS NULL OR COALESCE(NULLIF(to_jsonb(o)->>'branch_id', ''), '') = $2)
       )
       SELECT
         breach_event_id,
         order_id,
         order_number,
         order_status,
         branch_id,
         assigned_driver_id,
         sla_type,
         target_at,
         observed_at,
         minutes_delta,
         reason,
         metadata,
         recovered,
         COUNT(*) OVER()::text as total_count
       FROM breaches
       WHERE ($5::boolean = true OR recovered = false)
       ORDER BY observed_at DESC
       LIMIT $3 OFFSET $4`,
      [input.merchantId, branchId, safeLimit, safeOffset, includeRecovered],
    );

    const total = Number(rows.rows[0]?.total_count || 0);
    const items: Array<Record<string, any>> = [];
    for (const row of rows.rows) {
      let metadata =
        row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      let remediation = this.buildSlaBreachRemediation({
        metadata,
        observedAt: row.observed_at,
        minutesDelta: row.minutes_delta,
        recovered: row.recovered,
      });

      if (remediation.state === "ESCALATION_REQUIRED") {
        const escalation = await this.ensureSlaEscalationLedgerAndEmitEvent({
          merchantId: input.merchantId,
          breachEventId: row.breach_event_id,
          orderId: row.order_id,
          orderNumber: row.order_number,
          slaType: row.sla_type,
          observedAt: row.observed_at,
          minutesDelta: row.minutes_delta,
          metadata,
        });

        metadata = escalation.metadata;
        remediation = this.buildSlaBreachRemediation({
          metadata,
          observedAt: row.observed_at,
          minutesDelta: row.minutes_delta,
          recovered: row.recovered,
        });
      }

      items.push({
        remediation,
        breachEventId: row.breach_event_id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        orderStatus: row.order_status,
        branchId: row.branch_id,
        assignedDriverId: row.assigned_driver_id,
        slaType: row.sla_type,
        targetAt: row.target_at,
        observedAt: row.observed_at,
        minutesDelta: row.minutes_delta,
        reason: row.reason,
        metadata,
        recovered: row.recovered,
      });
    }

    return {
      branchId,
      limit: safeLimit,
      offset: safeOffset,
      includeRecovered,
      total,
      items,
    };
  }

  async executeSlaEscalation(input: {
    merchantId: string;
    breachEventId: string;
    escalatedBy?: string;
    note?: string;
  }) {
    const breachEventId = String(input.breachEventId || "").trim();
    if (!breachEventId) {
      throw new BadRequestException("breachEventId is required");
    }

    const breach = await this.pool.query<SlaBreachProjection>(
      `SELECT
         b.id::text as breach_event_id,
         b.order_id::text as order_id,
         o.order_number,
         o.status::text as order_status,
         NULLIF(to_jsonb(o)->>'branch_id', '') as branch_id,
         NULLIF(to_jsonb(o)->>'assigned_driver_id', '') as assigned_driver_id,
         b.sla_type,
         b.target_at,
         b.observed_at,
         b.minutes_delta,
         b.reason,
         b.metadata,
         EXISTS (
           SELECT 1
           FROM delivery_sla_events ok
           WHERE ok.merchant_id = b.merchant_id
             AND ok.order_id::text = b.order_id::text
             AND ok.sla_type = b.sla_type
             AND ok.status = 'OK'
             AND ok.observed_at > b.observed_at
         ) as recovered
       FROM delivery_sla_events b
       JOIN orders o
         ON o.id::text = b.order_id::text
        AND o.merchant_id = b.merchant_id
       WHERE b.merchant_id = $1
         AND b.id::text = $2
         AND b.status = 'BREACHED'
       LIMIT 1`,
      [input.merchantId, breachEventId],
    );

    if (!breach.rows.length) {
      throw new NotFoundException("SLA breach event not found");
    }

    const row = breach.rows[0];
    let metadata =
      row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    let remediation = this.buildSlaBreachRemediation({
      metadata,
      observedAt: row.observed_at,
      minutesDelta: row.minutes_delta,
      recovered: row.recovered,
    });

    if (remediation.state !== "ESCALATION_REQUIRED") {
      return {
        breachEventId: row.breach_event_id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        executed: false,
        alreadyEscalated: remediation.alreadyEscalated,
        skippedReason: remediation.state,
        remediation,
        metadata,
      };
    }

    const escalation = await this.ensureSlaEscalationLedgerAndEmitEvent({
      merchantId: input.merchantId,
      breachEventId: row.breach_event_id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      slaType: row.sla_type,
      observedAt: row.observed_at,
      minutesDelta: row.minutes_delta,
      metadata,
      escalatedBy: input.escalatedBy,
      note: input.note,
    });

    metadata = escalation.metadata;
    remediation = this.buildSlaBreachRemediation({
      metadata,
      observedAt: row.observed_at,
      minutesDelta: row.minutes_delta,
      recovered: row.recovered,
    });

    return {
      breachEventId: row.breach_event_id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      executed: escalation.escalated,
      alreadyEscalated: remediation.alreadyEscalated,
      skippedReason: escalation.escalated ? null : "ALREADY_ESCALATED",
      remediation,
      metadata,
    };
  }

  async executeOpenSlaEscalations(input: {
    merchantId: string;
    branchId?: string;
    limit?: number;
    escalatedBy?: string;
    note?: string;
  }) {
    const safeLimit = Math.max(1, Math.min(Number(input.limit || 25), 100));
    const branchId = String(input.branchId || "").trim() || null;

    const rows = await this.pool.query<SlaBreachProjection>(
      `WITH breaches AS (
         SELECT
           b.id::text as breach_event_id,
           b.order_id::text as order_id,
           o.order_number,
           o.status::text as order_status,
           NULLIF(to_jsonb(o)->>'branch_id', '') as branch_id,
           NULLIF(to_jsonb(o)->>'assigned_driver_id', '') as assigned_driver_id,
           b.sla_type,
           b.target_at,
           b.observed_at,
           b.minutes_delta,
           b.reason,
           b.metadata,
           EXISTS (
             SELECT 1
             FROM delivery_sla_events ok
             WHERE ok.merchant_id = b.merchant_id
               AND ok.order_id::text = b.order_id::text
               AND ok.sla_type = b.sla_type
               AND ok.status = 'OK'
               AND ok.observed_at > b.observed_at
           ) as recovered
         FROM delivery_sla_events b
         JOIN orders o
           ON o.id::text = b.order_id::text
          AND o.merchant_id = b.merchant_id
         WHERE b.merchant_id = $1
           AND b.status = 'BREACHED'
           AND ($2::text IS NULL OR COALESCE(NULLIF(to_jsonb(o)->>'branch_id', ''), '') = $2)
       )
       SELECT
         breach_event_id,
         order_id,
         order_number,
         order_status,
         branch_id,
         assigned_driver_id,
         sla_type,
         target_at,
         observed_at,
         minutes_delta,
         reason,
         metadata,
         recovered
       FROM breaches
       WHERE recovered = false
       ORDER BY observed_at DESC
       LIMIT $3`,
      [input.merchantId, branchId, safeLimit],
    );

    let escalatedCount = 0;
    let alreadyEscalatedCount = 0;
    let skippedCount = 0;

    const items: Array<Record<string, any>> = [];

    for (const row of rows.rows) {
      let metadata =
        row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      let remediation = this.buildSlaBreachRemediation({
        metadata,
        observedAt: row.observed_at,
        minutesDelta: row.minutes_delta,
        recovered: row.recovered,
      });

      if (remediation.state !== "ESCALATION_REQUIRED") {
        skippedCount += 1;
        items.push({
          breachEventId: row.breach_event_id,
          orderId: row.order_id,
          orderNumber: row.order_number,
          executed: false,
          alreadyEscalated: remediation.alreadyEscalated,
          skippedReason: remediation.state,
          remediation,
          metadata,
        });
        continue;
      }

      const escalation = await this.ensureSlaEscalationLedgerAndEmitEvent({
        merchantId: input.merchantId,
        breachEventId: row.breach_event_id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        slaType: row.sla_type,
        observedAt: row.observed_at,
        minutesDelta: row.minutes_delta,
        metadata,
        escalatedBy: input.escalatedBy,
        note: input.note,
      });

      metadata = escalation.metadata;
      remediation = this.buildSlaBreachRemediation({
        metadata,
        observedAt: row.observed_at,
        minutesDelta: row.minutes_delta,
        recovered: row.recovered,
      });

      if (escalation.escalated) {
        escalatedCount += 1;
      } else {
        alreadyEscalatedCount += 1;
      }

      items.push({
        breachEventId: row.breach_event_id,
        orderId: row.order_id,
        orderNumber: row.order_number,
        executed: escalation.escalated,
        alreadyEscalated: remediation.alreadyEscalated,
        skippedReason: escalation.escalated ? null : "ALREADY_ESCALATED",
        remediation,
        metadata,
      });
    }

    return {
      branchId,
      limit: safeLimit,
      total: rows.rows.length,
      escalatedCount,
      alreadyEscalatedCount,
      skippedCount,
      items,
    };
  }

  async acknowledgeSlaBreach(input: {
    merchantId: string;
    breachEventId: string;
    acknowledgedBy?: string;
    note?: string;
  }) {
    const breachEventId = String(input.breachEventId || "").trim();
    if (!breachEventId) {
      throw new BadRequestException("breachEventId is required");
    }

    const normalizedAcknowledgedBy =
      String(input.acknowledgedBy || "").trim() || null;
    const noteProvided = input.note !== undefined;
    const normalizedNote = noteProvided
      ? String(input.note || "").trim() || null
      : undefined;

    const existing = await this.pool.query<{
      id: string;
      order_id: string;
      order_number: string;
      sla_type: string;
      status: string;
      observed_at: Date;
      metadata: Record<string, any> | null;
    }>(
      `SELECT
         b.id::text as id,
         b.order_id::text as order_id,
         o.order_number,
         b.sla_type,
         b.status,
         b.observed_at,
         b.metadata
       FROM delivery_sla_events b
       JOIN orders o
         ON o.id::text = b.order_id::text
        AND o.merchant_id = b.merchant_id
       WHERE b.merchant_id = $1
         AND b.id::text = $2
         AND b.status = 'BREACHED'
       LIMIT 1`,
      [input.merchantId, breachEventId],
    );

    if (!existing.rows.length) {
      throw new NotFoundException("SLA breach event not found");
    }

    const current = existing.rows[0];
    const currentMetadata =
      current.metadata && typeof current.metadata === "object"
        ? { ...current.metadata }
        : {};
    const existingAcknowledgedAt =
      String(currentMetadata.acknowledgedAt || "").trim() || null;
    const alreadyAcknowledged = Boolean(existingAcknowledgedAt);

    const nextMetadata: Record<string, any> = {
      ...currentMetadata,
      acknowledgedAt: existingAcknowledgedAt || new Date().toISOString(),
    };

    if (alreadyAcknowledged) {
      if (
        currentMetadata.acknowledgedBy !== undefined &&
        currentMetadata.acknowledgedBy !== null
      ) {
        nextMetadata.acknowledgedBy = currentMetadata.acknowledgedBy;
      }
    } else if (normalizedAcknowledgedBy) {
      nextMetadata.acknowledgedBy = normalizedAcknowledgedBy;
    }

    if (noteProvided) {
      nextMetadata.acknowledgementNote = normalizedNote;
    }

    const updated = await this.pool.query<{
      id: string;
      order_id: string;
      order_number: string;
      sla_type: string;
      status: string;
      observed_at: Date;
      metadata: Record<string, any> | null;
    }>(
      `UPDATE delivery_sla_events
       SET metadata = $3::jsonb,
           updated_at = NOW()
       WHERE merchant_id = $1
         AND id::text = $2
       RETURNING
         id::text as id,
         order_id::text as order_id,
         (SELECT o.order_number FROM orders o WHERE o.id::text = delivery_sla_events.order_id::text LIMIT 1) as order_number,
         sla_type,
         status,
         observed_at,
         metadata`,
      [input.merchantId, breachEventId, nextMetadata],
    );

    if (!updated.rows.length) {
      throw new NotFoundException("SLA breach event not found");
    }

    const metadata =
      updated.rows[0].metadata && typeof updated.rows[0].metadata === "object"
        ? updated.rows[0].metadata
        : {};

    return {
      breachEventId: updated.rows[0].id,
      orderId: updated.rows[0].order_id,
      orderNumber: updated.rows[0].order_number,
      slaType: updated.rows[0].sla_type,
      status: updated.rows[0].status,
      observedAt: updated.rows[0].observed_at,
      alreadyAcknowledged,
      acknowledgedAt: metadata.acknowledgedAt || null,
      acknowledgedBy: metadata.acknowledgedBy || null,
      note: metadata.acknowledgementNote || null,
      metadata,
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

  private normalizePodDisputeQueueStatus(
    rawStatus: string | undefined,
  ): PodDisputeQueueStatus {
    const normalized = String(rawStatus || "OPEN")
      .trim()
      .toUpperCase();
    if (!["OPEN", "RESOLVED", "ALL"].includes(normalized)) {
      throw new BadRequestException(
        "status must be one of OPEN, RESOLVED, ALL",
      );
    }
    return normalized as PodDisputeQueueStatus;
  }

  private buildSlaBreachRemediation(input: {
    metadata: Record<string, any>;
    observedAt: Date;
    minutesDelta: number | null;
    recovered: boolean;
  }): {
    state: DeliverySlaRemediationState;
    escalationLevel: DeliverySlaEscalationLevel;
    escalationRequired: boolean;
    recommendedAction:
      | "NO_ACTION"
      | "ACKNOWLEDGE_AND_TRIAGE"
      | "FOLLOW_UP_AND_MONITOR"
      | "ESCALATE_TO_DISPATCH_LEAD";
    responseDueAt: string;
    overdueForResponse: boolean;
    acknowledgedAt: string | null;
    acknowledgedBy: string | null;
    acknowledgementNote: string | null;
    firstEscalatedAt: string | null;
    firstEscalatedBy: string | null;
    escalatedBySystem: boolean;
    alreadyEscalated: boolean;
    minutesSinceObserved: number;
  } {
    const metadata = input.metadata || {};
    const acknowledgedAtRaw = String(metadata.acknowledgedAt || "").trim();
    const acknowledgedAt = acknowledgedAtRaw || null;
    const acknowledgedBy = String(metadata.acknowledgedBy || "").trim() || null;
    const acknowledgementNote =
      String(metadata.acknowledgementNote || "").trim() || null;
    const firstEscalatedAt =
      String(metadata.firstEscalatedAt || "").trim() || null;
    const firstEscalatedBy =
      String(metadata.firstEscalatedBy || "").trim() || null;
    const escalatedBySystem =
      metadata.escalatedBySystem === true ||
      String(metadata.escalatedBySystem || "")
        .trim()
        .toLowerCase() === "true";
    const isAcknowledged = Boolean(acknowledgedAt);
    const alreadyEscalated = Boolean(firstEscalatedAt);

    const nowMs = Date.now();
    const observedMs =
      input.observedAt instanceof Date
        ? input.observedAt.getTime()
        : Date.parse(String(input.observedAt));
    const minutesSinceObserved = Number.isFinite(observedMs)
      ? Math.max(0, Math.floor((nowMs - observedMs) / 60000))
      : 0;

    let severityScore = Math.max(0, Number(input.minutesDelta || 0));
    if (minutesSinceObserved >= 30) severityScore += 10;
    if (minutesSinceObserved >= 60) severityScore += 20;

    const escalationLevel: DeliverySlaEscalationLevel =
      severityScore >= 60
        ? "L3"
        : severityScore >= 30
          ? "L2"
          : severityScore >= 10
            ? "L1"
            : "L0";

    const responseWindowMinutes =
      escalationLevel === "L3"
        ? 10
        : escalationLevel === "L2"
          ? 20
          : escalationLevel === "L1"
            ? 30
            : 60;
    const responseDueAt = new Date(
      (Number.isFinite(observedMs) ? observedMs : nowMs) +
        responseWindowMinutes * 60000,
    ).toISOString();

    const escalationRequired =
      !input.recovered &&
      !isAcknowledged &&
      (escalationLevel === "L2" || escalationLevel === "L3");
    const overdueForResponse =
      !input.recovered && !isAcknowledged && nowMs > Date.parse(responseDueAt);

    const state: DeliverySlaRemediationState = input.recovered
      ? "RECOVERED"
      : isAcknowledged
        ? "ACKNOWLEDGED"
        : escalationRequired
          ? "ESCALATION_REQUIRED"
          : "PENDING_ACK";

    const recommendedAction =
      state === "RECOVERED"
        ? "NO_ACTION"
        : state === "ACKNOWLEDGED"
          ? "FOLLOW_UP_AND_MONITOR"
          : state === "ESCALATION_REQUIRED"
            ? alreadyEscalated
              ? "FOLLOW_UP_AND_MONITOR"
              : "ESCALATE_TO_DISPATCH_LEAD"
            : "ACKNOWLEDGE_AND_TRIAGE";

    return {
      state,
      escalationLevel,
      escalationRequired,
      recommendedAction,
      responseDueAt,
      overdueForResponse,
      acknowledgedAt,
      acknowledgedBy,
      acknowledgementNote,
      firstEscalatedAt,
      firstEscalatedBy,
      escalatedBySystem,
      alreadyEscalated,
      minutesSinceObserved,
    };
  }

  private async ensureSlaEscalationLedgerAndEmitEvent(input: {
    merchantId: string;
    breachEventId: string;
    orderId: string;
    orderNumber: string;
    slaType: string;
    observedAt: Date;
    minutesDelta: number | null;
    metadata: Record<string, any>;
    escalatedBy?: string;
    note?: string;
  }): Promise<{ escalated: boolean; metadata: Record<string, any> }> {
    const firstEscalatedAtExisting =
      String(input.metadata?.firstEscalatedAt || "").trim() || null;
    if (firstEscalatedAtExisting) {
      return {
        escalated: false,
        metadata: input.metadata,
      };
    }

    const escalatedAt = new Date().toISOString();
    const escalatedBy =
      String(input.escalatedBy || "system:delivery-sla-escalation").trim() ||
      "system:delivery-sla-escalation";
    const normalizedNote = String(input.note || "").trim() || null;

    const nextMetadata = {
      ...input.metadata,
      firstEscalatedAt: escalatedAt,
      firstEscalatedBy: escalatedBy,
      escalatedBySystem: escalatedBy.startsWith("system:"),
      ...(normalizedNote ? { escalationNote: normalizedNote } : {}),
    };

    const updated = await this.pool.query<{
      metadata: Record<string, any> | null;
    }>(
      `UPDATE delivery_sla_events
       SET metadata = $3::jsonb,
           updated_at = NOW()
       WHERE merchant_id = $1
         AND id::text = $2
         AND status = 'BREACHED'
         AND COALESCE(metadata->>'firstEscalatedAt', '') = ''
       RETURNING metadata`,
      [input.merchantId, input.breachEventId, nextMetadata],
    );

    if (!updated.rows.length) {
      return {
        escalated: false,
        metadata: input.metadata,
      };
    }

    const persistedMetadata =
      updated.rows[0].metadata && typeof updated.rows[0].metadata === "object"
        ? updated.rows[0].metadata
        : nextMetadata;

    await this.pool.query(
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
       ) VALUES ($1, $2, NULL, 'sla.updated', 'system', 'ESCALATION_REQUIRED', NOW(), $3::jsonb, $4)`,
      [
        input.merchantId,
        input.orderId,
        JSON.stringify({
          escalationState: "ESCALATION_REQUIRED",
          breachEventId: input.breachEventId,
          orderNumber: input.orderNumber,
          slaType: input.slaType,
          observedAt: input.observedAt,
          minutesDelta: input.minutesDelta,
          firstEscalatedAt: persistedMetadata.firstEscalatedAt,
          firstEscalatedBy: persistedMetadata.firstEscalatedBy,
          escalatedBySystem: persistedMetadata.escalatedBySystem,
          escalationNote:
            typeof persistedMetadata.escalationNote === "string"
              ? persistedMetadata.escalationNote
              : null,
        }),
        `sla-escalation:${input.breachEventId}`,
      ],
    );

    return {
      escalated: true,
      metadata: persistedMetadata,
    };
  }

  private buildDriverExceptionRemediation(flags: {
    breachedSla: boolean;
    staleTracking: boolean;
    openPodDispute: boolean;
    unassigned: boolean;
  }): {
    primaryAction:
      | "ASSIGN_DRIVER"
      | "ESCALATE_SLA_BREACH"
      | "CHECK_DRIVER_LOCATION"
      | "RESOLVE_POD_DISPUTE"
      | "REASSIGN_AND_ESCALATE"
      | "MONITOR";
    requiresManager: boolean;
    reasonCodes: string[];
  } {
    const reasonCodes: string[] = [];
    if (flags.breachedSla) reasonCodes.push("BREACHED_SLA");
    if (flags.staleTracking) reasonCodes.push("STALE_TRACKING");
    if (flags.openPodDispute) reasonCodes.push("OPEN_POD_DISPUTE");
    if (flags.unassigned) reasonCodes.push("UNASSIGNED");

    let primaryAction:
      | "ASSIGN_DRIVER"
      | "ESCALATE_SLA_BREACH"
      | "CHECK_DRIVER_LOCATION"
      | "RESOLVE_POD_DISPUTE"
      | "REASSIGN_AND_ESCALATE"
      | "MONITOR" = "MONITOR";

    if (flags.unassigned && (flags.breachedSla || flags.staleTracking)) {
      primaryAction = "REASSIGN_AND_ESCALATE";
    } else if (flags.unassigned) {
      primaryAction = "ASSIGN_DRIVER";
    } else if (flags.breachedSla) {
      primaryAction = "ESCALATE_SLA_BREACH";
    } else if (flags.staleTracking) {
      primaryAction = "CHECK_DRIVER_LOCATION";
    } else if (flags.openPodDispute) {
      primaryAction = "RESOLVE_POD_DISPUTE";
    }

    return {
      primaryAction,
      requiresManager:
        primaryAction === "ESCALATE_SLA_BREACH" ||
        primaryAction === "REASSIGN_AND_ESCALATE" ||
        primaryAction === "RESOLVE_POD_DISPUTE",
      reasonCodes,
    };
  }

  private normalizeDriverExceptionTypes(
    rawTypes: string[] | undefined,
  ): DeliveryDriverExceptionType[] {
    if (!rawTypes || rawTypes.length === 0) {
      return [];
    }

    const flattened: string[] = [];
    for (const rawType of rawTypes) {
      const parts = String(rawType || "").split(",");
      for (const part of parts) {
        flattened.push(part);
      }
    }

    const normalized = Array.from(
      new Set(
        flattened
          .map((rawType) =>
            String(rawType || "")
              .trim()
              .toUpperCase(),
          )
          .filter((rawType) => rawType.length > 0),
      ),
    );

    if (!normalized.length) {
      return [];
    }

    const allowed = new Set<DeliveryDriverExceptionType>([
      "BREACHED_SLA",
      "STALE_TRACKING",
      "OPEN_POD_DISPUTE",
      "UNASSIGNED",
    ]);

    const invalid = normalized.find(
      (rawType) => !allowed.has(rawType as DeliveryDriverExceptionType),
    );
    if (invalid) {
      throw new BadRequestException(
        "exceptionTypes must be one or more of BREACHED_SLA, STALE_TRACKING, OPEN_POD_DISPUTE, UNASSIGNED",
      );
    }

    return normalized as DeliveryDriverExceptionType[];
  }

  private normalizePodDisputeBatchIds(
    rawPodIds: string[] | undefined,
  ): string[] {
    if (!Array.isArray(rawPodIds) || rawPodIds.length === 0) {
      throw new BadRequestException("podIds must contain at least one id");
    }
    if (rawPodIds.length > 100) {
      throw new BadRequestException("podIds supports up to 100 ids per batch");
    }

    const normalized = Array.from(
      new Set(rawPodIds.map((podId) => String(podId || "").trim())),
    );
    const invalid = normalized.find((podId) => !this.isUuidishString(podId));

    if (invalid) {
      throw new BadRequestException(
        "podIds must contain non-empty UUID-like ids",
      );
    }

    return normalized;
  }

  private isUuidishString(value: string): boolean {
    return /^[a-fA-F0-9][a-fA-F0-9-]{7,63}$/.test(value);
  }
}
