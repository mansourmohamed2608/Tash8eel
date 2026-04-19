import { BadRequestException } from "@nestjs/common";
import { DeliveryExecutionService } from "./delivery-execution.service";

describe("DeliveryExecutionService", () => {
  it("resolves an open POD dispute and records lifecycle event", async () => {
    const now = new Date();
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: "order-1",
              order_number: "ORD-1",
              shipment_id: "shipment-1",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "pod-1",
              dispute_status: "RESOLVED",
              disputed_at: now,
              dispute_note: "Verified with customer",
              updated_at: now,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: "order-1",
              order_number: "ORD-1",
              shipment_id: "shipment-1",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "evt-1",
              event_type: "delivery.disputed",
              source: "system",
              status: "RESOLVED",
              event_time: now,
              payload: {},
              correlation_id: null,
            },
          ],
        }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.resolvePodDispute({
      merchantId: "m-1",
      orderRef: "order-1",
      podId: "pod-1",
      resolutionNote: "Verified with customer",
      resolvedBy: "ops-1",
    });

    expect(result.dispute.status).toBe("RESOLVED");
    expect(result.dispute.podId).toBe("pod-1");
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "UPDATE delivery_pod_records",
    );
    expect(String(pool.query.mock.calls[3][0])).toContain(
      "INSERT INTO delivery_execution_events",
    );
  });

  it("rejects resolving a dispute when POD dispute is not open", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: "order-1",
              order_number: "ORD-1",
              shipment_id: "shipment-1",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ dispute_status: "RESOLVED" }] }),
    } as any;

    const service = new DeliveryExecutionService(pool);

    await expect(
      service.resolvePodDispute({
        merchantId: "m-1",
        orderRef: "order-1",
        podId: "pod-1",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("builds live-board flags for high-risk delivery orders", async () => {
    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            order_id: "order-1",
            order_number: "ORD-1",
            order_status: "OUT_FOR_DELIVERY",
            branch_id: "branch-1",
            assigned_driver_id: null,
            assigned_driver_name: null,
            created_at: new Date(),
            last_event_type: "delivery.out_for_delivery",
            last_event_status: "RECORDED",
            last_event_time: new Date(),
            last_location_at: null,
            last_latitude: null,
            last_longitude: null,
            last_sla_status: "BREACHED",
            last_sla_minutes_delta: 22,
            last_sla_observed_at: new Date(),
            pod_dispute_status: "OPEN",
            pod_dispute_note: "Photo missing",
          },
        ],
      }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.getOpsLiveBoard({
      merchantId: "m-1",
      branchId: "branch-1",
      limit: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].flags.breached).toBe(true);
    expect(result.items[0].flags.trackingStale).toBe(true);
    expect(result.items[0].flags.unassigned).toBe(true);
    expect(result.summary.needsAttention).toBe(1);
  });

  it("builds driver workload board with counts and triage flags", async () => {
    const now = new Date();
    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            driver_id: "driver-1",
            driver_name: "Driver One",
            driver_phone: "+201111111111",
            driver_status: "ACTIVE",
            active_assigned_count: "3",
            out_for_delivery_count: "2",
            breached_sla_assigned_count: "1",
            stale_tracking_assigned_count: "1",
            last_location_at: now,
            last_latitude: "30.1234",
            last_longitude: "31.5678",
          },
        ],
      }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.getDriverWorkloadBoard({
      merchantId: "m-1",
      branchId: "branch-1",
      limit: 20,
      includeIdle: true,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      driverId: "driver-1",
      driverName: "Driver One",
      driverPhone: "+201111111111",
      driverStatus: "ACTIVE",
      activeAssignedCount: 3,
      outForDeliveryCount: 2,
      breachedSlaAssignedCount: 1,
      staleTrackingAssignedCount: 1,
    });
    expect(result.items[0].lastLocation).toEqual({
      at: now,
      latitude: 30.1234,
      longitude: 31.5678,
    });
    expect(result.items[0].flags.idle).toBe(false);
    expect(result.items[0].flags.trackingStale).toBe(true);
    expect(result.items[0].flags.needsAttention).toBe(true);
    expect(result.summary.totalDrivers).toBe(1);
    expect(result.summary.driversNeedingAttention).toBe(1);
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "WITH assigned_orders AS",
    );
    expect(pool.query.mock.calls[0][1]).toEqual([
      "m-1",
      "branch-1",
      true,
      20,
      ["CONFIRMED", "BOOKED", "SHIPPED", "OUT_FOR_DELIVERY"],
    ]);
  });

  it("acknowledges SLA breach idempotently and allows note overwrite", async () => {
    const observedAt = new Date("2026-04-13T09:30:00.000Z");
    const firstAcknowledgedAt = "2026-04-13T10:00:00.000Z";

    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "breach-1",
              order_id: "order-1",
              order_number: "ORD-1",
              sla_type: "dispatch_eta",
              status: "BREACHED",
              observed_at: observedAt,
              metadata: {},
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "breach-1",
              order_id: "order-1",
              order_number: "ORD-1",
              sla_type: "dispatch_eta",
              status: "BREACHED",
              observed_at: observedAt,
              metadata: {
                acknowledgedAt: firstAcknowledgedAt,
                acknowledgedBy: "ops-1",
                acknowledgementNote: "First note",
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "breach-1",
              order_id: "order-1",
              order_number: "ORD-1",
              sla_type: "dispatch_eta",
              status: "BREACHED",
              observed_at: observedAt,
              metadata: {
                acknowledgedAt: firstAcknowledgedAt,
                acknowledgedBy: "ops-1",
                acknowledgementNote: "First note",
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "breach-1",
              order_id: "order-1",
              order_number: "ORD-1",
              sla_type: "dispatch_eta",
              status: "BREACHED",
              observed_at: observedAt,
              metadata: {
                acknowledgedAt: firstAcknowledgedAt,
                acknowledgedBy: "ops-1",
                acknowledgementNote: "Updated note",
              },
            },
          ],
        }),
    } as any;

    const service = new DeliveryExecutionService(pool);

    const first = await service.acknowledgeSlaBreach({
      merchantId: "m-1",
      breachEventId: "breach-1",
      acknowledgedBy: "ops-1",
      note: "First note",
    });

    const second = await service.acknowledgeSlaBreach({
      merchantId: "m-1",
      breachEventId: "breach-1",
      acknowledgedBy: "ops-2",
      note: "Updated note",
    });

    expect(first.alreadyAcknowledged).toBe(false);
    expect(second.alreadyAcknowledged).toBe(true);
    expect(second.acknowledgedAt).toBe(firstAcknowledgedAt);
    expect(second.acknowledgedBy).toBe("ops-1");
    expect(second.note).toBe("Updated note");

    const secondUpdatePayload = pool.query.mock.calls[3][1][2];
    expect(secondUpdatePayload.acknowledgedAt).toBe(firstAcknowledgedAt);
    expect(secondUpdatePayload.acknowledgedBy).toBe("ops-1");
    expect(secondUpdatePayload.acknowledgementNote).toBe("Updated note");
  });

  it("derives deterministic escalation remediation for unacknowledged SLA breaches", async () => {
    const observedAt = new Date(Date.now() - 70 * 60 * 1000);
    const firstEscalatedAt = new Date(
      Date.now() - 20 * 60 * 1000,
    ).toISOString();
    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            breach_event_id: "breach-1",
            order_id: "order-1",
            order_number: "ORD-1",
            order_status: "OUT_FOR_DELIVERY",
            branch_id: "branch-1",
            assigned_driver_id: "driver-1",
            sla_type: "dispatch_eta",
            target_at: null,
            observed_at: observedAt,
            minutes_delta: 35,
            reason: "Driver delayed",
            metadata: {
              firstEscalatedAt,
              firstEscalatedBy: "system:delivery-sla-escalation",
              escalatedBySystem: true,
            },
            recovered: false,
            total_count: "1",
          },
        ],
      }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.listSlaBreaches({
      merchantId: "m-1",
      branchId: "branch-1",
      limit: 20,
      offset: 0,
      includeRecovered: false,
    });

    expect(result.total).toBe(1);
    expect(result.items[0].remediation).toMatchObject({
      state: "ESCALATION_REQUIRED",
      escalationRequired: true,
      recommendedAction: "FOLLOW_UP_AND_MONITOR",
      acknowledgedAt: null,
      acknowledgedBy: null,
      firstEscalatedAt,
      firstEscalatedBy: "system:delivery-sla-escalation",
      escalatedBySystem: true,
      alreadyEscalated: true,
    });
    expect(["L2", "L3"]).toContain(result.items[0].remediation.escalationLevel);
  });

  it("emits escalation event and records first escalation ledger fields once", async () => {
    const observedAt = new Date(Date.now() - 80 * 60 * 1000);
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              breach_event_id: "breach-3",
              order_id: "order-3",
              order_number: "ORD-3",
              order_status: "OUT_FOR_DELIVERY",
              branch_id: "branch-1",
              assigned_driver_id: "driver-3",
              sla_type: "dropoff_eta",
              target_at: null,
              observed_at: observedAt,
              minutes_delta: 40,
              reason: "Route blocked",
              metadata: {},
              recovered: false,
              total_count: "1",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              metadata: {
                firstEscalatedAt: new Date().toISOString(),
                firstEscalatedBy: "system:delivery-sla-escalation",
                escalatedBySystem: true,
              },
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.listSlaBreaches({
      merchantId: "m-1",
      limit: 20,
      offset: 0,
      includeRecovered: false,
    });

    expect(result.total).toBe(1);
    expect(result.items[0].metadata.firstEscalatedAt).toBeTruthy();
    expect(result.items[0].metadata.firstEscalatedBy).toBe(
      "system:delivery-sla-escalation",
    );
    expect(result.items[0].metadata.escalatedBySystem).toBe(true);

    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "UPDATE delivery_sla_events",
    );
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "COALESCE(metadata->>'firstEscalatedAt', '') = ''",
    );
    expect(String(pool.query.mock.calls[2][0])).toContain(
      "INSERT INTO delivery_execution_events",
    );
    expect(pool.query.mock.calls[2][1][3]).toBe("sla-escalation:breach-3");
    expect(String(pool.query.mock.calls[2][1][2])).toContain(
      "ESCALATION_REQUIRED",
    );
  });

  it("does not re-emit escalation event when breach is already escalated", async () => {
    const observedAt = new Date(Date.now() - 80 * 60 * 1000);
    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            breach_event_id: "breach-4",
            order_id: "order-4",
            order_number: "ORD-4",
            order_status: "OUT_FOR_DELIVERY",
            branch_id: "branch-1",
            assigned_driver_id: "driver-4",
            sla_type: "dropoff_eta",
            target_at: null,
            observed_at: observedAt,
            minutes_delta: 45,
            reason: "No answer",
            metadata: {
              firstEscalatedAt: "2026-04-13T08:00:00.000Z",
              firstEscalatedBy: "system:delivery-sla-escalation",
              escalatedBySystem: true,
            },
            recovered: false,
            total_count: "1",
          },
        ],
      }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.listSlaBreaches({
      merchantId: "m-1",
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.items[0].remediation.alreadyEscalated).toBe(true);
    expect(result.items[0].remediation.recommendedAction).toBe(
      "FOLLOW_UP_AND_MONITOR",
    );
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("executes SLA escalation for an eligible breach and records escalation actor", async () => {
    const observedAt = new Date(Date.now() - 90 * 60 * 1000);
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              breach_event_id: "breach-exec-1",
              order_id: "order-9",
              order_number: "ORD-9",
              order_status: "OUT_FOR_DELIVERY",
              branch_id: "branch-1",
              assigned_driver_id: "driver-9",
              sla_type: "dropoff_eta",
              target_at: null,
              observed_at: observedAt,
              minutes_delta: 42,
              reason: "Traffic jam",
              metadata: {},
              recovered: false,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              metadata: {
                firstEscalatedAt: new Date().toISOString(),
                firstEscalatedBy: "ops-manager",
                escalatedBySystem: false,
                escalationNote: "Manual dispatch escalation",
              },
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.executeSlaEscalation({
      merchantId: "m-1",
      breachEventId: "breach-exec-1",
      escalatedBy: "ops-manager",
      note: "Manual dispatch escalation",
    });

    expect(result.executed).toBe(true);
    expect(result.alreadyEscalated).toBe(true);
    expect(result.metadata.firstEscalatedBy).toBe("ops-manager");
    expect(result.metadata.escalatedBySystem).toBe(false);
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "UPDATE delivery_sla_events",
    );
    expect(String(pool.query.mock.calls[2][0])).toContain(
      "INSERT INTO delivery_execution_events",
    );
    expect(String(pool.query.mock.calls[2][1][2])).toContain(
      "Manual dispatch escalation",
    );
    expect(pool.query.mock.calls[2][1][3]).toBe("sla-escalation:breach-exec-1");
  });

  it("skips SLA escalation execution for acknowledged breaches", async () => {
    const observedAt = new Date(Date.now() - 20 * 60 * 1000);
    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            breach_event_id: "breach-exec-2",
            order_id: "order-10",
            order_number: "ORD-10",
            order_status: "OUT_FOR_DELIVERY",
            branch_id: "branch-1",
            assigned_driver_id: "driver-10",
            sla_type: "dispatch_eta",
            target_at: null,
            observed_at: observedAt,
            minutes_delta: 12,
            reason: "Minor delay",
            metadata: {
              acknowledgedAt: new Date().toISOString(),
              acknowledgedBy: "ops-1",
            },
            recovered: false,
          },
        ],
      }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.executeSlaEscalation({
      merchantId: "m-1",
      breachEventId: "breach-exec-2",
      escalatedBy: "ops-manager",
    });

    expect(result.executed).toBe(false);
    expect(result.skippedReason).toBe("ACKNOWLEDGED");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("executes open SLA escalations in batch with escalated/already/skipped counters", async () => {
    const oldObserved = new Date(Date.now() - 100 * 60 * 1000);
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              breach_event_id: "batch-1",
              order_id: "order-1",
              order_number: "ORD-1",
              order_status: "OUT_FOR_DELIVERY",
              branch_id: "branch-1",
              assigned_driver_id: "driver-1",
              sla_type: "dropoff_eta",
              target_at: null,
              observed_at: oldObserved,
              minutes_delta: 40,
              reason: "Route issue",
              metadata: {},
              recovered: false,
            },
            {
              breach_event_id: "batch-2",
              order_id: "order-2",
              order_number: "ORD-2",
              order_status: "OUT_FOR_DELIVERY",
              branch_id: "branch-1",
              assigned_driver_id: "driver-2",
              sla_type: "dropoff_eta",
              target_at: null,
              observed_at: oldObserved,
              minutes_delta: 35,
              reason: "Customer unavailable",
              metadata: {
                firstEscalatedAt: new Date().toISOString(),
                firstEscalatedBy: "system:delivery-sla-escalation",
                escalatedBySystem: true,
              },
              recovered: false,
            },
            {
              breach_event_id: "batch-3",
              order_id: "order-3",
              order_number: "ORD-3",
              order_status: "OUT_FOR_DELIVERY",
              branch_id: "branch-1",
              assigned_driver_id: "driver-3",
              sla_type: "dispatch_eta",
              target_at: null,
              observed_at: oldObserved,
              minutes_delta: 15,
              reason: "Minor delay",
              metadata: {
                acknowledgedAt: new Date().toISOString(),
                acknowledgedBy: "ops-2",
              },
              recovered: false,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              metadata: {
                firstEscalatedAt: new Date().toISOString(),
                firstEscalatedBy: "ops-manager",
                escalatedBySystem: false,
              },
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.executeOpenSlaEscalations({
      merchantId: "m-1",
      branchId: "branch-1",
      limit: 10,
      escalatedBy: "ops-manager",
    });

    expect(result.total).toBe(3);
    expect(result.escalatedCount).toBe(1);
    expect(result.alreadyEscalatedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.items).toHaveLength(3);
    expect(pool.query).toHaveBeenCalledTimes(3);
  });

  it("marks acknowledged SLA breaches as follow-up-and-monitor", async () => {
    const observedAt = new Date(Date.now() - 20 * 60 * 1000);
    const acknowledgedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            breach_event_id: "breach-2",
            order_id: "order-2",
            order_number: "ORD-2",
            order_status: "OUT_FOR_DELIVERY",
            branch_id: "branch-1",
            assigned_driver_id: "driver-2",
            sla_type: "dispatch_eta",
            target_at: null,
            observed_at: observedAt,
            minutes_delta: 12,
            reason: "Minor delay",
            metadata: {
              acknowledgedAt,
              acknowledgedBy: "ops-1",
              acknowledgementNote: "Ops acknowledged",
            },
            recovered: false,
            total_count: "1",
          },
        ],
      }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.listSlaBreaches({
      merchantId: "m-1",
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.items[0].remediation).toMatchObject({
      state: "ACKNOWLEDGED",
      escalationRequired: false,
      recommendedAction: "FOLLOW_UP_AND_MONITOR",
      acknowledgedAt,
      acknowledgedBy: "ops-1",
      acknowledgementNote: "Ops acknowledged",
    });
  });

  it("lists POD disputes queue with default OPEN status filter and expected shape", async () => {
    const disputedAt = new Date("2026-04-13T08:30:00.000Z");
    const capturedAt = new Date("2026-04-13T08:15:00.000Z");

    const pool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            pod_id: "11111111-1111-4111-8111-111111111111",
            order_id: "order-1",
            order_number: "ORD-1",
            order_status: "OUT_FOR_DELIVERY",
            branch_id: "branch-1",
            assigned_driver_id: "driver-1",
            proof_type: "photo",
            proof_url: "https://cdn/pod-1.jpg",
            captured_at: capturedAt,
            dispute_status: "OPEN",
            disputed_at: disputedAt,
            dispute_note: "Customer says wrong doorstep",
            total_count: "1",
          },
        ],
      }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.listPodDisputesQueue({
      merchantId: "m-1",
      branchId: "branch-1",
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.status).toBe("OPEN");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      podId: "11111111-1111-4111-8111-111111111111",
      orderId: "order-1",
      orderNumber: "ORD-1",
      orderStatus: "OUT_FOR_DELIVERY",
      branchId: "branch-1",
      assignedDriverId: "driver-1",
      disputeStatus: "OPEN",
      disputeNote: "Customer says wrong doorstep",
    });
    expect(result.paging).toEqual({
      limit: 20,
      offset: 0,
      hasMore: false,
    });
    expect(pool.query.mock.calls[0][1]).toEqual([
      "m-1",
      "branch-1",
      "OPEN",
      20,
      0,
    ]);
  });

  it("resolves POD disputes in batch and reports resolved/skipped counts", async () => {
    const podOpen = "11111111-1111-4111-8111-111111111111";
    const podAlreadyResolved = "22222222-2222-4222-8222-222222222222";
    const podNotFound = "33333333-3333-4333-8333-333333333333";
    const now = new Date("2026-04-13T11:00:00.000Z");

    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              pod_id: podOpen,
              order_id: "order-1",
              order_number: "ORD-1",
              order_status: "OUT_FOR_DELIVERY",
              branch_id: "branch-1",
              assigned_driver_id: "driver-1",
              shipment_id: "shipment-1",
              dispute_status: "OPEN",
              disputed_at: now,
              dispute_note: "Need confirmation",
            },
            {
              pod_id: podAlreadyResolved,
              order_id: "order-2",
              order_number: "ORD-2",
              order_status: "DELIVERED",
              branch_id: "branch-2",
              assigned_driver_id: "driver-2",
              shipment_id: "shipment-2",
              dispute_status: "RESOLVED",
              disputed_at: now,
              dispute_note: "Already checked",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              pod_id: podOpen,
              order_id: "order-1",
              shipment_id: "shipment-1",
              dispute_status: "RESOLVED",
              disputed_at: now,
              dispute_note: "Resolved by ops",
              updated_at: now,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.resolvePodDisputesBatch({
      merchantId: "m-1",
      podIds: [podOpen, podAlreadyResolved, podNotFound],
      resolvedBy: "ops-1",
      resolutionNote: "Resolved by ops",
    });

    expect(result.total).toBe(3);
    expect(result.resolvedCount).toBe(1);
    expect(result.skippedCount).toBe(2);

    expect(result.items.find((item) => item.podId === podOpen)).toMatchObject({
      podId: podOpen,
      resolved: true,
      skipped: false,
      disputeStatus: "RESOLVED",
      orderNumber: "ORD-1",
    });
    expect(
      result.items.find((item) => item.podId === podAlreadyResolved),
    ).toMatchObject({
      podId: podAlreadyResolved,
      resolved: false,
      skipped: true,
      skipReason: "NOT_OPEN",
    });
    expect(
      result.items.find((item) => item.podId === podNotFound),
    ).toMatchObject({
      podId: podNotFound,
      resolved: false,
      skipped: true,
      skipReason: "NOT_FOUND",
    });

    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "UPDATE delivery_pod_records",
    );
    expect(pool.query.mock.calls[1][1][1]).toEqual([podOpen]);
    expect(String(pool.query.mock.calls[2][0])).toContain(
      "INSERT INTO delivery_execution_events",
    );
    expect(pool.query.mock.calls[2][1][3]).toBe("delivery.disputed");
    expect(pool.query.mock.calls[2][1][5]).toBe("RESOLVED");
  });

  it("lists driver exception queue with branch and exception type filters", async () => {
    const now = new Date("2026-04-13T11:00:00.000Z");
    const staleLocationAt = new Date("2026-04-13T10:20:00.000Z");

    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: "order-1",
              order_number: "ORD-1",
              order_status: "OUT_FOR_DELIVERY",
              branch_id: "branch-1",
              assigned_driver_id: "driver-1",
              driver_name: "Driver One",
              driver_status: "ACTIVE",
              created_at: now,
              last_sla_status: "BREACHED",
              last_sla_minutes_delta: 18,
              last_sla_observed_at: now,
              last_location_at: staleLocationAt,
              last_latitude: "30.123",
              last_longitude: "31.456",
              pod_dispute_status: "NONE",
              pod_dispute_note: null,
              flag_breached_sla: true,
              flag_stale_tracking: false,
              flag_open_pod_dispute: false,
              flag_unassigned: false,
              total_count: "2",
            },
            {
              order_id: "order-2",
              order_number: "ORD-2",
              order_status: "CONFIRMED",
              branch_id: "branch-1",
              assigned_driver_id: null,
              driver_name: null,
              driver_status: null,
              created_at: now,
              last_sla_status: null,
              last_sla_minutes_delta: null,
              last_sla_observed_at: null,
              last_location_at: null,
              last_latitude: null,
              last_longitude: null,
              pod_dispute_status: null,
              pod_dispute_note: null,
              flag_breached_sla: false,
              flag_stale_tracking: false,
              flag_open_pod_dispute: false,
              flag_unassigned: true,
              total_count: "2",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              total_orders: "2",
              total_drivers: "1",
              breached_sla_orders: "1",
              stale_tracking_orders: "0",
              open_pod_dispute_orders: "0",
              unassigned_orders: "1",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              assigned_driver_id: "driver-1",
              driver_name: "Driver One",
              driver_status: "ACTIVE",
              exception_orders: "1",
              breached_sla_orders: "1",
              stale_tracking_orders: "0",
              open_pod_dispute_orders: "0",
              unassigned_orders: "0",
            },
            {
              assigned_driver_id: null,
              driver_name: null,
              driver_status: null,
              exception_orders: "1",
              breached_sla_orders: "0",
              stale_tracking_orders: "0",
              open_pod_dispute_orders: "0",
              unassigned_orders: "1",
            },
          ],
        }),
    } as any;

    const service = new DeliveryExecutionService(pool);
    const result = await service.getDriverExceptionQueue({
      merchantId: "m-1",
      branchId: "branch-1",
      exceptionTypes: ["BREACHED_SLA", "UNASSIGNED"],
      limit: 20,
      offset: 0,
    });

    expect(result.total).toBe(2);
    expect(result.exceptionTypes).toEqual(["BREACHED_SLA", "UNASSIGNED"]);
    expect(result.summary).toEqual({
      totalOrders: 2,
      totalDrivers: 1,
      breachedSlaOrders: 1,
      staleTrackingOrders: 0,
      openPodDisputeOrders: 0,
      unassignedOrders: 1,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].exceptionTypes).toEqual(["BREACHED_SLA"]);
    expect(result.items[1].exceptionTypes).toEqual(["UNASSIGNED"]);
    expect(result.items[0].remediation).toMatchObject({
      primaryAction: "ESCALATE_SLA_BREACH",
      requiresManager: true,
    });
    expect(result.items[1].remediation).toMatchObject({
      primaryAction: "ASSIGN_DRIVER",
      requiresManager: false,
    });
    expect(result.drivers).toHaveLength(2);
    expect(result.drivers[0]).toMatchObject({
      driverId: "driver-1",
      driverName: "Driver One",
      exceptionOrders: 1,
      breachedSlaOrders: 1,
    });
    expect(result.drivers[1]).toMatchObject({
      driverId: null,
      driverName: "Unassigned",
      unassignedOrders: 1,
    });

    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls[0][1]).toEqual([
      "m-1",
      "branch-1",
      true,
      false,
      false,
      true,
      ["CONFIRMED", "BOOKED", "SHIPPED", "OUT_FOR_DELIVERY"],
      20,
      0,
      true,
    ]);
  });

  it("rejects invalid driver exception type filters", async () => {
    const pool = {
      query: jest.fn(),
    } as any;

    const service = new DeliveryExecutionService(pool);

    await expect(
      service.getDriverExceptionQueue({
        merchantId: "m-1",
        exceptionTypes: ["BREACHED_SLA", "NOT_REAL"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(pool.query).not.toHaveBeenCalled();
  });
});
