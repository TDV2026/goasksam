// EVERY "SAM IS LOOKING" CONTROL, AS ONE CLASS (Sam, Oct 29 2026). Cause of the report: Sam's click on "Look for this exact car to come up again" left no row and no record. The controls were four separate paths
// (the Find watch button, the exact-car button, the before-it-ends toggle, the Task box) with four different counts, three different badges, no log of a refusal, and a page that could look done without a stored row.
// The class: any control that makes a standing notice must (1) write a row, (2) log an event, success or refusal, (3) be counted by the ONE badge number, (4) be listed on the Tasks page in the server's words,
// (5) answer a refusal with a reason and a plain line, and (6) never look done on the page unless the stored row says so. This check runs the real handlers in-process on a fake database for every control, then the
// page code (CLIENT in api/buy.js, public/js/onebox.js, api/tasksPage.js, the badge scripts) for the rest.
//   node scripts/standingControlsCheck.mjs
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
process.env.LAUNCH_STAGE = "2"; process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "anon"; process.env.TRACK_STRICT = "1";
const rd = f => fs.readFileSync(f, "utf8");

const realFetch = globalThis.fetch;
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const tokenOf = u => b64({ alg: "ES256", kid: "t" }) + "." + b64({ sub: u }) + ".x";   // unverifiable locally, so validateBearer asks the (fake) GoTrue
const future = h => new Date(Date.now() + h * 3600e3).toISOString();
const db = { watches: [], alerts: [], tasks: [], convs: [], reqs: [], next: 1, listings: {
  7: { id: 7, vin_norm: "WDBSK75F95F000007", listing_title: "2005 Mercedes-Benz SL65 AMG", make: "Mercedes-Benz", model: "SL-Class", model_family: "SL-Class", year: 2005, status: "live", end_time: future(8), current_bid: 15250, source: "bringatrailer", url: "https://x/7" },
  8: { id: 8, vin_norm: "", listing_title: "1971 Datsun 240Z", make: "Datsun", model: "240Z", model_family: "240Z", year: 1971, status: "live", end_time: future(30), current_bid: 9000, source: "bringatrailer", url: "https://x/8" },
  9: { id: 9, vin_norm: "WDBSK75F95F000009", listing_title: "2005 Mercedes-Benz SL65 AMG", make: "Mercedes-Benz", model: "SL-Class", model_family: "SL-Class", year: 2005, status: "ended_sold", end_time: future(-30), current_bid: 40000, source: "bringatrailer", url: "https://x/9" } } };
