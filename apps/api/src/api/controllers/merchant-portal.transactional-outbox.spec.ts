import { MerchantPortalController } from "./merchant-portal.controller";

describe("MerchantPortalController transactional outbox", () => {
  function makeController() {
    const client = {
      query: jest.fn(),
      release: jest.fn(),
    } as any;

    const pool = {
      connect: jest.fn().mockResolvedValue(client),
      query: jest.fn(),
    } as any;

    const outboxService = {
      publishEventInTransaction: jest.fn().mockResolvedValue(undefined),
      publishEvent: jest.fn().mockResolvedValue(undefined),
    } as any;

    const controller = new MerchantPortalController(
      pool,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      outboxService,
      {} as any,
      {} as any,
    );

    return {
      controller,
      pool,
      client,
      outboxService,
    };
  }

  function getSqlCallOrder(queryMock: jest.Mock, sql: string): number {
    const idx = queryMock.mock.calls.findIndex((args) => args[0] === sql);
    if (idx === -1) {
      throw new Error(`Expected SQL call not found: ${sql}`);
    }
    return queryMock.mock.invocationCallOrder[idx];
  }

  it("publishes POS_REGISTER_OPENED outbox event before COMMIT", async () => {
    const { controller, client, outboxService } = makeController();

    (controller as any).ensurePosSchema = jest
      .fn()
      .mockResolvedValue(undefined);
    (controller as any).resolvePortalOrderBranchContext = jest
      .fn()
      .mockResolvedValue({
        branchId: "branch-1",
        shiftId: null,
      });
    (controller as any).getCurrentOpenRegisterSession = jest
      .fn()
      .mockResolvedValue(null);

    client.query.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO pos_register_sessions")) {
        return {
          rows: [
            {
              id: "register-1",
              branch_id: "branch-1",
              shift_id: null,
              opening_float: "150",
              status: "OPEN",
              opened_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });

    await controller.openPosRegister(
      {
        merchantId: "merchant-1",
        staffId: "c36f56a2-29f3-4e2a-b4ee-d95f2fc4ad49",
      } as any,
      {
        branchId: "branch-1",
        openingFloat: 150,
      },
    );

    expect(outboxService.publishEventInTransaction).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        aggregateType: "POS",
        aggregateId: "register-1",
        merchantId: "merchant-1",
      }),
    );

    const beginOrder = getSqlCallOrder(client.query, "BEGIN");
    const commitOrder = getSqlCallOrder(client.query, "COMMIT");
    const outboxOrder =
      outboxService.publishEventInTransaction.mock.invocationCallOrder[0];

    expect(beginOrder).toBeLessThan(outboxOrder);
    expect(outboxOrder).toBeLessThan(commitOrder);
    expect(client.release).toHaveBeenCalled();
  });

  it("publishes POS_DRAFT_CHECKED_OUT outbox event before COMMIT", async () => {
    const { controller, client, outboxService } = makeController();

    (controller as any).ensurePosSchema = jest
      .fn()
      .mockResolvedValue(undefined);
    (controller as any).getPosDraftById = jest.fn().mockResolvedValue({
      id: "draft-1",
      status: "DRAFT",
      customerId: null,
      branchId: "branch-1",
      shiftId: null,
      registerSessionId: "register-1",
      tableId: "table-1",
      customerName: "عميل",
      customerPhone: "01000000000",
      items: [{ name: "منتج", quantity: 1, unitPrice: 100 }],
      serviceMode: "pickup",
      paymentMethod: "cash",
      payments: [],
      discount: 0,
      taxTotal: 0,
      notes: null,
      metadata: {},
      total: 100,
    });
    (controller as any).createManualOrder = jest.fn().mockResolvedValue({
      id: "order-1",
      orderNumber: "ORD-1",
      total: 100,
    });
    (controller as any).setPosTableOccupancy = jest
      .fn()
      .mockResolvedValue(undefined);

    client.query.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      if (sql.includes("UPDATE pos_drafts")) {
        return { rowCount: 1, rows: [] };
      }
      return { rows: [] };
    });

    await controller.checkoutPosDraft(
      {
        merchantId: "merchant-1",
      } as any,
      "draft-1",
    );

    expect(outboxService.publishEventInTransaction).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        aggregateType: "POS",
        aggregateId: "draft-1",
        merchantId: "merchant-1",
      }),
    );

    const beginOrder = getSqlCallOrder(client.query, "BEGIN");
    const commitOrder = getSqlCallOrder(client.query, "COMMIT");
    const outboxOrder =
      outboxService.publishEventInTransaction.mock.invocationCallOrder[0];

    expect(beginOrder).toBeLessThan(outboxOrder);
    expect(outboxOrder).toBeLessThan(commitOrder);
    expect(client.release).toHaveBeenCalled();
  });
});
