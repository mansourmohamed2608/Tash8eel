(async () => {
  const base = "http://127.0.0.1:3000";

  const request = async (path, options = {}) => {
    const response = await fetch(base + path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new Error(
        `${path} => ${response.status} ${typeof data === "string" ? data : JSON.stringify(data)}`,
      );
    }
    return data;
  };

  try {
    const login = await request("/api/v1/staff/login", {
      method: "POST",
      body: JSON.stringify({
        merchantId: "demo-merchant",
        email: "owner@tash8eel.com",
        password: "Demo@1234",
      }),
    });

    const token = login?.tokens?.accessToken;
    if (!token) throw new Error("No access token returned from login");

    const authHeaders = { authorization: `Bearer ${token}` };
    const results = {};

    const demand = await request("/api/v1/portal/forecast/demand", {
      headers: authHeaders,
    });
    results.forecast_demand = {
      items: (demand.items || []).length,
      total: demand.total,
    };

    const productId = demand.items?.[0]?.productId || null;
    if (productId) {
      const history = await request(
        `/api/v1/portal/forecast/demand/${productId}/history`,
        {
          headers: authHeaders,
        },
      );
      results.forecast_demand_history = {
        productId,
        historicalData: (history.historicalData || []).length,
      };
    } else {
      results.forecast_demand_history = {
        skipped: true,
        reason: "no demand product returned",
      };
    }

    const cashflow = await request("/api/v1/portal/forecast/cashflow?days=30", {
      headers: authHeaders,
    });
    results.forecast_cashflow = {
      projection: (cashflow.projection || []).length,
      runwayDays: cashflow.runwayDays,
    };

    const churn = await request("/api/v1/portal/forecast/churn?limit=50", {
      headers: authHeaders,
    });
    results.forecast_churn = { items: (churn.items || []).length };

    const workforce = await request("/api/v1/portal/forecast/workforce", {
      headers: authHeaders,
    });
    results.forecast_workforce = {
      dayPattern: (workforce.dayPattern || []).length,
      hourPattern: (workforce.hourPattern || []).length,
      nextSevenDays: (workforce.nextSevenDays || []).length,
    };

    const metrics = await request("/api/v1/portal/forecast/model-metrics", {
      headers: authHeaders,
    });
    results.forecast_model_metrics = {
      mape: metrics.latest?.mape,
      history: (metrics.history || []).length,
    };

    const replenishment = await request(
      "/api/v1/portal/forecast/replenishment?status=pending",
      {
        headers: authHeaders,
      },
    );
    results.forecast_replenishment = {
      items: (replenishment.items || []).length,
    };

    const whatIfPricing = await request("/api/v1/portal/forecast/what-if", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ type: "pricing", params: { priceDeltaPct: 10 } }),
    });
    results.what_if_pricing = {
      scenario: whatIfPricing.scenarioType,
      deltaPct: whatIfPricing.deltaPct,
    };

    const whatIfCash = await request("/api/v1/portal/forecast/what-if", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        type: "cashflow",
        params: { extraRevenue: 500, extraExpense: 200 },
      }),
    });
    results.what_if_cashflow = {
      scenario: whatIfCash.scenarioType,
      delta: whatIfCash.delta,
    };

    if (productId) {
      const whatIfDemand = await request("/api/v1/portal/forecast/what-if", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          type: "demand",
          params: { productId, newLeadTimeDays: 7 },
        }),
      });
      results.what_if_demand = {
        scenario: whatIfDemand.scenarioType,
        delta: whatIfDemand.delta,
      };
    } else {
      results.what_if_demand = {
        skipped: true,
        reason: "no demand product returned",
      };
    }

    try {
      const segments = await request("/api/v1/portal/customer-segments", {
        headers: authHeaders,
      });
      const segmentId = segments?.segments?.[0]?.id || null;
      if (segmentId) {
        const whatIfCampaign = await request(
          "/api/v1/portal/forecast/what-if",
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              type: "campaign",
              params: { segmentId, discountPct: 15, campaignCost: 1000 },
            }),
          },
        );
        results.what_if_campaign = {
          scenario: whatIfCampaign.scenarioType,
          delta: whatIfCampaign.delta,
        };
      } else {
        results.what_if_campaign = {
          skipped: true,
          reason: "no segment id returned",
        };
      }
    } catch (error) {
      results.what_if_campaign = {
        skipped: true,
        reason: String(error.message || error),
      };
    }

    if ((replenishment.items || []).length > 0) {
      const recommendationId = replenishment.items[0].id;
      const approval = await request(
        `/api/v1/portal/forecast/replenishment/${recommendationId}/approve`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ poReference: "PO-LIVE-CHECK-001" }),
        },
      );
      results.replenishment_approve = { ok: approval.ok, id: recommendationId };
    } else {
      results.replenishment_approve = {
        skipped: true,
        reason: "no pending recommendation",
      };
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          merchantId: login.staff?.merchantId,
          email: login.staff?.email,
          results,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: String(error.message || error),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
})();
