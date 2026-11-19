// partialCarCheck (Lane D, Nov 17 2026, lane-d-car-bar-partial; order 2318): a PARTIAL car (a make, with whichever of year, year range and typed mileage were given, no model) travels through the car bar, through the REAL handlers.
// CAUSE this guards: the car bar and its token existed only when a search resolved to a MODEL (decodeCar and encodeCar refused a car without one), so "2009 BMW", "BMW" and "1960s Porsche" carried through no pill. Sam's rule: any search that names at least a make carries through all four pills.
// CLASS: every place that reads a car token (?car=) must take a PARTIAL token without error and WITHOUT inventing a model, and Market Check and Sell must serve the model choice instead of an answer. The class check lists every reader of a token in api/ and lib/
// (a reader added later fails the check until it is listed and tested) and every use of env.car, which must guard on a model; each listed reader is driven with a partial token below.
// THE CASES, through api/sellerDecision.js (Market Check), lib/sell/sellFlow.js (Sell), api/buySearch.js (Find), lib/tasks/tasks.js (Tasks), api/vehicleIdentity.js, lib/sheetRead.js, lib/sell/sellFacts.js:
//   make only, make and year, a decade, typed mileage with no model, a tampered token, a make and year with no sales, a full car unchanged (its token byte for byte what main made), the 12 cap, most sold first, the address of the tool that asked.
//   node scripts/partialCarCheck.mjs [repo root]      --mutants breaks one rule at a time (each must fail)
import zlib from "node:zlib"; import crypto from "node:crypto"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const args = process.argv.slice(2), here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(args.find(a => !a.startsWith("--")) || path.join(here, ".."));
if (args.includes("--mutants")) process.exit(mutants());
process.chdir(ROOT);
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const W = await import(pathToFileURL(path.join(here, "_typedThroughWorld.mjs")).href); W.setEnv();
let pass = 0, fail = 0; const fails = []; const ok = (n, c, d) => { if (c) pass++; else { fail++; if (fails.length < 80) fails.push(n + (d !== undefined ? " " + JSON.stringify(d).slice(0, 300) : "")); } };
const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
const section = async (name, fn) => { try { await fn(); } catch (e) { ok(name + " ran without throwing", false, String((e && e.stack) || e).slice(0, 300)); } };
let CT, CC, SD, BS, SFLOW, TK, VI, SR, SF, CB;
try { CT = await imp("lib/carToken.js"); CB = await imp("lib/carBar.js"); } catch (e) { err(e); }
try { CC = await imp("lib/carChoice.js"); } catch { CC = null; }
SD = (await imp("api/sellerDecision.js")).default; BS = (await imp("api/buySearch.js")).default; SFLOW = await imp("lib/sell/sellFlow.js"); TK = await imp("lib/tasks/tasks.js"); VI = (await imp("api/vehicleIdentity.js")).default; SR = await imp("lib/sheetRead.js"); SF = await imp("lib/sell/sellFacts.js");
const env = { supabaseUrl: "https://fake.supabase.test", supabaseKey: "k" };
// ---- the world: the typed-through archive plus BMWs (14 models, 2009, strictly descending sales), 1960s Porsches (and a 1975 one), an Audi that sold in another year only, and the SL500 as the full car ----
const BMW = ["M3", "X5", "128i", "135i", "M5", "M6", "Z4", "X3", "X1", "X6", "M2", "i8", "Z3", "X4"];   // 14 models with no collapsing family (the archive list says 3 Series for a 328i)
const CARS = [
  { name: "2003 Mercedes-Benz SL500", make: "Mercedes-Benz", model: "SL-Class", title: "SL500", year: 2003, price: 22000, n: 44, lowMiles: 15000, spanMiles: 60000 },
  ...BMW.map((m, i) => ({ name: "2009 BMW " + m, make: "BMW", model: m, title: m, year: 2009, price: 30000, n: 30 - i * 2, lowMiles: 20000, spanMiles: 60000, body: "Coupe" })),
  { name: "1962 Porsche 356", make: "Porsche", model: "356", title: "356", year: 1962, price: 90000, n: 10, lowMiles: 40000, spanMiles: 40000 },
  { name: "1967 Porsche 911", make: "Porsche", model: "911", title: "911", year: 1967, price: 110000, n: 8, lowMiles: 40000, spanMiles: 40000 },
  { name: "1975 Porsche 914", make: "Porsche", model: "914", title: "914", year: 1975, price: 20000, n: 5, lowMiles: 40000, spanMiles: 40000 },
  { name: "2015 Audi A4", make: "Audi", model: "A4", title: "A4", year: 2015, price: 20000, n: 6, lowMiles: 20000, spanMiles: 40000 }
];
const world = W.install(CARS, {}), baseFetch = globalThis.fetch;
// the archive's own model list (the bare make's chips): the model column of the rows that pass the make, year and date filters (the shared test world answers a bare model select with every model)
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)); if (u.pathname.endsWith("/sales_archive") && u.searchParams.get("select") === "model" && /^eq\./.test(u.searchParams.get("make") || "")) {
    const make = u.searchParams.get("make").slice(3), gte = Number((u.searchParams.get("year") || "").replace(/^gte\./, "")) || null, ps = [...u.searchParams.entries()].filter(([k]) => k === "year").map(([, v]) => v);
    let lo = null, hi = null; for (const v of ps) { const m = /^(gte|lte)\.(\d+)$/.exec(v); if (m) { if (m[1] === "gte") lo = Number(m[2]); else hi = Number(m[2]); } }
    const since = ((u.searchParams.getAll("sale_date").find(v => v.startsWith("gte.")) || "").slice(4)) || "0000";
    return new Response(JSON.stringify(world.rows.filter(r => r.make === make && (lo == null || r.year >= lo) && (hi == null || r.year <= hi) && String(r.sale_date) >= since).map(r => ({ model: r.model }))), { status: 200 });
  }
  if (u.pathname.endsWith("/taxonomy_makes")) return new Response(JSON.stringify(["BMW", "Porsche", "Audi", "Mercedes-Benz"].map(name => ({ name }))), { status: 200 });   // the make list the resolver reads (the shared world answers every other table with nothing)
  return baseFetch(url, init);
};
process.env.CURTAIN_CREW_CODE = process.env.CURTAIN_CREW_CODE || "fixture-crew-code"; globalThis.__mintCrew = (await imp("lib/_crew.js")).mintCrewCookieValue;
const call = W.caller(SD, { crew: true }), callBuy = W.caller(BS, { crew: true }), callVI = W.caller(VI, { crew: true });   // the partial car is crew only (PARTIAL_CAR_PUBLIC off): the cases below are the crew's; the visitor's are in their own block
const callV = W.caller(SD), callBuyV = W.caller(BS);
const mc = async (text, extra, query) => { try { return await call({ oneBox: true, search: text, ...(extra || {}) }, query); } catch (e) { return { error: String(e && e.message) }; } };
const dec = t => CT.decodeCar(t), fullOf = c => { const d = dec(c.token); return d && d.model ? [d.year || null, d.make, d.model, d.mileage || null] : null; };
const MKEYS = "address,label,token,words";
const tokenOf = o => CT.encodeCar(o);

