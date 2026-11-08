// Read racer check (Lane B, Nov 2 2026, job lane-b-archiveread, step h). No database, no network. THE CLASS: a Promise.race that gives up on a promise leaves that promise running. When the
// work is STORED behind the response on purpose (keepAlive: the next ask is a stored read) that is the design; when the result is dropped and stored nowhere it is archive load nobody is waiting
// for (step d closed the four engine races). Every Promise.race in api/ and lib/ is CLASSIFIED below: "aborts" (must pass a signal and abort it in its timeout), "on-purpose" (keeps computing to store
// or to fill a cache, with the reason), or "not-archive" (races a resolver, a parse, a small keyed read, a flag or a client wait). A new racer that is in none of them fails until someone classifies it.
//   node scripts/readRacerCheck.mjs          (LIB_ROOT=<dir holding lib/ and api/> runs it against another tree to show it fails)
import fs from "node:fs";
import path from "node:path";
const ROOT = process.env.LIB_ROOT ? path.resolve(process.env.LIB_ROOT) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const A = "aborts", P = "on-purpose", N = "not-archive";
const REGISTRY = [
  ["api/_historyData.js", /Promise\.race\(\[eng,/, A, "VIN page: nothing is stored behind the response, so its deadline stops the read (a hub, with a stored-row key, keeps computing on purpose and passes no signal)"],
  ["api/_historyData.js", /Promise\.race\(\[job\.catch/, P, "VIN page first visit: the 1.5 s wait on the exact read, which keepAlive finishes and stores as the HVIN row (the page draws the reading placeholder and asks again)"],
  ["api/_historyData.js", /const capped = q => Promise\.race\(\[supabaseSelect/, N, "one small VIN-keyed read, capped"],
  ["api/buy.js", /function inTime/, P, "afterResponse(p): the read finishes behind the response"],
  ["api/buySearch.js", /Promise\.race\(\[read, new Promise/, P, "asideRowsFor fills the engine's range cache; the page fetches the card again"],
  ["api/buySearch.js", /const late = p =>/, N, "seen-before and timeline: small VIN-keyed reads, filled for the retry"],
  ["api/buySearch.js", /Promise\.race\(\[Promise\.resolve\(\)\.then\(\(\) => enrichOne/, P, "show-more batch: each card's read keeps running (listingMarket keepAlive) and the page asks card by card"],
  ["api/buySearch.js", /Promise\.race\(\[parseQueryResolved/, N, "a parse"],
  ["api/history.js", /vin_rollout_cache/, N, "one stored row"],
  ["api/partnerAnswer.js", /decodeVinFacts/, N, "a VIN decode"],
  ["api/partnerDemo.js", /Promise\.race\(\[read, late\]\)/, P, "client-side wait; the read is the page's own request"],
  ["api/sellerDecision.js", /await Promise\.race\(\[fxLoad/, N, "the exchange-rate table"],
  ["api/sellerDecision.js", /const obWithin = p =>/, N, "whole-path clock over many pieces; the engine race below carries the signal"],
  ["api/sellerDecision.js", /await Promise\.race\(\[$/, A, "Market Check deadline: aborts except on the cold-store path, which keeps computing on purpose"],
  ["lib/_routeLimit.js", /Promise\.race\(\[check\(/, N, "a rate-limit check"],
  ["lib/live/entryExamples.js", /const withClock = /, P, "an entry example build: the engine read finishes behind the clock and fills the cache; the pick is built again by the next read"],
  ["lib/live/findExamples.js", /const withClock = /, P, "a crew card build: the card read finishes behind the clock and fills the market cache; the example is dropped for this response"],
  ["lib/live/buyExample.js", /Promise\.race\(\[p, new Promise/, P, "example builder: the read finishes and fills the cache"],
  ["lib/live/deskExample.js", /Promise\.race\(\[p, new Promise/, P, "example builder: the read finishes and fills the cache"],
  ["lib/live/marketCheckExample.js", /Promise\.race\(\[p, new Promise/, P, "example builder: the read finishes and fills the cache"],
  ["lib/sell/sellExample.js", /Promise\.race\(\[p, new Promise/, P, "example builder: the read finishes and fills the cache"],
  ["lib/live/chatCore.js", /resolveVehicle/, N, "a resolver"],
  ["lib/live/narrow.js", /Promise\.race\(\[oneEngineAnswer/, A, "the 3 s direction question: result dropped, nothing stored"],
  ["lib/live/samChat.js", /parseQueryResolved/, N, "a parse"],
  ["lib/live/samChat.js", /const raced = \(promise, ms, fallback\)/, N, "used for parses (resolveOnce)"],
  ["lib/live/samChat.js", /Promise\.all\(matches\.map\(x => specOf/, N, "the resolver"],
  ["lib/live/samChat.js", /familyMarket\(env, (?:v|vq), f\)/, P, "listingMarket keepAlive fills the stored row"],
  ["lib/live/search.js", /const run = asked =>/, A, "Find's 25 s deadline"],
  ["lib/live/search.js", /const within = p =>/, P, "specCore is keepAlive'd and stores its row; the resolver half is not an archive read"],
  ["lib/newsletterSignup.js", /sub\.promise/, N, "a signup"],
  ["lib/onebox.js", /const rows = await Promise\.race\(\[$/, N, "the pool_columns_enabled flag read"],
  ["lib/onebox.js", /^\s+rows = await Promise\.race\(\[$/, A, "title read time budget (archiveResolveToken): the timer calls ctrl.abort() and the signal reaches supabaseSelect"],
  ["lib/onebox.js", /Promise\.race\(\[attempt,/, P, "question eligibility: finished late, it is stored and the next ask is instant"],
  ["lib/onebox.js", /Promise\.race\(\[ensureFxReady/, N, "the exchange-rate table"],
  ["lib/sell/sellBlock.js", /const first = await Promise\.race\(\[run,/, A, "Sell's cap: keeps computing on purpose and stores its row, EXCEPT with noStore, where it is stopped"],
  ["lib/sell/sellBlock.js", /Promise\.race\(\[oneEngineAnswer/, A, "Sell's escalation cap"],
  ["lib/sell/sellFacts.js", /Promise\.race\(\[Promise\.resolve\(\)\.then\(\(\) => fn\(/, A, "capped(): a piece with opts.abort (the sold-through reads) is stopped past its cap; the other pieces keep going on purpose"],
  ["api/pullLive.js", /Promise\.race\(\[refreshFeaturedHistory\(env\)/, P, "crew-only stored pick (Homepage feature): the refresh reads live_listings and the car's own history, then writes ONE stored row; past the 40 s it finishes behind the response and stores its row, and the response carries a word, never the car; zero OldCarsData"],
  ["api/pullLive.js", /Promise\.race\(\[mode === "revalidate" \? revalidateFeaturedHistory/, P, "crew-only stored pick (Homepage feature): the hourly revalidation is one keyed read and a stamp; past the 40 s it finishes behind the response; a word in the response, zero OldCarsData"],
  ["api/pullLive.js", /Promise\.race\(\[refreshTasksDemo\(env\)/, P, "crew-only stored pick (Tasks centrepiece): same shape, finishes behind the response and stores its row; a word in the response, zero OldCarsData"],
  ["api/pullLive.js", /Promise\.race\(\[m\[fn\]\(env\)/, P, "crew-only stored picks (the Find examples and the Tasks watching card): same shape, each finishes behind the response and stores its row; a word in the response, zero OldCarsData"],
  ["lib/live/search.js", /Promise\.race\(\[pick\(\)\.catch/, N, "readBackQuery: the resolver read-back of the question through specOf (a keyed spec read), 3 s, remembers nothing late; not an archive pool read"],
  ["lib/tasks/fullCards.js", /Promise\.race\(\[all,/, P, "each card's read keeps running (listingMarket keepAlive)"],
  ["lib/tasks/tasks.js", /parseQueryResolved/, N, "a parse"],
  ["lib/tasks/tasks.js", /Promise\.race\(\[read\(taskRow/, P, "listingMarket keepAlive fills the stored row"],
  ["lib/tasks/tasks.js", /read\(\{ \.\.\.env, signal/, A, "the model list is stored nowhere: its read is stopped past the wait"],
  ["lib/tasks/tasks.js", /noBlock: true \}\), new Promise/, P, "listingMarket noBlock: the read behind it fills the stored row"],
  ["lib/vehicle.js", /Promise\.race\(\[promise, gone\]\)/, N, "a resolver deadline"]
];
const files = new Set(); const stack = ["api", "lib"];
while (stack.length) { const d = stack.pop(); let ents = []; try { ents = fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }); } catch {} for (const e of ents) { const p = d + "/" + e.name; if (e.isDirectory()) stack.push(p); else if (/\.js$/.test(e.name)) files.add(p); } }
const unclassified = [], abortsBad = [];
for (const f of [...files].sort()) {
  const lines = fs.readFileSync(path.join(ROOT, f), "utf8").split("\n");
  lines.forEach((l, i) => {
    if (!/Promise\.race\(/.test(l) || /^\s*(\/\/|\*)/.test(l)) return;
    const hit = REGISTRY.find(([file, re]) => file === f && re.test(l));
    if (!hit) { unclassified.push(`${f}:${i + 1}`); return; }
    if (hit[2] === A) { const win = lines.slice(Math.max(0, i - 6), i + 10).join("\n"); if (!/signal/.test(win) || !/\.abort\(\)/.test(win)) abortsBad.push(`${f}:${i + 1}`); }
  });
}
ok("every Promise.race in api/ and lib/ is classified (aborts, on-purpose or not-archive); a new one fails until classified", unclassified.length === 0, unclassified.join(" "));
ok("every racer classified 'aborts' passes a signal and aborts it in its timeout", abortsBad.length === 0, abortsBad.join(" "));
const rd = f => { try { return fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { return ""; } };
ok("the VIN page (no stored-row key) aborts its read and the hub does not", /const ac = wkey \? null : new AbortController\(\)/.test(rd("api/_historyData.js")));
ok("Sell's cap stops the read only with noStore", /const acRun = env\.noStore \? new AbortController\(\) : null/.test(rd("lib/sell/sellBlock.js")) && /if \(acRun\) acRun\.abort\(\)/.test(rd("lib/sell/sellBlock.js")));
ok("Sell's sold-through pieces pass abort and get the signal", /\{ abort: true \}/.test(rd("lib/sell/sellFacts.js")) && /signal => unsoldFor/.test(rd("lib/sell/sellFacts.js")));
// behaviour: capped() with abort stops the piece past its cap, without abort it lets the piece run
{ const { pathToFileURL } = await import("node:url"); const SF = await import(pathToFileURL(path.join(ROOT, "lib/sell/sellFacts.js")).href).catch(() => null);
  let sawAbort = false, sawSignal = false;
  const r1 = SF && await SF.capped("x", {}, signal => new Promise(res => { sawSignal = !!signal; if (signal) signal.addEventListener("abort", () => { sawAbort = true; res("late"); }); setTimeout(() => res("done"), 400); }), 60, { abort: true });
  await new Promise(r => setTimeout(r, 30));
  ok("capped(opts.abort): the piece is dropped AND its signal fires at the cap", !!SF && r1 === null && sawSignal && sawAbort, `result=${r1} signal=${sawSignal} aborted=${sawAbort}`);
  let aborted2 = false; const r2 = SF && await SF.capped("y", {}, signal => new Promise(res => { if (signal) signal.addEventListener("abort", () => { aborted2 = true; }); setTimeout(() => res("done"), 150); }), 60);
  await new Promise(r => setTimeout(r, 120));
  ok("capped() without abort keeps the piece running (nothing aborted)", !!SF && r2 === null && aborted2 === false); }
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
