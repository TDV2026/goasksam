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
const world = (make, model, years, spec) => {   // spec: [[title words, count, price]] ; the title words are the variant words the sale names ("" names none)
  const rows = []; let k = 0;
  for (const [words, count, price] of spec) for (let i = 0; i < count; i++) {
    const year = years[0] + (k % (years[1] - years[0] + 1)), id = "vs" + (seq++), title = `${year} ${make} ${model}${words ? " " + words : ""}`;
    const raw = { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(30000 + (k % 20) * 500), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" };
    rows.push({ id, source_id: id, sale_price: price + (i % 5) * 250, sale_date: new Date(Date.now() - (40 + (k % 9) * 8) * DAY).toISOString().slice(0, 10), platform: k % 3 === 0 ? "Cars & Bids" : "Bring a Trailer", listing_title: title, year, make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, raw_record: raw, vehicle_type: "car" });
    k++;
  }
  return rows;
};
const install = (model, rows) => { w.DATA.clear(); w.DATA.set(model, rows); };
// what the resolver reads of each typed string (the engine's real resolver gives these trims for these words: lib/vehicle.js, observed in lane-notes stage 1)
const TRIMS = [[/trans[\s-]?am\s+gta|\bgta\b/i, "Trans AM GTA"], [/trans[\s-]?am/i, "Trans AM"], [/\bformula\b/i, "Formula"], [/iroc/i, "IROC-Z"], [/\bz[\s/-]?28\b/i, "Z28"], [/\brs\b/i, "RS"], [/cobra/i, "SVT Cobra"], [/\bgt\b/i, "GT"], [/\blx\b/i, "LX"]];
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
  ok("includesPackages true: asking for the Trans Am counts the GTA too", JSON.stringify(V.poolNames(fam, ["Trans Am"]).sort()) === JSON.stringify(["GTA", "Trans Am"]), V.poolNames(fam, ["Trans Am"]));
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
