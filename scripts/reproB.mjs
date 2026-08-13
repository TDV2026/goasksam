// Failure B repro: 2019 Porsche 911 Carrera, asking 165, segment band $50k-$150k.
// Verifies (B2) no price-level opinion / "higher end" copy, and (B1) no
// duplicate or near-duplicate bullets on the pick card.
import fs from "node:fs";
const noop = () => {};
const elem = () => new Proxy(function(){}, { get:(t,p)=>{ if(p==="style")return{}; if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false}; if(["value","textContent","id","className","innerHTML"].includes(p))return""; if(["appendChild","setAttribute","addEventListener","remove","append","scrollIntoView","focus"].includes(p))return noop; if(p==="querySelector")return()=>elem(); if(p==="querySelectorAll")return()=>[]; return elem(); }, apply:()=>elem() });
globalThis.window = globalThis;
globalThis.document = { getElementById:()=>elem(), querySelector:()=>elem(), querySelectorAll:()=>[], createElement:()=>elem(), addEventListener:noop, body:elem() };
try { Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true}); } catch {}
globalThis.location = { hostname:"localhost", protocol:"file:" };
globalThis.localStorage = { getItem:()=>null, setItem:noop };
globalThis.fetch = async () => ({ ok:true, json:async()=>({}) });

const html = fs.readFileSync("index.html","utf8");
const files = [...html.matchAll(/<script src="js[^"]*\/([^"]+)"><\/script>/g)].map(m=>"js/"+m[1]);
const script = files.map(f=>fs.readFileSync(f,"utf8")).join("\n");

const test = `
console.log("=== FAILURE B repro: 2019 Porsche 911 Carrera, asking 165 ===");
sellState.price="165";
sellState.resolvedVehicle={make:"Porsche",model:"911",year:2019,trim:"Carrera"};
sellState.timeline="Want it gone fast";
sellState.sellDecision={evidence:{windowDays:180}};
sellState.allRouteOptions=[];

console.log("estimatedTargetPrice():", estimatedTargetPrice(), "(expect 165000)");
console.log("bandCeiling('$50k to $150k'):", bandCeiling("$50k to $150k"), "(expect 150000)");
console.log("sellThroughLine (asking>ceiling):", JSON.stringify(sellThroughLine({percent:80,band:"$50k to $150k"})), "(expect null)");
console.log("sellThroughLine (asking within band, band $150k to $300k):", JSON.stringify(sellThroughLine({percent:80,band:"$150k to $300k"})));

// B1: the two transcript bullets are near-duplicates?
const t2="This price point is at the higher end for the 911, so comparable sales inform how I ranked the platforms. On a fast timeline, this is still the market I'd trust to move it.";
const t3="This price point is at the higher end for the 911, so comparable sales inform how I ranked the platforms.";
console.log("bulletsSimilar(transcript b2,b3):", bulletsSimilar(t2,t3), "(expect true)");
console.log("dedupeBullets keeps:", dedupeBullets([{text:t2},{text:t3}]).length, "of 2 (expect 1)");

// Integration: build the pick card bullets for this exact car.
const route={platform:"bringatrailer",label:"bringatrailer",marketEvidence:{evidenceSales:3,segmentSellThrough:{percent:80,band:"$50k to $150k"},pricePremium:null}};
let bullets=null;
try{ bullets=primaryReasonBullets(route,null); }catch(e){ console.log("primaryReasonBullets threw:", e.message); }
console.log("\\nPICK CARD BULLETS:");
(bullets||[]).forEach((b,i)=>console.log("  "+(i+1)+". "+b.text));
const texts=(bullets||[]).map(b=>b.text);
const joined=texts.join(" || ").toLowerCase();
console.log("\\n  violation 'higher end'/'price point' present?", /higher end|price point/.test(joined), "(expect false)");
let dup=false;
for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++)if(bulletsSimilar(texts[i],texts[j]))dup=true;
console.log("  any near-duplicate bullets?", dup, "(expect false)");
`;
(0, eval)(script + "\n" + test);
