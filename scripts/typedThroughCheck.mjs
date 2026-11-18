// typedThroughCheck (Lane B, Nov 17 2026, lane-b-typed-through; order bc85, second one): a car typed with its mileage reaches EVERY surface as that car with that mileage, through the REAL handlers, end to end.
// Nothing here is recorded: the handlers run on a fake PostgREST that holds an archive AND the stored answer rows (scripts/_typedThroughWorld.mjs), so a first ask stores its answer and a later ask reads it back, as in production.
// CLASS (two faults found live after the mileage fix): (1) a stored answer was served as written, so the car on it was the WRITER's (none for a row written before the car token, another visitor's mileage for a row written by a typed ask), and the car bar was hidden;
// (2) a mileage the resolver set aside reached the engine as the box's pre-fill only, never as the box's mileage: the range was for all mileages, and a stored row hid even the pre-fill.
// FOR EVERY FORM in resolverMileageCheck (spaces and plus signs), on Market Check (api/sellerDecision.js), Find (api/buySearch.js), Sell (lib/sell/sellFlow.js buildRange and buildResult), the Tasks composer (lib/tasks/tasks.js emailPreview) and the Desk new case (lib/desk/intake/run.js createTypedSheet):
//   the answer's car equals the stated model (car.token decodes to it), its mileage equals the typed mileage (none when the words carry a price or kilometres), car.line holds that mileage, the band line or count reflects it (the engine's own mileageBand and rangeMileage),
//   and the same holds with a stored row already there (the stored path), a cold world, a row written before the car token (no car on it), and in either order of a plain ask and a typed one (a typed ask never leaves its mileage on the plain car's row).
// KILOMETRES: a km mileage is set aside by the resolver and is NOT a mileage here: the answer carries no mileage and the range is for all mileages (checked, the held km branch is untouched).
//   node scripts/typedThroughCheck.mjs [repo root]      --mutants breaks one rule at a time (each must fail)
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url"; import { register } from "node:module";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const W = await import(pathToFileURL(path.join(here, "_typedThroughWorld.mjs")).href); W.setEnv();
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; if (fails.length < 60) fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 260) : "")); } };
const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
let CT, SD, BS, SFLOW, TK, V;
try { CT = await imp("lib/carToken.js"); V = await imp("lib/vehicle.js"); SD = (await imp("api/sellerDecision.js")).default; BS = (await imp("api/buySearch.js")).default; SFLOW = await imp("lib/sell/sellFlow.js"); TK = await imp("lib/tasks/tasks.js"); } catch (e) { console.log = log; log("typedThroughCheck: could not load the tree: " + (e && e.message)); process.exit(1); }
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
const CARS = [
  { name: "2003 Mercedes-Benz SL500", make: "Mercedes-Benz", model: "SL-Class", title: "SL500", year: 2003, price: 22000, n: 44, lowMiles: 15000, spanMiles: 60000 },
  { name: "1999 Porsche Boxster", make: "Porsche", model: "Boxster", title: "Boxster", year: 1999, price: 14000, n: 44, lowMiles: 25000, spanMiles: 70000 },
  { name: "2001 BMW M3", make: "BMW", model: "M3", title: "M3", year: 2001, price: 30000, n: 44, lowMiles: 30000, spanMiles: 70000, body: "Coupe" }
];
// the forms of resolverMileageCheck / noticeCheck: [typed words, the mileage they carry (null: a price, kilometres or nothing)]
const FORMS = [
  ["2003 Mercedes-Benz SL500 38,400 miles", 38400], ["2003 Mercedes-Benz SL500 38400 mi", 38400], ["2003 Mercedes-Benz SL500 38.4k", 38400], ["2003 Mercedes-Benz SL500 38k miles", 38000], ["2003 Mercedes-Benz SL500 38,400", 38400],
  ["2003 Mercedes-Benz SL500 62,000 km", null], ["2003 Mercedes-Benz SL500 $18,000", null], ["2003 Mercedes-Benz SL500 under 60k", null], ["2003 Mercedes-Benz SL500 38,400 miles $18,000", 38400],
  ["2003 Mercedes-Benz SL500 $18,400", null], ["2003 Mercedes-Benz SL500 around 18,400", null], ["1999 Porsche Boxster budget $45,911", null], ["1999 Porsche Boxster under 45,911", null], ["1999 Porsche Boxster 45,911 miles", 45911], ["1999 Porsche Boxster 45,911", 45911],
  ["2001 BMW M3 62,328 miles", 62328], ["38,400 miles 2003 Mercedes-Benz SL500", 38400], ["2003 Mercedes-Benz SL500, 38,400 miles, asking $18,000", 38400], ["2003 Mercedes-Benz SL500", null], ["1999 Porsche Boxster", null], ["2001 BMW M3", null]
];
const carOfForm = t => CARS.find(c => t.includes(c.name) || (t.includes(c.name.replace(/^\d{4} /, "")) && t.includes(String(c.year)))) || null;
const plus = t => t.replace(/ /g, "+");
const spellings = t => [["spaces", t], ["plus signs", plus(t)]];
const nf = n => Number(n).toLocaleString("en-US");
const call = W.caller(SD), callBuy = W.caller(BS);
const mc = async (text, extra) => { try { return await call({ oneBox: true, search: text, ...(extra || {}) }); } catch (e) { return { error: String(e && e.message) }; } };
const decode = c => (c && c.token ? CT.decodeCar(c.token) : null);
const plainOf = c => { const d = decode(c); return d ? [d.make, d.model, d.trim || null].join("|") : null; };
let EXPECT = null;   // the car each name resolves to (make|model|trim), read from the resolver on the name alone
const world = (rows) => W.install(CARS, rows);
const expectOf = async () => { EXPECT = {}; for (const c of CARS) { const r = await V.resolveVehicle(c.name); EXPECT[c.name] = r.vehicle ? [r.vehicle.make, r.vehicle.model, r.vehicle.trim || null].join("|") : null; } };
// ===== A PARTIAL CAR TYPED WITH ITS MILEAGE (lane-d-car-bar-partial; Sam's rule: a make carries through all four pills) =====
// (FIRST in the run: the resolver reads its make list once, so the make list this block supplies is the one every later case reads too)
// a make and a year with the mileage, no model: Market Check and Sell serve the model choice (not an answer), the model that was stated is among the choices as the FULL car with the typed mileage, and a full car typed the same way is unchanged (the loops above).
{ const realFetch = globalThis.fetch;
  const PW = W.install(CARS.concat([{ make: "Mercedes-Benz", model: "E-Class", title: "E500", year: 2003, price: 9000, n: 14 }, { make: "Porsche", model: "911", title: "911", year: 1999, price: 30000, n: 14 }, { make: "BMW", model: "3 Series", title: "325i", year: 2001, price: 8000, n: 14 }])), realFetch2 = globalThis.fetch;
  globalThis.fetch = async (u, i) => {   // the make list the resolver reads, and a bare model list for a make (the shared world answers a bare model select with every model of every make)
    const x = new URL(String(u)); if (x.pathname.endsWith("/taxonomy_makes")) return new Response(JSON.stringify([...new Set(PW.rows.map(r => r.make))].map(name => ({ name }))), { status: 200 });
    if (x.pathname.endsWith("/sales_archive") && x.searchParams.get("select") === "model" && /^eq\./.test(x.searchParams.get("make") || "")) { const mk = x.searchParams.get("make").slice(3); return new Response(JSON.stringify(PW.rows.filter(r => r.make === mk).map(r => ({ model: r.model }))), { status: 200 }); }
    return realFetch2(u, i); };
  try {
    for (const c of CARS) {
      const words = `${c.year} ${c.make} 38,400 miles`, o = await mc(words), z = o && o.modelChoice, pick = z && z.choices.find(x => x.label === c.model);   // by the archive's own name for the model; its token is the car the resolver gives for those words
      ok(`partial car, Market Check, "${words}": the model choice, not an answer`, !!z && o.status === "one_box" && o.tier === "model_choice" && z.line === `Which ${c.year} ${c.make}?`, o && [o.status, o.tier, z && z.line]);
      ok(`partial car, Market Check, "${words}": the stated model is a choice, its token is the full car with the typed mileage and its address is Market Check's`, !!pick && CT.decodeCar(pick.token).mileage === 38400 && CT.decodeCar(pick.token).year === c.year && !!CT.decodeCar(pick.token).model && pick.address === "/market-check?car=" + encodeURIComponent(pick.token), z && z.choices.map(x => [x.label, CT.decodeCar(x.token)]));
      const sf = await SFLOW.buildRange({ ...env, noStore: false }, { carText: words, state: "Texas", how: "self", rush: null }), sz = sf && sf.modelChoice;
      ok(`partial car, Sell, "${words}": the model choice with Sell's addresses, no answer`, !!sz && sz.choices.length > 0 && sz.choices.every(x => x.address === "/sell?car=" + encodeURIComponent(x.token)) && !sf.noRange && !sf.refusal, sf && Object.keys(sf).slice(0, 8));
    }
  } finally { globalThis.fetch = realFetch; }
}
world(); await expectOf();
const bandNames = d => !!(d && d.mileageBand && d.mileageBand.target);
// the assertions every answer carries: car, mileage, line
const carChecks = (label, car, form, want, wantMi) => {
  const d = decode(car);
  ok(`${label}: the answer carries a car token`, !!(car && car.token), car);
  ok(`${label}: car.token decodes to the stated car (${EXPECT[want.name]})`, !!d && [d.make, d.model, d.trim || null].join("|") === EXPECT[want.name], d && [d.make, d.model, d.trim]);
  ok(`${label}: the token's mileage is the typed mileage (${wantMi == null ? "none" : wantMi})`, wantMi == null ? !(d && d.mileage > 0) : d && d.mileage === wantMi, d && d.mileage);
  ok(`${label}: car.line and car.short are on the answer, the line holds the mileage when there is one`, !!(car && car.line && car.short) && (wantMi == null ? !/ miles/.test(car.line) : car.line.includes(nf(wantMi) + " miles")), car && car.line);
};
async function marketCheck(stored, tag) {
  world(); if (stored) for (const c of CARS) await mc(c.name);   // the stored plain row of each car is there
  for (const [form, mi] of FORMS) { const car = carOfForm(form); if (!car) continue;
    for (const [sp, text] of spellings(form)) {
      const o = await mc(text); const L = `Market Check, ${tag}, ${sp}, "${form}"`;
      ok(`${L}: an answer came back`, o && o.status === "one_box" && /^(result|thin)$/.test(String(o.tier)), o && [o.status, o.tier, o.error]);
      carChecks(L, o && o.car, form, car, mi);
      if (o && o.tier === "result") {
        if (mi != null) { ok(`${L}: the box is filled with the typed mileage (queryMileage ${mi})`, o.queryMileage === mi, o.queryMileage); ok(`${L}: the range is counted on its band (mileageBand names ${mi}) and the engine says the mileage was entered`, bandNames(o) && o.mileageBand.target === mi && /\b[\d,]+\b/.test(o.mileageBand.line || "") && !!o.rangeMileage && o.rangeMileage.miles === mi && o.rangeMileage.source === "entered", [o.mileageBand, o.rangeMileage]); ok(`${L}: the mileage line names the typed miles, not "all mileages"`, new RegExp(nf(mi)).test(o.mileageLine || ""), o.mileageLine); }
        else { ok(`${L}: no mileage typed: the box is empty and the range is for all mileages`, (o.queryMileage == null) && !bandNames(o) && /all mileages/.test(o.mileageLine || ""), [o.queryMileage, o.mileageLine]); }
      }
    } }
}
await marketCheck(true, "a stored row is there");
await marketCheck(false, "a cold archive");
// ORDER: a plain ask then a typed one, a typed ask then a plain one (the typed mileage never stays on the plain car's row), a row written before the car token, a box mileage wins, kilometres
{ const c = CARS[0], typed = `${c.name} 38,400 miles`;
  world(); const a1 = await mc(c.name), a2 = await mc(typed);
  ok("order, plain then typed: the typed ask reads the mileage although the plain row is stored", a2.queryMileage === 38400 && bandNames(a2) && decode(a2.car) && decode(a2.car).mileage === 38400, [a2.queryMileage, a2.mileageBand]);
  ok("order, plain then typed: the plain ask had no mileage", a1.queryMileage == null && !(decode(a1.car) && decode(a1.car).mileage));
  world(); const b1 = await mc(typed), b2 = await mc(c.name);
  ok("order, typed then plain: the plain ask carries NO mileage (not the earlier visitor's 38,400)", b2.queryMileage == null && !(decode(b2.car) && decode(b2.car).mileage) && !/ miles/.test((b2.car && b2.car.line) || ""), [b2.queryMileage, b2.car && b2.car.line]);
  ok("order, typed then plain: the plain ask is the all mileages range", !bandNames(b2) && /all mileages/.test(b2.mileageLine || ""), b2.mileageLine);
  const w2 = world(); await mc(c.name); let cut = 0; for (const [k, v] of w2.STORE) if (k.startsWith("MCWARM:") && v.market && v.market.raw) { delete v.market.raw.car; cut++; }
  const p1 = await mc(c.name), p2 = await mc(typed);
  ok("a stored row written before the car token (no car on it) is served WITH a car: the car bar has its token", cut > 0 && !!(p1.car && p1.car.token && p1.car.line && p1.car.short), [cut, p1.car]);
  ok("a stored row with no car, asked with a mileage: the token holds the typed mileage", !!(p2.car && decode(p2.car) && decode(p2.car).mileage === 38400), p2.car && p2.car.line);
  const w3 = world(); await mc(c.name); for (const [k, v] of w3.STORE) if (k.startsWith("MCWARM:") && v.market && v.market.raw) v.market.raw.car = { token: "v1.stale.token", line: "someone else's car", short: "x" };
  const s1 = await mc(c.name);
  ok("a stored row carrying another car's words is not served with them", !!s1.car && s1.car.line === c.name.replace("Mercedes-Benz SL500", "Mercedes-Benz SL-Class SL500") && s1.car.token !== "v1.stale.token", s1.car);
  world(); const e1 = await mc(typed, { refine: { miTarget: 60000 } });
  ok("a mileage the box named wins over the typed words (the page's own refine)", e1.mileageBand && e1.mileageBand.target === 60000, e1.mileageBand);
  world(); const k1 = await mc(`${c.name} 62,000 km`), k0 = await mc(c.name);
  ok("kilometres today: the answer carries no mileage and the range is for all mileages (the held km branch is not changed)", !(decode(k1.car) && decode(k1.car).mileage) && k1.queryMileage == null && !bandNames(k1) && JSON.stringify(k1.cluster) === JSON.stringify(k0.cluster), [k1.queryMileage, k1.mileageLine]);
  { const w4 = world(), senv = { ...env, noStore: false }; await SFLOW.buildRange(senv, { carText: typed, state: "Texas", how: "self", rush: null }); const m4 = await mc(c.name);
    ok("Sell typed, then Market Check plain: the plain answer carries no mileage and the box is empty (Sell left no mileage on the stored row)", m4.queryMileage == null && !(decode(m4.car) && decode(m4.car).mileage) && !bandNames(m4), [m4.queryMileage, m4.car && m4.car.line, [...w4.STORE.keys()].filter(k => /^MCWARM/.test(k)).length]);
    const m5 = await mc(typed); ok("Sell typed, then Market Check typed: the mileage is read", m5.queryMileage === 38400 && bandNames(m5)); }
  world(); const sp = await mc(plus(typed)); ok("the plus string reads the same car and the same mileage as the spaces", decode(sp.car) && decode(sp.car).mileage === 38400 && sp.queryMileage === 38400);
}
// FIND (api/buySearch.js): the answer carries the car with the typed mileage
for (const stored of [false, true]) { world(); for (const [form, mi] of FORMS) { const car = carOfForm(form); if (!car) continue; for (const [sp, text] of spellings(form)) {
  let o = null; try { o = await callBuy({ q: text }); } catch (e) { o = { error: String(e && e.message) }; }
  const L = `Find, ${sp}, "${form}"`; ok(`${L}: an answer came back`, o && o.status === "ok", o && [o.status, o.error]);
  carChecks(L, o && o.car, form, car, mi); } } if (!stored) break; }
