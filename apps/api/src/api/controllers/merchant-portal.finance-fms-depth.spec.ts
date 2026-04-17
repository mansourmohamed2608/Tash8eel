import { ConflictException } from "@nestjs/common";
import { MerchantPortalController } from "./merchant-portal.controller";

describe("MerchantPortalController finance FMS depth", () => {
  function makeController() {
    const pool = {
      query: jest.fn(),
      connect: jest.fn(),
    } as any;

    const auditService = {
      logFromRequest: jest.fn(),
      log: jest.fn(),
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
      auditService,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return {
      controller,
      pool,
      auditService,
    };
  }

  it("blocks high-variance COD reconciliation without explicit approval", async () => {
    const { controller, pool } = makeController();

    pool.query.mockResolvedValueOnce({
      rows: [{ id: "order-1", total: "100", payment_method: "COD" }],
    });

    await expect(
      controller.reconcileCodOrder(
        {
          merchantId: "merchant-1",
          staffId: "manager-1",
          staffRole: "MANAGER",
        } as any,
        "order-1",
        {
          amountReceived: 70,
          notes: "Courier shortage",
        },
      ),
    ).rejects.toThrow(ConflictException);

    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("reconciles high-variance COD with explicit approval and records ledger action", async () => {
    const { controller, pool, auditService } = makeController();

    pool.query
      .mockResolvedValueOnce({
        rows: [{ id: "order-1", total: "100", payment_method: "COD" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await controller.reconcileCodOrder(
      {
        merchantId: "merchant-1",
        staffId: "admin-1",
        staffRole: "ADMIN",
      } as any,
      "order-1",
      {
        amountReceived: 70,
        notes: "Courier deducted handling fee",
        approval: {
          force: true,
          approvedBy: "admin-1",
          reason: "Verified with statement and signed courier adjustment",
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.requiresApproval).toBe(true);
    expect(result.approvalGranted).toBe(true);
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "cod_reconciled = true",
    );
    expect(String(pool.query.mock.calls[2][0])).toContain(
      "INSERT INTO cod_finance_actions",
    );
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });

  it("blocks settlement close when confidence is below threshold without explicit approval", async () => {
    const { controller, pool } = makeController();

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: "statement-1",
          status: "pending",
          total_orders: "10",
          matched_orders: "8",
          unmatched_orders: "2",
          total_collected: "1000",
          total_fees: "80",
          net_amount: "900",
        },
      ],
    });

    await expect(
      controller.closeCodSettlementStatement(
        {
          merchantId: "merchant-1",
          staffId: "admin-1",
          staffRole: "ADMIN",
        } as any,
        "statement-1",
        {
          notes: "close attempt without approval",
        },
      ),
    ).rejects.toThrow(ConflictException);

    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("closes settlement with explicit approval and persists deterministic action", async () => {
    const { controller, pool, auditService } = makeController();

    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "statement-1",
            status: "pending",
            total_orders: "10",
            matched_orders: "9",
            unmatched_orders: "1",
            total_collected: "1000",
            total_fees: "80",
            net_amount: "915",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await controller.closeCodSettlementStatement(
      {
        merchantId: "merchant-1",
        staffId: "admin-1",
        staffRole: "ADMIN",
      } as any,
      "statement-1",
      {
        notes: "Approved exceptional close",
        approval: {
          force: true,
          approvedBy: "admin-1",
          reason: "Mismatch explained by courier side offset and documented",
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("reconciled");
    expect(result.confidence.requiresApproval).toBe(true);
    expect(result.approvalGranted).toBe(true);
    expect(String(pool.query.mock.calls[1][0])).toContain(
      "UPDATE cod_statement_imports",
    );
    expect(String(pool.query.mock.calls[2][0])).toContain(
      "INSERT INTO cod_finance_actions",
    );
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });

  it("returns COD summary with settlement confidence surface", async () => {
    const { controller, pool } = makeController();

    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            total_cod_orders: "20",
            total_cod_amount: "2000",
            delivered_orders: "15",
            delivered_amount: "1500",
            pending_orders: "3",
            pending_amount: "200",
            cancelled_orders: "2",
            returned_orders: "0",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            total_statements: "3",
            reconciled_statements: "1",
            total_collected: "1200",
            total_fees: "100",
            net_received: "1090",
            matched_orders: "12",
            unmatched_orders: "3",
            latest_status: "pending",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await controller.getCodSummary(
      { merchantId: "merchant-1" } as any,
      "month",
      undefined,
    );

    expect(result.settlementConfidence).toBeTruthy();
    expect(result.settlementConfidence.metrics.unmatchedOrders).toBe(3);
    expect(result.settlementConfidence.requiresApproval).toBe(true);
    expect(result.settlementConfidence.blockers).toContain(
      "pending_cod_amount_present",
    );
  });
});
