// clock: real-ok the fixture sales are dated relative to now; no calendar date is asserted (Lane B, Nov 14 2026)
// DESK RESERVE LADDER (Lane B, Nov 14 2026, Hagerty demo). desk.reserveLadder = { rungs, recommended, reason, thin, thinLine, fallbackView } at the top of desk and in every desk.views entry, from the engine only (lib/deskV3.js reserveLadderOf, constant LADDER).
// CAUSE this guards against: a demo that needs a reserve ladder, a recommendation and a thin-view rule would otherwise have each page or the model work them out from the sales, and two screens would say two things.
// CLASS: any view of any car. Part A reads two cars through the real engine (the 1999 911 case world and an older car), every view (15 each) and the top, and holds each to the rules from the view's own sales. Part B builds the fixtures that trigger each recommendation and the no-reserve floor.
//   node scripts/deskLadderCheck.mjs [root]    --mutants
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url)), args = process.argv.slice(2), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js", muts = [
    [DV, "export const CONDITION_RUNG = { 1: \"ambitious\",", "export const CONDITION_RUNG = { 1: \"safe\",", "Concours maps to safe"],
    [DV, "2: \"balanced\", 3: \"balanced\", 4: \"safe\" };", "2: \"balanced\", 3: \"balanced\", 4: \"ambitious\" };", "Fair maps to ambitious"],
    [DV, "2: \"balanced\", 3: \"balanced\", 4: \"safe\" };", "2: \"safe\", 3: \"balanced\", 4: \"safe\" };", "Excellent maps to safe"],
    [DV, "out[t] = { ...base, key: own.recommended || null,", "out[t] = { ...base, key: \"balanced\",", "a priced tier view points at balanced, not its own recommendation"],
    [DV, "reason: own.reason || null, cleared: r ?", "reason: null, cleared: r ?", "a priced tier view gives no reason"],
    [DV, "of: r.of, cleared: r.cleared }), cleared: r.cleared, of: r.of } : base;", "of: r.of, cleared: r.of - r.cleared }), cleared: r.cleared, of: r.of } : base;", "the reason counts the sales that did not clear"],
    [DV, "key = CONDITION_RUNG[t], r = src ? src.rungs.find(x => x.key === key && x.available) : null;", "key = CONDITION_RUNG[t], r = (src || all || ladder).rungs.find(x => x.key === key);", "a view with no priced ladder names a rung"],
    [DV, "b.reserveLadder = { ...b.reserveLadder, byCondition: byConditionOf(by[0], by) };", "b.reserveLadder = { ...b.reserveLadder, byCondition: byConditionOf(b.reserveLadder) };", "every tier reads the current view's ladder (the Firebird bug)"],
    [DV, "by[t] = noTiers || !blocks[`${t}:${m}`] ? null : blocks[`${t}:${m}`].reserveLadder;", "by[t] = b.reserveLadder;", "each tier is given the current view's ladder as its own"],
    [DV, "by[t] = noTiers || !blocks[`${t}:${m}`] ? null :", "by[t] = !blocks[`${t}:${m}`] ? null :", "a case with no condition data prices every tier on its own"],
    [DV, "by[t] = noTiers || !blocks[`${t}:${m}`] ? null : blocks[`${t}:${m}`].reserveLadder;", "by[t] = noTiers || !blocks[`${t}:${m}`] ? null : blocks[`${t}:12`].reserveLadder;", "a tier reads another period's view"],
    [DV, "const m = k.split(\":\")[1], by = { 0: blocks[`0:${m}`] ? blocks[`0:${m}`].reserveLadder : null };", "const m = k.split(\":\")[1], by = { 0: b.reserveLadder };", "the mapping reads the current view as the all-conditions ladder"],
    [DV, "if (own && own.rungs && !own.thin) { const r = own.rungs.find(x => x.key === own.recommended);", "if (false) { const r = own.rungs.find(x => x.key === own.recommended);", "a tier that prices on its own still takes the mapping"],
    ["lib/onebox.js", "      ownByCondition(blocks, noData);", "      ", "the views carry the current view's byCondition only"],
    ["lib/onebox.js", "desk.reserveLadder = { ...desk.reserveLadder, byCondition: cur.reserveLadder.byCondition };", "", "the top of the answer keeps the current view's tiers"],
    [DV, "fb.sales.length >= DESK_EVIDENCE_MIN && fb.evidence && !fb.evidence.insufficient);", "false);", "a thin tier view over a thin all-conditions view serves an empty pool (the stored 911)"],
    [DV, "fb.sales.length >= DESK_EVIDENCE_MIN && fb.evidence && !fb.evidence.insufficient);", "fb.sales.length >= 0 && fb.evidence);", "an all-conditions view under the Desk minimum is served too"],
    ["lib/sheetRead.js", "if (input.desk && hasDesk(a) && !(vehicle && vehicle.bodyStyle) && !a.desk.bodyNote)", "if (false)", "a car with no body does not say what it was priced on"],
    ["lib/reasonWords.js", "text: p => `Priced on ${p.gen ? p.gen + \" \" : \"\"}${p.gearbox ? p.gearbox + \"s\" : \"cars\"}, body not stated.` }", "text: p => `Priced on ${p.gen}, body not stated.` }", "the note leaves out the gearbox"],
    [DV, "const key = CONDITION_RUNG[t], r = ladder.fallbackView ? ladder.rungs.find(x => x.key === key && x.available) : null;", "const key = CONDITION_RUNG[t], r = ladder.rungs.find(x => x.key === key);", "a view with no priced ladder names a rung"],
    [DV, "  reserveLadder = { ...reserveLadder, byCondition: byConditionOf(reserveLadder) };\n", "", "the ladder carries no byCondition"],
    [DV, "reserveLadderOf({ sales, evidence, reserveStart, reserveMode, tierName", "reserveLadderOf({ sales: rows, evidence, reserveStart, reserveMode, tierName", "a rung is counted over the whole population, not the view's sales"],
    [DV, "  if (reserveLadder.thin) {\n    const fbSpec", "  if (false) {\n    const fbSpec", "a thin view prices on its own rows (no fallback)"],
    [DV, "servedFrom = fbKey; salesOut = fb.sales; evidenceOut", "servedFrom = fbKey; evidenceOut", "a thin view swaps the figures but not the list"],
    [DV, " comparablesOut = fb.comparables;", "", "a thin view keeps its own comparables"],
    [DV, " hagertyOut = mark(fb.hagerty);", "", "a thin view keeps its own Hagerty count"],
    [DV, "note: thinLine, tooFew: true", "note: null, tooFew: true", "the start figure carries no thin note"],
    [DV, "} else { reserveStartOut = null;", "} else { ", "no fallback, and a reserve start is still served"],
    [DV, "const clearedAt = f => prices.filter(x => x >= f).length;", "const clearedAt = f => prices.filter(x => x >= f).length + 1;", "the cleared counts are off by one"],
    [DV, "if (noRes.available && noRes.noReserveMedian >= noRes.reserveMedian)", "if (noRes.noReserveMedian >= noRes.reserveMedian)", "no reserve is recommended while unavailable"],
    [DV, "recommended = \"balanced\"; reason = reasonLine(\"desk4.ladder_why_balanced\"", "recommended = \"balanced\"; reason = reasonLine(\"desk4.ladder_why_safe_few\"", "the reason text does not match the chosen rung"],
    [DV, "recommended = \"safe\"; reason = reasonLine(\"desk4.ladder_why_safe_wide\", { cleared: safe.cleared, of }); }", "recommended = \"balanced\"; reason = reasonLine(\"desk4.ladder_why_safe_wide\", { cleared: safe.cleared, of }); }", "a wide range does not recommend safe"],
    [DV, "else if (of < LADDER.nearMinimum) {", "else if (false) {", "a count near the minimum does not recommend safe"],
    [DV, "count >= LADDER.minNoReserve &&", "count >= 0 &&", "no reserve stays available under the minimum"],
    [DV, "share >= LADDER.odds.likely ? \"desk4.ladder_odds_likely\"", "share >= 0.9 ? \"desk4.ladder_odds_likely\"", "the odds word ignores its threshold"],
    [DV, "if (!(figs[k] > prev)) {", "if (false) {", "the rungs are not kept in order"],
    [DV, "const thin = of < LADDER.minSales ||", "const thin = of < 2 ||", "a view under the minimum is not thin"],
    [DV, "thinLine, fallbackView: fbKey, servedFrom: fbKey }", "thinLine, fallbackView: `0:${months + 6}`, servedFrom: fbKey }", "the fallback names the wrong view"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dlc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskLadderCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + n + (d ? " :: " + d : "")); } };
