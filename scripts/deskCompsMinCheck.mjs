// clock: real-ok sales are dated relative to now in the fake archive; no calendar date is asserted (Lane B, Nov 10 2026)
// DESK COMPARABLES MINIMUM CHECK. Cause (1967 Austin-Healey 3000 in Lane F's re-sweep): 4 sales in 24 months, 2 of the car's generation and body, so 2 comparables. The rest of the model's sales in the window were refused as a fill because the fill's
// FALLBACK_MIN (5 sales) counted the leftovers alone, not the list they complete. Class: a car with a range and enough sales in the window listing fewer than three.
// Bar: a Desk read with a range (not insufficient) and 4 or more sales in its window, within 5 years of the car's year, lists at least 3 comparables, each with a why line.
//   (1) every car of Lane F's 24, as recorded, and with four sales in the window and half of them moved out of the car's generation (the Austin-Healey's case), meets the bar
//   (2) the fill lists only sales inside the window and the 5 year cap, marked filled, never ahead of a generation match
// MUTANTS (each must fail): the fill needs 5 leftovers again; the fill takes none; the fill ignores the year cap.
//   node scripts/deskCompsMinCheck.mjs --mutants
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), W = await import("./_deskOlderWorld.mjs"); console.error = () => {};
const head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" });
let seq = 0;
async function loadSheet(rw, rwOn) {
  const mine = []; try {
    const tag = `__cmmut${++seq}_`; let dv = fs.readFileSync(path.join(ROOT, "lib/deskV3.js"), "utf8"); for (const [a, b] of rw || []) { if (!dv.includes(a)) throw new Error("mutant target missing: " + a.slice(0, 50)); dv = dv.replace(a, b); }
    let on = fs.readFileSync(path.join(ROOT, "lib/onebox.js"), "utf8"); for (const [a, b] of rwOn || []) { if (!on.includes(a)) throw new Error("mutant target missing: " + a.slice(0, 50)); on = on.replace(a, b); } on = on.replace(/from "\.\/deskV3\.js"/g, `from "./${tag}deskV3.js"`); const sh = fs.readFileSync(path.join(ROOT, "lib/sheetRead.js"), "utf8").replace(/from "\.\/onebox\.js"/g, `from "./${tag}onebox.js"`).replace(/import\("\.\/onebox\.js"\)/g, `import("./${tag}onebox.js")`);
    for (const [n, src] of [[`lib/${tag}deskV3.js`, dv], [`lib/${tag}onebox.js`, on], [`lib/${tag}sheetRead.js`, sh]]) { const f = path.join(ROOT, n); fs.writeFileSync(f, src); mine.push(f); }
    return await import(pathToFileURL(path.join(ROOT, `lib/${tag}sheetRead.js`)).href);
  } finally { for (const f of mine) fs.rmSync(f, { force: true }); }
}
const DAY = 864e5, readOf = (S, w, c) => S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 60000, bodyStyle: c.typedBody || undefined, desk: { caseDate: new Date().toISOString().slice(0, 10), transmission: "Manual", label: `${c.year} ${c.make} ${c.model}`, case: { verification: {} }, exclusions: [], head } }, w.deps).catch(e => ({ err: String(e) }));
// the archive of a car with FOUR sales in its window and nothing older, so the generation match is all there is (the Austin-Healey's case)
const sparse = w => { const cutoff = Date.now() - 700 * DAY; for (const [k, rows] of w.DATA) w.DATA.set(k, rows.filter(r => new Date(r.sale_date).getTime() >= cutoff).slice(0, 4)); };
// half of the sales filed under another word of the model ("3000 Mk III", "SL-Class 250SL Pagoda"): the car's generation list does not know that word (the Austin-Healey's case)
const refile = (w, c) => { { const [k, rows] = [...w.DATA][0], src = rows[0]; if (src) { const y = c.year - 8, t = src.listing_title.replace(/^\d{4}/, String(y)); w.DATA.set(k, [...rows, { ...src, id: src.id + "far", source_id: src.source_id + "far", year: y, listing_title: t, raw_record: { ...src.raw_record, id: src.raw_record.id + "far", title: t } }]); } }   // and one more sale in the window, eight model years off: never a comparable (the 5 year cap)
  let i = 0; for (const rows of w.DATA.values()) for (const r of rows) if ((i++ % 2) === 0) { const m = r.model; r.model = m + " Mk III"; r.listing_title = r.listing_title.replace(m, m + " Mk III"); r.raw_record.title = r.listing_title; } };