// ===== 1 THE TOKEN: a partial car, the same v1 form and checksum =====
await section("token", async () => {
  const forms = [
    ["make only", { raw: "BMW", make: "BMW" }, { make: "BMW" }, "BMW"],
    ["make and year", { raw: "2009 BMW", year: 2009, make: "BMW", model: null, trim: null, yearRange: null }, { year: 2009, make: "BMW" }, "2009 BMW"],
    ["a decade", { raw: "1960s Porsche", year: null, yearRange: { start: 1960, end: 1969, tokens: ["1960s"] }, make: "Porsche", model: null }, { yearRange: { start: 1960, end: 1969 }, make: "Porsche" }, "1960s Porsche"],
    ["a year range", { year: null, yearRange: { start: 1960, end: 1965 }, make: "Porsche" }, { yearRange: { start: 1960, end: 1965 }, make: "Porsche" }, "1960 to 1965 Porsche"],
    ["typed mileage, no model", { raw: "BMW 38,400 miles", make: "BMW", mileage: 38400 }, { make: "BMW", mileage: 38400 }, "BMW 38,400 miles"],
    ["year and mileage, no model", { raw: "2009 BMW 38,400 miles", year: 2009, make: "BMW", mileage: 38400 }, { year: 2009, make: "BMW", mileage: 38400 }, "2009 BMW 38,400 miles"]
  ];
  for (const [n, input, want, words] of forms) {
    const t = tokenOf(input), d = t ? dec(t) : null;
    ok(`${n}: a token is made and is v1 with a checksum`, !!t && /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{8}$/.test(t), t);
    ok(`${n}: decodeCar gives the make and what was given, and NO model key`, !!d && d.make === want.make && !("model" in d) && (want.year == null || d.year === want.year) && (!want.yearRange || (d.yearRange.start === want.yearRange.start && d.yearRange.end === want.yearRange.end)) && (want.mileage == null || d.mileage === want.mileage), d);
    ok(`${n}: the words are "${words}"`, !!d && CT.carWords(d).label === words, d && CT.carWords(d));
    ok(`${n}: a tampered token decodes to null`, !!t && dec(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A")) === null && dec(t.replace(/\.[^.]*\./, m => m.slice(0, 3) + (m[3] === "A" ? "B" : "A") + m.slice(4))) === null);
    ok(`${n}: the partial car is recognised`, CT.isPartialCar(d) === true);
  }
  ok("no make, no token; a trim without a model is not a partial car", CT.encodeCar({ year: 2009 }) === null && CT.encodeCar({ make: "BMW", trim: "M3" }) === null && CT.encodeCar({ make: "BMW", model: "" }) !== null && !("model" in dec(CT.encodeCar({ make: "BMW", model: "" }))));
  // a crafted token with a good checksum: an empty or non-string model, an unknown key and a bad year are null; a missing model is a partial car
  const mk = o => { const payload = zlib.deflateRawSync(Buffer.from(JSON.stringify(o))).toString("base64url"); return `v1.${payload}.${crypto.createHash("sha256").update("v1." + payload).digest("base64url").slice(0, 8)}`; };
  ok("a crafted token: an empty model, a number for a model, no make, an unknown key and a text year all decode to null", [{ mk: "A", md: "" }, { mk: "A", md: 7 }, { md: "B" }, { mk: "A", zz: 1 }, { mk: "A", y: "2009" }].every(o => dec(mk(o)) === null), [{ mk: "A", md: "" }, { mk: "A", md: 7 }].map(o => dec(mk(o))));
  ok("a crafted token with a make and no model is a partial car", CT.isPartialCar(dec(mk({ mk: "A", y: 2009 }))) && !("model" in dec(mk({ mk: "A", y: 2009 }))));
  // an OLD full token still decodes to the same car, and a full car's token is byte for byte what main made
  const OLD1 = "v1.VYvBCoJAFAB_Reb8hEcWxDvm1U5-Qeorl1yDXREq-veoTh2HmXmSMDaqVXH01PvguTz4_CjaZqeKcMc-VohXjL8GIQ4YbVPW0ylnhOWLvzMGrNpvVYUOo77Nq6cldJMj9GeMMVxGXm8.ab7iJzAJ";
  const full1 = { raw: "2003 Mercedes-Benz SL500", year: 2003, make: "Mercedes-Benz", model: "SL-Class", trim: "SL500", mileage: 38400, bodyStyle: "Convertible", confidence: "high" };
  ok("an old full token decodes to the same car", JSON.stringify(dec(OLD1)) === JSON.stringify(full1) && CT.isPartialCar(dec(OLD1)) === false, dec(OLD1));
  ok("a full car's token is byte for byte the token main made", CT.encodeCar(full1) === OLD1);
  ok("a full car's words are unchanged (line, short, label)", (() => { const w = CT.carWords(dec(OLD1)); return w.line === "2003 Mercedes-Benz SL-Class SL500 · 38,400 miles" && w.short === "2003 SL500" && w.label === "2003 Mercedes-Benz SL-Class SL500 38,400 miles"; })(), CT.carWords(dec(OLD1)));
  const OLD2 = "v1.TYsxCoBADMC-cmTu0rFd_YBfEBUU7xSqDiL-XUQHt0CSk8BRM0v1Ems79MlUU9VE9NEgHPhjhTLhfA1C6XBMFWHD-Q2Bz3vOQhlfum4.DUHzLJsb";
  ok("a second old full token (null year range, null mileage) is byte for byte too", CT.encodeCar({ raw: "1999 Porsche 911 Carrera", year: 1999, make: "Porsche", model: "911", trim: "Carrera", yearRange: null, mileage: null }) === OLD2 && dec(OLD2).model === "911");
  ok("the car bar's door reads a partial token as its words", (() => { const i = CB.carInfo(tokenOf({ raw: "2009 BMW", year: 2009, make: "BMW" }), true); return !!i && i.label === "2009 BMW" && i.line === "2009 BMW" && i.short === "2009 BMW"; })());
});

// ===== 2 MARKET CHECK: the model choice instead of an answer =====
const choiceChecks = (L, o, want) => {
  const mcz = o && o.modelChoice;
  ok(`${L}: the engine serves a modelChoice (status one_box, tier model_choice)`, !!o && o.status === "one_box" && o.tier === "model_choice" && !!mcz, o && [o.status, o.tier, o.error, Object.keys(o).slice(0, 8)]);
  if (!mcz) return;
  ok(`${L}: one line in Sam's voice, third person: "${want.line}"`, mcz.line === want.line, mcz.line);
  ok(`${L}: ${want.models.length} choices, most sold first: ${want.models.slice(0, 4).join(", ")}...`, JSON.stringify(mcz.choices.map(c => c.label)) === JSON.stringify(want.models), mcz.choices.map(c => c.label));
  ok(`${L}: at most 12 choices, then a line saying to type the model`, mcz.choices.length <= 12 && mcz.typeLine === "Not here? Type the model." && mcz.box === true && mcz.empty === false, [mcz.choices.length, mcz.typeLine]);
  ok(`${L}: each choice has exactly label, token, words and address (no count, no range, no source count)`, mcz.choices.every(c => Object.keys(c).sort().join() === MKEYS), mcz.choices[0]);
  ok(`${L}: each choice's token is the FULL car: its model is the label, the make and years are kept`, mcz.choices.every(c => { const d = dec(c.token); return !!d && d.model && d.make === want.make && (want.year == null || d.year === want.year); }), mcz.choices.slice(0, 2).map(c => dec(c.token)));
  ok(`${L}: each choice's words and address (in ${want.tool === "sell" ? "Sell" : "Market Check"}) hold its own token`, mcz.choices.every(c => c.words === CT.carWords(dec(c.token)).label && c.address === `${want.tool === "sell" ? "/sell" : "/market-check"}?car=${encodeURIComponent(c.token)}`), mcz.choices[0]);
  if (want.mileage) ok(`${L}: the typed mileage ${want.mileage} rides on every choice's token and words`, mcz.choices.every(c => dec(c.token).mileage === want.mileage && c.words.includes("38,400 miles")), mcz.choices[0]);
  ok(`${L}: nothing that blends or ranges the make is in it (no price, range, count or number of sources)`, !/\$|range|sources|median|typical|sales/i.test(JSON.stringify(mcz)), JSON.stringify(mcz).slice(0, 200));
  ok(`${L}: the older prompt and modelOptions say the same list`, o.prompt === mcz.line && JSON.stringify(o.modelOptions) === JSON.stringify(mcz.choices.map(c => c.label)));
  ok(`${L}: the partial car on it is the car the words name`, !!mcz.partial && !!mcz.partial.token && CT.isPartialCar(dec(mcz.partial.token)) && mcz.partial.line === want.partialLine, mcz.partial);
};
const BMW_SOLD = BMW.slice(0, 12);   // 14 models sold in 2009, descending: the first 12
await section("market check", async () => {
  choiceChecks("Market Check, words '2009 BMW'", await mc("2009 BMW"), { line: "Which 2009 BMW?", models: BMW_SOLD, make: "BMW", year: 2009, tool: "mc", partialLine: "2009 BMW" });
  const tok = tokenOf({ raw: "2009 BMW", year: 2009, make: "BMW" });
  choiceChecks("Market Check, partial token as body.car", await call({ oneBox: true, car: tok }), { line: "Which 2009 BMW?", models: BMW_SOLD, make: "BMW", year: 2009, tool: "mc", partialLine: "2009 BMW" });
  choiceChecks("Market Check, partial token as ?car=", await call({ oneBox: true }, { car: tok }), { line: "Which 2009 BMW?", models: BMW_SOLD, make: "BMW", year: 2009, tool: "mc", partialLine: "2009 BMW" });
  const bare = await mc("BMW"); ok("make only: Which BMW? with up to 12 choices", bare.modelChoice && bare.modelChoice.line === "Which BMW?" && bare.modelChoice.choices.length === 12 && bare.modelChoice.choices.every(c => dec(c.token).make === "BMW" && dec(c.token).model), bare.modelChoice && bare.modelChoice.choices.length);
  choiceChecks("Market Check, a decade '1960s Porsche'", await mc("1960s Porsche"), { line: "Which 1960s Porsche?", models: ["356", "911"], make: "Porsche", year: null, tool: "mc", partialLine: "1960s Porsche" });
  const dtok = tokenOf({ year: null, yearRange: { start: 1960, end: 1969 }, make: "Porsche" });
  choiceChecks("Market Check, a decade as a token", await call({ oneBox: true, car: dtok }), { line: "Which 1960s Porsche?", models: ["356", "911"], make: "Porsche", year: null, tool: "mc", partialLine: "1960s Porsche" });
  ok("the 1975 Porsche is not in the 1960s list (the years narrow the list)", !(await mc("1960s Porsche")).modelChoice.choices.some(c => c.label === "914"));
  choiceChecks("Market Check, typed mileage with no model 'BMW 38,400 miles'", await mc("BMW 38,400 miles"), { line: "Which BMW?", models: BMW_SOLD, make: "BMW", year: null, tool: "mc", mileage: 38400, partialLine: "BMW · 38,400 miles".replace(" · ", " · ") });
  const mtok = tokenOf({ raw: "2009 BMW 38,400 miles", year: 2009, make: "BMW", mileage: 38400 });
  choiceChecks("Market Check, year and mileage token", await call({ oneBox: true, car: mtok }), { line: "Which 2009 BMW?", models: BMW_SOLD, make: "BMW", year: 2009, tool: "mc", mileage: 38400, partialLine: "2009 BMW · 38,400 miles" });
  // no sales for that make and year: one line, the box, nothing widened to the make's other years
  const none = await mc("2009 Audi"), nz = none.modelChoice;
  ok("2009 Audi (an Audi sold in 2015 only): the engine says so in one line and offers the box, no choices, nothing widened", !!nz && nz.empty === true && nz.choices.length === 0 && nz.line === "No 2009 Audi has sold. Type the model in the box." && nz.box === true && nz.typeLine === null && none.status === "one_box", nz);
  const nt = await call({ oneBox: true, car: tokenOf({ raw: "2009 Audi", year: 2009, make: "Audi" }) });
  ok("the same for the token", !!nt.modelChoice && nt.modelChoice.empty === true && nt.modelChoice.choices.length === 0, nt.modelChoice);
  // a tampered token is never a car: no modelChoice, no crash, no model invented
  const bad = tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A"), tm = await call({ oneBox: true, car: bad });
  ok("a tampered token: no modelChoice, no error 500, no car invented", !tm.modelChoice && !(tm.car && tm.car.token) && tm.status !== "ok", tm && [tm.status, tm.tier, tm.error]);
  // a full car is unchanged
  const full = await mc("2003 Mercedes-Benz SL500");
  ok("a full car: an answer as today, no modelChoice, car.token decodes to the full car", full.status === "one_box" && /^(result|thin)$/.test(String(full.tier)) && !full.modelChoice && !!fullOf(full.car) && full.car.line.startsWith("2003 Mercedes-Benz"), full && [full.status, full.tier, full.car]);
  const ft = await call({ oneBox: true, car: full.car.token });
  ok("a full car's token still serves the same answer (no modelChoice)", ft.status === "one_box" && !ft.modelChoice && ft.car && ft.car.token === full.car.token, ft && [ft.status, ft.tier]);
});

// ===== 3 SELL =====
await section("sell", async () => {
  const senv = { ...env, noStore: false, partialCar: true }, tok = tokenOf({ raw: "2009 BMW", year: 2009, make: "BMW" });
  for (const [L, carText, e] of [["words", "2009 BMW", senv], ["partial token as the car", tok, { ...senv, car: CT.decodeCar(tok) }]]) for (const step of ["buildRange", "buildResult"]) {
    const o = await SFLOW[step](e, { carText, state: "Texas", how: "self", rush: null }).catch(x => ({ error: "threw " + x.message }));
    choiceChecks(`Sell ${step}, ${L}`, { status: "one_box", tier: "model_choice", modelChoice: o.modelChoice, prompt: o.modelChoice && o.modelChoice.line, modelOptions: o.modelChoice && o.modelChoice.choices.map(c => c.label) }, { line: "Which 2009 BMW?", models: BMW_SOLD, make: "BMW", year: 2009, tool: "sell", partialLine: "2009 BMW" });
    ok(`Sell ${step}, ${L}: no range, no price and no pick (it is not an answer)`, !o.refusal && !o.question && !o.noRange && !o.places && !o.range && !o.card, Object.keys(o).slice(0, 10));
  }
  const empty = await SFLOW.buildRange(senv, { carText: "2009 Audi", state: "Texas", how: "self", rush: null });
  ok("Sell, 2009 Audi: the one line and the box, no choices", !!empty.modelChoice && empty.modelChoice.empty === true && empty.modelChoice.choices.length === 0, empty.modelChoice);
  const mi = await SFLOW.buildRange(senv, { carText: "BMW 38,400 miles", state: "Texas", how: "self", rush: null });
  ok("Sell, BMW 38,400 miles: the mileage rides on each choice's token", !!mi.modelChoice && mi.modelChoice.choices.length > 0 && mi.modelChoice.choices.every(c => dec(c.token).mileage === 38400), mi.modelChoice && mi.modelChoice.choices[0]);
  const fr = await SFLOW.buildRange(senv, { carText: "2003 Mercedes-Benz SL500", state: "Texas", how: "self", rush: null });
  ok("Sell, a full car: unchanged, no modelChoice, car.token is the full car", !fr.modelChoice && !!fr.car && !!fullOf(fr.car), fr && Object.keys(fr).slice(0, 8));
  const sc = await SF.resolveSellCar(tok, { ...senv, car: CT.decodeCar(tok) });
  ok("resolveSellCar: a partial token is read as its words, the car is null (no model), the partial comes back", sc.car === null && !!sc.partial && sc.partial.make === "BMW" && sc.partial.year === 2009 && !("model" in sc.partial), sc);
});

// ===== 4 FIND and TASKS: they accept a partial token as they accept the words =====
await section("find and tasks", async () => {
  const tok = tokenOf({ raw: "2009 BMW", year: 2009, make: "BMW" }), q = await callBuy({ q: "2009 BMW" }), t = await callBuy({}, { car: tok });
  ok("Find, words '2009 BMW': an answer that carries the partial car (car.token, car.line, car.short)", q.status === "ok" && !!q.car && !!q.car.token && q.car.line === "2009 BMW" && q.car.short === "2009 BMW" && CT.isPartialCar(dec(q.car.token)) && dec(q.car.token).year === 2009, q && [q.status, q.car]);
  ok("Find, the partial token alone (no words): the same search, the same answer and the same car", t.status === "ok" && t.total === q.total && t.car && t.car.token === q.car.token && JSON.stringify(t.understood) === JSON.stringify(q.understood), t && [t.status, t.total, q.total]);
  ok("Find: no model is invented (understood.model is null)", q.understood && q.understood.make === "BMW" && !q.understood.model, q.understood);
  const mk = await callBuy({ q: "BMW" }); ok("Find, make only: carries the partial car 'BMW'", mk.status === "ok" && mk.car && mk.car.line === "BMW" && CT.isPartialCar(dec(mk.car.token)), mk && mk.car);
  const dc = await callBuy({ q: "1960s Porsche" }); ok("Find, a decade: carries the partial car '1960s Porsche'", dc.status === "ok" && dc.car && dc.car.line === "1960s Porsche" && !!dec(dc.car.token).yearRange, dc && dc.car);
  const mi = await callBuy({ q: "BMW 38,400 miles" }); ok("Find, typed mileage with no model: the partial car holds the mileage", mi.status === "ok" && mi.car && dec(mi.car.token).mileage === 38400 && /38,400 miles/.test(mi.car.line) && CT.isPartialCar(dec(mi.car.token)), mi && mi.car);
  const bt = await callBuy({}, { car: tok.slice(0, -1) + (tok.endsWith("A") ? "B" : "A") });
  ok("Find, a tampered token and no words: today's answer (an error status), no car", !(bt.car && bt.car.token), bt && [bt.status]);
  const ff = await callBuy({ q: "2003 Mercedes-Benz SL500" }); ok("Find, a full car: unchanged, full token", ff.status === "ok" && !!ff.car && !!fullOf(ff.car), ff && ff.car);
  // Tasks: the composer's box is filled with the engine's words for the token; the preview takes the words
  ok("Tasks: the box is filled with the engine's words for a partial token", CB.carInfo(tok, true).label === "2009 BMW" && CB.carInfo(tokenOf({ year: null, yearRange: { start: 1960, end: 1969 }, make: "Porsche" }), true).label === "1960s Porsche");
  const tp = await CT.withPartialCar({ headers: { cookie: "gas_crew=" + globalThis.__mintCrew() } }, () => TK.emailPreview(env, "2009 BMW")).catch(e => ({ threw: String(e.message) }));
  ok("Tasks: the preview takes the words without throwing, stamps the partial car and invents no model", typeof tp === "object" && !!tp.car && !!tp.car.token && CT.isPartialCar(dec(tp.car.token)) && tp.car.line === "2009 BMW" && !("model" in dec(tp.car.token)), tp && [tp.error, tp.car]);
});

// ===== 5 THE OTHER READERS OF ?car= (the sweep): a partial token, no error, no model invented =====
await section("sweep", async () => {
  const tok = tokenOf({ raw: "2009 BMW", year: 2009, make: "BMW" }), part = CT.decodeCar(tok);
  const vi = await callVI({ car: tok }, { car: tok }).catch(e => ({ error: e.message }));
  ok("vehicleIdentity: a partial token is read as its words, not returned as a valid car, and no model is invented", !vi.error && vi.status !== "valid" && !(vi.vehicle && vi.vehicle.model), vi && [vi.status, vi.vehicle && vi.vehicle.model]);
  const viFull = await callVI({ car: CT.encodeCar({ raw: "2003 Mercedes-Benz SL500", year: 2003, make: "Mercedes-Benz", model: "SL-Class", trim: "SL500" }) }).catch(e => ({ error: e.message }));
  ok("vehicleIdentity: a full token still comes back valid with its car", viFull.status === "valid" && viFull.vehicle && viFull.vehicle.model === "SL-Class" && !!viFull.car.token, viFull && [viFull.status]);
  const sr = await SR.sheetRead(env, { car: tok, text: "" }, { resolveVehicle: async () => null }).catch(e => ({ error: e.message }));
  ok("the VIN and desk read (lib/sheetRead.js): a partial token gives no car and no model, and no error", sr === null || (sr && !sr.error && !(sr.vehicle && sr.vehicle.model === "typed")), sr && Object.keys(sr).slice(0, 5));
  const srTyped = await SR.sheetRead(env, { car: tok }, { resolveVehicle: async () => null }).catch(e => ({ error: e.message }));
  ok("the desk read with only a partial token: no read, no invented 'typed' model", srTyped === null, srTyped && Object.keys(srTyped).slice(0, 5));
  const sc = await SF.resolveSellCar("2009 BMW", { ...env, car: part });
  ok("Sell's chat resolver (resolveSellCar): a partial car is no car and names no model", sc.car === null && !!sc.partial && !sc.partial.model, sc);
  ok("the Tasks and Sell and Find handlers read ?car= into a per-request env copy (a partial token included)", ["api/tasks.js", "api/sellChat.js", "api/buySearch.js"].every(f => /car: carFromRequest\(req\)/.test(fs.readFileSync(f, "utf8"))));
  ok("the VIN page takes a partial car as the words, never as a car (lib/vinAsTyped.js reads deps.car only when it is a full car)", (() => { const s = fs.readFileSync("lib/vinAsTyped.js", "utf8"); return /deps && deps\.car \?/.test(s); })());
});

// ---- FOR SALE (lib/forsale/serve.js withForSaleLine reads the car token of the answer it is handed; Lane D, Nov 18 2026, Lane C's hold): a PARTIAL token, as the crew and as a visitor, gives no line, no counts, no link, no error, and invents no model ----
await section("forsale reader", async () => {
  const FS = await imp("lib/forsale/serve.js"), GATE = await imp("lib/forsale/gate.js");
  const ptok = tokenOf({ raw: "2009 BMW", year: 2009, make: "BMW" }), full = CT.encodeCar({ raw: "2003 Mercedes-Benz SL500", year: 2003, make: "Mercedes-Benz", model: "SL-Class", trim: "SL500" });
  const crewReq = { headers: { cookie: "gas_crew=" + globalThis.__mintCrew() } }, visitorReq = { headers: { cookie: "" } };
  const answerOf = t => ({ tier: "result", car: { token: t }, marker: 1 });
  for (const [who, req] of [["crew", crewReq], ["a visitor", visitorReq]]) {
    let out, thrown = null;
    try { out = await GATE.withForSale(req, () => FS.withForSaleLine(env, answerOf(ptok))); } catch (e) { thrown = e; }
    ok("withForSaleLine, a partial token as " + who + ": no error, the answer returned as it came, no line, no counts, no link, no model invented", !thrown && !!out && out.marker === 1 && out.forSaleLine === undefined && out.forSaleCounts === undefined && out.forSaleLink === undefined && !(out.car && out.car.model), thrown && String(thrown.message));
  }
  const visitorFull = await GATE.withForSale(visitorReq, () => FS.withForSaleLine(env, answerOf(full)));
  ok("withForSaleLine, a full token as a visitor: still nothing added (the switch is off for a visitor)", visitorFull.forSaleLine === undefined && visitorFull.forSaleCounts === undefined);
  ok("withForSaleLine guards on a model before it reads the car (a partial car is never handed on)", /if \(!w \|\| !car\.model\) return answer;/.test(fs.readFileSync("lib/forsale/serve.js", "utf8")) && /decodeCar\(answer\.car\.token\)/.test(fs.readFileSync("lib/forsale/serve.js", "utf8")));
});

// ---- THE BAR'S DOOR (lib/carBar.js prepareCarRequest and carFindRoute, the server side of a page opened with ?car=): a PARTIAL token opens the bar with the engine's words and Find's results already run, never stripped as a token that does not decode (Lane D, Nov 18 2026: the survivor "the bar's door opens no partial car" had no case that reached it) ----
await section("bar door", async () => {
  const tok = tokenOf({ raw: "2009 BMW", year: 2009, make: "BMW" }), crewC = "gas_crew=" + globalThis.__mintCrew();
  const who = [["crew", { cookie: crewC }]]; if (CB.CAR_BAR_PUBLIC) who.push(["a visitor", { cookie: "" }]);
  for (const [name, headers] of who) {
    const req = CB.prepareCarRequest({ url: "/find?car=" + encodeURIComponent(tok), query: { car: tok }, headers }, "find");
    ok("the bar's door, " + name + ": a partial token is read as a car for the bar (its words, its token), not stripped", !!req.__car && req.__car.line === "2009 BMW" && req.__car.token === tok && !req.__strip, [req.__car, req.__strip]);
    ok("the bar's door, " + name + ": the tool's own search words are the car's words (Find's q)", /[?&]q=2009(\+|%20)BMW/.test(String(req.url)), req.url);
    ok("Find's door, " + name + ": a request whose only query is a partial token opens the results already run (find-results)", CB.carFindRoute({ headers }, new URLSearchParams({ car: tok })) === "find-results", CB.carFindRoute({ headers }, new URLSearchParams({ car: tok })));
  }
  const bad = CB.prepareCarRequest({ url: "/find?car=v1.garbage.zzzzzzzz", query: { car: "v1.garbage.zzzzzzzz" }, headers: { cookie: crewC } }, "find");
  ok("a token that does not decode is still stripped, not opened", !bad.__car && bad.__strip === true, [bad.__car, bad.__strip]);
});

// ===== 6 THE CLASS: every reader of a token, every use of env.car =====
await section("class", async () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (["node_modules", ".git", "proofs", "scripts", "docs", "public"].includes(e.name) ? [] : walk(path.join(d, e.name))) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);
  const files = [...walk("api"), ...walk("lib")];
  const READERS = ["api/buySearch.js", "api/sellChat.js", "api/sellerDecision.js", "api/tasks.js", "api/vehicleIdentity.js", "lib/sheetRead.js", "lib/carBar.js", "lib/carToken.js", "lib/carChoice.js", "lib/vinAsTyped.js", "lib/forsale/serve.js"];
  const readers = files.filter(f => /\b(carFromRequest|decodeCar)\(/.test(fs.readFileSync(f, "utf8")) && f !== "lib/carToken.js");
  ok("every reader of a car token is one this check drives with a partial token (a new reader fails here until it is listed and tested)", readers.every(f => READERS.includes(f)), readers.filter(f => !READERS.includes(f)));
  const uses = [];
  for (const f of files) fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (/\benv\.car\b/.test(l) && !/^\s*(\/\/|\*)/.test(l) && !/car: carFromRequest\(req\)/.test(l) && !/\/\^v1\\\./.test(l) && !/\{ \.\.\.env0, car/.test(l.replace(/\/\/.*$/, ""))) uses.push(f + ":" + (i + 1) + " " + l.trim().slice(0, 140)); });
  const unguarded = uses.filter(u => !/env\.car\.model|isPartialCar\(env\.car\)|\.model\b/.test(u));
  ok("every use of env.car in api/ and lib/ guards on a model (or on isPartialCar): a partial car is never handed to an engine as a car", unguarded.length === 0, unguarded);
  ok("the model guards exist in Find (search.js) and in Sell's resolver", /env\.car\.make && env\.car\.model/.test(fs.readFileSync("lib/live/search.js", "utf8")) && /env\.car\.make && env\.car\.model/.test(fs.readFileSync("lib/sell/sellFacts.js", "utf8")));
});
// ---- THE PARTIAL CAR IS CREW ONLY (Lane C, Nov 17 2026, Sam's rule for this push): PARTIAL_CAR_PUBLIC is off. A visitor's answers for "2009 BMW" and "2009 Audi" carry no partial car and no modelChoice, a partial token in a visitor's request is read as no token, Sell's flow serves no choice; with the switch on, these fail.
await section("visitor", async () => {
  // THE PARTIAL CAR IS PUBLIC (Sam's word, Nov 17 2026): PARTIAL_CAR_PUBLIC is on. A visitor gets what the crew gets: the model choice on Market Check and Sell, the partial car in the answers (the bar), a partial token read as a car. What stays crew only is the variant rows.
  const partialIn = o => { let hit = false; const walk = (x, d) => { if (!x || typeof x !== "object" || d > 7 || hit) return; if (typeof x.token === "string" && /^v1\./.test(x.token)) { const c = CT.decodeCar(x.token); if (c && CT.isPartialCar(c)) hit = true; } for (const k in x) walk(x[k], d + 1); }; walk(o, 0); return hit; };
  ok("the switch is on in the code", CT.PARTIAL_CAR_PUBLIC === true && CB.PARTIAL_CAR_PUBLIC === true);
  for (const text of ["2009 BMW", "2009 Audi", "BMW", "1960s Porsche"]) {
    const v = await callV({ oneBox: true, search: text });
    ok("visitor, Market Check '" + text + "': the model choice and the partial car, as the crew has them", !!v && !!v.modelChoice && (/^Which /.test(String(v.modelChoice.line)) ? v.modelChoice.choices.length > 0 : v.modelChoice.empty === true) && partialIn(v), v && Object.keys(v).slice(0, 9));   // a make and year with nothing sold is the engine's one line and the box, no choices
    if (text === "2009 Audi") ok("visitor, Market Check '2009 Audi': the choice, not an A4 answer", !!v && !!v.resolvedCar && v.resolvedCar.model == null, v && v.resolvedCar);
    const f = await callBuyV({ q: text });
    ok("visitor, Find '" + text + "': the partial car in the answer (the bar)", partialIn(f), f && f.car);
    const crew = await call({ oneBox: true, search: text });
    ok("visitor, Market Check '" + text + "': the same choice the crew gets", !!crew && !!v && JSON.stringify(crew.modelChoice && crew.modelChoice.choices.map(c => c.label)) === JSON.stringify(v.modelChoice && v.modelChoice.choices.map(c => c.label)), [crew && crew.modelChoice && crew.modelChoice.choices.length, v && v.modelChoice && v.modelChoice.choices.length]);
  }
  const ptok = tokenOf({ raw: "2009 BMW", year: 2009, make: "BMW" });
  const vp = await callV({ oneBox: true, car: ptok });
  ok("visitor, a partial token in the request is read as the car (Market Check serves the choice)", !!vp && !!vp.modelChoice, [vp && vp.tier]);
  ok("visitor, carFromRequest reads a partial token as the car", !!CT.carFromRequest({ query: { car: ptok }, headers: { cookie: "" } }));
  const sv = await SFLOW.buildRange({ ...env, noStore: false, partialCar: CT.partialCarOk({ headers: { cookie: "" } }) }, { carText: "2009 BMW", state: "Texas", how: "self", rush: null });
  ok("visitor, Sell '2009 BMW': the model choice", !!sv.modelChoice && sv.modelChoice.choices.length > 0, sv && Object.keys(sv));
  ok("visitor, the bar's door opens a partial car", !!CB.carInfo(ptok, CT.partialCarOk({ headers: { cookie: "" } })));
  { const MC = await imp("lib/modelChoicePage.js"), VRp = await imp("lib/variantRowsPage.js"), page = '<!doctype html><html><head><meta charset="utf-8"></head><body><header>h</header></body></html>', req = { headers: { host: "goasksam.com", cookie: "" }, url: "/market-check" };
    ok("visitor: the model choice module and (the split is public) the variant rows module are on the page", /id="gmc-mod"/.test(MC.modelChoiceFinish(page, req, "mc")) && /id="vrs-mod"/.test(VRp.variantRowsFinish(page, req, "mc"))); }
});
console.log = log; console.error = err;
log(fails.slice(0, 80).map(f => "FAIL " + f).join("\n") + (fails.length ? "\n" : "") + `partialCarCheck: ${pass} pass, ${fail} FAIL`);
process.exit(fail ? 1 : 0);

