// THE HOLDING PAGE (Sam, Oct 25 2026), offline: while CURTAIN_SEALED=1 every product page answers a stranger with the holding page, never opens the
// site at zero, passes crew, testers and keyed server jobs, and is a 503 with Retry-After (no redirect, no 404, no noindex). No network.
//   node scripts/holdPageCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.CURTAIN_CREW_CODE = "hold-check-crew-code-0123456789ab"; process.env.PROBE_KEY = "hold-check-probe-key-0123456789";
const hold = await import("../lib/_hold.js"), crew = await import("../lib/_crew.js"), launch = await import("../lib/launchTime.js");
const SET = "2026-10-29T07:00:00-07:00";   // what Sam sets in LAUNCH_AT when the gates are green
const mk = (headers = {}) => { const r = { code: 0, headers: {}, body: "" }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = c => { r.code = c; return r; }; r.send = b => { r.body = String(b); return r; }; return { req: { headers, query: {}, method: "GET" }, res: r }; };
const run = (headers) => { const { req, res } = mk(headers); const held = hold.heldFor(req, res); return { held, res }; };
// off: nothing is held
delete process.env.CURTAIN_SEALED; ok(run({}).held === false, "switch off: no page is held");
process.env.CURTAIN_SEALED = "1";
// NO TIME SET (LAUNCH_AT empty, the launch state): the page says it is opening soon and prints no time, no date, no countdown, never "Opening now"
delete process.env.LAUNCH_AT;
{ const u = run({}), vis = u.res.body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  ok(u.held && u.res.code === 503 && /GoAskSam is opening soon/.test(vis) && /Something big is coming/.test(vis), "no time set: the same headline and 'GoAskSam is opening soon'");
  ok(!/\d{1,2}:\d{2}|\bAM\b|\bPM\b|Pacific|Thursday|October|2026|Opening now|id="clock"|data-at=|role="timer"/.test(u.res.body), "no time set: no time, no date, no countdown, no 'Opening now' anywhere in the page");
  ok(/href="\/api\/crew"/.test(vis) && /location\.replace/.test(u.res.body), "no time set: the crew link and the redirect poll are still there");
  ok(/^\d+$/.test(u.res.headers["Retry-After"] || "") && !/noindex/i.test(u.res.body), "no time set: still 503 with Retry-After, never noindex");
  ok(hold.holdingHtml(Date.parse("2030-01-01T00:00:00Z")).indexOf("Opening now") < 0, "no time set: no clock moment makes it say 'Opening now'");
  for (const bad of ["tomorrow", "2026-10-29T07:00:00", "not a date", "1999-01-01T00:00:00Z", "  "]) { process.env.LAUNCH_AT = bad; ok(launch.launchAtMs() === 0 && !/Opening now|data-at=/.test(hold.holdingHtml(Date.parse("2030-01-01T00:00:00Z"))), "a setting that is not a date with an offset counts as not set: " + JSON.stringify(bad)); }
  delete process.env.LAUNCH_AT; }
process.env.LAUNCH_AT = SET;
let r = run({}); ok(r.held && r.res.code === 503, "sealed: a stranger gets 503 (not a redirect, not a 404)");
ok(/^\d+$/.test(r.res.headers["Retry-After"] || ""), "Retry-After is set (a closed-for-now answer search engines understand)");
ok(!/noindex/i.test(r.res.body) && !/noindex/i.test(JSON.stringify(r.res.headers)), "no noindex anywhere (indexed pages are kept, not dropped)");
ok(/Something big is coming/.test(r.res.body), "the headline");
ok(/Thursday, October 29, 2026, 7:00 AM Pacific Time/.test(r.res.body), "the launch date and time in Pacific time: " + hold.launchWords());
ok(launch.launchAtMs() === Date.UTC(2026, 9, 29, 14, 0, 0), "LAUNCH_AT set to 07:00 Pacific reads as 29 Oct 2026 14:00 UTC");
ok(/id="clock"/.test(r.res.body) && /data-at="1793/.test(r.res.body), "before launch: the live countdown is there");
ok(!/\bAI\b/.test(r.res.body) && !/\bI\b|\bmy\b|\bwe\b/i.test(r.res.body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")) && !/[–—]/.test(r.res.body), "no first person, no AI word, no dashes");
// at zero: same headline, no timer, no site
const after = hold.holdingHtml(launch.launchAtMs() + 5000); ok(/Something big is coming/.test(after) && !/id="clock"/.test(after) && /Opening now/.test(after) && !/Opening (Thursday|on)/.test(after), "at zero: the same headline, no timer, a calm \"Opening now\" line, the site stays closed (503)");
// who passes
ok(run({ cookie: "gas_crew=" + crew.mintCrewCookieValue() }).held === false, "a crew cookie passes");
ok(run({ cookie: "gas_crew=ok" }).held === true && run({ cookie: "gas_crew=v1.1.forged" }).held === true, "a forged crew cookie does not pass");
ok(run({ "x-ops-key": process.env.PROBE_KEY }).held === false, "a keyed server job passes (crons, probes)");
ok(run({ "x-ops-key": "wrong" }).held === true, "a wrong key does not");
delete process.env.CURTAIN_SEALED; r = run({ "x-ops-key": process.env.PROBE_KEY, "x-hold-preview": "1" }); ok(r.held && r.res.code === 503, "the keyed preview shows the page before the switch is set");
r = run({ "x-hold-preview": "1" }); ok(r.held === false, "the preview header alone (no key) does nothing");
// the sitemaps stay readable while held (search engines), and the engine seals let a keyed server job through (Lane B's golden and sweep calls carry a key, no crew cookie)
process.env.CURTAIN_SEALED = "1";
{ const { req, res } = mk({}); req.query = { sitemap: "1" }; ok(hold.heldFor(req, res) === false, "a sitemap request is never held"); }
{ const { default: vi } = await import("../api/vehicleIdentity.js");
  const call = async headers => { const r = { code: 0, body: null, headers: {} }; const res = { setHeader(k, v) { r.headers[k] = v; }, getHeader() {}, status(c) { r.code = c; return res; }, json(o) { r.body = o; return res; }, send(b2) { r.body = b2; return res; }, end() { return res; } };
    await vi({ method: "POST", headers: { host: "goasksam.com", ...headers }, query: {}, body: {} }, res).catch(() => {}); return r; };
  const stranger = await call({}), keyed = await call({ "x-ops-key": process.env.PROBE_KEY });
  ok(stranger.code === 403 && stranger.body && stranger.body.status === "sealed", "vehicleIdentity: a stranger is sealed out (403)");
  ok(keyed.code !== 403, "vehicleIdentity: a keyed server job passes the seal (answered " + keyed.code + ")"); }
{ const src = fs.readFileSync(new URL("../api/sellerDecision.js", import.meta.url), "utf8"), g = src.slice(src.indexOf('process.env.CURTAIN_SEALED === "1"'), src.indexOf('process.env.CURTAIN_SEALED === "1"') + 700);
  ok(/!credentialed/.test(g), "sellerDecision: the seal lets a keyed server job through"); }
delete process.env.CURTAIN_SEALED;
// every product page asks first
for (const f of ["home", "buy", "marketCheck", "sellPage", "sellNext", "tasksPage", "business", "specPage", "history", "publicConfig"]) { const s = fs.readFileSync(new URL(`../api/${f}.js`, import.meta.url), "utf8"); ok(/import \{ heldFor(?:, withCalm)? \} from "\.\.\/lib\/_hold\.js"/.test(s) && /if \(heldFor\(req, res\)\) return;/.test(s), `api/${f}.js asks heldFor first`); }
console.log(`holdPageCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