globalThis.fetch = async (url, o = {}) => {
  const u = new URL(String(url)), m = (o.method || "GET").toUpperCase(), q = u.searchParams, path = u.pathname.replace("/rest/v1/", "");
  const json = (b, st = 200) => new Response(JSON.stringify(b), { status: st, headers: { "content-type": "application/json" } });
  if (u.pathname === "/auth/v1/user") { const t = String((o.headers || {}).Authorization || "").replace(/^Bearer /, ""); const sub = (() => { try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).sub; } catch { return null; } })(); return sub ? json({ id: sub, email: sub === U1 ? "sam@example.com" : "b@example.com" }) : json({}, 401); }
  const uid = (q.get("user_id") || "").replace("eq.", "");
  if (path === "live_listings") {
    let rows = Object.values(db.listings);
    if (q.get("id") && q.get("id").startsWith("eq.")) rows = rows.filter(r => "eq." + r.id === q.get("id"));
    else if (q.get("id") && q.get("id").startsWith("in.")) { const ids = q.get("id").slice(4, -1).split(",").map(Number); rows = rows.filter(r => ids.includes(r.id)); }
    if (q.get("status") === "eq.live") rows = rows.filter(r => r.status === "live");
    if (q.get("vin_norm") && q.get("vin_norm").startsWith("in.")) { const v = q.get("vin_norm").slice(4, -1).split(",").map(decodeURIComponent); rows = rows.filter(r => v.includes(r.vin_norm)); }
    if (q.get("end_time") && q.get("end_time").startsWith("gt.")) rows = rows.filter(r => Date.parse(r.end_time) > Date.parse(q.get("end_time").slice(3)));
    return json(rows);
  }
  if (path === "watches") {
    if (m === "GET") { let r = db.watches.filter(w => !uid || w.user_id === uid); if (q.get("stopped_at") === "is.null") r = r.filter(w => !w.stopped_at); return json(r); }
    if (m === "POST") { const b = JSON.parse(o.body)[0]; let have = db.watches.find(w => w.user_id === b.user_id && w.kind === b.kind && w.key === b.key); if (have) Object.assign(have, b); else { have = { id: "aaaaaaaa-aaaa-4aaa-8aaa-" + String(db.next++).padStart(12, "0"), created_at: new Date().toISOString(), ...b }; db.watches.push(have); } return json([have], 201); }
    if (m === "PATCH") { const id = (q.get("id") || "").replace("eq.", ""); for (const w of db.watches) if (w.id === id && w.user_id === uid) Object.assign(w, JSON.parse(o.body)); return json([]); }
  }
  if (path === "buy_alerts") {
    if (m === "GET") { let r = db.alerts.filter(a => !uid || a.user_id === uid); if (q.get("listing_id")) r = r.filter(a => "eq." + a.listing_id === q.get("listing_id")); if (q.get("cancelled_at") === "is.null") r = r.filter(a => !a.cancelled_at); if (q.get("sent_at") === "is.null") r = r.filter(a => !a.sent_at); return json(r); }
    if (m === "POST") { const a = { id: db.next++, armed_at: new Date().toISOString(), cancelled_at: null, sent_at: null, ...JSON.parse(o.body)[0] }; db.alerts.push(a); return json([a], 201); }
    if (m === "PATCH") { const body = JSON.parse(o.body); const id = Number((q.get("id") || "").replace("eq.", "")); for (const a of db.alerts) if ((id && a.id === id) || ("eq." + a.listing_id === q.get("listing_id") && a.user_id === uid)) Object.assign(a, body); return json(id ? db.alerts.filter(a => a.id === id) : []); }
  }
  if (path === "buy_conversations") {
    const id = (q.get("id") || "").replace("eq.", "");
    if (m === "GET") { let r = db.convs.filter(x => !uid || x.user_id === uid); if (id) r = r.filter(x => x.id === id); if (q.get("watch") === "is.true") r = r.filter(x => x.watch === true); return json(r); }
    if (m === "PATCH") { for (const x of db.convs) if (x.id === id && x.user_id === uid) Object.assign(x, JSON.parse(o.body)); return json([]); }
  }
  if (path === "watch_requests") {
    if (m === "POST") { const b = JSON.parse(o.body)[0]; if (!db.reqs.some(x => x.vin_norm === b.vin_norm && x.email === b.email)) db.reqs.push(b); return new Response("", { status: 201 }); }
    if (m === "DELETE") { const k = decodeURIComponent((q.get("vin_norm") || "").replace("eq.", "")); db.reqs = db.reqs.filter(x => x.vin_norm !== k); return new Response("", { status: 204 }); }
  }
  if (path === "tasks") return json(db.tasks.filter(t => !uid || t.user_id === uid));
  return json([]);
};
const { setTrackSink, trackDrain } = await import("../lib/track/log.js");
const events = []; setTrackSink(r => events.push(r));
const watchH = (await import("../api/watch.js")).default, buyH = (await import("../api/buySearch.js")).default, tasksH = (await import("../api/tasks.js")).default;
const L = await import("../lib/live/looking.js"), caps = await import("../lib/live/lookingCaps.js"), { limitLine } = await import("../lib/tasks/limit.js");

async function call(h, body, { token = tokenOf(U1), method = "POST", query = {} } = {}) {
  const res = { code: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; } };
  const req = { method, headers: { authorization: token ? "Bearer " + token : "", "content-type": "application/json", "x-forwarded-for": "203.0.113.9", host: "goasksam.com" }, body, query, url: "/api/x", socket: {} };
  await h(req, res); await trackDrain(); return { code: res.code, ...(res.body && typeof res.body === "object" ? res.body : { raw: res.body }) };
}
const armEv = () => events.filter(e => (e.name || e.event) === "standing_arm");
const lastArm = () => { const a = armEv(); const e = a[a.length - 1]; return e && { ...(e.props || {}), user: e.user_id || null }; };
const task = (id, state) => ({ id, user_id: U1, state, kind: "hunt", summary: "Sam is looking for " + id, unread: 0, created_at: new Date().toISOString() });
const summary = async tok => call(tasksH, null, { method: "GET", query: { summary: "1" }, token: tok });

