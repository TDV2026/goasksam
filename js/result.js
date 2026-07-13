async function showSellRecommendation(){
  const vehicleIssue=currentMissingVehicleDetail();
  if(vehicleIssue){
    sellState.returnToConfirm=true;
    askMissingVehicleDetail(vehicleIssue);
    return;
  }
  sellState.step=12;
  hideHero();
  const msgs=document.getElementById("msgs");
  const thinkRow=document.createElement("div");thinkRow.className="row sam";thinkRow.id="sellThinking";
  const loadingLines=[
    "Searching the available market data and recent sales now.",
    "Checking close matches first, then widening only when it adds useful context.",
    "Comparing platform fit, seller region, timing and likely audience.",
    "Looking at whether PowerSellers should be on the table.",
    "Nearly there. I would rather be thorough than give you a lazy answer."
  ];
  thinkRow.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div>
    <div class="analysis-loader">
      <div class="market-swirl" aria-hidden="true"></div>
      <div class="analysis-copy">
        <div class="analysis-title">Analyzing the market for your ${escapeHtml(sellState.carName||"car")}</div>
        <div class="analysis-line" id="analysisLine">${escapeHtml(loadingLines[0])}</div>
        <div class="analysis-note">This can take a moment because Sam is checking sales evidence before making a recommendation.</div>
      </div>
    </div>
  </div></div>`;
  msgs.appendChild(thinkRow);msgs.scrollTop=msgs.scrollHeight;
  let loadingIndex=0;
  const loadingTimer=setInterval(()=>{
    loadingIndex=(loadingIndex+1)%loadingLines.length;
    const line=document.getElementById("analysisLine");
    if(line)line.textContent=loadingLines[loadingIndex];
  },3600);

  let decisionData=null;
  try{
    const res=await fetch(apiPath("/api/sellerDecision"),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        car:{
          raw:sellState.carName,
          vehicle:(sellState.vehicleIdentityValidated&&sellState.resolvedVehicle)?sellState.resolvedVehicle:undefined,
          region:sellState.region,
          state:sellState.state,
          mileage:sellState.mileage,
          condition:sellState.condition,
          serviceRecords:sellState.records,
          title:sellState.title,
          targetPrice:sellState.price,
          timeline:sellState.timeline,
          involvement:sellState.involvement,
          notes:sellState.notes
        }
      })
    });
    decisionData=await res.json();
  }catch(e){
    decisionData={status:"error",error:e.message};
  }
  clearInterval(loadingTimer);

  const tr=document.getElementById("sellThinking");if(tr)tr.remove();

  if(decisionData?.status==="needs_clarification"){
    const missing=currentMissingVehicleDetail();
    sellState.returnToConfirm=true;
    if(missing){
      askMissingVehicleDetail(missing);
    }else{
      sellState.step=1;
      addMsg("sam",decisionData.clarification?.question||"I need the year, make and model before I can check the market.");
    }
    document.getElementById("btn").disabled=false;
    return;
  }

  if(decisionData?.status==="error"||decisionData?.error){
    addMsg("sam",`I couldn't reach the live market check from this page: ${decisionData.error||"connection issue"}. Try the live GoAskSam site, or try again in a moment. I don't want to invent a recommendation without evidence.`);
    document.getElementById("btn").disabled=false;
    return;
  }

  sellState.sellDecision=decisionData;
  const decision=decisionData.decision||{};
  const practicalFallback=regionalNoEvidenceFallback();
  const routeFit=decision.routeFit||{};
  const allRouteOptions=routeFit.routes||[];
  sellState.allRouteOptions=allRouteOptions;
  const evidenceBackedRoutes=allRouteOptions
    .filter(routeHasTrueComparableEvidence)
    .filter(route=>route.routable!==false)
    .filter(route=>!shouldSuppressRouteForSellerRegion(route));
  // Non-US sellers whose result has no region-usable evidence (thin, none,
  // or all of it on region-mismatched US platforms) get the regional cards
  // directly: no OldCarsData fallback rendering, no involvement choice.
  const policyShaped=decision.evidenceBasis==="regional_policy"
    ||(isInternationalSellerRegion()&&(!evidenceBackedRoutes.length||decisionData.evidence?.thinMarket));
  if(policyShaped&&practicalFallback){
    sellState.noEvidenceFallback=practicalFallback;
    showRegionalFallbackRecommendation(msgs,practicalFallback);
    document.getElementById("btn").disabled=false;
    return;
  }
  const preferredRouteOptions=evidenceBackedRoutes
    .filter((route,index,routes)=>routeWorthShowing(route,index,routes[0]));
  const routeOptions=[...preferredRouteOptions];
  if(routeOptions.length<2){
    const backup=evidenceBackedRoutes.find(route=>!routeOptions.includes(route));
    if(backup)routeOptions.push(backup);
  }
  routeOptions.splice(2);
  // Speed routing (data-validated July 2026: Hagerty holds 5 tracked 1960s
  // Corvette sales). A fast-timeline 1960s Corvette keeps Hagerty as the
  // secondary card. The argument is records + fit; our dataset cannot state
  // a sell-through rate honestly (sold-biased), so none is claimed.
  const speedCorvette=sellerWantsSpeed()
    &&/corvette/i.test(String(sellState.resolvedVehicle?.model||sellState.carName||""))
    &&(()=>{const y=Number(sellState.resolvedVehicle?.year);const r=sellState.resolvedVehicle?.yearRange;
      return (y>=1960&&y<=1969)||(r&&r.start>=1960&&r.end<=1969);})();
  if(speedCorvette){
    const hagertyRoute=allRouteOptions.find(route=>/hagerty/i.test(String(route.platform||route.label||"")));
    if(hagertyRoute&&routeOptions[0]!==hagertyRoute){
      routeOptions.splice(1,routeOptions.length-1,hagertyRoute);
      hagertyRoute.speedArgument=true;
    }
  }
  if(!routeOptions.length){
    // Policy-floor decision for a region without a bespoke regional card:
    // show the backend's best route-policy fits, labeled as fit rather than data.
    routeOptions.push(...allRouteOptions
      .filter(route=>!shouldSuppressRouteForSellerRegion(route))
      .slice(0,2));
  }
  const evidence=decisionData.evidence||{};
  const sellerActivity=decisionData.analysis?.sellerActivity||{};
  const limitations=[...(decision.limitations||[])];
  const tradeoffs=[...(decision.tradeoffs||[])];

  if(!routeOptions.length){
    const fallback=practicalFallback;
    sellState.noEvidenceFallback=fallback;
    if(fallback){
      showRegionalFallbackRecommendation(msgs,fallback);
    }else{
      addMsg("sam",noEvidenceMessage(fallback));
    }
    document.getElementById("btn").disabled=false;
    return;
  }

  const wideningLine=ladderWideningNarration(decisionData);
  if(wideningLine)addMsg("sam",wideningLine);
  if(decision.strongerNonRoutable){
    const houseName=platformDisplayName(decision.strongerNonRoutable.platform);
    addMsg("sam",`One thing to know up front: ${houseName} actually shows the strongest comparable results in our records. It's a consignment auction house rather than a platform you can list on yourself, so it isn't the pick, but it tells you serious money follows this car.`);
  }

  const routesForCards=routeOptions;
  const twoRouteMode=hasTwoRouteTradeoff(routeOptions);
  const partnerReferral=decision.partnerReferral||{};
  sellState.partnerReferral=partnerReferral;
  const hasNamedPowerSellerAdvice=shouldLeadWithPartner(partnerReferral);
  const powerSellerProfiles=hasNamedPowerSellerAdvice?[partnerProfileFromReferral(partnerReferral)]:[];
  sellState.powerSellerProfiles=powerSellerProfiles;

  const routeSellOptions=routesForCards.map((route,index)=>{
    const platform=route.marketEvidence||{};
    const facts=route.routeFitFacts||[];
    const routeName=platformDisplayName(route.label||route.platform);
    const isPrimary=index===0;
    const speedFit=facts.includes("faster_listing_fit");
    const speedTradeoff=facts.includes("speed_tradeoff");
    const segmentFit=facts.includes("segment_fit");
    const regionFit=facts.includes("region_fit");
    const priceRoute=facts.includes("strong_price_signal_route");
    return {
      key:index===0?"primary":`route_${index}`,
      name:routeName,
      type:index===0?"Platform I’d use":"Worth comparing",
      badge:hasNamedPowerSellerAdvice?(index===0?"If selling yourself":"Worth comparing"):(twoRouteMode?(index===0?"Sam's lean":"Worth comparing"):(index===0?"Sam's pick":"Worth comparing")),
      badgeClass:index===0?"top":"alt",
      cardClass:index===0&&!hasNamedPowerSellerAdvice?"primary-rec":"",
      actionLabel:index===0?`Submit your car to ${platformLogo({name:routeName}).text}`:`Consider ${routeName}`,
      speedArgument:!!route.speedArgument,
      reason:route.speedArgument
        ?"Hagerty has sold 1960s Corvettes in our records and is the stronger fit when speed matters: listings get live quickly and the audience skews classic."
        :routeReason(route,index,routeOptions),
      reasonBullets:index===0&&!route.speedArgument?primaryReasonBullets(route):null,
      heroStat:index===0?primaryHeroStat(route):null,
      evidenceBullets:routeEvidenceBullets(route,index,routeOptions),
      evidenceLine:"",
      stat:routeTagLine(route,index,routeOptions),
      bestFor:index===0
        ? speedFit?"Works when timing matters and the market read still backs it":"Works when the priority is the strongest sale outcome"
        : speedFit?"Worth comparing if speed-to-list matters":"Worth comparing if buyer fit or handoff is better",
      marketEvidence:route.marketEvidence||null,
      speedToList:route.speedToList,
      priceOutcome:route.priceOutcome,
      routeFitFacts:facts
    };
  });

  const powerSellerOption=hasNamedPowerSellerAdvice?{
      key:"specialist",
      name:"People I’d call first",
      type:"PowerSeller conversation",
      badge:"Worth speaking to",
      badgeClass:"specialist",
      cardClass:"specialist-rec primary-rec",
      actionLabel:"Speak to PowerSeller",
      reason:powerSellerAdviceReason(hasNamedPowerSellerAdvice),
      evidenceBullets:powerSellerAdviceBullets(hasNamedPowerSellerAdvice),
      evidenceLine:"",
      stat:"",
      bestFor:"",
      observedSellers:powerSellerProfiles
  }:null;

  sellState.sellOptions=powerSellerOption?[powerSellerOption,...routeSellOptions]:routeSellOptions;

  sellState.sellOptions.forEach((option,index)=>{
    option.rankReason=rankingReason(option,index,sellState.sellOptions);
  });

  const renderOptionCard=option=>`
      <div class="sell-rec-card ${escapeHtml(option.cardClass||"")}" onclick="chooseSellOption('${escapeHtml(option.key)}')">
        <div class="sell-rec-card-head">
          <div>
            <div class="sell-rec-badge ${escapeHtml(option.badgeClass||"alt")}">${escapeHtml(option.badge)}</div>
            <div style="margin-top:10px"><div class="sell-rec-name">${escapeHtml(option.name)}</div><div class="sell-rec-type">${escapeHtml(option.type)}</div></div>
          </div>
          <div class="platform-logo ${escapeHtml(platformLogo(option).cls)}">${escapeHtml(platformLogo(option).text)}</div>
        </div>
        <div class="sell-rec-reason-label">${option.key==="specialist"?"Why I’d call them":"Why I picked this"}</div>
        ${option.reasonBullets?.length
          ?`<ul class="sell-rec-bullets">${option.reasonBullets.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          :`<div class="sell-rec-reason">${escapeHtml(option.rankReason||option.reason)}</div>`}
        ${option.heroStat?`<div class="sell-rec-hero"><div class="sell-rec-hero-line">${escapeHtml(option.heroStat.count)}</div>${option.heroStat.money?`<div class="sell-rec-hero-money">${escapeHtml(option.heroStat.money)}</div>`:""}</div>`:""}
        ${option.stat?`<div class="sell-rec-stat">${escapeHtml(option.stat)}</div>`:""}
        ${option.evidenceBullets?.length?`<ul class="sell-rec-bullets">${option.evidenceBullets.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>`:""}
        ${option.evidenceLine?`<div class="sell-rec-evidence-line">${escapeHtml(option.evidenceLine||"")}</div>`:""}
        ${option.observedSellers?.length?`<div class="observed-sellers">
          ${option.observedSellers.map((seller,sellerIndex)=>`<div class="observed-seller">
            <span class="observed-seller-name">${escapeHtml(seller.name)}</span>
            <span class="observed-seller-meta">${escapeHtml([seller.region,platformDisplayName(seller.platform)].filter(Boolean).join(" · "))}</span>
            <div class="observed-seller-tags">${(seller.specialties||[]).map(tag=>`<span class="observed-seller-tag">${escapeHtml(tag)}</span>`).join("")}</div>
            <span class="observed-seller-why">Why I’d call them</span>
            <ul>${powerSellerWhyBullets(seller,sellerIndex).map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>
            <button class="ghost" onclick="event.stopPropagation();chooseSellOption('${escapeHtml(option.key)}')">Talk to them</button>
          </div>`).join("")}
        </div>`:""}
        <div class="sell-rec-actions"><button class="${option.key==="primary"||String(option.cardClass||"").includes("primary-rec")?"primary":"ghost"}" onclick="event.stopPropagation();chooseSellOption('${escapeHtml(option.key)}')">${escapeHtml(option.actionLabel||"Consider this")}</button></div>
      </div>`;

  const renderCompactPlatform=option=>`
    <div class="platform-compact" onclick="explainSellOption('${escapeHtml(option.key)}')">
      <div>
        <div class="platform-compact-title">${escapeHtml(option.name)}</div>
        <div class="platform-compact-copy">${escapeHtml(compactPlatformCopy(option,primaryPlatform))}</div>
      </div>
      <div class="platform-compact-action">Why</div>
    </div>`;

  const renderSelfManagedPlatformSummary=option=>{
    const logo=platformLogo(option);
    return `<details class="self-managed-details">
      <summary>
        <div class="self-managed-summary-main">
          <div class="self-managed-title">${escapeHtml(option.name)}</div>
          <div class="self-managed-copy">Sam's pick if you want to manage the sale yourself.</div>
        </div>
        <div class="self-managed-right">
          <div class="platform-logo ${escapeHtml(logo.cls)}">${escapeHtml(logo.text)}</div>
          <div class="self-managed-action">Show details</div>
        </div>
      </summary>
      <div class="self-managed-expanded">${renderOptionCard(option)}</div>
    </details>`;
  };

  const featuredPowerSeller=powerSellerProfiles[0]||null;
  const secondaryPowerSellers=[];
  const featuredPowerSellerName=featuredPowerSeller?powerSellerFirstName(featuredPowerSeller):"";
  // Two copy variants: the intro and badge reference where the platform pick
  // sits, so the section leading the layout reads differently from the section
  // rendered second (after a DIY answer or a price-divergence flag).
  const buildPowerSellerHTML=platformFirst=>featuredPowerSeller?`
    <div class="sell-section-label">Have it handled</div>
    <div class="sell-section-note">${platformFirst
      ?`If you'd rather have it handled: you do pay a fee, but a good PowerSeller takes on everything, prep, photos, listing, buyer questions, paperwork and platform choice, and in most cases the fee earns its keep. ${escapeHtml(featuredPowerSellerName)} is who I'd call. The platform pick above is the place to start if you're running it yourself.`
      :`Honestly? At this level my personal preference is generally a good PowerSeller. You do pay a fee, but a good one handles everything: prep, photos, listing, buyer questions, paperwork and platform choice. In most cases the fee earns its keep. ${escapeHtml(featuredPowerSellerName)} is who I'd call. If you'd rather run it yourself, the platform pick is right below.`}</div>
    ${renderFeaturedPowerSellerProfile(featuredPowerSeller,platformFirst)}
  `:"";
  const powerSellerHTML=buildPowerSellerHTML(false);
  const powerSellerSecondHTML=buildPowerSellerHTML(true);
  const platformOptions=sellState.sellOptions.filter(option=>option.key!=="specialist");
  const primaryPlatform=platformOptions[0]||null;
  const secondaryPlatforms=powerSellerHTML?[]:platformOptions.slice(1,2);
  const diySecondaryLine=(!powerSellerHTML&&sellState.partnerReferral?.eligible&&sellerWantsToManageSelf())
    ?`<div class="sell-section-note" style="margin-top:10px">You said you’d rather run it yourself, so that’s the plan. If you’d rather have someone handle the whole sale, I know who I’d call. Just ask.</div>`
    :"";
  const platformCardsHTML=primaryPlatform?(powerSellerHTML?`
    <div class="sell-section-label" style="margin-top:12px">Run it yourself</div>
    <div class="sell-rec-grid">${renderOptionCard(primaryPlatform)}</div>
  `:`
    <div class="sell-rec-grid">${renderOptionCard(primaryPlatform)}</div>
    ${secondaryPlatforms.length?`<div class="platform-compact-list"><div class="sell-section-note" style="margin:0">Also looked at</div>${secondaryPlatforms.map(renderCompactPlatform).join("")}</div>`:""}
    ${diySecondaryLine}
  `):"";

  // Price-gap context (locked): a >20% gap between the asking price and the
  // comps median asks for context FIRST. Comps are data points, not truth,
  // and the median is never cited as proof the seller is wrong.
  const PRICE_DIVERGENCE_THRESHOLD=0.2;
  const askPrice=estimatedTargetPrice();
  const compsMedian=decisionData.evidence?.estimatedValue||null;
  const priceDiverged=askPrice>0&&compsMedian&&Math.abs(askPrice-compsMedian)/compsMedian>PRICE_DIVERGENCE_THRESHOLD;
  // Price-gap note (locked): results are never held back. One neutral note
  // renders after the cards, once, naming direction and percent without
  // questioning the seller.
  const gapNote=priceDiverged
    ?`One thing worth knowing: your asking price is ${Math.round(Math.abs(askPrice-compsMedian)/compsMedian*100)}% ${askPrice>compsMedian?"above":"below"} the average for recent ${cleanCarForCopy()} sales ${marketWindowPhrase()}. That can be right for plenty of reasons: condition, trim, mileage, spec. Every car is different. Worth discussing with the platform or PowerSeller when you list.`
    :null;

  const summaryLine=resultSummaryLine(sellState.sellOptions,routeOptions);
  const headerHTML=`<div class="sell-rec-header">
      <div class="sell-rec-kicker">Seller Intelligence</div>
      <div class="sell-rec-title">${escapeHtml(resultHeaderTitle(routeOptions))}</div>
      <div class="sell-rec-subtitle">${escapeHtml(summaryLine)}</div>
    </div>`;
  const caveatHTML=adverseConditionCaveat()?`<div class="sell-section-note" style="margin-top:10px">${escapeHtml(adverseConditionCaveat())}</div>`:"";
  // Recommendation closes are declarative (locked): a period, never a
  // question, never an escape hatch.
  const afterText=powerSellerHTML?"Both are real options and the choice is yours. Pick one, or ask me to compare the tradeoffs.":(secondaryPlatforms.length?"Pick either, or ask me to compare the tradeoffs.":"Ask me anything about the pick, or how I'd run the listing.");
  sellState.generatedPrimaryName=sellState.sellOptions[0]?.name||null;
  sellState.generatedSecondaryName=sellState.sellOptions[1]?.name||null;

  if(powerSellerHTML&&isUSRegion(sellState.region)){
    // Gate-open, US sellers only: one light choice orders the sections
    // before anything renders. Non-US goes straight to the platform result.
    sellState.pendingResultSections={headerHTML,powerSellerHTML,powerSellerSecondHTML,platformCardsHTML,caveatHTML,afterText,gapNote};
    sellState.awaitingPathChoice=true;
    sellState.step=12;
    const row=document.createElement("div");row.className="row sam";
    row.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div>${headerHTML}<div class="sam-text">Want it handled, or run it yourself?</div>${chipsHTML(["Have it handled","I'll run it myself","Not sure"])}</div></div>`;
    msgs.appendChild(row);
    row.scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }

  const orderedSections=`${powerSellerHTML}${platformCardsHTML}`;
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    ${headerHTML}
    ${orderedSections}
    ${caveatHTML}
    ${gapNote?`<div class="sell-section-note" style="margin-top:10px">${escapeHtml(gapNote)}</div>`:""}
    <div class="sam-text after-results">${afterText}</div>
  </div></div>`;
  msgs.appendChild(row);
  row.scrollIntoView({behavior:"smooth",block:"start"});
}

function renderPendingResultSections(choice){
  const parts=sellState.pendingResultSections;
  if(!parts)return;
  sellState.awaitingPathChoice=false;
  sellState.pendingResultSections=null;
  const platformFirst=choice==="diy";
  const sections=platformFirst?`${parts.platformCardsHTML}${parts.powerSellerSecondHTML}`:`${parts.powerSellerHTML}${parts.platformCardsHTML}`;
  const gapNoteHTML=parts.gapNote?`<div class="sell-section-note" style="margin-top:10px">${escapeHtml(parts.gapNote)}</div>`:"";
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div>${sections}${parts.caveatHTML}${gapNoteHTML}<div class="sam-text after-results">${parts.afterText}</div></div></div>`;
  msgs.appendChild(row);
  row.scrollIntoView({behavior:"smooth",block:"start"});
}

