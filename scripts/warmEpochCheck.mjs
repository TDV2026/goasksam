// A WARM IS STAMPED WITH THE EPOCH IT WAS WRITTEN UNDER, AND SAYS WHEN THAT EPOCH ENDS (Lane B, Nov 7 2026; Lane C's warm after warmguard: the bare Delahaye 135 and Duesenberg Model J rows read epoch_mismatch and stale).
// CAUSE (read from production, not guessed): the rows were stamped with the live epoch at write time (2026-11-06T15:00:05Z, the row stored 08:22Z Nov 7) and the daily ingest bumped the epoch at the end of its run (13:58:13Z Nov 7; the job_ingest log shows the
// run ending between 13:58 and 17:01Z on each of the last 7 days), so every row stored in the hours before it reads as the previous epoch (warmDay: 18,855 of 20,303 rows). A deploy does not change the epoch: only scripts/ingest.js bumps it, and the warm and the reader
// read the same app_config row through currentEpoch. Two fixes: (1) the warm's reply says it ran ahead of the bump (warmEpochNote), (2) a writer never stamps a value the last poll could not confirm (epochForWrite: after a failed poll the old instance kept E1 and stamped it on a row computed against E2).
//   node scripts/warmEpochCheck.mjs [root]      --mutants proves each rule by breaking it in a copy
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
if (process.argv.includes("--mutants")) {
  const { spawnSync } = await import("node:child_process"), fsm = await import("node:fs"), osm = await import("node:os");
  const R = path.resolve(process.argv.find((x, i) => i > 1 && !x.startsWith("--")) || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const muts = [
    ["lib/_epoch.js", "if (known && cached.ok !== false) return { epoch: known };", "if (known) return { epoch: known };", "a writer stamps the last known epoch after a failed poll"],
    ["lib/_epoch.js", "ok: rows != null };", "ok: true };", "a poll that returned nothing is not recorded as failed"],
    ["lib/warmDay.js", "const sameDay = utcDayOf(lastBump) === utcDayOf(now), aheadOfBump = !sameDay && mod(now) < hi;", "const sameDay = false, aheadOfBump = false;", "a warm ahead of the bump is not said to be"],
    ["api/usageDashboard.js", "return res.status(200).json({ task: \"warmMC\", ...result });", "return res.status(200).json({ task: \"warmMC\", ...result, epochNote: undefined }); // x", "warmMC reply loses the epoch note"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fsm.mkdtempSync(path.join(osm.tmpdir(), "warmep-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", R + "/", dir + "/"]);
    fsm.symlinkSync(path.join(R, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fsm.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fsm.rmSync(dir, { recursive: true, force: true }); continue; }
    fsm.writeFileSync(fp, file === "api/usageDashboard.js" ? m.replace("result.epochNote = await (await import(\"../lib/warmDay.js\")).warmEpochNoteFor(env, { supabaseSelect, currentEpoch: (await import(\"../lib/_epoch.js\")).currentEpoch }); return res.status(200).json({ task: \"warmMC\"", "return res.status(200).json({ task: \"warmMC\"") : m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/warmEpochCheck.mjs"), dir], { encoding: "utf8", timeout: 120000 });
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
const W = await import(pathToFileURL(path.join(ROOT, "lib/warmDay.js")).href);
// 1. the note, on the production ingest log of Nov 1 to 7 (job_ingest event times; at 08:22Z Nov 7 the Nov 7 run had not ended, so it is not in the log yet) and the rows Lane C saw
const EVENTS = ["2026-11-07T13:58:13.55Z", "2026-11-06T15:00:05.872Z", "2026-11-05T15:27:19.653Z", "2026-11-04T15:24:03.476Z", "2026-11-03T15:05:21.049Z", "2026-11-02T17:01:25.167Z", "2026-11-02T14:39:20.96Z"].map(at => ({ at }));
const E_OLD = "2026-11-06T15:00:05.718Z";
{
  const warm = W.warmEpochNote({ now: Date.parse("2026-11-07T08:22:47Z"), epoch: E_OLD, events: EVENTS });
  ok("a warm at 08:22Z, before the day's ingest has ended, is said to be ahead of the bump", warm.aheadOfBump === true && /Run the warm after today's ingest/.test(warm.line), warm.line.slice(0, 120));
  ok("the note names the epoch it stamps, the last bump and the usual window", warm.epoch === E_OLD && warm.lastBump === "2026-11-06T15:00:05.872Z" && warm.usualBumpUtc.from === "14:39" && warm.usualBumpUtc.to === "17:01", JSON.stringify(warm.usualBumpUtc));
  const after = W.warmEpochNote({ now: Date.parse("2026-11-07T16:00:00Z"), epoch: "2026-11-07T13:58:13.400Z", events: EVENTS });
  ok("a warm after today's bump is not ahead of anything", after.aheadOfBump === false && /already bumped/.test(after.line));
  const yday = W.warmEpochNote({ now: Date.parse("2026-11-07T20:00:00Z"), epoch: "x", events: EVENTS });
  ok("late the same day it is not ahead either", yday.aheadOfBump === false);
  const none = W.warmEpochNote({ now: Date.now(), epoch: "x", events: [] });
  ok("no ingest log: it says the usual time is not known, and claims nothing", none.known === false && none.aheadOfBump === null);
}
// 2. the replies carry it
{
  const src = fs.readFileSync(path.join(ROOT, "api/usageDashboard.js"), "utf8");
  for (const t of ["warmDemo", "warmBuy", "warmMC"]) {
    const i = src.indexOf(`if (task === "${t}") {`), k = i < 0 ? -1 : src.indexOf("\n  if (task === ", i + 10), blk = i < 0 ? "" : src.slice(i, k < 0 ? undefined : k), last = blk.lastIndexOf("return res.status(200).json("), tail = last < 0 ? "" : blk.slice(Math.max(0, last - 600), last);   // the FINAL reply (an early stopped-return also carrying the note passed warmBuy before)
    ok(`task ${t}'s reply carries epochNote`, i > 0 && /epochNote = await .*warmEpochNoteFor/.test(tail), i < 0 ? "task not found" : "");
  }
}
// 3. a writer never stamps a value the last poll could not confirm
{
  let mode = "e1", calls = 0;
  const E1 = "2026-11-06T15:00:05.718Z", E2 = "2026-11-07T13:58:13.400Z";
  globalThis.fetch = async (url) => {
    const u = new URL(String(url)); if (!u.pathname.endsWith("/app_config")) return new Response("[]", { status: 200 });
    calls++; if (mode === "e1") return new Response(JSON.stringify([{ value: E1 }]), { status: 200 });
    if (mode === "fail") return new Response("{\"code\":\"57014\"}", { status: 500 });
    return new Response(JSON.stringify([{ value: E2 }]), { status: 200 });
  };
  const EP = await import(pathToFileURL(path.join(ROOT, "lib/_epoch.js")).href), env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
  ok("a writer on a healthy poll stamps the live epoch", (await EP.epochForWrite(env)).epoch === E1);
  await new Promise(r => setTimeout(r, 5200));   // the instance's poll cache expires (POLL_MS 5 s); ingest has bumped to E2 and the next polls fail
  mode = "fail";
  const w1 = await EP.epochForWrite(env);
  ok("after ingest bumped the epoch and the poll fails, a writer does NOT stamp the old epoch (it stores nothing)", w1.epoch !== E1 && w1.unreadable === true, JSON.stringify(w1));
  ok("a reader still gets the last known value (serve the cache, the fail-safe is unchanged)", (await EP.currentEpoch(env)) === E1);
  mode = "e2"; await new Promise(r => setTimeout(r, 5200));
  ok("when the row reads again, the writer stamps the new epoch", (await EP.epochForWrite(env)).epoch === E2);
}
console.log(failed ? `\nwarmEpochCheck: ${failed} FAIL` : "\nwarmEpochCheck: PASS"); process.exit(failed ? 1 : 0);
