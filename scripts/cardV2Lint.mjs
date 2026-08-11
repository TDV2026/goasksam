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
  {id:"sell-through",re:/sell-?through|%\s*sold\b/i},
  // Item 5: no fee/commission FIGURE ($ or %) on any surface. Fee-context only, so
  // legit card percentages ("25% above other days", "7% higher") stay clean.
  {id:"fee-figure",re:/(?:\$\s?\d[\d,]*|\d+(?:\.\d+)?\s?%)[^.]{0,24}\b(fee|fees|commission|commissions|cut|charges?|rate|rates)\b|\b(fee|fees|commission|commissions|cut|charges?|rate|rates|takes?|charging)\b[^.]{0,24}(?:\$\s?\d[\d,]*|\d+(?:\.\d+)?\s?%)/i}
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
(0,eval)(files.map(f=>fs.readFileSync(f,"utf8")).join("\n")+"\nglobalThis.sellState=sellState;globalThis.v2Because=v2Because;globalThis.v2Why=v2Why;globalThis.v2Weekday=v2Weekday;globalThis.v2Reserve=v2Reserve;globalThis.v2Audience=v2Audience;globalThis.v2ScopePlural=v2ScopePlural;globalThis.v2RungRef=v2RungRef;globalThis.v2RungNoun=v2RungNoun;globalThis.CLAUSE_A=CLAUSE_A;globalThis.CLAUSE_B=CLAUSE_B;globalThis.CLAUSE_C=CLAUSE_C;globalThis.v2WindowLabel=v2WindowLabel;globalThis.psvReasonNote=psvReasonNote;globalThis.psvPara=psvPara;globalThis.psvWhyBullets=psvWhyBullets;globalThis.psvValueLine=psvValueLine;globalThis.psvPoss=psvPoss;globalThis.psvIntro=psvIntro;globalThis.psvSpecTile=psvSpecTile;globalThis.psvClaim=psvClaim;globalThis.psvWheelhouse=psvWheelhouse;globalThis.psvWheelhouseList=psvWheelhouseList;globalThis.psvPron=psvPron;globalThis.psvTrustLines=psvTrustLines;globalThis.v2CarDisplay=v2CarDisplay;globalThis.v2ScopeAttr=v2ScopeAttr;globalThis.renderPowerSellerCardV2=renderPowerSellerCardV2;globalThis.v2GuardChatAnswer=v2GuardChatAnswer;globalThis.v2Composition=typeof v2Composition==='function'?v2Composition:function(){return null};");

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
const slots={scope:v2ScopePlural(v),rungRef:v2RungRef(v),rungWord:v2RungNoun(),platform:"Bring a Trailer",make:"Porsche",delta:12,window:"90 days"};

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

// ---- STAGE 4: PowerSeller copy across all three match-reason variants ----
for(const mt of ["specialty","region","generalist"]){
  for(const make of ["Porsche","BMW","Ferrari"]){
    const first="howS";
    const note=psvReasonNote(mt,make,first), para=psvPara(mt,make,first), bl=psvWhyBullets(mt,make,first);
    const rn=clean(note), rp=clean(para);
    check(`ps.reasonNote.${mt}.${make} clean`, rn.ok, rn.detail);
    check(`ps.para.${mt}.${make} clean`, rp.ok, rp.detail);
    check(`ps.para.${mt}.${make} names the car (For this ${make})`, para.includes(`For this ${make}`), para);
    check(`ps.whyBullets.${mt}.${make} 3 bullets, all clean`, bl.length===3&&bl.every(b=>clean(b).ok), bl.map(b=>clean(b).detail).filter(d=>!/^\s*::/.test(d)).join(" | "));
    // "decide with you on the platform" framing present, never "a car like this" filler
    check(`ps.whyBullets.${mt}.${make} has decide-with-you framing`, bl.some(b=>/with you/.test(b)), bl.join(" | "));
  }
}
// cascading price window: 270 rung reads "nine months", tighter rungs read days
check("windowLabel 270 -> nine months", v2WindowLabel(270)==="nine months", v2WindowLabel(270));
check("windowLabel 90 -> 90 days", v2WindowLabel(90)==="90 days", v2WindowLabel(90));
check("windowLabel 180 -> 180 days", v2WindowLabel(180)==="180 days", v2WindowLabel(180));
{ const s9=Object.assign({},slots,{window:v2WindowLabel(270)}); const a9=CLAUSE_A(s9);
  check("CLAUSE_A at 270 says 'over the past nine months', clean", /over the past nine months$/.test(a9)&&clean(a9).ok, a9); }

