import { FinanceReportsController } from "./advanced-reports.controller";

describe("FinanceReportsController finance operability", () => {
  function makeController() {
    const pool = {
      query: jest.fn(),
    } as any;

    const commerceFactsService = {} as any;
    const controller = new FinanceReportsController(pool, commerceFactsService);

    return {
      controller,
      queryMock: pool.query as jest.Mock,
    };
  }

  it("computes cash runway risk from collections, expenses, and overdue receivables", async () => {
    const { controller, queryMock } = makeController();

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            order_count: "40",
            booked_sales: "1000",
            collected_revenue: "600",
            pending_collections: "400",
            total_expenses: "1200",
            refunds_amount: "50",
            approved_refunds_count: "3",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            unpaid_orders_count: "12",
            overdue_unpaid_orders_count: "7",
            total_outstanding: "450",
            overdue_outstanding: "300",
          },
        ],
      });

    const result = await controller.getCashRunwayRisk("m-1", {
      periodDays: 30,
      cashReserve: 180,
      overdueDays: 14,
    });

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(result.riskLevel).toBe("CRITICAL");
    expect(result.operatingMode).toBe("BURNING_CASH");
    expect(result.runway.runwayDays).toBe(9);
    expect(result.collections.pendingCollections).toBe(450);
    expect(result.collections.overdueCollections).toBe(300);
    expect(result.signals.shortRunway).toBe(true);
    expect(result.signals.highOverduePressure).toBe(true);
  });

  it("returns variance and health score between current and previous windows", async () => {
    const { controller, queryMock } = makeController();

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            order_count: "30",
            booked_sales: "1200",
            collected_revenue: "1000",
            pending_collections: "200",
            total_expenses: "700",
            refunds_amount: "40",
            approved_refunds_count: "2",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            order_count: "25",
            booked_sales: "1000",
            collected_revenue: "850",
            pending_collections: "150",
            total_expenses: "650",
            refunds_amount: "20",
            approved_refunds_count: "1",
          },
        ],
      });

    const result = await controller.getVarianceHealth("m-1", {
      periodDays: 30,
    });

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(result.currentPeriod.netCashFlow).toBe(300);
    expect(result.previousPeriod.netCashFlow).toBe(200);
    expect(result.variance.bookedSalesPct).toBe(20);
    expect(result.variance.collectedRevenuePct).toBe(17.65);
    expect(result.health.score).toBe(62);
    expect(result.health.band).toBe("WATCH");
    expect(result.health.signals.weakCollections).toBe(true);
    expect(result.health.signals.negativeNetCashFlow).toBe(false);
  });
});
