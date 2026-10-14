// No key in an address (Oct 2026, Lane C). pullLive, refreshSpecLiveCounts, the history photocheck, the usage
// dashboard views and Buy's ?alerts=run take the probe key in the x-ops-key header only (lib/_credential.js); a key
// in the address is refused with 400, even the right one. The three cron endpoints also take Vercel's
// `Authorization: Bearer CRON_SECRET`; the two others do not. Fixture keys only; every call here is refused before
// any work, so nothing is fetched, pulled or spent.
//   node scripts/keyInAddressCheck.mjs      Run by scripts/prePush.mjs.
process.env.SUPABASE_URL = "http://127.0.0.1:9"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only";
process.env.PROBE_KEY = "fixture-probe-key"; process.env.CRON_SECRET = "fixture-cron"; delete process.env.OPS_KEY;
delete process.env.OLDCARSDATA_API_KEY;
import fs from "node:fs";
const { keyInAddress, hasHeaderKey, hasServerCredential } = await import("../lib/_credential.js");

let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const KEY = process.env.PROBE_KEY, CRON = { authorization: "Bearer " + process.env.CRON_SECRET };

ok(keyInAddress({ query: { key: KEY } }) && keyInAddress({ query: { opskey: "x" } }) && !keyInAddress({ query: { mode: "auto" } }) && !keyInAddress({}), "keyInAddress reads the address");
ok(hasHeaderKey({ headers: { "x-ops-key": KEY } }) && !hasHeaderKey({ headers: CRON }) && !hasHeaderKey({ headers: {} }), "hasHeaderKey: the header key only, never the cron secret");
ok(hasServerCredential({ headers: CRON }) && hasServerCredential({ headers: { "x-ops-key": KEY } }) && !hasServerCredential({ headers: {}, query: { key: KEY } }), "hasServerCredential: header or cron, never the address");

// Each handler, called the way a caller would. A refused call answers before any work.
const call = async (handler, query, headers = {}) => {
  let status = 0, body = null;
  const res = { setHeader() {}, getHeader() {}, status(s) { status = s; return this; }, json(b) { body = b; return this; }, send(b) { body = b; return this; }, end() { return this; } };
  await handler({ method: "GET", query, headers: { host: "goasksam.com", ...headers }, url: "/x" }, res);
  return { status, body };
};
const H = [
  ["pullLive", (await import("../api/pullLive.js")).default, { mode: "auto" }, true],
  ["refreshSpecLiveCounts", (await import("../api/refreshSpecLiveCounts.js")).default, {}, true],
  ["history photocheck", (await import("../api/history.js")).default, { photocheck: "vins" }, true],
  ["usageDashboard", (await import("../api/usageDashboard.js")).default, { view: "outbound" }, false],
  ["buySearch alerts=run", (await import("../api/buySearch.js")).default, { alerts: "run" }, false],
];
for (const [name, h, q, cron] of H) {
  const a = await call(h, { ...q, key: KEY });
  ok(a.status === 400 && /x-ops-key header/.test(JSON.stringify(a.body)), `${name}: the right key in the address is refused (got ${a.status})`);
  const b = await call(h, q);
  ok(b.status === 401, `${name}: no key, 401 (got ${b.status})`);
  const c = await call(h, q, { "x-ops-key": "wrong" });
  ok(c.status === 401, `${name}: a wrong header key, 401 (got ${c.status})`);
  if (!cron) { const d = await call(h, q, CRON); ok(d.status === 401, `${name}: not a cron endpoint, the cron secret is refused (got ${d.status})`); }
}
// The cron endpoints keep the cron path, and the crons send no key in their address.
const src = f => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
for (const f of ["api/pullLive.js", "api/refreshSpecLiveCounts.js", "api/history.js"]) ok(/keyInAddress\(req\)/.test(src(f)) && /hasServerCredential\(req\)/.test(src(f)) && !/query\??\.key\b/.test(src(f)), `${f}: header or cron only`);
for (const f of ["api/usageDashboard.js", "api/buySearch.js"]) ok(/hasHeaderKey\(req\)/.test(src(f)) && !/query\??\.key\b/.test(src(f).replace(/\/\/.*$/gm, "")), `${f}: header key only`);
const vj = JSON.parse(src("vercel.json"));
ok((vj.crons || []).length > 0 && (vj.crons || []).every(c => !/[?&](key|opskey|probe_key)=/i.test(c.path)), "no cron path carries a key");
for (const f of [".github/workflows/nightly.yml", "docs/nightly-workflow.yml"]) ok(!/[?&](key|opskey)=\$/.test(src(f)), `${f}: no key in an address`);
ok(!/href="[^"]*[?&]key=/.test(src("api/usageDashboard.js")) && !/name="key"/.test(src("api/usageDashboard.js")), "usage dashboard: no link or form carries a key");

console.log(`keyInAddressCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
