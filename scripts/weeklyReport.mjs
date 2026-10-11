// Weekly sales report (read-only). Prints items 1-8 plus the same-model pairs, for a
// reporting week and the prior week shown as a labelled reference, using the online-only
// platform rule (docs/weekly-report.md has the full field-by-field definitions).
//
// Usage:
//   BASE=https://goasksam.com PROBE_KEY=... node scripts/weeklyReport.mjs \
//     --from 2026-10-04 --to 2026-10-10 --lastFrom 2026-09-27 --lastTo 2026-10-03
//
// The key comes from the environment only and is never printed or logged. No writes, no
// free-form SQL: this script only calls the existing read-only ops tasks (task=weeklysales,
// task=vinhistory) and does every computation locally from the returned rows.

const BASE = (process.env.BASE || "https://goasksam.com").replace(/\/$/, "");
function probeKey() { return (process.env.PROBE_KEY || "").replace(/^["']|["']$/g, ""); }
const KEY = probeKey();
if (!KEY) { console.error("No PROBE_KEY in the environment."); process.exit(1); }

function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const FROM = arg("from"), TO = arg("to");
const LAST_FROM = arg("lastFrom"), LAST_TO = arg("lastTo");
if (!FROM || !TO || !LAST_FROM || !LAST_TO) {
  console.error("Usage: node scripts/weeklyReport.mjs --from YYYY-MM-DD --to YYYY-MM-DD --lastFrom YYYY-MM-DD --lastTo YYYY-MM-DD");
  process.exit(1);
}

const LIVE = new Set(["rmsothebys", "broadarrow", "gooding", "bonhams", "mecum", "barrettjackson"]);
const UNSURE = new Set(["sothebysmotorsport"]);

async function getTask(task, qs) {
  const url = `${BASE}/api/usageDashboard?view=ops&task=${task}&${qs}`;
  const res = await fetch(url, { headers: { "x-ops-key": KEY } });
  if (!res.ok) { console.error(`HTTP ${res.status} on task=${task}: ${(await res.text()).slice(0, 200)}`); process.exit(1); }
  const j = await res.json();
  if (j.error) { console.error(`ERROR on task=${task}:`, j.error); process.exit(1); }
  return j;
}

const usd = r => Number.isFinite(r.priceUsd) ? r.priceUsd : (Number.isFinite(r.price) ? r.price : null);
const online = rows => rows.filter(r => !LIVE.has(r.source) && !UNSURE.has(r.source) && Number.isFinite(usd(r)) && usd(r) > 0);
const unsureRows = rows => rows.filter(r => UNSURE.has(r.source) && Number.isFinite(usd(r)) && usd(r) > 0);
const liveRows = rows => rows.filter(r => LIVE.has(r.source));
const fmt$ = n => "$" + Math.round(n).toLocaleString();
const median = arr => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

function platformTotals(rows) {
  const by = new Map();
  for (const r of rows) { const k = r.source; if (!by.has(k)) by.set(k, { n: 0, money: 0 }); const v = by.get(k); v.n++; v.money += usd(r); }
  return [...by.entries()].sort((a, b) => b[1].money - a[1].money);
}

function printTable(title, rows2d) {
  console.log("\n" + title);
  console.log("-".repeat(title.length));
  for (const row of rows2d) console.log(row.join("  "));
}

function weekReport(label, rows) {
  const on = online(rows);
  const uns = unsureRows(rows);
  const liv = liveRows(rows);
  console.log(`\n================ ${label} ================`);

  // Item 1: totals
  const totalMoney = on.reduce((a, r) => a + usd(r), 0);
  printTable("ITEM 1: Totals (online platforms, published basis)", [
    ["Cars sold:", String(on.length)],
    ["Total $:", fmt$(totalMoney)],
    ["UNSURE (Sotheby's Motorsport), separate line:", `${uns.length} cars, ${fmt$(uns.reduce((a, r) => a + usd(r), 0))}`],
    ["Online + UNSURE combined (reference only):", `${on.length + uns.length} cars, ${fmt$(totalMoney + uns.reduce((a, r) => a + usd(r), 0))}`],
    ["Live-auction houses excluded from all figures above:", `${liv.length} cars, ${fmt$(liv.reduce((a, r) => a + (usd(r) || 0), 0))}`]
  ]);

  // Item 2: median
  printTable("ITEM 2: Median sale price (online platforms)", [["Median:", fmt$(median(on.map(usd)))]]);

  // Item 3: top 10
  const top10 = [...on].sort((a, b) => usd(b) - usd(a)).slice(0, 10);
  printTable("ITEM 3: Top 10 sales", top10.map((r, i) => [String(i + 1) + ".", fmt$(usd(r)), r.year || "", r.make || "", r.model || "", r.source, r.date]));

  // Item 4: top-10 share
  const top10Money = top10.reduce((a, r) => a + usd(r), 0);
  printTable("ITEM 4: Top 10 share of total $", [["Top 10 $:", fmt$(top10Money)], ["Share of total:", (top10Money / totalMoney * 100).toFixed(1) + "%"]]);

  // Item 5: platform totals
  printTable("ITEM 5: Platform totals (online, published basis)", platformTotals(on).map(([src, v]) => [src, String(v.n), fmt$(v.money)]));

  return { on, uns, liv };
}

function repeatSales(vh) {
  const curById = new Map(vh.current.map(c => [c.id, c]));
  const byCur = new Map();
  for (const h of vh.history) { if (!byCur.has(h.forId)) byCur.set(h.forId, []); byCur.get(h.forId).push(h); }
  const repeats = [];
  for (const [id, hist] of byCur) {
    const cur = curById.get(id);
    const priorSold = hist.filter(h => h.result === "sold" && !h.live && h.price).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!priorSold) continue;
    const pctChange = ((cur.price - priorSold.price) / priorSold.price) * 100;
    const monthsSince = (Date.parse(cur.date) - Date.parse(priorSold.date)) / (30.44 * 86400000);
    repeats.push({ vin: priorSold.vin, cur, priorSold, pctChange, monthsSince, make: priorSold.make });
  }
  return { repeats, byCur, curById };
}

function items678(vh) {
  const { repeats, byCur, curById } = repeatSales(vh);

  // Item 6
  const higher = repeats.filter(r => r.pctChange > 0).length, lower = repeats.filter(r => r.pctChange < 0).length, same = repeats.length - higher - lower;
  printTable("ITEM 6: Repeat sales (prior sold record on file, most recent prior sale counts)", [
    ["n:", String(repeats.length)],
    ["Higher:", String(higher)], ["Lower:", String(lower)], ["Unchanged:", String(same)],
    ["Typical % change (median):", median(repeats.map(r => r.pctChange)).toFixed(1) + "%"],
    ["Typical months since earlier sale (median):", median(repeats.map(r => r.monthsSince)).toFixed(1)]
  ]);
  const buckets = [["under 6mo", 0, 6], ["7-18mo", 7, 18], ["19-36mo", 19, 36], ["over 3yr", 36, Infinity]];
  printTable("ITEM 6 (time buckets)", buckets.map(([label, lo, hi]) => {
    const inB = repeats.filter(r => r.monthsSince >= lo && r.monthsSince <= hi);
    return [label + ":", "n=" + inB.length, inB.length ? "median=" + median(inB.map(r => r.pctChange)).toFixed(1) + "%" : "-"];
  }));

  // Item 7
  const prevUnsold = [];
  for (const [id, hist] of byCur) {
    const cur = curById.get(id);
    const priorNoSale = hist.filter(h => h.result !== "sold" && !h.live).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!priorNoSale) continue;
    const anySoldAfterNoSale = hist.some(h => h.result === "sold" && !h.live && h.date > priorNoSale.date);
    if (anySoldAfterNoSale) continue;
    prevUnsold.push({ cur, priorNoSale });
  }
  const withBid = prevUnsold.filter(r => r.priorNoSale.price);
  const beat = withBid.filter(r => r.cur.price > r.priorNoSale.price).length;
  printTable("ITEM 7: Previously unsold, sold this week", [
    ["n:", String(prevUnsold.length)],
    ["Beat their old high bid:", `${beat} of ${withBid.length} with a recorded high bid`]
  ]);
  printTable("ITEM 7 (full list)", prevUnsold.map(r => [
    "VIN " + (r.priorNoSale.vin || "?") + ":", "old high bid " + (r.priorNoSale.price != null ? fmt$(r.priorNoSale.price) : "?"),
    "on " + r.priorNoSale.date, "(" + r.priorNoSale.source + ", " + r.priorNoSale.result + ")",
    "-> this week " + fmt$(r.cur.price), "on " + r.cur.date, "(" + r.cur.source + ")"
  ]));

  // Item 8
  const moved = repeats.filter(r => r.priorSold.source !== r.cur.source);
  printTable("ITEM 8: Platform moved (prior sold elsewhere, now here)", [["n:", String(moved.length)]]);
  printTable("ITEM 8 (full list)", moved.map(r => [
    "VIN " + r.vin + ":", r.priorSold.source, fmt$(r.priorSold.price), "(" + r.priorSold.date + ")",
    "->", r.cur.source, fmt$(r.cur.price), "(" + r.cur.date + ")", "change=" + r.pctChange.toFixed(1) + "%"
  ]));
}

function item9pairs(rows) {
  const on = online(rows).filter(r => r.year && r.make && r.model && r.miles && Number.isFinite(usd(r)));
  const FILLER = /\b(\d{1,3}(?:,\d{3})*[- ]?mile[s]?|\d+k[- ]?mile[s]?|original[- ]?owner|one[- ]family[- ]owned|\d+[- ]years?[- ]owned|single[- ]family[- ]owned|family[- ]owned|low[- ]mile[s]?)\b/gi;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  function trimWords(r) {
    let t = String(r.title || "").toLowerCase().replace(FILLER, " ").replace(new RegExp(String(r.year), "g"), " ");
    for (const w of String(r.make || "").toLowerCase().split(/\s+/)) { const e = esc(w); if (e) t = t.replace(new RegExp("\\b" + e + "\\b", "g"), " "); }
    for (const w of String(r.model || "").toLowerCase().split(/\s+/)) { const e = esc(w); if (e) t = t.replace(new RegExp("\\b" + e + "\\b", "g"), " "); }
    return t.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }
  for (const r of on) r._trim = trimWords(r);
  const byKey = new Map();
  for (const r of on) { const k = `${r.year}|${r.make}|${r.model}`.toLowerCase(); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); }
  const pairs = [];
  for (const [, arr] of byKey) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      if (a._trim !== b._trim) continue;
      const dDays = Math.abs((Date.parse(a.date) - Date.parse(b.date)) / 86400000);
      if (dDays > 3) continue;
      const milesGap = Math.abs(a.miles - b.miles) / Math.min(a.miles, b.miles);
      if (milesGap > 0.25) continue;
      const pa = usd(a), pb = usd(b);
      const priceGap = Math.abs(pa - pb) / Math.min(pa, pb);
      if (priceGap < 0.25) continue;
      pairs.push({ a, b, milesGap, priceGap });
    }
  }
  pairs.sort((x, y) => x.milesGap - y.milesGap);
  printTable("ITEM 9: Same-model pairs (same year/make/model/trim words, miles within 25%, sold within 3 days, price at least 25% apart) - 5 closest by miles", [["Total qualifying pairs:", String(pairs.length)]]);
  for (const p of pairs.slice(0, 5)) {
    console.log(`  ${p.a.year} ${p.a.make} ${p.a.model} "${p.a._trim}"  ${p.a.miles} mi  ${p.a.source}  ${fmt$(usd(p.a))}  ${p.a.date}`);
    console.log(`    vs ${p.b.year} ${p.b.make} ${p.b.model} "${p.b._trim}"  ${p.b.miles} mi  ${p.b.source}  ${fmt$(usd(p.b))}  ${p.b.date}`);
    console.log(`    miles gap ${(p.milesGap * 100).toFixed(1)}%, price gap ${(p.priceGap * 100).toFixed(1)}%`);
  }
}

