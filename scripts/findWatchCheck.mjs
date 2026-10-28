// WHAT FIND'S TOGGLES AND BUTTONS MAKE (Sam, Oct 29 2026). Find makes three kinds of standing notice outside the Task box: a before-it-ends email on one live car, a watch of the next sale of a car's spec, and a watch of
// this exact car. Cause: they were tables of their own (buy_alerts, watches) that no page listed, no count showed, no cap or address line limited, and whose names came from the pool a read happened to use
// ("Impala, all years" for a 1995 Impala). Pages: Find (the toggle and the two buttons), the Tasks page (the list), the emails (unchanged). The class: every standing notice the product can make is listed with a Stop.
//   1. the rows and the counts (apart from the Task limit); 2. the account caps and the dedupe; 3. the address line; 4. the toggle's rule; 5. the engine's name for the car; 6. the Tasks page (tasksPageShots, in Chrome).
//   node scripts/findWatchCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const rd = f => fs.readFileSync(f, "utf8");
const L = await import("../lib/live/looking.js");
const caps = await import("../lib/live/lookingCaps.js");
const BA = await import("../lib/live/buyAlerts.js");
// 1. rows and counts
const rows = L.lookingRows([{ id: "w1", kind: "spec", label: "Impala, all years", identity: "1995 Chevrolet Impala SS" }, { id: "w2", kind: "vin", label: "1994 Porsche 911 Carrera Cabriolet" }], [{ listing_id: 4412, title: "2010 Porsche 911 Carrera Cabriolet", end_time: "2026-11-03T20:00:00Z", ended: false }, { listing_id: 9, title: "ended one", ended: true }]);
ok(rows.length === 3 && rows.map(r => r.kind).join() === "spec_watch,car_watch,alert", "the list holds a spec watch, an exact-car watch and an alert (an ended alert is not listed)");
ok(rows.every(r => /^(w|a):/.test(r.ref) && r.what && r.detail), "each row has a ref to stop it, what it watches and a plain line");
ok(rows[2].detail === BA.TOGGLE_LINE && /two hours before bidding ends/.test(BA.TOGGLE_LINE), "an alert's row carries the same rule line as the toggle");
const counts = L.lookingCounts(3, rows);
ok(counts.tasks.working === 3 && counts.tasks.max === 3 && counts.watches.count === 2 && counts.alerts.count === 1 && counts.watches.max === caps.WATCH_CAP && counts.alerts.max === caps.ALERT_CAP, "the counts are apart: 3 of 3 Tasks, 2 watches, 1 alert, each against its own cap");
ok(counts.tasks.max === 3, "watches and alerts never change the Task limit");
// 2. caps and dedupe (a fake table behind fetch)
{
  const db = { alerts: [], next: 1 };
  const row = { id: 7, end_time: new Date(Date.now() + 5 * 864e5).toISOString(), source: "bringatrailer", listing_title: "2010 Porsche 911 Carrera Cabriolet", url: "https://x/7", status: "live" };
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url)), m = (opts.method || "GET").toUpperCase(), path = u.pathname.replace("/rest/v1/", "");
    const json = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } });
    if (path === "live_listings") return json([row]);
    if (path === "buy_alerts") {
      const q = u.searchParams;
      if (m === "GET") { let r = db.alerts.slice(); if (q.get("listing_id")) r = r.filter(a => "eq." + a.listing_id === q.get("listing_id")); if (q.get("cancelled_at") === "is.null") r = r.filter(a => !a.cancelled_at); if (q.get("sent_at") === "is.null") r = r.filter(a => !a.sent_at); return json(r); }
      if (m === "POST") { const a = { id: db.next++, armed_at: new Date().toISOString(), cancelled_at: null, sent_at: null, ...JSON.parse(opts.body)[0] }; db.alerts.push(a); return json([a], 201); }
      if (m === "PATCH") { const id = Number((q.get("id") || "").replace("eq.", "")); const a = db.alerts.find(x => x.id === id); if (a) Object.assign(a, JSON.parse(opts.body)); return json(a ? [a] : []); }
    }
    return json([]);
  };
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, user = { userId: "11111111-1111-4111-8111-111111111111", email: "a@example.com" };
  const r1 = await BA.armAlert(env, user, 7);
  ok(r1.ok && r1.already === false, "arming a car the first time makes one alert");
  const r2 = await BA.armAlert(env, user, 7);
  ok(r2.ok && r2.already === true && db.alerts.length === 1, "arming the same car again is answered as already set, never a second row");
  db.alerts = []; for (let i = 0; i < caps.ALERT_CAP; i++) db.alerts.push({ id: 100 + i, listing_id: 1000 + i, user_id: user.userId, cancelled_at: null, sent_at: null });
  const r3 = await BA.armAlert(env, user, 7);
  ok(r3.ok === false && r3.reason === "cap" && r3.line === caps.CAP_LINES.alert && db.alerts.length === caps.ALERT_CAP, "a new alert over the account's cap is refused with the line and makes no row");
  db.alerts.push({ id: 300, listing_id: 7, user_id: user.userId, cancelled_at: null, sent_at: null });
  const r4 = await BA.armAlert(env, user, 7);
  ok(r4.ok && r4.already === true, "an alert already set is still answered at the cap (someone who has one can always see it)");
}
const W = rd("lib/live/watches.js");
ok(/already: !!already/.test(W) && /WATCH_CAP/.test(W) && /error: "cap", line: CAP_LINES\.watch/.test(W), "watches: the cap and the already answer are in both arm paths");
ok((W.match(/error: "cap"/g) || []).length === 2 && (W.match(/already: !!already/g) || []).length === 2, "watches: spec and exact-car both (2 paths)");
// 3. the address line
const CE = rd("lib/_ceilings.js"), WA = rd("api/watch.js"), BS = rd("api/buySearch.js");
ok(/watch_arm:\s*\{ device: \[\[H, 30\], \[D, 100\]\], address: \[\[H, 60\], \[D, 300\]\] \}/.test(CE), "lib/_ceilings.js: watch_arm has a device line and an address line");
ok(/routeLimit\(env, req, "watch_arm", \{ route: "\/api\/watch" \}\)/.test(WA) && WA.indexOf('"watch_arm"') < WA.indexOf("await arm("), "api/watch.js: the address line is checked before a watch is made");
ok(/routeLimit\(env, req, "watch_arm", \{ route: "\/api\/buySearch" \}\)/.test(BS) && BS.indexOf('"watch_arm"') < BS.indexOf("await armAlert("), "api/buySearch.js: the address line is checked before an alert is made");
// 4. the toggle's rule
const buy = rd("api/buy.js"), i = buy.indexOf("const CLIENT = ") + "const CLIENT = ".length, C = JSON.parse(buy.slice(i, buy.indexOf('";\n', i) + 1));
ok(/rule: TOGGLE_LINE/.test(BS), "alerts_ready sends the rule");
ok(/ALERT_RULE/.test(C) && /"Sam’s on it\. " \+ ALERT_RULE/.test(C) && /with where the bid stands\. " \+ ALERT_RULE/.test(C), "the toggle prints the server's rule in both states");
ok(!/You’ll get an email before it ends/.test(C), "the toggle no longer says 'You'll get an email before it ends' with no time");
ok(/Added to your Tasks\. /.test(C) && /Already on your Tasks\. /.test(C) && /href="\/tasks\/mine"/.test(C), "a toggle or button confirms 'Added to your Tasks' (or 'Already on your Tasks') with the link");
ok(/j\.reason === "cap" \? j\.line : j && j\.limited \? j\.line/.test(C) && /j\.error === "cap" \|\| j\.limited\) && j\.line/.test(C), "the cap and the address line reach the page as the server's own words");
ok(/BOTH/.test("BOTH") && /askSignInFor\("watch"/.test(C) && /askSignIn\(id\)/.test(C), "signed out: the choice starts the sign-in and comes back to it (the drawer's own flow)");
try { new Function(C.replace("__KEEP_ICON__", "''")); ok(true, ""); } catch (e) { ok(false, "Find's client script parses (" + e.message + ")"); }
// 5. the engine's name for the car
const S = await import("../lib/live/search.js");
const spec = { v: { year: 1995, make: "Chevrolet", model: "Impala", trim: "SS" }, title: "1995 Chevrolet Impala SS Sedan" };
ok(S.specLabelOf(spec) === "1995 Chevrolet Impala SS", "specLabelOf: the engine's identity of a 1995 Impala SS");
const st = (await import("../lib/live/watches.js")).specTaskOf(spec, { family: "Impala, all years", familyBare: "Impala, all years", rung: "model_any_year" }, "x");
ok(st.spec.identity === "1995 Chevrolet Impala SS" && !/all years/.test(st.spec.identity), "a watch carries the engine's name for the car (spec.identity), never the pool the read used ('Impala, all years' stays the email's door name)");
ok(L.lookingRows([{ id: "w1", kind: "spec", label: "Impala, all years", identity: "1995 Chevrolet Impala SS" }], [])[0].what === "1995 Chevrolet Impala SS", "the Tasks list names the watch by the engine's identity, not the email label");
ok(/return m\.specLabel \|\| ""/.test(C) && !/m\.doorName \|\| m\.familyBare \|\| m\.family/.test(C), "Find's toggle line names the car from the engine's specLabel");
ok(/m\.specLabel = specLabelOf\(spec\)/.test(rd("lib/live/search.js")), "the Find card's market carries specLabel");
// 6. the Tasks page
const T = rd("api/tasksPage.js"), TS = rd("api/tasks.js");
ok(/action: "looking"/.test(T) && /looking_stop/.test(T) && /data-lk-stop/.test(T) && /do not use up your Tasks/.test(T), "the Tasks page lists them with a Stop and says they do not use up Tasks");
ok(/b\.action === "looking"/.test(TS) && /b\.action === "looking_stop"/.test(TS) && /if \(!user\) return res\.status\(401\)/.test(TS), "the list and the stop are for the signed-in person's own (401 otherwise)");
console.log(`findWatchCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
