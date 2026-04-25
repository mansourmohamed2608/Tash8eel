/**
 * RAG Safety and Quality tests — Wave 4
 *
 * Verifies:
 * 1. KB visibility enforcement — customer-facing retrieval only returns public chunks
 * 2. Internal/private KB chunks are excluded from customer-facing retrieval
 * 3. Admin/internal retrieval (no customerVisibleOnly) is NOT restricted
 * 4. MerchantContextService passes customerVisibleOnly:true for customer reply KB calls
 * 5. Catalog section includes product price for AI use
 * 6. Prompt guards include price rules and internal-KB prohibition
 *
 * All tests are unit tests — no DB or live API required.
 * Fixtures use generic merchant data; no hardcoded demo business names or product pairs.
 */

import { KbRetrievalService } from "../../llm/kb-retrieval.service";
import { MerchantContextService } from "../../llm/merchant-context.service";

// ─── Minimal stubs ────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) };
}

function makeEmbedding(vec?: number[]) {
  return { embed: jest.fn().mockResolvedValue(vec ?? new Array(1536).fill(0)) };
}

function makeKbChunkRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "chunk-1",
    merchant_id: "m-1",
    source_type: "faq",
    business_type: null,
    module: null,
    category: null,
    locale: "ar",
    visibility: "public",
    confidence_level: "high",
    requires_manual_review: false,
    tags: [],
    title: "سياسة الإرجاع",
    content: "الإرجاع خلال 14 يوم",
    last_updated: new Date().toISOString(),
    source_reference: null,
    ...overrides,
  };
}

// ─── 1. KB visibility — semantic search path ──────────────────────────────────

describe("KbRetrievalService — visibility enforcement (semantic path)", () => {
  it("appends visibility=public to SQL when customerVisibleOnly=true", async () => {
    const nonZeroVec = new Array(1536).fill(0.1);
    const embedding = makeEmbedding(nonZeroVec);
    const pool = makePool([makeKbChunkRow()]);

    const service = new KbRetrievalService(pool as any, embedding as any);
    await service.searchChunks("m-1", "إرجاع", { customerVisibleOnly: true });

    const capturedSql: string = pool.query.mock.calls[0][0] as string;
    expect(capturedSql).toContain("visibility = 'public'");
  });

  it("does not add visibility WHERE filter when customerVisibleOnly is absent (semantic)", async () => {
    const nonZeroVec = new Array(1536).fill(0.1);
    const embedding = makeEmbedding(nonZeroVec);
    const pool = makePool([makeKbChunkRow()]);

    const service = new KbRetrievalService(pool as any, embedding as any);
    await service.searchChunks("m-1", "إرجاع");

    const capturedSql: string = pool.query.mock.calls[0][0] as string;
    expect(capturedSql).not.toContain("AND visibility = 'public'");
  });
});

// ─── 2. KB visibility — keyword search path ───────────────────────────────────

describe("KbRetrievalService — visibility enforcement (keyword path)", () => {
  it("appends visibility=public to SQL when customerVisibleOnly=true", async () => {
    // Zero vector forces keyword fallback
    const embedding = makeEmbedding(new Array(1536).fill(0));
    const pool = makePool([makeKbChunkRow()]);

    const service = new KbRetrievalService(pool as any, embedding as any);
    await service.searchChunks("m-1", "إرجاع", { customerVisibleOnly: true });

    const capturedSql: string = pool.query.mock.calls[0][0] as string;
    expect(capturedSql).toContain("visibility = 'public'");
  });

  it("does not add visibility WHERE filter when customerVisibleOnly is absent (keyword)", async () => {
    const embedding = makeEmbedding(new Array(1536).fill(0));
    const pool = makePool([makeKbChunkRow()]);

    const service = new KbRetrievalService(pool as any, embedding as any);
    await service.searchChunks("m-1", "إرجاع");

    const capturedSql: string = pool.query.mock.calls[0][0] as string;
    expect(capturedSql).not.toContain("AND visibility = 'public'");
  });
});

// ─── 3. KB retrieval — internal chunk exclusion in SQL ────────────────────────

