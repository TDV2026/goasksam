// clock: real-ok the fixture sales are dated relative to now (days ago); no calendar date is asserted
// VARIANTS THAT PRICE APART ARE NOT ONE POOL (Lane B, lane-b-variant-split, Nov 17 2026; order bc85). Hagerty's analysts found a third generation Pontiac Firebird comes back as ONE market (base, Formula, Trans Am, GTA together) although the variants price apart; the GTA was an option
// package on the Trans Am, so it is in no VIN, only in each sale's own words. CAUSE: the pool had no notion of a variant: a typed trim was a title fence and a car that named none read the whole generation, and nothing said which variants were in the figures, so an analyst could not choose.
// FIX (lib/variants.js, data/variantFamilies.json, lib/onebox.js): one reader takes a sale's variant from its title and details against the family list in DATA; the car's variant from the VIN (where a family has a rule) else the words else none; a stated variant prices on that variant's sales,
// an unstated one on every variant as before; fewer than 5 sales of the variant read every variant and say so; the answer carries variants (and desk.variants) and the Desk's variant_set recounts everything through the engine.
// CLASS: every family in the data, the three ordered ones here (Pontiac Firebird, Chevrolet Camaro, Ford Mustang) with the same strings, Market Check and the Desk. THE RULES TESTED: a stated GTA is priced on GTA sales; a stated Trans Am SETS THE GTA ASIDE (the package rule, lib/variants.js rule 2) and counts it
// when the data says includesPackages; an unstated car is unchanged (every sale in, the answer of the same world with the variants switched off); a sale that names no variant is never counted as base; the thin fallback line appears at 4 sales and not at 5; variant_set recounts the range, the reserve
// ladder and its byCondition, the nearest sales and the chart over the chosen pool and equals the read of an archive holding only those sales; the case layer (recall input and key, set, clear, refuse); DESK_SHAPE.
//   node scripts/variantSplitCheck.mjs [repo root]      --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
process.env.SUPABASE_URL = "https://fake.example"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k"; process.env.LAUNCH_STAGE = "2";
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const WLD = await imp("scripts/_deskOlderWorld.mjs"), OB = await imp("lib/onebox.js"), SR = await imp("lib/sheetRead.js"), V = await imp("lib/variants.js"), CW = await imp("lib/desk/caseWorkflow.js"), DV = await imp("lib/deskV3.js");
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 300) : "")); } };
const err = console.error; console.error = () => {};
const w = WLD.install(ROOT), DAY = 864e5; let seq = 0;
let UNIQ = false;   // part 2 of variant-2: every sale of a world has its own price and mileage, so the engine's dedupe keeps them all
const world = (make, model, years, spec) => {   // spec: [[title words, count, price]] ; the title words are the variant words the sale names ("" names none)
  const rows = []; let k = 0;
  for (const [words, count, price] of spec) for (let i = 0; i < count; i++) {
    const year = years[0] + (k % (years[1] - years[0] + 1)), id = "vs" + (seq++), title = `${year} ${make} ${model}${words ? " " + words : ""}`;
    const raw = { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(UNIQ ? 30000 + k * 211 : 30000 + (k % 20) * 500), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
    rows.push({ id, source_id: id, sale_price: price + (UNIQ ? i * 53 : (i % 5) * 250), sale_date: new Date(Date.now() - (40 + (k % 9) * 8) * DAY).toISOString().slice(0, 10), platform: k % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: title, year, make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" });
    k++;
  }
  return rows;
};
const install = (model, rows) => { w.DATA.clear(); w.DATA.set(model, rows); };
// what the resolver reads of each typed string (the engine's real resolver gives these trims for these words: lib/vehicle.js, observed in lane-notes stage 1)
const TRIMS = [[/20th/i, "Trans AM"], [/trans[\s-]?am\s+gta|\bgta\b/i, "Trans AM GTA"], [/trans[\s-]?am/i, "Trans AM"], [/\bformula\b/i, "Formula"], [/iroc/i, "IROC-Z"], [/\bz[\s/-]?28\b/i, "Z28"], [/\brs\b/i, "RS"], [/cobra/i, "SVT Cobra"], [/\bgt\b/i, "GT"], [/\blx\b/i, "LX"]];
const FAMS = [["pontiac", "Pontiac", "Firebird"], ["chevrolet", "Chevrolet", "Camaro"], ["ford", "Ford", "Mustang"]];
const carOf = text => { const y = Number(/\b(19\d\d)\b/.exec(text)[1]), f = FAMS.find(x => new RegExp(x[2], "i").test(text)), t = TRIMS.find(([re]) => re.test(text)); return { year: y, make: f[1], model: f[2], trim: t ? t[1] : null }; };
w.deps.resolveVehicle = async text => ({ status: "valid", vehicle: carOf(text) });
const answer = async text => (await OB.oneEngineAnswer(carOf(text), null, text, { ...w.env })).raw;
const today = new Date().toISOString().slice(0, 10), head = async () => ({ status: 200, bytes: 50000, type: "image/jpeg" });
const desk = async (text, extra = {}) => (await SR.sheetRead(w.env, { ...carOf(text), mileage: 40000, desk: { caseDate: today, transmission: "Manual", label: text, case: { verification: {} }, exclusions: [], head, views: true, ...extra } }, w.deps)).desk;
const DROP = new Set(["variants", "readAt", "dedup", "shape"]), strip = x => JSON.stringify(x, (k, v) => DROP.has(k) ? undefined : v), stripD = strip;   // the new field, the clock and the timings are the only things that may differ from the engine before the variants
const ids = d => (d.rawPool || []).map(r => r.id).sort();
const titles = d => (d.rawPool || []).map(r => String(r.raw_title || r.rtitle || ""));
const vb = d => d && d.variants, tl = x => String((x && (x.titleLine || x.title)) || "");
const item = (b, n) => b && b.items.find(i => i.name === n);

// ===== THE FIREBIRD: 6 Trans Am, 5 GTA (a package on the Trans Am), 5 Formula, 5 that name none, 0 Firehawk =====
const FB = [["Trans Am", 6, 30000], ["Trans Am GTA", 5, 24000], ["Formula", 5, 13000], ["", 5, 7500]];
install("Firebird", world("Pontiac", "Firebird", [1987, 1987], FB));
const allIds = w.DATA.get("Firebird").map(r => r.id).sort();
{ const g = await answer("1987 Pontiac Firebird Trans Am GTA"), t = await answer("1987 Pontiac Firebird Trans Am"), u = await answer("1987 Pontiac Firebird"), f = await answer("1987 Pontiac Firebird Formula");
  ok("a stated GTA is priced on GTA sales only", ids(g).length === 5 && titles(g).every(x => /\bGTA\b/i.test(x)), { n: ids(g).length });
  ok("a stated GTA: variants say so (applied, GTA in the pool, the others out)", vb(g) && vb(g).applied === true && item(vb(g), "GTA").inPool && !item(vb(g), "Trans Am").inPool && !item(vb(g), "Formula").inPool && !item(vb(g), "Unstated").inPool && vb(g).source === "words", vb(g));
  ok("a stated Trans Am SETS THE GTA ASIDE (the package rule): 6 sales, none naming GTA", ids(t).length === 6 && titles(t).every(x => /trans am/i.test(x) && !/\bGTA\b/i.test(x)), { n: ids(t).length, t: titles(t) });
  ok("a stated Trans Am: the line names what is set aside, with no word base", vb(t) && vb(t).line === "Priced on Trans Am sales. GTA, Formula and sales that name no variant are set aside." && !/\bbase\b/i.test(JSON.stringify(vb(t))), vb(t) && vb(t).line);
  ok("a stated Trans Am: every variant found is counted (GTA 5, Formula 5, none 5, Firehawk 0), the GTA is marked a package of the Trans Am", vb(t) && item(vb(t), "GTA").count === 5 && item(vb(t), "GTA").package === "Trans Am" && item(vb(t), "Formula").count === 5 && item(vb(t), "Unstated").count === 5 && item(vb(t), "Firehawk").count === 0 && item(vb(t), "Trans Am").count === 6, vb(t));
  ok("a stated Formula is priced on Formula sales only", ids(f).length === 5 && titles(f).every(x => /formula/i.test(x)), { n: ids(f).length });
  // an unstated Firebird answers as it does on main: every sale is in the pool, nothing is applied
  // the control is the engine as it was before the variants (the family list emptied): an unstated car's whole answer, bar the new field, is byte for byte the same
  V.__useFamilies([]); const uOff = await answer("1987 Pontiac Firebird"), dOff = await desk("1987 Pontiac Firebird"); V.__useFamilies(null);
  ok("an unstated Firebird is UNCHANGED from the engine before the variants: the same answer, bar the new field", strip(u) === strip(uOff) && u.variants && !uOff.variants, { tier: u.tier, off: uOff.tier });
  { const d0 = await desk("1987 Pontiac Firebird"); ok("the Desk of an unstated Firebird is unchanged from the engine before the variants (bar the new field and the shape)", stripD(d0) === stripD(dOff), { a: (d0.sales || []).length, b: (dOff.sales || []).length }); }
  ok("an unstated Firebird: variants carry the counts and none applied; every variant is in the pool", vb(u) && vb(u).applied === false && vb(u).stated.length === 0 && vb(u).items.every(i => i.inPool) && vb(u).line === "No variant is named, so every variant is read together.", vb(u));
  // the same read with the variant reader switched off for the call (the answer of main) equals it
  const off = await (async () => { const spec0 = OB.buildSpec(carOf("1987 Pontiac Firebird"), null, "1987 Pontiac Firebird"); return spec0; })();
  ok("an unstated Firebird asks for no variant of its own (the spec holds no set)", !off.variantSet && !off.variantStated, off);
  ok("sales that name no variant are never counted as base: they are Unstated, in no variant's count, and set aside when a variant is stated", item(vb(t), "Unstated").count === 5 && !vb(t).items.some(i => /^base$/i.test(i.name)) && !titles(t).some(x => !/trans am/i.test(x)), vb(t));
  ok("an unstated car's variants name the sales that name no variant Unstated, in every pool read", item(vb(u), "Unstated").count === 5 && item(vb(u), "Unstated").inPool);
}
// ===== THE PACKAGE RULE IS DATA: a family whose entry says includesPackages counts the package with its parent =====
{ const list = JSON.parse(JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, "data/variantFamilies.json"), "utf8")).families)); list[0].variants.find(x => x.name === "Trans Am").includesPackages = true;
  const fam = V.familiesOf(list)[0];
  ok("includesPackages true: asking for the Trans Am counts the GTA too", JSON.stringify(V.poolNames(fam, ["Trans Am"]).sort()) === JSON.stringify(["20th Anniversary Turbo Trans Am", "GTA", "Trans Am"]), V.poolNames(fam, ["Trans Am"]));
  ok("includesPackages false (the data as shipped): asking for the Trans Am does not count the GTA", JSON.stringify(V.poolNames(V.familiesOf()[0], ["Trans Am"])) === JSON.stringify(["Trans Am"]));
  const rows = w.DATA.get("Firebird").map(r => ({ raw_title: r.listing_title })), got = V.applyVariants(rows, { variantFamily: fam.id, variantSet: V.poolNames(fam, ["Trans Am"]) }, { list });
  ok("includesPackages true: the pool is 11 sales (Trans Am and GTA)", got.rows.length === 11, got.rows.length);
  // a VIN rule reads the variant before the words
  const vfam = V.familiesOf([{ ...list[0], vin: { pos: 4, years: [1982, 1992], map: { F: "GTA" } } }])[0];
  ok("a family's VIN rule gives the variant, ahead of the typed words", JSON.stringify(V.variantOfCar(vfam, { vehicle: { year: 1988, trim: "Formula" }, vin: "1G2FS21F8JL000000" })) === JSON.stringify({ names: ["GTA"], source: "vin" }) && V.variantOfCar(vfam, { vehicle: { year: 1988, trim: "Formula" }, vin: "1G2SS21F8JL000000" }).source === "words");
}
// ===== THE THIN FALLBACK: 4 sales of the variant read every variant and say so in one line; 5 apply =====
{ const spec = n => [["Formula", n, 20000], ["Trans Am", 6, 21000], ["", 5, 20500]];   // close prices, so the engine reads the pool and asks no trim question
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], spec(4)));
  const f4 = await answer("1987 Pontiac Firebird Formula");
  ok("4 Formula sales: the thin fallback reads every variant (more than 4 in the pool)", vb(f4) && vb(f4).thin === true && vb(f4).applied === false && ids(f4).length === 15, { thin: vb(f4) && vb(f4).thin, n: ids(f4).length });
  ok("4 Formula sales: the one line says so", vb(f4) && vb(f4).thinLine === "Only 4 Formula sales, too few to price on, so every variant is read together." && vb(f4).line === vb(f4).thinLine, vb(f4) && vb(f4).line);
  ok("4 Formula sales: no variant is marked in the pool while thin", vb(f4) && vb(f4).items.every(i => !i.inPool));
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], spec(5)));
  const f5 = await answer("1987 Pontiac Firebird Formula");
  ok("5 Formula sales: priced on the variant, no thin line", vb(f5) && vb(f5).thin === false && vb(f5).applied === true && ids(f5).length === 5 && vb(f5).thinLine === null, { n: ids(f5).length });
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], FB));
}
// ===== THE DESK: desk.variants, and variant_set recounts everything through the engine =====
{ const d0 = await desk("1987 Pontiac Firebird"), dT = await desk("1987 Pontiac Firebird Trans Am");
  ok("desk.variants is the answer's variants (the same object on the Desk)", d0 && JSON.stringify(d0.variants) === JSON.stringify(vb(await answer("1987 Pontiac Firebird"))), d0 && d0.variants && d0.variants.line);
  ok("the Desk of an unstated Firebird reads every variant (21 sales)", d0.variants && d0.variants.applied === false && (d0.sales || []).length === 21, { sales: (d0.sales || []).length });
  ok("the Desk of a stated Trans Am prices on the Trans Am sales only", dT.variants && dT.variants.applied && (dT.sales || []).length === 6 && (dT.sales || []).every(s => /trans am/i.test(tl(s)) && !/\bgta\b/i.test(tl(s))), { sales: (dT.sales || []).length });
  // variant_set: the analyst's set replaces the car's variant; every figure is the one of an archive holding only those sales
  const set = ["Trans Am", "GTA"], dS = await desk("1987 Pontiac Firebird", { variantSet: set });
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], FB.slice(0, 2)));
  const dOnly = await desk("1987 Pontiac Firebird");
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], FB));
  ok("variant_set: desk.variants says chosen, source analyst, the two variants in the pool", dS.variants && dS.variants.source === "analyst" && JSON.stringify(dS.variants.chosen) === JSON.stringify(set) && item(dS.variants, "GTA").inPool && item(dS.variants, "Trans Am").inPool && !item(dS.variants, "Formula").inPool, dS.variants);
  ok("variant_set: the sales are the 11 of the chosen variants", (dS.sales || []).length === 11 && (dS.sales || []).every(s => /trans am|gta/i.test(tl(s))), { n: (dS.sales || []).length });
  const sig = x => ({ ev: x.evidence && { n: x.evidence.count, med: x.evidence.median, low: x.evidence.low, high: x.evidence.high }, lad: x.reserveLadder && x.reserveLadder.rungs && x.reserveLadder.rungs.map(r => [r.key, r.figure, r.cleared, r.of]), by: x.reserveLadder && x.reserveLadder.byCondition, near: (x.comparables || []).map(c => tl(c)).sort(), chart: (x.quarters || []).map(q => [q.label || q.quarter, q.count, q.median]), n: (x.sales || []).length, start: x.reserveStart });
  ok("variant_set: the range, median, ladder, byCondition, nearest sales and chart equal the read of an archive holding only the chosen sales", JSON.stringify(sig(dS)) === JSON.stringify(sig(dOnly)), { chosen: sig(dS).ev, only: sig(dOnly).ev });
  ok("variant_set: the figures moved from the all-variants read (the ladder and the median are the chosen pool's)", JSON.stringify(sig(dS).lad) !== JSON.stringify(sig(d0).lad) && JSON.stringify(sig(dS).ev) !== JSON.stringify(sig(d0).ev), { chosen: sig(dS).ev, all: sig(d0).ev });
  ok("variant_set: the nearest sales name only the chosen variants", (dS.comparables || []).length > 0 && (dS.comparables || []).every(c => /trans am|gta/i.test(tl(c))), (dS.comparables || []).map(c => tl(c)));
  const dC = await desk("1987 Pontiac Firebird", { variantSet: ["Nonsense"] });
  ok("a set with no name the family holds is ignored: the car's own variant (here none) stands", dC.variants && dC.variants.applied === false && (dC.sales || []).length === 21, dC.variants && dC.variants.line);
  const d1 = await desk("1987 Pontiac Firebird", { variantSet: ["Unstated"] });
  ok("the set may be the sales that name no variant", d1.variants && d1.variants.applied && item(d1.variants, "Unstated").inPool && (d1.sales || []).length === 5, { n: (d1.sales || []).length });
}
// ===== THE CASE LAYER: the set is an input of the read =====
{ const CM = await imp("lib/desk/caseModel.js"), mkCase = () => { const c = CM.newCase({ now: new Date().toISOString(), vehicle: { year: 1987, make: "Pontiac", model: "Firebird", mileage: 40000, transmission: "Manual" } }); c.desk = { evidence: { count: 1 }, shape: 9, key: null, variants: { familyId: "pontiac-firebird-3rd" } }; return c; };
  const c0 = mkCase(), now = new Date().toISOString(), k0 = CW.recallKey(c0);
  const c1 = CW.setVariants(c0, ["Trans Am", "GTA"], now);
  ok("setVariants stores the names the family holds", c1 && JSON.stringify(c1.variantSet) === JSON.stringify(["Trans Am", "GTA"]), c1 && c1.variantSet);
  ok("the chosen set is in the recall key and in the engine's input (so the case is read again)", c1 && CW.recallKey(c1) !== k0 && JSON.stringify(CW.recallInput(c1, today).desk.variantSet) === JSON.stringify(["Trans Am", "GTA"]) && CW.needsRecall({ ...c1, desk: { ...c1.desk, key: k0 } }), c1 && CW.recallKey(c1));
  ok("a case with no set keeps its key and sends no set (a stored case is not disturbed)", !("variantSet" in CW.recallInput(c0, today).desk) && CW.recallKey(c0) === k0);
  ok("clearing the set goes back to the car's own variant and the old key", (() => { const c2 = CW.setVariants(c1, [], now); return c2 && !c2.variantSet && CW.recallKey(c2) === k0; })());
  ok("a name the family does not hold is refused", CW.setVariants(c0, ["Nonsense"], now) === null);
  ok("a case whose answer names no family refuses a set", CW.setVariants({ ...c0, desk: { evidence: { count: 1 }, shape: 9 } }, ["GTA"], now) === null);
  ok("the Desk's variant_set action is a read op and a named op", /READ_OPS = \[[^\]]*"variant_set"/.test(fs.readFileSync(path.join(ROOT, "lib/desk/sheetActions.js"), "utf8")) && /NAMED_OPS = \{ variant_set: "variant_set"/.test(fs.readFileSync(path.join(ROOT, "lib/desk/sheetActions.js"), "utf8")));
}
// ===== STORED CASES READ ONCE: the shape =====
ok("DESK_SHAPE is 9 (8 is lane-b-mileage-band's; lane-b-year-widen's own 8 is on its older base): a stored case below 9 is read again once", DV.DESK_SHAPE === 9 && CW.staleShape({ desk: { evidence: { count: 1 }, shape: 8 } }) && !CW.staleShape({ desk: { evidence: { count: 1 }, shape: 9 } }));
// ===== THE SAME STRINGS ON THE CAMARO AND THE MUSTANG =====
{ const CM = [["IROC-Z", 6, 22000], ["Z28", 6, 15000], ["RS", 5, 10000], ["", 5, 9000]];
  install("Camaro", world("Chevrolet", "Camaro", [1987, 1987], CM));
  const iroc = await answer("1987 Chevrolet Camaro IROC-Z"), z = await answer("1987 Chevrolet Camaro Z28"), un = await answer("1987 Chevrolet Camaro"), rs = await answer("1987 Chevrolet Camaro RS");
  ok("Camaro: a stated IROC-Z is priced on IROC-Z sales", ids(iroc).length === 6 && titles(iroc).every(x => /iroc/i.test(x)), { n: ids(iroc).length });
  ok("Camaro: a stated Z28 sets the IROC-Z set aside (a package of the Z28) and prices on the Z28 sales", ids(z).length === 6 && titles(z).every(x => /z28/i.test(x) && !/iroc/i.test(x)) && item(vb(z), "IROC-Z").package === "Z28", { n: ids(z).length });
  V.__useFamilies([]); const unOff = await answer("1987 Chevrolet Camaro"); V.__useFamilies(null);
  ok("Camaro: an unstated car is unchanged from the engine before the variants", strip(un) === strip(unOff) && vb(un) && !vb(un).applied, { tier: un.tier });
  ok("Camaro: sales naming no variant are Unstated (5), never base", item(vb(z), "Unstated").count === 5 && !vb(z).items.some(i => /^base$/i.test(i.name)));
  ok("Camaro: a stated RS with 5 sales is priced on them", ids(rs).length === 5 && vb(rs).applied);
  install("Camaro", world("Chevrolet", "Camaro", [1987, 1987], [["RS", 4, 20000], ["Z28", 6, 21000], ["", 5, 20500]]));
  const rs4 = await answer("1987 Chevrolet Camaro RS");
  ok("Camaro: 4 RS sales read the other variants with them (the engine's own Camaro rule still sets the Z28 aside) and say so", vb(rs4).thin && vb(rs4).thinLine === "Only 4 RS sales, too few to price on, so every variant is read together." && ids(rs4).length > 4 && titles(rs4).some(x => /\bRS\b/.test(x)) && titles(rs4).some(x => !/\bRS\b/.test(x)), { n: ids(rs4).length, tier: rs4.tier, line: vb(rs4).line });
  const MU = [["Cobra", 6, 64000], ["GT", 6, 18000], ["LX", 6, 19000], ["Saleen", 5, 45000], ["", 5, 25000]];
  install("Mustang", world("Ford", "Mustang", [1990, 1990], MU));
  const cobra = await answer("1990 Ford Mustang Cobra"), gt = await answer("1990 Ford Mustang GT"), un2 = await answer("1990 Ford Mustang"), lx = await answer("1990 Ford Mustang LX");
  ok("Mustang: a stated Cobra is priced on Cobra sales only", ids(cobra).length === 6 && titles(cobra).every(x => /cobra/i.test(x)), { n: ids(cobra).length });
  ok("Mustang: a stated GT sets the Cobra, Saleen and LX sales aside", ids(gt).length === 6 && titles(gt).every(x => /\bGT\b/.test(x) && !/cobra|saleen/i.test(x)) && item(vb(gt), "Cobra").count === 6 && item(vb(gt), "Saleen").count === 5, { n: ids(gt).length });
  V.__useFamilies([]); const un2Off = await answer("1990 Ford Mustang"); V.__useFamilies(null);
  ok("Mustang: an unstated car is unchanged from the engine before the variants", strip(un2) === strip(un2Off) && !vb(un2).applied, { tier: un2.tier });
  ok("Mustang: sales naming no variant are Unstated (5), never base", item(vb(lx), "Unstated").count === 5 && !vb(lx).items.some(i => /^base$/i.test(i.name)));
  const dm = await desk("1990 Ford Mustang", { variantSet: ["GT", "LX"] });
  ok("Mustang: variant_set on the Desk prices on the chosen 12 sales (GT and LX)", dm.variants && dm.variants.source === "analyst" && (dm.sales || []).length === 12 && (dm.sales || []).every(s => /\bGT\b|\bLX\b/.test(tl(s))), { n: (dm.sales || []).length });
}
// ===== A CAR IN NO FAMILY IS UNTOUCHED, AND NO PAGE COMPUTES =====
{ install("Beetle", world("Volkswagen", "Beetle", [1965, 1970], [["", 8, 15000]]));
  const b = (await OB.oneEngineAnswer({ year: 1967, make: "Volkswagen", model: "Beetle" }, null, "1967 Volkswagen Beetle", { ...w.env })).raw;
  ok("a car in no family carries no variants and its pool is unchanged", b.variants === undefined && !(b.rawPool || []).some(r => false)); install("Firebird", world("Pontiac", "Firebird", [1987, 1987], FB));
  const read = f => fs.readFileSync(path.join(ROOT, f), "utf8"), pages = ["public/js/onebox.js", "public/js/tasks.js", "public/js/find.js", "lib/preview/deskV4Client.js", "lib/preview/deskApp.js"].filter(f => fs.existsSync(path.join(ROOT, f)));
  ok("no page file reads a variant from a sale or builds the line (pages compute nothing)", pages.every(f => !/variantOfSale|applyVariants|poolNames|variantsBlock/.test(read(f))), pages);
  ok("the one pool choke point applies the variants (fetchQualifyingCore)", /async function fetchQualifyingCore\(spec[^)]*\) \{[\s\S]{0,900}applyVariants\(rows, spec/.test(read("lib/onebox.js")));
  ok("the families are data, not code (the Firebird, Camaro, Mustang and Corvette entries live in data/variantFamilies.json)", ["pontiac-firebird-3rd", "chevrolet-camaro-3rd", "ford-mustang-fox", "chevrolet-corvette-c4"].every(id => read("data/variantFamilies.json").includes(id)) && !/Firehawk|Berlinetta/.test(read("lib/variants.js").replace(/\/\/.*$/gm, "")));
}

// ===== VARIANT 2, PART 1 (lane-b-variant-2, Nov 17 2026): the 20th Anniversary Turbo Trans Am is its own variant; replicas, tributes, KITT and Knight Rider cars are set aside from every pool with their count shown =====
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const REPLICA_TITLE = /kitt|knight rider|tribute|replica|re-?creation|clone/i;
{ const famData = JSON.parse(read("data/variantFamilies.json")).families.find(f => f.id === "pontiac-firebird-3rd"), v20 = famData && famData.variants.find(v => /20th/i.test(v.name));
  ok("the Firebird's variant data holds the 20th Anniversary Turbo Trans Am as a package of the Trans Am (20 sales at $42,000 against $14,250 in the engine's read, 2026-11-17)", !!v20 && v20.package === "Trans Am" && famData.variants.indexOf(v20) < famData.variants.findIndex(v => v.name === "Trans Am"), v20);
  const FB2 = [["Trans Am", 12, 14000], ["20th Anniversary Turbo Trans Am", 8, 42000], ["Trans Am KITT Replica", 3, 60000], ["Trans Am Tribute", 2, 22000], ["Trans Am Knight Rider", 2, 30000], ["Trans Am GTA", 8, 24000], ["Formula", 8, 13000], ["", 8, 8000]];
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], FB2));
  const all = w.DATA.get("Firebird"), t = await answer("1987 Pontiac Firebird Trans Am"), u = await answer("1987 Pontiac Firebird"), s20 = await answer("1987 Pontiac Firebird 20th Anniversary Turbo Trans Am");
  const inPool = d => (d.rawPool || []).map(r => String(r.raw_title || r.title || ""));
  ok("a stated Trans Am: no 20th Anniversary car, and no replica, tribute, KITT or Knight Rider car, is in the pool", inPool(t).length > 0 && inPool(t).every(x => !/20th/i.test(x) && !REPLICA_TITLE.test(x)), inPool(t).filter(x => /20th/i.test(x) || REPLICA_TITLE.test(x)));
  ok("an unstated Firebird: the 20th Anniversary cars are counted as their own variant (8 sales, own name)", vb(u) && item(vb(u), "20th Anniversary Turbo Trans Am") && item(vb(u), "20th Anniversary Turbo Trans Am").count === 8 && item(vb(u), "20th Anniversary Turbo Trans Am").package === "Trans Am", vb(u) && vb(u).items.map(i => i.name + ":" + i.count));
  ok("a stated Trans Am prices on the Trans Am only: the 20th Anniversary cars are not in its pool (the engine's own halo rule and the package rule agree)", vb(t) && !item(vb(t), "20th Anniversary Turbo Trans Am").inPool, vb(t) && vb(t).line);
  ok("an unstated Firebird: no replica, tribute, KITT or Knight Rider car is in the pool or in any variant's count (counts add up to the pool the census read)", inPool(u).every(x => !REPLICA_TITLE.test(x)) && vb(u) && vb(u).items.every(i => i.count >= 0) && vb(u).total === vb(u).items.reduce((n, i) => n + i.count, 0), vb(u) && [vb(u).total, vb(u).items.map(i => i.count)]);
  const from = String(t.windowStart || "").slice(0, 10), want = all.filter(r => REPLICA_TITLE.test(r.listing_title) && (!from || r.sale_date >= from)).length;
  ok("the replicas and tributes set aside are COUNTED on the answer (replicasAside), the number the archive holds in the answer's window", want > 0 && t.replicasAside === want, [t.replicasAside, want]);
  const line = OB.withReadFields(t, "1987 Pontiac Firebird Trans Am", carOf("1987 Pontiac Firebird Trans Am")).setAsideLine;
  ok("the engine's own set-aside line says so (the page prints it): N replicas or tributes set aside", new RegExp(`^${want} replicas? or tributes? set aside`).test(line || ""), line);
  ok("a stated 20th Anniversary Turbo Trans Am is priced on those 8 sales only", ids(s20).length === 8 && titles(s20).every(x => /20th/i.test(x)), titles(s20).length);
  ok("the Firebird no longer counts a Knight Rider title as a Trans Am sale (the title fence)", !all.filter(r => /knight rider/i.test(r.listing_title)).some(r => inPool(t).includes(r.listing_title)));
  const C = await imp("lib/_classify.js"); ok("the one reader of a replica car names KITT, Knight Rider, tribute, replica, re-creation and clone and nothing else", ["1982 Pontiac Firebird Trans Am KITT", "1982 Trans Am Knight Rider", "Trans Am Tribute", "Trans Am Replica", "Trans Am Re-Creation", "Trans Am Clone"].every(x => C.isReplicaCar(x)) && ["1989 Pontiac Firebird Trans Am", "1999 Mrs Kittredge Special", "1987 Pontiac Firebird Formula"].every(x => !C.isReplicaCar(x)));
}
// A CLASS OF CARS: every family in the data keeps its replicas out of the pool and counts them (a replica of the family's first variant, in the family's own words)
{ const FAMS2 = JSON.parse(read("data/variantFamilies.json")).families;
  for (const f of FAMS2.filter(f => ["Firebird", "Camaro", "Mustang"].includes(f.models[0]))) {
    const model = f.models[0], vn = f.variants.find(v => !v.package) || f.variants[0], word = vn.name.replace(/\W+$/, "");
    install(model, world(f.make, model, [f.years[0] + 5, f.years[0] + 5], [[word, 10, 15000], ["", 8, 9000], [word + " Tribute", 2, 40000], [word + " Replica", 2, 40000]]));
    const text = `${f.years[0] + 5} ${f.make} ${model}`, d = (await OB.oneEngineAnswer({ year: f.years[0] + 5, make: f.make, model, trim: null }, null, text, { ...w.env })).raw;
    ok(`${f.label}: replicas and tributes are in no pool and the answer counts the 4 it set aside`, (d.rawPool || []).every(r => !REPLICA_TITLE.test(String(r.raw_title || r.title || ""))) && (d.replicasAside || 0) >= 1, [(d.rawPool || []).length, d.replicasAside]);
  } }

