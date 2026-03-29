#!/usr/bin/env node

/**
 * API smoke test for local Tash8eel flows without WhatsApp transport.
 *
 * What it tests:
 * 1) Health endpoint
 * 2) POS integrations CRUD (+ Google Slides contract test)
 * 3) Assistant chat
 * 4) Assistant RAG preview
 * 5) Inbox message (order-like text)
 *
 * Auth modes:
 * - Bearer token (MERCHANT_AUTH_TOKEN). If not provided, a demo token is generated.
 * - x-api-key (MERCHANT_API_KEY) if you want to test API-key mode directly.
 *
 * Usage examples:
 *   node scripts/test-live-api-flow.js
 *   API_BASE_URL=http://localhost:3000 MERCHANT_AUTH_TOKEN=... node scripts/test-live-api-flow.js
 *   API_BASE_URL=http://localhost:3000 MERCHANT_API_KEY=mkey_xxx node scripts/test-live-api-flow.js
 */

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
const MERCHANT_ID = process.env.MERCHANT_ID || "demo-merchant";
const SENDER_ID = process.env.SENDER_ID || "201111111111";
const TEST_QUERY = process.env.TEST_QUERY || "بيتزا";
const TEST_CHAT_MESSAGE =
  process.env.TEST_CHAT_MESSAGE ||
  "عايز اعرف افضل المنتجات حاليا وهل في اقتراحات لزيادة المبيعات؟";
const TEST_ORDER_TEXT =
  process.env.TEST_ORDER_TEXT ||
  "عايز اطلب 2 بيتزا مارجريتا و 1 كوكاكولا والعنوان مدينة نصر عباس العقاد والدفع كاش عند الاستلام";
const KEEP_POS = process.env.KEEP_POS === "true";

const generatedDemoToken = `demo-token-${Math.floor(Date.now() / 1000)}`;
const authToken = process.env.MERCHANT_AUTH_TOKEN || generatedDemoToken;
const apiKey = process.env.MERCHANT_API_KEY;

function buildHeaders() {
  const headers = {
    "content-type": "application/json",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  } else {
    headers.Authorization = `Bearer ${authToken}`;
  }

  return headers;
}

async function requestJson(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText} for ${path}`);
    err.status = res.status;
    err.response = data;
    throw err;
  }

  return data;
}

function printStep(title) {
  console.log("\n============================================================");
  console.log(title);
  console.log("============================================================");
}

function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

async function run() {
  const summary = [];
  let createdPosId = null;
  let testedPosId = null;

  try {
    printStep("STEP 0: Health");
    const health = await requestJson("/health", { method: "GET" });
    printJson(health);
    summary.push({ step: "health", ok: true });

    printStep("STEP 1: POS list/create/test/delete");
    const listBefore = await requestJson("/api/v1/portal/pos-integrations", {
      method: "GET",
    });
    const posList = Array.isArray(listBefore) ? listBefore : [];
    console.log(`POS count before: ${posList.length}`);

    const createPayload = {
      provider: "google_slides",
      name: "Google Slides Smoke Test",
      credentials: {
        presentationId: "1AbCDefGhIJkLmNoPqRsTuVwXyZ",
        serviceAccountEmail: "slides-bot@project.iam.gserviceaccount.com",
        privateKey: "-----BEGIN PRIVATE KEY-----test-----END PRIVATE KEY-----",
      },
      config: {
        templateSlideId: "g1234567890",
      },
    };

    const existingGoogleSlides = posList.find(
      (item) => String(item?.provider || "").toLowerCase() === "google_slides",
    );

    if (existingGoogleSlides?.id) {
      testedPosId = existingGoogleSlides.id;
      console.log(
        `Reusing existing google_slides integration: ${testedPosId} (skip create)`,
      );
      printJson(existingGoogleSlides);
    } else {
      const created = await requestJson("/api/v1/portal/pos-integrations", {
        method: "POST",
        body: JSON.stringify(createPayload),
      });
      createdPosId = created?.id;
      testedPosId = createdPosId;
      console.log(`Created POS id: ${createdPosId}`);
      printJson(created);
    }

    const tested = await requestJson(
      `/api/v1/portal/pos-integrations/${testedPosId}/test`,
      {
        method: "POST",
      },
    );
    printJson(tested);

    if (!KEEP_POS && createdPosId) {
      const deleted = await requestJson(
        `/api/v1/portal/pos-integrations/${createdPosId}`,
        {
          method: "DELETE",
        },
      );
      console.log("Deleted created POS integration:");
      printJson(deleted);
      createdPosId = null;
    } else if (KEEP_POS && createdPosId) {
      console.log("KEEP_POS=true, keeping created POS integration.");
    } else {
      console.log(
        "No new POS integration created; existing integration was reused.",
      );
    }

    const listAfter = await requestJson("/api/v1/portal/pos-integrations", {
      method: "GET",
    });
    console.log(
      `POS count after: ${Array.isArray(listAfter) ? listAfter.length : 0}`,
    );
    summary.push({ step: "pos_crud", ok: true });

    printStep("STEP 2: Assistant chat");
    const chatRes = await requestJson("/api/v1/portal/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ message: TEST_CHAT_MESSAGE, history: [] }),
    });
    printJson(chatRes);
    summary.push({ step: "assistant_chat", ok: true });

    printStep("STEP 3: Assistant RAG preview");
    const ragRes = await requestJson("/api/v1/portal/assistant/rag-preview", {
      method: "POST",
      body: JSON.stringify({ query: TEST_QUERY, limit: 5 }),
    });
    printJson(ragRes);
    summary.push({ step: "rag_preview", ok: true });

    printStep("STEP 4: Inbox order-like message (no WhatsApp transport)");
    const inboxRes = await requestJson("/api/v1/inbox/message", {
      method: "POST",
      body: JSON.stringify({
        merchantId: MERCHANT_ID,
        senderId: SENDER_ID,
        text: TEST_ORDER_TEXT,
        correlationId: `smoke-${Date.now()}`,
      }),
    });
    printJson(inboxRes);
    summary.push({ step: "inbox_message", ok: true });

    printStep("SUMMARY");
    printJson({
      ok: true,
      apiBaseUrl: API_BASE_URL,
      authMode: apiKey ? "x-api-key" : "bearer",
      usedDemoToken: !apiKey && !process.env.MERCHANT_AUTH_TOKEN,
      steps: summary,
    });
  } catch (error) {
    printStep("FAILED");
    console.error(error.message);
    if (error.response) {
      console.error("Response:");
      printJson(error.response);
    }

    if (createdPosId && !KEEP_POS) {
      try {
        await requestJson(`/api/v1/portal/pos-integrations/${createdPosId}`, {
          method: "DELETE",
        });
        console.log("Cleanup: deleted created POS integration.");
      } catch (cleanupError) {
        console.error(
          `Cleanup failed for POS ${createdPosId}: ${cleanupError.message}`,
        );
      }
    }

    process.exit(1);
  }
}

run();
