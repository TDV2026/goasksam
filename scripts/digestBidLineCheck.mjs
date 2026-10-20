// The Tasks digest's own bid lines (Oct 2026, Lane D, Sam's answer via Lane F): a stored bid is a snapshot, so a bid
// under an hour old reads "The last bid seen was {amount} at {time}." (Lane C's lastBidSeenLine, lib/tasks/bidTime.js,
// through lib/tasks/tasks.js bidBlock), and the placing clause after it is unchanged. An older bid keeps "Last bid we
// saw: ...", an untimed bid prints none, no bid reads "No bids yet." Every other line of the combined email (subject,
// car, View link, Bidding ends, reason, summary, Open/Pause/Stop, footer) is the same in every case. Renders the whole
// daily email through the real builders (lib/tasks/bidFixture.js, the probe's own fixture). No network, no email.
//   node scripts/digestBidLineCheck.mjs
// Run by scripts/prePush.mjs.
process.env.TASK_LINK_SECRET = "fixture-only";
const { bidEmails } = await import("../lib/tasks/bidFixture.js");
const { bidBlock } = await import("../lib/tasks/tasks.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const NOW = new Date("2026-10-14T10:30:00-07:00");   // a Wednesday, Pacific daylight time
const CASES = {
  fresh: { o: { mins: 10 }, bid: "The last bid seen was $61,500 at 10:20am PT, inside the range of recent sales.", keep: " The last bid seen was $61,500 at 10:20am PT." },
  old_today: { o: { mins: 300 }, bid: "Last bid we saw: $61,500 at 5:30am PT, inside the range of recent sales.", keep: " Last bid we saw: $61,500 at 5:30am PT." },
  another_day: { o: { mins: 780 }, bid: "Last bid we saw: $61,500 at 9:30pm PT on Tuesday, inside the range of recent sales.", keep: " Last bid we saw: $61,500 at 9:30pm PT on Tuesday." },
  untimed: { o: { mins: null }, bid: null, keep: "" },
  none: { o: { mins: null, bid: 0 }, bid: "No bids yet.", keep: "" },
};
const BID_AT = 2, KEEP_AT = 13;
const KEEP_HEAD = "The 2005 Mercedes-Benz CLK DTM in your Task (VIN WDB2093421F000000) is live on Bring a Trailer, ending today at 12:15pm PT.";
const skeletons = {};
for (const [c, x] of Object.entries(CASES)) {
  const { daily } = bidEmails("fresh", NOW, x.o);
  const lines = daily.text.split("\n");
  ok(daily.subject === "Two updates from your Tasks", `${c}: subject (${daily.subject})`);
  if (x.bid) ok(lines[BID_AT] === x.bid, `${c}: digest bid line ${JSON.stringify(x.bid)} (got ${JSON.stringify(lines[BID_AT])})`);
  else ok(!lines.slice(0, 6).some(l => /\$61,500|No bids yet/.test(l)), `${c}: digest prints no bid line`);
  const ki = lines.findIndex(l => l.startsWith(KEEP_HEAD));
  ok(ki >= 0 && lines[ki] === KEEP_HEAD + x.keep, `${c}: VIN-watch section line (got ${JSON.stringify(lines[ki])})`);
  ok(!/current bid/i.test(daily.text.replace(/Stop all Task emails/, "")), `${c}: the email never calls a stored bid current`);
  if (x.bid) ok(daily.html.includes(x.bid.replace(/&/g, "&amp;")), `${c}: html carries the same digest line`);
  // Everything else: the text with the two bid places taken out, the same in every case.
  skeletons[c] = lines.filter((l, i) => !(x.bid && i === BID_AT) && i !== ki).join("\n");
}
const base = skeletons.fresh;
for (const c of Object.keys(CASES)) ok(skeletons[c] === base, `${c}: every other line identical to the fresh case's`);
const want = ["A 2005 Mercedes-Benz CLK DTM AMG Coupe is listed on Bring a Trailer.", "View on Bring a Trailer: https://bringatrailer.com/", "Bidding ends Wednesday, October 14 at 12:15pm PT.", "Matches your Task: CLK.", "", "Sam is looking for Mercedes-Benz CLK DTMs.", "Open the Task: https://goasksam.com/tasks/mine?task=3b9d6f10-2222-4c1d-8e2f-abcdef012345"];
ok(base.split("\n").slice(0, want.length).join("\n") === want.join("\n"), `the car block and Task lines as before (got ${JSON.stringify(base.split("\n").slice(0, want.length))})`);
ok(/\nView it on Bring a Trailer: https:\/\/bringatrailer\.com\/\n/.test(base) && /\nStop all Task emails: https:\/\/goasksam\.com\/api\/tasks\?a=emails_off&t=/.test(base) && base.endsWith("\nGoAskSam"), "the watch link, Stop all and sign-off as before");
// bidBlock alone (no range): the bid line by itself, and a fresh bid just past midnight PT names its day.
const row = (mins, bid = 61500, now = NOW) => ({ id: 1, current_bid_usd: bid, bid_at: mins == null ? null : new Date(now.getTime() - mins * 60e3).toISOString() });
ok(bidBlock(row(10), null, NOW).lines.join("|") === "The last bid seen was $61,500 at 10:20am PT.", `fresh, no range: ${bidBlock(row(10), null, NOW).lines.join("|")}`);
ok(bidBlock(row(300), null, NOW).lines.join("|") === "Last bid we saw: $61,500 at 5:30am PT.", "old, no range: unchanged");
ok(bidBlock(row(null), null, NOW).lines.length === 0, "untimed, no range: no line");
ok(bidBlock(row(null, 0), null, NOW).lines.join("|") === "No bids yet.", "none, no range: No bids yet.");
const edge = new Date("2026-10-15T00:20:00-07:00");
ok(bidBlock(row(30, 61500, edge), null, edge).lines.join("|") === "The last bid seen was $61,500 at 11:50pm PT on Wednesday.", `fresh across midnight PT: ${bidBlock(row(30, 61500, edge), null, edge).lines.join("|")}`);

console.log(`digestBidLineCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
