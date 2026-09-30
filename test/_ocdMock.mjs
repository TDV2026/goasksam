// Global fetch mock for the OCD hard-cap / ingest-guard tests. Makes NO real network calls.
// Loaded via `node --import ./test/_ocdMock.mjs <script>` so it overrides fetch before the script runs.
//   MOCK_OCD_MODE=pages    -> /auctions returns a full page of new ids with a huge total_pages
//   MOCK_OCD_MODE=blocked  -> /auctions THROWS (the test asserts OCD is never called)
//   MOCK_HELD_FAIL=1       -> sales_archive reads return non-ok, so heldIds() gets null (DB blind)
let ocdCalls = 0;
const OCD_MODE = process.env.MOCK_OCD_MODE || "pages";
const HELD_FAIL = process.env.MOCK_HELD_FAIL === "1";
const H = { get: () => null };   // no rate-limit headers in the mock
const ok = (json) => ({ ok: true, status: 200, headers: H, json: async () => json, text: async () => JSON.stringify(json) });
const bad = (status = 500) => ({ ok: false, status, headers: H, json: async () => ({}), text: async () => "mock error" });

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("oldcarsdata.com")) {
    ocdCalls++;
    if (OCD_MODE === "blocked") throw new Error("MOCK VIOLATION: OCD /auctions must not be called in this test");
    return ok({ data: [{ id: `m${ocdCalls}`, auction_end_date: new Date().toISOString(), price: 25000, title: "2000 Test Car", ocd_make_name: "Test", ocd_model_name: "Car", year: 2000 }], meta: { total_pages: 9999 } });
  }
  if (u.includes("/rest/v1/sales_archive")) return HELD_FAIL ? bad(500) : ok([]);
  if (u.includes("/rest/v1/")) return ok([]);   // app_usage_events (seed/record), fx_rates, anything else
  return ok({});
};
process.on("exit", () => { try { process.stderr.write(`\n__MOCK_OCD_CALLS__=${ocdCalls}\n`); } catch {} });
