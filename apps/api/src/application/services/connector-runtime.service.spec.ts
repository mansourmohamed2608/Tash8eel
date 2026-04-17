import { ConnectorRuntimeService } from "./connector-runtime.service";

describe("ConnectorRuntimeService retry backoff", () => {
  it("uses capped exponential retry delays", () => {
    const service = new ConnectorRuntimeService({} as any, {} as any);

    expect((service as any).getRetryDelaySeconds(1)).toBe(30);
    expect((service as any).getRetryDelaySeconds(2)).toBe(60);
    expect((service as any).getRetryDelaySeconds(3)).toBe(120);
    expect((service as any).getRetryDelaySeconds(4)).toBe(240);
  });

  it("caps retries at 30 minutes", () => {
    const service = new ConnectorRuntimeService({} as any, {} as any);

    expect((service as any).getRetryDelaySeconds(8)).toBe(1800);
    expect((service as any).getRetryDelaySeconds(9)).toBe(1800);
    expect((service as any).getRetryDelaySeconds(99)).toBe(1800);
  });

  it("retries open DLQ items in batch", async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: "dlq-1",
            runtime_event_id: "runtime-1",
          },
        ],
      }),
    } as any;

    const service = new ConnectorRuntimeService(pool, {} as any);
    const result = await service.retryDlqBatch({
      merchantId: "m-1",
      limit: 10,
    });

    expect(result.retriedCount).toBe(1);
    expect(result.items[0].runtime_event_id).toBe("runtime-1");
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "FOR UPDATE SKIP LOCKED",
    );
  });

  it("processes claimed queue events and marks them processed", async () => {
    const pool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "runtime-1",
              endpoint_id: "endpoint-1",
              event_type: "test.ping",
              payload: {},
              attempt_count: 0,
              max_attempts: 3,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    } as any;

    const integrationService = {
      processErpEvent: jest.fn().mockResolvedValue({
        success: true,
        message: "ok",
      }),
    } as any;

    const service = new ConnectorRuntimeService(pool, integrationService);
    const result = await service.processQueue({
      merchantId: "m-1",
      limit: 5,
    });

    expect(result.totalPicked).toBe(1);
    expect(result.processed).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.movedToDlq).toBe(0);
    expect(String(pool.query.mock.calls[0][0])).toContain(
      "FOR UPDATE SKIP LOCKED",
    );
  });
});