const J = x => JSON.stringify(x), strip = ({ servedFrom, ...r } = {}) => r;
const { setup } = await imp("scripts/_deskCaseWorld.mjs"); const { readyCase } = await setup(ROOT);
const DV = await imp("lib/deskV3.js"), RW = await imp("lib/reasonWords.js"), { LADDER } = DV;
const base = await readyCase(); const cases = [{ name: "1999 Porsche 911 Carrera (case world)", desk: base.desk }];
const WLD = await imp("scripts/_deskOlderWorld.mjs"), S = await imp("lib/sheetRead.js"); console.error = () => {};
const head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" }), today = new Date().toISOString().slice(0, 10), w = WLD.install(ROOT), old = WLD.loadCars(ROOT).find(c => c.n === 4);
const r4 = await S.sheetRead(w.env, { year: old.year, make: old.make, model: old.model, mileage: 60000, bodyStyle: old.typedBody || undefined, desk: { caseDate: today, transmission: "Manual", label: "x", case: { verification: {} }, exclusions: [], head, views: true } }, w.deps);
cases.push({ name: `${old.year} ${old.make} ${old.model} (older car)`, desk: r4 && r4.desk });
const oddsWord = s => s >= LADDER.odds.almost ? "almost certain to sell" : s >= LADDER.odds.likely ? "likely to sell" : "one in two ends unsold";
const KEYS = ["safe", "balanced", "ambitious", "noReserve"];
let views = 0, thinViews = 0, liveViews = 0, served = 0;
function judgeView(label, v, all, months) {
  views++; const L = v.reserveLadder; if (!L) return ok(`${label}: carries desk.reserveLadder`, false);
  ok(`${label}: the shape`, J(Object.keys(L).filter(k => ["rungs", "recommended", "reason", "thin", "thinLine", "fallbackView"].includes(k))) === J(["rungs", "recommended", "reason", "thin", "thinLine", "fallbackView"]) || ["rungs", "recommended", "reason", "thin", "thinLine", "fallbackView"].every(k => k in L), J(Object.keys(L)));
  ok(`${label}: four rungs in the order safe, balanced, ambitious, noReserve`, J(L.rungs.map(r => r.key)) === J(KEYS), J(L.rungs.map(r => r.key)));
  // BY CONDITION (order bc85): the four tiers, each held to the rule from the view's own state, not from the engine's code
  { const BC = L.byCondition, WORD = { ambitious: "higher", balanced: "middle", safe: "lower" }, FIX = { 1: "ambitious", 2: "balanced", 3: "balanced", 4: "safe" }, NAME = { 1: "Concours", 2: "Excellent", 3: "Good", 4: "Fair" };
    ok(`${label}: byCondition has the tiers 1 to 4, each with tier, name, key, reason, cleared, of`, !!BC && J(Object.keys(BC)) === J(["1", "2", "3", "4"]) && [1, 2, 3, 4].every(t => BC[t] && BC[t].tier === t && BC[t].name === NAME[t] && ["key", "reason", "cleared", "of"].every(k => k in BC[t])), J(BC));
    // THE RULE (Nov 16 2026): byCondition[tier] is read from THAT TIER'S OWN VIEW of the same period: priced on its own, its own recommended rung and reason; thin, the fixed rung on the all-conditions ladder of the period with the thin reason. Never the current view's ladder for all four.
    if (BC) for (const t of [1, 2, 3, 4]) { const e = BC[t]; if (!e) continue; const tv = all[`${t}:${months}`], tl = tv && tv.reserveLadder, a0 = all[`0:${months}`], al = a0 && a0.reserveLadder, noTier = !tv || !a0 || J(strip(tv.evidence)) === J(strip(a0.evidence)) && J(tv.sales) === J(a0.sales);
      if (tl && !tl.thin && !noTier) { const r = tl.rungs.find(x => x.key === tl.recommended); ok(`${label}: tier ${t} (${NAME[t]}) prices on its own ${t}:${months} view: its own recommended rung (${tl.recommended}), reason and counts`, e.key === tl.recommended && e.reason === tl.reason && e.cleared === r.cleared && e.of === r.of && e.of === tv.sales.length, J([e, tl.recommended])); }
      else if (al && !al.thin) { const fr = al.rungs.find(r => r.key === FIX[t]), cl = a0.sales.filter(x => Number(x.price) >= fr.figure).length;
        ok(`${label}: tier ${t} (${NAME[t]}) is thin: rung ${FIX[t]} of the all-conditions ${a0.sales.length} sales of ${months} months, ${cl} cleared it`, e.key === FIX[t] && e.cleared === cl && e.of === a0.sales.length && e.reason === `${NAME[t]}: too few ${NAME[t]} sales to price on their own, so the reserve takes the ${WORD[FIX[t]]} rung of all ${a0.sales.length} sales, ${cl} of ${a0.sales.length} cleared it.`, J(e)); }
      else ok(`${label}: tier ${t}: the all-conditions ladder prices nothing, so no rung and no reason`, e.key === null && e.reason === null, J(e)); } }
  const prices = v.sales.map(s => Number(s.price)), own = v.sales.length;
  const N = v.sales.length, KEY0 = `0:${months}`, fb0 = all[KEY0], fbOk = !!(fb0 && fb0.reserveLadder && !fb0.reserveLadder.thin && fb0.sales.length >= LADDER.minSales);
  // THE CLASS (Lane C's hold, Nov 15 2026): every count a view prints equals the list it sits over, thin or not
  ok(`${label}: evidence.count (${v.evidence.count}) equals the sales list (${N})`, v.evidence.count === N, `${v.evidence.count} vs ${N}`);
  ok(`${label}: the Hagerty share, the reserve check and the comparables count sit over that same list`, (!v.hagerty || !v.hagerty.share || v.hagerty.share.all === N) && (!v.reserveCheck || v.reserveCheck.of === N) && v.comparablesCount === v.comparables.length, "");
  if (L.thin) {
    thinViews++; const sameAs = (a, b) => J(strip(a)) === J(strip(b));
    if (v.servedFrom) { served++;
      ok(`${label}: served whole from ${KEY0}, the same period over all conditions, which has enough sales`, v.servedFrom === KEY0 && fbOk && L.fallbackView === KEY0 && L.servedFrom === KEY0, J([v.servedFrom, L.fallbackView, L.servedFrom, fbOk]));
      ok(`${label}: the sales list, the comparables (and their marks) and the quarters are the fallback's`, J(v.sales) === J(fb0.sales) && J(v.comparables) === J(fb0.comparables) && J(v.quarters) === J(fb0.quarters), "");
      ok(`${label}: evidence, Hagerty, reserve read and check, likely basis are the fallback's, each marked servedFrom ${KEY0}`, [v.evidence, v.hagerty, v.reserveMode, v.likelyBasis].every(o => o && o.servedFrom === KEY0) && sameAs(v.evidence, fb0.evidence) && sameAs(v.hagerty, fb0.hagerty) && sameAs(v.reserveMode, fb0.reserveMode) && sameAs(v.likelyBasis, fb0.likelyBasis) && (!fb0.reserveCheck || (v.reserveCheck.servedFrom === KEY0 && sameAs(v.reserveCheck, fb0.reserveCheck))), "");
      ok(`${label}: the reserve start is the fallback's and its note is the thin line`, v.reserveStart && v.reserveStart.servedFrom === KEY0 && v.reserveStart.figure === fb0.reserveStart.figure && v.reserveStart.note === L.thinLine, J(v.reserveStart));
      ok(`${label}: the ladder is the fallback's (its rungs and its recommendation), thin, naming the fallback`, J(L.rungs) === J(fb0.reserveLadder.rungs) && L.recommended === fb0.reserveLadder.recommended && L.reason === fb0.reserveLadder.reason && L.thin === true, "");
      ok(`${label}: the thin line says the condition and the fallback's count`, /^Too few \w+ sales to price on their own\. Figures use all \d+ sales in this period\.$/.test(L.thinLine) && L.thinLine.includes(`all ${fb0.sales.length} sales`), L.thinLine); }
    else { ok(`${label}: no fallback with enough sales: its own list, no reserve start at all, no priced rung, the table's line`, !fbOk && L.fallbackView === null && v.reserveStart === null && L.rungs.every(r => r.available === false) && L.recommended === null && L.thinLine === RW.reasonLine("desk4.ladder_thin_all") && !(v.evidence && v.evidence.servedFrom), J([L.fallbackView, v.reserveStart, L.thinLine]));
      ok(`${label}: thin because its own sales (${N}) are under ${LADDER.minSales}`, N < LADDER.minSales || v.evidence.insufficient, String(N)); }
    return;
  }
  liveViews++; ok(`${label}: not thin, no fallback and no marker`, L.thinLine === null && L.fallbackView === null && !v.evidence.servedFrom && v.servedFrom === null && N >= LADDER.minSales);
  const [s, b, a, n] = L.rungs; ok(`${label}: safe below balanced below ambitious`, s.figure < b.figure && b.figure < a.figure, J([s.figure, b.figure, a.figure]));
  ok(`${label}: safe is the engine's reserve start, unchanged`, s.figure === v.reserveStart.figure, `${s.figure} vs ${v.reserveStart.figure}`);
  for (const r of [s, b, a]) { const cl = prices.filter(x => x >= r.figure).length;
    ok(`${label}: ${r.key}: cleared ${r.cleared} and of ${r.of} are counted over the view's ${own} sales`, r.of === own && r.cleared === cl && r.available === true && r.cleared >= 0 && r.cleared <= r.of, J(r));
    ok(`${label}: ${r.key}: the odds word follows the thresholds, and the line is the table's`, r.odds === oddsWord(r.cleared / r.of) && r.line === RW.reasonLine("desk4.ladder_line", { price: r.figure, cleared: r.cleared, of: r.of, odds: r.odds }), J(r)); }
  ok(`${label}: a smaller share cleared on each higher rung`, s.cleared >= b.cleared && b.cleared >= a.cleared);
  const rm = v.reserveMode, nr = rm.noReserve, wr = rm.withReserve, avail = nr.sold >= LADDER.minNoReserve && nr.median != null && wr.median != null;
  ok(`${label}: the no-reserve rung is the reserve read's (counts, medians, availability)`, n.noReserveCount === nr.sold && n.reserveCount === wr.sold && n.available === avail && n.figure === null && (avail ? n.noReserveMedian === nr.median && n.reserveMedian === wr.median : n.noReserveMedian === null && n.reserveMedian === null), J(n));
  ok(`${label}: its line is the table's`, n.line === (avail ? RW.reasonLine("desk4.ladder_noreserve", { median: nr.median, withReserve: wr.median, count: nr.sold }) : RW.reasonLine("desk4.ladder_noreserve_few")));
  const rec = L.rungs.find(r => r.key === L.recommended); ok(`${label}: the recommendation is an available rung with a reason`, !!rec && rec.available && typeof L.reason === "string" && L.reason.length > 0, J([L.recommended, L.reason]));
}
for (const c of cases) {
  const d = c.desk; ok(`${c.name}: the engine read carries views`, !!d && DV.hasViews(d));
  if (!d) continue; const all = Object.fromEntries(Object.keys(d.views).map(k => [k, DV.viewOf(d, k)]));
  for (const k of Object.keys(d.views)) judgeView(`${c.name}, view ${k}`, all[k], all, Number(k.split(":")[1]));
  const cur = d.view && all[DV.viewKey(d.view.tier, d.view.months)]; ok(`${c.name}: the top of desk carries the current view's ladder`, !!d.reserveLadder && (!cur || J(d.reserveLadder) === J(cur.reserveLadder)));
}
ok("views were judged across both cars, with thin and not-thin among them", views >= 20 && thinViews >= 1 && liveViews >= 1 && served >= 1, J({ views, thinViews, liveViews, served }));
// no fallback at the engine: four near sales, no condition chosen (nothing wider to serve): its own list, no reserve start at all, the table's line, no priced rung
{ const DV2 = DV, when = "2026-11-14", at = m => DV2.cutoffOf(when, m), r = (i, m, price) => ({ id: "n" + i, price, date: at(m), year: 1999, generation: "996", body: "Coupe", gearbox: "manual", gearboxWord: "Manual", miles: 60000 + i * 500, platform: "Bring a Trailer", title: "1999 Porsche 911 Carrera", inPopulation: true, tier: null });
  const b = await DV.deskBlock([r(0, 2, 30000), r(1, 3, 31000), r(2, 4, 32000), r(3, 5, 33000)], { caseDate: when, windowMonths: 12, subjectFacts: { generation: "996", year: 1999, body: "Coupe", gearbox: "manual", miles: 60000 } }, null);
  ok("engine, no fallback: four sales are thin, the view keeps its own four, serves no reserve start, and says the table's line", b.reserveLadder.thin === true && b.sales.length === 4 && b.evidence.count === 4 && b.reserveStart === null && b.servedFrom === null && b.reserveLadder.fallbackView === null && b.reserveLadder.thinLine === "Too few sales of this car in this period to set a reserve." && b.reserveLadder.rungs.every(x => x.available === false && x.figure === null), J([b.reserveLadder.thin, b.sales.length, b.reserveStart, b.reserveLadder.thinLine]));
  ok("every priced rung carries figureLine (Lane S's word), the money words of its figure", (await (async () => { const d = await DV.deskBlock(Array.from({ length: 12 }, (_, i) => r(i, 2 + (i % 9), 30000 + i * 1000)), { caseDate: when, windowMonths: 12, subjectFacts: { generation: "996", year: 1999, body: "Coupe", gearbox: "manual", miles: 60000 } }, null); return d.reserveLadder.rungs.filter(x => x.key !== "noReserve").every(x => x.available && x.figureLine === RW.moneyWords(x.figure)); })())); }