function handleSellRecommendationFollowup(q){
  const lower=q.toLowerCase();

  if(sellState.awaitingPathChoice){
    if(isQuestionInput(q))return false; // chat answers, choice stays pending
    if(/handled|someone|help me|have it/i.test(lower)){
      sellState.involvement="Want someone to handle everything";
      renderPendingResultSections("handled");
      return true;
    }
    if(/myself|diy|run it|i'?ll run|on my own|self/i.test(lower)||detectIntent(lower)==="negation"){
      sellState.involvement="I'll manage it myself";
      renderPendingResultSections("diy");
      return true;
    }
    if(/^not sure$/i.test(lower.trim())||detectIntent(lower)==="refusal"||detectIntent(lower)==="moveOn"){
      renderPendingResultSections("handled");
      return true;
    }
    sellState.pathChoiceEscalations=(sellState.pathChoiceEscalations||0)+1;
    if(sellState.pathChoiceEscalations>=2){renderPendingResultSections("handled");return true;}
    addMsg("sam","Quick one first: want it handled end to end, or run it yourself?","",chipsHTML(["Have it handled","I'll run it myself","Not sure"]));
    return true;
  }
  const options=sellState.sellOptions||[];
  if(sellState.noEvidenceFallback&&handleNoEvidenceFollowup(q))return true;
  if(!options.length&&handleNoEvidenceFollowup(q))return true;
  if(!options.length)return false;

  const chosenByName=findSellOptionByText(q);
  const option=chosenByName||options.find(o=>o.key==="primary")||options[0];

  if(/\b(go with|choose|pick|use|select)\b/i.test(lower)){
    chooseSellOption(option.key);
    return true;
  }

  if(/\b(compare|difference|tradeoffs|tradeoff)\b/i.test(lower)){
    addMsg("sam",compareSellOptions());
    return true;
  }

  if(/\b(i'?ll (run|manage|handle) it|run it myself|manage it myself|handle it myself|do it myself|by myself|going diy|i'?d rather (run|do|manage))\b/i.test(lower)){
    sellState.involvement="I'll manage it myself";
    addMsg("sam","Noted, you're running it yourself. The platform pick above is the plan, and I won't pitch the PowerSeller route again unless you ask.");
    return true;
  }
  if(/\b(power seller|powerseller|specialist|consignor|consignment|handle the whole|someone handle)\b/i.test(lower)){
    const referral=sellState.partnerReferral||{};
    if(referral.eligible&&referral.partner){
      // User-initiated: fine to show the partner even after a DIY preference.
      if(!(sellState.powerSellerProfiles||[]).length){
        sellState.powerSellerProfiles=[partnerProfileFromReferral(referral)];
      }
      const profile=sellState.powerSellerProfiles[0];
      if(!options.some(o=>o.key==="specialist")){
        sellState.sellOptions.push({key:"specialist",name:profile.displayName,type:"PowerSeller conversation",observedSellers:[profile]});
      }
      addMsg("sam",`Since you asked, here's who I'd call.`,renderFeaturedPowerSellerProfile(profile));
    }else{
      addMsg("sam","For this car I'd keep it simple and sell on the recommended platform. A PowerSeller referral only makes sense when the value and the fit genuinely support it, and this one doesn't clear that bar.");
    }
    return true;
  }

  if(chosenByName||/\b(why|better|explain|reason|what about|how about|tell me about|do they|does it|sell tons|high prices|higher|best price)\b/i.test(lower)){
    const hiddenRoute=chosenByName?null:findHiddenRouteByText(q);
    if(hiddenRoute&&hiddenRoute.routable===false){
      addMsg("sam",`${platformDisplayName(hiddenRoute.label||hiddenRoute.platform)}: strong results show up there in our records, but it's a consignment auction house, not a platform you list on yourself, so I can't make it the pick. It mainly tells you serious buyers follow this car.`);
      return true;
    }
    if(hiddenRoute&&!routeHasTrueComparableEvidence(hiddenRoute)){
      addMsg("sam",`${hiddenRoute.label||hiddenRoute.platform}: I’m leaving it out because this search does not give me enough platform-specific evidence for it. It may still be worth a manual look, but I would not put it beside the main choices as if the market clearly backed it.`);
      return true;
    }
    addMsg("sam",`${option.name}: ${routeAnswer(option)}`);
    return true;
  }

  return false;
}

