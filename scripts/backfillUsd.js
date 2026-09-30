// Backfill sale_price_usd (sales_archive) and high_bid_usd (auction_attempts) from the listing's own
// currency to USD. ZERO OldCarsData (Supabase only).
//
// The whole-row UPSERT approach timed out (57014) because ON CONFLICT recomputes the natural-key
// expression index per row. This version instead calls two PLAIN-UPDATE server functions
// (backfill_sales_price_usd / backfill_attempts_high_bid_usd, see docs/supabase-backfill-usd-fn.sql)
// in small LIMIT batches until they report 0. It updates ONLY the *_usd column (not indexed), so each
// statement is bounded and fast, and it is fully resumable (only still-null rows are ever touched).
// USD/missing currency passes through; a currency in fx_rates for the sale month converts; anything
// else (AED, or a month not covered) is left null and reported.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfillUsd.js [--table=both|sales|attempts] [--batch=2000]
import { supabaseEnv, supabaseSelectAll } from "../lib/_supabase.js";

const env = supabaseEnv();
if (!env || !env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true]; }));
const TABLE = String(args.table || "both");
const BATCH = Math.max(1, Number(args.batch) || 2000);
const CURRENCIES = ["GBP", "EUR", "AUD", "NZD", "CHF", "HKD", "CAD", "JPY", "AED"];

async function rpc(fn, batch_limit) {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}` },
    body: JSON.stringify({ batch_limit })
  });
  const t = await res.text();
  if (!res.ok) { throw new Error(`${fn} failed ${res.status}: ${t.slice(0, 200)}`); }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}
async function countExact(filter) {
  const res = await fetch(`${env.supabaseUrl}/rest/v1/${filter}&select=*&limit=1`, {
    headers: { apikey: env.supabaseKey, Authorization: `Bearer ${env.supabaseKey}`, Prefer: "count=exact", Range: "0-0", "Range-Unit": "items" }
  });
  const cr = res.headers.get("content-range") || ""; const m = cr.match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

async function drain(fn) {
  let total = 0, n;
  do { n = await rpc(fn, BATCH); total += n; if (n) console.log(`  ${fn}: +${n} (running ${total})`); } while (n > 0);
  return total;
}

// Per-currency report for a table. curField is the PostgREST accessor for the stored currency;
// selField is how to SELECT that currency (aliased for the json case).
async function reportTable(table, curField, selField, usdCol) {
  console.log(`\n== ${table} (${usdCol}) counts by currency ==`);
  const usdFilled = await countExact(`${table}?or=(${curField}.is.null,${curField}.eq.USD)&${usdCol}=not.is.null`);
  const usdNull = await countExact(`${table}?or=(${curField}.is.null,${curField}.eq.USD)&${usdCol}=is.null`);
  console.log(`  USD/none    filled ${usdFilled}   still null ${usdNull}`);
  for (const c of CURRENCIES) {
    const filled = await countExact(`${table}?${curField}=eq.${c}&${usdCol}=not.is.null`);
    const nul = await countExact(`${table}?${curField}=eq.${c}&${usdCol}=is.null`);
    if ((filled || 0) + (nul || 0) === 0) continue;
    console.log(`  ${c.padEnd(4)}        filled ${filled}   still null ${nul}${nul > 0 ? "  <-- LEFT NULL (not in fx_rates for the sale month)" : ""}`);
  }
  // Any OTHER currency still null (not USD, not in the known list) -> tally so nothing is silently missed.
  const nullRows = (await supabaseSelectAll(env, `${table}?select=${selField}&${usdCol}=is.null&${curField}=not.is.null&${curField}=neq.USD`)) || [];
  const other = {};
  for (const r of nullRows) { const c = String(r.cur || "").toUpperCase(); if (!c || CURRENCIES.includes(c)) continue; other[c] = (other[c] || 0) + 1; }
  for (const c of Object.keys(other).sort()) console.log(`  ${c.padEnd(4)}        still null ${other[c]}  <-- LEFT NULL (not in fx_rates)`);
}

(async () => {
  if (TABLE === "both" || TABLE === "sales") { console.log("Backfilling sales_archive.sale_price_usd ..."); const t = await drain("backfill_sales_price_usd"); console.log(`sales_archive: filled ${t} rows.`); }
  if (TABLE === "both" || TABLE === "attempts") { console.log("Backfilling auction_attempts.high_bid_usd ..."); const t = await drain("backfill_attempts_high_bid_usd"); console.log(`auction_attempts: filled ${t} rows.`); }
  if (TABLE === "both" || TABLE === "sales") await reportTable("sales_archive", "raw_record->>currency", "cur:raw_record->>currency", "sale_price_usd");
  if (TABLE === "both" || TABLE === "attempts") await reportTable("auction_attempts", "currency", "cur:currency", "high_bid_usd");
  console.log("\nDone.");
})();