console.log(`Weekly sales report. Reporting week: ${FROM} to ${TO}. Prior week (reference only): ${LAST_FROM} to ${LAST_TO}.`);
console.log(`Platform rule: online platforms only. Live-auction houses excluded from every figure. Sotheby's Motorsport kept separate (UNSURE).`);

const thisWeek = await getTask("weeklysales", `from=${FROM}&to=${TO}`);
const lastWeek = await getTask("weeklysales", `from=${LAST_FROM}&to=${LAST_TO}`);

weekReport(`THIS WEEK: ${FROM} to ${TO}`, thisWeek.rows);
console.log("\n[Items 1-5 below are the prior week, shown as a labelled reference only - not mixed with this week's tables.]");
weekReport(`LAST WEEK (reference only): ${LAST_FROM} to ${LAST_TO}`, lastWeek.rows);

console.log(`\n================ THIS WEEK: items 6-8 (vinhistory, ${FROM} to ${TO}) ================`);
const vh = await getTask("vinhistory", `from=${FROM}&to=${TO}`);
console.log(`vinhistory bounds: vinsLookedUp=${vh.vinsLookedUp} (bound=${vh.vinsBound}) historyRows=${vh.historyRows} (bound=${vh.historyBound})`);
items678(vh);

console.log(`\n================ THIS WEEK: item 9 pairs ================`);
item9pairs(thisWeek.rows);

console.log("\nDone. Commit for this script and ops tasks: see docs/weekly-report.md.");