// ---- Sam's own account as reported: 2 Tasks running, 4 watches, no emails -> the badge reads 6, the line says every count
db.tasks = [task("t1", "running"), task("t2", "running")];
for (const [i, label] of ["2005 SL65", "Impala, all years", "2003 M3 Convertible", "2014 911 Carrera and Carrera S"].entries()) db.watches.push({ id: "bbbbbbbb-bbbb-4bbb-8bbb-00000000000" + i, user_id: U1, kind: "spec", key: "spec" + i, label, spec: { identity: label }, created_at: new Date().toISOString(), stopped_at: null });
let s = await summary();
ok(s.signedIn && s.count === 6 && s.counts.tasks.open === 2 && s.counts.watches.count === 4 && s.counts.alerts.count === 0, "Sam's account reads 6 on the badge (2 Tasks + 4 watches + 0 emails), not 2");
ok(s.counts.line === "Tasks 2 of 3 (searches you describe). Watching 4 of 25 (cars you want to hear about when they sell). Before-it-ends emails 0 of 25 (one email about two hours before a bid ends).", "the header line gives the three counts and what each is, in Sam's order: " + s.counts.line);
ok(s.limit.statusLine === "You have 2 of 3 Tasks running. 1 Task left.", "the Tasks status line is unchanged");
let ls = await call(tasksH, { action: "list" });
ok(ls.count === 6 && ls.counts.total === 6, "the Tasks list carries the same total (6)");

// ---- control 1: the Find watch button (next sale of this car)
let r = await call(watchH, { action: "arm", kind: "spec", listing_id: "7" });
ok(r.watch && r.watch.kind === "spec" && db.watches.some(w => w.id === r.watch.id), "watch_spec: a click writes a row");
ok(lastArm() && lastArm().control === "watch_spec" && lastArm().outcome === "added" && lastArm().user === U1 && lastArm().listing_id === "7", "watch_spec: a click logs standing_arm added with the account and the listing");
ok((await summary()).count === 7, "watch_spec: the badge counts it (7)");
const specId = r.watch.id;
r = await call(watchH, { action: "arm", kind: "spec", listing_id: "7" });
ok(r.already === true && lastArm().outcome === "already" && db.watches.filter(w => w.kind === "spec").length === 5, "watch_spec: a second click is 'already', logged, and makes no second row");

// ---- control 2: the exact-car button (the click that left nothing)
r = await call(watchH, { action: "arm", kind: "vin", listing_id: "7" });
ok(r.watch && r.watch.kind === "vin" && db.watches.some(w => w.kind === "vin" && w.key === "WDBSK75F95F000007"), "watch_vin: a click writes a row");
ok(lastArm().control === "watch_vin" && lastArm().outcome === "added" && lastArm().kind === "vin", "watch_vin: logs standing_arm added (the record whose absence Sam's click left)");
ok((await summary()).count === 8, "watch_vin: the badge counts it (8)");
const vinId = r.watch.id;
r = await call(watchH, { action: "arm", kind: "vin", listing_id: "8" });
ok(r.ok === false && r.reason === "no_vin" && r.line === L.ARM_LINES.failed && lastArm().outcome === "refused" && lastArm().reason === "no_vin", "watch_vin: a refusal (no VIN) returns the reason and a plain line, and logs the reason");
r = await call(watchH, { action: "arm", kind: "vin", listing_id: "999" });
ok(r.ok === false && r.reason === "not_found" && lastArm().reason === "not_found", "watch_vin: a car that is not found is refused with a reason, logged");

// ---- control 3: the before-it-ends toggle
r = await call(buyH, { action: "arm", listing_id: 7 });
ok(r.ok && r.alert && db.alerts.length === 1, "alert: the toggle writes a row");
ok(lastArm().control === "alert" && lastArm().outcome === "added" && lastArm().listing_id === "7", "alert: logs standing_arm added");
ok((await summary()).count === 9, "alert: the badge counts it (9)");
r = await call(buyH, { action: "arm", listing_id: 9 });
ok(r.ok === false && r.reason === "ended" && r.line === L.ARM_LINES.ended && lastArm().reason === "ended", "alert: an ended car is refused with the reason and a plain line, logged");
r = await call(buyH, { action: "arm", listing_id: 7 });
ok(r.already === true && lastArm().outcome === "already" && db.alerts.length === 1, "alert: a second switch-on is 'already', no second row");

