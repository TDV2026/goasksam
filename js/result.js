// A question typed while the result is loading is held until the result has rendered and its facts are in
// the chat context, then sent (js/entry.js holdSellQuestion). The model never gets a question about this car
// without the sales behind it.
async function showSellRecommendation(opts){
  sellState.resultPending=true;
  try{ return await showSellRecommendationRun(opts); }
  finally{ sellState.resultPending=false; if(typeof flushHeldSellQuestion==="function")flushHeldSellQuestion(); }
}
async function showSellRecommendationRun(opts){
  // rerun: a same-session re-run after a scoped Location/Price/Preference edit -
  // it must not consume a new search credit (item 3).
  var sellRerun=!!(opts&&opts.rerun);
  // Walled guard: once a hard wall is up, a walled user continuing an active wizard must
  // not re-execute a (backend-blocked) search. Re-acknowledge calmly instead. The FIRST
  // attempt that SETS the wall runs normally (gasIsWalled is still false then); scoped
  // re-runs are exempt (credit-free re-display).
  if(!sellRerun && typeof gasIsWalled==="function" && gasIsWalled()){
    if(typeof gateWalledReack==="function")gateWalledReack(gasIsWalled());
    const _b=document.getElementById("btn"); if(_b)_b.disabled=false;
    return;
  }
  // No results-stage vehicle re-ask (locked A1): once the summary is confirmed
  // we go straight to the analysis at whatever level we know. A year-less
  // vehicle runs at model level (acceptModelLevel below) and is labeled as
  // such in the result. We never re-ask the year here and never reset to a
  // fresh vehicle entry, so stray text after this point can never re-parse as
  // a new car.
  sellState.step=12;
  if(typeof gasFunnel==="function")gasFunnel("wizard_complete");  // 2F: the wizard finished, analysis starting
  if(typeof gasJourneyEventOnce==="function")gasJourneyEventOnce("seller_questions_completed",{vehicle:sellState.resolvedVehicle});  // business journey
  hideHero();
  const msgs=document.getElementById("msgs");
  // Parsed-summary strip at the top of the analysis screen (replaces the old
  // confirm card). Reads car / location / price / preference, dot-separated.
  (function renderSummaryStrip(){
    if(document.getElementById("sellSummaryStrip"))return;
    const car=sellState.carName?(typeof carDisplayLabel==="function"?carDisplayLabel():sellState.carName):"your car";
    const loc=sellState.state||sellState.region||"your area";
    const price=(typeof formatAskingPrice==="function")?formatAskingPrice(sellState.price):(sellState.price||"price to set");
    const prefLabel=sellState.sellerPreference==="powerseller"?"open to a PowerSeller"
      :sellState.sellerPreference==="auction_house"?"taking it through an auction house"
      :sellState.sellerPreference==="diy"?"selling it myself"
      :"deciding how to sell";
    const parts=[car,loc,price,prefLabel].map(p=>escapeHtml(String(p)));
    const strip=document.createElement("div");
    strip.className="row sam";strip.id="sellSummaryStrip";
    strip.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sell-summary-strip">${parts.join(' <span class="ss-dot" aria-hidden="true">&middot;</span> ')} <button class="ss-edit" onclick="openScopedEdit()">Edit</button></div></div></div>`;
    msgs.appendChild(strip);
  })();
  // REPLACE, never append, on a rerun (transmission refine or scoped edit): drop
  // everything the previous render left below the summary strip before the new
  // analysis draws, so a re-run swaps the result in place instead of stacking a
  // second copy (the auction-house bridge + pick + PowerSeller used to reprint in
  // full on every transmission chip tap). The strip and the conversation above it
  // stay. Shared across every seller-preference branch, so no branch can regress.
  if(sellRerun){
    const strip=document.getElementById("sellSummaryStrip");
    if(strip&&strip.parentNode){ while(strip.nextSibling)strip.parentNode.removeChild(strip.nextSibling); }
  }
  // Analysis screen (Thesis v1): staged lines that mirror the real pipeline
  // (fetch comps -> compare platforms -> check specialists -> write rec). Each
  // ticks over briskly; the REVEAL is gated on the real response, so a cache-warm
  // result flashes through and a data_unavailable response never lets the final
  // "Writing the recommendation" stage complete.
  const thinkRow=document.createElement("div");thinkRow.className="row sam";thinkRow.id="sellThinking";
  const stages=[
    "Finding comparable sales",
    "Comparing auction platform performance",
    "Checking for specialist representation",
    "Writing the recommendation"
  ];
  thinkRow.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div>
    <div class="analysis-stages" id="analysisStages" role="status" aria-live="polite">
      <div class="analysis-stages-title">Analyzing the market for your ${escapeHtml(sellState.carName||"car")}</div>
      ${stages.map((s,i)=>`<div class="analysis-stage${i===0?" active":""}" data-i="${i}"><span class="stage-dot" aria-hidden="true"></span><span class="stage-text">${escapeHtml(s)}</span></div>`).join("")}
    </div>
  </div></div>`;
  msgs.appendChild(thinkRow);msgs.scrollTop=msgs.scrollHeight;
  let stageIdx=0;
  const advanceStage=()=>{
    const el=document.getElementById("analysisStages");if(!el)return;
    const cur=el.querySelector(`.analysis-stage[data-i="${stageIdx}"]`);if(cur){cur.classList.remove("active");cur.classList.add("done");}
    if(stageIdx<stages.length-1){stageIdx++;const nxt=el.querySelector(`.analysis-stage[data-i="${stageIdx}"]`);if(nxt)nxt.classList.add("active");}
  };
  const stageTimer=setInterval(()=>{ if(stageIdx<stages.length-1)advanceStage(); },720);

  let decisionData=null;
  try{
    const res=await fetch(apiPath("/api/sellerDecision"),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        car:{
          // Send the ORIGINAL typed text (carRaw, with any model codes) when a detail was skipped, so a
          // make-level "not sure" still carries the body-class signal (D50/D350 -> truck) for the
          // class-era read; otherwise the display name.
          raw:(sellState.vehicleDetailSkipped&&sellState.carRaw)?sellState.carRaw:sellState.carName,
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
          sellerPreference:sellState.sellerPreference,
          notes:sellState.notes,
          // Defect 5: an active transmission refinement re-slices the same paid
          // pool (rerun-class, no new credit). Absent on the first search.
          refine:(sellState.txRefine==="manual"||sellState.txRefine==="auto")?{tx:sellState.txRefine}:undefined
        },
        anonSessionId:(typeof gasAnonId==="function"?gasAnonId():null),
        journeyId:(typeof gasJourneyId==="function"?gasJourneyId(sellState.resolvedVehicle):null),
        forceGate:(typeof gasRealGate==="function"&&gasRealGate()),
        rerun:sellRerun
      })
    });
    decisionData=await res.json();
  }catch(e){
    decisionData={status:"error",error:e.message};
  }
  clearInterval(stageTimer);

  const tr=document.getElementById("sellThinking");if(tr)tr.remove();

  if(decisionData?.status==="needs_clarification"){
    // Post-summary we NEVER re-ask the year and NEVER reset to a fresh vehicle
    // entry (A1/A3): a reset let stray text ("move on") re-parse as a new car.
    // If the seller already accepted a model-level read, proceeding is the
    // backend's job (acceptModelLevel); a clarification landing here is a rare
    // backend gap, so we stay on the confirmed summary and say so honestly
    // instead of looping. Otherwise (trim gap, pre-analysis) ask only the trim.
    if(sellState.vehicleDetailSkipped){
      // Funnel complete and the seller accepted a model-level read, but the
      // backend cannot resolve even a model (make-only or unrecognized model,
      // e.g. a 1925 Duesenberg). This used to emit a bare line claiming a
      // recommendation that never rendered - a silent dead-end. Rule 8: render
      // the honest fallback CARD instead (policy-fit direction, labeled as fit).
      const fallback=genericNoEvidenceFallback();
      sellState.noEvidenceFallback=fallback;
      showRegionalFallbackRecommendation(msgs,fallback);
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

  // Data unavailable (starved fetch): the data pull failed (rate limit or budget),
  // so we never render market-thinness copy or a rarity pick. Honest hold.
  if(decisionData?.status==="data_unavailable"){
    addMsg("sam","I couldn't pull the full picture for your car right now. This is on my end, not a shortage of sales. Give it a moment and try again.");
    document.getElementById("btn").disabled=false;
    return;
  }

  // 2C: the account gate + limit statuses. Byte-identical for a normal decision;
  // these branches only fire for the new gate responses, rendered by auth.js.
  if(decisionData&&/^(account_required|limit_reached|daily_limit_reached|tester_daily_limit_reached|guest_limit_reached|ip_rate_limited|auth_required|capacity)$/.test(decisionData.status||"")){
    if(typeof gateRenderStatus==="function")gateRenderStatus(decisionData);
    const b=document.getElementById("btn");if(b)b.disabled=false;
    return;
  }

  sellState.sellDecision=decisionData;
  // Apply the authoritative post-reserve daily count (Part 1): every signed-in search
  // returns the true remaining from the same reserve_search transaction, so the client
  // ledger stays exact and the NEXT search's upfront gate walls deterministically at
  // 0 remaining, even if a later /api/account refetch fails (mobile).
  if(decisionData.daily&&typeof authApplyDaily==="function")authApplyDaily(decisionData.daily);
  // 2C: a signed-out result is stashed so signing in attaches it to the account (11a). Open search: there is
  // no "first one" line under it any more.
  if(decisionData.resultId&&typeof gasStashResultId==="function")gasStashResultId(decisionData.resultId,!!(decisionData.anonResult||decisionData.firstFree));
  renderDecision(decisionData,{});
}

// Pure render of a decision payload into #msgs: no fetch, no gate, no funnel. Used by
// the live search (showSellRecommendation, above) AND by re-opening a saved result
// (renderOpts.reopened suppresses the one-time impression events). The caller sets
// sellState.sellerPreference / resolvedVehicle / carName / region / state beforehand;
// everything else the card needs comes from decisionData.
function renderDecision(decisionData,renderOpts){
  renderOpts=renderOpts||{};
  sellState.sellDecision=decisionData;
  sellState.renderedHouseComparison=null;   // reset; set only if a house comparison actually renders
  sellState.renderedClassEra=null;          // reset; set only if the class-era read renders
  const msgs=document.getElementById("msgs");
  if(!msgs)return;
  const decision=decisionData.decision||{};
  // Honest country routing (phase 1): a non-US country we cannot route yet NEVER
  // silently defaults to US platforms. Show the honest line instead of a US pick.
  if(typeof isInternationalSellerRegion==="function"&&isInternationalSellerRegion()
     &&typeof isRoutableInternationalRegion==="function"&&!isRoutableInternationalRegion()){
    showHonestNoRouting(msgs);
    document.getElementById("btn").disabled=false;
    return;
  }
  // THIN MODE + HOUSE STEER (Sep 2026): a car whose online market is too thin for a volume band
  // renders the sale-anchored thin read here, BEFORE the no-evidence fallback (a thin car often
  // has no routable comps and would otherwise dead-end on the generic policy card). US-only for
  // now; international thin cars keep their regional cards below.
  if(decision.thin&&decision.thin.isThin&&Array.isArray(decision.thin.receipts)&&decision.thin.receipts.length
     &&!(typeof isInternationalSellerRegion==="function"&&isInternationalSellerRegion())){
    // HOUSE-BY-HOUSE COMPARISON (Sep 2026): the house-tier result IS the ranked house record when a
    // house leads (house steer, not rushed) or the seller explicitly chose the auction-house door.
    // The door skips the online alternative; a normal house-tier read keeps it below for a DIY seller.
    // ASAP never lets a house auto-lead (the existing thin render cites the house, picks online), but
    // an EXPLICIT auction-house choice is honoured and reorders to the soonest sale.
    const hc=decision.thin.houseComparison;
    const choseHouse=sellState.sellerPreference==="auction_house";
    const rush=(typeof sellerWantsSpeed==="function")&&sellerWantsSpeed();
    // Self-sell (DIY) intent is honored (item 3): a seller who said "I'll sell it myself" is NOT led
    // into a consignment calendar just because the car house-steers. Only an EXPLICIT auction-house
    // choice auto-leads with houses; a DIY seller falls through to the online/self-sell render below.
    const diy=sellState.sellerPreference==="diy";
    if(hc&&hc.houses&&hc.houses.length&&(choseHouse||(decision.thin.houseSteer&&!rush&&!diy))){
      let onlineCardHtml="";
      if(!choseHouse){
        const op=(typeof _thinVenuePick==="function")&&_thinVenuePick(decision.thin.receipts.filter(r=>Number(r.hammer)>0),false);
        if(op){const v=sellState.resolvedVehicle||decisionData.vehicle||{};onlineCardHtml=_thinPickCardHtml({kind:"online",pick:op.pick,others:op.others,receipts:decision.thin.receipts.filter(r=>Number(r.hammer)>0),make:v.make||"",modelLabel:[v.model,v.trim].filter(Boolean).join(" ")||v.make||"",carLbl:[v.year,v.make,v.model].filter(Boolean).join(" "),loc:[sellState.state,sellState.region].filter(Boolean)[0]||"US",typedYear:v.year,isLead:false});}
      }
      if(renderHouseComparisonSell(msgs,hc,decisionData,{onlineCardHtml,noOnline:Number(decision.thin.onlineReceiptsN)===0})){
        document.getElementById("btn").disabled=false;
        return;
      }
    }
    if(renderThinDecisionSell(msgs,decision.thin,decisionData)){
      document.getElementById("btn").disabled=false;
      return;
    }
  }
  // CLASS-ERA rung: the exact model has not sold in three years. A coarse, honestly-labelled
  // fallback (same-marque era band), rendered before the no-evidence dead-end. US-only for now.
  if(decision.classEra&&decision.classEra.isClass&&Array.isArray(decision.classEra.receipts)&&decision.classEra.receipts.length
     &&!(typeof isInternationalSellerRegion==="function"&&isInternationalSellerRegion())){
    // A very-thin, house-dominated era band (a pre-war Bentley) shows the ranked house record over the
    // era band, framed as the wider market (never a price for the exact car). Falls back to the plain
    // class-era card when no houses are in the band.
    // Self-sell (DIY): a DIY seller gets the wider-market read (renderClassEraSell), not the ranked
    // consignment calendar - unless they explicitly chose the auction-house door (item 3).
    const hce=decision.classEra.houseComparison;
    const eraDiy=sellState.sellerPreference==="diy"&&sellState.sellerPreference!=="auction_house";
    if(hce&&hce.houses&&hce.houses.length&&!eraDiy&&renderHouseComparisonSell(msgs,hce,decisionData,{eraBand:true})){
      document.getElementById("btn").disabled=false;
      return;
    }
    if(renderClassEraSell(msgs,decision.classEra,decisionData)){
      document.getElementById("btn").disabled=false;
      return;
    }
  }
  // DENSE-CAR HOUSE COMPARISON (Item A, Oct 2026): the seller chose the auction-house door for a car
  // dense enough to reach the normal pick, AND the model genuinely sells at the houses (the 550
  // Maranello: 30 in 36 months). Show the car's OWN ranked house record, not the "trade mostly online"
  // bridge. noOnline drives the "no online sales, here are the houses" honest lead.
  if(decision.houseComparison&&decision.houseComparison.houses&&decision.houseComparison.houses.length
     &&sellState.sellerPreference==="auction_house"
     &&!(typeof isInternationalSellerRegion==="function"&&isInternationalSellerRegion())){
    if(renderHouseComparisonSell(msgs,decision.houseComparison,decisionData,{denseCar:true,noOnline:!!decision.houseComparison.noOnline,onlineN:decision.houseComparison.onlineN})){
      document.getElementById("btn").disabled=false;
      return;
    }
  }
  const practicalFallback=regionalNoEvidenceFallback();
  const routeFit=decision.routeFit||{};
  const allRouteOptions=routeFit.routes||[];
  sellState.allRouteOptions=allRouteOptions;
  const evidenceBackedRoutes=allRouteOptions
    .filter(routeHasTrueComparableEvidence)
    .filter(route=>route.routable!==false)
    .filter(route=>!shouldSuppressRouteForSellerRegion(route));
  // ZERO comparable sales (rule 8: never dead-end). A completed funnel with no
  // evidence-backed route ALWAYS renders an honest fallback card - every region,
  // US included. Bespoke regional cards win where they exist (UK/Europe/AU/ME);
  // everything else gets the generic policy-fit card, labeled as fit not data.
  // Without this a US zero-archive car (1925 Duesenberg) fell through to an
  // evidence-less pick that rendered nothing at all.
  if(!evidenceBackedRoutes.length){
    const fallback=practicalFallback||genericNoEvidenceFallback();
    sellState.noEvidenceFallback=fallback;
    showRegionalFallbackRecommendation(msgs,fallback);
    document.getElementById("btn").disabled=false;
    return;
  }
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
  // (Removed the platform-specific 1960s-Corvette speed hack: the ranking ladder
  // below re-derives the faster-to-list platform from data agnostically, so no
  // platform may be named in ranking logic.)
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

  // Auction-house door bridge (Sep 2026): the seller chose "go through an auction house", but we
  // reached the normal platform pick, which means NO house comparison existed for this car (dense
  // online evidence, normal tier - a Turbo S / Z06 / GT3). Acknowledge what they asked for in one
  // honest sentence before the platform card, rather than silently ignoring the choice.
  if(sellState.sellerPreference==="auction_house"){
    // Honest house answer when no house has sold this car (item 1): say so plainly, then route online.
    var _hcCar=(sellState.resolvedVehicle&&[sellState.resolvedVehicle.make,sellState.resolvedVehicle.model].filter(Boolean).join(" "))||"this car";
    addMsg("sam",`No auction house has a recent sale of a ${_hcCar} on record, so I can't point you to one honestly. These trade online, so here's where I'd sell it instead.`);
  }
  // RANKING-LADDER-START (platform-agnostic: no platform name may appear in the
  // ranking region below; every crown is re-derived from data or read via
  // platformDisplayName. Enforced by scripts/agnosticismGuard.mjs.)
  // Routing hierarchy (locked, strict order): PRICE FIRST, then speed.
  // 1. A verified 10%+ price premium picks the platform, period; speed may
  //    never override it. "Verified" means the 5+/5+ sampled proof object.
  // 2. Speed routes only when no verified 10%+ premium protects the pick:
  //    fast timeline + curated-fast alternative with real evidence.
  // Runs ONCE, before the opener and any card.
  // ONE PICK (Oct 2026, GT-R): the page never re-derives the pick. decide() in api/sellerDecision.js
  // (pickRecommendedRoute, with the shared tie-break lib/platformPick.js depthWins) names the pick and why;
  // the page shows that route first, in the server's own order otherwise.
  sellState.routingReason=decision.routingReason||null;
  // No redundant chat opener (locked): the card is self-contained, and its
  // own transparency line carries the scope/window story. The old opener
  // duplicated the plate window and the lookback line.
  if(decision.strongerNonRoutable){
    const slug=String(decision.strongerNonRoutable.platform||"").toLowerCase();
    const houseName=platformDisplayName(slug);
    // PRICE FACTS ONLY (July 2026): the pre-note may name the source and report
    // its price signal, but makes NO claim about how the business operates. The
    // old "consignment auction house you can't list on yourself" sentence was a
    // hardcoded assertion that fired for any non-pick source and was false for
    // some of them; it is gone. If the named source is self-listable (has a
    // submission URL), we end with the door: honest signal plus a way in.
    // Item 3 (Oct 2026): one quiet observational sentence, no "our records", no "isn't the pick here"
    // editorialising, no "Send my details" button. strongerNonRoutable is the house with the HIGHEST
    // recent median of any house, so state that result-strength (never a "sold more" count claim the
    // median signal does not support, rule 1).
    const _v=sellState.resolvedVehicle||decisionData.vehicle||{};
    const _modelLbl=_v.model?String(_v.model):(_v.make||"these cars");
    addMsg("sam",`${houseName} has had the strongest recent ${_modelLbl} results of any auction house.`);
  }

  // Data pick (1b): the platform with the highest CLEARED positive comparative
  // delta (symmetric, >=10%, 5+/5+) leads Card 1 -- the data wins the card, never
  // an assumption. (Speed no longer re-ranks here; v2Composition applies the speed
  // pick on top of this price/evidence order.)
  // THE RANKING LADDER (platform-agnostic; every crown re-derived from data).
  // PRICE/EVIDENCE ONLY - speed re-ranks were deleted Aug 2026 (v2Composition owns
  // speed). Priority for Card 1, top to bottom:
  //  1 MODE A (spread>=10%): price winner leads, always.
  //  2 UNKNOWN spread: specialist crown leads if a platform OTHER than the depth
  //    leader holds a specialization cell (lift >= 3x AND 5+ scope comps).
  //  3 otherwise: deepest recent market leads.
  const routesForCards=(()=>{
    const key=x=>String(x||"").toLowerCase().replace(/[^a-z0-9]/g,"");
    const rp=key(decision.recommendedPath);
    const pick=rp?routeOptions.find(r=>r.routable!==false&&(key(r.platform)===rp||key(r.label)===rp||key(r.policyKey)===rp)):null;
    return pick&&routeOptions[0]!==pick?[pick,...routeOptions.filter(r=>r!==pick)]:routeOptions;
  })();
  // Pin the FINAL displayed pick (after every frontend swap: hagerty, price,
  // speed) so any post-result follow-up ("why this one") references the platform
  // the card actually shows, not the backend's pre-swap recommendedPath. Applies
  // to any recommendation whose displayed Card 1 differs from the backend pick.
  sellState.displayedRecommendedPath=routesForCards[0]?.policyKey||routesForCards[0]?.platform||routeOptions[0]?.policyKey||routeOptions[0]?.platform||null;
  const twoRouteMode=hasTwoRouteTradeoff(routeOptions);
  const partnerReferral=decision.partnerReferral||{};
  sellState.partnerReferral=partnerReferral;
  // The partner block is BUILT whenever the gate genuinely passes (value,
  // segment, region, active partner - all decided server-side). Where it sits,
  // and whether it LEADS, is decided by the seller's step-8 preference, never a
  // post-result re-ask. The pick badge follows the data in every case except
  // sellerPreference="powerseller", where the howS-forward composition leads.
  const partnerGatePasses=!!(partnerReferral.eligible&&partnerReferral.partner);
  const leadWithPartner=partnerGatePasses&&sellState.sellerPreference==="powerseller";
  const powerSellerProfiles=partnerGatePasses?[partnerProfileFromReferral(partnerReferral)]:[];
  sellState.powerSellerProfiles=powerSellerProfiles;

  // Deepest recent market among the cards, used to ground the cascade's
  // "closed strongest" claim (only the volume leader at the landed scope).
  const maxRoutableEvidence=routesForCards.filter(r=>r.routable!==false)
    .reduce((m,r)=>Math.max(m,Number(r.marketEvidence&&r.marketEvidence.evidenceSales||0)),0);
  // RANKING-LADDER-END
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
      platformSlug:route.platform,
      // 3.6: the alt card carried three near-identical labels ("Also strong
      // here" badge + "Worth comparing" type + "Why it's worth comparing"
      // header). The badge is the single positioning label now; this subtitle is
      // dropped for the alt so it does not render "Worth comparing" a second time.
      type:index===0?"Platform I’d use":"",
      // The "If selling yourself" demotion is gone. The pick badge belongs to
      // the evidence platform unless the PowerSeller leads (powerseller pref),
      // where the platform reads as the neutral self-run option, not the pick.
      badge:leadWithPartner?(index===0?"Platform I’d use":"Also strong here"):(twoRouteMode?(index===0?"Sam's lean":"Also strong here"):(index===0?"Sam's pick":"Also strong here")),
      badgeClass:index===0?"top":"alt",
      cardClass:index===0&&!leadWithPartner?"primary-rec":"",
      // The verdict plate follows the pick (locked): only when the PowerSeller
      // leads does the platform card drop its plate; in diy/unsure the platform
      // IS the pick and carries it.
      showPlate:index===0&&!leadWithPartner,
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
  // Ford GT round: the weekday bullet renders on at most ONE card per result.
  if(typeof dedupeWeekdayAcrossCards==="function")dedupeWeekdayAcrossCards(routeSellOptions);

  const powerSellerOption=leadWithPartner?{
      key:"specialist",
      name:"People I’d call first",
      type:"PowerSeller conversation",
      badge:"Worth speaking to",
      badgeClass:"specialist",
      cardClass:"specialist-rec primary-rec",
      actionLabel:"Speak to PowerSeller",
      reason:powerSellerAdviceReason(leadWithPartner),
      evidenceBullets:powerSellerAdviceBullets(leadWithPartner),
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
  // auction_house is treated like diy here (see result-v2.js psRendered): the bridge
  // redirects them to a platform, so no uninvited "also worth considering" partner.
  const partnerSecondary=(!partnerGatePasses&&partnerReferral.secondary&&partnerReferral.partner&&!sellerWantsToManageSelf()&&sellState.sellerPreference!=="auction_house")
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
    const scope=p&&p.scope==="segment"?p.segmentLabel:(p&&p.scope==="generation"?`${typeof v2GenWord==="function"?v2GenWord(p.generationCode||""):String(p.generationCode||"").toUpperCase()} generation`:null);
    return scope?`${scope} · ${label}`:label;
  };
  const verdictPlate=(option,windowLabel)=>`<div class="verdict-plate">
        <div class="vp-row1"><span class="label-mono">Sam's pick</span><span class="num label-mono">${escapeHtml(verdictRefCode)}</span></div>
        <div class="vp-name">${escapeHtml(option.name)}</div>
        <div class="vp-hairline"></div>
        <div class="vp-vehicle-row"><span class="label-mono">${numify(`${carDisplayLabel("Car")} · ${[sellState.state,sellState.region].filter(Boolean)[0]||"US"}`)}</span>${windowLabel?`<span class="label-mono">${numify(`Data: ${windowLabel}`)}</span>`:""}</div>
      </div>`;
  // Track-record chrome for the PowerSeller dossier: visually distinct from the
  // market Data plate (it is a career record, rule 14, NOT a 180-day market
  // window). No "Sam's pick", no "Data: ..." market row: it reads "{Name}'s
  // track record" and never borrows the market plate's meaning.
  const trackRecordPlate=profile=>`<div class="verdict-plate track-record">
        <div class="vp-row1"><span class="label-mono">${escapeHtml(powerSellerFirstName(profile))}'s track record</span><span class="num label-mono">${escapeHtml(verdictRefCode)}</span></div>
        <div class="vp-name">${escapeHtml(profile.displayName||profile.name)}</div>
        <div class="vp-hairline"></div>
        <div class="vp-vehicle-row"><span class="label-mono">Auction consignor · career to date</span></div>
      </div>`;
  const renderOptionCard=option=>{
    const isPrimary=!!option.showPlate;
    // Card redesign (flag-gated): the redesigned Platform pick card renders only
    // for the primary platform pick when gas_cardv2 is on. Old render untouched.
    if(isPrimary&&option.key!=="specialist"&&typeof cardV2Active==="function"&&cardV2Active()&&typeof renderPickCardV2==="function"){
      const v2=renderPickCardV2(option);
      if(v2)return v2;
    }
    return `
      <div class="sell-rec-card ${escapeHtml(option.cardClass||"")}" onclick="chooseSellOption('${escapeHtml(option.key)}')">
        ${isPrimary&&option.key!=="specialist"?verdictPlate(option,plateWindowLabel(option)):`
        <div class="sell-rec-card-head">
          <div>
            <div class="sell-rec-badge label-mono ${escapeHtml(option.badgeClass||"alt")}">${escapeHtml(option.badge)}</div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:10px">${tileHTML(option.name,24)}<div><div class="sell-rec-name">${escapeHtml(option.name)}</div>${option.type?`<div class="sell-rec-type">${escapeHtml(option.type)}</div>`:""}</div></div>
          </div>
        </div>`}
        ${(() => {
          // 1b: EVERY line of card text comes from composeCard. Headline is the
          // single most important data finding; bullets support it. Nothing else
          // renders (no reason voice line, momentum, stat, or evidence line).
          const c=option.composed;
          if(!c)return "";
          const label=option.key==="specialist"?"Why Sam would call them":(!isPrimary?"Why Sam would also consider it":"Why Sam picked this");
          // Fix 5: card copy passes through the same shared count gate as chat.
          const gate=t=>typeof samForbiddenScrub==="function"?samForbiddenScrub(t):t;
          const head=c.headline&&c.headline.text?`<div class="sell-rec-samline voice">${numify(gate(c.headline.text))}</div>`:"";
          // 3.10: EVERY composed bullet passes through the single filler gate
          // here, at the one render site. Composers should never emit filler, but
          // this guarantees no future composed bullet can bypass the filter.
          const gated=(typeof evidenceOnlyBullets==="function")?evidenceOnlyBullets(c.bullets):(c.bullets||[]);
          const list=(gated&&gated.length)?`<ul class="sell-rec-bullets">${gated.map(b=>`<li>${numify(gate(b.text))}${b.receiptUrl?` <a href="${escapeHtml(b.receiptUrl)}" target="_blank" rel="noopener noreferrer" class="vin-receipt-link">View that sale</a>`:""}</li>`).join("")}</ul>`:"";
          if(!head&&!list)return "";
          return `<div class="sell-rec-reason-label label-mono">${label}</div>${head}${list}`;
        })()}
        ${option.observedSellers?.length?`<div class="observed-sellers">
          ${option.observedSellers.map((seller,sellerIndex)=>`<div class="observed-seller">
            <span class="observed-seller-name">${escapeHtml(seller.name)}</span>
            <span class="observed-seller-meta">${escapeHtml([seller.region,platformDisplayName(seller.platform)].filter(Boolean).join(" · "))}</span>
            <div class="observed-seller-tags">${(seller.specialties||[]).map(tag=>`<span class="observed-seller-tag">${escapeHtml(tag)}</span>`).join("")}</div>
            <span class="observed-seller-why">Why Sam would call them</span>
            <ul>${powerSellerWhyBullets(seller,sellerIndex).map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>
            <button class="ghost" onclick="event.stopPropagation();chooseSellOption('${escapeHtml(option.key)}')">Talk to them</button>
          </div>`).join("")}
        </div>`:""}
        ${(() => {
          // Part 6: rankable platform cards (never the PowerSeller, 6.6) get the
          // outbound submission CTA -> confirmation modal -> tracked /out redirect
          // to the platform's own submit page. Everything else keeps the existing
          // chooseSellOption path (PowerSeller contact form, regional fallback).
          const slug=option.platformSlug;
          const outbound=option.key!=="specialist"&&slug&&typeof hasOutboundSubmission==="function"&&hasOutboundSubmission(slug);
          if(outbound){
            const card=option.key==="primary"?"pick":"alt";
            return `<div class="sell-rec-actions"><button class="${isPrimary?"primary":"ghost"}" onclick="event.stopPropagation();outboundGo('${escapeHtml(slug)}','${card}')">Send my details to ${escapeHtml(option.name)}</button></div>`;
          }
          return `<div class="sell-rec-actions"><button class="${isPrimary?"primary":"ghost"}" onclick="event.stopPropagation();chooseSellOption('${escapeHtml(option.key)}')">${escapeHtml(option.actionLabel||"Consider this")}</button></div>`;
        })()}
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
  const featuredPowerSellerName=featuredPowerSeller?powerSellerFirstName(featuredPowerSeller):"";
  // Warm, non-asserting handoff copy. The old own-voice value claims ("the fee
  // earns its keep", "my personal preference is generally a good PowerSeller")
  // are deleted: no unbacked claim about fee worth. We say what a PowerSeller
  // does and who I'd call, nothing more.
  const handledIntro=featuredPowerSeller
    ?`If you'd rather hand the whole thing to someone, ${escapeHtml(featuredPowerSellerName)} is who I'd call. He takes on the entire sale: prep, photos, listing, buyer questions, paperwork and platform choice.`
    :"";
  // The PowerSeller block, positioned by the seller's step-8 preference (no
  // post-result re-ask). "lead" carries the track-record plate and heads the
  // layout; below the platform it is an offer, "prominent" for unsure, "quiet"
  // for diy. renderFeaturedPowerSellerProfile takes (profile, notLeading, plate).
  const powerSellerSection=mode=>{
    if(!featuredPowerSeller)return "";
    const lead=mode==="lead";
    const quiet=mode==="quiet";
    const plate=lead?trackRecordPlate(featuredPowerSeller):null;
    return `<div class="sell-section-label${quiet?" ps-quiet":""}" style="margin-top:${lead?0:14}px">Have it handled</div>
      <div class="sell-section-note${quiet?" ps-quiet":""}">${handledIntro}${lead?" The platform below is where to start if you'd rather run it yourself.":""}</div>
      ${renderFeaturedPowerSellerProfile(featuredPowerSeller,!lead,plate)}`;
  };

  const platformOptions=sellState.sellOptions.filter(option=>option.key!=="specialist");
  const primaryPlatform=platformOptions[0]||null;
  // An alternative platform card appears only when no PowerSeller block is
  // competing for attention, keeping the layout to one clear axis.
  const secondaryPlatforms=featuredPowerSeller?[]:platformOptions.slice(1,2);
  const diySecondaryLine=(!featuredPowerSeller&&sellState.partnerReferral?.eligible&&sellerWantsToManageSelf())
    ?`<div class="sell-section-note" style="margin-top:10px">You said you’d rather run it yourself, so that’s the plan. If you’d rather have someone handle the whole sale, I know who I’d call. Just ask.</div>`
    :"";
  // Value-floor note (Sep 2026): a seller who leaned toward having it handled but whose
  // car sits below the PowerSeller value floor (segment + region matched, only value
  // failed) must not get a silent platform-only card. State the honest reason - about
  // the seller's proceeds and the PowerSeller's own focus, never a fee figure, never a
  // judgment on the car's value. Only when NO PowerSeller renders at all.
  const valueFloorNote=(function(){
    if(featuredPowerSeller||partnerSecondary)return "";
    const cond=(sellState.partnerReferral&&sellState.partnerReferral.conditions)||{};
    const valueFloorMiss=cond.valueMet===false&&cond.segmentMet!==false&&cond.regionMet!==false;
    const leanedHandled=sellState.sellerPreference==="powerseller"||sellState.sellerPreference==="unsure";
    if(!valueFloorMiss||!leanedHandled)return "";
    const n=parseInt(String(sellState.price||"").replace(/[^0-9]/g,""),10);
    const ask=(isFinite(n)&&n>0)?("$"+n.toLocaleString()):null;
    const plat=platformDisplayName((primaryPlatform&&(primaryPlatform.name||primaryPlatform.platformSlug))||sellState.displayedRecommendedPath||"");
    const line=`${ask?`At your ${ask} target, `:""}our PowerSellers focus on higher-value cars, where their fee is worth what it costs. On a car in this range, that fee would eat into more of what you'd take home, so listing it yourself on ${plat} likely puts more in your pocket.`;
    return `<div class="sell-section-note" style="margin-top:12px">${escapeHtml(line)}</div>`;
  })();
  const platformGrid=primaryPlatform
    ?`<div class="sell-rec-grid">${renderOptionCard(primaryPlatform)}${secondaryPlatforms.map(renderOptionCard).join("")}</div>`
    :"";
  const noFeatureExtras=`${partnerSecondary?`<div class="sell-section-note" style="margin-top:12px">${escapeHtml(powerSellerIntroLine())}</div>${renderMiniPowerSellerProfile(partnerSecondary,"Also worth considering")}`:""}${diySecondaryLine}${valueFloorNote}`;

  // 1b: the header carries only the factual car label. The finding lives in the
  // pick card's composed headline; the old templated title/subtitle are deleted.
  const headerHTML=`<div class="sell-rec-header">
      <div class="sell-rec-kicker">Seller Intelligence</div>
      <div class="sell-rec-title">${escapeHtml(carDisplayLabel("your car"))}</div>
    </div>`;
  const caveatText=unverifiedModelNote()||modifiedMatchNote()||adverseConditionCaveat();
  const caveatHTML=caveatText?`<div class="sell-section-note" style="margin-top:10px">${escapeHtml(caveatText)}</div>`:"";

  // LAYOUT BY PREFERENCE (step 8 is the single ask; the double-ask chips are gone).
  //  powerseller -> PowerSeller-forward: track-record plate leads, platform below.
  //  diy         -> platform-first (platform holds the pick plate), PowerSeller quiet below.
  //  unsure      -> platform-first, PowerSeller prominent below; both doors, the click is the choice.
  let orderedSections;
  if(leadWithPartner){
    orderedSections=`${powerSellerSection("lead")}
      <div class="sell-section-label" style="margin-top:12px">Run it yourself</div>
      ${platformGrid}`;
  }else if(featuredPowerSeller){
    orderedSections=`${platformGrid}${powerSellerSection(sellState.sellerPreference==="diy"?"quiet":"prominent")}`;
  }else{
    orderedSections=`${platformGrid}${noFeatureExtras}`;
  }

  // Recommendation closes are declarative (locked): a period, never a
  // question, never an escape hatch.
  const afterText=featuredPowerSeller
    ?"Both are real options and the choice is yours. Pick one, or ask me to compare the tradeoffs."
    :(secondaryPlatforms.length?"Pick either, or ask me to compare the tradeoffs.":"Ask me anything about the pick, or how I'd run the listing.");
  sellState.generatedPrimaryName=sellState.sellOptions[0]?.name||null;
  sellState.generatedSecondaryName=sellState.sellOptions[1]?.name||null;

  // Stage 4: when cardv2 is on, the ENTIRE result page renders from the V2
  // composer (pick hero + value-aware PowerSeller dossier + optional compact
  // secondary). Zero old-style components render. Falls back to the old
  // composition if the V2 page fails to build.
  const v2Page=(typeof cardV2Active==="function"&&cardV2Active()&&typeof renderResultV2Page==="function")?renderResultV2Page():null;
  if(v2Page){
    sellState.lastResultHTML=v2Page;
    const row=document.createElement("div");row.className="row sam v2-result";
    row.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div>${v2Page}</div></div>`;
    msgs.appendChild(row);
    // Land the user reading the TOP of the result, not the bottom of the last card.
    // On a fresh search the summary strip is the top of the block; on a reopen the
    // "as of" header row is. anchorRenderTop only anchors when the render is taller
    // than the viewport (it is), else it falls back to scroll-to-newest.
    anchorResultBlock(msgs,row,renderOpts);
    // Business journey: card impressions (once per journey; the server also dedups).
    // Suppressed when re-opening a saved result - viewing history is not a new impression.
    if(!renderOpts.reopened&&typeof gasJourneyEventOnce==="function"){
      const _dec=(sellState.sellDecision&&sellState.sellDecision.decision)||{};
      gasJourneyEventOnce("platform_cta_viewed",{platformId:_dec.recommendedPath||null});
      const _pr=_dec.partnerReferral;
      if(_pr&&(_pr.eligible||_pr.secondary)){ const _p=_pr.partner||{}; gasJourneyEventOnce("powerseller_card_viewed",{powersellerId:_p.slug||_p.name||null}); }
    }
    return;
  }

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
  anchorResultBlock(msgs,row,renderOpts);
}

// Land a rendered result at the TOP of its block. Fresh search: the summary strip
// (#sellSummaryStrip) is the top row; reopen: the "as of" header (msgs.firstChild)
// is. Falls back to the result row itself, then to a plain block:start, so a
// missing helper never breaks the render.
function anchorResultBlock(msgs,row,renderOpts){
  renderOpts=renderOpts||{};
  const topEl=renderOpts.reopened
    ? (msgs.firstElementChild||row)
    : (document.getElementById("sellSummaryStrip")||row);
  if(typeof anchorRenderTop==="function")anchorRenderTop(topEl);
  else try{row.scrollIntoView({block:"start"});}catch(e){}
}

function handleSellRecommendationFollowup(q){
  const lower=q.toLowerCase();
  // The post-result path-choice chips are gone (step 8 is the single ask), so
  // there is no awaitingPathChoice state to intercept here anymore.
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

  // Note: the two invited composers ("compare the tradeoffs", "how I'd run the
  // listing") are intercepted upstream in handleSellStep, before the step-12
  // question->chat short-circuit. Everything else falls through to /api/chat.
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
  if(typeof showVehicleLookup==="function")showVehicleLookup();
  try{
    const res=await fetch(apiPath("/api/vehicleIdentity"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:cleaned})});
    const data=await res.json();
    if(typeof hideVehicleLookup==="function")hideVehicleLookup();
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
    // Part of the car was understood (the resolver's own needs_clarification, lib/vehicle.js): ask for what is
    // missing, with real models from the resolver's own list for that make, and keep what was understood so
    // the next answer completes the car (js/entry.js pendingRerunBase).
    const pv=data&&data.vehicle||{};
    // The model did not exist that year: say so (the resolver's own line), keep what was understood, and
    // never offer the rejected model again (js/chat-core.js noteRejectedModel / dropRejectedChips).
    if(res.ok&&data.status==="invalid_vehicle"&&pv.make&&pv.model&&data.clarification&&data.clarification.question){
      noteRejectedModel(pv,sellState.lastRerunChips);
      sellState.pendingRerunBase={year:pv.year||null,make:pv.make};
      const models=dropRejectedChips(pv,data.clarification.chips||[]).filter(c=>!/^(not sure|change car|other)$/i.test(String(c))).slice(0,3);
      sellState.lastRerunChips=models;
      addMsg("sam",data.clarification.question,"",models.length?chipsHTML(models):"");
      return;
    }
    if(res.ok&&data.status==="needs_clarification"&&(pv.make||pv.year)&&!pv.model){
      sellState.pendingRerunBase={year:pv.year||null,make:pv.make||null};
      if(pv.make){
        const models=dropRejectedChips(pv,(data.clarification&&data.clarification.chips)||[]).filter(c=>!/^(not sure|change car|other)$/i.test(String(c))).slice(0,3);
        sellState.lastRerunChips=models;
        addMsg("sam",whichModelAsk(pv,models),"",models.length?chipsHTML(models):"");
      }else{
        addMsg("sam",`Which car from ${pv.year}? Tell me the make and model.`);
      }
      return;
    }
    addMsg("sam","I couldn't read that as a car. Year, make and model?");
  }catch(e){
    if(typeof hideVehicleLookup==="function")hideVehicleLookup();
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
        primarySlug:"collectingcars",
        secondary:"Car & Classic",
        secondarySlug:"carandclassic",
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
      primarySlug:"carandclassic",
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
      primarySlug:"collectingcars",
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

// Honest low/zero-evidence fallback for ANY region without a bespoke regional
// card (US included). A completed funnel must never dead-end (rule 8): when the
// archive has zero comparable sales, we still render a card - the backend's
// route-POLICY fit, labeled as fit rather than data, with directional guidance
// for genuinely rare cars. Never invents a number, never quotes a fee, never
// claims sales evidence it does not have.
function genericNoEvidenceFallback(){
  const car=cleanCarForCopy();
  const recommended=sellState.sellDecision?.decision?.recommendedPath;
  const yr=Number(sellState.resolvedVehicle?.year)||Number(sellState.sellDecision?.vehicle?.year)||null;
  const preWar=yr&&yr<1945;
  const classic=yr&&yr<1975;
  // Car-type-aware, never a hardcoded BaT default (Aug 2026). Prewar and classic
  // cars route to Hagerty, the genuine classic/collector specialist and the right
  // policy-fit home. Newer zero-evidence cars keep the backend's recommended route,
  // or BaT as the general enthusiast floor when there is none (make-only cars, where
  // recommendedPath is absent - the exact case that used to hardcode BaT for a
  // 1936 Packard). Hemmings is never used here: it carries no real evidence data.
  const primarySlug=classic?"hagerty":(recommended||"bringatrailer");
  const primaryName=platformDisplayName(primarySlug);
  // Model-unconfirmed case (Sep 2026, reader "CLK DTM"): the pool is empty because we could not
  // identify the model, NOT because sales are scarce. Say that honestly instead of the false
  // "not enough tracked auction sales" line, and name what WAS resolved (make + year).
  const rv=sellState.resolvedVehicle||{};
  const makeName=rv.make||((typeof extractVehicleMake==="function"&&extractVehicleMake(sellState.carName||""))||"");
  const modelUnknown=!!makeName&&(!rv.model||rv.unverified);
  const carNamed=modelUnknown?`${[rv.year,makeName].filter(Boolean).join(" ")}, model not confirmed`:car;
  const reason=modelUnknown
    ?`I couldn't pin down which ${makeName} this is, so I can't pull comparable sales. ${primaryName} is where I'd start for a car like this, but that's a fit, not a read from sales data.`
    :preWar
    ?`I don't have enough tracked auction sales on ${car} to back a specific data-led call. ${primaryName} is where I'd start: it's the specialist home for prewar and classic collector cars, and cars like this most often trade through marque specialists and collector auctions. That's a fit for the car, not a read from sales data.`
    :classic
    ?`I don't have enough tracked auction sales on ${car} to back a specific data-led call. ${primaryName} is the specialist home for classic and collector cars like this, so that's where I'd start. That's a fit for the car, not a read from sales data.`
    :`I don't have enough tracked auction sales on ${car} to back a specific data-led call. ${primaryName} is where I'd start for a car like this. That's a fit for the car, not a read from sales data.`;
  return {
    region:"generic",
    primary:primaryName,
    primarySlug,
    secondary:null,
    title:modelUnknown?`Here's the honest read on ${carNamed}.`:`Here's what I'd do with ${car}.`,
    subtitle:`${primaryName} is where I'd start.`,
    primaryReason:reason,
    bullets:[],
    caveat:"When comparable sales show up in my data, I can back this with real evidence.",
    secondaryReason:"",
    secondaryBullets:[]
  };
}

