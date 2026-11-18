// variantRowsCheck (Lane B, lane-b-variant-rows, Nov 17 2026; order bc85): Market Check serves the variants of an unstated car as rows (variantSplit), and each row is what Market Check shows when that row's car is asked for.
//  FOR EVERY FAMILY OF data/variantFamilies.json (Firebird, Camaro, Mustang, Corvette C4), through the real handler on a fake archive that holds the family's sales:
//   1 show is true for an unstated car whose variants sell apart: one row per variant in the data's order, the data's spelling, the line in Sam's voice, a car (token, words, address) on every row;
//   2 EVERY ROW EQUALS THE ANSWER FOR ITS OWN CAR: rangeText and salesText are the range and the sales count of the handler's answer when that row's car is asked for (the same engine read: pool, years, set asides), for every variant;
//   3 a variant with too few sales to price has its label and its own count and NO range; a variant with no sale says so; replicas and tributes are no row and no count; the sales that name no variant are no row;
//   4 a typed mileage: every row's car carries it (token, words, address) and every row equals the banded answer of its own car;
//   5 show is false for a stated variant, a family with no variant list, variants that do not sell apart, an answer that is not a range, a refined answer; the rows are never stored;
//   6 the sweep: for every family, one typical year, show and the rows (printed by --sweep).
//   node scripts/variantRowsCheck.mjs [repo root] [--sweep]      --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
process.env.SUPABASE_URL = "https://fake.example"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.SUPABASE_ANON_KEY = "k"; process.env.OLDCARSDATA_API_KEY = "x"; process.env.LAUNCH_STAGE = "2";
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 280) : "")); } };
const WLD = await imp("scripts/_deskOlderWorld.mjs"), OB = await imp("lib/onebox.js"), VH = await imp("lib/vehicle.js"), CT = await imp("lib/carToken.js"), CN = await imp("lib/countNoun.js");
let VR = null, SD = null;
try { VR = await imp("lib/variantRows.js"); } catch { VR = null; }
const log = console.log, err = console.error; console.error = () => {};
const w = WLD.install(ROOT), DAY = 864e5; let seq = 0;
let chain = Promise.resolve();   // one offline read at a time: it borrows the process environment and the fetch
const offline = text => { const run = chain.then(() => offline0(text)); chain = run.catch(() => {}); return run; };
const offline0 = async text => { const u = process.env.SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY, f0 = globalThis.fetch; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; globalThis.fetch = async () => new Response("[]", { status: 200 }); try { return await VH.resolveVehicle(text, {}); } finally { process.env.SUPABASE_URL = u; process.env.SUPABASE_SERVICE_ROLE_KEY = k; globalThis.fetch = f0; } };
const builtOf = (f, year) => f.variants.filter(v => !v.years || (year >= v.years[0] && year <= v.years[1]));   // the variants built in the asked year (the data's years per variant)
const FAMS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/variantFamilies.json"), "utf8")).families;
// the sales of a family: [variant name or "", count, base price]; the first variants get the lowest prices, each next one 1.4 times the one before
const PLAN = { "pontiac-firebird-3rd": { year: 1987, counts: [0, 8, 10, 9, 3, 0], unstated: 12 }, "chevrolet-camaro-3rd": { year: 1987, counts: [0, 9, 10, 8], unstated: 12 }, "ford-mustang-fox": { year: 1987, counts: [0, 3, 9, 10, 8], unstated: 12 }, "chevrolet-corvette-c4": { year: 1996, counts: [0, 9, 9], unstated: 12 } , "bmw-3-series-e30": { year: 1987, counts: [3, 9, 10, 9], unstated: 0 }, "porsche-911-1984-1989": { year: 1987, counts: [0, 9, 10, 8, 3, 9], unstated: 12 }, "mercedes-sl-r107": { year: 1980, counts: [3, 9, 10, 9, 8, 0], unstated: 0 }, "mercedes-sl-w113": { year: 1968, counts: [9, 10, 8], unstated: 0 },
  "porsche-964": { year: 1991, counts: [9, 10, 8, 9, 3, 0], unstated: 0 }, "porsche-993": { year: 1996, counts: [0, 9, 10, 8, 9, 3, 9], unstated: 12 }, "chevrolet-corvette-c5": { year: 2002, counts: [0, 10], unstated: 12 }, "chevrolet-corvette-c6": { year: 2011, counts: [0, 9, 10, 9], unstated: 12 },
  "ford-mustang-sn95": { year: 2003, counts: [10, 9, 8, 0], unstated: 0 }, "ford-mustang-s197": { year: 2012, counts: [10, 9, 8, 0], unstated: 0 } };
