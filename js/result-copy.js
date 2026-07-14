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
  // landed scope, the card says so. Takes precedence over the window line;
  // the plate carries the span. The chat opener owns "Here's what that
  // market shows", never repeated here.
  const descent=bullets[0]?.scopeDescent;
  if(descent){
    return `We looked at the exact car first. When data was thin, we expanded to ${descent.to} to find the buyer concentration.`;
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

function ladderWideningNarration(decisionData,primaryRoute){
  const ladder=decisionData?.evidence?.ladder||decisionData?.decision?.ladder;
  const landed=ladder?.landed;
  if(!landed||landed.rung<=1)return null;
  const thinNote=landed.thresholdMet?"":" The market for this car is genuinely thin right now, so treat this as directional.";
  // The opener names the same window the plate displays: derived from the
  // primary card's actual claims, never vague. The label's own year-range
  // suffix drops (the window phrase carries the span).
  const bullets=primaryRoute&&!primaryRoute.speedArgument?primaryReasonBullets(primaryRoute):null;
  const windowInfo=analysisWindowInfo(bullets||[]);
  // A segment-scoped landing names the segment (locked scope transparency);
  // the landed count is model-scoped so it never renders beside it.
  const segLabel=(bullets||[])[0]?.segmentLabel;
  const scope=segLabel?`${segLabel} sales`:String(landed.label).replace(/,?\s*\d{4} to \d{4}$/,"").replace(/,\s*any year/,"");
  const windowPhrase=windowInfo.phrase||(landed.windowDays>=3650?"across everything we've tracked":`over the past ${landed.windowDays} days`);
  // The landed count only renders when it describes the same span the opener
  // names (counts under 10 never render).
  const finiteMatch=/^Past (\d+) days$/.exec(windowInfo.label||"");
  const countText=!segLabel&&landed.sales>=10&&(!windowInfo.label||(finiteMatch&&Number(finiteMatch[1])===Number(landed.windowDays)))?`: ${landed.sales} sales`:"";
  return `I looked at ${scope} ${windowPhrase}${countText}. Here's what that market shows.${thinNote}`;
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

function resultHeaderTitle(routes){
  // The handled-vs-DIY title belongs to the gate-open lead only.
  if((sellState.sellOptions||[])[0]?.key==="specialist"){
    return `Two ways to sell the ${sellState.carName||"car"}: have it handled, or run it yourself.`;
  }
  if(hasTwoRouteTradeoff(routes))return `Two choices are worth considering for the ${sellState.carName||"car"}.`;
  return `Here’s what I’d do with the ${sellState.carName||"car"}.`;
}

function sellerWantsSpeed(){
  return /\b(fast|quick|soon|tomorrow|this week|gone)\b/i.test(String(sellState.timeline||""));
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
      `I picked these because they are the closest PowerSeller signals I can see for this car. They should be able to explain platform choice, prep, comments, logistics and commission clearly.`
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

function routeReason(route,index,routes){
  const name=route.label||route.platform;
  const speedPick=speedTiebreak(routes);
  if(speedPick){
    if(index===0){
      // Locked two-part structure: a speed phrase, then a negligible-gap
      // phrase. Pools keyed on the car so wording varies across searches but
      // stays stable for the same car.
      const SPEED_PHRASES=[
        n=>`${n} tends to get listings live fast.`,
        n=>`${n} historically closes quicker.`,
        n=>`${n} moves faster to market.`,
        n=>`${n} gets a listing live sooner.`,
        n=>`${n} runs the quicker auction cycle.`,
        n=>`${n} is the faster route from listing to close.`
      ];
      const GAP_PHRASES=[
        c=>`Results for ${c} are similar between the top choices recently.`,
        c=>`The top platforms have sold ${c} at similar money lately.`,
        c=>`Recent ${c} results are close across the leading platforms.`,
        c=>`There isn't a meaningful platform gap on recent ${c} sales.`,
        c=>`The leading choices show near-identical recent results for ${c}.`,
        c=>`Recent sales for ${c} land at similar levels across the top platforms.`
      ];
      const speedLine=pickCopy(SPEED_PHRASES,sellState.carName,"speed")(speedPick.firstName);
      const gapLine=pickCopy(GAP_PHRASES,sellState.carName,"gap")(cleanCarForCopy());
      return `${speedLine} ${gapLine}`;
    }
    return `If you had more time, ${speedPick.secondName} would be worth the slight median edge. Speed is your constraint, so ${speedPick.firstName}.`;
  }
  if(hasTwoRouteTradeoff(routes)){
    const evidence=route.marketEvidence||{};
    const other=routes.find(item=>item!==route);
    const otherEvidence=other?.marketEvidence||{};
    const otherName=other?.label||other?.platform;
    if(other&&Number(evidence.medianSalePrice||0)>Number(otherEvidence.medianSalePrice||0)){
      // Voice line is final and opinionated (locked rule 15): no escape
      // hatches, no compare-before-choosing. Pool keyed on the car.
      return index===0
        ? pickCopy([
            `If this were my car, it goes on ${platformDisplayName(name)}.`,
            `${platformDisplayName(name)} is the call here.`,
            `The recent results put this car on ${platformDisplayName(name)}.`
          ],sellState.carName,"final-pick")
        : `${name} belongs in the conversation because the gap is close enough that buyer fit and speed-to-list still matter.`;
    }
    if(["fast","medium_fast"].includes(route.speedToList)){
      return `This is close enough on recent performance that a quicker listing path matters.`;
    }
    if((evidence.topThreeSales||0)>=2){
      return `It captured a meaningful share of the strongest recent results, so I would not ignore it.`;
    }
    return `The market result and process tradeoffs are close enough to compare.`;
  }
  if(index===0){
    // Final and opinionated (rule 15): no sell-it-yourself conditionals.
    return pickCopy([
      `If this were my car, it goes on ${platformDisplayName(name)}.`,
      `${platformDisplayName(name)} is where I’d put it.`,
      `The market for this car runs through ${platformDisplayName(name)}.`
    ],sellState.carName,"solo-pick");
  }
  return pickCopy([
    `${name} is still worth looking at, but the choice above is stronger on the current market read.`,
    `${name} is worth considering, though I would start with the choice above today.`,
    `${name} remains viable, but it is not the clearest first choice from the current evidence.`
  ],sellState.carName,name,index);
}

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

function sellerPriorityFitLabel(route){
  const facts=route.routeFitFacts||[];
  if(facts.includes("faster_listing_fit"))return "This choice fits if getting live quickly matters.";
  if(facts.includes("may_support_handoff"))return "This choice can suit a seller who wants more help with the process.";
  if(facts.includes("segment_fit"))return "The platform's typical buyer pool matches this kind of car.";
  return "It fits your region and the way you want to sell.";
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
  const k=raw.match(/(\d+(?:\.\d+)?)\s*k\b/);
  if(k)return Number(k[1])*1000;
  const range=raw.match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)\s*k\b/);
  if(range)return Number(range[2].replace(/,/g,""))*1000;
  const money=raw.match(/\$?\s*(\d[\d,]{3,})/);
  return money?Number(money[1].replace(/,/g,"")):0;
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
      sellThrough:verified.sellThrough||null,
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
  const lines=(profile?.profileStats||[]).map(line=>{
    if(/\{sellThroughPercent\}/.test(line.text)){
      if(!v.sellThrough)return null;
      return line.text.replace(/\{sellThroughPercent\}/g,v.sellThrough.ratePercent);
    }
    return line.text;
  }).filter(Boolean);
  const cells=[];const leftovers=[];let specialize=null;
  for(const line of lines){
    let m;
    if((m=line.match(/^(\d+\+?) listings tracked(.*)$/i)))cells.push({key:"Listings tracked",value:m[1]});
    else if((m=line.match(/^(\d+)% sell-through/i)))cells.push({key:"Sell-through",value:`${m[1]}%`});
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
      if(/\{sellThroughPercent\}/.test(line.text)){
        if(!v.sellThrough)return null;
        return [null,line.text.replace(/\{sellThroughPercent\}/g,v.sellThrough.ratePercent)];
      }
      if(make&&/^specializes in/i.test(line.text)&&!line.text.toLowerCase().includes(make))return null;
      return [null,line.text];
    }).filter(Boolean);
  }
  const rows=[];
  if(v.belowCareerMinimum)return rows;
  rows.push(["Tracked sales in our records",`${v.trackedSales} completed sale${v.trackedSales===1?"":"s"}${v.latestSaleDate&&dateShort(v.latestSaleDate)?`, most recent ${dateShort(v.latestSaleDate)}`:""}`]);
  if(v.medianSaleValue)rows.push(["Median sale across those records",`${moneyShort(v.medianSaleValue.value)} over ${v.medianSaleValue.sample} sales`]);
  if(v.sellThrough)rows.push(["Sell-through in tracked listings",`${v.sellThrough.ratePercent}% of ${v.sellThrough.sample} listings${Number.isFinite(v.sellThrough.baselinePercent)?` (platform baseline ${v.sellThrough.baselinePercent}%)`:""}`]);
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
    ?`<div class="dossier-why">${numify(`${rel.make} is squarely in his lane: ${rel.makeCount} ${rel.make} sales tracked${rel.inPriceBand>=3?`, ${rel.inPriceBand} in your price range`:""}.`)}</div>`
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
      ${gridHTML||(proofHTML?`<div class="power-seller-proof-list">${proofHTML}</div>`:honestyNote)}
      ${platformChips?`<div class="power-seller-platform-row"><span class="power-seller-profile-label">Lists on (per ${escapeHtml(profile.name)})</span>${platformChips}</div>`:""}
      <span class="observed-seller-why">What ${escapeHtml(profile.name)} says he handles</span>
      <ul class="sell-rec-bullets">${powerSellerWhyBullets(profile,0).slice(0,2).map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${profile.specialtiesNote?`<div class="power-seller-profile-grid"><div class="power-seller-profile-block"><div class="power-seller-profile-label">Typical clients (per ${escapeHtml(profile.name)})</div><div class="power-seller-chip-row">${powerSellerClientChips(profile)}</div></div></div>`:""}
      <div class="power-seller-footnote">GoAskSam may receive a referral fee if you proceed.</div>
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
    ?`${rel.makeCount} ${rel.make} sales tracked, so a ${cleanCarForCopy()} is squarely in his lane. `
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
function altReasonBullets(route,pick){
  const bullets=[];
  const name=platformDisplayName(route.label||route.platform);
  const mine=Number(route?.marketEvidence?.evidenceSales||0);
  const remaining=(sellState.allRouteOptions||[])
    .filter(other=>other!==route&&other!==pick&&other.marketEvidence)
    .map(other=>Number(other.marketEvidence.evidenceSales||0));
  if(mine>0&&(!remaining.length||mine>Math.max(...remaining))){
    // After a speed swap the original pick often holds the MOST sales;
    // "second-most" would be a false statistic (locked rule 1). The claim
    // names the window its count actually comes from: the landed evidence
    // window, in the same vocabulary as the plate.
    const pickCount=Number(pick?.marketEvidence?.evidenceSales||0);
    const landedDays=Number(sellState.sellDecision?.evidence?.windowDays);
    const since=String(sellState.sellDecision?.evidence?.earliestSaleDate||"").slice(0,4);
    const windowPhrase=Number.isFinite(landedDays)&&landedDays<3650
      ?`over the past ${landedDays} days`
      :(since?`since ${since}`:"across everything we've tracked");
    bullets.push(`${mine>pickCount?"Most":"Second-most"} ${comparableSalesLabel()} sales ${windowPhrase}.`);
  }else if((route.routeFitFacts||[]).includes("segment_fit")){
    // Policy claims still name the car (locked): fit framing, never a
    // generic category line.
    bullets.push(`Its typical buyer pool matches a car like the ${cleanCarForCopy()}.`);
  }else{
    bullets.push(pickCopy([
      `${name} is still worth a look for the ${cleanCarForCopy()}, but the pick above is stronger on the current market read.`,
      `${name} is worth considering for the ${cleanCarForCopy()}, though the pick above is the stronger call today.`,
      `${name} remains viable for the ${cleanCarForCopy()}, but it is not the clearest first choice from the current evidence.`
    ],sellState.carName,name));
  }
  // Car-specific count from this platform's own comps. Price ranges are
  // BANNED (locked): model variants differ too much for a range to be
  // honest. Counts under 10 never render, and a count on data older than a
  // year implies a recency it does not have (locked): old data speaks in
  // percentages only, so the count bullet is recent-window only.
  const landedWindow=Number(sellState.sellDecision?.evidence?.windowDays);
  if(mine>=10&&Number.isFinite(landedWindow)&&landedWindow<=365){
    bullets.push(`${mine} ${comparableSalesLabel()}s have sold on ${name}.`);
  }
  // Speed positioning, curated-policy grounded ONLY (we hold no measured
  // close-time data, so no model-specific track-record claim).
  const pickFast=["fast","medium_fast"].includes(pick?.speedToList);
  if(["fast","medium_fast"].includes(route.speedToList)&&!pickFast){
    bullets.push(`If speed matters, ${name} typically runs the quicker auction cycle.`);
  }
  // Exactly three bullets on the alternative too (locked): grounded
  // fallbacks fill failed gates, no duplicates.
  const altFallbacks=[
    (route.routeFitFacts||[]).includes("segment_fit")&&!bullets.some(b=>/typical buyer pool/.test(b))?`Its typical buyer pool matches a car like the ${cleanCarForCopy()}.`:null,
    sellerPriorityFitLabel(route),
    `${name} is worth considering for the ${cleanCarForCopy()}, though the pick above is the stronger call today.`,
    // Final filler shares no wording with the tier-line copy pool, so the
    // dedupe can never leave the card short.
    "Worth a look if its process or timing fits you better."
  ].filter(Boolean);
  for(const text of altFallbacks){
    if(bullets.length>=3)break;
    if(!bullets.includes(text))bullets.push(text);
  }
  return bullets.slice(0,3);
}

// Tier B leadership check: true only when this platform's evidence count
// strictly beats every other platform's count AND the per-platform counts
// account for the full cross-platform denominator (an unaccounted platform
// means leadership is unverifiable, so Tier C).
function platformLeadsEvidenceSet(route){
  const e=route?.marketEvidence||{};
  const mine=Number(e.evidenceSales||0);
  if(!mine)return false;
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
  const name=platformDisplayName(route.label||route.platform);
  const scopeLabel=h.scope==="make"
    ?`${sellState.resolvedVehicle?.make||"this make"}s`
    :comparableModelLabel();
  return `On ${name}, ${h.weekday} endings have historically finished strongest for ${scopeLabel}, around ${h.liftPercent}% above other weekdays.`;
}

// "Why I picked this" is ONE list of three concrete reasons, never prose.
// Bullet 1 IS the share claim (validated 10+ cross-platform denominator,
// rendered green); below the gate it falls back to the honest existence
// line, neutral. Items are {text, validated} so the renderer can style
// the earned-green line without a separate band component.
function primaryReasonBullets(route,altRoute){
  if(!route?.marketEvidence)return null;
  const e=route.marketEvidence;
  const facts=routeFacts(route);
  const bullets=[];
  // Bullet 1 is always comparative (locked), first tier whose gates pass:
  // Tier 1: price premium, green. Model-scoped, 5+ sold both sides in the
  //   same window, rounded gap 10%+; % only, never dollars, never "median".
  // Tier 1.5: price negligibility, neutral. Same sample gates, measured gap
  //   under 10% but at least 2% (below 2% is instrument noise).
  // Tier 2: volume share, green. Proven cross-platform denominator, 10+.
  // Tier 3: verified leadership, neutral.
  // Tier 4: honest existence with a real window, neutral, last resort.
  if(e.evidenceSales>0){
    const premium=e.pricePremium;
    const premiumSampled=!!(premium&&premium.platformSales>=5&&premium.othersSales>=5);
    const landedDays=sellState.sellDecision?.evidence?.windowDays;
    if(sellState.debugTierGates){
      console.log(`[DEBUG] Tier 1-2 evaluation: ${cleanCarForCopy()} on ${platformDisplayName(route.label||route.platform)}`);
      console.log("  Tier 1 gate (price premium):");
      console.log("    - platformSalesCount:",premium?.platformSales??null);
      console.log("    - othersSalesCount:",premium?.othersSales??null);
      console.log("    - gapPercent:",premium?.percent??null);
      console.log("    - windowDays:",premium?.windowDays??null);
      console.log("    - pass?",!!(premiumSampled&&premium.percent>=10));
      console.log("  Tier 1.5 gate (negligibility):");
      console.log("    - pass?",!!(premiumSampled&&Math.abs(premium.percent)>=2&&Math.abs(premium.percent)<10));
      console.log("  Tier 2 gate (volume share):");
      console.log("    - platformSalesCount:",e.evidenceSales);
      console.log("    - totalSalesAllPlatforms:",facts.totalEvidenceSales);
      console.log("    - pass?",Number(facts.totalEvidenceSales)>=10);
      console.log("  Tier 3 gate (leadership): pass?",platformLeadsEvidenceSet(route));
    }
    // A wider-scoped premium says so (locked scope transparency): generation
    // claims name the generation; segment claims name the segment AND its
    // model list, never silently labeled as the exact model.
    const premiumScopePhrase=premium?.scope==="segment"
      ?`${premium.segmentLabel} sales (${(premium.models||[]).join(", ")})`
      :premium?.scope==="generation"
      ?`${String(premium.generationCode||"").toUpperCase()}-generation ${sellState.resolvedVehicle?.model||comparableSalesLabel()} sales`.trim()
      :`${comparableSalesLabel()} sales`;
    const premiumSince=premium?.earliestSaleDate?String(premium.earliestSaleDate).slice(0,4):null;
    // Scope-descent meta for the transparency line: set when the claim's
    // scope widened beyond the landed rung.
    const scopeDescent=premium?.scope==="segment"
      ?{to:`the ${premium.segmentLabel} segment (${(premium.models||[]).join(", ")})`}
      :premium?.scope==="generation"
      ?{to:`the ${String(premium.generationCode||"").toUpperCase()}-generation ${sellState.resolvedVehicle?.model||"model"}`}
      :null;
    if(premium&&premium.gateType==="asymmetric"&&premium.marketShare>=75&&premium.platformSales>=5){
      // Market dominance (asymmetric gate): one platform IS the market.
      // This is a buyer-pool concentration claim, never a price claim: with
      // a thin "others" sample no price comparison was verified.
      const name=platformDisplayName(route.label||route.platform);
      const scopeName=premiumScopePhrase.replace(/ sales$/,"");
      bullets.push({
        text:`${name} captures the strongest buyer pool for ${scopeName}: ${premium.marketShare}% of comparable sales converged there.`,
        validated:true,windowDays:premium.windowDays,sinceYear:premiumSince,
        segmentLabel:premium.scope==="segment"?premium.segmentLabel:undefined,plateScope:premium.scope==="generation"?`${String(premium.generationCode||"").toUpperCase()} generation`:undefined,scopeDescent});
    }else if(premiumSampled&&premium.percent>=10){
      const name=platformDisplayName(route.label||route.platform);
      bullets.push({
        text:premium.windowDays>=3650
          ?`${premiumScopePhrase} have historically closed around ${premium.percent}% higher on ${name} than on other platforms`
          :`${premiumScopePhrase} have closed around ${premium.percent}% higher on ${name} than on other platforms over the past ${premium.windowDays} days`,
        validated:true,windowDays:premium.windowDays,sinceYear:premiumSince,segmentLabel:premium.scope==="segment"?premium.segmentLabel:undefined,plateScope:premium.scope==="generation"?`${String(premium.generationCode||"").toUpperCase()} generation`:undefined,scopeDescent});
    }else if(premiumSampled&&Math.abs(premium.percent)>=2&&Math.abs(premium.percent)<10){
      // Honest only pick-vs-alt when those two platforms hold all the
      // evidence; with more platforms it stays "the other platforms".
      const platformsWithSales=(sellState.allRouteOptions||[]).filter(other=>Number(other.marketEvidence?.evidenceSales||0)>0).length;
      const otherName=(altRoute&&platformsWithSales===2)?platformDisplayName(altRoute.label||altRoute.platform):"the other platforms";
      const windowText=premium.windowDays>=3650?"across everything we've tracked":`over the past ${premium.windowDays} days`;
      bullets.push({text:`Price is negligible between ${platformDisplayName(route.label||route.platform)} and ${otherName} ${windowText}`,validated:false,windowDays:premium.windowDays,sinceYear:premiumSince});
    }else if(Number(facts.totalEvidenceSales)>=10){
      const share=Math.round((facts.evidenceSales/facts.totalEvidenceSales)*100);
      bullets.push({text:`${share}% of ${comparableSalesLabel()} sales ${marketWindowPhrase()} closed on ${platformDisplayName(route.label||route.platform)}`,validated:true,windowDays:landedDays});
    }else if(platformLeadsEvidenceSet(route)){
      bullets.push({text:`More ${comparableSalesLabel()} sales have closed on ${platformDisplayName(route.label||route.platform)} than any other platform we track`,validated:false,windowDays:landedDays});
    }else if(e.segmentVolume&&e.segmentVolume.mineSold>e.segmentVolume.othersSold){
      // Segment majority (routing, not valuation): where the buyer pool for
      // the competitor set converges. Always names the segment and models.
      const sv=e.segmentVolume;
      const windowText=sv.windowDays>=3650?"in our tracked records":`over the past ${sv.windowDays} days`;
      bullets.push({text:`Most ${sv.segmentLabel} sales (${(sv.models||[]).join(", ")}) ${windowText} closed on ${platformDisplayName(route.label||route.platform)}`,validated:false,windowDays:sv.windowDays,segmentLabel:sv.segmentLabel});
    }else{
      // Tier 4 existence: the window renders in the bullet only when the
      // data is recent (the plate/lookback line owns the span otherwise);
      // "Many" is earned at 10+, never implied below it.
      const name=platformDisplayName(route.label||route.platform);
      if(Number.isFinite(landedDays)&&landedDays<=365){
        const countPrefix=e.evidenceSales>=10?`${e.evidenceSales} `:"";
        bullets.push({text:`${countPrefix}${cleanCarForCopy()} sales have closed on ${name} over the past ${landedDays} days`,validated:false,windowDays:landedDays});
      }else{
        bullets.push({text:e.evidenceSales>=10
          ?`Many ${cleanCarForCopy()} sales have closed on ${name}`
          :`${cleanCarForCopy()} sales have closed on ${name} in our tracked records`,validated:false,windowDays:landedDays});
      }
    }
  }
  // Bullet 2: platform-scoped historical day advantage (weekdays only).
  const day=weekdayBullet(route);
  if(day)bullets.push({text:day,validated:false,windowDays:36500});
  // Bullet 3: when a speed swap routed this pick, the bullet explains the
  // routing from curated policy (no invented metrics). Otherwise the
  // qualitative segment sell-through, plus a speed acknowledgment only when
  // the seller wants it gone fast.
  if(sellState.routingReason==="speed"){
    bullets.push({text:`${platformDisplayName(route.label||route.platform)} typically runs the quicker auction cycle.`,validated:false});
  }else{
    let bullet3="";
    if(e.segmentSellThrough){
      const adjective=e.segmentSellThrough.percent>=85?"Strong":"Consistent";
      bullet3=`${adjective} sell-through for ${segmentCategoryDesc(e.segmentSellThrough.band)}`;
    }
    if(sellerWantsSpeed()){
      // Grounded phrasing only: listing-cycle speed comes from curated route
      // policy, never an invented day count (no platform-mechanics claims).
      const fastPlatform=["fast","medium_fast"].includes(route.speedToList);
      const speedLine=fastPlatform
        ?"Quick auction cycle if you're prioritizing a fast close"
        :"On a fast timeline, this is still the market I'd trust to move it";
      bullet3=bullet3?`${bullet3}. ${speedLine}`:speedLine;
    }
    if(bullet3)bullets.push({text:`${bullet3}.`,validated:false,windowDays:36500});
  }
  // Exactly three bullets (locked): a failed gate skips its bullet and a
  // grounded fallback fills the slot, never fewer than three on an
  // evidence-backed card. Fallbacks in order: unused segment sell-through,
  // curated speed policy, curated fit line. No duplicates.
  if(bullets.length&&bullets.length<3){
    const name=platformDisplayName(route.label||route.platform);
    const queue=[];
    if(e.segmentSellThrough&&!bullets.some(b=>/sell-through/i.test(b.text))){
      const adjective=e.segmentSellThrough.percent>=85?"Strong":"Consistent";
      queue.push({text:`${adjective} sell-through for ${segmentCategoryDesc(e.segmentSellThrough.band)}.`,windowDays:36500});
    }
    if(["fast","medium_fast"].includes(route.speedToList))queue.push({text:`${name} typically runs the quicker auction cycle.`});
    queue.push({text:sellerPriorityFitLabel(route)});
    for(const item of queue){
      if(bullets.length>=3)break;
      if(!bullets.some(b=>b.text===item.text||(/quicker auction cycle/.test(b.text)&&/quicker auction cycle/.test(item.text))))bullets.push({...item,validated:false});
    }
  }
  return bullets.length?bullets.slice(0,3):null;
}

// "classic Porsches in the $50k to $150k range": era word from the resolved
// year, plural make, the platform's real segment band.
function segmentCategoryDesc(band){
  const rv=sellState.resolvedVehicle||{};
  const year=Number(rv.year)||Number(rv.yearRange?.start)||null;
  const era=year?(year<1990?"classic":year<2006?"modern classic":"modern"):"collector";
  const make=rv.make?`${rv.make}s`:"cars";
  return `${era} ${make} in the ${band} range`;
}

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
    momentum:e.momentum||null,
    segmentSellThrough:e.segmentSellThrough||null
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

function routeEvidenceBullets(route,index,routes){
  if(!routeHasTrueComparableEvidence(route)){
    // Policy-fit route: honest absence, curated reputation (policy_provided,
    // phrased as reputation not statistics), honest close.
    const about=route.about||null;
    const name=platformDisplayName(route.label||route.platform);
    const bullets=[
      index===0?"This is a fit call, not a sales-data call: the tracked sales data doesn't cover this exact car well enough yet to lead with numbers.":"Worth comparing on platform fit, not sales data."
    ];
    if(about)bullets.push(`${name} has a strong reputation in ${about.regionsLabel}, has been selling collector cars since ${about.since}, and is known for ${about.knownFor}.`);
    else bullets.push(sellerPriorityFitLabel(route));
    bullets.push("Best bet is to contact them directly; they can speak to demand for your specific car.");
    return bullets.slice(0,3);
  }
  const facts=routeFacts(route);
  // Five-dimension card (locked): the headline carries dimension 1 (where the
  // comps sold and for what). Bullets are the remaining dimensions in priority
  // order, each fact rendered exactly once, omitted when there is no data,
  // never padded with restatements.
  const bullets=[];
  // The primary card carries these dimensions in its structured reason
  // bullets; repeating them here would trip the repetition guard.
  const primaryHasReasonBullets=index===0&&!!primaryReasonBullets(route);
  // (2) platform sell-through for this segment, from full-dataset baselines
  // (absent until the records hold non-sold listings). Each stat renders
  // once per session: repeats across searches read as filler.
  if(facts.segmentSellThrough&&!primaryHasReasonBullets){
    const statKey=`sellthrough|${route.platform||route.label}|${facts.segmentSellThrough.band}`;
    if(!window.__shownSessionStats)window.__shownSessionStats=new Set();
    if(!window.__shownSessionStats.has(statKey)){
      window.__shownSessionStats.add(statKey);
      bullets.push(`${facts.segmentSellThrough.percent}% of ${facts.segmentSellThrough.band} listings here sold in our tracked records.`);
    }
  }
  // (3) the day advantage is market-wide (historical, all-time) and renders
  // on the primary card only; repeating it here would duplicate the sentence.
  // (4) momentum, qualitative only (locked: no sample or window numbers)
  if(!primaryHasReasonBullets){
    if(facts.momentum&&facts.momentum.percent>=5)bullets.push(`Comparable results here have been strengthening recently.`);
    else if(facts.momentum&&facts.momentum.percent<=-5)bullets.push(`Comparable results here have softened a little recently, worth pricing realistically.`);
  }
  return bullets.slice(0,4);
}

function resultSummaryLine(options,routes=[]){
  // Speed-swapped routing owns its reason up front.
  if(sellState.routingReason==="speed"){
    const pickName=(options||[]).find(option=>option.key!=="specialist")?.name;
    if(pickName)return `You need it fast. ${pickName} is your move.`;
  }
  // Lead-with-partner prose only when the partner genuinely leads (gate
  // open, first option): a secondary mention never changes the summary.
  if((options||[])[0]?.key==="specialist"){
    if(sellerWantsToManageSelf())return "You told me you’d rather manage it yourself. I’d normally agree, but I’d still hear one PowerSeller out before deciding.";
    return "I’d speak to one experienced PowerSeller first. They can tell you whether Bring a Trailer, Cars & Bids or another platform gives this specific car the best chance.";
  }
  if(hasTwoRouteTradeoff(routes)){
    const first=routes[0], second=routes[1];
    const fe=first.marketEvidence||{};
    const se=second.marketEvidence||{};
    const firstName=first.label||first.platform;
    const secondName=second.label||second.platform;
    const firstMedian=Number(fe.medianSalePrice||0);
    const secondMedian=Number(se.medianSalePrice||0);
    const fasterRoute=[first,second].find(route=>["fast","medium_fast"].includes(route.speedToList));
    if(firstMedian&&secondMedian){
      const strongerName=firstMedian>=secondMedian?firstName:secondName;
      const weakerName=firstMedian>=secondMedian?secondName:firstName;
      const fasterName=fasterRoute?.label||fasterRoute?.platform;
      const speedPick=speedTiebreak(routes);
      if(speedPick){
        return `You want it gone fast. Results ${marketWindowPhrase()} are negligible, so ${speedPick.firstName} is the best option.`;
      }
      if(fasterRoute&&fasterName!==strongerName&&Math.min(firstMedian,secondMedian)/Math.max(firstMedian,secondMedian)>=0.9){
        return `${strongerName} looks stronger on recent comparable sales. ${fasterName} is faster to list and close, which matters if timing counts.`;
      }
      return `${strongerName} looks stronger on recent comparable sales, and it’s my pick. ${weakerName} has real signal too.`;
    }
    return `${firstName} and ${secondName} both belong in the conversation, but they win for different reasons.`;
  }
  const evidenceOptions=(options||[]).filter(option=>option.marketEvidence);
  const primary=evidenceOptions[0];
  const alt=evidenceOptions.slice(1).find(option=>option.marketEvidence?.medianSalePrice);
  const primaryRoute=(sellState.allRouteOptions||[]).find(route=>(route.label||route.platform)===primary?.name);
  if(primaryRoute){
    const insight=primaryInsightSentence(primaryRoute);
    if(insight)return insight;
  }
  if(primary&&alt){
    return medianDeltaSentence(primary,alt)||pickCopy([
      `${primary.name} is where the market for your car is right now.`,
      `The strongest recent results for ${comparableSalesLabel()} are on ${primary.name}.`,
      `If this were my car, it goes on ${primary.name}.`
    ],sellState.carName,primary.name,alt.name);
  }
  if(primary){
    return pickCopy([
      `${primary.name} is where the market for your car is right now.`,
      `The strongest recent results for ${comparableSalesLabel()} are on ${primary.name}.`,
      `If this were my car, it goes on ${primary.name}.`
    ],sellState.carName,primary.name);
  }
  return "I’m only showing choices I can stand behind.";
}

function compactPlatformCopy(option,primaryPlatform){
  const primaryName=primaryPlatform?.name||"the first choice";
  if(!option)return "Worth comparing, but it is not where I’d start.";
  // Speed-routed secondary (e.g. fast-timeline 1960s Corvette -> Hagerty):
  // the compact row carries the speed argument itself.
  if(option.speedArgument)return option.reason;
  const speedPick=speedTiebreak(sellState.allRouteOptions?.slice(0,2));
  if(speedPick&&option.name===speedPick.secondName)return `If you had more time, ${speedPick.secondName} would be worth the slight median edge. Speed is your constraint, so ${speedPick.firstName}.`;
  return `Worth considering, but I’d still start with ${primaryName}. Tap to see why.`;
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
  const options=sellState.sellOptions||[];
  const index=options.findIndex(o=>o.key===option.key);
  const facts=[rankingReason(option,index<0?0:index,options)];
  const route=(sellState.allRouteOptions||[]).find(item=>(item.label||item.platform)===option.name);
  const bullets=route?routeEvidenceBullets(route,index<0?0:index,sellState.allRouteOptions||[]):[];
  facts.push(...bullets.slice(0,2));
  if(option.speedToList==="fast"||option.speedToList==="medium_fast"){
    facts.push(sellerWantsSpeed()
      ?`${option.name}'s auction velocity is a real advantage here. Your want-it-gone-fast preference tips the scale.`
      :`${option.name} can also be the cleaner play if getting live quickly matters.`);
  }
  if(option.speedToList==="slower")facts.push(`${option.name} takes longer to get live.`);
  return facts.filter(Boolean).join(" ");
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
    return `Here’s how I’d think about it.\n\n${sellerName}: you’ll probably pay a fee, but he can handle photography, listing prep, buyer questions, comments, scheduling, paperwork and platform choice. If you’re busy, or you haven’t sold on auction before, this is the lower-stress route.\n\n${primaryPlatform.name}: you keep more control, but you’re responsible for building the listing, answering every buyer question and choosing the right timing. With a car like this, I’d only go this route if you’re comfortable running the auction yourself.`;
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
