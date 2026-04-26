import { runAiV2LocalTranscriptEvals } from "../transcript-evals/local-runner";

describe("AI v2 local transcript evals (no secrets)", () => {
  it("runs without META secrets and without OPENAI_API_KEY (mock path)", async () => {
    process.env.AI_V2_LOCAL_TEST_MODE = "true";
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.META_PHONE_NUMBER_ID;
    delete process.env.OPENAI_API_KEY;

    const results = await runAiV2LocalTranscriptEvals();
    const failed = results.filter((r) => !r.pass);
    if (failed.length > 0) {
      // Make failures visible in Jest output
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(failed.slice(0, 8), null, 2));
    }
    expect(failed.length).toBe(0);
  });
});
