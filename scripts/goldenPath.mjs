// GOLDEN PATH v1 - drives the DEPLOYED production page (goasksam.com) end to end
// via the real UI (crew cookie lifts the curtain). Real API, real DB, real OCD.
// RANGE env selects scenarios: empty = the full suite (resolver checks + all 20 UI
// scenarios); RANGE=resolver = B8/B9 resolver assertions only (no browser); RANGE=1-7
// = those UI scenarios only. Writes scripts/gp-out/<n>.json + png for UI runs.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
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
    const gate = /free account|That's your .* for today|search for today/i.test(txt);
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
if (runResolver) console.log(`Resolver: ${15 - resolverFails}/15 pass (${resolverFails} fail)`);
if (runUi) console.log(`UI scenarios: ${uiPass}/${uiTotal} pass (${uiFails} fail)`);
console.log(totalFails ? `\n${totalFails} TOTAL FAILURE(S)` : `\nALL PASS`);
process.exit(totalFails ? 1 : 0);
