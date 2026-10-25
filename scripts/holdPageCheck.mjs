// THE HOLDING PAGE (Sam, Oct 25 2026), offline: while CURTAIN_SEALED=1 every product page answers a stranger with the holding page, never opens the
// site at zero, passes crew, testers and keyed server jobs, and is a 503 with Retry-After (no redirect, no 404, no noindex). No network.
//   node scripts/holdPageCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.CURTAIN_CREW_CODE = "hold-check-crew-code-0123456789ab"; process.env.PROBE_KEY = "hold-check-probe-key-0123456789";
const hold = await import("../lib/_hold.js"), crew = await import("../lib/_crew.js"), launch = await import("../lib/launchTime.js");
const mk = (headers = {}) => { const r = { code: 0, headers: {}, body: "" }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = c => { r.code = c; return r; }; r.send = b => { r.body = String(b); return r; }; return { req: { headers, query: {}, method: "GET" }, res: r }; };
const run = (headers) => { const { req, res } = mk(headers); const held = hold.heldFor(req, res); return { held, res }; };
// off: nothing is held
delete process.env.CURTAIN_SEALED; ok(run({}).held === false, "switch off: no page is held");
process.env.CURTAIN_SEALED = "1";
let r = run({}); ok(r.held && r.res.code === 503, "sealed: a stranger gets 503 (not a redirect, not a 404)");
ok(/^\d+$/.test(r.res.headers["Retry-After"] || ""), "Retry-After is set (a closed-for-now answer search engines understand)");
ok(!/noindex/i.test(r.res.body) && !/noindex/i.test(JSON.stringify(r.res.headers)), "no noindex anywhere (indexed pages are kept, not dropped)");
ok(/Something big is coming/.test(r.res.body), "the headline");
ok(/Thursday, October 29, 2026, 7:00 AM Pacific Time/.test(r.res.body), "the launch date and time in Pacific time: " + hold.launchWords());
ok(Date.parse(launch.LAUNCH_AT) === Date.UTC(2026, 9, 29, 14, 0, 0), "LAUNCH_AT is 29 Oct 2026 07:00 Pacific (14:00 UTC)");
ok(/id="clock"/.test(r.res.body) && /data-at="1793/.test(r.res.body), "before launch: the live countdown is there");
ok(!/\bAI\b/.test(r.res.body) && !/\bI\b|\bmy\b|\bwe\b/i.test(r.res.body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")) && !/[–—]/.test(r.res.body), "no first person, no AI word, no dashes");
// at zero: same headline, no timer, no site
const after = hold.holdingHtml(Date.parse(launch.LAUNCH_AT) + 5000); ok(/Something big is coming/.test(after) && !/id="clock"/.test(after) && !/Opening /.test(after), "at zero: the same headline, no timer, the site stays closed");
// who passes
ok(run({ cookie: "gas_crew=" + crew.mintCrewCookieValue() }).held === false, "a crew cookie passes");
ok(run({ cookie: "gas_crew=ok" }).held === true && run({ cookie: "gas_crew=v1.1.forged" }).held === true, "a forged crew cookie does not pass");
ok(run({ "x-ops-key": process.env.PROBE_KEY }).held === false, "a keyed server job passes (crons, probes)");
ok(run({ "x-ops-key": "wrong" }).held === true, "a wrong key does not");
delete process.env.CURTAIN_SEALED; r = run({ "x-ops-key": process.env.PROBE_KEY, "x-hold-preview": "1" }); ok(r.held && r.res.code === 503, "the keyed preview shows the page before the switch is set");
r = run({ "x-hold-preview": "1" }); ok(r.held === false, "the preview header alone (no key) does nothing");
// every product page asks first
for (const f of ["home", "buy", "marketCheck", "sellPage", "sellNext", "tasksPage", "business", "specPage", "history", "publicConfig"]) { const s = fs.readFileSync(new URL(`../api/${f}.js`, import.meta.url), "utf8"); ok(/import \{ heldFor \} from "\.\.\/lib\/_hold\.js"/.test(s) && /if \(heldFor\(req, res\)\) return;/.test(s), `api/${f}.js asks heldFor first`); }
console.log(`holdPageCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
