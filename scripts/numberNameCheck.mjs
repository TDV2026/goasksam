// e95: a car titled by its NUMBER (the 1985 Land Rover 110, the Land Rover 90 and 130, the Mercedes-Benz 300GD) while the archive files it under its model
// (Defender, G-Class) is that car. The output gate (receipts_carry_resolved_car) must not call the pool swapped. Controls: cars whose titles carry the model word
// (Range Rover Sport, Ram 1500, F-150, F-250, Silverado 1500, Series III 109) still pass, and a pool of another model's sales (Senna under Speedtail) still fails.
// Fake archive, no database.   node scripts/numberNameCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (make, model, year, title, price, ago) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "nn" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make, model, year,
  listing_title: title, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(40000 + n * 500), body_style: null, modifications: null, title, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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
const ask = async (make, model, trim, year, text) => (await E.oneEngineAnswer({ make, model, trim, year, bodyStyle: null }, null, text, env, null)).raw;
const gate = a => a.tier === "refusal" && a.refusal && /invariant/.test(String(a.refusal.kind)) ? (a.refusal.failedChecks || []).join(",") : null;
const pool = (make, model, year, names, base) => { rows = []; for (let i = 0; i < 12; i++) sale(make, model, year, `${year} ${names[i % names.length]}`, base + i * 700, 20 + i * 12); };
// the numbered cars: titled by number, filed under the model
const NUM = [
  ["Land Rover", "Defender", "110", 1985, ["Land Rover 110 Pickup Diesel 5-Speed", "Land Rover 110", "Land Rover 110 V8 5-Speed"], 36000, "1985 Land Rover Defender 110"],
  ["Land Rover", "Defender", "90", 1986, ["Land Rover 90 County", "Land Rover 90 Diesel 5-Speed", "Land Rover 90"], 40000, "1986 Land Rover Defender 90"],
  ["Land Rover", "Defender", "130", 1988, ["Land Rover 130 Crew Cab", "Land Rover 130 Pickup", "Land Rover 130"], 34000, "1988 Land Rover Defender 130"],
  ["Mercedes-Benz", "G-Class", "", 1990, ["Mercedes-Benz 300GD Wagon", "Mercedes-Benz 460 GE", "Mercedes-Benz 300GD"], 60000, "1990 Mercedes-Benz G-Class"]
];
// controls: the title carries the model word
const CTL = [
  ["Land Rover", "Series III", "109", 1980, ["Land Rover Series III 109", "Land Rover Series III 109 Station Wagon", "Land Rover Series III 109 Pickup"], 24000, "1980 Land Rover Series III 109"],
  ["Land Rover", "Range Rover Sport", "", 2015, ["Land Rover Range Rover Sport Supercharged", "Land Rover Range Rover Sport HSE", "Land Rover Range Rover Sport"], 30000, "2015 Land Rover Range Rover Sport"],
  ["Ram", "1500", "", 2019, ["Ram 1500 Rebel", "Ram 1500 Laramie", "Ram 1500 Big Horn"], 35000, "2019 Ram 1500"],
  ["Ram", "2500", "", 2018, ["Ram 2500 Power Wagon", "Ram 2500 Laramie", "Ram 2500 Tradesman"], 44000, "2018 Ram 2500"],
  ["Ford", "F-150", "", 2017, ["Ford F-150 Raptor", "Ford F-150 Lariat", "Ford F-150 XLT"], 38000, "2017 Ford F-150"],
  ["Ford", "F-250", "", 2000, ["Ford F-250 Super Duty", "Ford F-250 Lariat", "Ford F-250 XLT"], 22000, "2000 Ford F-250"],
  ["Chevrolet", "Silverado 1500", "", 2005, ["Chevrolet Silverado 1500 LT", "Chevrolet Silverado 1500 Z71", "Chevrolet Silverado 1500 SS"], 18000, "2005 Chevrolet Silverado 1500"]
];
for (const [label, set] of [["titled by number", NUM], ["title carries the model word", CTL]]) for (const [make, model, trim, year, names, base, text] of set) {
  pool(make, model, year, names, base);
  const a = await ask(make, model, trim, year, text);
  // the G-Class: the pool is found by the engine's own title fence, which is a separate layer; here only the output gate is judged
  ok(`${label}: ${text} is not refused by the output gate`, !gate(a) && (model === "G-Class" || /^(result|thin|body_choice|gearbox_choice|variant_choice|generation_choice)$/.test(a.tier)), `tier ${a.tier} ${gate(a) || ""}`);
}
// the negative control: another model's sales filed under this model are still a swapped pool
rows = []; for (let i = 0; i < 12; i++) sale("Lamborghini", "Murcielago", 2010, `2010 Lamborghini Gallardo LP560-4 ${i}`, 150000 + i * 900, 20 + i * 12);
{ const a = await ask("Lamborghini", "Murcielago", "", 2010, "2010 Lamborghini Murcielago"); ok("control: a pool of Gallardo sales filed under Murcielago is still refused", a.tier === "refusal" || (a.tier === "thin" && !a.cluster) || !!gate(a), `tier ${a.tier} ${gate(a) || ""}`); }
// the G-Wagen (chassis codes 460 and 463) is the G-Class: "G-Wagen" used to read as the model "Wagen" and refuse
{ const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
  for (const q of ["1990 Mercedes-Benz G-Wagen 460", "1992 Mercedes-Benz G-Wagen 463", "1990 Mercedes G-Wagon"]) { const r = await V.resolveVehicle(q, {}).catch(() => null); const v = r && r.vehicle;
    ok(`resolver: "${q}" is the Mercedes-Benz G-Class`, !!v && v.make === "Mercedes-Benz" && v.model === "G-Class", v ? `${v.make} ${v.model}` : "no vehicle"); } }
console.log(failed ? `numberNameCheck: ${failed} FAIL` : "numberNameCheck: all PASS");
process.exit(failed ? 1 : 0);
