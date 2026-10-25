// BULK-SALE CHECK (Lane B, Oct 25 2026), no network. Synthetic pools through lib/bulkSale.js: the rule is general (house event, share of lots far below
// the pool's other sales, no mileage), names no sale, and leaves normal pools alone.
import { bulkSaleAside } from "../lib/bulkSale.js";
let failed = 0; const ok = (c, m) => { if (!c) failed++; console.log((c ? "ok   " : "FAIL ") + m); };
let id = 0;
const row = (src, city, date, usd, miles = 0, extra = {}) => ({ id: ++id, source: src, source_slug: src, city, auction_end_date: date, _usd: usd, mileage: miles, ...extra });
const others = Array.from({ length: 12 }, (_, i) => row("bringatrailer", "Anywhere", `2025-0${1 + (i % 9)}-1${i % 9}`, 150000 + i * 4000, 40000 + i));
const junk = [4480, 6160, 6720, 7840, 12880, 14560, 34720, 36400].map((p, i) => row("rmsothebys", "Los Angeles", i < 3 ? "2024-10-26" : "2024-10-28", p, 0));
const real = [row("rmsothebys", "Los Angeles", "2024-10-28", 246400, 0), row("rmsothebys", "Monterey", "2025-08-15", 190000, 31000)];
let a = bulkSaleAside([...others, ...junk, ...real]);
ok(junk.every(r => a.has(r)), "the eight far-below lots of one house event are set aside");
ok(!real.some(r => a.has(r)) && !others.some(r => a.has(r)), "the event's normally priced lot, other houses and other cities stay");
const lowOnline = [...others, ...[4000, 5000, 6000, 7000].map((p, i) => row("bringatrailer", "Anywhere", `2025-02-0${i + 1}`, p, 0))];
ok(bulkSaleAside(lowOnline).size === 0, "cheap online sales (not a house event) are never touched");
const driven = [...others, ...junk.map(r => ({ ...r, id: ++id, mileage: 51000 }))];
ok(bulkSaleAside(driven).size === 0, "a house event whose cheap lots carry real mileage is a cheap sale, not a bulk sale of project cars");
const mixed = [...others, ...[160000, 170000, 180000, 20000].map((p, i) => row("rmsothebys", "Los Angeles", "2024-10-26", p, 0))];
ok(bulkSaleAside(mixed).size === 0, "one cheap lot among normal lots of an event is left alone (share under 60 percent)");
ok(bulkSaleAside([...junk, ...real]).size === 0, "with too few other sales to give a reference, nothing is set aside");
const tooFew = [...others, row("rmsothebys", "Los Angeles", "2024-10-26", 5000, 0), row("rmsothebys", "Los Angeles", "2024-10-26", 6000, 0)];
ok(bulkSaleAside(tooFew).size === 0, "two cheap lots are not an event");
console.log(failed ? `bulkSaleCheck: ${failed} FAILED.` : "bulkSaleCheck: all passed.");
process.exit(failed ? 1 : 0);