function mutants() {
  const sub = (file, from, to, want) => ({ file, from, to, want });
  const M = [
    sub("lib/carToken.js", "if (car.model !== undefined && (typeof car.model !== \"string\" || !car.model)) return null;", "if (typeof car.model !== \"string\" || !car.model) return null;", "decodeCar refuses a car with no model again"),
    sub("lib/carToken.js", "if (typeof out.mk !== \"string\" || !out.mk || (out.md !== undefined && (typeof out.md !== \"string\" || !out.md))) return null;", "if (typeof out.mk !== \"string\" || !out.mk || typeof out.md !== \"string\" || !out.md) return null;", "encodeCar refuses a car with no model again"),
    sub("lib/carToken.js", "if (!f || !valid(f[2], v)) return null; car[f[0]] = v;", "if (!f) return null; car[f[0]] = v;", "a field of the wrong type decodes"),
    sub("lib/carToken.js", "parts[2] !== sum(parts[1])", "false", "a tampered token decodes"),
    sub("lib/carToken.js", "return r.start % 10 === 0 && r.end === r.start + 9 ? `${r.start}s`", "return false ? `${r.start}s`", "a decade is not said as 1960s"),
    sub("lib/onebox.js", "const part = partialCarActive() ? partialOf(vehicle) : null;", "const part = null;", "Find's answer carries no partial car (withServedCar ignores a make with no model)"),
    sub("lib/carToken.js", "export const PARTIAL_CAR_PUBLIC = true;", "export const PARTIAL_CAR_PUBLIC = false;", "the partial car crew only again (the switch off)"),
    sub("lib/modelChoicePage.js", "|| !partialCarOk(req) || s.indexOf('id=\"gmc-mod\"') >= 0", "|| s.indexOf('id=\"gmc-mod\"') >= 0 || true", "the model choice module not on a visitor's page"),
    sub("lib/carBar.js", "const crewOnly = req => partialCarOk(req);", "const crewOnly = req => false;", "the bar's door opens no partial car"),
    sub("lib/carToken.js", "return c && isPartialCar(c) && !partialCarOk(req) ? null : c;", "return c && isPartialCar(c) ? null : c;", "a partial token in a request is no car"),
    sub("api/sellerDecision.js", "const mch = partialCarOk(req) ? await partialChoiceAnswer(", "const mch = false ? await partialChoiceAnswer(", "Market Check serves no choice"),
    sub("lib/sell/sellFlow.js", "if (!sc.car && sc.partial && env && env.partialCar === true) return done(choiceReply(", "if (false) return done(choiceReply(", "Sell serves no choice"),
    sub("lib/onebox.js", "const part = partialCarActive() ? partialOf(vehicle) : null;", "const part = null;", "Find's answer carries no partial car"),
    sub("lib/carChoice.js", "catch { top = []; }", "catch { top = []; } if (!top.length) top = await deps.topModels(env, partial.make, CHOICE_MAX, null);", "a make and year with no sales is widened to the make's whole list"),
    sub("lib/carChoice.js", ".slice(0, CHOICE_MAX);\n  const years", ".reverse().slice(0, CHOICE_MAX);\n  const years", "the models are not most sold first"),
    sub("lib/carChoice.js", "export const CHOICE_MAX = 12;", "export const CHOICE_MAX = 30;", "more than 12 choices"),
    sub("lib/carChoice.js", "if (partial.mileage && !(Number(car.mileage) > 0)) car.mileage = partial.mileage;", "", "the typed mileage is lost on the choices"),
    sub("lib/carChoice.js", "return { label: model, token, words: w.label, address: addressOf(tool, token) };", "return { label: model, token, words: w.label, address: addressOf(tool, token), n: 3 };", "a count is in a choice"),
    sub("lib/carChoice.js", "`${PATH[tool] || PATH.mc}?car=", "`${PATH.mc}?car=", "Sell's choices carry Market Check's address"),
    sub("lib/carChoice.js", "typeLine: TYPE_LINE,", "typeLine: null,", "no line saying to type the model"),
    sub("api/sellerDecision.js", "if (mch) return res.status(200).json(choiceReply({ status: \"one_box\", ...(mc ||", "if (false) return res.status(200).json(choiceReply({ status: \"one_box\", ...(mc ||", "Market Check serves no modelChoice"),
    sub("api/sellerDecision.js", "const rawSearch0 = (tokenCar && isPartialCar(tokenCar) && carWords(tokenCar).label) ||", "const rawSearch0 =", "Market Check does not read a partial token as its words"),
    sub("lib/sell/sellFacts.js", "if (env && isPartialCar(env.car) && /^v1\\./.test(String(text || \"\"))) text = carWords(env.car).label;", "", "Sell does not read a partial token as its words"),
    sub("api/buySearch.js", "String(b.q || (isPartialCar(env.car) ? carWords(env.car).label : \"\"))", "String(b.q || \"\")", "Find does not run the partial token's words"),
    sub("api/vehicleIdentity.js", "if (tokenCar && !isPartialCar(tokenCar)) {", "if (tokenCar) {", "vehicleIdentity returns a partial token as a valid car"),
    sub("lib/sheetRead.js", "(c => (c && c.model ? c : null))(decodeCar(input.car))", "decodeCar(input.car)", "the desk read takes a partial token as a car and invents a model"),
    sub("lib/live/search.js", "(aside.changed ? aside.text : String(text || \"\"))", "String(text || \"\")", "Find names the typed mileage as the model (BMW 38,400 miles gave the model 38 400)"),
    sub("lib/live/search.js", "if (env && env.car && env.car.make && env.car.model) { const pq = parseQuery(raw);", "if (env && env.car && env.car.make) { const pq = parseQuery(raw);", "Find hands a partial car to the engine as a car (no model guard)"),
    sub("lib/forsale/serve.js", "if (!w || !car.model) return answer;", "if (!w) return answer;", "the for sale line reads a partial token as a car (no model guard)")
  ];
  let survivors = 0;
  for (const m of M) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pcc-"));
    spawnSync("rsync", ["-a", "--exclude", ".git", "--exclude", "node_modules", "--exclude", "proofs", ROOT + "/", dir + "/"]); fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"));
    const fp = path.join(dir, m.file), src = fs.readFileSync(fp, "utf8"), out = src.replace(m.from, () => m.to);
    if (out === src) { console.log(`MUTANT NOT APPLIED  ${m.want}`); survivors++; fs.rmSync(dir, { recursive: true, force: true }); continue; }
    fs.writeFileSync(fp, out);
    const r = spawnSync(process.execPath, [path.join(dir, "scripts/partialCarCheck.mjs"), dir], { encoding: "utf8", timeout: 600000 }), killed = r.status !== 0;
    console.log(`${killed ? "killed  " : "SURVIVED"}  ${m.want}`); if (!killed) survivors++;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(survivors ? `\n${survivors} mutant(s) survived` : "\nall mutants killed"); return survivors ? 1 : 0;
}