export async function findings(mut = {}) {
  const fails = [], S = await loadSheet(mut.deskV3, mut.onebox); let graded = 0;
  for (const c of W.loadCars(ROOT)) for (const mode of ["as recorded", "half filed under another model word"]) {
    const w = W.install(ROOT, { cars: [c], oneYear: true }); sparse(w); if (mode !== "as recorded") refile(w, c);
    const r = await readOf(S, w, c), d = r && r.desk, name = `${c.year} ${c.make} ${c.model} ${c.typedBody || ""} (${mode})`; if (!d || !d.evidence) continue;
    const ev = d.evidence, months = Number(ev.windowMonths) || 12, cutoff = Date.now() - months * 30.44 * DAY;
    const nIn = [...w.DATA.values()].flat().filter(x => new Date(x.sale_date).getTime() >= cutoff && Math.abs(Number(x.year) - c.year) <= 5 && x.sale_price > 0).length, comps = d.comparables || [], why = comps.filter(x => (x.why || "").trim()).length;
    if (!ev.insufficient && nIn >= 4) { graded++; if (comps.length < 3 || why < 3) fails.push(`${name}: a range and ${nIn} sales in the window, ${comps.length} comparables (${why} with a why line)`); }
    for (const x of comps) if (x.filled) { if (!x.soldDate || new Date(x.soldDate).getTime() < cutoff) fails.push(`${name}: a filled comparable sold outside the window`); if (Math.abs(Number(x.year) - c.year) > 5) fails.push(`${name}: a filled comparable ${x.year} is outside the 5 year cap`); }
    for (let i = 1; i < comps.length; i++) if (comps[i - 1].filled && !comps[i].filled) fails.push(`${name}: a filled comparable is listed ahead of a generation match`);
  }
  if (graded < 20) fails.push(`only ${graded} reads met the bar's preconditions; the sweep is not reaching the cars`);
  return fails;
}
if (process.argv[1] && process.argv[1].endsWith("deskCompsMinCheck.mjs")) {
  const NOMAP = [["Object.assign({}, r, { generation: genCodeOf(vehicle.make, vehicle.model, r.year) || null })", "r"]];   // the row-generation fix off: with it on, no sale is left unmapped and the fill is never needed
  const MUTS = [
    ["the old behaviour: no row generation from the model word, the fill needs 5 leftovers", { onebox: NOMAP, deskV3: [["Math.max(1, COMP_MIN - mapped.length)), room", "5), room"]] }],
    ["no row generation, and the fill takes none", { onebox: NOMAP, deskV3: [["room = FALLBACK_MAX - mapped.length, take = cands.slice(0, room)", "room = 0, take = cands.slice(0, room)"]] }],
    ["no row generation, and the fill ignores the year cap", { onebox: NOMAP, deskV3: [["Math.abs(Number(r.year) - Number(sub.year)) <= YEAR_CAP) : [];", "true) : [];"]] }]
  ];
  const base = await findings(); for (const f of base.slice(0, 12)) console.log("FAIL  " + f);
  console.log(`${base.length ? "FAIL" : "PASS"}  a car with a range and 4 or more sales in its window lists 3 or more comparables, each with a why line; the fill stays inside the window and the year cap`);
  let surv = 0;
  if (process.argv.includes("--mutants")) for (const [n, m] of MUTS) { let f; try { f = await findings(m); } catch (e) { f = ["threw " + e.message]; } console.log(`${f.length ? "killed  " : "SURVIVED"}  ${n}`); if (!f.length) surv++; }
  console.log(`\ndeskCompsMinCheck: ${base.length ? base.length + " FAIL" : "all pass"}${process.argv.includes("--mutants") ? (surv ? `, ${surv} mutant(s) survived` : ", all mutants killed") : ""}`);
  process.exit(base.length || surv ? 1 : 0);
}