// SELL: the range and the result carry the car; the market card is the banded read
for (const stored of [false, true]) {
  world(); const senv = { ...env, noStore: false };
  if (stored) for (const c of CARS) await SFLOW.buildRange(senv, { carText: c.name, state: "Texas", how: "self", rush: null });
  for (const [form, mi] of FORMS) { const car = carOfForm(form); if (!car) continue;
    for (const [sp, text] of spellings(form)) {
      let o = null; try { o = await SFLOW.buildRange(senv, { carText: text, state: "Texas", how: "self", rush: null }); } catch (e) { o = { error: String(e && e.message) }; }
      const L = `Sell range, ${stored ? "a stored block" : "cold"}, ${sp}, "${form}"`;
      carChecks(L, o && o.car, form, car, mi);
      const card = o && o.marketAnswer;
      if (card && mi != null) ok(`${L}: the market card is counted on the typed mileage's band`, !!(card.mileageBand && card.mileageBand.target === mi), card.mileageBand);
      if (card && mi == null) ok(`${L}: no mileage typed: the market card is the all mileages range`, !(card.mileageBand && card.mileageBand.target), card.mileageBand);
    } }
}
{ world(); const senv = { ...env, noStore: false }, c = CARS[0];
  const r1 = await SFLOW.buildResult(senv, { carText: `${c.name} 38,400 miles`, state: "Texas", how: "self", rush: null }).catch(e => ({ error: String(e && e.message) }));
  ok("Sell result: the result carries the car with the typed mileage", !!(r1 && r1.car && decode(r1.car) && decode(r1.car).mileage === 38400 && r1.car.line.includes("38,400 miles")), r1 && (r1.car || r1.error));
  ok("Sell result: the market card is the banded read", !!(r1 && r1.marketAnswer && r1.marketAnswer.mileageBand && r1.marketAnswer.mileageBand.target === 38400), r1 && r1.marketAnswer && r1.marketAnswer.mileageBand);
  const r2 = await SFLOW.buildResult(senv, { carText: c.name, state: "Texas", how: "self", rush: null }).catch(e => ({ error: String(e && e.message) }));
  ok("Sell result: a plain ask after a typed one carries no mileage and the all mileages card (nothing left on the stored block)", !!(r2 && r2.car && !(decode(r2.car) && decode(r2.car).mileage)) && !(r2.marketAnswer && r2.marketAnswer.mileageBand && r2.marketAnswer.mileageBand.target), r2 && r2.car && r2.car.line); }
