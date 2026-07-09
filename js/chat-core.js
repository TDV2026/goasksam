const SYS=`You are Sam, the seller-intelligence guide behind GoAskSam. You help people decide where to sell their collector car.

ABOUT (ground truth; never contradict it, never claim ignorance of it):
- GoAskSam is a seller-intelligence tool that answers one question: where should you sell your collector car. It is built on real auction sale records from platforms including Bring a Trailer, Cars & Bids, PCarMarket, Hagerty, Gooding and RM Sotheby's.
- GoAskSam is part of The Daily Vroom, the trusted collector car newsletter read by tens of thousands of readers and running for years. If asked whether GoAskSam is part of The Daily Vroom, the answer is definitively yes.
- Sam Gold owns The Daily Vroom. The Daily Vroom's tools also include the Import Calculator.

CAPABILITY HONESTY (locked): The product does exactly one thing: analyze real sale records and recommend where to sell a specific car. You can NEVER offer to browse listings, show live auctions, pull up cars, track comments, or anything else the product does not do. The one thing you can always offer: tell me the car you're selling and I'll run the analysis.

IDENTITY: You are Sam. Never say you are Claude, ChatGPT, OpenAI, Anthropic, an LLM, or a language model.
PERSONALITY: Warm, direct, human. No essays. No fluff. No false certainty. Never use em dashes or en dashes anywhere in your replies; use commas or periods instead. Plain prose only: no markdown, asterisks, underscores or headers. Never open with filler like "Great question".
GROUNDING: Never state platform fees, commissions, percentages or caps as fact; GoAskSam holds no fee data. No platform-mechanics claims (auction formats, durations, audiences). No invented market commentary. No statistics you were not given.
NEVER GATHER VEHICLE DATA: you never ask for model, trim, mileage, options or specs in chat; the wizard collects those. If someone names or partially names a car, ask them only to give the year, make and model in one line so the analysis can start. One line, nothing else.
OFF TOPIC: Warm redirect, vary wording, land on: what car are we selling?
JOKES: Play along briefly, redirect to cars.`;

const history=[];
const API_ORIGIN=location.hostname==="localhost"||location.hostname==="127.0.0.1"||location.protocol==="file:"?"https://goasksam.vercel.app":"";

function hideHero(){const h=document.getElementById("hero");if(h)h.remove();}
function escapeHtml(str){return String(str||"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));}
function escapeRegExp(str){return String(str||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function normalizeVehicleAnswer(str){return String(str||"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function apiPath(path){return `${API_ORIGIN}${path}`;}
function activeVehicleIssue(){return sellState.pendingVehicleIdentity||currentMissingVehicleDetail();}
function exampleCarText(partialVehicle){
  // Typed examples build from the user's own car; a generic example may only
  // render when nothing is known yet.
  const knownMakeModel=[partialVehicle?.make,partialVehicle?.model].filter(Boolean).join(" ");
  if(knownMakeModel)return `${partialVehicle?.year||"1985"} ${knownMakeModel}`;
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
  sellState.pendingVehicleIdentity={
    type:status==="invalid_vehicle"?"invalid_vehicle":"model",
    ask,
    chips,
    suggestion:clarification.suggestion||null,
    baseVehicle:clarification.baseVehicle||null
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
async function validateVehicleIdentityPreflight(candidate,opts={}){
  sellState.vehicleIdentityValidated=false;
  sellState.resolvedVehicle=null;
  sellState.lastIdentityVerdict=null;
  try{
    const res=await fetch(apiPath("/api/vehicleIdentity"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:candidate})});
    const data=await res.json();
    if(!res.ok||!data)return true;
    if(data.status==="valid"){
      sellState.vehicleIdentityValidated=true;
      sellState.pendingVehicleIdentity=null;
      sellState.resolvedVehicle=data.vehicle||null;
      if(data.vehicle?.mileage&&!sellState.mileage)sellState.mileage=`${Number(data.vehicle.mileage).toLocaleString()} miles`;
      sellState.lastVehicleAsk=null;
      sellState.vehicleClarifyRepeats=0;
      sellState.lastIdentityVerdict="valid";
      if(data.vehicle?.canonicalLabel){
        const label=preserveDetailedVehicleLabel(candidate,data.vehicle.canonicalLabel);
        sellState.carName=label;
        sellState.carRaw=label;
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
  }catch(e){
    return true;
  }
  return true;
}
function parseResults(raw){
  const chipMatch=raw.match(/\[CHIPS:([^\]]+)\]/);
  const chips=chipMatch?chipMatch[1].split("|").map(x=>x.trim()).filter(Boolean):[];
  const clean=raw.replace(/\[SEARCHING:.*?\]/g,"").replace(/\[CARD:.*?\]/g,"").replace(/\[RNM:.*?\]/g,"").replace(/\[CHIPS:.*?\]/g,"").trim();
  const chipsHTML2=chips.length?`<div class="chips">${chips.map(c=>`<button class="chip" onclick="handleChip('${c.replace(/'/g,"\\'")}')"> ${escapeHtml(c)}</button>`).join("")}</div>`:"";
  return{clean,chipsHTML:chipsHTML2};
}
let __lastSamText=null;
function addMsg(role,text,html="",chipsStr=""){
  hideHero();
  // Global no-repeat backstop (locked rule 12): no Sam text renders twice
  // consecutively anywhere. Callers should escalate properly; this catches
  // whatever slips through with an actionable variation.
  if(role==="sam"&&text&&text===__lastSamText){
    text=`${text} (If you're stuck, say 'move on' and I'll continue with what we have.)`;
  }
  if(role==="sam"&&text)__lastSamText=text;
  const msgs=document.getElementById("msgs");
  const row=document.createElement("div");row.className="row "+role;
  const inner=document.createElement("div");inner.className="row-inner";
  if(role==="sam"){
    inner.innerHTML=`<div class="msg-wrap"><div class="sam-label">Sam</div><div class="sam-text">${escapeHtml(text)}</div>${chipsStr||""}${html||""}</div>`;
  }else{
    inner.innerHTML=`<div class="msg-wrap"><div class="user-text">${escapeHtml(text)}</div></div>`;
  }
  row.appendChild(inner);msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;
  return row;
}
