import { UnauthorizedException } from "@nestjs/common";
import { IntegrationsController } from "./integrations.controller";

describe("IntegrationsController runtime worker operability", () => {
  it("lists worker-cycle outcomes for the authorized merchant", async () => {
    const connectorRuntimeService = {
      listWorkerCycleOutcomes: jest.fn().mockResolvedValue({
        total: 1,
        rows: [{ id: "outcome-1" }],
      }),
      getLatestWorkerCycleSummary: jest.fn(),
    } as any;

    const controller = new IntegrationsController(
      {} as any,
      connectorRuntimeService,
      {} as any,
    );

    const result = await controller.listConnectorRuntimeWorkerCycles(
      { merchantId: "m-1" } as any,
      {
        status: "FAILED",
        limit: 25,
        offset: 5,
      },
    );

    expect(result.total).toBe(1);
    expect(
      connectorRuntimeService.listWorkerCycleOutcomes,
    ).toHaveBeenCalledWith({
      merchantId: "m-1",
      status: "FAILED",
      limit: 25,
      offset: 5,
    });
  });

  it("returns latest worker-cycle summary for the authorized merchant", async () => {
    const connectorRuntimeService = {
      listWorkerCycleOutcomes: jest.fn(),
      getLatestWorkerCycleSummary: jest.fn().mockResolvedValue({
        cycle_id: "cycle-1",
        run_status: "COMPLETED",
      }),
    } as any;

    const controller = new IntegrationsController(
      {} as any,
      connectorRuntimeService,
      {} as any,
    );

    const latest = await controller.getLatestConnectorRuntimeWorkerCycle({
      merchantId: "m-merchant",
    } as any);

    expect(latest.cycle_id).toBe("cycle-1");
    expect(
      connectorRuntimeService.getLatestWorkerCycleSummary,
    ).toHaveBeenCalledWith("m-merchant");
  });

  it("rejects worker-cycle visibility calls without merchant identity", async () => {
    const connectorRuntimeService = {
      listWorkerCycleOutcomes: jest.fn(),
      getLatestWorkerCycleSummary: jest.fn(),
    } as any;

    const controller = new IntegrationsController(
      {} as any,
      connectorRuntimeService,
      {} as any,
    );

    await expect(
      controller.listConnectorRuntimeWorkerCycles({} as any, {
        status: "COMPLETED",
        limit: 20,
        offset: 0,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(
      connectorRuntimeService.listWorkerCycleOutcomes,
    ).not.toHaveBeenCalled();
  });
});
