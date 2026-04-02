import { BranchAnalyticsController } from "./branches.controller";

describe("BranchAnalyticsController.compareBranches", () => {
  const merchantId = "m_1";

  function makeControllerWithQueryImpl(
    impl: (sql: string, params?: any[]) => Promise<any>,
  ) {
    const pool = {
      query: jest.fn(impl),
    } as any;
    return {
      controller: new BranchAnalyticsController(pool),
      queryMock: pool.query as jest.Mock,
    };
  }

  it("returns branch comparisons on normal schema", async () => {
    const { controller, queryMock } = makeControllerWithQueryImpl(
      async (sql: string) => {
        if (sql.includes("FROM merchant_branches")) {
          return {
            rows: [
              {
                id: "b1",
                name: "الفرع الرئيسي",
                name_en: "Main Branch",
                is_active: true,
              },
            ],
          };
        }
        if (sql.includes("FROM orders o")) {
          return {
            rows: [
              {
                branch_id: "b1",
                revenue: "1200",
                total_orders: "10",
                completed_orders: "9",
                aov: "120",
              },
            ],
          };
        }
        if (sql.includes("FROM expenses e")) {
          return {
            rows: [
              {
                branch_id: "b1",
                expenses: "300",
              },
            ],
          };
        }
        return { rows: [] };
      },
    );

    const result = await controller.compareBranches(merchantId, "30");

    expect(queryMock).toHaveBeenCalled();
    expect(result.periodDays).toBe(30);
    expect(result.branches).toHaveLength(1);
    expect(result.branches[0]).toMatchObject({
      branchId: "b1",
      branchName: "الفرع الرئيسي",
      revenue: 1200,
      totalOrders: 10,
      completedOrders: 9,
      totalExpenses: 300,
      netProfit: 900,
    });
  });

  it("returns zeroed branch data when orders/expenses schema is partially missing", async () => {
    const { controller } = makeControllerWithQueryImpl(async (sql: string) => {
      if (sql.includes("FROM merchant_branches")) {
        return {
          rows: [
            {
              id: "b2",
              name: "فرع 2",
              name_en: "Branch 2",
              is_active: true,
            },
          ],
        };
      }
      if (sql.includes("FROM orders o")) {
        const err: any = new Error("column o.branch_id does not exist");
        err.code = "42703";
        throw err;
      }
      if (sql.includes("FROM expenses e")) {
        const err: any = new Error("column e.amount does not exist");
        err.code = "42703";
        throw err;
      }
      return { rows: [] };
    });

    const result = await controller.compareBranches(merchantId, "30");

    expect(result.branches).toHaveLength(1);
    expect(result.branches[0]).toMatchObject({
      branchId: "b2",
      revenue: 0,
      totalOrders: 0,
      completedOrders: 0,
      totalExpenses: 0,
      netProfit: 0,
      margin: 0,
    });
  });

  it("falls back when sort_order column is missing on merchant_branches", async () => {
    let firstBranchQuery = true;
    const { controller } = makeControllerWithQueryImpl(async (sql: string) => {
      if (sql.includes("FROM merchant_branches")) {
        if (firstBranchQuery) {
          firstBranchQuery = false;
          const err: any = new Error("column sort_order does not exist");
          err.code = "42703";
          throw err;
        }
        return {
          rows: [
            {
              id: "b3",
              name: "فرع 3",
              name_en: "Branch 3",
              is_active: false,
            },
          ],
        };
      }
      if (sql.includes("FROM orders o")) {
        return { rows: [] };
      }
      if (sql.includes("FROM expenses e")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await controller.compareBranches(merchantId, "30");

    expect(result.branches).toHaveLength(1);
    expect(result.branches[0]).toMatchObject({
      branchId: "b3",
      branchName: "فرع 3",
      isActive: false,
      revenue: 0,
    });
  });
});
