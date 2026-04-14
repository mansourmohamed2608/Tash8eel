import {
  INTEGRATION_EVENT_TAXONOMY,
  isIntegrationEventType,
} from "./integration.service";

describe("Integration event taxonomy", () => {
  it("includes baseline and runtime-v2 scaffold events", () => {
    expect(INTEGRATION_EVENT_TAXONOMY).toContain("order.created");
    expect(INTEGRATION_EVENT_TAXONOMY).toContain("payment.received");
    expect(INTEGRATION_EVENT_TAXONOMY).toContain("order.status_changed");
    expect(INTEGRATION_EVENT_TAXONOMY).toContain("inventory.adjusted");
  });

  it("validates event type membership", () => {
    expect(isIntegrationEventType("test.ping")).toBe(true);
    expect(isIntegrationEventType("catalog.updated")).toBe(true);
    expect(isIntegrationEventType("unknown.event")).toBe(false);
  });
});
