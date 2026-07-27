// Regression for the four July 2026 live-UI defects (round 3).
//   D1: no old bare PowerSeller intro; value-first intro explains the term
//   D2: alt-card bullets are evidence-only, never filler
//   D4: negation words never concatenated into a model/suggestion; double-check
// D3 (chat answers the asked question) is asserted against prod /api/chat by
// scripts/regressionChatD3.mjs, since it needs the live model.
import fs from "node:fs";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ->  " + detail}`);
  if (!ok) failures++;
};

// ---- load frontend with a DOM stub; capture Sam messages + outbound fetch ----
const noop = () => {};
const elem = () => new Proxy(function(){}, { get:(t,p)=>{ if(p==="style")return{}; if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false}; if(["value","textContent","id","className","innerHTML"].includes(p))return""; if(["appendChild","setAttribute","addEventListener","remove","append","scrollIntoView","focus"].includes(p))return noop; if(p==="querySelector")return()=>elem(); if(p==="querySelectorAll")return()=>[]; return elem(); }, apply:()=>elem() });
globalThis.window = globalThis;
globalThis.document = { getElementById:()=>elem(), querySelector:()=>elem(), querySelectorAll:()=>[], createElement:()=>elem(), addEventListener:noop, body:elem() };
try { Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true}); } catch {}
globalThis.location = { hostname:"localhost", protocol:"file:" };
globalThis.localStorage = { getItem:()=>null, setItem:noop };

// Deterministic /api/vehicleIdentity stub that captures the text the frontend
// sends (proving negation is stripped) and mimics the prod near-miss response.
const sent = [];
globalThis.fetch = async (url, opts) => {
  const body = opts && opts.body ? JSON.parse(opts.body) : {};
  sent.push(body.text || "");
  const t = String(body.text || "").toLowerCase();
  if (body.keepAsTyped) return { ok:true, json:async()=>({ status:"valid", vehicle:{ make:"BMW", model:(t.match(/\b(\d{3}[a-z])\b/)?.[1]||"854F").toUpperCase(), canonicalLabel:`2018 BMW ${(t.match(/\b(\d{3}[a-z])\b/)?.[1]||"854F").toUpperCase()}`, unverified:true, confidence:"low" } }) };
  if (/85\d[a-z]|84\d[a-z]|854/.test(t)) return { ok:true, json:async()=>({ status:"needs_confirmation", vehicle:{ make:"BMW" }, clarification:{ question:"Did you mean the 2018 BMW 850i?", suggestion:"2018 BMW 850i" } }) };
  return { ok:true, json:async()=>({ status:"needs_clarification", vehicle:{ make:"BMW" }, clarification:{ question:"Which BMW model?" } }) };
};

const SAM = [];
const html = fs.readFileSync("index.html","utf8");
const files = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m=>m[1]);
const script = files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
const bootstrap = `
globalThis.__SAM = SAM;
globalThis.sellState = sellState;
globalThis.handleVehicleValidationAnswer = handleVehicleValidationAnswer;
globalThis.composeCard = composeCard;
globalThis.powerSellerIntroLine = powerSellerIntroLine;
const __origAddMsg = addMsg;
addMsg = function(role, text, htmlArg, chipsStr){ if(role==="sam") SAM.push({text:String(text||""), chips:String(chipsStr||"")}); try{ return __origAddMsg(role,text,htmlArg,chipsStr);}catch(e){} };
`;
globalThis.SAM = SAM;
(0, eval)(script + "\n" + bootstrap);

// ---------------- D1 ----------------
const intro = powerSellerIntroLine();
check("D1: intro explains a PowerSeller (names the term + the service)", /powerseller/i.test(intro) && /(photos|listing|buyer|paperwork)/i.test(intro), intro);
check("D1: old bare intro string appears nowhere in the JS source", !script.includes("If you'd rather have the whole sale handled"));

// ---------------- D2 (now the 1b composer: a thin alt renders evidence-only) ---
sellState.resolvedVehicle = { make:"Porsche", model:"911", year:2019 };
sellState.sellDecision = { evidence:{ windowDays:180, ladder:{ landed:{ key:"exact_year_model" } } } };
const thinAlt = { platform:"hagerty", label:"hagerty", marketEvidence:{ evidenceSales:2 } };
const altCard = composeCard(sellState.resolvedVehicle, thinAlt, { isPick:false, landedScope:"model" });
const altText = [altCard.headline&&altCard.headline.text, ...altCard.bullets.map(b=>b.text)].filter(Boolean).join(" || ");
check("D2: thin alt carries no filler (composer, evidence-only)",
  !/a car like this|remains viable|not the clearest|one of the stronger platforms|real signal|strong option/i.test(altText), altText);
check("D2: every composed line carries provenance",
  [altCard.headline, ...altCard.bullets].filter(Boolean).every(l=>l.provenance), altText);

// ---------------- D4 ----------------
async function correctionCase(pendingSuggestion, answer) {
  sent.length = 0; SAM.length = 0;
  sellState.active = true; sellState.step = 17;
  sellState.carName = "BMW"; sellState.carRaw = "BMW";
  sellState.pendingVehicleIdentity = { type:"model", baseVehicle:"BMW", suggestion:pendingSuggestion, rawInput:"2018 bmw 850i" };
  await handleVehicleValidationAnswer(answer);
  const lastChips = SAM.length ? SAM[SAM.length-1].chips : "";
  const chipLabels = [...lastChips.matchAll(/handleChip\('([^']+)'\)/g)].map(m=>m[1]);
  return { sentTexts: sent.slice(), chipLabels, sam: SAM.map(s=>s.text) };
}
{
  const r = await correctionCase("2018 BMW 850i", "no the 854f");
  const outbound = r.sentTexts.join(" | ");
  check("D4: 'no the 854f' strips negation before resolving (no 'no'/'the' in the query)",
    r.sentTexts.length > 0 && !/\bno\b|\bthe\b/i.test(outbound) && /854f/i.test(outbound), outbound);
  check("D4: no chip contains a negation word ('850i NO' bug is gone)",
    r.chipLabels.length > 0 && !r.chipLabels.some(c=>/\bno\b/i.test(c)), JSON.stringify(r.chipLabels));
  check("D4: response double-checks and offers keep-as-typed",
    /keep .* as typed/i.test(r.chipLabels.join(" ")) && /doesn'?t|does not|match|double-?check/i.test(r.sam.join(" ")), JSON.stringify(r.chipLabels));
}
for (const ans of ["not that one its the 840", "nope 850"]) {
  const r = await correctionCase("2018 BMW 850i", ans);
  const outbound = r.sentTexts.join(" | ");
  check(`D4: "${ans}" parses sanely (no negation/filler in query)`,
    r.sentTexts.length > 0 && !/\bno\b|\bnope\b|\bnot\b|\bthe\b|\bits\b|that one/i.test(outbound), outbound);
}
// (resolver keepAsTyped is verified against the real resolver in
// scripts/reproD4/regressionLiveFailures; it can't run here because the frontend
// fetch stub above starves the resolver's live vPIC lookups.)

console.log(failures ? `\n${failures} FAILURE(S)` : "\nROUND3 ALL PASS");
process.exit(failures ? 1 : 0);
