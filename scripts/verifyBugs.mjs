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
const files=[...html.matchAll(/<script src="js[^"]*\/([^"]+)"><\/script>/g)].map(m=>"js/"+m[1]);
(0,eval)(files.map(f=>fs.readFileSync(f,"utf8")).join("\n")+"\nglobalThis.sellState=sellState;globalThis.renderResultV2Page=renderResultV2Page;globalThis.renderSecondaryPlatformV2=renderSecondaryPlatformV2;globalThis.v2Mode=v2Mode;globalThis.renderPickCardV2=renderPickCardV2;globalThis.renderPowerSellerCardV2=renderPowerSellerCardV2;globalThis.v2Composition=v2Composition;globalThis.v2PickFacts=v2PickFacts;globalThis.v2FollowupIntent=v2FollowupIntent;globalThis.v2ComposeTradeoffs=v2ComposeTradeoffs;globalThis.v2ComposeRunListing=v2ComposeRunListing;globalThis.v2ComposeRecommend=v2ComposeRecommend;globalThis.v2GuardChatAnswer=v2GuardChatAnswer;globalThis.v2SafeFallback=v2SafeFallback;globalThis.v2RungLabel=v2RungLabel;globalThis.v2ActionViolation=v2ActionViolation;globalThis.v2ActionFallback=v2ActionFallback;globalThis.detectCountry=detectCountry;globalThis.COUNTRY_REGISTRY=COUNTRY_REGISTRY;globalThis.countryChips=countryChips;globalThis.registryRoutableRegion=registryRoutableRegion;globalThis.chipsHTML=chipsHTML;globalThis.currentChipStep=currentChipStep;globalThis.SELL_STEP_QUESTIONS=SELL_STEP_QUESTIONS;globalThis.outOfScopeEligible=outOfScopeEligible;globalThis.hasEnthusiastTrim=hasEnthusiastTrim;globalThis.modelHasTrimEscape=modelHasTrimEscape;globalThis.makeIsMainstream=makeIsMainstream;globalThis.makeIsEnthusiast=makeIsEnthusiast;globalThis.outOfScopeCopy=outOfScopeCopy;globalThis.v2RarityAllowed=v2RarityAllowed;globalThis.OUT_OF_SCOPE=OUT_OF_SCOPE;globalThis.v2RosterNameViolation=v2RosterNameViolation;globalThis.v2RosterFallback=v2RosterFallback;globalThis.powerSellerExplainerText=powerSellerExplainerText;globalThis.localPreRoute=localPreRoute;globalThis.askNextSellQuestion=askNextSellQuestion;globalThis.currentMissingVehicleDetail=currentMissingVehicleDetail;globalThis.resumeWizardAfterVehicle=resumeWizardAfterVehicle;globalThis.v2RarityAllowed=v2RarityAllowed;globalThis.modelIsMainstream=modelIsMainstream;");

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
check("M3 tradeoffs: closes on the exact locked line", /Well presented listings, with great photography, videos, descriptions, and importantly great answers to all questions can have a significant impact on a listing\. A good PowerSeller often knows exactly what's worth fixing before you list, and what isn't, which can matter as much as the platform itself\. That's why I highly recommend the right PowerSeller for the right listing\.$/.test(tradeoffs), tradeoffs.slice(-160));

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
  check("scope label (2a): v2RungLabel exact rung = 'This exact year' (H mapping)", v2RungLabel(globalThis.sellState.resolvedVehicle)==="This exact year", v2RungLabel(globalThis.sellState.resolvedVehicle));
  check("scope label (2a): tile label = 'This exact year', subtext 'Analysis scope'", /pcard-mp">This exact year<\/div><div class="pcard-ms">Analysis scope/.test(exactCard), (exactCard.match(/pcard-mp">[^<]*<\/div><div class="pcard-ms">Analysis[^<]*/)||[""])[0].slice(0,90));
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
check("Ingo trust: card shows the TOP trust fact 'Top 10% of all Bring a Trailer sellers'", /Top 10% of all Bring a Trailer sellers/.test(psCard), "missing");
// Polish 2: the trust tile is ONE line - the 'member since 2011' fact stays in data, off the card.
check("Ingo trust: 'community member since March 2011' is OFF the card (one-line tile)", !/community member since March 2011/.test(psCard), "should be absent");
check("Ingo trust: 440+ auctions still the trophy tile (not duplicated as trust)", /pcard-tnum">440\+/.test(psCard), "missing trophy");

// Platform-led Mode B control: no PS -> tradeoffs IS platform vs platform.
Object.assign(globalThis.sellState,{sellerPreference:"diy", partnerReferral:{}, sellOptions:[bat,cb]});
const compPlat=v2Composition();
const tradeoffsPlat=v2ComposeTradeoffs()||"";
check("Mode B platform-led: secondary renders, tradeoffs compares the two platforms", compPlat.secondaryRendered===true&&/Bring a Trailer/.test(tradeoffsPlat)&&/Cars &(amp;)? Bids/.test(tradeoffsPlat), tradeoffsPlat.slice(0,160));
check("Mode B platform-led: tradeoffs lint-clean", cleanC(tradeoffsPlat).ok, cleanC(tradeoffsPlat).detail);
check("Mode B platform-led recommend: answer IS the platform", /Bring a Trailer is where I would sell it/.test(v2ComposeRecommend()||""), v2ComposeRecommend());

// ============ #2 COUNTRY REGISTRY (single source of truth) ============
check("registry: chips = registry labels + 'Somewhere else' last", JSON.stringify(countryChips())===JSON.stringify(COUNTRY_REGISTRY.map(c=>c.chip).concat(["Somewhere else"]))&&countryChips().at(-1)==="Somewhere else", JSON.stringify(countryChips()));
check("registry: step-11 chips render from the registry", JSON.stringify(SELL_STEP_QUESTIONS[11].chips)===JSON.stringify(countryChips()), JSON.stringify(SELL_STEP_QUESTIONS[11].chips));
check("registry: Canada is NOT a chip (not routable, drops until curated)", !countryChips().some(c=>/canada/i.test(c)), JSON.stringify(countryChips()));
check("registry: Europe + Middle East ARE chips (routable today)", countryChips().includes("Europe")&&countryChips().includes("Middle East"));
check("registry: detectCountry('Germany') -> Europe, routable", detectCountry("Germany").region==="Europe"&&detectCountry("Germany").routable===true);
check("registry: detectCountry('Dubai') -> Middle East, routable", detectCountry("Dubai").region==="Middle East"&&detectCountry("Dubai").routable===true);
check("registry: detectCountry('Canada') -> not routable (honest line)", detectCountry("Canada").routable===false&&/canada/i.test(detectCountry("Canada").label));
check("registry: detectCountry('Brazil') -> not routable", detectCountry("Brazil").routable===false);
check("registry: registryRoutableRegion europe=true, middle east=true, canada=false", registryRoutableRegion("europe")===true&&registryRoutableRegion("middle east")===true&&registryRoutableRegion("canada")===false&&registryRoutableRegion("us")===false);

// ============ #3 CHIP DISPATCH BY STEP-ID ============
Object.assign(globalThis.sellState,{step:11});
const chipHtml=chipsHTML(["United States","Somewhere else"]);
check("chip dispatch: chips carry the current step-id", /data-chip-step="11"/.test(chipHtml)&&/handleChip\('United States',11\)/.test(chipHtml), chipHtml.slice(0,120));
check("chip dispatch: currentChipStep reads sellState.step", currentChipStep()===11);
Object.assign(globalThis.sellState,{step:1});
check("chip dispatch: after step moves (11->1), a step-11 chip no longer matches", currentChipStep()===1&&Number(11)!==currentChipStep());

// ============ #4 GUARD: ALLOWED-ACTIONS VOCABULARY ============
Object.assign(globalThis.sellState,{sellerPreference:"unsure", region:"US", state:"California", resolvedVehicle:{year:2005,make:"BMW",model:"M3"}, partnerReferral:{partner:ingo, secondary:true, matchType:"specialty", leadOnValue:true}, sellOptions:[{key:"specialist",name:"Ingo Schmoldt"},bat,cb], sellDecision:{resultId:"m3",vehicle:{year:2005,make:"BMW",model:"M3"},evidence:{windowDays:180,ladder:{landed:{key:"any_year_model",thresholdMet:true}}}}});
check("guard action: 'hit submit and your details go to Ingo' -> violation", v2ActionViolation("Just hit submit and your details go to Ingo.")===true);
check("guard action: 'we'll forward your details' -> violation", v2ActionViolation("From there we'll forward your details to the PowerSeller.")===true);
check("guard action: 'blast to multiple partners' -> violation", v2ActionViolation("We blast your car to multiple partners.")===true);
check("guard action: 'the platform will contact you' -> violation", v2ActionViolation("The platform will reach out to you after that.")===true);
check("guard action: allowed 'request an introduction, he contacts you' -> NOT a violation", v2ActionViolation("You can request an introduction to Ingo and he will contact you directly.")===false);
check("guard action: allowed 'continue with Bring a Trailer to list it yourself' -> NOT a violation", v2ActionViolation("Continue with Bring a Trailer to list it yourself.")===false);
const av=v2GuardChatAnswer("Hit submit and your details go straight to Ingo.");
check("guard: an action violation is replaced by the actions fallback", av.ok===false&&/request an introduction to Ingo/.test(av.text)&&/list it yourself/.test(av.text), av.text.slice(0,160));
check("guard: the actions fallback names only real actions, no submit/forward", !/submit|forward|blast|goes to|go to Ingo/i.test(v2ActionFallback())&&/request an introduction/.test(v2ActionFallback()), v2ActionFallback().slice(0,160));

// ============ OUT-OF-SCOPE GATE (detector logic) ============
const NOW=new Date().getFullYear();
const elig=(v,c)=>outOfScopeEligible(v,c);
// verdict = eligible AND no enthusiast trim AND (postTrim, or model has no escape)
const verdict=(v,c)=>elig(v,c)&&!hasEnthusiastTrim(v)&&true; // postTrim
check("oos: 2016 Camry (Toyota, count 0) -> eligible + verdict OUT", elig({year:2016,make:"Toyota",model:"Camry"},0)===true&&verdict({year:2016,make:"Toyota",model:"Camry"},0)===true);
check("oos: 1988 Camry (age>25) -> NOT eligible (age guard)", elig({year:1988,make:"Toyota",model:"Camry"},0)===false);
check("oos: 1957 Chevrolet Bel Air (age>25, mainstream, 0 archive) -> NOT eligible", elig({year:1957,make:"Chevrolet",model:"Bel Air"},0)===false);
check("oos: Pontiac (not on mainstream list) -> NOT eligible (fail-open)", elig({year:2016,make:"Pontiac",model:"G6"},0)===false&&makeIsMainstream("Pontiac")===false);
check("oos: count >= 20 -> NOT eligible (in scope via presence)", elig({year:2016,make:"Toyota",model:"Camry"},25)===false);
check("oos: count null (unknown) -> NOT eligible (fail-open)", elig({year:2016,make:"Toyota",model:"Camry"},null)===false);
check("oos: no year -> NOT eligible (fail-open)", elig({make:"Toyota",model:"Camry"},0)===false);
check("oos: 2017 Mustang GT350 -> trim escape (never out)", hasEnthusiastTrim({year:2017,make:"Ford",model:"Mustang",trim:"GT350"})===true&&verdict({year:2017,make:"Ford",model:"Mustang",trim:"GT350"},0)===false);
check("oos: 1994 Supra (enthusiast token in model) -> escape / and BMW/enthusiast unaffected", hasEnthusiastTrim({make:"Toyota",model:"Supra"})===true);
check("oos: Mustang has a trim escape (wait for trim); Camry does not", modelHasTrimEscape("Mustang")===true&&modelHasTrimEscape("Camry")===false);
// preTrim vs postTrim: a Corolla (escape model) with no trim yet waits; with an economy trim it goes out
check("oos preTrim: escape model with no trim waits (not refused pre-trim)", (elig({year:2018,make:"Toyota",model:"Corolla"},0)&&!hasEnthusiastTrim({year:2018,make:"Toyota",model:"Corolla"})&&modelHasTrimEscape("Corolla"))===true /* -> preTrim returns false, waits */);
// locked copy
const copy=outOfScopeCopy({year:2016,make:"Toyota",model:"Camry"});
check("oos copy: names the car + CarMax + Carvana + Facebook Marketplace", /2016 Toyota Camry/.test(copy)&&/CarMax/.test(copy)&&/Carvana/.test(copy)&&/Facebook Marketplace/.test(copy), copy.slice(0,80));
check("oos copy: no em/en dash, ends on the Marketplace line (no escape hatch)", !/[—–]/.test(copy)&&/there myself\.$/.test(copy.trim()), copy.slice(-60));

// ============ RARITY WORDING RULE ============
const rarity=(v,c)=>{ Object.assign(globalThis.sellState,{resolvedVehicle:v,archiveModelCount:c,sellDecision:null}); return v2RarityAllowed(); };
check("rarity: Merkur (1988, >25yr) -> rarity allowed", rarity({year:1988,make:"Merkur",model:"XR4Ti"},3)===true);
check("rarity: 2013 Ferrari 458 (enthusiast + archive>=1) -> rarity allowed", rarity({year:2013,make:"Ferrari",model:"458"},40)===true);
check("rarity: 2019 Audi A6 (enthusiast make, 0 archive) -> NEUTRAL (never rare)", rarity({year:2019,make:"Audi",model:"A6"},0)===false);
check("rarity: 2016 Camry passing nothing -> NEUTRAL", rarity({year:2016,make:"Toyota",model:"Camry"},0)===false);
// Porsche 911 splits by TRIM (Aug 2026): base Carrera/Targa are mainstream volume
// (never rare); halo trims stay rarity-eligible. Age >25 still earns it regardless.
check("rarity: 2015 Porsche 911 (base, no trim) -> NEUTRAL (mainstream volume)", rarity({year:2015,make:"Porsche",model:"911"},87)===false);
check("rarity: 2015 Porsche 911 Carrera S -> NEUTRAL (mainstream)", rarity({year:2015,make:"Porsche",model:"911",trim:"Carrera S"},87)===false);
check("rarity: 2023 Porsche 911 GT3 RS -> rarity allowed (halo trim)", rarity({year:2023,make:"Porsche",model:"911",trim:"GT3 RS"},87)===true);
check("rarity: 2023 Porsche 911 Weissach -> rarity allowed (halo package)", rarity({year:2023,make:"Porsche",model:"911",trim:"Weissach"},87)===true);
check("rarity: 1973 Porsche 911 (base but >25yr) -> rarity allowed (age)", rarity({year:1973,make:"Porsche",model:"911"},87)===true);

// ============ PARTNER-NAME RULE + FEE LANGUAGE ============
// Empty composition (pre-wizard / out-of-scope): ANY roster name is a violation.
Object.assign(globalThis.sellState,{partnerReferral:{}, sellerPreference:null, sellDecision:null, sellOptions:[], resolvedVehicle:null});
check("roster: 'per howS his fee is a percentage' -> violation (empty composition)", v2RosterNameViolation("Per howS, his fee is usually a percentage.")===true);
check("roster: names Ingo Schmoldt with no partner rendered -> violation", v2RosterNameViolation("You could ask Ingo Schmoldt to handle it.")===true);
check("roster: generic 'a PowerSeller' -> NOT a violation", v2RosterNameViolation("A PowerSeller manages the whole sale for you.")===false);
check("roster: fallback (empty comp) names no partner + points to car entry", !ROSTER_NAMES_RE().test(v2RosterFallback())&&/what you are selling/i.test(v2RosterFallback()), v2RosterFallback());
// When a partner IS rendered, ITS name is allowed but a DIFFERENT partner is not.
Object.assign(globalThis.sellState,{sellerPreference:"unsure", region:"US", state:"California", resolvedVehicle:{year:2005,make:"BMW",model:"M3"}, partnerReferral:{partner:ingo, secondary:true, matchType:"specialty", leadOnValue:true}, sellOptions:[{key:"specialist",name:"Ingo Schmoldt"},bat,cb], sellDecision:{resultId:"m3",vehicle:{year:2005,make:"BMW",model:"M3"},evidence:{windowDays:180,ladder:{landed:{key:"any_year_model",thresholdMet:true}}}}});
check("roster: rendered Ingo named -> allowed", v2RosterNameViolation("I would hand it to Ingo.")===false);
check("roster: a DIFFERENT partner (howS) named while Ingo is rendered -> violation", v2RosterNameViolation("Actually howS would be better.")===true);
check("guard: roster leak routed through v2GuardChatAnswer -> replaced", v2GuardChatAnswer("You should really use howS for this.").ok===false);
// Fee language (curated surfaces): no partner names, no definitive fee figure.
const psExplain=powerSellerExplainerText();
check("fee: 'what is a PowerSeller' new fee ending, no partner names, no dash", /How they.?re paid varies/.test(psExplain)&&!ROSTER_NAMES_RE().test(psExplain)&&!/[—–]/.test(psExplain)&&!/\$\s?\d/.test(psExplain), psExplain.slice(-140));
for(const phrasing of ["what are powerseller fees","what are powersellers fees","how much do powersellers charge","powerseller fees"]){
  const fr=localPreRoute(phrasing);
  check(`fee: '${phrasing}' -> CURATED locked copy, no partner names`, fr&&/arrangements vary/i.test(fr.reply||"")&&!ROSTER_NAMES_RE().test(fr.reply||""), (fr&&fr.reply||"").slice(0,90));
}
const feeRoute=localPreRoute("what are powersellers fees");
const whatIsRoute=localPreRoute("what is a powerseller");
check("fee: 'what is a powerseller' still routes to the curated explainer", whatIsRoute&&/regularly manages auction sales/i.test(whatIsRoute.reply||""), (whatIsRoute&&whatIsRoute.reply||"").slice(0,80));
function ROSTER_NAMES_RE(){ return /\b(howS|Howard Silvers|GenauAutoWerks|Ingo Schmoldt|carbine123|Chris Carbine|Dan Gray|AuthenticAuctions)\b/i; }

// ===== ITEM 1: a non-curated make must never render another marque's model chips =====
// A make with no curated trim/model handler (e.g. Duesenberg) that reaches the
// step-17 vehicle sub-state - which the off-script chat re-ask does by calling
// askNextSellQuestion() while step===17 - must NOT render the legacy static
// SELL_STEP_QUESTIONS[17] Porsche ask+chips. Two layers guard this.
{
  const MARQUE_CHIPS=/\b911\b|\b944\b|\b928\b|\b356\b|Boxster|Cayman/;
  // Layer B (defense in depth): the static step-17 config carries NO marque models.
  check("Item1: static SELL_STEP_QUESTIONS[17] chips carry NO marque model names",
    !SELL_STEP_QUESTIONS[17].chips.some(c=>MARQUE_CHIPS.test(String(c))), JSON.stringify(SELL_STEP_QUESTIONS[17].chips));
  check("Item1: static SELL_STEP_QUESTIONS[17] ask names no marque model",
    !MARQUE_CHIPS.test(SELL_STEP_QUESTIONS[17].ask), SELL_STEP_QUESTIONS[17].ask);
  // Layer A (primary): drive askNextSellQuestion at step 17 for a non-curated make.
  const rendered=[];
  const realAddMsg=globalThis.addMsg;
  globalThis.addMsg=(role,text,html,chips)=>{ rendered.push({text:String(text||""),chips:String(chips||"")}); };
  Object.assign(globalThis.sellState,{
    step:17, carName:"1925 Duesenberg", carRaw:"1925 Duesenberg",
    resolvedVehicle:{make:"Duesenberg",model:null,year:1925,unverified:true},
    vehicleIdentityValidated:false, vehicleDetailSkipped:false, archiveModelCount:0,
    pendingVehicleIdentity:null, state:null, price:null, sellerPreference:null,
    region:"US", country:"the United States", countryRoutable:true,
    returnToConfirm:false, editReturnStep:null, editPrevVehicle:null, bodyStyleAsked:false
  });
  const missingNull=(typeof currentMissingVehicleDetail==="function")&&currentMissingVehicleDetail()===null;
  try{ askNextSellQuestion(); }catch(e){ rendered.push({text:"THREW:"+e.message,chips:""}); }
  globalThis.addMsg=realAddMsg;
  const advancedStep=globalThis.sellState.step;
  const allText=rendered.map(r=>r.text).join(" || ");
  const allChips=rendered.map(r=>r.chips).join(" || ");
  check("Item1: a non-curated make at step 17 has NO detail to clarify (missing===null)", missingNull, "currentMissingVehicleDetail() did not return null");
  check("Item1: step-17 re-ask for a non-curated make renders NO marque model chips", !MARQUE_CHIPS.test(allChips), allChips.slice(0,200));
  check("Item1: the wizard ADVANCES off step 17 (does not re-render the vehicle clarification)",
    advancedStep!==17 && !/Which model or trim is it/.test(allText), JSON.stringify({step:advancedStep, firstText:(rendered[0]&&rendered[0].text||"").slice(0,80)}));
}

// ===== RARITY: mainstream-classic suppression must win over the age>25 gate =====
// A W124 300 CE (33 years old) is a common classic, not rare - it must render the
// neutral/thinNeutral wording, never "for a car this uncommon". The age>25 rule may
// no longer short-circuit past the model-level mainstream check.
{
  const rar=(make,model,trim,year,count)=>{
    Object.assign(globalThis.sellState,{ resolvedVehicle:{make,model,trim:trim||"",year}, sellDecision:{vehicle:{make,model,trim:trim||"",year}}, archiveModelCount:(count==null?0:count) });
    return v2RarityAllowed();
  };
  // Mainstream classics (age>25) -> NEUTRAL (false)
  const NEUTRAL=[
    ["Mercedes-Benz","300 CE","",1993],["Mercedes-Benz","300CE","",1993],
    ["Mercedes-Benz","300 E","",1990],["Mercedes-Benz","300 TE","",1991],
    ["Mercedes-Benz","190 E","",1991],["Mercedes-Benz","560 SEL","",1990],
    ["Mercedes-Benz","300 D","",1987],["Mercedes-Benz","560 SEC","",1990],
    ["Mercedes-Benz","E320","",1994],
    ["BMW","325i","",1990],["BMW","325is","",1989],["BMW","535i","",1991],
    ["BMW","528e","",1986],["BMW","635CSi","",1989],
    // Audi / Jaguar / Land Rover volume classics (Aug 13 second pass)
    ["Audi","A6","",1997],["Audi","100","",1991],["Audi","200","",1990],
    ["Audi","5000","",1987],["Audi","80","",1990],["Audi","90","",1991],
    ["Jaguar","XJ6","",1990],["Jaguar","XJ12","",1993],["Jaguar","XJS","",1990],["Jaguar","XJ-S","",1988],
    ["Land Rover","Range Rover","",1995],["Land Rover","Discovery","",1998],["Land Rover","Freelander","",2004]
  ];
  for(const [mk,md,tr,yr] of NEUTRAL)
    check(`rarity: ${md||mk} (${yr}) mainstream classic -> NEUTRAL`, rar(mk,md,tr,yr)===false, `${mk} ${md} -> rarity=true`);
  // Genuine specials -> KEEP RARITY (true), even sharing a mainstream model head.
  // (age>25 specials rescue via age; age<25 specials via enthusiast+archive, count>=1.)
  const SPECIAL=[
    ["Mercedes-Benz","500 E","",1993],["Mercedes-Benz","E500","",1993],
    ["Mercedes-Benz","560 SL","",1989],["Mercedes-Benz","300 SL","",1990],
    ["Mercedes-Benz","190 E","2.5-16 Evolution",1990],["Mercedes-Benz","300 CE","AMG 6.0 Hammer",1990],
    ["BMW","M3","",1988],["BMW","M5","",1991],["BMW","M635CSi","",1986],
    // Audi / Jaguar / Land Rover genuine specials
    ["Audi","Quattro","",1985],["Audi","RS6","",2003],["Audi","R8","",2009],
    ["Jaguar","XJ220","",1993],["Jaguar","E-Type","",1968],["Jaguar","XKR","",2003],["Jaguar","Mark 2","",1965],
    ["Land Rover","Defender","",1994],["Land Rover","Defender 90","",1995],["Land Rover","Series III","",1980]
  ];
  for(const [mk,md,tr,yr] of SPECIAL)
    check(`rarity: ${md} ${tr||""}`.trim()+` (${yr}) genuine special -> RARITY`, rar(mk,md,tr,yr,1)===true, `${mk} ${md} ${tr} -> rarity=false`);
  // Modern volume baselines stay neutral (unchanged).
  check("rarity: 2018 E-Class -> NEUTRAL (unchanged)", rar("Mercedes-Benz","E-Class","",2018)===false);
  check("rarity: 2015 328i -> NEUTRAL (unchanged)", rar("BMW","328i","",2015)===false);
  globalThis.sellState.archiveModelCount=0; globalThis.sellState.resolvedVehicle=undefined; globalThis.sellState.sellDecision=undefined;
}

console.log(fails?`\n${fails} FAILURE(S)`:"\nVERIFY-BUGS ALL PASS");
process.exit(fails?1:0);
