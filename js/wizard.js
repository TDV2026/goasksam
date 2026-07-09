// Partner (PowerSeller) profiles come from the backend partners table via
// decision.partnerReferral. Nothing partner-related is hardcoded here.

const sellState={active:false,step:0,carRaw:null,carName:null,carType:null,region:null,state:null,mileage:null,condition:null,records:null,title:null,price:null,timeline:null,involvement:null,notes:null,photo:null,chosen:null,email:null,phone:null,returnToConfirm:false,vehicleDetailSkipped:false,vehicleIdentityValidated:false,pendingVehicleIdentity:null,resolvedVehicle:null,generatedPrimaryName:null,generatedSecondaryName:null,sellDecision:null,sellOptions:[],allRouteOptions:[],powerSellerProfiles:[],selectedPowerSellerId:null,noEvidenceFallback:null};
function resetSellState(){
  Object.keys(sellState).forEach(k=>sellState[k]=null);
  sellState.active=false;sellState.step=0;sellState.returnToConfirm=false;sellState.vehicleDetailSkipped=false;sellState.vehicleIdentityValidated=false;sellState.pendingVehicleIdentity=null;sellState.sellOptions=[];sellState.allRouteOptions=[];sellState.powerSellerProfiles=[];sellState.noEvidenceFallback=null;
}

const SELL_STEP_QUESTIONS={
  1:{ask:"What are we selling today?",chips:[]},
  17:{ask:"Which model or trim is it?",chips:["911","944","928","356","Boxster","Cayman","Not sure"]},
  11:{ask:"Where is the car located?",chips:["US","UK","Europe","Australia","Middle East","Other"]},
  18:{ask:"Which state is it in? This helps me think about PowerSeller and handoff options. Type it if it is not shown.",chips:["California","Florida","Texas","New York","New Jersey","Other"]},
  2:{ask:"Rough mileage?",chips:["Under 30k","30k to 60k","60k to 100k","Over 100k"]},
  3:{ask:"Stock or modified?",chips:["Completely stock","Minor mods","Heavily modified"]},
  4:{ask:"Service records?",chips:["Full history","Some records","No records"]},
  5:{ask:"Clean title or is there a lien on it?",chips:["Clean title","Lien on it"]},
  6:{ask:"What price are you hoping for?",chips:[]},
  7:{ask:"How quickly are you looking to sell?",chips:["Want it gone fast","Within a month","No rush, right result only"]},
  9:{ask:"Anything else Sam should know about the car? Feel free to skip.",chips:["Skip"]}
};

