// Deterministic verification for Bug 3 (Mode-B secondary suppression) and
// Bug 4 (PowerSeller composition order). Loads the real frontend with DOM stubs
// (same pattern as cardV2Lint) and calls the real render functions.
import fs from "node:fs";
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
(0,eval)(files.map(f=>fs.readFileSync(f,"utf8")).join("\n")+"\nglobalThis.sellState=sellState;globalThis.renderResultV2Page=renderResultV2Page;globalThis.renderSecondaryPlatformV2=renderSecondaryPlatformV2;globalThis.v2Mode=v2Mode;");

let fails=0;
const check=(name,ok,detail="")=>{console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+String(detail).slice(0,200)}`);if(!ok)fails++;};

// ---- shared fixtures ----
const bmw={year:2008,make:"BMW",model:"M3"};
const modeBPick={key:"bringatrailer",name:"Bring a Trailer",platformSlug:"bringatrailer",
  marketEvidence:{evidenceSales:9,windowDays:90,
    pricePremium:{type:"premium",gateType:"symmetric",percent:4,windowDays:90}}}; // <10 => modeB
const altCandB={key:"carsandbids",name:"Cars & Bids",platformSlug:"carsandbids",
  marketEvidence:{evidenceSales:4,windowDays:90}};

// ================= BUG 3: Mode B => no second hero card =================
Object.assign(globalThis.sellState,{
  resolvedVehicle:bmw, region:"US", state:"California", sellerPreference:"diy",
  sellDecision:{resultId:"bug3",evidence:{windowDays:90,ladder:{landed:{key:"any_year_model",thresholdMet:true}}}},
  sellOptions:[modeBPick,altCandB], partnerReferral:{}
});
check("Bug3: pick evidence is Mode B", v2Mode(modeBPick.marketEvidence)==="modeB", v2Mode(modeBPick.marketEvidence));
const sec=renderSecondaryPlatformV2(altCandB,modeBPick);
check("Bug3: secondary is inline text, not a hero card", /pv2-inline-alt/.test(sec)&&!/pv2-sec\b/.test(sec)&&!/Also worth a look/.test(sec), sec.slice(0,200));
const page3=renderResultV2Page()||"";
check("Bug3: full page renders the BaT pick card", /pcard-platform/.test(page3), page3.slice(0,120));
check("Bug3: full page has NO 'Also worth a look' secondary hero card", !/Also worth a look/.test(page3)&&!/pv2-sec\b/.test(page3), (page3.match(/Also worth a look|pv2-sec/)||[""])[0]);
check("Bug3: full page carries the inline alt line instead", /pv2-inline-alt/.test(page3)&&/Cars &(amp;)? Bids is also competitive/.test(page3), (page3.match(/pv2-inline-alt[^<]*<[^>]*>[^<]*/)||[""])[0].slice(0,160));

// ================= BUG 4: PS leads (unsure + high ask) =================
const partner={slug:"hows",name:"howS",displayName:"Howard Silvers",
  regions:["California","West Coast"],
  specialties:{makes:["BMW","Porsche"],segments:["bmw_m","porsche"],notes:"BMW and Porsche specialist (per howS)",
    profile_stats:[{text:"440+ enthusiast auctions represented",source:"partner_provided"}]},
  serviceClaims:[{text:"Based in the Bay Area",source:"partner_provided"}], verified:{trackedSales:440}};
const modeAPick={key:"bringatrailer",name:"Bring a Trailer",platformSlug:"bringatrailer",
  marketEvidence:{evidenceSales:9,windowDays:90,pricePremium:{type:"premium",gateType:"symmetric",percent:18,windowDays:90}}};
Object.assign(globalThis.sellState,{
  resolvedVehicle:{year:2016,make:"BMW",model:"M3",trim:"Competition"}, region:"US", state:"New York",
  sellerPreference:"unsure",
  sellDecision:{resultId:"bug4",evidence:{windowDays:90,ladder:{landed:{key:"any_year_model",thresholdMet:true}}}},
  sellOptions:[modeAPick],
  partnerReferral:{partner, eligible:false, secondary:true, matchType:"specialty",
    leadOnValue:true, leadValueUsd:75000, valueLeadThresholdUsd:40000}
});
const page4=renderResultV2Page()||"";
const iPS=page4.indexOf("pcard-ps"), iPick=page4.indexOf("pcard-platform");
check("Bug4: PowerSeller card renders", iPS>=0, "no pcard-ps");
check("Bug4: platform pick card renders", iPick>=0, "no pcard-platform");
check("Bug4: PS LEADS (PS card before platform card) for unsure + $75k ask", iPS>=0&&iPick>=0&&iPS<iPick, `iPS=${iPS} iPick=${iPick}`);
check("Bug4: bridge line 'run the sale yourself' present (PS-leads variant)", /run the sale yourself/.test(page4), (page4.match(/pv2-bridge[^<]*<[^>]*>[^<]*/)||[""])[0].slice(0,120));

// Control: a DIY preference must NOT lead with PS (platform holds the pick).
Object.assign(globalThis.sellState,{sellerPreference:"diy"});
const page4diy=renderResultV2Page()||"";
const dPS=page4diy.indexOf("pcard-ps"), dPick=page4diy.indexOf("pcard-platform");
check("Bug4 control: DIY suppresses PS lead (platform first, PS below or absent)", dPick>=0&&(dPS<0||dPick<dPS), `dPS=${dPS} dPick=${dPick}`);

// Control: non-US never renders a PS card even with a partner + high ask.
Object.assign(globalThis.sellState,{sellerPreference:"unsure",region:"UK",state:"London"});
const pageUK=renderResultV2Page()||"";
check("Bug4 control: non-US (UK) renders NO PowerSeller card (hard gate)", !/pcard-ps/.test(pageUK), (pageUK.match(/pcard-ps/)||[""])[0]);

console.log(fails?`\n${fails} FAILURE(S)`:"\nVERIFY-BUGS ALL PASS");
process.exit(fails?1:0);