// ---- control 4: RETIRED (Sam, Oct 29 2026). "Tell me when one comes up" promised an email nothing sends. It writes nothing, logs the refusal and answers in plain words;
// a row that already exists stays listed with a Stop and a Start a Task link, and counts, so nobody has an invisible notice.
const SID = "dddddddd-dddd-4ddd-8ddd-000000000001", SID2 = "dddddddd-dddd-4ddd-8ddd-000000000002";
db.convs.push({ id: SID, user_id: U1, title: "2005 Mercedes-Benz SL65 AMG", watch: true }, { id: SID2, user_id: U1, title: "red manual Porsches", watch: false });
db.reqs.push({ vin_norm: "search:" + SID, email: "sam@example.com" });
const nBefore = (await summary()).count;
r = await call(buyH, { action: "watchsearch", id: SID2 });
ok(r.ok === false && r.reason === "retired" && r.line === L.ARM_LINES.retired && /Task/.test(r.line), "retired control: a click is refused with the reason and a plain line that points to a Task");
ok(db.convs[1].watch === false && db.reqs.length === 1, "retired control: no flag and no watch_requests row is written");
ok(lastArm().control === "saved_search" && lastArm().outcome === "refused" && lastArm().reason === "retired", "retired control: the refusal is logged as standing_arm");
ok(!/email you|will email|tells you|tell you/i.test(r.line), "retired control: its line promises no email");
r = await call(buyH, { action: "watch", key: "WP0AB0961LS450123", email: "a@example.com" });
ok(r.ok === false && r.reason === "retired" && db.reqs.length === 1 && lastArm().control === "address_watch" && lastArm().reason === "retired", "retired: the address-only watch on /api/buySearch writes nothing and logs the refusal");
r = await call(buyH, { action: "watchsearch", id: SID }, { token: "" });
ok(r.needSignIn === true && r.reason === "signed_out" && lastArm().reason === "signed_out", "retired control: signed out is still refused with the reason, logged");
{
  const lk4 = await call(tasksH, { action: "looking" });
  const row = lk4.rows.find(x => x.ref === "s:" + SID);
  ok(row && row.kind === "search_watch" && row.what === "2005 Mercedes-Benz SL65 AMG" && row.detail === "Sam is not able to send these. Stop it, or start a Task for this search.", "existing row: listed under Watching in words that carry no promise");
  ok(row && row.start_label === "Start a Task" && /^\/tasks\/mine\?words=Keep%20looking%20for%202005/.test(row.start_href), "existing row: carries a Start a Task link that seeds the Task box");
  ok(!/email you|will email|tells you when|tell you when/i.test(row.detail), "existing row: the line does not promise an email");
  ok(lk4.counts.watches.count === lk4.rows.filter(x => x.kind !== "alert").length && lk4.counts.total === (await summary()).count && lk4.counts.total === nBefore, "existing row: still in the Watching count and the badge");
  r = await call(tasksH, { action: "looking_stop", ref: "s:" + SID });
  ok(r.ok === true && db.convs[0].watch === false && !db.reqs.some(x => x.vin_norm === "search:" + SID), "existing row: Stop turns the flag off and removes its watch_requests row");
  ok((await summary()).count === nBefore - 1, "existing row: the badge drops after Stop");
}
// ---- the Tasks page shows each in the server's words
const lk = await call(tasksH, { action: "looking" });
const byRef = Object.fromEntries(lk.rows.map(x => [x.ref, x]));
ok(byRef["w:" + specId] && byRef["w:" + specId].detail === "Sam tells you when the next one sells.", "a watch on a car or market says 'Sam tells you when the next one sells.'");
ok(byRef["w:" + vinId] && byRef["w:" + vinId].detail === "This exact car." && /SL65/.test(byRef["w:" + vinId].what) && !!byRef["w:" + vinId].ends_at, "an exact-car watch says 'This exact car.' with the car's name and, the lot being live, the end time");
ok(byRef["a:7"] && byRef["a:7"].detail === "One email about two hours before bidding ends." && !!byRef["a:7"].ends_at, "a before-it-ends email says 'One email about two hours before bidding ends.' with the end time");
ok(lk.rows.every(x => !/next sale of this car/i.test(x.detail) && !/alert/i.test(x.detail)), "no row says 'The next sale of this car.' (wrong for several cars) and none calls a Task email an alert");
ok(lk.counts.total === 9 && lk.counts.watches.count === 6 && lk.counts.alerts.count === 1 && lk.counts.tasks.working === 2, "the Watching list's counts match the badge (9)");

// ---- a stop moves the badge and the list
r = await call(tasksH, { action: "looking_stop", ref: "w:" + vinId });
ok((await summary()).count === 8, "stop: a stopped watch leaves the badge (8)");
r = await call(tasksH, { action: "looking_stop", ref: "a:7" });
ok((await summary()).count === 7, "stop: a switched-off email leaves the badge (7)");

