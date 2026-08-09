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
(0,eval)(files.map(f=>fs.readFileSync(f,"utf8")).join("\n")+"\nglobalThis.sellState=sellState;globalThis.renderResultV2Page=renderResultV2Page;globalThis.renderSecondaryPlatformV2=renderSecondaryPlatformV2;globalThis.v2Mode=v2Mode;globalThis.renderPickCardV2=renderPickCardV2;globalThis.renderPowerSellerCardV2=renderPowerSellerCardV2;globalThis.v2Composition=v2Composition;globalThis.v2PickFacts=v2PickFacts;globalThis.v2FollowupIntent=v2FollowupIntent;globalThis.v2ComposeTradeoffs=v2ComposeTradeoffs;globalThis.v2ComposeRunListing=v2ComposeRunListing;globalThis.v2ComposeRecommend=v2ComposeRecommend;globalThis.v2GuardChatAnswer=v2GuardChatAnswer;globalThis.v2SafeFallback=v2SafeFallback;globalThis.v2RungLabel=v2RungLabel;");

let fails=0;
const check=(name,ok,detail="")=>{console.log(`${ok?"PASS":"FAIL"}  ${name}${ok?"":"  ->  "+String(detail).slice(0,200)}`);if(!ok)fails++;};

// V2_RULES lint (same rules the card composers are held to) for chat composers.
const V2_RULES=[
  {id:"em-dash",re:/—/},{id:"en-dash",re:/–/},{id:"dollar",re:/\$\s?\d/},
  {id:"hedge",re:/\b(around|about|roughly|approximately)\b/i},
  {id:"reserve-causal",re:/\bcaused\b|because of the reserve|the reserve helped|will get you|you'?ll earn|\bboosts\b|increases your price/i},
  {id:"filler",re:/\ba car like this\b|remains viable|\bstrong option\b|\breal signal\b/i},
  {id:"sell-through",re:/sell-?through|%\s*sold\b/i}
];
const lintText=t=>V2_RULES.filter(r=>r.re.test(String(t||""))).map(r=>r.id);
const cleanC=t=>{const v=lintText(t);return {ok:v.length===0,detail:v.join(" ; ")+" :: "+t};};
// PowerSeller copy: definitive price claims and fee talk are banned everywhere;
// qualitative impact claims ("can have a significant impact") are allowed.
const PS_RULES=[
  {id:"fee-talk",re:/\bfee\b|\bcommission\b|\byou pay\b|\bpaid\b/i},
  {id:"price-claim",re:/\b(more money|gets? you (more|a better)|worth more|higher price|nets? you|earns? (it|its)|pays for itself|maximi[sz]e|top dollar)\b/i},
  {id:"dollar",re:/\$\s?\d/}
];
const psClean=t=>{const v=[...V2_RULES,...PS_RULES].filter(r=>r.re.test(String(t||""))).map(r=>r.id);return {ok:v.length===0,detail:v.join(" ; ")+" :: "+t};};
// Internal jargon a seller must never see.
const JARGON=/\b(value gate|threshold|the gate\b|gate (passed|closed|outcome)|gated|composition|landed rung|\brung\b|evidence basis|leadonvalue|segment match|secondary card)\b/i;

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

// ============ CHAT COMPOSERS: exact 2005 BMW M3 PS-led scenario ============
// Ingo leads; BaT platform card; weekday tile has raw lift 17 (card rounds -> 15%),
// Monday, model-level scope (-> "M3s"). This is the reported contradiction case.
const bat={key:"bringatrailer",name:"Bring a Trailer",platformSlug:"bringatrailer",
  marketEvidence:{evidenceSales:9,windowDays:180,
    pricePremium:{type:"premium",gateType:"symmetric",percent:4,windowDays:180}, // modeB (prices close)
    dayAdvantage:{weekday:"Monday",liftPercent:17,scope:"model",sample:30,sales:8}}};
const cb={key:"carsandbids",name:"Cars & Bids",platformSlug:"carsandbids",marketEvidence:{evidenceSales:4,windowDays:180}};
const ingo={slug:"genau-auto-werks",name:"GenauAutoWerks",displayName:"Ingo Schmoldt",
  regions:["California","Bay Area"],
  specialties:{makes:[],segments:["collector","classic_european"],notes:"Collector and specialty vehicles (per GenauAutoWerks)",profile_stats:[{text:"440+ enthusiast auctions represented",source:"partner_provided"}]},
  serviceClaims:[{text:"Based in the Bay Area",source:"partner_provided"}], verified:{trackedSales:440}};
Object.assign(globalThis.sellState,{
  resolvedVehicle:{year:2005,make:"BMW",model:"M3"}, region:"US", state:"California",
  sellerPreference:"unsure", carName:"2005 BMW M3",
  sellDecision:{resultId:"m3",vehicle:{year:2005,make:"BMW",model:"M3"},evidence:{windowDays:180,ladder:{landed:{key:"any_year_model",thresholdMet:true}}}},
  sellOptions:[{key:"specialist",name:"Ingo Schmoldt"},bat,cb],
  partnerReferral:{partner:ingo, eligible:false, secondary:true, matchType:"specialty", leadOnValue:true, leadValueUsd:55000}
});

// Composition sanity: PS leads, no secondary platform card (psLead suppresses it).
const comp=v2Composition();
check("M3: composition = PS leads, secondary suppressed", comp.psLead===true&&comp.secondaryRendered===false, `psLead=${comp.psLead} secondary=${comp.secondaryRendered}`);

// Card-identical: the pick CARD tile and v2PickFacts agree on the weekday number/scope.
const pf=v2PickFacts(bat);
const cardHTML=renderPickCardV2(bat)||"";
check("M3 card-identical: v2PickFacts weekday = 15% Monday, scope 'M3s'", pf.weekday&&pf.weekday.pct===15&&pf.weekday.day==="Monday"&&pf.weekday.scope==="M3s", JSON.stringify(pf.weekday));
check("M3 card-identical: the rendered card tile shows the SAME 15% (not raw 17)", /15% above other days/.test(cardHTML)&&!/17%/.test(cardHTML), (cardHTML.match(/[^>]*% above other days/)||[""])[0].slice(0,80));

// "compare the tradeoffs" -> Ingo vs DIY-on-BaT, NEVER platform vs platform, NEVER C&B.
check("intent: 'compare the tradeoffs' -> tradeoffs", v2FollowupIntent("compare the tradeoffs")==="tradeoffs");
const tradeoffs=v2ComposeTradeoffs()||"";
check("M3 tradeoffs: Ingo-vs-DIY-on-BaT (names Ingo + Bring a Trailer)", /Ingo/.test(tradeoffs)&&/Bring a Trailer/.test(tradeoffs), tradeoffs.slice(0,160));
check("M3 tradeoffs: NEVER names Cars & Bids (the unrendered alt)", !/Cars ?&? ?Bids|carsandbids/i.test(tradeoffs), tradeoffs);
check("M3 tradeoffs: effort + control + presentation framing", /hands on/.test(tradeoffs)&&/control/.test(tradeoffs)&&/present/.test(tradeoffs), tradeoffs.slice(0,200));
check("M3 tradeoffs: NO fee talk, NO price claims (re-voice)", psClean(tradeoffs).ok, psClean(tradeoffs).detail);
check("M3 tradeoffs: closes on the exact locked line", /Well presented listings, with great photography, videos, descriptions, and importantly great answers to all questions can have a significant impact on a listing\. That is why I highly recommend the right PowerSeller for the right listing\.$/.test(tradeoffs), tradeoffs.slice(-160));

// "how I'd run the listing" -> quotes Monday at the card's 15%, scope M3s, lint-clean.
check("intent: 'how would you run the listing' -> runlisting", v2FollowupIntent("how would you run the listing")==="runlisting");
const runListing=v2ComposeRunListing()||"";
check("M3 run-listing: lists on Bring a Trailer", /I would list your .*Bring a Trailer/.test(runListing), runListing.slice(0,120));
check("M3 run-listing: quotes Monday at the card's 15% (not 17), scope M3s", /M3s have closed strongest on Mondays, 15% above other days/.test(runListing)&&!/17%/.test(runListing), runListing);
check("M3 run-listing: lint-clean (no hedge/dash/dollar)", cleanC(runListing).ok, cleanC(runListing).detail);

// "what do you recommend" (3rd composer) -> PS-led = the PowerSeller.
check("intent: 'what do you recommend' -> recommend", v2FollowupIntent("what do you recommend")==="recommend");
check("intent: 'what would you do' -> recommend", v2FollowupIntent("what would you do")==="recommend");
const recommend=v2ComposeRecommend()||"";
check("M3 recommend (PS-led): answer IS Ingo, with BaT as where he runs it", /hand it to Ingo/.test(recommend)&&/Bring a Trailer/.test(recommend), recommend.slice(0,160));
check("M3 recommend: no fee talk / price claims / jargon", psClean(recommend).ok&&!JARGON.test(recommend), psClean(recommend).detail);

// Scope-label bug (2a): at an EXACT-year rung the prose reads "2018 M3s" while the
// tile used to read raw "M3". Both must now read the landed rung. Set an exact rung.
{
  const prevDecision=globalThis.sellState.sellDecision;
  const batExact={key:"bringatrailer",name:"Bring a Trailer",platformSlug:"bringatrailer",marketEvidence:{evidenceSales:9,windowDays:180,pricePremium:{type:"premium",gateType:"symmetric",percent:34,windowDays:180}}};
  Object.assign(globalThis.sellState,{resolvedVehicle:{year:2018,make:"BMW",model:"M3"},sellDecision:{resultId:"m3e",vehicle:{year:2018,make:"BMW",model:"M3"},evidence:{windowDays:180,ladder:{landed:{key:"exact_year_model",thresholdMet:true}}}},sellOptions:[batExact]});
  const exactScope=v2PickFacts(batExact).scope;
  const exactCard=renderPickCardV2(batExact)||"";
  check("scope label (2a): prose scope reads '2018 M3s' at the exact rung", exactScope==="2018 M3s", exactScope);
  check("scope label (2a): v2RungLabel exact rung = '2018 M3' (not raw 'M3')", v2RungLabel(globalThis.sellState.resolvedVehicle)==="2018 M3", v2RungLabel(globalThis.sellState.resolvedVehicle));
  check("scope label (2a): tile label now matches the rung ('2018 M3', not bare 'M3')", /pcard-mp">2018 M3<\/div><div class="pcard-ms">Analysis/.test(exactCard), (exactCard.match(/pcard-mp">[^<]*<\/div><div class="pcard-ms">Analysis/)||[""])[0].slice(0,80));
  // restore the model-level M3 scenario for the remaining checks
  Object.assign(globalThis.sellState,{resolvedVehicle:{year:2005,make:"BMW",model:"M3"},sellDecision:prevDecision,sellOptions:[{key:"specialist",name:"Ingo Schmoldt"},bat,cb]});
}

