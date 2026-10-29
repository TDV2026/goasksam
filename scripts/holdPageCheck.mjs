// THE HOLDING PAGE (Sam, Oct 25 2026), offline: while CURTAIN_SEALED=1 every product page answers a stranger with the holding page, never opens the
// site at zero, passes crew, testers and keyed server jobs, and is a 503 with Retry-After (no redirect, no 404, no noindex). No network.
//   node scripts/holdPageCheck.mjs
import fs from "node:fs";
import { useFakeClock, moveClock, FAKE_NOW, FAKE_LAUNCH_ISO, FAKE_LAUNCH_WORDS } from "./_fakeClock.mjs";
useFakeClock();   // a fixed fake clock: this check never reads the real time, so it cannot start failing when a real hour passes
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.CURTAIN_CREW_CODE = "hold-check-crew-code-0123456789ab"; process.env.PROBE_KEY = "hold-check-probe-key-0123456789";
const hold = await import("../lib/_hold.js"), crew = await import("../lib/_crew.js"), launch = await import("../lib/launchTime.js");
const SET = FAKE_LAUNCH_ISO, AT = Date.parse(SET);   // a made-up LAUNCH_AT (two hours after the fake now); no real launch date is written in this file
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
  ok(hold.holdingHtml(Date.parse("2040-01-01T00:00:00Z")).indexOf("Opening now") < 0, "no time set: no clock moment makes it say 'Opening now'");
  for (const bad of ["tomorrow", "2031-03-05T09:00:00", "not a date", "1999-01-01T00:00:00Z", "  ", "2026-10-29T07:00:00"]) { process.env.LAUNCH_AT = bad; ok(launch.launchAtMs() === 0 && !/Opening now|data-at=/.test(hold.holdingHtml(Date.parse("2040-01-01T00:00:00Z"))), "a setting that is not a date with an offset counts as not set: " + JSON.stringify(bad)); }
  delete process.env.LAUNCH_AT; }
process.env.LAUNCH_AT = SET;
let r = run({}); ok(r.held && r.res.code === 503, "sealed: a stranger gets 503 (not a redirect, not a 404)");
ok(/^\d+$/.test(r.res.headers["Retry-After"] || ""), "Retry-After is set (a closed-for-now answer search engines understand)");
ok(!/noindex/i.test(r.res.body) && !/noindex/i.test(JSON.stringify(r.res.headers)), "no noindex anywhere (indexed pages are kept, not dropped)");
ok(/Something big is coming/.test(r.res.body), "the headline");
ok(r.res.body.includes(FAKE_LAUNCH_WORDS), "the launch date and time in Pacific time: " + hold.launchWords());
ok(launch.launchAtMs() === Date.UTC(2031, 2, 5, 17, 0, 0), "LAUNCH_AT set to 9:00 Pacific reads as 17:00 UTC");
ok(/id="clock"/.test(r.res.body) && r.res.body.includes(`data-at="${AT}"`), "before launch: the live countdown is there");
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
// THE OPENING, AS docs/launch-runbook.md STEPS 9 AND 10 DESCRIBE IT, on the fake clock (nothing here reads the real time or names a real launch date).
{ const vis = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
  const { isReleased, launchStage } = await import("../lib/_launchStage.js"); const sellNext = (await import("../api/sellNext.js")).default;
  const call = async (h, url = "/api/sellNext") => { const { req, res } = mk(h); req.url = url; res.json = o => { res.body = JSON.stringify(o); return res; }; res.end = () => res; await sellNext(req, res); return res; };
  const crewH = { cookie: "gas_crew=" + crew.mintCrewCookieValue() };
  // step 9: set LAUNCH_AT and redeploy. The seal is still on, so the site is still closed before, at and after that time; the page only counts down and says "Opening now".
  process.env.CURTAIN_SEALED = "1"; process.env.LAUNCH_AT = SET; delete process.env.SELL_NEXT_ON; delete process.env.LAUNCH_STAGE;
  moveClock(AT - 2 * 3600000);
  r = run({}); ok(r.held && r.res.code === 503 && r.res.body.includes(FAKE_LAUNCH_WORDS) && /id="clock"/.test(r.res.body), "step 9: LAUNCH_AT set, before it: 503, the date words and the countdown");
  for (const dt of [1000, 3600000, 5 * 86400000]) { moveClock(AT + dt); r = run({}); ok(r.held && r.res.code === 503 && /Opening now/.test(vis(r.res.body)) && !/id="clock"/.test(vis(r.res.body)) && !/-\d/.test(vis(r.res.body).replace(/<[^>]+>/g, " ")), "step 9: " + dt + " ms after LAUNCH_AT with the seal on: still closed (503), 'Opening now', no clock, nothing negative"); }
  ok(run({ cookie: "gas_crew=" + crew.mintCrewCookieValue() }).held === false, "step 9: crew passes the seal at any time");
  moveClock(AT - 2 * 3600000); delete process.env.LAUNCH_AT; r = run({}); ok(r.held && /GoAskSam is opening soon/.test(vis(r.res.body)) && !/Opening now|id="clock"/.test(r.res.body), "step 9: LAUNCH_AT deleted (taken off): back to 'GoAskSam is opening soon', no time");
  // step 10: the flips, then the redeploy. Deleting CURTAIN_SEALED opens the site at once (not the clock), SELL_NEXT_ON=1 opens the new Sell, LAUNCH_STAGE=2 releases Market Check, Tasks and Buy.
  for (const t of [AT - 3600000, AT + 3600000]) { moveClock(t); delete process.env.CURTAIN_SEALED; ok(run({}).held === false, "step 10: CURTAIN_SEALED deleted opens the site whatever the clock (" + (t < AT ? "before" : "after") + " a set time)"); }
  process.env.CURTAIN_SEALED = "0"; ok(run({}).held === false, "step 10: CURTAIN_SEALED=0 also opens it"); delete process.env.CURTAIN_SEALED;
  const stranger = { headers: {} };
  ok(!isReleased("market-check", stranger) && !isReleased("tasks", stranger) && !isReleased("buy", stranger) && launchStage() === 0, "LAUNCH_STAGE unset: a stranger reaches none of Market Check, Tasks, Buy");
  process.env.LAUNCH_STAGE = "2"; ok(isReleased("market-check", stranger) && isReleased("tasks", stranger) && isReleased("buy", stranger), "step 10: LAUNCH_STAGE=2 releases Market Check, Tasks and Buy to a stranger"); delete process.env.LAUNCH_STAGE;
  let a = await call({}); ok(a.code === 404, "SELL_NEXT_ON unset: the new Sell is a 404 for a stranger"); process.env.SELL_NEXT_ON = "1";
  a = await call({}); ok(a.code !== 404 && a.code !== 503, "step 10: SELL_NEXT_ON=1 serves the new Sell to a stranger (status " + a.code + ")"); delete process.env.SELL_NEXT_ON;
  process.env.CURTAIN_SEALED = "1"; process.env.SELL_NEXT_ON = "1"; a = await call({}); ok(a.code === 503 && /Something big is coming/.test(a.body), "the seal comes first: SELL_NEXT_ON=1 with the seal on is still the holding page"); a = await call(crewH); ok(a.code !== 503 && a.code !== 404, "crew cookie with the seal on: the open Sell shows (status " + a.code + ")");
  delete process.env.CURTAIN_SEALED; delete process.env.SELL_NEXT_ON; }
console.log(`holdPageCheck: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
