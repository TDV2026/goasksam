function showPowerSellerExplainer(){
  hideHero();
  addMsg("sam",powerSellerExplainerText(), "", chipsHTML(["Sell my car"]));
}
function powerSellerExplainerText(){
  return "A PowerSeller is someone who regularly manages auction sales for other people. A good one can prep the car, write or shape the listing, answer buyer questions, live in the comments, handle logistics and choose the platform they think gives the car the best shot.\n\nThey are not automatically better than selling it yourself. For some cars I’d keep it simple and go straight to a platform. For higher-value or specialist cars, I may suggest speaking to one before deciding.\n\nNobody is paying to be recommended here. You hand off the car and they manage the process start to finish. How they’re paid varies, some work on a percentage of the sale, some a flat amount, sometimes a mix, and the terms get agreed directly with the PowerSeller. Each case is a little different.";
}
// Curated answer for "how does GoAskSam make money / is this free / who pays"
// questions. Locked copy, no partner names, no figures, no platform claims. Used
// both pre-wizard (localPreRoute) and post-result (step 12), never the LLM.
// Queries specifically about PowerSeller/consignor pay are left to the dedicated
// fees intercept, so this returns null for those.
function moneyQuestionReply(q){
  const lower=(q||"").toLowerCase();
  if(/\b(power\s?sellers?|consignors?|specialist sellers?)\b/i.test(lower))return null;
  const hit=
    /\b(?:you|goasksam|go\s?ask\s?sam|guys|sam|this|it|y'?all|ya'?ll)\s+(?:guys\s+)?(?:make|makes|making|earn|earns)\s+(?:any\s+|your\s+|its?\s+|the\s+)?(?:money|anything|revenue|a living)\b/i.test(lower)
    ||/\b(?:you|goasksam|go\s?ask\s?sam|guys|sam)\s+(?:guys\s+)?(?:get|gets|getting)?\s*paid\b/i.test(lower)
    ||/\bhow\s+(?:do|does|are|is)\s+(?:you|goasksam|this|it|guys|ya|y'?all)\b[\s\S]{0,24}\b(?:paid|money|revenue|monet)/i.test(lower)
    ||/\bwho\s+(?:pays|'s paying|is paying|pay)\b/i.test(lower)
    ||/\bis\s+(?:this|it|goasksam|the (?:app|service|tool|site))\s+(?:really\s+|actually\s+|all\s+)?free\b/i.test(lower)
    ||/\bfree to use\b/i.test(lower)
    ||/\b(?:what'?s|whats)\s+(?:the\s+)?catch\b/i.test(lower)
    ||/\bbusiness model\b/i.test(lower)
    ||/\b(?:monet(?:ise|ize)|monetization|monetisation)\b/i.test(lower)
    // Item 6: referral / commission / cut phrasings about GoAskSam itself. Scoped
    // to a you/goasksam subject so "how do I make the most money on my car" (the
    // control) still routes to the LLM.
    ||/\b(?:you|goasksam|go\s?ask\s?sam|guys|sam)\b[\s\S]{0,32}\b(?:referral fee|referral fees|referral|commission|kickback|finder'?s? fee|take a cut|get a cut|getting a cut|take a percentage)\b/i.test(lower);
  if(!hit)return null;
  return "GoAskSam is free for sellers. We have commercial arrangements with some of the PowerSellers we work with, and nobody can pay to be recommended. The recommendation always comes first.";
}
// Curated answer for "do you have a PowerSeller in Canada" style questions.
// Locked copy, nothing more (no routing promise). US-based-partner reality,
// consistent with the hard US-only partner gate. Used pre-wizard and
// post-result (step 12), never the LLM. A bare region answer ("Canada" at the
// region step) is NOT intercepted here: it needs a PowerSeller/representation
// token AND runs only outside the active pre-result wizard.
function canadaPowerSellerReply(q){
  const lower=(q||"").toLowerCase();
  if(!/\bcanad(?:a|ian)\b/i.test(lower))return null;
  const psContext=/\b(power\s?sellers?|consignors?|specialist sellers?|represent(?:ative|ed|ing)?|handle (?:the|my|it|this) sale|someone to (?:sell|handle)|hand(?:le)? (?:it|the car|the keys)|sell (?:it |my car )?for me|do (?:it|this) for me)\b/i.test(lower);
  if(!psContext)return null;
  return "Not yet. Our PowerSellers are US-based today, and we're careful about who we add.";
}
function showRecommendationExplainer(){
  hideHero();
  addMsg("sam","I start with recent market activity. If there is enough recent data, I use that. If the signal is too thin, I widen the window rather than pretending the answer is stronger than it is.\n\nThen I weigh your car, timing, location and how much of the sale you want to manage yourself. Sometimes that points straight to a platform. Sometimes I’d speak to a PowerSeller first. Either way, nobody is paying to be recommended and nothing gets sent until you approve it.","",chipsHTML(["Sell my car"]));
}
function newConversation(){
  chatHistory.length=0;
  resetSellState();
  if(window.__shownSessionStats)window.__shownSessionStats.clear();
  // The homepage shell owns the home state (hero + cards + focus + placeholder
  // rotation); fall back to the bare hero if it is not present.
  if(typeof enterHomeState==="function"){enterHomeState();}
  else{document.getElementById("msgs").innerHTML=homeHeroHTML();}
}

function localPreRoute(q){
  const lower=q.toLowerCase().trim();
  const funnelReply=sellerFunnelReply();
  if(sellState.active&&sellState.step>0)return{sell:true};
  // PowerSeller fees: curated, generic, NO partner names, new locked copy. The
  // make/consignor tokens allow plurals (powersellers) and the reverse order.
  if(/\b(power\s?sellers?|consignors?|specialist sellers?)\b[\s\S]*\b(fee|fees|cost|costs|charge|charges|commission|commissions|paid|rate|rates|pricing|percentage|cut|take)\b/i.test(lower)
     ||/\b(fee|fees|cost|charge|commission|paid|rate|pricing|percentage|cut)\b[\s\S]*\b(power\s?sellers?|consignors?|specialist sellers?)\b/i.test(lower))
    return{reply:"PowerSeller arrangements vary, some work on a percentage of the sale price, others a flat amount, sometimes a mix. The specifics get agreed directly with the PowerSeller once you're introduced. Each case is a little different.",chips:["Sell my car"]};
  const canadaReply=canadaPowerSellerReply(q);
  if(canadaReply)return{reply:canadaReply,chips:["Sell my car"]};
  const moneyReply=moneyQuestionReply(q);
  if(moneyReply)return{reply:moneyReply,chips:["Sell my car"]};
  if(/\b(what is|what's|whats|what are|what're|explain|who is|who are|tell me about).*\b(power\s?sellers?|specialist sellers?|consignors?)\b/i.test(lower))
    return{reply:powerSellerExplainerText(),chips:["Sell my car"]};
  if(/\b(where should i sell|best place to sell|who(?:'s| is)? best to sell|which platform|what platform|where do i sell|who should sell|best site|best auction|sell it on)\b/i.test(lower))
    return{reply:funnelReply,chips:["Start the questions"]};
  if(/\b(sell my car|i want to sell|want to sell|selling|to sell)\b/i.test(lower))return{sellTrigger:true,initialCar:q};
  if(/\b(i have|i've got|my car is)\b/i.test(lower)&&looksLikeVehicleText(q))return{sellTrigger:true,initialCar:q};
  if(looksLikeVehicleText(q))return{sellTrigger:true,initialCar:q};
  if(/\b(the daily vroom|daily vroom|sam gold|who owns|owner|ownership|who is sam|who's sam|who runs|behind goasksam|behind this)\b/i.test(lower))
    return{reply:"GoAskSam is part of The Daily Vroom, the collector car newsletter that's been running for years with tens of thousands of readers. Sam Gold owns it, and the tools include the Import Calculator and this seller-intelligence tool, built on real auction sale records. If you're selling a car, tell me what it is and I'll work out where I'd take it.",chips:["Sell my car"]};
  if(/^(u there|you there|hello|hey|hi|yo|are you there)\??$/.test(lower))
    return{reply:"Yep, here. Tell me what we're selling today and I'll work out what I’d do.",chips:["Sell my car"]};
  if(/dump a body|dead body|outrun the cops/i.test(lower))
    return{reply:"Let's keep this legal. What are you actually trying to do with the car?",chips:["Hauling stuff","Camping","Daily driver","Fun car"]};
  if(/^start the questions$/i.test(lower))return{sellTrigger:true,initialCar:null};
  if(/^(show me a car|find me a car|help me find|i need a car|looking for a car|want a car|need a car|browse auctions|browse listings|browse|find a car)$/i.test(lower))
    return{reply:"This version is focused on sellers. Tell me what we're selling today and I'll check where I'd take it.",chips:["Sell my car"]};
  // Unmatched cold input: probe the resolver, then fall through to real chat.
  return{entryProbe:true};
}

async function send(){
  const inp=document.getElementById("inp");
  const q=inp.value.trim();if(!q)return;
  inp.value="";inp.style.height="auto";
  document.getElementById("btn").disabled=true;
  addMsg("user",q);

  // Walled guard: once a hard daily/limit/account wall is up, a genuine question still
  // reaches chat (no quota cost), but anything else - a new/continued search OR a plain
  // comment ("so i cant see anymore for today") - gets a calm re-acknowledgement instead
  // of a phantom flow. The backend re-blocks searches anyway; this stops the confusing UI.
  if(typeof gasIsWalled==="function"&&gasIsWalled()&&!(typeof isQuestionInput==="function"&&isQuestionInput(q))){
    if(typeof gateWalledReack==="function")gateWalledReack(gasIsWalled());
    document.getElementById("btn").disabled=false;
    return;
  }

  const pre=localPreRoute(q);

  // Out-of-scope aftermath: after a refusal the input reverts to car entry. A car
  // starts a fresh search; any other input gets ONE curated line, never the LLM
  // (the output guard is never run against an empty out-of-scope composition).
  if(sellState.afterOutOfScope){
    if(pre&&pre.sellTrigger){
      sellState.afterOutOfScope=false;
      startSellFlow(pre.initialCar,false);
      document.getElementById("btn").disabled=false;return;
    }
    addMsg("sam","For this one I'd genuinely go the mainstream route, it'll do better there than anywhere I'd send you. Got another car? Type it and I'll take a look.");
    document.getElementById("btn").disabled=false;return;
  }

  if(pre&&pre.sellTrigger){
    const genericSell=/^(sell|selling|sell my car|i want to sell|want to sell|start the questions)$/i.test(q.trim());
    startSellFlow(genericSell?null:pre.initialCar,false);
    document.getElementById("btn").disabled=false;return;
  }

  if(pre&&pre.sell){
    // Post-result money question: curated answer, never the LLM. Mirrors the
    // pre-wizard intercept; the wizard early-returns {sell:true} before
    // localPreRoute can catch it, so it is handled here for the result state.
    if(sellState.step===12){
      const canadaReply=canadaPowerSellerReply(q);
      if(canadaReply){addMsg("sam",canadaReply);document.getElementById("btn").disabled=false;return;}
      const moneyReply=moneyQuestionReply(q);
      if(moneyReply){addMsg("sam",moneyReply);document.getElementById("btn").disabled=false;return;}
    }
    const handled=await handleSellStep(q);
    if(!handled){
      showTyping();
      const stateStr=JSON.stringify({car:sellState.carName,region:sellState.region,state:sellState.state,mileage:sellState.mileage,condition:sellState.condition,records:sellState.records,title:sellState.title,price:sellState.price,timeline:sellState.timeline,involvement:sellState.involvement,step:sellState.step});
      const nextQ=SELL_STEP_QUESTIONS[sellState.step];
      const remaining=remainingWizardQuestions();
      let sellContext=`Current sell state: ${stateStr}\nNext question: ${nextQ?nextQ.ask:"Proceed with submission."}\nQuestions remaining after the current one: ${remaining}. If asked how many questions are left, use this exact number.`;
      // Verification status as a HARD FACT (Defect 1): hold one position all
      // conversation; never flip to validating an unverified designation.
      if(sellState.resolvedVehicle?.unverified){
        sellContext+=`\nVEHICLE VERIFICATION: the model "${sellState.resolvedVehicle.model||sellState.carName}" is UNVERIFIED - it is not a designation we track. The analysis ran at ${sellState.resolvedVehicle.make||"make"} level. Hold this position for the ENTIRE conversation no matter how the user reframes it (rare, real, low-production): it may exist, but it is not in the sales records we track, so we cannot build any claim on it. Never call it fake or nonsense; never flip to validating it. Offer to re-run only if they confirm the exact badge.`;
      }
      const dec=sellState.sellDecision?.decision;
      if(dec?.recommendedPath){
        const evBand=typeof evidenceBand==="function"?evidenceBand(sellState.sellDecision?.evidence?.evidenceSales):"a recent sample";
        const winDays=sellState.sellDecision?.evidence?.windowDays;
        // Composition is authoritative: the recommendation the seller sees IS what
        // the page rendered (PS-led -> the PowerSeller; else the platform). Every
        // context block below is written to agree with it, so the LLM can never be
        // told "recommended platform X" while the page leads with a PowerSeller.
        const comp=(typeof v2Composition==="function")?v2Composition():null;
        const pickNm=comp&&comp.pick?platformDisplayName(comp.pick.name||comp.pick.platformSlug):platformDisplayName(sellState.displayedRecommendedPath||dec.recommendedPath);
        const psNm=comp&&comp.psRendered&&comp.referral.partner?(comp.referral.partner.displayName||comp.referral.partner.name):null;
        const altNm=comp&&comp.secondaryRendered&&comp.alt?platformDisplayName(comp.alt.name||comp.alt.platformSlug):null;
        if(comp&&comp.psLead&&psNm){
          sellContext+=`\nThe recommendation the seller is looking at (authoritative, matches the page): hand the sale to ${psNm}, the PowerSeller leads, with ${pickNm} as the platform to run it yourself. When asked "what do you recommend" the answer is ${psNm}; ${pickNm} is where the car would be listed either way. NEVER say the recommendation is just a platform, and NEVER say the PowerSeller is only a secondary option; ${psNm} leads.`;
        }else{
          sellContext+=`\nThe recommendation the seller is looking at (authoritative, matches the page): ${pickNm}${psNm?`, with ${psNm} also shown if they would rather have it handled for them`:""}. When asked "what do you recommend" the answer is ${pickNm}.`;
        }
        sellContext+=`\nDecision facts (do not contradict): basis ${dec.evidenceBasis}; confidence ${dec.confidence}; data confidence ${evBand} ${(winDays??0)>=3650?"across everything tracked":`in the last ${winDays??"n/a"} days`}. NEVER state how many comparable sales or comps there are; describe confidence with the band only. Reasons: ${(dec.why||[]).join(" ")}`;
        // Card-identical evidence + the exact card bullets (single fact source).
        const evidenceSummary=(typeof sellChatEvidenceSummary==="function")?sellChatEvidenceSummary():"";
        const cardsSummary=(typeof sellChatCardsSummary==="function")?sellChatCardsSummary():"";
        if(evidenceSummary)sellContext+=`\n${evidenceSummary}`;
        if(cardsSummary)sellContext+=`\n${cardsSummary}`;
        // Why a PowerSeller did or did not lead, in plain seller-facing words. No
        // internal jargon (value gate, threshold, rung, composition), no fee talk,
        // no price claims. Framing is effort, control and presentation only.
        if(sellState.resolvedVehicle?.unverified){
          sellContext+=`\nPowerSeller note: the model could not be verified, so it could not be matched to a specialist's tracked record. That is the reason, never a judgment about the car's value.`;
        }else if(comp&&comp.psLead&&psNm){
          sellContext+=`\nPowerSeller note: ${psNm} leads because this car fits his lane and your area. Explain his value as effort, control and presentation: a well presented listing with strong photography and great answers to buyer questions can have a real impact. Never mention a fee, never claim he gets more money, and never use internal words like value gate, threshold, rung or composition.`;
        }else if(psNm){
          sellContext+=`\nPowerSeller note: ${psNm} is shown as an option, not the lead. Frame it as hands-off vs hands-on, on effort, control and presentation. Never mention a fee, never claim more money, never use internal words like value gate or threshold.`;
        }else{
          sellContext+=`\nPowerSeller note: no PowerSeller is shown for this car. If asked why, say a PowerSeller is worth it when the car and the fit line up, and this one is better served by listing on ${pickNm}. Never imply the car lacks value, never state a number it missed, never use internal words like value gate or threshold.`;
        }
        // Rendered destinations = what actually rendered (never the raw route
        // list). The chat may name ONLY these. Framing follows the composition.
        if(comp&&comp.pick){
          if(comp.psLead&&psNm){
            sellContext+=`\nRendered destinations (the ONLY options shown; never name any other platform or consignor): PowerSeller ${psNm} leads, with ${pickNm} as the platform to run it yourself. A "compare/tradeoffs" request means handled-by-${psNm} vs running it yourself on ${pickNm}, on effort, control and presentation, NEVER platform vs platform. The choice is how hands-on the seller wants to be. ${pickNm} is the platform pick either way.`;
          }else if(altNm){
            sellContext+=`\nRendered destinations (the ONLY platforms shown; never name any other platform): PICK ${pickNm}, ALT ${altNm}${psNm?`, plus PowerSeller ${psNm} shown below`:""}. Prices run close, so a "compare/tradeoffs" request compares THESE TWO PLATFORMS on price outcome, time to list, audience fit and how much sales data backs each. Never contradict either card; ${pickNm} stays the pick.`;
          }else{
            sellContext+=`\nRendered destinations (the ONLY destinations shown; never name any other platform or consignor): ${pickNm} is the pick${psNm?`, with PowerSeller ${psNm} shown below (handled-by-${psNm} vs running it yourself on ${pickNm}, framed as effort, control and presentation)`:""}. There is no second platform shown; ${pickNm} is the clear call.`;
          }
        }
      }
      try{
        const res=await fetch(apiPath("/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[...chatHistory,{role:"user",content:q}],system:SELL_SYS,context:sellContext})});
        const data=await res.json();
        hideTyping();
        if(!res.ok||data.error||!data.text){
          // No silent fallbacks: the server logged the error to app_usage_events.
          console.error("chat layer failed",res.status,data.error||"empty text");
          addMsg("sam","Good question. I'm having trouble answering it right now, so ask me again in a moment if it matters to you. It doesn't affect the market check itself.");
        }else{
          // Output guard: a post-result free-text answer is checked against the
          // rendered composition. A wrong lead, an unshown platform, a hedged or
          // re-derived number, or internal jargon is replaced by a safe curated
          // fallback, so a seller never sees a contradiction (or silence).
          let answer=stripChatMarkdown(data.text);
          if(sellState.step===12&&typeof v2GuardChatAnswer==="function"){
            const guarded=v2GuardChatAnswer(answer);
            if(!guarded.ok)answer=guarded.text;
          }
          addMsg("sam",answer);
        }
        if(sellState.step>0&&sellState.step!==10&&sellState.step!==13&&sellState.step!==16&&!sellState.awaitingPathChoice){setTimeout(()=>askNextSellQuestion(),800);}
      }catch(e){hideTyping();addMsg("sam","Good question. I'm having trouble answering it right now because of a connection issue. Ask me again in a moment.");}
    }
    document.getElementById("btn").disabled=false;
    return;
  }

  if(pre&&pre.entryProbe){
    // Entry state runs the same resolver as everywhere else: vehicle-ish
    // text starts the wizard resolved; anything else gets a real chat answer.
    try{
      const probeRes=await fetch(apiPath("/api/vehicleIdentity"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:q})});
      const probe=await probeRes.json();
      const understood=probe?.vehicle&&(probe.vehicle.make||probe.vehicle.model);
      if(probeRes.ok&&(probe.status==="valid"||probe.status==="needs_confirmation"||understood)){
        // (b) Hand the probe's resolution to the wizard so its preflight reuses it
        // instead of firing a second identical /api/vehicleIdentity call.
        startSellFlow(q,false,{text:q,data:probe});
        document.getElementById("btn").disabled=false;
        return;
      }
      // VIN feature: a VIN we could not decode is a KNOWN state, not gibberish for the
      // chat layer. Show the honest line and stay in entry so the next message (the
      // car in words) starts the wizard normally.
      if(probeRes.ok&&probe.clarification&&probe.clarification.kind==="vin_decode_failed"){
        addMsg("sam",probe.clarification.question);
        document.getElementById("btn").disabled=false;
        return;
      }
    }catch(e){/* fall through to chat */}
    // falls through to the main chat below
  }
  if(pre&&pre.reply){
    if(pre.reply===sellState.lastPreReply){
      // Never the same canned entry line twice: hand off to real chat instead.
      sellState.lastPreReply=null;
    }else{
      sellState.lastPreReply=pre.reply;
      addMsg("sam",pre.reply,pre.html||"",chipsHTML(pre.chips||[]));
      document.getElementById("btn").disabled=false;
      return;
    }
  }

  chatHistory.push({role:"user",content:q});
  showTyping();
  try{
    const res=await fetch(apiPath("/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:chatHistory,system:SYS})});
    const data=await res.json();
    if(!res.ok||data.error||!data.text){
      console.error("chat layer failed",res.status,data.error||"empty text");
      hideTyping();
      addMsg("sam","I'm having trouble answering right now. Give it a moment and ask again.");
      document.getElementById("btn").disabled=false;
      return;
    }
    let raw=stripChatMarkdown(data.text);
    // Roster-name guard on the PRE-WIZARD/empty-composition path: a partner name
    // may appear only when that partner is rendered, which never happens here.
    if(typeof v2RosterNameViolation==="function"&&v2RosterNameViolation(raw)&&typeof v2RosterFallback==="function")raw=v2RosterFallback();
    const parsed=parseResults(raw);
    hideTyping();
    if(parsed.clean)addMsg("sam",parsed.clean);
    if(parsed.chipsHTML)addMsg("sam","","",parsed.chipsHTML);
    document.getElementById("btn").disabled=false;
    chatHistory.push({role:"assistant",content:raw});
  }catch(e){
    hideTyping();addMsg("sam","Connection issue. Try again.");
    document.getElementById("btn").disabled=false;
  }
}

document.getElementById("btn").addEventListener("click",send);
document.getElementById("inp").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
document.getElementById("inp").addEventListener("input",function(){this.style.height="auto";this.style.height=Math.min(this.scrollHeight,160)+"px";});

// One Box handoff: a car handed over from the One Box page (gas_onebox_prefill)
// pre-fills the entry box and auto-runs the wizard, so the seller does not retype it.
(function(){try{
  var pref=localStorage.getItem("gas_onebox_prefill");
  if(!pref)return;
  localStorage.removeItem("gas_onebox_prefill");
  var inp=document.getElementById("inp");
  if(inp&&typeof send==="function"){inp.value=pref;send();}
}catch(e){}})();
