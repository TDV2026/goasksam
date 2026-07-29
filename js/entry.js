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
        const heroEvidence=(sellState.sellDecision?.analysis?.platformPerformance||[])[0]||{};
        // Price signal is the premium percentage only (locked): a median in
        // context invites a median in an answer, which is banned.
        const premiumFact=heroEvidence.pricePremium;
        const premiumLine=premiumFact
          ?`${premiumFact.scope==="segment"?premiumFact.segmentLabel+" ":""}sales closed around ${premiumFact.percent}% higher on the recommended platform than on other platforms ${premiumFact.windowDays>=3650?"historically":`over the past ${premiumFact.windowDays} days`}`
          :"none available";
        // Use the FINAL displayed pick (post frontend swaps) so the chat never
        // names a different platform than the card the seller is looking at.
        const shownPick=sellState.displayedRecommendedPath||dec.recommendedPath;
        sellContext+=`\nDecision facts (the engine's recommendation, do not contradict it): recommended platform ${platformDisplayName(shownPick)}; basis ${dec.evidenceBasis}; confidence ${dec.confidence}; comparable sales analyzed ${sellState.sellDecision?.evidence?.evidenceSales??"n/a"} ${(sellState.sellDecision?.evidence?.windowDays??0)>=3650?"across everything tracked":`in the last ${sellState.sellDecision?.evidence?.windowDays??"n/a"} days`}; price signal: ${premiumLine}. Reasons: ${(dec.why||[]).join(" ")}`;
        // Phase 1c: give the chat the real evidence object and the exact card
        // bullet text, so it answers post-result questions (including about the
        // PowerSeller) from data instead of the frontend re-rendering a card.
        const evidenceSummary=(typeof sellChatEvidenceSummary==="function")?sellChatEvidenceSummary():"";
        const cardsSummary=(typeof sellChatCardsSummary==="function")?sellChatCardsSummary():"";
        if(evidenceSummary)sellContext+=`\n${evidenceSummary}`;
        if(cardsSummary)sellContext+=`\n${cardsSummary}`;
        // PowerSeller gate outcome (Defect 3): answer "why not a powerseller"
        // from the REAL gate result, never with value insinuations.
        const pr=sellState.partnerReferral||{};
        const cond=pr.conditions||{};
        const gateBits=[];
        if(sellState.resolvedVehicle?.unverified){
          gateBits.push("the model could not be verified, so it could not be matched to a specialist's tracked track record with confidence (this is the reason, NOT the car's value)");
        }else{
          gateBits.push(cond.valueMet?"value gate: met":"value gate: below threshold");
          gateBits.push(cond.segmentMet?"specialist expertise match: found":"specialist expertise match: none for this car");
        }
        gateBits.push(pr.eligible?"result: gate passed, PowerSeller offered as an option":(pr.secondary?"result: shown only as a modest secondary":"result: no PowerSeller shown"));
        sellContext+=`\nPowerSeller gate outcome (answer "why not a powerseller" from THIS; NEVER imply the seller's car lacks value or does not qualify on worth): ${gateBits.join("; ")}. A PowerSeller runs the whole sale for a fee; it never gets more money; it is a hands-off vs hands-on choice; the platform pick stands either way.`;
        // Part 4: bind "compare the options/tradeoffs" to the ACTUAL rendered
        // destinations so the chat never reframes a platform-vs-platform choice
        // as PowerSeller-vs-DIY or claims both paths end at the same platform.
        const platformDest=(sellState.sellOptions||[]).filter(o=>o&&o.key!=="specialist").map(o=>o.name).filter(Boolean);
        const psShown=(sellState.sellOptions||[]).some(o=>o&&o.key==="specialist");
        if(platformDest.length>=2){
          sellContext+=`\nRendered destinations (what the seller is looking at): PICK ${platformDest[0]}, ALT ${platformDest[1]}. A "compare the options / compare the tradeoffs / which should I pick" request means comparing THESE TWO PLATFORMS. Compare them on four axes ONLY: price outcome, time to list, audience fit, and how much sales data backs each (use the evidence-by-platform numbers above). They are two DIFFERENT platforms: NEVER say both paths lead to the same platform, NEVER reframe this as PowerSeller-vs-doing-it-yourself, and NEVER contradict either card's stated finding. The pick stays the recommendation; the comparison explains it, it does not reopen it.`;
        }else if(platformDest.length===1&&psShown){
          sellContext+=`\nRendered destinations: one platform (${platformDest[0]}) plus a PowerSeller option. A "compare the options/tradeoffs" request here means handled-by-a-PowerSeller vs running it yourself; both routes list on ${platformDest[0]}, so here both paths do end at ${platformDest[0]}. Compare on how hands-on the seller wants to be (a PowerSeller handles photos, listing, buyer questions and paperwork for a fee; it never gets more money).`;
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
          addMsg("sam",stripChatMarkdown(data.text));
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
