import { ControlPlaneGovernanceService } from "./control-plane-governance.service";

describe("ControlPlaneGovernanceService", () => {
  it("supports filtered planner run listing with total", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-1",
              trigger_type: "EVENT",
              trigger_key: "order.created",
              run_status: "FAILED",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ total: "1" }] }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const result = await service.listPlannerRuns("m-1", {
      limit: 10,
      offset: 0,
      status: "FAILED",
      triggerType: "EVENT",
      triggerKey: "order.created",
    });

    expect(result.total).toBe(1);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].id).toBe("run-1");

    const firstQuery = String(pool.query.mock.calls[0][0]);
    expect(firstQuery).toContain("run_status =");
    expect(firstQuery).toContain("trigger_type =");
    expect(firstQuery).toContain("trigger_key =");
  });

  it("supports dry-run planner replay with budget check", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-2",
              trigger_type: "ON_DEMAND",
              trigger_key: "ASK_REVENUE",
              run_status: "FAILED",
              context_digest: {},
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const result = await service.replayPlannerRun({
      merchantId: "m-1",
      runId: "run-2",
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.sourceRunId).toBe("run-2");
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("builds command-center feed entries from multiple domains", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "run-feed-1",
              run_status: "FAILED",
              trigger_type: "EVENT",
              trigger_key: "order.created",
              reason: "failed",
              started_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              action_id: "approval-1",
              intent: "APPROVE_PAYMENT_PROOF",
              status: "pending",
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "dlq-1",
              event_type: "payment.received",
              last_error: "missing orderNumber",
              moved_to_dlq_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "sla-1",
              sla_type: "eta",
              reason: "traffic",
              observed_at: new Date(),
            },
          ],
        }),
    } as any;

    const service = new ControlPlaneGovernanceService(pool);
    const result = await service.getCommandCenterFeed("m-1", 10);

    expect(result.items.length).toBeGreaterThanOrEqual(4);
    expect(result.items.some((item: any) => item.category === "planner")).toBe(
      true,
    );
    expect(result.items.some((item: any) => item.category === "approval")).toBe(
      true,
    );
    expect(
      result.items.some((item: any) => item.category === "connector"),
    ).toBe(true);
    expect(result.items.some((item: any) => item.category === "delivery")).toBe(
      true,
    );
  });
});
