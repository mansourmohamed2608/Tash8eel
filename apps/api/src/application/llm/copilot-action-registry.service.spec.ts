import { CopilotActionRegistryService } from "./copilot-action-registry.service";

function makeCommand(intent: string, entities: Record<string, any>) {
  return {
    intent,
    confidence: 1,
    entities: {
      expense: null,
      stockUpdate: null,
      paymentLink: null,
      vipTag: null,
      dateRange: null,
      order: null,
      ...entities,
    },
    requires_confirmation: true,
    preview: null,
    missing_fields: [],
    reply_ar: "ok",
    reasoning: null,
  } as any;
}

describe("CopilotActionRegistryService", () => {
  it("fails stock update when target item cannot be resolved", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as any;

    const service = new CopilotActionRegistryService(pool);
    const command = makeCommand("UPDATE_STOCK", {
      stockUpdate: {
        sku: "SKU-404",
        productName: null,
        quantityChange: 5,
        absoluteQuantity: null,
      },
    });

    const result = await service.evaluatePreconditions("m-1", command);

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      "stockUpdate target item could not be resolved in catalog",
    );
  });

  it("blocks close month while there are open register sessions", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ open: 1 }] }),
    } as any;

    const service = new CopilotActionRegistryService(pool);
    const command = makeCommand("CLOSE_MONTH", {});

    const result = await service.evaluatePreconditions("m-1", command);

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(
      "close month requires all POS register sessions to be closed first",
    );
    expect(result.action.compensation.strategy).toBe("manual_followup");
  });
});