// Collecting Cars proof leads with the searched make when we hold curated
// proof for it; unrelated Ferraris never headline a Lamborghini search.
const CC_MAKE_PROOF={
  lamborghini:"high-value Lamborghinis including Huracán and Aventador",
  ferrari:"high-value Ferraris including the F40 (£1.7M) and F50 (£2.94M)",
  porsche:"high-value Porsches including a 918 Spyder (€1.35M)",
  "mercedes-benz":"high-value Mercedes including a 300 SL (£1.1M)"
};
function collectingCarsReason(){
  const make=String(sellState.resolvedVehicle?.make||"");
  const specific=CC_MAKE_PROOF[make.toLowerCase()];
  if(make&&specific){
    return `Specialist platform for high-value cars. They've sold many ${make} models at premium prices across the UK, Europe, Australia and the Middle East. Recent sales include: ${specific}, plus more.`;
  }
  // Unmapped make: generic proof, no unrelated named models headlining.
  return "Specialist platform for high-value cars. They've sold many high-value cars at premium prices across the UK, Europe, Australia and the Middle East. Recent sales include: high-value Ferraris, Porsches and Lamborghinis, plus more.";
}

// Car & Classic copy names the actual car instead of reading like a
// templated category list. Pooled openers keyed on the car.
function carAndClassicReason(){
  const rv=sellState.resolvedVehicle;
  const car=cleanCarForCopy();
  if(rv?.make){
    const openers=[
      `This isn't your typical Car & Classic listing, but they've sold ${rv.make}s like the ${car} before.`,
      `They specialize in cars with a following, and ${rv.make}s like the ${car} come through regularly.`,
      `They've handled ${rv.make}s like the ${car} before.`
    ];
    return `${pickCopy(openers,car)} 130K+ sales annually, specialists in performance and collectible cars.`;
  }
  return "Collector and performance cars perform strongly here. 130K+ sales annually, 4M+ monthly visits.";
}

