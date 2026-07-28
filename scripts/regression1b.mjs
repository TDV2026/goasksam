// Phase 1b: the composer is the single source of card text. Deterministic unit
// coverage of composeCard: Mode A/B/honest headline, weekday scope+window,
// unverified suppression, provenance on every line, and the banned-string ban.
import fs from "node:fs";
const noop=()=>{};
const elem=()=>new Proxy(function(){},{get:(t,p)=>{if(p==="style")return{};if(p==="classList")return{add:noop,remove:noop,toggle:noop,contains:()=>false};if(["value","textContent","id","className","innerHTML"].includes(p))return"";if(["appendChild","setAttribute","addEventListener","remove","append","scrollIntoView","focus"].includes(p))return noop;if(p==="querySelector")return()=>elem();if(p==="querySelectorAll")return()=>[];return elem();},apply:()=>elem()});
globalThis.window=globalThis;globalThis.document={getElementById:()=>elem(),querySelector:()=>elem(),querySelectorAll:()=>[],createElement:()=>elem(),addEventListener:noop,body:elem()};
try{Object.defineProperty(globalThis,"navigator",{value:{language:"en-US"},configurable:true});}catch{}
globalThis.location={hostname:"localhost",protocol:"file:"};globalThis.localStorage={getItem:()=>null,setItem:noop};globalThis.fetch=async()=>({ok:true,json:async()=>({})});
const html=fs.readFileSync("index.html","utf8");
const files=[...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m=>m[1]);
const script=files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
const bootstrap="globalThis.sellState=sellState;globalThis.composeCard=composeCard;";
(0,eval)(script+"\n"+bootstrap);

let failures=0;
const check=(name,ok,detail="")=>{console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+detail}`);if(!ok)failures++;};
sellState.sellDecision={evidence:{ladder:{landed:{key:"exact_year_model"}}}};
const BANNED=/sell-?through|higher end|price point|remains viable|not the clearest|a car like this|strong option\b|real signal/i;
function allText(c){return [c.headline&&c.headline.text,...(c.bullets||[]).map(b=>b.text)].filter(Boolean).join(" || ");}
function everyLineHasProvenance(c){const items=[c.headline,...(c.bullets||[])].filter(Boolean);return items.length>0&&items.every(i=>i.provenance);}

// Mode A: cleared delta headline + model weekday
const A=composeCard({make:"Chevrolet",model:"Camaro",year:1967},{label:"hagerty",platform:"hagerty",speedToList:"medium_fast",marketEvidence:{evidenceSales:8,pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"model"},dayAdvantage:{weekday:"Friday",liftPercent:16,scope:"model",window:180}}},{isPick:true,landedScope:"model"});
check("1b Mode A: delta headline names platform, %, scope, window", /Hagerty.*16% higher than the other platforms.*over the past 90 days/.test(A.headline.text), A.headline.text);
check("1b Mode A: weekday bullet states scope + 180d window", A.bullets.some(b=>/1967 Camaros.*Fridays.*16% above other days.*over the past 180 days/.test(b.text)), JSON.stringify(A.bullets));
check("1b Mode A: every line has provenance", everyLineHasProvenance(A));

// Mode B (speed): similarity + speed reason
const B=composeCard({make:"BMW",model:"M3",year:2018},{label:"bringatrailer",platform:"bringatrailer",speedToList:"fast",marketEvidence:{evidenceSales:9,pricePremium:{gateType:"symmetric",percent:5,windowDays:90,scope:"model"}}},{isPick:true,sellerWantsSpeed:true,routingReason:"speed",landedScope:"model"});
check("1b Mode B: similarity headline + speed reason", /within a small percentage across the top platforms over the past 90 days, so speed decides/.test(B.headline.text), B.headline.text);
check("1b Mode B: every line has provenance", everyLineHasProvenance(B));

// Honest: no delta
const H=composeCard({make:"Porsche",model:"911",year:1995},{label:"pcarmarket",platform:"pcarmarket",marketEvidence:{evidenceSales:2,pricePremium:null}},{isPick:true,landedScope:"model"});
check("1b Honest: states limited sales + landed scope, no template", /Recent sales for the Porsche 911 are limited\. Analysis ran at model level\./.test(H.headline.text), H.headline.text);

// Unverified: make-level, no delta/weekday even when present
const U=composeCard({make:"BMW",model:"351RG",year:2002,unverified:true},{label:"bringatrailer",platform:"bringatrailer",marketEvidence:{evidenceSales:5,pricePremium:{gateType:"symmetric",percent:40,windowDays:45,scope:"model"},dayAdvantage:{weekday:"Tuesday",liftPercent:12,scope:"make",window:180}}},{isPick:true,landedScope:"make"});
check("1b Unverified: make-level headline, no verified-style delta/weekday", /Analysis ran at make level/.test(U.headline.text) && !/%/.test(allText(U)) && !/strongest on/.test(allText(U)), allText(U));

// Make-scope weekday labeled, no %
const Mk=composeCard({make:"Porsche",model:"911",year:2019},{label:"carsandbids",platform:"carsandbids",marketEvidence:{evidenceSales:1,dayAdvantage:{weekday:"Tuesday",liftPercent:17,scope:"make",window:180}}},{isPick:false,landedScope:"model"});
check("1b Make weekday: 'as a whole' labeled + 180d window", Mk.bullets.some(b=>/Porsches as a whole have closed strongest on Tuesdays over the past 180 days/.test(b.text)), JSON.stringify(Mk.bullets));

// Banned strings appear in no composed output
for(const [n,c] of [["A",A],["B",B],["H",H],["U",U],["Mk",Mk]]) check(`1b: no banned strings in card ${n}`, !BANNED.test(allText(c)), allText(c));

console.log(failures?`\n${failures} FAILURE(S)`:"\n1B ALL PASS");
process.exit(failures?1:0);