// ===== VARIANT 2, PART 2: THE VARIANT QUESTION (an unstated car of a family whose variants price apart is asked which variant; crew only) =====
UNIQ = true; const TRIM_FIRST0 = OB.RANGE_RULES.trimFirst; OB.RANGE_RULES.trimFirst = false;   // the engine's own trim question (trimFirst, its rank test) goes first when trims price apart; this section is the case it does not fire, so it is switched off here and restored below
process.env.OLDCARSDATA_API_KEY = "x"; process.env.CURTAIN_CREW_CODE = "fixture-crew-code"; process.env.SUPABASE_ANON_KEY = "k";
{ const { mintCrewCookieValue } = await imp("lib/_crew.js"), CREW = "gas_crew=" + mintCrewCookieValue(), H = (await imp("api/sellerDecision.js")).default; let n = 0;
  const hit = async (body, crew) => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = b; return this; }, setHeader() {}, end() {}, getHeader() {} }; await H({ method: "POST", headers: { origin: "https://goasksam.com", cookie: crew ? CREW : "" }, query: {}, body, socket: { remoteAddress: "10.7." + Math.floor(++n / 250) + "." + (n % 250) } }, res); return out; };
  const byVariant = (d, famId) => { const fam = V.familiesOf().find(f => f.id === famId), per = {}; for (const r of (d.rawPool || [])) { const k = V.variantOfSale(fam, r); per[k] = (per[k] || 0) + 1; } return per; };
  const FQ = [["Trans Am", 14, 14000], ["Formula", 12, 11500], ["", 12, 9500], ["Trans Am GTA", 4, 24000]];
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], FQ));
  const eng = (await OB.oneEngineAnswer(carOf("1987 Pontiac Firebird"), null, "1987 Pontiac Firebird", { ...w.env })).raw, per = byVariant(eng, "pontiac-firebird-3rd");
  const q = await hit({ oneBox: true, search: "1987 Pontiac Firebird" }, true), vis = await hit({ oneBox: true, search: "1987 Pontiac Firebird" }, false);
  ok("CREW: an unstated Firebird whose variants price apart is answered with a variant question (tier variant_choice, askIndex 1)", q && q.status === "one_box" && q.tier === "variant_choice" && q.askIndex === 1 && q.variantQuestion === true, q && [q.tier, q.error]);
  const ch = (q && q.variantChoices) || [];
  ok("the options are the variants with five or more sales in the pool, with the engine's own counts, most sales first", ch.length >= 2 && ch.every(c => c.count >= 5) && ch.every(c => (c.key === "fv-unstated" ? per.Unstated : per[c.label]) === c.count) && ch.every((c, i) => i === 0 || ch[i - 1].count >= c.count), [ch.map(c => c.label + ":" + c.count), per]);
  ok("a variant under five sales is not an option (the GTA is 4 here, set aside by the halo rule or too thin either way)", ch.every(c => c.label !== "GTA"));
  ok("the question has the shape of the other identity questions: prompt, variantOptions as 'Name (N sales)', optionCounts, variantChoices of key, label, count, query and refine.variant", typeof q.prompt === "string" && /^Which .+\? The .+ sell in different markets\.$/.test(q.prompt) && q.variantOptions.length === ch.length && q.variantOptions.every((x, i) => x === `${ch[i].label} (${ch[i].count} sales)`) && q.optionCounts.join() === ch.map(c => c.count).join() && ch.every(c => /^fv-[a-z0-9-]+$/.test(c.key) && c.query === "1987 Pontiac Firebird" && c.refine && c.refine.variant === c.key), q.prompt);
  ok("the sales that name no variant are an option in the engine's words ('Cars that name no variant')", ch.some(c => c.key === "fv-unstated" && c.label === "Cars that name no variant"), ch.map(c => c.label));
  ok("VISITOR: the same search reads as it did before (a range, no question): visitors see today's behaviour", vis && vis.tier === "result" && !("variantChoices" in vis) && !vis.variantQuestion, vis && vis.tier);
  ok("the question is never stored: after the crew's ask a visitor still reads the range", (await hit({ oneBox: true, search: "1987 Pontiac Firebird" }, false)).tier === "result");
  const pick = await hit({ oneBox: true, search: "1987 Pontiac Firebird", refine: { variant: "fv-formula", label: "Formula" }, asked: 1 }, true);
  ok("a chip (refine.variant fv-formula) is the car's variant: priced on Formula sales only, the variants block says it was asked", pick.tier === "result" && pick.variants && pick.variants.applied && pick.variants.stated.join() === "Formula" && pick.variants.source === "asked" && (pick.rawPool || []).length > 0 && (pick.rawPool || []).every(r => /formula/i.test(String(r.raw_title || r.title))), pick.variants && pick.variants.line);
  const any = await hit({ oneBox: true, search: "1987 Pontiac Firebird", asked: 1 }, true);
  ok("the Any chip (asked once, no variant) answers the range of every variant and does not ask again", any.tier === "result" && !any.variantQuestion);
  const stated = await hit({ oneBox: true, search: "1987 Pontiac Firebird Trans Am" }, true);
  ok("a car that names its variant is not asked", stated.tier === "result" && !stated.variantQuestion);
  const bogus = await hit({ oneBox: true, search: "1987 Pontiac Firebird", refine: { variant: "fv-nope" }, asked: 1 }, true);
  ok("a key that names no variant of the family changes nothing", bogus.tier === "result" && !(bogus.variants && bogus.variants.applied));
  // alike: no question
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], [["Trans Am", 14, 14000], ["Formula", 12, 14000], ["", 12, 14000]]));
  { const al = await hit({ oneBox: true, search: "1987 Pontiac Firebird" }, true); ok("variants that do NOT price apart (middle halves overlap) are not asked about", al.tier === "result", [al.tier, al.prompt]); }
  // one option only
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], [["Trans Am", 14, 14000], ["Formula", 3, 11500], ["", 2, 9500]]));
  ok("fewer than two variants with five sales: not asked", (await hit({ oneBox: true, search: "1987 Pontiac Firebird" }, true)).tier === "result");
  // the threshold, exactly: the variant floor is the census floor and the apart test is the engine's own (splitMaterial)
  const OBm = await imp("lib/onebox.js"); const base = { tier: "result", variants: { familyId: "pontiac-firebird-3rd", applied: false, stated: [], chosen: null }, titleLine: "1987 Pontiac Firebird", rawPool: [] };
  const mkPool = (a, b, na, nb) => [...Array.from({ length: na }, (_, i) => ({ raw_title: "1987 Pontiac Firebird Trans Am", _usd: a + i * 100 })), ...Array.from({ length: nb }, (_, i) => ({ raw_title: "1987 Pontiac Firebird Formula", _usd: b + i * 100 }))];
  const ask = (pool) => OBm.withVariantQuestion({ ...base, rawPool: pool }, { text: "1987 Pontiac Firebird", asked: 0 }).tier;
  ok("THRESHOLD: 5 and 5 sales whose middle halves are clear of each other ask", ask(mkPool(20000, 10000, 5, 5)) === "variant_choice");
  ok("THRESHOLD: 4 and 5 sales do not ask (a variant under five is never priced on its own)", ask(mkPool(20000, 10000, 4, 5)) === "result");
  ok("THRESHOLD: middle halves that overlap do not ask", ask(mkPool(10000, 10300, 8, 8)) === "result");
  ok("THRESHOLD: a gap between the middle halves of one pair asks, a hair of overlap does not", ask(mkPool(12000, 10000, 6, 6)) === "variant_choice" && ask(mkPool(10200, 10000, 6, 6)) === "result");
  // the class: every Firebird, Camaro and Mustang family of the data whose variants price apart asks, in the same shape
  for (const [id, make, model, year, names] of [["chevrolet-camaro-3rd", "Chevrolet", "Camaro", 1987, ["Z28", "RS", ""]], ["ford-mustang-fox", "Ford", "Mustang", 1987, ["GT", "LX", ""]]]) {
    install(model, world(make, model, [year, year], [[names[0], 14, 20000], [names[1], 12, 16000], [names[2], 12, 12800]]));
    const r = await hit({ oneBox: true, search: `${year} ${make} ${model}` }, true), rv = await hit({ oneBox: true, search: `${year} ${make} ${model}` }, false);
    ok(`${id}: crew is asked which variant, a visitor reads the range`, (r.tier === "variant_choice" ? r.variantChoices.length >= 2 : /_choice$/.test(String(r.tier))) && rv.tier !== "variant_choice", [r.tier, rv.tier]);
  }
  OB.RANGE_RULES.trimFirst = TRIM_FIRST0; UNIQ = false;
  // pages compute nothing: the page file has no variant reader and prints the engine's chips
  const pg = read("public/js/onebox.js"); ok("the page reads no variant of a sale and builds no variant key (it prints variantChoices as sent)", !/variantOfSale|variantKey\(|fv-/.test(pg) && /data-variantopt/.test(pg));
  ok("the question is served for a crew request only (the one call site)", /if \(isCrewRequest\(req\)\) oneBox = withVariantQuestion\(oneBox,/.test(read("api/sellerDecision.js")));
}
console.error = err;
for (const f of fails.slice(0, +(process.env.SHOW || 40))) console.log("FAIL " + f);
console.log(`variantSplitCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = path.resolve(args.find(a => !a.startsWith("--")) || path.join(path.dirname(me), ".."));
  const M = [
    ["the variant filter never narrows the pool", "lib/onebox.js", s => s.replace("    return kept;\n  } catch { return rows; }", "    return rows;\n  } catch { return rows; }")],
    ["a sale that names no variant is counted as Base", "lib/variants.js", s => s.replace("variantNamed(fam, textOf(row || {})) || UNSTATED;", "variantNamed(fam, textOf(row || {})) || fam.variants[0].name;")],
    ["a package is counted with its parent whatever the data says", "lib/variants.js", s => s.replace("if (def && def.includesPackages) for", "if (def) for")],
    ["there is no thin fallback", "lib/variants.js", s => s.replace("export const VARIANT_MIN = 5;", "export const VARIANT_MIN = 0;")],
    ["the thin fallback fires at 5", "lib/onebox.js", s => s.replace("value.rawPool.length < VARIANT_MIN", "value.rawPool.length <= VARIANT_MIN")],
    ["the analyst's set is ignored by the engine", "lib/onebox.js", s => s.replace("if (Array.isArray(vsd)) {", "if (false) {")],
    ["the Desk read drops the chosen set", "lib/sheetRead.js", s => s.replace("variantSet: Array.isArray(input.desk.variantSet) ? input.desk.variantSet : null,", "")],
    ["the chosen set is not in the case's recall key", "lib/desk/caseWorkflow.js", s => s.replace("...(variantSetOf(c) ? [{ variants: variantSetOf(c) }] : [])]);", "]);")],
    ["the chosen set is not sent to the engine", "lib/desk/caseWorkflow.js", s => s.replace("...(variantSetOf(c) ? { variantSet: variantSetOf(c) } : {}) }\n  };", "}\n  };")],
    ["the census of the set aside variants is not read", "lib/onebox.js", s => s.replace("if (!box.census && (spec.trim || spec.titleContains))", "if (false)")],
    ["the Desk does not serve the variants", "lib/deskV3.js", s => s.replace("variants: desk.variants || null, trimNote:", "trimNote:")],
    ["the Desk is not at the next shape", "lib/deskV3.js", s => s.replace("export const DESK_SHAPE = 9;", "export const DESK_SHAPE = 8;")],
    ["the Camaro family is not in the data", "data/variantFamilies.json", s => s.replace('"models": ["Camaro"]', '"models": ["Camaro Zz"]')],
    ["the Mustang family is not in the data", "data/variantFamilies.json", s => s.replace('"models": ["Mustang"]', '"models": ["Mustang Zz"]')],
    ["a car that names no variant is filtered to one", "lib/variants.js", s => s.replace("if (!car.names.length) return { variantFamily: fam.id };", "if (!car.names.length) return { variantFamily: fam.id, variantStated: [fam.variants[0].name], variantSet: [fam.variants[0].name], variantSource: 'words' };")],
    ["the 20th Anniversary Turbo Trans Am is not in the data", "data/variantFamilies.json", s => s.replace('"name": "20th Anniversary Turbo Trans Am"', '"name": "20th Anniversary Turbo Trans Am Zz"').replace('"words": ["20th\\\\s+anniversary", "turbo\\\\s+trans[\\\\s-]?am"]', '"words": ["zzzz"]')],
    ["a Knight Rider or KITT car passes the fence", "lib/_classify.js", s => s.replace("kitt|k\\.i\\.t\\.t|knight[\\s-]?rider|", "").replace("(kitt|k\\.i\\.t\\.t|knight[\\s-]?rider|", "(")],
    ["the replicas set aside are not counted on the answer", "lib/onebox.js", s => s.replace("if (n > 0) { const r0 =", "if (false) { const r0 =")],
    ["the replica count is not taken in the fetch", "lib/onebox.js", s => s.replace("&& isReplicaCar(r) && qualifyReason(r, spec) === \"memorabilia or replica\"", "&& false")],
    ["no variant question is served", "api/sellerDecision.js", s => s.replace("if (isCrewRequest(req)) oneBox = withVariantQuestion(", "if (false) oneBox = withVariantQuestion(")],
    ["the variant question is served to a visitor too", "api/sellerDecision.js", s => s.replace("if (isCrewRequest(req)) oneBox = withVariantQuestion(", "if (true) oneBox = withVariantQuestion(")],
    ["the question is asked whatever the prices", "lib/onebox.js", s => s.replace("if (splitMaterial(options[i][1], options[j][1]).material) {", "if (true) {")],
    ["a variant under five sales is an option", "lib/onebox.js", s => s.replace("filter(([, a]) => a.length >= VARIANT_MIN)", "filter(([, a]) => a.length >= 1)")],
    ["the question is asked again after an answer", "lib/onebox.js", s => s.replace("if (Number(asked) > 0 || (refine && refine.variant)) return d;", "")],
    ["a chip's variant is ignored by the engine", "lib/onebox.js", s => s.replace("if (fam && nm) { spec.variantFamily = fam.id; spec.variantStated = [nm];", "if (false) { spec.variantFamily = fam.id; spec.variantStated = [nm];")],
    ["the chip's key is dropped by the handler's refine", "api/sellerDecision.js", s => s.replace("|| variantKeyShape(String(rawRefine.variant || \"\"))", "")],
    ["a stated variant is asked about too", "lib/onebox.js", s => s.replace("d.variants.applied || (d.variants.stated || []).length || d.variants.chosen) return d;", "false) return d;")],
    ["the options are not counted from the pool", "lib/onebox.js", s => s.replace("count: a.length, query: text,", "count: 99, query: text,")],
    ["the line names what is not set aside", "lib/variants.js", s => s.replace("aside: out.length ? joinAnd(out.map(noun)) : null,", "aside: inNames.length ? joinAnd(inNames.map(noun)) : null,")]
  ];
  let survived = 0;
  for (const [name, file, fn] of M) {
    const tmp = fs.mkdtempSync(path.join(fs.realpathSync("/tmp"), "vs-"));
    try {
      for (const d of ["lib", "api", "data", "package.json"]) spawnSync("cp", ["-R", path.join(R, d), tmp]);
      fs.mkdirSync(path.join(tmp, "scripts")); spawnSync("cp", ["-R", path.join(R, "scripts/fixtures"), path.join(tmp, "scripts/")]); spawnSync("cp", [path.join(R, "scripts/_deskOlderWorld.mjs"), path.join(tmp, "scripts/")]);
      fs.symlinkSync(path.join(R, "node_modules"), path.join(tmp, "node_modules"));
      const f = path.join(tmp, file), before = fs.readFileSync(f, "utf8"), after = fn(before); if (before === after) { console.log("SKIP (no change) " + name); survived++; continue; }
      fs.writeFileSync(f, after);
      const r = spawnSync(process.execPath, [me, tmp], { encoding: "utf8", timeout: 240000 }), killed = r.status !== 0; console.log((killed ? "killed   " : "SURVIVED ") + name); if (!killed) survived++;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(survived ? `${survived} mutant(s) survived` : "all mutants killed"); return survived ? 1 : 0;
}