// THE CAR BAR'S ADDRESS CARRIES THE TYPED MILEAGE (lane-b-variants-merged): the words a tool is opened with from the car bar (carInfo(token).label, what the door writes into ?car= for Sell and ?q= for Find, Market Check and the Tasks box) hold the mileage,
// so Sell opened from the Sell pill reads the same car with the same mileage from its address, and does not lose it on a reload or a later call that sends words. For every form, on every tool that reads words.
{ const CB = await imp("lib/carBar.js"), SF = await imp("lib/sell/sellFacts.js"), SE = await imp("lib/live/search.js"); world();
  for (const [form, mi] of FORMS) { const car = carOfForm(form); if (!car) continue;
    const o = await mc(form), info = o && o.car && o.car.token ? CB.carInfo(o.car.token) : null, L = `car bar address, "${form}"`;
    ok(`${L}: the words the pills open a tool with ${mi == null ? "carry no mileage" : "end with the typed mileage (" + nf(mi) + " miles)"}`, !!info && (mi == null ? !/ miles$/.test(info.label) : info.label.endsWith(" " + nf(mi) + " miles")), info && info.label);
    if (!info) continue;
    const sc = await SF.resolveSellCar(info.label, {}), sv = sc && sc.car && sc.car.v, fv = (await SE.parseQueryResolved(info.label, {})).vehicle;
    ok(`${L}: Sell opened with those words reads the same car and the same mileage (no mileage to ask for again)`, !!sv && [sv.make, sv.model, sv.trim || null].join("|") === EXPECT[car.name] && (mi == null ? !(sv.mileage > 0) : sv.mileage === mi), sv && [sv.model, sv.mileage]);
    ok(`${L}: Find, Market Check and the Tasks box opened with those words read the same car and mileage`, !!fv && [fv.make, fv.model, fv.trim || null].join("|") === EXPECT[car.name] && (mi == null ? !(fv.mileage > 0) : fv.mileage === mi), fv && [fv.model, fv.mileage]);
  } }
