// Phase 1d: copy lint as a test. Exports lintText(text) and runs it over the
// rendered output of every card type and intro line. Rules: banned phrases,
// filler patterns, en/em dashes, the weekday scope-word rule, the sell-through
// ban, and the weekday sample gate (no weekday claim below 15 backing comps).
import fs from "node:fs";

// ---- the lint (also importable by the browser-flow suite) ----
export const LINT_RULES = [
  { id: "sell-through", re: /sell-?through|%\s*sold\b/i, msg: "sell-through / % sold is banned (sold-only data)" },
  { id: "value-opinion", re: /\bhigher end\b|\bprice point\b/i, msg: "no value opinion on the user's price" },
  { id: "filler", re: /\ba car like this\b|remains viable|not the clearest|clearest first choice|\bstrong option\b|\breal signal\b|one of the stronger platforms|worth a look if|still worth (a look|considering)/i, msg: "filler phrase with no evidence" },
  { id: "em-dash", re: /—/, msg: "em dash in user-facing copy" },
  { id: "en-dash", re: /–/, msg: "en dash in user-facing copy" },
];
// A weekday claim must name its scope (car/generation/make) AND the window.
export function lintWeekday(line) {
  if (!/closed strongest on [A-Z]/i.test(line)) return null;
  const hasScope = /(as a whole|[A-Za-z0-9-]+s have closed strongest|-generation )/i.test(line);
  const hasWindow = /over the past 180 days/i.test(line);
  if (!hasScope) return "weekday claim without a scope word";
  if (!hasWindow) return "weekday claim without its 180-day window";
  return null;
}
export function lintText(text) {
  const out = [];
  const t = String(text || "");
  for (const r of LINT_RULES) { const m = t.match(r.re); if (m) out.push(`${r.id}: "${m[0]}" (${r.msg})`); }
  for (const line of t.split(/\n|(?<=\.)\s+/)) { const w = lintWeekday(line); if (w) out.push(`weekday-scope: "${line.trim().slice(0,80)}" (${w})`); }
  return out;
}

// ---- run the lint over composer output + intro lines ----
const noop = () => {};
const elem = () => new Proxy(function(){}, { get:(t,p)=>{ if(p==="style")return{}; if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false}; if(["value","textContent","id","className","innerHTML"].includes(p))return""; if(["appendChild","setAttribute","addEventListener","remove","append","scrollIntoView","focus"].includes(p))return noop; if(p==="querySelector")return()=>elem(); if(p==="querySelectorAll")return()=>[]; return elem(); }, apply:()=>elem() });
globalThis.window = globalThis;
globalThis.document = { getElementById:()=>elem(), querySelector:()=>elem(), querySelectorAll:()=>[], createElement:()=>elem(), addEventListener:noop, body:elem() };
try { Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true}); } catch {}
globalThis.location = { hostname:"localhost", protocol:"file:" };
globalThis.localStorage = { getItem:()=>null, setItem:noop };
globalThis.fetch = async () => ({ ok:true, json:async()=>({}) });
const html = fs.readFileSync("index.html","utf8");
const files = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m=>m[1]);
const script = files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
(0, eval)(script + "\nglobalThis.sellState=sellState;globalThis.composeCard=composeCard;globalThis.powerSellerIntroLine=powerSellerIntroLine;globalThis.powerSellerServiceLine=powerSellerServiceLine;globalThis.vehicleAcceptPrefix=vehicleAcceptPrefix;");

let failures = 0;
const check = (name, ok, detail="") => { console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+detail}`); if(!ok)failures++; };
sellState.sellDecision = { evidence:{ ladder:{ landed:{ key:"exact_year_model" } } } };
const cardText = c => [c.headline&&c.headline.text, ...(c.bullets||[]).map(b=>b.text)].filter(Boolean).join("\n");

// Every card type through the composer.
const V = { make:"Chevrolet", model:"Camaro", year:1967 };
const scenarios = {
  "Mode A + model weekday (n=18)": composeCard(V, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:8, pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"model"}, dayAdvantage:{weekday:"Friday",liftPercent:16,scope:"model",window:180,sample:18} } }, { isPick:true, landedScope:"model" }),
  "Mode B speed": composeCard({make:"BMW",model:"M3",year:2018}, { label:"bringatrailer", platform:"bringatrailer", speedToList:"fast", marketEvidence:{ evidenceSales:9, pricePremium:{gateType:"symmetric",percent:5,windowDays:90,scope:"model"} } }, { isPick:true, sellerWantsSpeed:true, routingReason:"speed", landedScope:"model" }),
  "Honest": composeCard({make:"Porsche",model:"911",year:1995}, { label:"pcarmarket", platform:"pcarmarket", marketEvidence:{ evidenceSales:2 } }, { isPick:true, landedScope:"model" }),
  "Unverified": composeCard({make:"BMW",model:"351RG",year:2002,unverified:true}, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:5, pricePremium:{gateType:"symmetric",percent:40,windowDays:45,scope:"model"}, dayAdvantage:{weekday:"Tuesday",liftPercent:12,scope:"make",window:180,sample:30} } }, { isPick:true, landedScope:"make" }),
  "Make weekday alt": composeCard({make:"Porsche",model:"911",year:2019}, { label:"carsandbids", platform:"carsandbids", marketEvidence:{ evidenceSales:1, dayAdvantage:{weekday:"Tuesday",liftPercent:17,scope:"make",window:180,sample:50} } }, { isPick:false, landedScope:"model" }),
  "PowerSeller": composeCard(V, {}, { powerSeller:true }),
};
for (const [name, c] of Object.entries(scenarios)) {
  const v = lintText(cardText(c));
  check(`1d lint: card "${name}" is clean`, v.length === 0, v.join(" ; "));
}
// Intro lines.
sellState.carName = "2019 Porsche 911 Carrera"; sellState.resolvedVehicle = { make:"Porsche", model:"911", year:2019 };
for (const [name, fn] of [["powerSellerIntroLine", powerSellerIntroLine], ["powerSellerServiceLine", powerSellerServiceLine], ["vehicleAcceptPrefix", vehicleAcceptPrefix]]) {
  const v = lintText(fn());
  check(`1d lint: intro "${name}" is clean`, v.length === 0, v.join(" ; "));
}

// Weekday sample gate: a dayAdvantage below 15 comps produces NO weekday line.
const lowSample = composeCard(V, { label:"bringatrailer", platform:"bringatrailer", marketEvidence:{ evidenceSales:8, pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"model"}, dayAdvantage:{weekday:"Friday",liftPercent:62,scope:"model",window:180,sample:8} } }, { isPick:true, landedScope:"model" });
check("1d lint: weekday claim below the 15-comp gate does not render", !/closed strongest on/i.test(cardText(lowSample)), cardText(lowSample));

// The lint itself catches known-bad copy.
check("1d lint: detects a sell-through claim", lintText("84% sell-through for modern Porsches").length > 0);
check("1d lint: detects an em dash", lintText("this — that").some(v=>/em dash/.test(v)));
check("1d lint: detects a weekday without scope", lintText("Prices closed strongest on Fridays over the past 180 days").some(v=>/weekday-scope/.test(v)));

console.log(failures ? `\n${failures} FAILURE(S)` : "\n1D-LINT ALL PASS");
process.exit(failures ? 1 : 0);
