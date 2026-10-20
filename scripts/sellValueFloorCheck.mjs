// The /sell value-floor note (Oct 20 2026, Lane F's decision): when a car is below the PowerSeller value floor and
// the seller leaned to having it handled, the note states the PowerSellers' focus and the route only: "[At your $X
// target, ]PowerSellers on GoAskSam focus on higher-value cars, so for this one, listing it yourself on {platform} is
// the route." No fee-value claim ("fee is worth") and no money outcome ("in your pocket", "take home", "eat into"),
// on the V2 page, the old card and the chat's PowerSeller note. Real page scripts on DOM stubs, plus a source read.
//   node scripts/sellValueFloorCheck.mjs
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
const BANNED=/fee is worth|worth what it costs|in your pocket|take home|eat into|puts more/i;
const v={year:2005,make:"Mazda",model:"MX-5 Miata"};
const page=(price,pref)=>{ Object.assign(globalThis.sellState,{ resolvedVehicle:v, carName:"2005 Mazda MX-5 Miata", region:"US", state:"California", sellerPreference:pref, price,
  sellDecision:{resultId:"vf",vehicle:v,evidence:{windowDays:180,ladder:{landed:{key:"generation_model",thresholdMet:true}}},decision:{partnerReferral:{eligible:false,conditions:{valueMet:false,segmentMet:true,regionMet:true}}}},
  partnerReferral:{eligible:false,conditions:{valueMet:false,segmentMet:true,regionMet:true}},
  sellOptions:[{ key:"bringatrailer", name:"Bring a Trailer", platformSlug:"bringatrailer", marketEvidence:{ evidenceSales:14, modelSales:14, windowDays:180 } }] });
  return (renderResultV2Page()||"").replace(/<[^>]+>/g," ").replace(/&#39;/g,"'").replace(/\s+/g," "); };
const withAsk=page("15000","unsure"), noAsk=page(null,"powerseller"), diy=page("15000","diy");
ok(/At your \$15,000 target, PowerSellers on GoAskSam focus on higher-value cars, so for this one, listing it yourself on Bring a Trailer is the route\./.test(withAsk), `V2 page with an asking price: the note in full (${(withAsk.match(/[^.]*PowerSellers on GoAskSam[^.]*\.[^.]*\./)||[""])[0]})`);
ok(/PowerSellers on GoAskSam focus on higher-value cars, so for this one, listing it yourself on Bring a Trailer is the route\./.test(noAsk) && !/At your/.test(noAsk), "V2 page without an asking price: no $X opening");
ok(!/PowerSellers on GoAskSam focus/.test(diy), "V2 page, a DIY seller: no value-floor note");
for (const [n,t] of [["with an asking price",withAsk],["without",noAsk]]) ok(!BANNED.test(t), `V2 page ${n}: no fee-value or money-outcome words`);
// The old card and the chat note, read from source (both build the same sentence).
for (const f of ["public/js/result.js","public/js/entry.js","public/js/result-v2.js"]) {
  const s=fs.readFileSync(f,"utf8");
  ok(/PowerSellers on GoAskSam focus on higher-value cars, so for this one, listing it yourself on \$\{?[\w]+\}?\s*\+?\s*"?\s*is the route\.|PowerSellers on GoAskSam focus on higher-value cars, so for this one, listing it yourself on "\+_plat\+" is the route\./.test(s), `${f}: the value-floor sentence in its new form`);
  ok(!/fee is worth what it costs|likely puts more in your pocket|eat into more of what you'd take home/.test(s), `${f}: none of the removed claims`);
}
console.log(`sellValueFloorCheck: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
