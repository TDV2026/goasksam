// BULK SALE SCAN (Lane B, Oct 25 2026), read-only, no deploy: stored HOUSE sales (ops task=poolrows, one source at a time, month by month) go through
// the SAME guard the engine uses (lib/bulkSale.js), pool by pool. A pool is make + model + year band of FIVE years (a stand-in for the engine's pool).
// Reports the events found, the sales set aside, and the popular pools whose median moves by more than 5 percent. Nothing is written.
//   node scripts/bulkSaleScan.mjs [from=2021-11-01] [to=2026-10-25]
import { execSync } from "node:child_process";
import { bulkSaleAside, houseEvents } from "../lib/bulkSale.js";
const key = execSync("security find-generic-password -s goasksam-probe -w", { encoding: "utf8" }).trim();
let bypass = ""; try { bypass = execSync("security find-generic-password -s goasksam-bypass -w", { encoding: "utf8" }).trim(); } catch {}
const FROM = process.argv[2] || "2021-11-01", TO = process.argv[3] || "2026-10-25";
const SOURCES = ["rmsothebys", "gooding", "barrettjackson", "mecum", "broadarrow", "bonhams"];
const get = async qs => { for (let t = 0; t < 3; t++) { try { const r = await fetch(`https://goasksam.com/api/usageDashboard?view=ops&task=poolrows&${qs}`, { headers: { "x-ops-key": key, "x-vercel-protection-bypass": bypass } }); const j = await r.json(); if (j && j.rows) return j; } catch {} } return { rows: [], total: 0 }; };
const months = []; { let d = new Date(FROM + "T00:00:00Z"); const end = new Date(TO + "T00:00:00Z"); while (d < end) { const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); months.push([d.toISOString().slice(0, 10), new Date(Math.min(n - 864e5, end)).toISOString().slice(0, 10)]); d = n; } }
const all = [];
for (const src of SOURCES) for (const [a, b] of months) {
  for (let off = 0; ; off += 500) {
    const j = await get(`source=${src}&since=${a}&until=${b}&limit=500&offset=${off}`);
    for (const r of j.rows) if (Number(r.sale_price_usd) > 0 && r.make && r.year) all.push({ id: r.id, source: src, source_slug: src, city: r.city, auction_end_date: r.sale_date, _usd: Number(r.hammerUsd || r.sale_price_usd), mileage: r.mileage, make: r.make, model: r.model, year: r.year, title: r.listing_title });
    if (j.rows.length < 500) break;
  }
  process.stderr.write(`${src} ${a} rows so far ${all.length}\r`);
}
console.error("");
const poolKey = r => `${r.make}|${r.model}|${Math.floor(r.year / 5) * 5}`;
const pools = new Map(); for (const r of all) (pools.get(poolKey(r)) || pools.set(poolKey(r), []).get(poolKey(r))).push(r);
const med = xs => { const a = xs.slice().sort((x, y) => x - y), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
const asideAll = new Set(), eventKeys = new Map(), moved = [];
for (const [k, rows] of pools) {
  const aside = bulkSaleAside(rows); if (!aside.size) continue;
  for (const r of aside) { asideAll.add(r); const ev = houseEvents(rows).find(e => e.rows.includes(r)); if (ev) eventKeys.set(ev.key + "|" + ev.rows[0].auction_end_date.slice(0, 7), (eventKeys.get(ev.key + "|" + ev.rows[0].auction_end_date.slice(0, 7)) || 0) + 1); }
  const before = med(rows.map(r => r._usd)), after = med(rows.filter(r => !aside.has(r)).map(r => r._usd));
  moved.push({ pool: k, rows: rows.length, aside: aside.size, before: Math.round(before), after: Math.round(after), pct: after && before ? Math.round((after / before - 1) * 1000) / 10 : null });
}
console.log(`house rows read ${all.length}, pools ${pools.size}`);
console.log(`bulk-sale events found (house + city + month): ${eventKeys.size}; sales set aside: ${asideAll.size}`);
for (const [k, n] of [...eventKeys].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`   ${k}  ${n} sales`);
const POPULAR = /^(Porsche\|(911|912|356|914|944|928|Boxster|Cayman)|Chevrolet\|(Corvette|Camaro|Chevelle|C10)|Ford\|(Mustang|Bronco|F-?100|Thunderbird)|Land Rover\|(Defender|Range Rover)|Mercedes-Benz\|(SL|300SL|190SL|SL-Class|280SL|230SL|250SL))/;
console.log("pools whose median moves more than 5 percent:");
for (const m of moved.filter(m => m.pct != null && Math.abs(m.pct) > 5).sort((a, b) => b.aside - a.aside)) console.log(`   ${POPULAR.test(m.pool) ? "*" : " "} ${m.pool.padEnd(34)} rows ${String(m.rows).padStart(4)} aside ${String(m.aside).padStart(3)} median ${m.before} -> ${m.after} (${m.pct}%)`);
console.log(`pools changed by more than 5 percent: ${moved.filter(m => m.pct != null && Math.abs(m.pct) > 5).length} of ${moved.length} pools with any set-aside; popular (*) ${moved.filter(m => m.pct != null && Math.abs(m.pct) > 5 && POPULAR.test(m.pool)).length}`);