function regionalNoEvidenceFallback(){
  const region=String(sellState.region||"").toLowerCase();
  const car=cleanCarForCopy();
  const regionPhrase=sellingRegionPhrase();
  if(/\b(uk|united kingdom|great britain|gb|england|scotland|wales|europe)\b/.test(region)){
    const highValue=estimatedTargetPrice()>=100000;
    if(highValue){
      return {
        region:"uk_europe",
        primary:"Collecting Cars",
        secondary:"Car & Classic",
        title:`Here’s what I’d do with the ${car}.`,
        subtitle:`Collecting Cars is where I’d sell this.`,
        primaryReason:collectingCarsReason(),
        bullets:["24,000+ lots sold, $1.5B+ generated for sellers."],
        secondaryReason:carAndClassicReason(),
        secondaryBullets:[]
      };
    }
    return {
      region:"uk_europe",
      primary:"Car & Classic",
      secondary:null,
      title:`Here’s what I’d do with the ${car}.`,
      subtitle:`Car & Classic is where I’d sell this.`,
      primaryReason:carAndClassicReason(),
      secondaryReason:"",
      bullets:[]
    };
  }
  if(/\b(australia|middle east)\b/.test(region)){
    return {
      region:"international",
      primary:"Collecting Cars",
      secondary:null,
      title:`Here’s what I’d do with the ${car}.`,
      subtitle:`I’d list it on Collecting Cars for a seller in your region.`,
      primaryReason:"Global platform with 350,000+ members in 100+ countries. Specialists in sourcing top-quality collectibles. 24,000+ lots sold, $1.5B+ generated for sellers.",
      secondaryReason:"",
      bullets:CC_MAKE_PROOF[String(sellState.resolvedVehicle?.make||"").toLowerCase()]
        ?[`They've sold many ${sellState.resolvedVehicle.make} models at premium prices, including: ${CC_MAKE_PROOF[String(sellState.resolvedVehicle.make).toLowerCase()]}.`]
        :[]
    };
  }
  return null;
}

