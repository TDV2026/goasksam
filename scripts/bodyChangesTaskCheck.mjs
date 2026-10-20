// bodyChangesTaskCheck (Lane B, Oct 20 2026): offline check of the read-only ops task=bodychanges. Without the ops key it is
// refused (401); with the key and a stubbed database (every request answered locally, nothing leaves the machine) it reads only
// sales_archive with GET, writes nothing, and returns the ranked W204/W205 candidate with its stated limit.
process.env.PROBE_KEY = "local-check-key"; process.env.OLDCARSDATA_API_KEY = "unused-local-check";
process.env.SUPABASE_URL = "https://stub.invalid"; process.env.SUPABASE_SERVICE_ROLE_KEY = "stub"; process.env.SUPABASE_ANON_KEY = "stub";
const rows = [];
for (const y of [2008, 2009, 2010, 2011, 2012, 2013, 2014]) for (let i = 0; i < 2; i++) rows.push({ make: "Mercedes-Benz", model: "C-Class", year: y, listing_title: `${y} Mercedes-Benz C63 AMG W204` });
for (const y of [2017, 2018, 2019, 2020]) for (let i = 0; i < 2; i++) rows.push({ make: "Mercedes-Benz", model: "C-Class", year: y, listing_title: `${y} Mercedes-AMG C63 S W205` });
const seen = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url), method = (opts.method || "GET").toUpperCase();
  seen.push({ method, u });
  const body = /\/rest\/v1\/sales_archive\?/.test(u) && /make=ilike\.mercedes-benz/i.test(u) ? rows : [];   // one short page: the read ends there
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "content-range": `0-${Math.max(0, body.length - 1)}/${body.length}` } });
};
const { default: handler } = await import("../api/usageDashboard.js");
const call = async (headers, extra = {}) => {
  let code = 200, body = null;
  const query = { view: "ops", task: "bodychanges", ...extra };
  const res = { statusCode: 200, setHeader() {}, getHeader() {}, status(c) { code = c; return this; }, json(o) { body = o; return this; }, send(o) { body = o; return this; }, end() { return this; } };
  await handler({ method: "GET", url: "/api/usageDashboard?" + new URLSearchParams(query), query, headers }, res);
  return { code, body };
};
let bad = 0;
const ok = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const a = await call({});
ok(a.code === 401, `no key -> 401 (${a.code})`);
seen.length = 0;
const b = await call({ "x-ops-key": "local-check-key" }, { makes: "mercedes-benz" });
const c = b.body && b.body.candidates && b.body.candidates[0];
ok(b.code === 200 && b.body.task === "bodychanges", `with the key -> 200 (${b.code} ${JSON.stringify(b.body).slice(0, 160)})`);
ok(c && c.earlier.code === "204" && c.later.code === "205" && c.typedYearsThatMix.join() === "2015,2016", "the W204/W205 candidate, with the typed years that mix (2015, 2016)");
ok(b.body && /NAME/.test(b.body.limit || ""), "the limit is stated on the output");
ok(seen.length > 0 && seen.every(s => s.method === "GET" && /\/rest\/v1\/sales_archive\?/.test(s.u)), `only GET reads of sales_archive (${seen.map(s => s.method + " " + s.u.split("?")[0].split("/").pop()).join(", ")})`);
ok(!seen.some(s => /oldcarsdata|api\.oldcars/i.test(s.u)), "no OldCarsData request");
console.log(bad ? `bodyChangesTaskCheck: ${bad} failed` : "bodyChangesTaskCheck: all passed");
process.exit(bad ? 1 : 0);
