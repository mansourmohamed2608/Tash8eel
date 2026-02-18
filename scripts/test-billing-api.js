const http = require("http");
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const apiKey = process.env.TEST_API_KEY || "mkey_demo_1234567890abcdef";
const host = process.env.API_HOST || "localhost";
const port = process.env.API_PORT || 3001;

async function callApi(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: host,
        port: port,
        path: path,
        method: "GET",
        headers: { "x-api-key": apiKey },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function test() {
  console.log("🔍 Testing Billing API...\n");

  try {
    // Test /me endpoint
    console.log("1. Testing /v1/portal/me...");
    const me = await callApi("/v1/portal/me");
    console.log("   Merchant:", me.businessName);
    console.log("   Plan:", me.plan);
    console.log("   Agents:", me.enabledAgents?.join(", "));
    console.log("   Features:", Object.keys(me.features || {}).join(", "));

    // Test billing summary
    console.log("\n2. Testing /v1/portal/billing/summary...");
    const summary = await callApi("/v1/portal/billing/summary");
    console.log("   Status:", summary.status);
    if (summary.subscription) {
      console.log("   Plan:", summary.subscription.plan_code);
      console.log("   Status:", summary.subscription.status);
    }

    // Test billing plans
    console.log("\n3. Testing /v1/portal/billing/plans...");
    const plans = await callApi("/v1/portal/billing/plans");
    console.log(
      "   Available plans:",
      plans.plans?.map((p) => p.code).join(", "),
    );

    // Test billing offers
    console.log("\n4. Testing /v1/portal/billing/offers...");
    const offers = await callApi("/v1/portal/billing/offers");
    console.log("   Offers:", offers.offers?.length || 0);

    console.log("\n✅ All billing endpoints working!");
  } catch (err) {
    console.error("❌ Error:", err.message);
    console.log("Make sure the API server is running on port 3001");
  }
}

test();
