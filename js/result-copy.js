// Platform tiles (Design Phase 1): single color-map source of truth; the
// ONLY place platform brand colors may appear (R4). No logo images anywhere.
const PLATFORM_TILE={
  bat:{bg:"#1A1A1A",label:"BaT"},
  cnb:{bg:"#1D7A46",label:"C&B"},
  cc:{bg:"#1E2A44",label:"CC"},
  candc:{bg:"#A6906B",label:"C&C"},
  pcm:{bg:"#3D4451",label:"PCM"},
  hemmings:{bg:"#7A1F1F",label:"H"},
  hagerty:{bg:"#174EA6",label:"Hag"},
  hows:{bg:"#8A5A00",label:"hS"}
};
function tileKeyFor(name){
  const n=String(name||"").toLowerCase();
  if(n.includes("bring")||n==="bat")return "bat";
  if(n.includes("bids"))return "cnb";
  if(n.includes("collecting"))return "cc";
  if(n.includes("classic"))return "candc";
  if(n.includes("pcar"))return "pcm";
  if(n.includes("hemmings"))return "hemmings";
  if(n.includes("hagerty"))return "hagerty";
  if(n.includes("hows")||n.includes("specialist")||n.includes("power"))return "hows";
  return null;
}
function tileHTML(name,size){
  const tile=PLATFORM_TILE[tileKeyFor(name)]||{bg:"var(--slate)",label:String(name||"?").slice(0,3)};
  return `<span class="platform-tile t${size===24?24:40}" style="background:${tile.bg}">${escapeHtml(tile.label)}</span>`;
}
// Every rendered numeral uses the data font (R1): wrap digit runs after
// escaping so percentages, prices, counts and codes all pick up .num.
function numify(text){
  // Boundary-guarded: never split digits out of words (MX-5, F-150, C63).
  return escapeHtml(text).replace(/(?<![\w#&-])((?:\$\s?)?\d[\d,\.]*(?:k(?![\w])|%|\+)?)(?![\w;])/g,'<span class="num">$1</span>');
}

function platformLogo(option){
  const name=String(option?.name||"").toLowerCase();
  if(option?.key==="specialist")return{cls:"specialist",text:"SP"};
  if(name.includes("bring"))return{cls:"bringatrailer",text:"BaT"};
  if(name.includes("cars")&&name.includes("bids"))return{cls:"carsandbids",text:"C&B"};
  if(name.includes("pcar"))return{cls:"pcarmarket",text:"PCM"};
  if(name.includes("hemmings"))return{cls:"hemmings",text:"H"};
  if(name.includes("hagerty"))return{cls:"hagerty",text:"Hag"};
  if(name.includes("classic"))return{cls:"carandclassic",text:"C&C"};
  if(name.includes("collecting"))return{cls:"collectingcars",text:"CC"};
  return{cls:"",text:"S"};
}

function moneyShort(value){
  const n=Number(value);
  if(!Number.isFinite(n)||n<=0)return null;
  return `$${Math.round(n).toLocaleString()}`;
}

function dateShort(value){
  if(!value)return null;
  const iso=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d=iso?new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3])):new Date(value);
  if(Number.isNaN(d.getTime()))return null;
  return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
}

function optionAliases(option){
  const name=String(option?.name||"").toLowerCase();
  const aliases=[name];
  if(name.includes("bring"))aliases.push("bat","bringatrailer","bring a trailer");
  if(name.includes("cars")&&name.includes("bids"))aliases.push("c&b","cars and bids","cars & bids");
  if(name.includes("pcar"))aliases.push("pcm","pcar","pcarmarket","pcar market");
  if(name.includes("hemmings"))aliases.push("hemmings");
  if(name.includes("hagerty"))aliases.push("hagerty");
  if(name.includes("classic"))aliases.push("c&c","c and c","car and classic","car & classic","carandclassic");
  if(name.includes("collecting"))aliases.push("collecting cars","collectingcars");
  if(name.includes("specialist"))aliases.push("specialist","power seller","consignor","consignment");
  return aliases.filter(Boolean);
}

function findSellOptionByText(text){
  const lower=String(text||"").toLowerCase();
  return (sellState.sellOptions||[]).find(option=>optionAliases(option).some(alias=>alias&&lower.includes(alias)));
}

function findHiddenRouteByText(text){
  const lower=String(text||"").toLowerCase();
  const normalizedLower=normalizedPlatformText(lower);
  return (sellState.allRouteOptions||[]).find(route=>{
    const name=String(route.label||route.platform||"").toLowerCase();
    const aliases=[name];
    if(name.includes("bring"))aliases.push("bat","bringatrailer","bring a trailer");
    if(name.includes("cars")&&name.includes("bids"))aliases.push("c&b","cars and bids","cars & bids");
    if(name.includes("pcar"))aliases.push("pcm","pcar","pcarmarket","pcar market");
    if(name.includes("hemmings"))aliases.push("hemmings");
    if(name.includes("hagerty"))aliases.push("hagerty");
    if(name.includes("classic"))aliases.push("c&c","c and c","car and classic","car & classic","carandclassic");
    if(name.includes("collecting"))aliases.push("collecting cars","collectingcars");
    return aliases.some(alias=>alias&&(lower.includes(alias)||normalizedLower.includes(normalizedPlatformText(alias))));
  });
}

function routeHasTrueComparableEvidence(route){
  // The backend evidence set is already scoped to the ladder rung it landed on,
  // so any sales count at that rung is honest comparable evidence.
  return !!(route?.hasMarketEvidence&&route?.marketEvidence&&route.marketEvidence.evidenceSales>0);
}

// One window vocabulary (locked): the plate label and the chat opener name
// the same span, derived from the windows the rendered claims actually used.
// "Since YYYY" must name the verifiable earliest boundary from the evidence;
// "Historical" never renders.
function analysisWindowInfo(bullets){
  const windows=(bullets||[]).map(item=>Number(item.windowDays)).filter(Number.isFinite);
  if(!windows.length)return {label:"",phrase:""};
  // The widest FINITE window any rendered claim used wins: it is the
  // narrower, more specific span and matches bullet 1. Supporting all-time
  // bullets (day, segment) never force the label wider than the tier claim.
  const finite=windows.filter(days=>days<3650);
  if(finite.length){
    const max=Math.max(...finite);
    return {label:`Past ${max} days`,phrase:`over the past ${max} days`};
  }
  // All-time claims may span wider than the landed evidence set (e.g. a
  // generation-scoped premium); the label uses the earliest boundary any
  // rendered claim actually covers.
  const years=[
    ...(bullets||[]).map(item=>Number(item.sinceYear)).filter(Number.isFinite),
    Number(String(sellState.sellDecision?.evidence?.earliestSaleDate||"").slice(0,4))
  ].filter(Number.isFinite);
  const since=years.length?Math.min(...years):null;
  return since?{label:`Since ${since}`,phrase:`since ${since}`}:{label:"All-time",phrase:"across everything we've tracked"};
}

// Old-data transparency (locked): when the card's claims reach back more
// than a year, the card says WHY, right after the voice line. "Since YYYY"
// plates explain the lookback; boundary-less all-time plates explain the
// full-history read. The chat opener owns "Here's what that market shows",
// so the card line never repeats it.
function lookbackLine(option){
  const bullets=option.reasonBullets||[];
  // Scope-descent transparency (locked): when the claim widened beyond the
  // landed scope, the card says so, framed as a deliberate scope choice
  // (never "when data was thin"). Takes precedence over the window line;
  // the plate carries the span. There is no chat opener, so the card owns
  // "Here's what the market shows".
  const descent=bullets[0]?.scopeDescent;
  if(descent){
    const carYear=sellState.resolvedVehicle?.year;
    const openScope=carYear?`${carYear} exact-year sales`:"the exact car";
    const range=descent.range?` (${descent.range})`:"";
    return `We analyzed ${openScope}, then broadened to ${descent.to}${range} to identify the platform advantage. Here's what the market shows.`;
  }
  const info=analysisWindowInfo(bullets);
  const landed=sellState.sellDecision?.evidence?.ladder?.landed;
  const segLabel=bullets[0]?.segmentLabel;
  const scope=segLabel?`${segLabel} sales`:(landed?String(landed.label):"comparable sales");
  const sinceYear=(String(info.label||"").match(/^Since (\d{4})$/)||[])[1];
  if(sinceYear)return `We went back to ${sinceYear} to get enough comparable ${scope}.`;
  if(info.label==="All-time")return `We analyzed ${scope} across everything we've tracked to build a reliable picture.`;
  return "";
}