// ---- signed out: refused, reason, logged, no row
{
  const before = db.watches.length + db.alerts.length;
  r = await call(watchH, { action: "arm", kind: "vin", listing_id: "7" }, { token: "" });
  ok(r.needSignIn === true && r.reason === "signed_out" && r.line === L.ARM_LINES.signed_out && lastArm().reason === "signed_out" && lastArm().user === null, "signed out (watch): refused with the reason and the sign-in line, logged with no account");
  r = await call(buyH, { action: "arm", listing_id: 7 }, { token: "" });
  ok(r.needSignIn === true && r.reason === "signed_out" && lastArm().control === "alert" && lastArm().reason === "signed_out", "signed out (toggle): refused with the reason, logged");
  ok(db.watches.length + db.alerts.length === before, "signed out: no row written");
}

// ---- the limits say what to stop to make room
{
  const wBefore = db.watches.length;
  for (let i = db.watches.filter(w => w.user_id === U2).length; i < caps.WATCH_CAP; i++) db.watches.push({ id: "cccccccc-cccc-4ccc-8ccc-" + String(i).padStart(12, "0"), user_id: U2, kind: "spec", key: "k" + i, label: "x" + i, stopped_at: null });
  r = await call(watchH, { action: "arm", kind: "vin", listing_id: "7" }, { token: tokenOf(U2) });
  ok(r.ok === false && r.reason === "cap_watch" && /Stop one/.test(r.line) && /Watching/.test(r.line) && lastArm().reason === "cap_watch", "25 watches: the next is refused, the line says what to stop ('" + r.line + "'), logged");
  ok(db.watches.filter(w => w.user_id === U2).length === caps.WATCH_CAP, "25 watches: no 26th row");
  for (let i = 0; i < caps.ALERT_CAP; i++) db.alerts.push({ id: 500 + i, listing_id: 2000 + i, user_id: U2, cancelled_at: null, sent_at: null });
  r = await call(buyH, { action: "arm", listing_id: 7 }, { token: tokenOf(U2) });
  ok(r.ok === false && r.reason === "cap_alert" && /Stop one/.test(r.line) && lastArm().reason === "cap_alert", "25 emails: the next is refused, the line says what to stop, logged");
  const t = L.taskOutcome({ blocked: { line: limitLine(3) } });
  ok(t.reason === "cap_task" && /Stop one to start this one/.test(t.line), "3 Tasks: a blocked create is refused with 'Stop one to start this one', mapped to a logged reason");
  const T = rd("api/tasks.js");
  ok((T.match(/logArm\(user\.userId, "task", taskOutcome\(r\)\)/g) || []).length === 2, "Tasks: both create paths (start, and the draft mode) log through logArm");
  void wBefore;
}

// ---- a server error is a plain line, a reason and a log, never a silent drop
{
  const was = globalThis.fetch; let n = 0;
  globalThis.fetch = async (url, o) => { if (/\/rest\/v1\/watches\?on_conflict/.test(String(url))) return new Response("boom", { status: 500 }); return was(url, o); };
  r = await call(watchH, { action: "arm", kind: "vin", listing_id: "7" }, { token: tokenOf(U1) });
  ok(r.code === 500 && r.reason === "failed" && r.line === L.ARM_LINES.failed && lastArm().reason === "failed", "a failed write: 500 with the reason and the plain line, logged"); void n;
  globalThis.fetch = was;
}
// ---- the event is in the catalog and strict (an unknown control or reason is thrown in tests)
{
  const { EVENTS } = await import("../lib/track/catalog.js");
  ok(EVENTS.standing_arm && EVENTS.standing_arm.opt.reason === "key", "standing_arm is in the catalog");
  ok(rd("docs/analytics-events.md").includes("`standing_arm`"), "standing_arm is in docs/analytics-events.md");
}