const SELL_SYS=`You are Sam, helping someone sell their car on GoAskSam. Warm, direct, knowledgeable about the collector car market.

The user is in the middle of a sell flow and has asked a question or gone off-script. Your job:
1. Answer their question warmly and specifically.
2. If they want to change a previous answer, acknowledge and confirm the update.
3. Answer only. NEVER repeat, rephrase, or re-ask the wizard's question yourself; the wizard asks it separately right after your answer, so ending with the question would duplicate it. End on your answer.

Grounding rules (locked):
- Never contradict the engine's platform recommendation. When decision facts are provided in the context, they are the answer to "where should I sell": your job is to explain and support that recommendation in your own voice, never to name a different platform as where you'd start.
- No platform-mechanics claims stated as fact (auction formats, durations, audiences, fee structures): GoAskSam stores none of that. This includes details you believe you know, like how many days an auction runs or how submission works. If it matters, say the platform's current process is the place to check.
- No invented market commentary: no state-level demand claims, no buyer-pool claims at price points, no seasonality claims. You may reference only the facts provided in the context, framed as data, plus clearly-labeled opinion in Sam's voice ("if it were mine...").
Key facts:
- Fees: GoAskSam holds NO platform fee data. Never state platform fees, commissions, percentages, or caps as fact; those numbers would be invented. If asked about platform costs, say fee structures change and the platform's current terms are the place to check. If asked what howS or any consignor/PowerSeller charges: we do not hold his fee terms; per howS his structure is usually flexible (flat fee, percentage, or incentive), and the specifics are discussed directly with him if the seller requests an introduction.
- Timing: the question flow takes under a minute, and the market analysis itself runs in seconds once the questions are done. Nothing here is a long process.
- Privacy and leads: seller details are used only to build the recommendation. If the seller chooses to proceed, their details go to one single chosen destination, never blasted to multiple partners, never sold.
- If asked about The Daily Vroom, Sam Gold, ownership, or who is behind GoAskSam: GoAskSam is part of The Daily Vroom, the trusted collector car newsletter read by tens of thousands of readers and running for years. Sam Gold owns The Daily Vroom. Its tools also include the Import Calculator. If asked whether GoAskSam is part of The Daily Vroom, the answer is definitively yes. Never claim ignorance of these facts.
- GoAskSam uses live market evidence for seller recommendations. Do not name a power seller unless one has been explicitly verified in the current context.
- PowerSellers may be worth evaluating for six-figure or specialist cars, but consignment status, region, minimum value and availability must be verified first.
- GoAskSam records seller details and the selected choice. Do not promise a specific response time unless it is confirmed.
- Do not invent market performance claims. If current evidence is not available, say so.

Style: never use em dashes or en dashes anywhere in your replies. Use commas or periods instead. Write plain prose only: no markdown, no asterisks, no underscores, no bullet syntax, no headers. Never open with filler like "Great question" or "Good question"; start with the substance.

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

function isUSRegion(value){
  return /\b(us|usa|u\.s\.|united states|america|united states of america)\b/i.test(String(value||"").trim());
}

function looksLikeVehicleText(text){
  const lower=String(text||"").toLowerCase();
  const hasYear=/\b(19|20)\d{2}\b/.test(lower);
  const hasVehicleTerm=/\b(porsche|ferrari|bmw|mercedes|benz|audi|lamborghini|aston|bentley|mclaren|chevrolet|chevy|corvette|vette|ford|mustang|stang|dodge|viper|toyota|honda|acura|nissan|datsun|subaru|mazda|miata|land rover|range rover|jaguar|jag|maserati|alfa|lotus|volkswagen|vw|beetle|bug|bus|camper|campervan|kombi|vanagon|westfalia|westy|karmann|pontiac|cadillac|buick|oldsmobile|plymouth|amc|jeep|willys|shelby|lincoln|mercury|mini|mg|triumph|austin|volvo|saab|fiat|lancia|delorean|amphicar|studebaker|packard|911|356|914|928|944|gt3|gt2|turbo|m2|m3|m4|m5|amg|rs|sti|supra|nsx|gtr|skyline|camaro|chevelle|gto|r8|rs3|rs4|rs5|rs6|rs7|s3|s4|s5|s6|s7|tt)\b/.test(lower);
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
    return {type:"model",ask:"Which BMW model or trim is it? These are just common examples. Pick one below, or type the exact model if it is not shown.",chips:["318i","M3","2002","Z4","X5","Not sure"]};
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

function missingVehicleTrimDetail(text){
  // Trim-missing is judged on the RESOLVED vehicle when we have one: model
  // confirmed with no trim means the trim step always runs before location
  // (trims drive the top ladder rungs). The text regex remains only as the
  // fallback when no resolution exists yet.
  const rv=sellState.resolvedVehicle;
  if(rv&&rv.model&&!rv.trim){
    if(/porsche/i.test(rv.make||"")&&/^(911|964|993|996|997|991|992)$/.test(String(rv.model)))return TRIM_911_ASK;
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
    sellState.step=11;
    addMsg("sam",`I'll take the ${sellState.carName||"car"} as-is and keep the read broad. Where is the car located?`,"",chipsHTML(["US","UK","Europe","Australia","Middle East","Other"]));
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
  const questionLike=/\?\s*$/.test(lower)||/^(what|how|why|when|where|who|can|could|will|would|does|do|is|are|should|but|explain|tell me)\b/i.test(lower)||/\b(how long|you never|what happens|why do you)\b/i.test(lower);
  const wordyNonAnswer=!subStateIntent&&lower.split(/\s+/).length>=4&&!/\d/.test(lower)&&!looksLikeVehicleText(q)&&!/\b(not sure|don.t know|unknown|skip|change car|start over|wrong car|different car|yes|yep|yeah|correct)\b/i.test(lower);
  if((questionLike&&!subStateIntent&&!looksLikeVehicleText(q))||wordyNonAnswer)return false;
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
  if(detectIntent(lower)==="moveOn"){
    const baseVehicle=currentIssue?.baseVehicle||sellState.carName||"the car";
    sellState.carName=baseVehicle;sellState.carRaw=baseVehicle;
    sellState.vehicleDetailSkipped=true;sellState.pendingVehicleIdentity=null;
    sellState.vehicleIdentityValidated=false;sellState.notSureRepeats=0;
    sellState.step=11;
    addMsg("sam",`Moving on with the ${baseVehicle}. The read will be broader than model-specific, and I'll say so in the result. Where is the car located?`,"",chipsHTML(["US","UK","Europe","Australia","Middle East","Other"]));
    return true;
  }
  if(detectIntent(lower)==="refusal"||/\bskip\b/i.test(lower)){
    sellState.notSureRepeats=(sellState.notSureRepeats||0)+1;
    const baseVehicle=currentIssue?.baseVehicle||sellState.carName||"the car";
    if(sellState.notSureRepeats>=3){
      // Third strike: stop asking. Proceed at make level; the evidence ladder
      // handles broad evidence honestly.
      sellState.carName=baseVehicle;sellState.carRaw=baseVehicle;
      sellState.vehicleDetailSkipped=true;sellState.pendingVehicleIdentity=null;
      sellState.vehicleIdentityValidated=false;sellState.notSureRepeats=0;
      sellState.step=11;
      addMsg("sam",`No problem, I'll work with the ${baseVehicle} at that level. The read will be more directional than model-specific, and I'll say so in the result. Where is the car located?`,"",chipsHTML(["US","UK","Europe","Australia","Middle East","Other"]));
      return true;
    }
    addMsg("sam",sellState.notSureRepeats===1
      ?"No problem. I need the actual car before I can recommend where to sell it. What does the badge, registration or paperwork say?"
      :`All good. If the paperwork isn't handy, the badge on the back of the car usually settles it. If you'd rather not dig, say 'not sure' once more and I'll run the analysis on the ${baseVehicle} as-is, just with a broader read.`);
    return true;
  }
  if(currentIssue?.suggestion&&(detectIntent(lower)==="affirmation"||/^(that one)$/i.test(lower))){
    sellState.carName=currentIssue.suggestion;
    sellState.carRaw=currentIssue.suggestion;
    sellState.vehicleDetailSkipped=false;
    sellState.vehicleIdentityValidated=false;
    sellState.pendingVehicleIdentity=null;
    if(!(await validateVehicleIdentityPreflight(sellState.carName)))return true;
    addMsg("sam",`Got it. ${sellState.carName}.`);
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
    sellState.step=11;
    addMsg("sam","Where is the car located?","",chipsHTML(["US","UK","Europe","Australia","Middle East","Other"]));
    return true;
  }
  if(currentIssue?.suggestion&&normalizeVehicleAnswer(q)===normalizeVehicleAnswer(currentIssue.suggestion)){
    sellState.carName=currentIssue.suggestion;
    sellState.carRaw=currentIssue.suggestion;
    sellState.vehicleDetailSkipped=false;
    sellState.vehicleIdentityValidated=false;
    sellState.pendingVehicleIdentity=null;
    if(!(await validateVehicleIdentityPreflight(sellState.carName)))return true;
    addMsg("sam",`Got it. ${sellState.carName}.`);
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
    sellState.step=11;
    addMsg("sam","Where is the car located?","",chipsHTML(["US","UK","Europe","Australia","Middle East","Other"]));
    return true;
  }
  if(currentIssue?.baseVehicle){
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
    addMsg("sam",`Got it. ${sellState.carName}.`);
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
    sellState.step=11;
    addMsg("sam","Where is the car located?","",chipsHTML(["US","UK","Europe","Australia","Middle East","Other"]));
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
    addMsg("sam",`Got it. ${sellState.carName}.`);
    if(sellState.returnToConfirm){goBackToConfirm();return true;}
    sellState.step=11;
    addMsg("sam","Where is the car located?","",chipsHTML(["US","UK","Europe","Australia","Middle East","Other"]));
    return true;
  }
  // Locked rule 12: this fallback also never repeats verbatim and only asks
  // for what is genuinely missing.
  sellState.demandRepeats=(sellState.demandRepeats||0)+1;
  const knownBits=base?` I have the ${base} so far.`:"";
  const demandVariants=base?[
    `I just need the missing piece for the ${base}. Type it, or say 'move on' and I'll analyse at that level.`,
    `Whatever detail you have on the ${base} works, even a badge or a guess. Or say 'move on' and I'll work with what we have.`
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
  hideHero();
  if(initialCar){
    const carName=cleanInitialCarText(initialCar);
    if(!looksLikeVehicleText(initialCar)){
      addMsg("sam",sellerFunnelReply(),"",chipsHTML(["Start the questions"]));
      return;
    }
    sellState.carRaw=initialCar;sellState.carName=carName||initialCar;sellState.vehicleIdentityValidated=false;
    setTimeout(async()=>{
      if(!(await validateVehicleIdentityPreflight(sellState.carName)))return;
      const missing=currentMissingVehicleDetail();
      if(missing){
        askMissingVehicleDetail(missing);
        return;
      }
      sellState.step=11;
      askNextSellQuestion();
    },400);
    return;
  }
  if(showUserBubble)addMsg("user","Sell my car");
  setTimeout(()=>{
    addMsg("sam","Answer a few quick questions, under a minute, and I'll compare the market properly. What are we selling today?");
  },400);
}