// B. FIXTURES THAT TRIGGER EACH RULE (the unit, so each recommendation is asserted with its reason)
const mk = ps => ps.map((p, i) => ({ id: "s" + i, price: p })), ev = ps => { const s = ps.slice().sort((a, b) => a - b); return { insufficient: false, median: DV.quant(s, .5), q1: DV.quant(s, .25), q3: DV.quant(s, .75) }; };
const rmode = (nrSold, nrMed, wrSold, wrMed) => ({ noReserve: { sold: nrSold, median: nrMed }, withReserve: { sold: wrSold, median: wrMed } });
const run = (ps, rm = rmode(0, null, 0, null)) => { const e = ev(ps); return DV.reserveLadderOf({ sales: mk(ps), evidence: e, reserveStart: { figure: DV.roundReserve(e.q1) }, reserveMode: rm }); };
const TIGHT = [30000, 31000, 32000, 33000, 34000, 35000, 36000, 37000, 38000, 39000, 40000, 41000], WIDE = [20000, 25000, 30000, 38000, 45000, 50000, 55000, 62000, 70000, 78000, 85000, 90000], FEW = [30000, 31000, 32000, 33000, 34000, 35000];
{ const L = run(TIGHT), b = L.rungs[1]; ok("FIXTURE balanced: tight range, twelve sales, no no-reserve read: balanced, with its reason", L.recommended === "balanced" && L.reason === `Balanced: ${b.cleared} of 12 cleared it and the typical range is tight.`, J([L.recommended, L.reason]));
  ok("FIXTURE balanced: the rungs rise, counts fall, shares near 0.75, 0.6, 0.4", L.rungs[0].figure < L.rungs[1].figure && L.rungs[1].figure < L.rungs[2].figure && L.rungs[0].cleared / 12 >= 0.7 && L.rungs[1].cleared / 12 >= 0.5 && L.rungs[1].cleared / 12 <= 0.7 && L.rungs[2].cleared / 12 <= 0.5, J(L.rungs.slice(0, 3).map(r => [r.figure, r.cleared]))); }
{ const L = run(WIDE), s = L.rungs[0]; ok("FIXTURE safe (wide): a wide typical range recommends safe and says so", L.recommended === "safe" && L.reason === `Safe: the typical range is wide, and ${s.cleared} of 12 cleared this figure.`, J([L.recommended, L.reason])); }
{ const L = run(FEW), s = L.rungs[0]; ok("FIXTURE safe (few): a count near the minimum recommends safe and says so", L.recommended === "safe" && L.reason === `Safe: 6 sales is close to the minimum of ${LADDER.minSales}, and ${s.cleared} of 6 cleared this figure.`, J([L.recommended, L.reason])); }
{ const L = run(TIGHT, rmode(5, 40000, 6, 36000)), n = L.rungs[3]; ok("FIXTURE noReserve: available and its median at or above the reserve median recommends no reserve, with 5 of 11", L.recommended === "noReserve" && n.available && L.reason === "No reserve: cars of this model sold without one made as much or more, 5 of 11." && n.line === "No reserve: cars sold without one made a median $40,000 against $36,000 with a reserve, from 5 no-reserve sales.", J([L.recommended, L.reason, n.line]));
  ok("FIXTURE noReserve: equal medians also recommend it (at or above)", run(TIGHT, rmode(5, 36000, 6, 36000)).recommended === "noReserve"); }
{ const L = run(TIGHT, rmode(5, 30000, 6, 36000)); ok("FIXTURE noReserve lower than the reserve median: not recommended", L.recommended !== "noReserve" && L.rungs[3].available === true); }
{ const L = run(TIGHT, rmode(4, 99000, 6, 36000)), n = L.rungs[3]; ok("FIXTURE noReserve under the minimum: unavailable, medians null, the table's line, and never recommended even with a higher median", n.available === false && n.noReserveMedian === null && n.reserveMedian === null && n.noReserveCount === 4 && n.line === "Too few no-reserve sales of this car to say." && L.recommended !== "noReserve", J(n)); }
{ const L = run(FEW.slice(0, 4)); ok("FIXTURE thin: four sales is under the minimum: thin, every rung unavailable, nothing recommended", L.thin === true && L.rungs.every(r => r.available === false) && L.recommended === null && L.reason === null && L.rungs.length === 4); }
{ const e = ev(TIGHT), L = DV.reserveLadderOf({ sales: mk(TIGHT), evidence: { ...e, insufficient: true }, reserveStart: null, reserveMode: null }); ok("FIXTURE thin: no typical range (insufficient evidence) is thin too", L.thin === true && L.recommended === null); }
{ const e = ev([30000, 30000, 30000, 30000, 30000, 30000, 30000, 30000]), L = run([30000, 30000, 30000, 30000, 30000, 30000, 30000, 30000]); ok("FIXTURE equal prices: the rungs still rise in order and every figure is a price the sales can be counted against", L.rungs[0].figure < L.rungs[1].figure && L.rungs[1].figure < L.rungs[2].figure); }
// BY CONDITION, the unit (order bc85): a priced ladder and a thin one served from a fallback, the four tiers each, with the sentence of the order ("3 of 8 cleared it")
{ const EIGHT = [30000, 31000, 33000, 34000, 36000, 38000, 40000, 44000], L8 = run(EIGHT), thinL = { ...L8, thin: true, fallbackView: "0:12" }, FIX = { 1: "ambitious", 2: "balanced", 3: "balanced", 4: "safe" }, WORD = { ambitious: "higher", balanced: "middle", safe: "lower" }, NM = { 1: "Concours", 2: "Excellent", 3: "Good", 4: "Fair" };
  const P = DV.byConditionOf(L8), T = DV.byConditionOf(thinL), amb = L8.rungs[2], N = DV.byConditionOf({ ...L8, thin: true, fallbackView: null }), NONE = DV.byConditionOf(null);
  ok("BYCONDITION priced: every tier points at the ladder's recommended rung and reason", [1, 2, 3, 4].every(t => P[t].key === L8.recommended && P[t].reason === L8.reason && P[t].of === 8), J(P[1]));
  ok("BYCONDITION thin, served: Concours ambitious, Excellent balanced, Good balanced, Fair safe", [1, 2, 3, 4].every(t => T[t].key === FIX[t]), J([1, 2, 3, 4].map(t => T[t].key)));
  ok("BYCONDITION thin, served: Concours reads 'too few Concours sales ... the higher rung of all 8 sales, N of 8 cleared it.'", T[1].reason === `Concours: too few Concours sales to price on their own, so the reserve takes the higher rung of all 8 sales, ${amb.cleared} of 8 cleared it.` && T[1].cleared === amb.cleared && T[1].of === 8, T[1].reason);
  ok("BYCONDITION thin, served: each tier's count is its own rung's", [1, 2, 3, 4].every(t => { const r = L8.rungs.find(x => x.key === FIX[t]); return T[t].cleared === r.cleared && T[t].reason === `${NM[t]}: too few ${NM[t]} sales to price on their own, so the reserve takes the ${WORD[FIX[t]]} rung of all 8 sales, ${r.cleared} of 8 cleared it.`; }));
  ok("BYCONDITION thin with no fallback, or no ladder: no rung, no reason", [1, 2, 3, 4].every(t => N[t].key === null && N[t].reason === null && NONE[t].key === null && NONE[t].reason === null));
  ok("BYCONDITION thin tiers: every sentence is the table's and carries no dash", [1, 2, 3, 4].every(t => RW.reasonPatterns().some(p => p.id === "desk4.ladder_cond_thin" && p.re.test(T[t].reason)) && !/[\u2013\u2014]/.test(T[t].reason))); }