// US-only launch: platforms that actually serve US sellers. Mirrors the backend
// US_ROUTE_ALLOWLIST (api/sellerDecision.js) - the frontend can't import lib/api,
// so it is duplicated here. Explicit allowlist, not a UK denylist: a new non-US
// platform is excluded by default.
const US_ROUTE_ALLOWLIST_FE=new Set(["bringatrailer","bat","carsandbids","pcarmarket","hemmings","sothebysmotorsport","mbmarket","hagerty"]); // autohunter removed Aug 2026 (defunct)
function shouldSuppressRouteForSellerRegion(route){
  const slug=String(route?.platform||route?.platformSlug||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  // US seller (defense in depth): the backend already filters routeFit to the US
  // allowlist; this independently catches any non-US route that still slips
  // through, under EVERY composition path (pick, speed pick, price alt, secondary).
  if(!isInternationalSellerRegion())return slug?!US_ROUTE_ALLOWLIST_FE.has(slug):false;
  const facts=route?.routeFitFacts||[];
  return facts.includes("region_mismatch");
}

function isInternationalSellerRegion(){
  const region=String(sellState.region||"").toLowerCase();
  if(!region||/^(us|usa|united states)$/.test(region))return false;
  // A routable non-US registry region, or any not-routable country (Canada, free text).
  if(typeof registryRoutableRegion==="function"&&registryRoutableRegion(region))return true;
  return !!sellState.country && sellState.countryRoutable===false || region==="international";
}
// Which international regions we can genuinely route TODAY: derived from the
// routable-country registry (single source of truth). Not-routable countries
// (Canada until phase 2, any free-text country) return false and get the honest
// no-routing line, never a silent US default.
function isRoutableInternationalRegion(){
  const region=String(sellState.region||"").toLowerCase();
  return typeof registryRoutableRegion==="function" && registryRoutableRegion(region);
}

function routeWorthShowing(route,index,primary){
  if(index===0)return true;
  const evidence=route?.marketEvidence||{};
  const primaryEvidence=primary?.marketEvidence||{};
  const routeMedian=Number(evidence.medianSalePrice||0);
  const primaryMedian=Number(primaryEvidence.medianSalePrice||0);
  if(!routeMedian||!primaryMedian)return false;
  const performanceRatio=routeMedian/primaryMedian;
  const closeEnough=performanceRatio>=0.9;
  const fasterAndCompetitive=performanceRatio>=0.85&&["fast","medium_fast"].includes(route.speedToList);
  const topResultSignal=(evidence.topThreeSales||0)>=2;
  return closeEnough||fasterAndCompetitive||topResultSignal;
}

function hasTwoRouteTradeoff(routes){
  if(!routes||routes.length<2)return false;
  const [a,b]=routes;
  const ae=a.marketEvidence||{};
  const be=b.marketEvidence||{};
  const aMedian=Number(ae.medianSalePrice||0);
  const bMedian=Number(be.medianSalePrice||0);
  const performanceSplit=aMedian&&bMedian&&Math.abs(aMedian-bMedian)/Math.min(aMedian,bMedian)>=0.05;
  const speedTradeoff=[a,b].some(route=>["fast","medium_fast"].includes(route.speedToList))
    && aMedian&&bMedian
    && Math.min(aMedian,bMedian)/Math.max(aMedian,bMedian)>=0.9;
  return !!(performanceSplit||speedTradeoff);
}

function adverseConditionCaveat(){
  // Retired (locked): medians are banned from cards, so a footer explaining
  // "those medians" referenced data that no longer exists on the card. Gate
  // for any future footer: only render if the card actually carries the
  // claim the footer qualifies. No such claim renders today, so: nothing.
  return null;
}

// Unverified model note (C): when the resolver could not match the model to any
// known catalog, we run at make level and say so honestly. Never claim comp
// counts for a model we could not verify.
function unverifiedModelNote(){
  const v=sellState.resolvedVehicle;
  if(!v||!v.unverified)return null;
  const label=v.model?`the ${v.make} ${v.model}`:"that exact model";
  return `I couldn't verify ${label} against the models I track, so this read is at the ${v.make||"make"} level and broader than model-specific. If the exact model matters, tell me the badge on the car and I'll tighten it.`;
}

// (1b) deleted: resultHeaderTitle - replaced by composeCard

function sellerWantsSpeed(){
  const t=String(sellState.timeline||"").toLowerCase();
  // "No rush / no hurry / right result only" is an explicit NON-speed signal.
  // It must win over the "rush" keyword ("no rush" contains "rush").
  if(/\bno (rush|hurry)\b|not in a (rush|hurry)|right result/i.test(t))return false;
  return /\b(fast|quick|soon|tomorrow|this week|gone|asap|urgent|rush)\b/i.test(t)||/within a month/i.test(t);
}

function sellerWantsHandsOff(){
  return /\b(handle|hands.off|someone|everything|either)\b/i.test(String(sellState.involvement||""));
}

function sellerWantsToManageSelf(){
  return /\b(i'?ll manage|i will manage|manage it|myself|self|i'?ll handle|i will handle)\b/i.test(String(sellState.involvement||""));
}

function cleanCarForCopy(){
  const explicit=String(sellState.carName||"").trim();
  if(explicit)return explicit;
  const vehicle=sellState.vehicle||{};
  const parts=[vehicle.year,vehicle.make,vehicle.model,vehicle.trim].filter(Boolean);
  return parts.length?parts.join(" "):"this car";
}

// Platform-first bullet copy (locked, July 2026): reason bullets read
// "[Platform] [verb] [these cars]" with the platform as the subject, no time
// windows, and no raw counts. This pluralizes the resolved car for that
// pattern ("2018 Porsche 911 Carrera" -> "2018 Porsche 911 Carreras").
function carPluralForCopy(){
  const car=cleanCarForCopy();
  if(car==="this car")return "cars like this";
  return /s$/i.test(car)?car:`${car}s`;
}

function porsche911TrimFromText(text){
  const lower=String(text||"").toLowerCase();
  if(!/\bporsche\b/.test(lower)||!/\b911\b/.test(lower))return null;
  const patterns=[
    ["GT3 RS",/\bgt3\s+rs\b/],
    ["GT2 RS",/\bgt2\s+rs\b/],
    ["Turbo S",/\bturbo\s+s\b/],
    ["Sport Classic",/\bsport\s+classic\b/],
    ["Carrera 4S",/\bcarrera\s+4s\b/],
    ["Carrera S",/\bcarrera\s+s\b/],
    ["Carrera T",/\bcarrera\s+t\b/],
    ["Carrera",/\bcarrera\b/],
    ["GTS",/\bgts\b/],
    ["Turbo",/\bturbo\b/],
    ["GT3",/\bgt3\b/],
    ["GT2",/\bgt2\b/],
    ["Targa",/\btarga\b/],
    ["Dakar",/\bdakar\b/],
    ["Speedster",/\bspeedster\b/],
    ["S/T",/\bs\/t\b/]
  ];
  return patterns.find(([,regex])=>regex.test(lower))?.[0]||null;
}

function comparableModelLabel(){
  const car=cleanCarForCopy();
  const trim=porsche911TrimFromText(car);
  if(trim)return `${trim} models`;
  if(/\bporsche\b/i.test(car)&&/\b911\b/i.test(car))return "similar 911s";
  const withoutYear=car.replace(/\b(19|20)\d{2}\b/g,"").trim();
  return withoutYear?`${withoutYear} models`:"similar cars";
}

function comparisonScopeSentence(){
  const landed=sellState.sellDecision?.evidence?.ladder?.landed;
  if(!landed)return "";
  if(/trim/.test(landed.key))return `I looked at recent ${landed.label} rather than the whole model line because trims behave very differently.`;
  return "";
}

function powerSellerAdviceReason(hasNamedSellers){
  if(hasNamedSellers){
    return pickCopy([
      `I’d start with these names because they show up in recent seller activity for cars like this${sellState.state?`, and ${sellState.state} is close enough to matter`:""}. A good one should take the auction noise, buyer questions and logistics off your plate.`,
      `These are the names I’d check first. They appear around cars like this and are the best PowerSeller signals I can see from the current search.`,
      `I picked these because they are the closest PowerSeller signals I can see for this car. They should be able to explain platform choice, prep, comments and logistics clearly.`
    ],sellState.carName,sellState.state,hasNamedSellers);
  }
  if(sellerWantsToManageSelf()){
    return "You said you’d rather run it yourself, so that’s the plan. If you ever want the whole sale handled instead, ask me and I’ll tell you who I’d call.";
  }
  return pickCopy([
    "For this car, I’d speak to one or two PowerSellers before deciding where it goes live. If they can show you they’ll genuinely improve the outcome, they’re worth considering. If not, I’d sell it myself.",
    "This is the kind of car where who runs the auction can matter almost as much as where it runs. I’d hear the PowerSeller case before making the call.",
    "I’d speak to a PowerSeller first. A good one can prep the car, handle the auction noise and help choose the platform with the best shot."
  ],sellState.carName,sellState.state);
}

// Rotating, service-explicit PowerSeller subline (value-first, never a fee).
// Varies per car so repeated reads don't feel scripted. Generalized: used on
// every PowerSeller card.
function powerSellerServiceLine(){
  return pickCopy([
    "Photography, listing, buyer questions and paperwork: they manage it all.",
    "They handle everything: photos, listing, buyer questions and running the auction.",
    "One person manages photos, listing, buyer contact and platform choice."
  ],sellState.carName||"","ps-service");
}

// Rotating, value-first intro used above EVERY PowerSeller card (DEFECT 1).
// Explains what a PowerSeller is in one line so a first-time reader understands
// the term without prior context. Never leads with a fee.
function powerSellerIntroLine(){
  return pickCopy([
    "Prefer to have someone run the whole sale? A PowerSeller manages photos, listing, buyer questions and paperwork for you.",
    "Want it handled end to end? A PowerSeller takes on the photos, listing, buyer questions and paperwork so you don't have to.",
    "Rather not run it yourself? A PowerSeller handles the whole sale for you: prep, photos, listing, buyer questions and paperwork."
  ],sellState.carName||"","ps-intro");
}

function powerSellerAdviceBullets(hasNamedSellers){
  if(hasNamedSellers){
    return pickCopy([
      [
        "A good PowerSeller manages the whole auction: prep, listing, buyer questions, comments, logistics and platform choice.",
        "The right one should make a clear case for why they improve the outcome versus a private listing."
      ],
      [
        "The right person can save you from living in the comments and dealing with every buyer question yourself.",
        "They should be able to explain where they would list it, why, and what they think they can improve."
      ],
      [
        "This only works if the person is genuinely strong for this kind of car.",
        "If they can’t make a convincing case, I’d sell it yourself and keep control."
      ]
    ],sellState.carName,sellState.state).slice(0,2);
  }
  const bullets=pickCopy([
    [
      "Think of a PowerSeller as someone who manages the whole auction: prep, listing, buyer questions, comments, logistics and platform choice.",
      "If they can’t show a clear case for improving the outcome, sell it yourself."
    ],
    [
      "They can take the heavy lifting off you, especially the buyer questions and comment-section pressure that most first-time sellers underestimate.",
      "I’m not telling you to use one. I’m saying this is the kind of car where I’d hear the case before deciding."
    ],
    [
      "The right one may know which platform gives this exact car the best shot.",
      "If the case is not convincing, keep it simple and sell it yourself."
    ]
  ],sellState.carName,sellState.involvement);
  if(sellerWantsToManageSelf())bullets.unshift("You can still sell it yourself; this is just the sanity check I’d do first.");
  return bullets.slice(0,3);
}

function platformGap(routes){
  if(!routes||routes.length<2)return null;
  const [first,second]=routes;
  const firstValue=Number(first?.marketEvidence?.medianSalePrice||0);
  const secondValue=Number(second?.marketEvidence?.medianSalePrice||0);
  if(!firstValue||!secondValue)return null;
  const stronger=firstValue>=secondValue?first:second;
  const other=firstValue>=secondValue?second:first;
  const gap=Math.round((Math.max(firstValue,secondValue)-Math.min(firstValue,secondValue))/Math.min(firstValue,secondValue)*100);
  return {gap,strongerName:stronger.label||stronger.platform,otherName:other.label||other.platform};
}

function textSeed(...parts){
  const value=parts.map(part=>String(part||"")).join("|");
  let hash=0;
  for(let i=0;i<value.length;i++)hash=(hash*31+value.charCodeAt(i))>>>0;
  return hash;
}

function pickCopy(variants,...seedParts){
  if(!variants.length)return "";
  return variants[textSeed(...seedParts)%variants.length];
}

function supportedRouteDelta(route, routes){
  const current={name:route.label||route.platform,marketEvidence:route.marketEvidence};
  const next=(routes||[])
    .filter(other=>other!==route&&other.marketEvidence?.medianSalePrice)
    .map(other=>({name:other.label||other.platform,marketEvidence:other.marketEvidence}))
    .sort((a,b)=>(b.marketEvidence?.medianSalePrice||0)-(a.marketEvidence?.medianSalePrice||0))[0];
  return next?medianDeltaSentence(current,next):null;
}

function marketWindowPhrase(){
  const days=sellState.sellDecision?.evidence?.windowDays;
  if(!days)return "recently";
  if(days>=3650)return "across everything we've tracked";
  if(days>=85&&days<=100)return "over the past 90 days";
  if(days>=115&&days<=130)return "over the past 120 days";
  return `over the past ${days} days`;
}

// Speed tiebreak (locked framing): when the seller's timeline decided a
// close call, the copy owns the decision. The median gap is small, speed is
// the deciding factor, and the pick is confident, never a consolation.
function speedTiebreak(routes){
  if(!sellerWantsSpeed()||!routes||routes.length<2)return null;
  if((sellState.powerSellerProfiles||[]).length)return null;
  const [first,second]=routes;
  const fm=Number(first.marketEvidence?.medianSalePrice||0);
  const sm=Number(second.marketEvidence?.medianSalePrice||0);
  if(!fm||!sm)return null;
  const gapPercent=Math.round(Math.abs(fm-sm)/Math.max(fm,sm)*100);
  const firstFaster=["fast","medium_fast"].includes(first.speedToList)&&!["fast","medium_fast"].includes(second.speedToList);
  if(gapPercent<10&&firstFaster){
    return {
      gapPercent,
      firstName:platformDisplayName(first.label||first.platform),
      secondName:platformDisplayName(second.label||second.platform)
    };
  }
  return null;
}

// (1b) deleted: routeReason - replaced by composeCard

function primaryInsightSentence(route){
  // Headlines are one direct sentence naming the pick (locked): never a
  // wordy description of where comps came from.
  const evidence=route.marketEvidence||{};
  const name=platformDisplayName(route.label||route.platform);
  if(Number.isFinite(evidence.performanceDeltaPercent)&&evidence.performanceDeltaPercent>=5)return `${name} has the strongest signal for ${comparableSalesLabel()}.`;
  if(evidence.topThreeSales>=2){
    return `${name} is the call here.`;
  }
  const dayLine=weekdayInsightLine(evidence);
  if(dayLine)return dayLine;
  return null;
}

function sellerPriorityLabel(route){
  const facts=route.routeFitFacts||[];
  if(facts.includes("faster_listing_fit"))return "This choice fits if getting live quickly matters.";
  if(facts.includes("may_support_handoff"))return "This choice can suit a seller who wants more help with the process.";
  return "The strongest recent activity points here before speed or handoff considerations.";
}

// Curated platform-fit copy (locked, approved July 2026): qualitative
// positioning about which platform suits which kind of car, same register
// as the curated regional proof lines. No invented statistics, names the
// platform (never "this platform"), fills the fit-bullet slot when a
// platform+category match exists; otherwise the generic fit line stands.
const PLATFORM_FIT_COPY={
  "Bring a Trailer":{
    "Air-cooled 911":"Bring a Trailer's audience has shown a particular appetite for air-cooled 911s.",
    "Porsche 911":"Bring a Trailer has built one of the strongest audiences for enthusiast Porsches.",
    "Defender":"Bring a Trailer has become one of the strongest destinations for classic Defenders.",
    "Land Cruiser":"Bring a Trailer's audience has shown a particular appetite for vintage Japanese 4x4s.",
    default:"Bring a Trailer has built a strong audience for this kind of vehicle."
  },
  "Cars & Bids":{
    "modern Porsche":"Cars & Bids has built a particularly strong audience for late-model performance cars.",
    "modern enthusiast":"Cars & Bids attracts an audience that knows modern performance cars well.",
    default:"Cars & Bids has built a strong audience for this kind of car."
  },
  "PCarMarket":{
    "Porsche":"Porsche remains one of PCarMarket's strongest categories.",
    default:"PCarMarket specializes in enthusiast cars like yours."
  }
};
function fitCategoryTags(){
  const rv=sellState.resolvedVehicle||{};
  const make=String(rv.make||"").toLowerCase();
  const model=String(rv.model||"").toLowerCase();
  const year=Number(rv.year)||Number(rv.yearRange?.start)||null;
  const is911=make==="porsche"&&/911/.test(model);
  const tags=[];
  if(is911&&year&&year<1999)tags.push("Air-cooled 911");
  if(is911)tags.push("Porsche 911");
  if(make==="porsche"&&year&&year>=2005)tags.push("modern Porsche");
  if(make==="porsche")tags.push("Porsche");
  if(make==="land rover"&&/defender/.test(model))tags.push("Defender");
  if(make==="toyota"&&/land cruiser/.test(model))tags.push("Land Cruiser");
  // Removed the loose "modern enthusiast" tag (any 2005+ car): it fired the
  // "knows modern performance cars well" audience line for cars that are not
  // modern performance cars (e.g. a 2006 Ford Focus). Audience fit is only ever
  // asserted from a genuine make/model-specific match now (3.7).
  return tags;
}
function platformFitLine(route){
  const copy=PLATFORM_FIT_COPY[platformDisplayName(route?.label||route?.platform)];
  if(!copy)return null;
  // Only a genuine make/model-specific curated match renders. The generic
  // `default` fallback is dropped: an audience bullet that asserts category fit
  // ("strong audience for this kind of car") without a real category match is
  // filler at best and false at worst, so no bullet beats a wrong one (3.7).
  for(const tag of fitCategoryTags())if(tag!=="default"&&copy[tag])return copy[tag];
  return null;
}

// Comparative momentum (July 2026): the pick-vs-alt median gap in the SAME
// recent 30-day window. Comparing two platforms at one time cancels variant
// mix (same as the premium claim), so this is honest where a temporal
// same-platform momentum was not. Percentage only, medians used for the
// math and never displayed. Gated: 2+ recent sales on each platform, 4+
// combined, gap 5%+. Rendered as a callout on the pick card (one comparison,
// shown once), never a bullet.
function comparativeMomentumLine(pickRoute,altRoute){
  const p=pickRoute?.marketEvidence?.recent30,a=altRoute?.marketEvidence?.recent30;
  if(!p||!a||p.count<2||a.count<2||(p.count+a.count)<4)return null;
  if(!p.median||!a.median)return null;
  const gap=Math.round((p.median-a.median)/a.median*100);
  if(Math.abs(gap)<5)return null;
  const pick=platformDisplayName(pickRoute.label||pickRoute.platform);
  const alt=platformDisplayName(altRoute.label||altRoute.platform);
  // Platform-first, no time window (locked, July 2026). Keeps the real gap %.
  return gap>0
    ?`${pick} closes around ${gap}% higher than ${alt}.`
    :`${alt} closes around ${Math.abs(gap)}% higher than ${pick}. Still, ${pick} remains the call.`;
}

function sellerPriorityFitLabel(route){
  const facts=route.routeFitFacts||[];
  if(facts.includes("faster_listing_fit"))return "This choice fits if getting live quickly matters.";
  if(facts.includes("may_support_handoff"))return "This choice can suit a seller who wants more help with the process.";
  if(facts.includes("segment_fit"))return "The platform's typical buyer pool matches this kind of car.";
  // No grounded fit fact: return nothing rather than a filler line (DEFECT 2).
  return null;
}

// ===================== Part 6: OUTBOUND SUBMISSION =====================
// Mirror of lib/submissionUrls.js (the SERVER is the source of truth for the
// redirect). Presence here gates the outbound button and lets the modal name the
// platform; the actual redirect + click logging happens server-side at /out.
// Keep this in sync with lib/submissionUrls.js.
const SUBMISSION_URLS={
  bringatrailer:"https://bringatrailer.com/submit-a-vehicle/",
  carsandbids:"https://carsandbids.com/sell-car/",
  hagerty:"https://www.hagerty.com/marketplace/sell",
  pcarmarket:"https://www.pcarmarket.com/submit-your-listing",
  sothebysmotorsport:"https://sothebysmotorsport.com/sell",
  mbmarket:"https://mbmarket.com/sell",
  hemmings:"https://www.hemmings.com/classifieds/bundles/carsforsale",
  carandclassic:"https://www.carandclassic.com/sell-your-vehicle",
  collectingcars:"https://collectingcars.com/sell-with-us"
};
function hasOutboundSubmission(slug){return !!SUBMISSION_URLS[String(slug||"").toLowerCase()];}
// Opaque per-browser id (never PII); only ever reaches OUR log, never the platform.
function outboundSessionId(){
  try{let id=localStorage.getItem("gas_session");if(!id){id="s_"+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem("gas_session",id);}return id;}
  catch(e){return "s_anon";}
}
// Opaque per-analysis id, ties a click back to the search that produced the card.
function outboundSearchId(){
  if(!sellState.searchId)sellState.searchId="q_"+Math.random().toString(36).slice(2)+Date.now().toString(36);
  return sellState.searchId;
}
function outboundQuery(slug,card,extra){
  const dec=sellState.sellDecision||{};
  // The vehicle lives on resolvedVehicle in the wizard path, but a cold/direct
  // search can leave that null while the decision still echoes the resolved
  // vehicle. Fall back through the decision so the click log always carries
  // year/make/model/trim (and the landed rung comes from the decision too).
  const v=sellState.resolvedVehicle||dec.vehicle||sellState.vehicle||{};
  const landed=(dec.evidence&&dec.evidence.ladder&&dec.evidence.ladder.landed&&dec.evidence.ladder.landed.key)||"";
  const params={p:slug,s:outboundSearchId(),sid:outboundSessionId(),card:card||"",
    j:(typeof gasJourneyId==="function"?(gasJourneyId(v)||""):""),
    a:(typeof gasAnonId==="function"?(gasAnonId()||""):""),
    year:v.year||"",make:v.make||"",model:v.model||"",trim:v.trim||"",
    location:sellState.state||sellState.region||"",rung:landed,
    reason:sellState.routingReason||dec.routingReason||"",pref:sellState.sellerPreference||""};
  if(extra)Object.assign(params,extra);
  return Object.keys(params).map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(params[k]==null?"":params[k])}`).join("&");
}
// Direct platform handoff (Aug 2026): the "Before you go to {platform}" interstitial was
// removed, so a CTA click goes STRAIGHT to the platform. Opens /out in a NEW TAB
// (rel=noopener) so GoAskSam stays open in the original tab with the session, chat history
// and result card intact if the visitor comes back. The /out hit still lands in the new
// tab, so the click row logs server-side (journey_events platform_cta_clicked +
// outbound_clicks) before the 302. If a popup blocker kills the new tab, fall back to
// same-tab navigation so the handoff is never lost. (The old modal also carried a disabled
// "Email me this checklist" placeholder that never captured anything, so nothing is lost.)
function outboundGo(slug,card){
  slug=String(slug||"").toLowerCase();
  if(!hasOutboundSubmission(slug))return;
  const url=apiPath(`/out?${outboundQuery(slug,card)}`);
  // New tab via a synthetic anchor click, NOT window.open (Aug 2026). With
  // window.open(url,"_blank","noopener") the browser returns null on SUCCESS
  // whenever noopener is set, so the old `if(!w)location.href=url` fallback
  // fired on EVERY click and navigated the original GoAskSam tab away too. An
  // anchor click during the user gesture opens the new tab reliably and never
  // touches the current tab, with no return-value guessing.
  const a=document.createElement("a");
  a.href=url;a.target="_blank";a.rel="noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function platformDisplayName(name){
  const key=String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  // Consignment houses render under a generic label in user-facing copy (they
  // are never a pick or a card; the only surface is the stronger-non-routable
  // callout), so specific house names stay out of the copy.
  // Sotheby's Motorsport (SOMO) is ALWAYS named in full, never scrubbed to a
  // generic and never a raw slug. rmsothebys/gooding (white-glove consignment,
  // off the evidence allowlist) keep the generic "a leading auction house".
  const map={bringatrailer:"Bring a Trailer",bat:"Bring a Trailer",carsandbids:"Cars & Bids",pcarmarket:"PCarMarket",hagerty:"Hagerty Marketplace",sothebysmotorsport:"Sotheby's Motorsport (SOMO)",autohunter:"AutoHunter",mbmarket:"MB Market",rmsothebys:"a leading auction house",gooding:"a leading auction house",goodingco:"a leading auction house",acc:"All Collector Cars",allcollectorcars:"All Collector Cars",hemmings:"Hemmings",carandclassic:"Car & Classic",collectingcars:"Collecting Cars"};
  if(map[key])return map[key];
  // Never leak a raw slug to a user. Internal slugs are lowercase single tokens
  // (no spaces, no capitals); an unknown one renders as a safe generic. An
  // already-human display string (has a space or a capital) passes through
  // unchanged, so re-applying this helper to a display name is idempotent.
  const raw=String(name||"");
  if(/[A-Z ]/.test(raw))return raw;
  return "another auction marketplace";
}

function extractVehicleMake(text=sellState.carName){
  const lower=String(text||"").toLowerCase();
  const makes=[
    "Porsche","Ferrari","Toyota","BMW","Audi","Mercedes-Benz","Mercedes","Acura","Honda","Nissan","Dodge","Land Rover",
    "Aston Martin","Lamborghini","McLaren","Ford","Chevrolet","Jaguar","Alfa Romeo","Alfa","Maserati","Bentley"
  ];
  const found=makes.find(make=>new RegExp(`\\b${escapeRegExp(make.toLowerCase())}\\b`).test(lower));
  if(found==="Mercedes")return "Mercedes-Benz";
  if(found==="Alfa")return "Alfa Romeo";
  return found||"";
}

function estimatedTargetPrice(){
  const raw=String(sellState.price||sellState.notes||"").toLowerCase();
  if(/\bsix[-\s]?figure|100k|over\s+100/.test(raw))return 100000;
  const range=raw.match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)\s*k\b/);
  if(range)return Number(range[2].replace(/,/g,""))*1000;
  const k=raw.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if(k)return Number(k[1])*1000;
  // Any bare number: in an asking-price context a value under 1000 almost
  // always means thousands ("165" -> $165k, "45" -> $45k). Four-plus digit
  // numbers ("165000", "$165,000") are already dollars.
  const num=raw.match(/\$?\s*(\d[\d,]*(?:\.\d+)?)/);
  if(!num)return 0;
  const n=Number(num[1].replace(/,/g,""));
  if(!Number.isFinite(n)||n<=0)return 0;
  return n<1000?Math.round(n*1000):Math.round(n);
}

function isSpecialistCar(){
  const car=cleanCarForCopy();
  return /\b(gt2|gt3|gt4|turbo|turbo s|rs|sport classic|speedster|land cruiser|fj40|supra|nsx|viper|gtr|gt-r|r8|amg gt|air cooled|ferrari|lamborghini|mclaren|aston martin|bentley)\b/i.test(car);
}

function isHighValueOrSpecialist(){
  return estimatedTargetPrice()>=50000||isSpecialistCar();
}

function shouldLeadWithPartner(partnerReferral={}){
  // Locked rules: the gate must genuinely pass (value, segment, region, active
  // partner, all decided server-side) AND the user must not have said they
  // want to run it themselves. User preference always wins.
  return !!(partnerReferral.eligible&&partnerReferral.partner)&&!sellerWantsToManageSelf();
}

function partnerProfileFromReferral(referral){
  const partner=referral?.partner||{};
  const verified=partner.verified||{};
  const name=partner.name||"Partner";
  return {
    id:partner.slug||"partner",
    name,
    displayName:partner.displayName||name,
    region:(partner.regions||[])[0]||"",
    serviceClaims:(partner.serviceClaims||[]).filter(claim=>claim&&claim.text),
    profileStats:(partner.specialties?.profile_stats||[]).filter(line=>line&&line.text),
    providedPlatforms:(partner.platforms||[]).filter(p=>p&&p.source!=="data_verified").map(p=>p.name),
    verified:{
      trackedSales:Number(verified.trackedSales||0),
      latestSaleDate:verified.latestSaleDate||null,
      medianSaleValue:verified.medianSaleValue||null,
      makeMix:verified.makeMix||null,
      belowCareerMinimum:verified.belowCareerMinimum!==false,
      relevance:verified.relevance||null
    },
    specialtiesNote:partner.specialties?.notes||"",
    specialtySegments:partner.specialties?.segments||[],
    specialtyMakes:partner.specialties?.makes||[],
    referralTerms:partner.referralTerms||"",
    strengths:[],
    platforms:(partner.platforms||[]).map(p=>p.name),
    note:partner.specialties?.notes?`Per ${name}: ${String(partner.specialties.notes).replace(/\s*\(per [^)]*\)\s*$/i,"")}`:`${name} is an auction consignor.`,
    confidenceLabel:"PowerSeller option"
  };
}

function powerSellerFirstName(profile){
  return String(profile.displayName||profile.name||"them").split(/\s+/)[0];
}

function renderPowerSellerProfile(profile){
  const strengths=(profile.strengths||[]).slice(0,4);
  const platforms=(profile.platforms||[]).slice(0,3).join(", ");
  const region=profile.region||"Worth checking";
  return `<div class="observed-seller power-seller-card" onclick="choosePowerSeller('${escapeHtml(profile.id)}')">
    <div class="sell-rec-badge specialist">${escapeHtml(profile.confidenceLabel||"Worth speaking to")}</div>
    <span class="observed-seller-name">${escapeHtml(profile.displayName||profile.name)}</span>
    <span class="observed-seller-meta">${escapeHtml(region)}</span>
    <span class="observed-seller-why">Why I’d call them</span>
    <div class="sell-rec-reason">${escapeHtml(profile.note||`They should be able to explain how they would improve the sale for ${cleanCarForCopy()} versus a private listing.`)}</div>
    <div class="observed-seller-tags">${strengths.map(tag=>`<span class="observed-seller-tag">${escapeHtml(tag)}</span>`).join("")}</div>
    ${platforms?`<div class="power-seller-platforms"><strong>Lists on (per ${escapeHtml(profile.name||"the partner")}):</strong> ${escapeHtml(platforms)}</div>`:""}
    <div class="sell-rec-actions"><button class="primary" onclick="event.stopPropagation();choosePowerSeller('${escapeHtml(profile.id)}')">Speak to ${escapeHtml(powerSellerFirstName(profile))}</button></div>
  </div>`;
}

function powerSellerPlatformChips(profile){
  return (profile.platforms||[]).slice(0,3)
    .map(name=>`<span class="power-seller-chip platform">${escapeHtml(name)}</span>`)
    .join("");
}

function powerSellerPlatformLogoChips(profile){
  return (profile.platforms||[]).slice(0,4).map(name=>{
    const logo=platformLogo({name});
    return `<span class="power-seller-platform-chip"><span class="platform-logo ${escapeHtml(logo.cls)}">${escapeHtml(logo.text)}</span><span>${escapeHtml(platformDisplayName(name))}</span></span>`;
  }).join("");
}

function powerSellerStrengthChips(profile){
  return (profile.strengths||[]).slice(0,4)
    .map(tag=>`<span class="power-seller-chip">${escapeHtml(tag)}</span>`)
    .join("");
}

function powerSellerProcessChips(){
  return ["Car prep","Photography","Listing","Buyer questions","Comments","Logistics","Platform choice"]
    .map(item=>`<span class="power-seller-chip process">${escapeHtml(item)}</span>`)
    .join("");
}

function powerSellerProfileSummary(profile){
  const name=profile?.name||"the consignor";
  return `Auction consignor. The service claims below were provided by ${name}; anything marked "in our tracked records" is computed from our own sales data.`;
}

function powerSellerClientChips(profile){
  const note=String(profile?.specialtiesNote||"").replace(/\s*\(per [^)]*\)\s*$/i,"");
  const tags=note?note.split(/,\s*/).slice(0,4):(profile.strengths||[]).slice(0,4);
  return tags.map(tag=>`<span class="power-seller-chip">${escapeHtml(tag)}</span>`).join("");
}

// Dossier stat grid: short stats fill the 2x2; the specialties line spans
// full width below them (it wraps badly in a half cell). Unmatched lines
// fall through as plain rows.
function dossierGridCells(profile,v){
  // Sell-through removed (1b): drop any curated stat line that mentions it.
  const lines=(profile?.profileStats||[]).map(line=>line.text)
    .filter(t=>t&&!/\{sellThroughPercent\}|sell-?through/i.test(t));
  const cells=[];const leftovers=[];let specialize=null;
  for(const line of lines){
    let m;
    if((m=line.match(/^(\d+\+?) listings tracked(.*)$/i)))cells.push({key:"Listings tracked",value:m[1]});
    else if((m=line.match(/^Specializes in:?\s*(.+)$/i)))specialize=m[1];
    // "Lists primarily on X" is dropped from the grid: the tile row further
    // down ("Lists on (per howS)") is the richer version of the same fact.
    else if(line.match(/^Lists primarily on (.+)$/i))continue;
    else leftovers.push(line);
  }
  return {cells,specialize,leftovers};
}

function powerSellerProofItems(profile){
  // Career-wide stats (locked principle): a consignor is judged on his entire
  // body of work, never on comps for the current search. Every row renders
  // only when the backend cleared its sample minimum; below the career
  // minimum no rows render and the honesty note takes their place.
  const v=profile?.verified||{};
  // Approved per-partner stat lines from the partners table take precedence.
  // {sellThroughPercent} substitutes the computed rate; its line is omitted
  // when the sample is below the honesty threshold (never a stale number).
  if((profile?.profileStats||[]).length){
    // When the searched make is not named in the specialization line, that
    // line never leads: it reads as a contradiction of the car on screen.
    const make=String(sellState.resolvedVehicle?.make||"").toLowerCase();
    return profile.profileStats.map(line=>{
      if(/\{sellThroughPercent\}|sell-?through/i.test(line.text))return null;
      if(make&&/^specializes in/i.test(line.text)&&!line.text.toLowerCase().includes(make))return null;
      return [null,line.text];
    }).filter(Boolean);
  }
  const rows=[];
  if(v.belowCareerMinimum)return rows;
  rows.push(["Tracked sales in our records",`${v.trackedSales} completed sale${v.trackedSales===1?"":"s"}${v.latestSaleDate&&dateShort(v.latestSaleDate)?`, most recent ${dateShort(v.latestSaleDate)}`:""}`]);
  if(v.medianSaleValue)rows.push(["Median sale across those records",`${moneyShort(v.medianSaleValue.value)} over ${v.medianSaleValue.sample} sales`]);
  if((v.makeMix||[]).length)rows.push(["Make mix in those records",v.makeMix.map(m=>`${m.make} ${m.percent}%`).join(", ")]);
  return rows;
}

function powerSellerProofHTML(profile){
  return powerSellerProofItems(profile).map(([label,value])=>
    `<div class="power-seller-proof">${label?`<span>${escapeHtml(label)}</span>`:""}${escapeHtml(value)}</div>`
  ).join("");
}

// Education lives off-card (locked): the card sells THIS seller for THIS
// car; the category explainer is a link that gets a real Sam answer.
function samExplainPowerSeller(){
  addMsg("sam","A PowerSeller runs the entire sale for you: prep, photos, listing, buyer questions, paperwork and platform choice. There is a fee, and you approve the big decisions while they do the work.");
}

// (Layout round, July 2026) The strong "squarely in his lane" claim requires a
// genuine specialty match with THIS car, not just makeCount>=3. A consignor
// whose stated lane is air-cooled/vintage does NOT get the strong form for a
// modern water-cooled car; make-level history earns the weak, data-true form.
function pluralizeMake(make){
  const m=String(make||"").trim();
  if(!m)return "These";
  if(/([sxz]|ch|sh)$/i.test(m))return `${m}es`;
  return `${m}s`;
}
function partnerSpecialtyText(profile){
  return [String(profile?.specialtiesNote||""),...(profile?.specialtySegments||[])].join(" ").toLowerCase();
}
function carEraMatchesSpecialty(vehicle,profile){
  const make=String(vehicle?.make||"").toLowerCase();
  if(!make)return false;
  const makes=(profile?.specialtyMakes||[]).map(m=>String(m).toLowerCase());
  if(makes.length&&!makes.includes(make))return false;
  const spec=partnerSpecialtyText(profile);
  const year=Number(vehicle?.year)||0;
  // Air-cooled Porsche: the 911 went water-cooled with the 996 (1999); the 993
  // was the last air-cooled (1998). A modern Porsche is out of an air-cooled
  // specialist's lane, so a 2021 992 gets the weak form, not "squarely".
  if(make==="porsche"&&/air.?cool/.test(spec)){
    return year>0&&year<=1998;
  }
  // A vintage/classic-qualified specialty gates on the car being of that era.
  if(/\bvintage\b|\bclassic\b|pre-?\d{2,4}/.test(spec)){
    return year>0&&year<=1990;
  }
  // No era qualifier for this make: a listed-make match stands as a lane match.
  return true;
}
// The strong form only when the car genuinely sits in the partner's specialty
// era; otherwise the honest, data-true weak form. Empty when make history is
// too thin (the caller falls back to the curated specialty line).
function laneWhyLine(profile){
  const rel=profile?.verified?.relevance;
  if(!(rel&&rel.makeCount>=3))return "";
  return carEraMatchesSpecialty(sellState.resolvedVehicle,profile)
    ?`${rel.make} is squarely in his lane.`
    :`${pluralizeMake(rel.make)} are core to his tracked record.`;
}

function renderFeaturedPowerSellerProfile(profile,platformFirst,plateHTML){
  if(!profile)return "";
  const firstName=powerSellerFirstName(profile);
  const platformChips=powerSellerPlatformLogoChips({platforms:profile.providedPlatforms||profile.platforms||[]});
  const proofHTML=powerSellerProofHTML(profile);
  const v=profile.verified||{};
  const honestyNote=v.belowCareerMinimum
    ?`<div class="sell-rec-reason">We've tracked too few of ${escapeHtml(firstName)}'s sales in our own records to compute his numbers fairly yet. His history below is his own account.</div>`
    :"";
  // The why-line is the card's hero (locked hierarchy): serif voice, the
  // make-scoped numbers when he genuinely has the make (3+ tracked),
  // otherwise his curated specialty line. Never an invented claim.
  const laneText=laneWhyLine(profile);
  const whyLine=laneText
    ?`<div class="dossier-why">${escapeHtml(laneText)}</div>`
    :(()=>{
      const specialty=(profile.profileStats||[]).find(l=>/^specializes in/i.test(l.text||""));
      const tail=specialty?String(specialty.text).replace(/^specializes in:?\s*/i,""):"";
      return tail?`<div class="dossier-why">He specializes in ${escapeHtml(tail)}.</div>`:"";
    })();
  const dossier=dossierGridCells(profile,v);
  const gridCellCount=dossier.cells.length+(dossier.specialize?1:0);
  const gridHTML=gridCellCount>=3?`<div class="dossier-grid">${dossier.cells.slice(0,4).map(cell=>`<div class="dossier-cell"><span class="dc-value">${numify(cell.value)}</span><span class="label-mono">${escapeHtml(cell.key)}</span></div>`).join("")}${dossier.specialize?`<div class="dossier-cell full"><span class="dc-value">${numify(dossier.specialize)}</span><span class="label-mono">Specializes in</span></div>`:""}</div>${dossier.leftovers.map(line=>`<div class="power-seller-proof">${numify(line)}</div>`).join("")}`:null;
  // The plate and the AUCTION CONSIGNOR banner are direct grid children
  // spanning ALL columns (full card width); inside the main column they
  // could only ever span the column, which read as cramped. The
  // "What's a PowerSeller?" education lives BELOW the card, not in it.
  return `<div class="power-seller-feature" onclick="choosePowerSeller('${escapeHtml(profile.id)}')">
    ${plateHTML||""}
    <div class="ps-consignor-row"><span class="label-mono">Auction consignor</span></div>
    <div class="power-seller-feature-main">
      ${plateHTML?"":`<div class="sell-rec-badge specialist label-mono">${platformFirst===true?"Option 2: have it handled":platformFirst===false?"Option 1: have it handled":"Have it handled"}</div>
      <span class="observed-seller-name">${escapeHtml(profile.displayName||profile.name)}</span>`}
      ${whyLine}
      <div class="power-seller-service">${escapeHtml(powerSellerServiceLine())}</div>
      ${gridHTML||(proofHTML?`<div class="power-seller-proof-list">${proofHTML}</div>`:honestyNote)}
      ${platformChips?`<div class="power-seller-platform-row"><span class="power-seller-profile-label">Lists on (per ${escapeHtml(profile.name)})</span>${platformChips}</div>`:""}
      <span class="observed-seller-why">What ${escapeHtml(profile.name)} says he handles</span>
      <ul class="sell-rec-bullets">${powerSellerWhyBullets(profile,0).slice(0,2).map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${profile.specialtiesNote?`<div class="power-seller-profile-grid"><div class="power-seller-profile-block"><div class="power-seller-profile-label">Typical clients (per ${escapeHtml(profile.name)})</div><div class="power-seller-chip-row">${powerSellerClientChips(profile)}</div></div></div>`:""}
    </div>
    <div class="sell-rec-actions"><button class="ghost" onclick="event.stopPropagation();choosePowerSeller('${escapeHtml(profile.id)}')">Request an introduction to ${escapeHtml(firstName)} -></button></div>
  </div>
  <div class="ps-education-below">A PowerSeller like ${escapeHtml(firstName)} handles the complete process so you don't have to: prep, photography, listing, buyer questions, logistics. <button class="ps-learn-link" onclick="event.stopPropagation();samExplainPowerSeller()">Learn more</button></div>`;
}

