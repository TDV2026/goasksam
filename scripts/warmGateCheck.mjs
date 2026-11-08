// THE WARM DECLINES BEFORE THE DAY'S INGEST (Lane B, Nov 8 2026; Sam's yes after warmfix). CAUSE it closes: a warm run in the hours before the daily ingest ends is stamped with the previous epoch and reads epoch_mismatch at the bump (13:58Z on Nov 7; 18,855 of 20,303 rows).
// RULE: a person's warm (ops key) writes nothing until today's ingest has finished; scripts/ingest.js writes the marker (app_config ingest_done) at the end of a run, after the epoch bump, never for a run stopped at its request cap; the cron calls bypass it (their schedule is before the bump by design:
// see warmGate), force=1 overrides, and the refusal is a plain line. CLASS: every ops task that writes warm rows is gated, found by scanning the source, not named by hand.
//   node scripts/warmGateCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
if (process.argv.includes("--mutants")) {
  const { spawnSync } = await import("node:child_process"), fsm = await import("node:fs"), osm = await import("node:os");
  const R = path.resolve(process.argv.find((x, i) => i > 1 && !x.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const muts = [
    ["lib/warmDay.js", "if (doneAt && utcDayOf(doneAt) === today) return", "if (doneAt) return", "an earlier day's ingest counts as today's"],
    ["lib/warmDay.js", "if (isCron) return { ok: true, via: \"cron\"", "if (false) return { ok: true, via: \"cron\"", "the cron schedule is gated (would switch warmDemo and warmBuy off)"],
    ["lib/warmDay.js", "if (m.unreadable) return { ok: false", "if (m.unreadable) return { ok: true", "an unreadable marker lets the warm run"],
    ["api/usageDashboard.js", "{ const g = await (await import(\"../lib/warmDay.js\")).warmGateFor(env, { supabaseSelect, readIngestDone: (await import(\"../lib/_epoch.js\")).readIngestDone, force: req.query?.force === \"1\", isCron }); if (!g.ok) return res.status(200).json({ task: \"warmMC\"", "{ const g = { ok: true }; if (!g.ok) return res.status(200).json({ task: \"warmMC\"", "warmMC is not gated"],
    ["api/usageDashboard.js", "{ const g = await (await import(\"../lib/warmDay.js\")).warmGateFor(env, { supabaseSelect, readIngestDone: (await import(\"../lib/_epoch.js\")).readIngestDone, force: req.query?.force === \"1\", isCron }); if (!g.ok) return res.status(200).json({ task: \"warmBuy\"", "{ const g = { ok: true }; if (!g.ok) return res.status(200).json({ task: \"warmBuy\"", "warmBuy is not gated"],
    ["scripts/ingest.js", "if (!capReached) {\n  try { const { markIngestDone }", "if (true) {\n  try { const { markIngestDone }", "a run stopped at its cap writes the marker"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fsm.mkdtempSync(path.join(osm.tmpdir(), "warmgate-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", R + "/", dir + "/"]);
    fsm.symlinkSync(path.join(R, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fsm.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fsm.rmSync(dir, { recursive: true, force: true }); continue; }
    fsm.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/warmGateCheck.mjs"), dir], { encoding: "utf8", timeout: 120000 });
    const killed = r.status !== 0 && /^FAIL/m.test((r.stdout || "") + (r.stderr || ""));
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fsm.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const fs = await import("node:fs");
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const W = await import(pathToFileURL(path.join(ROOT, "lib/warmDay.js")).href), EP = await import(pathToFileURL(path.join(ROOT, "lib/_epoch.js")).href);
const now = Date.parse("2026-11-08T08:22:00Z");
// 1. the rule
if (typeof W.warmGate !== "function") ok("lib/warmDay.js exports warmGate", false);
else {
  const g = a => W.warmGate({ now, ...a });
  const before = g({ markerRead: { at: "2026-11-07T13:58:13.000Z" } });
  ok("before today's ingest has finished (last marker yesterday) the warm is refused", before.ok === false && /^The warm did not run: today's ingest \(UTC 2026-11-08\) has not finished\./.test(before.line) && /force=1/.test(before.line) && before.doneAt === "2026-11-07T13:58:13.000Z", before.line);
  ok("the refusal line is plain (no dash, no number it did not read)", !/[–—]/.test(before.line) && /last finished run was 2026-11-07T13:58:13.000Z/.test(before.line));
  ok("after today's ingest the marker lets it run", g({ markerRead: { at: "2026-11-08T14:01:00.000Z" } }).ok === true);
  ok("no marker yet: the newest job_ingest event stands in (today: runs, yesterday: refused)", g({ markerRead: { absent: true }, lastEventAt: "2026-11-08T03:00:00Z" }).ok === true && g({ markerRead: { absent: true }, lastEventAt: "2026-11-07T13:58:13Z" }).ok === false);
  ok("no marker and no event: refused, and it says no finished run is recorded", (x => x.ok === false && /No finished run is recorded/.test(x.line))(g({ markerRead: { absent: true }, lastEventAt: null })));
  ok("an unreadable marker refuses (it cannot tell), with its own line", (x => x.ok === false && x.via === "unreadable" && /could not be read/.test(x.line))(g({ markerRead: { unreadable: true } })));
  ok("force=1 runs it and says so", (x => x.ok === true && x.via === "force" && /force=1/.test(x.line))(g({ markerRead: { at: "2026-11-07T13:58:13Z" }, force: true })));
  ok("a cron call is never gated (vercel.json schedules the warm before the bump)", g({ markerRead: { at: "2026-11-07T13:58:13Z" }, isCron: true }).ok === true);
}
// 2. the marker round trip through app_config, in the order the ingest writes it
{
  const store = new Map();
  globalThis.fetch = async (url, opt) => {
    const u = new URL(String(url)); if (!u.pathname.endsWith("/app_config")) return new Response("[]", { status: 200 });
    if (opt && opt.method === "POST") { for (const r of JSON.parse(opt.body)) store.set(r.key, r.value); return new Response("", { status: 201 }); }
    const k = (u.searchParams.get("key") || "").replace(/^eq\./, ""); return new Response(JSON.stringify(store.has(k) ? [{ value: store.get(k) }] : []), { status: 200 });
  };
  const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" }, deps = { supabaseSelect: async () => [], readIngestDone: EP.readIngestDone };
  if (typeof EP.markIngestDone !== "function" || typeof W.warmGateFor !== "function") ok("markIngestDone and warmGateFor exist", false);
  else {
    store.set("ingest_done", "2026-11-07T13:58:13.000Z");
    ok("round trip: yesterday's marker, the warm is refused", (await W.warmGateFor(env, { ...deps, now })).ok === false);
    const at = await EP.markIngestDone(env);
    ok("round trip: the ingest writes the marker, the warm runs", (await W.warmGateFor(env, { ...deps, now: Date.parse(at) + 1000 })).ok === true && (await EP.readIngestDone(env)).at === at);
  }
}
// 3. the ingest writes it after the bump, and not for a run that stopped at its cap
{
  const src = fs.readFileSync(path.join(ROOT, "scripts/ingest.js"), "utf8"), b = src.indexOf("await bumpEpoch(env)"), m = src.indexOf("await markIngestDone(env)");
  ok("scripts/ingest.js writes the marker after the epoch bump", b > 0 && m > b);
  ok("and only when the run was not stopped at its request cap", /if \(!capReached\) \{\s*try \{ const \{ markIngestDone \}/.test(src));
}
// 4. the class: every ops task that writes warm rows is gated (found by scanning, not by name)
{
  const src = fs.readFileSync(path.join(ROOT, "api/usageDashboard.js"), "utf8");
  const re = /\n  if \(task === "([A-Za-z0-9]+)"(?: \|\| task === "[A-Za-z0-9]+")*\) \{\n/g, starts = []; let mm;
  while ((mm = re.exec(src))) starts.push({ t: mm[1], i: mm.index });
  const WRITES = /storeWarmResult|writeWarmAnswer\(|writeQuestionRow|refreshDemoAnswer|warmSellBlock|warmLiveSpecs|settleSpecRows|persistCore\(|warmVinPage|storeVinRow/;
  const writers = []; 
  for (let k = 0; k < starts.length; k++) { const blk = src.slice(starts[k].i, k + 1 < starts.length ? starts[k + 1].i : undefined); if (/^warm/i.test(starts[k].t) && (WRITES.test(blk) || starts[k].t === "warmBuy")) writers.push({ t: starts[k].t, gated: /warmGateFor\(env/.test(blk) }); }
  ok(`the scan finds the warm writers (${writers.map(w => w.t).join(", ")})`, writers.length >= 5 && ["warmDemo", "warmDemoCheck", "warmBuy", "warmMC", "warmVin"].every(t => writers.some(w => w.t === t)));
  for (const w of writers) ok(`task ${w.t} is gated`, w.gated);
  ok("warmBuy's final reply carries epochNote as the others do", (() => { const i = src.indexOf('if (task === "warmBuy") {'), j = src.indexOf('tag: "warm_buy"', i); return /epochNote = await/.test(src.slice(j, j + 1500)); })());
}
console.log(failed ? `\nwarmGateCheck: ${failed} FAIL` : "\nwarmGateCheck: PASS"); process.exit(failed ? 1 : 0);