function showRegionalFallbackRecommendation(msgs,fallback){
  try{
    sellState.sellOptions=[fallbackSellOption(fallback)];
    const row=document.createElement("div");row.className="row sam";
    row.innerHTML=renderNoEvidenceFallback(fallback);
    msgs.appendChild(row);
    row.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){
    console.error("regional fallback render failed",err);
    addMsg("sam",`${fallback.primary}: ${fallback.primaryReason} ${fallback.bullets?.[0]||""}`);
  }
}

function noEvidenceMessage(fallback){
  const car=sellState.carName||"this car";
  const recommended=sellState.sellDecision?.decision?.recommendedPath;
  if(!fallback){
    const start=recommended?`${platformDisplayName(recommended)} is the call here. That's fit for the car and your region, not sales data.`:`Bring a Trailer is the call for a US collector car with no recent comparable sales in my data. That's fit, not sales data.`;
    return `I checked recent sales for your ${car} and the market is genuinely quiet right now, so I won't quote numbers. ${start} When comparable sales show up, I can back this with real evidence.`;
  }
  const extra=fallback.secondary?` If this is a particularly valuable example, I’d also compare ${fallback.secondary}.`:"";
  return `I checked recent sales for your ${car}, but there isn't enough model-specific activity to make a proper data-led platform call. ${fallback.primaryReason}${extra}`;
}

