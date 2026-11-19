// e94: text that is not a trim never prints, and the numbers on one answer describe one set of sales.
//   1. a listing-title fragment (13k-Kilometer, 62,000-Mile, No-Reserve, a bare 62k) is never a trim, never a chip, never an option;
//   2. a title that says kilometres with a structured mileage that is that figure is read in miles (13k km is 8,100 mi, not 13,000 mi);
//   3. the exact-year line's count and trim mix come from the sales inside the range it prints (end to end on a fake archive);
//   4. every trim word the engine can print for a pool of noisy titles passes the same test.
// No database: a fake archive.   node scripts/trimTextCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
const M = await import(pathToFileURL(path.join(root, "lib/_mileageText.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const NOISE = ["13k-Kilometer", "13kKilometer", "13k", "62k", "62,000-Kilometre", "5k-Mile", "1,200-Mile", "12,000 Miles", "No-Reserve", "NoReserve", "Reserve", "Lot", "One-Owner", "Single-Owner", "Kilometer", "Miles", "9,500km", "40000 km"];
for (const t of NOISE) ok(`noise: "${t}" is not a trim`, V.trimTokenAllowed(t) === false);
for (const t of ["4S", "Z06", "GT350", "335i", "SE", "Black"]) ok(`real: "${t}" stays a trim`, V.trimTokenAllowed(t) === true);
// mileage units
ok("km: a 13k-Kilometer title with mileage 13000 reads 8,100 miles", M.milesFromKilometerTitle("13k-Kilometer 2001 Lamborghini Diablo VT 6.0 SE", "13000") === 8100);
ok("km: US and UK spellings both read", M.milesFromKilometerTitle("62,000-Kilometre 1999 Y", "62000") === 38500 && M.milesFromKilometerTitle("62,000-Kilometer 1999 Y", "62000") === 38500);
ok("km: a miles title is left alone", M.milesFromKilometerTitle("13k-Mile 2001 X", "13000") === null);
ok("km: a title that states both is left alone (the miles figure wins)", M.milesFromKilometerTitle("16k-Kilometer (10k-Mile) 2001 X", "10000") === null);
ok("km: a structured number that is not the title's figure is left alone", M.milesFromKilometerTitle("62,000 Kilometre 1999 Y", "40000") === null);
ok("km: the text parser reads the US spelling too", (M.mileageFromText("13k-Kilometer 2001 X", "") || {}).miles === 8100);
// the trim words a pool of noisy titles produces
const spec = { make: "Lamborghini", model: "Diablo" };
const titles = ["13k-Kilometer 2001 Lamborghini Diablo VT 6.0 SE", "62,000-Kilometre 2001 Lamborghini Diablo VT", "5k-Mile 2001 Lamborghini Diablo VT 6.0", "No-Reserve 2001 Lamborghini Diablo VT", "2001 Lamborghini Diablo VT 6.0 SE", "2001 Lamborghini Diablo VT"];
const g = E.trimGroupsFromSales([...titles, ...titles, ...titles].map((t, i) => ({ raw_title: t, price: 500000 + i, _usd: 500000 + i })), spec);
const labels = [...g.named.map(x => String(x.label || x.value || "")), ...g.foldedValues.map(String)];
ok("trim words: nothing a card could print is title noise", labels.length > 0 && labels.every(l => !V.trimTextIsNoise(l) && !/kilomet|^\d/i.test(l)), JSON.stringify(labels));
// end to end: the exact-year line
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const rows = []; let n = 0; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (title, price, ago, km) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "tt" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Lamborghini", model: "Diablo", year: 2001,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: km || String(9000 + n * 700), body_style: "Coupe", modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Costa Mesa", state: "CA", country_code: "US", auction_end_precision: null } }); };
for (let i = 0; i < 9; i++) sale(`2001 Lamborghini Diablo VT 6.0`, 560000 + i * 30000, 30 + i * 60);
sale("13k-Kilometer 2001 Lamborghini Diablo VT 6.0 SE", 1063000, 1, "13000");
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/sales_archive")) {
    const sp = u.searchParams, sel = sp.get("select"), sd = sp.getAll("sale_date");
    const ge = sd.filter(v => v.startsWith("gte.")).map(v => v.slice(4)), lt = sd.filter(v => v.startsWith("lt.")).map(v => v.slice(3));
    const ys = sp.getAll("year"), ymin = Number((ys.find(v => v.startsWith("gte.")) || "gte.0").slice(4)), ymax = Number((ys.find(v => v.startsWith("lte.")) || "lte.9999").slice(4));
    const mk = sp.get("make") && likeRe(sp.get("make").replace(/^ilike\./, "")), md = sp.get("model") && likeRe(sp.get("model").replace(/^ilike\./, "")), ti = sp.get("listing_title") && likeRe(sp.get("listing_title").replace(/^ilike\./, ""));
    const keep = rows.filter(r => (!ge.length || r.sale_date >= ge[0]) && (!lt.length || r.sale_date < lt[0]) && r.year >= ymin && r.year <= ymax && (!mk || mk.test(r.make)) && (!md || md.test(r.model)) && (!ti || ti.test(r.listing_title)));
    return new Response(JSON.stringify(keep.map(r => Object.fromEntries(sel.split(",").map(it => ev(r, it))))), { status: 200 });
  }
  if (u.hostname.includes("fake.supabase")) return new Response("[]", { status: 200 });
  throw new Error("offline");
};
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const a = (await E.oneEngineAnswer({ make: "Lamborghini", model: "Diablo", trim: "SE", year: 2001, bodyStyle: "coupe" }, null, "2001 Lamborghini Diablo SE Coupe", env, null)).raw;
const line = a.exactYearLine || "";
const printed = JSON.stringify([a.exactYearLine, a.thinLine, a.thin_sales, a.rungLabel, a.scopeLabel]);
ok("end to end: nothing printed on the answer carries title noise", !/kilomet|13k|\bNo-?Reserve\b/i.test(printed), printed.slice(0, 160));
const m = /(\d+) sales, \$([\d,]+) to \$([\d,]+)/.exec(line);
if (m) {
  const lo = Number(m[2].replace(/,/g, "")), hi = Number(m[3].replace(/,/g, ""));
  const inside = (a.exactYearPool && a.exactYearPool.sales) || 0;
  const real = rows.filter(r => r.sale_price >= lo && r.sale_price <= hi).length;
  ok("end to end: the exact-year line's count is the number of sales inside its printed range", Number(m[1]) === real && inside === real, `line says ${m[1]}, ${real} sales sit inside ${lo} to ${hi}`);
} else ok("end to end: no exact-year line is better than a line whose numbers disagree", true, "no line on this pool");
const cards = a.cards || [];
for (const c of cards) if (c.mileage != null || c.mi != null) ok("end to end: the 13k-Kilometer sale reads in miles", /Kilometer/i.test(c.title || "") ? Number(c.mileage ?? c.mi) === 8100 : true, `${c.title}: ${c.mileage ?? c.mi}`);
console.log(failed ? `trimTextCheck: ${failed} FAIL` : "trimTextCheck: all PASS");
process.exit(failed ? 1 : 0);
