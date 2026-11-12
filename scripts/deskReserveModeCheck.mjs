// clock: real-ok the fixture sales are dated relative to now (days ago); no calendar date is asserted (Lane B, Nov 2026)
// DESK RESERVE MODE (Lane B, Nov 11 2026). desk.reserveMode answers "reserve or no reserve" for the case's own pool. This check reads the 24 older cars (Lane F's recorded sweep rebuilt as an archive, scripts/_deskOlderWorld.mjs) and the demo 1999 911 (scripts/_deskV3World.mjs)
// through the real engine path and the real sheetRead, six scenarios dealt over the pool each car's own read returns: no reserve leads, reserve leads, flat, a thin no-reserve side, a venue that never says (Cars & Bids null), and a median that
// says one side while the share sold says the other. Each answer is held against an oracle written here from the engine's own window pool (desk.sales) and the flags this check dealt:
//   (1) the partition: every sale of the window pool is counted once, with a reserve, with none, or unflagged; a sale of a venue that never says is on neither side and the line names the venue
//   (2) the rule: a recommendation only when both sides hold 5 outcomes (sales plus reserve-not-met auctions) and the median differs by 10 percent or the share sold by 10 points; the two disagreeing is unclear; a thin side is unclear with thin true and the thinLine "Not enough no-reserve sales of this car to say."
//   (3) the figures: counts, shares sold, medians equal the oracle's
//   (4) the words: every sentence is lib/reasonWords.js and every money figure goes through it (reasonMode source holds no sentence and no money formatting of its own)
//   (5) where the flag comes from and who carries it: has_reserve of the OldCarsData record via scripts/ingest.js; the venues are read from the pool; the unsold half is auction_attempts (five venues)
//   node scripts/deskReserveModeCheck.mjs [root]     --mutants proves each rule by breaking it in a copy
import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath, pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url)), args = process.argv.slice(2), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) {
  const DV = "lib/deskV3.js", OB = "lib/onebox.js", RW = "lib/reasonWords.js";
  const muts = [
    [DV, "if (thinRes || thinNo) return thin(", "if (false) return thin(", "a recommendation on thin data"],
    [DV, 'return { ...base, recommendation: lead, line: reasonLine(lead === "no_reserve" ? "desk4.rmode_lead_no_reserve" : "desk4.rmode_lead_reserve", { why: parts.join(" and ") }), thin: false, thinLine: null };', 'return { ...base, recommendation: lead, line: `Go with ${lead === "no_reserve" ? "no reserve" : "a reserve"}: ${parts.join(" and ")}.`, thin: false, thinLine: null };', "a page-worded line"],
    [DV, 'parts.push(reasonLine("desk4.rmode_gap_median", { hi: hi.median, lo: lo.median }));', 'parts.push("a median of $" + hi.median.toLocaleString("en-US") + " against $" + lo.median.toLocaleString("en-US"));', "money formatted outside moneyWords"],
    [DV, "? null : rmodeFlag(r.reserve);", "? null : rmodeFlag(r.reserve) === true;", "a venue without the flag counted as no reserve"],
    [DV, "med.gap >= RMODE_MEDIAN_GAP_PCT ? med.lead : null", "med.gap > 0 ? med.lead : null", "no margin on the median"],
    [DV, "if (medSide && shrSide && medSide !== shrSide) return", "if (false) return", "a median and a share that disagree still recommend"],
    [DV, "S[f].unsold++; }", "}", "the unsold auctions are ignored"],
    [DV, "const win = inWindow(pop, when, months).filter(r => Number(r.price) > 0);", "const win = (pop || []).filter(r => Number(r.price) > 0);", "sales outside the window counted"],
    [OB, "reserve: r.has_reserve === true || r.has_reserve === \"true\" ? true :", "reserve: null, _x: r.has_reserve === true || r.has_reserve === \"true\" ? true :", "the flag never reaches the Desk rows"],
    [RW, "do not show a clear difference, so there is no recommendation (", "point to different sides, so the sales do not separate reserve from no reserve (", "the unclear line is in the old words"],
    [RW, "so they are in neither count.", "so they count for neither side.", "the unflagged line is in the old words"],
    [RW, "to say (${p.res} reserve and ${p.nores} no-reserve outcomes, and each side needs at least ${p.min}).` },\n  \"desk4.rmode_thin_reserve\"", "to say.` },\n  \"desk4.rmode_thin_reserve\"", "the thin line drops its counts"],
    [DV, "RMODE_MIN = 5,", "RMODE_MIN = 2,", "the outcome minimum is lowered"],
    [DV, 'export const RMODE_FEED_DEFAULT_VENUES = ["acc", "bonhams", "broadarrow", "mecum", "themarket"];', "export const RMODE_FEED_DEFAULT_VENUES = [];", "a venue with a one-sided feed flag is counted"],
    [DV, "return t > min && (x.reserve_true === t || x.reserve_false === t);", "return t > 0 && (x.reserve_true === t || x.reserve_false === t);", "the 500-sale floor of the one-sided rule is dropped"],
    [DV, "(x.reserve_true === t || x.reserve_false === t)", "(x.reserve_true >= t * 0.9 || x.reserve_false >= t * 0.9)", "a venue that is only mostly one-sided is treated as unflagged"],
    [DV, '["acc", "bonhams", "broadarrow", "mecum", "themarket"];', '["acc", "bonhams", "broadarrow", "mecum", "themarket", "barrettjackson"];', "Barrett-Jackson (99.4 percent, flag reported) is treated as unflagged"]
  ];
  let survivors = 0;
  for (const [file, from, to, want] of muts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drm-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, file), src = fs.readFileSync(fp, "utf8"), m = src.replace(from, to);
    if (m === src) { console.log(`MUTANT NOT APPLIED  ${want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, m);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/deskReserveModeCheck.mjs"), dir], { encoding: "utf8" }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); process.exit(survivors ? 1 : 0);
}
process.chdir(ROOT);
let pass = 0, fail = 0; const ok = (name, c, d) => { if (c) pass++; else { fail++; console.log("FAIL " + name + (d !== undefined ? " " + JSON.stringify(d) : "")); } };
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const RW = await imp("lib/reasonWords.js"), S = await imp("lib/sheetRead.js"), OLD = await imp("scripts/_deskOlderWorld.mjs"), V3 = await imp("scripts/_deskV3World.mjs");
console.error = () => {};
const today = new Date().toISOString().slice(0, 10), head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" }), DAY = 864e5;
const UNSOLD_SLUGS = ["bringatrailer", "carsandbids", "hagerty", "sothebysmotorsport", "mbmarket"], SLUG_OF = { "Bring a Trailer": "bringatrailer", "Cars & Bids": "carsandbids", "Bonhams": "bonhams", "Mecum": "mecum", "Broad Arrow": "broadarrow", "AllCollectorCars": "acc", "All Collector Cars": "acc", "The Market": "themarket", "themarket": "themarket" };
// the venues whose feed flag is a default (Lane C audit, Nov 11 2026): written here, not read from the engine
const FEED_DEFAULT = ["acc", "bonhams", "broadarrow", "mecum", "themarket"]; let defaultVenueCars = 0;
const med = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; if (n < 3) return null; const i = (n - 1) * 0.5, lo = Math.floor(i), hi = Math.ceil(i); return Math.round(s[lo] + (s[hi] - s[lo]) * (i - lo)); };
// the six scenarios: how the window pool's sales are flagged and priced. Prices are first equalised (the pool's median, spread 16 percent either way) so a gap is the scenario's and not the fixture's noise.
const SCEN = [
  { name: "no reserve leads", flag: (i, s) => i % 2 === 0, mul: f => (f ? 1 : 1.2), want: "no_reserve" },
  { name: "reserve leads", flag: (i, s) => i % 2 === 0, mul: f => (f ? 1.2 : 1), want: "reserve" },
  { name: "flat", flag: (i, s) => i % 2 === 0, mul: () => 1, want: "unclear" },
  { name: "thin no-reserve side", flag: (i, s) => i >= 4, mul: f => (f ? 1 : 1.5), want: "unclear" },
  { name: "a venue that never says", flag: (i, s) => (s.platform === "Cars & Bids" ? null : i % 2 === 0), mul: f => (f ? 1 : 1.2), want: null },
  { name: "a feed-default venue", flag: (i, s) => i % 2 === 0, mul: f => (f ? 1 : 1.2), venue: i => (i % 3 === 0 ? "All Collector Cars" : null), want: null },
  { name: "median and share disagree", flag: (i, s) => i % 2 === 0, mul: f => (f ? 1.2 : 1), unsold: 14, want: "unclear" }
];
// THE ANALYST'S WORDS (Nov 11 2026), written here and not read from the table: an unclear answer says it plainly and keeps the counts beside it; a thin side says which side and the counts; the unflagged line says the venues are in neither count.
const cnts = o => `${o.r.count} reserve and ${o.n.count} no-reserve outcomes`;
const PLAIN = {
  conflict: o => `Reserve and no-reserve sales of this car do not show a clear difference, so there is no recommendation (${cnts(o)}).`,
  thin: o => `Not enough ${o.n.count < 5 && o.r.count < 5 ? "reserve or no-reserve" : o.n.count < 5 ? "no-reserve" : "reserve"} sales of this car to say (${cnts(o)}, and each side needs at least 5).`,
  unflagged: (count, venues) => `${count} ${count === 1 ? "sale" : "sales"} from ${venues.length > 1 ? venues.slice(0, -1).join(", ") + " and " + venues[venues.length - 1] : venues[0]} have no reserve information we can rely on, so they are in neither count.`
};
const JARGON = /median and the share|point to different sides|separate reserve|flag we can read|count for neither side|\bunflagged\b|\bflag\b/i;
// the oracle, written here from the window pool the engine itself returned (desk.sales) and the flags dealt
function oracle(sales, flags, attempts, months) {
  const cut = (() => { const d = new Date(today + "T00:00:00Z"), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - months); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.toISOString().slice(0, 10); })();
  const side = { true: { p: [], cov: 0, un: 0 }, false: { p: [], cov: 0, un: 0 } }; let unflagged = 0; const venues = new Set();
  for (const s of sales) { const f = flags.get(String(s.id)); if (f === null || f === undefined || FEED_DEFAULT.includes(SLUG_OF[s.platform] || "")) { unflagged++; if (s.platform) venues.add(s.platform); continue; } side[f].p.push(s.price); if (UNSOLD_SLUGS.includes(SLUG_OF[s.platform] || "")) side[f].cov++; }
  for (const a of attempts) { const d = String(a.attempt_date).slice(0, 10); if (d >= cut && d <= today && (a.has_reserve === true || a.has_reserve === false)) side[a.has_reserve].un++; }
  const mk = f => { const x = side[f], t = x.cov + x.un; return { count: x.p.length + x.un, sold: x.p.length, median: med(x.p), share: t > 0 ? Math.round(x.cov / t * 100) : null }; };
  const r = mk(true), n = mk(false); let rec = "unclear", thin = false, thinKey = null, why = null;
  if (r.count < 5 || n.count < 5) { thin = true; thinKey = r.count < 5 && n.count < 5 ? "desk4.rmode_thin_both" : n.count < 5 ? "desk4.rmode_thin_no_reserve" : "desk4.rmode_thin_reserve"; }
  else {
    const mg = r.median != null && n.median != null ? { g: Math.abs(r.median - n.median) / Math.min(r.median, n.median) * 100, lead: n.median > r.median ? "no_reserve" : "reserve" } : null, sg = r.share != null && n.share != null ? { g: Math.abs(r.share - n.share), lead: n.share > r.share ? "no_reserve" : "reserve" } : null;
    const ms = mg && mg.g >= 10 ? mg.lead : null, ss = sg && sg.g >= 10 ? sg.lead : null;
    if (ms && ss && ms !== ss) why = "conflict"; else if (ms || ss) rec = ms || ss; else why = "flat";
  }
  return { r, n, rec, thin, thinKey, why, unflagged, venues: [...venues].sort() };
}
// reading one car: one read to learn the window pool, the flags dealt over it, then the read that is held against the oracle
async function dealAndRead({ read, rowsOf, attemptsSink, key }) {
  const first = await read(); const d1 = first && first.desk; if (!d1 || !d1.evidence) return { refused: true };
  const pool = d1.sales.map(s => ({ id: s.id, price: s.price, platform: s.platform })), byId = new Map(rowsOf().map(r => [String(r.id), r]));
  const base = med(pool.map(s => s.price)) || Math.round(pool.reduce((a, s) => a + s.price, 0) / Math.max(1, pool.length)) || 30000, out = [];
  for (const [si, sc] of SCEN.entries()) {
    const flags = new Map();
    pool.forEach((s, i) => { const row = byId.get(String(s.id)); if (!row) return; if (row._plat === undefined) row._plat = row.platform; row.platform = (sc.venue && sc.venue(i)) || row._plat; const f = sc.flag(i, s); flags.set(String(s.id), f); row.has_reserve = f; row.sale_price = Math.round(base * (1 + 0.08 * ((i % 5) - 2)) * sc.mul(f === true)); });
    const attempts = sc.unsold ? Array.from({ length: sc.unsold }, (_, k) => ({ attempt_date: new Date(Date.now() - (20 + k * 5) * DAY).toISOString().slice(0, 10), has_reserve: true, source_slug: "bringatrailer", year: 2000 })) : [];
    attemptsSink.set(key, attempts);
    const r = await read(), d = r && r.desk; if (!d || !d.evidence) { out.push({ sc, refused: true, why: r ? (r.retry ? "retry" : JSON.stringify({ desk: !!r.desk, ev: !!(r.desk && r.desk.evidence), keys: r.desk ? Object.keys(r.desk).slice(0, 6) : null, top: Object.keys(r).slice(0, 8) })) : "null" }); continue; }
    const sales = d.sales.map(s => ({ id: s.id, price: s.price, platform: s.platform })), o = oracle(sales, flags, attempts, d.evidence.windowMonths || (d.reserveMode && d.reserveMode.windowMonths) || 12);
    if (sc.name === "a feed-default venue" && sales.some(x => FEED_DEFAULT.includes(SLUG_OF[x.platform] || ""))) defaultVenueCars++;
    out.push({ sc, d, rm: d.reserveMode, o, N: sales.length });
  }
  return { out, N: pool.length };
}
function hold(tag, x) {
  const { sc, rm, o, d } = x; if (!rm) { ok(`${tag} ${sc.name}: desk.reserveMode is present`, false); return; }
  ok(`${tag} ${sc.name}: the block has recommendation, line, withReserve, noReserve, thin, thinLine`, ["reserve", "no_reserve", "unclear"].includes(rm.recommendation) && typeof rm.line === "string" && rm.line.length > 0 && rm.withReserve && rm.noReserve && typeof rm.thin === "boolean" && "thinLine" in rm && ["count", "soldShare", "medianLine"].every(k => k in rm.withReserve && k in rm.noReserve), Object.keys(rm));
  ok(`${tag} ${sc.name}: every sale of the window pool is counted once (partition)`, rm.withReserve.sold + rm.noReserve.sold + rm.unflagged.count === d.sales.length, [rm.withReserve.sold, rm.noReserve.sold, rm.unflagged.count, d.sales.length]);
  ok(`${tag} ${sc.name}: counts equal the oracle (with ${o.r.count}, none ${o.n.count})`, rm.withReserve.count === o.r.count && rm.noReserve.count === o.n.count, [rm.withReserve.count, rm.noReserve.count]);
  ok(`${tag} ${sc.name}: shares sold and medians equal the oracle`, rm.withReserve.soldShare === o.r.share && rm.noReserve.soldShare === o.n.share && (rm.withReserve.medianLine === (o.r.median == null ? null : RW.reasonLine("desk4.rmode_median", { median: o.r.median }))) && (rm.noReserve.medianLine === (o.n.median == null ? null : RW.reasonLine("desk4.rmode_median", { median: o.n.median }))), { got: [rm.withReserve.soldShare, rm.noReserve.soldShare, rm.withReserve.medianLine, rm.noReserve.medianLine], want: [o.r.share, o.n.share, o.r.median, o.n.median] });
  ok(`${tag} ${sc.name}: recommendation ${o.rec}${o.thin ? " (thin)" : o.why ? " (" + o.why + ")" : ""}`, rm.recommendation === o.rec && rm.thin === o.thin, [rm.recommendation, rm.thin, rm.line]);
  if (o.thin) { ok(`${tag} ${sc.name}: thin data is unclear, thin true, and the thinLine says which side`, rm.recommendation === "unclear" && rm.thin === true && rm.thinLine === PLAIN.thin(o) && rm.line === rm.thinLine, [rm.thinLine, PLAIN.thin(o)]); if (o.thinKey === "desk4.rmode_thin_no_reserve") ok(`${tag} ${sc.name}: the no-reserve thinLine opens "Not enough no-reserve sales of this car to say" and keeps the counts`, rm.thinLine.startsWith("Not enough no-reserve sales of this car to say (") && rm.thinLine.includes(cnts(o)), rm.thinLine); }
  else ok(`${tag} ${sc.name}: not thin, no thinLine`, rm.thin === false && rm.thinLine === null);
  if (!o.thin) { const want = o.rec !== "unclear" ? RW.reasonLine(o.rec === "no_reserve" ? "desk4.rmode_lead_no_reserve" : "desk4.rmode_lead_reserve", { why: rm.line.replace(/^The sales of this car lead with (?:no reserve|a reserve): /, "").replace(/\.$/, "") }) : (o.why === "conflict" ? PLAIN.conflict(o) : null); if (want) ok(`${tag} ${sc.name}: the line is the plain sentence of the analyst, with the counts`, rm.line === want, rm.line);
    if (o.why === "flat") ok(`${tag} ${sc.name}: the flat line says there is no clear difference and no recommendation, with the counts`, new RegExp("^Reserve and no-reserve sales of this car do not show a clear difference, so there is no recommendation \\(" + cnts(o) + "; within \\d+ percent on the median and \\d+ points on the share sold\\)\\.$").test(rm.line), rm.line); }
  if (rm.recommendation === "unclear") ok(`${tag} ${sc.name}: an unclear line carries both counts beside the words`, rm.line.includes(cnts(o)) && !JARGON.test(rm.line), rm.line);
  ok(`${tag} ${sc.name}: unflagged ${o.unflagged} sales (${o.venues.join(", ") || "none"}), the line names them and says they are in neither count`, rm.unflagged.count === o.unflagged && (o.unflagged === 0 ? rm.unflagged.line === null : rm.unflagged.line === PLAIN.unflagged(o.unflagged, o.venues) && !JARGON.test(rm.unflagged.line) && o.venues.every(v => rm.unflagged.line.includes(v))), rm.unflagged);
  ok(`${tag} ${sc.name}: the line carries no word of its own (no page wording, no stray money)`, !/\bbest\b|\bworth\b|\bvaluation\b|\bwill\b/i.test(rm.line) && (rm.line.match(/\$[\d,]+/g) || []).every(m => rm.line.includes(m)), rm.line);
}
// ---- the 24 older cars
const w = OLD.install(ROOT), prevFetch = globalThis.fetch, ATT = new Map();
globalThis.fetch = async (url, init) => { const u = String(url); if (/\/auction_attempts/.test(u)) { const mk = /make=ilike\.([^&]+)/.exec(u); return new Response(JSON.stringify(ATT.get(mk ? decodeURIComponent(mk[1]) : "") || []), { status: 200 }); } return prevFetch(url, init); };
const cars = OLD.loadCars(ROOT); let strong = 0, total = 0; const byScen = SCEN.map(() => ({ asked: 0, hit: 0 }));
for (const c of cars) {
  const res = await dealAndRead({ read: () => S.sheetRead(w.env, { year: c.year, make: c.make, model: c.model, mileage: 60000, bodyStyle: c.typedBody || undefined, desk: { caseDate: today, transmission: "Manual", label: `${c.year} ${c.make} ${c.model}`, case: { verification: {} }, exclusions: [], head } }, w.deps).catch(() => null), rowsOf: () => w.DATA.get(c.rmodel) || [], attemptsSink: ATT, key: c.make });
  const tag = `#${c.n} ${c.year} ${c.make} ${c.model}`;
  if (res.refused) { ok(`${tag}: the Desk answers`, false); continue; }
  for (const x of res.out) { if (x.refused) { ok(`${tag} ${x.sc.name}: the Desk answers`, false, x.why); continue; } hold(tag, x); if (!x.rm) continue; total++; const si = SCEN.indexOf(x.sc); byScen[si].asked++;
    // the scenario's own intent, where the pool is big enough for it (an oracle alone could agree with a wrong rule)
    if (!x.o.thin && x.sc.want && x.sc.want !== "unclear") { ok(`${tag} ${x.sc.name}: intended outcome ${x.sc.want}`, x.rm.recommendation === x.sc.want, x.rm.line); byScen[si].hit++; strong++; }
    if (!x.o.thin && x.sc.name === "flat" && x.o.rec === "unclear") { ok(`${tag} flat: sales within the margin are unclear and not thin`, x.rm.recommendation === "unclear" && !x.rm.thin); byScen[si].hit++; }
    if (!x.o.thin && x.sc.name === "median and share disagree") { ok(`${tag} disagree: the two measures disagreeing is unclear`, x.rm.recommendation === "unclear" && x.o.why === "conflict", [x.rm.line, x.o.why]); byScen[si].hit++; }
    if (x.sc.name === "thin no-reserve side" && x.N >= 9) { ok(`${tag} thin side: four no-reserve sales say so, whatever the gap`, x.rm.thin === true && x.rm.thinLine === PLAIN.thin(x.o), x.rm.thinLine); byScen[si].hit++; }
    if (x.sc.name === "a feed-default venue" && x.o.unflagged > 0) { ok(`${tag} feed default: All Collector Cars says reserve on every sale, so its sales are on neither side and the line names it`, x.rm.unflagged.count === x.o.unflagged && x.rm.unflagged.venues.some(v => /All ?Collector ?Cars/i.test(v)), x.rm.unflagged); byScen[si].hit++; }
    if (x.sc.name === "a venue that never says" && x.o.unflagged > 0) { ok(`${tag} venue: Cars & Bids says nothing, so its sales are on neither side`, x.rm.unflagged.count === x.o.unflagged && x.rm.unflagged.venues.includes("Cars & Bids"), x.rm.unflagged); byScen[si].hit++; }
  }
}
for (const [si, b] of byScen.entries()) ok(`the world is big enough to exercise "${SCEN[si].name}" on at least 4 of the 24 older cars (${b.hit})`, b.hit >= 4, b);
// ---- the demo 1999 911 (the Desk v3 world)
{ const w3 = V3.install(), prev3 = globalThis.fetch, ATT3 = new Map(); globalThis.fetch = async (url, init) => { const u = String(url); if (/\/auction_attempts/.test(u)) return new Response(JSON.stringify(ATT3.get("Porsche") || []), { status: 200 }); return prev3(url, init); };
  const c = V3.CASES[0];
  const res = await dealAndRead({ read: () => S.sheetRead(w3.env, { year: c.year, make: c.make, model: c.model, mileage: 40000, desk: { caseDate: today, transmission: c.transmission, label: c.label } }, w3.deps).catch(() => null), rowsOf: () => w3.DATA.get("911") || [], attemptsSink: ATT3, key: "Porsche" });
  ok("the demo 996: the Desk answers", !res.refused);
  if (!res.refused) { for (const x of res.out) { if (x.refused) { ok(`demo 996 ${x.sc.name}: the Desk answers`, false); continue; } hold("demo 996", x); if (!x.rm) continue; if (!x.o.thin && x.sc.want && x.sc.want !== "unclear") ok(`demo 996 ${x.sc.name}: intended outcome ${x.sc.want}`, x.rm.recommendation === x.sc.want, x.rm.line); }
    ok("the demo 996 pool is deep enough to clear the five-outcome minimum on both sides (no reserve leads)", res.out[0].o.r.count >= 5 && res.out[0].o.n.count >= 5, [res.out[0].o.r.count, res.out[0].o.n.count]); } }
// ---- the words and the source of the flag
{ const src = fs.readFileSync("lib/deskV3.js", "utf8"), a = src.indexOf("export function reserveModeOf"), b = src.indexOf("export function reserveCheckOf"), fn = src.slice(a, b).split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n").replace(/reasonLine\(\s*"[^"]+"/g, "reasonLine(ID");
  ok("(4) reserveModeOf holds no sentence of its own: every string in it is a reason id or a key", !/["'`][^"'`\n]*[A-Za-z]{2,}[ ][A-Za-z]{2,}[ ][A-Za-z]{2,}[^"'`\n]*["'`]/.test(fn.replace(/\/\*[\s\S]*?\*\//g, "")), (fn.match(/["'`][^"'`\n]*[A-Za-z]{2,} [A-Za-z]{2,} [A-Za-z]{2,}[^"'`\n]*["'`]/) || [])[0]);
  ok("(4) reserveModeOf formats no money (no dollar sign, no toLocaleString)", !/\$\{|\$"|"\$|toLocaleString|\.toFixed/.test(fn.replace(/`[^`]*\$\{[^}]*\}[^`]*`/g, "")) , (fn.match(/toLocaleString|"\$|\.toFixed/) || [])[0]);
  const ids = [...fs.readFileSync("lib/reasonWords.js", "utf8").matchAll(/"(desk4\.rmode_[a-z_]+)"/g)].map(m => m[1]);
  ok("(4) the reason table holds the thirteen reserve-mode sentences, each with its field", ids.length === 13 && ids.every(i => /desk\.reserveMode/.test(fs.readFileSync("lib/reasonWords.js", "utf8").split("\n").find(l => l.includes(`"${i}"`)))), ids.length);
  const ing = fs.readFileSync("scripts/ingest.js", "utf8"), att = fs.readFileSync("scripts/ingestAttempts.js", "utf8");
  ok("(5) the flag is OldCarsData's has_reserve, stored by the ingest (toBool, null when the feed omits it) and by the attempts ingest", /has_reserve:\s*toBool\(r\.has_reserve\)/.test(ing) && /has_reserve:\s*toBool\(rec\.has_reserve\)/.test(att));
  ok("(5) the unsold half is the five venues the attempts ingest covers", ["bringatrailer", "carsandbids", "hagerty", "sothebysmotorsport", "mbmarket"].every(s => att.includes(`"${s}"`)) && /RMODE_UNSOLD_VENUES = \["bringatrailer", "carsandbids", "hagerty", "sothebysmotorsport", "mbmarket"\]/.test(src)); }
// ---- the feed-default rule: a venue with more than 500 sales, every one on the same side, is unflagged (Lane C's audit, Nov 11 2026)
{ const DV = await import(pathToFileURL(path.join(ROOT, "lib/deskV3.js")).href);
  ok("rule: oneSidedVenues is exported", typeof DV.oneSidedVenues === "function" && DV.RMODE_ONE_SIDED_MIN === 500);
  if (typeof DV.oneSidedVenues === "function") {
    // counts below are test inputs shaped like the audit's rows (the audit gave percentages, not counts)
    const aud = { bonhams: { reserve_true: 4000, reserve_false: 0 }, themarket: { reserve_true: 2000, reserve_false: 0 }, mecum: { reserve_true: 30000, reserve_false: 0 }, broadarrow: { reserve_true: 3000, reserve_false: 0 }, acc: { reserve_true: 5000, reserve_false: 0 }, barrettjackson: { reserve_true: 60, reserve_false: 9940 }, bringatrailer: { reserve_true: 90000, reserve_false: 60000 } };
    ok("rule: over the audit shape it names exactly Bonhams, The Market, Mecum, Broad Arrow and ACC", JSON.stringify(DV.oneSidedVenues(aud)) === JSON.stringify(FEED_DEFAULT), DV.oneSidedVenues(aud));
    ok("rule: the list the Desk holds is the rule's answer", JSON.stringify([...DV.RMODE_FEED_DEFAULT_VENUES].sort()) === JSON.stringify(DV.oneSidedVenues(aud)), DV.RMODE_FEED_DEFAULT_VENUES);
    ok("rule: exactly 500 sales is not more than 500", DV.oneSidedVenues({ v: { reserve_true: 500, reserve_false: 0 } }).length === 0 && DV.oneSidedVenues({ v: { reserve_true: 501, reserve_false: 0 } }).length === 1);
    ok("rule: 100 percent no reserve over 600 sales is one-sided too", DV.oneSidedVenues({ v: { reserve_true: 0, reserve_false: 600 } }).length === 1);
    ok("rule: one sale on the other side keeps a venue flagged (Barrett-Jackson at 99.4 percent)", DV.oneSidedVenues({ v: { reserve_true: 1, reserve_false: 5000 } }).length === 0); }
  const ops = fs.readFileSync(path.join(ROOT, "api/usageDashboard.js"), "utf8");
  ok("rule: the ops task reserveaudit prints the rule's answer beside the list the Desk holds", /oneSidedVenues\(bySource\)/.test(ops) && /listedInDesk/.test(ops));
  ok(`the 24 older cars reach a feed-default venue in their window pool on at least 3 cars (${defaultVenueCars})`, defaultVenueCars >= 3, defaultVenueCars); }
console.log(`deskReserveModeCheck: ${pass} passed, ${fail} failed (${total} reads of the 24 older cars)`); process.exit(fail ? 1 : 0);