// OUTPUT GUARD (4d): contradictory LLM answers are replaced by a safe fallback.
Object.assign(globalThis.sellState,{sellerPreference:"unsure", partnerReferral:{partner:ingo, eligible:false, secondary:true, matchType:"specialty", leadOnValue:true}, sellOptions:[{key:"specialist",name:"Ingo Schmoldt"},bat,cb]});
check("guard: clean card-true answer passes", v2GuardChatAnswer("Bring a Trailer is the platform, and 2005 M3s closed 15% higher on Mondays.").ok===true);
check("guard: internal jargon -> replaced", v2GuardChatAnswer("The value gate was below threshold so it is only a secondary.").ok===false);
check("guard: hedged number -> replaced", v2GuardChatAnswer("Mondays close around 17% higher.").ok===false);
check("guard: re-derived % (17 not the card's 15) -> replaced", v2GuardChatAnswer("2005 M3s closed 17% higher on Mondays.").ok===false);
check("guard: unshown platform as a place to sell -> replaced", v2GuardChatAnswer("Honestly I would sell it on Cars & Bids instead.").ok===false);
check("guard: wrong lead (PS leads but says not a powerseller) -> replaced", v2GuardChatAnswer("This is not a powerseller situation, just list it yourself.").ok===false);
const gfb=v2GuardChatAnswer("The value gate failed.");
check("guard: PS-led fallback names Ingo + BaT, no jargon", /Ingo/.test(gfb.text)&&/Bring a Trailer/.test(gfb.text)&&!JARGON.test(gfb.text), gfb.text);

