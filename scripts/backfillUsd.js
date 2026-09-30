// Backfill sale_price_usd (sales_archive) and high_bid_usd (auction_attempts). ZERO OldCarsData.
//
// Third attempt. Earlier versions timed out (57014) because they SCANNED for work. This one NEVER
// scans: it walks bounded INDEX RANGES chosen here and hands each to a server function that does a
// plain UPDATE over just that range (see docs/supabase-backfill-usd-fn.sql).
//   - sales_archive: the PK is a uuid, so the uuid space [min,max] is sliced into ~BATCH-row batches
//     (gen_random_uuid is uniform, so equal slices hold ~equal rows). On 57014 a slice is halved.
//   - auction_attempts: no single id; walk the indexed (source_slug, attempt_date) key in date windows,
//     halving the window on 57014, then sweep null-attempt_date rows per source.
// Resumable: every UPDATE carries "*_usd is null", so a rerun only fills what is left. USD/missing ->
// native; a currency in fx_rates for the sale month -> converted; anything else -> left null + reported.
//
// Already done (Sam, by hand): all non-USD at Collecting Cars, Bonhams, RM, The Market, Car & Classic,
// Broad Arrow, and ALL Hagerty rows. The range walk simply skips them (sale_price_usd already set).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfillUsd.js [--table=both|sales|attempts] [--batch=2000]
import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

const env = supabaseEnv();
if (!env || !env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true]; }));
const TABLE = String(args.table || "both");
const BATCH = Math.max(500, Number(args.batch) || 2000);
const ATTEMPT_SOURCES = ["bringatrailer", "carsandbids", "hagerty", "sothebysmotorsport", "mbmarket"]; // the only writers of auction_attempts
const CURRENCIES = ["GBP", "EUR", "AUD", "NZD", "CHF", "HKD", "CAD", "JPY", "AED"];

// ---- low-level helpers ----
async function rpc(fn, body) {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` },
    body: JSON.stringify(body)
  });
  const t = await res.text();
  if (res.ok) return { count: Number(t) || 0 };
  if (/57014|statement timeout|canceling statement/i.test(t)) return { timeout: true };
  throw new Error(`${fn} ${res.status}: ${t.slice(0, 200)}`);
}
async function countExact(filter) {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/${filter}&select=*&limit=1`, {
    headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" }
  });
  const cr = res.headers.get("content-range") || ""; const m = cr.match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}
const uuidToBig = u => BigInt("0x" + String(u).replace(/-/g, ""));
const bigToUuid = b => { let h = (b < 0n ? 0n : b).toString(16).padStart(32, "0"); if (h.length > 32) h = h.slice(-32); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };
const dayStr = d => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => dayStr(Date.parse(d) + n * 864e5);

let updated = 0, batches = 0;
function tick() { batches++; if (batches % 50 === 0) console.log(`  ... ${batches} batches, ${updated} rows filled so far`); }

// ---- sales_archive: uuid PK ranges ----
async function fillSalesRange(loB, hiB) {
  const r = await rpc("backfill_sales_usd_range", { lo: bigToUuid(loB), hi: bigToUuid(hiB) });
  if (r.timeout) {
    const mid = loB + (hiB - loB) / 2n;
    if (mid <= loB || mid >= hiB) throw new Error(`sales range still times out at minimum width (${bigToUuid(loB)}..${bigToUuid(hiB)})`);
    console.log(`  57014 -> halving sales range`);
    await fillSalesRange(loB, mid); await fillSalesRange(mid, hiB);
  } else { updated += r.count; tick(); }
}
async function backfillSales() {
  const first = await supabaseSelect(env, `sales_archive?select=id&order=id.asc&limit=1`);
  const last = await supabaseSelect(env, `sales_archive?select=id&order=id.desc&limit=1`);
  if (!first || !first.length || !last || !last.length) { console.log("sales_archive: no rows."); return; }
  const minB = uuidToBig(first[0].id), maxB = uuidToBig(last[0].id);
  const total = (await countExact(`sales_archive?sale_price=not.is.null`)) || 0;
  const slices = Math.max(1, Math.ceil(total / BATCH));
  const step = (maxB - minB) / BigInt(slices) + 1n;
  console.log(`sales_archive: ${total} priced rows, ~${slices} batches of ~${BATCH} (uuid step ${step}).`);
  updated = 0; batches = 0;
  for (let lo = minB; lo <= maxB; lo += step) {
    let hi = lo + step; if (hi > maxB) hi = maxB + 1n;
    await fillSalesRange(lo, hi);
  }
  console.log(`sales_archive: DONE, ${updated} rows filled this run across ${batches} batches.`);
}

