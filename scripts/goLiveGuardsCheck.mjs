// goLiveGuardsCheck (Lane E, Nov 10 2026, go live fixes after Lane C's prePush on fe9294d5): THE GO LIVE TIP MUST NOT DISTURB WHAT WAS ALREADY THERE.
// CAUSE of the five reds: the tip edited api/sell.js (the calm wrapper was put under the switch), api/crewPage.js (a multi line Find handler, a new race, an early render for the public door, in places other checks read by shape) and
// two new scripts (a crew number named by hand, a result line printed another way). Each was found only by the full prePush.
// CLASS: any api file the tip touched, and every crew preview route. This check pins:
//   A. EVERY crew preview route (every key of PAGES in api/crewPage.js) answers the same status and the same bytes with the switch off and with NEW_DESIGN=all, and never the 404 for a crew request (a data frame may answer 404 with no field).
//   B. in api/crewPage.js no page is rendered before the crew gate: the first renderAsync( is after the first sendDisguisedNotFound(.
//   C. every api file changed since the base keeps every wrapper it had (withCalm, withTracking, withHold), and where withNewDesign sits with withCalm the calm wrapper is the OUTER one.
//   node scripts/goLiveGuardsCheck.mjs [--base <ref>] [--mutants]
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".."); process.chdir(ROOT);
const args = process.argv.slice(2), baseRef = args.includes("--base") ? args[args.indexOf("--base") + 1] : "ee488ab5";   // the tree before go live: the sweep always covers every api file the go live work touched
if (args.includes("--mutants")) {
  const MUT = [
    ["the calm wrapper dropped from Sell", "api/sell.js", 'export default withCalm(withNewDesign("sell", handler), "sell");', 'export default withNewDesign("sell", handler);'],
    ["the calm wrapper put under the switch", "api/sell.js", 'export default withCalm(withNewDesign("sell", handler), "sell");', 'export default withNewDesign("sell", withCalm(handler, "sell"));'],
    ["a render before the crew gate", "api/crewPage.js", 'import { AsyncLocalStorage } from "node:async_hooks";', 'import { AsyncLocalStorage } from "node:async_hooks";\nconst __early = (p, req) => p.renderAsync(req);'],
    ["a crew route that answers the 404 to the crew", "api/crewPage.js", "if (!p || !(seat || isCrewRequest(req)", "if (!p || !(seat || !isCrewRequest(req)"],
    ["the crew preview calls the live handler without the mark (the new design nested in itself)", "api/crewPage.js", "handler({ ...req, __nd: true, method:", "handler({ ...req, method:"],
    ["a stray top level return", "api/crewPage.js", "const findFor = async req =>", "return; const findFor = async req =>"]
  ];
  let bad = 0;
  for (const [name, file, from, to] of MUT) {
    const f = path.join(ROOT, file), orig = fs.readFileSync(f, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    let code = 0;
    try { fs.writeFileSync(f, orig.replace(from, () => to)); try { execFileSync("node", [fileURLToPath(import.meta.url), "--base", baseRef], { stdio: "pipe" }); } catch (e) { code = e.status || 1; } } finally { fs.writeFileSync(f, orig); }
    console.log((code ? "caught   " : "MISSED   ") + "without " + name); if (!code) bad++;
  }
  console.log(bad ? "goLiveGuardsCheck mutants: " + bad + " not caught" : "goLiveGuardsCheck mutants: all " + MUT.length + " caught");
  process.exit(bad ? 1 : 0);
}
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.CURTAIN_CREW_CODE = "go-live-guards"; process.env.LAUNCH_STAGE = "2";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "NEW_DESIGN", "NEW_DESIGN_DATE"]) delete process.env[k];
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const cp = fs.readFileSync("api/crewPage.js", "utf8");
// B
{ const g = cp.indexOf("sendDisguisedNotFound(res, req)"), r = cp.indexOf("renderAsync(req)"); ok(g > 0 && r > g, "B: the first page render in api/crewPage.js comes after the crew gate"); }
// C
{ const changed = execFileSync("git", ["diff", baseRef, "--name-only", "--", "api"], { encoding: "utf8" }).split("\n").filter(f => /^api\/[^/]+\.js$/.test(f));
  ok(changed.length > 0, "C: the tip changes api files (" + changed.length + ")");
  for (const f of changed) {
    let before = ""; try { before = execFileSync("git", ["show", baseRef + ":" + f], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] }); } catch { continue; }
    const now = fs.readFileSync(f, "utf8");
    for (const w of ["withCalm", "withTracking", "withHold"]) { const had = (before.match(new RegExp("\\b" + w + "\\(", "g")) || []).length, has = (now.match(new RegExp("\\b" + w + "\\(", "g")) || []).length; ok(has >= had, `C: ${f} keeps ${w} (${had} before, ${has} now)`); }
    const m = now.match(/export default withCalm\(withNewDesign\(/), under = /export default withNewDesign\([^\n]*withCalm\(/.test(now);
    ok(!under, `C: ${f}: withCalm is not put under withNewDesign`); void m;
  } }
// A
const { PAGES } = await imp("api/crewPage.js"), { mintCrewCookieValue } = await imp("lib/_crew.js"), cookie = "gas_crew=" + mintCrewCookieValue();
const DATA_FRAMES = ["preview-market-check-example", "preview-history"];
const call = async (key, nd) => {
  if (nd) process.env.NEW_DESIGN = nd; else delete process.env.NEW_DESIGN;
  const m = await import(pathToFileURL(path.join(ROOT, "api/crewPage.js")).href + "?g=" + Math.random());
  const res = { h: {}, code: 200, body: "", setHeader(k, v) { this.h[k.toLowerCase()] = v; return this; }, getHeader(k) { return this.h[k.toLowerCase()]; }, removeHeader(k) { delete this.h[k.toLowerCase()]; }, status(c) { this.code = c; return this; }, send(b) { this.body = String(b); return this; }, end(b) { if (b) this.body = String(b); return this; }, json(b) { this.body = JSON.stringify(b); return this; }, writeHead(c, h) { this.code = c; Object.assign(this.h, h || {}); return this; } };
  const url = "/api/crewPage?page=" + key, req = { url, method: "GET", query: { page: key }, body: {}, headers: { host: "goasksam.com", "user-agent": "Mozilla/5.0", accept: "text/html", cookie } };
  await Promise.race([m.default(req, res), new Promise((_, r) => setTimeout(() => r(new Error("timed out")), 20000))]); return res;
};
const log = console.error; console.error = () => {};
for (const key of Object.keys(PAGES)) {
  let off, on; try { off = await call(key, ""); on = await call(key, "all"); } catch (e) { ok(false, `A: ${key} threw (${e.message})`); continue; }
  if (DATA_FRAMES.includes(key)) { ok(off.code === on.code && off.body === on.body, `A: ${key} (data frame) is the same with the switch off and on`); continue; }
  ok(off.code === 200 && on.code === 200, `A: ${key} renders for the crew with the switch off (${off.code}) and on (${on.code})`);
  ok(off.body === on.body && off.body.length > 200, `A: ${key} is the same bytes with the switch off and on (${off.body.length})`);
}
console.error = log;
console.log(`goLiveGuardsCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