function askNextSellQuestion(){
  if(sellState.step===17){
    const missing=currentMissingVehicleDetail();
    if(missing){askMissingVehicleDetail(missing);return;}
  }
  const q=SELL_STEP_QUESTIONS[sellState.step];
  if(!q)return;
  addMsg("sam",q.ask,"",q.chips.length?chipsHTML(q.chips):"");
}

function goBackToConfirm(){
  sellState.returnToConfirm=false;
  sellState.step=16;
  setTimeout(()=>showConfirmation(),400);
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
      const stateFromValue=normalizeUSState(value);
      sellState.region=stateFromValue?"US":value;
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
    return {label:pattern.label,value:sellState[pattern.key]};
  }

  if(/\b(actually|change|update|make it|set it)\b/i.test(lower)){
    const carMatch=raw.match(/\b((?:19|20)\d{2}\s+[^,.]+)$/i);
    if(carMatch){
      const value=normalizeUpdateValue(carMatch[1]);
      sellState.carName=value;sellState.carRaw=value;
      sellState.vehicleIdentityValidated=false;
      sellState.pendingVehicleIdentity=null;
      return {label:"Car",value};
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
  const order=[1,11,18,2,3,4,5,6,7,9];
  const idx=order.indexOf(sellState.step);
  if(idx<0)return 0;
  let rest=order.slice(idx+1);
  if(sellState.region&&sellState.region!=="US")rest=rest.filter(step=>step!==18);
  if(sellState.state)rest=rest.filter(step=>step!==18);
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
