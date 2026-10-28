// e96 part 4: the gearbox word comes from one table (lib/modelRules.js GEARBOX_WORDS) by make, model, year and generation: SMG, DCT, Tiptronic, PDK, F1, E-Gear, Sportshift, otherwise Automatic.
// Fails on any "Automatic" for a keyed generation and on "PDK" for a Tiptronic generation; the option line and the chip on the engine and the listing label on Find read the same table.
//   node scripts/gearboxWordCheck.mjs [repo root]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
let rows = [], n = 0; let MK = "Testmake"; const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
const sale = (model, body, tx, price, ago) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "pa" + n, sale_price: price, sale_date: day(ago), platform: "Bring a Trailer", source_slug: "bringatrailer", make: MK, model, year: 2001,
  listing_title: `2001 ${MK} ${model} ${body}${tx ? " " + tx : ""}`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(30000 + n * 300), body_style: body, modifications: null, title: `2001 ${MK} ${model} ${body}`, currency: "USD", transmission: tx || null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
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
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k", qelig: "compute" };
const ask = async (model, asked = 2) => (await E.oneEngineAnswer({ make: MK, model, trim: "", year: 2001, bodyStyle: null }, null, `2001 ${MK} ${model}`, { ...env, asked }, null)).raw;   // asked 2: the question cap is spent, so the pooled result with its option lines is what the engine answers
const hasPooled = a => !!(a.cluster || (a.raw && a.raw.cluster));
const chart = a => { const t = a.trend || (a.raw && a.raw.trend); return !!(t && ((t.movement && t.movement.buckets && t.movement.buckets.length) || (t.quarters && t.quarters.some(q => q.count >= 8)))); };
const fill = (model, plan) => { for (const [body, tx, base, count, agoStart] of plan) for (let i = 0; i < count; i++) sale(model, body, tx, base + (i % 5) * 400, agoStart + i * 9); };
const M = await import(pathToFileURL(path.join(root, "lib/modelRules.js")).href);
const S = await import(pathToFileURL(path.join(root, "lib/live/search.js")).href);
// make, model, year, generation code, the word (the warmed specs the Oct 28 sweep found printing "Automatic" or "PDK" for a paddle box)
const CASES = [
  ["BMW", "M3", 2003, "e46-post", "SMG"], ["BMW", "M3", 2004, "e46-post", "SMG"], ["BMW", "M3", 2001, "e46", "SMG"], ["BMW", "M5", 2006, null, "SMG"],
  ["BMW", "M3", 2011, "E93", "DCT"], ["BMW", "M3", 2013, "E92", "DCT"], ["BMW", "M4", 2016, "F83", "DCT"], ["BMW", "M4", 2017, "F83", "DCT"],
  ["BMW", "M3", 1999, "e36", "Automatic"], ["BMW", "325i", 1992, null, "Automatic"], ["BMW", "Z4", 2007, null, "Automatic"],
  ["Porsche", "911", 1995, "993", "Tiptronic"], ["Porsche", "911", 1999, "996", "Tiptronic"], ["Porsche", "911", 2001, "996", "Tiptronic"], ["Porsche", "911", 2004, "996", "Tiptronic"], ["Porsche", "996", 2000, "996", "Tiptronic"],
  ["Porsche", "911", 2005, "997.1", "Tiptronic"], ["Porsche", "997", 2009, "997.2", "PDK"], ["Porsche", "911", 2012, "991.1", "PDK"],
  ["Porsche", "Boxster", 1999, "986", "Tiptronic"], ["Porsche", "Boxster", 2002, "986", "Tiptronic"], ["Porsche", "Cayman", 2006, "987.1", "Tiptronic"], ["Porsche", "Cayman", 2008, "987.1", "Tiptronic"],
  ["Porsche", "928", 1987, null, "Automatic"], ["Porsche", "944", 1988, null, "Automatic"],
  ["Ferrari", "F430", 2007, null, "F1"], ["Ferrari", "360", 2002, null, "F1"], ["Ferrari", "599", 2008, null, "F1"],
  ["Lamborghini", "Gallardo", 2004, null, "E-Gear"], ["Lamborghini", "Gallardo", 2012, null, "E-Gear"], ["Lamborghini", "Murcielago", 2005, null, "E-Gear"],
  ["Aston Martin", "DB9", 2008, null, "Sportshift"],
  ["Acura", "NSX", 1991, null, "Automatic"], ["Chevrolet", "Corvette", 1998, "C5", "Automatic"], ["Jeep", "Wrangler", 2007, null, "Automatic"]
];
for (const [mk, md, y, g, want] of CASES) { const got = M.gearboxWordFor(mk, md, y, g); ok(`${y} ${mk} ${md}${g ? " " + g : ""}: ${want}`, got === want, `got ${got}`); }
ok("a Tiptronic generation never reads PDK (993, 996, 997.1, 986, 987.1)", [["Porsche","911",1995,"993"],["Porsche","911",2001,"996"],["Porsche","911",2005,"997.1"],["Porsche","Boxster",2000,"986"],["Porsche","Cayman",2007,"987.1"]].every(c => M.gearboxWordFor(...c) !== "PDK"));
// the engine's own option: a 2001 BMW M3 names its non-manual box SMG, never Automatic
rows = [];
MK = "BMW"; for (let i = 0; i < 14; i++) { sale("M3", "Coupe", "Manual", 21000 + i * 1100, 5 + i * 7); sale("M3", "Coupe", "Automatic", 18000 + i * 710, 8 + i * 7); }
const a = await ask("M3");
const gbo = (a.options || []).concat((a.refineOptions || [])).filter(o => o.dimension === "gearbox");
ok("engine: the M3 gearbox option is labelled SMG", gbo.length === 2 && gbo.some(o => o.label === "SMG") && gbo.every(o => o.label !== "Automatic"), JSON.stringify(gbo.map(o => o.label)));
ok("engine: the option line reads SMG", (a.optionLines || []).some(l => /^SMG /.test(l)) && !(a.optionLines || []).some(l => /Automatic/.test(l)), JSON.stringify(a.optionLines));
// Find's listing label
const lf = r => S.listingFacts({ ...r, price: 20000 }).gearboxLabel;
ok("Find: a 2003 BMW M3 listing with an SMG title reads SMG", lf({ make: "BMW", model: "M3", year: 2003, title: "2003 BMW M3 SMG", listing_title: "2003 BMW M3 SMG", transmission: "Automatic" }) === "SMG");
ok("Find: a 2001 Porsche 911 listing that says Automatic reads Tiptronic", lf({ make: "Porsche", model: "911", year: 2001, title: "2001 Porsche 911 Carrera", listing_title: "2001 Porsche 911 Carrera", transmission: "Automatic" }) === "Tiptronic");
ok("Find: a Chevrolet listing that says Automatic stays Automatic", lf({ make: "Chevrolet", model: "Corvette", year: 1998, title: "1998 Chevrolet Corvette", listing_title: "1998 Chevrolet Corvette", transmission: "Automatic" }) === "Automatic");
// the class: the engine source no longer carries a hardcoded "Automatic" label for an option
const src = fs.readFileSync(path.join(root, "lib/onebox.js"), "utf8");
ok("class: no hardcoded \"Automatic\" fallback label in the pooled option builder", !/: "Automatic";\s*$/m.test(src.split("\n").filter(l => /const lbl = /.test(l)).join("\n")) && !/return "Automatic";/.test(src.slice(src.indexOf("function autoGearboxLabel"), src.indexOf("function autoGearboxLabel") + 400)));
console.log(failed ? `gearboxWordCheck: ${failed} FAIL` : "gearboxWordCheck: all PASS");
process.exit(failed ? 1 : 0);
