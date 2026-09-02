async function showSellRecommendation(opts){
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
      :sellState.sellerPreference==="diy"?"selling it myself"
      :"deciding how to sell";
    const parts=[car,loc,price,prefLabel].map(p=>escapeHtml(String(p)));
    const strip=document.createElement("div");
    strip.className="row sam";strip.id="sellSummaryStrip";
    strip.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sell-summary-strip">${parts.join(' <span class="ss-dot" aria-hidden="true">&middot;</span> ')} <button class="ss-edit" onclick="openScopedEdit()">Edit</button></div></div></div>`;
    msgs.appendChild(strip);
  })();
  // Analysis screen (Thesis v1): staged lines that mirror the real pipeline
  // (fetch comps -> compare platforms -> check specialists -> write rec). Each
  // ticks over briskly; the REVEAL is gated on the real response, so a cache-warm
  // result flashes through and a data_unavailable response never lets the final
  // "Writing my recommendation" stage complete.
  const thinkRow=document.createElement("div");thinkRow.className="row sam";thinkRow.id="sellThinking";
  const stages=[
    "Finding comparable sales",
    "Comparing auction platform performance",
    "Checking for specialist representation",
    "Writing my recommendation"
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
          sellerPreference:sellState.sellerPreference,
          notes:sellState.notes
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
  // 2C: stash the anonymous free result id for claim-on-sign-in (11a), and drop
  // the subtle "first one's on me" line under the free result (item 2).
  if(decisionData.resultId&&typeof gasStashResultId==="function")gasStashResultId(decisionData.resultId,!!decisionData.firstFree);
  if(decisionData.firstFree&&typeof gateAppendFirstFreeLine==="function")setTimeout(()=>{try{gateAppendFirstFreeLine();}catch(e){}},0);
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

  // RANKING-LADDER-START (platform-agnostic: no platform name may appear in the
  // ranking region below; every crown is re-derived from data or read via
  // platformDisplayName. Enforced by scripts/agnosticismGuard.mjs.)
  // Routing hierarchy (locked, strict order): PRICE FIRST, then speed.
  // 1. A verified 10%+ price premium picks the platform, period; speed may
  //    never override it. "Verified" means the 5+/5+ sampled proof object.
  // 2. Speed routes only when no verified 10%+ premium protects the pick:
  //    fast timeline + curated-fast alternative with real evidence.
  // Runs ONCE, before the opener and any card.
  sellState.routingReason=null;
  {
    const verifiedPremium=route=>{
      const p=route?.marketEvidence?.pricePremium;
      return (p&&p.platformSales>=5&&p.othersSales>=5)?Number(p.percent):null;
    };
    const first=routeOptions[0],second=routeOptions[1];
    if(first&&second){
      const pFirst=verifiedPremium(first),pSecond=verifiedPremium(second);
      // Volume-aware (same gate as routesForCards / pickRecommendedRoute): the second
      // route only overtakes the incumbent leader on a cleared premium when its premium
      // sample is comparable to the leader's evidence (platformSales >= half, floor 5)
      // OR it beats the leader's own premium by 8+ points. A thin high-mix premium
      // (SOMO +27% on 8) no longer swaps ahead of the volume leader (BaT +26% on 20).
      const psSecond=Number(second?.marketEvidence?.pricePremium?.platformSales||0);
      const firstEvidence=Number(first?.marketEvidence?.evidenceSales||0);
      const swapSampleOK=psSecond>=Math.max(5,firstEvidence*0.5);
      const swapMarginOK=pFirst!=null&&pFirst>=10&&pSecond>=pFirst+8;
      if(pSecond!=null&&pSecond>=10&&(pFirst==null||pSecond>pFirst)&&(swapSampleOK||swapMarginOK)&&routeHasTrueComparableEvidence(second)){
        routeOptions[0]=second;routeOptions[1]=first;
        delete routeOptions[0].speedArgument;
        sellState.routingReason="price";
      }
    }
    // SPEED RE-RANK DELETED (Aug 2026): the Mode-B / unknown-spread speedToList
    // promotion that used to swap Card 1 for a faster-to-list platform is GONE.
    // sellOptions now stays in pure PRICE/EVIDENCE order out of this ladder, and
    // ALL speed behaviour (the Bring a Trailer exclusion, the speed pick, the
    // speed-vs-price composition) lives in v2Composition - the single source of
    // truth for composition. The old promotion was guarded by sellerWantsSpeed(),
    // so removing it is byte-identical for every non-ASAP path.
  }
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
    const door=hasOutboundSubmission(slug)
      ? ` If you want to explore it yourself, you can start on ${houseName}'s own site.`
      : "";
    addMsg("sam",`One thing to know up front: ${houseName} shows the strongest comparable results in our records. It isn't the pick here, but it tells you serious money follows this car.${door}`);
    if(hasOutboundSubmission(slug)){
      const row=document.createElement("div");row.className="row sam";
      row.innerHTML=`<div class="row-inner"><div class="msg-wrap"><div class="sell-rec-actions"><button class="ghost" onclick="outboundGo('${escapeHtml(slug)}','prenote')">Send my details to ${escapeHtml(houseName)}</button></div></div></div>`;
      msgs.appendChild(row);
    }
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
    const routable=routeOptions.filter(r=>r.routable!==false);
    // Thin-window price-signal override (backend-set marker, api/sellerDecision.js): a
    // flagged strong-price venue with materially deeper comps leads over a thin-window
    // recency leader. Honored FIRST so the card, the backend recommendedPath, and this
    // mirror stay in lockstep (the backend already reordered routes; this pins it).
    const forced=routable.find(r=>r.thinWindowPriceLead);
    if(forced){sellState.routingReason="thin_window_price";return routeOptions[0]===forced?routeOptions:[forced,...routeOptions.filter(x=>x!==forced)];}
    const cleared=r=>{const p=r&&r.marketEvidence&&r.marketEvidence.pricePremium;return p&&p.gateType==="symmetric"&&Number.isFinite(p.percent)&&p.percent>=10?p.percent:-1;};
    // Depth leader: most sold comps at the landed scope (needed by the volume-aware
    // premium gate below, so it is computed BEFORE Branch 1).
    let deep=null,deepN=-1;
    for(const r of routable){const n=Number(r.marketEvidence&&r.marketEvidence.evidenceSales||0);if(n>deepN){deep=r;deepN=n;}}
    const deepPremium=deep?cleared(deep):-1;
    // Branch 1 (Mode A), VOLUME-AWARE (kept in lockstep with pickRecommendedRoute in
    // api/sellerDecision.js): among cleared symmetric premiums (>=10%, 5+/5+) the
    // highest leads, but a platform that is NOT the depth leader may lead only when its
    // premium rests on a sample comparable to the leader's (platformSales >= half the
    // leader's evidence, floor 5) OR it beats the leader's OWN cleared premium by a
    // meaningful margin (8+ points). Stops a boutique's high-mix median on a thin sample
    // (2020 992 Sport Classic: SOMO +27% on 8 sales) from out-leading the venue where
    // most of these cars actually sell (BaT +26% on 20). A razor-thin edge no longer wins.
    const clearedRoutes=routable.map(r=>({r,pct:cleared(r)})).filter(x=>x.pct>=10).sort((a,b)=>b.pct-a.pct);
    for(const {r,pct} of clearedRoutes){
      const ps=Number(r.marketEvidence&&r.marketEvidence.pricePremium&&r.marketEvidence.pricePremium.platformSales||0);
      const sampleOK=ps>=Math.max(5,deepN*0.5);
      const marginOK=deepPremium>=10&&pct>=deepPremium+8;
      if(r===deep||sampleOK||marginOK)return routeOptions[0]===r?routeOptions:[r,...routeOptions.filter(x=>x!==r)];
    }
    // Is the spread MEASURED? (any 5+/5+ symmetric premium exists). If not, it
    // is UNKNOWN. The old unknown-spread SPEED promotion (branch 4) is DELETED
    // (Aug 2026): speed is now v2Composition's job, so this ladder never re-ranks
    // for speed. sellOptions stays pure price/evidence order.
    const measured=routable.some(r=>{const p=r&&r.marketEvidence&&r.marketEvidence.pricePremium;return p&&p.platformSales>=5&&p.othersSales>=5;});
    // Branch 5 specialist crown: UNKNOWN spread. A platform OTHER than the depth
    // leader holding a specialization cell for the landed scope (lift >= 3x AND
    // 5+ scope comps) leads with the specialization headline. No longer gated on
    // speed preference (the speed branch that preceded it is gone), so for every
    // non-ASAP path - where sellerWantsSpeed() was already false - this is the
    // exact same condition as before.
    if(!measured){
      const specialistCell=r=>{const c=r&&r.marketEvidence&&r.marketEvidence.specializationCell;return c&&Number(c.lift_rounded)>=3&&Number(c.platform_count)>=5?c:null;};
      const specialist=routable.find(r=>r!==deep&&specialistCell(r));
      if(specialist){
        sellState.routingReason="specialist";
        return routeOptions[0]===specialist?routeOptions:[specialist,...routeOptions.filter(r=>r!==specialist)];
      }
    }
    // Branch 3 / 5 fallback: deepest recent market leads.
    if(deep&&deepN>0&&routeOptions[0]!==deep)return [deep,...routeOptions.filter(r=>r!==deep)];
    return routeOptions;
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
  // Depth leader among the cards (most sold comps at the landed scope). Named on
  // the branch-4 pick card's REQUIRED depth-honesty bullet, so a speed-led pick
  // never hides that a deeper market exists.
  const depthLeaderRoute=routesForCards.filter(r=>r.routable!==false)
    .reduce((leader,r)=>(Number(r.marketEvidence&&r.marketEvidence.evidenceSales||0)>Number(leader&&leader.marketEvidence&&leader.marketEvidence.evidenceSales||0)?r:leader),null);
  const depthLeaderName=(depthLeaderRoute&&depthLeaderRoute!==routesForCards[0])
    ?platformDisplayName(depthLeaderRoute.label||depthLeaderRoute.platform):null;
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
        landedGenerationCode:composerLandedGenerationCode(),
        depthLeaderName:index===0?depthLeaderName:null
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
  const partnerSecondary=(!partnerGatePasses&&partnerReferral.secondary&&partnerReferral.partner&&!sellerWantsToManageSelf())
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
          const label=option.key==="specialist"?"Why I’d call them":(!isPrimary?"Why I’d also consider it":"Why I picked this");
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
            <span class="observed-seller-why">Why I’d call them</span>
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
  const platformGrid=primaryPlatform
    ?`<div class="sell-rec-grid">${renderOptionCard(primaryPlatform)}${secondaryPlatforms.map(renderOptionCard).join("")}</div>`
    :"";
  const noFeatureExtras=`${partnerSecondary?`<div class="sell-section-note" style="margin-top:12px">${escapeHtml(powerSellerIntroLine())}</div>${renderMiniPowerSellerProfile(partnerSecondary,"Also worth considering")}`:""}${diySecondaryLine}`;

  // 1b: the header carries only the factual car label. The finding lives in the
  // pick card's composed headline; the old templated title/subtitle are deleted.
  const headerHTML=`<div class="sell-rec-header">
      <div class="sell-rec-kicker">Seller Intelligence</div>
      <div class="sell-rec-title">${escapeHtml(carDisplayLabel("your car"))}</div>
    </div>`;
  const caveatText=unverifiedModelNote()||adverseConditionCaveat();
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
    row.scrollIntoView({behavior:"smooth",block:"start"});
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
  row.scrollIntoView({behavior:"smooth",block:"start"});
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
  const reason=preWar
    ?`I don't have enough tracked auction sales on ${car} to back a specific data-led call. ${primaryName} is where I'd start: it's the specialist home for prewar and classic collector cars, and cars like this most often trade through marque specialists and collector auctions. That's a fit for the car, not a read from sales data.`
    :classic
    ?`I don't have enough tracked auction sales on ${car} to back a specific data-led call. ${primaryName} is the specialist home for classic and collector cars like yours, so that's where I'd start. That's a fit for the car, not a read from sales data.`
    :`I don't have enough tracked auction sales on ${car} to back a specific data-led call. ${primaryName} is where I'd start for a car like yours. That's a fit for the car, not a read from sales data.`;
  return {
    region:"generic",
    primary:primaryName,
    primarySlug,
    secondary:null,
    title:`Here's what I'd do with ${car}.`,
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
  const secondary=fallback.secondary?`
    <div class="pv2-sec">
      <div class="pv2-sec-main"><div class="pv2-sec-l">Also worth comparing</div><div class="pv2-sec-name">${esc(fallback.secondary)}</div><div class="pv2-sec-copy">${esc(fallback.secondaryReason||"")}</div></div>
      <button class="pv2-sec-cta" onclick="event.stopPropagation();${secCta}">Continue with ${esc(fallback.secondary)}${svg("arrow","pv2-sar")}</button>
    </div>`:"";
  return `<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    <div class="pcard pcard-platform" onclick="${primaryCta}">
      <div class="pcard-left">
        <span class="pcard-badge">+ Sam's Pick</span>
        <div class="pcard-script">For your ${esc(v.make||car||"car")}, I'd start with</div>
        <h1 class="pcard-name">${esc(name)}</h1>
        <div class="pcard-whyl pcard-whyl-main">Why This Fits</div>
        <p class="pcard-lead">${esc(fallback.primaryReason)}</p>
        <button class="pcard-cta" onclick="event.stopPropagation();${primaryCta}">Start Listing With ${esc(name)}${svg("arrow","cta-arrow")}</button>
        <div class="pcard-reassure">${svg("shield")}<span>You'll be taken to ${esc(name)} to begin your listing. Nothing is committed until you decide to publish.</span></div>
      </div>
      <div class="pcard-right">
        <div class="pcard-wordmark">${esc(name)}</div>
        <div class="pcard-meta">
          <div class="pcard-mrow">${pin}<div><div class="pcard-mp">${esc(carLbl)}</div><div class="pcard-ms">${esc(loc)}</div></div></div>
          <div class="pcard-mrow">${svg("car")}<div><div class="pcard-mp">Policy fit</div><div class="pcard-ms">No comparable sales yet</div></div></div>
        </div>
      </div>
      <div class="pcard-note">${esc(fallback.caveat||"When comparable sales show up in my data, I can back this with real evidence.")}</div>
    </div>
    ${secondary}
    <div class="sam-text after-results">Ask me anything about the recommendation, or tell me more about the car.</div>
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
// numbers). Opened from the result card's "Why I Picked This" info affordance and
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

