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

function ladderWideningNarration(decisionData){
  const ladder=decisionData?.evidence?.ladder||decisionData?.decision?.ladder;
  const landed=ladder?.landed;
  if(!landed||landed.rung<=1)return null;
  const first=(ladder.rungs||[])[0];
  const car=cleanCarForCopy?cleanCarForCopy():(sellState.carName||"this car");
  const firstScope=first?first.label.replace(/\bsales\b/,"").replace(/\s+,/,",").replace(/\s+/g," ").trim():"";
  const firstPart=first?`I looked for ${firstScope} sales first and found ${first.sales===0?"none":first.sales} recently. `:"";
  const thinNote=landed.thresholdMet?"":" The market for this car is genuinely thin right now, so treat this as directional.";
  const windowText=landed.windowDays>=3650?"across everything we've tracked":`in the last ${landed.windowDays} days`;
  return `${firstPart}Not enough to be straight with you about the ${car}, so I widened the lens to ${landed.label}: ${landed.sales} sales ${windowText}. Here's what that market shows.${thinNote}`;
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
  const adverse=[];
  const mileage=String(sellState.mileage||"");
  const mileageNumber=(mileage.replace(/,/g,"").match(/(\d+)\s*k/i)?.[1]*1000)||Number(mileage.replace(/[^\d]/g,""))||0;
  if(/over\s*100k/i.test(mileage)||mileageNumber>100000)adverse.push("mileage over 100k");
  if(/heavily modified/i.test(String(sellState.condition||"")))adverse.push("heavy modifications");
  if(/no records|none/i.test(String(sellState.records||"")))adverse.push("missing service records");
  if(!adverse.length)return null;
  const list=adverse.length>1?adverse.slice(0,-1).join(", ")+" and "+adverse[adverse.length-1]:adverse[0];
  return `Those medians reflect the model generally; ${list} typically place a car differently within that range, which is worth weighing.`;
}

