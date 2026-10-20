// The engine's fallback rung on Buy, Task doors and Task emails (Oct 2026, Lane C; lib/live/rung.js). No network,
// no email, no engine: Lane B's three new fields (fallbackRung, rungLabel, siblingName) are FAKED on fixture market
// objects, exactly as the engine will hand them over, and run through the real render functions.
//   node scripts/rungCheck.mjs            the checks, exit 1 on any failure
//   node scripts/rungCheck.mjs --print    also print each case's rendered email text
// Run by scripts/prePush.mjs.
process.env.TASK_LINK_SECRET = "fixture-only";
process.env.SUPABASE_URL = "http://127.0.0.1:9";   // nothing listens here: any real write fails fast
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-key";
delete process.env.TRACK_STRICT;

const R = await import("../lib/live/rung.js");
const A = await import("../lib/live/buyAlerts.js");
const T = await import("../lib/tasks/tasks.js");
const W = await import("../lib/live/watches.js");
const log = await import("../lib/track/log.js");

let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const PRINT = process.argv.includes("--print");

// ---------------------------------------------------------------- fixtures (the shape listingMarket returns)
const { RUNG_FIXTURES: FIX, rungEmails } = await import("../lib/tasks/rungFixture.js");   // shared with the probe

// ---------------------------------------------------------------- 1. the helper
ok(R.applyRung(FIX.absent) === FIX.absent, "fields absent: applyRung returns the very same object (today's render)");
ok(R.applyRung(null) === null && R.applyRung(undefined) === undefined && R.applyRung({ kind: "pending", rungLabel: "x" }).rungLines === undefined, "null, undefined and pending pass through untouched");
ok(R.rungOf({ rungLabel: "CLK DTM, $40,000 cars" }) === null, "a label carrying a dollar figure is never printed");
ok(R.rungOf({ rungLabel: "CLK DTM, 2003–2007" }).label === "CLK DTM, 2003 to 2007", "an en dash in a label reads \"to\"");
ok(R.rungOf({ rungLabel: "CLK", fallbackRung: "class_era" }).rung === null, "an old ladder name is not a rung (only Lane B's six)");
ok(R.rungOf({ rungLabel: "CLK", fallbackRung: "exact", siblingName: "CLK 55 AMG" }).sibling === null, "siblingName counts only on the sibling rung");
ok([R.countText(1), R.countText(10), R.countText(11), R.countText(3715), R.countText(12000)].join("|") === "one|ten|11|3,715|12,000", "counts: one to ten as words, 11 and up as digits with a thousands separator");
const sib = R.applyRung(FIX.sibling), ned = R.applyRung(FIX.ned), wid = R.applyRung(FIX.widened);
ok(sib.rungLines.join("|") === "Closest: CLK 55 AMG, 2000s|These are CLK 55 AMG sales, not this exact car." && sib.doorName === "this car" && sib.kind === "range" && sib.low === 14500, "sibling: the label, the sibling named plainly, the range kept, the door never names the sibling");
ok(ned.kind === "count" && ned.low === null && ned.high === null && ned.span === null && ned.recent.length === 0 && ned.soldLine === "Three sales on record. No range to show yet.", "not_enough_data: count only, every dollar field cleared");
ok(!/\$|typical range|\bonly\b/i.test(ned.soldLine + ned.rungLines.join(" ")), "not_enough_data: no dollar figure, no \"typical range\", no \"Only N\"");
ok(R.applyRung({ ...FIX.ned, count: 1 }).soldLine === "One sale on record. No range to show yet." && R.applyRung({ ...FIX.ned, count: 0 }).soldLine === "No range to show yet." && R.applyRung({ ...FIX.ned, count: 1200 }).soldLine === "1,200 sales on record. No range to show yet.", "not_enough_data: one sale, none, and a large count");
ok(wid.rungLines.join("|") === "CLK DTM, 2003 to 2007" && wid.kind === "range" && wid.soldLine === FIX.widened.soldLine, "a widened rung: the label above, the range untouched");

