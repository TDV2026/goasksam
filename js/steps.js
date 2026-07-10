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
    if(/later|not sure|don.t know|skip|tell you later|can i give|give it later/i.test(lower)){
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
    resumeWizardAfterVehicle(`Got it. ${sellState.carName}.`);
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
    // Chip answers and explicit skip/move-on always advance (chip labels can
    // never be rejected by their own step). Wordy refusals like "don't know"
    // go to the chat layer for a real explanation of where to find the trim;
    // the re-ask escalates with a Skip chip and a 3-attempt cap.
    const ownEscapeChip=/^(not sure|skip this step|skip)$/i.test(lower.trim());
    if(detectIntent(lower)==="moveOn"||ownEscapeChip||/\bskip\b/i.test(lower)){
      sellState.vehicleDetailSkipped=true;
      sellState.trimAskAttempts=0;
      sellState.lastMissingAsk=null;
      addMsg("sam","No problem. I'll keep it broad for now, but the recommendation may be more directional without the exact model.");
    }else if(detectIntent(lower)==="refusal"){
      return false;
    }else{
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
          // The same question would render again: drop the unrecognized input
          // instead of storing it, and proceed broad (never repeat, rule 12).
          sellState.carName=prevCar;sellState.carRaw=prevCar;
          sellState.vehicleDetailSkipped=true;sellState.lastMissingAsk=null;
          resumeWizardAfterVehicle(`I'll take the ${prevCar} as-is and keep the read broad rather than keep asking.`);
          return true;
        }
        askMissingVehicleDetail(missing);
        return true;
      }
      sellState.lastMissingAsk=null;
      addMsg("sam",`Got it. ${sellState.carName}.`);
    }
    resumeWizardAfterVehicle();
    return true;
  }

  // ── STEP 11: region ──────────────────────────────────────────
  if(step===11){
    const pipedRegion=pipelineProcess(q,step);
    if(pipedRegion.action==="chat")return false;
    if(pipedRegion.action==="escalate"){escalateStep(step);return true;}
    const stateFromAnswer=normalizeUSState(q);
    sellState.region=stateFromAnswer?"US":q;
    sellState.state=stateFromAnswer||null;
    if(isUSRegion(sellState.region)&&!sellState.state){
      if(sellState.returnToConfirm){
        sellState.step=18;
        addMsg("sam","Which state is it in? This helps me think about PowerSeller and handoff options. Type it if it is not shown.","",chipsHTML(["California","Florida","Texas","New York","New Jersey","Other"]));
        return true;
      }
      sellState.step=18;
      addMsg("sam","Which state is it in? This helps me think about PowerSeller and handoff options. Type it if it is not shown.","",chipsHTML(["California","Florida","Texas","New York","New Jersey","Other"]));
      return true;
    }
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
    if(sellState.mileage){
      sellState.step=3;
      addMsg("sam","Stock or modified?","",chipsHTML(["Completely stock","Minor mods","Heavily modified"]));
      return true;
    }
    sellState.step=2;
    addMsg("sam","Rough mileage?","",chipsHTML(["Under 30k","30k to 60k","60k to 100k","Over 100k"]));
    return true;
  }

  // ── STEP 18: US state ────────────────────────────────────────
  if(step===18){
    if(/^other$/i.test(lower)){
      addMsg("sam","No problem. Which state?");
      return true;
    }
    const pipedState=pipelineProcess(q,step);
    if(pipedState.action==="chat")return false;
    if(pipedState.action==="escalate"){escalateStep(step);return true;}
    sellState.region="US";
    sellState.state=pipedState.action==="store"&&typeof pipedState.value==="string"?pipedState.value:"Not sure";
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
    if(sellState.mileage){
      sellState.step=3;
      addMsg("sam","Stock or modified?","",chipsHTML(["Completely stock","Minor mods","Heavily modified"]));
      return true;
    }
    sellState.step=2;
    addMsg("sam","Rough mileage?","",chipsHTML(["Under 30k","30k to 60k","60k to 100k","Over 100k"]));
    return true;
  }

  // ── STEPS 2-9: all through the pipeline ─────────────────────
  if(STEP_SPECS[step]&&step!==11&&step!==18){
    const piped=pipelineProcess(q,step);
    if(piped.action==="chat")return false;
    if(piped.action==="escalate"){escalateStep(step);return true;}
    sellState[STEP_SPECS[step].field]=piped.value;
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
    const FLOW_AFTER={2:3,3:4,4:5,5:6,6:7,7:9};
    if(step===9){sellState.step=10;showPhotoUpload();return true;}
    const next=FLOW_AFTER[step];
    sellState.step=next;
    const nextQ=SELL_STEP_QUESTIONS[next];
    addMsg("sam",nextQ.ask,"",nextQ.chips&&nextQ.chips.length?chipsHTML(nextQ.chips):"");
    return true;
  }

  // ── STEP 16: confirmation ────────────────────────────────────
  if(step===16){
    if(detectIntent(lower)==="affirmation"||/looks good|looking good|confirm|all good|submit|perfect|great/i.test(lower)){
      const missing=currentMissingVehicleDetail();
      if(missing){
        sellState.returnToConfirm=true;
        askMissingVehicleDetail(missing);
        return true;
      }
      showSellRecommendation();
      return true;
    }
    if(/change something|i want to change|change|edit|no|wrong|mistake/i.test(lower)){
      addMsg("sam","No problem. What would you like to change?","",chipsHTML(["Car","Location","State","Mileage","Condition","Service records","Title","Price","Timeline","Notes"]));
      return true;
    }
    // Field-specific change chips
    if(/^car$/i.test(lower)){sellState.returnToConfirm=true;sellState.carName=null;sellState.carType=null;sellState.vehicleIdentityValidated=false;sellState.pendingVehicleIdentity=null;sellState.step=1;addMsg("sam","What are we selling today? Year, make, and model.");return true;}
    if(/^location$|^region$/i.test(lower)){sellState.returnToConfirm=true;sellState.region=null;sellState.state=null;sellState.step=11;addMsg("sam","Where is the car located?","",chipsHTML(["US","UK","Europe","Australia","Middle East","Other"]));return true;}
    if(/^state$/i.test(lower)){sellState.returnToConfirm=true;sellState.region="US";sellState.state=null;sellState.step=18;addMsg("sam","Which state is it in? This helps me think about PowerSeller and handoff options. Type it if it is not shown.","",chipsHTML(["California","Florida","Texas","New York","New Jersey","Other"]));return true;}
    if(/^mileage$/i.test(lower)){sellState.returnToConfirm=true;sellState.mileage=null;sellState.step=2;addMsg("sam","Rough mileage?","",chipsHTML(["Under 30k","30k to 60k","60k to 100k","Over 100k"]));return true;}
    if(/^condition$/i.test(lower)){sellState.returnToConfirm=true;sellState.condition=null;sellState.step=3;addMsg("sam","Stock or modified?","",chipsHTML(["Completely stock","Minor mods","Heavily modified"]));return true;}
    if(/^service records$/i.test(lower)){sellState.returnToConfirm=true;sellState.records=null;sellState.step=4;addMsg("sam","Service records?","",chipsHTML(["Full history","Some records","No records"]));return true;}
    if(/^title$/i.test(lower)){sellState.returnToConfirm=true;sellState.title=null;sellState.step=5;addMsg("sam","Clean title or is there a lien on it?","",chipsHTML(["Clean title","Lien on it"]));return true;}
    if(/^price$/i.test(lower)){sellState.returnToConfirm=true;sellState.price=null;sellState.step=6;addMsg("sam","What price are you hoping for?");return true;}
    if(/^timeline$/i.test(lower)){sellState.returnToConfirm=true;sellState.timeline=null;sellState.step=7;addMsg("sam","How quickly are you looking to sell?","",chipsHTML(["Want it gone fast","Within a month","No rush, right result only"]));return true;}
    if(/^involvement$/i.test(lower)){sellState.returnToConfirm=true;sellState.involvement=null;sellState.step=8;addMsg("sam","Hands-on or hands-off?","",chipsHTML(["I'll manage it","Want someone to handle everything","Either works"]));return true;}
    if(/^notes$/i.test(lower)){sellState.returnToConfirm=true;sellState.notes=null;sellState.step=9;addMsg("sam","Anything else Sam should know about the car?","",chipsHTML(["Skip"]));return true;}
    return true;
  }

  // ── STEP 12: recommendation follow-up ───────────────────────
  if(step===12){
    if(handleSellRecommendationFollowup(q))return true;
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
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.className="row sam";
  const rows=[
    {label:"Car",value:sellState.carName||"Not set"},
    {label:"Location",value:sellState.region||"Not set"},
    sellState.state?{label:"State",value:sellState.state}:null,
    {label:"Mileage",value:sellState.mileage||"Not set"},
    {label:"Condition",value:sellState.condition||"Not set"},
    {label:"Service records",value:sellState.records||"Not set"},
    {label:"Title",value:sellState.title||"Not set"},
    {label:"Asking price",value:sellState.price||"Not set"},
    {label:"Timeline",value:sellState.timeline||"Not set"},
    sellState.notes?{label:"Notes",value:sellState.notes}:null,
    sellState.photo?{label:"Photo",value:sellState.photo}:null,
  ].filter(Boolean);
  row.innerHTML=`<div class="row-inner"><div class="msg-wrap">
    <div class="sam-label">Sam</div>
    <div class="sam-text">Before I show you where to take this, does everything look right?</div>
    <div class="summary-card">
      ${rows.map(r=>`<div class="summary-row"><span class="summary-label">${escapeHtml(r.label)}</span><span class="summary-value">${escapeHtml(r.value)}</span></div>`).join("")}
    </div>
    <div class="chips" style="margin-top:10px">
      <button class="chip" style="border-color:#171717;color:#171717;font-weight:800" onclick="handleChip('Looks good')">Looks good →</button>
      <button class="chip" onclick="handleChip('Change something')">Change something</button>
    </div>
  </div></div>`;
  msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
}

