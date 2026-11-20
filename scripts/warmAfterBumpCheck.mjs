// THE WARM-UP AFTER A STAMP BUMP (Lane B, lane-b-read-resilience, Nov 18 2026; order bc85 item 4). Offline. The list is built from our own usage rows (the most read searches, the most read History hubs), the job reads at most three at once,
// prints its cost before anyone runs it, writes nothing of its own, and refuses to read production without --run --confirm. CLASS: every piece (list, plan, pool, report, the ops task, the script's own guard) is pure or static, so it is checked here.
//   node scripts/warmAfterBumpCheck.mjs [repo root]      --mutants breaks one rule in a copy
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 200) : "")); } };
const has = f => fs.existsSync(path.join(ROOT, f)), read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
ok("lib/warmList.js and scripts/warmAfterBump.mjs exist", has("lib/warmList.js") && has("scripts/warmAfterBump.mjs"));
if (has("lib/warmList.js") && has("scripts/warmAfterBump.mjs")) {
  const WL = await import(pathToFileURL(path.join(ROOT, "lib/warmList.js")).href), WB = await import(pathToFileURL(path.join(ROOT, "scripts/warmAfterBump.mjs")).href);
  const ev = [...Array(5).fill("1987 Pontiac Firebird"), ...Array(3).fill("1987  pontiac firebird "), ...Array(4).fill("BMW M3"), "WP0AA29962S621698", "what is a 911 worth?", "-", "x", "a very long sentence that goes on and on about nothing much at all and is not a car", ...Array(2).fill("Porsche 911")].map(q => ({ query_text: q }));
  const cars = WL.topCars(ev, 10);
  ok("the cars are the most read searches, most read first, one entry for the same words in any case and spacing", cars[0].text === "1987 Pontiac Firebird" && cars[0].n === 8 && cars[1].text === "BMW M3" && cars[1].n === 4 && cars[2].n === 2, cars);
  ok("a VIN, a question, a placeholder, a one letter search and a long chat sentence are not cars to warm", cars.length === 3, cars.map(c => c.text));
  ok("the list is capped", WL.topCars(Array.from({ length: 500 }, (_, i) => ({ query_text: "car number " + i })), 300).length === 300);
  const hubs = WL.topHubs([...Array(4).fill({ route: "/history/2004-chevrolet-corvette-z06" }), ...Array(2).fill({ route: "/history/1987-pontiac-firebird" }), { route: "/history/2004-chevrolet-corvette-z06/1G1YY12S445106663" }, { route: "/history" }, { route: "/sell" }, { metadata: { path: "/history/1987-pontiac-firebird?x=1" } }], 5);
  ok("the hubs are the two-segment History pages, most read first; a VIN page, the index and other pages are not hubs", hubs.length === 2 && hubs[0].path === "/history/2004-chevrolet-corvette-z06" && hubs[0].n === 4 && hubs[1].n === 3, hubs);
  const p = WL.planOf({ cars: 300, hubs: 200, concurrency: 9 });
  ok("the plan: the concurrency is never above three, the time and the function seconds come from the measured cold reads, OldCarsData is zero", p.concurrency === 3 && p.reads === 500 && p.oldCarsDataRequests === 0 && p.wallMinutes > 0 && Math.abs(p.wallMinutes - Math.round((300 * 12000 + 200 * 9000) / 3 / 60000 * 10) / 10) < 0.05 && p.functionSeconds === 5400, p);
  let inflight = 0, peak = 0;
  const run = await WB.runPool(Array.from({ length: 20 }, (_, i) => i), async j => { inflight++; peak = Math.max(peak, inflight); await new Promise(r => setTimeout(r, 15)); inflight--; return { j, ms: 15 + j, ok: j % 5 !== 0 }; }, 3);
  ok("the pool never runs more than three reads at once and runs every job", peak <= 3 && peak >= 2 && run.results.length === 20, { peak, n: run.results.length });
  const dl = await WB.runPool(Array.from({ length: 50 }, (_, i) => i), async j => { await new Promise(r => setTimeout(r, 20)); return { j, ms: 20, ok: true }; }, 3, Date.now() + 100);
  ok("the pool stops at the time limit (the --max-minutes report)", dl.results.length < 50 && dl.results.length > 0, dl.results.length);
  const rep = WB.reportOf(run.results, 61000, run.peak);
  ok("the report: counts, p50, p95, wall minutes, function seconds, the peak and the OldCarsData spend", rep.reads === 20 && rep.ok === 16 && rep.failed === 4 && rep.p50Ms >= 15 && rep.p95Ms >= rep.p50Ms && rep.wallMinutes === 1 && rep.peakConcurrent <= 3 && rep.oldCarsDataRequests === 0, rep);
}
const sc = has("scripts/warmAfterBump.mjs") ? read("scripts/warmAfterBump.mjs") : "";
ok("the script reads production only with --run and --confirm (a bare call is a dry plan)", /RUN = args\.includes\("--run"\) && args\.includes\("--confirm"\)/.test(sc) && /if \(!RUN\) \{[^}]*process\.exit\(0\)/.test(sc));
ok("the script writes nothing of its own: no PATCH, PUT, DELETE and no write to the database; its one POST is the visitor's own read of a car", !/method: "(PATCH|PUT|DELETE)"/.test(sc) && (sc.match(/method: "POST"/g) || []).length === 1 && /\/api\/sellerDecision/.test(sc) && !/spec_market_cache|rest\/v1/.test(sc));
ok("the credentials are read from the Keychain in process and never printed", /security", \["find-generic-password"/.test(sc) && !/console\.log\([^)]*(key|bypass)\b/.test(sc));
ok("the cost is printed BEFORE any car is read (PLAN, then DRY unless --run)", sc.indexOf("PLAN:") > 0 && sc.indexOf("PLAN:") < sc.indexOf("await runPool(jobs"));
ok("the concurrency is three", /CONCURRENCY = 3/.test(sc));
const ops = has("api/usageDashboard.js") ? read("api/usageDashboard.js") : "", i = ops.indexOf('if (task === "warmlist")'), blk = i >= 0 ? ops.slice(i, ops.indexOf("// task=vindbg", i)) : "";
ok("the ops task warmlist exists and is read only (no insert, patch, upsert or delete, no OldCarsData)", i >= 0 && !/supabaseInsert|supabasePatch|supabaseUpsert|method: "(POST|PATCH|PUT|DELETE)"|fetchRecentRecords|OldCarsData|_ocd/.test(blk) && /writes: 0, ocdSpend: 0/.test(blk));
ok("the ops task reads the last 30 days of search_run and the History page views", /name=eq\.search_run/.test(blk) && /event_type=eq\.page_view/.test(blk) && /Number\(req\.query\?\.days\) \|\| 30/.test(blk));
console.log(`warmAfterBumpCheck: ${pass} pass, ${fail} FAIL` + (fail ? "\n" + fails.map(f => "  FAIL " + f).join("\n") : ""));
process.exit(fail ? 1 : 0);
function mutants() {
  const SRC = ROOT, COPY = fs.mkdtempSync(path.join(path.dirname(SRC), "goasksam-b-wbmut-"));
  spawnSync("sh", ["-c", `cd "${SRC}" && for d in lib api public data scripts package.json; do cp -R "$d" "${COPY}/" 2>/dev/null; done; ln -s "${SRC}/node_modules" "${COPY}/node_modules"`]);
  const rd = f => fs.readFileSync(path.join(COPY, f), "utf8"), wr = (f, s) => fs.writeFileSync(path.join(COPY, f), s);
  const MUT = [
    ["a VIN is a car to warm", "lib/warmList.js", s => s.replace("|| VIN.test(raw)", "")],
    ["the list is not capped", "lib/warmList.js", s => s.replace(".slice(0, max).map(([k, n]) => ({ text:", ".map(([k, n]) => ({ text:")],
    ["a VIN page is a hub", "lib/warmList.js", s => s.replace("/^\\/history\\/([a-z0-9-]+)$/", "/^\\/history\\/([a-z0-9-]+)/")],
    ["the plan allows more than three at once", "lib/warmList.js", s => s.replace("Math.min(3, Number(concurrency) || 3)", "Math.min(9, Number(concurrency) || 3)")],
    ["the pool runs ten at once", "scripts/warmAfterBump.mjs", s => s.replace("Math.min(concurrency, jobs.length)", "Math.min(10, jobs.length)")],
    ["the pool ignores the time limit", "scripts/warmAfterBump.mjs", s => s.replace("&& Date.now() < deadlineMs", "")],
    ["--run alone reads production", "scripts/warmAfterBump.mjs", s => s.replace("args.includes(\"--run\") && args.includes(\"--confirm\")", "args.includes(\"--run\")")],
    ["the script writes a row of its own", "scripts/warmAfterBump.mjs", s => s + "\nawait fetch(BASE + \"/rest/v1/spec_market_cache\", { method: \"PATCH\" });\n"],
    ["the ops task spends OldCarsData", "api/usageDashboard.js", s => s.replace("writes: 0, ocdSpend: 0 });\n  }\n\n  // task=vindbg", "writes: 0, ocdSpend: 1 }); /* fetchRecentRecords */\n  }\n\n  // task=vindbg")]
  ];
  let bad = 0;
  for (const [name, file, fn] of MUT) {
    const orig = rd(file), next = fn(orig); if (next === orig) { console.log("STALE MUTANT (no change): " + name); bad++; continue; }
    wr(file, next); const r = spawnSync("node", [path.join(COPY, "scripts/warmAfterBumpCheck.mjs"), COPY], { encoding: "utf8", timeout: 120000 }); wr(file, orig);
    console.log((r.status !== 0 ? "killed   " : "SURVIVED ") + name); if (r.status === 0) bad++;
  }
  fs.rmSync(COPY, { recursive: true, force: true }); console.log(bad ? bad + " survived or stale" : "all " + MUT.length + " mutants killed"); return bad ? 1 : 0;
}
