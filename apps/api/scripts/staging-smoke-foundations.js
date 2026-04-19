/* eslint-disable no-console */

const baseUrl = (process.env.STAGING_BASE_URL || "").replace(/\/$/, "");
const bearerToken = process.env.STAGING_BEARER_TOKEN || "";
const orderRef = process.env.STAGING_ORDER_REF || "";
const runWriteChecks =
  String(process.env.STAGING_RUN_WRITE_CHECKS || "false").toLowerCase() ===
  "true";

if (!baseUrl) {
  console.error("[smoke] Missing STAGING_BASE_URL");
  process.exit(2);
}

if (!bearerToken) {
  console.error("[smoke] Missing STAGING_BEARER_TOKEN");
  process.exit(2);
}

function makeUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalized}`;
}

async function hit({ name, method, path, body, expectedStatuses = [200] }) {
  const headers = {
    Authorization: `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(makeUrl(path), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }

  const pass = expectedStatuses.includes(response.status);
  return {
    name,
    pass,
    status: response.status,
    body: parsed,
  };
}

async function main() {
  const checks = [];

  checks.push(
    await hit({
      name: "delivery-partners",
      method: "GET",
      path: "/api/v1/portal/delivery/partners",
      expectedStatuses: [200],
    }),
  );

  checks.push(
    await hit({
      name: "connector-runtime-taxonomy",
      method: "GET",
      path: "/api/v1/portal/integrations/erp/runtime/event-taxonomy",
      expectedStatuses: [200],
    }),
  );

  checks.push(
    await hit({
      name: "connector-runtime-health",
      method: "GET",
      path: "/api/v1/portal/integrations/erp/runtime/health",
      expectedStatuses: [200],
    }),
  );

  checks.push(
    await hit({
      name: "hq-units-list",
      method: "GET",
      path: "/api/v1/portal/hq/units",
      expectedStatuses: [200],
    }),
  );

  if (orderRef) {
    checks.push(
      await hit({
        name: "delivery-timeline",
        method: "GET",
        path: `/api/v1/portal/delivery/orders/${encodeURIComponent(orderRef)}/timeline`,
        expectedStatuses: [200],
      }),
    );
  }

  if (runWriteChecks && orderRef) {
    checks.push(
      await hit({
        name: "delivery-event-write",
        method: "POST",
        path: `/api/v1/portal/delivery/orders/${encodeURIComponent(orderRef)}/events`,
        expectedStatuses: [201],
        body: {
          eventType: "delivery.out_for_delivery",
          source: "staging_smoke",
          status: "RECORDED",
          payload: {
            note: "smoke_check",
          },
        },
      }),
    );
  }

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.filter((c) => !c.pass);

  console.log(
    `[smoke] completed ${checks.length} checks: ${passed} passed, ${failed.length} failed`,
  );
  for (const check of checks) {
    console.log(
      `${check.pass ? "PASS" : "FAIL"} ${check.name} -> HTTP ${check.status}`,
    );
  }

  if (failed.length > 0) {
    console.log("[smoke] failure details:");
    for (const check of failed) {
      console.log(
        JSON.stringify(
          {
            name: check.name,
            status: check.status,
            body: check.body,
          },
          null,
          2,
        ),
      );
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[smoke] unexpected error", error);
  process.exit(1);
});
