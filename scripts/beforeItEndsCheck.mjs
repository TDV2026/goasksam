// Before it ends, over a fixture day (Oct 2026, Lane C). No network, no email, no vendor requests: every quarter-hour
// send run of one Pacific day (:10, :25, :40, :55, as the cron) against in-memory data, with the real
// runBeforeItEnds and the real runDigest. Exits 1 if any email is dropped, doubled or early.
//   node scripts/beforeItEndsCheck.mjs           the checks
//   node scripts/beforeItEndsCheck.mjs --table   also print the send table
// Run by scripts/prePush.mjs.
process.env.TASK_LINK_SECRET = "fixture-only";
const { runBeforeItEnds, runDigest } = await import("../lib/tasks/digest.js");

const DAY = "2026-10-14";   // a Wednesday, Pacific daylight time (UTC-7)
const pt = (hh, mm) => new Date(`${DAY}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-07:00`);
const fmt = d => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).replace(" AM", "am").replace(" PM", "pm");

// Cars: four end times from the brief, one armed late (inside two hours already), one whose end moves later.
const cars = {
  101: { id: 101, end: pt(6, 30), name: "1987 Porsche 911 Carrera Coupe", house: "Bring a Trailer" },
  102: { id: 102, end: pt(9, 0), name: "1972 Datsun 240Z", house: "Cars & Bids" },
  103: { id: 103, end: pt(13, 0), name: "1990 BMW M3", house: "Bring a Trailer", extendTo: pt(13, 20) },
  104: { id: 104, end: pt(23, 0), name: "1979 Ferrari 308 GTS", house: "Bring a Trailer" },
  105: { id: 105, end: pt(13, 30), name: "1996 Porsche 911 Carrera 4S Coupe", house: "PCARMARKET" },
};
const U = { daily: "aaaaaaaa-0000-4000-8000-000000000001", instant: "bbbbbbbb-0000-4000-8000-000000000002", off: "cccccccc-0000-4000-8000-000000000003" };
const prefs = { [U.daily]: { on: true, email: "feedback+daily@goasksam.com", every: "daily" }, [U.instant]: { on: true, email: "feedback+instant@goasksam.com", every: "instant" }, [U.off]: { on: false, email: "feedback+off@goasksam.com", every: "daily" } };
// Each stored row carries a different, typed address: delivery must never read it (lib/tasks/delivery.js).
let n = 0; const alert = (user, listing, armedAt) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, user_id: user, email: "someone-else@example.com", listing_id: listing, armed_at: armedAt || pt(0, 0), sent_at: null, send_status: null });
const alerts = [
  alert(U.daily, 101), alert(U.daily, 102), alert(U.daily, 103), alert(U.daily, 104),
  alert(U.instant, 101), alert(U.instant, 103), alert(U.instant, 104),
  alert(U.off, 102), alert(U.off, 104),
  alert(U.daily, 105, pt(12, 20)),   // armed at 12:20pm, ending 1:30pm: already inside the two hours
];

