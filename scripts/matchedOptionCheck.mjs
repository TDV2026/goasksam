// e99: a title or typed words that name one of the answer's options (gearbox word, body, edition, mileage band) make that option the one the engine marks and sends first (matchedOption).
//   node scripts/matchedOptionCheck.mjs [repo root]
import path from "path"; import { fileURLToPath, pathToFileURL } from "url";
const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const E = await import(pathToFileURL(path.join(root, "lib/onebox.js")).href);
let failed = 0; const ok = (n, c, d) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  " + d : ""}`); };
let MAKE="Porsche", MODEL="Boxster";
let rows = [], n = 0;
const sale = (year, date, price, mi, title) => { n++; rows.push({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), source_id: "rw" + n, sale_price: price, sale_date: date, platform: "Bring a Trailer", source_slug: "bringatrailer", make: MAKE, model: MODEL, year, listing_title: title || `${year} Datsun 240Z`, vin_norm: "V" + n, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: null, vehicle_type: "car", sale_price_usd: price,
  raw_record: { featured_image_url: "https://x/i.jpg", mileage: String(mi || 60000), body_style: null, modifications: null, title: title || `${year} Datsun 240Z`, currency: "USD", transmission: null, exterior_color: null, title_status: null, url: "https://u/" + n, source_url: null, city: "Austin", state: "TX", country_code: "US", auction_end_precision: null } }); };
const ev = (row, it) => { const ci = it.indexOf(":"); const alias = ci > 0 && it[ci + 1] !== ":" ? it.slice(0, ci) : null; const expr = alias ? it.slice(ci + 1) : it; if (expr.startsWith("raw_record->>")) { const k = expr.slice(13); const v = row.raw_record[k]; return [alias || k, v == null ? null : String(v)]; } return [alias || expr, row[expr] === undefined ? null : row[expr]]; };
const likeRe = v => new RegExp("^" + String(v).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
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
const day = i => new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);

const matchedOf = E.matchedOptionOf || (() => null);
ok("matchedOptionOf exists in the engine", typeof E.matchedOptionOf === "function");
// a stored-style answer: read bare (no option word), then ask which option the listing's words match
const stored = async (make, model, trim, year, mk) => { MAKE = make; MODEL = model; rows = []; mk(); const a = await E.oneEngineAnswer({ make, model, trim, year, bodyStyle: null }, null, `${year} ${make} ${model}${trim ? " " + trim : ""}`, env, null); return a.raw; };
const dayN = i => day(10 + i * 9);
const two = (year, titleA, titleB, priceA, priceB) => () => { for (let i = 0; i < 10; i++) sale(year, dayN(i), priceA + i * 700, 40000, titleA); for (let i = 0; i < 10; i++) sale(year, dayN(i) , priceB + i * 700, 40000, titleB); };
const lead = (d, title, ctx) => { const m = matchedOf(d, title, ctx || {}); return m && m.matchedOption ? { first: m.options[0].value, line0: m.optionLines[0], mo: m.matchedOption } : null; };
const CASES = [
  ["2014 Porsche Boxster S PDK", "Porsche", "Boxster", "S", 2014, "2014 Porsche Boxster S 6-Speed Manual", "2014 Porsche Boxster S PDK", 33000, 31000, "auto", "gearbox"],
  ["2014 Porsche Boxster S 6-Speed Manual", "Porsche", "Boxster", "S", 2014, "2014 Porsche Boxster S 6-Speed Manual", "2014 Porsche Boxster S PDK", 33000, 31000, "manual", "gearbox"],
  ["2010 BMW M3 PDK", "BMW", "M3", "", 2010, "2010 BMW M3 6-Speed Manual", "2010 BMW M3 DCT", 60000, 56000, "auto", "gearbox"],
  ["2002 BMW M3 SMG", "BMW", "M3", "", 2002, "2002 BMW M3 6-Speed Manual", "2002 BMW M3 SMG", 30000, 27000, "auto", "gearbox"],
  ["2002 BMW M3 6-Speed Manual", "BMW", "M3", "", 2002, "2002 BMW M3 6-Speed Manual", "2002 BMW M3 SMG", 30000, 27000, "manual", "gearbox"],
  ["1995 911 Cabriolet", "Porsche", "911", "Carrera", 1995, "1995 Porsche 911 Carrera Coupe", "1995 Porsche 911 Carrera Cabriolet", 75000, 82000, "open", "body"],
  ["1995 911 Coupe", "Porsche", "911", "Carrera", 1995, "1995 Porsche 911 Carrera Coupe", "1995 Porsche 911 Carrera Cabriolet", 75000, 82000, "coupe", "body"],
  ["1997 Defender 110 Station Wagon", "Land Rover", "Defender", "110", 1997, "1997 Land Rover Defender 110 Station Wagon", "1997 Land Rover Defender 110 Pickup", 52000, 45000, "wagon", "body"],
  ["1997 Defender 110 Pickup", "Land Rover", "Defender", "110", 1997, "1997 Land Rover Defender 110 Station Wagon", "1997 Land Rover Defender 110 Pickup", 52000, 45000, "pickup", "body"]
];
for (const [name, make, model, trim, year, ta, tb, pa, pb, want, dim] of CASES) {
  const d = await stored(make, model, trim, year, two(year, ta, tb, pa, pb));
  const hasDim = Array.isArray(d.options) && d.options.length >= 2 && d.headlineDimension === dim;
  // the Defender gap is closed (Oct 29 2026): wagon, pickup and the other bodies are in the one body vocabulary (lib/bodyWords.js), so a station wagon and a pickup are offered and marked like any body
  ok(`${name}: the bare answer carries the ${dim} options`, hasDim, `${d.tier} ${d.optionsState} ${d.headlineDimension} ${JSON.stringify((d.options || []).map(o => [o.value, o.n]))}`);
  const r = lead(d, name);
  ok(`${name}: the engine marks ${want} and sends it first`, !!r && r.mo.value === want && r.first === want && r.mo.dimension === dim && String(r.line0).length > 0, JSON.stringify(r && r.mo));
}
// a listing that names no option leaves the order alone
{ const d = await stored("Porsche", "Boxster", "S", 2014, two(2014, "2014 Porsche Boxster S 6-Speed Manual", "2014 Porsche Boxster S PDK", 33000, 31000));
  ok("a title that names no gearbox marks nothing", matchedOf(d, "2014 Porsche Boxster S", {}) == null); }