// Honest no-routing card (phase 1): a country we cannot route yet. Never a US
// default, never invented data. Offers the real path (US/UK) if the car could
// sell there. The curated country -> platform map is phase 2.
function showHonestNoRouting(msgs){
  const car=(typeof cleanCarForCopy==="function")?cleanCarForCopy():(sellState.carName||"your car");
  const country=sellState.country||sellState.region||"your country";
  sellState.sellOptions=[];
  sellState.step=12;
  addMsg("sam",`Here's the honest read for the ${car}. I route sellers to the auction platforms where I hold real sales data, and I don't yet have that coverage for ${country}, so I won't point you at a US platform as if it were the answer. That coverage is expanding. If the car could realistically sell into the US or UK markets, tell me and I'll run it there.`);
}

// THIN MODE + HOUSE STEER on /sell (Sep 2026). Mirrors One Box: the online market is too thin for
// a volume band, so the answer is sale-anchored (a single named sale, never a wide band) with the
// receipts below. The HOUSE STEER (house share >= 2/3) names the houses by THIS car's own recorded
// results, evidence-ordered, and explains that a car at this level is typically placed through
// consignment. It routes the practical step to a consigns_to_houses partner ONLY when one is
// seeded and region-covered; with none it STANDS WITHOUT A DOOR - no partner card, and it never
// implies GoAskSam holds a placement partner for it. Houses are never a routable button.
function _thinMonthLabel(dstr){var p=String(dstr||"").slice(0,10).split("-");var M=["","January","February","March","April","May","June","July","August","September","October","November","December"];return p.length>=2?((M[+p[1]]||"")+" "+p[0]).trim():"";}
// Venue pick from the scoped receipts: the venue with the strongest recorded results for THIS
// model - most sales, then highest median - among venues that run a door (consignment for houses,
// submission for online). Evidence-ordered by the car's own sales, never a venue preference. Others
// named. isHouse selects the house set (consign door) or the online set (submission door).
function _thinVenuePick(receipts,isHouse){
  const g={};
  for(const rc of (receipts||[])){
    if(!!rc.isHouse!==!!isHouse)continue;
    const slug=String(rc.slug||"").toLowerCase();
    if(!slug||(typeof hasOutboundSubmission==="function"&&!hasOutboundSubmission(slug)))continue;
    (g[slug]||(g[slug]={slug,venue:rc.venue,hammers:[]})).hammers.push(rc.hammer);
  }
  const ranked=Object.values(g).map(h=>{const s=h.hammers.slice().sort((a,b)=>a-b);return{slug:h.slug,venue:h.venue,count:s.length,median:s[Math.floor((s.length-1)/2)],lo:s[0],hi:s[s.length-1]};})
    .sort((a,z)=>(z.count-a.count)||(z.median-a.median));
  return ranked.length?{pick:ranked[0],others:ranked.slice(1,4)}:null;
}
// A pick card mirroring the online pick card. kind "house" = consignment door; "online" = listing.
function _thinPickCardHtml(o){
  const esc=escapeHtml, money=moneyShort, p=o.pick, isHouse=o.kind==="house";
  const svg=(k,c)=>(typeof v2Svg==="function")?v2Svg(k,c):"";
  const name=(typeof platformDisplayName==="function"&&platformDisplayName(p.slug))||p.venue;
  const range=p.count===1?`at ${money(p.lo)}`:`from ${money(p.lo)} to ${money(p.hi)}`;
  // Badges + intro aligned to the locked V2 template (result-v2.js): lead = "Sam's Recommendation",
  // the other door = "Sam's Pick"; intro "I'd sell your {make} on/through {name}" (house keeps the
  // consign verb "through", online "on"). Was drifted to the thin card's own strings.
  const badge=o.isLead?"+ Sam's Recommendation":"+ Sam's Pick";
  const script=isHouse?`I'd sell your ${esc(o.make)} through`:`I'd sell your ${esc(o.make)} on`;
  // No small-sample counts as headlines (CLAUDE.md decision coherence, locked): drop "has sold N"
  // and the per-house "(N)". Receipts below carry the evidence (receipts over claims); the price
  // range stays. This also removes the claimed-N-vs-shown-3 mismatch (no N is claimed).
  // Single-sale wording (item 4): one sale never gets plural/trend language ("have been selling").
  let why=(p.count===1)
    ? (isHouse
        ? `${esc(name)} sold one ${esc(o.modelLabel)} in the last three years, for ${money(p.lo)}.`
        : `One ${esc(o.modelLabel)} sold on ${esc(name)} in the last three years, for ${money(p.lo)}.`)
    : (isHouse
        ? `${esc(name)} is where ${esc(o.modelLabel)}s like this have been selling over the last three years, ${range}.`
        : `${esc(o.modelLabel)}s like this have sold on ${esc(name)} over the last three years, ${range}.`);
  if(isHouse&&o.others&&o.others.length){
    const oth=listJoin(o.others.map(h=>esc((typeof platformDisplayName==="function"&&platformDisplayName(h.slug))||h.venue)));
    why+=` ${o.others.length===1?"The other house to take one":"Other houses that have taken them"}: ${oth}.`;
  }
  // Receipt line leads with the SALE month (unambiguous "June 2024 · $960,000"), car/model year
  // beneath it as context - not the other way round (a car year read like a sale year).
  // Item 2: show this venue's receipts by RECENCY, never the 3 priciest (which biased the card to the
  // ceiling). Newest-first is the honest evidence order and every shown sale is within the venue pool.
  const rc=(o.receipts||[]).filter(r=>String(r.slug||"").toLowerCase()===p.slug).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).slice(0,3)
    .map(r=>`<div class="pcard-mrow"><div><div class="pcard-mp" style="font-variant-numeric:tabular-nums">${esc(_thinMonthLabel(r.date)||"Recent")} · ${money(r.hammer)}${isHouse&&r.allIn?` <span style="opacity:.6">buyer paid ${money(r.allIn)}</span>`:""}</div><div class="pcard-ms">${esc(cleanReceiptTitleForCard(r.title)||[r.year,r.model,o.modelLabel].filter(Boolean).join(" ").trim()||o.modelLabel)}</div></div></div>`).join("");
  // Adjacent-year disclosure (Thread A, approved): the thin pool windows year +/-2, so a 1964
  // query can legitimately pool 1963-1964 cars. When the receipts' actual year range differs from
  // the typed year, say so on the scope line (the same honesty as the class-era band) instead of a
  // bare "All {model}s". Gated on the pooled receipts differing from the typed year; identical when
  // every comp matches the year, and silent when no year was typed.
  const _yrs=(o.receipts||[]).map(r=>parseInt(r.year,10)).filter(y=>y>1900&&y<2100);
  const _yMin=_yrs.length?Math.min(..._yrs):null, _yMax=_yrs.length?Math.max(..._yrs):null;
  const _ty=parseInt(o.typedYear,10)||null;
  const _adj=_ty&&_yMin!=null&&(_yMin!==_ty||_yMax!==_ty);
  let scopeLabel=`All ${esc(o.modelLabel)}s · last three years`, scopeSub=`Sold ${range}`;
  if(_adj){
    if(_yMin!==_yMax){
      scopeLabel=`${esc(o.modelLabel)}s, ${_yMin} to ${_yMax} · last three years`;
      scopeSub=`Sold ${range}. Reading across ${_yMin} to ${_yMax}; a single year is too thin.`;
    } else {
      scopeLabel=`${esc(o.modelLabel)}s, ${_yMin} · last three years`;
      scopeSub=`Sold ${range}. Comps here are ${_yMin}; yours is a ${_ty}.`;
    }
  }
  const cta=isHouse?`outboundGo('${esc(p.slug)}','consign')`:`outboundGo('${esc(p.slug)}','pick')`;
  const ctaLabel=isHouse?`Start a consignment with ${esc(name)}`:`Start listing on ${esc(name)}`;
  const reassure=isHouse
    ?`You'll be taken to ${esc(name)} to begin a consignment enquiry. Nothing is committed until you sign a consignment agreement.`
    :`You'll be taken to ${esc(name)} to begin your listing. Nothing is committed until you decide to publish.`;
  return `<div class="pcard pcard-platform" onclick="${cta}">
    <div class="pcard-left">
      <span class="pcard-badge">${esc(badge)}</span>
      <div class="pcard-script">${script}</div>
      <h1 class="pcard-name">${esc(name)}</h1>
      <div class="pcard-whyl pcard-whyl-main">Why Sam picked this</div>
      <p class="pcard-lead">${why}</p>
      <button class="pcard-cta" onclick="event.stopPropagation();${cta}">${ctaLabel}${svg("arrow","cta-arrow")}</button>
      <div class="pcard-reassure">${svg("shield")}<span>${reassure}</span></div>
    </div>
    <div class="pcard-right">
      <div class="pcard-wordmark">${esc(name)}</div>
      <div class="pcard-meta">
        <div class="pcard-mrow">${(typeof psvSvg==="function"?psvSvg("pin"):svg("car"))}<div><div class="pcard-mp">${esc(o.carLbl)}</div><div class="pcard-ms">${esc(o.loc)}</div></div></div>
        <div class="pcard-mrow"><div><div class="pcard-mp">${scopeLabel}</div><div class="pcard-ms">${scopeSub}</div></div></div>
        ${rc}
      </div>
    </div>
  </div>`;
}
function renderThinDecisionSell(msgs,thin,decisionData){
  const esc=escapeHtml;
  const v=sellState.resolvedVehicle||decisionData.vehicle||{};
  const make=v.make||((typeof cleanCarForCopy==="function")?cleanCarForCopy():"your car");
  const modelLabel=[v.model,v.trim].filter(Boolean).join(" ")||make;
  const carLbl=(typeof v2CarDisplay==="function")?v2CarDisplay(v):([v.year,v.make,v.model].filter(Boolean).join(" ")||make);
  const loc=[sellState.state,sellState.region].filter(Boolean)[0]||"US";
  const recs=(thin.receipts||[]).filter(r=>Number(r.hammer)>0);
  if(!recs.length)return false;
  const hp=_thinVenuePick(recs,true), op=_thinVenuePick(recs,false);
  if(!hp&&!op)return false;
  // ASAP GATE (locked): a house consignment is scheduled and settled over months, structurally
  // incompatible with a seller who chose ASAP. When the seller is in a rush a house can NEVER be
  // the pick/CTA, no matter how strong its comps are. The house result is still CITED as the
  // benchmark (rushBridge below); the recommendation moves to the online listing venue and the
  // copy connects the dots: the pick is elsewhere BECAUSE of the rush, not because the house
  // evidence is weak (thin-evidence weakness is a different, non-ASAP reason on the normal path).
  const rush=(typeof sellerWantsSpeed==="function")&&sellerWantsSpeed();
  if(rush&&thin.houseSteer&&!op){
    // Pure-house thin pool + ASAP: no online venue in this pool to carry the pick. Defer to the
    // normal evidence ladder, which lands a routable ONLINE platform (houses are routable:false
    // there, so a house can never win) and still names the house sale as the stronger evidence.
    return false;
  }
  // A house never leads for a rushed seller, NOR for a DIY seller who said they'll sell it themselves
  // (item 3): the online listing venue leads, the house is shown below as the handled alternative.
  const diy=sellState.sellerPreference==="diy";
  const houseLeads=!!thin.houseSteer&&!rush&&!diy;
  const typedYear=v.year;
  const houseCard=hp?_thinPickCardHtml({kind:"house",pick:hp.pick,others:hp.others,receipts:recs,make,modelLabel,carLbl,loc,typedYear,isLead:houseLeads}):"";
  const onlineCard=op?_thinPickCardHtml({kind:"online",pick:op.pick,others:op.others,receipts:recs,make,modelLabel,carLbl,loc,typedYear,isLead:!houseLeads}):"";
  // consigns_to_houses PowerSeller (once seeded): the "have someone handle everything" route ABOVE
  // the pick. Suppressed under ASAP (a handled house consignment is equally months-long). None
  // seeded today, so this never renders; when it does its CTA joins the lead flow.
  let partnerCard="";
  if(houseLeads&&thin.consignPartner&&thin.consignPartner.name){
    const pn=esc(thin.consignPartner.name);
    partnerCard=`<div class="pcard pcard-platform"><div class="pcard-left"><span class="pcard-badge">+ Have it handled end to end</span><div class="pcard-script">For your ${esc(make)}, if you'd rather someone handled everything</div><h1 class="pcard-name">${pn}</h1><div class="pcard-whyl pcard-whyl-main">Why</div><p class="pcard-lead">${pn} places cars like this into the auction houses and handles the consignment on your behalf.</p></div></div><div class="pv2-bridge">Or take it to a house yourself:</div>`;
  }
  const bridgeOnline=`<div class="pv2-bridge">If you'd rather run the sale yourself, here's where I'd go.</div>`;
  const bridgeHouse=`<div class="pv2-bridge">If you'd rather have it handled at a house, here's where its results are strongest.</div>`;
  // Locked ASAP line (Sam-approved, Sep 2026): cite the house result plainly with its number,
  // then pin the pick elsewhere on the rush ALONE, never on house weakness. Venue names and the
  // dollar figure interpolate from the real pool at render time. The single-sale figure carries
  // no "at" prefix (the line already reads "...are at {House}, {figure}, so...").
  const houseName=hp?((typeof platformDisplayName==="function"&&platformDisplayName(hp.pick.slug))||hp.pick.venue):"";
  const onlineName=op?((typeof platformDisplayName==="function"&&platformDisplayName(op.pick.slug))||op.pick.venue):"";
  const houseRange=hp?(hp.pick.count===1?`${moneyShort(hp.pick.hi)}`:`from ${moneyShort(hp.pick.lo)} to ${moneyShort(hp.pick.hi)}`):"";
  const rushBridge=`<div class="pv2-bridge">The strongest results for this car are at ${esc(houseName)}, ${esc(houseRange)}, so that's the number to keep in mind. It isn't the pick here only because a house consignment takes months to schedule and settle, and you told me you want to move fast. For that timeline, ${esc(onlineName)} is where I'd list it now, and it still reaches serious buyers.</div>`;
  let body;
  if(houseLeads){
    body=houseCard+(onlineCard?bridgeOnline+onlineCard:"");
  } else if(rush&&thin.houseSteer){
    // ASAP suppressed the house steer: online leads (Sam's Pick), the house is CITED by the
    // locked line only (no consign CTA), so the house is never the routed recommendation.
    body=onlineCard+rushBridge;
  } else {
    body=(onlineCard||"")+(houseCard?bridgeHouse+houseCard:"");
  }
  body=partnerCard+body;
  sellState.sellOptions=[]; // destinations are the outbound consign/list doors, not a captured lead
  // Item 2: the asking-price fact must count ONLY the sales actually ON SCREEN (the pick cards show the
  // top 3 per shown venue), not the whole pool. Gather the same receipts the cards render.
  const shownVenues=[];
  if(houseLeads){ if(hp)shownVenues.push(hp.pick.slug); if(op)shownVenues.push(op.pick.slug); }
  else if(rush&&thin.houseSteer){ if(op)shownVenues.push(op.pick.slug); }
  else { if(op)shownVenues.push(op.pick.slug); if(hp)shownVenues.push(hp.pick.slug); }
  const shownThinRecs=[];
  for(const sv of shownVenues){ recs.filter(r=>String(r.slug||"").toLowerCase()===String(sv).toLowerCase()).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).slice(0,3).forEach(r=>shownThinRecs.push(r)); }
  const askLine=_askingVsSalesLine((shownThinRecs.length?shownThinRecs:recs).map(r=>r.hammer));
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sam-label">Sam</div>${body}
    ${askLine}
    <div class="pcard-note" style="margin-top:14px">Real completed sales from GoAskSam's archive, hammer prices with the buyer premium backed out.</div>
    <div class="sam-text after-results">Ask me anything about the recommendation, or tell me more about the car.</div>
  </div></div>`;
  msgs.appendChild(row);
  row.scrollIntoView({behavior:"smooth",block:"start"});
  return true;
}

// ============ HOUSE-BY-HOUSE COMPARISON on /sell (Sep 2026) ==============================
// The product for a high-value seller: which house, which sale, when, from the record. Ranked
// house blocks (Sam's pick on top by the RECORD - share, recency, hammer), each with its receipts,
// the room where known/inferable, and the next sale + approximate consignment window. Record
// language only: it ranks and shows what happened, never promises an outcome or a "best price";
// a venue price difference is shown by the receipts, never stated. ASAP leads with the soonest sale.
function _hcRoomLabel(room){
  if(!room||!room.name)return "";
  // Data-carried room stated plainly; inferred room is hedged (the two-fact honesty from discovery).
  return room.source==="data"?` · ${escapeHtml(room.name)}`:"";
}
// A card ALWAYS shows the car's OWN listing title (standing rule), cleaned of the OCD mileage hook
// and gearbox tag; the seller's typed model is only a last-resort fallback when a record has no title.
// Body-class word for the wider-market copy (item 1b): name the class the pool was filtered to -
// "trucks" / "SUVs" / "cars" / "motorcycles" - never a bare "market". Finer than the backend's binary
// truck-vs-car filter for labelling; SUV and pickup both draw from the truck-class pool.
function bodyClassWord(v){
  // Include the ORIGINAL typed text (carRaw) so a make-level read (model dropped after "not sure")
  // still names the class from the codes the seller typed.
  var t=[v&&v.year,v&&v.make,v&&v.model,v&&v.trim,sellState&&sellState.carRaw].filter(Boolean).join(" ");
  if(/\bmotorcycle|\bmoto\b|\bbike\b|harley|ducati|\bbsa\b|triumph\s+bonneville|moto\s?guzzi|\bcafe\s?racer\b/i.test(t))return "motorcycle";
  if(/ramcharger|bronco|blazer|suburban|tahoe|yukon|wagoneer|cherokee|\bscout\b|land\s?cruiser|4[-\s]?runner|\bk5\b|\bsuv\b|grand\s?wagoneer|trooper|montero|4runner/i.test(t))return "SUV";
  if(/\bpick[-\s]?up\b|\btruck\b|\b[dwf][-\s]?[1-5]50\b|\bram\b|power\s?wagon|dakota|\bd50\b|\bd350\b|silverado|sierra|\bc\/?k\b|tacoma|tundra|\bel\s?camino\b|ranchero/i.test(t))return "truck";
  return "car";
}
// Plural of the body-class word ("SUV" -> "SUVs", else +s).
function bodyClassPlural(v){ var w=bodyClassWord(v); return w+"s"; }
// Title-case a shouting sale title (item 6): "1973 FORD PINTO HATCHBACK" -> "1973 Ford Pinto
// Hatchback", keeping alphanumeric badges/codes (E63, 911R, GT3, 300SL, 550) and short all-caps
// badges (RS, SS, GT, GTO, GTS, AMG) exactly as they are, and leaving already-mixed-case titles alone.
function titleCaseSaleTitle(t){
  return String(t==null?"":t).split(/(\s+)/).map(function(w){
    if(!/[A-Za-z]/.test(w))return w;                                   // whitespace/punctuation/number
    if(/\d/.test(w))return w;                                          // alphanumeric badge or year
    if(w.length<=3&&w===w.toUpperCase())return w;                      // short all-caps badge (RS, GTO, AMG)
    if(w===w.toUpperCase())return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();  // de-shout FORD->Ford
    return w;                                                          // already mixed-case: leave
  }).join("");
}
// Strip VIN / chassis / engine designations and auction lot codes from a displayed title (item 2):
// "... VIN. ZFFZR49B000110732", "... Chassis no. *ZFFTA17B...*", "... Engine no. F113A*00060*",
// "... (FL26)". The chassis renders on its own line elsewhere, so it is noise in the title.
// One chassis format everywhere (item 3): the last six alphanumeric characters of the VIN/chassis,
// never the full VIN on some rows and the tail on others. A shorter id shows in full.
// One chassis format everywhere (item 3): the last six alphanumeric characters of the VIN/chassis.
// Item 4 (Oct 2026): render ONLY a plausible VIN/chassis. A listing placeholder ("SEE TEXT", "N/A",
// "UNKNOWN", "TBA"), anything under 6 alphanumerics, or a value with no digit (a real chassis/VIN
// always carries one) returns "" so the caller OMITS the chassis line - never "chassis EETEXT".
function chassisTail6(c){
  var raw=String(c==null?"":c).trim();
  if(/^(see\s*text|n\/?a|unknown|tba|tbd|none|null|no\.?|n\.a\.?)$/i.test(raw)) return "";
  var clean=raw.replace(/[^A-Za-z0-9]/g,"");
  if(clean.length<6||!/[0-9]/.test(clean)) return "";
  return clean.length>6?clean.slice(-6):clean;
}
// One list-join helper used everywhere (item 3): "X", "X and Y", "X, Y and Z" - never "X and Y and Z".
function listJoin(arr){ arr=(arr||[]).filter(Boolean); if(!arr.length)return ""; if(arr.length===1)return String(arr[0]); if(arr.length===2)return arr[0]+" and "+arr[1]; return arr.slice(0,-1).join(", ")+" and "+arr[arr.length-1]; }
function stripIdsFromTitle(t){
  t=String(t==null?"":t);
  // Item 5: strip the designation clauses a house tacks on - VIN/chassis/engine AND transmission/
  // gearbox/body numbers ("Transmission no. 915-12345", "Gearbox no. G50-9876", "Body no. 993-00123").
  t=t.replace(/\s*\b(?:vin|chassis|engine|transmission|gearbox|body)\b\.?\s*(?:no\.?|number|#)?\s*:?\s*\*?[A-Za-z0-9][A-Za-z0-9*\/\-]{4,}\*?/ig,"");
  t=t.replace(/\s*["‘’“”']\s*type\s+[A-Za-z0-9.\/-]+\s*["‘’“”']/ig,"");   // quoted 'Type 993' designation fragments
  t=t.replace(/\s*\((?:[A-Za-z]{1,3}\d{1,3}|lot\s*\d+)\)/ig,"");   // lot codes: (FL26), (MC21), (Lot 124)
  t=t.replace(/\b([A-Za-z])([A-Za-z]*\d[A-Za-z0-9]*)\s+\1\b/g,"$2 $1");   // de-glue "RGT2 R" -> "GT2 R"
  t=t.replace(/\b((?:[A-Za-z0-9][A-Za-z0-9\/.\-]*\s+){0,2}[A-Za-z0-9][A-Za-z0-9\/.\-]*)(?:\s+\1\b)+/ig,"$1");   // collapse doubled token/phrase
  return t.replace(/\s{2,}/g," ").replace(/\s+[,-]\s*$/,"").trim();
}
function cleanReceiptTitleForCard(title){
  var t=String(title==null?"":title);
  t=t.replace(/^\s*[\d][\d,.]*\s*k?\s*[-\s]\s*(mile|kilometer|km)s?\b'?s?\s*/i,""); // "21k-Mile "
  t=t.replace(/\s+\d+[-\s]speed\b/ig,"");   // " 6-Speed"
  t=stripIdsFromTitle(t);                   // item 2: no VIN/chassis/lot codes in the title
  t=t.replace(/\s{2,}/g," ").trim();
  t=titleCaseSaleTitle(t);                  // item 6: never shout a sale title
  return t||String(title==null?"":title);
}
function _hcReceiptRow(rc,modelLabel){
  const esc=escapeHtml, money=moneyShort;
  const img=rc.image
    ?`<img src="${esc(rc.image)}" alt="" loading="lazy" style="width:64px;height:46px;object-fit:cover;border-radius:7px;flex:none;background:#eee" onerror="this.style.visibility='hidden'">`
    :`<span style="width:64px;height:46px;border-radius:7px;flex:none;background:#efece6;display:flex;align-items:center;justify-content:center;font:600 8px/1 monospace;letter-spacing:.06em;color:#a49a86;text-transform:uppercase">no photo</span>`;
  const when=_thinMonthLabel(rc.date)||"Recent";
  const paid=rc.allIn?` <span style="opacity:.6">buyer paid ${money(rc.allIn)}</span>`:"";
  const chTail=chassisTail6(rc.chassis);
  const chassis=chTail?` · chassis ${esc(chTail)}`:"";
  // A card ALWAYS shows the car's OWN listing title, never the seller's typed model (standing rule):
  // a "D50 D350" query must not relabel a Ramcharger or a Raider as "D50 D350". Fall back to the
  // typed model only when the record carries no title at all.
  const ownTitle=(typeof cleanReceiptTitleForCard==="function")?cleanReceiptTitleForCard(rc.title):(rc.title||"");
  const nameLine=ownTitle||[rc.year,rc.model,modelLabel].filter(Boolean).join(" ").trim()||modelLabel;
  const href=rc.url?`href="${esc(rc.url)}" target="_blank" rel="noopener"`:"";
  const open=rc.url?`<a ${href} style="text-decoration:none;color:inherit;display:flex;gap:11px;align-items:flex-start">`:`<div style="display:flex;gap:11px;align-items:flex-start">`;
  const close=rc.url?"</a>":"</div>";
  return `<div style="padding:9px 0;border-top:1px solid rgba(0,0,0,.07)">${open}
    ${img}
    <div style="flex:1;min-width:0">
      <div style="font-variant-numeric:tabular-nums;font-weight:700;font-size:15px">${money(rc.hammer)}${paid}</div>
      <div style="font-size:12.5px;color:#6b6861;margin-top:2px">${esc(nameLine)}${_hcRoomLabel(rc.room)}</div>
      <div style="font-size:11.5px;color:#928b7a;margin-top:2px;font-variant-numeric:tabular-nums">${esc(when)}${chassis}</div>
    </div>${close}</div>`;
}
// Asking price vs the sales SHOWN, stated as a plain fact (item 7), never a valuation. Returns "" when
// no asking price or no priced sales. Compares the seller's ask to the hammer figures on the cards.
function _askingVsSalesLine(hammers,familyCount,familyLabel){
  // Item 2: use the SAME parser the header/confirm use (parseAskingPrice), so "22" reads as $22,000
  // everywhere. The old ad-hoc parse only multiplied on a k/m suffix, so "22" stayed $22 and the
  // above/below wording flipped.
  const n=(typeof parseAskingPrice==="function")?parseAskingPrice(sellState.price):null;
  if(!n||!(n>0)) return "";
  const esc=escapeHtml, money=moneyShort, ask=money(Math.round(n));
  // Item 3: the ask comparison is only honest against the TRIM-FAMILY pool. With fewer than three
  // family sales there is no pool to compare against, so say that and nothing else - never a stray
  // "1 of 1 sold below it" that reads as a valuation on a single receipt.
  const fc=Number(familyCount);
  if(Number.isFinite(fc)&&fc<3){
    return `<p style="font-size:13.5px;line-height:1.55;color:#171717;margin:14px 0 0"><span style="font-weight:600">Too few ${esc(familyLabel||"comparable")} sales to compare against your ask.</span></p>`;
  }
  const hs=(hammers||[]).filter(x=>Number(x)>0).sort((a,b)=>a-b);
  if(!hs.length) return "";
  let fact;
  const lead1=hs.length===1?"The one sale shown was":"Every sale shown was";   // single-sale wording (item 4)
  if(n>hs[hs.length-1]) fact=`${lead1} below your ${ask} ask.`;
  else if(n<hs[0]) fact=`${lead1} above your ${ask} ask.`;
  else { const below=hs.filter(x=>x<n).length; fact=`Your ${ask} ask sits within the sales shown; ${below} of ${hs.length} sold below it.`; }
  return `<p style="font-size:13.5px;line-height:1.55;color:#171717;margin:14px 0 0"><span style="font-weight:600">${esc(fact)}</span> A fact about the sales, not a price for this car.</p>`;
}
function _hcHouseBlock(h,ctx){
  const esc=escapeHtml, money=moneyShort;
  const badge=ctx.isLead?(ctx.asap?"Soonest sale":"Sam's pick"):"";
  const shown=(h.receipts||[]).slice(0,3);
  const receipts=shown.map(r=>_hcReceiptRow(r,ctx.modelLabel)).join("");
  // Inferred-room hedge (two-fact): for houses whose room is NOT in the data, name the room from the
  // published calendar as a separate, hedged fact, never merged into the sale claim above. The note
  // must match the MONTH of the sales actually SHOWN (item 6): loop over the displayed receipts only,
  // never the trailing unshown ones (a not-shown May sale must not caption three shown July sales).
  // Item 5 (Oct 2026): the inferred-room hedge ("By the published calendar, the March sale is typically
  // Amelia Island, confirm with...") is dropped. A room is stated ONLY when it is in the sale record
  // (room.source==="data", rendered inline by _hcRoomLabel as " · {room}"); an inferred room says nothing.
  const infLine="";
  // Next sale + approximate consignment window (say nothing if unknown).
  let next="";
  if(h.nextSale){
    const ns=h.nextSale;
    next=`<div style="margin:10px 0 0;padding:10px 12px;background:rgba(11,92,62,.05);border-radius:9px;font-size:12.5px;color:#3a463f">
      <span style="font-weight:700">Next at ${esc(h.display)}:</span> ${esc(ns.city)}, ${esc(ns.monthName)} ${ns.year}${ns.intl?" (international)":""}. <span style="opacity:.8">${esc(ns.consignApprox)}.</span></div>`;
  }
  const badgeHtml=badge?`<span style="display:inline-block;font:700 10px/1 monospace;letter-spacing:.09em;text-transform:uppercase;color:#0b5c3e;background:rgba(11,92,62,.09);padding:5px 8px;border-radius:5px;margin-bottom:8px">${esc(badge)}</span><br>`:"";
  return `<div style="margin:16px 0 0;padding:16px 18px;border:1px solid ${ctx.isLead?"rgba(11,92,62,.34)":"rgba(0,0,0,.1)"};border-radius:14px;background:#fffdf9">
    ${badgeHtml}<h3 style="margin:0;font:800 20px/1.1 Georgia,serif;letter-spacing:-.01em">${esc(h.display)}</h3>
    <div style="margin:9px 0 0">${receipts}</div>
    ${infLine}
    ${next}
  </div>`;
}
// Returns true if it rendered. eraBand=true frames it as the wider-market (class-era) read.
function renderHouseComparisonSell(msgs,hc,decisionData,opts){
  opts=opts||{};
  if(!hc||!Array.isArray(hc.houses)||!hc.houses.length)return false;
  const esc=escapeHtml, money=moneyShort;
  const v=sellState.resolvedVehicle||decisionData.vehicle||{};
  const modelLabel=[v.model,v.trim].filter(Boolean).join(" ")||v.make||"this car";
  const carLbl=[v.year,v.make,v.model,v.trim].filter(Boolean).join(" ")||modelLabel;
  const asap=!!hc.asap;
  // Item 7: the headline scope must MATCH the pool scope. The house pool reads the trim family across
  // its production years (a 1997 GT2 R comp set includes 1996 cars), so a year-anchored "No 1997 X"
  // headline over a multi-year pool is a scope mismatch. When the shown pool spans years other than
  // the seller's, drop the year and name the family ("No Porsche 911 GT2 R has sold...").
  const poolYears=[...new Set([].concat.apply([],hc.houses.map(h=>(h.receipts||[]).map(r=>Number(r.year)).filter(Boolean))))];
  const spansYears=poolYears.length>1||(poolYears.length===1&&v.year&&poolYears[0]!==Number(v.year));
  const carLblFamily=[v.make,v.model,v.trim].filter(Boolean).join(" ")||modelLabel;
  const headLbl=spansYears?carLblFamily:carLbl;
  let houses=hc.houses.slice();
  if(asap&&hc.asapLead){houses.sort((a,b)=>((b.slug===hc.asapLead)-(a.slug===hc.asapLead)));}
  // Item 2: a "Sam's Pick" only appears when a house LEADS on at least 2 family sales in the window.
  // When every house has one sale there is no leader, so show the houses in date order (most recent
  // first) with NO pick, and the headline states what happened. ASAP keeps its own soonest-sale lead.
  const totalSales=houses.reduce((s,h)=>s+(Number(h.count)||0),0);
  const maxHouseCount=houses.reduce((m,h)=>Math.max(m,Number(h.count)||0),0);
  const oneSale=totalSales===1;
  const hasPick=asap||maxHouseCount>=2;
  if(!hasPick){houses.sort((a,b)=>String(b.mostRecent||"").localeCompare(String(a.mostRecent||"")));}
  const pick=houses[0];
  const pickName=pick.display;
  const others=houses.slice(1).map(h=>h.display);
  const NUMWORD=["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve"];
  const countWord=n=>NUMWORD[n]||String(n);
  const familyLabel2=(v.trim&&String(v.trim).trim())?String(v.trim).trim():modelLabel;
  // "one at Bonhams and one at RM Sotheby's" - each house with its own count, no pick implied.
  const perHouseList=listJoin(houses.map(h=>`${countWord(Number(h.count)||0)} at ${esc(h.display)}`));
  // "{N} {family}s have sold at auction in the last three years, one at X and one at Y." (no-pick, multi)
  const auctionSentence=`${esc(countWord(totalSales).charAt(0).toUpperCase()+countWord(totalSales).slice(1))} ${esc(familyLabel2)}${totalSales===1?"":"s"} ${totalSales===1?"has":"have"} sold at auction in the last three years, ${perHouseList}.`;
  const recency=pick.mostRecent?`, most recently in ${_thinMonthLabel(pick.mostRecent)}`:"";
  const recency1=pick.mostRecent?`, in ${_thinMonthLabel(pick.mostRecent)}`:"";   // single-sale: no "most recently"
  // Hammer clause ONLY when the pick is also top by median (a true record statement, never a promise).
  const topMedian=houses.reduce((m,h)=>Math.max(m,h.median||0),0);
  const hammerClause=(hasPick&&!asap&&pick.median===topMedian&&houses.length>1)?" Its hammer results are the strongest of the group, too.":"";
  const othersClause=(hasPick&&others.length)?` ${listJoin(others)} ${others.length===1?"has":"have"} sold them too. Here's what ${others.length===1?"it":"each"} got.`:"";
  let lead;
  if(eraBandNote(opts)){
    lead=hasPick
      ? `No ${esc(headLbl)} has sold in the last three years, so this is the wider ${esc(v.make||"")} market at the houses, not your exact car. ${esc(pickName)} has handled these most often${recency}.${othersClause}`
      : `No ${esc(headLbl)} has sold in the last three years, so this is the wider ${esc(v.make||"")} market at the houses, not your exact car. ${auctionSentence}`;
  } else if(opts.noOnline){
    // The model resolved but has NO online sales. Say so plainly; then, with a pick, lead with the house
    // that leads on the record; without a pick, state the count and name each house (single-sale wording
    // on one sale: never "have gone" / "has sold them too"). Item 2.
    lead=oneSale
      ? `No ${esc(headLbl)} has sold on the online platforms we track. The only one to sell at auction went to ${esc(pickName)}${recency1}.`
      : hasPick
        ? `No ${esc(headLbl)} has sold on the online platforms we track. ${esc(pickName)} is where ${esc(modelLabel)}s have gone instead${recency}.${hammerClause}${othersClause}`
        : `No ${esc(headLbl)} has sold on the online platforms we track. ${auctionSentence}`;
  } else if(asap){
    lead=`You told me you want to move quickly, so I'm leading with the soonest sale, not the strongest record. Every house below has taken ${esc(modelLabel)}s; here's the record, and when each one next runs.`;
  } else if(oneSale){
    lead=`The only recent ${esc(headLbl)} to sell went to ${esc(pickName)}${recency1}.`;
  } else if(hasPick){
    lead=`${esc(modelLabel)}s have gone to ${esc(pickName)} more than to any other house over the last three years${recency}.${hammerClause}${othersClause}`;
  } else {
    lead=auctionSentence;
  }
  // Item 5 (Oct 2026): the next sale is stated ONCE, inside each house's card ("Next at {house}: ...").
  // The old above-the-cards timing paragraph duplicated the pick's next sale, so it is removed.
  const timing="";
  const blocks=houses.map((h,i)=>_hcHouseBlock(h,{isLead:hasPick&&i===0,asap,modelLabel})).join("");
  // Item 7: asking price vs the sales SHOWN, as a plain fact. Uses the same displayed receipts (top 3
  // per house) the cards render, so the statement is computed from the same pool the seller sees.
  const shownHammers=[].concat.apply([],houses.map(h=>(h.receipts||[]).slice(0,3).map(r=>r.hammer)));
  // Item 3: the ask comparison runs against the TRIM-FAMILY pool only (post item-1/2 fencing, the
  // receipts ARE the family). Gate on the full family pool size, labelled by the car's own trim.
  const familyCount=Number(hc.totalHouse)||houses.reduce((s,h)=>s+(Number(h.count)||0),0);
  const familyLabel=(v.trim&&String(v.trim).trim())?v.trim:modelLabel;
  const askLine=_askingVsSalesLine(shownHammers,familyCount,familyLabel);
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#928b7a;margin-bottom:6px">Which house, which sale, when</div>
    <p style="font-size:15.5px;line-height:1.55;color:#171717;margin:0">${lead}</p>
    ${timing}
    ${blocks}
    ${askLine}
    ${opts.onlineCardHtml?`<div class="pv2-bridge" style="margin-top:18px">If you'd rather run the sale yourself instead of consigning, here's where I'd go.</div>${opts.onlineCardHtml}`:""}
    <p style="font-size:12px;color:#928b7a;margin-top:16px;line-height:1.5">${hasPick?`Ranked by the record: how often ${esc(modelLabel)}s have gone to each house, how recently, and the hammer results shown.`:`The record for each house: when ${esc(modelLabel)}s have sold and the hammer results shown, in date order.`} Consignment windows are approximate, confirm with the house. Real completed sales, hammer prices with the buyer premium backed out. No estimates, no valuations.</p>
    <div class="sam-text after-results">Ask me anything about the recommendation, or tell me more about the car.</div>
  </div></div>`;
  sellState.sellOptions=[];
  // Record what actually rendered so the post-result chat has the SAME facts on screen (items 1-2):
  // the ranked houses, each next sale, the shown receipts and the asking-price fact. Without this the
  // chat received none of the house content and denied mentioning houses / invented a platform.
  sellState.renderedHouseComparison={
    eraBand:!!eraBandNote(opts), asap:!!asap, carLabel:headLbl, modelLabel:modelLabel,
    noPick:!hasPick, pick:hasPick?pickName:null, others:others.slice(),
    houses:houses.map(h=>({
      name:h.display,
      nextSale:h.nextSale?`${h.nextSale.city}, ${h.nextSale.monthName} ${h.nextSale.year}${h.nextSale.intl?" (international)":""}`:null,
      sales:(h.receipts||[]).slice(0,3).map(r=>`${cleanReceiptTitleForCard(r.title)||[r.year,r.model].filter(Boolean).join(" ")} ${money(r.hammer)}${r.date?" ("+(_thinMonthLabel(r.date)||"")+")":""}`)
    })),
    askingLine:(function(){const n=(typeof parseAskingPrice==="function")?parseAskingPrice(sellState.price):null;if(!n||!(n>0))return null;if(Number.isFinite(familyCount)&&familyCount<3)return`Too few ${familyLabel||"comparable"} sales to compare against the seller's ${money(Math.round(n))} ask.`;const hs=[].concat.apply([],houses.map(h=>(h.receipts||[]).slice(0,3).map(r=>r.hammer)));const f=hs.filter(x=>Number(x)>0).sort((a,b)=>a-b);if(!f.length)return null;const L=f.length===1?"The one sale shown was":"Every sale shown was";if(n>f[f.length-1])return`${L} below the seller's ${money(Math.round(n))} ask.`;if(n<f[0])return`${L} above the seller's ${money(Math.round(n))} ask.`;return`The seller's ${money(Math.round(n))} ask sits within the sales shown.`;})()
  };
  msgs.appendChild(row);
  row.scrollIntoView({behavior:"smooth",block:"start"});
  return true;
}
function eraBandNote(opts){return !!(opts&&opts.eraBand);}
function monthsFromToday(ns){const t=new Date();return (ns.year-t.getUTCFullYear())*12+(ns.month-(t.getUTCMonth()+1));}

// CLASS-ERA rung on /sell (Part 1). The exact model has not sold in three years; this is the
// same-marque decade era band, rendered as a COARSE fallback, labelled plainly as the wider
// market and never as a price for the exact car (rule 17). Same receipt discipline as thin mode.
function renderClassEraSell(msgs,ce,decisionData){
  const esc=escapeHtml;
  const money=(typeof moneyShort==="function")?moneyShort:(n=>"$"+Math.round(Number(n)||0).toLocaleString("en-US"));
  const v=sellState.resolvedVehicle||decisionData.vehicle||{};
  const carName=[v.year,v.make,v.model,v.trim].filter(Boolean).join(" ")||((typeof cleanCarForCopy==="function")?cleanCarForCopy():"your car");
  const recs=(ce.receipts||[]).slice().filter(r=>Number(r.hammer)>0);
  if(!recs.length){return false;}
  const sorted=recs.slice().sort((a,b)=>a.hammer-b.hammer);
  // rangeSuppressed (engine wide-band guard): the class-era band was too wide to be an honest "typical"
  // range (high > 3x low) and no narrower pool was found - NEVER backfill a range from the raw receipts
  // in that case, or the suppression is silently defeated. Show the plain statement + the ask instead.
  const classPlural=bodyClassPlural(v);
  let line;
  if(ce.rangeSuppressed){
    const ask=ce.askNarrow&&ce.askNarrow.question?" "+ce.askNarrow.question:"";
    line=`No ${esc(carName)} has sold in the last three years, and the wider ${esc(ce.era)} ${esc(ce.make)} ${esc(classPlural)} market is too spread out to mark a typical range. ${esc(ce.suppressReason||"")}${esc(ask)}`;
  } else {
    const lo=(ce.lowHammer!=null?ce.lowHammer:sorted[0].hammer),hi=(ce.highHammer!=null?ce.highHammer:sorted[sorted.length-1].hammer);
    // Item 1b: the pool is filtered to a body class, so NAME it ("1980s Dodge trucks", not "market").
    line=`No ${esc(carName)} has sold in the last three years, so this is the wider ${esc(ce.era)} ${esc(ce.make)} ${esc(classPlural)} market, not your exact car. ${ce.totalN} sold; most landed between ${money(lo)} and ${money(hi)}, the middle around ${money(ce.medianHammer)}.`;
  }
  // Item 4: state the fact only, never call the exact car "rare". Item 5: the "none sold" fact is
  // already in `line` above, so it is NOT repeated here.
  const read=`Treat these as the neighborhood it sits in, not a figure for it. The moment one like yours sells, I can read it directly.`;
  // Item 3 (self-sell = online only): a self-seller lists it themselves, so the SHOWN cards are ONLINE
  // sales only, matching the "houses left out" line below. Auction-house receipts never appear here.
  const onlineRecs=recs.filter(r=>!r.isHouse);
  const houseN=recs.length-onlineRecs.length;
  // Item 2: show the sales in the engine's RELEVANCE order (assessClassEra ranks by same-model, then
  // year proximity, then recency), NEVER re-sorted by price. The old ".reverse().slice(0,6)" showed the
  // six PRICIEST, which fell outside the stated band.
  const shown=(onlineRecs.length?onlineRecs:recs).slice(0,6);
  const list=shown.map(rc=>{
    const link=rc.url?`<a href="${esc(rc.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;border-bottom:1px solid rgba(0,0,0,.18)">${esc(rc.venue)}</a>`:esc(rc.venue);
    const mi=Number(rc.mileage)>0?` · ${Number(rc.mileage).toLocaleString()} mi`:"";
    // Card shows the record's OWN title (standing rule), not the seller's typed model.
    const own=cleanReceiptTitleForCard(rc.title)||[rc.year,rc.model].filter(Boolean).join(" ")||"";
    return `<li style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-top:1px solid rgba(0,0,0,.08)"><span>${esc(own)} ${link}${mi}</span><span style="font-variant-numeric:tabular-nums;font-weight:600">${money(rc.hammer)}</span></li>`;
  }).join("");
  // Item 5 (self-sell answer): rank the ONLINE places that have sold this class, by count then recency,
  // counts shown. Houses excluded (self-seller); a one-line note when the class also sold at houses.
  const vmap={};
  for(const r of onlineRecs){const k=(typeof platformDisplayName==="function"?platformDisplayName(r.slug||r.source):null)||r.venue||"Online";const d=String(r.date||"").slice(0,10);(vmap[k]||(vmap[k]={venue:k,count:0,recent:""}));vmap[k].count++;if(d>vmap[k].recent)vmap[k].recent=d;}
  const venues=Object.values(vmap).sort((a,b)=>b.count-a.count||b.recent.localeCompare(a.recent)).slice(0,5);
  let venueBlock="";
  if(venues.length){
    const rows=venues.map(x=>`<li style="display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-top:1px solid rgba(0,0,0,.08)"><span>${esc(x.venue)}</span><span style="color:#6b6861;font-size:13px">${x.count} sold${x.recent?` · latest ${esc(_thinMonthLabel(x.recent)||"")}`:""}</span></li>`).join("");
    venueBlock=`<div class="pcard-whyl pcard-whyl-main" style="margin-top:16px">Where to list it yourself</div>`
      +`<p class="pcard-lead">Since you're selling it yourself, here are the online platforms that have actually sold ${esc(ce.era)} ${esc(ce.make)} ${esc(bodyClassPlural(v))}, most active first.</p>`
      +`<ul style="list-style:none;margin:8px 0 0;padding:0">${rows}</ul>`
      +(houseN>0?`<p class="pcard-lead" style="opacity:.7;font-size:12.5px;margin-top:8px">Auction houses have taken ${houseN} of these too; I've left them out here since you told me you'll run the sale yourself.</p>`:"");
  }
  // Asking-price fact (item 5), from the sales SHOWN.
  const askLine=(typeof _askingVsSalesLine==="function")?_askingVsSalesLine(shown.map(r=>r.hammer)):"";
  sellState.sellOptions=[];
  // Chat memory for the class-era read a DIY seller sees: the wider-market sales shown (relevance
  // order) + the online venue ranking. No consignment calendar is shown here.
  sellState.renderedClassEra={
    carLabel:carName, era:ce.era, make:ce.make,
    sales:shown.map(rc=>`${cleanReceiptTitleForCard(rc.title)||[rc.year,rc.model].filter(Boolean).join(" ")} ${money(rc.hammer)} at ${rc.venue}`),
    onlineVenues:venues.map(x=>`${x.venue} (${x.count} sold)`), houseN:houseN
  };
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    <div class="pcard">
      <div class="pcard-left">
        <div class="pcard-script">Here's the honest read for your</div>
        <h1 class="pcard-name">${esc(carName)}</h1>
        <div class="pcard-whyl pcard-whyl-main">The wider ${esc(ce.era)} ${esc(ce.make)} ${esc(classPlural)} market</div>
        <p class="pcard-lead">${line}</p>
        <p class="pcard-lead">${read}</p>
        <div class="pcard-whyl pcard-whyl-main">${esc(ce.era)} ${esc(ce.make)} ${esc(classPlural)} sales, last three years</div>
        <ul style="list-style:none;margin:8px 0 0;padding:0">${list}</ul>
        ${askLine||""}
        ${venueBlock}
        <p class="pcard-lead" style="opacity:.6;font-size:12px;margin-top:14px">Real completed sales, hammer prices with the buyer premium backed out.</p>
      </div>
    </div>
  </div></div>`;
  msgs.appendChild(row);
  row.scrollIntoView({behavior:"smooth",block:"start"});
  return true;
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

// Zero-evidence card in the CURRENT V2 design (Aug 2026). Shares the pcard chrome
// with the evidence-backed pick (green "Sam's Pick" badge, pcard-name, pcard-cta,
// reassurance) so a no-comps result never drops back to the old sell-rec styling.
// It deliberately OMITS the analysis window/scope metadata (there is no analysis to
// report) and states policy fit honestly instead. Covers both entry points
// (make-only/unresolved and resolved-but-no-evidence). The CTA and whole-card click
// go straight to the platform when it is self-listable (outboundGo), never the lead
// form; only PowerSeller destinations capture a lead.
function renderNoEvidenceFallback(fallback){
  if(!fallback)return "";
  const esc=escapeHtml;
  const v=sellState.resolvedVehicle||sellState.sellDecision?.vehicle||{};
  const name=fallback.primary;
  const slug=String(fallback.primarySlug||"").toLowerCase();
  const car=cleanCarForCopy();
  const carLbl=(typeof v2CarDisplay==="function")?v2CarDisplay(v):([v.year,v.make,v.model].filter(Boolean).join(" ")||car);
  const loc=[sellState.state,sellState.region].filter(Boolean)[0]||"US";
  const svg=(k,c)=>(typeof v2Svg==="function")?v2Svg(k,c):"";
  const pin=(typeof psvSvg==="function")?psvSvg("pin"):(svg("car"));
  const outbound=slug&&typeof hasOutboundSubmission==="function"&&hasOutboundSubmission(slug);
  const primaryCta=outbound?`outboundGo('${esc(slug)}','pick')`:`chooseFallbackDestination('${esc(name)}')`;
  const secSlug=String(fallback.secondarySlug||"").toLowerCase();
  const secOutbound=secSlug&&typeof hasOutboundSubmission==="function"&&hasOutboundSubmission(secSlug);
  const secCta=secOutbound?`outboundGo('${esc(secSlug)}','alt')`:`chooseFallbackDestination('${esc(fallback.secondary||"")}')`;
  // No comparable sales exist for this car, so this is NOT a pick and there is NO listing button
  // (item 6: never a pick or a listing CTA without sales behind it). State the honest no-data position
  // and, at most, name where cars of this kind GENERALLY go as directional context, clearly not a pick.
  const dirNote=name?`Cars like this generally list on <b>${esc(name)}</b>${fallback.secondary?` or ${esc(fallback.secondary)}`:""}, but that's a general steer, not a pick for your car.`:"";
  return `<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    <div class="pcard">
      <div class="pcard-left">
        <div class="pcard-script">Here's the honest read for your</div>
        <h1 class="pcard-name">${esc(carLbl||v.make||car||"car")}</h1>
        <p class="pcard-lead">I don't have comparable recent sales for this exact car in my data, so I can't point you to a venue on evidence yet, and I won't guess one.</p>
        ${dirNote?`<p class="pcard-lead">${dirNote}</p>`:""}
        <p class="pcard-lead" style="opacity:.7;font-size:12.5px;margin-top:10px">The moment one like it sells, I can read it directly and back a recommendation with real sales.</p>
      </div>
    </div>
    <div class="sam-text after-results">Tell me more about the car, or try another and I'll pull what actually sold.</div>
  </div></div>`;
}