// ---- the page code
const buySrc = rd("api/buy.js"), i0 = buySrc.indexOf("const CLIENT = ") + "const CLIENT = ".length, C = JSON.parse(buySrc.slice(i0, buySrc.indexOf('";\n', i0) + 1));
const O = rd("public/js/onebox.js"), TP = rd("api/tasksPage.js"), CH = rd("api/_chrome.js"), AS = rd("lib/appShell.js");
// one badge number, everywhere it is drawn
ok(/var t=j\.count\?String\(j\.count\)/.test(CH) && !/Needs you\\"/.test(CH.slice(CH.indexOf("const TASKS_BADGE"), CH.indexOf("const TASKS_BADGE") + 3000).replace(/\\"/g, '"').replace(/class[^;]*nu/g, "")) , "the header, sidebar and phone menu badge (api/_chrome.js) reads the total count, not 'Needs you' or the unread number");
ok(/b\.textContent = j\.count \? String\(j\.count\)/.test(AS) && /function gasTasksBadge\(\)/.test(AS), "the rail badge (lib/appShell.js) reads the total count and can be asked again");
ok(/looking\.counts\.total/.test(TP) && /document\.title = \(n \? "\(" \+ n \+ "\) " : ""\) \+ "Your Tasks/.test(TP), "the Tasks page badge and the page title read the total");
ok(/gasTasksBadge\(\)/.test(C) && (C.match(/gasTasksBadge\(\)/g) || []).length >= 3, "Find: the badge is refreshed after an arm, a stop and a switch-off, in the same page view");
ok(/gasTasksBadge/.test(O), "Market Check: the badge is refreshed after the arm");
// Tasks page: counts line under the status line, Watching always shown, never collapsed
ok(TP.indexOf("countsline") > 0 && TP.indexOf("countsline") < TP.indexOf("h += lookingHtml()"), "Tasks page: the three-counts line sits under 'You have 2 of 3 Tasks running'");
ok(/<h2>Watching ' \+ w\.length/.test(TP) && /Before-it-ends emails ' \+ a\.length/.test(TP) && !/<details class="lk/.test(TP) && /Watches and emails do not use up your Tasks\./.test(TP), "Tasks page: 'Watching N' and the emails list are headed with their counts, never collapsed, with the line that they do not use up Tasks");
ok(TP.indexOf("h += overview(mine);") < TP.indexOf("h += lookingHtml();") && TP.indexOf("h += lookingHtml();") < TP.indexOf("h += notifyLine();"), "Tasks page: Watching sits directly under the Tasks");
ok(!/if \(!rows\.length\) return "";/.test(TP), "Tasks page: Watching is shown even when empty (it is not a hidden feature)");
// the drawer: stored-row state, visible failure, link, stop
ok(/function watchFail\(id, line\)/.test(C) && /var ARM_FAIL = "That didn't work just now\. Try again\."/.test(C), "Find: one failure line, 'That didn't work just now. Try again.'");
ok(!/\.catch\(function\(\)\{ redrawWatch\(id\); \}\)/.test(C), "Find: a dropped watch call no longer fails silently");
ok(/\.catch\(function\(\)\{ watchFail\(id\); \}\)/.test(C) && /\.catch\(function\(\)\{ alertFail\(id\); \}\)/.test(C), "Find: a dropped call shows the plain line (watch and toggle)");
ok(/btn\.disabled = true; armNow\(id\);/.test(C) && !/btn\.setAttribute\("aria-checked", "true"\); armNow/.test(C), "Find: the toggle is not switched on by the click; it is redrawn from the stored row");
ok(/Added to /.test(C) && /Already in /.test(C) && /"#lk-" \+ ref/.test(C) && /w:" \+ j\.watch\.id/.test(C) && /"a:" \+ id/.test(C), "Find: 'Added to Watching. Open Tasks' links to the item it made");
ok(/data-wstop="' \+ esc\(watchedSpec\(l\)\.id\)/.test(C) && /data-wstop="' \+ esc\(watchedVin\(l\)\.id\)/.test(C), "Find: a drawer that says 'Sam is looking' offers Stop (state from the stored row)");
ok(/redrawAllWatch\(\); \}\)\.catch/.test(C), "Find: every open drawer is redrawn from the stored list once it loads");
ok(/function stopWatch\(wid\)\{\s*fetch\(/.test(C) && /function disarm\(id\)\{\s*fetch\(/.test(C), "Find: Stop and switch-off wait for the server (the drawer shows the stored state)");
ok(/obWatchAlready/.test(O) && /Added to Watching\. /.test(O) && /onFail\(j && j\.line\)/.test(O) && /soi\.textContent = "Have Sam keep looking/.test(O), "Market Check: the confirmation links to the item, a refusal shows the server's line, and the button label stays");
try { new Function(C.replace("__KEEP_ICON__", "''").replace("__COLD_MISSED__", () => JSON.stringify("COLD_MISSED")).replace("__COLD_READING__", () => JSON.stringify("COLD_READING"))); ok(true, ""); } catch (e) { ok(false, "Find's client script parses (" + e.message + ")"); }

globalThis.fetch = realFetch;
console.log(`standingControlsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
