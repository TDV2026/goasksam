// clock: real-ok the fixture sales are dated relative to now (days ago), no calendar date is asserted (Lane B, Nov 2026)
// CONDITION TIER POOL (Lane B, Nov 2026, Desk Valuations spec item 1). No database, no network: a fake PostgREST holds 60 sales, each with a tier. Must hold:
//  (1) refine.conditionTier returns tierPoolN = the answer's own pool rows of that tier, tierBandN after the mileage band, and startingFigure = the MEDIAN of that last pool;
//  (2) fewer than five in the pool: startingFigure null, tierPoolState "too_few", the line says so, the wider pool is still the answer's own;
//  (3) Untiered sales are in the wider pool (the base answer is unchanged) and in no same tier pool;
//  (4) NO TIER PASSED: no read names condition_tier, and the answer is the one a tier call is built on (every non-tier field equal), so existing answers are unchanged;
//  (5) a tier that cannot be read (the column is missing) says "unavailable" with no figure, never an empty pool that looks real; no assigned sale says "no_tier_data";
//  (6) the tier call does not move the stored answer: it keys and serves as the untiered answer (same requests for the pool).
//   node scripts/tierPoolCheck.mjs [repo root]        (a tree without the tier fields fails it)
import path from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const E = await import(pathToFileURL(path.join(ROOT, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const quiet = console.error; console.error = () => {};

const mk = i => {
  const raw = { id: "ocd" + i, title: `${1999 + (i % 5)} Porsche 911 Carrera ${i}`, featured_image_url: `https://img.example/${i}.jpg`, mileage: `${10000 + (i % 60) * 1500}`, body_style: "Coupe", modifications: null,
    currency: "USD", transmission: "Manual (6-Speed)", exterior_color: "Black", title_status: "Clean", url: `https://bat.example/${i}`, source_url: `https://src.example/${i}`, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
  return { id: "uuid-" + String(i).padStart(5, "0"), source_id: raw.id, sale_price: 30000 + (i % 40) * 700, sale_date: new Date(Date.now() - (5 + (i % 120)) * 864e5).toISOString().slice(0, 10), platform: "Bring a Trailer",
    listing_title: raw.title, year: 1999 + (i % 5), make: "Porsche", model: "911", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" };
};
const FIX = Array.from({ length: 240 }, (_, i) => mk(i));
// the tier of sale i: 1..4 in turn, every seventh Untiered (null), version stamped for all
let tierOf = i => (i % 7 === 0 ? null : 1 + (i % 4));
let tierColumnMissing = false, tierReads = 0, anyTierColumnInPoolRead = 0, assignedAll = true;
const jt = v => v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
const evalItem = (row, item) => { const ci = item.indexOf(":"); const hasAlias = ci > 0 && item[ci + 1] !== ":"; const alias = hasAlias ? item.slice(0, ci) : null; const expr = hasAlias ? item.slice(ci + 1) : item;
  if (expr.startsWith("raw_record->>")) return [alias || expr.slice(13), jt(row.raw_record[expr.slice(13)])]; const col = expr.replace(/::text$/, ""); return [alias || col, col in row ? row[col] : null]; };
const urls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const sel = u.searchParams.get("select") || ""; urls.push(String(url));
  if (!u.pathname.endsWith("/sales_archive")) return new Response("[]", { status: 200 });
  if (/condition_tier/.test(sel)) {
    tierReads++;
    if (tierColumnMissing) return new Response(JSON.stringify({ code: "42703", message: "column sales_archive.condition_tier does not exist" }), { status: 400 });
    const ids = (u.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean);
    return new Response(JSON.stringify(ids.map(id => { const i = Number(id.replace("uuid-", "")); return { id, condition_tier: tierOf(i), condition_version: assignedAll === "old" ? "ct1-20261105" : assignedAll ? "ct3-20261105" : null }; })), { status: 200 });
  }
  if (/condition_tier|condition_version/.test(url)) anyTierColumnInPoolRead++;
  if (u.searchParams.get("id") || /^model$/.test(sel)) return new Response(/^model$/.test(sel) ? JSON.stringify([{ model: "911" }, { model: "Cayman" }]) : "[]", { status: 200 });
  return new Response(JSON.stringify(FIX.map(r => Object.fromEntries(sel.split(",").map(it => evalItem(r, it))))), { status: 200 });
};
const env = { supabaseUrl: "https://fake.example", supabaseKey: "k", poolColumns: false };
const car = { year: 2001, make: "Porsche", model: "911", raw: "2001 Porsche 911", trim: "" };
const ask = refine => E.oneEngineAnswer(car, null, car.raw, { ...env, asked: 0, noStageLog: true }, refine).then(r => r.raw);
const idNum = r => Number(String(r.id).replace("uuid-", ""));
const med = a => { const v = [...a].sort((x, y) => x - y), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
const priceOf = r => Number(r._usd ?? r._allin ?? r._hammer);
const miOf = r => Number(String(r.mileage == null ? "" : r.mileage).replace(/[^\d]/g, "")) || 0;
const TIERKEYS = E.TIER_FIELDS || [];

// (4) no tier passed
urls.length = 0; const plain = await ask(null);
ok("(4) no tier passed: no read names condition_tier", tierReads === 0 && anyTierColumnInPoolRead === 0, `tier reads ${tierReads}`);
ok("the plain answer has a pool to cut (a result with rawPool rows that carry an id)", plain && Array.isArray(plain.rawPool) && plain.rawPool.length >= 20 && plain.rawPool.every(r => r.id), `tier=${plain && plain.tier}, pool ${plain && plain.rawPool && plain.rawPool.length}`);
const pool = (plain && plain.rawPool) || [];
const plainUrls = urls.length;

// (1) a tier
for (const t of [1, 2, 3, 4]) {
  const d = await ask({ conditionTier: t });
  const same = pool.filter(r => tierOf(idNum(r)) === t);
  ok(`(1) tier ${t}: tierPoolN is the pool rows of that tier`, d.tierPoolN === same.length && d.conditionTier === t, `got ${d.tierPoolN}, expected ${same.length}`);
  const ex = same.length >= 5 ? Math.round(med(same.map(priceOf))) : null;
  ok(`(1) tier ${t}: startingFigure is the median of the tier pool (null under five)`, d.startingFigure === ex && (same.length >= 5 ? d.tierPoolState === "ok" : d.tierPoolState === "too_few" && /Too few sales in this condition/.test(d.tierPoolLine || "")), `got ${d.startingFigure}, expected ${ex}, state ${d.tierPoolState}`);
  ok(`(3) tier ${t}: untiered sales are in the wider pool and in no tier pool`, d.tierUntieredN === pool.filter(r => tierOf(idNum(r)) == null).length && d.rawPool.length === pool.length && d.tierCounts && Object.values(d.tierCounts).reduce((a, b) => a + b, 0) + d.tierUntieredN === pool.length);
}
// mileage band: miTarget 40000 (a 10,000 mile band each side in the engine's small-band rule)
{ const d = await ask({ conditionTier: 2, miTarget: 40000 }), band = E.bandedRefine({ miTarget: 40000 });
  const inb = pool.filter(r => tierOf(idNum(r)) === 2 && miOf(r) >= band.miMin && miOf(r) <= band.miMax);
  ok("(1) tier and mileage band: tierBandN counts the tier pool inside the band, tierPoolN stays the whole tier pool", d.tierBandN === inb.length && d.tierPoolN === pool.filter(r => tierOf(idNum(r)) === 2).length && inb.length < d.tierPoolN, `band ${d.tierBandN} of ${d.tierPoolN}, expected ${inb.length}`);
  ok("... and the starting figure is the median of the pool after tier and band", d.startingFigure === (inb.length >= 5 ? Math.round(med(inb.map(priceOf))) : null), `got ${d.startingFigure}`);
  ok("... the comparables are those sales, newest read from the engine's own cards", Array.isArray(d.tierComparables) && d.tierComparables.length === inb.length && d.tierComparables.every(c => c.conditionTier === 2)); }
// (2) a thin tier: only the first four of tier 3 are assigned, the rest are other tiers
{ const keep = tierOf; tierOf = i => (i < 8 && i % 2 === 0 ? 3 : (i % 5 === 0 ? 1 : 2)); const d = await ask({ conditionTier: 3 });
  ok("(2) under five in the tier: no starting figure, 'Too few sales in this condition', the wider pool is still the answer", d.startingFigure === null && d.tierPoolState === "too_few" && /Too few sales in this condition/.test(d.tierPoolLine) && d.rawPool.length === pool.length, `n ${d.tierBandN}`); tierOf = keep; }
// (4) every non-tier field equals the plain answer
{ const d = await ask({ conditionTier: 1 }); const again = await ask(null); const noisy = Object.keys(plain).filter(k => JSON.stringify(plain[k]) !== JSON.stringify(again[k]));
  const strip = x => JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => !TIERKEYS.includes(k) && !noisy.includes(k) && k !== "latencyMs" && k !== "latency").sort()));
  const diff = Object.keys(plain).filter(k => !TIERKEYS.includes(k) && JSON.stringify(plain[k]) !== JSON.stringify(d[k]));
  ok("(4) a tier call changes no other field of the answer", strip(d) === strip(plain), diff.join(",")); }
// (5) unreadable / unassigned
tierColumnMissing = true; { const d = await ask({ conditionTier: 1 });
  ok("(5) the tier column cannot be read: 'unavailable', no figure, no counts", d.tierPoolState === "unavailable" && d.startingFigure === null && d.tierPoolN === null && d.tierBandN === null); } tierColumnMissing = false;
assignedAll = "old"; { const d = await ask({ conditionTier: 1 });
  ok("(5) rows still at the old tier version (ct1) are not assigned: no_tier_data, never a tier of the old rules", d.tierPoolState === "no_tier_data" && d.startingFigure === null, d.tierPoolState); }
assignedAll = false; { const d = await ask({ conditionTier: 1 });
  ok("(5) no sale assigned yet: 'no_tier_data', no figure", d.tierPoolState === "no_tier_data" && d.startingFigure === null); } assignedAll = true;
// (6) same pool reads as the plain answer
urls.length = 0; await ask({ conditionTier: 1 }); const poolReadsTier = urls.filter(u => !/condition_tier/.test(u)).length;
urls.length = 0; await ask(null); ok("(6) the tier call reads the pool exactly as the plain answer does (same pool requests, tier reads aside)", poolReadsTier === urls.length, `${poolReadsTier} vs ${urls.length}`);

console.error = quiet;
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