describe("KbRetrievalService — internal chunk exclusion", () => {
  it("SQL with customerVisibleOnly=true cannot match internal-visibility rows", async () => {
    // The SQL filter `AND visibility = 'public'` means the DB will not return
    // rows where visibility = 'internal'. We verify the filter is present.
    const embedding = makeEmbedding(new Array(1536).fill(0));
    const pool = makePool([
      makeKbChunkRow({ visibility: "public", content: "معلومة للعميل" }),
    ]);

    const service = new KbRetrievalService(pool as any, embedding as any);
    const results = await service.searchChunks("m-1", "معلومة", {
      customerVisibleOnly: true,
    });

    // Confirm the visibility filter reached the DB
    const sql: string = pool.query.mock.calls[0][0] as string;
    expect(sql).toContain("visibility = 'public'");

    // The mock returned one public chunk — it should come back
    expect(results).toHaveLength(1);
    expect(results[0].visibility).toBe("public");
  });

  it("without customerVisibleOnly the query has no visibility WHERE filter (admin path)", async () => {
    const embedding = makeEmbedding(new Array(1536).fill(0));
    const pool = makePool([
      makeKbChunkRow({ visibility: "internal", content: "معلومة داخلية" }),
    ]);

    const service = new KbRetrievalService(pool as any, embedding as any);
    // No visibility filter — simulates an admin/internal lookup
    const results = await service.searchChunks("m-1", "معلومة");

    const sql: string = pool.query.mock.calls[0][0] as string;
    // The WHERE clause should NOT contain a visibility restriction
    expect(sql).not.toContain("AND visibility = 'public'");
    expect(results).toHaveLength(1);
  });
});

// ─── 4. MerchantContextService — passes customerVisibleOnly:true ───────────────

describe("MerchantContextService — customer reply KB retrieval", () => {
  const mockVector = { semanticSearch: jest.fn().mockResolvedValue([]) };
  const mockConfig = {
    get: jest.fn((key: string, fallback?: unknown) => fallback),
  };

  it("calls kbRetrievalService.searchChunks with customerVisibleOnly:true", async () => {
    const mockKb = {
      hasStructuredKb: jest.fn().mockResolvedValue(true),
      searchChunks: jest.fn().mockResolvedValue([]),
    };
    const mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const mockEmbedding = {
      embed: jest.fn().mockResolvedValue(new Array(1536).fill(0)),
    };

    const service = new MerchantContextService(
      mockPool as any,
      mockEmbedding as any,
      mockVector as any,
      mockKb as any,
      mockConfig as any,
    );

    const merchant: any = {
      id: "m-1",
      name: "متجر اختبار",
      language: "ar",
      knowledgeBase: {},
      config: {},
      category: "general",
    };
    const conversation: any = {
      id: "conv-1",
      context: {},
      cart: { items: [] },
      senderId: "customer-1",
      customerId: null,
      collectedInfo: {},
      conversationSummary: null,
    };

    await service.buildCustomerReplyContext({
      merchant,
      conversation,
      customerMessage: "ما هي سياسة الإرجاع؟",
      recentMessages: [],
    });

    expect(mockKb.searchChunks).toHaveBeenCalledWith(
      "m-1",
      "ما هي سياسة الإرجاع؟",
      expect.objectContaining({ customerVisibleOnly: true }),
    );
  });
});

// ─── 5. Catalog section includes price ────────────────────────────────────────

describe("MerchantContextService — catalog price in context", () => {
  function makeContextService(): MerchantContextService {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const embedding = { embed: jest.fn().mockResolvedValue(new Array(1536).fill(0)) };
    const vector = { semanticSearch: jest.fn().mockResolvedValue([]) };
    const kb = {
      hasStructuredKb: jest.fn().mockResolvedValue(false),
      searchChunks: jest.fn().mockResolvedValue([]),
    };
    const config = { get: jest.fn((k: string, d?: unknown) => d) };
    return new MerchantContextService(
      pool as any, embedding as any, vector as any, kb as any, config as any,
    );
  }

  it("includes product price in catalog section", () => {
    const service = makeContextService();
    const rows: any[] = [
      {
        id: "prod-1",
        merchant_id: "m-1",
        sku: "SKU-TEST",
        name_ar: "منتج اختبار",
        name_en: "Test Product",
        description_ar: "وصف المنتج",
        category: "عام",
        base_price: "350",
        price: "350",
        stock_quantity: "20",
        is_available: true,
        is_active: true,
        variants: [],
        tags: [],
      },
    ];

    const section: string = (service as any).buildCustomerProductCatalogSection(rows, rows);
    expect(section).toContain("350");
    expect(section).toContain("منتج اختبار");
  });

  it("marks out-of-stock items as unavailable", () => {
    const service = makeContextService();
    const rows: any[] = [
      {
        id: "prod-2",
        merchant_id: "m-1",
        sku: null,
        name_ar: "منتج نافد",
        name_en: null,
        description_ar: null,
        category: "عام",
        base_price: "200",
        price: "200",
        stock_quantity: "0",
        is_available: false,
        is_active: true,
        variants: [],
        tags: [],
      },
    ];

    const section: string = (service as any).buildCustomerProductCatalogSection(rows, rows);
    expect(section).toContain("no");
  });
});

