async function showSellRecommendation(){
  // No results-stage vehicle re-ask (locked A1): once the summary is confirmed
  // we go straight to the analysis at whatever level we know. A year-less
  // vehicle runs at model level (acceptModelLevel below) and is labeled as
  // such in the result. We never re-ask the year here and never reset to a
  // fresh vehicle entry, so stray text after this point can never re-parse as
  // a new car.
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
          acceptModelLevel:!!sellState.vehicleDetailSkipped,
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
    // Post-summary we NEVER re-ask the year and NEVER reset to a fresh vehicle
    // entry (A1/A3): a reset let stray text ("move on") re-parse as a new car.
    // If the seller already accepted a model-level read, proceeding is the
    // backend's job (acceptModelLevel); a clarification landing here is a rare
    // backend gap, so we stay on the confirmed summary and say so honestly
    // instead of looping. Otherwise (trim gap, pre-analysis) ask only the trim.
    if(sellState.vehicleDetailSkipped){
      addMsg("sam","I don't have enough tracked sales on that exact car to be confident, so I'll keep the read at the model level. That's reflected in the recommendation.");
    }else{
      const missing=currentMissingVehicleDetail();
      if(missing){sellState.returnToConfirm=true;askMissingVehicleDetail(missing);}
      else{addMsg("sam",decisionData.clarification?.question||"I need a little more on the car before I can check the market.");}
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
  // Dual option (locked): a second card always renders when any alternative
  // exists. With no second evidence-backed route, the best routable
  // policy-fit route stands in (its reason comes from curated policy).
  if(routeOptions.length<2){
    const policyBackup=allRouteOptions.find(route=>route.routable!==false
      &&!shouldSuppressRouteForSellerRegion(route)
      &&!routeOptions.includes(route));
    if(policyBackup)routeOptions.push(policyBackup);
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

  // Routing hierarchy (locked, strict order): PRICE FIRST, then speed.
  // 1. A verified 10%+ price premium picks the platform, period; speed may
  //    never override it. "Verified" means the 5+/5+ sampled proof object.
  // 2. Speed routes only when no verified 10%+ premium protects the pick:
  //    fast timeline + curated-fast alternative with real evidence.
  // Runs ONCE, before the opener and any card.
  sellState.routingReason=null;
  {
    const FAST=["fast","medium_fast"];
    const verifiedPremium=route=>{
      const p=route?.marketEvidence?.pricePremium;
      return (p&&p.platformSales>=5&&p.othersSales>=5)?Number(p.percent):null;
    };
    const first=routeOptions[0],second=routeOptions[1];
    if(first&&second){
      const pFirst=verifiedPremium(first),pSecond=verifiedPremium(second);
      if(pSecond!=null&&pSecond>=10&&(pFirst==null||pSecond>pFirst)&&routeHasTrueComparableEvidence(second)){
        routeOptions[0]=second;routeOptions[1]=first;
        delete routeOptions[0].speedArgument;
        sellState.routingReason="price";
      }
    }
    const pickRoute=routeOptions[0],altRoute=routeOptions[1];
    const pickPremium=verifiedPremium(pickRoute);
    // Raw median gap at the same scope (apples-to-apples), so price still
    // protects the pick when the backend did not send a verified pricePremium.
    const pickMedian=Number(pickRoute?.marketEvidence?.medianSalePrice||0);
    const altMedian=Number(altRoute?.marketEvidence?.medianSalePrice||0);
    const rawGapPercent=(pickMedian&&altMedian)
      ?Math.round(Math.abs(pickMedian-altMedian)/Math.max(pickMedian,altMedian)*100)
      :null;
    const priceProtects=(pickPremium!=null&&pickPremium>=10)||(rawGapPercent!==null&&rawGapPercent>=10);
    if(sellState.routingReason!=="price"&&!priceProtects
      &&sellerWantsSpeed()&&pickRoute&&altRoute
      &&FAST.includes(altRoute.speedToList)&&!FAST.includes(pickRoute.speedToList)
      &&routeHasTrueComparableEvidence(altRoute)){
      routeOptions[0]=altRoute;routeOptions[1]=pickRoute;
      // The routing reason carries the speed story now; the curated
      // speed-argument secondary copy would contradict a pick card.
      delete routeOptions[0].speedArgument;
      sellState.routingReason="speed";
    }
  }
  // No redundant chat opener (locked): the card is self-contained, and its
  // own transparency line carries the scope/window story. The old opener
  // duplicated the plate window and the lookback line.
  if(decision.strongerNonRoutable){
    const houseName=platformDisplayName(decision.strongerNonRoutable.platform);
    addMsg("sam",`One thing to know up front: ${houseName} actually shows the strongest comparable results in our records. It's a consignment auction house rather than a platform you can list on yourself, so it isn't the pick, but it tells you serious money follows this car.`);
  }

  // Data pick (1b): the platform with the highest CLEARED positive comparative
  // delta (symmetric, >=10%, 5+/5+) leads Card 1 -- the data wins the card, never
  // an assumption. Skipped when the seller prioritized speed (Mode B speed rule
  // keeps the faster platform on Card 1) or when a PowerSeller leads the layout.
  const routesForCards=(()=>{
    // A speed-priority seller keeps the routing's ordering (speed decides Card 1);
    // the delta/most-comps reorder must not override it with a slower platform.
    if(sellState.routingReason==="speed"||sellerWantsSpeed())return routeOptions;
    const routable=routeOptions.filter(r=>r.routable!==false);
    const cleared=r=>{const p=r&&r.marketEvidence&&r.marketEvidence.pricePremium;return p&&p.gateType==="symmetric"&&Number.isFinite(p.percent)&&p.percent>=10?p.percent:-1;};
    // 1) Highest cleared positive delta leads.
    let best=null,bestPct=-1;
    for(const r of routable){const pct=cleared(r);if(pct>bestPct){best=r;bestPct=pct;}}
    if(best&&bestPct>=10)return routeOptions[0]===best?routeOptions:[best,...routeOptions.filter(r=>r!==best)];
    // 2) No delta cleared: the deepest recent market (most sold comps) leads,
    // never an arbitrary routing default.
    let deep=null,deepN=-1;
    for(const r of routable){const n=Number(r.marketEvidence&&r.marketEvidence.evidenceSales||0);if(n>deepN){deep=r;deepN=n;}}
    if(deep&&deepN>0&&routeOptions[0]!==deep)return [deep,...routeOptions.filter(r=>r!==deep)];
    return routeOptions;
  })();
  // Pin the FINAL displayed pick (after every frontend swap: hagerty, price,
  // speed) so any post-result follow-up ("why this one") references the platform
  // the card actually shows, not the backend's pre-swap recommendedPath. Applies
  // to any recommendation whose displayed Card 1 differs from the backend pick.
  sellState.displayedRecommendedPath=routeOptions[0]?.policyKey||routeOptions[0]?.platform||null;
  const twoRouteMode=hasTwoRouteTradeoff(routeOptions);
  const partnerReferral=decision.partnerReferral||{};
  sellState.partnerReferral=partnerReferral;
  const hasNamedPowerSellerAdvice=shouldLeadWithPartner(partnerReferral);
  const powerSellerProfiles=hasNamedPowerSellerAdvice?[partnerProfileFromReferral(partnerReferral)]:[];
  sellState.powerSellerProfiles=powerSellerProfiles;

  // Deepest recent market among the cards, used to ground the cascade's
  // "closed strongest" claim (only the volume leader at the landed scope).
  const maxRoutableEvidence=routesForCards.filter(r=>r.routable!==false)
    .reduce((m,r)=>Math.max(m,Number(r.marketEvidence&&r.marketEvidence.evidenceSales||0)),0);
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
      badge:hasNamedPowerSellerAdvice?(index===0?"If selling yourself":"Also strong here"):(twoRouteMode?(index===0?"Sam's lean":"Also strong here"):(index===0?"Sam's pick":"Also strong here")),
      badgeClass:index===0?"top":"alt",
      cardClass:index===0&&!hasNamedPowerSellerAdvice?"primary-rec":"",
      // The verdict plate follows the pick (locked): when the PowerSeller
      // leads, the plate moves to the dossier and this card renders as the
      // alternative. The DIY ordering re-renders this card with the plate.
      showPlate:index===0&&!hasNamedPowerSellerAdvice,
      actionLabel:index===0?`Submit your car to ${platformLogo({name:routeName}).text}`:`Consider ${routeName}`,
      // 1b: the composer is the ONLY source of card headline + bullets.
      composed:composeCard(sellState.resolvedVehicle,route,{
        isPick:index===0,
        // Volume leadership at the landed scope grounds the cascade's "closed
        // strongest" claim: only the deepest recent market may state it.
        isVolumeLeader:maxRoutableEvidence>0&&Number(route.marketEvidence&&route.marketEvidence.evidenceSales||0)>=maxRoutableEvidence,
        sellerWantsSpeed:sellerWantsSpeed(),
        routingReason:sellState.routingReason,
        landedScope:composerLandedScope(),
        landedGenerationCode:composerLandedGenerationCode()
      }),
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

  // Options (locked, updated): up to two platform cards (pick + one
  // alternative) plus the partner secondary card whenever the $50k+ context
  // holds, gate-closed (suppressed only by a stated DIY preference per
  // rule 10; gate-open renders the dossier choice instead).
  const partnerSecondary=(!hasNamedPowerSellerAdvice&&partnerReferral.secondary&&partnerReferral.partner&&!sellerWantsToManageSelf())
    ?partnerProfileFromReferral(partnerReferral)
    :null;
  if(partnerSecondary){
    sellState.powerSellerProfiles=[partnerSecondary];
    sellState.sellOptions.push({key:"specialist",name:partnerSecondary.displayName,type:"PowerSeller conversation",observedSellers:[partnerSecondary]});
  }

  sellState.sellOptions.forEach((option,index)=>{
    option.rankReason=rankingReason(option,index,sellState.sellOptions);
  });

  // Verdict plate (Design Phase 1): once per result, on the primary card
  // only. Ref code is deterministic per car.
  const verdictRefCode=`SAM-${String(1000+textSeed(sellState.carName||"car")%9000)}-${String(sellState.state||sellState.region||"US").replace(/[^A-Za-z]/g,"").slice(0,2).toUpperCase()||"US"}`;
  // Analysis window row (locked): the specific span the card's rendered
  // claims actually used. "Since YYYY" when any claim is all-time and the
  // earliest boundary is known; never "Historical", never a window no
  // claim used. A segment-scoped bullet 1 prefixes its label so the viewer
  // knows this is competitor-set data, not exact-model data.
  // 1b: the data-window plate is derived from the composed finding's own
  // evidence window (delta first, then weekday), always <=180 days.
  const plateWindowLabel=option=>{
    const ev=option.marketEvidence||{};
    const p=ev.pricePremium;
    const win=p&&Number.isFinite(p.windowDays)?p.windowDays:(ev.dayAdvantage&&ev.dayAdvantage.window)||null;
    if(!win)return null;
    const label=win<=45?"Last 45 days":win<=90?"Last 90 days":"Last 180 days";
    const scope=p&&p.scope==="segment"?p.segmentLabel:(p&&p.scope==="generation"?`${String(p.generationCode||"").toUpperCase()} generation`:null);
    return scope?`${scope} · ${label}`:label;
  };
  const verdictPlate=(option,windowLabel)=>`<div class="verdict-plate">
        <div class="vp-row1"><span class="label-mono">Sam's pick</span><span class="num label-mono">${escapeHtml(verdictRefCode)}</span></div>
        <div class="vp-name">${escapeHtml(option.name)}</div>
        <div class="vp-hairline"></div>
        <div class="vp-vehicle-row"><span class="label-mono">${numify(`${carDisplayLabel("Car")} · ${[sellState.state,sellState.region].filter(Boolean)[0]||"US"}`)}</span>${windowLabel?`<span class="label-mono">${numify(`Data: ${windowLabel}`)}</span>`:""}</div>
      </div>`;
  const renderOptionCard=option=>{
    const isPrimary=!!option.showPlate;
    return `
      <div class="sell-rec-card ${escapeHtml(option.cardClass||"")}" onclick="chooseSellOption('${escapeHtml(option.key)}')">
        ${isPrimary&&option.key!=="specialist"?verdictPlate(option,plateWindowLabel(option)):`
        <div class="sell-rec-card-head">
          <div>
            <div class="sell-rec-badge label-mono ${escapeHtml(option.badgeClass||"alt")}">${escapeHtml(option.badge)}</div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:10px">${tileHTML(option.name,24)}<div><div class="sell-rec-name">${escapeHtml(option.name)}</div><div class="sell-rec-type">${escapeHtml(option.type)}</div></div></div>
          </div>
        </div>`}
        ${(() => {
          // 1b: EVERY line of card text comes from composeCard. Headline is the
          // single most important data finding; bullets support it. Nothing else
          // renders (no reason voice line, momentum, stat, or evidence line).
          const c=option.composed;
          if(!c)return "";
          const label=option.key==="specialist"?"Why I’d call them":(!isPrimary?"Why it’s worth comparing":"Why I picked this");
          const head=c.headline&&c.headline.text?`<div class="sell-rec-samline voice">${numify(c.headline.text)}</div>`:"";
          const list=(c.bullets&&c.bullets.length)?`<ul class="sell-rec-bullets">${c.bullets.map(b=>`<li>${numify(b.text)}</li>`).join("")}</ul>`:"";
          if(!head&&!list)return "";
          return `<div class="sell-rec-reason-label label-mono">${label}</div>${head}${list}`;
        })()}
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
        <div class="sell-rec-actions"><button class="${isPrimary?"primary":"ghost"}" onclick="event.stopPropagation();chooseSellOption('${escapeHtml(option.key)}')">${escapeHtml(option.actionLabel||"Consider this")}</button></div>
      </div>`;
  };

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
  // The verdict plate goes to whichever section leads (locked): handled
  // order crowns the PowerSeller dossier, DIY order crowns the platform card.
  const buildPowerSellerHTML=platformFirst=>featuredPowerSeller?`
    <div class="sell-section-label">Have it handled</div>
    <div class="sell-section-note">${platformFirst
      ?`If you'd rather have it handled: you do pay a fee, but a good PowerSeller takes on everything, prep, photos, listing, buyer questions, paperwork and platform choice, and in most cases the fee earns its keep. ${escapeHtml(featuredPowerSellerName)} is who I'd call. The platform pick above is the place to start if you're running it yourself.`
      :`Honestly? At this level my personal preference is generally a good PowerSeller. You do pay a fee, but a good one handles everything: prep, photos, listing, buyer questions, paperwork and platform choice. In most cases the fee earns its keep. ${escapeHtml(featuredPowerSellerName)} is who I'd call. If you'd rather run it yourself, the platform pick is right below.`}</div>
    ${renderFeaturedPowerSellerProfile(featuredPowerSeller,platformFirst,platformFirst?null:verdictPlate({name:featuredPowerSeller.displayName||featuredPowerSeller.name},"All-time"))}
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
    <div class="sell-rec-grid">${renderOptionCard(primaryPlatform)}${secondaryPlatforms.map(renderOptionCard).join("")}</div>
    ${partnerSecondary?`<div class="sell-section-note" style="margin-top:12px">${escapeHtml(powerSellerIntroLine())}</div>${renderMiniPowerSellerProfile(partnerSecondary,"Also worth considering")}`:""}
    ${diySecondaryLine}
  `):"";
  // DIY ordering: the platform IS the pick, so its card carries the plate.
  const platformCardsPlatedHTML=(primaryPlatform&&powerSellerHTML)?`
    <div class="sell-section-label" style="margin-top:12px">Run it yourself</div>
    <div class="sell-rec-grid">${renderOptionCard({...primaryPlatform,showPlate:true,cardClass:"primary-rec"})}</div>
  `:platformCardsHTML;

  // Price-gap paragraphs are deleted (locked): variant spread within a model
  // year makes a single average false precision, and comparing the seller's
  // ask to it reads as doubt. Nothing renders about the ask vs comps.

  // 1b: the header carries only the factual car label. The finding lives in the
  // pick card's composed headline; the old templated title/subtitle are deleted.
  const headerHTML=`<div class="sell-rec-header">
      <div class="sell-rec-kicker">Seller Intelligence</div>
      <div class="sell-rec-title">${escapeHtml(carDisplayLabel("your car"))}</div>
    </div>`;
  const caveatText=unverifiedModelNote()||adverseConditionCaveat();
  const caveatHTML=caveatText?`<div class="sell-section-note" style="margin-top:10px">${escapeHtml(caveatText)}</div>`:"";
  // Recommendation closes are declarative (locked): a period, never a
  // question, never an escape hatch.
  const afterText=powerSellerHTML?"Both are real options and the choice is yours. Pick one, or ask me to compare the tradeoffs.":(secondaryPlatforms.length?"Pick either, or ask me to compare the tradeoffs.":"Ask me anything about the pick, or how I'd run the listing.");
  sellState.generatedPrimaryName=sellState.sellOptions[0]?.name||null;
  sellState.generatedSecondaryName=sellState.sellOptions[1]?.name||null;

  if(powerSellerHTML&&isUSRegion(sellState.region)){
    // Gate-open, US sellers only: one light choice orders the sections
    // before anything renders. Non-US goes straight to the platform result.
    sellState.pendingResultSections={headerHTML,powerSellerHTML,powerSellerSecondHTML,platformCardsHTML,platformCardsPlatedHTML,caveatHTML,afterText};
    sellState.awaitingPathChoice=true;
    sellState.step=12;
    const row=document.createElement("div");row.className="row sam";
    row.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div>${headerHTML}<div class="sam-text">Want it handled, or run it yourself?</div>${chipsHTML(["Have it handled","I'll run it myself","Not sure"])}</div></div>`;
    msgs.appendChild(row);
    row.scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }

  const orderedSections=`${powerSellerHTML}${platformCardsHTML}`;
  // Store the rendered result so an explicit "show the cards again" can re-append
  // it without re-running the analysis (Phase 1c).
  sellState.lastResultHTML=`${headerHTML}${orderedSections}${caveatHTML}`;
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    ${headerHTML}
    ${orderedSections}
    ${caveatHTML}
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
  const sections=platformFirst?`${parts.platformCardsPlatedHTML}${parts.powerSellerSecondHTML}`:`${parts.powerSellerHTML}${parts.platformCardsHTML}`;
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div>${sections}${parts.caveatHTML}<div class="sam-text after-results">${parts.afterText}</div></div></div>`;
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

  // Pending re-run confirmation (Defect 2): the seller gave a corrected/new
  // model and we offered to re-run. Yes commits the re-run (carrying every other
  // wizard answer); no keeps the current analysis.
  if(sellState.pendingRerun){
    if(detectIntent(lower)==="affirmation"||/^(yes|yep|yeah|re-?run|do it|go ahead|sure|please|ok)\b/i.test(lower.trim())||/re-?run as|yes,? re-?run/i.test(lower)){
      commitReRun();
      return true;
    }
    if(detectIntent(lower)==="negation"||/^(no|keep|nevermind|never mind|cancel|leave it)\b/i.test(lower.trim())){
      sellState.pendingRerun=null;
      addMsg("sam","Kept the current analysis. Ask me anything about it.");
      return true;
    }
    // anything else falls through (question -> chat)
  }
  // After a bare "change car", the next message is the replacement designation
  // (even a bare model number) -> route it to the re-run offer.
  if(sellState.awaitingReplacementCar&&!isQuestionInput(q)){
    sellState.awaitingReplacementCar=false;
    offerReRun(q);
    return true;
  }

  // Phase 1c: after results, ALL free text goes to /api/chat with full context.
  // ONLY explicit control intents act on the UI, and NEVER a substring inside a
  // genuine question ("so if the powerseller wants..." is a question -> chat).
  // The old keyword ladder (compare/why/powerseller/go-with substring matches)
  // is deleted; the chat layer answers those with the evidence in context.
  if(isQuestionInput(q))return false;

  // Re-run / change-car with a new model (Defect 2): an explicit request to run a
  // different car, or a corrected/new designation, offers a one-tap re-run rather
  // than being refused. Never tell the seller to finish a car they said is wrong.
  const reRunReq=/\b(run (a |the )?(new|different|another) car|re-?run|new model|different model|analy[sz]e (a )?different|change (it |the car )?to|actually (it'?s|its|the model|the car))\b/i.test(lower);
  // A bare model designation (3-4 digits plus a letter, e.g. 859h, 850i, 351rg)
  // post-result is a corrected car. "30k"/"m3" are excluded by the digit count.
  const hasDesignation=/\b\d{3,4}[a-z]{1,3}\b|\b[a-z]{1,3}\d{3,4}\b/i.test(q);
  if(reRunReq||hasDesignation||(looksLikeVehicleText(q)&&!/^(go with|show|see|choose|pick|use|select)\b/i.test(lower))){
    offerReRun(q);
    return true;
  }

  // Start over / sell another.
  if(/^(start over|start again|restart|new search|sell another( car)?)\b/i.test(lower)){
    startSellFlow();
    return true;
  }
  // Change car with no model named yet: ask for it, then the next message
  // (even a bare designation) routes to the re-run offer (Defect 2).
  if(/\bchange (the )?(car|vehicle)\b|^(different|wrong) car$|^different vehicle$/i.test(lower)){
    sellState.awaitingReplacementCar=true;
    addMsg("sam","Sure. What's the car instead? Give me the year, make and model and I'll re-run with everything else you've told me.");
    return true;
  }
  // Show the recommendation / a card again (explicit request only).
  if(/^(show|see|bring back|pull up|display)( me)?( the| my)?( cards?| options?| recommendation| powerseller| power seller| result| pick| it)?( again)?$/i.test(lower)||/\bshow .*\bagain\b/i.test(lower)){
    if(sellState.lastResultHTML){
      const msgs=document.getElementById("msgs");const row=document.createElement("div");row.className="row sam";
      row.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div>${sellState.lastResultHTML}</div></div>`;
      msgs.appendChild(row);row.scrollIntoView({behavior:"smooth",block:"start"});
    }else{
      addMsg("sam","The recommendation is just above. Ask me anything about it.");
    }
    return true;
  }
  // Explicit choice command ("go with X", "I'll use X").
  if(/^(go with|choose|pick|use|select|i'?ll (go with|take|use|choose)|let'?s (go with|use)|going with)\b/i.test(lower)){
    const opt=findSellOptionByText(q)||options.find(o=>o.key==="primary")||options[0];
    chooseSellOption(opt.key);
    return true;
  }
  // Explicit DIY statement (not a question): honor it, no card render.
  if(/^(i'?ll (run|manage|handle) it|run it myself|i'?ll do it myself|i'?d rather (run|do|manage) it)\b/i.test(lower)){
    sellState.involvement="I'll manage it myself";
    addMsg("sam","Noted, you're running it yourself. The platform pick above is the plan.");
    return true;
  }

  // Everything else -> chat.
  return false;
}

