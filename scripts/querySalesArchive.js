// Free follow-up queries over the cached sales_archive (no OldCarsData calls).
// Loads the month once (reads are free), then aggregates/filters in JS, since
// PostgREST does not run GROUP BY/AVG over the wire.
//
// Usage (Supabase creds only):
//   SUPABASE_URL=.. SUPABASE_SERVICE_ROLE_KEY=.. node scripts/querySalesArchive.js <query>
//
// Detailed car-level queries:
//   --highest-price --platform=cabs
//   --lowest-price --platform=cabs
//   --top-10-sales --platform=cabs
//   --top-10-volume
//   --make "Mercedes-Benz" --compare
//   --model "Porsche 911" --details
//   --bracket 25-50k --top-makes
//   --platform=cabs --top-models
// Aggregate queries:
//   --top-makes | --porsche-models | --mercedes-platform | --make "<Make>"
// Options: --month 2026-06 (default), --platform <cabs|bat>

import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";

const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null; };
const optEq = n => { const a = argv.find(x => x.startsWith(`${n}=`)); return a ? a.slice(n.length + 1) : null; };

const MONTH = opt("--month") || optEq("--month") || "2026-06";
const usd = n => n == null ? "n/a" : `$${Math.round(n).toLocaleString("en-US")}`;
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const normKey = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const PLATFORM_ALIASES = {
  cabs: "Cars & Bids", cab: "Cars & Bids", cnb: "Cars & Bids", candb: "Cars & Bids", carsandbids: "Cars & Bids",
  bat: "Bring a Trailer", bringatrailer: "Bring a Trailer", bringa: "Bring a Trailer"
};
function resolvePlatform() {
  const v = optEq("--platform") || opt("--platform");
  return v ? (PLATFORM_ALIASES[normKey(v)] || v) : null;
}

const env = supabaseEnv();
if (!env) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

// Load every row for the month once (paged; PostgREST default page is 1000).
async function loadMonth() {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await supabaseSelect(env, `sales_archive?month=eq.${MONTH}&select=sale_date,platform,make,model,sale_price,year,mileage,title_status&order=sale_price.desc&limit=1000&offset=${offset}`);
    if (page === null) { console.error("Supabase read failed."); process.exit(1); }
    out.push(...page.map(r => ({ date: r.sale_date, platform: r.platform, make: r.make || "Unknown", model: r.model || "Unknown", price: num(r.sale_price), year: r.year, mileage: r.mileage, titleStatus: r.title_status })));
    if (page.length < 1000) break;
  }
  return out;
}

const avg = arr => { const p = arr.map(r => r.price).filter(Boolean); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : null; };
const byPlatform = (rows, p) => p ? rows.filter(r => normKey(r.platform) === normKey(p)) : rows;
function group(rows, keyFn) {
  const g = {};
  for (const r of rows) (g[keyFn(r)] = g[keyFn(r)] || []).push(r);
  return Object.entries(g).map(([key, rs]) => ({ key, count: rs.length, avg: avg(rs), rows: rs })).sort((a, b) => b.count - a.count);
}
function parseBracket(s) {
  if (!s) return null;
  s = s.toLowerCase().replace(/\s/g, "");
  if (/\+$/.test(s)) return [parseFloat(s) * (/k/.test(s) ? 1000 : 1), Infinity];
  const m = s.match(/^(\d+)-(\d+)k?$/);
  return m ? [Number(m[1]) * 1000, Number(m[2]) * 1000] : null;
}
// Split "Porsche 911" into a make present in the data + the rest as model.
function splitMakeModel(str, rows) {
  const makes = [...new Set(rows.map(r => r.make))].sort((a, b) => b.length - a.length);
  const hit = makes.find(m => normKey(str).startsWith(normKey(m)));
  if (hit) return { make: hit, model: str.slice(str.toLowerCase().indexOf(hit.toLowerCase().split(" ")[0]) + hit.length).trim() || str.replace(new RegExp(hit, "i"), "").trim() };
  const parts = str.split(/\s+/);
  return { make: parts[0], model: parts.slice(1).join(" ") };
}
const mi = m => m == null ? "?" : `${Number(m).toLocaleString("en-US")} mi`;
const line = r => `  ${r.date} | ${r.platform} | ${r.year ?? "?"} | ${r.make} | ${r.model} | ${mi(r.mileage)} | ${r.titleStatus || "?"} | ${usd(r.price)}`;

