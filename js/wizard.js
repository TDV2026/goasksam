// Partner (PowerSeller) profiles come from the backend partners table via
// decision.partnerReferral. Nothing partner-related is hardcoded here.

const sellState={active:false,step:0,carRaw:null,carName:null,carType:null,region:null,state:null,mileage:null,condition:null,records:null,title:null,price:null,timeline:null,involvement:null,sellerPreference:null,notes:null,photo:null,chosen:null,email:null,phone:null,returnToConfirm:false,vehicleDetailSkipped:false,vehicleIdentityValidated:false,pendingVehicleIdentity:null,resolvedVehicle:null,generatedPrimaryName:null,generatedSecondaryName:null,sellDecision:null,sellOptions:[],allRouteOptions:[],powerSellerProfiles:[],selectedPowerSellerId:null,noEvidenceFallback:null,archiveModelCount:null,afterOutOfScope:false};
function resetSellState(){
  Object.keys(sellState).forEach(k=>sellState[k]=null);
  sellState.active=false;sellState.step=0;sellState.returnToConfirm=false;sellState.vehicleDetailSkipped=false;sellState.vehicleIdentityValidated=false;sellState.pendingVehicleIdentity=null;sellState.sellOptions=[];sellState.allRouteOptions=[];sellState.powerSellerProfiles=[];sellState.noEvidenceFallback=null;
}

// Routable-country registry: the SINGLE SOURCE OF TRUTH for which countries we
// can route today. The step-11 chips derive from this, detectCountry resolves
// from it, and isRoutableInternationalRegion checks against it. A country is
// listed ONLY if it routes today (US platforms, or a regional card). Not-routable
// countries (e.g. Canada until phase 2) are absent -> no chip, and they fall to
// the honest no-routing line. Phase 2 adds a region here and its chip appears with
// zero other edits. `route` is documentation of where the region lands.
const COUNTRY_REGISTRY=[
  { chip:"United States", region:"US",          label:"the United States", route:"US auction platforms", match:/^u\.?s\.?a?\.?$|\b(united states|usa|u\.s\.a|america|american|the states)\b/ },
  { chip:"United Kingdom", region:"UK",         label:"the United Kingdom", route:"Car & Classic (Collecting Cars at $100k+)", match:/^u\.?k\.?$|^gb$|\b(united kingdom|britain|great britain|england|scotland|wales|northern ireland)\b/ },
  { chip:"Europe", region:"Europe",             label:"Europe", route:"Car & Classic (Collecting Cars at $100k+)", match:/\b(germany|german|france|french|italy|italian|spain|spanish|netherlands|dutch|belgium|switzerland|swiss|sweden|austria|portugal|ireland|denmark|norway|finland|poland|europe|european|eu)\b/ },
  { chip:"Middle East", region:"Middle East",   label:"the Middle East", route:"Collecting Cars", match:/\b(uae|u\.a\.e|dubai|abu dhabi|saudi|qatar|kuwait|bahrain|oman|middle east)\b/ },
  { chip:"Australia", region:"Australia",       label:"Australia", route:"Collecting Cars", match:/^au$|^nz$|\b(australia|australian|aussie|new zealand)\b/ }
];
function countryChips(){ return COUNTRY_REGISTRY.map(c=>c.chip).concat(["Somewhere else"]); }
function registryRoutableRegion(region){ const r=String(region||"").toLowerCase(); return COUNTRY_REGISTRY.some(c=>c.region!=="US"&&c.region.toLowerCase()===r); }

// ─────────────────────────── OUT-OF-SCOPE GATE ───────────────────────────
// Refuses modern mainstream economy cars (Camry, Accord, F-150) that our
// enthusiast-auction data cannot serve, at car resolution, before any search.
// Fail-open by design: a false refusal is the worst error, so every ambiguous
// path proceeds. Curated lists below are Sam's to extend.
const OUT_OF_SCOPE={ maxAgeYears:25, countThreshold:20 };
// Only these makes ever trigger the gate. Any make NOT listed runs normally.
const MAINSTREAM_MAKES=["toyota","honda","nissan","ford","chevrolet","chevy","volkswagen","vw","hyundai","kia","mazda","subaru","dodge","chrysler","buick","gmc","mitsubishi","acura","lexus","infiniti","ram"];
// Enthusiast marques: skip the gate entirely, and (with archive presence) earn
// the rarity wording. Their models clear the count anyway; this is belt + rarity.
const ENTHUSIAST_MAKES=["porsche","ferrari","lamborghini","aston martin","bentley","rolls-royce","maserati","mclaren","lotus","alfa romeo","jaguar","lancia","de tomaso","bmw","mercedes-benz","mercedes","audi","land rover","datsun","shelby","merkur"];
// An enthusiast trim/model token anywhere in the resolved car rescues it (never
// out-of-scope). Matched against model + trim + canonical label.
const ENTHUSIAST_TRIM_TOKENS=["supra","gt-r","gtr","skyline","mr2","2000gt","land cruiser","fj40","fj60","fj62","nsx","type r","s2000","integra","gt350","gt500","boss 302","mach 1","ford gt","svt","lightning","raptor","z/28","z28","chevelle ss","zl1","z06","grand sport","gti","golf r","gli","miata","mx-5","rx-7","rx-8","wrx","sti","240z","260z","280z","300zx","350z","370z","viper","hellcat","scat pack","r/t","srt","demon","trd pro","gr corolla","gr86","se-r","cobalt ss","focus rs","focus st","fiesta st","svt cobra","shelby"];
// Models with a hot trim: wait for the trim answer before gating (a base one may
// be out, a hot one in). Other models gate immediately after the model answer.
const ESCAPE_MODELS=["mustang","corolla","civic","camaro","charger","challenger","golf","jetta","celica","cobalt","focus","fiesta","sentra","integra","accord","sonic","cruze"];

function makeIsMainstream(make){ return MAINSTREAM_MAKES.includes(String(make||"").toLowerCase().trim()); }
function makeIsEnthusiast(make){ return ENTHUSIAST_MAKES.includes(String(make||"").toLowerCase().trim()); }
// Rarity flavor is MARQUE-blanket for enthusiast makes, but a marque's mainstream
// VOLUME line must never inherit rarity earned by its specialty models: a 2018
// E-Class is not rare just because Mercedes also builds the SL and AMG GT. This
// denylist suppresses rarity for the base sedans/SUVs (E-Class, 3-Series, A6, and
// their engine badges E350/328i/etc.) while the specialty models (SL, AMG GT, M3,
// M5, Z4, R8, RS/S variants) stay eligible. Matched against the resolved model
// head OR its engine badge, per marque. Age >25 still earns rarity unconditionally,
// so a W124-era E-Class classic is unaffected.
const MAINSTREAM_MODEL_RE={
  "mercedes-benz":/^((a|b|c|e|s)[\s-]?class|(a|b|c|e|s)\d{2,3}|cla\d*|cls\d*|gl[abcesk]?\d*|gl[abcesk]?[\s-]?class|ml\d*|m[\s-]?class|r[\s-]?class|glk\d*)$/,
  "bmw":/^([12345 7][\s-]?series|[12345 7]\d{2}(i|d|xi|ix|e)?|x[1-7]\d?|x[1-7]m?)$/,
  "audi":/^(a[3-8]|q[3-8]|a[3-8][\s-]?(avant|sportback|allroad)|allroad)$/,
  "land rover":/^(range[\s-]?rover([\s-]?(sport|evoque|velar))?|discovery.*|evoque|velar|freelander|lr[234])$/,
  "jaguar":/^(xf|xe|xj[\s-]?\d*|xj)$/
};
// Porsche 911 splits by TRIM, not model (the model is always "911"): the base
// Carrera/Targa lines are mainstream volume and must never read as rare, while the
// halo trims (GT3/GT3 RS/GT3 Touring, GT2, Turbo/Turbo S, Sport Classic, Dakar,
// Speedster, S/T, 911 R, Weissach package) stay rarity-eligible. Same split-by-trim
// as Mercedes (E-Class suppressed, AMG GT eligible). Cayenne/Macan/Panamera are
// mainstream Porsche volume; Cayman/Boxster stay eligible.
// "touring" bare = the GT3 Touring (a halo); GT3 Touring also matches via gt3. A
// Carrera "Sport Touring" is niche and treating it as eligible is harmless.
const PORSCHE_911_HALO=/(gt1|gt2|gt3|turbo|sport ?classic|dakar|speedster|weissach|\btouring\b|carrera gt\b|\brs\b|s\/t|\br\b|\b912\b|50th|heritage)/i;
function modelIsMainstream(make,model,trim){
  var mk=String(make||"").toLowerCase().trim();
  var md=String(model||"").toLowerCase().replace(/\s+/g," ").trim();
  var tr=String(trim||"").toLowerCase().replace(/\s+/g," ").trim();
  if(mk==="porsche"){
    if(/(^|\b)911\b/.test(md)||/^(carrera|targa)/.test(md)) return !PORSCHE_911_HALO.test(tr+" "+md);
    if(/^(cayenne|macan|panamera)/.test(md)) return true;
    return false;
  }
  var re=MAINSTREAM_MODEL_RE[mk];
  if(!re)return false;
  return re.test(md);
}
function modelHasTrimEscape(model){ const m=String(model||"").toLowerCase(); return ESCAPE_MODELS.some(e=>m.includes(e)); }
function hasEnthusiastTrim(v){
  const hay=[v&&v.trim,v&&v.model,v&&v.canonicalLabel].map(x=>String(x||"").toLowerCase()).join(" ");
  return ENTHUSIAST_TRIM_TOKENS.some(t=>hay.includes(t));
}
// Conditions 0-2 (age, mainstream make, count < threshold). Fails open on any
// missing signal (no year, unknown count).
function outOfScopeEligible(v,count){
  if(!v||!v.year)return false;
  const age=(new Date().getFullYear())-Number(v.year);
  if(!Number.isFinite(age)||age>OUT_OF_SCOPE.maxAgeYears)return false; // 0: older cars never out
  if(!makeIsMainstream(v.make))return false;                          // 1: fail-open
  if(count==null||!Number.isFinite(Number(count))||Number(count)>=OUT_OF_SCOPE.countThreshold)return false; // 2
  return true;
}
// Full verdict at a gate phase. preTrim only fires for models that no trim could
// rescue; postTrim fires once the trim is in.
function maybeGateOutOfScope(phase){
  try{
    const v=sellState.resolvedVehicle;
    if(!outOfScopeEligible(v,sellState.archiveModelCount))return false;
    if(hasEnthusiastTrim(v))return false;                              // 3: trim escape
    if(phase==="preTrim"&&modelHasTrimEscape(v.model))return false;    // wait for the trim
    renderOutOfScope(v);
    return true;
  }catch(e){ return false; }
}
function outOfScopeCopy(v){
  const car=[v&&v.year,v&&v.make,v&&v.model].filter(Boolean).join(" ")||"car like this";
  // LOCKED copy (Sam). This is the only surface that may name CarMax, Carvana and
  // Facebook Marketplace. No escape-hatch sentence; ends on the Marketplace line.
  return `I'll be straight with you: a ${car} isn't really my patch. My data covers the enthusiast auction world, and a car like yours sells best through the mainstream channels. CarMax or Carvana will give you a fast, clean sale. Facebook Marketplace usually gets you more if you don't mind fielding the messages, I've bought and sold plenty of cars there myself.`;
}
function renderOutOfScope(v){
  hideHero();
  addMsg("sam",outOfScopeCopy(v));
  // No search reservation, the free anonymous search is NOT consumed: we end the
  // flow here without ever calling sellerDecision. Input reverts to car entry.
  sellState.active=false;
  sellState.step=0;
  sellState.afterOutOfScope=true;
  if(typeof gasFunnel==="function")gasFunnel("out_of_scope");  // logged with the resolved car (search_text carries it via the event pipeline)
}

const SELL_STEP_QUESTIONS={
  1:{ask:"What are you selling?",chips:[]},
  17:{ask:"Which model or trim is it? Pick one below, or just type the exact trim (like Alpina B3, M Sport or GTS) if it's not shown.",chips:["911","944","928","356","Boxster","Cayman","Not sure"]},
  11:{ask:"Which country is the car in?",chips:countryChips()},
  18:{ask:"Which state is it in?",chips:["California","Florida","Texas","New York","New Jersey","Other"]},
  2:{ask:"Rough mileage?",chips:["Under 30k","30k to 60k","60k to 100k","Over 100k"]},
  3:{ask:"Stock or modified?",chips:["Completely stock","Minor mods","Heavily modified"]},
  4:{ask:"Service records?",chips:["Full history","Some records","No records"]},
  5:{ask:"Clean title or is there a lien on it?",chips:["Clean title","Lien on it"]},
  6:{ask:"Roughly what are you hoping to get for it?",chips:[]},
  7:{ask:"How quickly are you looking to sell?",chips:["Want it gone fast","Within a month","No rush, right result only"]},
  9:{ask:"Anything else Sam should know about the car? Feel free to skip.",chips:["Skip"]},
  8:{ask:"How would you like to sell it?",explainer:"Last one. Some sellers run the sale themselves; others hand it to a PowerSeller who photographs the car, writes the listing, answers buyer questions and runs the auction for them.",chips:["I'll sell it myself","I'd like someone to handle everything","I'm not sure yet"]}
};