// THE TASKS COMPOSER: the preview carries the car and, for a typed mileage, the engine's banded read
{ world(); for (const [form, mi] of FORMS) { const car = carOfForm(form); if (!car) continue; for (const [sp, text] of spellings(form)) {
  let o = null; try { o = await TK.emailPreview(env, text); } catch (e) { o = { error: String(e && e.message) }; }
  const L = `Tasks composer, ${sp}, "${form}"`; carChecks(L, o && o.car, form, car, mi);
  if (mi != null) ok(`${L}: the engine's banded read is on the preview (mileage_read for ${mi})`, !!(o && o.mileage_read && o.mileage_read.miles === mi && /\d/.test(o.mileage_read.band || o.mileage_read.line || "")), o && o.mileage_read);
  else ok(`${L}: no mileage typed: no mileage_read`, !(o && o.mileage_read), o && o.mileage_read); } } }
// THE DESK NEW CASE: the typed words make a sheet whose mileage is the typed one (sharp is only the Desk's image library: a stand-in is registered when it is not installed)
{ let sharpOk = true; try { await import("sharp"); } catch { sharpOk = false; }
  if (!sharpOk) register("data:text/javascript," + encodeURIComponent("export async function resolve(s, c, n) { if (s === 'sharp' || s === 'heic-convert') return { url: 'data:text/javascript,export default function sharp() { throw new Error(\"stand-in\") }', shortCircuit: true }; return n(s, c); }"));
  let RUN = null, STORE = null; try { RUN = await imp("lib/desk/intake/run.js"); STORE = await imp("lib/desk/intake/store.js"); } catch (e) { ok("the Desk intake loads", false, String(e && e.message)); }
  if (RUN && STORE) for (const [form, mi] of FORMS) { const car = carOfForm(form); if (!car) continue;
    for (const [sp, text] of spellings(form)) {
      const st = STORE.memoryStore({ orgs: [{ id: "hagerty", name: "Hagerty Marketplace", inbound_local: "hagerty" }], seats: [{ org_id: "hagerty", email: "ann@hagerty.example", role: "member", subject: "u1" }], settings: { hagerty: { sending_address: "m@hagerty.example", sending_name: "H", sending_domain: "hagerty.example", sending_domain_status: "verified", signature: "H" } } });
      const deps = { store: st, now: () => "2026-11-04T12:00:00.000Z", resolveVehicle: (t, o) => V.resolveVehicle(t, o || {}), decodeVin: async () => null, startRead: () => {} };
      const seat = st._state.seats.find(x => x.email === "ann@hagerty.example");
      let out = null; try { out = await RUN.createTypedSheet({ org: { id: "hagerty" }, seat, text, deps }); } catch (e) { out = { ok: false, reason: String(e && e.message) }; }
      const row = st._state.sheets[st._state.sheets.length - 1], L = `Desk new case, ${sp}, "${form}"`;
      ok(`${L}: a sheet was made for the stated car`, !!(out && out.ok && row && row.make && [row.make, row.model, row.trim || null].join("|") === EXPECT[car.name]), out && [out.ok, out.reason, row && [row.make, row.model, row.trim]]);
      ok(`${L}: the sheet's mileage is the typed mileage (${mi == null ? "none" : mi})`, mi == null ? !(row && Number(row.mileage) > 0) : !!row && Number(row.mileage) === mi, row && row.mileage); } } }
