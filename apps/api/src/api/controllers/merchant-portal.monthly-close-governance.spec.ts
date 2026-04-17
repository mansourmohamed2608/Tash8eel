import { ConflictException } from "@nestjs/common";
import { MerchantPortalController } from "./merchant-portal.controller";

describe("MerchantPortalController monthly close governance", () => {
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

  function mockFinanceSnapshot(controller: MerchantPortalController) {
    (controller as any).buildPortalFinanceSnapshot = jest
      .fn()
      .mockResolvedValue({
        totalOrders: 120,
        bookedOrders: 120,
        realizedOrders: 100,
        deliveredOrders: 95,
        cancelledOrders: 5,
        uniqueCustomers: 60,
        bookedSales: 12000,
        realizedRevenue: 10500,
        deliveredRevenue: 10000,
        pendingCollections: 250,
        pendingCod: 180,
        pendingOnline: 70,
        paidCashAmount: 4000,
        paidOnlineAmount: 6500,
        totalExpenses: 3600,
        refundsAmount: 200,
        netCashFlow: 6900,
        averageOrderValue: 105,
        topProducts: [],
        inventory: {
          available: true,
          totalValue: 0,
          slowMovingValue: 0,
          turnoverRate: 0,
        },
        customers: {
          totalCount: 60,
          newCount: 10,
          repeatCount: 50,
          repeatRate: 83,
          avgLtv: 320,
        },
      });
  }

  it("generates deterministic monthly close packet with hash, blockers, and packet persistence", async () => {
    const { controller, pool } = makeController();
    mockFinanceSnapshot(controller);

    pool.query
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            total_statements: "3",
            reconciled_statements: "1",
            unmatched_orders: "4",
            total_collected: "700",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ cod_expected: "900" }] })
      .mockResolvedValueOnce({ rows: [{ id: "packet-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await controller.getMonthlyClosePacket(
      {
        merchantId: "merchant-1",
        staffId: "manager-1",
        staffRole: "MANAGER",
      } as any,
      "2026",
      "4",
    );

    expect(result.packetId).toBe("packet-1");
    expect(result.packetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.requiresApproval).toBe(true);
    expect(result.requiresSecondApproval).toBe(true);
    expect(result.blockers.map((b: any) => b.code)).toContain(
      "open_register_sessions",
    );
    expect(
      pool.query.mock.calls.some((call: any[]) =>
        String(call[0]).includes("INSERT INTO monthly_close_packets"),
      ),
    ).toBe(true);
    expect(
      pool.query.mock.calls.some((call: any[]) =>
        String(call[0]).includes("INSERT INTO monthly_close_governance_ledger"),
      ),
    ).toBe(true);
  });

  it("blocks monthly close when blockers require approval and approval is missing", async () => {
    const { controller, pool } = makeController();
    (controller as any).buildMonthlyClosePacket = jest.fn().mockResolvedValue({
      year: 2026,
      month: 4,
      periodStart: "2026-04-01T00:00:00.000Z",
      periodEnd: "2026-04-30T23:59:59.999Z",
      packetHash: "placeholder-hash",
      confidenceScore: 70,
      requiresApproval: true,
      closeReady: false,
      blockers: [
        {
          code: "unreconciled_cod_statements",
          severity: "critical",
          message: "COD statements are not fully reconciled",
          value: 1,
        },
      ],
      metrics: {
        totalOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        bookedSales: 0,
        realizedRevenue: 0,
        totalExpenses: 0,
        netCashFlow: 0,
        pendingCollections: 0,
        pendingCod: 0,
        pendingOnline: 0,
        codStatementsTotal: 1,
        reconciledCodStatements: 0,
        unreconciledCodStatements: 1,
        codUnmatchedOrders: 0,
        codExpected: 0,
        codCollected: 0,
        codOutstanding: 0,
        openRegisterSessions: 0,
      },
    });

    pool.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "packet-1" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      controller.closeMonthWithGovernance(
        {
          merchantId: "merchant-1",
          staffId: "admin-1",
          staffRole: "ADMIN",
        } as any,
        "2026",
        "4",
        {
          packetHash: "placeholder-hash",
          notes: "close attempt",
        },
      ),
    ).rejects.toThrow(ConflictException);

    expect(
      pool.query.mock.calls.some((call: any[]) =>
        String(call[0]).includes("pg_advisory_unlock"),
      ),
    ).toBe(true);
  });

  it("requires a distinct second approver for high-risk close packets", async () => {
    const { controller, pool } = makeController();
    (controller as any).buildMonthlyClosePacket = jest.fn().mockResolvedValue({
      year: 2026,
      month: 4,
      periodStart: "2026-04-01T00:00:00.000Z",
      periodEnd: "2026-04-30T23:59:59.999Z",
      packetHash: "b".repeat(64),
      confidenceScore: 78,
      requiresApproval: true,
      requiresSecondApproval: true,
      riskTier: "high",
      riskReasons: ["critical_blockers", "low_confidence"],
      closeReady: false,
      blockers: [
        {
          code: "open_register_sessions",
          severity: "critical",
          message: "POS register sessions are still open",
          value: 2,
        },
      ],
      metrics: {
        totalOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        bookedSales: 0,
        realizedRevenue: 0,
        totalExpenses: 0,
        netCashFlow: 0,
        pendingCollections: 0,
        pendingCod: 0,
        pendingOnline: 0,
        codStatementsTotal: 1,
        reconciledCodStatements: 0,
        unreconciledCodStatements: 1,
        codUnmatchedOrders: 0,
        codExpected: 0,
        codCollected: 0,
        codOutstanding: 0,
        openRegisterSessions: 2,
      },
    });

    pool.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "packet-2" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      controller.closeMonthWithGovernance(
        {
          merchantId: "merchant-1",
          staffId: "admin-1",
          staffRole: "ADMIN",
        } as any,
        "2026",
        "4",
        {
          packetHash: "b".repeat(64),
          notes: "high risk close attempt",
          approval: {
            force: true,
            approvedBy: "finance-primary",
            reason: "Primary approval is documented",
          },
          evidence: [
            {
              referenceId: "ev-close-1",
              category: "bank_statement",
              uri: "s3://evidence/bank-statement-2026-04.pdf",
              checksum: "sha256:abc123",
              note: "Signed reconciliation",
            },
          ],
        },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("closes and locks month with explicit approval and writes immutable ledger entries", async () => {
    const { controller, pool, auditService } = makeController();
    (controller as any).buildMonthlyClosePacket = jest.fn().mockResolvedValue({
      year: 2026,
      month: 4,
      periodStart: "2026-04-01T00:00:00.000Z",
      periodEnd: "2026-04-30T23:59:59.999Z",
      packetHash: "a".repeat(64),
      confidenceScore: 99,
      requiresApproval: false,
      requiresSecondApproval: false,
      riskTier: "normal",
      riskReasons: [],
      closeReady: true,
      blockers: [],
      metrics: {
        totalOrders: 120,
        deliveredOrders: 95,
        cancelledOrders: 5,
        bookedSales: 12000,
        realizedRevenue: 10500,
        totalExpenses: 3600,
        netCashFlow: 6900,
        pendingCollections: 0,
        pendingCod: 0,
        pendingOnline: 0,
        codStatementsTotal: 1,
        reconciledCodStatements: 1,
        unreconciledCodStatements: 0,
        codUnmatchedOrders: 0,
        codExpected: 1000,
        codCollected: 1000,
        codOutstanding: 0,
        openRegisterSessions: 0,
      },
    });

    pool.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "packet-2" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "close-1",
            status: "LOCKED",
            closed_at: new Date(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await controller.closeMonthWithGovernance(
      {
        merchantId: "merchant-1",
        staffId: "admin-1",
        staffRole: "ADMIN",
      } as any,
      "2026",
      "4",
      {
        packetHash: "a".repeat(64),
        notes: "approved close",
        approval: {
          force: true,
          approvedBy: "admin-1",
          reason: "Finance leadership approved exceptional close with evidence",
        },
        evidence: [
          {
            referenceId: "ev-close-2",
            category: "cod_reconciliation",
            uri: "s3://evidence/cod-reconciliation-2026-04.xlsx",
            checksum: "sha256:def456",
            note: "Reconciliation workbook",
          },
        ],
      },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("LOCKED");
    expect(result.approvalGranted).toBe(true);
    expect(result.evidenceCount).toBe(1);

    const ledgerInsertCalls = pool.query.mock.calls.filter((call: any[]) =>
      String(call[0]).includes("INSERT INTO monthly_close_governance_ledger"),
    );
    expect(ledgerInsertCalls.length).toBe(2);
    const closeLedgerMetadata = JSON.parse(String(ledgerInsertCalls[0][1][15]));
    expect(closeLedgerMetadata.evidenceCount).toBe(1);
    expect(closeLedgerMetadata.evidence[0].referenceId).toBe("ev-close-2");
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });

  it("reopens a locked month only with explicit approval", async () => {
    const { controller, pool, auditService } = makeController();

    pool.query
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({
        rows: [{ id: "close-1", status: "LOCKED" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await controller.reopenMonthlyCloseWithGovernance(
      {
        merchantId: "merchant-1",
        staffId: "admin-1",
        staffRole: "ADMIN",
      } as any,
      "2026",
      "4",
      {
        notes: "reopen after documented corrections",
        approval: {
          force: true,
          approvedBy: "admin-1",
          reason: "Correction package approved by finance and governance",
        },
        evidence: [
          {
            referenceId: "ev-reopen-1",
            category: "adjustment_ticket",
            uri: "s3://evidence/reopen-adjustment-2026-04.pdf",
            checksum: "sha256:ghi789",
            note: "Approved correction request",
          },
        ],
      },
    );

    expect(result.success).toBe(true);
    expect(result.status).toBe("OPEN");
    expect(result.approvalGranted).toBe(true);
    expect(result.evidenceCount).toBe(1);
    expect(
      pool.query.mock.calls.some((call: any[]) =>
        String(call[0]).includes("INSERT INTO monthly_close_governance_ledger"),
      ),
    ).toBe(true);
    const reopenLedgerCall = pool.query.mock.calls.find((call: any[]) =>
      String(call[0]).includes("INSERT INTO monthly_close_governance_ledger"),
    );
    const reopenLedgerMetadata = JSON.parse(
      String(reopenLedgerCall?.[1]?.[15]),
    );
    expect(reopenLedgerMetadata.evidenceCount).toBe(1);
    expect(reopenLedgerMetadata.evidence[0].referenceId).toBe("ev-reopen-1");
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });
});
