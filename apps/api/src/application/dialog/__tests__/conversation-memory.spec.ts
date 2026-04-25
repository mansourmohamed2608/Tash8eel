/**
 * Conversation memory architecture tests.
 *
 * Tests verify:
 * - Conversations longer than 20 messages use summary + last-20 strategy
 * - Older details mentioned early are preserved in summary
 * - AI context explicitly marks known fields so the model does not re-ask
 * - Memory summary appears in prompt context when available
 * - Last 20 messages remain verbatim; older messages do not bloat the prompt
 * - MemoryCompressionService RECENT_MESSAGES_TO_KEEP defaults to 20
 */

// MerchantContextService private method tests — accessed via (instance as any)
// No DB or async calls needed for the pure brief-builder and history-slicer.

import { MerchantContextService } from "../../llm/merchant-context.service";

// ---------------------------------------------------------------------------
// Minimal stubs — only what the constructor needs; no DB calls are made
// since we only invoke pure private methods.
// ---------------------------------------------------------------------------
const mockPool = {} as any;
const mockEmbedding = { embed: jest.fn() } as any;
const mockVector = { semanticSearch: jest.fn() } as any;
const mockKb = { hasStructuredKb: jest.fn(), searchChunks: jest.fn() } as any;
const mockConfig = {
  get: jest.fn((key: string, fallback?: unknown) => fallback),
} as any;

function makeContextService(): MerchantContextService {
  return new MerchantContextService(
    mockPool,
    mockEmbedding,
    mockVector,
    mockKb,
    mockConfig,
  );
}

function makeMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${i}`,
    conversationId: "conv-1",
    merchantId: "m-1",
    senderId: i % 2 === 0 ? "customer" : "bot",
    direction: i % 2 === 0 ? "inbound" : "outbound",
    text: `رسالة رقم ${i}`,
    createdAt: new Date(Date.now() + i * 1000),
    updatedAt: new Date(Date.now() + i * 1000),
  }));
}

// ---------------------------------------------------------------------------
// History slicing
// ---------------------------------------------------------------------------
describe("prepareHistoryMessages", () => {
  const svc = makeContextService() as any;

  it("limits to last 20 messages when conversation is long", () => {
    const messages = makeMessages(35);
    const result = svc.prepareHistoryMessages(messages, "latest customer msg");
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("keeps all messages when under 20", () => {
    const messages = makeMessages(10);
    const result = svc.prepareHistoryMessages(messages, "latest customer msg");
    expect(result.length).toBe(10);
  });

  it("drops the last inbound message that matches the current customer message", () => {
    const messages = makeMessages(5);
    const lastInbound = messages[messages.length - 1];
    lastInbound.direction = "inbound";
    lastInbound.text = "هل عندكم توصيل؟";
    const result = svc.prepareHistoryMessages(messages, "هل عندكم توصيل؟");
    const texts = result.map((m: any) => m.text);
    expect(texts).not.toContain("هل عندكم توصيل؟");
  });

  it("does not include more than 20 messages even when all are older", () => {
    const messages = makeMessages(50);
    const result = svc.prepareHistoryMessages(messages, "new message");
    expect(result.length).toBeLessThanOrEqual(20);
    const expectedLastText = `رسالة رقم 49`;
    const texts = result.map((m: any) => m.text);
    expect(texts).toContain(expectedLastText);
  });
});

// ---------------------------------------------------------------------------
// Conversation memory brief — do-not-ask and summary injection
// ---------------------------------------------------------------------------
describe("buildConversationMemoryBrief", () => {
  const svc = makeContextService() as any;

  const baseBriefInput = {
    businessType: undefined,
    universalSlots: {},
    customSlots: {},
    slotConfidence: {},
    schema: undefined,
    missingImportantSlots: [],
    suggestedNextStep: undefined,
    conversationSummary: "",
    recentHistoryText: "",
    historyCount: 3,
    askedSlots: [],
    answeredSlots: [],
  };

  it("includes older summary section when summary exists", () => {
    const brief: string = svc.buildConversationMemoryBrief({
      ...baseBriefInput,
      conversationSummary: "العميل مهتم بعطر عود وميزانيته 500 جنيه",
      historyCount: 25,
    });
    expect(brief).toContain("ملخص المحادثة الأقدم");
    expect(brief).toContain("العميل مهتم بعطر عود وميزانيته 500 جنيه");
  });

  it("omits summary section when summary is empty", () => {
    const brief: string = svc.buildConversationMemoryBrief({
      ...baseBriefInput,
      conversationSummary: "",
    });
    expect(brief).not.toContain("ملخص المحادثة الأقدم");
  });

  it("includes known filled slot in do-not-ask section", () => {
    const brief: string = svc.buildConversationMemoryBrief({
      ...baseBriefInput,
      universalSlots: { product_interest: "عطر عود شرقي" },
    });
    expect(brief).toContain("معلومات معروفة");
    expect(brief).toContain("عطر عود شرقي");
    expect(brief).toContain("لا تسأل مجدداً");
  });

  it("includes the do-not-ask instruction even when no slots are filled", () => {
    const brief: string = svc.buildConversationMemoryBrief(baseBriefInput);
    expect(brief).toContain("معلومات معروفة");
    expect(brief).toContain("لا تسأل مجدداً");
  });

  it("lists answered slots when provided", () => {
    const brief: string = svc.buildConversationMemoryBrief({
      ...baseBriefInput,
      universalSlots: { quantity: 3 },
      answeredSlots: ["quantity"],
    });
    expect(brief).toContain("حقول أُجيب عنها بالفعل");
  });

  it("lists asked slots when provided", () => {
    const brief: string = svc.buildConversationMemoryBrief({
      ...baseBriefInput,
      askedSlots: ["delivery_area"],
    });
    expect(brief).toContain("حقول سُئل عنها");
  });

  it("shows both summary and recent messages verbatim for long conversations", () => {
    const brief: string = svc.buildConversationMemoryBrief({
      ...baseBriefInput,
      conversationSummary: "ملخص قديم: اهتمام بالعطور",
      recentHistoryText: "Customer: بكام العطر؟\nAssistant: 450 جنيه",
      historyCount: 22,
    });
    expect(brief).toContain("ملخص قديم: اهتمام بالعطور");
    expect(brief).toContain("Customer: بكام العطر؟");
  });

  it("does not list an answered slot as missing", () => {
    const brief: string = svc.buildConversationMemoryBrief({
      ...baseBriefInput,
      universalSlots: { delivery_area: "مدينة نصر" },
      answeredSlots: ["delivery_area"],
      // delivery_area is NOT in missingImportantSlots
      missingImportantSlots: [],
    });
    // The filled value should appear in known section
    expect(brief).toContain("مدينة نصر");
    // Missing slots section should say no missing
    expect(brief).toContain("لا يوجد");
  });

  it("includes custom slot values in known section", () => {
    const schema = {
      customSlots: [{ key: "color", labelAr: "اللون" }],
    };
    const brief: string = svc.buildConversationMemoryBrief({
      ...baseBriefInput,
      customSlots: { color: "أزرق" },
      schema,
    });
    expect(brief).toContain("اللون");
    expect(brief).toContain("أزرق");
    expect(brief).toContain("لا تسأل مجدداً");
  });
});

// ---------------------------------------------------------------------------
// MemoryCompressionService — defaults
// ---------------------------------------------------------------------------
describe("MemoryCompressionService defaults", () => {
  it("RECENT_MESSAGES_TO_KEEP defaults to 20", () => {
    // Verify via ConfigService mock that returns undefined (triggers default)
    const configMock = {
      get: jest.fn().mockReturnValue(undefined),
    } as any;

    const { MemoryCompressionService } = require("../../services/memory-compression.service");

    // ConfigService.get with 2 args returns the second arg as default
    const configWithDefault = {
      get: jest.fn((key: string, fallback: unknown) => fallback),
    } as any;

    const repoMock = {} as any;
    const msgRepoMock = {} as any;
    const usageGuardMock = {} as any;

    const svc = new MemoryCompressionService(
      configWithDefault,
      repoMock,
      msgRepoMock,
      usageGuardMock,
    );

    // The default should be 20 — access via private field
    expect((svc as any).RECENT_MESSAGES_TO_KEEP).toBe(20);
  });
});