// BOTH SIDES OF THE MERGE AT ONCE (lane-b-variants-merged): a typed mileage AND a typed variant on one car, read by the real handler. "1987 Pontiac Firebird Trans Am 42,500 miles" is priced on Trans Am sales, the GTA is set aside, the range is narrowed to the mileage band,
// and the car token carries the Trans Am and the mileage. Drop the typed words or the typed mileage (typed-through) or the variant context (variants) from the engine and this goes red.
{ const FIRE = [{ make: "Pontiac", model: "Firebird", title: "Firebird Trans Am", year: 1987, price: 16000, n: 30, lowMiles: 30000, spanMiles: 30000 }, { make: "Pontiac", model: "Firebird", title: "Firebird Trans Am GTA", year: 1987, price: 24000, n: 14, lowMiles: 30000, spanMiles: 30000 }, { make: "Pontiac", model: "Firebird", title: "Firebird Formula", year: 1987, price: 13000, n: 12, lowMiles: 30000, spanMiles: 30000 }];
  // the page hands the handler the car the resolver read (car.vehicle: this fake archive has no taxonomy tables, so the resolver cannot read "Pontiac Firebird Trans Am" here; resolverMileageCheck pins what it reads in prod's tables)
  for (const [sp, text] of [["the car as the page sends it", "1987 Pontiac Firebird Trans Am 42,500 miles"]]) {
    const veh = { raw: text, year: 1987, make: "Pontiac", model: "Firebird", trim: "Trans AM", mileage: 42500, confidence: "high" };
    W.install(FIRE); const o = await mc(text, { car: { raw: text, vehicle: veh } }), plain = (W.install(FIRE), await mc("1987 Pontiac Firebird Trans Am", { car: { raw: "1987 Pontiac Firebird Trans Am", vehicle: { ...veh, raw: "1987 Pontiac Firebird Trans Am", mileage: null } } })), L = `Trans Am with 42,500 miles (${sp})`;
    const titlesOf = d => (d.rawPool || []).map(r => String(r.raw_title || r.title || "")), v = o.variants, gta = v && v.items && v.items.find(i => i.name === "GTA");
    ok(`${L}: an answer, a range`, o && o.tier === "result", o && [o.tier, o.error]);
    ok(`${L}: priced on Trans Am sales (the variants block says it was asked for and applied)`, !!v && v.applied === true && v.stated.join() === "Trans Am", v && [v.applied, v.stated, v.line]);
    ok(`${L}: no GTA sale is in the pool and the GTA is counted and set aside`, titlesOf(o).length > 0 && titlesOf(o).every(x => /trans am/i.test(x) && !/\bgta\b/i.test(x)) && !!gta && gta.count > 0 && gta.inPool === false, [titlesOf(o).slice(0, 3), gta]);
    ok(`${L}: narrowed to the mileage band (the box holds 42,500, the engine's band names it)`, o.queryMileage === 42500 && !!o.mileageBand && o.mileageBand.target === 42500 && o.rangeMileage && o.rangeMileage.miles === 42500, [o.queryMileage, o.mileageBand]);
    ok(`${L}: the sales in the pool are the Trans Am sales within the band (every one between 27,500 and 57,500 miles)`, (o.rawPool || []).length > 0 && (o.rawPool || []).every(r => { const m = Number(String(r.mileage || r.mi || "").replace(/[^\d]/g, "")); return !m || (m >= 27500 && m <= 57500); }), (o.rawPool || []).length);
    const d = decode(o.car);
    ok(`${L}: car.token carries the Trans Am and the mileage, car.line and car.short say so`, !!d && /trans/i.test(String(d.trim || d.variant || "")) && d.mileage === 42500 && /Trans/i.test(o.car.line) && o.car.line.includes("42,500 miles") && !!o.car.short, d && [d.trim, d.variant, d.mileage, o.car && o.car.line]);
    ok(`${L}: the same car without the mileage keeps the variant and has no band`, plain.variants && plain.variants.applied && plain.variants.stated.join() === "Trans Am" && !bandNames(plain) && !(decode(plain.car) && decode(plain.car).mileage), [plain.variants && plain.variants.stated, plain.mileageLine]);
  } }
