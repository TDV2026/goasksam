// Stage 3 — lint coverage for the redesigned pick card's variant generators
// (js/result-v2.js). Exercises every family across every mode and asserts each
// rendered string passes lintText (no dashes/hedges/dollars/causal/banned),
// contains its canonical data clause verbatim, weekday % is divisible by 5 with
// no "around", and reserve carries no dollar figure.
import fs from "node:fs";
// Self-contained lint (importing copyLint would run its whole suite + process.exit).
const V2_RULES=[
  {id:"em-dash",re:/—/},{id:"en-dash",re:/–/},
  {id:"dollar",re:/\$\s?\d/},
  {id:"hedge-around",re:/\baround\b/i},
  {id:"reserve-causal",re:/\bcaused\b|because of the reserve|the reserve helped|will get you|you'?ll earn|\bboosts\b|increases your price/i},
  {id:"filler",re:/\ba car like this\b|remains viable|\bstrong option\b|\breal signal\b/i},
  {id:"sell-through",re:/sell-?through|%\s*sold\b/i}
];
const lintText=t=>V2_RULES.filter(r=>r.re.test(String(t||""))).map(r=>r.id);

const noop=()=>{};
const elem=()=>new Proxy(function(){},{get:(t,p)=>{if(p==="style")return{};if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false};if(["value","textContent","id","className","innerHTML"].includes(p))return"";if(["appendChild","setAttribute","addEventListener","remove","append","scrollIntoView","focus"].includes(p))return noop;if(p==="querySelector")return()=>elem();if(p==="querySelectorAll")return()=>[];return elem();},apply:()=>elem()});
globalThis.window=globalThis;
globalThis.document={getElementById:()=>elem(),querySelector:()=>elem(),querySelectorAll:()=>[],createElement:()=>elem(),addEventListener:noop,body:elem()};
try{Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true});}catch{}
globalThis.location={hostname:"localhost",protocol:"file:",search:""};
globalThis.localStorage={getItem:()=>null,setItem:noop,removeItem:noop};
globalThis.fetch=async()=>({ok:true,json:async()=>({})});
const html=fs.readFileSync("index.html","utf8");
const files=[...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m=>m[1]);
(0,eval)(files.map(f=>fs.readFileSync(f,"utf8")).join("\n")+"\nglobalThis.sellState=sellState;globalThis.v2Because=v2Because;globalThis.v2Why=v2Why;globalThis.v2Weekday=v2Weekday;globalThis.v2Reserve=v2Reserve;globalThis.v2Audience=v2Audience;globalThis.v2ScopePlural=v2ScopePlural;globalThis.v2RungRef=v2RungRef;globalThis.v2RungNoun=v2RungNoun;globalThis.CLAUSE_A=CLAUSE_A;globalThis.CLAUSE_B=CLAUSE_B;globalThis.CLAUSE_C=CLAUSE_C;");

let failures=0;
const check=(name,ok,detail="")=>{console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+String(detail).slice(0,200)}`);if(!ok)failures++;};
const clean=t=>{const v=lintText(t);return {ok:v.length===0,detail:v.join(" ; ")+" :: "+t};};

// generation-rung Porsche 911 context
globalThis.sellState=Object.assign(globalThis.sellState||{},{
  carName:"2011 Porsche 911 Carrera", resultId:undefined,
  resolvedVehicle:{make:"Porsche",model:"911",year:2011},
  sellDecision:{ resultId:"seed-abc", evidence:{ windowDays:90, generation:{code:"997"}, ladder:{landed:{key:"generation_trim",generationCode:"997"}} } }
});
const v={make:"Porsche",model:"911",year:2011};
const slots={scope:v2ScopePlural(v),rungRef:v2RungRef(v),rungWord:v2RungNoun(),platform:"Bring a Trailer",make:"Porsche",delta:12,window:90};

// FAMILY A + B across modes
for(const mode of ["modeA","modeB","concentration","thin"]){
  for(let i=0;i<6;i++){ // vary the seed to hit all frames
    sellState.sellDecision.resultId="seed-"+mode+"-"+i;
    const bc=v2Because(mode,slots); const wy=v2Why(mode,slots);
    const rb=clean(bc), rw=clean(wy);
    check(`because.${mode} clean`, rb.ok, rb.detail);
    check(`why.${mode} clean`, rw.ok, rw.detail);
    const canon=(mode==="modeA"?CLAUSE_A(slots):mode==="modeB"?CLAUSE_B(slots):mode==="concentration"?CLAUSE_C(slots):("recent sales for "+slots.rungRef+" are limited, so I ran this at the "+slots.rungWord+" level")).toLowerCase();
    check(`why.${mode} contains canonical clause`, wy.toLowerCase().includes(canon), wy);
  }
}

// WEEKDAY: tier1 rounds to 5, no "around"; tier2 direction-only
const wk1=v2Weekday({dayAdvantage:{weekday:"Wednesday",liftPercent:24,scope:"generation",window:180,sample:30,sales:8}},v);
check("weekday tier1 rounds 24 -> 25", wk1&&/25% above other days/.test(wk1.body)&&!/24%/.test(wk1.body), wk1&&wk1.body);
check("weekday tier1 no 'around'", wk1&&!/around/.test(wk1.body), wk1&&wk1.body);
check("weekday tier1 lint-clean", wk1&&clean(wk1.body).ok, wk1&&clean(wk1.body).detail);
const wk2=v2Weekday({dayAdvantage:{weekday:"Friday",liftPercent:14,scope:"generation",window:180,sample:14,sales:3}},v);
check("weekday tier2 direction-only (no %)", wk2&&/tended to close strongest/.test(wk2.body)&&!/%/.test(wk2.body), wk2&&wk2.body);
const wk3=v2Weekday({dayAdvantage:{weekday:"Monday",liftPercent:9,scope:"generation",window:180,sample:6,sales:2}},v);
check("weekday tier3 absent (thin sample)", wk3===null, JSON.stringify(wk3));

// RESERVE: percentage, no dollars, gated
const rvOK=v2Reserve({label:"bringatrailer",platform:"bringatrailer",reserveContext:{delta_pct:6.8,n_with:47,n_without:14,data_month:"2026-06"}});
check("reserve renders a percentage, no dollar sign", rvOK&&/7% higher/.test(rvOK.headline)&&!/\$/.test(rvOK.body+rvOK.headline), rvOK&&JSON.stringify(rvOK));
check("reserve lint-clean (no causal, no dollar)", rvOK&&clean(rvOK.body).ok, rvOK&&clean(rvOK.body).detail);
const rvGate=v2Reserve({label:"bringatrailer",platform:"bringatrailer",reserveContext:{delta_pct:9,n_with:8,n_without:20,data_month:"2026-06"}});
check("reserve hidden when n_with < 10", rvGate===null, JSON.stringify(rvGate));
const rvSim=v2Reserve({label:"bringatrailer",platform:"bringatrailer",reserveContext:{delta_pct:1.5,n_with:40,n_without:30,data_month:"2026-06"}});
check("reserve <3% uses similarity wording (within three points)", rvSim&&/within three points/.test(rvSim.body)&&!/\$/.test(rvSim.body), rvSim&&rvSim.body);

console.log(failures?`\n${failures} FAILURE(S)`:"\nCARD-V2-LINT ALL PASS");
process.exit(failures?1:0);
