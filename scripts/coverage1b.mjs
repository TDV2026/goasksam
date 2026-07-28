// 1b live validation: runs the deployed evidence pipeline (prod sellerDecision)
// and the local composeCard for each car, dumping the composed cards and the
// coverage metrics. Usage: node scripts/coverage1b.mjs [audit|coverage]
import fs from "node:fs";
const BASE=process.env.FLOW_BASE||"https://goasksam.vercel.app";
const MODE=process.argv[2]||"audit";
const noop=()=>{};
const elem=()=>new Proxy(function(){},{get:(t,p)=>{if(p==="style")return{};if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false};if(["value","textContent","id","className","innerHTML"].includes(p))return"";if(["appendChild","setAttribute","addEventListener","remove","append","scrollIntoView","focus"].includes(p))return noop;if(p==="querySelector")return()=>elem();if(p==="querySelectorAll")return()=>[];return elem();},apply:()=>elem()});
globalThis.window=globalThis;globalThis.document={getElementById:()=>elem(),querySelector:()=>elem(),querySelectorAll:()=>[],createElement:()=>elem(),addEventListener:noop,body:elem()};
try{Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true});}catch{}
globalThis.location={hostname:"localhost",protocol:"file:"};globalThis.localStorage={getItem:()=>null,setItem:noop};
const realFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({})});
const html=fs.readFileSync("index.html","utf8");
const files=[...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m=>m[1]);
const script=files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
(0,eval)(script+"\nglobalThis.sellState=sellState;globalThis.composeCard=composeCard;globalThis.composerLandedScope=composerLandedScope;globalThis.sellerWantsSpeed=sellerWantsSpeed;");

const AUDIT=["2018 Porsche 911 Carrera","1995 Porsche 911 Turbo","1967 Chevrolet Camaro SS","2018 BMW M3","1971 Porsche 911"];
const COVERAGE=["2016 Porsche 911 GT3","1973 Porsche 911","1988 Porsche 911 Carrera","2004 Porsche 911 GT3","1995 BMW M3","2008 BMW M3","2021 BMW M3","1969 Chevrolet Camaro","1970 Chevrolet Chevelle SS","1966 Ford Bronco","1993 Ford Bronco","1994 Land Rover Defender","2001 Acura NSX","1994 Toyota Supra","1967 Chevrolet Corvette","1990 Mazda Miata","1985 Toyota Land Cruiser","1972 Datsun 240Z","2000 Honda S2000","1969 Dodge Charger"];
const cars=MODE==="coverage"?[...AUDIT,...COVERAGE]:AUDIT;

function parseVehicle(raw){const y=(raw.match(/\b(19|20)\d{2}\b/)||[])[0];const rest=raw.replace(/\b(19|20)\d{2}\b/,"").trim().split(/\s+/);return {year:y?Number(y):null,make:rest[0],model:rest[1],trim:rest.slice(2).join(" ")||null};}