async function main() {
  const rows = await loadMonth();
  const platform = resolvePlatform();
  const scoped = byPlatform(rows, platform);
  const label = platform || "both platforms";

  // 1 & 2: highest / lowest single sale
  if (flag("--highest-price") || flag("--lowest-price")) {
    const priced = scoped.filter(r => r.price);
    const pick = flag("--highest-price")
      ? priced.reduce((a, b) => (b.price > a.price ? b : a))
      : priced.reduce((a, b) => (b.price < a.price ? b : a));
    console.log(`${flag("--highest-price") ? "Highest" : "Lowest"}-price sale (${label}, ${MONTH}):`);
    console.log("  Date | Platform | Year | Make | Model | Mileage | Title | Price");
    console.log(line(pick));
    return;
  }

  // 3: top 10 sales by price
  if (flag("--top-10-sales")) {
    console.log(`Top 10 sales by price (${label}, ${MONTH}):\n  Date | Platform | Year | Make | Model | Mileage | Title | Price`);
    scoped.filter(r => r.price).sort((a, b) => b.price - a.price).slice(0, 10).forEach(r => console.log(line(r)));
    return;
  }

  // 4: top 10 make/model by volume, both platforms
  if (flag("--top-10-volume")) {
    console.log(`Top 10 make/model by volume (${MONTH}):\n  Rank | Make | Model | Units | Avg`);
    group(rows, r => `${r.make}||${r.model}`).slice(0, 10).forEach((g, i) => {
      const [mk, md] = g.key.split("||");
      console.log(`  ${i + 1}. | ${mk} | ${md} | ${g.count} | ${usd(g.avg)}`);
    });
    return;
  }

  // 8: top 10 models on a specific platform
  if (flag("--top-models")) {
    console.log(`Top 10 make/model on ${label} (${MONTH}):\n  Rank | Make | Model | Units | Avg`);
    group(scoped, r => `${r.make}||${r.model}`).slice(0, 10).forEach((g, i) => {
      const [mk, md] = g.key.split("||");
      console.log(`  ${i + 1}. | ${mk} | ${md} | ${g.count} | ${usd(g.avg)}`);
    });
    return;
  }

  // 7: which makes dominated a price bracket
  const bracket = parseBracket(opt("--bracket") || optEq("--bracket"));
  if (bracket && flag("--top-makes")) {
    const [lo, hi] = bracket;
    const inB = rows.filter(r => r.price != null && r.price >= lo && r.price < hi);
    console.log(`Top makes in the $${lo / 1000}-${hi === Infinity ? "∞" : hi / 1000}k bracket (${MONTH}) — ${inB.length} sales:\n  Make | Units | Avg`);
    group(inB, r => r.make).slice(0, 10).forEach(g => console.log(`  ${g.key} | ${g.count} | ${usd(g.avg)}`));
    return;
  }

  // 5: one make, BaT vs C&B side by side
  const makeArg = opt("--make") || optEq("--make");
  if (makeArg && flag("--compare")) {
    const mk = rows.filter(r => normKey(r.make) === normKey(makeArg));
    console.log(`${makeArg} by platform (${MONTH}) — ${mk.length} sales`);
    console.log("  Platform | Units | Avg | Min | Max");
    for (const p of ["Cars & Bids", "Bring a Trailer"]) {
      const rs = mk.filter(r => r.platform === p); const prices = rs.map(r => r.price).filter(Boolean);
      console.log(`  ${p} | ${rs.length} | ${usd(avg(rs))} | ${usd(prices.length ? Math.min(...prices) : null)} | ${usd(prices.length ? Math.max(...prices) : null)}`);
    }
    return;
  }

  // 6: full detail on one model
  const modelArg = opt("--model") || optEq("--model");
  if (modelArg && flag("--details")) {
    const { make, model } = splitMakeModel(modelArg, rows);
    const mm = rows.filter(r => normKey(r.make) === normKey(make) && normKey(r.model) === normKey(model));
    const prices = mm.map(r => r.price).filter(Boolean);
    console.log(`${make} ${model} in ${MONTH} — ${mm.length} sales`);
    console.log(`  Price range: ${usd(prices.length ? Math.min(...prices) : null)} .. ${usd(prices.length ? Math.max(...prices) : null)} | Average: ${usd(avg(mm))}`);
    console.log("  By platform:");
    for (const p of ["Cars & Bids", "Bring a Trailer"]) {
      const rs = mm.filter(r => r.platform === p);
      if (rs.length) console.log(`    ${p}: ${rs.length} sold, avg ${usd(avg(rs))}`);
    }
    console.log("  Top 5 sales:  Date | Platform | Year | Make | Model | Mileage | Title | Price");
    mm.filter(r => r.price).sort((a, b) => b.price - a.price).slice(0, 5).forEach(r => console.log(line(r)));
    return;
  }

  // Aggregate back-compat queries
  if (flag("--top-makes")) {
    console.log(`Top makes by volume (${MONTH}) — ${rows.length} sales\n  Make | Count | Avg`);
    group(rows, r => r.make).slice(0, 15).forEach(g => console.log(`  ${g.key} | ${g.count} | ${usd(g.avg)}`));
    return;
  }
  if (flag("--porsche-models") || (makeArg && !flag("--compare"))) {
    const mk = makeArg || "Porsche";
    const sub = rows.filter(r => normKey(r.make) === normKey(mk));
    console.log(`Top ${mk} models (${MONTH}) — ${sub.length} sales\n  Model | Count | Avg`);
    group(sub, r => r.model).slice(0, 5).forEach(g => console.log(`  ${g.key} | ${g.count} | ${usd(g.avg)}`));
    return;
  }
  if (flag("--mercedes-platform")) {
    const sub = rows.filter(r => normKey(r.make) === normKey("Mercedes-Benz"));
    console.log(`Mercedes-Benz by platform (${MONTH}) — ${sub.length} sales\n  Platform | Count | Avg`);
    group(sub, r => r.platform).forEach(g => console.log(`  ${g.key} | ${g.count} | ${usd(g.avg)}`));
    return;
  }

  console.log("Queries: --highest-price/--lowest-price/--top-10-sales [--platform=cabs|bat], --top-10-volume,");
  console.log("  --make \"<Make>\" --compare, --model \"<Make Model>\" --details, --bracket 25-50k --top-makes,");
  console.log("  --platform=cabs --top-models, --top-makes, --make \"<Make>\", --mercedes-platform");
}

await main();
