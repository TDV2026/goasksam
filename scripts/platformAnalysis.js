// Comparative platform analysis over cached June sales_archive (free reads).
// Focus: Hagerty and PCARMarket vs BaT/C&B. Every number is from real records.

import { supabaseEnv, supabaseSelect } from "../lib/_supabase.js";
const env = supabaseEnv();
if (!env) { console.error("Missing Supabase creds."); process.exit(1); }

const usd = n => n == null ? "n/a" : `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n, d) => d ? `${(n / d * 100).toFixed(1)}%` : "0%";
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const avg = a => { const p = a.map(r => r.price).filter(Boolean); return p.length ? p.reduce((x, y) => x + y, 0) / p.length : null; };
const med = a => { const p = a.map(r => r.price).filter(Boolean).sort((x, y) => x - y); return p.length ? p[Math.floor(p.length / 2)] : null; };

const rows = [];
for (let o = 0; ; o += 1000) {
  const page = await supabaseSelect(env, `sales_archive?month=eq.2026-06&select=platform,make,model,sale_price,year,title_status,seller_type,mileage&limit=1000&offset=${o}`);
  if (page === null) { console.error("read failed"); process.exit(1); }
  rows.push(...page.map(r => ({ platform: r.platform, make: r.make || "Unknown", model: r.model || "Unknown", price: num(r.sale_price), year: num(r.year), title: r.title_status, seller: r.seller_type, mileage: num(r.mileage) })));
  if (page.length < 1000) break;
}
const total = rows.length;
const P = ["Bring a Trailer", "Cars & Bids", "Hagerty", "PCARMarket"];
const on = p => rows.filter(r => r.platform === p);

console.log(`TOTAL June records: ${total}\n`);
console.log("PLATFORM | count | % | avg | median | min | max");
for (const p of P) {
  const r = on(p); const prices = r.map(x => x.price).filter(Boolean);
  console.log(`${p} | ${r.length} | ${pct(r.length, total)} | ${usd(avg(r))} | ${usd(med(r))} | ${usd(prices.length ? Math.min(...prices) : null)} | ${usd(prices.length ? Math.max(...prices) : null)}`);
}

function topGroup(rowset, keyFn, n = 8) {
  const g = {}; for (const r of rowset) (g[keyFn(r)] = g[keyFn(r)] || []).push(r);
  return Object.entries(g).map(([k, rs]) => ({ k, c: rs.length, avg: avg(rs), rs })).sort((a, b) => b.c - a.c).slice(0, n);
}
const yearBand = y => y == null ? "unknown" : y < 1970 ? "pre-1970" : y < 1990 ? "1970-1989" : y < 2000 ? "1990-1999" : y < 2010 ? "2000-2009" : "2010+";
const priceBand = p => p == null ? "n/a" : p < 10000 ? "<$10k" : p < 25000 ? "$10-25k" : p < 50000 ? "$25-50k" : p < 100000 ? "$50-100k" : "$100k+";

for (const plat of ["Hagerty", "PCARMarket"]) {
  const r = on(plat);
  console.log(`\n===== ${plat} (${r.length}) =====`);
  console.log("Top makes:"); topGroup(r, x => x.make).forEach(g => console.log(`  ${g.k} | ${g.c} | ${usd(g.avg)}`));
  console.log("Top make/model:"); topGroup(r, x => `${x.make} ${x.model}`).forEach(g => console.log(`  ${g.k} | ${g.c} | ${usd(g.avg)}`));
  console.log("Year bands:"); for (const b of ["pre-1970", "1970-1989", "1990-1999", "2000-2009", "2010+", "unknown"]) { const s = r.filter(x => yearBand(x.year) === b); if (s.length) console.log(`  ${b} | ${s.length} | ${pct(s.length, r.length)} | ${usd(avg(s))}`); }
  console.log("Price bands:"); for (const b of ["<$10k", "$10-25k", "$25-50k", "$50-100k", "$100k+"]) { const s = r.filter(x => priceBand(x.price) === b); if (s.length) console.log(`  ${b} | ${s.length} | ${pct(s.length, r.length)}`); }
  console.log("Seller type:"); topGroup(r, x => x.seller || "?", 5).forEach(g => console.log(`  ${g.k} | ${g.c}`));
  console.log("Title status:"); topGroup(r, x => x.title || "?", 5).forEach(g => console.log(`  ${g.k} | ${g.c}`));
}

// Cross-platform SHARE: for a slice, what % landed on each platform.
function shareRow(label, subset) {
  const parts = P.map(p => { const c = subset.filter(r => r.platform === p).length; return `${p.split(" ")[0]}:${c} (${pct(c, subset.length)})`; });
  console.log(`  ${label} [n=${subset.length}] -> ${parts.join("  ")}`);
}
console.log("\n===== CROSS-PLATFORM SHARE by YEAR BAND (where do era cars sell?) =====");
for (const b of ["pre-1970", "1970-1989", "1990-1999", "2000-2009", "2010+"]) shareRow(b, rows.filter(r => yearBand(r.year) === b));
console.log("\n===== CROSS-PLATFORM SHARE by PRICE BAND =====");
for (const b of ["<$10k", "$10-25k", "$25-50k", "$50-100k", "$100k+"]) shareRow(b, rows.filter(r => priceBand(r.price) === b));

console.log("\n===== PORSCHE model share across platforms (PCARMarket focus) =====");
const porsche = rows.filter(r => r.make.toLowerCase() === "porsche");
console.log(`Total Porsche June sales: ${porsche.length}`);
for (const g of topGroup(porsche, x => x.model, 12)) shareRow(`Porsche ${g.k}`, porsche.filter(r => r.model === g.k));

console.log("\n===== Makes where Hagerty share is notable (>=8% and n>=10) =====");
for (const g of topGroup(rows, x => x.make, 40)) {
  if (g.c < 10) continue;
  const h = g.rs.filter(r => r.platform === "Hagerty").length;
  if (h / g.c >= 0.08) console.log(`  ${g.k} [total ${g.c}] Hagerty ${h} (${pct(h, g.c)}) | BaT ${g.rs.filter(r => r.platform === "Bring a Trailer").length} | C&B ${g.rs.filter(r => r.platform === "Cars & Bids").length}`);
}
