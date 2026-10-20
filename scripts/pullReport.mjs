// LIVE: this script calls production (goasksam.com). Run it only in a gap the lanes name, with the protection-bypass header (Lane F's rule, Oct 20 2026).
// THE PULL REPORT (Lane C, Oct 2026): how the live pull schedule did, from stored records only (no vendor call,
// no write). Calls GET /api/pullLive?report=1 (lib/live/pullReport.js) with the probe key in the x-ops-key header.
//
//   export PROBE_KEY="$(security find-generic-password -s goasksam-probe -w)"   # per command, never printed
//   node scripts/pullReport.mjs                    # the last 24 hours
//   node scripts/pullReport.mjs --date 2026-10-12  # one Pacific calendar day
//   node scripts/pullReport.mjs --from 2026-10-12T07:00:00Z --to 2026-10-13T07:00:00Z
//   add --json for the raw report, --base https://... for another deployment
//
// The key is read from the environment only. It is never printed, logged, written or put in an address.
// goasksam.com challenges plain command-line requests (Vercel bot protection), so on a challenge the request
// is made from inside a local headless Chrome page on the site instead.
const arg = n => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : null; };
const KEY = process.env.PROBE_KEY;
if (!KEY) { console.error("PROBE_KEY is not set. Read it from the Keychain for this command (see the top of this file)."); process.exit(2); }
const BASE = (arg("base") || "https://goasksam.com").replace(/\/$/, "");
// mode=auto&dryrun=1 is a safety net: a deployment without the report answers it with the zero-request dry run,
// never a pull. The report branch is read before the mode, so it never sees it.
const qs = new URLSearchParams({ report: "1", mode: "auto", dryrun: "1" });
if (arg("date")) qs.set("date", arg("date")); else { if (arg("from")) qs.set("from", arg("from")); if (arg("to")) qs.set("to", arg("to")); }
const path = "/api/pullLive?" + qs;

async function direct() {
  const r = await fetch(BASE + path, { headers: { "x-ops-key": KEY } }).catch(() => null);
  if (!r || !r.ok || !/json/.test(r.headers.get("content-type") || "")) return { status: r ? r.status : 0 };
  return { status: r.status, body: await r.json() };
}
async function viaBrowser() {
  const { default: puppeteer } = await import("puppeteer-core");
  const executablePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const b = await puppeteer.launch({ executablePath, headless: "new", args: ["--no-sandbox"] });
  try {
    const p = await b.newPage();
    await p.goto(BASE + "/robots.txt", { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));
    return await p.evaluate(async (u, k) => { const r = await fetch(u, { headers: { "x-ops-key": k } }); let body = null; try { body = await r.json(); } catch (e) {} return { status: r.status, body }; }, path, KEY);
  } finally { await b.close(); }
}

let out = await direct();
if (!out.body) out = await viaBrowser();
if (!out.body || out.status !== 200) { console.error(`Report request failed (HTTP ${out.status}).`); process.exit(1); }
const j = out.body;
// Only a deployment with the report answers report:true. Anything else is not a report (Oct 11: a call that
// reached the previous deployment ran an ordinary pull instead), so stop and say so.
if (j.report !== true) { console.error("This deployment did not answer with a report. Do not retry until the deployment with /api/pullLive?report=1 is live."); process.exit(1); }
if (process.argv.includes("--json")) { console.log(JSON.stringify(j, null, 2)); process.exit(0); }

const pct = x => x == null ? "n/a" : x + "%";
const L = [];
L.push(`PULL REPORT  ${j.window.fromPT} to ${j.window.toPT} Pacific`);
L.push("");
L.push(`Vendor requests used: ${j.requests.total}  (ending soonest ${j.requests.byType.endingSoonest}, full walks and any other ${j.requests.byType.fullWalksAndAnyOther})`);
L.push(`Runs: ${j.requests.fullWalks} full walks, ${j.requests.endingSoonest} ending soonest` + (j.requests.otherPulls ? `, ${j.requests.otherPulls} other` : "") + (j.requests.skippedForReserve ? `, ${j.requests.skippedForReserve} skipped for the monthly reserve` : ""));
if (j.startedBy) for (const [who, b] of Object.entries(j.startedBy)) {
  L.push(`  started by ${who}: ${b.requests} requests, ${b.fullWalks} full walks, ${b.endingSoonest} ending soonest` + (b.otherPulls ? `, ${b.otherPulls} other` : "") + (b.skipped ? `, ${b.skipped} skipped` : ""));
  if (who !== "scheduled") for (const [d, n] of Object.entries(b.byDetail || {})) L.push(`    ${d}: ${n}`);
}
L.push("");
L.push(`New cars first seen: full walks ${j.newCars.fullWalk}, ending soonest ${j.newCars.endingSoonest}`);
for (const f of j.full) L.push(`  full walk      ${f.at}  ${f.fetched} read, ${f.newListings} new` + (f.startedBy && f.startedBy !== "scheduled" ? `  (started by ${f.startedBy})` : ""));
for (const e of j.ending) L.push(`  ending soonest ${e.at}  ${e.pages} page${e.pages === 1 ? "" : "s"}, ${e.newListings} new, ${e.hoursAhead == null ? "hours ahead not recorded" : "covers " + e.hoursAhead + "h ahead"}${e.cappedShort ? ", CUT SHORT by the 3-page cap" : ""}`);
L.push("");
const ph = Object.entries(j.busyWindow.pagesNeeded).map(([k, v]) => `${v} needed ${k}`).join(", ");
L.push(`Busy window: ${j.busyWindow.pulls} ending-soonest pulls; pages: ${ph || "none"}; most ${j.busyWindow.maxPages}; cut short by the cap: ${j.busyWindow.cappedShort}`);
L.push("");
L.push(`Tasks: ${j.tasks.fullRuns} full runs, ${j.tasks.errors} errors (an at-once exit logs nothing). Pulls that found new cars: ${j.tasks.pullsThatFoundCars}; followed by a Tasks run within 20 minutes: ${j.tasks.followedWithin20Min} (median ${j.tasks.minutesToRun.median ?? "n/a"} min, max ${j.tasks.minutesToRun.max ?? "n/a"} min)`);
L.push("");
if (j.endedBeforeEmail) { const e = j.endedBeforeEmail; L.push(`Ended before their email: ${e.cars} car${e.cars === 1 ? "" : "s"} in ${e.taskUpdates} Task update${e.taskUpdates === 1 ? "" : "s"}, ${e.beforeItEnds} Before it ends car${e.beforeItEnds === 1 ? "" : "s"}`); L.push(""); }
L.push(`Stale bids: ${pct(j.staleBids.shareFinalHourMinutesOver1h)} of final-hour minutes had a stored bid over an hour old, against ${j.staleBids.baseline}% on Oct 11 (${j.staleBids.endedCars} cars ended; ${pct(j.staleBids.shareCarsAnyMinuteOver1h)} of cars had at least one such minute)`);
for (const h of j.staleBids.byEndHourPT) L.push(`  ending ${String(h.hourPT).padStart(2, "0")}:00 PT  ${String(h.cars).padStart(4)} cars  ${pct(h.share)}`);
console.log(L.join("\n"));