// ---------------------------------------------------------------- 2. the Before it ends email (lib/live/buyAlerts.js)
const NOW = new Date("2026-10-14T10:40:00-07:00");
const alertRow = { id: 101, end_time: "2026-10-14T12:30:00-07:00" };
const alertOf = (m, bid = 61500) => { const x = A.marketLines(m, bid); return { name: "2005 Mercedes-Benz CLK DTM AMG Coupe", house: "Bring a Trailer", bid, bidAt: "2026-10-14T10:30:00-07:00", market: x.market, soldLine: x.soldLine, rungLines: x.rungLines, placing: x.placing, sameCar: null, url: "https://example.com/listing/101" }; };
const bie = {}; for (const k of Object.keys(FIX)) bie[k] = A.messageFor(alertOf(FIX[k]), alertRow, { first: false, userId: "aaaaaaaa-0000-4000-8000-000000000001", now: NOW });
ok(!/Closest|not this exact car|on record/.test(bie.absent.text) && /The middle half of CLK DTM coupes sold between \$52,000 and \$68,000 in the past year\./.test(bie.absent.text) && /That bid is (inside|within|below|above)/.test(bie.absent.text), "Before it ends, fields absent: the range line and the placing ('That bid is ...', Sam's decision 8), no rung line (today's email)");
ok(/Closest: CLK 55 AMG, 2000s\n\nThese are CLK 55 AMG sales, not this exact car\.\n\nThe middle half of CLK 55 AMG coupes sold between \$14,500 and \$23,000/.test(bie.sibling.text) && !/(The current bid|That bid) is (inside|within|below|above)/.test(bie.sibling.text), "Before it ends, sibling: label and sibling line above the range line; the bid never placed against another car");
ok(/CLK DTM, all years\n\nThree sales on record\. No range to show yet\./.test(bie.ned.text) && (bie.ned.text.match(/\$[\d,]+/g) || []).every(x => x === "$61,500"), "Before it ends, not_enough_data: the label and the count, the only dollar figure is the bid");
ok(/CLK DTM, 2003 to 2007\n\nThe middle half of CLK DTM coupes sold between/.test(bie.widened.text), "Before it ends, widened: the label line sits right above the range line");
ok(!/\$/.test(A.marketLines({ ...FIX.widened, window: "the past three years" }, 61500).rungLines.join("")) && A.marketLines({ ...FIX.widened, window: "the past three years" }, 61500).rungLines.length === 0, "the past-year rule still holds: no range line, so no rung line on its own");

// ---------------------------------------------------------------- 3. the combined daily email's Task section (lib/tasks/tasks.js)
const task = { id: "3b9d6f10-2222-4c1d-8e2f-abcdef012345", summary: "Sam is looking for Mercedes-Benz CLK DTMs.", filters: { make: "Mercedes-Benz", model: "CLK", trim: "DTM" } };
const blockOf = m => { const bidLine = "Current bid $61,500 as of 10:30am PT."; const x = T.blockLines(m, 61500, " as of 10:30am PT", bidLine); return { id: 101, car: "A 2005 Mercedes-Benz CLK DTM AMG Coupe is listed on Bring a Trailer.", url: "https://example.com/listing/101", venue: "Bring a Trailer", bidLine: x.rangeLine ? null : bidLine, ends: "Bidding ends Wednesday, October 14 at 12:30pm PT.", rangeLine: x.rangeLine, lines: x.lines, bid: 61500 }; };
const daily = {}; for (const k of Object.keys(FIX)) daily[k] = T.taskEmailBody(task, [blockOf(FIX[k])], { first: false, section: true });
const absentLines = T.blockLines(FIX.absent, 61500, " as of 10:30am PT", "x");
ok(absentLines.lines.length === 1 && absentLines.lines[0] === absentLines.rangeLine && /^Current bid \$61,500 as of 10:30am PT, (inside|within|below|above)/.test(absentLines.rangeLine), "daily, fields absent: one range line with the placing, as today");
ok(T.blockLines(null, 61500, "", "Current bid $61,500.").lines.join("|") === "Current bid $61,500.", "daily, no usable read: the bid line alone, as today");
ok(/Current bid \$61,500 as of 10:30am PT\.\nClosest: CLK 55 AMG, 2000s\nThese are CLK 55 AMG sales, not this exact car\.\nThe middle half of CLK 55 AMG coupes sold between \$14,500 and \$23,000 in the past year\./.test(daily.sibling.text) && !/(inside|within|below|above) .*of recent sales/.test(daily.sibling.text), "daily, sibling: bid, then the label and the sibling above the sibling's range; no placing");
ok(/Current bid \$61,500 as of 10:30am PT\.\nCLK DTM, all years\nThree sales on record\. No range to show yet\./.test(daily.ned.text) && (daily.ned.text.match(/\$[\d,]+/g) || []).every(x => x === "$61,500"), "daily, not_enough_data: bid, label, count; no other dollar figure");
ok(/CLK DTM, 2003 to 2007\nCurrent bid \$61,500 as of 10:30am PT, (inside|within|below|above)/.test(daily.widened.text), "daily, widened: the label right above the range line");
ok(/And three more are in your Task\./.test(T.taskEmailBody(task, [blockOf(FIX.absent)], { more: 3, section: true }).text) && /And 14 more are in your Task\./.test(T.taskEmailBody(task, [blockOf(FIX.absent)], { more: 14, section: true }).text), "daily: \"And three more\", \"And 14 more\"");

