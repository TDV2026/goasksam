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
const files=[...html.matchAll(/<script src="js[^"]*\/([^"]+)"><\/script>/g)].map(m=>"js/"+m[1]);
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
check("1b Mode A: weekday bullet states scope + 180d window (lift 16 -> rounded to 15)", A.bullets.some(b=>/1967 Camaros.*Fridays.*15% above other days.*over the past 180 days/.test(b.text)), JSON.stringify(A.bullets));
check("1b Mode A: every line has provenance", everyLineHasProvenance(A));

// Mode B (speed): similarity + speed reason
const B=composeCard({make:"BMW",model:"M3",year:2018},{label:"bringatrailer",platform:"bringatrailer",speedToList:"fast",marketEvidence:{evidenceSales:9,pricePremium:{gateType:"symmetric",percent:5,windowDays:90,scope:"model"}}},{isPick:true,sellerWantsSpeed:true,routingReason:"speed",landedScope:"model"});
check("1b Mode B: similarity headline + speed reason (time to list)", /within a small percentage across the top platforms over the past 90 days, so how quickly you can get listed decides/.test(B.headline.text) && !/auction cycle/i.test(B.headline.text), B.headline.text);
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

// (3.5) Scope-label discipline: a rendered headline may name the requested
// model year ONLY when the finding was measured at the exact-year rung. Any-year
// and near-years findings drop the year; an absent scope fails closed (no
// mislabeled headline renders at all).
const V06={make:"Ford",model:"Focus",year:2006};
const EX=composeCard(V06,{label:"carsandbids",platform:"carsandbids",marketEvidence:{evidenceSales:8,pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"exact_year"}}},{isPick:true,landedScope:"model"});
check("3.5 exact-year delta NAMES the requested year, no all-years qualifier", /2006 Focus/.test(EX.headline.text)&&!/across all model years/.test(EX.headline.text), EX.headline.text);
const AY=composeCard(V06,{label:"carsandbids",platform:"carsandbids",marketEvidence:{evidenceSales:8,pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"any_year"}}},{isPick:true,landedScope:"model"});
check("3.5 any-year delta DROPS the year and says 'across all model years'", !/2006/.test(AY.headline.text)&&/Focus across all model years/.test(AY.headline.text), AY.headline.text);
const AYC=composeCard(V06,{label:"carsandbids",platform:"carsandbids",marketEvidence:{evidenceSales:12,pricePremium:{type:"market_dominance",gateType:"asymmetric",percent:null,marketShare:82,windowDays:90,scope:"any_year",platformSales:12,othersSales:3}}},{isPick:false,landedScope:"model"});
check("3.5 any-year concentration DROPS the year and says 'across all model years'", !/2006/.test(AYC.headline.text)&&/Focus sales across all model years have concentrated/.test(AYC.headline.text), AYC.headline.text);
const NY=composeCard(V06,{label:"carsandbids",platform:"carsandbids",marketEvidence:{evidenceSales:8,pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"near_years"}}},{isPick:true,landedScope:"model"});
check("3.5 near-years delta DROPS the requested year", !/2006/.test(NY.headline.text)&&/Focus/.test(NY.headline.text), NY.headline.text);
const NS=composeCard(V06,{label:"carsandbids",platform:"carsandbids",marketEvidence:{evidenceSales:12,pricePremium:{type:"market_dominance",gateType:"asymmetric",percent:null,marketShare:82,windowDays:90,platformSales:12,othersSales:3}}},{isPick:false,landedScope:"model"});
check("3.5 absent-scope finding FAILS CLOSED (no year-mislabeled headline)", !(NS.headline&&/2006 Focus/.test(NS.headline.text)), NS.headline&&NS.headline.text);

// Part 3 fix: a generation-scoped weekday with NO generation code (an unmapped
// handover year) must DROP the bullet, never interpolate "null" into the text.
const WG=composeCard({make:"Porsche",model:"911",year:1987},{label:"bringatrailer",platform:"bringatrailer",marketEvidence:{evidenceSales:8,pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"exact_year"},dayAdvantage:{weekday:"Friday",liftPercent:15,scope:"generation",generationCode:null,window:180,sample:20}}},{isPick:true,landedScope:"model"});
check("weekday: generation scope without a code drops the bullet, never renders 'null'", !/\bnull\b/i.test(allText(WG))&&!WG.bullets.some(b=>/have closed strongest/.test(b.text)), allText(WG));

// Banned strings appear in no composed output
for(const [n,c] of [["A",A],["B",B],["H",H],["U",U],["Mk",Mk],["EX",EX],["AY",AY],["AYC",AYC]]) check(`1b: no banned strings in card ${n}`, !BANNED.test(allText(c)), allText(c));

// (3.10) The render path routes every composed bullet through ONE filler gate
// (result.js). A known filler string injected into a composed card must not
// survive that gate, and the render site must actually be wired to it.
const inj=composeCard(V06,{label:"carsandbids",platform:"carsandbids",marketEvidence:{evidenceSales:8,pricePremium:{gateType:"symmetric",percent:16,windowDays:90,scope:"exact_year"}}},{isPick:true,landedScope:"model"});
inj.bullets.push({text:"Cars & Bids remains a strong option for a car like this",provenance:"injected-filler"});
const gated=evidenceOnlyBullets(inj.bullets); // identical gate to result.js render site
check("3.10 filler injected into a composed card does NOT survive the render gate", !gated.some(b=>/strong option|a car like this/.test(b.text))&&gated.length===inj.bullets.length-1, JSON.stringify(gated.map(b=>b.text)));
check("3.10 render site (result.js) is wired to the filler gate", /evidenceOnlyBullets\(c\.bullets\)/.test(fs.readFileSync("js/result.js","utf8")));

// (Part 3, July 2026) Evidence-allowlist SOURCE NAMING: no raw slug ever
// reaches a user, SOMO is always named in full, excluded consignment houses
// keep the generic label, and unknown slugs render the safe generic.
check("naming: Sotheby's Motorsport (SOMO) is named in full", platformDisplayName("sothebysmotorsport")==="Sotheby's Motorsport (SOMO)", platformDisplayName("sothebysmotorsport"));
check("naming: AutoHunter is named in full", platformDisplayName("autohunter")==="AutoHunter", platformDisplayName("autohunter"));
check("naming: rmsothebys stays 'a leading auction house'", platformDisplayName("rmsothebys")==="a leading auction house", platformDisplayName("rmsothebys"));
check("naming: gooding stays 'a leading auction house'", platformDisplayName("gooding")==="a leading auction house", platformDisplayName("gooding"));
check("naming: an unknown raw slug never leaks, renders the safe generic", platformDisplayName("barrettjackson")==="another auction marketplace", platformDisplayName("barrettjackson"));
check("naming: applying the map to an already-display name is idempotent", platformDisplayName("Hagerty Marketplace")==="Hagerty Marketplace", platformDisplayName("Hagerty Marketplace"));

console.log(failures?`\n${failures} FAILURE(S)`:"\n1B ALL PASS");
process.exit(failures?1:0);
