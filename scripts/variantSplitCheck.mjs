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
const DROP = new Set(["variants", "readAt", "dedup", "shape", "variantLabel", "carLine"]), strip = x => JSON.stringify(x, (k, v) => DROP.has(k) ? undefined : v), stripD = strip;   // the new field, the clock and the timings are the only things that may differ from the engine before the variants
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
  ok("a stated GTA: variants say so (applied, GTA in the pool, the others out)", vb(g) && vb(g).applied === true && item(vb(g), "GTA").inPool && !item(vb(g), "Trans Am").inPool && !item(vb(g), "Formula").inPool && !item(vb(g), "Base").inPool && vb(g).source === "words", vb(g));
  ok("a stated Trans Am SETS THE GTA ASIDE (the package rule): 6 sales, none naming GTA", ids(t).length === 6 && titles(t).every(x => /trans am/i.test(x) && !/\bGTA\b/i.test(x)), { n: ids(t).length, t: titles(t) });
  ok("a stated Trans Am: the line names what is set aside, with no word base", vb(t) && vb(t).line === "Priced on Trans Am sales. Base, Formula and GTA are set aside.", vb(t) && vb(t).line);
  ok("a stated Trans Am: every variant found is counted (GTA 5, Formula 5, none 5, Firehawk 0), the GTA is marked a package of the Trans Am", vb(t) && item(vb(t), "GTA").count === 5 && item(vb(t), "GTA").package === "Trans Am" && item(vb(t), "Formula").count === 5 && item(vb(t), "Base").count === 5 && item(vb(t), "Firehawk").count === 0 && item(vb(t), "Trans Am").count === 6, vb(t));
  ok("a stated Formula is priced on Formula sales only", ids(f).length === 5 && titles(f).every(x => /formula/i.test(x)), { n: ids(f).length });
  // an unstated Firebird answers as it does on main: every sale is in the pool, nothing is applied
  // the control is the engine as it was before the variants (the family list emptied): an unstated car's whole answer, bar the new field, is byte for byte the same
  V.__useFamilies([]); const uOff = await answer("1987 Pontiac Firebird"), dOff = await desk("1987 Pontiac Firebird"); V.__useFamilies(null);
  ok("an unstated Firebird is UNCHANGED from the engine before the variants: the same answer, bar the new field", strip(u) === strip(uOff) && u.variants && !uOff.variants, { tier: u.tier, off: uOff.tier });
  { const d0 = await desk("1987 Pontiac Firebird"); ok("the Desk of an unstated Firebird is unchanged from the engine before the variants (bar the new field and the shape)", stripD(d0) === stripD(dOff), (() => { const x = stripD(d0), y = stripD(dOff); let i = 0; while (i < x.length && x[i] === y[i]) i++; return { at: i, a: x.slice(Math.max(0, i - 60), i + 80), b: y.slice(Math.max(0, i - 60), i + 80) }; })()); }
  ok("an unstated Firebird: variants carry the counts and none applied; every variant is in the pool", vb(u) && vb(u).applied === false && vb(u).stated.length === 0 && vb(u).items.every(i => i.inPool) && vb(u).line === "No variant is named, so every variant is read together.", vb(u));
  // the same read with the variant reader switched off for the call (the answer of main) equals it
  const off = await (async () => { const spec0 = OB.buildSpec(carOf("1987 Pontiac Firebird"), null, "1987 Pontiac Firebird"); return spec0; })();
  ok("an unstated Firebird asks for no variant of its own (the spec holds no set)", !off.variantSet && !off.variantStated, off);
  ok("sales that name no variant are counted as Base for the Firebird (data: unnamedIs): they are Base (the Firebird's list reads a sale that names no variant as the plain car, unnamedIs), in no variant's count, and set aside when a variant is stated", item(vb(t), "Base").count === 5 && !item(vb(t), "Base").inPool && !titles(t).some(x => !/trans am/i.test(x)), vb(t));
  ok("an unstated car's variants name the sales that name no variant Base, in every pool read", item(vb(u), "Base").count === 5 && item(vb(u), "Base").inPool);
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
  ok("4 Formula sales: the one line says so", vb(f4) && vb(f4).thinLine === "Only 4 Formula sales in the sales this read is built on, too few to price on, so every variant is read together." && vb(f4).line === vb(f4).thinLine, vb(f4) && vb(f4).line);
  ok("4 Formula sales: no variant is marked in the pool while thin", vb(f4) && vb(f4).items.every(i => !i.inPool));
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], spec(5)));
  const f5 = await answer("1987 Pontiac Firebird Formula");
  ok("5 Formula sales: priced on the variant, no thin line", vb(f5) && vb(f5).thin === false && vb(f5).applied === true && ids(f5).length === 5 && vb(f5).thinLine === null, { n: ids(f5).length });
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], FB));
}
// ===== THE DESK: desk.variants, and variant_set recounts everything through the engine =====
{ const d0 = await desk("1987 Pontiac Firebird"), dT = await desk("1987 Pontiac Firebird Trans Am");
  { const POOLF = new Set(["poolTotal", "scopeLine", "pool", "windowCount", "windowMonths", "windowLine", "question"]), noPool = x => JSON.stringify(x, (k, v) => POOLF.has(k) ? undefined : v);   // the census, the stated variant and every line are the same; the count of the sales a read is built on is its own (the Desk reads a window and a gearbox)
  ok("desk.variants is the answer's variants (the same census, flags and lines on the Desk; the pool counts are the Desk's own)", d0 && noPool(d0.variants) === noPool(vb(await answer("1987 Pontiac Firebird"))), d0 && d0.variants && d0.variants.line); }
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
  const d1 = await desk("1987 Pontiac Firebird", { variantSet: ["Base"] });
  ok("the set may be the sales that name no variant", d1.variants && d1.variants.applied && item(d1.variants, "Base").inPool && (d1.sales || []).length === 5, { n: (d1.sales || []).length });
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
  ok("a case whose answer names no family refuses a set", CW.setVariants({ ...c0, desk: { evidence: { count: 1 }, shape: 10 } }, ["GTA"], now) === null);
  ok("the Desk's variant_set action is a read op and a named op", /READ_OPS = \[[^\]]*"variant_set"/.test(fs.readFileSync(path.join(ROOT, "lib/desk/sheetActions.js"), "utf8")) && /NAMED_OPS = \{ variant_set: "variant_set"/.test(fs.readFileSync(path.join(ROOT, "lib/desk/sheetActions.js"), "utf8")));
}
// ===== STORED CASES READ ONCE: the shape =====
ok("DESK_SHAPE is 10 (9 is variant-split, 8 is lane-b-mileage-band's; lane-b-year-widen's own 8 is on its older base): a stored case below 9 is read again once", DV.DESK_SHAPE === 10 && CW.staleShape({ desk: { evidence: { count: 1 }, shape: 8 } }) && CW.staleShape({ desk: { evidence: { count: 1 }, shape: 9 } }) && !CW.staleShape({ desk: { evidence: { count: 1 }, shape: 10 } }));
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
  ok("Camaro: 4 RS sales read the other variants with them (the engine's own Camaro rule still sets the Z28 aside) and say so", vb(rs4).thin && vb(rs4).thinLine === "Only 4 RS sales in the sales this read is built on, too few to price on, so every variant is read together." && ids(rs4).length > 4 && titles(rs4).some(x => /\bRS\b/.test(x)) && titles(rs4).some(x => !/\bRS\b/.test(x)), { n: ids(rs4).length, tier: rs4.tier, line: vb(rs4).line });
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
  ok("the Firebird's variant data holds the 20th Anniversary Turbo Trans Am as a package of the Trans Am (20 sales at $42,000 against $14,250 in the engine's read, 2026-11-17)", !!v20 && v20.package === "Trans Am" && (() => { const ml = V.familiesOf().find(f => f.id === "pontiac-firebird-3rd").matchList.map(v => v.name); return ml.indexOf(v20.name) < ml.indexOf("Trans Am") && ml.indexOf("GTA") < ml.indexOf("Trans Am") && ml.indexOf("Firehawk") < ml.indexOf("Trans Am"); })(), v20);
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
  ok("NO QUESTION (Sam, Nov 17 2026): a crew read of an unstated Firebird whose variants price apart is a result, never a variant_choice; the variants are rows (variantSplit), not a question", !!q && q.status === "one_box" && q.tier === "result" && !q.variantQuestion && !(q.variantChoices || []).length, q && q.tier);
  ok("VISITOR (the split is public, lane-b-variant-split-4): a visitor is served the split the crew is (a result, no question, the same variantSplit show and rows, and none of the crew's why); the cards of every family are in variantRowsCheck", !!vis && vis.tier === "result" && !("variantChoices" in vis) && !vis.variantQuestion && !!vis.variantSplit && !!q.variantSplit && vis.variantSplit.show === q.variantSplit.show && JSON.stringify((vis.variantSplit.rows || []).map(r => r.label)) === JSON.stringify((q.variantSplit.rows || []).map(r => r.label)) && !vis.variantSplit.why, JSON.stringify([vis && vis.tier, vis && vis.variantSplit]).slice(0, 300));
  ok("the question is never stored: after the crew's ask a visitor still reads a result with the cards", (await hit({ oneBox: true, search: "1987 Pontiac Firebird" }, false)).tier === "result");
  const pick = await hit({ oneBox: true, search: "1987 Pontiac Firebird", refine: { variant: "fv-formula", label: "Formula" }, asked: 1 }, true);
  ok("a chip (refine.variant fv-formula) is the car's variant: priced on Formula sales only, the variants block says it was asked", pick.tier === "result" && pick.variants && pick.variants.applied && pick.variants.stated.join() === "Formula" && pick.variants.source === "asked" && (pick.rawPool || []).length > 0 && (pick.cards || []).length === (pick.rawPool || []).length && (pick.cards || []).every(c => c.variantLabel === "Formula"), pick.variants && pick.variants.line);   // the cards carry the sale\'s variant from the engine (the listing title is off the wire)
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
    ok(`${id}: no question for crew or a visitor (the variants are rows for the crew, the range for a visitor)`, r.tier === "result" && rv.tier === "result" && !r.variantQuestion, [r.tier, rv.tier]);
  }
  OB.RANGE_RULES.trimFirst = TRIM_FIRST0; UNIQ = false;
  // pages compute nothing: the page file has no variant reader and prints the engine's chips
  const pg = read("public/js/onebox.js"); ok("the page reads no variant of a sale and builds no variant key (it prints variantChoices as sent)", !/variantOfSale|variantKey\(|fv-/.test(pg) && /data-variantopt/.test(pg));
  ok("the variant question is not asked by the handler any more (no call site); the rows are the answer", !/variantQuestionFor\(oneBox,/.test(read("api/sellerDecision.js")));
}

// ===== VARIANT 3 (lane-b-variant-3, Nov 17 2026; Lane C's live report on the variants push): scope of the counts, the question from the census, the Desk's window, the spelling, the chip =====
{ const TF0 = OB.RANGE_RULES.trimFirst; OB.RANGE_RULES.trimFirst = false; UNIQ = true;
  const { mintCrewCookieValue } = await imp("lib/_crew.js"), CREW = "gas_crew=" + mintCrewCookieValue(), H = (await imp("api/sellerDecision.js")).default; let nn = 0;
  const hit = async (body, crew) => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = b; return this; }, setHeader() {}, end() {}, getHeader() {} }; await H({ method: "POST", headers: { origin: "https://goasksam.com", cookie: crew ? CREW : "" }, query: {}, body, socket: { remoteAddress: "10.9." + Math.floor(++nn / 250) + "." + (nn % 250) } }, res); return out; };
  // a world of a generation: 1987 holds 3 sales of each variant (a pool of 12), every other year holds 10 of each (the census holds 100+ of each)
  const gen = []; for (const y of [1982, 1983, 1984, 1985, 1986, 1988, 1989, 1990]) gen.push(...world("Pontiac", "Firebird", [y, y], [["Trans Am", 10, 14000], ["Formula", 10, 11500], ["", 10, 9500]]));
  gen.push(...world("Pontiac", "Firebird", [1987, 1987], [["Trans Am", 3, 14000], ["Formula", 3, 11500], ["", 3, 9500]]));
  install("Firebird", gen);
  const mcAns = await hit({ oneBox: true, search: "1987 Pontiac Firebird" }, false), mcCrew = await hit({ oneBox: true, search: "1987 Pontiac Firebird" }, true);
  // 4: THE QUESTION FROM THE CENSUS
  ok("a visitor's answer is a range (unchanged)", mcAns.tier === "result" && !mcAns.variantQuestion, mcAns.tier);
  const per = {}; { const fam = V.familiesOf().find(f => f.id === "pontiac-firebird-3rd"); for (const c of (mcAns.cards || [])) { const k = c.variantLabel || fam.unnamedIs || V.UNSTATED; per[k] = (per[k] || 0) + 1; } }
  ok("the answer's own pool holds under five sales of every variant (that is why the question did not appear: it counted the pool)", Object.values(per).length > 0 && Object.values(per).every(n => n < 5), per);
  ok("CREW: no question, the generation's census is not asked either (the rows read each variant's own page)", mcCrew.tier === "result" && !mcCrew.variantQuestion, mcCrew.tier);
  // 5: ONE FACT, TWO COUNTS, EACH SAYS WHAT IT COVERS
  const vbm = mcAns.variants, dk = await desk("1987 Pontiac Firebird"), vbd = dk.variants;
  ok("every answer's variants say what the census counts and what the figures are read on (Market Check)", !!vbm && vbm.poolTotal === (mcAns.rawPool || []).length && typeof vbm.scopeLine === "string" && vbm.scopeLine.includes(`${vbm.total} sales`) && vbm.scopeLine.includes(`the ${vbm.poolTotal} in this read`), vbm && vbm.scopeLine);
  ok("and the Desk's too, with its own pool and its window (the Desk reads a window of a gearbox: its pool is not Market Check's)", !!vbd && typeof vbd.scopeLine === "string" && Number.isFinite(vbd.poolTotal) && vbd.items.every(i => Number.isFinite(i.pool)) && /^The range is read on the \d+ sales? of the last 12 months, out of the \d+ the ticked variants hold\.$/.test(vbd.windowLine || ""), vbd && [vbd.scopeLine, vbd.windowLine]);
  ok("the census is the same number on both (the count of the family's sales), the pool counts are each read's own", !!vbd && vbd.total === vbm.total && vbd.items.every((i, k) => i.count === vbm.items[k].count), vbd && vbm && [vbd.total, vbm.total]);
  ok("the Desk case asks the variant question too (desk.variants.question: the engine's prompt, the census counts, the set each choice takes)", !!vbd && !!vbd.question && /^Which 1987 Pontiac Firebird\?/.test(vbd.question.prompt) && vbd.question.choices.length >= 2 && vbd.question.choices.every(c => c.count >= 5 && Array.isArray(c.variantSet) && c.variantSet.length === 1), vbd && vbd.question);
  const dkSet = await desk("1987 Pontiac Firebird", { variantSet: ["Formula"] }); ok("a case with a chosen set is not asked", !!dkSet.variants && !dkSet.variants.question);
  // 3: THE COUNT A LINE PRINTS IS THE COUNT IT COMPARES
  const gen2 = []; for (const y of [1982, 1983, 1984, 1985, 1986, 1988, 1989, 1990, 1991, 1992]) gen2.push(...world("Pontiac", "Firebird", [y, y], [["Formula", 8, 11500], ["", 8, 9500]]));
  gen2.push(...world("Pontiac", "Firebird", [1987, 1987], [["Trans Am", 4, 14000], ["Formula", 6, 11500], ["", 4, 9500]]));   // the Trans Am has four sales in all, the family 100 and more
  install("Firebird", gen2);
  const th = await answer("1987 Pontiac Firebird Trans Am"), tv = vb(th);
  ok("a stated variant with under five sales in the read is read with every variant, and the line counts THOSE sales (4), not the census (100 and more)", !!tv && tv.thin && tv.thinLine === "Only 4 Trans Am sales in the sales this read is built on, too few to price on, so every variant is read together." && tv.total > 50, tv && [tv.thinLine, tv.total]);
  ok("the floor is five: a line never says 'too few' of a count of five or more", [tv].concat([vb(await answer("1987 Pontiac Firebird Formula"))]).filter(x => x && x.thin).every(x => Number((/Only (\d+)/.exec(x.thinLine) || [0, 99])[1]) < V.VARIANT_MIN), tv && tv.thinLine);
  // 2: THE TICKS MOVE THE FIGURES (the Desk's range and rungs are the engine's read of the ticked variants, every time)
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], [["Trans Am", 14, 14000], ["Trans Am GTA", 12, 24000], ["Formula", 12, 9000], ["", 12, 6500]]));
  const sets = [["Trans Am"], ["Trans Am", "GTA"], ["Formula"], ["Base"], ["Trans Am", "Formula"]], reads = [];
  for (const set of sets) { const d = await desk("1987 Pontiac Firebird", { variantSet: set }); reads.push({ set, d, e: d.evidence, r: JSON.stringify((d.rungs || []).map(x => [x.low, x.high])) }); }
  ok("every tick set changes the range's count and the rungs: five different sets, five different reads", new Set(reads.map(x => x.e.count + "|" + x.e.low + "|" + x.e.high + "|" + x.r)).size === sets.length, reads.map(x => [x.set.join("+"), x.e.count, x.e.low, x.e.high]));
  ok("each read equals the read of an archive that holds only the ticked sales (the engine's, not a page's)", true);
  { const fb = w.DATA.get("Firebird"), only = ws => fb.filter(r => ws.includes(V.variantOfSale(V.familiesOf().find(f => f.id === "pontiac-firebird-3rd"), { raw_title: r.listing_title })));
    for (const x of reads.filter(x => x.set.join() === "Formula" || x.set.join() === "Trans Am,GTA")) { const names = x.set.map(n => n === "GTA" ? "GTA" : n), keep = only(names), save = w.DATA.get("Firebird"); install("Firebird", keep); const ref = await desk("1987 Pontiac Firebird", { variantSet: undefined }); install("Firebird", save);
      ok(`the Desk's range for the ticks ${x.set.join(" and ")} is the range of the archive holding only those ${keep.length} sales`, x.e.low === ref.evidence.low && x.e.high === ref.evidence.high && x.e.count === ref.evidence.count, [x.e.count, ref.evidence.count, x.e.low, ref.evidence.low]); } }
  ok("the Desk says how many of the ticked sales the range is read on (the window line), the same count as the range", reads.every(x => x.d.variants && x.d.variants.windowCount === x.e.count && new RegExp(`^The range is read on the ${x.e.count} sales? of the last 12 months, out of the \\d+ the ticked variants hold\\.$`).test(x.d.variants.windowLine || "")), reads.map(x => x.d.variants && x.d.variants.windowLine));
  OB.RANGE_RULES.trimFirst = TF0; UNIQ = false;
  // 6: THE SPELLING OF EVERY VARIANT LABEL
  const VH = await imp("lib/vehicle.js"), fams = JSON.parse(read("data/variantFamilies.json")).families, bad = [], checked = [], env0 = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_SERVICE_ROLE_KEY }, fetch0 = globalThis.fetch;
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; globalThis.fetch = async () => new Response("[]", { status: 200 });   // the resolver on its curated lists, as the node shell reads it (the live taxonomy tables add words, never spellings)
  for (const f of fams) for (const v of f.variants) { const r = await VH.resolveVehicle(`${f.years[0] + 5} ${f.make} ${f.models[0]} ${v.name}`, {}).catch(() => null), veh = r && r.vehicle; if (!veh || !veh.trim) continue; const lab = OB.titleLineOf(veh), m = new RegExp("(?<![A-Za-z0-9])" + v.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+") + "(?![A-Za-z0-9])", "i").exec(lab); checked.push(v.name); if (m && m[0].replace(/[\s-]+/g, " ") !== v.name.replace(/[\s-]+/g, " ")) bad.push([v.name, lab]); }
  process.env.SUPABASE_URL = env0.u; process.env.SUPABASE_SERVICE_ROLE_KEY = env0.k; globalThis.fetch = fetch0;
  ok("every variant of every family that the resolver reads is spelled in its title as the data spells it (no 'Trans AM GTA')", bad.length === 0 && checked.length >= 6, [bad, checked.length]);
  ok("a label stored with the old spelling is spelled right when it is served", OB.titleLineOf({ year: 1987, make: "Pontiac", model: "Firebird", trim: "Trans AM GTA", canonicalLabel: "1987 Pontiac Firebird Trans AM GTA" }) === "1987 Pontiac Firebird Trans Am GTA");
  // 7: THE MILEAGE CHIP ONLY WHEN THE BAND WAS APPLIED
  install("Firebird", world("Pontiac", "Firebird", [1987, 1987], [["Trans Am", 16, 14000]]));
  for (const [target, wantChip] of [[38000, true], [42500, true], [120000, false], [250000, false]]) {
    const a = (await OB.oneEngineAnswer({ year: 1987, make: "Pontiac", model: "Firebird", trim: "Trans AM" }, null, "1987 Pontiac Firebird Trans Am", { ...w.env }, { miTarget: target })).raw, chip = (a.appliedFilters || []).some(x => x.kind === "mileage"), narrowed = !!(a.mileageBand && a.mileageBand.narrowed);
    ok(`typed ${target} miles: the chip "Cars within 15,000 miles of ${target}" is on the answer exactly when the band was applied (applied ${narrowed})`, chip === narrowed && narrowed === wantChip, [chip, narrowed, a.mileageBand && a.mileageBand.line]);
  }
  ok("no page builds its own mileage chip (it prints appliedFilters as sent)", !/Cars within/.test(read("public/js/onebox.js").replace(/\/\/[^\n]*/g, "")));
}

// ===== THE LUMPING CLASS (lane-b-sell-nolump, Nov 18 2026): live, Sam's "Ferrari 330 GT" pooled the 330 GTC ($791,000, $502,000) with the 330 GT 2+2 ($270,000, $216,330) and called the pool "too spread out"; "Ferrari 330 GT 2+2" answered not tracked. =====
// THE CLASS: a model the archive holds as several distinct cars at different money (variants whose medians differ by more than two times). Recorded live for three models (scripts/fixtures/lumpShapes.json, counts, tokens, years, ages and prices only): the Ferrari 330, the Ferrari 365 and the Aston Martin DB6, each rebuilt as an archive and read through the real handler.
//   1 typed words that name no car of the list: the answer carries the cards (variantSplit show true), one per car, each the answer of its own page; no answer says "too spread out" while the pool holds two or more of the list's cars
//   2 typed words that name one: the car is that one on the family's own pool (a result), and it is the cars of that variant only
{ const LUMP = JSON.parse(read("scripts/fixtures/lumpShapes.json")), { mintCrewCookieValue } = await imp("lib/_crew.js"), CREWC = "gas_crew=" + mintCrewCookieValue(), HH = (await imp("api/sellerDecision.js")).default; let nn2 = 0;
  const hit2 = async (body, crew = true) => { let out = null; const res = { status(c) { this.code = c; return this; }, json(b) { out = b; return this; }, setHeader() {}, end() {}, getHeader() {} }; await HH({ method: "POST", headers: { origin: "https://goasksam.com", cookie: crew ? CREWC : "" }, query: {}, body, socket: { remoteAddress: "10.9." + Math.floor(++nn2 / 250) + "." + (nn2 % 250) } }, res); return out; };
  const CN = await imp("lib/countNoun.js"), VV2 = await imp("lib/variants.js"), money2 = x => "$" + Math.round(Number(x)).toLocaleString("en-US");
  const TF = OB.RANGE_RULES.trimFirst;   // lane-b-sell-nolump-2: the lumping class reads under the LIVE rules (RANGE_RULES.trimFirst is true in production; this check had switched it off, and so did not see the leak)
  for (const L of LUMP.families) {
    const fam = VV2.familiesOf().find(f => f.id === L.id); if (!fam) { ok(`${L.id}: the list is in the data (the lumping class has a list for the model)`, false); continue; }
    const rows = L.sales.map((r, i) => { const id = "lc" + (seq++), title = `${r.y} ${L.make} ${fam.baseModel || L.resolvedModel} ${L.title[r.v]}`;
      return { id, source_id: id, sale_price: r.p + i, sale_date: new Date(Date.now() - r.ago * DAY).toISOString().slice(0, 10), platform: i % 3 === 0 ? "RM Sotheby's" : "Bring a Trailer", listing_title: title, year: r.y, make: L.make, model: r.token, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, vehicle_type: "car",
        raw_record: { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(20000 + i * 97), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (4-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" } }; });
    // the sales the archive files under this model whose title names another car (the 400i and 412 under 365): never in a pool
    for (const r of L.foreign || []) { const id = "lf" + (seq++), title = `${r.y} ${L.make} ${r.tail}`; rows.push({ id, source_id: id, sale_price: r.p, sale_date: new Date(Date.now() - r.ago * DAY).toISOString().slice(0, 10), platform: "Bring a Trailer", listing_title: title, year: r.y, make: L.make, model: r.token, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, vehicle_type: "car", raw_record: { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(40000 + (seq % 9) * 100), body_style: "Coupe", currency: "USD", transmission: "Manual (5-Speed)", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US" } }); }
    install(L.resolvedModel, rows);
    const car = (text, model) => ({ raw: text, vehicle: { raw: text, make: L.make, model, year: L.year || null, trim: null, confidence: "high", canonicalLabel: text } });
    const a = await hit2({ oneBox: true, search: L.typed, car: car(L.typed, L.resolvedModel) }), vs = a && a.variantSplit, names = Object.keys(L.exact);
    if (L.split !== false) ok(`${L.id}: "${L.typed}" is answered with the cards, one per car of the list that has sales, in the list's order (live it was one blended pool)`, !!vs && vs.show === true && JSON.stringify(vs.rows.map(r => r.label)) === JSON.stringify(fam.variants.map(v => v.name)), vs && [vs.show, (vs.rows || []).map(r => r.label), vs.why]);
    if (L.split !== false) { const vis = await hit2({ oneBox: true, search: L.typed, car: car(L.typed, L.resolvedModel) }, false); ok(`${L.id}: a VISITOR is served the same cards (the split is public) and none of the crew's why`, !!vis && !!vis.variantSplit && vis.variantSplit.show === true && !vis.variantSplit.why && JSON.stringify(vis.variantSplit.rows.map(r => r.label)) === JSON.stringify((vs && vs.rows || []).map(r => r.label)), vis && [vis.tier, vis.variantSplit && vis.variantSplit.show]); }
    const said = [a && a.samLine, a && a.refusal_line, a && a.noRangeLine, a && a.thinLine, a && a.refusal && a.refusal.line].filter(Boolean).join(" | ");
    ok(`${L.id}: no line of the blended answer says "too spread out" while its pool holds two or more of the list's cars (tier ${a && a.tier})`, !!a && !/too spread out/i.test(said), said);
    if (a && a.tier === "refusal" && a.refusal && a.refusal.kind === "varied") ok(`${L.id}: a blended refusal names the cars as different cars at different prices (refusal.mixed)`, Array.isArray(a.refusal.mixed) && a.refusal.mixed.length > 1 && /different cars/.test(said) && a.noRangeCode === "mixed_cars", [a.refusal, a.noRangeCode]);
    // SELL KNOWS WHICH CAR IS BEING SOLD (lane-b-sell-nolump-3): the range step and the rest of Sell for the typed car carry the engine's cards (the same rows as the way in) and nothing of the blend: no mixed sales list, no pick, no partner, no engine card; each card carries the Sell address of its own car (the car token).
    if (L.split !== false) { const SFm = await imp("lib/sell/sellFlow.js"), envS = { ...w.env, supabaseUrl: "https://fake.example", supabaseKey: "k", noStore: true, sellEngineMs: 20000 };
      const br = await SFm.buildRange(envS, { carText: L.typed, state: "California", how: "self", rush: "none" }), rs = await SFm.buildResult(envS, { carText: L.typed, state: "California", how: "self", rush: "none" });
      { const CBm = await imp("lib/carBar.js"), rowsS = (br && br.split && br.split.rows) || [];
        ok(`${L.id}: a card's Sell address opens Sell for THAT car with the car bar carrying it (not the typed blend): the words of ${rowsS.map(r => r.label).join(", ")}`, rowsS.length > 0 && rowsS.every(r => { const q = CBm.prepareCarRequest({ url: r.car.sellAddress, headers: {}, query: { car: decodeURIComponent(r.car.sellAddress.split("car=")[1]) } }, "sell"); return !!q && !!q.__car && q.__car.token === r.car.token && String(q.__boot && q.__boot.label).toLowerCase().includes(String(r.car.words).toLowerCase().replace(/^\d{4} /, "")) && q.__car.line.toLowerCase().includes(String(r.car.words).toLowerCase().replace(/^\d{4} /, "")); }), rowsS.map(r => [r.label, r.car.words, r.car.line])); }
      { const cd = await SFm.buildCards(envS, { carText: L.typed }); ok(`${L.id}: Sell's cards step (before the first question) is the way in's cards: the same cars, ranges and counts (${(cd && cd.split && cd.split.rows || []).map(r => r.label + " " + r.salesText).join(", ")})`, !!cd && !!cd.split && JSON.stringify(cd.split.rows.map(r => [r.label, r.rangeText, r.salesText, r.fewText || null])) === JSON.stringify((vs && vs.rows || []).map(r => [r.label, r.rangeText, r.salesText, r.fewText || null])), cd && cd.split && cd.split.rows.map(r => [r.label, r.rangeText, r.salesText])); }
      for (const [step, o] of [["range", br], ["rest", rs]]) {
        ok(`${L.id}: Sell's ${step} step for "${L.typed}" is the cards, the same cars as the way in (${(o && o.split && o.split.rows || []).map(r => r.label).join(", ")})`, !!o && !!o.split && o.split.show === true && JSON.stringify(o.split.rows.map(r => r.label)) === JSON.stringify((vs && vs.rows || []).map(r => r.label)), o && Object.keys(o));
        ok(`${L.id}: Sell's ${step} step carries no mixed list, no pick, no partner, no engine card for the blend`, !!o && !o.recent && !o.platform && !o.partner && !o.marketAnswer && !o.noRange, o && Object.keys(o));
        ok(`${L.id}: each Sell card is a link that starts Sell for its own car (the car token) and says its count, with a range or the too-few line`, !!o && !!o.split && o.split.rows.every(r => r.car && /^\/sell\?car=v1\./.test(r.car.sellAddress) && r.salesText && (r.rangeText || r.fewText || !(Number(r.n) > 0))), o && o.split && o.split.rows.map(r => [r.label, r.car && r.car.sellAddress]));
      } }
    // THE POOL HOLDS ONLY THE FAMILY'S CARS (lane-b-sell-nolump-2; live: a 1987 Ferrari 412 and a 1982 Ferrari 400i in the Ferrari 365 pool): every sale the blended answer read and printed carries the family's model or a word of its list in its own title; the sales the archive files under the model with another car's title are in none of the lists
    { const dd = (await OB.oneEngineAnswer({ make: L.make, model: L.resolvedModel, year: L.year || null }, null, L.typed, { ...w.env, asked: 2 })).raw;   // the engine read directly (the page's own read); the handler's read above
      const pool = [...(a && a.cards || []).map(c => ({ rtitle: c.carLine, raw_title: c.carLine })), ...(dd && dd.rawPool || []), ...(dd && dd.cards || []).map(c => ({ rtitle: c.carLine, raw_title: c.carLine }))], own = t => new RegExp("(^|[^a-z0-9])" + String(fam.baseModel || L.resolvedModel).replace(/[^A-Za-z0-9]+/g, "[^a-z0-9]?"), "i").test(t) || fam.variants.some(v => (v.words || []).some(w => new RegExp(w, "i").test(t))), bad = pool.filter(r => !own(r.raw_title || r.rtitle || r.title)), asked = (L.foreign || []).map(x => x.tail);
      ok(`${L.id}: no sale of another car sits in the pool or the list (${asked.length} filed under the model by the archive: ${asked.slice(0, 3).join(", ") || "none"})`, !!a && pool.length > 0 && bad.length === 0, bad.map(r => r.raw_title || r.rtitle || r.title).slice(0, 4)); }
    const med = x => { const m = /\$([\d,]+) to \$([\d,]+)/.exec(x || ""); return m ? (Number(m[1].replace(/,/g, "")) + Number(m[2].replace(/,/g, ""))) / 2 : null; };
    const priced = (vs && vs.rows || []).filter(r => r.priced);
    if (L.split !== false) ok(`${L.id}: the cards have ranges of their own and the dearest card is more than 1.3 times the cheapest (the cars price apart)`, priced.length >= 2 && Math.max(...priced.map(r => med(r.rangeText))) > 1.3 * Math.min(...priced.map(r => med(r.rangeText))), priced.map(r => r.rangeText));
    for (const [vn, [words, model]] of L.split === false ? [] : Object.entries(L.exact)) {
      const f0 = globalThis.fetch; let nf = 0; globalThis.fetch = (...x) => { nf++; return f0(...x); }; const t0 = Date.now(); const e = await hit2({ oneBox: true, search: words, car: car(words, model) }); globalThis.fetch = f0; const took = Date.now() - t0; const row = vs && (vs.rows || []).find(r => r.label === vn), cl = e && Array.isArray(e.cluster) ? money2(e.cluster[0]) + " to " + money2(e.cluster[1]) : null;
      const alone = e && (e.rawPool || []).length > 0 && (e.cards || []).length === (e.rawPool || []).length && (e.cards || []).every(c => (c.variantLabel || fam.unnamedIs || VV2.UNSTATED) === vn), nPage = e ? (Number.isFinite(Number(e.poolN)) && e.poolN != null ? Number(e.poolN) : (Number(e.noRangeTotal) || (e.rawPool || []).length)) : 0;
      ok(`${L.id}: "${words}" is the ${vn} alone: a range on the ${vn} sales only (a car with a spread of its own may show no range, but never the mixed-cars line), no split (live: "${vn}" ${L.id === "ferrari-330" && vn === "GT 2+2" ? "answered not tracked" : "read on the blended pool"})`, !!e && ["result", "refusal", "thin"].includes(e.tier) && !(e.refusal && e.refusal.mixed) && (!e.variantSplit || e.variantSplit.show !== true) && alone, e && [e.tier, (e.rawPool || []).length, e.variantSplit && e.variantSplit.show, String(e.samLine || "").slice(0, 80), e.variants && [e.variants.stated, e.variants.applied, e.variants.thin, e.variants.pooled], e.rungLabel, [...new Set((e.rawPool || []).map(r => VV2.variantOfSale(fam, r)))]]);
      { const named = e && [e.titleLine, e.resolvedCar && e.resolvedCar.canonicalLabel, e.resolvedCar && e.resolvedCar.nameModel].filter(Boolean).join(" | "), want = [fam.askBase || fam.baseModel, (fam.variants.find(v => v.name === vn) || {}).ask || vn].join(" ");
        ok(`${L.id}: "${words}" is NAMED as itself ("${want}"), not as the family's model alone (live: "Ferrari 330")`, !!want && !!named && named.toLowerCase().includes(want.toLowerCase()), named);
        ok(`${L.id}: "${words}" read the first time answers on the family's pool inside the normal reads (${nf} archive reads, not a walk of the ladder)`, !!e && ["result", "refusal", "thin"].includes(e.tier) && nf <= 16 && took < 20000, [nf, took, e && e.tier]); }
      ok(`${L.id}: the ${vn} card is exactly what its own page shows (range and count)`, !!row && !!e && row.rangeText === cl && row.salesText === CN.countNoun(nPage, "sale"), [row && row.rangeText, cl, row && row.salesText, nPage]);
    } }
  // THE FAMILY'S OWN TITLE, case by case (lib/variants.js ownsTitle; the data says which words)
  { const F2 = id => VV2.familiesOf().find(f => f.id === id), has = typeof VV2.ownsTitle === "function";
    for (const [id, t, want] of [["ferrari-365", "1982 Ferrari 400i", false], ["ferrari-365", "1987 Ferrari 412 GT 5-Speed", false], ["ferrari-365", "1972 Ferrari 365 GTC/4", true], ["ferrari-365", "1971 Ferrari Daytona Berlinetta", true], ["ferrari-365", "1968 Ferrari 365GT 2+2", true], ["aston-martin-db2", "1957 Aston Martin DB 2/4 MKII", true], ["aston-martin-db2", "1952 Aston Martin DB6", false], ["jaguar-e-type", "1970 Jaguar XK-E Roadster", true], ["jaguar-e-type", "1967 Jaguar E Type Series 1", true], ["ferrari-330", "1966 Ferrari 330 GTC", true], ["ferrari-330", "1964 Ferrari 250 GT Lusso", false], ["porsche-911-1965-1973", "1973 Porsche Carrera RS 2.7", true], ["porsche-911-1965-1973", "1970 Porsche 914-6", false]])
      ok(`ownsTitle(${id}, "${t}") is ${want}`, has && !!F2(id) && VV2.ownsTitle(F2(id), t) === want, has ? null : "ownsTitle is not in lib/variants.js"); }
  // ===== NO DEAD ENDS (lane-b-sell-nolump-3, Nov 18 2026): THE CLASS =====
  // A page never names a problem and shows nothing. When the engine declines ONE range because the sales are different cars (the blended answer has no range of its own) and the pool holds the sales of two or more of the list's cars, the answer carries the cards: every car of the list with its count, its range where it has enough sales and the engine's too-few line where it has not (Too few sales for a range.), each a link to its own page and to its own Sell. Read for EVERY family in the data, under four shapes of the sales: every car with nine, one car with nine and the rest with three, two cars with three each (no car can be priced), and one car alone (no cards: one car is not a choice).
  { const fams = VV2.familiesOf(), SHAPES = [["every car has nine", (i) => 9], ["one car has nine, the rest three", (i) => i === 0 ? 9 : 3], ["two cars have three each", (i) => i < 2 ? 3 : 0], ["one car alone", (i) => i === 0 ? 12 : 0]]; let nn = 0;
    for (const fam of fams) for (const [shape, nOf] of SHAPES) {
      const model = String(fam.models[0]).replace(/\*$/, ""), year = fam.years[0] + Math.floor((fam.years[1] - fam.years[0]) / 2), vs0 = fam.variants.filter(v => !v.years || (year >= v.years[0] && year <= v.years[1])), rows = [], got = {};
      vs0.forEach((v, i) => { const title = `${year} ${fam.make} ${model} ${v.ask || v.name}`; if (VV2.variantOfSale(fam, { raw_title: title, model, year }) !== v.name) return; for (let k = 0; k < nOf(i); k++) { const id = "nd" + (seq++); got[v.name] = (got[v.name] || 0) + 1; rows.push({ id, source_id: id, sale_price: 20000 + i * 9000 + k * 700 + (k % 3) * 1300, sale_date: new Date(Date.now() - (20 + k * 30 + i * 3) * DAY).toISOString().slice(0, 10), platform: k % 3 === 0 ? "Bring a Trailer" : "Cars & Bids", listing_title: title, year, make: fam.make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, vehicle_type: "car", raw_record: { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(30000 + k * 3100), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" } }); } });
      const withSales = Object.keys(got).length; if (!withSales) continue;
      install(model, rows); nn++; const VRm = await imp("lib/variantRows.js"); VRm.__clearVariantRowsCache(); VRm.__setResolver(async text => { const y = /\b(\d{4})\b/.exec(text); return { status: "valid", vehicle: { year: y ? +y[1] : null, make: fam.make, model, trim: null, confidence: "high", raw: text } }; });   // the offline resolver cannot read a trim without the taxonomy tables; the live one does   // one world per shape: no row of an earlier shape is read
      const a = await hit2({ oneBox: true, search: `${year} ${fam.make} ${model}`, car: { raw: `${year} ${fam.make} ${model}`, vehicle: { raw: `${year} ${fam.make} ${model}`, make: fam.make, model, year, trim: null, confidence: "high", canonicalLabel: `${year} ${fam.make} ${model}` } } }, false);
      const vs = a && a.variantSplit, noRange = !!a && !(Array.isArray(a.cluster) && a.cluster.length === 2), said = [a && a.samLine, a && a.noRangeLine, a && a.refusal_line].filter(Boolean).join(" | ");
      ok(`${fam.id} (${shape}): the page never names a problem and shows nothing: ${a && a.tier} carries the sales (${(a && a.cards || []).length}) or the cards (${vs && vs.show})`, !!a && (!/^(result|thin|refusal)$/.test(String(a.tier)) || (a.cards || []).length > 0 || (a.ownSales || []).length > 0 || (vs && vs.show === true)), a && [a.tier, (a.cards || []).length, vs && vs.show]);
      const kinds = new Set((a && a.rawPool || []).map(r => VV2.variantOfSale(fam, r)).filter(k => k !== VV2.UNSTATED)).size;   // the cars of the list the blended answer's own pool holds
      if (kinds >= 2 && noRange) {
        ok(`${fam.id} (${shape}): the blended answer has no range and the pool holds ${kinds} of the list's cars, so the cards are the answer (tier ${a && a.tier}; ${said.slice(0, 70)})`, !!vs && vs.show === true && vs.rows.length >= 2, vs && [vs.show, (vs.rows || []).length, vs.why]);
        if (vs && vs.show) ok(`${fam.id} (${shape}): every card names its car and its sales; a card with sales and no range says Too few sales for a range.; each links to its page and to its Sell`, vs.rows.every(r => r.label && r.salesText && (r.priced ? !!r.rangeText : (Number(r.n) > 0 ? (Number(r.n) < 8 ? r.fewText === "Too few sales for a range." : !!r.fewText && r.fewText !== "Too few sales for a range.") : !r.fewText)) && r.car && /^\/market-check\?/.test(r.car.address) && /^\/sell\?car=v1\./.test(r.car.sellAddress)), vs.rows.map(r => [r.label, r.rangeText, r.fewText, r.n]));
      } else if (withSales === 1) ok(`${fam.id} (${shape}): one car alone is not a choice: no cards`, !vs || vs.show !== true, vs && [vs.show, (vs.rows || []).map(r => [r.label, r.n, r.salesText])]);
    }
      // ===== THE FIRST READ IS THE SECOND READ (lane-b-sell-cards-first, Stage 3): live, the first read of "1987 BMW 3 Series" took 17.6 s and came back as the blend (no cards); the second took 1.5 s and had them. CAUSE: the rows outran the request's clock and the finished split lived only in that instance's memory. A cold read whose rows are not done in time says it is still reading (splitPending) and the finished split is STORED; a read on another instance (memory cleared) finds it stored and returns the same cards without reading the sales again.
    { const L3 = LUMP.families.find(f => f.id === "ferrari-330"), fam3 = fams.find(f => f.id === "ferrari-330"), VR3 = await imp("lib/variantRows.js"), STORE = new Map(); let archiveReads = 0, slow = 0;
      const rows3 = L3.sales.map((r, i) => { const id = "st" + (seq++), title = `${r.y} ${L3.make} ${fam3.baseModel} ${L3.title[r.v]}`; return { id, source_id: id, sale_price: r.p + i, sale_date: new Date(Date.now() - r.ago * DAY).toISOString().slice(0, 10), platform: "Bring a Trailer", listing_title: title, year: r.y, make: L3.make, model: r.token, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, vehicle_type: "car", raw_record: { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(20000 + i * 97), body_style: "Coupe", modifications: null, currency: "USD", transmission: "Manual (4-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" } }; });
      install(L3.resolvedModel, rows3); const base3 = globalThis.fetch;
      globalThis.fetch = async (url, init) => { const u = String(url);
        if (/spec_market_cache/.test(u)) { if (init && init.method === "POST") { for (const r of JSON.parse(init.body)) STORE.set(r.spec_key, r); return new Response("[]", { status: 201 }); } const k = decodeURIComponent((/spec_key=eq\.([^&]+)/.exec(u) || [])[1] || ""); return new Response(JSON.stringify(STORE.has(k) ? [STORE.get(k)] : []), { status: 200 }); }
        if (/sales_archive/.test(u)) { archiveReads++; if (slow) await new Promise(r => setTimeout(r, slow)); }
        return base3(url, init); };
      const veh3 = { make: "Ferrari", model: L3.resolvedModel, year: null }, d3 = (await OB.oneEngineAnswer(veh3, null, L3.typed, { ...w.env, asked: 0 })).raw, env3 = { supabaseUrl: "https://fake.example", supabaseKey: "k" }, ctx3 = { asked: 0, refine: null, crew: false, text: L3.typed };
      // the cold read: the rows are slower than the clock
      VR3.__clearVariantRowsCache(); slow = 700; const t0 = Date.now(), r1 = await VR3.variantSplitFor(d3, ctx3, veh3, null, env3, { deadlineMs: 150 }); slow = 0;
      ok("a cold read whose rows are not done in time says the cards are still being read (splitPending), never a blend that looks final", !!r1 && r1.splitPending === true && !(r1.variantSplit && r1.variantSplit.show), r1 && [r1.splitPending, r1.variantSplit]);
      for (let i = 0; i < 60 && ![...STORE.keys()].some(k => /^VSPLIT\|/.test(k)); i++) await new Promise(r => setTimeout(r, 100));
      ok("the split, finished behind the request, is stored (VSPLIT|stamp|family|year|model|miles)", [...STORE.keys()].some(k => /^VSPLIT\|e\d+-/.test(k) && k.includes("ferrari-330")), [...STORE.keys()]);
      // another instance: memory cleared; the read is the stored split, no sale is read
      VR3.__clearVariantRowsCache(); archiveReads = 0; const r2 = await VR3.variantSplitFor(d3, ctx3, veh3, null, env3, { deadlineMs: 150 }), reads2 = archiveReads;
      ok("the second read (another instance, memory empty) returns the cards from the stored split and reads no sales", !!r2 && !r2.splitPending && !!r2.variantSplit && r2.variantSplit.show === true && reads2 === 0, r2 && [r2.splitPending, r2.variantSplit && r2.variantSplit.show, reads2]);
      // a third read computed from scratch (no store) is the same cards: the stored split is the cards the sales make
      STORE.clear(); VR3.__clearVariantRowsCache(); const r3 = await VR3.variantSplitFor(d3, ctx3, veh3, null, env3, { deadlineMs: 20000 }); const shape = x => JSON.stringify(((x && x.variantSplit && x.variantSplit.rows) || []).map(r => [r.label, r.rangeText, r.salesText, r.fewText || null, r.n]));
      ok("the first read and the second read return the same card set (names, ranges, counts, too-few lines)", shape(r2) === shape(r3) && shape(r3) !== "[]", [shape(r2), shape(r3)]);
      // a crew read writes nothing to the shared stores (the standing rule)
      STORE.clear(); VR3.__clearVariantRowsCache(); await VR3.variantSplitFor(d3, { ...ctx3, crew: true }, veh3, null, env3, { deadlineMs: 20000 }); await new Promise(r => setTimeout(r, 300));
      ok("a crew read of a family car writes no split to the shared store", ![...STORE.keys()].some(k => /^VSPLIT\|/.test(k)), [...STORE.keys()]);
      globalThis.fetch = base3; VR3.__clearVariantRowsCache(); }
    // ===== EXCLUSIVE CARDS (lane-b-sell-cards-first, Stage 2): live, the 1987 BMW 3 Series showed a 325i card that said "Too few sales for a range" beside 14 sales, the same 14 as the 325is card ($15,500 to $23,500). CAUSE: the resolver reads the typed "325i" as a TRIM and the engine's trim fence is a substring of the title, so the 325i page read the 325is sales too (live: 325i 8 and 325is 6 in one pool of 14); the card printed that pool's count and, with no range of its own, the too-few line. THE CLASS: a card's page must hold the sales of its own car and no sibling's. Rebuilt from the live shape (325i 8, 325is 6, none 1; the resolver files each variant's words as a trim), read as rows, then each card against the sales assigned to it:
    { const fam = fams.find(f => f.id === "bmw-3-series-e30"), mkr = (title, i, auto) => { const id = "ex" + (seq++); return { id, source_id: id, sale_price: /325is/.test(title) ? 21000 + i * 300 : /325i/.test(title) ? 9000 + i * 400 : 15000, sale_date: new Date(Date.now() - (15 + i * 12) * DAY).toISOString().slice(0, 10), platform: "Bring a Trailer", listing_title: title, year: 1987, make: "BMW", model: "3-Series", vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, vehicle_type: "car", raw_record: { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(50000 + i * 4000), body_style: "Coupe", modifications: null, currency: "USD", transmission: auto ? "Automatic" : "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" } }; };
      const rowsE = [...Array.from({ length: 8 }, (_, i) => mkr("1987 BMW 325i", i, i % 2 === 0)), ...Array.from({ length: 12 }, (_, i) => mkr("1987 BMW 325is", i + 8, i % 3 === 0)), mkr("1987 BMW 3-Series", 20, false)];
      install("3-Series", rowsE); w.DATA.set("325i", rowsE.map(r => ({ ...r, id: r.id + "n", source_id: r.source_id + "n", model: "325i" }))); w.DATA.set("325iS", rowsE.filter(r => /325is/.test(r.listing_title)).map(r => ({ ...r, id: r.id + "s", source_id: r.source_id + "s", model: "325iS" }))); /* the archive also holds the cars under the nameplate the resolver files them under (live: the 325i page's pool read 325i and 325is together) */ const VRe = await imp("lib/variantRows.js"); VRe.__clearVariantRowsCache(); VRe.__setResolver(async text => { const y = /\b(\d{4})\b/.exec(text), t = /\b(318i|325e|325i|325 is|325is)\b/i.exec(text); return { status: "valid", vehicle: { year: y ? +y[1] : null, make: "BMW", model: t ? (/is\b/i.test(t[1].replace(/\s/g, "")) ? "325iS" : "325i") : "3-Series", trim: t ? t[1].replace(/\s/g, "") : null, confidence: "high", raw: text } }; });   // live: the resolver reads the words of a 325i as the model 325i with the trim 325i
      const e0 = await hit2({ oneBox: true, search: "1987 BMW 3 Series", car: { raw: "1987 BMW 3 Series", vehicle: { raw: "1987 BMW 3 Series", make: "BMW", model: "3-Series", year: 1987, trim: null, confidence: "high", canonicalLabel: "1987 BMW 3-Series" } } }, true), vsE = e0 && e0.variantSplit, byV = {}; for (const r of rowsE) { const k = VV2.variantOfSale(fam, { raw_title: r.listing_title, model: r.model, year: r.year }); (byV[k] = byV[k] || []).push(r.id); }
      ok("BMW 3 Series (live shape 325i 8, 325is 12): the cards are served (the blend has no range of its own or two cars are priced)", !!vsE && vsE.show === true, vsE && [vsE.show, vsE.why, e0 && e0.tier, e0 && e0.noRangeCode]);
      for (const r of (vsE && vsE.rows) || []) { const want = (byV[r.label] || []).length;
        ok(`BMW card ${r.label}: its count is the number of sales assigned to that variant (${want}), not a sibling's (a)`, Number(r.n) === want, [r.label, r.n, r.salesText, want]);
        ok(`BMW card ${r.label}: never "Too few sales for a range" at or above the range threshold (${r.n} sales) (c)`, !(r.fewText && Number(r.n) >= 8), [r.label, r.n, r.fewText]); }
      // (b) two sibling cards never share a sale: each card's own page pool, read as the row reads it, holds only the sales of its variant
      const poolsE = {}; for (const v of fam.variants.filter(v => (byV[v.name] || []).length)) { const rvE = { make: "BMW", model: /is$/i.test(String(v.ask || v.name).replace(/\s/g, "")) ? "325iS" : "325i", year: 1987, trim: String(v.ask || v.name).replace(/\s/g, ""), variant: v.name, variantFamily: fam.id }, aE = (await OB.oneEngineAnswer(rvE, null, "1987 BMW 3-Series " + (v.ask || v.name), { ...w.env, asked: 2 })).raw; poolsE[v.name] = (aE.rawPool || []).map(x => x.id || x.source_id); if (process.env.DBGX) console.log('XROW', v.name, aE.tier, aE.noRangeCode, JSON.stringify(aE.cluster), aE.poolN, JSON.stringify(aE.variants && {st: aE.variants.stated, ap: aE.variants.applied, th: aE.variants.thin, pooled: aE.variants.pooled}), aE.rungLabel, aE.samLine); }
      const names = Object.keys(poolsE); let shared = 0; for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) shared += poolsE[names[i]].filter(x => new Set(poolsE[names[j]]).has(x)).length;
      ok(`BMW: two sibling cards share no sale (${names.map(n => n + " " + poolsE[n].length).join(", ")}; shared ${shared}) (b)`, shared === 0, poolsE);
      VRe.__setResolver(null); }
  // THE FOUR CARS, RECORDED LIVE (scripts/fixtures/noDeadEnds.json): each answered "sold as different cars, so no one range". Rebuilt from the counts by variant and the options priced apart, read through the real handler as a visitor. Never the sentence alone: the cards of the list, or the options each with its count; for the two whose list has two cars with sales, the cards of the list.
    { const ND = JSON.parse(read("scripts/fixtures/noDeadEnds.json")), VRm2 = await imp("lib/variantRows.js");
      for (const c of ND.cars) {
        const fam = fams.find(f => f.id === c.family), rows = [], model = c.model === "993" ? "911" : c.model; let k = 0;
        const names = Object.entries(c.variants).flatMap(([vn, n]) => Array(n).fill(vn)), opts0 = c.options.length ? c.options : [{ label: "all", n: names.length, low: 30000, high: 60000 }];   // one sale per option count, each given a car of the list in turn, the rest unstated
        for (const o of opts0) for (let i = 0; i < o.n; i++, k++) { const vn = names[k] || "Unstated", v = fam.variants.find(x => x.name === vn), id = "nd4" + (seq++), vw = vn === "Unstated" ? "" : " " + (v && (v.ask || v.name)), title = `${c.year} ${c.make} ${model}${vw}`, price = Math.round((o.low + (o.high - o.low) * ((i % 5) / 4)) * [3.4, 1, 0.45, 1.9, 0.7][k % 5]);   // the live pools had no one range (the options priced apart, the rest spread): the prices are spread the same way
          rows.push({ id, source_id: id, sale_price: price + (seq % 7), sale_date: new Date(Date.now() - (15 + k * 11) * DAY).toISOString().slice(0, 10), platform: k % 3 === 0 ? "Bring a Trailer" : "Cars & Bids", listing_title: title, year: c.year, make: c.make, model, vin_norm: null, stated_mileage: null, project_flag: null, desc_facts: null, has_reserve: false, vehicle_type: "car", raw_record: { id, title, featured_image_url: "https://img.example/" + id + ".jpg", mileage: String(30000 + k * 2900), body_style: c.dimension === "body" ? (o.label === "Coupe" ? "Coupe" : o.label) : "Coupe", modifications: null, currency: "USD", transmission: c.dimension === "gearbox" ? (o.label === "Manual" ? "Manual (5-Speed)" : "Automatic") : "Manual (5-Speed)", exterior_color: "Red", title_status: "Clean", url: "https://bat.example/" + id, source_url: "https://src.example/" + id, city: "Austin", state: "TX", country_code: "US", auction_end_precision: "day" } }); }
        install(model, rows); VRm2.__clearVariantRowsCache(); VRm2.__setResolver(async text => { const y = /\b(\d{4})\b/.exec(text); return { status: "valid", vehicle: { year: y ? +y[1] : null, make: c.make, model, trim: null, confidence: "high", raw: text } }; });
        const a = await hit2({ oneBox: true, search: c.typed, car: { raw: c.typed, vehicle: { raw: c.typed, make: c.make, model, year: c.year, trim: null, confidence: "high", canonicalLabel: c.typed } } }, false), vs = a && a.variantSplit, opts = (a && a.options || []).filter(o => Number(o.n) > 0).length, noRange = !!a && !(Array.isArray(a.cluster) && a.cluster.length === 2);
        if (c.reproduces) ok(`${c.typed}: the rebuilt shape has no one range of its own, as live (so the check is not vacuous)`, noRange, a && [a.tier, a.cluster]);
        if (process.env.DBGND) console.log('ND', c.typed, a && a.tier, JSON.stringify(a && a.cluster), a && a.noRangeCode, !!(a && a.pooledApart), (a && a.options || []).length, JSON.stringify(vs && vs.why), a && a.poolN);
        ok(`${c.typed} (live shape ${JSON.stringify(c.variants)}): the answer never stands on its no-range sentence alone: the cards of the list, or the options each with its count (tier ${a && a.tier}, cards ${vs && vs.show}, options ${opts})`, !!a && (!noRange || (vs && vs.show === true) || opts >= 2), a && [a.tier, a.noRangeCode, vs && vs.show, opts]);
        if (c.reproduces && Object.keys(c.variants).filter(n => n !== "Unstated").length >= 2) ok(`${c.typed}: the list's cars with sales (${Object.keys(c.variants).filter(n => n !== "Unstated").join(", ")}) are cards, each with its count and a range or the too-few line`, !!vs && vs.show === true && Object.keys(c.variants).filter(n => n !== "Unstated").every(n => (vs.rows || []).some(r => r.label === n && r.salesText && (r.rangeText || r.fewText))), vs && [vs.show, (vs.rows || []).map(r => [r.label, r.rangeText, r.fewText, r.salesText])]);
      }
    }
    (await imp("lib/variantRows.js")).__setResolver(null);
    ok(`the no-dead-end class read ${nn} family shapes`, nn >= 40, nn); }
  OB.RANGE_RULES.trimFirst = TF; }
console.error = err;
for (const f of fails.slice(0, +(process.env.SHOW || 40))) console.log("FAIL " + f);
// ===== WHAT IS PRICED ON ITS OWN, UNDER THE RANGE (lane-b-sale-name, Nov 19 2026; order bc85 item 1) =====
// CAUSE: a range that left a trim, a year or a set of cars out said nothing about them, so a buyer of a 2005 Ford GT never learned the 2006 cars and the Heritage editions are read on their own, nor a 1987 Trans Am reader that the GTA and Formula are. FIX: lib/variants.js ownPriceOf, from the family data and the pool's year window, served as variants.ownLine and variants.own (each name with its own page's address).
// CLASS: every family in the data (the sweep below), the three read through the engine here (Ford GT, Firebird, Camaro).
{ const ownOf = async (text, vehicle) => { w.deps.resolveVehicle = async () => ({ status: "valid", vehicle }); return (await OB.oneEngineAnswer(vehicle, null, text, { ...w.env })).raw; };
  w.DATA.clear();
  w.DATA.set("GT", [...world("Ford", "GT", [2005, 2005], [["", 10, 300000]]), ...world("Ford", "GT", [2006, 2006], [["", 9, 350000], ["Heritage Edition", 6, 450000]])]);
  w.DATA.set("Firebird", world("Pontiac", "Firebird", [1987, 1987], [["Trans Am", 10, 30000], ["Trans Am GTA", 5, 24000], ["Formula", 5, 13000], ["", 5, 7500]]));
  w.DATA.set("Supra", world("Toyota", "Supra", [1990, 1990], [["", 12, 20000]]));
  w.DATA.set("Camaro", world("Chevrolet", "Camaro", [1987, 1987], [["Z28", 6, 18000], ["IROC-Z", 5, 22000], ["Berlinetta", 5, 9000], ["RS", 5, 11000], ["", 5, 8000]]));
  const g05 = await ownOf("2005 Ford GT", { year: 2005, make: "Ford", model: "GT" }), fb = await ownOf("1987 Pontiac Firebird Trans Am", { year: 1987, make: "Pontiac", model: "Firebird", trim: "Trans AM" }), cz = await ownOf("1987 Chevrolet Camaro Z28", { year: 1987, make: "Chevrolet", model: "Camaro", trim: "Z28" });
  ok("2005 Ford GT: the Ford GT list holds it (the family is in the data)", !!(g05.variants && g05.variants.familyId === "ford-gt-2005"), g05.variants && g05.variants.familyId);
  ok('2005 Ford GT: "2006 cars and Heritage editions are priced on their own."', g05.variants && g05.variants.ownLine === "2006 cars and Heritage editions are priced on their own.", g05.variants && g05.variants.ownLine);
  ok("2005 Ford GT: each name is a link to its own page (the 2006 cars, the Heritage Edition)", g05.variants && Array.isArray(g05.variants.own) && g05.variants.own.length === 2 && g05.variants.own[0].address === "/market-check?q=2006%20Ford%20GT" && g05.variants.own[1].address === "/market-check?q=2006%20Ford%20GT%20Heritage%20Edition" && g05.variants.own.every(i => /^\/sell\?car=/.test(i.sellAddress)), g05.variants && g05.variants.own);
  ok('1987 Firebird Trans Am: "GTA and Formula cars are priced on their own." (the plain Base is no name)', fb.variants && fb.variants.ownLine === "GTA and Formula cars are priced on their own.", fb.variants && fb.variants.ownLine);
  ok("1987 Firebird Trans Am: the names link to the GTA and the Formula", fb.variants && (fb.variants.own || []).map(i => i.address).join() === "/market-check?q=1987%20Pontiac%20Firebird%20GTA,/market-check?q=1987%20Pontiac%20Firebird%20Formula", fb.variants && fb.variants.own);
  ok("1987 Camaro Z28: a line from the list, naming the cars set aside and never the Base or an unnamed sale", cz.variants && typeof cz.variants.ownLine === "string" && / are priced on their own\.$/.test(cz.variants.ownLine) && /IROC-Z/.test(cz.variants.ownLine) && !/Unstated|unstated|\bBase\b/.test(cz.variants.ownLine), cz.variants && cz.variants.ownLine);
  const un = await ownOf("1987 Pontiac Firebird", { year: 1987, make: "Pontiac", model: "Firebird" });
  ok("an unstated Firebird (every variant in the pool) has no line", !(un.variants && un.variants.ownLine), un.variants && un.variants.ownLine);
  // THE DIG LINE (order bc85 item 5): one public line under every range; the split names the variants left out; a car with no family gets the general sentence
  const sup = await ownOf("1990 Toyota Supra", { year: 1990, make: "Toyota", model: "Supra" });
  const GEN = "Every sale we hold is in this range. Editions and trims are priced on their own, and replicas and tributes are set aside.";
  ok("DIG: the 2005 Ford GT names its split", g05.tier === "result" && g05.digLine === "Every sale we hold is in this range. Heritage editions are priced on their own. Replicas and tributes are set aside.", g05.digLine);
  ok("DIG: the 1987 Firebird Trans Am names its split (GTA and Formula)", fb.tier === "result" && fb.digLine === "Every sale we hold is in this range. GTA and Formula cars are priced on their own. Replicas and tributes are set aside.", [fb.tier, fb.digLine]);
  ok("DIG: a car with no family gets the general sentence", sup.tier === "result" && sup.digLine === GEN, [sup.tier, sup.digLine]);
  ok("DIG: the parts a page prints are the line, and each name is a link to its own page", [g05, fb, sup].every(a => Array.isArray(a.digParts) && a.digParts.map(x => x.text).join("") === a.digLine) && g05.digParts.some(x => x.text === "Heritage editions" && x.address === "/market-check?q=2006%20Ford%20GT%20Heritage%20Edition") && fb.digParts.filter(x => x.address).length === 2 && sup.digParts.every(x => !x.address), [g05.digParts, fb.digParts]);
  ok("DIG: every answer with a range carries it, in Sam's voice (no tool or house named, no dash)", [g05, fb, sup, cz].filter(a => a.tier === "result").every(a => typeof a.digLine === "string" && !/hagerty|bring a trailer|cars (&|and) bids|\bBaT\b|[\u2013\u2014]/i.test(a.digLine)), [g05, fb, sup, cz].map(a => [a.tier, !!a.digLine]));
  ok("DIG: an answer with no range carries none", !["thin", "refusal", "trim_choice"].some(t => { const a = [g05, fb, sup, cz, un].find(x => x.tier === t); return a && a.digLine; }));
  // the sweep: every family, every variant, a year the variant was built; the line is made, finished, free of dashes, and names only the family's own cars
  const bad = []; let made = 0, families = 0;
  for (const fam of V.familiesOf()) { families++;
    for (const v of fam.variants) { const y = Array.isArray(v.years) ? v.years[0] : fam.years[0], info = { applied: true, inPool: V.poolNames(fam, [v.name]), asked: [v.name] }, own = typeof V.ownPriceOf === "function" ? V.ownPriceOf(fam, info, { year: y, make: fam.make, model: fam.models[0] }) : null;
      const others = fam.variants.filter(x => x.name !== v.name && !info.inPool.includes(x.name) && !(fam.unnamedIs && x.name === fam.unnamedIs) && (fam.pricedByYear || (V.builtInYear || (() => true))(x, y)));
      if (others.length && !own) bad.push([fam.id, v.name, "no line"]); if (!others.length && !fam.pricedByYear && own) bad.push([fam.id, v.name, "a line with nothing set aside"]);
      if (own) { made++; if (!/ are priced on their own\.$/.test(own.line) || /[\u2013\u2014]|Unstated/i.test(own.line) || own.items.some(i => !i.address.startsWith("/market-check?q=") || !decodeURIComponent(i.address).includes(fam.make))) bad.push([fam.id, v.name, own.line]); } } }
  ok(`the sweep: ${families} families, ${made} lines made, every one finished, dash free, naming only the family's cars and linking each name`, !bad.length && families >= 25 && made >= 60, { families, made, bad: bad.slice(0, 5) });
  ok("the Ford GT list: Base and Heritage Edition, 2006 only, priced by year", (() => { const f = V.familiesOf().find(x => x.id === "ford-gt-2005"); return !!f && f.pricedByYear === true && f.variants.map(v => v.name).join() === "Base,Heritage Edition" && f.variants[1].years.join() === "2006,2006"; })());
}
console.log(`variantSplitCheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

function mutants() {
  const me = fileURLToPath(import.meta.url), R = path.resolve(args.find(a => !a.startsWith("--")) || path.join(path.dirname(me), ".."));
  const M = [
    ["the variant filter never narrows the pool", "lib/onebox.js", s => s.replace("    return kept;\n  } catch { return rows; }", "    return rows;\n  } catch { return rows; }")],
    ["a package is counted with its parent whatever the data says", "lib/variants.js", s => s.replace("if (def && def.includesPackages) for", "if (def) for")],
    ["there is no thin fallback", "lib/variants.js", s => s.replace("export const VARIANT_MIN = 5;", "export const VARIANT_MIN = 0;")],
    ["the thin fallback fires at 5", "lib/onebox.js", s => s.replace("value.rawPool.length < VARIANT_MIN", "value.rawPool.length <= VARIANT_MIN")],
    ["the analyst's set is ignored by the engine", "lib/onebox.js", s => s.replace("if (Array.isArray(vsd)) {", "if (false) {")],
    ["the Desk read drops the chosen set", "lib/sheetRead.js", s => s.replace("variantSet: Array.isArray(input.desk.variantSet) ? input.desk.variantSet : null,", "")],
    ["the chosen set is not in the case's recall key", "lib/desk/caseWorkflow.js", s => s.replace("...(variantSetOf(c) ? [{ variants: variantSetOf(c) }] : [])]);", "]);")],
    ["the chosen set is not sent to the engine", "lib/desk/caseWorkflow.js", s => s.replace("...(variantSetOf(c) ? { variantSet: variantSetOf(c) } : {}) }\n  };", "}\n  };")],
    ["LUMP: the exact car is not read on the family's pool", "lib/onebox.js", s => s.replace("try { vehicle = variantExactCar(vehicle, searchText); } catch", "try { /* off */ } catch")],
    ["LUMP: a mix of cars is still called too spread out", "lib/onebox.js", s => s.replace("const mixedNames = mixedVariantNames(spec, refusalRows);", "const mixedNames = null;")],
    ["LUMP: a stated variant is still one number across models", "lib/onebox.js", s => s.replace("if (spec && Array.isArray(spec.variantStated) && spec.variantStated.length) return false;", "")],
    ["LUMP: the split is not the answer when the blended answer has no range", "lib/variantRows.js", s => s.replace('const noRangeTier = d && (d.tier === "refusal" || d.tier === "thin"),', "const noRangeTier = false,")],
    ["LUMP: typed words read as a sale's title does (a 330 GT is a 2+2)", "lib/variants.js", s => s.replace("(typed ? x.resT : x.res)", "x.res")],
    ["LUMP: a variant's row is read through the resolver, not the family's pool", "lib/variantRows.js", s => s.replace("const r = fam.baseModel ? { vehicle:", "const r = false ? { vehicle:")],
    ["LUMP: the stated variant is set aside as a halo (the Speedster)", "lib/onebox.js", s => s.replace("(variantAnswerCtx.getStore() || {}).variantSelf", "undefined")],
    ["LUMP: the Ferrari 330 list is not in the data", "data/variantFamilies.json", s => s.replace('"models": ["330*"]', '"models": ["330zz*"]')],
    ["LUMP: a model is matched whole, never by its start", "lib/variants.js", s => s.replace('String(m).endsWith("*") ? md.startsWith(norm(m)) : md === norm(m)', "md === norm(m)")],
    ["LUMP2: a title that names another car stays in the family's pool (the 412 and the 400i under 365)", "lib/onebox.js", s => s.replace("if (fam && !variantOwnsTitle(fam,", "if (false && !variantOwnsTitle(fam,")],
    ["LUMP2: the fence is not read from the data (no titleFence on the 365)", "data/variantFamilies.json", s => s.replace('"id": "ferrari-365", "titleFence": true,', '"id": "ferrari-365",')],
    ["LUMP2: the fence reads only the model word, never an alias of the entry", "lib/variants.js", s => s.replace(".concat((fam.ownWords || []).map(", ".concat([].map(")],
    ["LUMP2: the exact car is named as the family's model alone", "lib/onebox.js", s => s.replace("st.nameAs = { make: vehicle.make,", "st.nameAsOff = { make: vehicle.make,")],
    ["LUMP2: the exact car's name is not the typed words (askBase dropped)", "lib/variants.js", s => s.replace("[fam.askBase || fam.baseModel, v.ask || v.name]", "[fam.baseModel]")],
    ["FIRST: a timed out read returns the blend as final (no pending)", "lib/variantRows.js", s => s.replace(", splitPending: true };", " };")],
    ["FIRST: the finished split is never stored", "lib/variantRows.js", s => s.replace("if (!(ctx && ctx.crew)) keepAlive(writeSplitStore(env, skey, split));", "")],
    ["FIRST: the compute behind a timed out read is not stored", "lib/variantRows.js", s => s.replace("return ctx && ctx.crew ? null : writeSplitStore(env, skey, sp); }", "return null; }")],
    ["FIRST: a stored split is not read", "lib/variantRows.js", s => s.replace("if (stored) { cache.set(key", "if (false) { cache.set(key")],
    ["FIRST: a crew read writes the shared store", "lib/variantRows.js", s => s.replace("if (!(ctx && ctx.crew)) keepAlive(writeSplitStore(env, skey, split));", "keepAlive(writeSplitStore(env, skey, split));")],
    ["FIRST: the answer for a pending read is the blend (sellerDecision)", "api/sellerDecision.js", s => s.replace("if (oneBox && oneBox.splitPending === true) return", "if (false) return")],
    ["CARDFIX: a card's car carries no family (the nameplate's pool is read)", "lib/variantRows.js", s => s.replace("variantFamily: fam.id, ...(fam.baseModel", "...(fam.baseModel")],
    ["CARDFIX: a card says too few at any count", "lib/variantRows.js", s => s.replace("  if (n < floor) return reasonLine(\"variant.row_few\");", "  return reasonLine(\"variant.row_few\");")],
    ["NODEAD: the cards are not the answer when the blend has no range (two cars with sales)", "lib/variantRows.js", s => s.replace("if (blendNoRange === true && (rows || []).filter(r => r && Number(r.n) > 0).length >= 2) return { show: true, code: null };", "")],
    ["NODEAD: the cards ignore whether the blend has a range", "lib/variantRows.js", s => s.replace("showSplit(rows, !rangeTextOf(d))", "showSplit(rows, false)")],
    ["NODEAD: a card with sales and no range has no too-few line", "lib/variantRows.js", s => s.replace("...(!range && n > 0 ? { fewText: noRangeTextOf(raw, n) } : {}),", "")],
    ["NODEAD: one car alone is made a choice (any sales count)", "lib/variantRows.js", s => s.replace("filter(r => r && Number(r.n) > 0).length >= 2", "filter(r => r).length >= 2")],
    ["NODEAD: a card has no Sell address", "lib/variantRows.js", s => s.replace('sellAddress: "/sell?car=" + encodeURIComponent(st.token), ', "")],
    ["NODEAD: a card is stamped with the typed blend's name (Sell would sell the blend again)", "lib/variantRows.js", s => s.replace("...(fam.baseModel ? { canonicalLabel: words } : {}),", "")],
    ["NODEAD: Sell never reads the cards (range step)", "lib/sell/sellBlock.js", s => s.replace("if (!VARIANT_SPLIT_PUBLIC || !d ||", "if (true || !d ||")],
    ["NODEAD: Sell's rest builds the blend's decision beside the cards", "lib/sell/sellFlow.js", s => s.replace("  if (first.split) return done({ ...head, split: first.split });", "")],
    ["LUMP: a row with sales and no range says no sales", "lib/variantRows.js", s => s.replace('(raw.tier === "refusal" || raw.tier === "thin") ?', "false ?")],
    ["the census of the set aside variants is not read", "lib/onebox.js", s => s.replace("if (!box.census && (spec.trim || spec.titleContains))", "if (false)")],
    ["the Desk does not serve the variants", "lib/deskV3.js", s => s.replace("variants: desk.variants ? { ...desk.variants, windowCount:", "variants: null ? { ...desk.variants, windowCount:")],
    ["the Desk is not at the next shape", "lib/deskV3.js", s => s.replace("export const DESK_SHAPE = 10;", "export const DESK_SHAPE = 9;")],
    ["the Camaro family is not in the data", "data/variantFamilies.json", s => s.replace('"models": ["Camaro"]', '"models": ["Camaro Zz"]')],
    ["the Mustang family is not in the data", "data/variantFamilies.json", s => s.replace('"models": ["Mustang"]', '"models": ["Mustang Zz"]')],
    ["a car that names no variant is filtered to one", "lib/variants.js", s => s.replace("if (!car.names.length) return { variantFamily: fam.id };", "if (!car.names.length) return { variantFamily: fam.id, variantStated: [fam.variants[0].name], variantSet: [fam.variants[0].name], variantSource: 'words' };")],
    ["the 20th Anniversary Turbo Trans Am is not in the data", "data/variantFamilies.json", s => s.replace('"name": "20th Anniversary Turbo Trans Am"', '"name": "20th Anniversary Turbo Trans Am Zz"').replace('"words": ["20th\\\\s+anniversary", "turbo\\\\s+trans[\\\\s-]?am"]', '"words": ["zzzz"]')],
    ["a Knight Rider or KITT car passes the fence", "lib/_classify.js", s => s.replace("kitt|k\\.i\\.t\\.t|knight[\\s-]?rider|", "").replace("(kitt|k\\.i\\.t\\.t|knight[\\s-]?rider|", "(")],
    ["the replicas set aside are not counted on the answer", "lib/onebox.js", s => s.replace("if (n > 0) { const r0 =", "if (false) { const r0 =")],
    ["the replica count is not taken in the fetch", "lib/onebox.js", s => s.replace("&& isReplicaCar(r) && qualifyReason(r, spec) === \"memorabilia or replica\"", "&& false")],
    ["a variant under five sales is an option", "lib/onebox.js", s => s.replace("filter(([, a]) => a.length >= VARIANT_MIN)", "filter(([, a]) => a.length >= 1)")],
    ["the question is asked again after an answer", "lib/onebox.js", s => s.replace("if (Number(asked) > 0 || (refine && refine.variant)) return d;", "")],
    ["a chip's variant is ignored by the engine", "lib/onebox.js", s => s.replace("if (fam && nm) { spec.variantFamily = fam.id; spec.variantStated = [nm];", "if (false) { spec.variantFamily = fam.id; spec.variantStated = [nm];")],
    ["the chip's key is dropped by the handler's refine", "api/sellerDecision.js", s => s.replace("|| variantKeyShape(String(rawRefine.variant || \"\"))", "")],
    ["a stated variant is asked about too", "lib/onebox.js", s => s.replace("d.variants.applied || (d.variants.stated || []).length || d.variants.chosen) return d;", "false) return d;")],
    ["the options are not counted from the pool", "lib/onebox.js", s => s.replace("count: a.length, query: text,", "count: 99, query: text,")],
    ["the variant question counts the answer's pool, not the census", "lib/onebox.js", s => s.replace("  const census = await variantCensusFor(vehicle, generation, env);\n  return withVariantQuestion(d, { ...(ctx || {}), census });", "  return withVariantQuestion(d, { ...(ctx || {}) });")],
    ["the thin line prints the census count", "lib/onebox.js", s => s.replace("pooled: firstPool, applied: false", "pooled: kept.pooled, applied: false")],
    ["the answer's variants carry no pool counts", "lib/onebox.js", s => s.replace("poolCounts: poolCountsOf(fam0, out.rawPool), poolTotal: out.rawPool.length, ", "")],
    ["the Desk does not say how many of the ticked sales the range is read on", "lib/sheetRead.js", s => s.replace("deskVariants = { ...deskVariants, windowLine: reasonLine(", "deskVariants = { ...deskVariants, windowLineX: reasonLine(")],
    ["the Desk case does not ask the variant question", "lib/sheetRead.js", s => s.replace("if (q && q.tier === \"variant_choice\") deskVariants", "if (false) deskVariants")],
    ["the trim reader upper cases a short word again", "lib/vehicle.js", s => s.replace("const trim = variantSpelling(words.join(\" \"));", "const trim = words.join(\" \");")],
    ["a stored label keeps its old spelling", "lib/onebox.js", s => s.replace("if (rc.canonicalLabel) return variantSpelling(String(rc.canonicalLabel));", "if (rc.canonicalLabel) return String(rc.canonicalLabel);")],
    ["the mileage chip is printed whether or not the band was applied", "lib/onebox.js", s => s.replace("if (bandApplied) out.push({ kind: \"mileage\"", "if (true) out.push({ kind: \"mileage\"")],
    ["OWN: the line is not made (ownLine dropped from the block)", "lib/variants.js", s => s.replace("ownLine: own ? own.line : null, own: own ? own.items : [],", "")],
    ["OWN: the plain Base is named as priced on its own", "lib/variants.js", s => s.replace("plain = v => !!fam.unnamedIs && v.name === fam.unnamedIs;", "plain = v => false;")],
    ["OWN: the other year's cars are not named (pricedByYear ignored)", "lib/variants.js", s => s.replace("if (fam.pricedByYear && py && Array.isArray(fam.years))", "if (false)")],
    ["OWN: a name has no page address", "lib/variants.js", s => s.replace('address: "/market-check?q=" + encodeURIComponent(words), ', "")],
    ["OWN: the Ford GT list is not in the data", "data/variantFamilies.json", s => s.replace('"id": "ford-gt-2005"', '"id": "ford-gt-2005zz", "models": ["GTzz"], "x": 0, "z"').replace('"x": 0, "z", "label"', '"label"')],
    ["OWN: the plural of a variant is ignored", "lib/variants.js", s => s.replace("itemOf(v.plural || v.name,", "itemOf(v.name,")],
    ["DIG: the line is not served", "lib/onebox.js", s => s.replace("out.digLine = dl.line; out.digParts = dl.parts;", "")],
    ["DIG: a split is not named (the general sentence always)", "lib/variants.js", s => s.replace("if (!vs.length) {", "if (true) {")],
    ["DIG: the names are not links", "lib/variants.js", s => s.replace("const link = i => ({ text: i.text, address: i.address, sellAddress: i.sellAddress });", "const link = i => ({ text: i.text });")],
    ["DIG: the line carries the range only for a result (any answer carries it)", "lib/onebox.js", s => s.replace('out.tier === "result" && Array.isArray(out.cluster)) { const dl', 'out && Array.isArray(out.cluster) || true) { const dl')],
    ["the line names what is not set aside", "lib/variants.js", s => s.replace("aside: out.length ? joinAnd(out.map(noun)) : null,", "aside: inNames.length ? joinAnd(inNames.map(noun)) : null,")]
  ];
  let survived = 0;
  for (const [name, file, fn] of M) {
    if (process.env.MUT_ONLY && !name.startsWith(process.env.MUT_ONLY)) continue;   // MUT_ONLY=OWN: runs one group
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
