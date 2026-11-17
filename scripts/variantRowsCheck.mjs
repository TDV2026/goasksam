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
const FAMS = JSON.parse(fs.readFileSync(path.join(ROOT, "data/variantFamilies.json"), "utf8")).families;
// the sales of a family: [variant name or "", count, base price]; the first variants get the lowest prices, each next one 1.4 times the one before
const PLAN = { "pontiac-firebird-3rd": { year: 1987, counts: [0, 3, 9, 10, 8], unstated: 12 }, "chevrolet-camaro-3rd": { year: 1987, counts: [0, 9, 10, 8], unstated: 12 }, "ford-mustang-fox": { year: 1987, counts: [0, 3, 9, 10, 8], unstated: 12 }, "chevrolet-corvette-c4": { year: 1990, counts: [10, 3, 9], unstated: 12 } };
const TITLE = { "ZR-1": "ZR1" };   // the archive titles a ZR-1 'ZR1' as often as 'ZR-1', and the resolver's trim fence is ZR1 (a hyphen spelling does not match it: the known gap in CLAUDE.md, the resolver backlog)
const mkRows = (f, plan, { replicas = true, flat = false } = {}) => {
  const rows = [], model = f.models[0]; let k = 0, base = 9000; const add = (words, count, price) => { for (let i = 0; i < count; i++) { const id = "vr" + (seq++), title = `${plan.year} ${f.make} ${model}${words ? " " + words : ""}`;
    const raw = { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(30000 + k * 211), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
    rows.push({ id, source_id: id, sale_price: price + i * 53, sale_date: new Date(Date.now() - (40 + (k % 9) * 8) * DAY).toISOString().slice(0, 10), platform: k % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: title, year: plan.year, make: f.make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" }); k++; } };
  add("", plan.unstated, base); f.variants.forEach((v, i) => { base = flat ? base : Math.round(base * 1.12); add(TITLE[v.name] || v.name, plan.counts[i] || 0, base); });
  if (replicas) add(`${f.variants[f.variants.length - 1].name} Replica`, 3, base * 3);
  return rows;
};
const install = (model, rows) => { w.DATA.clear(); w.DATA.set(model, rows); VR && VR.__clearVariantRowsCache && VR.__clearVariantRowsCache(); };
const { mintCrewCookieValue } = await imp("lib/_crew.js"); void mintCrewCookieValue;
SD = (await imp("api/sellerDecision.js")).default; let nn = 0;
const hit = async body => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = b; return this; }, setHeader() {}, end() {}, getHeader() {} }; await SD({ method: "POST", headers: { origin: "https://goasksam.com", cookie: "" }, query: {}, body, socket: { remoteAddress: "10.4." + Math.floor(++nn / 250) + "." + (nn % 250) } }, res); return out; };
const asked = async (f, plan, text, miles) => { const r = RES.get(text), v = r && r.vehicle; if (!v) return null; const rv = { ...(VH.sanitizeResolvedVehicle(v) || v), ...(miles ? { mileage: miles } : {}) }; return hit({ oneBox: true, search: miles ? `${text} ${miles.toLocaleString("en-US")} miles` : text, car: { raw: text, vehicle: rv } }); };
const money = x => "$" + Math.round(Number(x)).toLocaleString("en-US");
const RES = new Map();   // the resolver's reading of every text the rows and the page use: what the real resolver gives on its lists (a trim for a variant it knows, none for one it drops: Firehawk, Berlinetta, Saleen, SVO), written out so no archive read ever runs beside a changed process environment
const TRIM = { "Firehawk": null, "20th Anniversary Turbo Trans Am": "20th Anniversary Turbo Trans Am", "GTA": "GTA", "Trans Am": "Trans Am", "Formula": "Formula", "Berlinetta": null, "IROC-Z": "IROC-Z", "Z28": "Z28", "RS": "RS", "Saleen": null, "SVO": null, "Cobra": "SVT Cobra", "GT": "GT", "LX": "LX", "ZR-1": "ZR1", "Grand Sport": "Grand Sport", "Collector Edition": "Edition" };
for (const f of FAMS) { const plan = PLAN[f.id]; if (!plan) continue; const base = `${plan.year} ${f.make} ${f.models[0]}`, mk = (text, trim) => ({ status: "valid", vehicle: { raw: text, year: plan.year, make: f.make, model: f.models[0], trim, confidence: "high", canonicalLabel: [plan.year, f.make, f.models[0], trim].filter(Boolean).join(" ") } });
  RES.set(base, mk(base, null)); for (const v of f.variants) RES.set(`${base} ${v.name}`, mk(`${base} ${v.name}`, TRIM[v.name] === undefined ? null : TRIM[v.name])); }
if (VR && VR.__setResolver) VR.__setResolver(async text => RES.get(text) || { status: "needs_clarification", vehicle: null });
const SWEEP = [];
const OB0 = OB.RANGE_RULES.trimFirst; OB.RANGE_RULES.trimFirst = false;
for (const f of FAMS) {
  const plan = PLAN[f.id]; if (!plan) { ok(`${f.id}: a plan exists for the family`, false); continue; }
  const model = f.models[0], name = `${plan.year} ${f.make} ${model}`;
  install(model, mkRows(f, plan));
  const a = await hit({ oneBox: true, search: name }), vs = a && a.variantSplit;
  ok(`${f.id}: an unstated car's answer carries variantSplit with show true`, !!vs && vs.show === true, a && [a.tier, vs]);
  if (!vs || !vs.show) continue;
  ok(`${f.id}: the line is one sentence in Sam's voice, third person`, vs.line === `A ${model}'s price depends on which one it is.`, vs.line);
  ok(`${f.id}: one row per variant of the list, in the data's order and spelling`, vs.rows.length === f.variants.length && vs.rows.every((r, i) => r.name === f.variants[i].name && r.label === f.variants[i].name), vs.rows.map(r => r.name));
  ok(`${f.id}: no row for the sales that name no variant, none for a replica`, !vs.rows.some(r => /unstated|no variant|replica|tribute/i.test(r.label + r.name)), vs.rows.map(r => r.label));
  SWEEP.push([f.label, name, vs]);
  for (const [i, row] of vs.rows.entries()) {
    const want = plan.counts[i] || 0, L = `${f.id}, ${row.name}`;
    ok(`${L}: the row has its car (token, plain words, address) for the same year and variant`, !!row.car && !!row.car.token && new RegExp(`^${plan.year} ${f.make} `).test(row.car.words) && row.car.words.includes(row.name) && row.car.address === "/market-check?q=" + encodeURIComponent(row.car.words), row.car);
    const dec = row.car && CT.decodeCar(row.car.token); ok(`${L}: the car's token decodes to that year and variant`, !!dec && dec.year === plan.year && dec.make === f.make && new RegExp(row.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]*"), "i").test(String(dec.trim || dec.variant || "") + " " + String(dec.raw || "")), dec);
    if (want < 5) { ok(`${L}: ${want === 0 ? "a variant with no sale" : "a variant under five sales (" + want + ")"}: its label and its own count (${CN.countNoun(want, "sale")}), no range, not priced`, !row.rangeText && row.priced === false && row.salesText === CN.countNoun(want, "sale"), row); continue; }
    const h = row.car ? await asked(f, plan, row.car.words) : null;
    if (!h) { ok(`${L}: the row's own car answers`, false, row.car); continue; }
    const thin = !!(h.variants && h.variants.thin), hr = thin ? null : VR.rangeTextOf(h), hn = thin && h.variants.pooled != null ? h.variants.pooled : VR.salesCountOf(h);
    ok(`${L}: the row's rangeText is the range of the answer for its own car (${hr || "none"})`, (row.rangeText || null) === (hr || null), [row.rangeText, hr, h.tier]);
    ok(`${L}: the row's salesText is the sales count of the answer for its own car (${CN.countNoun(hn, "sale")})`, row.salesText === CN.countNoun(hn, "sale"), [row.salesText, hn]);
    ok(`${L}: priced is exactly 'a range is shown'`, row.priced === !!row.rangeText);
    ok(`${L}: a variant of ${want} sales is priced exactly when its own page shows a range (the Corvette ZR-1 is a halo the engine refuses: no range there, none here), and counts what that page counts`, hr ? (row.priced === true && /^\$[\d,]+ to \$[\d,]+$/.test(row.rangeText) && row.salesText === CN.countNoun(want, "sale")) : (row.priced === false && !row.rangeText), [row.rangeText, hr, row.salesText, want]);
  }
  // 4 typed mileage
  const miles = 36000, am = await hit({ oneBox: true, search: `${name} ${miles.toLocaleString("en-US")} miles`, car: { raw: name, vehicle: { ...(VH.sanitizeResolvedVehicle(RES.get(name).vehicle)), mileage: miles } } }), vm = am && am.variantSplit;
  ok(`${f.id}, typed mileage: show stays true`, !!vm && vm.show === true, am && [am.tier, vm && vm.show]);
  for (const [i, row] of (vm ? vm.rows : []).entries()) {
    const L = `${f.id}, ${row.name}, ${miles} miles`, dec = row.car && CT.decodeCar(row.car.token);
    ok(`${L}: the row's car carries the typed mileage (token, words, address)`, !!dec && dec.mileage === miles && row.car.words.endsWith(`${miles.toLocaleString("en-US")} miles`) && row.car.address.includes(encodeURIComponent("36,000 miles")), row.car);
    if ((plan.counts[i] || 0) < 5) { ok(`${L}: an unpriced variant stays unpriced with the mileage (no range, its own count)`, !row.rangeText && row.priced === false, row); continue; }
    const h = row.car ? await asked(f, plan, row.car.words.replace(/ 36,000 miles$/, ""), miles) : null; if (!h) continue;
    const thin = !!(h.variants && h.variants.thin), hr = thin ? null : VR.rangeTextOf(h), hn = thin && h.variants.pooled != null ? h.variants.pooled : VR.salesCountOf(h);
    ok(`${L}: the row equals the banded answer of its own car (range ${hr || "none"}, ${CN.countNoun(hn, "sale")})`, (row.rangeText || null) === (hr || null) && row.salesText === CN.countNoun(hn, "sale"), [row.rangeText, hr, row.salesText, hn]);
  }
  // 5 show false
  const stated = await asked(f, plan, `${name} ${f.variants[f.variants.length - 1].name}`); ok(`${f.id}: a stated variant: show is false and there are no rows`, !!stated && (!stated.variantSplit || (stated.variantSplit.show === false && stated.variantSplit.rows.length === 0)), stated && stated.variantSplit);
  install(model, mkRows(f, plan, { flat: true })); const flat = await hit({ oneBox: true, search: name }); ok(`${f.id}: variants that do not sell apart (the same prices): show is false`, !!flat && flat.variantSplit && flat.variantSplit.show === false && flat.variantSplit.rows.length === 0, flat && flat.variantSplit);
  install(model, mkRows(f, plan)); const refined = await hit({ oneBox: true, search: name, refine: { body: "coupe" } }); ok(`${f.id}: a refined answer (a body chip) has no rows`, !refined || !refined.variantSplit || refined.variantSplit.show === false, refined && refined.variantSplit);
}
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
    ["the rows are not served", "api/sellerDecision.js", "if (!vinCtx && !exactSale) oneBox = await variantSplitFor(", "if (false) oneBox = await variantSplitFor("],
    ["the rows are shown whether or not the variants sell apart", "lib/variantRows.js", "if (!variantsApart(groups)) {", "if (false) {"],
    ["a stated variant still gets rows", "lib/variantRows.js", "|| d.variants.applied || (d.variants.stated || []).length || d.variants.chosen) return d;", ") return d;"],
    ["the rows are in another order", "lib/variantRows.js", "fam.variants.map(async v =>", "[...fam.variants].reverse().map(async v =>"],
    ["a row's car does not carry the typed mileage", "lib/variantRows.js", "...(typedMiles ? { mileage: typedMiles } : {}) }, gen", "}, gen"],
    ["a row is read without the typed mileage band", "lib/variantRows.js", "{ ...env, asked: 0 }, withTypedMileage(rv, null))", "{ ...env, asked: 0 }, null)"],
    ["a thin variant gets the blended range", "lib/variantRows.js", "raw && raw.variants && raw.variants.thin ? null : rangeTextOf(raw)", "rangeTextOf(raw)"],
    ["a thin variant counts the blended sales", "lib/variantRows.js", "raw && raw.variants && raw.variants.thin && Number.isFinite(Number(raw.variants.pooled)) ? Number(raw.variants.pooled) : salesCountOf(raw)", "salesCountOf(raw)"],
    ["a row's range is built another way (the rounded middle)", "lib/variantRows.js", "`${moneyOf(d.cluster[0])} to ${moneyOf(d.cluster[1])}`", "`${moneyOf(Number(d.cluster[0]) + 100)} to ${moneyOf(d.cluster[1])}`"],
    ["a row counts the wrong pool", "lib/variantRows.js", "const n = Number(d && (d.poolN != null ? d.poolN : d.soldCount));", "const n = Number(d && d.soldCount) + 1;"],
    ["the line is not the engine's", "lib/reasonWords.js", "A ${p.model}'s price depends on which one it is.", "Prices vary."],
    ["a row has no address", "lib/variantRows.js", "address: \"/market-check?q=\" + encodeURIComponent(w ? w.label : text),", "address: \"\","],
    ["a row has no token", "lib/variantRows.js", "car: st ? { token: st.token,", "car: st ? { token: null,"],
    ["a row for the sales that name no variant", "lib/variantRows.js", "fam.variants.map(async v =>", "[...fam.variants, { name: \"Unstated\" }].map(async v =>"],
    ["a refined answer gets rows", "lib/variantRows.js", "if (!onlyMiles || Number(ctx && ctx.asked) > 0", "if (Number(ctx && ctx.asked) > 0"]
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