const rows=[];
for(const raw of cars){
  let d;
  try{
    const res=await realFetch(`${BASE}/api/sellerDecision`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({car:{raw,region:"US",state:"California",targetPrice:"120000",timeline:"No rush, right result only"}})});
    d=await res.json();
  }catch(e){ rows.push({raw,err:e.message}); continue; }
  sellState.resolvedVehicle=d.vehicle||parseVehicle(raw);
  sellState.sellDecision=d;sellState.region="US";sellState.state="California";sellState.timeline="No rush, right result only";sellState.routingReason=d.decision?.routingReason||null;
  const allRoutes=(d.decision?.routeFit?.routes||[]);
  let routable=allRoutes.filter(r=>r.routable!==false);
  // Same data-pick reorder as result.js: highest cleared positive delta leads.
  if(sellState.routingReason!=="speed"){
    const cleared=r=>{const p=r&&r.marketEvidence&&r.marketEvidence.pricePremium;return p&&p.gateType==="symmetric"&&Number.isFinite(p.percent)&&p.percent>=10?p.percent:-1;};
    let best=null,bestPct=-1;for(const r of routable){const pct=cleared(r);if(pct>bestPct){best=r;bestPct=pct;}}
    if(best&&bestPct>=10){if(routable[0]!==best)routable=[best,...routable.filter(r=>r!==best)];}
    else{let deep=null,deepN=-1;for(const r of routable){const n=Number(r.marketEvidence&&r.marketEvidence.evidenceSales||0);if(n>deepN){deep=r;deepN=n;}}if(deep&&deepN>0&&routable[0]!==deep)routable=[deep,...routable.filter(r=>r!==deep)];}
  }
  // Fix harness mode classification to match the composer (Mode B needs |%|<10).
  const pick=routable[0];const alt=routable[1];
  const scope=composerLandedScope();
  const pickCard=pick?composeCard(sellState.resolvedVehicle,pick,{isPick:true,sellerWantsSpeed:sellerWantsSpeed(),routingReason:sellState.routingReason,landedScope:scope}):null;
  const altCard=alt?composeCard(sellState.resolvedVehicle,alt,{isPick:false,sellerWantsSpeed:sellerWantsSpeed(),routingReason:sellState.routingReason,landedScope:scope}):null;
  const p=pick?.marketEvidence?.pricePremium;
  const mode=!pick?"none":(p&&(p.type==="market_dominance"||(p.gateType==="symmetric"&&p.percent>=10))?"A":(p&&p.gateType==="symmetric"&&Number.isFinite(p.percent)&&Math.abs(p.percent)<10?"B":"honest"));
  const win=p?p.windowDays:null;
  const pickPlatform=pick?(pick.platform||pick.label):null;
  const bulletCount=(pickCard?pickCard.bullets.length:0)+(pickCard&&pickCard.headline?1:0);
  rows.push({raw,status:d.status,mode,win,pickPlatform,bulletCount,pickCard,altCard});
  if(MODE==="audit"){
    console.log(`\n===== ${raw} (status=${d.status}, mode=${mode}, window=${win}, pick=${pickPlatform}) =====`);
    const wk=pick?.marketEvidence?.dayAdvantage;if(wk)console.log(`  weekday sample: ${wk.weekday} +${wk.liftPercent}% (${wk.scope} scope, n=${wk.sample||"?"} in 180d)`);
    if(pickCard){console.log(`  PICK headline: ${pickCard.headline?.text||"(none)"}`);pickCard.bullets.forEach(b=>console.log(`    - [${b.provenance}] ${b.text}`));}
    if(altCard){console.log(`  ALT (${alt.platform||alt.label}) headline: ${altCard.headline?.text||"(none)"}`);altCard.bullets.forEach(b=>console.log(`    - [${b.provenance}] ${b.text}`));}
  }
}

if(MODE==="coverage"){
  const ok=rows.filter(r=>r.status==="decision_ready");
  const withFinding=ok.filter(r=>r.mode==="A"||r.mode==="B");
  const twoPlus=ok.filter(r=>r.bulletCount>=2);
  const wins={45:0,90:0,180:0};ok.forEach(r=>{if(r.win)wins[r.win]=(wins[r.win]||0)+1;});
  const nonBaT=ok.filter(r=>(r.mode==="A")&&r.pickPlatform&&r.pickPlatform!=="bringatrailer");
  const banned=ok.filter(r=>{const t=[r.pickCard,r.altCard].filter(Boolean).flatMap(c=>[c.headline?.text,...c.bullets.map(b=>b.text)]).join(" ");return /sell-?through|higher end/i.test(t);});
  console.log(`\n===== COVERAGE (${ok.length} cars with decisions of ${rows.length} attempted) =====`);
  console.log(`Mode A or B headline: ${withFinding.length}/${ok.length} (${Math.round(withFinding.length/ok.length*100)}%)`);
  console.log(`2+ evidence lines:    ${twoPlus.length}/${ok.length}`);
  console.log(`Window distribution:  45d=${wins[45]||0} 90d=${wins[90]||0} 180d=${wins[180]||0}`);
  console.log(`Mode-A pick non-BaT:  ${nonBaT.length}/${withFinding.filter(r=>r.mode==="A").length} A-mode cards (${nonBaT.map(r=>r.raw+":"+r.pickPlatform).join(", ")||"none"})`);
  console.log(`Banned strings:       ${banned.length} cards (expect 0)`);
  const thin=ok.filter(r=>r.mode==="honest"||r.bulletCount<=1).slice(0,10);
  console.log(`Thinnest cards:       ${thin.map(r=>r.raw+"("+r.mode+")").join(", ")||"none"}`);
}