// value-preference line: declarative, service framing, no money figure, no "gets you more"
const vl=psvValueLine("howS");
check("ps.valueLine clean", clean(vl).ok, clean(vl).detail);
check("ps.valueLine no money/earn/get-more", !/\$|\bmore money\b|gets? you|will get|you'?ll (earn|get)/i.test(vl), vl);
check("ps.valueLine mentions value + name", /value/i.test(vl)&&/howS/.test(vl), vl);
// Item 2c: possessive is always {Name}'s, including s-ending names.
check("ps.poss always 's (Chris's)", psvPoss("Chris")==="Chris's", psvPoss("Chris"));
check("ps.poss s-ending name (James's)", psvPoss("James")==="James's", psvPoss("James"));

// ---- Item 1/1e: claim truth against the ROSTER (wheelhouse), not the car ----
const MARQUES=["BMW","Porsche","Mercedes-Benz","Mercedes","Audi","Jaguar","Ferrari","Lexus","Toyota","Chevrolet","Ford","Nissan","Honda"];
const chrisMakes=["BMW","Porsche","Mercedes-Benz","Jaguar","Ferrari","Lexus"];
// Chris: wheelhouse == his true marques.
const chris={specialties:{makes:chrisMakes,wheelhouse:{marques:chrisMakes,models:[]}}};
// Howard: matching `makes` is BLOATED (includes Audi/Toyota/Ford for the ladder)
// but his true wheelhouse is Porsche + the Vintage Mustangs model entry.
const howard={specialties:{makes:["Porsche","Audi","Toyota","Ford","BMW","Jaguar"],
  wheelhouse:{marques:["Porsche"],models:[{label:"Vintage Mustangs",make:"Ford",model:"Mustang"}]}}};
// roster-truth: any marque NAMED AS A CLAIM ("{X} is/are one of ...'s strongest
// areas") must be in the wheelhouse. The car reference ("For this Audi TT") is
// exempt - naming the car is not claiming a specialty.
const MARQUE_RE=/\b(BMW|Porsche|Mercedes-Benz|Mercedes|Audi|Jaguar|Ferrari|Lexus|Toyota|Chevrolet|Ford|Nissan|Honda)\b/g;
const rosterTruth=(text,wh)=>{
  const allowed=(wh.marques||[]).map(m=>m.toLowerCase());
  const m=/^(.*?) (?:is|are) one of .+?'s strongest areas/.exec(text);
  const claimPart=m?m[1]:""; // brand-free intro -> no claim -> passes
  return (claimPart.match(MARQUE_RE)||[]).every(n=>allowed.includes(n.toLowerCase()));
};
// tile truth: the tile IS the claim, so its whole value is checked.
const tileTruth=(tile,wh)=>{
  const allowed=(wh.marques||[]).map(m=>m.toLowerCase());
  return (String(tile).match(MARQUE_RE)||[]).every(n=>allowed.includes(n.toLowerCase()));
};
// a) Chris + Porsche -> marque claim, singular, Chris's
const cP=psvClaim(chris,{make:"Porsche",model:"911"});
const introP=psvIntro(chris,"Chris",cP,"Porsche 911");
check("intro (Chris/Porsche) leads with Porsche + Chris's", /^Porsche is one of Chris's strongest areas\./.test(introP), introP);
check("tile (Chris/Porsche) = Porsche", psvSpecTile(chris,{make:"Porsche",model:"911"})==="Porsche", psvSpecTile(chris,{make:"Porsche"}));
check("intro (Chris/Porsche) roster-truth", rosterTruth(introP,chris.specialties.wheelhouse), introP);
// Intro reason copy (locked): nationwide + locality variants.
const NAT=(f)=>f+" works with sellers across the country and handles the whole job: choosing the right platform, presenting it properly and managing the sale from start to finish.";
const LOC=(car,state,poss,subj)=>"Your "+car+" is in "+state+", right in "+poss+" patch, and "+subj+" handles the whole job: choosing the right platform, presenting it properly and managing the sale from start to finish.";
const prevState=sellState.state;
// b) no marque + no locality -> NATIONWIDE reason (chris has no regions here).
sellState.state="";
const introCA=psvIntro(chris,"Chris",psvClaim(chris,{make:"Audi",model:"TT"}),"Audi TT");
check("intro (Chris/Audi, no locality) = nationwide reason", introCA===NAT("Chris"), introCA);
check("tile (Chris/Audi) = first 3 wheelhouse marques (item 4 cap)", psvSpecTile(chris,{make:"Audi",model:"TT"})==="BMW, Porsche, Mercedes-Benz", psvSpecTile(chris,{make:"Audi"}));
// b2) LOCALITY reason when the car's state IS in the partner's roster regions.
const localP={specialties:{wheelhouse:{marques:[]},pronoun:{obj:"him",subj:"he",poss:"his"}},regions:["Florida","Georgia","Nationwide"]};
sellState.state="Florida";
check("intro (locality) = 'in Florida, right in Chris's patch, and he handles'", psvIntro(localP,"Chris",psvClaim(localP,{make:"Audi",model:"TT"}),"Audi TT")===LOC("Audi TT","Florida","Chris's","he"), psvIntro(localP,"Chris",null,"Audi TT"));
// LOCALITY-TRUTH: a state NOT in the partner's regions falls back to nationwide.
sellState.state="New York";
check("locality line only when state IS in roster regions (roster-truth)", psvIntro(localP,"Chris",psvClaim(localP,{make:"Audi",model:"TT"}),"Audi TT")===NAT("Chris"), psvIntro(localP,"Chris",null,"Audi TT"));
sellState.state=prevState;
// c) Mercedes-Benz plural-trap: singular
const introM=psvIntro(chris,"Chris",psvClaim(chris,{make:"Mercedes-Benz",model:"SL"}),"Mercedes-Benz SL");
check("intro (Mercedes-Benz) singular, no plural trap", /^Mercedes-Benz is one of Chris's strongest areas\./.test(introM)&&!/Mercedes-Benzs/.test(introM), introM);
// d) REGRESSION: Howard + Audi. `makes` has Audi but wheelhouse does NOT -> the
// claim must be brand-free and the tile must NOT read "Audi" (truth vs ROSTER).
const introHA=psvIntro(howard,"Howard",psvClaim(howard,{make:"Audi",model:"TT"}),"Audi TT");
const tileHA=psvSpecTile(howard,{make:"Audi",model:"TT"});
check("intro (Howard/Audi) = nationwide reason (no false marque)", introHA===NAT("Howard"), introHA);
check("intro (Howard/Audi) claims NO Audi (roster-truth; car ref exempt)", rosterTruth(introHA,howard.specialties.wheelhouse), introHA);
check("tile (Howard/Audi) = wheelhouse, not 'Audi'", tileHA==="Porsche, Vintage Mustangs"&&tileTruth(tileHA,howard.specialties.wheelhouse), tileHA);
// Item 4: honest-list tile caps at 3 entries + drops "unusual automotive items"
const howDisplay={specialties:{wheelhouse:{marques:["Porsche"],models:[],display:["Air-cooled Porsche","911s","vintage Mustangs","unusual automotive items"]}}};
check("tile display caps at 3 + excludes 'unusual automotive items'", psvSpecTile(howDisplay,{make:"Audi",model:"TT"})==="Air-cooled Porsche, 911s, vintage Mustangs", psvSpecTile(howDisplay,{make:"Audi"}));
const howNotes={specialties:{notes:"Air-cooled Porsche, 911s, vintage Mustangs, unusual automotive items (per howS)"}};
check("tile notes-fallback caps at 3 + excludes junk", psvSpecTile(howNotes,{make:"Audi",model:"TT"})==="Air-cooled Porsche, 911s, vintage Mustangs", psvSpecTile(howNotes,{make:"Audi"}));
// d2) ABSENT WHEELHOUSE (roster SQL not run): bloated `makes` includes the car
// marque, but with no wheelhouse the claim must be brand-free (fail-honest), NOT
// fall back to makes. Locks STEP 2.
const noWh={specialties:{makes:["Porsche","Audi","Toyota","Ford"]}}; // no wheelhouse
check("absent wheelhouse -> no claim (brand-free), never makes", psvClaim(noWh,{make:"Audi",model:"TT"})===null, JSON.stringify(psvClaim(noWh,{make:"Audi",model:"TT"})));
check("absent wheelhouse intro = nationwide reason", psvIntro(noWh,"X",psvClaim(noWh,{make:"Audi",model:"TT"}),"Audi TT")===NAT("X"), "");
// e) MODEL-LEVEL: Howard + Ford Mustang -> "Vintage Mustangs are one of Howard's"
const cHM=psvClaim(howard,{make:"Ford",model:"Mustang"});
const introHM=psvIntro(howard,"Howard",cHM,"Ford Mustang");
check("claim (Howard/Mustang) = model level", cHM&&cHM.level==="model"&&cHM.label==="Vintage Mustangs", JSON.stringify(cHM));
check("intro (Howard/Mustang) 'Vintage Mustangs are one of Howard's'", /^Vintage Mustangs are one of Howard's strongest areas\./.test(introHM), introHM);
check("tile (Howard/Mustang) = Vintage Mustangs", psvSpecTile(howard,{make:"Ford",model:"Mustang"})==="Vintage Mustangs", psvSpecTile(howard,{make:"Ford",model:"Mustang"}));
// Pronoun (item 5): default him, roster-overridable to her/their.
check("pronoun default = him", psvPron({})?.obj==="him", JSON.stringify(psvPron({})));
check("pronoun override = her", psvPron({specialties:{pronoun:{obj:"her",poss:"her",subj:"she"}}}).obj==="her", "");
const herP={specialties:{pronoun:{obj:"her",subj:"she",poss:"her"},wheelhouse:{marques:["Porsche"]}}};
const introHer=psvIntro(herP,"Robin",psvClaim(herP,{make:"Porsche",model:"911"}),"Porsche 911");
check("intro threads pronoun (marque match, I'd trust her)", /I'd trust her to/.test(introHer), introHer);
// locality pronoun: "she handles"
const herLocP={specialties:{pronoun:{obj:"her",subj:"she",poss:"her"},wheelhouse:{marques:[]}},regions:["Texas"]};
{ const ps=sellState.state; sellState.state="Texas"; check("intro (locality) threads subject pronoun (she handles)", /and she handles the whole job/.test(psvIntro(herLocP,"Robin",null,"Audi TT")), psvIntro(herLocP,"Robin",null,"Audi TT")); sellState.state=ps; }

// ---- Item 3a: an unfilled {placeholder} must never render ----
const phPartner={slug:"ph",name:"PH",display_name:"P H",specialties:{makes:["Porsche"],wheelhouse:{marques:["Porsche"]},
  profile_stats:[{text:"400+ auctions represented"},{text:"{sellThroughPercent}% sell-through rate"},{text:"Specializes in: Porsche and other European marques"}]},regions:["Nationwide"],serviceClaims:[],platforms:[]};
check("psvTrustLines drops the {placeholder} line", !psvTrustLines(phPartner).some(t=>/\{/.test(t)), JSON.stringify(psvTrustLines(phPartner)));
globalThis.sellState.resolvedVehicle={make:"Porsche",model:"911",year:2019};
globalThis.sellState.sellDecision={vehicle:{make:"Porsche",model:"911",year:2019},evidence:{ladder:{landed:{key:"exact_year_model"}}}};
globalThis.sellState.partnerReferral={eligible:true,partner:phPartner}; globalThis.psvPartner=()=>phPartner;
const phCard=renderPowerSellerCardV2({lead:true})||"";
check("rendered card has NO unfilled placeholder (item 3a)", !/\{[^}]+\}/.test(phCard), (phCard.match(/\{[^}]+\}/g)||[]).join(","));

// ---- Item 4c: at most 4 tiles (drop weakest) ----
const fivePartner={slug:"f5",name:"F5",display_name:"F Five",specialties:{makes:["Porsche"],wheelhouse:{marques:["Porsche"]},
  profile_stats:[{text:"400+ auctions represented"},{text:"Top 10% of all Bring a Trailer sellers"}]},
  regions:["Nationwide"],serviceClaims:[{text:"Based in California"},{text:"Serves the West Coast"},{text:"Full-service prep in-house"}],platforms:[]};
globalThis.sellState.partnerReferral={eligible:true,partner:fivePartner}; globalThis.psvPartner=()=>fivePartner;
const fiveCard=renderPowerSellerCardV2({lead:true})||"";
const tileCount=(fiveCard.match(/pcard-ttile/g)||[]).length;
check("card renders at most 4 tiles (item 4c)", tileCount<=4, "tiles="+tileCount);
check("over-budget drops the weakest (Track record), keeps prep", /Preparation/.test(fiveCard)&&!/Track record/.test(fiveCard), "prep="+/Preparation/.test(fiveCard)+" trust="+/Track record/.test(fiveCard));

// ---- Item 5: fee figures can never reach a rendered PS card ----
// Seed a partner carrying a fee in referral terms + notes; render the real card.
globalThis.sellState.partnerReferral={ eligible:true, partner:{ slug:"feeguy", name:"FeeGuy", display_name:"Fee Guy",
  specialties:{makes:["Porsche"],notes:"Takes a 6% commission (per FeeGuy)",segments:[]}, regions:["Nationwide"],
  referralTerms:"6% on the first $100k, 5% after", serviceClaims:[], platforms:[] } };
globalThis.psvPartner=()=>sellState.partnerReferral.partner;
let cardHtml="";
try{ cardHtml=renderPowerSellerCardV2({lead:true})||""; }catch(e){ cardHtml="__ERR__"+e.message; }
check("PS card renders (no throw)", cardHtml.indexOf("__ERR__")!==0, cardHtml);
check("PS card carries NO fee figure (item 5)", clean(cardHtml).ok&&!/6%|5%|\$\s?100k/i.test(cardHtml), lintText(cardHtml).join(" ; ")+" :: contains-6%="+/6%/.test(cardHtml));

// ---- Item 5: chat guard blocks a fee figure ----
if(typeof v2GuardChatAnswer==="function"){
  const g1=v2GuardChatAnswer("He takes a 6% commission on the sale.");
  check("chat guard blocks '6% commission'", g1&&g1.ok===false, JSON.stringify(g1).slice(0,120));
  const g2=v2GuardChatAnswer("His fee is $2,500 flat.");
  check("chat guard blocks '$2,500 fee'", g2&&g2.ok===false, JSON.stringify(g2).slice(0,120));
}

// ---- Item 4c: tile-body copy length is the PRIMARY control (<=110 chars) ----
const tileBodies=[
  "Manages the entire auction end to end, prep through paperwork",
  "Based in Upper Makefield PA",
  "Serves Louisiana, Mississippi, Alabama, Florida, Georgia and Texas",
  "Full-service preparation: PDR, detailing and reconditioning handled in-house",
  "Nationwide professional photographer network",
  "Serves sellers nationwide","Based in New England","Based in the South"
];
for(const t of tileBodies) check("tile-body copy <=110 chars: "+t.slice(0,22), t.length<=110, t.length+" chars :: "+t);

// bridge lines between the two cards (order-aware, locked)
const bridgePS="If you'd rather run the sale yourself, here's where I'd go.";
const bridgePlat="Want it handled end to end instead? Here's who I'd trust with it.";
check("bridge (PS leads) lint-clean", clean(bridgePS).ok, clean(bridgePS).detail);
check("bridge (platform leads) lint-clean", clean(bridgePlat).ok, clean(bridgePlat).detail);

console.log(failures?`\n${failures} FAILURE(S)`:"\nCARD-V2-LINT ALL PASS");
process.exit(failures?1:0);
