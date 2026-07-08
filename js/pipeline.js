const INTENT_PATTERNS={
  affirmation:/^(yes|yeah|yeh|yep|yup|ya|sure|ok|okay|correct|right|exactly|indeed|sounds good|that'?s (right|it|correct)|looks (good|right))[.! ]*$/i,
  negation:/^(no|nope|nah|wrong|incorrect|not (right|correct|that))[.! ]*$/i,
  refusal:/\b(not sure|don'?t know|dont know|no idea|dunno|unsure|unknown)\b/i,
  moveOn:/\b(move on|moving on|lets? move|skip( it| this)?|next question|just continue|keep going|carry on|proceed|whatever|forget (it|that|the|about)|without (it|the model)|leave it|drop it)\b/i
};
function detectIntent(input){
  const lower=String(input||"").toLowerCase().trim();
  if(INTENT_PATTERNS.affirmation.test(lower))return "affirmation";
  if(INTENT_PATTERNS.negation.test(lower))return "negation";
  if(INTENT_PATTERNS.moveOn.test(lower))return "moveOn";
  if(INTENT_PATTERNS.refusal.test(lower))return "refusal";
  return null;
}
function isQuestionInput(input){
  const lower=String(input||"").toLowerCase().trim();
  return /\?\s*$/.test(lower)
    ||/^(what'?s?|how'?s?|why'?s?|when|where|who'?s?|can|could|will|would|does|do|is|are|should|but|explain|tell me)\b/.test(lower)
    ||/\b(how long|how many|how much|you never|what happens|whats the point|what is the point)\b/.test(lower);
}
const STEP_SPECS={
  2:{field:"mileage",valid:v=>/\d/.test(v)||/\b(under|over|low|high|barely|hardly)\b/i.test(v)},
  3:{field:"condition",valid:v=>/\b(stock|mod|mods|modded|modified|original|restored|resto|mint|excellent|great|good|fair|poor|project|clean|rough|concours|survivor)\b/i.test(v)},
  4:{field:"records",valid:v=>/\b(full|complete|some|partial|most|every|no records|none|missing|record|history|documented|binder|receipts|stamps)\b/i.test(v)},
  5:{field:"title",valid:v=>/\b(clean|clear|lien|salvage|rebuilt|branded|title|paid off|financed)\b/i.test(v)},
  6:{field:"price",valid:v=>/\d/.test(v)||/\b(flexible|open|offers?|market)\b/i.test(v)},
  7:{field:"timeline",valid:v=>/\b(fast|quick|quickly|asap|soon|week|month|months|year|rush|flexible|whenever|no hurry|hurry|result|gone)\b/i.test(v)},
  9:{field:"notes",freeText:true,refusalValue:null,negationValue:null},
  11:{field:"region",required:true,valid:v=>/\b(us|usa|america|american|states|uk|britain|england|europe|european|australia|middle east|uae|dubai|canada|other)\b/i.test(v)||!!normalizeUSState(v)},
  18:{field:"state",valid:v=>!!normalizeUSState(v)||/^[a-z][a-z .'-]{2,25}$/i.test(String(v).trim()),normalize:v=>normalizeUSState(v)||v}
};
function pipelineProcess(q,step){
  const spec=STEP_SPECS[step];
  if(!spec)return{action:"passthrough"};
  // A step can never reject its own chip labels: they validate verbatim,
  // case-insensitively, before any other shape check.
  const ownChips=(SELL_STEP_QUESTIONS[step]?.chips||[]).map(c=>String(c).toLowerCase());
  const lowered=String(q||"").toLowerCase().trim();
  if(ownChips.includes(lowered)&&!/^(not sure|skip|other)$/i.test(lowered)){
    return{action:"store",value:spec.normalize?spec.normalize(q):q};
  }
  const intent=detectIntent(q);
  if(intent==="moveOn"){
    if(spec.required)return{action:"escalate"};
    return{action:"store",value:spec.refusalValue!==undefined?spec.refusalValue:"Not set"};
  }
  if(intent==="refusal"){
    if(spec.required)return{action:"escalate"};
    return{action:"store",value:spec.refusalValue!==undefined?spec.refusalValue:"Not sure"};
  }
  if(intent==="negation"&&spec.negationValue!==undefined)return{action:"store",value:spec.negationValue};
  if(isQuestionInput(q))return{action:"chat"};
  if(spec.freeText)return{action:"store",value:spec.normalize?spec.normalize(q):q};
  if(!spec.valid(q))return{action:"escalate"};
  return{action:"store",value:spec.normalize?spec.normalize(q):q};
}
function escalateStep(step){
  sellState.stepEscalations=sellState.stepEscalations||{};
  const n=(sellState.stepEscalations[step]=(sellState.stepEscalations[step]||0)+1);
  const stepQ=SELL_STEP_QUESTIONS[step]||{ask:"the current question",chips:[]};
  const variants=[
    `I didn't catch that as an answer to this one. ${stepQ.ask}`,
    `Still on this question: ${stepQ.ask} 'Not sure' works too, or say 'move on'.`
  ];
  addMsg("sam",variants[(n-1)%2],"",stepQ.chips&&stepQ.chips.length?chipsHTML(stepQ.chips):"");
}