const SELL_SYS=`You are Sam, helping someone sell their car on GoAskSam. Warm, direct, knowledgeable about the collector car market.

The user is in the middle of a sell flow and has asked a question or gone off-script. Your job:
1. Answer their question warmly and specifically.
2. If they want to change a previous answer, acknowledge and confirm the update.
3. Answer only. NEVER repeat, rephrase, or re-ask the wizard's question yourself; the wizard asks it separately right after your answer, so ending with the question would duplicate it. End on your answer.
4. IDENTIFY THE ACTUAL QUESTION FIRST (locked): work out what they are really asking, tolerate typos and misspellings ("peorsweller" means PowerSeller, "platofrm" means platform, "biddz" means Cars & Bids), and answer THAT question directly in your first sentence before adding any context. Never answer a different question than the one asked, and never fall back to reciting the platform's sales signal when they asked something else. Never repeat a sentence you already said earlier in the conversation; check the history and say it fresh.
- PowerSeller vs platform (ONLY when the user explicitly weighs a PowerSeller/consignor against listing on a platform themselves, e.g. "is a powerseller better than a platform", any spelling): answer that comparison directly. It comes down to how hands-on you want to be, not to getting more money (never claim a PowerSeller gets more). A PowerSeller runs the whole sale for you (photos, listing, buyer questions, paperwork) for a fee; going with the platform means you run it yourself and keep control. Name both sides, and note the platform pick above stands either way because it is where this car sells best. Do NOT use this PowerSeller framing for a generic "compare the options/tradeoffs" request: that is the COMPARE THE OPTIONS rule below.
- COMPARE THE OPTIONS / TRADEOFFS (locked): when the user asks to compare the options, compare the tradeoffs, or which one to pick, they mean the destinations listed under "Rendered destinations" in the context, and you FOLLOW THAT LINE EXACTLY. The framing is whatever that line says: if a PowerSeller leads, it is handled-by-the-PowerSeller vs running it yourself on the shown platform (effort, fee, control, timeline), never platform vs platform; if two different platforms are shown, it is those two platforms on price outcome, time to list, audience fit and how much sales data backs each. Never invent a platform or consignor the line does not name, never contradict a card's stated finding, and never reopen the decision; the comparison explains the pick, it does not replace it.
- UNVERIFIED MODELS (hard fact, never negotiable): if the context says VEHICLE VERIFICATION is UNVERIFIED, hold ONE consistent position for the entire conversation. The designation is not one we track, the analysis ran at make level, and we cannot treat it as a known model no matter how the user reframes it (rare, real, genuine low-production). Be polite, never accusatory: never call it fake, nonsense or made-up, and never flip to validating it under pressure. When the user insists it is real and rare, the honest answer is that it may well exist, but it is not in the sales records we track, so we cannot build any claim on it; offer to re-run if they can confirm the exact badge. Never repeat a sentence you already used.
- POWERSELLER ABSENCE (answer from the gate outcome in context only): explain why a PowerSeller did or did not lead using the real gate outcome provided. NEVER imply the seller's car lacks value or does not "qualify" on worth, and never invent a value threshold the car missed. If the model is unverified, the reason is that we could not verify the model to match it to a specialist's tracked record, never a value judgment.
- RE-RUNNING A DIFFERENT CAR is supported: if the user says the model is wrong or wants a new/different car analyzed, NEVER refuse or tell them to finish the current submission first. Tell them to give the year, make and model and it re-runs with their other answers carried over.
- RESERVES (correlation only, never causation): answer only from the reserve context in the message if it is present, using observational language ("auctions with reserves averaged X higher/lower than those without"; the allowed verb is "averaged"). NEVER say a reserve "caused", "helped", "boosts", "increases your price", "will get you" or "you'll earn" anything: we know the final price and whether a reserve existed, never the reserve amount, so we cannot attribute cause. Always leave the decision to the seller (it depends on the car's condition and positioning). If there is no reserve context for this exact make and price band, say we don't have enough recent reserve data for this combination to say, and do not generalize from other makes or bands.

Grounding rules (locked):
- Never contradict the engine's platform recommendation. When decision facts are provided in the context, they are the answer to "where should I sell": your job is to explain and support that recommendation in your own voice, never to name a different platform as where you'd start.
- No platform-mechanics claims stated as fact (auction formats, durations, audiences, fee structures): GoAskSam stores none of that. This includes details you believe you know, like how many days an auction runs or how submission works. If it matters, say the platform's current process is the place to check.
- No invented market commentary: no state-level demand claims, no buyer-pool claims at price points, no seasonality claims. You may reference only the facts provided in the context, framed as data, plus clearly-labeled opinion in Sam's voice ("if it were mine...").
- Never use comps to tell the seller their asking price is wrong. Comps are data points, not truth. The seller knows their car better than we do. A price gap is a reason to ask what's different about their car, never proof of an error.
- Speed picks are owned, never apologized for: when the recommendation followed the seller's fast timeline over a small median gap, say the median difference is small, the seller's timeline is the deciding factor, and the picked platform closes faster. Never frame speed as a tradeoff or a consolation, and never call the other platform the real pick.
- Recommendations are final. No hedging, no escape hatches: never "if it does not pan out", never "we can revisit", never "feel free to come back", never "if you change your mind". All explanations max 3 sentences: lead with the fact (data, signal, fit), ground the decision, close. No fourth sentence. Never offer alternatives unless asked.
PRICING AND VALUATION (locked; Sam never guesses at value):
- "How much will it go for?" / price / median questions: answer with the percentage comparison ONLY when a price signal is provided in the context (for example "closed 18% higher on the recommended platform than on other platforms"). State that percentage EXACTLY as the context gives it, never prefixed with "about", "around", "roughly" or "~", acknowledge that a specific car's result cannot be predicted because condition, history, options and modifications all shift the picture, and redirect to what GoAskSam does: platform routing and buyer-pool strength, where the car will find its audience. If no price signal is in the context, skip numbers entirely and give the same redirect. NEVER dollar amounts, NEVER medians, NEVER "typical" or "average" price points, NEVER dollar ranges, no apology, no "I wish I could". Never use the word "median" in any reply, even to decline one: answer a median request with the percentage comparison without naming the term.
- "What's it worth?" / "value my car" / valuation questions: refuse and reframe, firm and without apology. Every car is different even at the same year, make and model: trim, condition, mileage, service history, modifications, original paint and accident history each shift the picture, and an honest valuation needs an in-person inspection and an expert who knows the market for that specific variant. Then reframe: GoAskSam analyzes which platforms hold the strongest sales data for the exact model, which tells the seller where buyers and sellers converge and where the car has the best chance to find its audience; the valuation is between the seller and the market. NEVER "I don't have that data", NEVER point to valuation tools elsewhere, NEVER "consult a dealer", never "unfortunately".
- VALUATION PERSISTENCE (locked): when the user asks for a value again, in any wording, the boundary holds every single time, held kindly. Each response must: acknowledge the request (never sound like you did not hear them), restate the boundary in FRESH wording (never the same sentence twice in a conversation; check your earlier replies in the history and vary), and offer the real alternative (the comparable-sales analysis: how the model performed on each tracked platform). Sound alive: contractions, varied rhythm, tone shifting naturally from educational to matter-of-fact to empathetic to firm as they push. On outright frustration you may say an in-person inspection from a marque specialist is the right move for a condition-tied number, then restate what GoAskSam is built for: finding where the car sells best. Never give in, never guess a number "just this once", never apologize for the boundary. Every valuation refusal, no matter how the ask is phrased or how many times, ENDS by offering the real alternative: the comparable-sales analysis showing where the model performs on the tracked platforms. Never end on the refusal alone.
PLATFORM DATA TRACKING (locked; never deny tracking a platform we track, never claim data we do not hold):
- TRACKED sales data (say plainly "we track this data" and answer from the context facts): Bring a Trailer, Cars & Bids, PCarMarket, Hagerty Marketplace. Also tracked for sales data: All Collector Cars and the major auction houses whose consignment results appear in our records; those sold prices inform the read, but consignment houses are not platforms you list on yourself, so they are never the pick. If asked directly about a specific big auction house, do not deny it (its records are in our data) and do not headline it as a place to list; give the consignment honesty and steer to the online platforms we recommend. A PowerSeller's track record is computed from our own records of their sales. PARTNER NAME RULE (locked): NEVER name a specific PowerSeller or consignor by name or handle unless one is actually shown in the current recommendation on the seller's screen. When none is shown (pre-wizard, general chat, or a car with no PowerSeller), speak about PowerSellers only in general terms.
- NOT tracked (say plainly "we don't track [platform]"): Hemmings, Car & Classic, Collecting Cars, Autotrader, Facebook Marketplace, Craigslist, dealer networks. Never invent a reason; a short true one is fine (retail marketplace rather than auctions, outcomes not publicly verifiable). The final sentence ALWAYS offers the comparison from the platforms we do track, naming at least one (Bring a Trailer, Cars & Bids, PCarMarket); never end on "we don't track it" alone.
- Tracked-platform price questions get the percentage comparison from context facts only, then buyer pool and fit framing. Never dollar figures, never medians, regardless of platform.
- BANNED phrasings: "we don't have access to", "that platform doesn't report data", "we can't analyze", "I don't have the data".
- Untracked-platform honesty: if the user suggests a platform that fits the car type but we hold no sales data for it (Hemmings, Car & Classic, Collecting Cars), acknowledge the suggestion as a valid fit for that kind of car, say plainly that we don't track sales data there yet so the call is based on what the data shows on the tracked platforms, and restate the recommendation. Never claim the chosen platform is objectively better when the real reason is a data gap. The whole answer is three sentences or fewer, like: "Hemmings would be a good fit for this truck type, that's their market. But we don't track Hemmings sales data yet. Bring a Trailer is my call based on what I can see." Never announce honesty ("I want to be straight with you"), just be direct. Never apologize for the recommendation existing.
CAPABILITY AND HONESTY REGISTRY (locked; never offer a service or deny a fact that is not listed here):
- CAN: analyze real auction sale records; recommend where to sell; connect the seller to a vetted PowerSeller when the value and fit gate passes; record the seller's details for the single destination they choose.
- CANNOT: no consignment-flagging service of any kind; no sales data for Hemmings, Car & Classic or Collecting Cars; no platform fee, commission or response-time data; no live listings, browsing or searching; no direct listing submission.
- ALWAYS HONEST: referral fees DO exist. If asked about referral fees or payment, answer: "If you decide to list with a platform or PowerSeller we may receive a referral fee. But every recommendation is driven by the sales data, never by any paid relationship. The advice is based on factual information and nothing else." Never deny the fee exists.
- NEVER state HOW MANY sales, comparables, comps, listings, records or results exist, at any number. No sample sizes, no counts, no "N comparable sales", not even large ones. Express data confidence ONLY qualitatively ("a solid recent sample", "a thin recent sample", "recent comparable sales", "the closest matches we tracked"). Percentages and price figures from the context are fine; counts of anything are not.
- REGIONAL questions ("have they sold cars in the Middle East?", "do they work in my region?"): we do NOT have per-region sale counts, so never claim a number. Answer with presence and reach: e.g. "They operate actively across [region] and international markets. I don't have per-region sale counts, but the platform's global reach is why it fits your region." Honest about what we do and don't have.
PowerSeller pushback ladder (for cars below the PowerSeller gate):
1. First ask: explain that PowerSeller referrals only make sense when the car's value and fit support it, three sentences max, no comp counts.
2. Second ask: "For this car we don't have a PowerSeller who'd be the right fit, and that tracks: it fits the recommended platform better."
3. If they persist: "Appreciate you pushing on this. GoAskSam is in beta and not everything will be perfect. If the answer on your car isn't what you expected, email news@thedailyvroom.com and we'll look at it."
Never offer to flag, forward or queue their details for a consignment conversation; that service does not exist. Never name or describe a nonexistent service even to deny it; just state what GoAskSam does do.
PowerSeller framing when comparing handled vs running it yourself: frame it as effort, control and presentation, never as price or fees. A good PowerSeller handles everything (prep, photography, videos, the listing, buyer questions, paperwork), and a well presented listing with great photography and great answers to buyer questions can have a real impact on how a listing performs. Never claim a PowerSeller gets more money, never say a fee "earns its keep" or "pays for itself", and never put a number on any of it.
Key facts:
- Fees: GoAskSam holds NO platform fee data. Never state platform fees, commissions, percentages, or caps as fact; those numbers would be invented. If asked about platform costs, say fee structures change and the platform's current terms are the place to check. If asked what a PowerSeller or consignor charges: GoAskSam does not hold their fee terms. Arrangements vary, some work on a percentage of the sale, others a flat amount, sometimes a mix, and the specifics are agreed directly with the PowerSeller once the seller is introduced. Each case is a little different. NEVER name a specific PowerSeller or consignor, and NEVER quote a fee figure.
- Timing: the question flow takes under a minute, and the market analysis itself runs in seconds once the questions are done. Nothing here is a long process.
- Privacy and leads: seller details are used only to build the recommendation. If the seller chooses to proceed, their details go to one single chosen destination, never blasted to multiple partners, never sold.
- If asked about The Daily Vroom, Sam Gold, ownership, or who is behind GoAskSam: GoAskSam is part of The Daily Vroom, the trusted collector car newsletter read by tens of thousands of readers and running for years. Sam Gold owns The Daily Vroom. Its tools also include the Import Calculator. If asked whether GoAskSam is part of The Daily Vroom, the answer is definitively yes. Never claim ignorance of these facts.
- GoAskSam uses live market evidence for seller recommendations. Do not name a power seller unless one has been explicitly verified in the current context.
- PowerSellers may be worth evaluating for six-figure or specialist cars, but consignment status, region, minimum value and availability must be verified first.
- GoAskSam records seller details and the selected choice. Do not promise a specific response time unless it is confirmed.
- Do not invent market performance claims. If current evidence is not available, say so.

Style: never use em dashes or en dashes anywhere in your replies. Use commas or periods instead. Never hedge a number: quote every percentage and figure from the context EXACTLY as given, never prefixed with "about", "around", "roughly", "approximately" or "~". Never state a statistic, percentage or scope label that is not in the context, and never name a platform or consignor that is not in the Rendered destinations line. Never use internal jargon a seller would never hear: "value gate", "threshold", "gate", "gated", "composition", "rung", "evidence basis", "segment match". Explain everything in plain seller-facing words. Write plain prose only: no markdown, no asterisks, no underscores, no bullet syntax, no headers. Never open with filler like "Great question" or "Good question"; start with the substance. Never announce honesty or directness in ANY reply ("I want to be straight", "to be honest", "I need to be honest", "honestly speaking"): just be direct without saying so.

Never say you are AI. You are Sam. End on your answer; the wizard re-asks its own question after you.`;