function renderNoEvidenceFallback(fallback){
  if(!fallback)return "";
  const option={name:fallback.primary,key:"primary"};
  const logo=platformLogo(option);
  const secondaryLogo=fallback.secondary?platformLogo({name:fallback.secondary,key:"route_1"}):null;
  const secondary=fallback.secondary?`
      <div class="sell-rec-card" onclick="chooseFallbackDestination('${escapeHtml(fallback.secondary)}')">
        <div class="sell-rec-card-head">
          <div>
            <div class="sell-rec-badge alt">Also strong here</div>
            <div style="margin-top:10px"><div class="sell-rec-name">${escapeHtml(fallback.secondary)}</div><div class="sell-rec-type">Worth comparing</div></div>
          </div>
          <div class="platform-logo ${escapeHtml(secondaryLogo.cls)}">${escapeHtml(secondaryLogo.text)}</div>
        </div>
        <div class="sell-rec-reason-label">Why it fits</div>
        <div class="sell-rec-reason">${escapeHtml(fallback.secondaryReason)}</div>
        ${(fallback.secondaryBullets||[]).length?`<ul class="sell-rec-bullets">${fallback.secondaryBullets.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>`:""}
        <div class="sell-rec-actions"><button class="ghost" onclick="event.stopPropagation();chooseFallbackDestination('${escapeHtml(fallback.secondary)}')">Consider ${escapeHtml(fallback.secondary)}</button></div>
      </div>`:"";
  return `<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    <div class="sell-rec-header">
      <div class="sell-rec-kicker">What I’d do</div>
      <div class="sell-rec-title">${escapeHtml(fallback.title||`Here’s what I’d do with ${sellState.carName||"this car"}.`)}</div>
      <div class="sell-rec-subtitle">${escapeHtml(fallback.subtitle||fallback.primaryReason)}</div>
    </div>
    <div class="sell-rec-grid">
      <div class="sell-rec-card primary-rec" onclick="chooseFallbackDestination('${escapeHtml(fallback.primary)}')">
        <div class="sell-rec-card-head">
          <div>
            <div class="sell-rec-badge top">Sam's pick</div>
            <div style="margin-top:10px"><div class="sell-rec-name">${escapeHtml(fallback.primary)}</div><div class="sell-rec-type">Where I’d start</div></div>
          </div>
          <div class="platform-logo ${escapeHtml(logo.cls)}">${escapeHtml(logo.text)}</div>
        </div>
        <div class="sell-rec-reason-label">Why I’d start here</div>
        <div class="sell-rec-reason">${escapeHtml(fallback.primaryReason)}</div>
        ${fallback.stat?`<div class="sell-rec-reason">${escapeHtml(fallback.stat)}</div>`:""}
        <ul class="sell-rec-bullets">${(fallback.bullets||[]).map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>
        ${fallback.caveat?`<div class="sell-rec-evidence-line">${escapeHtml(fallback.caveat)}</div>`:""}
        <div class="sell-rec-actions"><button class="primary" onclick="event.stopPropagation();chooseFallbackDestination('${escapeHtml(fallback.primary)}')">Start with ${escapeHtml(fallback.primary)}</button></div>
      </div>
    ${secondary}
    </div>
    <div class="sam-text after-results">Ask me anything about the recommendation, or tell me more about the car.</div>
  </div></div>`;
}

function fallbackSellOption(fallback){
  return {
    key:"primary",
    name:fallback.primary,
    type:"Platform I’d use",
    badge:"Sam's pick",
    badgeClass:"top",
    cardClass:"primary-rec",
    actionLabel:`Submit your car to ${fallback.primary}`,
    reason:fallback.primaryReason,
    evidenceBullets:fallback.bullets||[],
    evidenceLine:fallback.caveat,
    stat:fallback.stat||"Best regional fit",
    bestFor:fallback.region==="uk_europe"?"UK/Europe seller":"International seller",
    marketEvidence:null,
    routeFitFacts:["region_fit","faster_listing_fit"]
  };
}

function chooseFallbackDestination(destination){
  if(!sellState.sellOptions?.length&&sellState.noEvidenceFallback){
    sellState.sellOptions=[fallbackSellOption(sellState.noEvidenceFallback)];
  }
  chooseSellOption("primary");
}

function handleNoEvidenceFollowup(q){
  const fallback=sellState.noEvidenceFallback;
  if(!fallback)return false;
  const lower=String(q||"").toLowerCase();
  if(mentionsBringATrailer(lower)){
    addMsg("sam",regionalPlatformFollowup("Bring a Trailer",fallback));
    return true;
  }
  if(mentionsCarsAndBids(lower)){
    addMsg("sam",regionalPlatformFollowup("Cars & Bids",fallback));
    return true;
  }
  if(mentionsPCarMarket(lower)){
    addMsg("sam",regionalPlatformFollowup("PCarMarket",fallback));
    return true;
  }
  if(mentionsHemmings(lower)){
    addMsg("sam",regionalPlatformFollowup("Hemmings",fallback));
    return true;
  }
  if(mentionsCarAndClassic(lower)){
    addMsg("sam",regionalPlatformFollowup("Car & Classic",fallback));
    return true;
  }
  if(mentionsCollectingCars(lower)){
    addMsg("sam",regionalPlatformFollowup("Collecting Cars",fallback));
    return true;
  }
  if(/\b(where|what|which|why|sell|recommend|choice|option|platform|best|fast|quick)\b/i.test(lower)){
    addMsg("sam",regionalPlatformFollowup(fallback.primary,fallback));
    return true;
  }
  return false;
}

function regionalPlatformFollowup(platform,fallback){
  const region=sellingRegionPhrase();
  const car=cleanCarForCopy();
  const primary=fallback.primary;
  const isPrimary=normalizedPlatformText(platform)===normalizedPlatformText(primary);
  if(isPrimary){
    if(primary==="Collecting Cars"){
      return `Collecting Cars is where I’d sell this. For a ${car} in ${region}, it puts the car in front of an international buyer base first.`;
    }
    if(primary==="Car & Classic"){
      return `Car & Classic is where I’d start for a ${car} in the UK or Europe. It is the practical regional fit: buyers are already shopping there, and it keeps the sale in the market where the car actually sits.`;
    }
    return `${primary} is where I’d start for this car. The reason is simple: it fits the car, the seller’s region and the way this sale needs to happen.`;
  }
  const name=String(platform||"that platform");
  if(mentionsBringATrailer(name)){
    const primaryAudience=primary==="Collecting Cars" ? "Collecting Cars’ international buyer base" : `${primary}’s buyer base`;
    return `Because I don’t think Bring a Trailer is the right starting point for this sale. It is an excellent platform, but its audience is still predominantly US based. For a ${car} being sold from ${region}, I’d rather put it in front of ${primaryAudience}. If this were my car, that’s where I’d list it.`;
  }
  if(mentionsCarsAndBids(name)){
    const primaryAudience=primary==="Collecting Cars" ? "Collecting Cars’ international audience" : `${primary}’s buyer pool`;
    return `Cars & Bids can be great for newer enthusiast cars, especially in North America. I just don’t think it’s the right first call for this one. From ${region}, I’d rather put the car in front of ${primaryAudience} and only look at Cars & Bids if there was a very specific reason.`;
  }
  if(mentionsPCarMarket(name)){
    return `PCarMarket is worth knowing about, especially on Porsche-heavy searches, but I wouldn’t start there for this car and region. I’d use ${primary} first because the buyer pool makes more sense for where the car is being sold from.`;
  }
  if(mentionsHemmings(name)){
    return `Hemmings is useful for the right car, especially older American or traditional collector cars. This isn’t where I’d start for a ${car} in ${region}. I’d rather use ${primary}.`;
  }
  if(mentionsCarAndClassic(name)){
    return `Car & Classic is exactly the kind of platform I’d consider for a UK or European seller. If the car is in the Middle East or Australia and it is high-value, I’d usually start with Collecting Cars first because the buyer pool is broader.`;
  }
  if(mentionsCollectingCars(name)){
    return `Collecting Cars is strongest in my mind when the car is high-value, European or international. If I recommend something else first, it is usually because the car is more naturally suited to a local UK/Europe marketplace or the seller needs a simpler route.`;
  }
  return `I’d compare ${name} only if it gives this car a clearer buyer fit than ${primary}. My starting point is ${primary} because it fits the region and the kind of buyer I’d want looking at this car.`;
}

function sellingRegionPhrase(){
  const region=String(sellState.region||"this region").trim();
  if(/^middle east$/i.test(region))return "the Middle East";
  if(/^uk$/i.test(region))return "the UK";
  return region||"this region";
}

function normalizedPlatformText(value){
  return String(value||"").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"");
}