// edition and mileage band, on a handmade answer
{ const d = { options: [{ dimension: "edition", label: "Speedster", value: "speedster", n: 6, low: 1, high: 2 }, { dimension: "edition", label: "Carrera", value: "carrera", n: 9, low: 1, high: 2 }], headlineDimension: "edition", optionsState: "alike", refineOptions: [], optionLines: [], headlineLines: [] };
  const m = matchedOf(d, "1989 Porsche 911 Carrera Speedster", {});
  ok("edition: the longest edition word in the title leads", m && m.options[0].value === "speedster" || false, JSON.stringify(m && m.matchedOption));
  const d2 = { options: [{ dimension: "mileage", label: "Under 50,000 miles", value: "lt50", n: 8 }, { dimension: "mileage", label: "50,000 to 100,000 miles", value: "50to100", n: 9 }], headlineDimension: "mileage", optionsState: "split", refineOptions: [], optionLines: [], headlineLines: [] };
  const m2 = matchedOf(d2, "x", { listingMiles: 72000 });
  ok("mileage band: the listing's own band leads", m2 && m2.options[0].value === "50to100", JSON.stringify(m2 && m2.matchedOption)); }

// e101 (Sam, Oct 29 2026, the live 2011 BMW M3 Convertible, BaT, 64,000 miles): the card showed a Manual chip and the Sam box said "the listing does not say which". CAUSE: the matcher read the listing's TITLE
// only; the chip comes from the listing's transmission FIELD ("Manual (6-speed)"), which the matcher never saw. Now any option the listing names in its title, its chips (the gearbox and body the card states)
// or its fields (transmission, body) is matched. Class: every dimension (gearbox, body, edition) and every route (the matcher, the Find answer).
{
  const mk = (dimension, opts) => ({ tier: "result", optionsState: "split", headlineDimension: dimension, poolN: opts.reduce((t, o) => t + o.n, 0), cluster: null, windowWords: "since June 2025", rawPool: [],
    options: opts.map(o => ({ dimension, low: 40000, high: 60000, rangeFloor: false, ...o })), refineOptions: [] });
  const tx = mk("gearbox", [{ label: "Manual", value: "manual", n: 9 }, { label: "DCT", value: "auto", n: 11 }]);
  const title = "2011 BMW M3 Convertible";
  const byField = E.matchedOptionOf(tx, title, { year: 2011, fields: "Manual (6-speed) Convertible" });
  ok("gearbox named only in the listing's transmission field is matched", byField && byField.matchedOption && byField.matchedOption.value === "manual", byField && byField.matchedOption && byField.matchedOption.label);
  const byChip = E.matchedOptionOf(tx, title, { year: 2011, gearbox: "manual" });
  ok("gearbox the card states as a chip (facts.gearbox) is matched", byChip && byChip.matchedOption && byChip.matchedOption.value === "manual");
  const byAuto = E.matchedOptionOf(tx, title, { year: 2011, fields: "Dual-Clutch Automatic" });
  ok("an automatic named in the field matches the automatic option, not the manual one", byAuto && byAuto.matchedOption && byAuto.matchedOption.value === "auto");
  ok("a listing that states nothing is still unmatched", E.matchedOptionOf(tx, title, { year: 2011, fields: "", gearbox: null }) === null);
  const bd = mk("body", [{ label: "Coupe", value: "coupe", n: 12 }, { label: "Convertible", value: "open", n: 9 }]);
  const byBody = E.matchedOptionOf(bd, "2011 BMW M3", { year: 2011, body: "convertible", fields: "Convertible" });
  ok("body named only in the listing's body field is matched", byBody && byBody.matchedOption && byBody.matchedOption.value === "open", byBody && byBody.matchedOption && byBody.matchedOption.label);
  const ed = mk("edition", [{ label: "Competition", value: "competition", n: 8 }, { label: "Base", value: "base", n: 12 }]);
  const byEd = E.matchedOptionOf(ed, "2011 BMW M3", { year: 2011, fields: "Competition Package" });
  ok("an edition named only in a field is matched", byEd && byEd.matchedOption && byEd.matchedOption.value === "competition");
  const fa = E.findAnswerOf(tx, { title, year: 2011, fields: "Manual (6-speed)", gearbox: "manual" });
  ok("the Find answer for that listing answers for the Manual option, never 'does not say which'", fa && fa.state !== "split_unsaid" && fa.option && fa.option.value === "manual" && !/does not say which/.test(JSON.stringify(fa.lines)), fa && JSON.stringify(fa.lines));
  const fa0 = E.findAnswerOf(tx, { title, year: 2011 });
  ok("a listing that states nothing still gets the split_unsaid line (the rule is not loosened)", fa0 && fa0.state === "split_unsaid");
}
process.exit(failed ? 1 : 0);