// BY CONDITION, THE FIREBIRD (order bc85, Nov 16 2026): nine sales, no condition set, every tier's own view thin. The all-conditions ladder prices; the four tiers must NOT all read its one recommendation.
{ const NINE = [18000, 19500, 21000, 22500, 24000, 26000, 28500, 31000, 36000], L9 = run(NINE), thinOf = () => ({ ...L9, thin: true, fallbackView: "0:12" }), FIXK = ["ambitious", "balanced", "balanced", "safe"], NM = ["Concours", "Excellent", "Good", "Fair"];
  const blocks = () => ({ "0:12": { reserveLadder: L9 }, "1:12": { reserveLadder: thinOf() }, "2:12": { reserveLadder: thinOf() }, "3:12": { reserveLadder: thinOf() }, "4:12": { reserveLadder: thinOf() } });
  const B = DV.ownByCondition(blocks()), k = t => B["0:12"].reserveLadder.byCondition[t];
  ok("FIREBIRD, condition unset, all four tiers thin: Concours ambitious, Excellent balanced, Good balanced, Fair safe (not four copies of one rung)", [1, 2, 3, 4].every(t => k(t).key === FIXK[t - 1]) && new Set([1, 2, 3, 4].map(t => k(t).key)).size === 3, J([1, 2, 3, 4].map(t => k(t).key)));
  ok("FIREBIRD: the four reasons are four different sentences, each naming its tier and counting its own rung of the 9 sales", new Set([1, 2, 3, 4].map(t => k(t).reason)).size === 4 && [1, 2, 3, 4].every(t => { const r = L9.rungs.find(x => x.key === FIXK[t - 1]); return k(t).reason.startsWith(NM[t - 1] + ":") && k(t).of === 9 && k(t).cleared === r.cleared; }), J([1, 2, 3, 4].map(t => k(t).reason)));
  ok("FIREBIRD: every view of the period carries the same four (a tier view reads the same tiers as the all-conditions view)", ["1:12", "2:12", "3:12", "4:12"].every(v => J(B[v].reserveLadder.byCondition) === J(B["0:12"].reserveLadder.byCondition)));
  const b2 = blocks(); b2["3:12"] = { reserveLadder: run(WIDE) }; const C = DV.ownByCondition(b2), c3 = C["0:12"].reserveLadder.byCondition;
  ok("FIREBIRD, Good prices on its own view: Good takes ITS OWN recommended rung and reason, the three thin tiers keep the mapping", c3[3].key === "safe" && c3[3].reason === b2["3:12"].reserveLadder.reason && c3[3].of === 12 && c3[1].key === "ambitious" && c3[2].key === "balanced" && c3[4].key === "safe" && /^Concours: too few/.test(c3[1].reason), J(c3));
  const b3 = blocks(); b3["1:6"] = { reserveLadder: run(TIGHT) }; b3["0:6"] = { reserveLadder: run(TIGHT) }; const D2 = DV.ownByCondition(b3);
  ok("FIREBIRD: a period reads its OWN period's views (the 6 month view never reads the 12 month tiers)", D2["0:6"].reserveLadder.byCondition[1].key === run(TIGHT).recommended && D2["0:6"].reserveLadder.byCondition[1].of === 12 && D2["0:6"].reserveLadder.byCondition[2].of === 12 && D2["0:6"].reserveLadder.byCondition[2].key === "balanced" && D2["0:12"].reserveLadder.byCondition[1].of === 9 && D2["0:12"].reserveLadder.byCondition[1].key === "ambitious", J([D2["0:6"].reserveLadder.byCondition[1], D2["0:12"].reserveLadder.byCondition[1]]));
  const E = DV.ownByCondition(blocks(), true), e = E["0:12"].reserveLadder.byCondition;
  ok("FIREBIRD, no sale carries a condition (noTiers): the thin mapping for every tier, never one rung for all", [1, 2, 3, 4].every(t => e[t].key === FIXK[t - 1]), J([1, 2, 3, 4].map(t => e[t].key)));
  const F = DV.ownByCondition({ "0:12": { reserveLadder: run(FEW.slice(0, 4)) }, "1:12": { reserveLadder: run(FEW.slice(0, 4)) } }), f = F["0:12"].reserveLadder.byCondition;
  ok("FIREBIRD, the all-conditions ladder is thin too: no rung and no reason for any tier", [1, 2, 3, 4].every(t => f[t].key === null && f[t].reason === null)); }