// ---------------------------------------------------------------- 4. the sold-car Task (lib/live/watches.js): door name, settings, its email section
const { soldTask } = await import("../lib/tasks/rungFixture.js");
const ev = (n, t = "2005 Mercedes-Benz CLK DTM AMG Coupe") => Array.from({ length: n }, (_, i) => ({ title: t, house: "Bring a Trailer", date: "2026-10-1" + (i % 3 + 1), price: 250000 + i * 500, url: "https://example.com/sale/" + i, miles: 61000 }));
// absent keeps today's family label; the fixture's arm() output for the others (watches.js specTaskOf).
const watchOf = m => m === FIX.absent ? { id: "5e7a1c33-3333-4d4e-9f50-0a1b2c3d4e5f", kind: "spec", key: "k", label: m.familyBare, spec: { title: "2005 Mercedes-Benz CLK DTM" } } : soldTask(m);
const sold = {}; for (const k of Object.keys(FIX)) sold[k] = W.messageFor(watchOf(FIX[k]), ev(3), { now: NOW, section: true });
ok(/^Three CLK DTM coupes sold since/.test(sold.absent.text) && /You asked Sam to tell you when the next CLK DTM coupe sells\./.test(sold.absent.text) && sold.absent.subject === "Sam saw three sell: CLK DTM coupes", "sold-car, fields absent: today's wording (the count now a word in the subject)");
const sibTask = soldTask(FIX.sibling);
ok(sibTask.label === "CLK DTM" && sibTask.spec.rung.rung === "sibling" && sibTask.spec.rung.label === "Closest: CLK 55 AMG, 2000s", "sibling: the Task is named for the car asked about, the rung kept with its spec");
ok(sibTask.tcar.make === "Mercedes-Benz" && sibTask.tcar.model === "CLK" && sibTask.tcar.year === 2005 && sibTask.tcar.fallback_rung === "sibling", "sibling: vehicle_key and year are the car asked about, fallback_rung stays sibling");
ok(R.applyRung(FIX.sibling, { asked: "CLK DTM" }).doorName === "CLK DTM" && R.applyRung(FIX.sibling).doorName === "this car" && R.applyRung(R.applyRung(FIX.sibling), { asked: "CLK DTM" }).doorName === "CLK DTM", "sibling: the door follows the car asked about, never the sibling");
ok(R.applyRung(FIX.ned, { asked: "CLK DTM" }).doorName === "CLK DTM, all years" && R.applyRung(FIX.widened, { asked: "CLK DTM" }).doorName === "CLK DTM, 2003 to 2007", "not_enough_data and other rungs: the door is unchanged (the label)");
ok(R.askedName({ model: "CLK", trim: "DTM" }) === "CLK DTM" && R.askedName({ model: "911", trim: "911 Turbo" }) === "911 Turbo", "the car asked about: model and trim, no word repeated");
ok(/^Three CLK DTM sold since/.test(sold.sibling.text) && !/CLK 55 AMG|Closest/.test(sold.sibling.text) && /You asked Sam to tell you when the next CLK DTM sells\./.test(sold.sibling.text) && sold.sibling.subject === "Sam saw three sell: CLK DTM", "sold-car email, sibling Task: the car asked about's sales, never the sibling's");
ok(W.namesCar("2005 Mercedes-Benz CLK DTM AMG Coupe", "CLK DTM") && !W.namesCar("2004 Mercedes-Benz CLK 55 AMG Coupe", "CLK DTM"), "sibling Task: a sale counts only when its own title names the car asked about");
ok(W.noSalesLine(sibTask) === "No CLK DTM has sold since you started this Task. Sam keeps looking.", "sibling Task with no sale yet: one line");
{ const e = rungEmails("sibling", NOW); ok(/No CLK DTM has sold since you started this Task\. Sam keeps looking\./.test(e.dailyNoSales.text) && !/CLK 55 AMG sold|sold on Bring a Trailer/.test(e.dailyNoSales.text) && /^Sam found a /.test(e.dailyNoSales.subject), "daily email, no sale yet: the one line, no sibling sales, the line not counted as an update"); }
ok(!rungEmails("ned", NOW).dailyNoSales.text.includes("has sold since you started") && !rungEmails("absent", NOW).dailyNoSales.text.includes("has sold since you started"), "not_enough_data and fields absent: no such line");
ok(/^CLK DTM, all years\n\nThree sold since/.test(sold.ned.text), "sold-car, not_enough_data: the label first (unchanged)");
ok(W.messageFor(watchOf(FIX.absent), ev(12), { now: NOW, section: true }).subject === "Sam saw 12 sell: CLK DTM coupes", "sold-car subject: 12 stays digits");
ok(W.shape({ ...sibTask, created_at: null }).rung_sibling === true && W.shape({ ...sibTask, created_at: null }).label === "CLK DTM" && W.shape({ ...sibTask, created_at: null }).rung_label === "Closest: CLK 55 AMG, 2000s" && W.shape(watchOf(FIX.absent)).rung_label === null && W.shape(soldTask(FIX.ned)).rung_sibling === false, "Task settings: the car asked about with the rung label beneath (sibling); unchanged otherwise");

