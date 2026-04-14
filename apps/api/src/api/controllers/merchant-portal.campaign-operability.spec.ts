import { MerchantPortalController } from "./merchant-portal.controller";

describe("MerchantPortalController campaign operability", () => {
  function makeController() {
    const pool = {
      query: jest.fn(),
      connect: jest.fn(),
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
      {
        getDeliveryConfigStatus: jest.fn().mockReturnValue({
          whatsapp: { configured: true },
        }),
        sendBroadcastWhatsApp: jest.fn(),
      } as any,
      {
        logFromRequest: jest.fn(),
        log: jest.fn(),
      } as any,
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
    };
  }

  it("returns deterministic audience estimation with bounded filters", async () => {
    const { controller, pool } = makeController();

    pool.query
      .mockResolvedValueOnce({
        rows: [{ total_customers: "12", reachable_customers: "9" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "cust-1",
            name: "Ali",
            phone: "201001112223",
            total_orders: "6",
            total_spent: "1540.5",
            days_since_last_order: "132",
          },
        ],
      });

    const result = await controller.previewCampaignAudience(
      { merchantId: "merchant-1" } as any,
      "at_risk",
      "999",
      "-5",
      "75.50",
      "999",
    );

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][1]).toEqual(["merchant-1", 365, 0, 75.5]);
    expect(pool.query.mock.calls[1][1]).toEqual([
      "merchant-1",
      365,
      0,
      75.5,
      100,
    ]);

    expect(result.segment).toBe("at_risk");
    expect(result.criteria).toEqual({
      inactiveDays: 365,
      minOrders: 0,
      minTotalSpent: 75.5,
    });
    expect(result.estimate).toEqual({
      totalCustomers: 12,
      reachableCustomers: 9,
      unreachableCustomers: 3,
      reachableRatePct: 75,
    });
    expect(result.sampleRecipients).toEqual([
      {
        id: "cust-1",
        name: "Ali",
        phone: "201001112223",
        totalOrders: 6,
        totalSpent: 1540.5,
        daysSinceLastOrder: 132,
      },
    ]);
  });

  it("returns performance summary from audit log campaign events", async () => {
    const { controller, pool } = makeController();

    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            campaign_type: "WIN_BACK",
            campaigns: "2",
            targeted: "100",
            sent: "80",
            failed: "20",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            day: "2026-04-12",
            campaigns: "2",
            sent: "80",
            failed: "20",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "audit-1",
            created_at: "2026-04-12T09:00:00.000Z",
            campaign_type: "WIN_BACK",
            label: "WINBACK_A1",
            targeted: "50",
            sent: "40",
            failed: "10",
            metadata: {
              code: "WINBACK_A1",
              discountPercent: 15,
              validDays: 7,
            },
          },
        ],
      });

    const result = await controller.getCampaignPerformanceSummary(
      { merchantId: "merchant-1" } as any,
      "999",
      "win_back",
      "500",
    );

    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls[0][1]).toEqual([
      "merchant-1",
      180,
      "WIN_BACK",
    ]);
    expect(pool.query.mock.calls[2][1]).toEqual([
      "merchant-1",
      180,
      "WIN_BACK",
      100,
    ]);

    expect(result.windowDays).toBe(180);
    expect(result.campaignType).toBe("WIN_BACK");
    expect(result.totals).toEqual({
      campaigns: 2,
      targeted: 100,
      sent: 80,
      failed: 20,
      successRatePct: 80,
      avgAudienceSize: 50,
    });
    expect(result.byType).toEqual([
      {
        type: "WIN_BACK",
        campaigns: 2,
        targeted: 100,
        sent: 80,
        failed: 20,
        successRatePct: 80,
      },
    ]);
    expect(result.daily).toEqual([
      {
        date: "2026-04-12",
        campaigns: 2,
        sent: 80,
        failed: 20,
        successRatePct: 80,
      },
    ]);
    expect(result.recentCampaigns).toEqual([
      {
        id: "audit-1",
        createdAt: "2026-04-12T09:00:00.000Z",
        type: "WIN_BACK",
        label: "WINBACK_A1",
        targeted: 50,
        sent: 40,
        failed: 10,
        successRatePct: 80,
        metadata: {
          code: "WINBACK_A1",
          recipientFilter: null,
          inactiveDays: null,
          discountPercent: 15,
          validDays: 7,
        },
      },
    ]);
  });

  it("returns empty performance data when audit logs are unavailable", async () => {
    const { controller, pool } = makeController();

    pool.query.mockRejectedValueOnce(
      new Error('relation "audit_logs" does not exist'),
    );

    const result = await controller.getCampaignPerformanceSummary(
      { merchantId: "merchant-1" } as any,
      undefined,
      undefined,
      undefined,
    );

    expect(result.auditDataAvailable).toBe(false);
    expect(result.totals).toEqual({
      campaigns: 0,
      targeted: 0,
      sent: 0,
      failed: 0,
      successRatePct: 0,
      avgAudienceSize: 0,
    });
    expect(result.byType).toEqual([]);
    expect(result.daily).toEqual([]);
    expect(result.recentCampaigns).toEqual([]);
  });
});
