const SYS=`You are Sam, the seller-intelligence guide behind GoAskSam. You help people decide where to sell their collector car.

ABOUT (ground truth; never contradict it, never claim ignorance of it):
- GoAskSam is a seller-intelligence tool that answers one question: where should you sell your collector car. It analyzes real auction sale records across platforms like Bring a Trailer, Cars & Bids, Hagerty, PCarMarket, Hemmings, Sotheby's Motorsport and MB Market, with more online platforms being added.
- GoAskSam is part of The Daily Vroom, the trusted collector car newsletter read by tens of thousands of readers and running for years. If asked whether GoAskSam is part of The Daily Vroom, the answer is definitively yes.
- Sam Gold owns The Daily Vroom. The Daily Vroom's tools also include the Import Calculator.
- Whenever you name the platforms GoAskSam analyzes, always add that more online platforms are being added; never present the list as final or complete.

CAPABILITY HONESTY (locked): The product does exactly one thing: analyze real sale records and recommend where to sell a specific car. You can NEVER offer to browse listings, show live auctions, pull up cars, track comments, or anything else the product does not do. The one thing you can always offer: tell me the car you're selling and I'll run the analysis.

IDENTITY: You are Sam. Never say you are Claude, ChatGPT, OpenAI, Anthropic, an LLM, or a language model.
PERSONALITY: Warm, direct, human. No essays. No fluff. No false certainty. Never use em dashes or en dashes anywhere in your replies; use commas or periods instead. Plain prose only: no markdown, asterisks, underscores or headers. Never open with filler like "Great question".
GROUNDING: Never state platform fees, commissions, percentages or caps as fact; GoAskSam holds no fee data. No platform-mechanics claims (auction formats, durations, audiences). No invented market commentary. No statistics you were not given.
NEVER GATHER VEHICLE DATA: you never ask for model, trim, mileage, options or specs in chat; the wizard collects those. If someone names or partially names a car, ask them only to give the year, make and model in one line so the analysis can start. One line, nothing else.
OFF TOPIC: Warm redirect, vary wording, land on: what car are we selling?
JOKES: Play along briefly, redirect to cars.`;

const chatHistory=[]; // NB: not window.history - named distinctly so it can't shadow the History API
const API_ORIGIN=location.hostname==="localhost"||location.hostname==="127.0.0.1"||location.protocol==="file:"?"https://goasksam.vercel.app":"";

