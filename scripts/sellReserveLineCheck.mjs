// The old card's reserve line (Oct 20 2026, Lane F's decision): never a dollar figure for a reserve effect. The old
// composer states the V2 tile's own sentence verbatim (v2Reserve over marketEvidence.reserveInsight) or nothing; a
// seeded reserveContext dollar cell ("averaged $14,474 higher") never prints. Real page scripts on DOM stubs.
//   node scripts/sellReserveLineCheck.mjs
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
const v={year:1995,make:"Porsche",model:"911"};
Object.assign(globalThis.sellState,{ resolvedVehicle:v, sellDecision:{resultId:"rl",vehicle:v,evidence:{windowDays:180,ladder:{landed:{key:"generation_model",thresholdMet:true}}}}, region:"US" });
const RC={ data_month:"2026-09", delta_pct:9.4, delta_dollars:14474, n_with:40, n_without:30 };
const RI=o=>({ ok:true, scopeLabel:"993 911s", deltaPct:7, nReserve:14, nNoReserve:16, ...o });
const card=(ev,isPick=true)=>composeCard(v,{ key:"bringatrailer", label:"bringatrailer", platform:"bringatrailer", name:"Bring a Trailer", platformSlug:"bringatrailer", marketEvidence:{ label:"bringatrailer", platform:"bringatrailer", evidenceSales:24, modelSales:24, windowDays:180, pricePremium:{type:"premium",gateType:"symmetric",percent:22,windowDays:180}, ...ev } },{ isPick, isVolumeLeader:isPick, sellerWantsSpeed:false });
const txt=c=>JSON.stringify(c);
for (const isPick of [true,false]) {
  const which=isPick?"pick":"non-primary card";
  const onlyDollar=card({ reserveContext:RC }, isPick);
  ok(!/\$\s?[\d,]+/.test(txt(onlyDollar)) && !/14,474|averaged/.test(txt(onlyDollar)), `${which}: a seeded dollar reserve cell prints no dollar figure (${txt(onlyDollar).slice(0,160)})`);
  ok(!/reserve/i.test(txt(onlyDollar.bullets||[])), `${which}: no reserve line without the server's reserveInsight`);
  const both=card({ reserveContext:RC, reserveInsight:RI({}) }, isPick);
  const want=v2Reserve({ reserveInsight:RI({}) }).body;
  ok((both.bullets||[]).some(b=>b.text===want) && !/\$\s?[\d,]+/.test(txt(both)), `${which}: the reserve line is the V2 tile's own sentence, verbatim (${want})`);
  const even=card({ reserveInsight:RI({ deltaPct:1.2 }) }, isPick);
  ok((even.bullets||[]).some(b=>/within a few points of each other/.test(b.text)) && !/similar money/.test(txt(even)), `${which}: under 3 points, the V2 tile's "within a few points" sentence`);
  const thin=card({ reserveInsight:RI({ nReserve:7 }) }, isPick);
  ok(!/reserve/i.test(txt(thin.bullets||[])), `${which}: under 8 a side, no reserve line (the V2 tile's own gate)`);
}
console.log(`sellReserveLineCheck: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
