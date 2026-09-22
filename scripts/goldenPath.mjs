// GOLDEN PATH v1 - drives the DEPLOYED production page (goasksam.com) end to end
// via the real UI (crew cookie lifts the curtain). Real API, real DB, real OCD.
// RANGE env selects scenarios: empty = the full suite (resolver checks + all 20 UI
// scenarios); RANGE=resolver = B8/B9 resolver assertions only (no browser); RANGE=1-7
// = those UI scenarios only. Writes scripts/gp-out/<n>.json + png for UI runs.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { resolveVehicle } from "../lib/vehicle.js";
import { buildLadder } from "../api/sellerDecision.js";
import { buildHouseComparison, nextSaleForHouse, eventFromRecord } from "../lib/houseCalendar.js";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "https://goasksam.com";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = "scripts/gp-out"; fs.mkdirSync(OUT, { recursive: true });

// preference chip text
const PREF = { myself: "I'll sell it myself", handle: "I'd like someone to handle everything", notsure: "I'm not sure yet" };

// veh, trim (answer to a trim clarification, "" = Not sure), body (Boxster/Cayman for 718),
// state, price, timing (ASAP|No rush|"" none), pref (myself|handle|notsure|"")
const ALL = {
 1:  { veh:"2019 BMW M3", trim:"Not sure", state:"California", price:"55000", timing:"No rush", pref:"myself" },
 2:  { veh:"2016 Porsche 911", trim:"Carrera", state:"California", price:"60000", timing:"No rush", pref:"handle" },
 3:  { veh:"2015 Porsche Cayman", trim:"Not sure", state:"Texas", price:"32000", timing:"No rush", pref:"notsure" },
 4:  { veh:"1987 Ferrari Testarossa", trim:"Not sure", state:"Texas", price:"144000", timing:"No rush", pref:"notsure" },
 5:  { veh:"2022 BMW M3", trim:"Not sure", state:"New Jersey", price:"95000", timing:"ASAP", pref:"myself" },
 6:  { veh:"1987 Ferrari Testarossa", trim:"Not sure", state:"Texas", price:"144000", timing:"ASAP", pref:"myself" },
 "7a":{ veh:"2019 BMW M3", trim:"Not sure", state:"California", price:"55000", timing:"No rush", pref:"myself" },
 "7b":{ veh:"2019 BMW M3", trim:"Not sure", state:"California", price:"55000", timing:"skip", pref:"myself" },
 8:  { veh:"2022 Porsche 718 GTS", trim:"Not sure", body:"Boxster", state:"California", price:"90000", timing:"No rush", pref:"myself" },
 "9a":{ veh:"2022 Porsche 718 Spyder", trim:"Not sure", state:"California", price:"120000", timing:"No rush", pref:"myself" },
 "9b":{ veh:"2022 Porsche 718 GT4", trim:"Not sure", state:"California", price:"120000", timing:"No rush", pref:"myself" },
 10: { veh:"2019 BMW M3", trim:"Not sure", state:"London", price:"55000", timing:"No rush", pref:"myself", expect:"nonus" },
 11: { veh:"1993 Mercedes-Benz 500 E", trim:"Not sure", state:"California", price:"60000", timing:"No rush", pref:"myself" },
 12: { veh:"1993 Mercedes-Benz 300 CE", trim:"Not sure", state:"Montana", price:"133000", timing:"No rush", pref:"notsure" },
 13: { veh:"1925 Duesenberg", trim:"Not sure", state:"California", price:"500000", timing:"No rush", pref:"notsure" },
 14: { veh:"1990 Porsche 911 Carrera", trim:"Carrera", state:"New York", price:"90000", timing:"No rush", pref:"handle" },
 15: { veh:"2018 Porsche 911 GT3", trim:"GT3", state:"California", price:"180000", timing:"No rush", pref:"handle" },
 16: { veh:"1972 Volkswagen Bus", trim:"Not sure", state:"Massachusetts", price:"60000", timing:"No rush", pref:"handle" },
 17: { veh:"2018 BMW M3", trim:"Not sure", state:"Florida", price:"60000", timing:"No rush", pref:"handle" },
 18: { veh:"2021 Toyota Camry", trim:"Not sure", state:"Texas", price:"24000", timing:"No rush", pref:"myself", expect:"oos" },
 19: { veh:"2018 Mercedes-Benz E-Class", trim:"Skip", state:"California", price:"45000", timing:"No rush", pref:"myself" },
 20: { veh:"2017 Honda Accord", trim:"Not sure", state:"California", price:"18000", timing:"No rush", pref:"myself" },
};

