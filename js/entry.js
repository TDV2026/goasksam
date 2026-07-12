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
  document.getElementById("msgs").innerHTML=homeHeroHTML();
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
      const dec=sellState.sellDecision?.decision;
      if(dec?.recommendedPath){
        const heroEvidence=(sellState.sellDecision?.analysis?.platformPerformance||[])[0]||{};
        sellContext+=`\nDecision facts (the engine's recommendation, do not contradict it): recommended platform ${platformDisplayName(dec.recommendedPath)}; basis ${dec.evidenceBasis}; confidence ${dec.confidence}; comparable sales analyzed ${sellState.sellDecision?.evidence?.evidenceSales??"n/a"} ${(sellState.sellDecision?.evidence?.windowDays??0)>=3650?"across everything tracked":`in the last ${sellState.sellDecision?.evidence?.windowDays??"n/a"} days`}; median on the recommended platform ${heroEvidence.medianSalePrice?"$"+heroEvidence.medianSalePrice.toLocaleString("en-US"):"n/a"}. Reasons: ${(dec.why||[]).join(" ")}`;
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
