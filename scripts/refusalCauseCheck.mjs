// e94: the wrong refusals among Find's blank BMW cards, as classes (Lane C's re-sort, Oct 27 2026). An honest "no sales" stays honest; a refusal
// whose only cause is a letter the gate did not know, or a typed word that is not a trim, is not a refusal.
//   1. drive-train and length letters after a model number or code: 750Li and 740Li are the 750i and 740i, 535xi the 535i, S550L the S550, E320L the E320;
//   2. a typed word that is not a trim (F12, E34, G16, Touring, Swap, Press, Ex, a BMW Turbo) is not a dropped trim;
//   3. real swaps still refuse (a 330i pool for a 325i, a 750 pool for a 740, a 911 pool for a 996);
//   4. a refusal always carries its refusal_line, and the car data has the M Coupe and E9 badges.
//   node scripts/refusalCauseCheck.mjs [repo root]
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
const VD = await import(pathToFileURL(path.join(root, "lib/vehicleData.js")).href);
const { runOutputInvariants, nonTrimWordHonoured } = E;
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const card = (make, model, title) => ({ make, model, title, price: 10000, platform: "Bring a Trailer" });
const gate = (cards, v) => runOutputInvariants({ tier: "result", rawPool: cards, cards, fallbackRung: "model" }, v).find(x => x.name === "receipts_carry_resolved_car");
const CASES = [
  ["BMW", "750i", "7-Series", ["2013 BMW 750Li", "2013 BMW 750i", "2012 BMW 750Li xDrive", "2010 BMW 750Li"]],
  ["BMW", "740i", "7-Series", ["2013 BMW 740Li", "2011 BMW 740i", "2012 BMW 740Li"]],
  ["BMW", "535i", "5-Series", ["2008 BMW 535xi", "2009 BMW 535xi Wagon", "2010 BMW 535i"]],
  ["BMW", "325i", "3-Series", ["2006 BMW 325xi Sedan", "2006 BMW 325i Sedan"]],
  ["BMW", "335d", "3-Series", ["2010 BMW 335d", "2011 BMW 335d"]],
  ["Mercedes-Benz", "S550", "S-Class", ["2008 Mercedes-Benz S550L", "2010 Mercedes-Benz S550 4MATIC", "2009 Mercedes-Benz S550"]],
  ["Mercedes-Benz", "E320", "E-Class", ["2003 Mercedes-Benz E320L", "2004 Mercedes-Benz E320 Wagon", "2002 Mercedes-Benz E320"]]
];
for (const [mk, model, col, titles] of CASES) {
  const g = gate(titles.map(t => card(mk, col, t)), { make: mk, model });
  ok(`letters: ${mk} ${model} pool with ${titles.join(", ")} stands`, g && g.ok === true, g && g.detail);
}
for (const [mk, model, titles] of [["BMW", "325i", ["2006 BMW 330i", "2006 BMW 330xi", "2007 BMW 330i"]], ["BMW", "740i", ["2010 BMW 750Li", "2011 BMW 750i", "2012 BMW 750Li"]], ["Mercedes-Benz", "S550", ["2008 Mercedes-Benz S600", "2007 Mercedes-Benz S65 AMG", "2009 Mercedes-Benz S63 AMG"]]]) {
  const g = gate(titles.map(t => card(mk, "other", t)), { make: mk, model });
  ok(`swap: ${mk} ${model} pool of ${titles[0]} and its neighbours still refuses`, g && g.ok === false, g && g.detail);
}
for (const [mk, w] of [["BMW", "F12"], ["BMW", "E34"], ["BMW", "G16"], ["Mercedes-Benz", "W124"], ["Audi", "B5"], ["BMW", "Touring"], ["Audi", "Avant"], ["BMW", "Swap"], ["BMW", "Press"], ["BMW", "Ex"], ["BMW", "Turbo"]]) {
  const real = mk === "Audi" && w === "B5" ? false : true;
  ok(`typed word: ${mk} "${w}" ${real ? "is not a trim" : "is left to the older rules"}`, nonTrimWordHonoured({ make: mk, model: "M3" }, w) === real);
}
ok("typed word: a Porsche Turbo is a trim", nonTrimWordHonoured({ make: "Porsche", model: "911" }, "Turbo") === false);
ok("typed word: a BMW 2002 Turbo is a trim", nonTrimWordHonoured({ make: "BMW", model: "2002" }, "Turbo") === false);
ok("typed word: GT3 is a trim", nonTrimWordHonoured({ make: "Porsche", model: "911" }, "GT3") === false);
ok("typed word: CSL is a trim", nonTrimWordHonoured({ make: "BMW", model: "M3" }, "CSL") === false);
const names = JSON.stringify(Object.values(VD).filter(Array.isArray)).toLowerCase();
ok("car data: the M Coupe and the 3.0 CS badges are aliases", names.includes('"alias":"m coupe"') && names.includes('"alias":"3.0cs"'));
// 5. an "all years" read never crosses to a different generation (the 2026 M850i read the 1991 to 1999 850i)
{
  const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
  const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
  const rows = []; let n = 0; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
  const sale = (year, price, ago) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "rc" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: "Acme", model: "Gen", year, listing_title: `${year} Acme Gen Coupe`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
    raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(9000 + n * 700), body_style: "Coupe", modifications: null, title: `${year} Acme Gen Coupe`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
  for (let i = 0; i < 9; i++) sale(1991 + (i % 4), 25000 + i * 600, 20 + i * 30);
  for (let i = 0; i < 6; i++) sale(2019 + (i % 4), 90000 + i * 1500, 20 + i * 30);
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
  const a = (await E.oneEngineAnswer({ make: "Acme", model: "Gen", trim: "", year: 2026, bodyStyle: null }, null, "2026 Acme Gen", env, null)).raw;
  const yrs = (a.rawPool || []).map(r => Number(r.year));
  ok("generation: a 2026 car with no 2026 sales never reads the cars of 1991 to 1994", yrs.every(y => y >= 2019), `tier ${a.tier}, pool years ${[...new Set(yrs)].sort().join(",")}`);
  ok("generation: nearestYearBlock keeps the block nearest the typed year", E.nearestYearBlock([1991, 1992, 1999, 2019, 2021].map(y => ({ year: y })), 2026).map(r => r.year).join(",") === "2019,2021");
}
// 6. a BMW chassis code next to the model is the generation, not a second model word (the 2019 BMW M850i G16 resolved to no model)
{
  const V = await import(pathToFileURL(path.join(root, "lib/vehicle.js")).href);
  const words = (t, y) => V.removeKnownNoise(t, "BMW", y, []);
  ok("resolver words: M850i G16 reads as M850i", words("2019 BMW M850i G16", "2019") === "M850i", words("2019 BMW M850i G16", "2019"));
  ok("resolver words: F12 M6 Convertible reads as M6 Convertible", words("2014 BMW F12 M6 Convertible", "2014") === "M6 Convertible");
  ok("resolver words: E34 M5 Touring reads as M5 Touring", words("1994 BMW E34 M5 Touring", "1994") === "M5 Touring");
  ok("resolver words: a lone code is kept (BMW E30)", words("BMW E30", null) === "E30");
  ok("resolver words: another make is untouched", V.removeKnownNoise("2004 Mazda F12", "Mazda", "2004", []) === "F12");
}
console.log(failed ? `refusalCauseCheck: ${failed} FAIL` : "refusalCauseCheck: all PASS");
process.exit(failed ? 1 : 0);