function renderMiniPowerSellerProfile(profile,label){
  if(!profile)return "";
  const firstName=powerSellerFirstName(profile);
  return `<div class="power-seller-mini" onclick="choosePowerSeller('${escapeHtml(profile.id)}')">
    <div class="sell-rec-badge specialist">${escapeHtml(label||"Also worth a call")}</div>
    <span class="observed-seller-name">${escapeHtml(profile.displayName||profile.name)}</span>
    <span class="observed-seller-meta">${escapeHtml(profile.region||"Worth checking")}</span>
    <span class="observed-seller-why">Why ${escapeHtml(firstName)}</span>
    <div class="sell-rec-reason">${escapeHtml(powerSellerMiniReason(profile))}</div>
    <div class="sell-rec-actions"><button class="ghost" onclick="event.stopPropagation();choosePowerSeller('${escapeHtml(profile.id)}')">Speak to ${escapeHtml(firstName)}</button></div>
  </div>`;
}

function powerSellerMiniReason(profile){
  const firstName=powerSellerFirstName(profile);
  const region=profile.region?` ${profile.region}`:"";
  // Car-specific first (locked): the tracked make relevance names THIS car;
  // the curated specialty note (attributed) is the fallback.
  const lane=laneWhyLine(profile);
  const carLine=lane?`${lane} `:"";
  if(profile.note&&!/^I’d ask\b/i.test(profile.note))return `${carLine}${profile.note}`;
  return `${carLine}${firstName} is another good fit${region ? ` in${region}` : ""} if you want help with auction management, buyer questions and deciding where the car should run.`;
}