function pickRange() {
  const r = process.env.RANGE || "";
  const keys = Object.keys(ALL);
  if (!r) return keys;
  const base = k => parseInt(String(k), 10); // "7a" -> 7
  const out = [];
  for (const part of r.split(",")) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i=+m[1]; i<=+m[2]; i++) keys.filter(k=>base(k)===i).forEach(k=>out.push(k)); }
    else keys.filter(k=>base(k)===+part).forEach(k=>out.push(k));
  }
  return [...new Set(out)];
}

async function drive(page, scn) {
  await page.goto(BASE + "/?_=" + Date.now(), { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("#inp", { timeout: 30000 });
  await sleep(600);
  const lastSam = () => page.evaluate(() => { const r=[...document.querySelectorAll('.row.sam,.msg.sam,.sam')]; const e=r[r.length-1]; return e?e.textContent.replace(/\s+/g," ").trim():""; });
  const allSam  = () => page.evaluate(() => [...document.querySelectorAll('.row.sam,.msg.sam,.sam')].map(e=>e.textContent.replace(/\s+/g," ").trim()));
  const chipsNow= () => page.evaluate(() => [...document.querySelectorAll('.chip')].map(c=>c.textContent.trim()));
  const endState= () => page.evaluate(() => {
    const has = s => !!document.querySelector(s);
    const txt = document.getElementById("msgs")?.textContent || document.body.textContent || "";
    const card = has('.pcard-tic')||has('.psv2-tic')||has('.pcard-platform')||has('.pcard-lead')||has('.psv2-card')||has('.regional-card')||has('.sell-rec-card');
    const oos = /isn't really my patch|CarMax/i.test(txt);
    const nonus = /US sales data, with the UK and Europe/i.test(txt);
    const gate = /free account|That's your .* for today|search for today|midnight ET|searches? a day/i.test(txt);
    return { done: card||oos||nonus||gate, card, oos, nonus, gate, hasDecision: !!(window.sellState&&window.sellState.sellDecision) };
  });
  async function type(t){ await page.evaluate(x=>{document.getElementById("inp").value=x;}, String(t)); await page.click("#btn"); }
  async function clickChip(label){ return page.evaluate(l=>{ const cs=[...document.querySelectorAll('.chip')]; const norm=s=>s.toLowerCase().replace(/\s+/g," ").trim(); let m=cs.filter(c=>norm(c.textContent)===norm(l)); if(!m.length) m=cs.filter(c=>norm(c.textContent).includes(norm(l))); if(m.length){m[m.length-1].click();return true;} return false; }, label); }

  const steps = [];
  await type(scn.veh);
  await sleep(2600);

  for (let i=0; i<18; i++) {
    let es = await endState();
    if (es.done) break;
    const s = (await lastSam()).toLowerCase();
    const chips = await chipsNow();
    let action = "";
    const clickOrType = async (v) => { if (!(await clickChip(v))) await type(v); action = "answer:"+v; };

    if (/did you mean|is that the (one|car)|is that right|double-check the badge|closest .* is/i.test(s)) {
      if (!(await clickChip("Yes"))) { if(!(await clickChip("keep"))) { const nc=chips.find(c=>!/change car|no\b/i.test(c)); await clickOrType(nc||"Yes"); action="confirm"; } else action="keep-as-typed"; } else action="confirm-yes";
    } else if (/is it the boxster or the cayman/i.test(s)) {
      action = "BODY_FOLLOWUP"; steps.push({ i, sam:s.slice(0,120), chips, action });
      await clickOrType(scn.body || "Not sure"); await sleep(2600); continue;
    } else if (/which model is the|which .*model or trim.*duesenberg|which duesenberg/i.test(s)) {
      action = "MODEL_CLARIFY:"+JSON.stringify(chips);
      if (!(await clickChip("Not sure"))) await type("not sure");
    } else if (/which (911|m3|camaro|mustang|corvette|chevelle|trim).* is it|any specific trim|package or edition|which trim|carrera, /i.test(s)) {
      const t = scn.trim || "Not sure";
      if (!(await clickChip(t))) { if(!(await clickChip("Skip"))) await type(/skip/i.test(t)?"skip":t); }
      action = "trim:"+t;
    } else if (/are you in a rush to list it/i.test(s)) {
      if (scn.timing==="skip") { await type("skip"); action="timing:skip-typed"; }
      else { await clickOrType(scn.timing||"No rush"); action="timing:"+(scn.timing||"No rush"); }
    } else if (/how would you like to sell it|how do you want to handle|run it yourself/i.test(s)) {
      await clickOrType(PREF[scn.pref]||PREF.myself); action="pref:"+scn.pref;
    } else if (/how quickly are you looking to sell/i.test(s)) {
      await clickOrType("No rush, right result only"); action="quick:norush";
    } else if (/which state|which country|city or region|two-letter code|which state is the car/i.test(s)) {
      if (!(await clickChip(scn.state))) await type(scn.state); action="state:"+scn.state;
    } else if (/roughly what are you hoping to get/i.test(s)) {
      await type(scn.price); action="price:"+scn.price;
    } else if (/mileage|stock or modified|service records|title|condition/i.test(s)) {
      const c=chips[0]; if(c) await clickChip(c); else await type("skip"); action="aux-skip";
    } else {
      await type("skip"); action="fallback-skip";
    }
    steps.push({ i, sam:s.slice(0,120), chips, action });
    await sleep(2600);
  }

  // wait for final result to render (real OCD fetch can take a while)
  for (let w=0; w<20; w++) { const es=await endState(); if (es.card||es.oos||es.nonus||es.gate) break; await sleep(2000); }
  const es = await endState();
  const finalText = (await allSam()).join("\n---\n");
  const msgsText = await page.evaluate(()=>document.getElementById("msgs")?.innerText||"");
  const cardHtml = await page.evaluate(()=>{ const el=document.querySelector('#msgs'); return el?el.innerHTML.slice(-6000):""; });
  return { steps, es, finalText, msgsText, cardHtml };
}

// ---- RESOLVER CHECKS (Set-2 B8/B9): pass/fail assertions against the real
// resolver, fetch-based (no UI). Folded into this one suite so there is a single
// standing check. B8: a misspelled MAKE (curated or not) CONFIRMS "Did you mean the
// X?" (rule 6) while abbreviations + concatenated multi-word makes resolve silently;
// B9: a pasted VIN decodes via vPIC. The API remaps needs_confirmation ->
// needs_clarification, so a confirmation is asserted on its question. ----
async function resolverChecks() {
  let fails = 0;
  const check = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + String(detail).slice(0, 120)}`); if (!ok) fails++; };
  const rx = m => new RegExp(m.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i");
  const resolve = async text => { try { const r = await fetch(`${BASE}/api/vehicleIdentity`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: "gas_crew=ok" }, body: JSON.stringify({ text }) }); return await r.json(); } catch (e) { return { status: `(fetch ${e.message})` }; } };
  console.log(`\n### Resolver checks (B8 make-typo confirmation + B9 VIN decode)`);
  // Misspelled + concatenated-multi-word makes (a missing space reads as a near-miss)
  // CONFIRM "Did you mean the X?" - curated or edit-distance, never silent (rule 6).
  for (const [text, make] of [["2006 porsch", "Porsche"], ["Poesche 911", "Porsche"], ["2015 chevorlet", "Chevrolet"], ["2012 mercedez", "Mercedes-Benz"], ["2018 ferarri", "Ferrari"], ["2010 nisan", "Nissan"], ["2010 volkswagon", "Volkswagen"], ["2010 landrover", "Land Rover"], ["mercedesbenz", "Mercedes-Benz"]]) {
    const j = await resolve(text); const q = String(j.clarification?.question || "");
    check(`B8 typo "${text}" -> CONFIRM ${make}`, /did you mean/i.test(q) && rx(make).test(q + " " + (j.clarification?.suggestion || "")) && j.status !== "valid", `q="${q}" status=${j.status}`);
  }
  // Real abbreviations/nicknames expand silently (rule 6).
  for (const [text, make] of [["2015 chevy", "Chevrolet"], ["2012 merc", "Mercedes-Benz"], ["2018 vw", "Volkswagen"], ["bimmer", "BMW"]]) {
    const j = await resolve(text); check(`B8 silent "${text}" -> ${make}`, j.vehicle?.make === make && !/did you mean/i.test(String(j.clarification?.question || "")), `make=${j.vehicle?.make} q="${j.clarification?.question || ""}"`);
  }
  for (const [vin, make, model] of [["WP0AB2A99KS123456", "Porsche", "911"], ["1G1YY22G965105633", "Chevrolet", "Corvette"]]) {
    const j = await resolve(vin); const v = j.vehicle || {}; check(`B9 VIN ${vin} -> ${make} ${model}`, v.make === make && rx(model).test(String(v.model || "")), `status=${j.status} make=${v.make} model=${v.model}`);
  }
  // B10: the reader's live "928 S4" session (Sep 2026 defect report). Locks the four
  // resolver-level fixes so this exact session can never regress:
  //  - trim retention on typed input: "928 s4" keeps S4 (was dropped to bare 928)
  //  - two-digit year is century-sensible: "88" -> 1988, NEVER 2088
  //  - no make drift: an S4 on an established Porsche stays Porsche (never Audi S4)
  //  - the recovered final input resolves clean
  // B10 runs the resolver DIRECTLY (imported), not over the network like B8/B9,
  // so it stays a green gate even when the production WAF challenges node fetch.
  console.log(`\n### B10 reader "928 S4" session (trim retention + two-digit year + no make drift)`);
  {
    let j = await resolveVehicle("928 s4"); let v = j.vehicle || {};
    check(`B10 "928 s4" -> Porsche 928 S4 (trim kept)`, v.make === "Porsche" && rx("928").test(String(v.model || "")) && rx("S4").test(String(v.trim || "")), `make=${v.make} model=${v.model} trim=${v.trim}`);
    j = await resolveVehicle("88 928 S4"); v = j.vehicle || {};
    check(`B10 "88 928 S4" -> 1988 (not 2088), trim S4`, v.year === 1988 && v.make === "Porsche" && rx("928").test(String(v.model || "")) && rx("S4").test(String(v.trim || "")), `year=${v.year} make=${v.make} model=${v.model} trim=${v.trim}`);
    j = await resolveVehicle("an 88 928 S4"); v = j.vehicle || {};
    check(`B10 "an 88 928 S4" -> valid 1988 Porsche 928 S4`, j.status === "valid" && v.year === 1988 && v.make === "Porsche" && rx("S4").test(String(v.trim || "")), `status=${j.status} year=${v.year} make=${v.make} trim=${v.trim}`);
    j = await resolveVehicle("Porsche 928 S4"); v = j.vehicle || {};
    check(`B10 "Porsche 928 S4" -> stays Porsche (no Audi drift)`, v.make === "Porsche" && rx("928").test(String(v.model || "")), `make=${v.make} model=${v.model}`);
  }
  // B11: the reader's "1951 Aston Martin DB2" session (Sep 2026). A real, exact model
  // must never be "corrected" to a sibling. Two fixes locked here:
  //  - enum-split: OCD filed DB2 inside "DB2, DB2/4, and DB Mark III"; split so DB2
  //    (and DB2/4) exact-match instead of falling to the fuzzy/designation matcher.
  //  - numbered-series guard: an uncataloged series member (DB3) is accepted as-is,
  //    never mangled into a present sibling (DB9), since every DBn sits 1 edit apart.
  console.log(`\n### B11 "Aston Martin DB2/DB3" (enum-split model + numbered-series no-miscorrect)`);
  {
    let j = await resolveVehicle("1951 aston martin db2"); let v = j.vehicle || {};
    check(`B11 "1951 aston martin db2" -> valid DB2, no "did you mean DB9"`, j.status === "valid" && v.make === "Aston Martin" && rx("DB2").test(String(v.model || "")) && !/did you mean/i.test(String(j.clarification?.question || "")), `status=${j.status} model=${v.model} q="${j.clarification?.question || ""}"`);
    j = await resolveVehicle("1953 aston martin db2/4"); v = j.vehicle || {};
    check(`B11 "db2/4" -> valid DB2/4`, j.status === "valid" && rx("DB2").test(String(v.model || "")), `status=${j.status} model=${v.model}`);
    j = await resolveVehicle("1951 aston martin db3"); v = j.vehicle || {};
    check(`B11 "db3" (uncataloged) -> DB3 as-is, not DB9`, rx("DB3").test(String(v.model || "")) && !/db9/i.test(String(j.clarification?.suggestion || "")), `model=${v.model} suggest=${j.clarification?.suggestion || ""}`);
    j = await resolveVehicle("2015 porsche caymen"); v = j.vehicle || {};
    check(`B11 genuine word typo still confirms (Caymen -> Cayman)`, /did you mean/i.test(String(j.clarification?.question || "")) && /cayman/i.test(String(j.clarification?.suggestion || "")), `q="${j.clarification?.question || ""}"`);
  }
  // B12: reader Pat's "2006 Mercedes-Benz CLK DTM" session (Sep 2026). Three locked fixes:
  //  - CLK/CL/CLS/SLK/ML/SLR are recognized Mercedes models (were silently dropped to a re-ask).
  //  - "CLK DTM" (the rare house-sold car) resolves to the FULL nameplate MODEL, so the evidence
  //    ladder keeps the pool scoped to the DTM instead of widening to mainstream CLK.
  //  - a typed-but-unmatched model is accepted UNVERIFIED (broader make-level read), never a
  //    "which model?" re-ask for what the seller already typed; only a bare make still asks.
  console.log(`\n### B12 "2006 Mercedes-Benz CLK DTM" (Mercedes models recognized, no model re-ask)`);
  {
    let j = await resolveVehicle("2006 Mercedes-Benz CLK DTM"); let v = j.vehicle || {};
    check(`B12 "CLK DTM" -> valid, model carries CLK + DTM, no "which model?"`,
      j.status === "valid" && v.make === "Mercedes-Benz" && /clk/i.test(String(v.model || "")) && /dtm/i.test(`${v.model || ""} ${v.trim || ""}`) && !/which model/i.test(String(j.clarification?.question || "")),
      `status=${j.status} make=${v.make} model=${v.model} trim=${v.trim} q="${j.clarification?.question || ""}"`);
    j = await resolveVehicle("2006 Mercedes-Benz SLK"); v = j.vehicle || {};
    check(`B12 bare "SLK" recognized (not dropped)`, j.status === "valid" && v.make === "Mercedes-Benz" && /slk/i.test(String(v.model || "")), `status=${j.status} model=${v.model}`);
    j = await resolveVehicle("2006 Mercedes-Benz foobar"); v = j.vehicle || {};
    check(`B12 unmatched typed model -> unverified broader read, NOT "which model?"`, j.status === "valid" && v.unverified === true && !/which model/i.test(String(j.clarification?.question || "")), `status=${j.status} unverified=${v.unverified} q="${j.clarification?.question || ""}"`);
    j = await resolveVehicle("2006 Mercedes-Benz"); v = j.vehicle || {};
    check(`B12 bare make (no model typed) still asks which model`, j.status === "needs_clarification" && /which model/i.test(String(j.clarification?.question || "")), `status=${j.status} q="${j.clarification?.question || ""}"`);
  }
  // B13: pre-war Bentley displacement models + the Blower, and the material-variant ladder guard
  // (Sep 2026, "1928 Bentley 4.5 Supercharged Le Mans bodied" case + CLK DTM follow-up audit).
  //  - displacement IS the model (3/4½/6½/8 Litre, Speed Six), decimal + British "Litre" survives.
  //  - the Blower (4½ Litre Supercharged) is its OWN model, distinct from a plain 4½ Litre, so the
  //    ladder cannot mix a multi-million Blower with an ordinary tourer.
  //  - coachwork ("Supercharged", "Le Mans bodied") is never grabbed as the model.
  //  - the ladder drops the base-model rungs for a MATERIAL VARIANT trim (250 GTO, Corvette ZR1),
  //    so a rare halo never widens into the base-model pool.
  console.log(`\n### B13 pre-war Bentley + material-variant ladder guard`);
  {
    let j = await resolveVehicle("1928 Bentley 4.5 Supercharged, Le Mans bodied"); let v = j.vehicle || {};
    check(`B13 "4.5 Supercharged Le Mans bodied" -> Blower model, not "SUPERCHARGED"/re-ask`, j.status === "valid" && v.make === "Bentley" && /supercharged/i.test(String(v.model || "")) && /litre/i.test(String(v.model || "")), `status=${j.status} model=${v.model} trim=${v.trim}`);
    j = await resolveVehicle("1928 Bentley 4.5 Litre"); v = j.vehicle || {};
    check(`B13 "4.5 Litre" (decimal) -> 4½ Litre model, NOT stripped as displacement`, j.status === "valid" && /litre/i.test(String(v.model || "")) && !/supercharged/i.test(String(v.model || "")), `status=${j.status} model=${v.model}`);
    j = await resolveVehicle("1930 Bentley Speed Six"); v = j.vehicle || {};
    check(`B13 "Speed Six" -> Speed Six model (not "SPEED")`, j.status === "valid" && /speed\s*six/i.test(String(v.model || "")), `status=${j.status} model=${v.model}`);
    j = await resolveVehicle("2015 Jaguar F-Type 5.0L"); v = j.vehicle || {};
    check(`B13 regression: modern "5.0L" still stripped (F-Type resolves clean)`, j.status === "valid" && /f-?type/i.test(String(v.model || "")) && !/5|litre|liter|0l/i.test(String(v.trim || "")), `status=${j.status} model=${v.model} trim=${v.trim}`);
    const gtoRungs = buildLadder({ make: "Ferrari", model: "250", trim: "GTO", year: 1962 }).map(r => r.key);
    check(`B13 material-variant guard: 250 GTO ladder has NO base-model rungs`, !gtoRungs.some(k => /_model$/.test(k) && k !== "make_context"), `rungs=${gtoRungs.join(",")}`);
    const m3Rungs = buildLadder({ make: "BMW", model: "M3", trim: "Competition", year: 2019 }).map(r => r.key);
    check(`B13 ordinary trim (M3 Competition) STILL widens to base model`, m3Rungs.some(k => /_model$/.test(k) && k !== "make_context"), `rungs=${m3Rungs.join(",")}`);
  }
  // B14: the /sell house-by-house comparison (Sep 2026). Deterministic checks of the calendar +
  // buildHouseComparison over synthetic receipts shaped like the four verify cars (Lusso, 450S,
  // Bentley Blower, 918). The live four-car renders are verified separately by hand.
  console.log(`\n### B14 house comparison (calendar + ranking + event honesty)`);
  {
    // Event honesty: RM city + Barrett-Jackson URL are DATA; Bonhams "Salinas" is NOT data (inferred).
    check(`B14 RM city -> data room`, (eventFromRecord({ slug: "rmsothebys", city: "Monterey" }) || {}).source === "data", JSON.stringify(eventFromRecord({ slug: "rmsothebys", city: "Monterey" })));
    check(`B14 Barrett-Jackson URL -> data room`, (eventFromRecord({ slug: "barrettjackson", url: "https://www.barrett-jackson.com/2026-las-vegas/docket/vehicle/x" }) || {}).source === "data", "bj");
    check(`B14 Bonhams "Salinas" is NOT data (inference, two-fact)`, eventFromRecord({ slug: "bonhams", city: "Salinas" }) === null, "bonhams should be null");
    // nextSaleForHouse prefers a domestic (US) sale for the US launch.
    const rmNext = nextSaleForHouse("rmsothebys", "2026-09-21");
    check(`B14 RM next sale is domestic (not London)`, rmNext && rmNext.intl === false, JSON.stringify(rmNext && { city: rmNext.city, intl: rmNext.intl }));
    check(`B14 consignment window is approximate + deferred`, rmNext && /confirm with/i.test(rmNext.consignApprox), rmNext && rmNext.consignApprox);
    // buildHouseComparison: ranks by count; ASAP reorders to the soonest sale.
    const recs = [
      { isHouse: true, slug: "rmsothebys", venue: "RM Sotheby's", hammer: 1800000, date: "2025-08-15", year: 1964, city: "Monterey", url: "https://rmsothebys.com/auctions/mo25/lots/r1" },
      { isHouse: true, slug: "rmsothebys", venue: "RM Sotheby's", hammer: 1650000, date: "2024-08-16", year: 1963 },
      { isHouse: true, slug: "rmsothebys", venue: "RM Sotheby's", hammer: 1700000, date: "2024-03-01", year: 1964 },
      { isHouse: true, slug: "gooding", venue: "Gooding", hammer: 1500000, date: "2025-03-01", year: 1964 },
      { isHouse: true, slug: "bonhams", venue: "Bonhams", hammer: 1720000, date: "2024-08-13", year: 1964, city: "Salinas" }
    ];
    const hc = buildHouseComparison(recs, { todayISO: "2026-09-21" });
    check(`B14 buildHouseComparison ranks RM first (most sales)`, hc && hc.houses[0].slug === "rmsothebys" && hc.houses[0].count === 3, hc && hc.houses.map(h => h.slug + ":" + h.count).join(","));
    check(`B14 RM receipt with city -> data room; Bonhams -> inferred, never data`, (() => {
      const rm = hc.houses.find(h => h.slug === "rmsothebys"), bon = hc.houses.find(h => h.slug === "bonhams");
      const rmData = rm.receipts.some(r => r.room && r.room.source === "data");
      const bonData = bon.receipts.some(r => r.room && r.room.source === "data");
      return rmData && !bonData;
    })(), "rm should have a data room; bonhams none");
    const hcAsap = buildHouseComparison(recs, { todayISO: "2026-09-21", asap: true });
    check(`B14 ASAP sets an asapLead (soonest-sale house)`, !!(hcAsap && hcAsap.asap && hcAsap.asapLead), JSON.stringify(hcAsap && { asap: hcAsap.asap, lead: hcAsap.asapLead }));
  }

  // B15: generic-designator pre-war models (Sep 2026, "1929 Duesenberg Model J" case). A model text
  // that LEADS with a designator word (Model, Type, Tipo, Series) resolves as designator + the
  // following token, never the bare designator uppercased with the token dropped ("MODEL"/"TIPO").
  // A bare designator alone is NOT a model and asks once. "3 Series" (number leads) is untouched.
  console.log(`\n### B15 generic-designator pre-war models (Model J / Type 57 / Tipo 61)`);
  {
    const wants = [
      ["1929 Duesenberg Model J", "Duesenberg", "Model J"],
      ["1913 Ford Model T", "Ford", "Model T"],
      ["1937 Bugatti Type 57", "Bugatti", "Type 57"],
      ["1960 Maserati Tipo 61", "Maserati", "Tipo 61"]
    ];
    for (const [text, make, model] of wants) {
      const j = await resolveVehicle(text); const v = j.vehicle || {};
      check(`B15 "${text}" -> ${make} ${model} (not a bare designator)`,
        j.status === "valid" && v.make === make && v.model === model && !v.unverified, `status=${j.status} model=${v.model} unv=${v.unverified}`);
    }
    // A bare designator with nothing after it is not a model: ask once (never resolve to "MODEL").
    for (const [text, make] of [["1929 Duesenberg Model", "Duesenberg"], ["1937 Bugatti Type", "Bugatti"]]) {
      const j = await resolveVehicle(text); const v = j.vehicle || {};
      check(`B15 bare "${text}" asks which model (no garbage "MODEL")`,
        j.status === "needs_clarification" && !v.model && /which model/i.test(j.clarification?.question || ""), `status=${j.status} model=${v.model}`);
    }
    // Regressions: the Bentley 4½ Litre and CLK DTM resolvers still stand, and "3 Series" (number
    // leads, not a designator) is untouched.
    let j = await resolveVehicle("1928 Bentley 4.5 Litre");
    check(`B15 regression Bentley 4.5 Litre -> "4½ Litre"`, j.vehicle?.model === "4½ Litre", `model=${j.vehicle?.model}`);
    j = await resolveVehicle("2004 Mercedes CLK DTM AMG");
    check(`B15 regression CLK DTM -> model "CLK DTM"`, j.vehicle?.model === "CLK DTM", `model=${j.vehicle?.model}`);
    j = await resolveVehicle("2015 BMW 3 Series");
    check(`B15 "3 Series" untouched (number leads, not a designator)`, /3\s*series/i.test(j.vehicle?.model || ""), `model=${j.vehicle?.model}`);
  }

  // B16: pre-war/pre-1981 chassis numbers + conversational-preamble model grabbing (Sep 2026 live
  // session: "9113111617" got "phone number!"; "think its a 1973 porsche vin" grabbed model "THINK").
  console.log(`\n### B16 all-digit chassis + conversational model guard`);
  {
    let j = await resolveVehicle("9113111617"); // Porsche 911 chassis prefix -> confident chassis ask
    check(`B16 all-digit "9113111617" -> chassis ask, not phone/model`,
      j.status === "needs_clarification" && j.clarification?.kind === "chassis_hint" && /chassis number/i.test(j.clarification?.question || "") && !j.vehicle?.model, `kind=${j.clarification?.kind} model=${j.vehicle?.model}`);
    j = await resolveVehicle("4155551234"); // bare unrecognized all-digit (phone) -> SOFTER ask, no assertion
    check(`B16 bare all-digit "4155551234" -> softer "is that a chassis number?" ask`,
      j.status === "needs_clarification" && /is that a chassis number/i.test(j.clarification?.question || ""), (j.clarification?.question || "").slice(0, 60));
    j = await resolveVehicle("think its a 1973 porsche vin"); // preamble + doc words never a model
    check(`B16 "think its a 1973 porsche vin" -> 1973 Porsche, model asked, never "THINK"`,
      j.vehicle?.make === "Porsche" && j.vehicle?.year === 1973 && !/think|vin/i.test(String(j.vehicle?.model || "")) && !j.vehicle?.model, `make=${j.vehicle?.make} year=${j.vehicle?.year} model=${j.vehicle?.model}`);
    j = await resolveVehicle("194371S119431"); // Corvette chassis control still matches
    check(`B16 regression 194371S119431 -> Chevrolet Corvette (chassis match)`,
      j.vehicle?.make === "Chevrolet" && /corvette/i.test(j.vehicle?.model || ""), `make=${j.vehicle?.make} model=${j.vehicle?.model}`);
  }
  return fails;
}

// ---- run. RANGE empty = everything; RANGE=resolver = B8/B9 only (no browser);
// RANGE=1-7 (etc) = those UI scenarios only. ----
const range = process.env.RANGE || "";
const uiKeys = pickRange();
const runResolver = !range || /resolver|b8|b9/i.test(range);
const runUi = !range || uiKeys.length > 0;
let resolverFails = 0, uiFails = 0, uiPass = 0, uiTotal = 0;
if (runResolver) resolverFails = await resolverChecks();

if (runUi) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1300, deviceScaleFactor: 1 });
  await page.setCookie({ name: "gas_crew", value: "ok", domain: "goasksam.com", path: "/" });
  for (const key of uiKeys) {
    const scn = ALL[key];
    process.stdout.write(`\n### Scenario ${key}: ${scn.veh} / ${scn.state} / $${scn.price} / ${scn.pref} / ${scn.timing}\n`);
    try {
      const r = await drive(page, scn);
      fs.writeFileSync(`${OUT}/${key}.json`, JSON.stringify({ key, scn, ...r, at: new Date().toISOString() }, null, 1));
      await page.screenshot({ path: `${OUT}/${key}.png`, fullPage: false });
      const e = r.es;
      // Hard per-scenario assertion: the flow must reach its EXPECTED terminal state
      // (default "card"; London -> "nonus", Camry -> "oos"). For the non-card edge
      // cases we also require no card rendered, so a wrong card can't pass as "reached
      // a terminal state". A thrown error (crash/hang) is a FAIL via the catch below.
      const expect = scn.expect || "card";
      const pass = e[expect] === true && (expect === "card" || e.card === false);
      uiTotal++; if (pass) uiPass++; else uiFails++;
      console.log(`  ${pass ? "PASS" : "FAIL"}  Scenario ${key}: expected ${expect} | got card=${e.card} oos=${e.oos} nonus=${e.nonus} gate=${e.gate} steps=${r.steps.length}`);
      console.log(`  steps: ${r.steps.map(s => s.action).join(" | ")}`);
      if (!pass) console.log(`  RESULT(last 500): ${r.msgsText.replace(/\n+/g, " ").slice(-500)}`);
    } catch (e) {
      uiTotal++; uiFails++;
      console.log(`  FAIL  Scenario ${key}: ERROR ${e.message}`);
      fs.writeFileSync(`${OUT}/${key}.json`, JSON.stringify({ key, scn, error: e.message }, null, 1));
    }
  }
  await browser.close();
}
const totalFails = resolverFails + uiFails;
console.log(`\n==== GOLDEN PATH SUMMARY ====`);
if (runResolver) console.log(`Resolver: ${23 - resolverFails}/23 pass (${resolverFails} fail)`);
if (runUi) console.log(`UI scenarios: ${uiPass}/${uiTotal} pass (${uiFails} fail)`);
console.log(totalFails ? `\n${totalFails} TOTAL FAILURE(S)` : `\nALL PASS`);
process.exit(totalFails ? 1 : 0);
