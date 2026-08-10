function showPowerSellerExplainer(){
  hideHero();
  addMsg("sam",powerSellerExplainerText(), "", chipsHTML(["Sell my car"]));
}
function powerSellerExplainerText(){
  return "A PowerSeller is someone who regularly manages auction sales for other people. A good one can prep the car, write or shape the listing, answer buyer questions, live in the comments, handle logistics and choose the platform they think gives the car the best shot.\n\nThey are not automatically better than selling it yourself. For some cars I’d keep it simple and go straight to a platform. For higher-value or specialist cars, I may suggest speaking to one before deciding.\n\nNobody is paying to be recommended here. If I show a PowerSeller later, it is because the available data and your car details make them worth considering, and you’ll see more information before you choose.";
}
function showRecommendationExplainer(){
  hideHero();
  addMsg("sam","I start with recent market activity. If there is enough recent data, I use that. If the signal is too thin, I widen the window rather than pretending the answer is stronger than it is.\n\nThen I weigh your car, timing, location and how much of the sale you want to manage yourself. Sometimes that points straight to a platform. Sometimes I’d speak to a PowerSeller first. Either way, nobody is paying to be recommended and nothing gets sent until you approve it.","",chipsHTML(["Sell my car"]));
}
function newConversation(){
  history.length=0;
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
  if(/\b(what is|what's|whats|explain|who is|who are).*\b(power\s?seller|power seller|specialist seller|consignor)\b/i.test(lower))
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
        const res=await fetch(apiPath("/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:[...history,{role:"user",content:q}],system:SELL_SYS,context:sellContext})});
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
        startSellFlow(q,false);
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

  history.push({role:"user",content:q});
  showTyping();
  try{
    const res=await fetch(apiPath("/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history,system:SYS})});
    const data=await res.json();
    if(!res.ok||data.error||!data.text){
      console.error("chat layer failed",res.status,data.error||"empty text");
      hideTyping();
      addMsg("sam","I'm having trouble answering right now. Give it a moment and ask again.");
      document.getElementById("btn").disabled=false;
      return;
    }
    const raw=stripChatMarkdown(data.text);
    const parsed=parseResults(raw);
    hideTyping();
    if(parsed.clean)addMsg("sam",parsed.clean);
    if(parsed.chipsHTML)addMsg("sam","","",parsed.chipsHTML);
    document.getElementById("btn").disabled=false;
    history.push({role:"assistant",content:raw});
  }catch(e){
    hideTyping();addMsg("sam","Connection issue. Try again.");
    document.getElementById("btn").disabled=false;
  }
}

document.getElementById("btn").addEventListener("click",send);
document.getElementById("inp").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
document.getElementById("inp").addEventListener("input",function(){this.style.height="auto";this.style.height=Math.min(this.scrollHeight,160)+"px";});