// Legacy sell-rec fallback markup retired Aug 2026 (replaced by the V2 pcard above).
function renderNoEvidenceFallbackLegacy(fallback){
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
        <div class="sell-rec-reason-label">Why Sam would start here</div>
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
    // Slug marks this as a PLATFORM destination so a confirm (card, button, or typed
    // chat) routes straight to the platform via outboundGo, never the lead form.
    platformSlug:fallback.primarySlug||null,
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
  const option=sellState.sellOptions.find(o=>o.key===which)||sellState.sellOptions[0];
  // A PLATFORM destination goes straight to the platform (new tab), exactly like the
  // card's own CTA. It never opens the lead form: nobody "reaches you directly" for a
  // self-serve platform, so that intro made no sense there (the reported bug). Only a
  // genuine PowerSeller destination captures a lead. Platform options carry
  // platformSlug; PowerSeller options are key "specialist" with observedSellers. This
  // guards BOTH the typed-chat confirm ("go with Bring a Trailer") and the
  // zero-evidence fallback button, which both land here via chooseFallbackDestination.
  const isPowerSeller=!!(option&&(option.key==="specialist"||(option.observedSellers&&option.observedSellers.length)));
  const slug=option&&String(option.platformSlug||option.slug||"").toLowerCase();
  if(!isPowerSeller&&slug&&typeof hasOutboundSubmission==="function"&&hasOutboundSubmission(slug)){
    sellState.chosen=which;
    addMsg("user",`Go with ${option.name}`);
    if(typeof outboundGo==="function")outboundGo(slug,"chat");
    return;
  }
  sellState.chosen=which;sellState.step=13;
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
  if(typeof gasJourneyEvent==="function")gasJourneyEvent("powerseller_intro_clicked",{vehicle:sellState.resolvedVehicle,powersellerId:id,dedupKey:String(id||"")});  // business journey
  // Route straight to PowerSeller lead capture. Do NOT go through chooseSellOption's
  // option lookup (Aug 2026 fix): when the gate is eligible but the seller's preference
  // is not "powerseller", sellState.sellOptions has no key:"specialist" entry (that is
  // built only for the powerseller-preference layout and pushed for the secondary
  // layout), so the lookup fell back to sellOptions[0] (a platform) and fired an
  // outbound handoff instead of capturing the lead - the seller was silently sent to
  // the platform and no lead/intro_requested ever recorded. An intro click ALWAYS means
  // "capture this lead", so it must reach showContactForm unconditionally. submitLead
  // keys the destination off selectedPowerSeller, so a missing specialist sellOption is
  // fine.
  if(sellState.chosen)return; // double-fire guard, matches chooseSellOption
  sellState.chosen="specialist";sellState.step=13;
  const profile=(sellState.powerSellerProfiles||[]).find(p=>p.id===id);
  addMsg("user",`Go with ${profile?.displayName||"this specialist"}`);
  setTimeout(()=>showContactForm(),600);
}

