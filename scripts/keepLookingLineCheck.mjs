// KEEP LOOKING AND THE BEFORE-IT-ENDS EMAIL (Sam's decision 8, Oct 20 2026; Lane C). The Keep Looking panel's sentence is
// trimmed to "Following one auction? Open Market Check on it and Sam will email you before bidding ends."; the email never
// says "The current bid is": "The last bid seen was {amount} at {time}." and "That bid is {placing}.". No network.
//   node scripts/keepLookingLineCheck.mjs     exit 1 on any failure.
import fs from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const s = fs.readFileSync(new URL("../api/buy.js", import.meta.url), "utf8");
const i = s.indexOf("const CLIENT = ") + "const CLIENT = ".length, c = JSON.parse(s.slice(i, s.indexOf('";\n', i) + 1));
// STAGE 1d ITEM 6 (Sam, Oct 20 2026): the sentence is removed, and with cars on the page the panel is the next step.
ok(!/Following one auction/.test(c) && !/Nothing else right now/.test(c), "no 'Following one auction?' sentence and no 'Nothing else right now.' (Stage 1d item 6)");
ok(c.includes("<h3>Have Sam keep looking</h3><p>Sam will keep watching new listings and email you when another matching car goes live.</p>") && c.includes('esc(qp ? "Have Sam keep looking for " + qp : "Have Sam keep looking")'), "the next-step panel in Sam's words: the heading, the line, the button naming the search");
ok(c.includes("<h3>Nothing live right now.</h3>") && c.includes("Sam will email you when a matching car goes live."), "with nothing live the panel is the whole answer, unchanged");
ok(!/with where the bid stands against the range/.test(c), "no 'with where the bid stands against the range' (the drawer's own switch line is not this sentence and is unchanged)");
const a = fs.readFileSync(new URL("../lib/live/buyAlerts.js", import.meta.url), "utf8");
ok(/st\.kind === "fresh" \? lastBidSeenLine\(usd\(f\.bid\), f\.bidAt, now\) :/.test(a), "the email: The last bid seen was {amount} at {time}., through the one shared helper");
const { lastBidSeenLine } = await import("../lib/tasks/bidTime.js");
const now = new Date("2026-10-20T17:30:00Z");
ok(lastBidSeenLine("$61,500", "2026-10-20T17:20:00Z", now) === "The last bid seen was $61,500 at 10:20am PT." && lastBidSeenLine("$61,500", "2026-10-14T04:30:00Z", now) === "The last bid seen was $61,500 at 9:30pm PT on Tuesday.", "lastBidSeenLine (lib/tasks/bidTime.js, exported): Pacific time, the day named when not today");
ok(!/The current bid is/.test(a), "the email never says 'The current bid is'");
ok(/f\.placing && \(st\.kind === "fresh" \|\| st\.kind === "old"\) \? `That bid is \$\{f\.placing\}\.`/.test(a), "its placing: That bid is {placing}.");
const k = c.indexOf("Have Sam keep looking</h3>");
ok(k > 0 && !/[–—]/.test(c.slice(k, k + 300)), "no dashes");
console.log(`keepLookingLineCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