// A THIN TIER VIEW OVER A THIN ALL-CONDITIONS VIEW IS NEVER AN EMPTY POOL (order bc85, Nov 16 2026, the stored 2006 911 case 4254dc24: the Excellent view had 0 sales, the all-conditions view of the same period 4, under the ladder's 5, so nothing was served and the case read count 0 over 15 comparables none of them in the population, marked empty_pool, and no Retry could cure it).
// CAUSE: deskBlock served a thin tier view from the all-conditions view only when THAT view priced; a 3 or 4 sale all-conditions view was dropped. Now it is served whole (sales, evidence, comparables, marked servedFrom) with the ladder thin and the table's line.
{ const when = "2026-11-14", at = m => DV.cutoffOf(when, m), r = (i, price, inPop) => ({ id: "t" + i, price, date: at(1 + i), year: 2006, generation: "997", body: "Coupe", gearbox: "manual", gearboxWord: "Manual", miles: 38000 + i * 900, platform: "Bring a Trailer", title: "2006 Porsche 911 Carrera", inPopulation: inPop, tier: 3 });
  const four = [0, 1, 2, 3].map(i => r(i, 40000 + i * 3000, true)), tierRows = four.map(x => ({ ...x, inPopulation: false })), sf = { generation: "997", year: 2006, body: "Coupe", gearbox: "manual", miles: 38000 };
  const b = await DV.deskBlock(tierRows, { caseDate: when, windowMonths: 12, tier: 2, tierName: "Excellent", subjectFacts: sf, subject: { tierName: "Excellent", transmission: "Manual" }, fallback: () => ({ rows: four, desk: { caseDate: when, windowMonths: 12, subjectFacts: sf, subject: { transmission: "Manual" } } }) }, null);
  ok("EMPTY POOL: a tier with 0 sales over an all-conditions view of 4 serves those 4 (count, list, comparables), marked servedFrom 0:12", b.servedFrom === "0:12" && b.evidence.count === 4 && b.sales.length === 4 && b.evidence.servedFrom === "0:12" && b.comparables.length > 0, J([b.servedFrom, b.evidence.count, b.sales.length, b.comparables.length]));
  ok("EMPTY POOL: the ladder is thin (no priced rung, no recommendation) and says the table's line, naming the fallback", b.reserveLadder.thin === true && b.reserveLadder.recommended === null && b.reserveLadder.fallbackView === "0:12" && b.reserveLadder.thinLine === "Too few sales of this car in this period to set a reserve." && b.reserveLadder.rungs.every(x => x.available === false), J([b.reserveLadder.thin, b.reserveLadder.recommended, b.reserveLadder.thinLine]));
  ok("EMPTY POOL: byCondition names no rung for a ladder that prices nothing", [1, 2, 3, 4].every(t => b.reserveLadder.byCondition[t].key === null));
  const two = four.slice(0, 2), b2 = await DV.deskBlock(two.map(x => ({ ...x, inPopulation: false })), { caseDate: when, windowMonths: 12, tier: 2, tierName: "Excellent", subjectFacts: sf, subject: { tierName: "Excellent", transmission: "Manual" }, fallback: () => ({ rows: two, desk: { caseDate: when, windowMonths: 12, subjectFacts: sf, subject: { transmission: "Manual" } } }) }, null);
  ok("EMPTY POOL: an all-conditions view under the Desk minimum (2 sales) is not served (nothing to show, the table's line)", b2.servedFrom === null && b2.reserveLadder.thin === true && b2.evidence.count === 0, J([b2.servedFrom, b2.evidence.count])); }