function mentionsBringATrailer(text){
  const normalized=normalizedPlatformText(text);
  return normalized.includes("bringatrailer")||/\bbat\b/i.test(String(text||""));
}

function mentionsCarsAndBids(text){
  const normalized=normalizedPlatformText(text);
  return normalized.includes("carsandbids")||/\bc\s*&\s*b\b/i.test(String(text||""));
}

function mentionsPCarMarket(text){
  const normalized=normalizedPlatformText(text);
  return normalized.includes("pcarmarket")||normalized.includes("pcar")||/\bpcm\b/i.test(String(text||""));
}

function mentionsHemmings(text){
  return normalizedPlatformText(text).includes("hemmings");
}

function mentionsCarAndClassic(text){
  const normalized=normalizedPlatformText(text);
  return normalized.includes("carandclassic")||normalized.includes("carsandclassic")||/\bc\s*&?\s*c\b/i.test(String(text||""));
}

function mentionsCollectingCars(text){
  const normalized=normalizedPlatformText(text);
  return normalized.includes("collectingcars");
}

function chooseSellOption(which){
  if(sellState.chosen)return; // prevent double-fire, already chose
  sellState.chosen=which;sellState.step=13;
  const option=sellState.sellOptions.find(o=>o.key===which)||sellState.sellOptions[0];
  const selectedPowerSeller=(sellState.powerSellerProfiles||[]).find(profile=>profile.id===sellState.selectedPowerSellerId);
  const displayName=selectedPowerSeller?.displayName||option?.name||"this choice";
  addMsg("user",`Go with ${displayName}`);
  setTimeout(()=>showContactForm(),600);
}

