// bodyAsideCheck (Lane B, Oct 20 2026): offline check of the read-only ops task=bodyaside. Without the ops key the
// request is refused (401); with the key and no database env it reaches the task and stops before any read (500, "Supabase
// env not set."). No network, no database.
process.env.PROBE_KEY = "local-check-key"; process.env.OLDCARSDATA_API_KEY = "unused-local-check";   // the ops handler checks it is set; nothing here calls OldCarsData
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_ANON_KEY;
const { default: handler } = await import("../api/usageDashboard.js");
const call = async headers => {
  let code = 200, body = null;
  const res = { statusCode: 200, setHeader() {}, getHeader() {}, status(c) { code = c; return this; }, json(o) { body = o; return this; }, send(o) { body = o; return this; }, end() { return this; } };
  await handler({ method: "GET", url: "/api/usageDashboard?view=ops&task=bodyaside", query: { view: "ops", task: "bodyaside" }, headers }, res);
  return { code, body };
};
let bad = 0;
const a = await call({});
if (a.code !== 401) { bad++; console.log("FAIL no key:", a.code, JSON.stringify(a.body).slice(0, 120)); } else console.log("ok   no key -> 401");
const b = await call({ "x-ops-key": "local-check-key" });
if (!(b.code === 500 && /Supabase env not set/.test(JSON.stringify(b.body)))) { bad++; console.log("FAIL with key:", b.code, JSON.stringify(b.body).slice(0, 160)); } else console.log("ok   with key, no database -> stops at the env check before any read");
console.log(bad ? `bodyAsideCheck: ${bad} failed` : "bodyAsideCheck: 2 passed, 0 failed");
process.exit(bad ? 1 : 0);
