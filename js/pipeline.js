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
// Shared asking-price parser (mirror of the backend parseSellerTargetPrice). The
// price step validates against this, so any digit-bearing input the backend could
// not parse is re-asked here instead of being stored and silently read as null.
function parseAskingPrice(value){
  const text=String(value==null?"":value).toLowerCase().trim();
  if(!text)return null;
  if(/six[\s-]?figure/.test(text))return 100000;
  const compact=text.replace(/,/g,"");
  const suffix=compact.match(/\$?\s*(\d+(?:\.\d+)?)\s*(k|grand|thousand|m|mm|million)\b/);
  if(suffix)return Math.round(Number(suffix[1])*(/^(m|mm|million)$/.test(suffix[2])?1e6:1e3));
  // Bare number: >=1000 literal; 1-999 read as thousands (55 -> 55000). Mirrors
  // the backend parseSellerTargetPrice exactly.
  const num=compact.match(/\$?\s*(\d{1,7})\b/);
  if(num){var n=Number(num[1]);return n>=1000?n:n*1000;}
  return null;
}
// Confirm-summary display: the PARSED interpretation, formatted, never the raw
// string (so "55" reads back as "$55,000"). Flexible answers show a word.
function formatAskingPrice(raw){
  var n=parseAskingPrice(raw);
  if(n==null)return /\b(flexible|open|offers?|market)\b/i.test(String(raw||""))?"Open to offers":(String(raw||"").trim()||"Not set");
  return "$"+n.toLocaleString("en-US");
}
const STEP_SPECS={
  2:{field:"mileage",valid:v=>/\d/.test(v)||/\b(under|over|low|high|barely|hardly)\b/i.test(v)},
  3:{field:"condition",valid:v=>/\b(stock|mod|mods|modded|modified|original|restored|resto|mint|excellent|great|good|fair|poor|project|clean|rough|concours|survivor)\b/i.test(v)},
  4:{field:"records",valid:v=>/\b(full|complete|some|partial|most|every|no records|none|missing|record|history|documented|binder|receipts|stamps)\b/i.test(v)},
  5:{field:"title",valid:v=>/\b(clean|clear|lien|salvage|rebuilt|branded|title|paid off|financed)\b/i.test(v)},
  6:{field:"price",valid:v=>parseAskingPrice(v)!==null||/\b(flexible|open|offers?|market)\b/i.test(v)},
  7:{field:"timeline",valid:v=>/\b(fast|quick|quickly|asap|soon|week|month|months|year|rush|flexible|whenever|no hurry|hurry|result|gone)\b/i.test(v)},
  8:{field:"sellerPreference",valid:v=>/\b(powerseller|power seller|handle|help|myself|list it|diy|self|someone|not sure|yes|no)\b/i.test(v)},
  9:{field:"notes",freeText:true,refusalValue:null,negationValue:null},
  11:{field:"region",required:true,valid:v=>/\b(us|usa|united|america|american|states|uk|britain|kingdom|england|scotland|wales|europe|european|germany|france|italy|spain|australia|new zealand|middle east|uae|dubai|canada|canadian|somewhere|elsewhere|other)\b/i.test(v)||!!normalizeUSState(v)},
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
  // Price step: a digit-bearing input that did not parse is ambiguous, not
  // unrecognized. Ask for a clear figure rather than a generic re-ask, so it is
  // never silently dropped to "no price".
  const variants=(step===6)?[
    `I want to get the number right. Roughly what are you hoping for? You can say something like 65k, $65,000, or 'not sure'.`,
    `Still on price: give me a rough figure like 65k or $65,000, or say 'not sure'.`
  ]:[
    `I didn't catch that as an answer to this one. ${stepQ.ask}`,
    `Still on this question: ${stepQ.ask} 'Not sure' works too.`
  ];
  addMsg("sam",variants[(n-1)%2],"",stepQ.chips&&stepQ.chips.length?chipsHTML(stepQ.chips):"");
}