function showContactForm(){
  sellState.step=13;
  hideHero();
  // Personalize for a PowerSeller destination: the partner's FIRST name + the car, so the
  // ask reads as "so Ingo can reach you about your 2022 911 Carrera". Platform destinations
  // keep the generic line (no single partner reaches out).
  const selectedPowerSeller=(sellState.powerSellerProfiles||[]).find(profile=>profile.id===sellState.selectedPowerSellerId);
  const psFirst=String(selectedPowerSeller?.displayName||"").trim().split(/\s+/)[0];
  // Signed-in seller: we already hold their account email plus the full car/journey
  // context, so send the intro IMMEDIATELY - no form (funnel data showed intros stalling
  // at the contact form, including signed-in users whose email we already have).
  const acctEmail=(typeof authAccount==="function"&&authAccount()&&authAccount().email)||null;
  if(typeof authIsSignedIn==="function"&&authIsSignedIn()&&acctEmail){
    submitLead({email:acctEmail,phone:null});
    return;
  }
  // Anonymous seller: ONE email field (phone dropped from this flow - the partner can
  // ask directly), then send on submit.
  // Funnel visibility (Sep 2026): the email-capture step for anonymous sellers is the
  // single most convertible drop point - someone who clicks the intro and then balks at
  // the email ask. Signed-in sellers skip this form entirely (immediate submit above),
  // so this event fires ONLY on the anonymous path. Abandonment is then the aggregate
  // gap between this event and powerseller_intro_requested (the actual lead).
  if(typeof gasJourneyEventOnce==="function")gasJourneyEventOnce("powerseller_contact_form_shown",{vehicle:sellState.resolvedVehicle,powersellerId:sellState.selectedPowerSellerId||null});
  const carLabel=escapeHtml(sellState.carName||"car");
  const intro=selectedPowerSeller&&psFirst
    ? `Last thing, so ${escapeHtml(psFirst)} can reach you about your ${carLabel}. What's the best email?`
    : `Last thing, so they can reach you directly. What's the best email?`;
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    <div class="sam-text">${intro}</div>
    <div class="contact-form">
      <div class="contact-group">
        <div class="contact-label">Email address</div>
        <input class="contact-input" type="email" id="sellEmail" placeholder="you@example.com">
      </div>
    </div>
    <div class="chips" style="margin-top:10px">
      <button class="chip" style="border-color:#171717;color:#171717;font-weight:800" onclick="submitContactForm()">Send &rarr;</button>
    </div>
  </div></div>`;
  msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
  const inp=document.getElementById("sellEmail");if(inp)inp.focus();
}

function submitContactForm(){
  const email=document.getElementById("sellEmail")?.value?.trim();
  if(!email||!email.includes("@")){
    const input=document.getElementById("sellEmail");
    if(input){input.style.borderColor="#dc2626";input.focus();}
    return;
  }
  addMsg("user",email);
  submitLead({email,phone:null});
}

// Sends the lead payload (byte-identical to the old form submit; phone is now always
// null - dropped from this flow, the partner can ask directly) and renders the
// confirmation. Called immediately for a signed-in seller (email already on file) and
// via submitContactForm for an anonymous seller.
async function submitLead(seller){
  if(sellState.leadSubmitting)return;
  sellState.leadSubmitting=true;
  const email=seller.email, phone=seller.phone||null;
  sellState.email=email;sellState.phone=phone;

  const option=sellState.sellOptions.find(o=>o.key===sellState.chosen)||sellState.sellOptions[0]||{name:"the selected destination",type:null,key:sellState.chosen};
  const selectedPowerSeller=(sellState.powerSellerProfiles||[]).find(profile=>profile.id===sellState.selectedPowerSellerId);
  const destinationName=selectedPowerSeller?.displayName||option.name;
  try{
    const res=await fetch(apiPath("/api/submitSellerLead"),{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        journeyId:(typeof gasJourneyId==="function"?gasJourneyId(sellState.resolvedVehicle):null),
        anonId:(typeof gasAnonId==="function"?gasAnonId():null),
        seller:{email,phone},
        car:{
          raw:sellState.carName,
          // VIN (when the journey was VIN-sourced): forwarded so it reaches the partner
          // email + seller_leads. Was previously never sent, so the VIN never landed.
          vin:(sellState.resolvedVehicle&&sellState.resolvedVehicle.vin)||null,
          region:sellState.region,
          state:sellState.state,
          mileage:sellState.mileage,
          condition:sellState.condition,
          serviceRecords:sellState.records,
          title:sellState.title,
          targetPrice:sellState.price,
          timeline:sellState.timeline,
          involvement:sellState.involvement,
          sellerPreference:sellState.sellerPreference,
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
          // Exact-VIN archive match (VIN feature 4c): forwarded so the partner email can
          // carry the prior-auction link when a match exists. Was never sent, so the
          // backend's priorSaleUrl (decision.vinArchiveMatch.url) was always null.
          vinArchiveMatch:sellState.sellDecision?.vinArchiveMatch||null,
          selectedOption:option
        }
      })
    });
    const data=await res.json();
    // Partner re-validation (scenario 7): a re-opened historical card can point at a
    // partner since removed from the roster. The server recorded nothing; tell the seller
    // plainly and point them at a fresh run. Never a hard error, never a fake confirmation.
    if(data&&data.status==="partner_unavailable"){
      sellState.leadSubmitting=false;
      const pname=data.partner||"That specialist";
      setTimeout(()=>addMsg("sam",`${escapeHtml(pname)} is no longer available. Re-run this search for Sam's current recommendation.`),300);
      return;
    }
    if(!res.ok)throw new Error(data.error||"submission failed");
    setTimeout(()=>showSubmission(data),600);
  }catch(e){
    sellState.leadSubmitting=false;
    setTimeout(()=>addMsg("sam",`I couldn't submit this yet: ${e.message}. Your recommendation is still here, but I don't want to pretend the lead went through.`),500);
  }
}

