// Free follow-up queries over the cached sales_archive (no OldCarsData calls).
// PostgREST does not run GROUP BY/AVG over the wire, so we fetch the filtered
// rows (reads are free) and aggregate in JS.
//
// Usage (Supabase creds only, no OLDCARSDATA_API_KEY needed):
//   SUPABASE_URL=.. SUPABASE_SERVICE_ROLE_KEY=.. node scripts/querySalesArchive.js --top-makes
//   ... node scripts/querySalesArchive.js --porsche-models
//   ... node scripts/querySalesArchive.js --mercedes-platform
//   ... node scripts/querySalesArchive.js --make "Porsche" --month 2026-06   # ad hoc

import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

const argv = process.argv.slice(2);
const flag = name => argv.includes(name);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const MONTH = opt("--month") || "2026-06";
const usd = n => n == null ? "n/a" : `$${Math.round(n).toLocaleString("en-US")}`;
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

const env = supabaseEnv();
if (!env) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

// Paged fetch of every row matching a PostgREST filter (default limit is 1000).
async function fetchAll(filter) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseSelect(env, `sales_archive?${filter}&select=platform,make,model,sale_price&limit=1000&offset=${offset}`);
    if (page === null) { console.error("Supabase read failed."); process.exit(1); }
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function group(rows, keyFn) {
  const g = {};
  for (const r of rows) { const k = keyFn(r); (g[k] = g[k] || []).push(num(r.sale_price)); }
  return Object.entries(g).map(([k, prices]) => {
    const p = prices.filter(v => v != null && v > 0);
    return { key: k, count: prices.length, avg: p.length ? p.reduce((a, b) => a + b, 0) / p.length : null };
  }).sort((a, b) => b.count - a.count);
}

async function topMakes() {
  const rows = await fetchAll(`month=eq.${MONTH}`);
  console.log(`Top makes by volume (${MONTH}) — ${rows.length} sales\n  Make | Count | Avg`);
  for (const g of group(rows, r => r.make || "Unknown").slice(0, 15)) console.log(`  ${g.key} | ${g.count} | ${usd(g.avg)}`);
}

async function makeModels(make) {
  const rows = await fetchAll(`month=eq.${MONTH}&make=eq.${encodeURIComponent(make)}`);
  console.log(`Top ${make} models (${MONTH}) — ${rows.length} sales\n  Model | Count | Avg`);
  for (const g of group(rows, r => r.model || "Unknown").slice(0, 5)) console.log(`  ${g.key} | ${g.count} | ${usd(g.avg)}`);
}

async function makeByPlatform(make) {
  const rows = await fetchAll(`month=eq.${MONTH}&make=eq.${encodeURIComponent(make)}`);
  console.log(`${make} by platform (${MONTH}) — ${rows.length} sales\n  Platform | Count | Avg`);
  for (const g of group(rows, r => r.platform || "Unknown")) console.log(`  ${g.key} | ${g.count} | ${usd(g.avg)}`);
}

if (flag("--top-makes")) await topMakes();
else if (flag("--porsche-models")) await makeModels("Porsche");
else if (flag("--mercedes-platform")) await makeByPlatform("Mercedes-Benz");
else if (opt("--make")) await makeModels(opt("--make"));
else {
  console.log("Usage: --top-makes | --porsche-models | --mercedes-platform | --make \"<Make>\" [--month 2026-06]");
}