function powerSellerSpecialties(){
  const car=cleanCarForCopy();
  const tags=[];
  if(/\bporsche\b/i.test(car)){
    tags.push("Porsche");
    const trim=porsche911TrimFromText(car);
    if(trim)tags.push(trim);
    if(/\b(gt2|gt3|turbo|rs|sport classic)\b/i.test(car))tags.push("Modern GT cars");
  }else if(/\bferrari\b/i.test(car)){
    tags.push("Ferrari","High-value cars");
  }else if(/\b(acura|honda)\b/i.test(car)&&/\bnsx\b/i.test(car)){
    tags.push("NSX","Japanese performance");
  }else if(/\bbmw\b/i.test(car)){
    tags.push("BMW","Performance cars");
  }else if(/\bford\b/i.test(car)&&/\bmustang\b/i.test(car)){
    tags.push("Mustang","American performance","Muscle cars");
  }else{
    tags.push("Auction management");
  }
  if(sellState.state)tags.push(sellState.state);
  return [...new Set(tags)].slice(0,4);
}

function powerSellerWhyBullets(seller,index){
  const firstName=powerSellerFirstName(seller);
  if((seller?.serviceClaims||[]).length){
    return seller.serviceClaims.slice(0,4).map(claim=>claim.text);
  }
  const bullets=[
    `${firstName} can help decide where this car should run instead of assuming one platform is always right.`,
    sellState.state?`They can take the buyer questions, comments and logistics off your plate in ${sellState.state}.`:"They can take buyer questions, comments and logistics off your plate.",
    "You still choose whether to make contact; nothing is sent without your approval."
  ];
  if(index===0)bullets[0]=`This is the first call I’d make ahead of any platform decision.`;
  return bullets;
}

