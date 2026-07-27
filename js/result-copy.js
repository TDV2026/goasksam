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

function shouldSuppressRouteForSellerRegion(route){
  if(!isInternationalSellerRegion())return false;
  const facts=route?.routeFitFacts||[];
  return facts.includes("region_mismatch");
}

function isInternationalSellerRegion(){
  const region=String(sellState.region||"").toLowerCase();
  return /\b(uk|europe|australia|middle east)\b/.test(region);
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
    "They handle everything: photos, listing, negotiations and logistics.",
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
  if(year&&year>=2005)tags.push("modern enthusiast");
  return tags;
}
function platformFitLine(route){
  const copy=PLATFORM_FIT_COPY[platformDisplayName(route?.label||route?.platform)];
  if(!copy)return null;
  for(const tag of fitCategoryTags())if(copy[tag])return copy[tag];
  return copy.default||null;
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

function platformDisplayName(name){
  const key=String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const map={bringatrailer:"Bring a Trailer",bat:"Bring a Trailer",carsandbids:"Cars & Bids",pcarmarket:"PCarMarket",hagerty:"Hagerty Marketplace",rmsothebys:"RM Sotheby's",gooding:"Gooding & Co",goodingco:"Gooding & Co",acc:"All Collector Cars",allcollectorcars:"All Collector Cars",hemmings:"Hemmings",carandclassic:"Car & Classic",collectingcars:"Collecting Cars"};
  return map[key]||String(name||"");
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
  addMsg("sam","A PowerSeller manages the entire sale for a fee: prep, photos, listing, buyer questions, paperwork and platform choice. You approve the big decisions; they do the work.");
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
  const rel=v.relevance;
  const whyLine=(rel&&rel.makeCount>=3)
    ?`<div class="dossier-why">${escapeHtml(`${rel.make} is squarely in his lane.`)}</div>`
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
  const rel=profile?.verified?.relevance;
  const carLine=(rel&&rel.makeCount>=3)
    ?`A ${cleanCarForCopy()} is squarely in his lane. `
    :"";
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
function composerScopePhrase(vehicle,scope,generationCode){
  const make=vehicle&&vehicle.make?String(vehicle.make):"";
  const model=vehicle&&vehicle.model?String(vehicle.model):"";
  if(scope==="make"||!model)return `${make||"these cars"}s as a whole`.replace(/ss as a whole$/,"s as a whole");
  if(scope==="generation"&&generationCode)return `${String(generationCode).toUpperCase()}-generation ${make} ${model}s`.trim();
  const yr=vehicle&&vehicle.year?`${vehicle.year} `:"";
  return `${yr}${model}s`;
}
// Weekday advantage bullet (dayAdvantage): 180-day window, scope word required.
function composerWeekdayBullet(vehicle,ev){
  const d=ev&&ev.dayAdvantage;
  if(!d||!d.weekday||!d.scope||!Number.isFinite(Number(d.liftPercent)))return null;
  const win=`over the past ${d.window||180} days`;
  let text;
  if(d.scope==="make"){
    const make=vehicle&&vehicle.make?`${vehicle.make}s`:"These cars";
    text=`${make} as a whole have closed strongest on ${d.weekday}s ${win}`;
  }else{
    text=`${composerScopePhrase(vehicle,d.scope,d.generationCode)} have closed strongest on ${d.weekday}s, around ${d.liftPercent}% above other days, ${win}`;
  }
  return { text:`${text}.`, provenance:`dayAdvantage(${d.scope},${d.window||180}d)` };
}
// Curated audience/specialty fact from the platform copy library.
function composerAudienceBullet(ev){
  const line=platformFitLine({label:ev.label,platform:ev.platform});
  return line?{ text:line, provenance:"platformFitCopy" }:null;
}
// Conditional speed line, only when the seller indicated speed matters.
function composerSpeedBullet(ev,opts){
  if(!opts.sellerWantsSpeed||!["fast","medium_fast"].includes(ev.speedToList))return null;
  return { text:`If speed matters, ${platformDisplayName(ev.label||ev.platform)} typically runs the quicker auction cycle.`, provenance:"speedToList" };
}
// Mode A delta headline: the winning platform's cleared comparative delta.
function composerDeltaHeadline(vehicle,ev){
  const p=ev.pricePremium;if(!p)return null;
  const name=platformDisplayName(ev.label||ev.platform);
  const win=`over the past ${p.windowDays} days`;
  if(p.type==="market_dominance"){
    return { text:`${name} is where most ${composerScopePhrase(vehicle,p.scope||"model",p.generationCode)} sales have closed ${win}.`, provenance:`pricePremium.market_dominance(${p.scope||"model"},${p.windowDays}d)` };
  }
  if(p.gateType==="symmetric"&&Number.isFinite(p.percent)&&p.percent>=10){
    return { text:`${name} has closed ${composerScopePhrase(vehicle,p.scope||"model",p.generationCode)} around ${p.percent}% higher than the other platforms we track ${win}.`, provenance:`pricePremium(${p.scope||"model"},${p.windowDays}d,${p.percent}%)` };
  }
  return null;
}
// Mode B similarity headline: prices within a small percentage; the reason Card 1
// leads (speed if the seller wants speed, else the deepest recent market).
function composerSimilarityHeadline(vehicle,ev,opts){
  const p=ev.pricePremium;
  const win=p?`over the past ${p.windowDays} days`:"recently";
  const name=platformDisplayName(ev.label||ev.platform);
  const scope=(p&&p.scope)||"model";
  const reason=(opts.sellerWantsSpeed&&opts.routingReason==="speed")
    ?`so speed decides: ${name} lists and closes faster`
    :`so the deepest recent market for this car leads: ${name} has the most recent sales`;
  return { text:`Prices for ${composerScopePhrase(vehicle,scope)} have been within a small percentage across the top platforms ${win}, ${reason}.`, provenance:`pricePremium.negligible(${p?p.windowDays+"d":"?"})` };
}
// Honest headline: no delta or similarity finding cleared the gates.
function composerHonestHeadline(vehicle,landedScope){
  const car=vehicle&&vehicle.model?`the ${[vehicle.make,vehicle.model].filter(Boolean).join(" ")}`:`this ${vehicle&&vehicle.make?vehicle.make:"car"}`;
  return { text:`Recent sales for ${car} are limited, so I ran this at ${landedScope||"make"} level.`, provenance:`ladder.landed(${landedScope||"make"})` };
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
  }else if(opts.isPick){
    const p=ev.pricePremium;
    if(p&&(p.type==="market_dominance"||(p.gateType==="symmetric"&&Number.isFinite(p.percent)&&p.percent>=10))){
      headline=composerDeltaHeadline(vehicle,ev);
    }else if(p&&p.gateType==="symmetric"&&Number.isFinite(p.percent)){
      headline=composerSimilarityHeadline(vehicle,ev,opts);
    }else{
      headline=composerHonestHeadline(vehicle,landedScope);
    }
  }else{
    const p=ev.pricePremium;
    if(p&&p.gateType==="symmetric"&&Number.isFinite(p.percent)&&p.percent>=10){
      headline=composerDeltaHeadline(vehicle,ev);
    }else if(Number(ev.evidenceSales||0)>0){
      headline={ text:`${platformDisplayName(ev.label||ev.platform)} has also closed recent ${composerScopePhrase(vehicle,landedScope==="make"?"make":"model")} sales.`, provenance:`evidenceSales(${ev.evidenceSales})` };
    }else{
      headline=null;
    }
  }
  const bullets=[];
  if(!unverified){ const wk=composerWeekdayBullet(vehicle,ev); if(wk)bullets.push(wk); }
  const aud=composerAudienceBullet(ev); if(aud)bullets.push(aud);
  const spd=composerSpeedBullet(ev,opts); if(spd)bullets.push(spd);
  // Dedupe (reuse the round-3 guard) and cap at 3; drop any that echo the headline.
  const out=[];
  for(const b of bullets){
    if(!b||!b.text)continue;
    if(headline&&bulletsSimilar(headline.text,b.text))continue;
    if(out.some(o=>bulletsSimilar(o.text,b.text)))continue;
    out.push(b);
  }
  return { headline, bullets: out.slice(0,3) };
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
function quick(text){document.getElementById("inp").value=text;send();}

// Phase 1c: full evidence + cards context for the post-result chat, so answers
// cite the real data instead of the frontend re-rendering a card.
function sellChatEvidenceSummary(){
  const dec=sellState.sellDecision;
  if(!dec)return "";
  const routes=dec.decision?.routeFit?.routes||[];
  const lines=routes.filter(r=>r.marketEvidence&&Number(r.marketEvidence.evidenceSales||0)>0).map(r=>{
    const e=r.marketEvidence;const pp=e.pricePremium;
    const parts=[`${Number(e.evidenceSales||0)} comps`];
    if(pp&&pp.percent!=null&&pp.platformSales>=5&&pp.othersSales>=5)parts.push(`about ${pp.percent}% vs other platforms (${pp.scope||"model"} scope)`);
    const wk=e.dayAdvantage;
    if(wk&&wk.weekday&&Number.isFinite(Number(wk.liftPercent)))parts.push(`${wk.weekday} endings about ${wk.liftPercent}% stronger (${wk.scope||"make"} scope)`);
    return `${platformDisplayName(r.platform||r.label)}: ${parts.join(", ")}`;
  });
  return lines.length?`Evidence by platform (only cite these numbers): ${lines.join("; ")}.`:"";
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
function handleChip(text){quick(text);}
function chipsHTML(chips){
  return`<div class="chips">${chips.map(c=>`<button class="chip" onclick="handleChip('${c.replace(/'/g,"\\'")}')"> ${escapeHtml(c)}</button>`).join("")}</div>`;
}
function homeHeroHTML(){
  return `<div class="hero" id="hero"><div class="hero-inner">
    <div class="hero-logo">S</div>
    <h1>Where should you sell your car?</h1>
    <div class="hero-sub">Answer a few quick questions and I’ll tell you where I’d sell it, and why.</div>
    <div class="hero-start">
      <button onclick="startSellFlow()">Start selling</button>
      <div class="hero-start-note">Takes about one minute.</div>
      <div class="hero-secondary">or type the car below if you already know what you’re selling</div>
    </div>
  </div></div>`;
}