// ─── 6. Prompt guards ────────────────────────────────────────────────────────

describe("LlmService — prompt guards for price and internal KB", () => {
  function buildTestSystemPromptDialogTurn(): string {
    // Inline the guard text we expect to appear in both prompt builders.
    // We verify the same rules appear in the actual service by checking
    // the constant strings we added — no LLM instantiation needed.
    const EXPECTED_PRICE_GUARD =
      "ممنوع تخمّن أو تخترع سعراً";
    const EXPECTED_MISSING_PRICE_GUARD =
      "السعر مش متوفر دلوقتي";
    const EXPECTED_INTERNAL_KB_GUARD =
      "لا تنقل للعميل أي معلومات KB داخلية";

    return [EXPECTED_PRICE_GUARD, EXPECTED_MISSING_PRICE_GUARD, EXPECTED_INTERNAL_KB_GUARD].join("\n");
  }

  it("dialog turn system prompt should contain price guard", () => {
    // Read the actual prompt builder source to verify the guard text is present.
    // Since we cannot instantiate LlmService without a real OpenAI key in unit
    // tests, we verify the guard strings appear in the compiled source file.
    // This is intentionally a static guard — any removal of these strings from
    // the prompt builder will break this test.
    const { LlmService } = require("../../llm/llm.service");
    const src: string = LlmService.toString();

    // The key guard phrases must appear somewhere in the class source
    expect(src).toMatch(/ممنوع تخمّن أو تخترع سعراً/);
    expect(src).toMatch(/السعر مش متوفر دلوقتي/);
    expect(src).toMatch(/لا تنقل للعميل أي معلومات KB داخلية/);
  });

  it("dialog render system prompt should also contain price and internal KB guards", () => {
    const { LlmService } = require("../../llm/llm.service");
    const src: string = LlmService.toString();
    // Guards appear twice — once in each prompt builder
    const priceGuardOccurrences = (src.match(/ممنوع تخمّن أو تخترع سعراً/g) || []).length;
    const internalKbGuardOccurrences = (src.match(/لا تنقل للعميل أي معلومات KB داخلية/g) || []).length;
    expect(priceGuardOccurrences).toBeGreaterThanOrEqual(2);
    expect(internalKbGuardOccurrences).toBeGreaterThanOrEqual(2);
  });
});

// ─── 7. KB sync status ────────────────────────────────────────────────────────

describe("KB sync path status", () => {
  it("KbChunkService.syncFromMerchantKb exists (sync path is available)", async () => {
    const { KbChunkService } = require("../../services/kb-chunk.service");
    const instance = new KbChunkService({ query: jest.fn().mockResolvedValue({ rows: [] }) });
    expect(typeof instance.syncFromMerchantKb).toBe("function");
  });

  it("KbChunkService.syncFromMerchantKb returns upserted/deactivated/queued counts", async () => {
    const { KbChunkService } = require("../../services/kb-chunk.service");
    const pool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // SELECT knowledge_base
        .mockResolvedValue({ rows: [] }),     // any subsequent queries
    };
    const instance = new KbChunkService(pool);
    const result = await instance.syncFromMerchantKb("m-1");
    expect(result).toMatchObject({
      upserted: expect.any(Number),
      deactivated: expect.any(Number),
      queued: expect.any(Number),
    });
  });
});