// The probe's whole emails (combined daily, the same with no sale yet, Before it ends) build for every case.
const whole = Object.keys(FIX).map(k => rungEmails(k, NOW));
ok(whole.every(e => e.daily.html && e.dailyNoSales.html && e.before.html), "the fixture probe builds the whole emails for every case");
// ---------------------------------------------------------------- 5. copy rules on everything this file renders
const BANNED = /\b(worth|value|valuation|estimate|estimated|appraisal|pricing|median|alert|watch|AI)\b|[–—]|\bI\b|\bI'm\b|\bmy\b/;
const allText = [...Object.values(bie), ...Object.values(daily), ...Object.values(sold), ...whole.flatMap(e => [e.daily, e.dailyNoSales, e.before])].map(m => m.text + "\n" + (m.subject || "")).join("\n")
  + "\n" + [sib, ned, wid].map(m => m.rungLines.join("\n") + "\n" + m.soldLine).join("\n");
const hit = allText.split("\n").filter(l => BANNED.test(l.replace(/https?:\/\/\S+/g, "")));
ok(hit.length === 0, "copy rules: no banned word, no dash, no first person in any rendered line" + (hit.length ? " (" + hit.slice(0, 3).join(" | ") + ")" : ""));
ok(!/watch/i.test([...Object.values(bie), ...Object.values(daily), ...Object.values(sold)].map(m => m.text.replace(/https?:\/\/\S+/g, "") + m.html.replace(/https?:\/\/[^"\s]+/g, "")).join("")), "emails: never the word \"watch\" (links aside)");

// ---------------------------------------------------------------- 6. task_created with fallback_rung, strict mode
{
  process.env.TRACK_STRICT = "1";
  const rows = []; log.setTrackSink(r => rows.push(r));
  const req = { method: "POST", query: {}, headers: { "x-vercel-ip-country": "US", cookie: "", "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15", host: "goasksam.com" } };
  const res = { statusCode: 200, headers: {}, setHeader() {}, getHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { return this; } };
  const ctx = { product: "tasks", surface: "tasks_page", user_id: "aaaaaaaa-0000-4000-8000-000000000001" };
  let threw = null;
  await log.withTracking("rungCheck", async () => {
    log.trackCurrent("task_created", W.taskCar("sold_car", soldTask(FIX.sibling).tcar), ctx);   // exactly arm()'s car for a sibling-rung Task
    log.trackCurrent("task_created", T.taskCreatedProps("hunt", { make: "Mercedes-Benz", model: "CLK" }, R.trackedRung(FIX.ned)), ctx);
    log.trackCurrent("task_created", T.taskCreatedProps("hunt", { make: "Mercedes-Benz", model: "CLK" }, R.trackedRung(FIX.absent)), ctx);
    log.trackCurrent("task_created", T.taskCreatedProps("hunt", { make: "Mercedes-Benz", model: "CLK" }, R.trackedRung(FIX.widened)), ctx);
    try { log.trackCurrent("task_created", { kind: "hunt", fallback_rung: "class_era" }, ctx); } catch (e) { threw = e.message; }
  }, "tasks")(req, res);
  await log.trackDrain();
  const tc = rows.filter(r => r.name === "task_created");
  if (PRINT) console.log("task_created rows (strict mode):\n" + JSON.stringify(tc.map(r => ({ name: r.name, product: r.product, surface: r.surface, props: r.props })), null, 1));
  ok(tc.length === 4 && tc[0].props.fallback_rung === "sibling" && tc[0].props.kind === "sold_car" && tc[1].props.fallback_rung === "not_enough_data" && tc[1].props.kind === "hunt", "strict mode: task_created carries fallback_rung for sibling and not_enough_data");
  ok(!("fallback_rung" in tc[2].props) && !("fallback_rung" in tc[3].props), "strict mode: no fallback_rung when the fields are absent or on any other rung");
  ok(threw && /fallback_rung/.test(threw), "strict mode: a value outside sibling or not_enough_data is refused");
  log.setTrackSink(null); delete process.env.TRACK_STRICT;
}

if (PRINT) for (const [name, set] of [["Before it ends", bie], ["Daily, Task section", daily], ["Daily, sold-car section", sold]]) for (const k of Object.keys(set)) console.log(`\n==== ${name}: ${k}${set[k].subject ? "  (subject: " + set[k].subject + ")" : ""}\n${set[k].text.replace(/([?&]t=)[^&\s]+/g, "$1<token>")}`);
console.log(`rungCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