function showSubmission(submission){
  const option=sellState.sellOptions.find(o=>o.key===sellState.chosen)||sellState.sellOptions[0]||{name:"the selected destination"};
  const selectedPowerSeller=(sellState.powerSellerProfiles||[]).find(profile=>profile.id===sellState.selectedPowerSellerId);
  const destinationName=selectedPowerSeller?.displayName||option.name;
  const ref=submission?.reference||"Pending";
  const isPS=!!selectedPowerSeller;
  const psFirst=String(selectedPowerSeller?.displayName||destinationName||"").trim().split(/\s+/)[0];
  sellState.step=14;
  hideHero();
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.className="row sam";
  // PowerSeller: a loop-closing "Sent." line (partner FIRST name + the email just entered
  // + the single-destination reassurance), with the reference number demoted to a quiet
  // line below. Platform: keep the existing card, only the unverified "within 24 hours"
  // timeframe claim stripped (a fuller platform-confirmation rethink is a post-launch
  // follow-up). No timeframe claim in either branch (no verified per-partner data).
  const body=isPS
    ? `<div class="sam-text">Sent. ${escapeHtml(psFirst)} will reach out to you directly at ${escapeHtml(sellState.email)}. That's the only place your details go.</div>
       <div style="font-size:12.5px;color:#8C877C;margin-top:8px">Reference ${escapeHtml(ref)}</div>`
    : `<div class="sam-text">We're submitting your ${escapeHtml(sellState.carName||"car")} to ${escapeHtml(destinationName)}. Here's your reference number.</div>
       <div class="ref-card">
         <div class="ref-label">Reference number</div>
         <div class="ref-number">${escapeHtml(ref)}</div>
         <div class="ref-detail">Your submission has been sent to ${escapeHtml(destinationName)}. They'll be in touch at ${escapeHtml(sellState.email)}. Keep this reference number handy.</div>
       </div>`;
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    ${body}
    <div class="sam-text" style="margin-top:8px">Would you like to sell another car?</div>
    <div class="chips">
      <button class="chip" onclick="handleChip('Yes sell another car')">Yes, sell another car</button>
      <button class="chip" onclick="handleChip('No thanks')">No thanks</button>
    </div>
  </div></div>`;
  msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
  // Post-send upsell modal (PowerSeller only): after the lead + its email already went,
  // offer to add an optional VIN / note that fires a second email to the partner.
  sellState.leadReference=ref;
  if(isPS)setTimeout(()=>openLeadDetailsModal(),450);
}

// Post-send modal: optional VIN + note the seller can add for the partner. Reuses the
// shared hp-dialog scrim/card. Gender-safe pronouns via psvPron (the reassurance-line
// helper). Skip / dismiss / empty-submit all close with no action.
function openLeadDetailsModal(){
  const selectedPowerSeller=(sellState.powerSellerProfiles||[]).find(profile=>profile.id===sellState.selectedPowerSellerId);
  const first=String(selectedPowerSeller?.displayName||"").trim().split(/\s+/)[0]||"the specialist";
  const partner=(sellState.partnerReferral&&sellState.partnerReferral.partner)||null;
  const pron=(typeof psvPron==="function")?psvPron(partner):{subj:"they",obj:"them"};
  const rv=sellState.resolvedVehicle||{};
  const carLabel=[rv.year,rv.make,rv.model].filter(Boolean).join(" ")||sellState.carName||"your car";
  const btnStyle="flex:1;padding:11px 14px;font-family:var(--font-sans);font-size:14px;font-weight:600;border:1px solid #171717;border-radius:10px;background:var(--paper);color:#171717;cursor:pointer;";
  const existing=document.getElementById("lead-details-modal");if(existing&&existing.remove)existing.remove();
  const scrim=document.createElement("div");
  scrim.className="hp-dialog-scrim";scrim.id="lead-details-modal";
  scrim.onclick=e=>{if(e.target===scrim)dismissLeadDetails();};
  scrim.innerHTML=`<div class="hp-dialog" style="max-width:400px;text-align:left">
    <h3 style="text-align:left">Sent!</h3>
    <p style="text-align:left;margin-bottom:12px">Your details and ${escapeHtml(carLabel)} have been sent to ${escapeHtml(first)}, ${escapeHtml(pron.subj)}'ll reach out to you directly.</p>
    <p style="text-align:left;margin-bottom:14px">Want to make it easier for ${escapeHtml(pron.obj)}? You can optionally add your VIN or a quick note about the car.</p>
    <input id="lead-vin" class="auth-input" type="text" placeholder="VIN (optional)" style="margin-bottom:10px" />
    <textarea id="lead-note" class="auth-input" rows="3" placeholder="Anything else ${escapeHtml(first)} should know?" style="resize:vertical;margin-bottom:16px"></textarea>
    <div style="display:flex;gap:10px">
      <button style="${btnStyle}" onclick="submitLeadDetails()">Send extra details</button>
      <button style="${btnStyle}" onclick="dismissLeadDetails()">Skip</button>
    </div>
  </div>`;
  document.body.appendChild(scrim);
  // Telemetry: the modal actually rendered. One outcome (submitted OR skipped) follows.
  sellState.leadDetailsResolved=false;
  if(typeof gasJourneyEvent==="function")gasJourneyEvent("additional_details_shown",{vehicle:sellState.resolvedVehicle,powersellerId:sellState.selectedPowerSellerId||null,dedupKey:"ad_shown:"+(sellState.leadReference||"")});
  const v=document.getElementById("lead-vin");if(v){try{v.focus();}catch(e){}}
}

function closeLeadDetailsModal(){const m=document.getElementById("lead-details-modal");if(m&&m.remove)m.remove();}

// Methodology explainer modal (static, identical for every car, no per-search
// numbers). Opened from the result card's "Why Sam Picked This" info affordance and
// from the How Sam decides page. Same hp-dialog scrim/card pattern as the VIN
// modal; dismissible by the X, scrim click, or Escape. Fires the lightweight
// unranked methodology_viewed journey event (allowlisted in lib/_journey.js).
var METHODOLOGY_PARAS=[
  "Every recommendation starts with real sales. Sam tracks completed sales across the major enthusiast platforms, what sold, where, and for how much, recalculated as new sales close.",
  "For your vehicle, Sam looks at how cars like yours have actually performed on each platform: how many have sold, how consistently, and at what level. Volume matters, a platform with a deep track record for your kind of car counts for more than one with a couple of lucky results.",
  "Sam also weighs what you've told him: your timing, how involved you want to be, and what you're hoping to get. The recommendation balances the market evidence with your situation, and where a PowerSeller has a proven record with cars like yours, Sam says so.",
  "No platform or PowerSeller can pay to be recommended. Nothing you see is sponsored, and when the data is thin, Sam says that too, better nothing than a fake number."
];
var methodologyKeyHandler=null;
function openMethodologyModal(){
  const existing=document.getElementById("methodology-modal");if(existing&&existing.remove)existing.remove();
  const scrim=document.createElement("div");
  scrim.className="hp-dialog-scrim";scrim.id="methodology-modal";
  scrim.onclick=e=>{if(e.target===scrim)closeMethodologyModal();};
  const closeSvg='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  scrim.innerHTML='<div class="hp-dialog methodology-dialog" role="dialog" aria-modal="true" aria-labelledby="methodology-title">'
    +'<button type="button" class="methodology-close" aria-label="Close" onclick="closeMethodologyModal()">'+closeSvg+'</button>'
    +'<h3 id="methodology-title">How Sam decides</h3>'
    +METHODOLOGY_PARAS.map(p=>'<p>'+escapeHtml(p)+'</p>').join("")
    +'</div>';
  document.body.appendChild(scrim);
  methodologyKeyHandler=function(e){if(e.key==="Escape")closeMethodologyModal();};
  document.addEventListener("keydown",methodologyKeyHandler);
  if(typeof gasJourneyEvent==="function")gasJourneyEvent("methodology_viewed",{vehicle:(typeof sellState!=="undefined"?sellState.resolvedVehicle:null)||null,dedupKey:"methodology_viewed"});
}
function closeMethodologyModal(){
  const m=document.getElementById("methodology-modal");if(m&&m.remove)m.remove();
  if(methodologyKeyHandler){document.removeEventListener("keydown",methodologyKeyHandler);methodologyKeyHandler=null;}
}
// Exactly one outcome event per modal open (submitted OR skipped), deduped by lead ref.
function leadDetailsOutcome(kind){
  if(sellState.leadDetailsResolved)return;
  sellState.leadDetailsResolved=true;
  if(typeof gasJourneyEvent==="function")gasJourneyEvent("additional_details_"+kind,{vehicle:sellState.resolvedVehicle,powersellerId:sellState.selectedPowerSellerId||null,dedupKey:"ad_"+kind+":"+(sellState.leadReference||"")});
}
// Skip button / scrim dismiss / empty submit: record the skip, then close.
function dismissLeadDetails(){leadDetailsOutcome("skipped");closeLeadDetailsModal();}

async function submitLeadDetails(){
  if(sellState.leadDetailsSubmitting)return;
  const vin=String(document.getElementById("lead-vin")?.value||"").trim();
  const note=String(document.getElementById("lead-note")?.value||"").trim();
  if(!vin&&!note){dismissLeadDetails();return;}  // nothing filled = same as Skip
  sellState.leadDetailsSubmitting=true;
  const selectedPowerSeller=(sellState.powerSellerProfiles||[]).find(profile=>profile.id===sellState.selectedPowerSellerId);
  const first=String(selectedPowerSeller?.displayName||"").trim().split(/\s+/)[0]||"the specialist";
  const rv=sellState.resolvedVehicle||{};
  const carLabel=[rv.year,rv.make,rv.model].filter(Boolean).join(" ")||sellState.carName||"the car";
  try{
    await fetch(apiPath("/api/submitSellerLead"),{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        action:"additionalDetails",
        reference:sellState.leadReference||null,
        partnerSlug:selectedPowerSeller?.id||null,
        seller:{email:sellState.email},
        car:{raw:carLabel},
        vin,note,
        journeyId:(typeof gasJourneyId==="function"?gasJourneyId(sellState.resolvedVehicle):null),
        anonId:(typeof gasAnonId==="function"?gasAnonId():null)
      })
    });
  }catch(e){/* best-effort: the lead already went, so never surface a hard error here */}
  sellState.leadDetailsSubmitting=false;
  leadDetailsOutcome("submitted");
  closeLeadDetailsModal();
  setTimeout(()=>addMsg("sam",`Passed those along to ${escapeHtml(first)}.`),250);
}

