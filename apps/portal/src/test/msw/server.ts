/**
 * MSW Node.js server for Vitest / jsdom integration tests.
 *
 * The server is started in `src/test/setup.ts` before test suites run and
 * torn down after. Individual tests can add or override handlers via:
 *
 *   import { server } from "@/test/msw/server";
 *   import { http, HttpResponse } from "msw";
 *
 *   test("handles 500 error", () => {
 *     server.use(
 *       http.get("/api/v1/merchants/:id/orders", () =>
 *         HttpResponse.json({ message: "Internal Server Error" }, { status: 500 })
 *       )
 *     );
 *     // ... render component and assert error state
 *   });
 */

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
