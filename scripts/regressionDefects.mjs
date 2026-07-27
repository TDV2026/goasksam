// Deterministic regression for the four verification-status defects.
//   D4: unverified designation is tagged everywhere it renders as a label
//   D2: post-result corrected/new model offers a one-tap re-run (carryover)
//   D1/D3: verification status + gate outcome plumbing exists in prompt+context
// (D1/D3 chat behavior itself is asserted live by regressionChatDefects.mjs.)
import fs from "node:fs";

let failures = 0;
const check = (name, ok, detail="") => { console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+detail}`); if(!ok)failures++; };

const noop = () => {};
const elem = () => new Proxy(function(){}, { get:(t,p)=>{ if(p==="style")return{}; if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false}; if(["value","textContent","id","className","innerHTML"].includes(p))return""; if(["appendChild","setAttribute","addEventListener","remove","append","scrollIntoView","focus"].includes(p))return noop; if(p==="querySelector")return()=>elem(); if(p==="querySelectorAll")return()=>[]; return elem(); }, apply:()=>elem() });
globalThis.window = globalThis;
globalThis.document = { getElementById:()=>elem(), querySelector:()=>elem(), querySelectorAll:()=>[], createElement:()=>elem(), addEventListener:noop, body:elem() };
try { Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true}); } catch {}
globalThis.location = { hostname:"localhost", protocol:"file:" };
globalThis.localStorage = { getItem:()=>null, setItem:noop };
// Stub resolver: 850i valid, 854f near-miss, 359x unverified, garbage no-car.
globalThis.fetch = async (url,opts) => {
  const t = String((opts&&opts.body?JSON.parse(opts.body):{}).text||"").toLowerCase();
  if(/850i/.test(t)) return { ok:true, json:async()=>({status:"valid",vehicle:{make:"BMW",model:"850i",canonicalLabel:"2018 BMW 850i"}}) };
  if(/854f/.test(t)) return { ok:true, json:async()=>({status:"needs_confirmation",vehicle:{make:"BMW"},clarification:{question:"Did you mean 850i?",suggestion:"2018 BMW 850i"}}) };
  if(/359x/.test(t)) return { ok:true, json:async()=>({status:"valid",vehicle:{make:"BMW",model:"359X",canonicalLabel:"2018 BMW 359X",unverified:true}}) };
  return { ok:true, json:async()=>({status:"needs_clarification",clarification:{question:"What car?"}}) };
};

const SAM = [];
const html = fs.readFileSync("index.html","utf8");
const files = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m=>m[1]);
const script = files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
const bootstrap = `globalThis.sellState=sellState;globalThis.handleSellRecommendationFollowup=handleSellRecommendationFollowup;globalThis.offerReRun=offerReRun;globalThis.commitReRun=commitReRun;globalThis.carDisplayLabel=carDisplayLabel;globalThis.resultHeaderTitle=resultHeaderTitle;
let __rerun=false; globalThis.__wasRerun=()=>__rerun; showSellRecommendation=async function(){__rerun=true;};
const __a=addMsg; addMsg=function(r,t,h,c){ SAM.push({text:String(t||""),chips:String(c||"")}); try{return __a(r,t,h,c);}catch(e){} };`;
globalThis.SAM = SAM;
(0,eval)(script + "\n" + bootstrap);

// ---------------- D4 ----------------
sellState.carName="2002 BMW 351RG"; sellState.resolvedVehicle={make:"BMW",model:"351RG",unverified:true};
check("D4: carDisplayLabel tags an unverified model", carDisplayLabel()==="2002 BMW 351RG (unverified)", carDisplayLabel());
check("D4: result title carries the unverified tag", /\(unverified\)/.test(resultHeaderTitle([])), resultHeaderTitle([]));
sellState.carName="2018 BMW M3"; sellState.resolvedVehicle={make:"BMW",model:"M3"};
check("D4: verified model never shows the tag", carDisplayLabel()==="2018 BMW M3" && !/\(unverified\)/.test(resultHeaderTitle([])), carDisplayLabel());
check("D4: summary CAR row uses carDisplayLabel (source)", script.includes('value:sellState.carName?carDisplayLabel():"Not set"'));

// ---------------- D2 ----------------
function setup(){ sellState.active=true; sellState.step=12; sellState.awaitingPathChoice=false; sellState.pendingRerun=null; sellState.awaitingReplacementCar=false;
  sellState.sellOptions=[{key:"primary",name:"Bring a Trailer"}]; sellState.allRouteOptions=sellState.sellOptions;
  sellState.region="US"; sellState.state="California"; sellState.mileage="Under 30k"; sellState.price="150000"; sellState.timeline="No rush"; SAM.length=0; }

setup();
check("D2: 'actually the model is 850i' is handled as re-designation (true)", handleSellRecommendationFollowup("actually the model is 850i")===true);
setup();
check("D2: 'i want you to run a new car' is handled (true, not refused)", handleSellRecommendationFollowup("i want you to run a new car")===true);
setup();
check("D2: '859h model' bare designation handled (true)", handleSellRecommendationFollowup("859h model")===true);
setup();
check("D2: a genuine question still goes to chat (false)", handleSellRecommendationFollowup("why not a powerseller for this")===false);

// Re-run offer + commit carries answers over.
setup();
await offerReRun("actually the model is 850i");
const offer = SAM[SAM.length-1];
check("D2: real model -> re-run offer with a yes chip", /re-run the analysis as 2018 BMW 850i/i.test(offer.text) && /Yes, re-run/i.test(offer.chips), JSON.stringify(offer).slice(0,160));
check("D2: pendingRerun holds the resolved vehicle", sellState.pendingRerun?.vehicle?.canonicalLabel==="2018 BMW 850i");
const keptPrice=sellState.price, keptState=sellState.state;
commitReRun();
check("D2: commit re-runs (showSellRecommendation) and swaps only the car", __wasRerun() && sellState.carName==="2018 BMW 850i" && sellState.price===keptPrice && sellState.state===keptState);

// Near-miss -> did-you-mean offer.
setup();
await offerReRun("actually its the 854f");
check("D2: near-miss -> did-you-mean re-run offer", /did you mean 2018 bmw 850i/i.test(SAM[SAM.length-1].text), SAM[SAM.length-1].text.slice(0,120));
// Unverified -> make-level re-run note.
setup();
await offerReRun("the model is 359x");
check("D2: unverified -> offer notes make-level re-run", /359x/i.test(SAM[SAM.length-1].text) && /make-level/i.test(SAM[SAM.length-1].text), SAM[SAM.length-1].text.slice(0,140));
// No-match -> asks for year/make/model, never refuses.
setup();
await offerReRun("run a new car");
check("D2: vague re-run request asks for the car (never refuses)", /year, make and model/i.test(SAM[SAM.length-1].text) && !/isn'?t something|mid-flow/i.test(SAM[SAM.length-1].text), SAM[SAM.length-1].text.slice(0,120));

// ---------------- D1/D3 plumbing (source) ----------------
const wizard = fs.readFileSync("js/wizard.js","utf8");
const entry = fs.readFileSync("js/entry.js","utf8");
check("D1: SELL_SYS holds the unverified consistent-position rule", /UNVERIFIED MODELS \(hard fact/.test(wizard));
check("D3: SELL_SYS holds the powerseller-absence no-value-judgment rule", /POWERSELLER ABSENCE/.test(wizard) && /NEVER imply the seller'?s car lacks value/.test(wizard));
check("D2: SELL_SYS allows re-running a different car", /RE-RUNNING A DIFFERENT CAR is supported/.test(wizard));
check("D1: entry.js injects VEHICLE VERIFICATION hard fact when unverified", /VEHICLE VERIFICATION/.test(entry));
check("D3: entry.js injects the PowerSeller gate outcome", /PowerSeller gate outcome/.test(entry));

console.log(failures ? `\n${failures} FAILURE(S)` : "\nDEFECTS ALL PASS");
process.exit(failures ? 1 : 0);