// Ingo trust enrichment (item 6): the two attributed claims render as trust lines.
const ingoTrust=Object.assign({},ingo,{specialties:Object.assign({},ingo.specialties,{profile_stats:[
  {text:"440+ enthusiast auctions represented",source:"partner_provided"},
  {text:"Top 10% of all Bring a Trailer sellers",source:"partner_provided"},
  {text:"Bring a Trailer community member since March 2011",source:"partner_provided"}]})});
Object.assign(globalThis.sellState,{partnerReferral:{partner:ingoTrust, secondary:true, matchType:"specialty", leadOnValue:true}});
const psCard=renderPowerSellerCardV2({lead:true,valueLed:true})||"";
check("Ingo trust: card shows 'Top 10% of all Bring a Trailer sellers'", /Top 10% of all Bring a Trailer sellers/.test(psCard), "missing");
check("Ingo trust: card shows 'community member since March 2011'", /community member since March 2011/.test(psCard), "missing");
check("Ingo trust: 440+ auctions still the trophy tile (not duplicated as trust)", /pcard-tnum">440\+/.test(psCard), "missing trophy");

// Platform-led Mode B control: no PS -> tradeoffs IS platform vs platform.
Object.assign(globalThis.sellState,{sellerPreference:"diy", partnerReferral:{}, sellOptions:[bat,cb]});
const compPlat=v2Composition();
const tradeoffsPlat=v2ComposeTradeoffs()||"";
check("Mode B platform-led: secondary renders, tradeoffs compares the two platforms", compPlat.secondaryRendered===true&&/Bring a Trailer/.test(tradeoffsPlat)&&/Cars &(amp;)? Bids/.test(tradeoffsPlat), tradeoffsPlat.slice(0,160));
check("Mode B platform-led: tradeoffs lint-clean", cleanC(tradeoffsPlat).ok, cleanC(tradeoffsPlat).detail);
check("Mode B platform-led recommend: answer IS the platform", /Bring a Trailer is where I would sell it/.test(v2ComposeRecommend()||""), v2ComposeRecommend());

console.log(fails?`\n${fails} FAILURE(S)`:"\nVERIFY-BUGS ALL PASS");
process.exit(fails?1:0);
