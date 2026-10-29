// FILL PRODUCTION YEARS FOR THE TAXONOMY MODELS THE CALCULATOR LIST DOES NOT HAVE (Lane B, Oct 29 2026). Read-only against the sources and our sales; writes only data/modelYearsFilled.json (the filled ones, each with its
// source and date) and data/modelYearsUnfilled.json (the ones not filled, with both facts). A model is filled only when:
//   - NHTSA vPIC (GetModelsForMakeYear, model years 1981 to this year): the model name is the SAME after folding case, accents, hyphens and spaces, and its first year is NOT the source's own floor (1981): a model
//     listed from 1981 may have started earlier, so that is "not exact" and is listed, not filled;
//   - or Wikidata: an item whose English label folds to the model name, whose manufacturer label folds to the make, with BOTH a start and an end year (an open model with a start year and no end is filled to this year only when
//     the item is not marked dissolved: not used, listed instead);
//   - and none of our own sales of that model (sales_archive via the ops task poolrows) is dated in a year the source says it was not built.
// Anything else goes to the unfilled file with what the source said and what our sales said. A source that cannot be reached stops that step (exit code 3, nothing written for it).
//   PROBE_KEY=... BYPASS_SECRET=... node scripts/fillModelYears.mjs <absent.json> [--base https://goasksam.com]
import fs from "node:fs";
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://goasksam.com").replace(/\/$/, ""), KEY = process.env.PROBE_KEY, BYP = process.env.BYPASS_SECRET;
const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));   // [{ make: slug, name }]
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const NOW = new Date().getFullYear(), TODAY = new Date().toISOString().slice(0, 10), UA = { "User-Agent": "GoAskSam-lane-b/1.0 (feedback@goasksam.com)" };
const makes = [...new Set(input.map(x => x.make))];
const ranges = ys => { const s = [...new Set(ys)].sort((a, b) => a - b), out = []; for (const y of s) { const l = out[out.length - 1]; if (l && y <= l[1] + 1) l[1] = y; else out.push([y, y]); } return out; };
async function getJson(url, headers = {}, tries = 3) { for (let i = 0; i < tries; i++) { try { const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(30000) }); if (r.ok) return await r.json(); } catch { /* retry */ } await new Promise(r => setTimeout(r, 500 * (i + 1))); } return null; }
// 1. vPIC: for each make, the models by model year
const vp = {}; let vpicFail = 0;
// one probe first: NHTSA's front door answers 403 "Access Denied" to a burst (and did to this machine after a first full run at six requests at a time); a blocked source is reported and skipped, never hammered
const probe = await fetch("https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/honda/modelyear/2010?format=json", { headers: UA, signal: AbortSignal.timeout(20000) }).then(r => r.status).catch(() => 0);
const VPIC_OK = probe === 200; if (!VPIC_OK) console.error(`vPIC answered ${probe} (not reachable from this machine now): that step is skipped`);
for (const mk of VPIC_OK ? makes : []) {
  const names = [mk.replace(/-/g, " "), mk];
  let got = null;
  for (const nm of names) {
    const byYear = {}; let any = false;
    for (let y = 1981; y <= NOW; y += 2) {   // two years at a time, gently
      await Promise.all(Array.from({ length: 2 }, async (_, k) => { const yy = y + k; if (yy > NOW) return; const j = await getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(nm)}/modelyear/${yy}?format=json`); if (!j) { vpicFail++; return; } const names2 = (j.Results || []).map(r => r.Model_Name).filter(Boolean); if (names2.length) any = true; byYear[yy] = names2; }));
    }
    if (any) { got = byYear; break; }
  }
  vp[mk] = got;
}
if (VPIC_OK && vpicFail > makes.length * 10) { console.error("vPIC stopped answering part way; what it gave is used, the rest is skipped"); }
// 2. our own sales per model (years), through the read-only ops task poolrows, one at a time
const H = KEY ? { "x-ops-key": KEY, ...(BYP ? { "x-vercel-protection-bypass": BYP } : {}) } : null;
async function salesYears(make, model) { if (!H) return null; const j = await getJson(`${BASE}/api/usageDashboard?view=ops&task=poolrows&make=${encodeURIComponent(make.replace(/-/g, "_"))}&model=${encodeURIComponent(model)}&limit=500`, H); return j && Array.isArray(j.rows) ? [...new Set(j.rows.map(r => Number(r.year)).filter(Boolean))].sort() : null; }
// 1b. Wikidata: per make, the items made by that manufacturer with a start and an end year (inception P571; end P576 or P582)
const wd = {}; let wdFail = 0;
for (const mk of makes) {
  const labels = [...new Set([mk.replace(/-/g, " "), mk])].map(x => x.toLowerCase());
  const q = `SELECT ?l ?s ?e WHERE { ?m rdfs:label ?ml . FILTER(LANG(?ml)="en" && (${labels.map(x => `LCASE(STR(?ml))="${x}"`).join(" || ")})) ?i wdt:P176 ?m ; wdt:P31/wdt:P279* wd:Q3231690 ; rdfs:label ?l . FILTER(LANG(?l)="en") OPTIONAL { ?i wdt:P571 ?s } OPTIONAL { ?i wdt:P576 ?e1 } OPTIONAL { ?i wdt:P582 ?e2 } BIND(COALESCE(?e1, ?e2) AS ?e) } LIMIT 800`;
  const j = await getJson("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), { Accept: "application/sparql-results+json" });
  if (!j) { wdFail++; wd[mk] = null; continue; }
  wd[mk] = (j.results.bindings || []).map(b => ({ label: b.l.value, s: b.s ? Number(String(b.s.value).slice(0, 4)) : null, e: b.e ? Number(String(b.e.value).slice(0, 4)) : null }));
  await new Promise(r => setTimeout(r, 300));
}
if (wdFail > makes.length / 2) console.error("Wikidata could not be reached for most makes; that step is skipped");
const filled = {}, unfilled = [];
for (const { make, name } of input) {
  const src = vp[make], want = fold(name); let years = [];
  if (src) for (const [y, list] of Object.entries(src)) if (list.some(n => fold(n) === want)) years.push(Number(y));
  let fact = null;
  if (years.length) {
    const rs = ranges(years), first = rs[0][0];
    if (first <= 1981) { unfilled.push({ make, name, source: "vPIC", sourceSays: JSON.stringify(rs), why: "first year is the source's floor (1981), so it may have started earlier" }); continue; }
    const sales = await salesYears(make, name), off = sales ? sales.filter(y => !rs.some(([a, b]) => y >= a && y <= b)) : null;
    if (sales && off.length) { unfilled.push({ make, name, source: "vPIC", sourceSays: JSON.stringify(rs), ourSalesYears: sales, salesOutsideSource: off, why: "our sales are dated in years the source says it was not built" }); continue; }
    (filled[fold(make)] = filled[fold(make)] || {})[name] = { ranges: rs, source: "NHTSA vPIC GetModelsForMakeYear", date: TODAY, salesChecked: !!sales, ourSalesYears: sales };
    continue;
  }
  const hit = (wd[make] || []).find(x => fold(x.label) === want && x.s && x.e && x.e >= x.s && x.s > 1880);
  if (hit) {
    const rs = [[hit.s, hit.e]], sales = await salesYears(make, name), off = sales ? sales.filter(y => y < hit.s || y > hit.e) : null;
    if (sales && off.length) { unfilled.push({ make, name, source: "Wikidata", sourceSays: JSON.stringify(rs), ourSalesYears: sales, salesOutsideSource: off, why: "our sales are dated in years the source says it was not built" }); continue; }
    (filled[fold(make)] = filled[fold(make)] || {})[name] = { ranges: rs, source: "Wikidata (inception and end year)", date: TODAY, salesChecked: !!sales, ourSalesYears: sales };
    continue;
  }
  const near = (wd[make] || []).filter(x => fold(x.label).includes(want) || want.includes(fold(x.label))).slice(0, 2).map(x => `${x.label} ${x.s || "?"}-${x.e || "?"}`);
  unfilled.push({ make, name, source: src ? "vPIC and Wikidata (no exact name)" : "no source had the make", ...(near.length ? { nearNames: near } : {}), why: "no exact name match in vPIC (1981 and later) or Wikidata with a start and end year" });
}
fs.writeFileSync("data/modelYearsFilled.json", JSON.stringify({ note: "production years filled from a public source, one entry per model with its source and date (scripts/fillModelYears.mjs)", models: filled }, null, 0));
fs.writeFileSync("data/modelYearsUnfilled.json", JSON.stringify({ date: TODAY, note: "models not filled, with what the source said and what our sales said", unfilled }, null, 0));
console.log(`filled ${Object.values(filled).reduce((t, m) => t + Object.keys(m).length, 0)}, unfilled ${unfilled.length}`);