// THE ENGINE'S OWN READERS OF THE TYPED WORDS (typedWordsOf at oneEngineAnswer and runOneBox): "62,110" is a mileage, not the 110 wheelbase. Land Rover Defender 90 and 110 are separate pools; a typed 110 narrows, the 110 inside a mileage does not.
{ W.install([{ make: "Land Rover", model: "Defender", title: "Defender 90", year: 1990, price: 40000, n: 20, body: "SUV" }, { make: "Land Rover", model: "Defender", title: "Defender 110", year: 1990, price: 60000, n: 20, body: "SUV" }]);
  const OBd = await imp("lib/onebox.js"), veh = { year: 1990, make: "Land Rover", model: "Defender" }, read = async t => (await OBd.oneEngineAnswer(veh, null, t, { ...env, asked: 2 }, null)).raw, kinds = d => [...new Set((d.rawPool || []).map(r => /110/.test(String(r.raw_title || r.title)) ? "110" : "90"))].sort().join();
  const plain = await read("1990 Land Rover Defender"), miles = await read("1990 Land Rover Defender 62,110 miles"), stated = await read("1990 Land Rover Defender 110");
  ok("a mileage that ends in 110 (62,110 miles) does not narrow a Defender to the 110: both wheelbases are read, as with no mileage", kinds(plain) === "110,90" && kinds(miles) === "110,90", [kinds(plain), kinds(miles)]);
  ok("a typed 110 still narrows to the 110", kinds(stated) === "110", kinds(stated)); }