// Re-run offer (Defect 2): resolve a corrected/new designation through the one
// resolver WITHOUT mutating the current result, then offer a one-tap re-run. The
// verdict is honored: a near-miss surfaces the did-you-mean as the target, an
// unverified designation is flagged as a make-level re-run, a no-match asks again.
async function offerReRun(rawText){
  const cleaned=String(rawText||"")
    .replace(/^.*?\b(actually|it'?s|its|the model is|the car is|really a|change (it |the car )?to a?|run (a |the )?(new|different|another) car( as| based on| with)?|new model( is)?|re-?run (as|with|it as)?|analy[sz]e (a )?different( car)?( as)?)\b[:,]?\s*/i,"")
    .trim()||String(rawText||"").trim();
  if(!cleaned||!looksLikeVehicleText(cleaned)&&!/\b[a-z]*\d/i.test(cleaned)){
    addMsg("sam","Sure, I can re-run for a different car. Give me the year, make and model and I'll keep your other answers.");
    return;
  }
  try{
    const res=await fetch(apiPath("/api/vehicleIdentity"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:cleaned})});
    const data=await res.json();
    if(res.ok&&data.status==="needs_confirmation"&&data.clarification?.suggestion){
      const sug=data.clarification.suggestion;
      sellState.pendingRerun={rawText:sug};
      addMsg("sam",`I don't have that exact model on record. Did you mean ${sug}? Want me to re-run the analysis as ${sug}?`,"",chipsHTML([`Yes, re-run as ${sug}`,"No, keep current"]));
      return;
    }
    if(res.ok&&data.status==="valid"&&data.vehicle?.canonicalLabel){
      const label=data.vehicle.canonicalLabel;
      sellState.pendingRerun={vehicle:data.vehicle};
      const tag=data.vehicle.unverified?` I can't verify that model, so it would be a make-level read, but I'll run it.`:"";
      addMsg("sam",`Want me to re-run the analysis as ${label}?${tag}`,"",chipsHTML([`Yes, re-run as ${label}`,"No, keep current"]));
      return;
    }
    addMsg("sam","I couldn't read that as a car. Tell me the year, make and model and I'll re-run.");
  }catch(e){
    addMsg("sam","I had trouble reading that model just now. Give me the year, make and model and I'll re-run.");
  }
}
// Commit the offered re-run: only the vehicle changes; every other wizard answer
// (location, mileage, condition, records, title, price, timeline) carries over.
function commitReRun(){
  const p=sellState.pendingRerun;
  if(!p){return;}
  sellState.pendingRerun=null;
  if(p.vehicle){
    sellState.resolvedVehicle=p.vehicle;
    sellState.carName=p.vehicle.canonicalLabel;
    sellState.carRaw=p.vehicle.canonicalLabel;
    sellState.vehicleIdentityValidated=!p.vehicle.unverified;
  }else if(p.rawText){
    sellState.carName=p.rawText;sellState.carRaw=p.rawText;
    sellState.resolvedVehicle=null;sellState.vehicleIdentityValidated=false;
  }
  // Fresh result state for the new car; the wizard answers are untouched.
  sellState.sellOptions=[];sellState.allRouteOptions=[];sellState.sellDecision=null;
  sellState.awaitingPathChoice=false;sellState.pendingResultSections=null;sellState.displayedRecommendedPath=null;
  addMsg("sam",`Re-running as ${carDisplayLabel()}, carrying over your location, mileage, condition, price and timeline.`);
  showSellRecommendation();
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

