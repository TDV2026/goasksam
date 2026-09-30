// Backfill sale_price_usd (sales_archive) and high_bid_usd (auction_attempts) from the listing's own
// currency to USD, by the sale/attempt MONTH, using fx_rates. Read-only against OldCarsData (ZERO OCD):
// it only touches Supabase. USD or a missing currency passes through unconverted; a known non-USD
// currency is multiplied by its monthly usd_per_unit; an UNKNOWN currency is left null and counted
// (never guessed). Batched, resumable (re-running only touches still-null rows), and reports counts by
// currency at the end.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfillUsd.js [--table=both|sales|attempts] [--batch=1000] [--limit=N] [--force]
import { supabaseEnv, supabaseSelect, supabaseSelectAll, supabaseInsert } from "../lib/_supabase.js";
import { loadFxRates } from "../lib/_fx.js";

const env = supabaseEnv();
if (!env || !env.supabaseUrl || !env.supabaseKey) { console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required"); process.exit(1); }

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true]; }));
const TABLE = String(args.table || "both");
const BATCH = Math.max(1, Number(args.batch) || 1000);
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const FORCE = !!args.force;

const isUsdOrMissing = c => { const s = String(c || "").toUpperCase(); return !s || s === "USD"; };
// Tally: per-currency { converted, passthrough(usd/missing), noRate(unknown currency, left null) }.
function newTally() { return {}; }
function bump(t, cur, kind) { const c = String(cur || "USD").toUpperCase() || "USD"; (t[c] = t[c] || { converted: 0, passthrough: 0, noRate: 0 })[kind]++; }

async function backfillSales(fx) {
  const t = newTally();
  let lastId = "00000000-0000-0000-0000-000000000000", done = 0, updated = 0;
  for (;;) {
    if (done >= LIMIT) break;
    const nullClause = FORCE ? "" : "&sale_price_usd=is.null";
    const q = `sales_archive?select=id,sale_price,sale_date,cur:raw_record->>currency&sale_price=not.is.null${nullClause}&id=gt.${lastId}&order=id.asc&limit=${BATCH}`;
    const rows = await supabaseSelect(env, q);
    if (rows === null) { console.error("::error:: sales_archive read failed at id>", lastId); process.exit(2); }
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;
    const updates = [];
    for (const r of rows) {
      done++;
      const price = Number(r.sale_price);
      if (!(price > 0)) continue;
      const cur = r.cur;
      if (isUsdOrMissing(cur)) { updates.push({ id: r.id, sale_price_usd: Math.round(price) }); bump(t, "USD", "passthrough"); continue; }
      const rate = fx.rateFor(cur, r.sale_date);
      if (rate == null) { bump(t, cur, "noRate"); continue; }   // unknown currency: leave null, never guess
      updates.push({ id: r.id, sale_price_usd: Math.round(price * rate) }); bump(t, cur, "converted");
    }
    if (updates.length) {
      const res = await supabaseInsert("sales_archive", updates, env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=id");
      if (res && res.error) { console.error("::error:: sales_archive upsert failed:", res.error); process.exit(2); }
      updated += updates.length;
    }
    console.log(`sales: scanned ${done}, updated ${updated} (through id ${lastId})`);
  }
  return { t, done, updated };
}

async function backfillAttempts(fx) {
  const t = newTally();
  let updated = 0, done = 0;
  const nullClause = FORCE ? "" : "&high_bid_usd=is.null";
  const rows = (await supabaseSelectAll(env, `auction_attempts?select=source_slug,source_record_id,high_bid,attempt_date,currency&high_bid=not.is.null${nullClause}`)) || [];
  const updates = [];
  for (const r of rows) {
    done++;
    const bid = Number(r.high_bid);
    if (!(bid > 0)) continue;
    const cur = r.currency;
    if (isUsdOrMissing(cur)) { updates.push({ source_slug: r.source_slug, source_record_id: r.source_record_id, high_bid_usd: Math.round(bid) }); bump(t, "USD", "passthrough"); continue; }
    const rate = fx.rateFor(cur, r.attempt_date);
    if (rate == null) { bump(t, cur, "noRate"); continue; }
    updates.push({ source_slug: r.source_slug, source_record_id: r.source_record_id, high_bid_usd: Math.round(bid * rate) }); bump(t, cur, "converted");
  }
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH);
    const res = await supabaseInsert("auction_attempts", slice, env.supabaseUrl, env.supabaseKey, "resolution=merge-duplicates,return=minimal", "?on_conflict=source_slug,source_record_id");
    if (res && res.error) { console.error("::error:: auction_attempts upsert failed:", res.error); process.exit(2); }
    updated += slice.length;
    console.log(`attempts: updated ${updated}/${updates.length}`);
  }
  return { t, done, updated };
}

function report(name, r) {
  console.log(`\n== ${name}: scanned ${r.done}, updated ${r.updated} ==`);
  const curs = Object.keys(r.t).sort();
  for (const c of curs) { const x = r.t[c]; console.log(`  ${c.padEnd(4)} converted ${x.converted}  passthrough ${x.passthrough}  noRate(left null) ${x.noRate}`); }
  const noRate = curs.filter(c => r.t[c].noRate > 0);
  if (noRate.length) console.log(`  ::warning:: currencies with NO fx_rate (left null, add to fx_rates): ${noRate.join(", ")}`);
}

(async () => {
  const fx = await loadFxRates(env);
  if (!fx.has("GBP")) { console.error("::error:: fx_rates appears empty (no GBP). Load docs/supabase-fx-rates.sql first."); process.exit(2); }
  if (TABLE === "both" || TABLE === "sales") report("sales_archive.sale_price_usd", await backfillSales(fx));
  if (TABLE === "both" || TABLE === "attempts") report("auction_attempts.high_bid_usd", await backfillAttempts(fx));
  console.log("\nDone.");
})();