const sends = [], digests = [];
let clock = null;
// Extended bidding: from five minutes before its first end, car 103's end time reads as the later one.
const curEnd = c => c.extendTo && clock >= new Date(c.end.getTime() - 5 * 60e3) ? c.extendTo : c.end;
const io = {
  armedAlerts: () => alerts.filter(a => !a.sent_at && Date.parse(a.armed_at) <= clock.getTime()),
  liveRows: ids => ids.map(id => cars[id]).filter(c => c && curEnd(c) > clock)
    .map(c => ({ id: c.id, end_time: curEnd(c).toISOString(), url: `https://example.com/listing/${c.id}`, source: "bringatrailer" })),
  prefs: uid => prefs[uid],
  // The sign-in address, the only target.
  targets: uid => [{ channel: "email", to: prefs[uid].email }],
  claimAlert: id => { const a = alerts.find(x => x.id === id); if (!a || a.sent_at) return false; a.sent_at = clock.toISOString(); a.send_status = "sending"; return true; },
  finishAlert: (id, status, release) => { const a = alerts.find(x => x.id === id); a.send_status = status; if (release) a.sent_at = null; },
  markAlert: (id, status) => { const a = alerts.find(x => x.id === id); if (!a.sent_at) { a.sent_at = clock.toISOString(); a.send_status = status; } },
  alertFacts: row => { const c = cars[row.id]; return { name: c.name, house: c.house, bid: 61500, bidAt: new Date(clock.getTime() - 10 * 60e3).toISOString(), soldLine: c.id === 101 ? "The middle half of 911 Carrera Coupes sold between $74,000 and $98,000 in the past year." : null, placing: null, sameCar: null, url: row.url }; },
  first: () => false,
  send: m => { sends.push({ at: clock, to: m.to, subject: m.subject, text: m.text }); return { ok: true }; },
  // The daily email's data: nothing queued, the instant person already at the six-a-day cap.
  queuedUpdates: () => [], tasks: () => [], watches: () => [], patchUpdate: () => {}, blocks: () => [], pendingEvents: () => [], markWatch: () => {},
  sentToday: uid => uid === U.instant ? 6 : 0, lastSent: () => null, recordSent: () => {},
};
const digestIo = { ...io, send: m => { digests.push({ at: clock, to: m.to, subject: m.subject }); return { ok: true }; } };

// A late end-time change for car 103 is applied five minutes before its first end (extended bidding).
for (let h = 0; h < 24; h++) for (const m of [10, 25, 40, 55]) {
  clock = pt(h, m);
  await runBeforeItEnds({}, { io, now: clock });
  await runDigest({}, { io: digestIo, now: clock });
}

let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log("FAIL  " + what); } };
const who = to => Object.keys(prefs).find(u => prefs[u].email === to);
const label = { [U.daily]: "once a day", [U.instant]: "as soon as one comes", [U.off]: "emails off" };
const expect = [   // [person, car, expected send time]
  [U.daily, 101, pt(4, 40)], [U.daily, 102, pt(7, 10)], [U.daily, 103, pt(11, 10)], [U.daily, 104, pt(21, 10)], [U.daily, 105, pt(12, 25)],
  [U.instant, 101, pt(4, 40)], [U.instant, 103, pt(11, 10)], [U.instant, 104, pt(21, 10)],
];
for (const [u, car, at] of expect) {
  const got = sends.filter(s => who(s.to) === u && s.text.includes(`/listing/${car}`));
  ok(got.length === 1, `${label[u]}, car ${car}: exactly one email (got ${got.length})`);
  ok(got[0] && got[0].at.getTime() === at.getTime(), `${label[u]}, car ${car}: sent at ${fmt(at)} (got ${got[0] ? fmt(got[0].at) : "none"})`);
  const end = cars[car].end;
  ok(got[0] && end - got[0].at <= 2 * 3600e3 && end - got[0].at > 0, `${label[u]}, car ${car}: inside the two hours and before the end`);
}
ok(!sends.some(s => who(s.to) === U.off), "emails off: nothing sent");
ok(sends.length > 0 && sends.every(s => who(s.to)) && !sends.some(s => /example\.com/.test(s.to)), "every email goes to the sign-in address, never a stored one");
ok(sends.length === expect.length, `no extra emails (${sends.length} sent, ${expect.length} expected)`);
ok(alerts.filter(a => a.user_id === U.off).every(a => a.send_status === "off"), "emails off: each armed car marked off, never sent later");
ok(alerts.filter(a => a.user_id !== U.off).every(a => a.send_status === "sent"), "every other armed car marked sent once");
ok(digests.length === 0, "the daily email carries none of them (nothing else was queued, so it sent nothing)");
ok(sends.filter(s => s.text.includes("/listing/103")).length === 2, "car 103's end moved later: still one email each, nothing extra");
const one = sends.find(s => s.text.includes("/listing/101") && who(s.to) === U.daily);
ok(one && /ends today at 6:30am PT\./.test(one.text) && /The last bid seen was \$[\d,]+ at 4:30am PT\./.test(one.text) && !/current bid/i.test(one.text) && /middle half of 911 Carrera Coupes/.test(one.text), "the email carries the end time in Pacific, 'The last bid seen was {amount} at {time}.' (Sam's decision 8), and the middle-half line");
ok(one && /two hours before bidding ends, once for each car/.test(one.text) && /Stop all Task emails: /.test(one.text), "the email says when it comes and carries the stop link");