const TITLE = { "ZR-1": "ZR1" };   // the archive titles a ZR-1 'ZR1' as often as 'ZR-1', and the resolver's trim fence is ZR1 (a hyphen spelling does not match it: the known gap in CLAUDE.md, the resolver backlog)
const mkRows = (f, plan, { replicas = true, flat = false } = {}) => {
  const rows = [], model = f.models[0]; let k = 0, base = 9000; const add = (words, count, price) => { for (let i = 0; i < count; i++) { const id = "vr" + (seq++), title = `${plan.year} ${f.make} ${model}${words ? " " + words : ""}`;
    const raw = { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(15000 + i * 3500), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
    rows.push({ id, source_id: id, sale_price: Math.round((price + i * 53) / 500) * 500, sale_date: new Date(Date.now() - (40 + (k % 9) * 8) * DAY).toISOString().slice(0, 10), platform: k % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: title, year: plan.year, make: f.make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" }); k++; } };
  add("", plan.unstated, base); f.variants.forEach((v, i) => { base = flat ? base : Math.round(base * 1.12); add(TITLE[v.name] || v.name, plan.counts[i] || 0, base); });
  if (replicas) add(`${f.variants[f.variants.length - 1].name} Replica`, 3, base * 3);
  return rows;
};
const install = (model, rows) => { w.DATA.clear(); w.DATA.set(model, rows); VR && VR.__clearVariantRowsCache && VR.__clearVariantRowsCache(); };
process.env.CURTAIN_CREW_CODE = "variant-rows-check-code"; const { mintCrewCookieValue } = await imp("lib/_crew.js"); const CREW = () => "gas_crew=" + mintCrewCookieValue();   // the rows are the crew's (a visitor's answer carries none)
SD = (await imp("api/sellerDecision.js")).default; let nn = 0;
const hit = async (body, visitor = false) => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = b; return this; }, setHeader() {}, end() {}, getHeader() {} }; await SD({ method: "POST", headers: { origin: "https://goasksam.com", cookie: visitor ? "" : CREW() }, query: {}, body, socket: { remoteAddress: "10.4." + Math.floor(++nn / 250) + "." + (nn % 250) } }, res); return out; };
const asked = async (f, plan, text, miles) => { const r = RES.get(text), v = r && r.vehicle; if (!v) return null; const rv = { ...(VH.sanitizeResolvedVehicle(v) || v), ...(miles ? { mileage: miles } : {}) }; return hit({ oneBox: true, search: miles ? `${text} ${miles.toLocaleString("en-US")} miles` : text, car: { raw: text, vehicle: rv } }); };
const money = x => "$" + Math.round(Number(x)).toLocaleString("en-US");
const RES = new Map();   // the resolver's reading of every text the rows and the page use: what the real resolver gives on its lists (a trim for a variant it knows, none for one it drops: Firehawk, Berlinetta, Saleen, SVO), written out so no archive read ever runs beside a changed process environment
const TRIM = { "Firehawk": null, "20th Anniversary Turbo Trans Am": "20th Anniversary Turbo Trans Am", "GTA": "GTA", "Trans Am": "Trans Am", "Formula": "Formula", "Berlinetta": null, "IROC-Z": "IROC-Z", "Z28": "Z28", "RS": "RS", "Saleen": null, "SVO": null, "Cobra": "SVT Cobra", "GT": "GT", "LX": "LX", "ZR-1": "ZR1", "Grand Sport": "Grand Sport", "Collector Edition": "Edition", "Z06": "Z06", "ZR1": "ZR1", "Mach 1": "Mach 1", "Bullitt": "Bullitt", "Boss 302": "Boss 302", "Shelby GT500": "Shelby GT500", "318i": "318i", "325e": "325e", "325i": "325i", "325is": "325is", "280SL": "280SL", "230SL": "230SL", "250SL": "250SL", "350SL": "350SL", "380SL": "380SL", "450SL": "450SL", "500SL": "500SL", "560SL": "560SL", "Turbo": "Turbo", "Carrera 2": "Carrera 2", "Carrera 4": "Carrera 4", "Carrera S": "Carrera S", "4S": "4S", "Carrera": "Carrera" };   // what the real resolver reads as a trim (a trim it drops reads as no trim: Firehawk, Base); the live reads after the push show which of these the real resolver knows
for (const f of FAMS) { const plan = PLAN[f.id]; if (!plan) continue; const base = `${plan.year} ${f.make} ${f.models[0]}`, mk = (text, trim) => ({ status: "valid", vehicle: { raw: text, year: plan.year, make: f.make, model: f.models[0], trim, confidence: "high", canonicalLabel: [plan.year, f.make, f.models[0], trim].filter(Boolean).join(" ") } });
  RES.set(base, mk(base, null)); for (const v of f.variants) RES.set(`${base} ${v.ask || v.name}`, mk(`${base} ${v.ask || v.name}`, TRIM[v.name] === undefined ? null : TRIM[v.name]));
  for (const alt of f.models.slice(1)) { const b2 = `${plan.year} ${f.make} ${alt}`; RES.set(b2, mk(b2, null)); for (const v of f.variants) RES.set(`${b2} ${v.ask || v.name}`, mk(`${b2} ${v.ask || v.name}`, TRIM[v.name] === undefined ? null : TRIM[v.name])); } }
if (VR && VR.__setResolver) VR.__setResolver(async text => RES.get(text) || { status: "needs_clarification", vehicle: null });
// A SALE WITH TWO VARIANTS' WORDS READS AS THE MORE SPECIFIC (lane-b-variant-split): the titles where a list's own names collide, read by the one reader
{ const VV = await imp("lib/variants.js"), READS = [["porsche-911-1984-1989", "1987 Porsche 911 Turbo Cabriolet", "Turbo"], ["porsche-911-1984-1989", "1988 Porsche 911 Carrera Club Sport", "Club Sport"], ["porsche-911-1984-1989", "1986 Porsche 911 Carrera", "Carrera Coupe"], ["porsche-964", "1991 Porsche 964 Carrera 4 Targa", "Targa"], ["porsche-964", "1992 Porsche 964 Carrera RS", "RS"], ["porsche-964", "1991 Porsche 964 Carrera 2 Cabriolet", "Cabriolet"],
    ["porsche-993", "1996 Porsche 993 Carrera 4S", "4S"], ["porsche-993", "1996 Porsche 993 Carrera 4", "Carrera 4"], ["porsche-993", "1996 Porsche 993 Carrera S", "Carrera S"], ["porsche-993", "1996 Porsche 993 Carrera", "Carrera"], ["porsche-993", "1996 Porsche 993 Turbo", "Turbo"], ["bmw-3-series-e30", "1988 BMW 325is", "325is"], ["bmw-3-series-e30", "1988 BMW 325i", "325i"], ["bmw-3-series-e30", "1988 BMW 325 is", "325is"], ["bmw-3-series-e30", "1988 BMW 325ix", "Unstated"], ["bmw-3-series-e30", "1989 BMW 318is", "318i"],
    ["ford-mustang-sn95", "2001 Ford Mustang Bullitt GT", "Bullitt"], ["ford-mustang-sn95", "2003 Ford Mustang SVT Cobra", "Cobra"], ["ford-mustang-s197", "2010 Ford Mustang Shelby GT500", "Shelby GT500"], ["ford-mustang-s197", "2012 Ford Mustang Boss 302", "Boss 302"], ["ford-mustang-s197", "2008 Ford Mustang GT", "GT"], ["pontiac-firebird-3rd", "1987 Pontiac Firebird Trans Am GTA", "GTA"], ["pontiac-firebird-3rd", "1991 Pontiac Firebird Trans Am Firehawk", "Firehawk"],
    ["mercedes-sl-r107", "1985 Mercedes-Benz 450SLC", "Unstated"], ["mercedes-sl-r107", "1986 Mercedes-Benz 560SL", "560SL"], ["chevrolet-corvette-c6", "2010 Chevrolet Corvette Grand Sport", "Grand Sport"], ["chevrolet-corvette-c6", "2009 Chevrolet Corvette ZR1", "ZR1"], ["chevrolet-corvette-c5", "2002 Chevrolet Corvette Z06", "Z06"], ["chevrolet-corvette-c5", "2002 Chevrolet Corvette", "Base"]];
  for (const [id, title, want] of READS) { const fam0 = VV.familiesOf().find(x => x.id === id); if (!fam0) { ok(`the list of ${id} exists`, false); continue; } const got = VV.variantOfSale(fam0, { title }); ok(`the list of ${id} reads "${title}" as ${want}`, got === want, got); } }
// EVERY LIST READS ITSELF (lane-b-variant-split, the class of a list that cannot read its own variants): for every family of the data, the variant's own words as a title read back as that variant (the one reader), no list name reads as another variant, every family's models and years are named, and no two families of a make and model overlap in years
{ const VV = await imp("lib/variants.js");
  for (const f of FAMS) { const fam = VV.familiesOf().find(x => x.id === f.id), y = f.years[0];
    ok(`${f.id}: the family names its make, models and years, and its variants have words`, !!f.make && f.models.length > 0 && f.years.length === 2 && f.variants.length >= 2 && f.variants.every(v => v.name && v.words && v.words.length > 0), f.id);
    for (const v of f.variants) { const got = VV.variantOfSale(fam, { title: `${y} ${f.make} ${f.models[0]} ${v.ask || v.name}` }); ok(`${f.id}: "${v.name}" as a title reads as ${v.name}`, got === v.name, got); }
    const dup = FAMS.filter(g => g !== f && g.make === f.make && g.models.some(m => f.models.includes(m)) && g.years[0] <= f.years[1] && f.years[0] <= g.years[1]); ok(`${f.id}: no other family of the same make and model covers the same years (${dup.map(g => g.id).join(", ") || "none"})`, dup.length === 0, dup.map(g => g.id)); } }
const SWEEP = [];
const OB0 = OB.RANGE_RULES.trimFirst; OB.RANGE_RULES.trimFirst = false;
for (const f of FAMS) {
  const plan = PLAN[f.id]; if (!plan) { ok(`${f.id}: a plan exists for the family`, false); continue; }
  const model = f.models[0], name = `${plan.year} ${f.make} ${model}`;
  install(model, mkRows(f, plan));
  const a = await hit({ oneBox: true, search: name }), vs = a && a.variantSplit;
  if (process.env.VIS) { const vv = await hit({ oneBox: true, search: name }, true); process.stderr.write("VIS " + f.id + " " + vv.tier + " " + (vv.prompt || "") + "\n"); }
  ok(`${f.id}: no qualifying question: the answer is a result, never a variant_choice`, !!a && a.tier === "result" && !a.variantQuestion && !(a.variantChoices || []).length, a && a.tier);
  ok(`${f.id}: an unstated car's answer carries variantSplit with show true`, !!vs && vs.show === true, a && [a.tier, vs, a.variants && a.variants.line, a.resolvedCar && a.resolvedCar.model, a.poolN, a.prompt]);
  if (!vs || !vs.show) continue;
  ok(`${f.id}: the line is one sentence in Sam's voice, third person`, vs.line === `${(await imp("lib/reasonWords.js")).aOrAn((a.resolvedCar && (a.resolvedCar.nameModel || a.resolvedCar.model)) || model)} ${(a.resolvedCar && (a.resolvedCar.nameModel || a.resolvedCar.model)) || model}'s price depends on which one it is.`, vs.line);
  ok(`${f.id}: one row per variant of the list, in the data's order and spelling`, vs.rows.length === builtOf(f, plan.year).length && vs.rows.every((r, i) => r.name === builtOf(f, plan.year)[i].name && r.label === builtOf(f, plan.year)[i].name), vs.rows.map(r => r.name));
  ok(`${f.id}: no row for the sales that name no variant, none for a replica`, !vs.rows.some(r => /unstated|no variant|replica|tribute/i.test(r.label + r.name)), vs.rows.map(r => r.label));
  SWEEP.push([f.label, name, vs]);
  for (const [i0, row] of vs.rows.entries()) { const i = f.variants.findIndex(x => x.name === row.name);
    const want = (plan.counts[i] || 0) + (f.unnamedIs === row.name ? plan.unstated : 0), L = `${f.id}, ${row.name}`;
    ok(`${L}: the row has its car (token, plain words, address) for the same year and variant`, !!row.car && !!row.car.token && new RegExp(`^${plan.year} ${f.make} `).test(row.car.words) && row.car.words.includes(f.variants[i].ask || row.name) && row.car.address === "/market-check?q=" + encodeURIComponent(row.car.words), row.car);
    const dec = row.car && CT.decodeCar(row.car.token); ok(`${L}: the car's token decodes to that year and variant`, !!dec && dec.year === plan.year && dec.make === f.make && new RegExp((f.variants[i].ask || row.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]*"), "i").test(String(dec.trim || dec.variant || "") + " " + String(dec.raw || "")), dec);
    if (want < 5) { ok(`${L}: ${want === 0 ? "a variant with no sale" : "a variant under five sales (" + want + ")"}: its label and its own count (${CN.countNoun(want, "sale")}), no range, not priced`, !row.rangeText && row.priced === false && row.salesText === CN.countNoun(want, "sale"), row); continue; }
    const h = row.car ? await asked(f, plan, row.car.words) : null;
    if (!h) { ok(`${L}: the row's own car answers`, false, row.car); continue; }
    const thin = !!(h.variants && h.variants.thin), hr = thin || !(h.tier === "result" && Array.isArray(h.cluster) && h.cluster.length === 2 && Number(h.cluster[0]) > 0) ? null : money(h.cluster[0]) + " to " + money(h.cluster[1]), hn = thin && h.variants.pooled != null ? h.variants.pooled : VR.salesCountOf(h);
    ok(`${L}: the row's rangeText is the range of the answer for its own car (${hr || "none"})`, (row.rangeText || null) === (hr || null), [row.rangeText, hr, h.tier]);
    ok(`${L}: the row's salesText is the sales count of the answer for its own car (${CN.countNoun(hn, "sale")})`, row.salesText === CN.countNoun(hn, "sale"), [row.salesText, hn]);
    ok(`${L}: priced is exactly 'a range is shown'`, row.priced === !!row.rangeText);
    ok(`${L}: a variant of ${want} sales is priced exactly when its own page shows a range (the Corvette ZR-1 is a halo the engine refuses: no range there, none here), and counts what that page counts`, hr ? (row.priced === true && /^\$[\d,]+ to \$[\d,]+$/.test(row.rangeText) && row.salesText === CN.countNoun(want, "sale")) : (row.priced === false && !row.rangeText), [row.rangeText, hr, row.salesText, want]);
  }
  // 4 typed mileage
  const miles = 35000, am = await hit({ oneBox: true, search: `${name} ${miles.toLocaleString("en-US")} miles`, car: { raw: name, vehicle: { ...(VH.sanitizeResolvedVehicle(RES.get(name).vehicle)), mileage: miles } } }), vm = am && am.variantSplit;
  ok(`${f.id}, typed mileage: show stays true`, !!vm && vm.show === true, am && [am.tier, vm && vm.show]);
  for (const [i0, row] of (vm ? vm.rows : []).entries()) { const i = f.variants.findIndex(x => x.name === row.name);
    const L = `${f.id}, ${row.name}, ${miles} miles`, dec = row.car && CT.decodeCar(row.car.token);
    ok(`${L}: the row's car carries the typed mileage (token, words, address)`, !!dec && dec.mileage === miles && row.car.words.endsWith(`${miles.toLocaleString("en-US")} miles`) && row.car.address.includes(encodeURIComponent("35,000 miles")), row.car);
    if ((plan.counts[i] || 0) + (f.unnamedIs === row.name ? plan.unstated : 0) < 5) { ok(`${L}: an unpriced variant stays unpriced with the mileage (no range, its own count)`, !row.rangeText && row.priced === false, row); continue; }
    const h = row.car ? await asked(f, plan, row.car.words.replace(/ 35,000 miles$/, ""), miles) : null; if (!h) continue;
    const thin = !!(h.variants && h.variants.thin), hr = thin || !(h.tier === "result" && Array.isArray(h.cluster) && h.cluster.length === 2 && Number(h.cluster[0]) > 0) ? null : money(h.cluster[0]) + " to " + money(h.cluster[1]), hn = thin && h.variants.pooled != null ? h.variants.pooled : VR.salesCountOf(h);
    ok(`${L}: the row equals the banded answer of its own car (range ${hr || "none"}, ${CN.countNoun(hn, "sale")})`, (row.rangeText || null) === (hr || null) && row.salesText === CN.countNoun(hn, "sale"), [row.rangeText, hr, row.salesText, hn]);
  }
  // 5 show false
  const stated = await asked(f, plan, `${name} ${f.variants[f.variants.length - 1].ask || f.variants[f.variants.length - 1].name}`); ok(`${f.id}: a stated variant: show is false and there are no rows`, !!stated && (!stated.variantSplit || (stated.variantSplit.show === false && stated.variantSplit.rows.length === 0)), stated && stated.variantSplit);
  install(model, mkRows(f, plan, { flat: true })); const flat = await hit({ oneBox: true, search: name }); ok(`${f.id}: variants that do not sell apart (the same prices): show is false`, !!flat && (!flat.variantSplit || (flat.variantSplit.show === false && flat.variantSplit.rows.length === 0)), flat && flat.variantSplit);
  install(model, mkRows(f, plan)); const refined = await hit({ oneBox: true, search: name, refine: { body: "coupe" } }); ok(`${f.id}: a refined answer (a body chip) has no rows`, !refined || !refined.variantSplit || refined.variantSplit.show === false, refined && refined.variantSplit);
}
// THE RECORDED FIREBIRD (lane-b-variant-split, Nov 17 2026): the shape production answered with on Nov 17 (scripts/fixtures/firebirdShape.json: counts and prices only), built as an archive. The check ran green on fixtures that did not look like the archive while the live answer was show false; this one stops that: the census of the unstated car does not pass,
// and the rows are still shown because the variants are read as their own pages read them.
{ const SH = JSON.parse(fs.readFileSync(path.join(here, "fixtures/firebirdShape.json"), "utf8")), f = FAMS.find(x => x.id === "pontiac-firebird-3rd"), plan = PLAN[f.id], model = f.models[0], name = `${plan.year} ${f.make} ${model}`;
  const spread = (n, [a, m, b]) => { const pts = [[0, a - (m - a) * 0.6], [0.25, a], [0.5, m], [0.75, b], [1, b + (b - m) * 0.6]]; return Array.from({ length: n }, (_, i) => { const t = n > 1 ? i / (n - 1) : 0.5; for (let k = 1; k < pts.length; k++) if (t <= pts[k][0]) { const [t0, v0] = pts[k - 1], [t1, v1] = pts[k]; return Math.round(v0 + (v1 - v0) * (t - t0) / (t1 - t0)); } return Math.round(b); }); };
  const cg = new Map(Object.entries(SH.RECORDED.census).map(([k, v]) => [k, v.length ? spread(v[0], v.slice(1)) : []]));
  ok("the census recorded on production does not pass the sells-apart test (the live fault: a test on that pool never passed)", OB.variantsApart(cg) === null);
  const rows = []; let q = 0;
  const addRow = (title, year, price, monthsAgo) => { const id = "fb" + (seq++), t = `${year} ${f.make} ${model}${title ? " " + title : ""}`; rows.push({ id, source_id: id, sale_price: price, sale_date: new Date(Date.now() - Math.round(monthsAgo * 30.4) * DAY).toISOString().slice(0, 10), platform: q++ % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: t, year, make: f.make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, vehicle_type: "car",
    raw_record: { id, title: t, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(20000 + (q % 9) * 4000), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" } }); };
  for (const g of SH.WORLD.groups) for (const wd of g.windows) { const ps = spread(wd.n, wd.p); ps.forEach((pr, i) => addRow(g.title, wd.years[0] + (i % (wd.years[1] - wd.years[0] + 1)), pr, wd.months[0] + (wd.months[1] - wd.months[0]) * (i / Math.max(1, wd.n - 1)))); }
  for (let i = 0; i < SH.WORLD.replicas.n; i++) addRow(SH.WORLD.replicas.title, 1987, SH.WORLD.replicas.price + i * 50, 3 + i);
  install(model, rows);
  const a = await hit({ oneBox: true, search: name }), vs = a && a.variantSplit;
  ok("the recorded Firebird: the answer carries variantSplit with show true (the live answer was show false)", !!vs && vs.show === true, a && [a.tier, vs && vs.why]);
  ok("the recorded Firebird: no qualifying question is asked and the answer is a result", !!a && a.tier === "result" && !a.variantQuestion && !(a.variantChoices || []).length, a && a.tier);
  if (vs && vs.show) {
    ok("the recorded Firebird (1987): the cards are Base, Formula, Trans Am and GTA in the data's order: the 20th Anniversary was built in 1989 and Firehawk in 1991 and 1992, so neither is shown for a 1987 car", JSON.stringify(vs.rows.map(r => r.label)) === JSON.stringify(["Base", "Formula", "Trans Am", "GTA"]), vs.rows.map(r => r.label));
    for (const r of vs.rows) { 
      const h = await asked(f, plan, r.car.words), hr = h && h.tier === "result" && !(h.variants && h.variants.thin) && Array.isArray(h.cluster) ? money(h.cluster[0]) + " to " + money(h.cluster[1]) : null;
      ok(`the recorded Firebird, ${r.label}: the row's range, count and mileage note are the answer for its own car`, !!h && (r.rangeText || null) === hr && r.salesText === CN.countNoun(VR.salesCountOf(h), "sale") && (!r.rangeText || (r.mileageNote || vs.mileageLine) === h.mileageLine) && (r.mileageNote == null || r.mileageNote !== vs.mileageLine), [r.rangeText, hr, r.salesText, VR.salesCountOf(h), r.mileageNote, h && h.mileageLine]);
      ok(`the recorded Firebird, ${r.label}: the row is priced (its own pool has the sales)`, r.priced === true && !!r.rangeText, r); }
    const med = x => { const m = /\$([\d,]+) to \$([\d,]+)/.exec(x || ""); return m ? (Number(m[1].replace(/,/g, "")) + Number(m[2].replace(/,/g, ""))) / 2 : null; };
    const gta = vs.rows.find(r => r.name === "GTA"), tam = vs.rows.find(r => r.name === "Trans Am");
    ok("the recorded Firebird: the GTA's range is above the Trans Am's", med(gta.rangeText) > med(tam.rangeText), [tam.rangeText, gta.rangeText]);
    // THE JOIN: the page's own row builder (lib/variantRowsPage.js) given exactly what the handler sent prints the engine's words and nothing else: every row's label, range, sales count, mileage note and link, the one aside line
    const html = (await imp("lib/variantRowsPage.js")).variantRowsHtml(vs), txt = html.replace(/<[^>]*>/g, "|").split("|").filter(Boolean).join("").replace(/&amp;/g, "&").replace(/&#39;/g, "'");
    ok("the recorded Firebird, the page's join: the page prints the engine's line, each row's label, range, sales and mileage note, and the one aside line, and no other words", txt === vs.line + vs.rows.map(r => r.label + (r.rangeText || "") + (r.salesText || "") + (r.mileageNote || "")).join("") + (vs.mileageLine || "") + vs.asideLine, txt.slice(0, 200));
    ok("the recorded Firebird, the page's join: every row is a link to its own car (the address the engine sent)", vs.rows.every(r => html.includes('href="' + r.car.address.replace(/&/g, "&amp;") + '"')), null);
    // EVERY SALE CARRIES ITS VARIANT (the label Lane S prints on the sales list: card.variantLabel)
    const cl = (a.cards || []), lab = new Map(); for (const c of cl) lab.set(c.variantLabel, (lab.get(c.variantLabel) || 0) + 1);
    ok("the recorded Firebird: every sale on the list carries variantLabel, the variant its own words name (card.variantLabel; null when it names none)", cl.length > 0 && cl.every(c => "variantLabel" in c) && cl.every(c => c.variantLabel === null || vs.rows.some(r => r.name === c.variantLabel)), [cl.length, [...lab.entries()]]);
    { const VV = await imp("lib/variants.js"), fam = VV.familiesOf().find(x => x.id === f.id), want = c => { const v = VV.variantOfSale(fam, { title: c.title }); return v === VV.UNSTATED ? null : v; };
      ok("the recorded Firebird: the sale list's labels are what the sale's own title names (a Trans Am GTA sale is GTA, a plain Firebird is Base, a Formula is Formula)", cl.length > 0 && cl.every(c => c.variantLabel === want(c)) && ["GTA", "Base", "Formula", "Trans Am"].every(n => lab.has(n)), [...lab.entries()]); }
    ok("the recorded Firebird: the four replicas and tributes are set aside and counted in one line (the engine's)", vs.asideLine === "Four replicas and tributes are set aside and counted in none of these.", vs.asideLine);
    ok("the recorded Firebird: no row and no count for the replicas (set aside, counted in one line by the page's source)", !vs.rows.some(r => /replica|kitt/i.test(r.label + r.salesText)), vs.rows.map(r => r.label));
  }
}
// ONE ARCHIVE READ FOR THE SIX (lane-b-variant-split-3): the variants' reads share the request's memo, so the archive is asked less than six pages' worth. Counted on the family's own world: the archive reads of the crew's unstated read against the reads of the same car's blended answer plus each variant's page asked alone
{ const f = FAMS.find(x => x.id === "pontiac-firebird-3rd"), plan = PLAN[f.id], model = f.models[0], name = `${plan.year} ${f.make} ${model}`; let n = 0; const f0 = globalThis.fetch; globalThis.fetch = (u, ...r) => { if (/sales_archive/.test(String(u))) n++; return f0(u, ...r); };
  try { install(model, mkRows(f, plan)); n = 0; await hit({ oneBox: true, search: name }, true); const blended = n;
    install(model, mkRows(f, plan)); n = 0; await hit({ oneBox: true, search: name }); const split = n; let alone = 0;
    for (const v of builtOf(f, plan.year)) { install(model, mkRows(f, plan)); n = 0; await asked(f, plan, `${name} ${v.ask || v.name}`); alone += n; }
    if (process.env.READS) process.stderr.write("READS " + JSON.stringify({ split, alone, blended }) + "\n");
    ok(`the split reads the archive at most 70% of the variants' pages asked alone plus the blended answer (${split} reads against ${alone} for ${builtOf(f, plan.year).length} pages, ${blended} for the blended answer alone)`, split > 0 && alone > 0 && split * 10 <= (alone + blended) * 7, { split, alone, blended }); }
  finally { globalThis.fetch = f0; } }
// A CARD'S COUNT IS ITS OWN PAGE'S COUNT (lane-b-variant-split-3): a page that is a sales answer counts its pool even with no range (the 560SL for a car of a year it was built: pooled apart, 46 sales, no range); a page that is a question, not tracked or unavailable counts none
// THE MILEAGE LINE, ONCE (lane-b-variant-split-4): live, "The range is for all mileages." printed under every row. The engine's line is printed once under the list when it is the same on every priced row; rows that differ keep their own line only where it differs from the line most rows share.
{ const L = "The range is for all mileages.", M = "Narrowed to 50,000 to 100,000 miles.", row = (n, note, priced = true) => ({ name: n, priced, rangeText: priced ? "$1 to $2" : null, mileageNote: note }), f = VR.mileageLinesOf;
  const same = f([row("A", L), row("B", L), row("C", L), row("D", null, false)]);
  ok("mileage line: the same on every priced row prints once, under the list, and on no row", same.line === L && same.rows.every(r => r.mileageNote == null), same);
  const diff = f([row("A", L), row("B", L), row("C", M)]);
  ok("mileage line: rows that differ keep their own line only where it differs from the others; the shared line is not printed (it does not apply to every row)", diff.line === null && diff.rows[0].mileageNote == null && diff.rows[1].mileageNote == null && diff.rows[2].mileageNote === M, diff);
  const tie = f([row("A", L), row("B", M)]);
  ok("mileage line: with no line shared by most rows every row keeps its own", tie.line === null && tie.rows[0].mileageNote === L && tie.rows[1].mileageNote === M, tie);
  ok("mileage line: no notes at all is no line, a single row's note prints once", f([row("A", null)]).line === null && f([row("A", L)]).line === L); }
{ const v = { name: "X" }; ok("rowOf: a sales answer with no range counts its pool and prints no range", VR.rowOf && VR.rowOf(v, { tier: "result", poolN: 46, cluster: null }).salesText === CN.countNoun(46, "sale") && VR.rowOf(v, { tier: "result", poolN: 46, cluster: null }).rangeText === null, VR.rowOf && VR.rowOf(v, { tier: "result", poolN: 46, cluster: null }));
  ok("rowOf: a page that is a question (body choice) or unavailable has no sales to count", ["body_choice", "trim_choice", "unavailable", "refusal", "not_tracked"].every(t => VR.rowOf && VR.rowOf(v, { tier: t, poolN: 9, soldCount: 9 }).salesText === CN.countNoun(0, "sale")), null); }
// THE STORED QUESTION (lane-b-variant-split-3): live, "1987 Porsche 911" was answered in 592 ms with the trim question: a STORED question row (spec_market_cache, kind question) read before the engine, whatever the engine now asks. The crew never reads it for a car of a family with a list; a visitor still does
{ const f = FAMS.find(x => x.id === "porsche-911-1984-1989"), plan = PLAN[f.id], model = f.models[0], name = `${plan.year} ${f.make} ${model}`, f0 = globalThis.fetch; let served = 0;
  let writes = 0; globalThis.fetch = async (u, ...r) => { const url = String(u), m = String((r[0] && r[0].method) || "GET").toUpperCase(); if (m !== "GET" && /spec_market_cache|market_cache|warm/i.test(url)) { writes++; if (process.env.WURL) process.stderr.write("WRITE " + m + " " + url.slice(0, 160) + "\n"); } if (/spec_market_cache\?spec_key=eq\./.test(url) && /MCQ:/.test(decodeURIComponent(url))) { served++; return new Response(JSON.stringify([{ computed_at: new Date().toISOString(), market: { kind: "question", engineVersion: OB.ENGINE_VERSION, raw: { tier: "trim_choice", askIndex: 1, prompt: "These sold as Carrera and Turbo, and they price differently. Which one is it?", trimOptions: [{ label: "Carrera", n: 45 }, { label: "Turbo", n: 11 }], resolvedCar: { year: plan.year, make: f.make, model } } } }]), { status: 200, headers: { "content-type": "application/json" } }); } return f0(u, ...r); };
  try { install(model, mkRows(f, plan)); const vis = await hit({ oneBox: true, search: name }, true); const crew = await hit({ oneBox: true, search: name }, false);
    ok("VISITOR (the split is public, lane-b-variant-split-4): a visitor is not served the stored trim question either: a result with its variants as cards, the stored row never read", !!vis && vis.tier === "result" && !vis.trimOptions && !!vis.variantSplit && vis.variantSplit.show === true && served === 0, vis && [vis.tier, served, vis.variantSplit && vis.variantSplit.show]);
    { const w0 = writes; install(model, mkRows(f, plan)); await hit({ oneBox: true, search: name }, false); ok("a crew read of a family car writes nothing to the shared answer stores", writes === w0, writes - w0); }
    ok("the crew is not served the stored trim question: a result with its variants as cards", !!crew && crew.tier === "result" && !crew.trimOptions && !!crew.variantSplit && crew.variantSplit.show === true, crew && [crew.tier, crew.variantSplit && crew.variantSplit.why]); }
  finally { globalThis.fetch = f0; } }
// A SLOW SPLIT NEVER HOLDS THE ANSWER (lane-b-variant-split-3): live, the six reads took 10 to 48 s and, on the 2003 Mustang, two reads of 60 s answered nothing. A split not done by its deadline leaves the blended answer as it was and says why
{ const slow = async () => { await new Promise(r => setTimeout(r, 400)); return { status: "valid", vehicle: { year: 1987, make: "Pontiac", model: "Firebird" } }; }, d0 = { tier: "result", variants: { familyId: "pontiac-firebird-3rd", applied: false, stated: [] }, resolvedCar: { model: "Firebird" } };
  VR.__clearVariantRowsCache && VR.__clearVariantRowsCache(); const t0 = Date.now(), out = await VR.variantSplitFor(d0, { crew: true }, { year: 1987, make: "Pontiac", model: "Firebird" }, null, { supabaseUrl: "https://fake.example", supabaseKey: "k" }, { resolveVehicle: slow, deadlineMs: 60 }), dt = Date.now() - t0;
  ok("a split that is not done by its deadline: the answer is the blended one (a result, no cards) and the reason is timed out", out.tier === "result" && out.variantSplit && out.variantSplit.show === false && out.variantSplit.why && out.variantSplit.why.code === "split_timed_out", out.variantSplit);
  ok("and it came back at the deadline, not when the reads were done", dt < 350, dt); }
// THE LIVE SHAPE OF EVERY FAMILY (lane-b-variant-split-3): production's own answers (scripts/fixtures/liveFamilies.json), cards as served for one typical year of each of the 14 families, run through the row builder. A variant is shown only for the years it was built; each card's count is what its own page shows; the split shows when two variants have a range of their own
{ const LIVE = JSON.parse(fs.readFileSync(path.join(here, "fixtures/liveFamilies.json"), "utf8")).families, VV = await imp("lib/variants.js");
  ok("every family of the data has a recorded live shape", FAMS.every(f => LIVE.some(l => l.id === f.id)) && LIVE.length === FAMS.length, LIVE.map(l => l.id));
  for (const l of LIVE) { const f = FAMS.find(x => x.id === l.id); if (!f) { ok(`${l.id}: the family is in the data`, false); continue; }
    const shown = l.rows.filter(r0 => { const v = f.variants.find(x => x.name === r0.name); return !!v && (VR.builtIn ? VR.builtIn(v, l.year) : true); });
    ok(`${l.id} ${l.year}: only the variants built in ${l.year} are shown (served ${l.rows.length}, shown ${shown.map(x => x.name).join(", ") || "none"})`, JSON.stringify(shown.map(x => x.name)) === JSON.stringify(l.shown), [shown.map(x => x.name), l.shown]);
    const built = builtOf(f, l.year).map(v => v.name); ok(`${l.id} ${l.year}: the data's years agree (every variant shown is built in the year)`, shown.every(x => built.includes(x.name)), [built, shown.map(x => x.name)]);
    const rows = shown.map(x => { const v = f.variants.find(y => y.name === x.name), raw = x.page ? { ...x.page, mileageLine: "The range is for all mileages." } : null; return VR.rowOf ? VR.rowOf(v, raw) : null; });
    if (rows.some(x => !x)) { ok(`${l.id}: the row builder exists`, false); continue; }
    for (const [i, x] of shown.entries()) { const want = x.range, got = rows[i].rangeText, wantN = l.expectSales && l.expectSales[x.name] ? l.expectSales[x.name] : null;
      ok(`${l.id} ${x.name}: the card prints its own page's range (${want || "none"}) and count`, (got || null) === (want ? want.replace(/\$([\d,]+) to \$([\d,]+)/, (m, a, b) => "$" + a + " to $" + b) : null) && (wantN ? rows[i].salesText === wantN : rows[i].salesText === CN.countNoun(x.sales, "sale")), [got, want, rows[i].salesText, x.sales]); }
    if (l.expectShow !== null) { const dec = VR.showSplit ? VR.showSplit(rows) : { show: null }; ok(`${l.id} ${l.year}: the split ${l.expectShow ? "shows" : "does not show"} (${dec.code || "two or more have a range of their own"})`, dec.show === l.expectShow && (l.expectShow || dec.code === (rows.filter(x => x.priced).length < 2 ? "fewer_than_two_priced" : "ranges_identical")), dec); } }
}
// NO QUALIFYING QUESTION, AS A CLASS (lane-b-variant-split-3): live, "1987 Porsche 911" and "1996 Porsche 993" still answered with the engine's own trim question ("Carrera (45) Turbo (11)"). With the engine's trim question ON, the crew is never asked a trim question for any family of the data: the answer is a result with its variants as cards; a visitor's read is the engine as it was
{ OB.RANGE_RULES.trimFirst = true; let visitorAsked = 0;
  for (const f of FAMS) { const plan = PLAN[f.id], model = f.models[0], name = `${plan.year} ${f.make} ${model}`; install(model, mkRows(f, plan));
    const vv = await hit({ oneBox: true, search: name }, true); if (/^trim_choice$/.test(String(vv && vv.tier))) visitorAsked++;
    install(model, mkRows(f, plan)); const cc = await hit({ oneBox: true, search: name }, false);
    ok(`${f.id}: THE VISITOR GETS THE SPLIT (public): with the trim question on, a visitor read is a result with the same cards as the crew, never a trim question`, !!vv && vv.tier === "result" && !vv.trimOptions && !!vv.variantSplit && vv.variantSplit.show === true && !vv.variantSplit.why, vv && [vv.tier, vv.prompt, vv.variantSplit && vv.variantSplit.show]);
    ok(`${f.id}: with the trim question on, a crew read is a result with its variants (tier ${cc && cc.tier}), never a trim question`, !!cc && cc.tier === "result" && !cc.trimOptions && !!cc.variantSplit && cc.variantSplit.show === true, cc && [cc.tier, cc.prompt, cc.variantSplit && cc.variantSplit.why]); }
  ok(`no family car of the ${FAMS.length} is asked the trim question by anyone while the split is public`, visitorAsked === 0, visitorAsked);
  OB.RANGE_RULES.trimFirst = false; }
OB.RANGE_RULES.trimFirst = OB0;
{ install("Beetle", [{ ...mkRows(FAMS[0], PLAN["pontiac-firebird-3rd"])[0], make: "Volkswagen", model: "Beetle", listing_title: "1987 Volkswagen Beetle" }]); const b = await hit({ oneBox: true, search: "1987 Volkswagen Beetle" }); ok("a family with no variant list: show is false (or no field)", !b || !b.variantSplit || b.variantSplit.show === false, b && b.variantSplit); }
ok("no page file builds a variant row or a range text (pages print variantSplit as sent)", ["public/js/onebox.js", "public/js/find.js", "public/js/tasks.js"].filter(f => fs.existsSync(path.join(ROOT, f))).every(f => !/variantSplit.*rangeText\s*=|rangeText\s*=.*moneyOf/.test(fs.readFileSync(path.join(ROOT, f), "utf8"))));
ok("the call site is the one exit of the answer (api/sellerDecision.js) and the rows are never in a stored row", /oneBox = await variantSplitFor\(oneBox,/.test(fs.readFileSync(path.join(ROOT, "api/sellerDecision.js"), "utf8")) && /finishStore/.test(fs.readFileSync(path.join(ROOT, "api/sellerDecision.js"), "utf8")));
console.error = err;
if (args.includes("--sweep")) for (const [label, name, vs] of SWEEP) { log("\n" + label + " (" + name + "): show " + vs.show + "\n  " + vs.line); for (const r of vs.rows) log("  " + r.label.padEnd(34) + (r.rangeText || "(no range)").padEnd(22) + r.salesText); }
log(fails.slice(0, 60).map(f => "FAIL " + f).join("\n") + (fails.length ? "\n" : "") + `variantRowsCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = ROOT;
  const M = [
    ["the rows are not served", "api/sellerDecision.js", "if (!vinCtx && !exactSale && splitServed(req)) oneBox = await variantSplitFor(", "if (false) oneBox = await variantSplitFor("],
    ["the switch is off: a visitor gets no split", "lib/variants.js", "export const VARIANT_SPLIT_PUBLIC = true;", "export const VARIANT_SPLIT_PUBLIC = false;"],
    ["the rows are served to the crew only (the old gate)", "api/sellerDecision.js", "if (!vinCtx && !exactSale && splitServed(req)) oneBox", "if (!vinCtx && !exactSale && isCrewRequest(req)) oneBox"],
    ["the trim question is read for a visitor's family car", "api/sellerDecision.js", "const crewVariantCar = !!(splitServed(req) && vehicle", "const crewVariantCar = !!(isCrewRequest(req) && vehicle"],
    ["the mileage line stays on every row", "lib/variantRows.js", "const ml = mileageLinesOf(rows), split", "const ml = { rows, line: null }, split"],
    ["the mileage line is printed once even when rows differ", "lib/variantRows.js", "if (count.size === 1 && priced.length === withNote)", "if (priced.length > 0)"],
    ["a row keeps the line most rows share", "lib/variantRows.js", "r.mileageNote === major ? { ...r, mileageNote: null } : r), line: null };", "false ? { ...r, mileageNote: null } : r), line: null };"],
    ["the qualifying question is asked again (variantQuestionFor)", "api/sellerDecision.js", "      if (!vinCtx && !exactSale && isCrewRequest(req)) oneBox = await variantSplitFor(", "      oneBox = await variantQuestionFor(oneBox, { text: oneBoxText, asked: askedN, refine: obRefine }, vehicle, generation, { supabaseUrl, supabaseKey });\n      if (!vinCtx && !exactSale && isCrewRequest(req)) oneBox = await variantSplitFor("],
    ["the crew reads the stored trim question", "api/sellerDecision.js", "(wantsWarm && !recompute && !crewVariantCar) ? readQuestionRow", "(wantsWarm && !recompute) ? readQuestionRow"],
    ["the engine is not told not to ask a trim question", "api/sellerDecision.js", "...(crewVariantCar ? { noTrimQuestion: true } : {}),", ""],
    ["the engine ignores the order not to ask a trim question", "lib/onebox.js", "const noTrimQuestion = !!(env && env.noTrimQuestion) &&", "const noTrimQuestion = false &&"],
    ["the crew's no-question read is stored for visitors", "api/sellerDecision.js", "if (crewVariantCar) return;   // what the crew's", "if (false) return;   // what the crew's"],
    ["the crew's no-question read refreshes the shared card cache", "api/sellerDecision.js", 'oneBox.tier === "result" && !crewVariantCar &&', 'oneBox.tier === "result" &&'],
    ["the split shows with fewer than two variants priced", "lib/variantRows.js", "if (priced.length < 2) return { show: false, code: \"fewer_than_two_priced\" };", ""],
    ["the split shows when every range is the same range", "lib/variantRows.js", "if (new Set(priced.map(r => r.rangeText)).size < 2) return { show: false, code: \"ranges_identical\" };", ""],
    ["a variant is shown in a year it was not built", "lib/variantRows.js", "const list = fam.variants.filter(v => builtIn(v, vehicle.year));", "const list = fam.variants;"],
    ["a variant built never shows (the year test is turned round)", "lib/variantRows.js", "return !(Array.isArray(v && v.years) && v.years.length === 2 && Number.isFinite(y) && y > 0) || (y >= v.years[0] && y <= v.years[1]);", "return !(Array.isArray(v && v.years) && v.years.length === 2 && Number.isFinite(y) && y > 0) || (y >= v.years[0] && y < v.years[1]);"],
    ["the six reads do not share the request's memo", "lib/variantRows.js", "_readMemo: memo }", "_readMemo: null }"],
    ["a slow split waits for its reads (no deadline)", "lib/variantRows.js", "new Promise(res => { timer = setTimeout(() => res(null), deadline); })", "new Promise(() => {})"],
    ["the rows are in another order", "lib/variantRows.js", "const list = fam.variants.filter(v => builtIn(v, vehicle.year));", "const list = fam.variants.filter(v => builtIn(v, vehicle.year)).reverse();"],
    ["a row's car does not carry the typed mileage", "lib/variantRows.js", "variant: v.name, ...(typedMiles ? { mileage: typedMiles } : {}) }", "variant: v.name }"],
    ["a row is read without the typed mileage band", "lib/variantRows.js", "_readMemo: memo }, withTypedMileage(rv, null))", "_readMemo: memo }, null)"],
    ["the variant does not ride on the row's car", "lib/variantRows.js", "variant: v.name, ...(typedMiles", "...(typedMiles"],
    ["a variant is asked for by its data name, not the words the resolver knows (ZR-1 for ZR1)", "lib/variantRows.js", "const words = `${base} ${v.ask || v.name}`", "const words = `${base} ${v.name}`"],
    ["a thin variant gets the blended range", "lib/variantRows.js", "thin = !!(raw && raw.variants && raw.variants.thin), range = thin ? null : rangeTextOf(raw);", "thin = false, range = rangeTextOf(raw);"],
    ["a card's count is not its own page's count (a page that is not a sales answer counts its pool)", "lib/variantRows.js", "(raw && raw.tier === \"result\" ? salesCountOf(raw) : 0))", "(raw ? salesCountOf(raw) : 0))"],
    ["a thin variant counts the blended sales", "lib/variantRows.js", "(thin && Number.isFinite(Number(raw.variants.pooled)) ? Number(raw.variants.pooled) :", "(false ? 0 :"],
    ["a row's range is built another way", "lib/variantRows.js", "`${moneyOf(d.cluster[0])} to ${moneyOf(d.cluster[1])}`", "`${moneyOf(Number(d.cluster[0]) + 100)} to ${moneyOf(d.cluster[1])}`"],
    ["a row counts the wrong pool", "lib/variantRows.js", "const n = Number(d && (d.poolN != null ? d.poolN : d.soldCount));", "const n = Number(d && d.soldCount) + 1;"],
    ["the row has no mileage note", "lib/variantRows.js", "mileageNote: range && raw && typeof raw.mileageLine === \"string\" ? raw.mileageLine : null", "mileageNote: null"],
    ["the replicas are not counted in one line", "lib/variantRows.js", "asideLine: nRep ? reasonLine(", "asideLine: false ? reasonLine("],
    ["a row has no address", "lib/variantRows.js", "address: \"/market-check?q=\" + encodeURIComponent(text),", "address: \"\","],
    ["a row has no token", "lib/variantRows.js", "car: st ? { token: st.token,", "car: st ? { token: null,"],
    ["a refined answer gets rows", "lib/variantRows.js", "if (!onlyMiles || Number(ctx && ctx.asked) > 0", "if (Number(ctx && ctx.asked) > 0"],
    ["a stated variant still gets rows", "lib/variantRows.js", "|| d.variants.applied || (d.variants.stated || []).length || d.variants.chosen) return d;", ") return d;"],
    ["a variant's years are dropped from the data (Bullitt, Boss 302 shown in 2010)", "data/variantFamilies.json", '{"name": "Boss 302", "years": [2012, 2013],', '{"name": "Boss 302",'],
    ["the 560SL is built in 1985 (data)", "data/variantFamilies.json", '{"name": "560SL", "years": [1986, 1989]', '{"name": "560SL", "years": [1980, 1989]'],
    ["a sale that names no variant is not the plain car (no Base)", "lib/variants.js", "(fam.unnamedIs && fam.variants.some(v => v.name === fam.unnamedIs) ? fam.unnamedIs : UNSTATED)", "UNSTATED"],
    ["a package is read after its parent (a GTA is a Trans Am)", "lib/variants.js", "(fam.matchList || fam.variants).find(", "fam.variants.find("],
    ["a sale on the list carries no variant label", "lib/onebox.js", "return { ...c, variantLabel: v === VARIANT_UNSTATED ? null : v };", "return c;"],
    ["a list's words read a sale as the wrong variant (325i matches a 325is)", "data/variantFamilies.json", '"\\\\b325\\\\s?i\\\\b"', '"325\\\\s?i"'],
    ["the 993 Carrera 4 is read as a Carrera (not tried first)", "data/variantFamilies.json", ', "matchFirst": true, "matchRank": 6', ""],
    ["a 911 Turbo Cabriolet is read as a Cabriolet (rank)", "data/variantFamilies.json", '"\\\\b930\\\\b"], "matchFirst": true, "matchRank": 3', '"\\\\b930\\\\b"], "matchFirst": true, "matchRank": 9'],
    ["the rank of the variants tried first is ignored", "lib/variants.js", ".sort((a, b) => (a.v.matchRank ?? 99) - (b.v.matchRank ?? 99) || a.i - b.i)", ".sort((a, b) => a.i - b.i)"],
    ["the line says A where it says An", "lib/reasonWords.js", "text: p => `${aOrAn(p.model)} ${p.model}'s price depends", "text: p => `A ${p.model}'s price depends"]
  ];
  let survived = 0;
  for (const [name, file, from, to] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "vr-"));
    try {
      for (const d of ["lib", "api", "data", "package.json"]) spawnSync("cp", ["-R", path.join(R, d), tmp]);
      fs.mkdirSync(path.join(tmp, "scripts")); spawnSync("cp", [path.join(R, "scripts/_deskOlderWorld.mjs"), path.join(tmp, "scripts/")]); spawnSync("cp", ["-R", path.join(R, "scripts/fixtures"), path.join(tmp, "scripts/")]); fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"); if (!before.includes(from)) { console.log("SKIP (no match) " + name); survived++; continue; }
      fs.writeFileSync(f, before.replace(from, () => to));
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8", timeout: 300000 }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