function cleanInitialCarText(text){
  return String(text||"")
    .replace(/\b(i have|i've got|selling|sell|to sell|my car is|car is|a|an)\b/gi," ")
    .replace(/\s+/g," ")
    .trim();
}

const US_STATES={
  al:"Alabama",alabama:"Alabama",ak:"Alaska",alaska:"Alaska",az:"Arizona",arizona:"Arizona",ar:"Arkansas",arkansas:"Arkansas",
  ca:"California",california:"California",co:"Colorado",colorado:"Colorado",ct:"Connecticut",connecticut:"Connecticut",
  de:"Delaware",delaware:"Delaware",fl:"Florida",florida:"Florida",ga:"Georgia",georgia:"Georgia",hi:"Hawaii",hawaii:"Hawaii",
  id:"Idaho",idaho:"Idaho",il:"Illinois",illinois:"Illinois",in:"Indiana",indiana:"Indiana",ia:"Iowa",iowa:"Iowa",
  ks:"Kansas",kansas:"Kansas",ky:"Kentucky",kentucky:"Kentucky",la:"Louisiana",louisiana:"Louisiana",me:"Maine",maine:"Maine",
  md:"Maryland",maryland:"Maryland",ma:"Massachusetts",massachusetts:"Massachusetts",mi:"Michigan",michigan:"Michigan",
  mn:"Minnesota",minnesota:"Minnesota",ms:"Mississippi",mississippi:"Mississippi",mo:"Missouri",missouri:"Missouri",
  mt:"Montana",montana:"Montana",ne:"Nebraska",nebraska:"Nebraska",nv:"Nevada",nevada:"Nevada",nh:"New Hampshire",
  "new hampshire":"New Hampshire",nj:"New Jersey","new jersey":"New Jersey",nm:"New Mexico","new mexico":"New Mexico",
  ny:"New York","new york":"New York",nc:"North Carolina","north carolina":"North Carolina",nd:"North Dakota",
  "north dakota":"North Dakota",oh:"Ohio",ohio:"Ohio",ok:"Oklahoma",oklahoma:"Oklahoma",or:"Oregon",oregon:"Oregon",
  pa:"Pennsylvania",pennsylvania:"Pennsylvania",ri:"Rhode Island","rhode island":"Rhode Island",sc:"South Carolina",
  "south carolina":"South Carolina",sd:"South Dakota","south dakota":"South Dakota",tn:"Tennessee",tennessee:"Tennessee",
  tx:"Texas",texas:"Texas",ut:"Utah",utah:"Utah",vt:"Vermont",vermont:"Vermont",va:"Virginia",virginia:"Virginia",
  wa:"Washington",washington:"Washington",wv:"West Virginia","west virginia":"West Virginia",wi:"Wisconsin",wisconsin:"Wisconsin",
  wy:"Wyoming",wyoming:"Wyoming",dc:"Washington, DC","washington dc":"Washington, DC","district of columbia":"Washington, DC"
};

function normalizeUSState(value){
  const key=String(value||"").trim().toLowerCase().replace(/\./g,"").replace(/\s+/g," ");
  return US_STATES[key]||null;
}

// Unambiguous colloquial names only. "la"/"pa"/"in"/"or" are left to
// US_STATES (Louisiana, Pennsylvania, Indiana, Oregon) to avoid collisions.
const US_STATE_NICKNAMES={
  cali:"California",socal:"California",norcal:"California","so cal":"California","no cal":"California","bay area":"California",
  nyc:"New York","new york city":"New York",upstate:"New York",philly:"Pennsylvania",vegas:"Nevada",
  dfw:"Texas",atl:"Georgia",chi:"Illinois",chicago:"Illinois",mass:"Massachusetts",conn:"Connecticut",
  jersey:"New Jersey",tenn:"Tennessee",fla:"Florida","the district":"Washington, DC"
};

// Compact ZIP 3-digit-prefix ranges -> state. Covers every state; unknown
// prefixes fall through (the caller accepts the ZIP and advances anyway).
const ZIP_PREFIX_RANGES=[
  [10,27,"Massachusetts"],[28,29,"Rhode Island"],[30,38,"New Hampshire"],[39,49,"Maine"],[50,59,"Vermont"],
  [60,69,"Connecticut"],[70,89,"New Jersey"],[100,149,"New York"],[150,196,"Pennsylvania"],[197,199,"Delaware"],
  [200,205,"Washington, DC"],[206,219,"Maryland"],[220,246,"Virginia"],[247,268,"West Virginia"],[270,289,"North Carolina"],
  [290,299,"South Carolina"],[300,319,"Georgia"],[320,349,"Florida"],[350,369,"Alabama"],[370,385,"Tennessee"],
  [386,397,"Mississippi"],[398,399,"Georgia"],[400,427,"Kentucky"],[430,459,"Ohio"],[460,479,"Indiana"],
  [480,499,"Michigan"],[500,528,"Iowa"],[530,549,"Wisconsin"],[550,567,"Minnesota"],[570,577,"South Dakota"],
  [580,588,"North Dakota"],[590,599,"Montana"],[600,629,"Illinois"],[630,658,"Missouri"],[660,679,"Kansas"],
  [680,693,"Nebraska"],[700,714,"Louisiana"],[716,729,"Arkansas"],[730,749,"Oklahoma"],[750,799,"Texas"],
  [800,816,"Colorado"],[820,831,"Wyoming"],[832,838,"Idaho"],[840,847,"Utah"],[850,865,"Arizona"],
  [870,884,"New Mexico"],[885,885,"Texas"],[889,898,"Nevada"],[900,961,"California"],[967,968,"Hawaii"],
  [970,979,"Oregon"],[980,994,"Washington"],[995,999,"Alaska"]
];
function stateFromZip(zip){
  const p=Number(String(zip).slice(0,3));
  if(!Number.isFinite(p))return null;
  for(const [lo,hi,st] of ZIP_PREFIX_RANGES)if(p>=lo&&p<=hi)return st;
  return null;
}

// Best-effort state-step resolver: never dead-ends. Maps state names, two-letter
// codes, colloquial nicknames, ZIP codes, "in <state>" phrasing, country names
// (which get a conversational re-ask), and skip/refusal (advance as "Not sure").
function resolveStateInput(q){
  const raw=String(q||"").trim();
  const lower=raw.toLowerCase().replace(/\./g,"").replace(/\s+/g," ").trim();
  if(!lower)return {kind:"unknown"};
  if(detectIntent(lower)==="refusal"||detectIntent(lower)==="moveOn"
    ||/^(skip|any|anywhere|does'?nt matter|doesnt matter|whatever|n\/?a|none)$/i.test(lower))return {kind:"skip"};
  if(/^(us|u s|usa|u s a|united states|united states of america|america|the states|stateside)$/i.test(lower))
    return {kind:"country",name:"US"};
  if(/^(uk|u k|england|britain|great britain|scotland|wales|europe|australia|canada|uae|dubai|middle east|mexico)$/i.test(lower))
    return {kind:"country",name:raw};
  if(US_STATE_NICKNAMES[lower])return {kind:"state",value:US_STATE_NICKNAMES[lower]};
  const direct=normalizeUSState(lower);
  if(direct)return {kind:"state",value:direct};
  if(/^\d{5}(-\d{4})?$/.test(lower)){
    const st=stateFromZip(lower.slice(0,5));
    return st?{kind:"state",value:st}:{kind:"skip"};
  }
  const inState=lower.match(/\b(?:in|from|near|around|located in|based in)\s+([a-z .'-]{2,25})$/);
  if(inState){
    const key=inState[1].trim();
    const s=US_STATE_NICKNAMES[key]||normalizeUSState(key);
    if(s)return {kind:"state",value:s};
  }
  return {kind:"unknown"};
}

function isUSRegion(value){
  return /\b(us|usa|u\.s\.|united states|america|united states of america)\b/i.test(String(value||"").trim());
}

function looksLikeVehicleText(text){
  const lower=String(text||"").toLowerCase();
  const hasYear=/\b(19|20)\d{2}\b/.test(lower)||/\b(?:19|20)?[1-9]0'?s\b/.test(lower)||/\b(twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\b/.test(lower);
  const hasVehicleTerm=/\b(porsche|ferrari|bmw|mercedes|benz|audi|lamborghini|aston|bentley|mclaren|chevrolet|chevy|corvette|vette|ford|mustang|stang|dodge|viper|toyota|lexus|infiniti|honda|acura|nissan|datsun|subaru|mazda|miata|land rover|range rover|jaguar|jag|maserati|alfa|lotus|volkswagen|vw|beetle|bug|bus|camper|campervan|kombi|vanagon|westfalia|westy|karmann|pontiac|cadillac|buick|oldsmobile|plymouth|amc|jeep|willys|shelby|lincoln|mercury|mini|mg|triumph|austin|volvo|saab|fiat|lancia|delorean|amphicar|studebaker|packard|911|356|914|928|944|gt3|gt2|turbo|m2|m3|m4|m5|amg|rs|sti|supra|nsx|gtr|skyline|camaro|chevelle|gto|r8|rs3|rs4|rs5|rs6|rs7|s3|s4|s5|s6|s7|tt)\b/.test(lower);
  const explicitSell=/\b(i have|i've got|my car is|selling|to sell)\b/.test(lower)&&hasVehicleTerm;
  return (hasYear&&hasVehicleTerm)||explicitSell;
}

const MAKE_MODEL_CLARIFICATIONS=[
  {make:/\bmercedes(?:-benz)?\b|\bbenz\b/,name:"Mercedes-Benz",chips:["SL","AMG GT","G-Class","E-Class","S-Class","190E","Not sure"],model:/\b(sl|amg\s*gt|g[ -]?class|g\d{2,3}|e[ -]?class|e\d{2,3}|s[ -]?class|s\d{2,3}|c[ -]?class|c\d{2,3}|190e|pagoda|w\d{3}|clk|cl|cls|slk|sls|gla|glc|gle|gls)\b/},
  {make:/\bnissan\b/,name:"Nissan",chips:["GT-R","370Z","Z","Skyline","300ZX","Patrol","Not sure"],model:/\b(gt-?r|gtr|370z|350z|300zx|280z|260z|240z|fairlady|skyline|silvia|patrol|figaro|z\b|sentra|maxima|altima|z32|r32|r33|r34|r35)\b/},
  {make:/\btoyota\b/,name:"Toyota",chips:["Supra","Land Cruiser","Prius","Camry","Corolla","4Runner","Not sure"],model:/\b(supra|land\s+cruiser|fj\d{2}|celica|mr2|2000gt|4runner|highlander|hilux|corolla|camry|prius|avalon|rav4|crown|ae86|prado|sequoia|tacoma|pickup)\b/},
  {make:/\bhonda\b/,name:"Honda",chips:["S2000","Civic Type R","NSX","Integra","Prelude","Not sure"],model:/\b(s2000|civic|type\s*r|nsx|integra|prelude|accord|crx|del\s+sol|beat)\b/},
  {make:/\bford\b/,name:"Ford",chips:["Mustang","GT","Bronco","F-150","Escort RS","Not sure"],model:/\b(mustang|gt\b|gt40|bronco|f-?150|f-?250|escort|rs200|cosworth|thunderbird|ranger|focus|fiesta|raptor)\b/},
  {make:/\bchevrolet\b|\bchevy\b/,name:"Chevrolet",chips:["Corvette","Camaro","Impala","Chevelle","C10","Not sure"],model:/\b(corvette|camaro|impala|chevelle|c10|c\/10|nova|bel\s*air|suburban|tahoe|silverado|el\s+camino|ssr|z06|zr1)\b/},
  {make:/\bdodge\b/,name:"Dodge",chips:["Viper","Challenger","Charger","Demon","Not sure"],model:/\b(viper|challenger|charger|demon|hellcat|daytona|ram|durango|stealth|super\s*bee)\b/},
  {make:/\bsubaru\b/,name:"Subaru",chips:["WRX STI","BRZ","Impreza","Legacy","SVX","Not sure"],model:/\b(wrx|sti|brz|impreza|legacy|svx|forester|outback|22b|baja)\b/},
  {make:/\bland\s+rover\b|\brange\s+rover\b/,name:"Land Rover",chips:["Defender","Range Rover","Discovery","Series","Not sure"],model:/\b(defender|range\s+rover|discovery|series\s+[i1-3]+|lr3|lr4|sport|evoque|velar)\b/},
  {make:/\bjaguar\b/,name:"Jaguar",chips:["E-Type","XK","XJ","F-Type","XJS","Not sure"],model:/\b(e-?type|xk|xj|f-?type|xjs|xjr|xfr|mk2|d-?type)\b/},
  {make:/\blamborghini\b/,name:"Lamborghini",chips:["Gallardo","Huracan","Aventador","Diablo","Countach","Not sure"],model:/\b(gallardo|huracan|aventador|diablo|countach|murcielago|miura|urus|espada|jalpa)\b/},
  {make:/\baston(?:\s+martin)?\b/,name:"Aston Martin",chips:["Vantage","DB9","DBS","Vanquish","DB11","Not sure"],model:/\b(vantage|db[257911s]*|dbs|vanquish|rapide|lagonda|valkyrie|virage)\b/},
  {make:/\bbentley\b/,name:"Bentley",chips:["Continental GT","Azure","Arnage","Mulsanne","Not sure"],model:/\b(continental|gt\b|azure|arnage|mulsanne|brooklands|bentayga|turbo\s*r|flying\s+spur)\b/},
  {make:/\bmclaren\b/,name:"McLaren",chips:["570S","600LT","650S","720S","Artura","Not sure"],model:/\b(540c|570s|600lt|650s|675lt|720s|765lt|artura|mp4|p1|senna|gt\b)\b/},
  {make:/\bmaserati\b/,name:"Maserati",chips:["GranTurismo","Quattroporte","Ghibli","MC20","Not sure"],model:/\b(granturismo|quattroporte|ghibli|mc20|3200|4200|merak|bora|khamsin|levante)\b/},
  {make:/\blotus\b/,name:"Lotus",chips:["Elise","Exige","Esprit","Evora","Emira","Not sure"],model:/\b(elise|exige|esprit|evora|emira|elan|europa|elite|eclat)\b/}
];

function genericMakeMissingDetail(text,year){
  const lower=String(text||"").toLowerCase();
  const match=MAKE_MODEL_CLARIFICATIONS.find(item=>item.make.test(lower)&&!item.model.test(lower));
  if(!match)return null;
  return {
    type:"model",
    ask:`Which model is the${year?` ${year}`:""} ${match.name}? Pick one below, or type the exact model if it is not shown.`,
    chips:match.chips,
    baseVehicle:vehicleBaseYearMake(text,match.name)
  };
}

function porscheModelChipsForYear(yearValue){
  const year=Number(yearValue);
  if(year>=2017)return ["911","718","Panamera","Cayenne","Macan","Not sure"];
  if(year>=2006)return ["911","Boxster","Cayman","Panamera","Cayenne","Not sure"];
  if(year>=1997)return ["911","Boxster","Cayman","968","928","Not sure"];
  if(year>=1982)return ["911","944","928","924","Not sure"];
  if(year>=1976)return ["911","924","928","914","Not sure"];
  if(year>=1969)return ["911","912","914","Not sure"];
  if(year>=1964)return ["911","912","356","Not sure"];
  if(year>=1953)return ["356","550 Spyder","Not sure"];
  return ["911","718","Boxster","Cayman","Panamera","Not sure"];
}

const VEHICLE_PRODUCTION_RULES=[
  {make:"Jaguar",model:"E-Type",match:/\bjaguar\b.*\be[-\s]?type\b|\be[-\s]?type\b.*\bjaguar\b/i,start:1961,end:1974,suggestion:"Jaguar F-Type",suggestionStart:2013},
  {make:"Jaguar",model:"F-Type",match:/\bjaguar\b.*\bf[-\s]?type\b|\bf[-\s]?type\b.*\bjaguar\b/i,start:2013,end:2024},
  {make:"Toyota",model:"Supra",match:/\btoyota\b.*\bsupra\b|\bsupra\b.*\btoyota\b/i,ranges:[[1978,2002],[2020,2026]]},
  {make:"Toyota",model:"Highlander",match:/\btoyota\b.*\bhighlander\b|\bhighlander\b.*\btoyota\b/i,start:2001,end:2026},
  {make:"Acura",model:"NSX",match:/\b(acura|honda)\b.*\bnsx\b|\bnsx\b.*\b(acura|honda)\b/i,ranges:[[1991,2005],[2017,2022]]},
  {make:"Nissan",model:"370Z",match:/\bnissan\b.*\b370z\b|\b370z\b.*\bnissan\b/i,start:2009,end:2020},
  {make:"Nissan",model:"GT-R",match:/\bnissan\b.*\bgt[-\s]?r\b|\bgt[-\s]?r\b.*\bnissan\b/i,start:2009,end:2024},
  {make:"Audi",model:"R8",match:/\baudi\b.*\br8\b|\br8\b.*\baudi\b/i,start:2008,end:2023},
  {make:"Porsche",model:"356",match:/\bporsche\b.*\b356\b|\b356\b.*\bporsche\b/i,start:1948,end:1965},
  {make:"Porsche",model:"550 Spyder",match:/\bporsche\b.*\b550(?:\s+spyder)?\b|\b550(?:\s+spyder)?\b.*\bporsche\b/i,start:1953,end:1956},
  {make:"Porsche",model:"911",match:/\bporsche\b.*\b911\b|\b911\b.*\bporsche\b/i,start:1964,end:2026},
  {make:"Porsche",model:"912",match:/\bporsche\b.*\b912\b|\b912\b.*\bporsche\b/i,ranges:[[1965,1969],[1976,1976]]},
  {make:"Porsche",model:"914",match:/\bporsche\b.*\b914\b|\b914\b.*\bporsche\b/i,start:1969,end:1976},
  {make:"Porsche",model:"924",match:/\bporsche\b.*\b924\b|\b924\b.*\bporsche\b/i,start:1976,end:1988},
  {make:"Porsche",model:"Cayman",match:/\bporsche\b.*\bcayman\b|\bcayman\b.*\bporsche\b/i,start:2006,end:2026},
  {make:"Porsche",model:"Boxster",match:/\bporsche\b.*\bboxster\b|\bboxster\b.*\bporsche\b/i,start:1997,end:2026},
  {make:"Porsche",model:"944",match:/\bporsche\b.*\b944\b|\b944\b.*\bporsche\b/i,start:1982,end:1991},
  {make:"Porsche",model:"928",match:/\bporsche\b.*\b928\b|\b928\b.*\bporsche\b/i,start:1978,end:1995},
  {make:"Porsche",model:"968",match:/\bporsche\b.*\b968\b|\b968\b.*\bporsche\b/i,start:1992,end:1995},
  {make:"Porsche",model:"718",match:/\bporsche\b.*\b718\b|\b718\b.*\bporsche\b/i,start:2017,end:2026},
  {make:"Porsche",model:"Panamera",match:/\bporsche\b.*\bpanamera\b|\bpanamera\b.*\bporsche\b/i,start:2010,end:2026},
  {make:"Porsche",model:"Cayenne",match:/\bporsche\b.*\bcayenne\b|\bcayenne\b.*\bporsche\b/i,start:2003,end:2026},
  {make:"Porsche",model:"Macan",match:/\bporsche\b.*\bmacan\b|\bmacan\b.*\bporsche\b/i,start:2015,end:2026},
  {make:"BMW",model:"M3",match:/\bbmw\b.*\bm3\b|\bm3\b.*\bbmw\b/i,start:1986,end:2026},
  {make:"BMW",model:"Z4",match:/\bbmw\b.*\bz4\b|\bz4\b.*\bbmw\b/i,start:2003,end:2026},
  {make:"BMW",model:"2002",match:/\bbmw\b.*\b2002\b|\b2002\b.*\bbmw\b/i,start:1968,end:1976},
  {make:"Ferrari",model:"360",match:/\bferrari\b.*\b360\b|\b360\b.*\bferrari\b/i,start:1999,end:2005},
  {make:"Ferrari",model:"F430",match:/\bferrari\b.*\bf430\b|\bf430\b.*\bferrari\b/i,start:2005,end:2009},
  {make:"Ferrari",model:"458",match:/\bferrari\b.*\b458\b|\b458\b.*\bferrari\b/i,start:2010,end:2015},
  {make:"Ferrari",model:"488",match:/\bferrari\b.*\b488\b|\b488\b.*\bferrari\b/i,start:2016,end:2019},
  {make:"Alfa Romeo",model:"Spider",match:/\balfa(?:\s+romeo)?\b.*\bspider\b|\bspider\b.*\balfa(?:\s+romeo)?\b/i,start:1966,end:1994},
  {make:"Alfa Romeo",model:"4C",match:/\balfa(?:\s+romeo)?\b.*\b4c\b|\b4c\b.*\balfa(?:\s+romeo)?\b/i,start:2014,end:2020}
];

const CROSS_MAKE_MODEL_RULES=[
  {model:"E-Type",makes:["Jaguar"],alias:/\be[-\s]?type\b/i,suggestion:"Jaguar F-Type",suggestionStart:2013},
  {model:"F-Type",makes:["Jaguar"],alias:/\bf[-\s]?type\b/i},
  {model:"911",makes:["Porsche"],alias:/\b911\b/i},
  {model:"Supra",makes:["Toyota"],alias:/\bsupra\b/i},
  {model:"NSX",makes:["Acura","Honda"],alias:/\bnsx\b/i},
  {model:"R8",makes:["Audi"],alias:/\br8\b/i},
  {model:"GT-R",makes:["Nissan"],alias:/\bgt[-\s]?r\b|\bgtr\b/i},
  {model:"370Z",makes:["Nissan"],alias:/\b370z\b/i},
  {model:"M3",makes:["BMW"],alias:/\bm3\b/i},
  {model:"360",makes:["Ferrari"],alias:/\b360\b/i},
  {model:"F430",makes:["Ferrari"],alias:/\bf430\b/i},
  {model:"458",makes:["Ferrari"],alias:/\b458\b/i},
  {model:"488",makes:["Ferrari"],alias:/\b488\b/i},
  {model:"Viper",makes:["Dodge"],alias:/\bviper\b/i}
];

function vehicleYearFromText(text){
  const value=String(text||"").match(/\b(19|20)\d{2}\b/)?.[0];
  return value?Number(value):null;
}

function yearInExcludedRange(year,rule){
  return (rule.exclude||[]).some(([start,end])=>year>=start&&year<=end);
}

function validYearForRule(year,rule){
  if(rule.ranges)return rule.ranges.some(([start,end])=>year>=start&&year<=end);
  return year>=rule.start&&year<=rule.end&&!yearInExcludedRange(year,rule);
}

function detectedMakeName(text){
  const lower=String(text||"").toLowerCase();
  return MAKE_MODEL_CLARIFICATIONS.find(item=>item.make.test(lower))?.name||null;
}

function vehicleBaseYearMake(text,makeName){
  const year=vehicleYearFromText(text);
  return [year,makeName].filter(Boolean).join(" ");
}

function crossMakeVehicleIssue(text){
  const raw=String(text||"").trim();
  const year=vehicleYearFromText(raw);
  const makeName=detectedMakeName(raw);
  if(!year||!makeName)return null;
  const rule=CROSS_MAKE_MODEL_RULES.find(item=>item.alias.test(raw)&&!item.makes.includes(makeName));
  if(!rule)return null;
  const preferredMake=rule.makes[0];
  const suggestedModel=rule.suggestion&&(!rule.suggestionStart||year>=rule.suggestionStart)
    ? rule.suggestion
    : `${preferredMake} ${rule.model}`;
  const suggestion=`${year} ${suggestedModel}`;
  const baseVehicle=vehicleBaseYearMake(raw,makeName);
  return {
    type:"invalid_vehicle",
    ask:`${rule.model} is a ${preferredMake} model, not a ${makeName}. Did you mean the ${suggestion}, or a different ${makeName} model?`,
    chips:[suggestion,`Different ${makeName} model`,"Change car","Not sure"],
    suggestion,
    baseVehicle,
    detectedMake:makeName,
    rule
  };
}

function vehicleValidationIssue(text){
  const raw=String(text||"").trim();
  const year=vehicleYearFromText(raw);
  if(!year)return null;
  const crossMakeIssue=crossMakeVehicleIssue(raw);
  if(crossMakeIssue)return crossMakeIssue;
  const rule=VEHICLE_PRODUCTION_RULES.find(item=>item.match.test(raw));
  if(!rule)return null;
  if(validYearForRule(year,rule))return null;
  const replacement=rule.suggestion&&(!rule.suggestionStart||year>=rule.suggestionStart);
  const displayMake=rule.model==="NSX"&&detectedMakeName(raw)==="Honda"?"Honda":rule.make;
  const fallbackChips=rule.make==="Porsche"
    ? porscheModelChipsForYear(year).filter(chip=>chip!=="Not sure").concat("Change car","Not sure")
    : ["Change car","Not sure"];
  const question=replacement
    ? `The ${rule.model} wasn't produced in ${year}. Did you mean the ${year} ${rule.suggestion}?`
    : `The ${rule.model} wasn't produced in ${year}. Which ${displayMake} model are we talking about?`;
  return {
    type:"invalid_vehicle",
    ask:question,
    chips:replacement?[`${year} ${rule.suggestion}`,"Change car","Not sure"]:fallbackChips,
    suggestion:replacement?`${year} ${rule.suggestion}`:null,
    rule
  };
}

function missingVehicleDetail(text){
  const lower=String(text||"").toLowerCase();
  const year=String(text||"").match(/\b(19|20)\d{2}\b/)?.[0];
  const impossible=vehicleValidationIssue(text);
  if(impossible)return impossible;
  const hasKnownMakeOrModel=/\b(porsche|ferrari|bmw|mercedes|benz|audi|lamborghini|aston|bentley|mclaren|chevrolet|chevy|corvette|ford|mustang|dodge|viper|toyota|honda|nissan|subaru|land rover|range rover|jaguar|maserati|alfa|lotus|911|gt3|gt2|turbo|m2|m3|m4|m5|amg|rs|sti|supra|nsx|gtr|camaro|r8|rs3|rs4|rs5|rs6|rs7|s3|s4|s5|s6|s7|tt)\b/.test(lower);
  if(!looksLikeVehicleText(text)&&!hasKnownMakeOrModel)return null;
  if(/\bporsche\b/.test(lower)&&!/\b(911|912|914|924|928|944|968|356|550|718|964|993|996|997|991|992|boxster|cayman|panamera|cayenne|macan|gt2|gt3|turbo|speedster|targa|carrera)\b/.test(lower)){
    return {type:"model",ask:`Which model is the${year?` ${year}`:""} Porsche? Pick one below, or type the exact model if it is not shown.`,chips:porscheModelChipsForYear(year)};
  }
  if(/\bporsche\b/.test(lower)&&/\b911\b/.test(lower)&&!/\b(carrera(?:\s+[124]?s|\s+t)?|gts|turbo(?:\s+s)?|gt3(?:\s+rs)?|gt2(?:\s+rs)?|sport\s+classic|dak(?:ar)?|speedster|targa|s\/t|992|991|997|996|993|964)\b/.test(lower)){
    return {type:"trim",ask:"Which 911 is it? Carrera, Carrera T, GTS, Turbo, GT3 and Sport Classic behave very differently. Pick one below, or type the exact trim if it is not shown.",chips:["Carrera","Carrera S","Carrera T","GTS","Turbo","Turbo S","GT3","GT3 RS","Sport Classic","Not sure"]};
  }
  if(/\bbmw\b/.test(lower)&&!/\b(m\d|[1-8]\d{2}[a-z]{0,3}|z3|z4|z8|x[1-7]|i8|2002|e30|e36|e46|e90|e92|e39|e60)\b/.test(lower)){
    return {type:"model",ask:"Which BMW model or trim is it? These are just common examples. Pick one below, or type the exact model if it is not shown.",chips:["M3","2002","6-Series","3-Series","Z4","X5","Not sure"]};
  }
  if(/\baudi\b/.test(lower)&&!/\b(a[1-8]|s[1-8]|rs[3-7]|r8|tt|tts|ttrs|q[2-8]|e-tron|allroad)\b/.test(lower)){
    return {type:"model",ask:`Which model is the${year?` ${year}`:""} Audi? Pick one below, or type the exact model if it is not shown.`,chips:["A4","S4","RS3","RS6","R8","TT","Q5","Not sure"]};
  }
  if(/\bferrari\b/.test(lower)&&!/\b(308|328|348|355|360|430|458|488|f8|roma|california|testarossa|modena|spider|berlinetta|scuderia)\b/.test(lower)){
    return {type:"model",ask:"Which Ferrari model or trim is it? Pick one below, or type the exact model if it is not shown.",chips:["360 Modena","F430","458","488","Not sure"]};
  }
  if(/\balfa(?:\s+romeo)?\b/.test(lower)&&!/\b(spider|gtv|giulia|giulietta|alfetta|164|sz|rz|4c|8c|stelvio|quadrifoglio|duetto|montreal)\b/.test(lower)){
    return {type:"model",ask:"Which Alfa Romeo model or trim is it? Pick one below, or type the exact model if it is not shown.",chips:["Spider","GTV","Giulia","164","Montreal","Not sure"]};
  }
  const genericMissing=genericMakeMissingDetail(text,year);
  if(genericMissing)return genericMissing;
  return null;
}

const TRIM_911_ASK={type:"trim",ask:"Which 911 is it? Carrera, Carrera T, GTS, Turbo, GT3 and Sport Classic behave very differently. Pick one below, or type the exact trim if it is not shown.",chips:["Carrera","Carrera S","Carrera T","GTS","Turbo","Turbo S","GT3","GT3 RS","Sport Classic","Not sure"]};

// Curated trim taxonomy: models whose trim is a major value + evidence
// differentiator get a chip question (same mechanism as the 911 rule,
// generalized). A plain rule (no trimRe) fires only when NO trim resolved; a
// trimRe rule fires when a trim is present but names an ambiguous variant
// family (C63 vs C63 S). yearMin/yearMax scope a rule to the era where the
// trims apply. Classic American muscle is included because SS/RS/Z/28,
// GT/Mach 1/Boss/Shelby, and SS 396/454 move the market by large multiples.
const CURATED_TRIM_ASKS=[
  {make:/porsche/i,model:/^(911|964|993|996|997|991|992)$/i,ask:TRIM_911_ASK.ask,chips:TRIM_911_ASK.chips.slice()},
  {make:/bmw/i,model:/^m3$/i,yearMin:2015,ask:"Which M3 is it? Base and Competition sell differently. Pick one below, or type the exact trim.",chips:["Base","Competition","CS","Not sure"]},
  {make:/bmw/i,model:/^6-?series$/i,yearMax:1989,ask:"Which 6-Series is it? The 630CS, 633CSi, 635CSi and M635CSi sell very differently. Pick one below, or type the exact trim.",chips:["630CS","633CSi","635CSi","M635CSi","Other","Not sure"]},
  {make:/mercedes/i,model:/^c-class$/i,trimRe:/^c63$/i,ask:"Which C63 is it? C63 and C63 S behave differently. Pick one below, or type it.",chips:["C63","C63 S","Not sure"]},
  {make:/chevrolet|chevy/i,model:/^camaro$/i,ask:"Which Camaro is it? Base, SS, RS and Z/28 sell very differently. Pick one below, or type the exact trim.",chips:["Base","SS","RS","Z/28","Other","Not sure"]},
  {make:/ford/i,model:/^mustang$/i,ask:"Which Mustang is it? Base, GT, Mach 1, Boss and Shelby sell very differently. Pick one below, or type the exact trim.",chips:["Base","GT","Mach 1","Boss 302","Shelby GT350","Shelby GT500","Other","Not sure"]},
  {make:/chevrolet|chevy/i,model:/^chevelle$/i,ask:"Which Chevelle is it? Base, Malibu and the SS cars (SS 396, SS 454) sell very differently. Pick one below, or type the exact trim.",chips:["Base","Malibu","SS 396","SS 454","Other","Not sure"]},
  {make:/pontiac/i,model:/^(gto|firebird|trans\s*am)$/i,ask:"Which trim is it? The Judge, Trans Am and Formula command very different money. Pick one below, or type the exact trim.",chips:["Base","The Judge","Trans Am","Formula","Other","Not sure"]},
  {make:/dodge/i,model:/^(charger|challenger)$/i,yearMax:1974,ask:"Which trim is it? R/T, Super Bee and the Hemi cars sell very differently. Pick one below, or type the exact trim.",chips:["Base","R/T","Super Bee","Hemi","Other","Not sure"]},
  {make:/chevrolet|chevy/i,model:/^corvette$/i,ask:"Which Corvette is it? The base, Stingray, Z06, ZR1 and Grand Sport sell very differently. Pick one below, or type the exact trim.",chips:["Base","Stingray","Z06","ZR1","Grand Sport","Other","Not sure"]}
];

function genericTrimAsk(rv){
  // Never silently skip trim: a model with no curated variant set still gets an
  // optional free-text trim step. Skip advances normally.
  const label=[rv&&rv.year?rv.year:null,rv&&rv.make?rv.make:null,rv&&rv.model?rv.model:null].filter(Boolean).join(" ");
  return {type:"trim",optional:true,ask:`Any specific trim, package or edition on the ${label||"car"}? Type it, or say skip if it is the standard car.`,chips:["Skip","Not sure"]};
}

function missingVehicleTrimDetail(text){
  // Trim-missing is judged on the RESOLVED vehicle when we have one: model
  // confirmed with no trim means the trim step ALWAYS runs before location
  // (trims drive the top ladder rungs and never get silently skipped). The text
  // regex remains only as the fallback when no resolution exists yet.
  const rv=sellState.resolvedVehicle;
  // An unverified vehicle (model not in the taxonomy) never gets a trim step:
  // the model itself is in question, so a trim probe would be nonsensical.
  if(rv&&rv.model&&!rv.unverified){
    const trimVal=String(rv.trim||"");
    for(const rule of CURATED_TRIM_ASKS){
      if(!rule.make.test(String(rv.make||"")))continue;
      if(!rule.model.test(String(rv.model||"")))continue;
      if(rule.yearMin&&Number(rv.year)&&Number(rv.year)<rule.yearMin)continue;
      if(rule.yearMax&&Number(rv.year)&&Number(rv.year)>rule.yearMax)continue;
      if(rule.trimRe){if(!rule.trimRe.test(trimVal))continue;}
      else if(trimVal)continue;
      return {type:"trim",ask:rule.ask,chips:rule.chips.slice()};
    }
    // No curated set matched. If a trim already resolved, we are done; otherwise
    // fire the generic optional trim step (never a silent skip).
    if(!trimVal)return genericTrimAsk(rv);
    return null;
  }
  const lower=String(text||"").toLowerCase();
  if(/\bporsche\b/.test(lower)&&/\b911\b/.test(lower)&&!/\b(carrera(?:\s+[124]?s|\s+t)?|gts|turbo(?:\s+s)?|gt3(?:\s+rs)?|gt2(?:\s+rs)?|sport\s+classic|dak(?:ar)?|speedster|targa|s\/t|992|991|997|996|993|964)\b/.test(lower)){
    return TRIM_911_ASK;
  }
  return null;
}

function currentMissingVehicleDetail(){
  if(sellState.vehicleDetailSkipped)return null;
  const trimMissing=missingVehicleTrimDetail(sellState.carName);
  if(trimMissing)return trimMissing;
  if(sellState.vehicleIdentityValidated)return null;
  return missingVehicleDetail(sellState.carName);
}

function askMissingVehicleDetail(missing){
  // Escalation (locked rule 12 pattern, same as the condition step): each
  // render of the same ask counts as an attempt. Attempt 2+ offers a Skip
  // chip; after 3 attempts the wizard advances on its own, never a 4th ask.
  if(missing.ask!==sellState.lastMissingAsk)sellState.trimAskAttempts=0;
  sellState.trimAskAttempts=(sellState.trimAskAttempts||0)+1;
  if(sellState.trimAskAttempts>3){
    sellState.vehicleDetailSkipped=true;
    sellState.lastMissingAsk=null;
    sellState.trimAskAttempts=0;
    resumeWizardAfterVehicle(`I'll take the ${sellState.carName||"car"} as-is and keep the read broad.`);
    return;
  }
  sellState.step=17;
  sellState.lastMissingAsk=missing.ask;
  const chips=(missing.chips||[]).slice();
  if(sellState.trimAskAttempts>=2&&!chips.some(c=>/^skip this step$/i.test(c)))chips.push("Skip this step");
  addMsg("sam",missing.ask,"",chipsHTML(chips));
}

async function handleVehicleValidationAnswer(q){
  const lower=String(q||"").toLowerCase().trim();
  const currentIssue=activeVehicleIssue();
  // Global invariant: off-script input routes to the chat layer from EVERY
  // state, including this clarification sub-state. Conversational input with
  // no vehicle signal is a question for Sam, not a model answer.
  // Intents outrank the off-script guard: a wordy move-on or refusal is an
  // instruction to advance, not a question for the chat layer.
  const subStateIntent=detectIntent(lower);

  // Keep-as-typed (DEFECT 4): the seller insisted on their designation after we
  // said it doesn't match. Accept it unverified (resolver skips the near-miss).
  if(currentIssue?.keepDesignation&&(/^keep .* as typed$/i.test(lower)||normalizeVehicleAnswer(lower)===normalizeVehicleAnswer(currentIssue.keepDesignation))){
    const make=extractVehicleMake(currentIssue.baseVehicle||"")||"";
    const candidate=[make,currentIssue.keepDesignation].filter(Boolean).join(" ").trim();
    sellState.pendingVehicleIdentity=null;
    try{
      const res=await fetch(apiPath("/api/vehicleIdentity"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:candidate,keepAsTyped:true})});
      const data=await res.json();
      if(res.ok&&data.vehicle?.canonicalLabel){
        sellState.resolvedVehicle=data.vehicle;sellState.carName=data.vehicle.canonicalLabel;sellState.carRaw=data.vehicle.canonicalLabel;
        sellState.vehicleIdentityValidated=!data.vehicle.unverified;sellState.vehicleDetailSkipped=false;sellState.notSureRepeats=0;
        resumeWizardAfterVehicle(`Got it, I'll run the ${sellState.carName} as typed and keep the read broad.`);
        return true;
      }
    }catch(e){/* fall through */}
  }

  // Negation-led correction (DEFECT 4): "no the 854f", "nope 850", "not that one
  // its the 840". Strip the negation/filler so nothing gets concatenated into a
  // car name, re-resolve the clean designation, and if it is only a near-miss to
  // a known model, double-check with the closest match plus keep-as-typed
  // instead of looping the same yes/no.
  const NEG_LEAD=/^(?:\s*(?:no|nope|nah|not|wrong|incorrect|actually|i\s+said|i\s+meant|i\s+mean|it'?s|its|the|that|this|one)\b[,.!]?\s*)+/i;
  if(currentIssue&&NEG_LEAD.test(lower)){
    const core=lower.replace(NEG_LEAD,"").replace(/\s+/g," ").trim();
    // A model number (letter+digit like 854f, or a bare model number like 840):
    // strip the negation, re-resolve the clean designation.
    if(/\d/.test(core)&&core.length<=16){
      const make=extractVehicleMake(currentIssue.baseVehicle||sellState.carName||"")||extractVehicleMake(core)||"";
      const desig=core.toUpperCase();
      const candidate=[make,core].filter(Boolean).join(" ").trim();
      sellState.pendingVehicleIdentity=null;sellState.vehicleIdentityValidated=false;
      try{
        const res=await fetch(apiPath("/api/vehicleIdentity"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:candidate})});
        const data=await res.json();
        if(res.ok&&data.status==="valid"&&data.vehicle?.canonicalLabel&&!data.vehicle.unverified){
          sellState.resolvedVehicle=data.vehicle;sellState.carName=data.vehicle.canonicalLabel;sellState.carRaw=data.vehicle.canonicalLabel;
          sellState.vehicleIdentityValidated=true;sellState.vehicleDetailSkipped=false;sellState.notSureRepeats=0;
          resumeWizardAfterVehicle(vehicleAcceptPrefix());
          return true;
        }
        const suggestion=String(data.clarification?.suggestion||"").trim();
        const chips=[];
        if(suggestion)chips.push(suggestion);
        chips.push(`Keep ${desig} as typed`,"Change car");
        sellState.pendingVehicleIdentity={type:"model",baseVehicle:[make].filter(Boolean).join(" "),rawInput:candidate,suggestion:suggestion||null,keepDesignation:desig};
        sellState.step=17;
        addMsg("sam",`${desig} isn't a ${make||"model"} I can match to a known listing.${suggestion?` The closest I have is ${suggestion}.`:""} Double-check the badge, or keep it as typed and I'll run a broader read.`,"",chipsHTML(chips));
        return true;
      }catch(e){/* fall through to normal handling */}
    }
  }

  // Self-correction suffixes never break a confirmation ("it is that car my
  // mistake" confirms; "my mistake" is not a car name). Strip them, then
  // recognize confirmation phrasings that the anchored affirmation regex
  // misses.
  const confirmCore=lower
    .replace(/((,|\.|!)?\s*(my mistake|my bad|oops|i think( so)?|i'?m pretty sure|probably))+\s*$/i,"")
    .replace(/^((my mistake|my bad|oops|sorry)[,.! ]*)+/i,"")
    .replace(/\s+/g," ").trim();
  const affirmationPhrase=detectIntent(confirmCore)==="affirmation"
    ||/^(it is|it'?s? (is )?(this|that) (one|car)|it is (this|that) (one|car)|is (this|that) (car|one)|that'?s (it|the (one|car))|(that|this) one|right,? that('?s the)? (one|car)|yes,? same car)[.! ]*$/i.test(confirmCore);
  const goWith=/\b(jus?t\s+)?go with\b/i.test(lower);
  const questionLike=/\?\s*$/.test(lower)||/^(what|how|why|when|where|who|can|could|will|would|does|do|is|are|should|but|explain|tell me)\b/i.test(lower)||/\b(how long|you never|what happens|why do you)\b/i.test(lower);
  const wordyNonAnswer=!subStateIntent&&!goWith&&!affirmationPhrase&&lower.split(/\s+/).length>=4&&!/\d/.test(lower)&&!looksLikeVehicleText(q)&&!/\b(not sure|don.t know|unknown|skip|change car|start over|wrong car|different car|yes|yep|yeah|correct)\b/i.test(lower);
  if((questionLike&&!subStateIntent&&!goWith&&!affirmationPhrase&&!looksLikeVehicleText(q))||wordyNonAnswer)return false;
  // Context reset (locked): input naming a DIFFERENT make is a new car,
  // never a clarification of the pending one. Resolve it fresh so nothing
  // from the stale context contaminates it ("Toyota ... 2018 bmw m3").
  const pendingMakeCtx=extractVehicleMake(currentIssue?.baseVehicle||sellState.carName||"");
  const inputMakeCtx=extractVehicleMake(q);
  if(inputMakeCtx&&pendingMakeCtx&&inputMakeCtx!==pendingMakeCtx&&looksLikeVehicleText(q)){
    sellState.pendingVehicleIdentity=null;
    sellState.vehicleDetailSkipped=false;
    sellState.vehicleIdentityValidated=false;
    sellState.notSureRepeats=0;
    sellState.carName=q;sellState.carRaw=q;
    if(!(await validateVehicleIdentityPreflight(q)))return true;
    sellState.trimAskAttempts=0;
    const missingFresh=currentMissingVehicleDetail();
    if(missingFresh){askMissingVehicleDetail(missingFresh);return true;}
    resumeWizardAfterVehicle(vehicleAcceptPrefix());
    return true;
  }
  if(currentIssue?.baseVehicle&&/\bdifferent\b.*\bmodel\b/i.test(lower)){
    sellState.carName=currentIssue.baseVehicle;
    sellState.carRaw=currentIssue.baseVehicle;
    sellState.vehicleDetailSkipped=false;
    sellState.vehicleIdentityValidated=false;
    sellState.pendingVehicleIdentity=null;
    const missing=currentMissingVehicleDetail();
    if(missing){
      askMissingVehicleDetail(missing);
      return true;
    }
  }
  if(/\b(change car|start over|wrong car|different car)\b/i.test(lower)){
    sellState.carName=null;sellState.carRaw=null;sellState.vehicleDetailSkipped=false;sellState.vehicleIdentityValidated=false;sellState.pendingVehicleIdentity=null;sellState.step=1;
    addMsg("sam","No problem. What are we selling today? Year, make and model.");
    return true;
  }
  // Explicit "move on" always advances at the level we know (locked behavior).
  // "lets just go with X" counts too: if X names a resolvable car (a decade
  // counts as the year), take it whole; otherwise advance with what we have.
  const goWithTail=goWith?String(q).replace(/^[\s\S]*?\bgo with\b/i,"").trim():"";
  if(goWith&&goWithTail&&looksLikeVehicleText(goWithTail)){
    try{
      const res=await fetch(apiPath("/api/vehicleIdentity"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:goWithTail})});
      const data=await res.json();
      if(res.ok&&data.status==="valid"&&data.vehicle?.canonicalLabel){
        sellState.resolvedVehicle=data.vehicle;
        if(data.vehicle.mileage&&!sellState.mileage)sellState.mileage=`${Number(data.vehicle.mileage).toLocaleString()} miles`;
        sellState.carName=data.vehicle.canonicalLabel;sellState.carRaw=data.vehicle.canonicalLabel;
        sellState.vehicleIdentityValidated=true;sellState.pendingVehicleIdentity=null;sellState.lastVehicleAsk=null;
        resumeWizardAfterVehicle(vehicleAcceptPrefix());
        return true;
      }
    }catch{ /* fall through to advancing at the level known */ }
  }
  if(detectIntent(lower)==="moveOn"||goWith){
    const baseVehicle=currentIssue?.baseVehicle||sellState.carName||"the car";
    sellState.carName=baseVehicle;sellState.carRaw=baseVehicle;
    sellState.vehicleDetailSkipped=true;sellState.pendingVehicleIdentity=null;
    sellState.vehicleIdentityValidated=false;sellState.notSureRepeats=0;
    resumeWizardAfterVehicle(`Moving on with the ${baseVehicle}. The read will be broader than model-specific, and I'll say so in the result.`);
    return true;
  }
  if(detectIntent(lower)==="refusal"||/\bskip\b/i.test(lower)){
    // Year-only gap (locked): make and model are known, so a single decline
    // proceeds at make/model level immediately. The year is never asked a
    // second time; the backend ladder starts at model scope and the result
    // is honestly labeled as broader than year-specific.
    if(currentIssue?.yearOnly){
      const baseVehicle=currentIssue.baseVehicle||sellState.carName||"the car";
      sellState.carName=baseVehicle;sellState.carRaw=baseVehicle;
      sellState.vehicleDetailSkipped=true;sellState.pendingVehicleIdentity=null;
      sellState.vehicleIdentityValidated=false;sellState.notSureRepeats=0;
      resumeWizardAfterVehicle(`No problem, I'll work with the ${baseVehicle} at the model level. The read will be broader than year-specific, and I'll say so in the result.`);
      return true;
    }
    sellState.notSureRepeats=(sellState.notSureRepeats||0)+1;
    const baseVehicle=currentIssue?.baseVehicle||sellState.carName||"the car";
    if(sellState.notSureRepeats>=3){
      // Third strike: stop asking. Proceed at make level; the evidence ladder
      // handles broad evidence honestly.
      sellState.carName=baseVehicle;sellState.carRaw=baseVehicle;
      sellState.vehicleDetailSkipped=true;sellState.pendingVehicleIdentity=null;
      sellState.vehicleIdentityValidated=false;sellState.notSureRepeats=0;
      askLocationStep(`No problem, I'll work with the ${baseVehicle} at that level. The read will be more directional than model-specific, and I'll say so in the result.`);
      return true;
    }
    addMsg("sam",sellState.notSureRepeats===1
      ?"No problem. I need the actual car before I can recommend where to sell it. What does the badge, registration or paperwork say?"
      :`All good. If the paperwork isn't handy, the badge on the back of the car usually settles it. If you'd rather not dig, say 'not sure' once more and I'll run the analysis on the ${baseVehicle} as-is, just with a broader read.`);
    return true;
  }
  if(currentIssue?.suggestion&&(affirmationPhrase||detectIntent(lower)==="affirmation")){
    sellState.carName=currentIssue.suggestion;
    sellState.carRaw=currentIssue.suggestion;
    sellState.vehicleDetailSkipped=false;
    sellState.vehicleIdentityValidated=false;
    sellState.pendingVehicleIdentity=null;
    if(!(await validateVehicleIdentityPreflight(sellState.carName)))return true;
    addMsg("sam",vehicleAcceptPrefix());
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
      askLocationStep();
    return true;
  }
  if(currentIssue?.suggestion&&normalizeVehicleAnswer(q)===normalizeVehicleAnswer(currentIssue.suggestion)){
    sellState.carName=currentIssue.suggestion;
    sellState.carRaw=currentIssue.suggestion;
    sellState.vehicleDetailSkipped=false;
    sellState.vehicleIdentityValidated=false;
    sellState.pendingVehicleIdentity=null;
    if(!(await validateVehicleIdentityPreflight(sellState.carName)))return true;
    addMsg("sam",vehicleAcceptPrefix());
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
      askLocationStep();
    return true;
  }
  if(currentIssue?.baseVehicle){
    // Year-answer recovery (Fix): when the answer is a year and we kept the
    // original raw, re-resolve the ORIGINAL text with the corrected year so any
    // model detail dropped by a mis-parse (e.g. "718") comes back, instead of
    // combining the lossy base label with the year.
    const yr=(q.match(/\b(19|20)\d{2}\b/)||[])[0]
      ||(/^'?\d{2}$/.test(q.trim())?String(2000+Number(q.trim().replace(/'/,""))):null);
    if(yr&&currentIssue.rawInput){
      const stripped=String(currentIssue.rawInput).replace(/^\s*\d{1,4}\b[\s,]*/,"").trim();
      const recovered=`${yr} ${stripped}`.replace(/\s+/g," ").trim();
      const base=normalizeVehicleAnswer(currentIssue.baseVehicle||"");
      // Only take the recovery path when the raw actually carries extra detail.
      if(recovered&&normalizeVehicleAnswer(stripped)!==base){
        sellState.carName=recovered;sellState.carRaw=recovered;
        sellState.vehicleDetailSkipped=false;sellState.vehicleIdentityValidated=false;sellState.pendingVehicleIdentity=null;
        if(!(await validateVehicleIdentityPreflight(recovered)))return true;
        const missingR=currentMissingVehicleDetail();
        if(missingR){askMissingVehicleDetail(missingR);return true;}
        addMsg("sam",vehicleAcceptPrefix());
        if(sellState.returnToConfirm){goBackToConfirm();return true;}
      askLocationStep();
        return true;
      }
    }
    const candidate=`${currentIssue.baseVehicle} ${q}`.replace(/\s+/g," ").trim();
    sellState.carName=candidate;
    sellState.carRaw=candidate;
    sellState.vehicleDetailSkipped=false;
    sellState.vehicleIdentityValidated=false;
    sellState.pendingVehicleIdentity=null;
    if(!(await validateVehicleIdentityPreflight(candidate)))return true;
    const missing=currentMissingVehicleDetail();
    if(missing){
      askMissingVehicleDetail(missing);
      return true;
    }
    addMsg("sam",vehicleAcceptPrefix());
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
      askLocationStep();
    return true;
  }
  // Accepted partial state accumulates: a bare year or model-only answer is
  // combined with what we already know, never re-demanded from scratch.
  const base=currentIssue?.baseVehicle||"";
  const hasYearToken=/\b(19|20)\d{2}\b/.test(lower)||/^'?\d{2}$/.test(lower);
  const hasLetters=/[a-z]/i.test(lower);
  let candidate=null;
  if(looksLikeVehicleText(q)&&hasYearToken)candidate=q;
  else if(base&&hasYearToken&&!hasLetters)candidate=`${base} ${q}`;
  else if(base&&hasLetters&&!looksLikeVehicleText(q))candidate=`${base} ${q}`;
  else if(base&&looksLikeVehicleText(q))candidate=`${base} ${q}`;
  else if(looksLikeVehicleText(q))candidate=q;
  if(candidate){
    sellState.carName=cleanInitialCarText(candidate)||candidate;
    sellState.carRaw=sellState.carName;
    sellState.vehicleDetailSkipped=false;
    sellState.vehicleIdentityValidated=false;
    sellState.pendingVehicleIdentity=null;
    if(!(await validateVehicleIdentityPreflight(sellState.carName)))return true;
    const missing=currentMissingVehicleDetail();
    if(missing){
      askMissingVehicleDetail(missing);
      return true;
    }
    addMsg("sam",vehicleAcceptPrefix());
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
      askLocationStep();
    return true;
  }
  // Locked rule 12: this fallback also never repeats verbatim and only asks
  // for what is genuinely missing.
  sellState.demandRepeats=(sellState.demandRepeats||0)+1;
  const knownBits=base?` I have the ${base} so far.`:"";
  const demandVariants=base?[
    `I just need the missing piece for the ${base}. Type it, or 'Not sure' and I'll analyse at that level.`,
    `Whatever detail you have on the ${base} works, even a badge or a guess. 'Not sure' is fine too and I'll work with what we have.`
  ]:[
    `I need the year, make and model before I can keep going. Something like '2014 Jaguar F-Type' or '1965 VW Bus'.${knownBits}`,
    `Give me whatever you know: even just the make is a start, like 'Porsche' or 'Volkswagen'.`
  ];
  addMsg("sam",demandVariants[(sellState.demandRepeats-1)%2]);
  return true;
}

function sellerFunnelReply(){
  return "Tell me the car and I’ll compare recent platform performance, timing patterns and PowerSeller fit before recommending what I’d do. A few quick questions, under a minute.";
}

function startSellFlow(initialCar, showUserBubble=true){
  resetSellState();
  sellState.active=true;sellState.step=1;
  if(typeof gasFunnel==="function")gasFunnel("wizard_start");  // 2F
  hideHero();
  // Rail/menu entry (no seed car): reset the view to a clean surface anchored at
  // the top of the screen, so a click from a scrolled-down results page lands on
  // the fresh question rather than mid-thread.
  if(!initialCar){
    if(typeof enterChatState==="function")enterChatState();
    if(typeof toggleRail==="function")toggleRail(false);
    const msgsEl=document.getElementById("msgs");if(msgsEl){msgsEl.innerHTML="";msgsEl.scrollTop=0;}
    try{window.scrollTo&&window.scrollTo(0,0);}catch(e){}
  }
  if(initialCar){
    // No entry text is ever discarded: the resolver decides what it is. Only
    // input the resolver cannot read as a vehicle gets the funnel line.
    const carName=cleanInitialCarText(initialCar);
    sellState.carRaw=initialCar;sellState.carName=carName||initialCar;sellState.vehicleIdentityValidated=false;
    setTimeout(async()=>{
      if(!(await validateVehicleIdentityPreflight(sellState.carName,{chatFallback:true}))){
        if(sellState.lastIdentityVerdict==="not_vehicle"){
          sellState.carName=null;sellState.carRaw=null;
          addMsg("sam",sellerFunnelReply(),"",chipsHTML(["Start the questions"]));
        }
        return;
      }
      // Out-of-scope gate, phase 1 (homepage entry path): refuse a no-escape
      // modern mainstream economy car before asking the optional trim.
      if(typeof maybeGateOutOfScope==="function"&&maybeGateOutOfScope("preTrim"))return;
      const missing=currentMissingVehicleDetail();
      if(missing){
        askMissingVehicleDetail(missing);
        return;
      }
      resumeWizardAfterVehicle(vehicleAcceptPrefix());
    },400);
    return;
  }
  if(showUserBubble)addMsg("user","Sell my car");
  setTimeout(()=>{
    addMsg("sam","Answer a few quick questions, under a minute, and I'll compare the market properly. What are we selling today?");
  },400);
}

// Single acceptance message (Phase 1a): every path that accepts a freshly
// resolved vehicle uses this, so the resolver's verdict is surfaced identically
// everywhere. A verified model reads "Got it. X."; an UNVERIFIED designation is
// never a silent "Got it" - it is acknowledged as unrecognized with a broader
// make-level read and an invitation to double-check the badge.
// Display label (Defect 4): an unverified designation is tagged everywhere it
// renders as a label (wizard summary, result plate, card title), so one entry
// acknowledgement is not the only signal across a 12-step flow. Verified models
// never carry the tag.
function carDisplayLabel(fallback){
  const name=sellState.carName||fallback||"Car";
  return sellState.resolvedVehicle?.unverified?`${name} (unverified)`:name;
}
function vehicleAcceptPrefix(){
  const v=sellState.resolvedVehicle;
  if(v&&v.unverified){
    const label=v.model?`the ${v.make} ${v.model}`:"that";
    return `I don't recognize ${label} as a model I track, so I'll run a broader ${v.make||"make"}-level read. Tell me the exact badge if you want to double-check the designation.`;
  }
  return `Got it. ${sellState.carName}.`;
}

// Resume at the first unanswered question: a vehicle edit mid-flow keeps
// every answer already given and re-flows only through what is missing.
function resumeWizardAfterVehicle(prefix){
  // Out-of-scope gate, phase 2: the car is fully resolved (model + any trim). A
  // modern mainstream economy car with no rescuing trim is refused here, before
  // advancing to the country step, so no search is ever reserved.
  if(maybeGateOutOfScope("postTrim"))return;
  if(sellState.returnToConfirm){goBackToConfirm();return;}
  if(sellState.editReturnStep&&SELL_STEP_QUESTIONS[sellState.editReturnStep]){
    const back=sellState.editReturnStep;
    sellState.editReturnStep=null;
    sellState.editPrevVehicle=null;
    sellState.step=back;
    const backQ=SELL_STEP_QUESTIONS[back];
    addMsg("sam",[prefix,backQ.ask].filter(Boolean).join(" "),"",backQ.chips&&backQ.chips.length?chipsHTML(backQ.chips):"");
    return;
  }
  // Intake (US-only launch): car -> state(18) -> price(6) -> preference(8) ->
  // analysis. No country step (dormant), no confirm step: the preference answer
  // runs the analysis directly. Region defaults to US so downstream never sees a
  // null region.
  if(!sellState.region){ sellState.region="US"; sellState.country="the United States"; sellState.countryRoutable=true; }
  const localityAnswered=!!sellState.state;
  const next=!localityAnswered?18
    :(!sellState.price?6
    :(!sellState.sellerPreference?8:99));
  if(next===8){ if(prefix)addMsg("sam",prefix); askPowerSellerStep(); return; }
  if(next===99){ if(prefix)addMsg("sam",prefix); showSellRecommendation(); return; }
  sellState.step=next;
  const q=SELL_STEP_QUESTIONS[next];
  const ask=next===18?locationAskText():q.ask;
  const chips=(next===18&&sellState.region!=="US")?[]:(q.chips||[]);
  addMsg("sam",[prefix,ask].filter(Boolean).join(" "),"",chips&&chips.length?chipsHTML(chips):"");
}
// Country detection at step 11. Resolves the input to a region bucket, a display
// label, and whether we can route it today (phase 1: routable = US, UK, Europe,
// Australia, Middle East; Canada and anything else get the honest line, never a
// silent US default). A US state typed directly still reads as US.
function detectCountry(q){
  const l=String(q||"").toLowerCase().trim();
  if(typeof normalizeUSState==="function"&&normalizeUSState(q))return {region:"US",label:"the United States",routable:true};
  for(const c of COUNTRY_REGISTRY){ if(c.match.test(l))return {region:c.region,label:c.label,routable:true}; }
  // Not in the routable registry (e.g. Canada, or any other country): resolved to
  // a real country label for the honest no-routing line, marked not routable.
  const label=(q||"").trim().replace(/^(in|from|the)\s+/i,"");
  return {region:"international",label:label?titleCaseCountry(label):"another country",routable:false};
}
// Positive non-US detector for the state step (US-only launch). resolveStateInput
// already flags typed country names (UK, Canada, Australia, UAE, Mexico, Europe);
// this adds country-level terms it misses (Germany, France...) and well-known
// non-US cities and provinces, the shape a seller's bare answer usually takes
// ("London", "Ontario"). It is deliberately a POSITIVE list, never a catch-all,
// so an unrecognized US city ("Tulsa") is NEVER mistaken for non-US. A handful of
// minor US namesakes are accepted: the locked reply invites the seller to name
// their state, which resolves on the next turn. Parked to widen at the UK launch.
const NON_US_PLACES=[
  // Canada
  "canada","canadian","ontario","quebec","alberta","manitoba","saskatchewan","british columbia","nova scotia","newfoundland","new brunswick",
  "toronto","montreal","vancouver","calgary","ottawa","edmonton","winnipeg","mississauga","halifax",
  // UK / Ireland
  "london","glasgow","edinburgh","liverpool","leeds","manchester","cardiff","aberdeen","dublin","belfast",
  // Europe
  "munich","frankfurt","hamburg","cologne","stuttgart","amsterdam","rotterdam","brussels","antwerp","zurich","geneva",
  "milan","rome","turin","madrid","barcelona","lisbon","porto","vienna","prague","warsaw","stockholm","copenhagen",
  "oslo","helsinki","monaco","nice","lyon","marseille","mexico","mexico city",
  // Australia / NZ / Middle East / Asia
  "sydney","melbourne","brisbane","perth","adelaide","auckland","wellington",
  "dubai","abu dhabi","doha","riyadh","tokyo","osaka","hong kong","singapore","shanghai","beijing"
];
function looksNonUS(text){
  const l=String(text||"").toLowerCase().replace(/[.,]/g," ").replace(/\s+/g," ").trim();
  if(!l)return false;
  if(typeof normalizeUSState==="function"&&normalizeUSState(l))return false; // a real US state wins
  for(const c of COUNTRY_REGISTRY){ if(c.region!=="US"&&c.match.test(l))return true; }
  return NON_US_PLACES.some(p=>new RegExp("\\b"+p.replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&")+"\\b").test(l));
}
function titleCaseCountry(s){
  const map={germany:"Germany",german:"Germany",france:"France",french:"France",italy:"Italy",italian:"Italy",spain:"Spain",spanish:"Spain",netherlands:"the Netherlands",dutch:"the Netherlands",belgium:"Belgium",switzerland:"Switzerland",swiss:"Switzerland",sweden:"Sweden",austria:"Austria",portugal:"Portugal",ireland:"Ireland",denmark:"Denmark",norway:"Norway",finland:"Finland",poland:"Poland",europe:"Europe",european:"Europe"};
  const key=String(s||"").toLowerCase().trim();
  if(map[key])return map[key];
  return String(s||"").trim().replace(/\b\w/g,c=>c.toUpperCase());
}
// Step 18 asks for a US state or, for non-US countries, a free-text city/region.
function locationAskText(){
  return sellState.region==="US"?SELL_STEP_QUESTIONS[18].ask:"Which city or region? A city or area is perfect.";
}

// LAUNCH (US-only, Aug 2026): the country step (11) is DORMANT, not deleted.
// Vehicle completion hands straight to the state question (18) with the region
// pre-set to US, so the flow is car -> state -> price -> preference. COUNTRY_REGISTRY,
// detectCountry, countryChips and the step-11 handler stay in the file, unused, ready
// for the UK/Europe launch: restore these call sites to step 11 to re-enable the
// country question. A non-US answer is now caught at the state step (see steps.js).
function askLocationStep(prefix){
  sellState.region="US"; sellState.country="the United States"; sellState.countryRoutable=true; sellState.state=null;
  sellState.step=18;
  addMsg("sam",[prefix,SELL_STEP_QUESTIONS[18].ask].filter(Boolean).join(" "),"",chipsHTML(SELL_STEP_QUESTIONS[18].chips));
}

function editCarName(){
  // Snapshot where the user was and what the car resolved to: re-confirming
  // the same car (or landing a new one) resumes at the saved step, never
  // back at "What are we selling today?".
  sellState.editReturnStep=SELL_STEP_QUESTIONS[sellState.step]?sellState.step:null;
  sellState.editPrevVehicle={carName:sellState.carName,carRaw:sellState.carRaw,resolvedVehicle:sellState.resolvedVehicle};
  sellState.step=1;
  sellState.vehicleIdentityValidated=false;
  sellState.pendingVehicleIdentity=null;
  sellState.resolvedVehicle=null;
  sellState.trimAskAttempts=0;
  addMsg("sam",`No problem. What's the car instead of the ${sellState.carName||"one we had"}? Year, make and model. If it's actually right, just say so.`);
}

// ===================== Item 3: SCOPED EDIT from the summary strip =====================
// Opens field chips; each re-asks ONLY that field, keeping everything else. After
// the scoped answer we RETURN to the question the seller was on (mid-wizard) or
// RE-RUN the analysis with no new credit (post-result). A car change follows the
// existing change-car path and its normal rules.
function openScopedEdit(){
  sellState.scopedEdit={ postResult: sellState.step===12, returnStep:(sellState.step>0&&sellState.step!==12)?sellState.step:null, awaitingField:true };
  addMsg("sam","What would you like to change?","",chipsHTML(["The car","Location","Price","How I'll sell"]));
}
function scopedFieldFromInput(text){
  var l=String(text||"").toLowerCase().trim();
  if(/^the car$|^car$|^vehicle$/.test(l))return "car";
  if(/^location$|^region$|^country$|^state$|^where/.test(l))return "location";
  if(/^price$|^asking/.test(l))return "price";
  if(/^how i'?ll sell$|^how i sell|^preference$|^powerseller|^involvement$/.test(l))return "preference";
  return null;
}
function beginScopedField(field){
  var se=sellState.scopedEdit||{}; se.awaitingField=false; se.field=field; sellState.scopedEdit=se;
  if(field==="car"){
    // Change-car path (normal rules): snapshot for same-car re-confirm; post-result
    // flows through to the analysis, mid-wizard returns to the saved step.
    sellState.editPrevVehicle={carName:sellState.carName,carRaw:sellState.carRaw,resolvedVehicle:sellState.resolvedVehicle};
    sellState.editReturnStep=se.postResult?null:se.returnStep;
    sellState.scopedEdit=null;
    sellState.step=1; sellState.vehicleIdentityValidated=false; sellState.resolvedVehicle=null; sellState.pendingVehicleIdentity=null; sellState.trimAskAttempts=0;
    addMsg("sam","Sure. What's the car? Year, make and model. If it's the same, just say so.");
    return;
  }
  if(field==="location"){ askLocationStep(); return; }
  if(field==="price"){ sellState.price=null; sellState.step=6; addMsg("sam",SELL_STEP_QUESTIONS[6].ask); return; }
  if(field==="preference"){ sellState.sellerPreference=null; sellState.involvement=null; sellState.step=8; askPowerSellerStep(); return; }
}
function scopedEditActive(field){ var se=sellState.scopedEdit; return !!(se&&!se.awaitingField&&se.field===field); }
function finishScopedEdit(){
  var se=sellState.scopedEdit; sellState.scopedEdit=null;
  if(se&&se.postResult){ showSellRecommendation({rerun:true}); return true; }
  if(se&&se.returnStep){ sellState.step=se.returnStep; if(se.returnStep===8)askPowerSellerStep(); else askNextSellQuestion(); return true; }
  showSellRecommendation(); return true;
}
// A reply carrying a price signal ("worth 55", "$55k", "55000", "asking 55")
// routes the number to PRICE (never a year). Returns {value, formatted, cleaned}
// with the price text stripped so the remainder can resolve as the car.
function extractPriceSignal(text){
  var t=String(text||"");
  var m=/\b(?:worth|asking|want|get|around|about|approx(?:imately)?|price[d]?(?:\s+at)?|selling for|for)\s*\$?\s*(\d[\d,]*)\s*(k|grand|thousand)?\b/i.exec(t)
      ||/\$\s*(\d[\d,]*)\s*(k|grand|thousand)?\b/i.exec(t)
      ||/\b(\d[\d,]*)\s*(k|grand|thousand)\b/i.exec(t)   // "55k"
      ||/\b(\d{5,})\b/.exec(t);                          // bare "55000"
  if(!m)return null;
  var n=Number(String(m[1]).replace(/,/g,"")); if(!isFinite(n)||n<=0)return null;
  if(/k|grand|thousand/i.test(m[2]||"")||n<1000)n=n*1000;   // "55" / "55k" -> 55000
  var formatted="$"+n.toLocaleString("en-US");
  var cleaned=t.replace(m[0],"").replace(/\s*(?:,|\.|;)?\s*(?:and|its|it'?s|and it'?s)\s*$/i,"").replace(/\s{2,}/g," ").trim();
  return {value:n,formatted:formatted,cleaned:cleaned};
}

// The condition question acknowledges a condition already volunteered at
// entry ("73 bronco half restored") instead of asking cold.
function conditionAskText(){
  return sellState.conditionHint
    ?`You mentioned it's ${sellState.conditionHint}. Closest fit: stock, minor mods, or heavily modified?`
    :SELL_STEP_QUESTIONS[3].ask;
}

function askNextSellQuestion(){
  if(sellState.step===17){
    const missing=currentMissingVehicleDetail();
    if(missing){askMissingVehicleDetail(missing);return;}
  }
  if(sellState.step===8){askPowerSellerStep();return;}
  const q=SELL_STEP_QUESTIONS[sellState.step];
  if(!q)return;
  addMsg("sam",q.ask,"",q.chips.length?chipsHTML(q.chips):"");
}

// PowerSeller preference (FIX 3): the LAST wizard step, asked after the summary
// is confirmed and before results compile. The answer is stored as
// sellState.sellerPreference ("powerseller" | "diy" | "unsure") and gates the
// PowerSeller card at the result stage. Part 5: the plain-language explainer
// renders ABOVE the chips (it is the only above-chips slot), then the question,
// so a first-time reader knows what a PowerSeller is before choosing. Dash-free
// per the locked no-dash rule.
function askPowerSellerStep(){
  sellState.step=8;
  const q=SELL_STEP_QUESTIONS[8];
  addMsg("sam",`${q.explainer} ${q.ask}`,"",chipsHTML(q.chips));
}

function goBackToConfirm(){
  // The confirm step is gone: any edit that finishes with all fields present
  // re-runs the analysis directly rather than re-showing a confirm card.
  sellState.returnToConfirm=false;
  showSellRecommendation();
}

function normalizeUpdateValue(value){
  return String(value||"").replace(/^(to|is|as|it'?s|its)\s+/i,"").trim();
}

function applySellStateUpdate(text){
  const raw=String(text||"").trim();
  const lower=raw.toLowerCase();
  const patterns=[
    {key:"carName",label:"Car",re:/\b(?:car|vehicle)\b\s*(?:to|is|as)?\s*(.+)$/i},
    {key:"region",label:"Location",re:/\b(?:location|region|located|country)\b\s*(?:to|is|as|in)?\s*(.+)$/i},
    {key:"state",label:"State",re:/\b(?:state)\b\s*(?:to|is|as|in)?\s*(.+)$/i},
    {key:"mileage",label:"Mileage",re:/\b(?:mileage|miles|odometer)\b\s*(?:to|is|as)?\s*(.+)$/i},
    {key:"condition",label:"Condition",re:/\b(?:condition|mods|modified|stock)\b\s*(?:to|is|as)?\s*(.+)$/i},
    {key:"records",label:"Service records",re:/\b(?:service records|records|history)\b\s*(?:to|is|as)?\s*(.+)$/i},
    {key:"title",label:"Title",re:/\b(?:title|lien)\b\s*(?:to|is|as)?\s*(.+)$/i},
    {key:"price",label:"Asking price",re:/\b(?:price|target|asking|ask)\b\s*(?:to|is|as)?\s*(.+)$/i},
    {key:"timeline",label:"Timeline",re:/\b(?:timeline|timing|sell by|speed)\b\s*(?:to|is|as)?\s*(.+)$/i},
    {key:"involvement",label:"Involvement",re:/\b(?:involvement|hands[- ]?on|hands[- ]?off|manage)\b\s*(?:to|is|as)?\s*(.+)$/i},
    {key:"notes",label:"Notes",re:/\b(?:notes|note|anything else)\b\s*(?:to|is|as)?\s*(.+)$/i}
  ];

  for(const pattern of patterns){
    const match=raw.match(pattern.re);
    if(!match)continue;
    const value=normalizeUpdateValue(match[1]);
    if(!value)return null;
    if(pattern.key==="region"){
      // US-only launch: an inline region edit never sets a non-US region. A US-state
      // value pre-fills the state; anything else leaves region US, state unset.
      const stateFromValue=normalizeUSState(value);
      sellState.region="US";
      sellState.state=stateFromValue||null;
    }else{
      sellState[pattern.key]=pattern.key==="state"?(normalizeUSState(value)||value):value;
    }
    if(pattern.key==="carName"){
      sellState.carRaw=value;
      sellState.vehicleIdentityValidated=false;
      sellState.pendingVehicleIdentity=null;
    }
    if(pattern.key==="state")sellState.region="US";
    return {key:pattern.key,label:pattern.label,value:sellState[pattern.key]};
  }

  if(/\b(actually|change|update|make it|set it)\b/i.test(lower)){
    const carMatch=raw.match(/\b((?:19|20)\d{2}\s+[^,.]+)$/i);
    if(carMatch){
      const value=normalizeUpdateValue(carMatch[1]);
      sellState.carName=value;sellState.carRaw=value;
      sellState.vehicleIdentityValidated=false;
      sellState.pendingVehicleIdentity=null;
      return {key:"carName",label:"Car",value};
    }
    const priceMatch=raw.match(/\b(?:\$?\d+(?:,\d{3})?|\d+k|six figures?)\b/i);
    if(priceMatch&&/\b(price|target|asking|ask|six figures?)\b/i.test(lower)){
      const value=priceMatch[0];
      sellState.price=value;
      return {label:"Asking price",value};
    }
    const mileageMatch=raw.match(/\b(?:\d+(?:,\d{3})?|\d+k)\s*(?:miles|mi|k)?\b/i);
    if(mileageMatch&&/\b(mileage|miles|mi|odometer)\b/i.test(lower)){
      const value=mileageMatch[0];
      sellState.mileage=value;
      return {label:"Mileage",value};
    }
  }

  return null;
}

function remainingWizardQuestions(){
  // Four-question intake: car -> location -> price -> preference (Thesis v1).
  const order=[1,18,6,8];
  const idx=order.indexOf(sellState.step);
  if(idx<0)return 0;
  let rest=order.slice(idx+1);
  if(sellState.state||(sellState.region&&sellState.region!=="US"))rest=rest.filter(step=>step!==18);
  return rest.length;
}

function stripChatMarkdown(text){
  return String(text||"")
    .replace(/\*\*([^*]+)\*\*/g,"$1")
    .replace(/\*([^*\n]+)\*/g,"$1")
    .replace(/__([^_]+)__/g,"$1")
    .replace(/^#{1,4}\s+/gm,"")
    .replace(/\*\*/g,"");
}

// ===================== SELL INPUT PIPELINE =====================
// Locked architecture: EVERY user input in the sell flow passes through this
// pipeline before any state handler may store or act on it. Stages:
// 1 intent detection (affirm/negate/refuse/move-on), 2 off-script question
// routing to the chat layer, 3 per-state answer-shape validation, 4 value
// normalization before storage, 5 a global no-repeat backstop in addMsg.
