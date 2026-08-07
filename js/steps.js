async function handleSellStep(q){
  // Self-correction suffixes are commentary, never content ("it is that car
  // my mistake" confirms the car; "my mistake" is not a car name and must
  // not read as an update request). Strip before any parsing.
  const SELF_CORRECTION=/((,|\.|!)?\s*(my mistake|my bad|oops|i think( so)?|i'?m pretty sure|probably))+\s*$/i;
  const SELF_CORRECTION_PREFIX=/^((my mistake|my bad|oops|sorry)[,.! ]*)+/i;
  {
    const stripped=String(q).replace(SELF_CORRECTION,"").replace(SELF_CORRECTION_PREFIX,"").trim();
    if(stripped&&stripped!==String(q).trim())q=stripped;
  }
  const lower=q.toLowerCase().trim();

  // Holding phrases, any step
  if(/one second|one sec|give me a sec|just a sec|hold on|one moment|give me a moment|bear with me|hang on|^sec$|2 secs|two secs|two seconds|gimme a sec|back in a sec|just a moment|brb|be right back|bathroom|give me a minute|one minute|two minutes/i.test(lower)){
    addMsg("sam","No rush.");
    return true;
  }

  const canApplyUpdate=/change|update|actually|wrong|mistake|make it|set it/i.test(lower)||sellState.step===16;
  const stateUpdate=canApplyUpdate?applySellStateUpdate(q):null;
  if(stateUpdate){
    if(stateUpdate.key==="carName"){
      // A car update is a vehicle entry, never a raw text store: resolve it
      // like any other, then resume where the user was (edit snapshot or
      // confirm), instead of stopping dead on "Updated car to ...".
      if(sellState.step===16)sellState.returnToConfirm=true;
      sellState.resolvedVehicle=null;
      sellState.trimAskAttempts=0;
      if(!(await validateVehicleIdentityPreflight(sellState.carName,{chatFallback:true}))){
        if(sellState.lastIdentityVerdict==="not_vehicle"){
          sellState.step=1;
          addMsg("sam","I couldn't read that as a car. Year, make and model?");
        }
        return true;
      }
      const missingAfterUpdate=currentMissingVehicleDetail();
      if(missingAfterUpdate){askMissingVehicleDetail(missingAfterUpdate);return true;}
      resumeWizardAfterVehicle(`Updated the car to ${sellState.carName}.`);
      return true;
    }
    addMsg("sam",`Updated ${stateUpdate.label.toLowerCase()} to ${stateUpdate.value}.`);
    if(sellState.step===16||sellState.returnToConfirm){goBackToConfirm();}
    return true;
  }

  const vehicleIssueAtStep=activeVehicleIssue();
  if(sellState.step===17&&(sellState.pendingVehicleIdentity||vehicleIssueAtStep?.type==="invalid_vehicle")){
    return handleVehicleValidationAnswer(q);
  }
  

  // Change requests, let API handle
  if(sellState.step!==16&&/change|update|actually|go back|edit|different|wrong|mistake/i.test(lower)){
    return false;
  }

  const step=sellState.step;

  // Pipeline stage 2 for menu/confirm states without their own spec.
  if([12,14].includes(step)&&isQuestionInput(q))return false;

  // ── STEP 1: car name ─────────────────────────────────────────
  if(step===1){
    if(/later|not sure|don.t know|skip|tell you later|can i give|give it later/i.test(lower)&&!looksLikeVehicleText(q)){
      addMsg("sam","Of course. Whenever you're ready, just tell me the year, make, and model.");
      return true;
    }
    const sameCarPhrase=/\b(same car|(that|this) (one|car)|no change|keep it|it'?s? (is )?(right|correct|the same|(this|that) (car|one))|is (this|that) (car|one))\b/i.test(lower)&&lower.split(/\s+/).length<=7&&!looksLikeVehicleText(q);
    if(sellState.editPrevVehicle&&(detectIntent(lower)==="affirmation"||sameCarPhrase)){
      // Mid-flow edit re-confirmed unchanged: restore the resolution and
      // resume at the step the user was on when they clicked Edit.
      sellState.carName=sellState.editPrevVehicle.carName;
      sellState.carRaw=sellState.editPrevVehicle.carRaw;
      sellState.resolvedVehicle=sellState.editPrevVehicle.resolvedVehicle;
      sellState.vehicleIdentityValidated=true;
      resumeWizardAfterVehicle(`Keeping the ${sellState.carName}.`);
      return true;
    }
    if(/^(ok|okay|ready|ok im ready|i.m ready|im ready|go ahead|let.s go|lets go|sure|yep|yes|yeah|ok ready|i have it|got it)$/i.test(lower)){
      addMsg("sam","Great. What are we selling today? Year, make, and model.");
      return true;
    }
    // Question-shaped input with no car in it goes straight to the chat layer
    // for a real answer; send() re-asks the current question afterwards.
    const questionLike=/\?\s*$/.test(q)||/^(what|how|why|when|where|who|can|could|will|would|does|do|is|are|should|explain|tell me)\b/i.test(lower);
    if(questionLike&&!looksLikeVehicleText(q))return false;
    const prevCarName=sellState.carName;
    const prevCarRaw=sellState.carRaw;
    sellState.carRaw=q;
    sellState.carName=q;
    sellState.vehicleIdentityValidated=false;
    if(/porsche|911/i.test(lower))sellState.carType="porsche";
    else if(/bmw|m2/i.test(lower))sellState.carType="bmw";
    else sellState.carType="generic";
    if(!(await validateVehicleIdentityPreflight(sellState.carName,{chatFallback:true}))){
      if(sellState.lastIdentityVerdict==="not_vehicle"){
        // The resolver understood nothing: not a car, so treat it as
        // conversation. Restore state and let the chat layer answer.
        sellState.carName=prevCarName;
        sellState.carRaw=prevCarRaw;
        return false;
      }
      return true;
    }
    sellState.trimAskAttempts=0;
    const missing=currentMissingVehicleDetail();
    if(missing){
      askMissingVehicleDetail(missing);
      return true;
    }
    resumeWizardAfterVehicle(vehicleAcceptPrefix());
    return true;
  }

  if(step===17){
    const currentIssue=activeVehicleIssue();
    if(currentIssue?.type==="invalid_vehicle"){
      return handleVehicleValidationAnswer(q);
    }
    // Locked rule 12 in the trim/model detail sub-state too: questions go to
    // the chat layer, refusals and explicit move-on advance at the level known,
    // and nothing off-script is ever appended to the car name.
    const questionLike17=/\?\s*$/.test(lower)||/^(what|how|why|when|where|who|can|could|will|would|does|do|is|are|should|but|explain|tell me)\b/i.test(lower)||/\b(how long|how many|how much|you never|what happens)\b/i.test(lower);
    if(questionLike17&&!looksLikeVehicleText(q))return false;
    // "Other" / "not listed" means the user has a trim to give that wasn't on
    // the chips. Prompt for it and STAY on this step; do NOT append "other" to
    // the car name and skip to broad (the old behavior sidestepped the user).
    if(/^(other|others|different|something\s+else|not\s+(listed|shown|there|here|on there)|it'?s\s+not\s+(listed|shown|there|here|above|an option))\.?$/i.test(lower.trim())){
      addMsg("sam","Sure, type the exact model or trim and I'll use it, like GTS, Competition or Alpina B3.");
      return true;
    }
    // Chip answers and explicit skip/move-on always advance (chip labels can
    // never be rejected by their own step). Wordy refusals like "don't know"
    // go to the chat layer for a real explanation of where to find the trim;
    // the re-ask escalates with a Skip chip and a 3-attempt cap.
    if(/^(base|standard)([.! ]|$)/i.test(lower.trim())){
      sellState.vehicleDetailSkipped=true;
      sellState.trimAskAttempts=0;
      sellState.lastMissingAsk=null;
      resumeWizardAfterVehicle(`Got it, the standard ${sellState.resolvedVehicle?.model||"car"}.`);
      return true;
    }
    const ownEscapeChip=/^(not sure|skip this step|skip)$/i.test(lower.trim());
    // Global rule (owner spec): "not sure" / "dont know" / "no idea" / "skip"
    // are always valid answers that ADVANCE at the level we know, never leave
    // the user stuck. detectIntent covers the common phrasings; the extra
    // regex catches the don't-know family it misses ("no clue", "beats me").
    // These used to `return false` to the chat layer, which left the wizard
    // parked on the trim question forever (a typed "dont know" never advanced).
    const declinesDetail=detectIntent(lower)==="moveOn"||detectIntent(lower)==="refusal"||ownEscapeChip
      ||/\bskip\b/i.test(lower)
      ||/\b(no clue|not a clue|beats me|who knows|couldn'?t (say|tell)|can'?t (say|remember|recall|tell)|your guess|search me|no idea)\b/i.test(lower);
    if(declinesDetail){
      sellState.vehicleDetailSkipped=true;
      sellState.trimAskAttempts=0;
      sellState.lastMissingAsk=null;
      addMsg("sam","No problem. I'll keep it broad for now, but the recommendation may be more directional without the exact model.");
    }else{
      // Context reset: a different make at the trim question is a new car,
      // not a trim answer appended to the old one.
      const inputMake17=extractVehicleMake(q);
      const pendingMake17=extractVehicleMake(sellState.carName||"");
      if(inputMake17&&pendingMake17&&inputMake17!==pendingMake17&&looksLikeVehicleText(q)){
        sellState.pendingVehicleIdentity=null;
        sellState.vehicleDetailSkipped=false;
        sellState.vehicleIdentityValidated=false;
        sellState.carName=q;sellState.carRaw=q;
        if(!(await validateVehicleIdentityPreflight(q)))return true;
        sellState.trimAskAttempts=0;
        const missingFresh=currentMissingVehicleDetail();
        if(missingFresh){askMissingVehicleDetail(missingFresh);return true;}
        resumeWizardAfterVehicle(vehicleAcceptPrefix());
        return true;
      }
      const prevCar=sellState.carName;
      const candidate=`${sellState.carName} ${q}`.replace(/\s+/g," ").trim();
      sellState.carName=candidate;
      sellState.carRaw=candidate;
      sellState.vehicleDetailSkipped=false;
      sellState.vehicleIdentityValidated=false;
      sellState.pendingVehicleIdentity=null;
      if(!(await validateVehicleIdentityPreflight(candidate)))return true;
      const missing=currentMissingVehicleDetail();
      if(missing){
        if(sellState.lastMissingAsk===missing.ask){
          // The resolver did not absorb the answer as a trim. Classic trims
          // (SS, RS, Z/28, Mach 1) are not all cataloged, so re-resolution can
          // drop them. If the answer is a plausible trim token, RECORD it on the
          // resolved vehicle rather than lose it (never discard a trim the seller
          // gave); only truly unusable input proceeds broad (never repeat, r12).
          const trimToken=String(q||"").trim();
          const looksLikeTrim=missing.type==="trim"&&sellState.resolvedVehicle&&sellState.resolvedVehicle.model
            &&/^[A-Za-z0-9][A-Za-z0-9 /.+-]{0,23}$/.test(trimToken)&&!extractVehicleMake(trimToken);
          if(looksLikeTrim){
            sellState.resolvedVehicle.trim=trimToken;
            sellState.vehicleIdentityValidated=true;
            sellState.vehicleDetailSkipped=false;
            sellState.lastMissingAsk=null;
            sellState.trimAskAttempts=0;
            sellState.carName=`${prevCar} ${trimToken}`.replace(/\s+/g," ").trim();
            sellState.carRaw=sellState.carName;
            resumeWizardAfterVehicle(`Got it, the ${sellState.carName}.`);
            return true;
          }
          // Not a usable trim: drop the input and proceed broad, never re-ask.
          sellState.carName=prevCar;sellState.carRaw=prevCar;
          sellState.vehicleDetailSkipped=true;sellState.lastMissingAsk=null;
          resumeWizardAfterVehicle(`I'll take the ${prevCar} as-is and keep the read broad rather than keep asking.`);
          return true;
        }
        askMissingVehicleDetail(missing);
        return true;
      }
      sellState.lastMissingAsk=null;
      addMsg("sam",vehicleAcceptPrefix());
    }
    resumeWizardAfterVehicle();
    return true;
  }

  // ── STEP 11: COUNTRY (first location step) ───────────────────
  if(step===11){
    // Off-script questions route to chat; any other input maps to a country
    // (US / UK / Canada / international) via detectCountry.
    if(isQuestionInput(q)&&!/united states|united kingdom|canada|elsewhere|^us\b|^uk\b|america|britain|england|scotland|wales/i.test(lower))return false;
    const c=detectCountry(q);
    sellState.region=c.region;
    sellState.state=null;
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
    sellState.step=18;
    addMsg("sam",locationAskText(),"",sellState.region==="US"?chipsHTML(SELL_STEP_QUESTIONS[18].chips):"");
    return true;
  }

  // ── STEP 18: STATE (US) or CITY/REGION (non-US) ──────────────
  // Country is already set at step 11. US -> resolve a state; non-US -> a free
  // text city/region that feeds the policy-region handling. Then straight to price.
  if(step===18){
    if(sellState.region==="US"){
      if(/^other$/i.test(lower)){addMsg("sam","No problem. Which state? Type the name, the two-letter code, or the ZIP.");return true;}
      const resolved=resolveStateInput(q);
      if(resolved.kind==="country"){addMsg("sam",`${resolved.name} is a country, not a state. Which state is it in? Type the name, the two-letter code, or the ZIP.`);return true;}
      if(resolved.kind==="state"||resolved.kind==="skip"){
        sellState.state=resolved.kind==="skip"?"Not sure":resolved.value;
      }else{
        const pipedState=pipelineProcess(q,step);
        if(pipedState.action==="chat")return false;
        if(pipedState.action==="escalate"){escalateStep(step);return true;}
        sellState.state=pipedState.action==="store"&&typeof pipedState.value==="string"?pipedState.value:"Not sure";
      }
    }else{
      // Non-US: free-text city/region. Off-script questions still route to chat.
      if(isQuestionInput(q)&&!/^skip$|not sure/i.test(lower))return false;
      sellState.state=/^(skip|not sure)$/i.test(lower)?"Not sure":(String(q||"").trim()||"Not sure");
    }
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
    if(sellState.price){sellState.step=8;askPowerSellerStep();return true;}
    sellState.step=6;
    addMsg("sam",SELL_STEP_QUESTIONS[6].ask);
    return true;
  }

  // ── STEPS 2-9: all through the pipeline ─────────────────────
  if(STEP_SPECS[step]&&step!==11&&step!==18&&step!==8){
    const piped=pipelineProcess(q,step);
    if(piped.action==="chat")return false;
    if(piped.action==="escalate"){escalateStep(step);return true;}
    sellState[STEP_SPECS[step].field]=piped.value;
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
    // Thesis v1: price is the last free-text intake step; it hands to the
    // PowerSeller-preference question (step 8), then confirm.
    if(step===6){sellState.step=8;askPowerSellerStep();return true;}
    // Legacy fall-through for any still-declared step (2-9); none are in the
    // four-question flow, but keep a safe route if one is ever reached directly.
    const FLOW_AFTER={2:6,3:6,4:6,5:6,7:6,9:6};
    const next=FLOW_AFTER[step]||6;
    sellState.step=next;
    const nextQ=SELL_STEP_QUESTIONS[next];
    addMsg("sam",nextQ.ask,"",nextQ.chips&&nextQ.chips.length?chipsHTML(nextQ.chips):"");
    return true;
  }

  // ── STEP 8: PowerSeller preference (FIX 3, LAST wizard step) ──
  if(step===8){
    // Off-script questions route to the chat layer (locked rule 12); a wordy
    // move-on/refusal advances as "unsure" rather than stalling.
    if(isQuestionInput(q)&&!/powerseller|power seller|handle|help|myself|list it|diy|not sure|^yes|^no/i.test(lower))return false;
    let pref;
    if(/powerseller|power seller|handle everything|have it handled|handled|someone|get help|^yes\b/i.test(lower))pref="powerseller";
    else if(/myself|list and handle|handle it myself|list it|run it|on my own|diy|^no\b/i.test(lower)||detectIntent(lower)==="negation")pref="diy";
    else pref="unsure";
    sellState.sellerPreference=pref;
    // Reuse the existing involvement gate so the result stage honors the choice.
    sellState.involvement=pref==="powerseller"?"Want someone to handle everything":pref==="diy"?"I'll manage it myself":"";
    // Preference is the final intake question. There is no confirm step: the
    // answer runs the analysis directly (the parsed summary shows as a strip at
    // the top of the analysis screen). An edit re-runs the analysis too.
    sellState.returnToConfirm=false;
    showSellRecommendation();
    return true;
  }

  // ── STEP 16: confirmation ────────────────────────────────────
  if(step===16){
    if(detectIntent(lower)==="affirmation"||/run my analysis|run the analysis|analy[sz]e|looks good|looking good|confirm|all good|submit|perfect|great/i.test(lower)){
      const missing=currentMissingVehicleDetail();
      if(missing){
        sellState.returnToConfirm=true;
        askMissingVehicleDetail(missing);
        return true;
      }
      // Thesis v1: preference was already the fourth intake question, so
      // confirming goes straight to the analysis + recommendation.
      showSellRecommendation();
      return true;
    }
    if(/change something|i want to change|change|edit|no|wrong|mistake/i.test(lower)){
      addMsg("sam","No problem. What would you like to change?","",chipsHTML(["Car","Location","Price","How I'll sell it"]));
      return true;
    }
    // Field-specific change chips (four-question flow).
    if(/^car$/i.test(lower)){sellState.returnToConfirm=true;sellState.carName=null;sellState.carType=null;sellState.vehicleIdentityValidated=false;sellState.pendingVehicleIdentity=null;sellState.step=1;addMsg("sam","What are you selling? Year, make, and model.");return true;}
    if(/^location$|^region$|^country$|^state$/i.test(lower)){sellState.returnToConfirm=true;sellState.region=null;sellState.state=null;sellState.step=11;addMsg("sam",SELL_STEP_QUESTIONS[11].ask,"",chipsHTML(SELL_STEP_QUESTIONS[11].chips));return true;}
    if(/^price$/i.test(lower)){sellState.returnToConfirm=true;sellState.price=null;sellState.step=6;addMsg("sam",SELL_STEP_QUESTIONS[6].ask);return true;}
    if(/^how i'll sell it$|^preference$|^selling preference$|^involvement$|^how i sell/i.test(lower)){sellState.returnToConfirm=true;sellState.sellerPreference=null;sellState.involvement=null;sellState.step=8;askPowerSellerStep();return true;}
    return true;
  }

  // ── STEP 12: recommendation follow-up ───────────────────────
  if(step===12){
    if(handleSellRecommendationFollowup(q))return true;
    // Anything the follow-up handler couldn't resolve, if it's a real message
    // (a question OR two-plus words), routes to the chat layer for a genuine
    // answer (returning false -> handleSellStep false -> chat), never a canned
    // deflection. Only empty/one-word noise gets the guidance line. (rule 12)
    if(isQuestionInput(q)||String(q||"").trim().split(/\s+/).filter(Boolean).length>=2)return false;
    addMsg("sam","Ask me about any choice above, or choose the one you'd like to explore.");
    return true;
  }

  // ── STEP 14: sell another ────────────────────────────────────
  if(step===14){
    if(/yes|another|sure|yeah/i.test(lower)){startSellFlow();}
    else{
      sellState.active=false;sellState.step=0;
      addMsg("sam","You're all set. They'll be in touch within 24 hours. Feel free to browse what's live right now in the meantime.");
      setTimeout(()=>{addMsg("sam","","",chipsHTML(["Browse live auctions","Find a Porsche","Show me weekend cars"]));},600);
    }
    return true;
  }

  return false;
}

function showPhotoUpload(){
  hideHero();
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.className="row sam";
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    <div class="sam-text">Add a photo of your car if you have one handy. It helps us send the strongest possible submission.</div>
    <div class="upload-area" onclick="document.getElementById('photoInput').click()">
      <input type="file" id="photoInput" accept="image/*" onchange="handlePhotoUpload(event)">
      <div class="upload-icon">📷</div>
      <div class="upload-label"><strong>Add a photo</strong>Click to upload or drag and drop</div>
    </div>
    <div id="photoPreview"></div>
    <div class="chips" style="margin-top:8px">
      <button class="chip" onclick="skipPhoto()">Skip for now</button>
      <button class="chip" id="continuePhotoBtn" style="display:none;border-color:#171717;color:#171717;font-weight:800" onclick="afterPhoto()">Continue →</button>
    </div>
  </div></div>`;
  msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
}
function handlePhotoUpload(e){
  const file=e.target.files[0];if(!file)return;
  sellState.photo=file.name;
  const reader=new FileReader();
  reader.onload=ev=>{
    const p=document.getElementById("photoPreview");
    if(p)p.innerHTML=`<div class="upload-preview"><img src="${ev.target.result}" alt="Car"><span>${escapeHtml(file.name)}</span></div>`;
    const b=document.getElementById("continuePhotoBtn");if(b)b.style.display="";
  };
  reader.readAsDataURL(file);
}
function skipPhoto(){sellState.photo=null;afterPhoto();}
function afterPhoto(){
  addMsg("user",sellState.photo?`Photo added: ${sellState.photo}`:"Skipping photo for now");
  sellState.step=16;
  setTimeout(()=>showConfirmation(),600);
}

function showConfirmation(){
  const missing=currentMissingVehicleDetail();
  if(missing){
    sellState.returnToConfirm=true;
    askMissingVehicleDetail(missing);
    return;
  }
  sellState.step=16;
  hideHero();
  // Compressed confirm (no standalone table): one acknowledgment line + chips.
  // Same error-gate above; wizard_complete still fires on Run my analysis.
  const car=sellState.carName?carDisplayLabel():"your car";
  const loc=sellState.state||sellState.region||"your area";
  const price=(typeof formatAskingPrice==="function")?formatAskingPrice(sellState.price):(sellState.price||"a price you'll set");
  const prefLabel=sellState.sellerPreference==="powerseller"?"having it handled"
    :sellState.sellerPreference==="diy"?"selling it yourself"
    :"not sure yet";
  addMsg("sam",`Got it. ${car}, ${loc}, asking ${price}, ${prefLabel}.`,"",chipsHTML(["Run my analysis →","Change something"]));
}

