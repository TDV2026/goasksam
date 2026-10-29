// EVERY WAY THE ENGINE NARROWS AN ANSWER IS NAMED (Lane B, Oct 29 2026, Lane E's FULL: "typed mileage names no filter"). The page sends { miTarget: 60000, miMin: null, miMax: null }; appliedFiltersOf read only miMin, so a typed mileage had no applied line and no
// clear control while the pool WAS narrowed around it. CLASS: any refine the engine reads must be named by appliedFiltersOf, with the refine that takes it off and a plain line. This check (1) reads lib/onebox.js for every refine key the engine reads and fails on any
// that appliedFiltersOf does not name (the sweep), (2) names each way to narrow with a clear that really clears it, (3) runs typed miles through the real engine on a seeded pool: the filter, the line, scopeLine and metaLine carry it, the footer keeps its count,
// (4) when the engine does NOT narrow (too few sales near the miles) the line says so in the engine's note and never claims "Narrowed".
//   node scripts/appliedAllCheck.mjs [repo root]
import fs from "node:fs";
import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
process.chdir(root);
process.env.SUPABASE_URL = "https://fake.supabase.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.hostname !== "fake.supabase.test") throw new Error("offline"); return new Response("[]", { status: 200 }); };
let fail = 0; const ok = (n, c, d) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href), V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
// 1. the sweep: every refine key the engine reads
{ const src = fs.readFileSync("lib/onebox.js", "utf8"), keys = [...new Set([...src.matchAll(/\brefine\.([A-Za-z]+)/g)].map(m => m[1]))].filter(k => !["label", "notTrims", "miBand", "driverVal"].includes(k));
  const body = src.slice(src.indexOf("export function appliedFiltersOf"), src.indexOf("export function appliedLineOf"));
  for (const k of keys) ok(`the engine reads refine.${k}: appliedFiltersOf names it`, new RegExp("refine\\." + k + "\\b|r\\." + k + "\\b").test(body)); }
// 2. each way to narrow is named, with a clear that clears it
const WAYS = [["a mileage band pill", { miMin: 50000, miMax: 100000, label: "50,000 to 100,000 miles" }, "mileage"], ["typed miles", { miTarget: 60000, miMin: null, miMax: null }, "mileage"], ["typed miles (small)", { miTarget: 5000, miMin: null, miMax: null }, "mileage"], ["gearbox", { tx: "manual" }, "gearbox"], ["body", { body: "coupe" }, "body"],
  ["year", { year: 2004 }, "year"], ["edition", { variant: "competition" }, "variant"], ["trim", { trim: "Carrera" }, "trim"], ["documented history", { docHistory: "has" }, "history"], ["a detail the title lists", { driver: "matching_numbers", driverVal: "yes" }, "detail"], ["an observed flag", { observe: "repainted" }, "observed"]];
for (const [name, refine, kind] of WAYS) {
  const a = E.appliedFiltersOf(refine, { options: [] }), line = E.appliedLineOf(a, {});
  ok(`${name}: named (${kind})`, a.length === 1 && a[0].kind === kind && !!a[0].words, JSON.stringify(a.map(x => x.words)));
  ok(`${name}: a plain line, "Narrowed to ..."`, /^Narrowed to .+\.$/.test(String(line)), line);
  const after = E.appliedFiltersOf(a[0].clear, { options: [] });
  ok(`${name}: its clear refine takes the filter off`, after.length === 0, JSON.stringify(a[0].clear));
}
ok("two filters at once are named in order and each clears only itself", (() => { const a = E.appliedFiltersOf({ miMin: 50000, miMax: 100000, tx: "manual" }, {}); return a.length === 2 && E.appliedFiltersOf(a[0].clear, {}).length === 1 && E.appliedFiltersOf(a[1].clear, {}).length === 1; })());
// 3 and 4. the real engine, a seeded pool, typed miles
const TEXT = "1995 Porsche 911 Carrera Coupe", env = rows => ({ supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", asked: 2, poolSeed: { rows } });
const rows = Array.from({ length: 90 }, (_, i) => { const mi = 10000 + i * 1500, manual = i % 2 === 0; return { id: "r" + i, price: Math.round(52000 - (mi - 10000) * 0.14 + (manual ? 300 : -300)), auction_end_date: `2026-0${1 + (i % 9)}-${10 + (i % 9)}`, year: 1995, make: "Porsche", model: "911", raw_title: TEXT + (manual ? " 6-Speed" : " Tiptronic"), rtitle: TEXT + (manual ? " 6-Speed" : " Tiptronic"), mileage: String(mi), vin_norm: "WP0AB099" + (100000 + i), transmission: manual ? "Manual (6-speed)" : "Automatic (Tiptronic)", image: "https://img.test/x.jpg", source: "bringatrailer" }; }).map(r => ({ ...r, _usd: r.price }));
const v = (await V.resolveVehicle(TEXT, {})).vehicle, run = async refine => (await E.oneEngineAnswer(v, null, TEXT, env(rows), refine)).raw;
{ const a = await run({ miTarget: 60000, miMin: null, miMax: null }); // the shape the page sends
  ok("typed miles through the engine: the answer carries the filter and its plain line", Array.isArray(a.appliedFilters) && a.appliedFilters.length === 1 && /^Narrowed to cars within [\d,]+ miles of 60,000\.$/.test(String(a.appliedLine)), a.appliedLine);
  ok("... scopeLine and metaLine carry it, and the footer keeps its count and since date once", String(a.scopeLine).includes("Narrowed to cars within") && String(a.metaLine).includes("Narrowed to") && /^\d+ sales?, since /.test(String(a.windowLine)), `${a.scopeLine} | ${a.windowLine}`);
  ok("... the line and the title line agree with the sales behind them (a band was applied, the pool is the band's)", a.tier === "result" && !a.mileageNote, String(a.poolN)); }
{ const near = r => Math.abs(Number(r.mileage) - 90000) <= 25000, few = [...rows.filter(r => !near(r)), ...rows.filter(near).slice(0, 3)];   // a gap near the typed miles: three sales in the band, under the range minimum
  const a = (await E.oneEngineAnswer(v, null, TEXT, env(few), { miTarget: 90000, miMin: null, miMax: null })).raw;
  ok("too few sales near the miles (engine, seeded gap): the answer is NOT narrowed and the line is the engine's note, never \"Narrowed to\"", !!a.mileageNote && !/Narrowed to/.test(String(a.appliedLine)) && String(a.appliedLine).includes(String(a.mileageNote)) && !/Narrowed/.test(String(a.scopeLine)), `${a.mileageNote} | ${a.appliedLine} | ${a.scopeLine}`); }
{ const a = E.appliedFiltersOf({ miTarget: 70000, miMin: null }, { mileageNote: "Too few sales near 70,000 miles to narrow it. This is the range for all 20." }), line = E.appliedLineOf(a, { mileageNote: "Too few sales near 70,000 miles to narrow it. This is the range for all 20." });
  ok("not narrowed (unit): the filter is named with narrowed false and the line is the engine's note, no claim of narrowing", a.length === 1 && a[0].narrowed === false && !/Narrowed to/.test(line) && /Too few sales/.test(line), line); }
console.log(fail ? `appliedAllCheck: ${fail} failure(s)` : "appliedAllCheck: all pass");
process.exit(fail ? 1 : 0);