function explainSellOption(which){
  const option=(sellState.sellOptions||[]).find(o=>o.key===which);
  if(!option)return;
  addMsg("user",`Why ${option.name}?`);
  setTimeout(()=>addMsg("sam",`${option.name}: ${routeAnswer(option)}`),350);
}

function choosePowerSeller(id){
  sellState.selectedPowerSellerId=id;
  chooseSellOption("specialist");
}

function showContactForm(){
  sellState.step=13;
  hideHero();
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    <div class="sam-text">Last thing, so they can reach you directly. Email is required, phone is optional.</div>
    <div class="contact-form">
      <div class="contact-group">
        <div class="contact-label">Email address *</div>
        <input class="contact-input" type="email" id="sellEmail" placeholder="you@example.com">
      </div>
      <div class="contact-group">
        <div class="contact-label">Phone number (optional)</div>
        <input class="contact-input" type="tel" id="sellPhone" placeholder="+1 (555) 000-0000">
      </div>
    </div>
    <div class="chips" style="margin-top:10px">
      <button class="chip" style="border-color:#171717;color:#171717;font-weight:800" onclick="submitContactForm()">Submit →</button>
    </div>
  </div></div>`;
  msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
}

async function submitContactForm(){
  const email=document.getElementById("sellEmail")?.value?.trim();
  const phone=document.getElementById("sellPhone")?.value?.trim();
  if(!email||!email.includes("@")){
    const input=document.getElementById("sellEmail");
    if(input){input.style.borderColor="#dc2626";input.focus();}
    return;
  }
  sellState.email=email;sellState.phone=phone||null;
  addMsg("user",phone?`${email} · ${phone}`:email);

  const option=sellState.sellOptions.find(o=>o.key===sellState.chosen)||sellState.sellOptions[0]||{name:"the selected destination",type:null,key:sellState.chosen};
  const selectedPowerSeller=(sellState.powerSellerProfiles||[]).find(profile=>profile.id===sellState.selectedPowerSellerId);
  const destinationName=selectedPowerSeller?.displayName||option.name;
  try{
    const res=await fetch(apiPath("/api/submitSellerLead"),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        seller:{email,phone},
        car:{
          raw:sellState.carName,
          region:sellState.region,
          state:sellState.state,
          mileage:sellState.mileage,
          condition:sellState.condition,
          serviceRecords:sellState.records,
          title:sellState.title,
          targetPrice:sellState.price,
          timeline:sellState.timeline,
          involvement:sellState.involvement,
          notes:sellState.notes
        },
        choice:{
          destination:destinationName,
          destinationType:selectedPowerSeller?"powerseller":option.type,
          optionKey:option.key,
          powerSeller:selectedPowerSeller||null
        },
        decision:{
          vehicle:sellState.sellDecision?.vehicle||null,
          evidence:sellState.sellDecision?.evidence||null,
          decision:sellState.sellDecision?.decision||null,
          selectedOption:option
        }
      })
    });
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||"submission failed");
    setTimeout(()=>showSubmission(data),600);
  }catch(e){
    setTimeout(()=>addMsg("sam",`I couldn't submit this yet: ${e.message}. Your recommendation is still here, but I don't want to pretend the lead went through.`),500);
  }
}

function showSubmission(submission){
  const option=sellState.sellOptions.find(o=>o.key===sellState.chosen)||sellState.sellOptions[0]||{name:"the selected destination"};
  const selectedPowerSeller=(sellState.powerSellerProfiles||[]).find(profile=>profile.id===sellState.selectedPowerSellerId);
  const destinationName=selectedPowerSeller?.displayName||option.name;
  const ref=submission?.reference||"Pending";
  sellState.step=14;
  hideHero();
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    <div class="sam-text">We're submitting your ${escapeHtml(sellState.carName||"car")} to ${escapeHtml(destinationName)}. Here's your reference number.</div>
    <div class="ref-card">
      <div class="ref-label">Reference number</div>
      <div class="ref-number">${ref}</div>
      <div class="ref-detail">Your submission has been sent to ${escapeHtml(destinationName)}. They'll be in touch at ${escapeHtml(sellState.email)} within 24 hours. Keep this reference number handy.</div>
    </div>
    <div class="sam-text" style="margin-top:8px">Would you like to sell another car?</div>
    <div class="chips">
      <button class="chip" onclick="handleChip('Yes sell another car')">Yes, sell another car</button>
      <button class="chip" onclick="handleChip('No thanks')">No thanks</button>
    </div>
  </div></div>`;
  msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
}