// ---- auction_attempts: (source_slug, attempt_date) ranges ----
async function fillAttemptsWindow(src, dLo, dHi) {
  const r = await rpc("backfill_attempts_usd_range", { src, d_lo: dLo, d_hi: dHi });
  if (r.timeout) {
    const mid = dayStr((Date.parse(dLo) + Date.parse(dHi)) / 2);
    if (mid === dLo || mid === dHi) throw new Error(`attempts window still times out at 1 day (${src} ${dLo})`);
    console.log(`  57014 -> halving attempts window ${src} ${dLo}..${dHi}`);
    await fillAttemptsWindow(src, dLo, mid); await fillAttemptsWindow(src, mid, dHi);
  } else { updated += r.count; tick(); }
}
async function backfillAttempts() {
  updated = 0; batches = 0;
  for (const src of ATTEMPT_SOURCES) {
    const first = await supabaseSelect(env, `auction_attempts?source_slug=eq.${src}&attempt_date=not.is.null&select=attempt_date&order=attempt_date.asc&limit=1`);
    const last = await supabaseSelect(env, `auction_attempts?source_slug=eq.${src}&attempt_date=not.is.null&select=attempt_date&order=attempt_date.desc&limit=1`);
    if (first && first.length && last && last.length) {
      const lo = dayStr(first[0].attempt_date), hi = addDays(dayStr(last[0].attempt_date), 1);
      const WINDOW = 15;
      for (let d = lo; d < hi;) { const nxt = addDays(d, WINDOW) < hi ? addDays(d, WINDOW) : hi; await fillAttemptsWindow(src, d, nxt); d = nxt; }
    }
    const nd = await rpc("backfill_attempts_usd_nulldate", { src });
    if (!nd.timeout && nd.count) { updated += nd.count; }
  }
  console.log(`auction_attempts: DONE, ${updated} rows filled this run across ${batches} batches.`);
}

// ---- final per-currency report ----
async function report(table, curField, selCur, usdCol) {
  console.log(`\n== ${table} (${usdCol}) ==`);
  const total = await countExact(`${table}?${table === "sales_archive" ? "sale_price" : "high_bid"}=not.is.null`);
  const filled = await countExact(`${table}?${usdCol}=not.is.null`);
  const stillNull = await countExact(`${table}?${table === "sales_archive" ? "sale_price" : "high_bid"}=not.is.null&${usdCol}=is.null`);
  console.log(`  total priced ${total} | filled ${filled} | still null ${stillNull}`);
  const usdFilled = await countExact(`${table}?or=(${curField}.is.null,${curField}.eq.USD)&${usdCol}=not.is.null`);
  const usdNull = await countExact(`${table}?or=(${curField}.is.null,${curField}.eq.USD)&${usdCol}=is.null`);
  console.log(`  USD/none  filled ${usdFilled}  still null ${usdNull}`);
  for (const c of CURRENCIES) {
    const f = await countExact(`${table}?${curField}=eq.${c}&${usdCol}=not.is.null`);
    const n = await countExact(`${table}?${curField}=eq.${c}&${usdCol}=is.null`);
    if ((f || 0) + (n || 0) === 0) continue;
    console.log(`  ${c.padEnd(4)}      filled ${f}  still null ${n}${n > 0 ? "  <-- LEFT NULL (no fx_rate for currency/month)" : ""}`);
  }
  // Catch any OTHER currency still null (not USD, not in the known list) so nothing is missed.
  const priced = table === "sales_archive" ? "sale_price" : "high_bid";
  const nullRows = (await supabaseSelect(env, `${table}?select=${selCur}&${priced}=not.is.null&${usdCol}=is.null&${curField}=not.is.null&${curField}=neq.USD&limit=1000`)) || [];
  const other = {};
  for (const r of nullRows) { const c = String(r.cur || "").toUpperCase(); if (!c || CURRENCIES.includes(c)) continue; other[c] = (other[c] || 0) + 1; }
  for (const c of Object.keys(other).sort()) console.log(`  ${c.padEnd(4)}      still null ${other[c]}  <-- LEFT NULL (currency not in fx_rates)`);
}

(async () => {
  if (TABLE === "both" || TABLE === "sales") await backfillSales();
  if (TABLE === "both" || TABLE === "attempts") await backfillAttempts();
  if (TABLE === "both" || TABLE === "sales") await report("sales_archive", "raw_record->>currency", "cur:raw_record->>currency", "sale_price_usd");
  if (TABLE === "both" || TABLE === "attempts") await report("auction_attempts", "currency", "cur:currency", "high_bid_usd");
  console.log("\nDone.");
})();