// THE SERVED CAR: the one function every surface calls, and the one entry for the box's mileage
{ const OB = await imp("lib/onebox.js");
  ok("the engine reads typed words without their number phrases (typedWordsOf): the mileage is not a model word, a typed 110 stays", typeof OB.typedWordsOf === "function" && OB.typedWordsOf("1999 Porsche Boxster 45,911 miles") === "1999 Porsche Boxster" && OB.typedWordsOf("1990 Land Rover Defender 110 62,110 miles") === "1990 Land Rover Defender 110" && OB.typedWordsOf("1999 Porsche 911 Carrera") === "1999 Porsche 911 Carrera");
  ok("withTypedMileage exists and turns a typed mileage into the box's refine", typeof OB.withTypedMileage === "function" && (OB.withTypedMileage({ mileage: 38400 }, null) || {}).miTarget === 38400);
  ok("withTypedMileage leaves a box mileage alone and no mileage no refine", typeof OB.withTypedMileage === "function" && OB.withTypedMileage({ mileage: 38400 }, { miTarget: 60000 }).miTarget === 60000 && OB.withTypedMileage({ mileage: null }, null) === null);
  ok("withServedCar stamps the car it is given over a stored car", typeof OB.withServedCar === "function" && (() => { const a = OB.withServedCar({ car: { token: "old", line: "old", short: "old" }, tier: "result" }, { make: "Mercedes-Benz", model: "SL-Class", year: 2003, mileage: 38400 }, {}); return a.car.token !== "old" && /38,400 miles/.test(a.car.line); })()); }
{ const sd = fs.readFileSync(path.join(ROOT, "api/sellerDecision.js"), "utf8"); ok("the page prints the engine's own mileage line (d.mileageBand.line) and words no band sentence in code", /d\.mileageBand\.line/.test(fs.readFileSync(path.join(ROOT, "public/js/onebox.js"), "utf8")) && !/lint\([^)]*Too few sales near/.test(fs.readFileSync(path.join(ROOT, "public/js/onebox.js"), "utf8"))); ok("the handler stamps the served car on the one exit of the answer", /oneBox = withServedCar\(oneBox, vehicle,/.test(sd)); }
console.log = log; console.error = err;
if (fail) { log("typedThroughCheck: " + pass + " pass, " + fail + " FAIL"); for (const f of fails) log("FAIL " + f); process.exit(1); }
log("typedThroughCheck: " + pass + " pass, 0 FAIL");

function mutants() {
  const M = [
    ["the handler does not read a typed mileage as the box's", "if (vehicle && vehicle.make && !vinCtx) obRefine = withTypedMileage(vehicle, obRefine);", "", "api/sellerDecision.js"],
    ["the handler serves the stored row's own car", "oneBox = withServedCar(oneBox, vehicle, { supabaseUrl, supabaseKey });", "", "api/sellerDecision.js"],
    ["a stored car wins over the served car", "return { ...answer, car: Object.assign({}, answer.car && typeof answer.car === \"object\" ? answer.car : {}, { token: st.token, line: st.line, short: st.short }) };", "return { ...answer, car: Object.assign({ token: st.token, line: st.line, short: st.short }, answer.car && typeof answer.car === \"object\" ? answer.car : {}) };", "lib/onebox.js"],
    ["a typed mileage is never a refine", "  if (!(Number.isFinite(mi) && mi > 0)) return refine || null;", "  return refine || null;", "lib/onebox.js"],
    ["the typed mileage overrides the box's", "if (refine && (refine.miMin != null || refine.miMax != null || (refine.miTarget != null && Number(refine.miTarget) > 0))) return refine;", "", "lib/onebox.js"],
    ["Find's answer carries no car", "return res.status(200).json(withServedCar({", "return res.status(200).json(((x) => x)({", "api/buySearch.js"],
    ["Sell's range answer carries no car", "const head = withServedCar({ label: car.label, make: (car.v && car.v.make) || null, state, how, rush: rush || null }, car.v, env);\n  const block = await capped(\"block_read\"", "const head = { label: car.label, make: (car.v && car.v.make) || null, state, how, rush: rush || null };\n  const block = await capped(\"block_read\"", "lib/sell/sellFlow.js"],
    ["Sell's result carries no car", "return done({ label: car.label, car: head.car, carLine,", "return done({ label: car.label, carLine,", "lib/sell/sellFlow.js"],
    ["Sell's market card is not banded on a typed mileage", "  if (!withTypedMileage(car.vEngine || car.v, null)) return null;", "  return null;", "lib/sell/sellFlow.js"],
    ["Sell stores the banded answer as the plain car's row", "&& !env.noStore && !typedRefine && !timings.escalated", "&& !env.noStore && !timings.escalated", "lib/sell/sellBlock.js"],
    ["Sell's plain read keeps the typed mileage on the stored row", "const vE = typedRefine ? vE0 : (vE0 && vE0.mileage != null ? { ...vE0, mileage: null } : vE0);", "const vE = vE0;", "lib/sell/sellBlock.js"],
    ["Sell answers a typed mileage from the stored mileage-free row", "&& !typedRefine) { timings.answer = \"stored\"", ") { timings.answer = \"stored\"", "lib/sell/sellBlock.js"],
    ["the car bar's words drop the typed mileage", "const words = Number(car.mileage) > 0 ? `${label} ${nf(car.mileage)} miles` : label;", "const words = label;", "lib/carToken.js"],
    ["the Tasks composer carries no car", "let o = withServedCar(out, v, env);", "let o = out;", "lib/tasks/tasks.js"],
    ["the Tasks composer reads no banded mileage", "const refine = withTypedMileage(v, null);\n  if (refine && !out.error) {", "const refine = null;\n  if (refine && !out.error) {", "lib/tasks/tasks.js"],
    ["the merge drops the variant context", "const run = box => variantCtx.run(box, () => readScoped(() => runOneBoxCore(vehicle, generation, searchText, env, refine)));", "const run = box => readScoped(() => runOneBoxCore(vehicle, generation, searchText, env, refine));", "lib/onebox.js"],
    ["the merge drops the typed words at the engine's entries", "  searchText = typedWordsOf(searchText);\n", "", "lib/onebox.js", true],
    ["the Desk new case drops the typed mileage", "...(Number(v.mileage) > 0 ? { mileage: Math.round(Number(v.mileage)) } : {}) };", "};", "lib/desk/intake/run.js"],
    ["the engine reads number phrases as model words", "  try { const r = setAsideNumbers(t); return r && r.changed && typeof r.text === \"string\" ? r.text.replace(/\\s{2,}/g, \" \").trim() : searchText; } catch { return searchText; }", "  return searchText;", "lib/onebox.js"],
    ["the Desk sheet takes no mileage", ", ...(car && car.mileage > 0 ? { mileage: car.mileage, mileage_basis: \"miles\" } : {}) });", " });", "lib/desk/intake/run.js"]
  ];
  let bad = 0;
  for (const [name, from, to, file, all] of M) {
    const P = path.join(ROOT, file), orig = fs.readFileSync(P, "utf8");
    if (!orig.includes(from)) { console.log("MUTANT NOT APPLICABLE (source changed): " + name); bad++; continue; }
    let code = 0; try { fs.writeFileSync(P, all ? orig.split(from).join(to) : orig.replace(from, () => to)); const r = spawnSync("node", [fileURLToPath(import.meta.url), ROOT], { stdio: "pipe", timeout: 600000 }); code = r.status === 0 ? 0 : 1; } finally { fs.writeFileSync(P, orig); }
    console.log((code ? "killed   " : "SURVIVED ") + name); if (!code) bad++;
  }
  console.log(bad ? "typedThroughCheck mutants: " + bad + " not killed" : "all mutants killed"); return bad ? 1 : 0;
}