function performancePercentLabel(value){
  const abs=Math.round(Math.abs(Number(value)||0));
  if(abs>20)return "more than 20%";
  if(abs>=16)return "around 20%";
  if(abs>=11)return "around 15%";
  return `${abs}%`;
}

function plural(value,singular,pluralWord){
  return `${value} ${value===1?singular:pluralWord||`${singular}s`}`;
}

// Alternative-card bullets (locked): grounded, car-specific, never green.
// Bullet 1: the tier claim vs remaining platforms (most/second-most), else
//   segment fit, else the curated strength line.
// Bullet 2: CAR-SPECIFIC: this platform's own comps for the model with
//   their typical price band (a range, never a median; counts render only
//   at 10+).
// Bullet 3: speed positioning from curated policy, only when the
//   alternative is curated-fast and the pick is not.
// (1b) deleted: altReasonBullets - replaced by composeCard

// Tier B leadership check: true only when this platform's evidence count
// strictly beats every other platform's count AND the per-platform counts
// account for the full cross-platform denominator (an unaccounted platform
// means leadership is unverifiable, so Tier C).
function platformLeadsEvidenceSet(route){
  const e=route?.marketEvidence||{};
  const mine=Number(e.evidenceSales||0);
  if(!mine)return false;
  // Minimum denominator (locked): "dominates"/leadership never renders on a
  // thin set. Below 10 total, the honest existence line ("regularly sells")
  // carries the card instead.
  if(Number(e.totalEvidenceSales||0)<10)return false;
  const others=(sellState.allRouteOptions||[])
    .filter(other=>other!==route&&other.marketEvidence)
    .map(other=>Number(other.marketEvidence.evidenceSales||0));
  const accounted=mine+others.reduce((a,b)=>a+b,0);
  if(accounted<Number(e.totalEvidenceSales||0))return false;
  return mine>Math.max(0,...others);
}

// Day advantage (locked): platform-scoped, weekdays only, never Saturday or
// Sunday, never for Cars & Bids (no weekend auctions and no day edge to
// claim). Gates unchanged: 3+ sales on the named day and a 10%+ lift.
// "historically" is required wording because the window is all-time.
function weekdayBullet(route){
  if(/carsandbids/.test(String(route?.platform||""))||/cars\s*&\s*bids/i.test(String(route?.label||"")))return null;
  const h=route?.marketEvidence?.dayAdvantage;
  if(!h?.weekday)return null;
  if(["Saturday","Sunday"].includes(h.weekday))return null;
  if((h.sales||0)<3||(h.liftPercent||0)<10)return null;
  // Only claim a specific weekday when the pattern is proven for THIS model, not
  // merely the make (locked, generalized): a make-wide pattern is too coarse to
  // attribute to the seller's exact car. Applies to any platform's day data.
  if(h.scope!=="model")return null;
  const name=platformDisplayName(route.label||route.platform);
  const scopeLabel=comparableModelLabel();
  return `On ${name}, ${h.weekday} endings have historically finished strongest for ${scopeLabel}, around ${h.liftPercent}% above other weekdays.`;
}

// Gated cross-platform price delta (Phase 2). Only when BOTH platforms carry a
// real 5+ comparable sample, so the comparison is proven not invented (rule 1).
// Negligible gaps (< $1,000) are dropped. Rounded to the nearest $100.
function gatedPriceDelta(route,altRoute){
  const e=route?.marketEvidence,a=altRoute?.marketEvidence;
  if(!e||!a)return null;
  if((e.evidenceSales||0)<5||(a.evidenceSales||0)<5)return null;
  const pm=Number(e.medianSalePrice||0),am=Number(a.medianSalePrice||0);
  if(!pm||!am)return null;
  const delta=Math.round((pm-am)/100)*100;
  if(Math.abs(delta)<1000)return null;
  const altName=platformDisplayName(altRoute.label||altRoute.platform);
  return `Typically ${formatUsd(Math.abs(delta))} ${delta>0?"higher":"lower"} than ${altName}.`;
}

// ===================== 1b: EVIDENCE-FIRST CARD COMPOSER =====================
// composeCard(vehicle, route, opts) is the ONE source of every card's headline
// and bullets, in every layout. Each returned string carries provenance from a
// named evidence field; a field with no backing does not render. No template
// sentences, no sell-through, no value opinions. Market claims state their scope
// AND their <=180-day window in the sentence.

// Plural, human phrase for the car at a given scope. Model scope names the car;
// generation names the chassis; make is "<Make>s as a whole".
function composerPlural(word){const w=String(word||"").trim();return /s$/i.test(w)?w:`${w}s`;}
// A headline was suppressed because its finding arrived without a trustworthy
// scope. Logged (not silent) so absent-scope findings are visible in the field.
function composerScopeMiss(scope){
  try{ (typeof console!=="undefined"&&console.warn)&&console.warn("[composeCard] headline suppressed: absent/unrecognized scope",JSON.stringify(scope)); }catch(e){}
}
// Human phrase naming the cars at a finding's scope. The scope MUST be explicit:
// an absent or unrecognized scope returns null so the caller FAILS CLOSED rather
// than silently mislabeling any-year sales with the requested year (Part 3, 3.1
// and 3.2). Only exact-year (and a caller's intentional "model" scope) may name
// the requested year; any-year and near-years never do (3.3).
// singular=true returns the SINGULAR model form ("2006 M3", "F355", "991.2-
// generation Porsche 911") for compound-noun constructions like "{X} sales";
// the default plural form ("2006 M3s") reads as a subject ("M3s have closed...").
function composerScopePhrase(vehicle,scope,generationCode,segmentLabel,singular){
  const make=vehicle&&vehicle.make?String(vehicle.make):"";
  const model=vehicle&&vehicle.model?String(vehicle.model):"";
  if(!scope){composerScopeMiss("(absent)");return null;}
  if(scope==="make"||!model)return singular?(make||"these cars"):`${composerPlural(make||"these car")} as a whole`;
  const modelWord=singular?model:composerPlural(model);
  if(scope==="generation"){
    if(!generationCode){composerScopeMiss("generation-without-code");return null;}
    return `${String(generationCode).toUpperCase()}-generation ${make} ${modelWord}`.trim();
  }
  if(scope==="segment")return segmentLabel?String(segmentLabel):(composerScopeMiss("segment-without-label"),null);
  // Exact year (or a caller's intentional "model" scope) may name the year.
  if(scope==="exact_year"||scope==="model"){
    const yr=vehicle&&vehicle.year?`${vehicle.year} `:"";
    return `${yr}${modelWord}`;
  }
  // Any-year / cross-generation and near-years / calendar ranges are model-wide:
  // name the model, never the single requested year. The "across all model
  // years" qualifier for any-year is added by the caller via composerScopeSpanNote.
  if(scope==="any_year"||scope==="any_year_model"||scope==="near_years"||scope==="year_range"||scope==="near_years_model"||scope==="year_range_model")return modelWord;
  composerScopeMiss(scope);
  return null;
}
// Possessive for a platform name: "Cars & Bids" ends in s -> "Cars & Bids'";
// "Bring a Trailer" -> "Bring a Trailer's". Used wherever copy says "<platform>'s sales".
function platformPossessive(name){
  const n=String(name||"");
  return /s$/i.test(n)?`${n}'`:`${n}'s`;
}
// Trailing qualifier making the year span explicit when a finding was measured
// across every model year (3.3). Empty for every scope that names a specific
// year or a bounded window.
function composerScopeSpanNote(scope){
  return (scope==="any_year"||scope==="any_year_model")?" across all model years":"";
}
// Fine-grained landed-rung scope for the year decision (exact vs any/near year),
// used by headline composers that would otherwise hardcode "model" and wrongly
// prepend the requested year at a widened rung. Coarser than the delta's own
// scope but enough to decide whether the year may appear (3.5).
function composerLandedYearScope(){
  const key=String(sellState.sellDecision&&sellState.sellDecision.evidence&&sellState.sellDecision.evidence.ladder&&sellState.sellDecision.evidence.ladder.landed&&sellState.sellDecision.evidence.ladder.landed.key||"");
  if(/exact_year/.test(key))return "exact_year";
  if(/generation/.test(key))return "generation";
  if(/near_years/.test(key))return "near_years";
  if(/year_range/.test(key))return "year_range";
  if(/any_year/.test(key))return "any_year";
  return "model";
}
// Weekday advantage bullet (dayAdvantage): 180-day window, scope word required.
// Weekday sample gate mirrored on the render side (1b): even if a dayAdvantage
// object arrives, a weekday claim needs 15+ backing comps and a scope word.
const WEEKDAY_MIN_SAMPLE=15;