// A stored bid by its own time (Oct 2026, lib/tasks/bidTime.js), on every email that prints a live bid: within the hour
// as before; 61 minutes and 5 hours old, only with its own time in Pacific ("Last bid we saw: $61,500 at 9:29am PT."),
// never as current; no bid time (last_seen alone is not one), no bid at all, and the end line stays.
{
  const { messageFor: bieMessage } = await import("../lib/live/buyAlerts.js");
  const { bidBlock } = await import("../lib/tasks/tasks.js");
  const { messageFor: watchMessage } = await import("../lib/live/watches.js");
  const NOW = new Date(`${DAY}T10:30:00-07:00`), END = new Date(NOW.getTime() + 105 * 60e3).toISOString();
  const ago = m => new Date(NOW.getTime() - m * 60e3).toISOString();
  const RANGE = { kind: "range", low: 52000, high: 68000, count: 23, window: "the past year", family: "CLK DTM coupes", familyOne: "CLK DTM coupe", soldLine: "The middle half of CLK DTM coupes sold between $52,000 and $68,000 in the past year.", bodyScoped: null };
  const CASES = [
    { k: "fresh (10 minutes)", bidAt: ago(10), bie: "The last bid seen was $61,500 at 10:20am PT.", place: "That bid is inside the range.", daily: "Current bid $61,500, inside the range of recent sales.", dailyOnly: "Current bid $61,500.", keep: "The current bid is $61,500." },
    { k: "61 minutes", bidAt: ago(61), bie: "Last bid we saw: $61,500 at 9:29am PT.", place: "That bid is inside the range.", daily: "Last bid we saw: $61,500 at 9:29am PT, inside the range of recent sales.", dailyOnly: "Last bid we saw: $61,500 at 9:29am PT.", keep: "Last bid we saw: $61,500 at 9:29am PT." },
    { k: "5 hours", bidAt: ago(300), bie: "Last bid we saw: $61,500 at 5:30am PT.", place: "That bid is inside the range.", daily: "Last bid we saw: $61,500 at 5:30am PT, inside the range of recent sales.", dailyOnly: "Last bid we saw: $61,500 at 5:30am PT.", keep: "Last bid we saw: $61,500 at 5:30am PT." },
    { k: "another day (a bid from 13 hours ago)", bidAt: ago(780), bie: "Last bid we saw: $61,500 at 9:30pm PT on Tuesday.", place: "That bid is inside the range.", daily: null, dailyOnly: "Last bid we saw: $61,500 at 9:30pm PT on Tuesday.", keep: "Last bid we saw: $61,500 at 9:30pm PT on Tuesday." },
    { k: "no bid time", bidAt: null, bie: null, place: null, daily: null, dailyOnly: null, keep: null }
  ];
  const STALE_WORDS = /\bcurrent(ly)?\b|\bnow\b|bidding is at/i;
  for (const c of CASES) {
    // The stored row: last_seen (our last read) is always there and is recent; it must never stand in for the bid time.
    const row = { id: 101, end_time: END, url: "https://example.com/listing/101", source: "bringatrailer", current_bid_usd: 61500, bid_at: c.bidAt, last_seen: ago(5) };
    const f = { name: "2005 Mercedes-Benz CLK DTM AMG Coupe", house: "Bring a Trailer", bid: 61500, bidAt: row.bid_at || null, soldLine: RANGE.soldLine, rungLines: [], placing: "inside the range", sameCar: null, url: row.url };
    const msg = bieMessage(f, row, { first: false, userId: U.daily, now: NOW });
    const paras = msg.text.split("\n\n");
    ok(paras[0] === "2005 Mercedes-Benz CLK DTM AMG Coupe on Bring a Trailer ends today at 12:15pm PT.", `bid ${c.k}: Before it ends keeps the end line`);
    ok(c.bie ? paras[1] === c.bie : !/\$61,500/.test(msg.text), `bid ${c.k}: Before it ends bid line ${c.bie ? JSON.stringify(c.bie) : "absent"} (got ${JSON.stringify(paras[1])})`);
    ok(c.place ? msg.text.includes(c.place) : !/inside the range/.test(msg.text), `bid ${c.k}: Before it ends placing line ${c.place ? JSON.stringify(c.place) : "absent"}`);
    ok(msg.text.includes(RANGE.soldLine), `bid ${c.k}: Before it ends range line unchanged`);
    ok(msg.html.includes(c.bie ? c.bie.replace(/&/g, "&amp;") : "ends today at 12:15pm PT."), `bid ${c.k}: Before it ends html carries the same line`);
    if (c.k !== "fresh (10 minutes)") ok(!STALE_WORDS.test(msg.text.replace(/Stop all Task emails/, "")), `bid ${c.k}: Before it ends never calls it current`);
    const withRange = bidBlock(row, RANGE, NOW), alone = bidBlock(row, null, NOW);
    ok(c.daily ? withRange.lines.join("|") === c.daily : c.bidAt ? true : withRange.lines.length === 0, `bid ${c.k}: daily email with a range ${c.daily ? JSON.stringify(c.daily) : ""} (got ${JSON.stringify(withRange.lines)})`);
    ok(c.dailyOnly ? alone.lines.join("|") === c.dailyOnly : alone.lines.length === 0, `bid ${c.k}: daily email bid line ${c.dailyOnly ? JSON.stringify(c.dailyOnly) : "absent"} (got ${JSON.stringify(alone.lines)})`);
    if (c.k !== "fresh (10 minutes)") ok(![...withRange.lines, ...alone.lines].some(l => STALE_WORDS.test(l)), `bid ${c.k}: daily email never calls it current`);
    const w = { id: "5e7a1c33-3333-4d4e-9f50-0a1b2c3d4e5f", kind: "vin", key: "WDB2093421F000000", label: "2005 Mercedes-Benz CLK DTM" };
    const keep = watchMessage(w, [{ key: "l:101", kind: "live", date: DAY, bid: 61500, bidAt: row.bid_at || null, end: END, house: "Bring a Trailer", url: row.url, title: "" }], { now: NOW, section: true }).text.split("\n")[0];
    ok(keep.startsWith("The 2005 Mercedes-Benz CLK DTM in your Task (VIN WDB2093421F000000) is live on Bring a Trailer, ending today at 12:15pm PT.") && (c.keep ? keep.endsWith(" " + c.keep) : !/\$/.test(keep)), `bid ${c.k}: Keep looking line ${c.keep ? JSON.stringify(c.keep) : "without a bid"} (got ${JSON.stringify(keep)})`);
    for (const t of [msg.text, keep, ...withRange.lines, ...alone.lines]) ok(!/[\u2013\u2014]/.test(t) && !/\bwatch/i.test(t), `bid ${c.k}: no dash, no "watch"`);
  }
}

if (process.argv.includes("--table")) {
  console.log("\nFIXTURE DAY " + DAY + " (Pacific), every quarter-hour run :10 :25 :40 :55");
  console.log("Car ends: " + Object.values(cars).map(c => `${c.id} ${fmt(c.end)}${c.extendTo ? " (moves to " + fmt(c.extendTo) + ")" : ""}`).join(", "));
  for (const s of [...sends].sort((a, b) => a.at - b.at)) {
    const car = Object.values(cars).find(c => s.text.includes(`/listing/${c.id}`));
    console.log(`  ${fmt(s.at).padStart(7)}  ${label[who(s.to)].padEnd(21)} car ${car.id} (ends ${fmt(car.end)}, ${Math.round((car.end - s.at) / 60e3)} min left)  "${s.subject}"`);
  }
  for (const a of alerts.filter(a => a.user_id === U.off)) console.log(`     none  emails off            car ${a.listing_id}: ${a.send_status}`);
  console.log(`  Daily email runs that went out: ${digests.length}`);
}
console.log(`beforeItEndsCheck: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