function resultHeaderTitle(routes){
  if((sellState.sellOptions||[]).some(option=>option.key==="specialist")){
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

function routeReason(route,index,routes){
  const name=route.label||route.platform;
  if(hasTwoRouteTradeoff(routes)){
    const evidence=route.marketEvidence||{};
    const other=routes.find(item=>item!==route);
    const otherEvidence=other?.marketEvidence||{};
    const otherName=other?.label||other?.platform;
    if(other&&Number(evidence.medianSalePrice||0)>Number(otherEvidence.medianSalePrice||0)){
      return index===0
        ? `The recent result gap points this way. I’d still compare it against ${otherName} before choosing.`
        : `${name} belongs in the conversation because the gap is close enough that buyer fit and speed-to-list still matter.`;
    }
    if(["fast","medium_fast"].includes(route.speedToList)){
      return `This is close enough on recent performance that a quicker listing path may matter.`;
    }
    if((evidence.topThreeSales||0)>=2){
      return `It captured a meaningful share of the strongest recent results, so I would not ignore it.`;
    }
    return `The market result and process tradeoffs are close enough to compare.`;
  }
  if(index===0){
    return `This is where I’d begin if you sell it yourself.`;
  }
  return pickCopy([
    `${name} is still worth looking at, but the choice above is stronger on the current market read.`,
    `${name} is worth considering, though I would start with the choice above today.`,
    `${name} remains viable, but it is not the clearest first choice from the current evidence.`
  ],sellState.carName,name,index);
}

function primaryInsightSentence(route){
  const evidence=route.marketEvidence||{};
  if(Number.isFinite(evidence.performanceDeltaPercent)&&evidence.performanceDeltaPercent>=5)return `Recent comparable ${comparableModelLabel()} have consistently favoured the platform I’d use over the rest of the tracked market.`;
  if(evidence.topThreeSales>=2){
    return `The strongest recent comparable ${comparableModelLabel()} have come through the platform I’d use.`;
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
    return profile.profileStats.map(line=>{
      if(/\{sellThroughPercent\}/.test(line.text)){
        if(!v.sellThrough)return null;
        return [null,line.text.replace(/\{sellThroughPercent\}/g,v.sellThrough.ratePercent)];
      }
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

function renderFeaturedPowerSellerProfile(profile,platformFirst){
  if(!profile)return "";
  const firstName=powerSellerFirstName(profile);
  const platformChips=powerSellerPlatformLogoChips({platforms:profile.providedPlatforms||profile.platforms||[]});
  const proofHTML=powerSellerProofHTML(profile);
  const v=profile.verified||{};
  const honestyNote=v.belowCareerMinimum
    ?`<div class="sell-rec-reason">We've tracked too few of ${escapeHtml(firstName)}'s sales in our own records to compute his numbers fairly yet. His history below is his own account.</div>`
    :"";
  const relevanceLine=v.relevance
    ?`<div class="sell-rec-reason">In our records: ${v.relevance.makeCount} ${escapeHtml(v.relevance.make)} sale${v.relevance.makeCount===1?"":"s"} tracked${v.relevance.inPriceBand?`, ${v.relevance.inPriceBand} in this car's price range`:""}.</div>`
    :"";
  return `<div class="power-seller-feature" onclick="choosePowerSeller('${escapeHtml(profile.id)}')">
    <div class="power-seller-feature-main">
      <div class="sell-rec-badge specialist">${platformFirst===true?"Option 2: have it handled":platformFirst===false?"Option 1: have it handled":"Have it handled"}</div>
      <span class="observed-seller-name">${escapeHtml(profile.displayName||profile.name)}</span>
      <span class="observed-seller-meta">Auction consignor</span>
      ${proofHTML?`<div class="power-seller-proof-list">${proofHTML}</div>`:honestyNote}
      ${relevanceLine}
      ${platformChips?`<div class="power-seller-platform-row"><span class="power-seller-profile-label">Lists on (per ${escapeHtml(profile.name)})</span>${platformChips}</div>`:""}
      <span class="observed-seller-why">What ${escapeHtml(profile.name)} says he handles</span>
      <ul class="sell-rec-bullets">${powerSellerWhyBullets(profile,0).slice(0,2).map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${profile.specialtiesNote?`<div class="power-seller-profile-grid"><div class="power-seller-profile-block"><div class="power-seller-profile-label">Typical clients (per ${escapeHtml(profile.name)})</div><div class="power-seller-chip-row">${powerSellerClientChips(profile)}</div></div></div>`:""}
      <div class="power-seller-footnote">GoAskSam may receive a referral fee if you proceed.</div>
    </div>
    <div class="sell-rec-actions"><button class="ghost" onclick="event.stopPropagation();choosePowerSeller('${escapeHtml(profile.id)}')">Request an introduction to ${escapeHtml(firstName)} -></button></div>
  </div>`;
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
  if(profile.note&&!/^I’d ask\b/i.test(profile.note))return profile.note;
  return `${firstName} is another good fit${region ? ` in${region}` : ""} if you want help with auction management, buyer questions and deciding where the car should run.`;
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
  if(index===0)bullets[0]=`This is the first call I’d make before choosing the platform.`;
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

function primaryHeroStat(route){
  const facts=routeFacts(route);
  if(!facts.evidenceSales)return null;
  const here=formatUsd(facts.medianSalePrice);
  const others=formatUsd(facts.othersMedianSalePrice);
  // Sample-size numbers are out (locked): the headline carries the insight,
  // never counts like "46 of 58" or "in the last 45 days".
  if(facts.soloPlatform){
    return {
      count:`Every comparable sale we tracked recently closed here`,
      money:here?`Median ${here}`:null
    };
  }
  if(here&&others){
    const pct=Math.round(Math.abs(facts.medianDelta)*100);
    const direction=facts.medianLeads?"above":"below";
    const headline=facts.smallSample
      ?(facts.medianLeads?`Median sale here has run considerably higher than other platforms`:`Median here trails other sources in this small sample`)
      :`Median sale here has run ${pct}% ${direction} other platforms`;
    return {count:headline,money:`${here} here vs ${others} elsewhere`};
  }
  return {count:`Most of the comparable sales we tracked recently closed here`,money:here?`Median sale ${here}`:null};
}

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
      index===0?"I don't have enough recent comparable sales to give you a data-led answer for this car. This is a fit call, not a sales-data call.":"Worth comparing on platform fit, not sales data."
    ];
    if(about)bullets.push(`${name} has a strong reputation in ${about.regionsLabel}, has been selling collector cars since ${about.since}, and is known for ${about.knownFor}.`);
    else bullets.push(sellerPriorityFitLabel(route));
    bullets.push("Best bet is to contact them directly; they can speak to demand for your specific car. When comparable sales show up in my data, I can revisit this with real numbers.");
    return bullets.slice(0,3);
  }
  const facts=routeFacts(route);
  // Five-dimension card (locked): the headline carries dimension 1 (where the
  // comps sold and for what). Bullets are the remaining dimensions in priority
  // order, each fact rendered exactly once, omitted when there is no data,
  // never padded with restatements.
  const bullets=[];
  // (2) platform sell-through for this segment, from full-dataset baselines
  // (absent until the records hold non-sold listings)
  if(facts.segmentSellThrough)bullets.push(`${facts.segmentSellThrough.percent}% of ${facts.segmentSellThrough.band} listings here sold in our tracked records.`);
  // (3) timing edge
  if(facts.weekday)bullets.push(`Based on recent comparable listings, ${facts.weekday} endings have finished strongest${facts.weekdayLift?` (around ${facts.weekdayLift}% above other days)`:""}.`);
  // (4) momentum, qualitative only (locked: no sample or window numbers)
  if(facts.momentum&&facts.momentum.percent>=5)bullets.push(`Comparable results here have been strengthening recently.`);
  else if(facts.momentum&&facts.momentum.percent<=-5)bullets.push(`Comparable results here have softened a little recently, worth pricing realistically.`);
  // (5) trim-scope explanation
  const scope=comparisonScopeSentence();
  if(scope)bullets.push(scope);
  return bullets.slice(0,4);
}

function resultSummaryLine(options,routes=[]){
  if((options||[]).some(option=>option.key==="specialist")){
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
      if(fasterRoute&&fasterName!==strongerName&&Math.min(firstMedian,secondMedian)/Math.max(firstMedian,secondMedian)>=0.9){
        return `${strongerName} looks stronger on recent comparable sales. ${fasterName} is close enough that speed and process may matter.`;
      }
      return `${strongerName} looks stronger on recent comparable sales, but ${weakerName} has enough signal to compare before choosing.`;
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
      `If it were mine, I’d list it on ${primary.name}.`,
      `For this car, ${primary.name} is where I’d start.`,
      `${primary.name} is the clearest choice for this car right now.`
    ],sellState.carName,primary.name,alt.name);
  }
  if(primary){
    return pickCopy([
      `If it were mine, I’d list it on ${primary.name}.`,
      `For this car, ${primary.name} is where I’d start.`,
      `${primary.name} is the clearest choice for this car right now.`
    ],sellState.carName,primary.name);
  }
  return "I’m only showing choices I can stand behind.";
}

function compactPlatformCopy(option,primaryPlatform){
  const primaryName=primaryPlatform?.name||"the first choice";
  if(!option)return "Worth comparing, but it is not where I’d start.";
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
  if(abs<3)return pickCopy([
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
    `Recent comparable ${comparableModelLabel()} have consistently favoured this platform.`,
    `This is where I’d start if you are selling it yourself.`,
    `This platform has had the strongest run recently.`
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
      :`This is where I'd sell this car.`;
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
  if(option.speedToList==="fast"||option.speedToList==="medium_fast")facts.push(`${option.name} can also be the cleaner play if getting live quickly matters.`);
  if(option.speedToList==="slower")facts.push(`${option.name} may take longer to get live than some smaller platforms, so timing is the tradeoff.`);
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
    lines.push(`${faster.name} is the cleaner speed play; ${slower.name} may take longer to get live.`);
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
