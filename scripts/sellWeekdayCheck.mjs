// /sell states no price-median weekday (Oct 20 2026, Lane D, Lane F's decision): the Sep 29 rebuild dropped "{scope}
// have closed strongest on {day}s, N% above other days" from the pick card as wrong (weekend and weekday prices sit
// within about 1% matched); the best-day tile reads the reserve sell-through. The server still sends dayAdvantage
// (api/sellerDecision.js), so this renders every V2 surface that could state it - the follow-up answers (recommend,
// tradeoffs, run the listing), the chat's fact source, the pick card and the whole result page - twice per car, with
// and without dayAdvantage, through the real page scripts on DOM stubs. Each must be byte-identical and carry no
// weekday claim. No network.
//   node scripts/sellWeekdayCheck.mjs
// Run by scripts/prePush.mjs.
import fs from "node:fs";
const noop=()=>{};
const elem=()=>new Proxy(function(){},{get:(t,p)=>{if(p==="style")return{};if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false};if(["value","textContent","id","className","innerHTML"].includes(p))return"";if(["appendChild","setAttribute","removeAttribute","addEventListener","removeEventListener","remove","focus","blur","scrollIntoView","insertBefore","replaceWith","click"].includes(p))return noop;if(p==="querySelectorAll")return()=>[];if(p==="querySelector"||p==="closest")return()=>null;return elem();},apply:()=>elem()});
globalThis.window=globalThis;
globalThis.document={getElementById:()=>elem(),querySelector:()=>elem(),querySelectorAll:()=>[],createElement:()=>elem(),addEventListener:noop,body:elem()};
try{Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true});}catch{}
globalThis.location={hostname:"localhost",protocol:"file:",search:""};
globalThis.localStorage={getItem:()=>null,setItem:noop,removeItem:noop};
globalThis.fetch=async()=>({ok:true,json:async()=>({})});
const html=fs.readFileSync("public/index.html","utf8");
const files=[...html.matchAll(/<script src="js[^"]*\/([^"]+)"><\/script>/g)].map(m=>"public/js/"+m[1]);
(0,eval)(files.map(f=>fs.readFileSync(f,"utf8")).join("\n")+"\nglobalThis.sellState=sellState;");

let pass=0, fail=0;
const ok=(c,m)=>{ if(c)pass++; else { fail++; console.log("FAIL", m); } };
const WEEKDAY=/(closed|close) strongest on|above other days|(Mon|Tues|Wednes|Thurs|Fri)days?\b/i;
const day={weekday:"Monday",liftPercent:17,scope:"model",sample:30,sales:8};
const CARS={
  "2005 BMW M3, DIY, prices close (modeB)": { v:{year:2005,make:"BMW",model:"M3"}, pref:"diy", pp:{type:"premium",gateType:"symmetric",percent:4,windowDays:180}, landed:"any_year_model" },
  "2011 Porsche 911 Carrera, unsure, a premium (modeA)": { v:{year:2011,make:"Porsche",model:"911"}, pref:"unsure", pp:{type:"premium",gateType:"symmetric",percent:22,windowDays:180}, landed:"generation_trim" },
  "1969 Chevrolet Camaro, DIY, concentration": { v:{year:1969,make:"Chevrolet",model:"Camaro"}, pref:"diy", pp:{type:"market_dominance",windowDays:180}, landed:"exact_year_model" },
};
const surfaces=()=>{
  const out={};
  const c=v2Composition();
  out.recommend=v2ComposeRecommend()||""; out.tradeoffs=v2ComposeTradeoffs()||""; out.runListing=v2ComposeRunListing()||"";
  out.facts=JSON.stringify(c.pick?v2PickFacts(c.pick):null);
  out.chatFacts=(typeof sellChatEvidenceSummary==="function"?sellChatEvidenceSummary():"")||"";
  out.card=(c.pick?renderPickCardV2(c.pick):"")||"";
  out.page=(typeof renderResultV2Page==="function"?renderResultV2Page():"")||"";
  return out;
};
for(const [name,x] of Object.entries(CARS)){
  const run=withDay=>{
    const ev={evidenceSales:12,modelSales:12,windowDays:180,pricePremium:x.pp,...(withDay?{dayAdvantage:day}:{})};
    const bat={key:"bringatrailer",name:"Bring a Trailer",platformSlug:"bringatrailer",marketEvidence:ev};
    const cb={key:"carsandbids",name:"Cars & Bids",platformSlug:"carsandbids",marketEvidence:{evidenceSales:4,windowDays:180,...(withDay?{dayAdvantage:{...day,weekday:"Wednesday"}}:{})}};
    Object.assign(globalThis.sellState,{resolvedVehicle:x.v,region:"US",state:"California",country:"the United States",countryRoutable:true,sellerPreference:x.pref,timeline:null,carName:`${x.v.year} ${x.v.make} ${x.v.model}`,
      sellDecision:{resultId:"wk-"+name,vehicle:x.v,evidence:{windowDays:180,ladder:{landed:{key:x.landed,thresholdMet:true}}}},sellOptions:[bat,cb],partnerReferral:{}});
    return surfaces();
  };
  const a=run(true), b=run(false);
  for(const k of Object.keys(a)){
    ok(a[k]===b[k], `${name}: ${k} is the same with and without dayAdvantage`);
    ok(!WEEKDAY.test(String(a[k]).replace(/<[^>]+>/g," ")), `${name}: ${k} states no weekday (${(String(a[k]).replace(/<[^>]+>/g," ").match(new RegExp(".{0,60}("+WEEKDAY.source+").{0,30}","i"))||[""])[0]})`);
  }
  ok(a.runListing.length>0 && /^I would list your .+ on Bring a Trailer\. Lead with honest, well lit photos and a straight writeup of history and condition, and let the platform's audience do the rest\.$/.test(a.runListing), `${name}: the run-the-listing answer is the platform line and the listing advice (${a.runListing.slice(0,160)})`);
}
// The OLD card composer (composeCard, result-copy.js): the one source of every non-primary option card's headline and
// bullets, and of the primary card too when gas_cardv2 is "0" (result.js renderOptionCard). Same rule: with or without
// dayAdvantage, byte-identical and no weekday claim, for the pick and a non-primary card, each car.
for(const [name,x] of Object.entries(CARS)){
  const route=withDay=>({ key:"bringatrailer", label:"Bring a Trailer", platform:"bringatrailer", name:"Bring a Trailer", platformSlug:"bringatrailer",
    marketEvidence:{ label:"Bring a Trailer", platform:"bringatrailer", evidenceSales:24, modelSales:24, relevantSales:24, windowDays:180, pricePremium:x.pp,
      ...(withDay?{ dayAdvantage:{ ...day, liftPercent:22, sample:40, sales:12, window:180 } }:{}) } });
  for(const isPick of [true,false]){
    const opts={ isPick, isVolumeLeader:isPick, sellerWantsSpeed:false };
    const a=JSON.stringify(composeCard(x.v,route(true),opts)), b=JSON.stringify(composeCard(x.v,route(false),opts));
    const which=isPick?"pick (gas_cardv2=0)":"non-primary card";
    ok(a===b, `${name}: old composer ${which} is the same with and without dayAdvantage`);
    ok(!WEEKDAY.test(a), `${name}: old composer ${which} states no weekday (${(a.match(new RegExp(".{0,60}("+WEEKDAY.source+").{0,30}","i"))||[""])[0]})`);
  }
}
// The chat's number guard no longer accepts a weekday percentage as one of the card's numbers.
ok(v2GuardChatAnswer("Bring a Trailer is the platform, and 2005 M3s closed 15% higher on Mondays.").ok===false, "the chat guard refuses a weekday percentage");
console.log(`sellWeekdayCheck: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