// A CAR WHOSE BODY IS NOT STATED (a VIN that decodes with no body, no trim) IS PRICED ON THE GENERATION AND THE GEARBOX AND SAYS SO, never an empty pool (order bc85)
{ const car = { n: 201, year: 2006, make: "Porsche", model: "911", typedBody: "Coupe", read: true, c12: 7, c24: 12, m12: 7, m24: 12, range12: [40000, 62000], rmodel: "911", rtrim: "Carrera" }, wv = WLD.install(ROOT, { cars: [car] }), V = await imp("lib/vehicle.js"), VA = await imp("lib/vinAsTyped.js");
  const deps = (bodyStyle) => ({ ...wv.deps, decodeVin: async () => ({ readable: true, year: 2006, make: "Porsche", model: "911", trim: null, bodyStyle }), vinPlan: VA.vinSearchPlan, resolveVehicle: V.resolveVehicle, archiveMatch: async () => null, liveMatch: async () => null });
  const rd = async (input, bodyStyle) => (await S.sheetRead(wv.env, { vin: "WP0AA29966S715747", mileage: 38000, ...input, desk: { caseDate: today, transmission: "Manual", label: "2006 Porsche 911", case: { verification: {} }, exclusions: [], head, views: true, windowMonths: 12 } }, deps(bodyStyle))).desk;
  const nb = await rd({}, null), wb = await rd({}, "coupe");
  ok("NO BODY, NO TRIM (VIN decodes to '2006 Porsche 911' alone): the pool is not empty, it is the generation's manuals", nb && nb.evidence.count >= LADDER.minSales && nb.sales.length === nb.evidence.count && nb.specLine === "997 \u00b7 Manual \u00b7 38,000 miles", J(nb && [nb.evidence.count, nb.specLine]));
  ok("NO BODY, NO TRIM: it says so ('Priced on 997 manuals, body not stated.')", nb.bodyNote === "Priced on 997 manuals, body not stated.", nb.bodyNote);
  ok("NO BODY: every view of the answer reads a pool, none is empty at its period with sales in the archive", Object.keys(nb.views).filter(k => /^0:/.test(k)).every(k => DV.viewOf(nb, k).evidence.count > 0 || /^0:(3|6)$/.test(k)), Object.keys(nb.views).filter(k => /^0:/.test(k)).map(k => k + "=" + DV.viewOf(nb, k).evidence.count).join(" "));
  ok("A BODY THE VIN STATES is read as before and carries no body note", wb && !wb.bodyNote && wb.evidence.count >= LADDER.minSales && /Coupe/.test(wb.specLine), J(wb && [wb.bodyNote, wb.specLine, wb.evidence.count]));
  const tr = await rd({ trim: "Carrera", bodyStyle: "Coupe" }, null);
  ok("THE CASE'S OWN REQUEST (VIN, trim Carrera and body Coupe from the last listing, a condition view): a read, never an empty population", tr && tr.evidence.count > 0 && tr.sales.length === tr.evidence.count, J(tr && [tr.evidence.count]));
  const tier2 = (await S.sheetRead(wv.env, { vin: "WP0AA29966S715747", mileage: 38000, tier: 2, trim: "Carrera", bodyStyle: "Coupe", desk: { caseDate: today, transmission: "Manual", label: "x", case: { verification: {} }, exclusions: [], head, windowMonths: 12 } }, deps(null))).desk;
  ok("A CONDITION VIEW WITH NO SALES OF ITS OWN is served from the all-conditions sales, never count 0 over listed comparables", tier2 && (tier2.evidence.count > 0 || tier2.comparables.length === 0), J(tier2 && [tier2.evidence.count, tier2.comparables.length, tier2.servedFrom])); }
// the pages and the model compute none of it
{ const bad = []; for (const f of ["public/js/desk.js", "public/desk.html", "lib/desk/caseView.js", "lib/desk/reportState.js", "lib/desk/caseWorkflow.js", "lib/desk/reportPdfV3.js"]) { let s = ""; try { s = fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { continue; } if (/reserveLadder\s*=\s*\{|\.rungs\s*=\s*\[|ambitious\s*[:=]\s*[\d(]|byCondition\s*=\s*\{|CONDITION_RUNG|byConditionOf/.test(s)) bad.push(f); }
  ok("no page file or workflow builds the ladder (the engine is its one source)", !bad.length, bad.join(" ")); }
console.log(`deskLadderCheck: ${pass} passed, ${fail} failed (${views} views: ${liveViews} priced, ${thinViews} thin, ${served} served from a fallback)`);
process.exit(fail ? 1 : 0);