// ===================== PLAUSIBILITY GATE (Ford GT round, July 2026) =====================
// ONE gate every numeric template passes through before it prints a percentage.
// A value outside its sane band (a pollution/composition artifact, e.g. a 1049%
// weekday) fails closed - the template renders nothing - and is logged. Bands
// are per template; weekday also rounds to the nearest 5 for display stability.
const METRIC_BANDS={
  weekday:{min:5,max:40,round:5},        // day-of-week timing realistically moves closing price only modestly
  premium:{min:10,max:150,round:null},   // a cross-platform price delta above ~1.5x is composition, not a real premium
  specialization:{min:2,max:25,round:null} // "N times the share": beyond 25x is a computation artifact
};
function logImplausibleMetric(template,value,extra){
  try{
    const rec={template,value,at:new Date().toISOString(),...(extra||{})};
    (globalThis.__implausibleMetrics=globalThis.__implausibleMetrics||[]).push(rec);
    if(typeof console!=="undefined"&&console.warn)console.warn(`[plausibility] suppressed ${template} value ${value}`,extra||"");
  }catch(e){}
}
// Returns {ok, value}. ok=false means the template must render nothing.
function metricGate(value,template,extra){
  const b=METRIC_BANDS[template];const v=Number(value);
  if(!b||!Number.isFinite(v))return {ok:false,value:v};
  const mag=Math.abs(v);
  if(mag<b.min||mag>b.max){logImplausibleMetric(template,v,extra);return {ok:false,value:v};}
  const display=b.round?Math.round(v/b.round)*b.round:v;
  return {ok:true,value:display};
}
// At most ONE weekday bullet per rendered result: the caller (result.js) drops
// weekday bullets from every card after the first that carries one. Kept pure so
// composeCard has no cross-call state. Provenance starts "dayAdvantage(".
function dedupeWeekdayAcrossCards(options){
  let seen=false;
  for(const opt of options||[]){
    const b=opt&&opt.composed&&opt.composed.bullets;
    if(!Array.isArray(b))continue;
    opt.composed.bullets=b.filter(x=>{
      if(x&&/^dayAdvantage\(/.test(x.provenance||"")){ if(seen)return false; seen=true; }
      return true;
    });
  }
}
// A price delta is only usable as a Mode-A finding when it clears the sample
// gate AND the plausibility band (an implausibly large delta is a residual
// composition/pollution artifact and fails closed to the honest cascade).
function premiumIsPlausible(p){
  if(!p)return false;
  if(p.type==="market_dominance")return true;
  if(p.gateType==="symmetric"&&Number.isFinite(p.percent)&&p.percent>=10)return metricGate(p.percent,"premium",{scope:p.scope}).ok;
  return false;
}
// Weekday bullet, TIERED by bucket sample (Ford GT round). At most one per result.
//  TIER 1 (strong): winning-day bucket >= 5 AND total >= 20 AND lift in the
//          plausibility band [5,40] -> renders the percentage, ROUNDED TO 5.
//  TIER 2 (direction): winning-day bucket >= 3 AND total >= 12, lift in [5,60]
//          -> "has tended to close strongest on Fridays", NO number.
//  TIER 3 (below floor, or lift outside band) -> renders nothing (logged).
// The make-scope line was always direction-only and maps to Tier 2.
const WEEKDAY_TIER1_DAY=5, WEEKDAY_TIER1_TOTAL=20;
const WEEKDAY_TIER2_DAY=3, WEEKDAY_TIER2_TOTAL=12, WEEKDAY_TIER2_MAX_LIFT=60;
// PURE (no shared state): the "at most one weekday card per result" rule is
// enforced by the caller (result.js dedupes across cards). An absent sample is
// treated as sufficient (the backend already gated it), preserving prior recall.
function composerWeekdayBullet(vehicle,ev){
  const d=ev&&ev.dayAdvantage;
  if(!d||!d.weekday||!d.scope||!Number.isFinite(Number(d.liftPercent)))return null;
  const total=d.sample!=null?Number(d.sample):null;
  const daySales=d.sales!=null?Number(d.sales):null;
  const lift=Number(d.liftPercent);
  const win=Number(d.window)>=365?`over the past year`:`over the past ${d.window||180} days`;
  const prov=t=>`dayAdvantage(${d.scope},${d.window||180}d${t})`;
  // make scope is inherently coarse: ALWAYS direction only, established wording,
  // gated to a directionally-sane lift so an absurd internal figure never routes.
  if(d.scope==="make"){
    if(!(Math.abs(lift)>=METRIC_BANDS.weekday.min&&Math.abs(lift)<=WEEKDAY_TIER2_MAX_LIFT))return null;
    const make=vehicle&&vehicle.make?composerPlural(vehicle.make):"These cars";
    return { text:`${make} as a whole have closed strongest on ${d.weekday}s ${win}.`, provenance:prov(",direction") };
  }
  const phrase=composerScopePhrase(vehicle,d.scope,d.generationCode);
  if(!phrase)return null; // fail closed: generation rung with no code
  // TIER 1: strong sample + gated, rounded, plausible lift -> percentage.
  const tier1=(total==null||total>=WEEKDAY_TIER1_TOTAL)&&(daySales==null||daySales>=WEEKDAY_TIER1_DAY);
  if(tier1){
    const g=metricGate(lift,"weekday",{scope:d.scope,weekday:d.weekday,sample:total});
    if(g.ok)return { text:`${phrase} have closed strongest on ${d.weekday}s, around ${g.value}% above other days, ${win}.`, provenance:prov(`,${g.value}%`) };
    // outside the band: no number; fall through to a direction line if sane.
  }
  // TIER 2: direction only.
  const tier2=(total==null||total>=WEEKDAY_TIER2_TOTAL)&&(daySales==null||daySales>=WEEKDAY_TIER2_DAY);
  if(tier2&&Math.abs(lift)>=METRIC_BANDS.weekday.min&&Math.abs(lift)<=WEEKDAY_TIER2_MAX_LIFT){
    return { text:`${phrase} have tended to close strongest on ${d.weekday}s ${win}.`, provenance:prov(",direction") };
  }
  return null; // TIER 3
}
// Curated audience/specialty fact from the platform copy library.
function composerAudienceBullet(ev){
  const line=platformFitLine({label:ev.label,platform:ev.platform});
  return line?{ text:line, provenance:"platformFitCopy" }:null;
}
// Specialization-share bullet (Stage 2): a COMPUTED claim that replaces the
// vague curated audience line for the same platform. Observation only, locked
// shape, states the scope label + "share" + the 180-day window. Renders on
// whichever card the platform appears on; no cell -> null.
function composerSpecializationBullet(ev){
  const sc=ev&&ev.specializationCell;
  if(!sc||!Number.isFinite(Number(sc.lift_rounded))||!sc.scope_label)return null;
  if(!metricGate(sc.lift_rounded,"specialization",{scope:sc.scope,platform:ev.platform}).ok)return null;
  const name=platformDisplayName(ev.label||ev.platform);
  return { text:`${sc.scope_label} make up around ${sc.lift_rounded} times the share of ${platformPossessive(name)} sales that they do of the rest of the market we track over the past 180 days.`, provenance:`specialization(${sc.scope},${sc.lift_rounded}x)` };
}
// Branch-5 specialist headline: the specialist (not the depth leader) crowns
// Card 1, so the headline states that reason from the computed cell.
function composerSpecialistHeadline(ev){
  const sc=ev&&ev.specializationCell;
  if(!sc||!Number.isFinite(Number(sc.lift_rounded))||!sc.scope_label)return null;
  if(!metricGate(sc.lift_rounded,"specialization",{scope:sc.scope,platform:ev.platform}).ok)return null;
  const name=platformDisplayName(ev.label||ev.platform);
  return { text:`${name} specializes in ${sc.scope_label}: they make up around ${sc.lift_rounded} times the share of its sales that they do of the rest of the market we track over the past 180 days.`, provenance:`specialistPick(${sc.scope},${sc.lift_rounded}x)` };
}
// Speed copy (agnostic + accurate): the advantage is TIME TO LIST -- how fast a
// submitted car gets listed and in front of buyers -- NOT auction length (live
// auctions run similar lengths). This is the ONE copy-library phrase for speed;
// the platform name is injected, never inlined per platform. "quicker auction
// cycle" is lint-banned.
const LISTING_SPEED_PHRASE = name => `${name} generally gets your listing live faster`;
// Conditional speed line, only when the seller indicated speed matters.
function composerSpeedBullet(ev,opts){
  if(!opts.sellerWantsSpeed||!["fast","medium_fast"].includes(ev.speedToList))return null;
  return { text:`If speed matters, ${LISTING_SPEED_PHRASE(platformDisplayName(ev.label||ev.platform))}.`, provenance:"speedToList" };
}
// Depth-honesty bullet (ranking branch 4): a stated speed preference put the
// faster-to-list platform on Card 1 over the depth leader when the price spread
// is unknown. The pick card MUST own that honestly by naming the depth leader.
function composerDepthHonestyBullet(vehicle,ev,opts){
  if(!opts.isPick||opts.routingReason!=="speed_unknown"||!opts.depthLeaderName)return null;
  // Landed-scope aware: the requested year appears only at an exact-year rung (3.5).
  const scope=composerScopePhrase(vehicle,composerLandedYearScope(),composerLandedGenerationCode(),null,true)||(vehicle&&vehicle.model);
  return { text:`${opts.depthLeaderName} holds most of the recent ${scope} sales we track. If market depth matters more than timing, start there instead.`, provenance:"depthHonesty" };
}
// Branch-4 speed-preference headline: the rank came from the seller's PREFERENCE
// (unknown spread), so the headline states that true reason plus the platform's
// own real sales, never a price or depth claim it did not earn.
function composerSpeedPreferenceHeadline(vehicle,ev){
  const name=platformDisplayName(ev.label||ev.platform);
  // Landed-scope aware: the requested year appears only at an exact-year rung (3.5).
  const scope=composerScopePhrase(vehicle,composerLandedYearScope(),composerLandedGenerationCode(),null,true)||(vehicle&&vehicle.model);
  return { text:`You said speed matters. ${name} generally gets your listing live faster and has closed recent ${scope} sales.`, provenance:"speedPreference" };
}
// Mode A delta headline: the winning platform's cleared comparative delta.
function composerDeltaHeadline(vehicle,ev){
  const p=ev.pricePremium;if(!p)return null;
  const name=platformDisplayName(ev.label||ev.platform);
  const win=`over the past ${p.windowDays} days`;
  // Fail closed: without a trustworthy scope we never guess "model" (which would
  // prepend the requested year to an any-year finding); we drop the headline (3.1/3.2).
  const phrase=composerScopePhrase(vehicle,p.scope,p.generationCode,p.segmentLabel);
  if(!phrase)return null;
  const phraseSingular=composerScopePhrase(vehicle,p.scope,p.generationCode,p.segmentLabel,true)||phrase;
  const span=composerScopeSpanNote(p.scope);
  if(p.type==="market_dominance"){
    // Others < 5: no symmetric delta is computable, so we state the honest
    // situation (concentration + too thin to compare prices), never volume as if
    // it were the price finding, and never "where most sales".
    return { text:`Recent ${phraseSingular} sales${span} have concentrated on ${name}, with too few on other platforms to compare prices ${win}.`, provenance:`pricePremium.concentration(${p.scope},${p.windowDays}d)` };
  }
  if(p.gateType==="symmetric"&&Number.isFinite(p.percent)&&p.percent>=10){
    return { text:`${name} has closed ${phrase}${span} around ${p.percent}% higher than the other platforms we track ${win}.`, provenance:`pricePremium(${p.scope},${p.windowDays}d,${p.percent}%)` };
  }
  return null;
}
// Mode B similarity headline: prices within a small percentage; the reason Card 1
// leads (speed if the seller wants speed, else the deepest recent market).
function composerSimilarityHeadline(vehicle,ev,opts){
  const p=ev.pricePremium;
  const win=p?`over the past ${p.windowDays} days`:"recently";
  const name=platformDisplayName(ev.label||ev.platform);
  // Fail closed on absent scope (3.1/3.2); any-year sales never carry the year (3.3).
  const phrase=composerScopePhrase(vehicle,p&&p.scope,p&&p.generationCode,p&&p.segmentLabel);
  if(!phrase)return null;
  const span=composerScopeSpanNote(p&&p.scope);
  const reason=(opts.sellerWantsSpeed&&opts.routingReason==="speed")
    ?`so how quickly you can get listed decides: ${name} generally gets your listing live faster`
    :`so the deepest recent market for this car leads: ${name} has the most recent sales`;
  return { text:`Prices for ${phrase}${span} have been within a small percentage across the top platforms ${win}, ${reason}.`, provenance:`pricePremium.negligible(${p?p.windowDays+"d":"?"})` };
}
// Thin-data caveat: no rung carries a real comp base. Names the rung that was
// actually THIN (the exact year-specific car) and states we widened to the landed
// rung - never names the landed rung as if IT were the thin one.
function composerHonestHeadline(vehicle,rungWord){
  const yr=vehicle&&vehicle.year?`${vehicle.year} `:"";
  const car=vehicle&&vehicle.model?`the ${yr}${[vehicle.make,vehicle.model].filter(Boolean).join(" ")}`:`this ${vehicle&&vehicle.make?vehicle.make:"car"}`;
  const word=rungWord||"model";
  return { text:`Recent sales for ${car} are limited, so I widened to the ${word} to reach the buyers for it.`, provenance:`ladder.landed(${word})` };
}
// Generation code for the landed rung, when the ladder mapped one.
function composerLandedGenerationCode(){
  return (sellState.sellDecision&&sellState.sellDecision.evidence&&sellState.sellDecision.evidence.ladder&&sellState.sellDecision.evidence.ladder.landed&&sellState.sellDecision.evidence.ladder.landed.generationCode)||null;
}
// Rung-cascade fallback headline (RUNG LADDER CASCADE): no delta, similarity or
// concentration finding cleared the gates, so state the finding at the rung the
// analysis actually LANDED on (exact year -> generation -> segment -> make),
// scope labeled, never the bare "limited sales" line when a rung carries real
// comps. "Closed strongest among recent sales" is a RELATIVE claim, made only
// when the pick is the deepest recent market at that scope (opts.isVolumeLeader)
// with a real comp base (>=3). Below that it degrades to the honest thin-data
// caveat, or to the speed reason when speed routed the pick to a non-leader.
function composerCascadeHeadline(vehicle,ev,opts,landedScope){
  const name=platformDisplayName(ev.label||ev.platform);
  const genCode=opts.landedGenerationCode||composerLandedGenerationCode();
  // A branch-4 speed-preference pick uses composerSpeedPreferenceHeadline, so no
  // speed line is appended here; the cascade states the market finding only.
  const speedLine="";
  const rungWord=landedScope==="make"?"make":landedScope==="segment"?"segment":landedScope==="generation"?"generation":"model";
  const base=Number(ev.evidenceSales||0);
  const leads=opts.isVolumeLeader!==false;
  // No real comp base at the landed rung, or the pick is not the volume leader
  // (e.g. speed routed it ahead of a deeper market): the "strongest" claim would
  // be false, so state the honest thin-data caveat naming the rung. The speed
  // reason, when it applies, is carried by the conditional speed BULLET.
  if(base<3||!leads){
    return composerHonestHeadline(vehicle,rungWord);
  }
  // RUNG 4 (make): a make-level lead, always caveated for the exact model.
  if(landedScope==="make"){
    return { text:`Among recent ${vehicle&&vehicle.make?vehicle.make:"comparable"} sales, ${name} leads. Limited recent data for this exact model.`, provenance:`ladder.landed(make)` };
  }
  // RUNG 3 (segment): the model family closes strongest here (no year: segment
  // evidence spans siblings and years, so the year would misstate the scope).
  if(landedScope==="segment"){
    return { text:`${composerPlural(vehicle&&vehicle.model?vehicle.model:vehicle&&vehicle.make?vehicle.make:"These cars")} close strongest on ${name}.${speedLine}`, provenance:`ladder.landed(segment)` };
  }
  // RUNG 2 (generation): scope the chassis when we have its code.
  if(landedScope==="generation"&&genCode){
    return { text:`${name} has closed ${composerScopePhrase(vehicle,"generation",genCode)} strongest among recent sales.${speedLine}`, provenance:`ladder.landed(generation:${genCode})` };
  }
  // RUNG 1 (exact year / model): a real lead, no delta cleared. The requested
  // year appears only when the landed rung is exact-year (3.5).
  return { text:`${name} has closed ${composerScopePhrase(vehicle,composerLandedYearScope(),genCode)||composerPlural(vehicle&&vehicle.model)} strongest among recent sales.${speedLine}`, provenance:`ladder.landed(model)` };
}
// Reserve-context bullet (Phase 1.5): CORRELATION ONLY. Rendered on ANY card
// (pick or alt) with a cell, always last (context, not a reason). Locked
// wording; the allowed verb is "averaged". Never a causation or outcome claim.
function reserveMonthName(m){
  const names=["","January","February","March","April","May","June","July","August","September","October","November","December"];
  return names[Number(String(m||"").split("-")[1])]||"recent months";
}
function composerReserveBullet(ev){
  const rc=ev&&ev.reserveContext;
  if(!rc)return null;
  const month=reserveMonthName(rc.data_month);
  const platform=platformDisplayName(ev.label||ev.platform);
  const tail=" You'll need to decide: is a reserve right for your car's condition and positioning?";
  if(Math.abs(Number(rc.delta_pct))>=3){
    const dir=Number(rc.delta_dollars)>=0?"higher":"lower";
    const dollars=Math.abs(Math.round(Number(rc.delta_dollars))).toLocaleString();
    return { text:`In ${month}, ${platform} auctions with reserves in your price band averaged $${dollars} ${dir} than those without.${tail}`, provenance:`reserveContext(${rc.data_month},${rc.delta_pct}%)` };
  }
  return { text:`In ${month}, ${platform} auctions in your price band averaged similar money with or without a reserve.${tail}`, provenance:`reserveContext(${rc.data_month},similar)` };
}

// Landed-rung scope word for the honest headline, from the evidence ladder.
function composerLandedScope(){
  const key=String(sellState.sellDecision?.evidence?.ladder?.landed?.key||"");
  if(/make/.test(key))return "make";
  if(/generation/.test(key))return "generation";
  if(/segment/.test(key))return "segment";
  return "model";
}
// THE composer. Returns { headline:{text,provenance}|null, bullets:[{text,provenance}] }.
function composeCard(vehicle,route,opts={}){
  if(opts.powerSeller){
    return { headline:{ text:powerSellerIntroLine(), provenance:"powerSellerService" },
      bullets:[{ text:powerSellerServiceLine(), provenance:"powerSellerService" }] };
  }
  const ev=Object.assign({},route.marketEvidence||{},{ label:route.label, platform:route.platform, speedToList:route.speedToList, about:route.about });
  const unverified=!!(vehicle&&vehicle.unverified);
  const landedScope=opts.landedScope||"make";
  let headline=null;
  if(unverified){
    // Make-level read only; never a verified-style delta/weekday claim.
    headline=composerHonestHeadline(vehicle, vehicle&&vehicle.make?"make":landedScope);
  }else if(opts.isPick&&opts.routingReason==="specialist"&&ev.specializationCell){
    // Ranking branch 5: the specialist (not the depth leader) took Card 1.
    headline=composerSpecialistHeadline(ev);
  }else if(opts.isPick&&opts.routingReason==="speed_unknown"){
    // Ranking branch 4: the seller's speed preference (not a price finding)
    // put this platform on Card 1. State that true reason.
    headline=composerSpeedPreferenceHeadline(vehicle,ev);
  }else if(opts.isPick){
    const p=ev.pricePremium;
    if(premiumIsPlausible(p)){
      headline=composerDeltaHeadline(vehicle,ev);
    }else if(p&&p.gateType==="symmetric"&&Number.isFinite(p.percent)&&Math.abs(p.percent)<10){
      // Similarity is a SMALL spread only. A large negative delta means this
      // platform closes lower, so it is never framed as "similar money".
      headline=composerSimilarityHeadline(vehicle,ev,opts);
    }else{
      // No delta/similarity/concentration cleared: cascade through the rung
      // ladder and state the finding at the rung the analysis landed on.
      headline=composerCascadeHeadline(vehicle,ev,opts,landedScope);
    }
  }else{
    // Alt card: a price winner states its delta; a depth/concentration leader
    // (market_dominance) states its concentration finding; otherwise the honest
    // existence line.
    const p=ev.pricePremium;
    if(premiumIsPlausible(p)){
      headline=composerDeltaHeadline(vehicle,ev);
    }else if(Number(ev.evidenceSales||0)>0){
      // Landed-scope aware: the requested year appears only at an exact-year rung (3.5).
      const altScope=landedScope==="make"?"make":composerLandedYearScope();
      const altPhrase=composerScopePhrase(vehicle,altScope,composerLandedGenerationCode(),null,true)||(vehicle&&vehicle.model);
      headline={ text:`${platformDisplayName(ev.label||ev.platform)} has also closed recent ${altPhrase} sales.`, provenance:`evidenceSales(${ev.evidenceSales})` };
    }else{
      headline=null;
    }
  }
  // Safety net: a pick card must never be headless. If a gated template (an
  // implausible specialist lift, an absent scope) returned null, fall to the
  // honest cascade so the pick always states its landed-rung finding.
  if(!headline&&opts.isPick&&!unverified){ headline=composerCascadeHeadline(vehicle,ev,opts,landedScope); }
  const branch4=opts.isPick&&opts.routingReason==="speed_unknown";
  const bullets=[];
  if(!unverified){ const wk=composerWeekdayBullet(vehicle,ev); if(wk)bullets.push(wk); }
  // Branch 4 REQUIRES the depth-honesty bullet; place it high so the cap keeps it.
  if(branch4){ const dh=composerDepthHonestyBullet(vehicle,ev,opts); if(dh)bullets.push(dh); }
  // Specialization share (Stage 2): slots after the weekday line and REPLACES
  // the vague curated audience line for the same platform (a computed claim
  // beats a qualitative one). Not repeated as the headline on a specialist pick.
  const spec=(!unverified&&!(opts.isPick&&opts.routingReason==="specialist"))?composerSpecializationBullet(ev):null;
  if(spec)bullets.push(spec);
  const aud=spec?null:composerAudienceBullet(ev); if(aud)bullets.push(aud);
  // Branch 4's headline already owns the speed reason, so no redundant speed bullet.
  if(!branch4){ const spd=composerSpeedBullet(ev,opts); if(spd)bullets.push(spd); }
  // Dedupe (reuse the round-3 guard) and cap at 3; drop any that echo the headline.
  const out=[];
  for(const b of bullets){
    if(!b||!b.text)continue;
    if(headline&&bulletsSimilar(headline.text,b.text))continue;
    if(out.some(o=>bulletsSimilar(o.text,b.text)))continue;
    out.push(b);
  }
  const core=out.slice(0,3);
  // Reserve context (Phase 1.5): appended LAST on ANY card (pick or alt) that
  // has a reserve cell for that platform+make+band, after core evidence and
  // never displacing it. composerReserveBullet returns null when no cell exists.
  { const rb=composerReserveBullet(ev); if(rb)core.push(rb); }
  return { headline, bullets: core };
}

// "Why I picked this" is ONE list of three concrete reasons, never prose.
// Bullet 1 IS the share claim (validated 10+ cross-platform denominator,
// rendered green); below the gate it falls back to the honest existence
// line, neutral. Items are {text, validated} so the renderer can style
// the earned-green line without a separate band component.
// (1b) deleted: primaryReasonBullets - replaced by composeCard

// Card-level dedup guard (locked B1): no two bullets on one card may share the
// same lead clause or more than 60% of their words. The later duplicate is
// dropped. Applied to every card's bullet list before it renders.
function bulletLeadClause(t){
  return String(t||"").toLowerCase().replace(/<[^>]*>/g," ").split(/[.,;:]/)[0].replace(/\s+/g," ").trim();
}
function bulletsSimilar(a,b){
  const norm=s=>String(s||"").toLowerCase().replace(/<[^>]*>/g," ").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
  const na=norm(a),nb=norm(b);
  if(!na||!nb)return false;
  if(na===nb)return true;
  const la=bulletLeadClause(a);
  if(la&&la.length>=8&&la===bulletLeadClause(b))return true;
  const wa=na.split(" ").filter(Boolean),wb=nb.split(" ").filter(Boolean);
  if(!wa.length||!wb.length)return false;
  const setB=new Set(wb);
  let inter=0;for(const w of new Set(wa))if(setB.has(w))inter++;
  return inter/Math.max(new Set(wa).size,new Set(wb).size)>0.6;
}
function dedupeBullets(bullets){
  const out=[];
  for(const b of bullets||[]){
    if(!b||!b.text)continue;
    if(out.some(o=>bulletsSimilar(o.text,b.text)))continue;
    out.push(b);
  }
  return out;
}
// Same guard for cards whose bullets are plain strings (comparison cards).
function dedupeStringBullets(arr){
  const out=[];
  for(const s of arr||[]){
    if(!s)continue;
    if(out.some(o=>bulletsSimilar(o,s)))continue;
    out.push(s);
  }
  return out;
}

// Banned filler patterns (DEFECT 2): a bullet must carry evidence only our data
// can produce. These phrases say nothing, so any bullet matching them is dropped
// before render. A card with one real bullet beats three empty ones.
const FILLER_BULLET_RE=/\ba car like this\b|remains viable|not the clearest|clearest first choice|\bstrong option\b|\breal signal\b|one of the stronger platforms/i;
function isFillerBullet(text){
  return FILLER_BULLET_RE.test(String(text||""));
}
// Final render-time guard for any bullet list (string or {text}): strip filler.
function evidenceOnlyBullets(bullets){
  return (bullets||[]).filter(b=>b&&!isFillerBullet(typeof b==="string"?b:b.text));
}

// Highest dollar value named in a segment band string ("$50k to $150k" ->
// 150000; "$50,000 to $150,000" -> 150000). Bare sub-1000 values are thousands.
// (1b) deleted dead helper: bandCeiling

// Sell-through line, gated on the seller's asking price (locked): if the asking
// price sits ABOVE the band ceiling, the band would misdescribe the car. We
// NEVER comment on whether a price is high or low (no value opinions, ever), so
// we DROP the sell-through bullet entirely (return null) and the caller fills
// the slot with other grounded evidence. Otherwise the qualitative band line.
// (1b) deleted dead helper: sellThroughLine

// "classic Porsches in the $50k to $150k range": era word from the resolved
// year, plural make, the platform's real segment band.
// (1b) deleted dead helper: segmentCategoryDesc

function weekdayInsightLine(evidence){
  if(evidence?.strongestWeekday){
    return `Overall, recent ${evidence.strongestWeekday} endings have looked strongest here.`;
  }
  if(evidence?.highestResultWeekday){
    return `The strongest recent comparable sale ended on a ${evidence.highestResultWeekday}.`;
  }
  return null;
}

function weekdayTag(evidence){
  if(evidence?.strongestWeekday)return `${evidence.strongestWeekday} endings have been strongest`;
  if(evidence?.highestResultWeekday)return `Strongest sale ended ${evidence.highestResultWeekday}`;
  return null;
}

function performanceDiscoveryTag(route,index){
  const evidence=route.marketEvidence||{};
  const delta=Number(evidence.performanceDeltaPercent);
  if(Number.isFinite(delta)&&Math.abs(delta)>=5){
    if(delta>0){
      if(delta>20)return "✓ More than 20% ahead of wider market";
      const rounded=Math.max(5,Math.round(delta/5)*5);
      return `✓ Around ${rounded}% ahead of wider market`;
    }
    if(Math.abs(delta)<=15)return "✓ Close enough to compare";
  }
  if(index===0&&evidence.topThreeSales>=2)return "✓ Strongest recent results came here";
  if(["fast","medium_fast"].includes(route.speedToList))return "✓ Quicker listing path";
  return index===0?"✓ Worth a look":"✓ Also worth comparing";
}

function formatUsd(value){
  const n=Math.round(Number(value)||0);
  return n?`$${n.toLocaleString("en-US")}`:null;
}

// primaryHeroStat is retired: the share claim moved into bullet 1 of
// primaryReasonBullets and the standalone evidence band no longer renders.

// Single facts object per route: chips, bullets, and headlines all derive
// from it, so contradictory fragments cannot render together.
function routeFacts(route){
  const e=route.marketEvidence||{};
  const medianDelta=(e.medianSalePrice&&e.othersMedianSalePrice)
    ?(e.medianSalePrice-e.othersMedianSalePrice)/e.othersMedianSalePrice:null;
  return {
    evidenceSales:e.evidenceSales||0,
    totalEvidenceSales:e.totalEvidenceSales||0,
    soloPlatform:(e.othersSalesCount||0)===0&&(e.evidenceSales||0)>0,
    medianSalePrice:e.medianSalePrice||null,
    othersMedianSalePrice:e.othersMedianSalePrice||null,
    medianDelta,
    medianLeads:medianDelta!==null&&medianDelta>=0,
    smallSample:((e.evidenceSales||0)+(e.othersSalesCount||0))<8||(e.evidenceSales||0)<3,
    topThreeSales:e.topThreeSales||0,
    weekday:e.strongestWeekday||null,
    weekdayLift:e.strongestWeekdayLiftPercent||null,
    momentum:e.momentum||null
  };
}

function routeTagLine(route,index,routes){
  // Chip row retired (locked rule: no fact renders twice in different words).
  // Its old contents duplicated the headline (strongest results = where comps
  // closed) and the timing bullet, so every dimension now renders exactly
  // once: headline, then distinct bullets.
  return "";
}

function comparableSalesLabel(){
  return comparableModelLabel().replace(/ models$/,"");
}

// (1b) deleted: routeEvidenceBullets - replaced by composeCard

// (1b) deleted: resultSummaryLine - replaced by composeCard

function compactPlatformCopy(option){
  // 1b: compact copy is the composed finding for this platform, nothing else.
  const c=option&&option.composed;
  if(c&&c.headline&&c.headline.text)return c.headline.text;
  if(c&&c.bullets&&c.bullets[0])return c.bullets[0].text;
  return "";
}

function marketEvidenceSentence(option){
  const evidence=option.marketEvidence;
  if(!evidence)return `I don't have enough recent comparable sales to give you a data-led answer for this car, so this is a fit call.`;
  if(Number.isFinite(evidence.performanceDeltaPercent)&&evidence.performanceDeltaPercent>=5){
    return `Recent comparable ${comparableModelLabel()} have consistently favoured ${option.name}.`;
  }
  if(Number.isFinite(evidence.performanceDeltaPercent)&&evidence.performanceDeltaPercent<0&&Math.abs(evidence.performanceDeltaPercent)<=15){
    return `${option.name} is close enough to the top platform that buyer fit and speed-to-list are worth comparing.`;
  }
  if(evidence.topThreeSales>=2)return `Recent comparable ${comparableModelLabel()} sales have consistently finished strongest on ${option.name}.`;
  return `${option.name} belongs in the comparison.`;
}

function matchCount(option){
  const evidence=option?.marketEvidence||{};
  return evidence.closeSales||evidence.relevantSales||evidence.evidenceSales||0;
}

function matchLabel(option){
  const evidence=option?.marketEvidence||{};
  if(evidence.closeSales||evidence.relevantSales)return "recent comparable activity";
  return "limited recent signal";
}

function medianDeltaSentence(option, other){
  const a=Number(option?.marketEvidence?.medianSalePrice||0);
  const b=Number(other?.marketEvidence?.medianSalePrice||0);
  if(!a||!b)return null;
  const diff=(a-b)/b*100;
  const abs=Math.abs(diff);
  const optionName=String(option.name||"This choice");
  if(abs<5)return pickCopy([
    `Similar cars have performed at a similar level across the leading choices ${marketWindowPhrase()}.`,
    `Recent comparable sales do not show a meaningful platform gap here.`,
    `${optionName} and ${other.name} are close enough that process, timing and seller workload matter more.`
  ],sellState.carName,optionName,other.name,a,b);
  if(diff<0){
    if(abs<=15)return pickCopy([
      `${optionName} is close enough to the top platform that buyer fit and speed-to-list are worth comparing.`,
      `${optionName} is close enough to ${other.name} that audience fit and auction workload are worth comparing.`,
      `${other.name} has the edge, but ${optionName} remains close enough to keep in the conversation.`
    ],sellState.carName,optionName,other.name,a,b);
    return pickCopy([
      `${other.name} has the clearer recent sales signal; I’d only choose ${optionName} if the process fits you better.`,
      `${optionName} stays in the conversation for practical reasons, but ${other.name} looks stronger on recent sales.`,
      `${other.name} is the stronger market choice right now; ${optionName} is mainly a process or timing comparison.`
    ],sellState.carName,optionName,other.name,a,b);
  }
  return pickCopy([
    `The recent ${comparableSalesLabel()} results land here more than anywhere else.`,
    `The recent sales signal points here.`
  ],sellState.carName,optionName,other.name,a,b);
}

function rankingReason(option,index,options){
  const primaryMarket=options.find(o=>o.marketEvidence);
  const evidence=option.marketEvidence;
  const bestAlt=options.find(o=>o!==option&&o.marketEvidence);
  if(option.key==="specialist")return option.reason;
  if(option===primaryMarket){
    if(!evidence)return `${option.name} is the strongest fit for your selling priorities.`;
    const compare=bestAlt?medianDeltaSentence(option,bestAlt):null;
    if(compare)return compare;
    return (sellState.sellOptions||[]).some(o=>o.key==="specialist")
      ?`If you decide to manage the auction yourself, this is the platform I'd look at first.`
      :`The recent ${comparableSalesLabel()} results land here.`;
  }
  if(!primaryMarket)return marketEvidenceSentence(option);
  const compare=medianDeltaSentence(option,primaryMarket);
  if(!evidence)return `${option.name} is only worth checking if the practical fit is better; I would not put it ahead of the platform choice on the sales data.`;
  return compare
    ? compare
    : `${primaryMarket.name} looks stronger on recent comparable sales.`;
}

function routeAnswer(option){
  // 1b: the answer is the composed finding for this platform (headline + bullets).
  const c=option&&option.composed;
  const parts=[];
  if(c&&c.headline&&c.headline.text)parts.push(c.headline.text);
  for(const b of (c&&c.bullets)||[])parts.push(b.text);
  return parts.join(" ");
}

function routeForOption(option){
  return (sellState.allRouteOptions||[]).find(route=>(route.label||route.platform)===option?.name)||null;
}

function compareSellOptions(){
  const specialist=(sellState.sellOptions||[]).find(o=>o.key==="specialist");
  const primaryPlatform=(sellState.sellOptions||[]).find(o=>o.key!=="specialist");
  const primaryPowerSeller=(sellState.powerSellerProfiles||[])[0];
  if(specialist&&primaryPowerSeller&&primaryPlatform){
    const sellerName=powerSellerFirstName(primaryPowerSeller);
    return `Here’s how I’d think about it.\n\n${sellerName}: you’ll probably pay a fee, but he can handle photography, listing prep, buyer questions, comments, scheduling, paperwork and platform choice. If you’re busy, or you haven’t sold on auction before, this is the lower-stress route.\n\n${primaryPlatform.name}: you keep more control, but you’re responsible for building the listing, answering every buyer question and choosing the right timing. With a car at this level, I’d only go this route if you’re comfortable running the auction yourself.`;
  }
  const options=(sellState.sellOptions||[]).filter(o=>o.key!=="specialist").slice(0,2);
  if(!options.length)return "I do not have enough platform data to compare yet.";
  if(options.length===1)return routeAnswer(options[0]);

  const [first,second]=options;
  const firstEvidence=first.marketEvidence||{};
  const secondEvidence=second.marketEvidence||{};
  const firstRoute=routeForOption(first);
  const secondRoute=routeForOption(second);
  const lines=[];
  const firstDelta=Number(firstEvidence.performanceDeltaPercent);
  const secondDelta=Number(secondEvidence.performanceDeltaPercent);

  if(Number.isFinite(firstDelta)&&firstDelta>=5){
    lines.push(`I’d lean ${first.name} because similar cars have recently finished ${performancePercentLabel(firstDelta)} stronger there than the rest of the tracked market ${marketWindowPhrase()}.`);
  }else if(Number.isFinite(secondDelta)&&secondDelta>=5){
    lines.push(`I’d lean ${second.name} because similar cars have recently finished ${performancePercentLabel(secondDelta)} stronger there than the rest of the tracked market ${marketWindowPhrase()}.`);
  }else{
    lines.push(`${first.name} and ${second.name} are close enough that buyer fit, speed and how much work you want to do should drive the choice.`);
  }

  const topRoute=[first,second].find(option=>(option.marketEvidence?.topThreeSales||0)>=2);
  if(topRoute){
    lines.push(`The strongest recent comparable sales came through ${topRoute.name}. That matters more to me than raw platform volume.`);
  }

  const dayLine=weekdayInsightLine(firstEvidence)||weekdayInsightLine(secondEvidence);
  if(dayLine)lines.push(dayLine);

  const faster=[first,second].find(option=>["fast","medium_fast"].includes(option.speedToList));
  const slower=[first,second].find(option=>option.speedToList==="slower");
  if(faster&&slower){
    lines.push(sellerWantsSpeed()
      ?`${faster.name} closes faster, and your timeline is the deciding factor here.`
      :`${faster.name} is the cleaner speed play; ${slower.name} takes longer to get live.`);
  }

  if(firstRoute&&secondRoute&&hasTwoRouteTradeoff([firstRoute,secondRoute])){
    lines.push(`My read: start with ${first.name}, but keep ${second.name} on the table if its buyer fit, speed or workload feels better.`);
  }

  return lines.filter(Boolean).join(" ");
}

function showTyping(){
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.id="typing";row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div></div>`;
  msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
}
function hideTyping(){const t=document.getElementById("typing");if(t)t.remove();}
// Vehicle-lookup loader (Bug 1): the resolver's /api/vehicleIdentity call can
// take a couple of seconds; never leave the seller staring at silence. Shows a
// Sam line + animated dots the moment a car is submitted, and is removed the
// instant the next question (or clarification) renders.
function showVehicleLookup(){
  const msgs=document.getElementById("msgs");
  if(!msgs||document.getElementById("vehLookup"))return;
  const row=document.createElement("div");row.id="vehLookup";row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div><div class="veh-lookup"><span class="veh-lookup-text">Looking that up</span><span class="typing veh-lookup-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div></div></div>`;
  msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
}
function hideVehicleLookup(){const t=document.getElementById("vehLookup");if(t)t.remove();}
function quick(text){document.getElementById("inp").value=text;send();}

// Phase 1c: full evidence + cards context for the post-result chat, so answers
// cite the real data instead of the frontend re-rendering a card.
// Data confidence as a QUALITATIVE band, never a raw count. The chat model must
// never see a sample size it could quote (Fix 1a): counts of sales/comps/records
// are banned in every user-facing surface, so the number cannot exist in the payload.
function evidenceBand(n){
  n=Number(n)||0;
  if(n>=10)return "a solid recent sample";
  if(n>=5)return "a moderate recent sample";
  if(n>=3)return "a modest recent sample";
  if(n>=1)return "a thin recent sample";
  return "no recent sample";
}
function sellChatEvidenceSummary(){
  // Card-identical only: quote the EXACT numbers and scope labels the pick card
  // renders (via v2PickFacts, same rounding), never the raw evidence. Never emit
  // "about"/"around", never a re-derived stat, never a platform the page did not
  // render. This is the single fact source the chat may cite.
  const dec=sellState.sellDecision;
  if(!dec)return "";
  const comp=(typeof v2Composition==="function")?v2Composition():null;
  const pick=comp?.pick;
  if(!pick||typeof v2PickFacts!=="function")return "";
  const f=v2PickFacts(pick);
  if(!f)return "";
  const bits=[];
  if(f.pricePremium)bits.push(`${f.scope} have closed ${f.pricePremium.delta}% ${f.pricePremium.direction} on ${f.platform} than the other platforms tracked over the past ${f.window}`);
  if(f.weekday)bits.push(f.weekday.pct!=null
    ?`${f.weekday.scope} have closed strongest on ${f.weekday.day}s, ${f.weekday.pct}% above other days`
    :`${f.weekday.scope} have tended to close strongest on ${f.weekday.day}s`);
  if(f.reserve)bits.push(f.reserve.even
    ?`in your price band, ${f.platform} auctions with and without a reserve averaged within three points of each other (observational only; never say a reserve caused, boosts or earns anything, the choice is the seller's)`
    :`in your price band, ${f.platform} auctions with a reserve averaged ${f.reserve.pct}% ${f.reserve.direction} than those without (observational only; never say a reserve caused, boosts or earns anything, the choice is the seller's)`);
  let out=bits.length
    ?`Card facts for ${f.platform}, the pick (these are the EXACT figures and scope labels shown on the card; quote them verbatim, never re-derive, round, or hedge them, never add "about" or "around", never cite a statistic or platform not listed here; sample size is qualitative only, NEVER a count of sales, comps or records): ${bits.join("; ")}.`
    :"";
  // The ONLY other platform the chat may name is a secondary card that actually rendered.
  if(comp.secondaryRendered&&comp.alt){
    out+=`\nA secondary platform card also rendered: ${platformDisplayName(comp.alt.name||comp.alt.platformSlug)}. Prices run close, so it is a genuine alternative; it is the only other platform you may name.`;
  }
  return out;
}
function sellChatCardsSummary(){
  const opts=sellState.sellOptions||[];
  const lines=opts.map(o=>{
    const c=o.composed||{};
    const bullets=[c.headline&&c.headline.text,...((c.bullets||[]).map(b=>b&&b.text))].filter(Boolean);
    return `${o.name}${o.badge?` [${o.badge}]`:""}: ${bullets.join(" | ")||"(no bullets)"}`;
  });
  return lines.length?`Cards shown to the seller with their exact bullet text:\n${lines.join("\n")}`:"";
}
// Chip dispatch by step-id (locked): every chip carries the wizard step it was
// rendered for. A chip fires only when its step still matches sellState.step;
// once the step moves on (including post-result and after an Edit reset to the
// car step), the chip is inert and visually dimmed. This kills the whole misroute
// class (e.g. a stale country chip landing in the car-entry handler after Edit).
function currentChipStep(){ try{
  // City-confirm is a sub-state of step 18 with its OWN chip-step sentinel (181), so the
  // prior state-step chips (18) dim via dimStaleChips while the Yes/No confirm chips stay
  // live. Only one chip set is ever active at a time.
  if(typeof sellState!=="undefined"&&sellState&&sellState.awaitingCityConfirm)return 181;
  return (typeof sellState!=="undefined"&&sellState.step!=null)?Number(sellState.step):0;
}catch(e){ return 0; } }
function handleChip(text,chipStep){
  if(chipStep!=null&&Number(chipStep)!==currentChipStep())return; // stale chip: inert
  quick(text);
}
function chipsHTML(chips){
  const step=currentChipStep();
  return`<div class="chips" data-chip-step="${step}">${chips.map(c=>`<button class="chip" data-chip-step="${step}" onclick="handleChip('${String(c).replace(/'/g,"\\'")}',${step})"> ${escapeHtml(c)}</button>`).join("")}</div>`;
}
// Dim + disable every chip whose step no longer matches the current step. Called
// on each message render, so a completed step's chips deactivate immediately.
function dimStaleChips(){
  try{
    const cur=String(currentChipStep());
    document.querySelectorAll(".chip[data-chip-step]").forEach(function(b){
      if(b.getAttribute("data-chip-step")!==cur)b.classList.add("chip-spent");
      else b.classList.remove("chip-spent");
    });
  }catch(e){}
}
function homeHeroHTML(){
  // Homepage hero (Stage A): serif headline + the exempted supporting line. The
  // input, label and reassurance live in #input-area (centered under this on the
  // home state), so submitting runs the existing send() flow unchanged.
  const supporting=(typeof HERO_SUPPORTING!=="undefined")?HERO_SUPPORTING:"";
  return `<div class="hero" id="hero"><div class="hp-hero">
    <div class="hp-script">Go ahead, ask Sam.</div>
    <h1>Tell me what you're selling.<br>I'll tell you where I'd sell it, and why.</h1>
  </div></div>`;
}
