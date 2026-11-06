// LIVE LISTING CHECK IS STATUS AWARE (Lane B, Nov 5 2026, nightly #132 "LIVE LISTING FAIL" for the 1989 BMW 325i and the 2021 BMW X3 M40i). Cause: the engine was right, the check was wrong. Both
// listings had ended; the check read "a row exists in live_listings" as "the car is live" (inPool ignored status and end time) and then failed the engine for not showing an ended auction.
// Class: every pinned live listing in LIVE_LISTING_CASES, and every live car the sweep (checkLiveCarsFound) draws. Rules proved offline here, with injected reads:
//   (1) liveStateOf: live only when status is live AND the end time has not passed; a row still marked live past its end time is ended; no row is absent
//   (2) an ENDED listing is never expected to be found, and is a failure only if a search SHOWS it as a live match
//   (3) a LIVE listing that no search shows (and that the abroad line does not disclose) FAILS: a live car is never reported as not live (the rule is kept, not loosened)
//   (4) a live car found, and a live car disclosed as abroad, pass
//   (5) checkLiveCarsFound searches n live cars and fails on one that is neither found nor disclosed, carrying the engine's reason when it has one
//   (6) the engine names WHY a row was left out as an engine exclusion (lib/live/search.js skip "engine exclusion: <reason>")
//   node scripts/liveListingStatusCheck.mjs [repo root]   --mutants proves each rule by breaking it in a copy
import path from "node:path"; import fs from "node:fs"; import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), mutants = args.includes("--mutants"), rootArg = args.find(a => !a.startsWith("--"));
const root = path.resolve(rootArg || path.join(here, ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
globalThis.fetch = async () => new Response("[]", { status: 200 });
const target = process.env.XCHECK_FILE ? path.resolve(process.env.XCHECK_FILE) : path.join(root, "scripts/crossProductCheck.js");
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
if (!mutants) {
  const X = await import(pathToFileURL(target).href);
  const NOW = Date.parse("2026-11-05T12:00:00Z"), past = "2026-11-04T12:00:00Z", future = "2026-11-06T12:00:00Z";
  const U = "https://example.test/listing/a";
  const sel = row => async () => (row ? [row] : []);
  const cs = [{ q: "1989 BMW", url: U, expectAbroadMention: false }];
  const shown = { type: "results", say: "Found.", matches: [{ r: { url: U } }] }, none = { type: "none", say: "Nothing live matches.", matches: [] }, abroad = { type: "none", say: "One is abroad, in California.", matches: [] };
  const run = (row, reply, c = cs) => X.checkLiveListingDisclosure({}, c, { select: sel(row), converse: async () => reply, now: () => NOW });
  ok("(1) status live and future end is live", X.liveStateOf({ status: "live", end_time: future }, NOW) === "live");
  ok("(1) status ended is ended", X.liveStateOf({ status: "ended", end_time: past }, NOW) === "ended");
  ok("(1) a row still marked live past its end time is ended", X.liveStateOf({ status: "live", end_time: past }, NOW) === "ended");
  ok("(1) sold and cancelled statuses are not live", X.liveStateOf({ status: "sold", end_time: future }, NOW) === "ended" && X.liveStateOf({ status: "cancelled", end_time: future }, NOW) === "ended");
  ok("(1) no row is absent", X.liveStateOf(null, NOW) === "absent");
  let r = await run({ id: 1, status: "ended", end_time: past }, none);
  ok("(2) an ended listing that is not shown PASSES (the 1989 BMW and X3 case)", r.ok === true && r.cases[0].state === "ended", JSON.stringify(r.cases[0]));
  r = await run({ id: 1, status: "live", end_time: past }, none);
  ok("(2) a stale 'live' row past its end time that is not shown PASSES", r.ok === true && r.cases[0].state === "ended");
  r = await run({ id: 1, status: "ended", end_time: past }, shown);
  ok("(2) an ended listing SHOWN as a live match FAILS", r.ok === false && /ended auction was shown/.test(r.cases[0].reason || ""));
  r = await run({ id: 1, status: "live", end_time: future }, none);
  ok("(3) a live listing that is not shown FAILS (a live car is never reported as not live)", r.ok === false && /reported as not live/.test(r.cases[0].reason || ""));
  r = await run({ id: 1, status: "live", end_time: future }, none, [{ ...cs[0], expectAbroadMention: true }]);
  ok("(3) a live listing, abroad expected, with no abroad line FAILS", r.ok === false);
  r = await run({ id: 1, status: "live", end_time: future }, shown);
  ok("(4) a live listing that is shown passes", r.ok === true && r.cases[0].found === true);
  r = await run({ id: 1, status: "live", end_time: future }, abroad, [{ ...cs[0], expectAbroadMention: true }]);
  ok("(4) a live listing disclosed as abroad passes", r.ok === true && r.cases[0].foundViaAbroadDisclosure === true);
  r = await run(null, none);
  ok("(4) an absent listing is a pull gap, not a failure", r.ok === true && r.cases[0].inPool === false);
  const mk = (n, tag) => Array.from({ length: n }, (_, i) => ({ id: i + 1, url: `https://example.test/l/${i}`, listing_title: `Car ${i}`, year: 1990 + i, make: `Make${i}`, model: `M${i}`, end_time: future }));
  const many = mk(14), liveSel = async q => (/^live_listings\?status=eq\.live/.test(q) ? many : []);
  const all = await X.checkLiveCarsFound({}, { n: 12 }, { select: liveSel, converse: async a => { const u = many.find(m => a.messages[0] === `${m.year} ${m.make} ${m.model}`); return { type: "results", say: "", matches: [{ r: { url: u.url } }] }; }, now: () => NOW });
  ok("(5) twelve live cars all found passes and counts them", all.ok === true && all.checked === 12 && all.found === 12, `checked ${all.checked} found ${all.found}`);
  const miss = await X.checkLiveCarsFound({}, { n: 12 }, { select: liveSel, converse: async a => (a.messages[0].endsWith(" M3") ? none : { type: "results", say: "", matches: [{ r: { url: many.find(m => a.messages[0] === `${m.year} ${m.make} ${m.model}`).url } }] }), why: async () => "engine exclusion: a replica", now: () => NOW });
  ok("(5) one live car neither found nor disclosed FAILS and carries the engine's reason", miss.ok === false && miss.cases.filter(c => c.ok === false).length === 1 && /engine exclusion/.test(miss.cases.find(c => c.ok === false).reason || ""));
  const sr = fs.readFileSync(path.join(root, "lib/live/search.js"), "utf8");
  ok("(6) the engine names the exclusion reason, not a bare 'engine exclusion'", /skip\(r, "engine exclusion: " \+ why\)/.test(sr) && !/skip\(r, "engine exclusion"\)/.test(sr));
  console.log(failed ? `\nliveListingStatusCheck: ${failed} FAILED` : "\nliveListingStatusCheck: all passed");
  process.exit(failed ? 1 : 0);
} else {
  const { spawnSync } = await import("node:child_process");
  const src = fs.readFileSync(path.join(root, "scripts/crossProductCheck.js"), "utf8");
  const muts = [
    ["inPool ignores status again (a row existing = live)", s => s.replace('if (String(row.status || "").toLowerCase() !== "live") return "ended";', ""), /\(1\) (status ended|sold and)/],
    ["end time ignored", s => s.replace('if (row.end_time && Date.parse(row.end_time) <= now) return "ended";', ""), /\(1\) a row still marked live/],
    ["an ended listing is expected live again", s => s.replace('if (row.state === "live") {', 'if (row.state !== "absent") {'), /\(2\) an ended listing that is not shown PASSES/],
    ["a live listing may be missing (rule loosened)", s => s.replace('else { row.ok = false; out.ok = false; row.reason = "a live car was reported as not live: in the pool', 'else { row.reason = "x: in the pool'), /\(3\) a live listing that is not shown FAILS/],
    ["an ended listing shown as live is allowed", s => s.replace('} else if (shown) {', '} else if (false) {'), /\(2\) an ended listing SHOWN/],
    ["the sweep never fails a miss", s => s.replace('if (!row.disclosed) { row.ok = false; out.ok = false;', 'if (!row.disclosed) { '), /\(5\) one live car neither/]
  ];
  let survivors = 0;
  for (const [name, f, want] of muts) {
    const tmp = path.join(root, "scripts/.xcheckMut.js"); const m = f(src);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${name}`); survivors++; continue; }
    fs.writeFileSync(tmp, m);
    const r = spawnSync(process.execPath, [path.join(here, "liveListingStatusCheck.mjs"), root], { env: { ...process.env, XCHECK_FILE: tmp }, encoding: "utf8" });
    fs.unlinkSync(tmp);
    const out = (r.stdout || "") + (r.stderr || ""), killed = r.status !== 0 && out.split("\n").some(l => /^FAIL/.test(l) && want.test(l));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${name}`); if (!killed) { survivors++; console.log(out.split("\n").filter(l => /^FAIL|rror/.test(l)).slice(0, 3).join("\n")); }
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
