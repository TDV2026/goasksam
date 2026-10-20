// The VIN-watch (Keep Looking) match email's bid line (Oct 2026, Lane D, Sam's '5 yes'). A stored bid is a snapshot,
// so the email never calls it current: a bid under an hour old reads "The last bid seen was {amount} at {time}." with
// the bid's own Pacific time and "on {weekday}" when it is not today (Lane C's lastBidSeenLine, lib/tasks/bidTime.js,
// the Before it ends wording); an older bid keeps "Last bid seen: ..."; an untimed bid prints no bid; every other
// line of the email stays as it was. No network, no email.
//   node scripts/watchBidLineCheck.mjs
// Run by scripts/prePush.mjs.
process.env.TASK_LINK_SECRET = "fixture-only";
const { messageFor } = await import("../lib/live/watches.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const now = new Date("2026-10-14T19:00:00Z");   // Wednesday 12:00pm PT
const w = { id: "00000000-0000-4000-8000-0000000000e2", kind: "vin", label: "1988 Porsche 911 Carrera", key: "WP0AB0911JS120001" };
const live = (bid, bidAt) => ({ kind: "live", house: "Bring a Trailer", url: "https://bringatrailer.com/listing/x/", end: "2026-10-15T02:00:00Z", date: "2026-10-14", bid, bidAt });
const first = (bid, bidAt) => messageFor(w, [live(bid, bidAt)], { now }).text.split("\n")[0];
const head = "The 1988 Porsche 911 Carrera in your Task (VIN WP0AB0911JS120001) is live on Bring a Trailer, ending today at 7:00pm PT.";

const fresh = first(61500, "2026-10-14T18:40:00Z");
ok(fresh === `${head} The last bid seen was $61,500 at 11:40am PT.`, `fresh bid: ${fresh}`);
const old = first(61500, "2026-10-14T15:12:00Z");
ok(old === `${head} Last bid seen: $61,500 at 8:12am PT.`, `old bid today: ${old}`);
const tue = first(61500, "2026-10-13T23:05:00Z");
ok(tue === `${head} Last bid seen: $61,500 at 4:05pm PT on Tuesday.`, `old bid another day: ${tue}`);
ok(first(61500, null) === head, `untimed bid prints no bid: ${first(61500, null)}`);
ok(first(0, null) === head, `no bid: ${first(0, null)}`);
for (const [n, t] of [["fresh", fresh], ["old", old], ["tue", tue]]) ok(!/current bid/i.test(t), `${n}: never 'current bid'`);
// A fresh bid from another day (a clock edge past midnight PT) still names the day, as bidTimePT does.
const edge = messageFor(w, [live(61500, "2026-10-15T06:50:00Z")], { now: new Date("2026-10-15T07:20:00Z") }).text.split("\n")[0];
ok(/ The last bid seen was \$61,500 at 11:50pm PT on Wednesday\.$/.test(edge), `fresh bid across midnight PT: ${edge}`);
// Every other line of the email unchanged: the subject, the link line, the Task links.
const m = messageFor(w, [live(61500, "2026-10-14T18:40:00Z")], { now });
ok(m.subject === "Back at auction: 1988 Porsche 911 Carrera", `subject: ${m.subject}`);
ok(m.text.split("\n")[1] === "View it on Bring a Trailer: https://bringatrailer.com/listing/x/", `link line: ${m.text.split("\n")[1]}`);
ok(/Open the Task: https:\/\/goasksam\.com\/tasks\/mine\nPause: /.test(m.text), "Task links unchanged");
ok(m.html.includes("The last bid seen was $61,500 at 11:40am PT.") && !/current bid/i.test(m.html), "html carries the same line");
// A sale and an attempt read as before.
const sale = messageFor(w, [{ kind: "sale", house: "Bring a Trailer", date: "2026-10-12", price: 70000, url: "https://bringatrailer.com/listing/y/" }], { now }).text.split("\n")[0];
ok(/^The 1988 Porsche 911 Carrera in your Task \(VIN WP0AB0911JS120001\) sold on Bring a Trailer .+ for \$70,000\.$/.test(sale), `sale line: ${sale}`);
const att = messageFor(w, [{ kind: "attempt", house: "Cars & Bids", date: "2026-10-12", bid: 55000, url: "https://carsandbids.com/x" }], { now }).text.split("\n")[0];
ok(/did not sell\. The high bid was \$55,000\.$/.test(att), `attempt line: ${att}`);

console.log(`watchBidLineCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