function hideHero(){const h=document.getElementById("hero");if(h)h.remove();if(typeof enterChatState==="function")enterChatState();}
function escapeHtml(str){return String(str||"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));}
function escapeRegExp(str){return String(str||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function normalizeVehicleAnswer(str){return String(str||"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function apiPath(path){return `${API_ORIGIN}${path}`;}
function activeVehicleIssue(){return sellState.pendingVehicleIdentity||currentMissingVehicleDetail();}
function exampleCarText(partialVehicle){
  // Typed examples build from the user's own car and ALWAYS include a model:
  // "like '1976 Ford'" teaches the wrong shape.
  const EXAMPLE_MODELS={ford:"Bronco",porsche:"911",bmw:"M3",chevrolet:"Corvette",dodge:"Challenger",toyota:"Land Cruiser",mercedes:"280SL","mercedes-benz":"280SL",jaguar:"XKE",volkswagen:"Beetle",ferrari:"308",lamborghini:"Huracan",audi:"TT",lexus:"LX 470",mazda:"MX-5",nissan:"GT-R",honda:"S2000"};
  const make=String(partialVehicle?.make||"");
  const model=partialVehicle?.model||EXAMPLE_MODELS[make.toLowerCase()]||null;
  if(make&&model)return `${partialVehicle?.year||"1985"} ${make} ${model}`;
  return "2018 Porsche 911 Carrera GTS";
}
function askVehicleIdentityClarification(clarification,status,partialVehicle){
  sellState.vehicleIdentityValidated=false;
  let ask=clarification.question;
  let chips=clarification.chips||["Change car","Not sure"];
  // Never show the same clarification twice in a row: switch to what was
  // understood plus exactly what is missing, or lead with a best guess.
  if(sellState.lastVehicleAsk===clarification.question){
    sellState.vehicleClarifyRepeats=(sellState.vehicleClarifyRepeats||0)+1;
    const understood=[partialVehicle?.year,partialVehicle?.make,partialVehicle?.model].filter(Boolean).join(" ");
    const missingParts=(clarification.missing&&clarification.missing.length)
      ?clarification.missing
      :["year","make","model"].filter(part=>!partialVehicle?.[part]);
    const missing=missingParts.length>1
      ?missingParts.slice(0,-1).join(", ")+" and "+missingParts[missingParts.length-1]
      :(missingParts[0]||"model");
    const alt=sellState.vehicleClarifyRepeats%2===0;
    if(clarification.suggestion){
      ask=alt
        ?`If it's not the ${clarification.suggestion}, type the exact model name and I'll take it from there.`
        :`My best guess is ${clarification.suggestion}. Tap it below if that's right, or type the full year, make and model.`;
    }else if(understood){
      ask=alt
        ?`Still missing the ${missing} for the ${understood}. The badge or the registration usually settles it. What does it say?`
        :`So far I have ${understood}. I just need the ${missing}. You can also type the whole thing, like '${exampleCarText(partialVehicle)}'.`;
    }else{
      ask=alt
        ?`Let's build it up instead. Give me just the make to start, like 'Porsche' or 'Chevrolet'.`
        :`I still couldn't match that to a car I know. Try the year, make and model together, like '1972 VW Beetle' or '2005 Mazda MX-5'.`;
    }
    if(sellState.vehicleClarifyRepeats>=2&&!chips.includes("Not sure"))chips=[...chips,"Not sure"];
  }else{
    sellState.vehicleClarifyRepeats=0;
  }
  sellState.lastVehicleAsk=clarification.question;
  // Year-only gap (locked): make and model resolved, only the year missing.
  // A make/model-level recommendation is viable, so a single decline
  // proceeds immediately; the year is never demanded a second time.
  const missingFields=clarification.missing||[];
  const yearOnly=!!(partialVehicle?.make&&partialVehicle?.model
    &&!partialVehicle?.year
    &&missingFields.length===1&&missingFields[0]==="year");
  sellState.pendingVehicleIdentity={
    type:status==="invalid_vehicle"?"invalid_vehicle":"model",
    ask,
    chips,
    suggestion:clarification.suggestion||null,
    baseVehicle:clarification.baseVehicle||[partialVehicle?.make,partialVehicle?.model].filter(Boolean).join(" ")||null,
    // Original raw input, preserved so a corrected year re-resolves the full
    // text and recovers model detail dropped by a mis-parse (e.g. "018 Porsche
    // 718 Cayman" keeps "718" when the year is fixed to 2018).
    rawInput:partialVehicle?.raw||null,
    yearOnly
  };
  sellState.step=17;
  addMsg("sam",sellState.pendingVehicleIdentity.ask,"",chipsHTML(sellState.pendingVehicleIdentity.chips));
}
function preserveDetailedVehicleLabel(candidate,canonical){
  const candidateText=String(candidate||"").replace(/\s+/g," ").trim();
  const canonicalText=String(canonical||"").replace(/\s+/g," ").trim();
  if(!candidateText)return canonicalText;
  if(!canonicalText)return candidateText;
  const normalizedCandidate=normalizeVehicleAnswer(candidateText);
  const normalizedCanonical=normalizeVehicleAnswer(canonicalText);
  const hasExtraDetail=normalizedCandidate.startsWith(normalizedCanonical)&&normalizedCandidate!==normalizedCanonical;
  return hasExtraDetail?candidateText:canonicalText;
}
// SINGLE VEHICLE RESOLVER (Phase 1a). resolveVehicleInput(text, context) is the
// ONE choke point every input path routes through (initial entry, step 1, the
// trim/model clarification, corrections, and confirm-step car edits). It calls
// the shared backend resolver and records its verdict on sellState.lastIdentity-
// Verdict as one of: "valid" (verified model), "unverified" (accepted but no
// catalog match), "handled" (a did-you-mean/clarification was rendered), or
// "not_vehicle". No code may set sellState.carName from raw text and skip this.
// (a) Fail CLOSED on a resolver error: a network failure, non-ok/sealed response, or
// any unrecognized status must NEVER be treated as "accept the raw typed text and
// proceed" (the old fail-open let a misspelled marque skip the typo confirm, the model
// question and the out-of-scope gate, and run the whole search on the raw string). Re-ask
// the vehicle, every gate intact. Returns false so callers halt; opts.silentError
// suppresses the seller-facing line (e.g. a background probe that will re-ask itself).
function identityResolveError(opts){
  sellState.lastIdentityVerdict="error";
  if(!(opts&&opts.silentError)&&typeof addMsg==="function"){
    addMsg("sam","I couldn't check that one just now. Mind giving me the year, make and model again?");
  }
  return false;
}
async function resolveVehicleInput(candidate,opts={}){
  sellState.vehicleIdentityValidated=false;
  sellState.resolvedVehicle=null;
  sellState.lastIdentityVerdict=null;
  // Bug 1: show the lookup loader while the identity call is in flight; the
  // finally below removes it right before the next question/clarification renders.
  if(typeof showVehicleLookup==="function")showVehicleLookup();
  try{
    // (b) Collapse the double /api/vehicleIdentity call: the cold-entry probe already
    // resolved this exact text, so reuse its result instead of firing a second request
    // (which halved the LLM cost and, more importantly, the failure surface that fed
    // the fail-open above).
    let res,data;
    if(opts.preresolved&&opts.preresolvedText===candidate){
      res={ok:true}; data=opts.preresolved;
    }else{
      try{
        res=await fetch(apiPath("/api/vehicleIdentity"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:candidate})});
        data=await res.json();
      }catch(e){ return identityResolveError(opts); }
    }
    if(!res.ok||!data) return identityResolveError(opts);
    // Model-level archive count for the out-of-scope gate + rarity wording.
    if(data.archiveModelCount!==undefined)sellState.archiveModelCount=data.archiveModelCount;
    // Field hints apply regardless of resolution status: a location or price
    // token belongs to its field even when the car still needs clarifying.
    // US-only launch: a location hint from the car text pre-fills the state ONLY
    // when it resolves to the US (so "911 in California" skips the state step). A
    // non-US hint is ignored, so region never silently becomes non-US; the seller
    // still reaches the state step and its locked non-US line. Parked: full non-US
    // hint handling returns with the UK launch.
    if(data.vehicle?.locationHint&&!sellState.region&&data.vehicle.locationHint.region==="US"){
      sellState.region="US";
      sellState.state=data.vehicle.locationHint.state||null;
    }
    if(data.vehicle?.priceHint&&!sellState.price)sellState.price=data.vehicle.priceHint;
    if(data.vehicle?.conditionHint&&!sellState.conditionHint){
      sellState.conditionHint=data.vehicle.conditionHint;
      sellState.notes=[sellState.notes,`Condition noted: ${data.vehicle.conditionHint}`].filter(Boolean).join(". ");
    }
    if(data.status==="valid"){
      sellState.vehicleIdentityValidated=true;
      sellState.pendingVehicleIdentity=null;
      sellState.resolvedVehicle=data.vehicle||null;
      if(data.vehicle?.mileage&&!sellState.mileage)sellState.mileage=`${Number(data.vehicle.mileage).toLocaleString()} miles`;
      // Field hints from the resolver land in their own fields, never the car
      // label; the wizard then skips what is already answered.
      sellState.lastVehicleAsk=null;
      sellState.vehicleClarifyRepeats=0;
      // Phase 1a: the resolver's verdict is surfaced identically by every input
      // path. An unverified designation (no catalog match) is never a silent
      // "valid": callers acknowledge it as unverified via vehicleAcceptPrefix().
      sellState.lastIdentityVerdict=data.vehicle?.unverified?"unverified":"valid";
      if(data.vehicle?.canonicalLabel){
        // Render gate (locked): the ONLY string that may render as a car is
        // the resolver's canonical label. Raw input never becomes a label.
        sellState.carName=data.vehicle.canonicalLabel;
        sellState.carRaw=data.vehicle.canonicalLabel;
      }
      return true;
    }
    if((data.status==="invalid_vehicle"||data.status==="needs_clarification"||data.status==="needs_confirmation")&&data.clarification?.question){
      const partial=data.vehicle||{};
      const nothingUnderstood=data.status==="needs_clarification"&&!partial.year&&!partial.make&&!partial.model;
      if(nothingUnderstood&&opts.chatFallback){
        // Not a car and not a wizard answer: the caller routes it to the chat
        // layer for a real reply, then re-asks the current question.
        sellState.lastIdentityVerdict="not_vehicle";
        return false;
      }
      askVehicleIdentityClarification(data.clarification,data.status,partial);
      sellState.lastIdentityVerdict="handled";
      return false;
    }
    // (a) Any other/unrecognized status (e.g. a sealed body, or a shape we do not
    // handle): fail closed, never silently accept the raw typed text.
    return identityResolveError(opts);
  }catch(e){
    // (a) Any processing error also fails closed rather than accepting raw text.
    return identityResolveError(opts);
  }finally{
    if(typeof hideVehicleLookup==="function")hideVehicleLookup();
  }
}
// Back-compat alias: existing call sites keep working while the canonical name
// is resolveVehicleInput. Both refer to the one resolver above.
const validateVehicleIdentityPreflight=resolveVehicleInput;
function parseResults(raw){
  const chipMatch=raw.match(/\[CHIPS:([^\]]+)\]/);
  const chips=chipMatch?chipMatch[1].split("|").map(x=>x.trim()).filter(Boolean):[];
  const clean=raw.replace(/\[SEARCHING:.*?\]/g,"").replace(/\[CARD:.*?\]/g,"").replace(/\[RNM:.*?\]/g,"").replace(/\[CHIPS:.*?\]/g,"").trim();
  const chipsHTML2=chips.length?`<div class="chips">${chips.map(c=>`<button class="chip" onclick="handleChip('${c.replace(/'/g,"\\'")}')"> ${escapeHtml(c)}</button>`).join("")}</div>`:"";
  return{clean,chipsHTML:chipsHTML2};
}
let __lastSamText=null;
const __recentSamTexts=[];
// Fix 1c / Fix 5: the ONE shared forbidden-copy gate for Sam-voice surfaces.
// Market sample sizes (counts of sales/comps/comparables/records/results/listings)
// are banned in every user-facing surface - the model must never state HOW MANY
// exist, only qualitative confidence. This runs at render time on every Sam
// message (chat, wizard, modals via addMsg) and on card copy (result.js calls it
// on composeCard headline+bullets), as a belt to the payload-side prevention. A
// hit is scrubbed to a qualitative phrase and logged. Years (4 digits) and
// model numbers followed by a name are left untouched.
const SAM_COUNT_RE=/\b\d{1,3}\s+(comparable|comparables?|comps?|records?|results?)\b/gi;
function samForbiddenScrub(text){
  const original=String(text==null?"":text);
  const scrubbed=original.replace(SAM_COUNT_RE,(m,noun)=>`recent ${noun}`);
  if(scrubbed!==original){try{(typeof console!=="undefined"&&console.warn)&&console.warn("[copy-gate] scrubbed a sales-count phrase:",original.slice(0,140));}catch(e){}}
  return scrubbed;
}
function addMsg(role,text,html="",chipsStr=""){
  hideHero();
  // Deactivate chips from completed steps before rendering the next message.
  if(typeof dimStaleChips==="function")dimStaleChips();
  if(role==="sam"&&text)text=samForbiddenScrub(text);
  // Global no-repeat backstop (locked rule 12): no Sam text renders twice in a
  // conversation, not just consecutively. A repeat within the recent window
  // (e.g. Sam P -> fallback -> Sam P) is caught and varied. Callers should still
  // escalate/route properly; this is the backstop.
  if(role==="sam"&&text&&__recentSamTexts.includes(text)){
    // Vary a repeat with a neutral nudge. No escape-hatch copy (A2): we never
    // advertise a magic word like "move on"; the pipeline handles advancing.
    const nudges=[" Take your time with this one."," Whenever you're ready."," No pressure either way."];
    const seen=__recentSamTexts.filter(t=>t.startsWith(text)).length;
    text=`${text}${nudges[seen%nudges.length]}`;
  }
  if(role==="sam"&&text){
    __lastSamText=text;
    __recentSamTexts.push(text);
    if(__recentSamTexts.length>12)__recentSamTexts.shift();
  }
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.className="row "+role;
  const inner=document.createElement("div");inner.className="row-inner";
  if(role==="sam"){
    // Edit at every step (locked): once the car is resolved, every wizard
    // question carries the car name with an Edit link back to vehicle entry.
    const showCarContext=sellState.active&&sellState.carName&&sellState.vehicleIdentityValidated&&[11,18,2,3,4,5,6,7,9].includes(sellState.step);
    const carContext=showCarContext?`<div class="wizard-car-context">${escapeHtml(sellState.carName)} <button class="edit-car-link" onclick="editCarName()">Edit</button></div>`:"";
    inner.innerHTML=`<div class="msg-wrap"><div class="sam-label">Sam</div>${carContext}<div class="sam-text">${escapeHtml(text)}</div>${chipsStr||""}${html||""}</div>`;
  }else{
    inner.innerHTML=`<div class="msg-wrap"><div class="user-text">${escapeHtml(text)}</div></div>`;
  }
  row.appendChild(inner);msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
  return row;
}
