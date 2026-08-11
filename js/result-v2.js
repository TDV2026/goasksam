// Card redesign — Stage 1-2 (flag-gated). Renders the redesigned Platform pick
// card with the approved variant copy, bound to the real decision payload. Old
// render is untouched and stays the default; V2 renders only when the flag is on
// (localStorage gas_cardv2="1", set via /?cardv2=1). Curated strings only, no LLM
// at render. Deterministic variant selection by resultId + family tag so a saved
// result re-renders identically. Source of truth: scratchpad/variants-final-ready.md.

(function(){
  // ---- flags ----
  try{
    var s=location.search||"";
    // V2 cards are the DEFAULT now. ?cardv2=0 opts out to the legacy cards;
    // ?cardv2=1 clears the opt-out (back to default on).
    var m=/[?&]cardv2=([01])/.exec(s);
    if(m){ if(m[1]==="0")localStorage.setItem("gas_cardv2","0"); else localStorage.removeItem("gas_cardv2"); }
    // realgate: makes a crew device run the REAL free-first/quota gate on demand,
    // overriding the crew bypass server-side (sent as body.forceGate).
    var g=/[?&]realgate=([01])/.exec(s);
    if(g){ if(g[1]==="1")localStorage.setItem("gas_realgate","1"); else localStorage.removeItem("gas_realgate"); }
  }catch(e){}
})();
function cardV2Active(){ try{ return localStorage.getItem("gas_cardv2")!=="0"; }catch(e){ return true; } }
function gasRealGate(){ try{ return localStorage.getItem("gas_realgate")==="1"; }catch(e){ return false; } }

// ---------- deterministic selection (reuse the site's textSeed/pickCopy) ----------
function v2Seed(){ try{ return String(sellState.sellDecision&&sellState.sellDecision.resultId||sellState.carName||"car"); }catch(e){ return "car"; } }
function v2Pick(arr,tag){ if(!arr||!arr.length)return ""; return arr[textSeed(v2Seed(),tag)%arr.length]; }
function v2Fill(t,slots){ return String(t).replace(/\{(\w+)\}/g,function(_,k){ return slots[k]!=null?slots[k]:""; }); }

// ---------- rung-bound scope ----------
function v2Landed(){ try{ return (sellState.sellDecision&&sellState.sellDecision.evidence&&sellState.sellDecision.evidence.ladder&&sellState.sellDecision.evidence.ladder.landed)||{}; }catch(e){ return {}; } }
function v2GenCode(){ var l=v2Landed(); return (l.generationCode)||(sellState.sellDecision&&sellState.sellDecision.evidence&&sellState.sellDecision.evidence.generation&&sellState.sellDecision.evidence.generation.code)||null; }
function v2RungKind(){ var k=String(v2Landed().key||""); if(/exact_year/.test(k))return "exact"; if(/generation/.test(k))return "generation"; if(/segment/.test(k))return "segment"; if(/make/.test(k))return "make"; return "model"; }
function v2Pl(w){ w=String(w||""); return /([sxz]|ch|sh)$/i.test(w)?w+"es":w+"s"; }
function v2ScopePlural(v){
  var kind=v2RungKind(), model=String(v&&v.model||"car"), gen=v2GenCode(), year=v&&v.year;
  if(kind==="exact"&&year)return year+" "+model+"s";
  if(kind==="generation"&&gen)return String(gen).toUpperCase()+"-generation "+model+"s";
  if(kind==="make")return v2Pl(v&&v.make||"these cars");
  return model+"s";
}
// Attributive-SINGULAR scope: the form used directly before a noun ("... sales",
// "... market", "... prices"). "8N-generation TT sales", not "TTs sales". Same
// landed rung as v2ScopePlural; only the trailing plural drops.
function v2ScopeAttr(v){
  var kind=v2RungKind(), model=String(v&&v.model||"car"), gen=v2GenCode(), year=v&&v.year;
  if(kind==="exact"&&year)return year+" "+model;
  if(kind==="generation"&&gen)return String(gen).toUpperCase()+"-generation "+model;
  if(kind==="make")return String(v&&v.make||"these cars");
  return model;
}
// Item 4: the ONE resolved-car display, used everywhere the car is named (PS
// headline, platform card, metadata tile). Includes the trim when resolved, so
// the summary strip and the card metadata can never disagree.
function v2CarDisplay(v){ v=v||{}; return [v.year,v.make,v.model,v.trim].filter(Boolean).join(" ")||"your car"; }
function v2RungRef(v){
  var kind=v2RungKind(), gen=v2GenCode();
  if(kind==="exact")return "this exact car";
  if(kind==="generation"&&gen)return "the "+String(gen).toUpperCase()+" generation";
  if(kind==="make")return "this make";
  return "the "+[v&&v.make,v&&v.model].filter(Boolean).join(" ")||"model";
}
function v2RungNoun(){ var kind=v2RungKind(); return kind==="generation"?"generation":kind==="segment"?"segment":kind==="make"?"make":"model"; }
// Short landed-rung label for the metadata tile ("2018 M3", "997 Generation",
// "Make level"). Unified with the why-prose scope so the tile and prose can never
// disagree (metadata tile bug: tile read raw v.model while prose read the rung).
// H: display mapping (Aug 2026). exact-year -> "This exact year"; generation ->
// "{GEN} Generation"; make -> "{Make}-wide"; model (default) -> "All {model}s".
// Subtext is always "Analysis scope" (set at the tile render).
function v2RungLabel(v){
  var kind=v2RungKind(), gen=v2GenCode(), model=(v&&v.model)||"", make=(v&&v.make)||"";
  if(kind==="exact")return "This exact year";
  if(kind==="generation"&&gen)return String(gen).toUpperCase()+" Generation";
  if(kind==="make")return make?make+"-wide":"Make-wide";
  return model?"All "+v2Pl(model):"All models";
}
function v2Window(ev){ var p=ev&&ev.pricePremium; return (p&&isFinite(p.windowDays))?Number(p.windowDays):(sellState.sellDecision&&sellState.sellDecision.evidence&&sellState.sellDecision.evidence.windowDays)||90; }
// Window stated in the true unit: the 270-day price rung reads "nine months"; the
// 45/90/180 rungs stay in days. Cascading windows always name the window they used.
function v2WindowLabel(n){ n=Number(n); return n>=270?"nine months":(n+" days"); }

// ---------- mode ----------
function v2Mode(ev){
  var p=ev&&ev.pricePremium; if(!p)return null;
  if(p.type==="premium"&&p.gateType==="symmetric"&&isFinite(p.percent)&&p.percent>=10&&Math.abs(p.percent)<=150)return "modeA";
  if(p.gateType==="symmetric"&&isFinite(p.percent)&&Math.abs(p.percent)<10)return "modeB";
  if(p.type==="market_dominance")return "concentration";
  return null;
}

// ---------- canonical clauses (locked) ----------
function CLAUSE_A(s){ return v2Fill("{scope} have closed {delta}% higher on {platform} than the other platforms I track over the past {window}",s); }
function CLAUSE_B(s){ return v2Fill("prices for {scope} have run close across the platforms I track over the past {window}",s); }
function CLAUSE_C(s){ return v2Fill("recent {scopeAttr} sales have concentrated on {platform}, with too few on other platforms to compare prices over the past {window}",s); }

// Rarity wording is allowed only for cars that are genuinely old or genuinely
// collectible: >25 years old, OR an enthusiast-tier make that actually has
// archive presence (>=1). A modern enthusiast-make sedan with no archive (a 2019
// A6) stays neutral; a Merkur (>25yr) or a 458 (enthusiast + archive) keeps the
// rarity story. Neutral wording is the default for every other thin state.
function v2RarityAllowed(){
  try{
    var v=sellState.resolvedVehicle||(sellState.sellDecision&&sellState.sellDecision.vehicle)||{};
    var yr=Number(v.year);
    if(yr&&((new Date().getFullYear())-yr)>25)return true;
    var count=Number(sellState.archiveModelCount);
    if(typeof makeIsEnthusiast==="function"&&makeIsEnthusiast(v.make)&&isFinite(count)&&count>=1)return true;
    return false;
  }catch(e){ return false; }
}
// ---------- FAMILY A: because line ----------
function v2Because(mode,s){
  var pools={
    modeA:["Because {platform} is where {scope} have consistently delivered the strongest results for cars like yours over the past {window}."],
    modeB:["Because {scopeAttr} prices run close across platforms, and this is where they've been trading.","Because prices are close everywhere, so recent sales decide, and {platform} has the most.","Because {platform} has the most recent {scopeAttr} sales when prices are this close."],
    concentration:["Because recent {scopeAttr} activity has concentrated on {platform}.","Because {platform} is where the {scopeAttr} market actually trades right now.","Because the {scopeAttr} market has gathered on {platform}, where buyers are looking."],
    thin:["Because for a car this uncommon, {platform} reaches the buyers who actually want one.","Because {platform} is where buyers for something this rare tend to look.","Because a car this uncommon needs {platform}'s reach to find its buyer."],
    thinNeutral:["Because recent {scopeAttr} sales are limited, so {platform} is where the few that trade tend to surface.","Because with little recent {scopeAttr} data, {platform} is where I'd start.","Because {platform} holds the recent {scopeAttr} sales I can see."]
  };
  var key=(mode||"thin"); if(key==="thin"&&!v2RarityAllowed())key="thinNeutral";
  return v2Fill(v2Pick(pools[key],"because"),s);
}

// ---------- FAMILY B: why prose ----------
function v2Why(mode,s){
  var a=CLAUSE_A(s), b=CLAUSE_B(s), c=CLAUSE_C(s);
  var pools={
    modeA:[a+".",a+"."],
    modeB:[b+", so the room decides, and {platform} has the most recent {scopeAttr} sales.","Since "+b+", the room decides, and {platform} has the most recent {scopeAttr} sales.",b+". With little to separate them on price, {platform} has the most recent {scopeAttr} sales."],
    concentration:[c+". It's where the market for {rungRef} is actually trading.","Right now, "+c+", so that's where buyers are looking.",c+", which makes it the honest place to meet the market for {rungRef}."],
    thin:["recent sales for {rungRef} are limited, so I ran this at the {rungWord} level. {platform} is where the few that trade tend to surface, and it reaches the buyers who want something this uncommon.","recent sales for {rungRef} are limited, so I ran this at the {rungWord} level. For a car this rare, {platform} is where the patient buyers tend to look.","recent sales for {rungRef} are limited, so I ran this at the {rungWord} level. {platform} reaches the patient buyers who actually want one; treat this as directional."],
    thinNeutral:["recent sales for {rungRef} are limited, so I ran this at the {rungWord} level. {platform} holds the few recent {scopeAttr} sales I can see, so treat this as directional.","recent sales for {rungRef} are limited, so I ran this at the {rungWord} level. {platform} is where those sales have happened; treat this as directional.","recent sales for {rungRef} are limited, so I ran this at the {rungWord} level, and {platform} is where I would start."]
  };
  var key=(mode||"thin"); if(key==="thin"&&!v2RarityAllowed())key="thinNeutral";
  var t=v2Pick(pools[key],"why");
  var out=v2Fill(t,s);
  return out.charAt(0).toUpperCase()+out.slice(1);
}

// ---------- weekday (tiered) ----------
function v2Weekday(ev,v){
  var d=ev&&ev.dayAdvantage; if(!d||!d.weekday||!isFinite(Number(d.liftPercent)))return null;
  var scope=(d.scope==="make")?(v2Pl(v&&v.make||"These cars")+" as a whole"):v2ScopePlural(v);
  var lift=Math.abs(Number(d.liftPercent));
  var total=d.sample!=null?Number(d.sample):null, day=d.sales!=null?Number(d.sales):null;
  var s={scope:scope,day:d.weekday};
  // Tier 1: strong sample + rounded %, band [5,40]
  var t1=(total==null||total>=20)&&(day==null||day>=5);
  if(d.scope!=="make"&&t1){
    var N=Math.round(lift/5)*5;
    if(N>=5&&N<=40){ s.N=N; return { headline:d.weekday, body:v2Fill(v2Pick(["{scope} have closed strongest on {day}s, {N}% above other days over the past year.","If timing's flexible, {scope} have closed strongest on {day}s, {N}% above other days over the past year.","For when to list, {scope} have closed strongest on {day}s, {N}% above other days over the past year."],"weekday"),s) }; }
  }
  // Tier 2: direction only
  var t2=(total==null||total>=12)&&(day==null||day>=3);
  if((t2||d.scope==="make")&&lift>=5&&lift<=60){
    return { headline:d.weekday, body:v2Fill(v2Pick(["{scope} have tended to close strongest on {day}s over the past year.","If timing's flexible, {scope} have tended to close strongest on {day}s over the past year."],"weekday"),s) };
  }
  return null;
}

// ---------- audience (curated share/fit) ----------
function v2Audience(ev){
  var sc=ev&&ev.specializationCell, name=platformDisplayName(ev.label||ev.platform);
  if(sc&&isFinite(Number(sc.lift_rounded))&&sc.scope_label&&Number(sc.lift_rounded)>=2&&Number(sc.lift_rounded)<=25){
    return { headline:"Strong specialist share", body:name+" has built one of the strongest audiences for "+sc.scope_label+"." };
  }
  var line=(typeof platformFitLine==="function")?platformFitLine({label:ev.label,platform:ev.platform}):null;
  if(line)return { headline:"Right buyers", body:line };
  return null;
}

// ---------- reserve (percentage, gated, no dollars) ----------
function v2Reserve(ev){
  var rc=ev&&ev.reserveContext; if(!rc)return null;
  if(!(Number(rc.n_with)>=10&&Number(rc.n_without)>=10))return null;
  var platform=platformDisplayName(ev.label||ev.platform);
  var win="the past "+(rc.window||"three months");
  var pct=Number(rc.delta_pct);
  if(Math.abs(pct)<3){
    return { headline:"Within a few points", body:"Over "+win+", "+platform+" auctions with and without a reserve in your price band averaged within three points of each other.", note:"Whether a reserve suits your car is your call." };
  }
  var dir=pct>=0?"higher":"lower", N=Math.round(Math.abs(pct));
  return { headline:N+"% "+dir, body:"Over "+win+", "+platform+" auctions with a reserve in your price band averaged "+N+"% "+dir+" than those without.", note:"Whether a reserve suits your car is your call." };
}

// ---------- 9-platform muted accent map ----------
var V2_ACCENT={ bringatrailer:"#2F7A40", carsandbids:"#2C6E72", pcarmarket:"#464C57", hemmings:"#7E3A44", hagerty:"#A65A3C", sothebysmotorsport:"#33406A", autohunter:"#96702E", mbmarket:"#3A4A5A", carandclassic:"#5E6B39", collectingcars:"#6E4A6B" };
function v2Accent(slug){ return V2_ACCENT[String(slug||"").toLowerCase()]||"#2F7A40"; }

// ---------- icons ----------
var V2_ICON={
  spark:'<path d="M12 2.6l1.7 5.7 5.7 1.7-5.7 1.7L12 17.4l-1.7-5.7L4.6 10l5.7-1.7z" fill="currentColor"/>',
  win:'<path d="M4 15l5-5 3.5 3.5L20 6M20 6h-4.6M20 6v4.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  close:'<path d="M4 9.5c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0M4 15c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0 3-1.6 4.5 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  car:'<path d="M3.5 13l1.7-4.4A2.2 2.2 0 0 1 7.3 7.2h9.4a2.2 2.2 0 0 1 2.1 1.4L20.5 13m-17 0h17m-17 0v3.6m17-3.6v3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.2" cy="14.9" r="1.4" fill="currentColor"/><circle cx="16.8" cy="14.9" r="1.4" fill="currentColor"/>',
  bars:'<rect x="4" y="13" width="3.4" height="7" rx="1" fill="currentColor"/><rect x="10.3" y="8" width="3.4" height="12" rx="1" fill="currentColor"/><rect x="16.6" y="10.5" width="3.4" height="9.5" rx="1" fill="currentColor"/>',
  cal:'<rect x="4" y="5.5" width="16" height="15" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M8.5 3.5v3.6M15.5 3.5v3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  trend:'<path d="M4 15l5-5 3.5 3.5L20 6M20 6h-4.6M20 6v4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  people:'<circle cx="9" cy="8.5" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.8 19c0-2.8 2.4-4.6 5.2-4.6s5.2 1.8 5.2 4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 6a2.8 2.8 0 0 1 0 5.2M17.6 14.4c2 .5 3.5 2.1 3.5 4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  reserve:'<path d="M12 3l7 2.6v5.2c0 4.3-2.9 7.6-7 9.2-4.1-1.6-7-4.9-7-9.2V5.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8.5v4M9.8 10.7h4.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  send:'<path d="M21 3L10 14M21 3l-6.5 18-4-8.5L2 8.5 21 3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  shield:'<path d="M12 3l7 2.6v5.2c0 4.3-2.9 7.6-7 9.2-4.1-1.6-7-4.9-7-9.2V5.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.3 12l1.9 1.9 3.6-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  info:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 8v5M12 16h.01" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
};
function v2Svg(k,cls){ return '<svg class="'+(cls||"")+'" viewBox="0 0 24 24" aria-hidden="true">'+(V2_ICON[k]||"")+'</svg>'; }

// ---------- THE CARD ----------
function renderPickCardV2(option){
  try{
    var v=sellState.resolvedVehicle||(sellState.sellDecision&&sellState.sellDecision.vehicle)||{};
    var ev=option.marketEvidence||{};
    var slug=option.platformSlug||"";
    var name=platformDisplayName(option.name||slug);
    var mode=v2Mode(ev);
    var win=v2Window(ev);
    var p=ev.pricePremium;
    var slots={ scope:v2ScopePlural(v), scopeAttr:v2ScopeAttr(v), rungRef:v2RungRef(v), rungWord:v2RungNoun(), platform:name, make:v.make||"car", delta:(p&&isFinite(p.percent))?Math.abs(Math.round(p.percent)):"", window:v2WindowLabel(win) };
    var esc=escapeHtml;
    // ---- data bindings (all dynamic) ----
    var loc=[sellState.state,sellState.region].filter(Boolean)[0]||"US";
    var genCode=v2GenCode();
    var genLabel=v2RungLabel(v);
    var winLbl=win<=45?"Last 45 Days":win<=90?"Last 90 Days":win<=180?"Last 180 Days":"Last 270 Days";
    var because=v2Because(mode,slots);
    var why=v2Why(mode,slots);
    // Layout (Aug 2026, item 2b): the concrete evidence clause leads the MAIN
    // column beneath the platform name; the summary "delivered the strongest
    // results" line moves to the right rail under WHY I PICKED THIS (with the
    // leading "Because " dropped and capitalized).
    var leadMain=why;
    var whyRail=String(because).replace(/^because\s+/i,"");
    whyRail=whyRail.charAt(0).toUpperCase()+whyRail.slice(1);
    // Resolved vehicle drives the metadata (year make model), never the "Car"
    // fallback: sellState.carName can be empty at render, so bind from v directly.
    var carLbl=v2CarDisplay(v);
    // ---- two evidence tiles (weekday + reserve; audience fills a slot if needed) ----
    var tiles=[];
    var wk=v2Weekday(ev,v);
    if(wk){ var dA=ev.dayAdvantage||{}; var lift=Math.round(Math.abs(Number(dA.liftPercent))/5)*5; var hasPct=/%/.test(wk.body);
      var wkScope=v2ScopePlural(v);
      tiles.push({l:"Best day to sell",v:wk.headline,s:wkScope+" have closed strongest on "+wk.headline+"s"+(hasPct?(", "+lift+"% above other days."):"."),sc:wkScope+(hasPct?" close "+lift+"% above other days.":" close strongest on "+wk.headline+"s.")}); }
    var rv=v2Reserve(ev);
    if(rv){ var rc=ev.reserveContext||{}; var pct=Number(rc.delta_pct);
      if(Math.abs(pct)<3){ tiles.push({l:"Reserve position",v:"About even",s:"Cars like yours with and without reserves on "+name+" have closed within a few points of each other.",sc:"Reserved and unreserved cars closed within a few points."}); }
      else { var Nr=Math.round(Math.abs(pct)); tiles.push({l:"Reserve position",v:(pct>=0?"+":"-")+Nr+"%",s:"Cars like yours with reserves on "+name+" have closed "+Nr+"% "+(pct>=0?"higher":"lower")+" than those without.",sc:"Reserved cars have closed "+Nr+"% "+(pct>=0?"higher":"lower")+" than those without."}); } }
    if(tiles.length<2){ var au=v2Audience(ev); if(au)tiles.push({l:"Audience",v:au.headline,s:au.body}); }
    tiles=tiles.slice(0,2);
    // Zero stat tiles: the rail simply ends at TRACK RECORD - no empty-state filler
    // tile (the old "The read" tile is deleted). Paired tiles carry a COMPACT
    // support line (<=70 chars) for the side-by-side layout plus the full line for
    // the single/stacked context; CSS shows the right one.
    var tilesHTML=tiles.length
      ? '<div class="pcard-tiles'+(tiles.length===1?' one':'')+'">'+tiles.map(function(t){ return '<div class="pcard-tile"><div class="pcard-tl">'+esc(t.l)+'</div>'+(t.v?'<div class="pcard-tv">'+esc(t.v)+'</div>':'')+'<div class="pcard-ts pcard-ts-c">'+esc(t.sc||t.s)+'</div><div class="pcard-ts pcard-ts-f">'+esc(t.s)+'</div></div>'; }).join("")+'</div>'
      : '';
    // TRACK RECORD, ADAPTIVE SLOT: rendered ONLY in delta mode (modeA), where its
    // consistency claim differs from the WHY's delta claim (concentration/modeB/
    // thin restate the WHY -> suppressed). Exactly one slot per render, chosen by
    // stat-tile count: with stat tiles -> bottom-left under the reassurance; with
    // NO stat tiles -> in the rail beneath the metadata. Never both.
    var trackHTML=(mode==="modeA"&&whyRail)?'<div class="pcard-trackblock"><div class="pcard-whyl">Track Record</div><p class="pcard-why pcard-tracktext">'+esc(whyRail)+'</p></div>':'';
    var trackLeft=(trackHTML&&tiles.length)?trackHTML:'';
    var trackRail=(trackHTML&&!tiles.length)?trackHTML:'';
    var outbound=slug&&typeof hasOutboundSubmission==="function"&&hasOutboundSubmission(slug);
    var ctaOnClick=outbound?("event.stopPropagation();openOutboundModal('"+esc(slug)+"','pick')"):("event.stopPropagation();chooseSellOption('"+esc(option.key)+"')");
    return '<div class="pcard pcard-platform" onclick="chooseSellOption(\''+esc(option.key)+'\')">'
      + '<div class="pcard-left">'
        + '<span class="pcard-badge">+ Sam\'s Pick</span>'
        + '<div class="pcard-script">I\'d sell your '+esc(v.make||"car")+' on</div>'
        + '<h1 class="pcard-name">'+esc(name)+'</h1>'
        + '<div class="pcard-whyl pcard-whyl-main">Why I Picked This</div>'
        + '<p class="pcard-lead">'+esc(leadMain)+'</p>'
        + '<button class="pcard-cta" onclick="'+ctaOnClick+'">Start Listing With '+esc(name)+v2Svg("arrow","cta-arrow")+'</button>'
        + '<div class="pcard-reassure">'+v2Svg("shield")+'<span>You\'ll be taken to '+esc(name)+' to begin your listing. Nothing is committed until you decide to publish.</span></div>'
        + trackLeft
      + '</div>'
      + '<div class="pcard-right">'
        + '<div class="pcard-wordmark">'+esc(name)+'</div>'
        + '<div class="pcard-meta">'
          + '<div class="pcard-mrow">'+psvSvg("pin")+'<div><div class="pcard-mp">'+esc(carLbl)+'</div><div class="pcard-ms">'+esc(loc)+'</div></div></div>'
          + '<div class="pcard-mrow">'+v2Svg("car")+'<div><div class="pcard-mp">'+esc(genLabel)+'</div><div class="pcard-ms">Analysis scope</div></div></div>'
          + '<div class="pcard-mrow">'+v2Svg("cal")+'<div><div class="pcard-mp">'+esc(winLbl)+'</div><div class="pcard-ms">Analysis window</div></div></div>'
        + '</div>'
        + (trackRail?'<div class="pcard-rule"></div>'+trackRail:'')
        + (tilesHTML?'<div class="pcard-ev"><div class="pcard-rule"></div>'+tilesHTML+'</div>':'')
      + '</div>'
      + '</div>';
  }catch(e){ if(typeof console!=="undefined")console.warn("pickCardV2 failed, falling back",e); return null; }
}

// ========================= STAGE 4: FULL V2 RESULT PAGE =========================
// When cardv2 is on, the result page renders ONLY V2 components: the pick hero, an
// optional compact V2 secondary (when the alt genuinely competes), and the V2
// PowerSeller dossier positioned by preference + value. No old alt card, no old
// howS strip, no "Send my details", no "around". Curated strings only.

// ---- PowerSeller field extraction (real data only, never invented) ----
// Person references use display_name; the handle appears ONLY in "Known online as".
// When display_name is stored as "{handle} / {professional name}", the handle
// segment is stripped so the person reference is the professional name.
function psvPartner(){ try{ return (sellState.partnerReferral&&sellState.partnerReferral.partner)||null; }catch(e){ return null; } }
function psvHandle(p){ return String(p.name||"").trim(); }
function psvDisplay(p){
  var d=String(p.displayName||p.name||"this consignor").trim();
  var h=psvHandle(p);
  if(d.indexOf(" / ")>=0){
    var parts=d.split(" / ").map(function(s){return s.trim();}).filter(Boolean);
    if(parts.length>1&&h&&parts[0].toLowerCase()===h.toLowerCase())return parts.slice(1).join(" / ");
    return parts[0];
  }
  return d;
}
function psvFirst(p){ return psvDisplay(p).split(/\s+/)[0]; }
function psvShowKnownAs(p){ var h=psvHandle(p); return !!h&&h.toLowerCase()!==psvDisplay(p).toLowerCase(); }
// House style (item 2c): possessive is always {Name}'s - "Chris's", never "Chris'".
function psvPoss(n){ return String(n||"")+"'s"; }
// Pronoun (item 5): roster-driven, defaults him/his for the current four partners.
function psvPron(p){ var pr=(p&&p.specialties&&p.specialties.pronoun)||{}; return {subj:pr.subj||"he",obj:pr.obj||"him",poss:pr.poss||"his"}; }
// CLAIM SOURCE is the partner's CURATED wheelhouse (true specialty), NEVER the
// broad matching `makes` - which is intentionally wide for the ranking ladder and
// can list marques the partner does not actually specialise in (howS carries Audi,
// Toyota, Land Rover for matching but specialises in air-cooled Porsche + vintage
// Mustangs). Falls back to `makes` only pre-seed so nothing breaks before the SQL.
function psvWheelhouse(p){
  // FAIL-HONEST when the curated wheelhouse is absent (e.g. the roster SQL has not
  // run yet): return empty so no marque/model is claimed and the intro renders
  // brand-free. NEVER fall back to the broad matching `makes` - that is
  // intentionally wide for the ladder and would claim a marque the partner does
  // not actually specialise in (howS carries Audi for matching, not as a claim).
  var wh=(p&&p.specialties&&p.specialties.wheelhouse)||null;
  return {marques:(wh&&wh.marques)||[],models:(wh&&wh.models)||[],display:(wh&&wh.display)||[]};
}
// Match the car against the wheelhouse at MARQUE then MODEL level (item 1e): a
// 1966 Ford Mustang matches Howard's "Vintage Mustangs" model entry even though
// its marque (Ford) is not one Howard claims wholesale.
function psvClaim(p,v){
  var wh=psvWheelhouse(p);
  var carMake=String((v&&v.make)||"").toLowerCase(), carModel=String((v&&v.model)||"").toLowerCase();
  for(var i=0;i<wh.marques.length;i++){ if(carMake&&String(wh.marques[i]).toLowerCase()===carMake)return {level:"marque",label:wh.marques[i]}; }
  for(var j=0;j<wh.models.length;j++){ var m=wh.models[j]||{}; if(carModel&&String(m.model||"").toLowerCase()===carModel&&(!m.make||String(m.make).toLowerCase()===carMake))return {level:"model",label:m.label||m.model}; }
  return null;
}
// The honest wheelhouse list for the tile when the car is out of wheelhouse.
function psvWheelhouseList(p){
  var wh=psvWheelhouse(p);
  if(wh.display&&wh.display.length)return psvHonestList(wh.display);
  var list=wh.marques.concat(wh.models.map(function(m){return m.label||m.model;}));
  return list.length?psvHonestList(list):"";
}
// Item 4: the tile shows a SUBSET of roster truth - the first three entries, with
// "unusual automotive items" (roster-true, wrong register for a specialty tile)
// excluded. The full list stays in the data.
function psvHonestList(entries){
  return (entries||[]).map(function(s){return String(s).trim();}).filter(Boolean)
    .filter(function(s){return !/^unusual automotive items$/i.test(s);})
    .slice(0,3).join(", ");
}
// The car's state IF it is genuinely in the partner's roster regions (locality
// match, roster-truth). Excludes "nationwide". Returns the display state or null.
function psvLocalityState(p){
  var st=""; try{ st=(sellState&&sellState.state)||""; }catch(e){}
  if(!st||/^not sure$/i.test(st))return null;
  var sl=String(st).toLowerCase();
  var regions=((p&&p.regions)||[]).map(function(r){return String(r).toLowerCase();}).filter(function(r){return r&&r!=="nationwide";});
  for(var i=0;i<regions.length;i++){ if(regions[i]===sl||regions[i].indexOf(sl)>=0||sl.indexOf(regions[i])>=0)return st; }
  return null;
}
// A curated one-sentence roster hook, woven into the locality/nationwide intros.
// Roster-sourced (never composed); a missing hook drops the sentence gracefully.
function psvIntroHook(p){ return String((p&&p.specialties&&p.specialties.intro_hook)||"").trim(); }
// PS intro ALWAYS carries the true reason for the match (locked copy by match
// type): (a) marque/model the partner specialises in; (b) locality when the car's
// state is in the partner's roster regions; (c) nationwide otherwise. The locality
// and nationwide intros weave in the partner's intro_hook. Pronoun-threaded; no dashes.
function psvIntro(p,first,claim,carShort){
  var pron=psvPron(p);
  if(claim){
    var verb=claim.level==="marque"?"is":"are";
    return claim.label+" "+verb+" one of "+psvPoss(first)+" strongest areas. For this "+carShort+", I'd trust "+pron.obj+" to choose the right platform, present it professionally and manage the sale from start to finish.";
  }
  var hook=psvIntroHook(p); var hookPart=hook?(" "+hook):"";
  var tail=" I'd trust "+pron.obj+" to run the whole sale, from choosing the platform to the final paperwork.";
  var locState=psvLocalityState(p);
  if(locState){
    return "Your "+carShort+" is in "+locState+", right in "+psvPoss(first)+" patch."+hookPart+tail;
  }
  return first+" works with sellers across the country."+hookPart+tail;
}
// SPECIALISES IN tile: the matched marque/model label; else the honest full
// wheelhouse (marques + model labels); else the notes-level specialty for a
// generalist with no marque wheelhouse (e.g. Ingo's "Collector and specialty
// vehicles"). Never a single non-matching marque.
function psvSpecTile(p,v){
  var claim=psvClaim(p,v);
  if(claim)return claim.label;
  var list=psvWheelhouseList(p);
  if(list)return list;
  // Fallback (generalist, or pre-seed with no wheelhouse): the FULL notes-level
  // specialty - never the first token alone, so a multi-marque partner shows his
  // whole honest list ("BMW, Porsche, ...") rather than a single non-matching
  // marque. Fail-honest: never surface a fee figure or an unfilled {placeholder}.
  var notes=String((p&&p.specialties&&p.specialties.notes)||"").replace(/\s*\(per[^)]*\)\s*$/i,"").trim();
  if(/(\$\s?\d|\d+(?:\.\d+)?\s?%|\{)/.test(notes))return "";
  return psvHonestList(notes.split(","));
}
function psvMakePlural(make){ try{ return (typeof pluralizeMake==="function")?pluralizeMake(make):(v2Pl(make)); }catch(e){ return v2Pl(make||"cars"); } }
function psvTrophy(p){
  var pool=[].concat((p.specialties&&p.specialties.profile_stats||[]).map(function(s){return s&&s.text;}),
                     (p.serviceClaims||[]).map(function(s){return s&&s.text;})).filter(Boolean);
  for(var i=0;i<pool.length;i++){ var m=/(\d[\d,]*)\s*\+?\s*(?:[a-z]+\s+)?(?:listings|auctions)/i.exec(pool[i]); if(m)return m[1].replace(/,/g,"")+"+"; }
  return null;
}
function psvSpecialtyShort(p){
  var notes=String((p.specialties&&p.specialties.notes)||"").replace(/\s*\(per[^)]*\)\s*$/i,"").trim();
  if(notes)return notes.split(",")[0].trim();
  return "";
}
// Trust claims from profile_stats that psvTrophy did not consume (i.e. not the
// auctions/listings total). Rendered as attributed track-record lines.
function psvTrustLines(p){
  var stats=(p.specialties&&p.specialties.profile_stats)||[];
  return stats.map(function(s){return s&&s.text;}).filter(Boolean).filter(function(t){
    // Never render the auctions total (that is the trophy tile) NOR any string
    // carrying an unfilled {placeholder} (item 3a): a half-composed line must
    // never reach a card.
    return !/(\d[\d,]*)\s*\+?\s*(?:[a-z]+\s+)?(?:listings|auctions)/i.test(t) && !/\{[^}]+\}/.test(t);
  }).slice(0,1);   // one line only (top-ranked trust fact); the rest stay in data.
}
var PSV2_STATES={al:"Alabama",ak:"Alaska",az:"Arizona",ar:"Arkansas",ca:"California",co:"Colorado",ct:"Connecticut",de:"Delaware",fl:"Florida",ga:"Georgia",hi:"Hawaii",id:"Idaho",il:"Illinois",in:"Indiana",ia:"Iowa",ks:"Kansas",ky:"Kentucky",la:"Louisiana",me:"Maine",md:"Maryland",ma:"Massachusetts",mi:"Michigan",mn:"Minnesota",ms:"Mississippi",mo:"Missouri",mt:"Montana",ne:"Nebraska",nv:"Nevada",nh:"New Hampshire",nj:"New Jersey",nm:"New Mexico",ny:"New York",nc:"North Carolina",nd:"North Dakota",oh:"Ohio",ok:"Oklahoma",or:"Oregon",pa:"Pennsylvania",ri:"Rhode Island",sc:"South Carolina",sd:"South Dakota",tn:"Tennessee",tx:"Texas",ut:"Utah",vt:"Vermont",va:"Virginia",wa:"Washington",wv:"West Virginia",wi:"Wisconsin",wy:"Wyoming"};
// Location, STATE-LEVEL only: parse the "Based in ..." claim, resolve to a state name.
function psvLocation(p){
  var pool=(p.serviceClaims||[]).map(function(s){return s&&s.text;}).filter(Boolean);
  var based="";
  for(var i=0;i<pool.length;i++){ var m=/Based in ([^,.;]+)/i.exec(pool[i]); if(m){ based=m[1].trim(); break; } }
  if(!based)return "";
  var full=Object.keys(PSV2_STATES).map(function(k){return PSV2_STATES[k];});
  for(var j=0;j<full.length;j++){ if(new RegExp("\\b"+full[j]+"\\b","i").test(based))return full[j]; }
  var ab=/\b([A-Za-z]{2})\b\s*$/.exec(based); // trailing 2-letter code, e.g. "Upper Makefield PA"
  if(ab&&PSV2_STATES[ab[1].toLowerCase()])return PSV2_STATES[ab[1].toLowerCase()];
  return based;
}
function psvCoverage(p){
  // Prefer an explicit "Serves ..." service claim (item 7 roster copy) over the
  // regions-derived fallback, so "Serves Louisiana, Mississippi, ..." renders as
  // written even when the partner also carries "Nationwide" for matching.
  var pool=(p.serviceClaims||[]).map(function(s){return s&&s.text;}).filter(Boolean);
  for(var i=0;i<pool.length;i++){ var m=/^\s*(Serves .+?)\s*$/i.exec(pool[i]); if(m)return m[1]; }
  var regions=(p.regions||[]).map(function(r){return String(r).toLowerCase();});
  if(regions.indexOf("nationwide")>=0)return "Works nationwide";
  var first=(p.regions||[]).find(function(r){return String(r).toLowerCase()!=="nationwide";});
  return first?("Serves "+first):"";
}
// Preparation/service tile (item 7): the first service claim that is neither the
// "Based in ..." location line nor the "Serves ..." coverage line.
function psvPrep(p){
  var pool=(p.serviceClaims||[]).map(function(s){return s&&s.text;}).filter(Boolean);
  for(var i=0;i<pool.length;i++){ var t=pool[i].trim(); if(!/^Based in\b/i.test(t)&&!/^Serves\b/i.test(t))return t.replace(/\s*\(per[^)]*\)\s*$/i,""); }
  return "";
}

// ---- PowerSeller curated copy, match-reason variants (he/him locked) ----
function psvReasonNote(matchType,make,first){
  var m={
    specialty:"Recommended because this "+make+" closely matches "+psvPoss(first)+" strongest area of expertise.",
    region:"Recommended because "+first+" covers your region and takes the whole sale off your plate.",
    generalist:"Recommended because "+psvPoss(first)+" track record covers cars like this across his career."
  };
  return m[matchType]||m.generalist;
}
function psvPara(matchType,make,first,spec,hasRecord){
  var specPhrase=spec?(spec.charAt(0).toLowerCase()+spec.slice(1)):psvMakePlural(make);
  // "has represented hundreds" is a career-volume claim, so it renders only when a
  // tracked auction count backs it; otherwise state the specialty without volume.
  var specOpener=hasRecord
    ?(first+" has represented hundreds of enthusiast cars, and "+specPhrase+" are one of his strongest areas.")
    :(specPhrase.charAt(0).toUpperCase()+specPhrase.slice(1)+" are one of "+psvPoss(first)+" strongest areas.");
  var opener={
    specialty:specOpener,
    region:first+" covers your area and takes on the whole sale himself.",
    generalist:first+" has represented a deep bench of enthusiast cars over his career."
  }[matchType]||"";
  return opener+" For this "+make+", I'd trust him to choose the right platform, present it professionally and manage the sale from start to finish.";
}
function psvWhyBullets(matchType,make,first){
  var lead={
    specialty:psvMakePlural(make)+" are one of "+psvPoss(first)+" strongest areas.",
    region:first+" covers your area and runs the whole sale himself.",
    generalist:first+" has represented a wide range of enthusiast cars over his career."
  }[matchType]||"";
  return [
    lead,
    "He'll settle with you on the auction platform that gives this "+make+" the best shot, rather than assuming one is always right.",
    "He handles everything from photography to paperwork if you'd rather have experienced representation."
  ];
}
// Value-preference line (Stage 4, PENDING APPROVAL). Renders when the card LEADS
// because the seller is unsure and the car's value clears the dial. Declarative,
// no money figure, service framing only (never "gets you more").
function psvValueLine(first){ return "For a car of this value, "+first+" is who I'd hand it to."; }

var PSV2_ICON={
  person:'<circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  trophy:'<path d="M7 4h10v4a5 5 0 0 1-10 0z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7 5H4v1.5A3.5 3.5 0 0 0 7 10M17 5h3v1.5A3.5 3.5 0 0 1 17 10M10 13.5h4M9 20h6M12 13.5V17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  car:V2_ICON.car, pin:'<path d="M12 21s-6.5-5-6.5-10a6.5 6.5 0 0 1 13 0c0 5-6.5 10-6.5 10z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="11" r="2.4" fill="currentColor"/>',
  star:V2_ICON.spark, check:'<path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  clip:'<rect x="5" y="4.5" width="14" height="16.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="9" y="2.8" width="6" height="3.4" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 11h7M8.5 15h5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  cam:'<rect x="3" y="7" width="18" height="13" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 7l1.4-2.4h4.2L15.5 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  chat:'<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  target:'<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  doc:'<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v4h4M9 12h6M9 16h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  hand:'<path d="M3 9l3-2 5 4 2-1M21 9l-3-2-4 3M8.5 11l2.5 2.5a1.6 1.6 0 0 0 2.3 0M11 13.5l2 2a1.5 1.5 0 0 0 2.1 0M6 7v6l-3 1M18 7v6l3 1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  arrow:V2_ICON.arrow, shield:V2_ICON.shield
};
function psvSvg(k,cls){ return '<svg class="'+(cls||"")+'" viewBox="0 0 24 24" aria-hidden="true">'+(PSV2_ICON[k]||"")+'</svg>'; }

// ---- THE POWERSELLER CARD ----
function renderPowerSellerCardV2(opts){
  try{
    var p=psvPartner(); if(!p)return "";
    var referral=sellState.partnerReferral||{};
    var lead=!!(opts&&opts.lead), valueLed=!!(opts&&opts.valueLed);
    var v=sellState.resolvedVehicle||(sellState.sellDecision&&sellState.sellDecision.vehicle)||{};
    var make=v.make||"car";
    var carLabel=v2CarDisplay(v);
    var carShort=[v.make,v.model].filter(Boolean).join(" ")||"car";
    var display=psvDisplay(p), first=psvFirst(p), handle=psvHandle(p);
    var claim=psvClaim(p,v);
    var esc=escapeHtml;
    var trophy=psvTrophy(p), spec=psvSpecTile(p,v), loc=psvLocation(p), cov=psvCoverage(p), prep=psvPrep(p);
    // FIXED tile budget (item 4c): at most 4 tiles, built in KEEP priority so the
    // weakest drops entirely rather than overflowing the card height budget.
    // Order: counts > specialty > location > service (prep) > track-record.
    // Mockup geometry: icon-left tiles (circle icon, then label + value), STACKED
    // one per row down the rail. Helper keeps the markup uniform.
    var tile=function(icon,inner){ return '<div class="pcard-ttile"><span class="pcard-tic">'+psvSvg(icon)+'</span><div class="pcard-tt">'+inner+'</div></div>'; };
    var tiles=[];
    if(trophy)tiles.push(tile("trophy",'<div class="pcard-tnum">'+esc(trophy)+'</div><div class="val">enthusiast auctions represented</div>'));
    if(spec)tiles.push(tile("car",'<div class="lab">Specialises in</div><div class="val green">'+esc(spec)+'</div>'));
    if(loc)tiles.push(tile("pin",'<div class="lab">Based in '+esc(loc)+'</div>'+(cov?'<div class="sub">'+esc(cov)+'</div>':'')));
    if(prep)tiles.push(tile("clip",'<div class="lab">Preparation</div><div class="val">'+esc(prep)+'</div>'));
    // Attributed track-record lines (profile_stats that are not the auctions total,
    // e.g. "Top 10% of all Bring a Trailer sellers"). Lowest priority: drops first.
    var trust=psvTrustLines(p);
    if(trust.length)tiles.push(tile("star",'<div class="lab">Track record</div>'+trust.map(function(x){return '<div class="val">'+esc(x)+'</div>';}).join("")));
    var tstack=tiles.slice(0,4).join("");
    return '<div class="pcard pcard-ps" onclick="choosePowerSeller(\''+esc(p.slug||"partner")+'\')">'
      + '<div class="pcard-left">'
        // Distributed rhythm: hero group anchored top, action group anchored
        // bottom, so the card height is driven by the taller (right-rail) column
        // and the CTA + reassurance always sit at the base regardless of tile count.
        + '<div class="pcard-hero">'
          + '<span class="pcard-badge">+ Sam\'s Recommendation</span>'
          + '<div class="pcard-script">If this were my car,</div>'
          + '<h1 class="pcard-name pcard-name-ps">I\'d ask <span class="pcard-hl">'+esc(display)+'</span> to represent my '+esc(carLabel)+'.</h1>'
          + '<p class="pcard-lead">'+esc(psvIntro(p,first,claim,carShort))+'</p>'
        + '</div>'
        + '<div class="pcard-foot">'
          + '<button class="pcard-cta" onclick="event.stopPropagation();choosePowerSeller(\''+esc(p.slug||"partner")+'\')">Request an Introduction to '+esc(display)+v2Svg("arrow","cta-arrow")+'</button>'
          + '<div class="pcard-reassure">'+psvSvg("shield")+'<span>'+esc(first)+' will contact you directly if you decide to proceed. There is no obligation, and you\'re always in control.</span></div>'
        + '</div>'
      + '</div>'
      + '<div class="pcard-right pcard-right-ps">'
        + (psvShowKnownAs(p)?'<div class="pcard-known">Known online as <b>'+esc(handle)+'</b></div>':'')
        + '<div class="pcard-tstack">'+tstack+'</div>'
      + '</div>'
      + '</div>';
  }catch(e){ if(typeof console!=="undefined")console.warn("psCardV2 failed",e); return ""; }
}

// ---- compact V2 secondary platform (only when the alt genuinely competes) ----
function v2AltCompetes(alt,pick){
  if(!alt||!pick)return false;
  var pm=v2Mode(pick.marketEvidence||{});
  var altEv=alt.marketEvidence||{}; var altSales=Number(altEv.evidenceSales||0);
  if(pm==="modeA")return false;              // clear winner: no runner-up
  if(pm==="modeB")return altSales>=3;        // prices close: the alt is a real option
  var ap=altEv.pricePremium;                 // otherwise only a near-miss that itself cleared a symmetric gate
  return !!(ap&&ap.gateType==="symmetric"&&isFinite(ap.percent)&&ap.percent>=5&&altSales>=5);
}
function renderSecondaryPlatformV2(alt,pick){
  try{
    if(!alt||!pick)return "";
    var pm=v2Mode(pick.marketEvidence||{});
    var altEv=alt.marketEvidence||{}; var altSales=Number(altEv.evidenceSales||0);
    var slug=alt.platformSlug||""; var name=platformDisplayName(alt.name||slug); var esc=escapeHtml;
    // Bug 3: Mode B (prices run close) must NOT spawn a second hero card. When the
    // alt has real depth it surfaces as one inline line under the pick; otherwise
    // nothing. Only a genuine runner-up that itself cleared a symmetric gate earns
    // the compact secondary card.
    if(pm==="modeB"){
      if(altSales<3)return "";
      return '<div class="pv2-inline-alt">Prices run close across platforms, so '+esc(name)+' is also competitive if you\'d rather list there.</div>';
    }
    if(!v2AltCompetes(alt,pick))return "";
    var line="A real second option: recent sales here have stayed competitive.";
    var outbound=slug&&typeof hasOutboundSubmission==="function"&&hasOutboundSubmission(slug);
    var onclick=outbound?("event.stopPropagation();openOutboundModal('"+esc(slug)+"','alt')"):("event.stopPropagation();chooseSellOption('"+esc(alt.key)+"')");
    return '<div class="pv2-sec" style="--pa:'+v2Accent(slug)+'">'
      + '<div class="pv2-sec-main"><div class="pv2-sec-l">Also worth a look</div><div class="pv2-sec-name">'+esc(name)+'</div><div class="pv2-sec-copy">'+esc(line)+'</div></div>'
      + '<button class="pv2-sec-cta" onclick="'+onclick+'">Continue with '+esc(name)+' '+v2Svg("arrow","pv2-sar")+'</button>'
      + '</div>';
  }catch(e){ return ""; }
}

// ---- SHARED COMPOSITION (one source of truth: page + chat context + composers) ----
// Everything that reads "what actually rendered" (the page, the chat context in
// send(), and the curated follow-up composers) derives it here, so they can never
// disagree about the pick, whether a PowerSeller shows/leads, or whether a
// secondary platform card rendered.
function v2Composition(){
  var opts=(sellState.sellOptions||[]).filter(function(o){return o&&o.key!=="specialist";});
  var pick=opts[0]||null, alt=opts[1]||null;
  var referral=sellState.partnerReferral||{};
  var pref=sellState.sellerPreference;
  // Hard gate: every partner is US-based, so a non-US car never shows a PowerSeller.
  var usCar=(typeof isUSRegion==="function")?isUSRegion(sellState.region):(sellState.region==="US");
  var psRendered=!!(usCar&&pref!=="diy"&&referral.partner);
  var psLead=psRendered&&((pref==="powerseller")||(pref==="unsure"&&referral.leadOnValue===true));
  var secondaryRendered=!!(!psLead&&pick&&alt&&typeof renderSecondaryPlatformV2==="function"&&renderSecondaryPlatformV2(alt,pick));
  return { opts:opts, pick:pick, alt:alt, referral:referral, pref:pref, usCar:usCar,
    psRendered:psRendered, psLead:psLead, secondaryRendered:secondaryRendered };
}

// ---- CARD-IDENTICAL FACTS for the pick ----
// Returns the SAME numbers and scope labels the pick card renders (same rounding:
// delta = Math.round(percent); weekday % = Math.round(lift/5)*5; scope =
// v2ScopePlural landed-rung). The chat context and composers quote ONLY these, so
// they can never diverge from the card (17% vs 15%, generation vs model, etc.).
function v2PickFacts(option){
  try{
    if(!option)return null;
    var v=sellState.resolvedVehicle||(sellState.sellDecision&&sellState.sellDecision.vehicle)||{};
    var ev=option.marketEvidence||{};
    var facts={ platform:platformDisplayName(option.name||option.platformSlug||""),
      scope:v2ScopePlural(v), scopeAttr:v2ScopeAttr(v), rungNoun:v2RungNoun(), window:v2WindowLabel(v2Window(ev)), mode:v2Mode(ev) };
    var p=ev.pricePremium;
    if(facts.mode==="modeA"&&p&&isFinite(p.percent))facts.pricePremium={ delta:Math.abs(Math.round(p.percent)), direction:(p.percent>=0?"higher":"lower") };
    var wk=v2Weekday(ev,v);
    if(wk){ var dA=ev.dayAdvantage||{}; var hasPct=/%/.test(wk.body);
      facts.weekday={ day:wk.headline, pct:hasPct?Math.round(Math.abs(Number(dA.liftPercent))/5)*5:null, scope:facts.scope }; }
    var rv=v2Reserve(ev);
    if(rv){ var rc=ev.reserveContext||{}; var rp=Number(rc.delta_pct);
      facts.reserve=Math.abs(rp)<3?{even:true}:{ pct:Math.round(Math.abs(rp)), direction:(rp>=0?"higher":"lower") }; }
    return facts;
  }catch(e){ return null; }
}

// ---- CURATED POST-RESULT COMPOSERS (the two invited follow-ups) ----
// Deterministic, composition-aware, quote v2PickFacts verbatim. They intercept
// BEFORE /api/chat so the chat layer can never contradict the cards on these.
function v2FollowupIntent(q){
  var l=String(q||"").toLowerCase();
  if(/\bhow\b/.test(l)&&/\b(run|running|list|listing|set ?up|approach|start)\b/.test(l)&&/\b(listing|sale|auction|it|this|car)\b/.test(l))return "runlisting";
  if(/\brun the listing\b|\bhow (i|you)'?d run\b|\bhow to (run|list)\b/.test(l))return "runlisting";
  // "what do you recommend" and friends resolve to the rendered recommendation.
  if(/\bwhat do you recommend\b|\bwhat would you do\b|\bwhat'?s your (recommendation|advice|call)\b|\bwhich (should i|would you) (choose|pick|go with|do)\b|\bwhat should i do\b|\bwhat'?s the (best )?(move|play)\b/.test(l))return "recommend";
  if(/\bcompare\b.*\b(option|tradeoff|trade-off|them|the two|both|route|path|door)\b|\btrade-?offs?\b|\bpros and cons\b/.test(l))return "tradeoffs";
  if(/\bwhich (one|is better)\b/.test(l)&&/\b(pick|choose|go with|prefer|better)\b/.test(l))return "tradeoffs";
  return null;
}
// The recommendation IS whatever the page renders: PS-led -> the PowerSeller (with
// the platform as where he'd run it); platform-led -> the platform. Never ranks
// against the page, never re-derives.
function v2ComposeRecommend(){
  try{
    var c=v2Composition(); if(!c.pick)return null;
    var f=v2PickFacts(c.pick); if(!f)return null;
    if(c.psRendered&&c.referral.partner){
      var first=(typeof psvFirst==="function")?psvFirst(c.referral.partner):(c.referral.partner.displayName||c.referral.partner.name||"a PowerSeller");
      if(c.psLead)return "I would hand it to "+first+", and "+f.platform+" is where he would most likely run it. If you would rather keep it in your own hands, "+f.platform+" is the platform I would use.";
      return f.platform+" is where I would sell it, and "+first+" is right there if you would rather have it handled for you.";
    }
    return f.platform+" is where I would sell it.";
  }catch(e){ return null; }
}
function v2ComposeTradeoffs(){
  try{
    var c=v2Composition(); if(!c.pick)return null;
    var f=v2PickFacts(c.pick); if(!f)return null;
    if(c.psRendered){
      // PowerSeller route vs running it yourself on the rendered platform. Framing
      // is effort, control and presentation ONLY: no fee talk, no price claims
      // (locked). Closes on the approved verbatim line.
      var first=(typeof psvFirst==="function"&&c.referral.partner)?psvFirst(c.referral.partner):((c.referral.partner&&(c.referral.partner.displayName||c.referral.partner.name))||"the PowerSeller");
      return "Two real paths, and it comes down to how hands on you want to be. "
        +first+" runs the whole sale for you: photography, the writeup, buyer questions and the auction itself, so your effort is minimal. "
        +"Running it yourself on "+f.platform+" keeps you in full control of the timing and how the car is presented, but the work is yours. "
        +"Well presented listings, with great photography, videos, descriptions, and importantly great answers to all questions can have a significant impact on a listing. That is why I highly recommend the right PowerSeller for the right listing.";
    }
    if(c.secondaryRendered&&f.mode==="modeB"){
      // Prices close: a genuine platform vs platform call.
      var altName=platformDisplayName(c.alt.name||c.alt.platformSlug||"");
      return "With prices running close across the platforms I track, this comes down to reach and recent activity. "
        +f.platform+" holds the most recent "+f.scopeAttr+" sales I track, so it is the surer read. "
        +altName+" is a genuine alternative on price if you would rather list there. "
        +f.platform+" is my call.";
    }
    return null; // one clear pick, nothing to compare: corrected-context chat handles it
  }catch(e){ return null; }
}
function v2ComposeRunListing(){
  try{
    var c=v2Composition(); if(!c.pick)return null;
    var f=v2PickFacts(c.pick); if(!f)return null;
    var v=sellState.resolvedVehicle||(sellState.sellDecision&&sellState.sellDecision.vehicle)||{};
    var carLabel=v2CarDisplay(v);
    var parts=["I would list your "+carLabel+" on "+f.platform+"."];
    if(f.weekday&&f.weekday.pct!=null)parts.push("If your timing is flexible, "+f.weekday.scope+" have closed strongest on "+f.weekday.day+"s, "+f.weekday.pct+"% above other days.");
    else if(f.weekday)parts.push("If your timing is flexible, "+f.weekday.scope+" have tended to close strongest on "+f.weekday.day+"s.");
    parts.push("Lead with honest, well lit photos and a straight writeup of history and condition, and let the platform's audience do the rest.");
    return parts.join(" ");
  }catch(e){ return null; }
}

// ---- OUTPUT GUARD for the open free-text chat path ----
// Checks a raw LLM answer against v2Composition. On a wrong lead, an unshown
// tracked auction platform, a hedged/re-derived number, or internal jargon, it
// replaces the answer with a safe curated fallback so a seller never sees a
// contradiction (or an error/silence). Returns {ok, text}.
var V2_TRACKED_PLATFORMS=["Bring a Trailer","Cars & Bids","PCarMarket","Hagerty"];
function v2SafeFallback(){
  try{
    var c=v2Composition(); if(!c.pick)return "Let me stick to what is on the card. Ask me about the pick or how I would run the listing.";
    var f=v2PickFacts(c.pick); var pickNm=f?f.platform:platformDisplayName(c.pick.name||c.pick.platformSlug);
    if(c.psLead&&c.referral.partner){ var first=(typeof psvFirst==="function")?psvFirst(c.referral.partner):(c.referral.partner.displayName||c.referral.partner.name); return "Let me stick to what is on the card: I would hand it to "+first+", with "+pickNm+" as the platform to run it yourself."; }
    return "Let me stick to what is on the card: the pick is "+pickNm+".";
  }catch(e){ return "Let me stick to what is on the card. Ask me about the pick."; }
}
// The set of actions that ACTUALLY exist, derived from the composition. This is
// the whitelist: continue with {platform} (list it yourself), request an
// introduction to {name} (he contacts you), edit your answers, ask another
// question. Nothing submits, forwards, blasts, queues or auto-lists anything.
function v2ActionFallback(){
  try{
    var c=v2Composition(); var f=c&&c.pick?v2PickFacts(c.pick):null;
    var plat=f?f.platform:(c&&c.pick?platformDisplayName(c.pick.name||c.pick.platformSlug):"the platform");
    if(c&&c.psLead&&c.referral.partner){ var first=(typeof psvFirst==="function")?psvFirst(c.referral.partner):(c.referral.partner.displayName||c.referral.partner.name);
      return "Here is what actually happens. You can request an introduction to "+first+" and he contacts you directly, or continue with "+plat+" to list it yourself. Nothing is sent anywhere until you choose, and you can edit your answers or ask me anything first."; }
    return "Here is what actually happens. You continue with "+plat+" to start your listing yourself, and nothing is sent anywhere until you choose. You can edit your answers or ask me anything first.";
  }catch(e){ return "Nothing is sent anywhere until you choose. You can continue with the pick, edit your answers, or ask me anything."; }
}
// Allowed-actions vocabulary guard: flags any answer describing an action or
// data-flow OUTSIDE the real set. The real actions never submit, forward, share,
// blast, queue or auto-list the seller's details; the only outreach is the
// PowerSeller contacting the seller AFTER an introduction is requested. The
// vocabulary is the whitelist, so these are the flows that fall outside it.
function v2ActionViolation(t){
  var s=String(t||"");
  return [
    /\b(hit|click|press|tap)\s+(the\s+)?submit\b/i,
    /\bsubmit\s+(your|the)\s+(details|info|information|car|listing|form)\b/i,
    /\byour\s+(details|info|information|contact details?)\b[^.?!]*\b(go|are|will be|get|are being|end up)\b[^.?!]*\b(sent|forwarded|shared|passed|to)\b/i,
    /\bwe('| wi)?ll\s+(send|forward|share|pass|submit|list|post|blast|queue)\b/i,
    /\b(forward|send|pass|share|hand over)\s+your\s+(details|info|information|contact)\b/i,
    /\b(blast|auto-?list|list it for you|post it for you|we (list|post) it|list your car for you)\b/i,
    /\b(sent|forwarded|shared)\s+to\s+(multiple|several|other|all|both)\b/i,
    /\bthe platform\s+(will\s+)?(contacts?|reach(es)?\s+out|gets?\s+in touch|be in touch)\b/i,
    /\byour details go to\b/i
  ].some(function(re){ return re.test(s); });
}
// Roster-name rule: a partner's display name or handle may appear in chat ONLY
// when that partner is rendered in the current composition. On empty-composition
// paths (pre-wizard, out-of-scope, or a car with no PowerSeller) NO roster name
// is allowed. Curated roster tokens; add new partners here.
var ROSTER_NAMES=["howS","Howard Silvers","Ingo Schmoldt","Ingo","GenauAutoWerks","Dan Gray","AuthenticAuctions","Chris Carbine","carbine123"];
function v2RosterNameViolation(t){
  try{
    var s=String(t||""); if(!s)return false;
    var allowed=[];
    var c=(typeof v2Composition==="function")?v2Composition():null;
    if(c&&c.psRendered&&c.referral&&c.referral.partner){
      var p=c.referral.partner;
      [p.displayName,p.name,(typeof psvFirst==="function"?psvFirst(p):"")].forEach(function(x){ if(x)allowed.push(String(x).toLowerCase()); });
    }
    for(var i=0;i<ROSTER_NAMES.length;i++){
      var nm=ROSTER_NAMES[i];
      if(new RegExp("\\b"+nm.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b","i").test(s)){
        var okName=allowed.some(function(a){ return a&&(a.indexOf(nm.toLowerCase())>=0||nm.toLowerCase().indexOf(a)>=0); });
        if(!okName)return true; // named a partner that is not the rendered one
      }
    }
    return false;
  }catch(e){ return false; }
}
function v2RosterFallback(){
  try{
    var c=(typeof v2Composition==="function")?v2Composition():null;
    if(c&&c.psRendered&&c.referral&&c.referral.partner){
      var first=(typeof psvFirst==="function")?psvFirst(c.referral.partner):(c.referral.partner.displayName||c.referral.partner.name);
      return "The only specialist I would point you to for this car is "+first+", shown above. I do not name others unless the data points to them.";
    }
    return "I only point to a specific PowerSeller once I have seen your car and the data supports one. Tell me what you are selling and I will take a look.";
  }catch(e){ return "Tell me what you are selling and I will take a look."; }
}
function v2GuardChatAnswer(text){
  try{
    var t=String(text||"");
    if(!t.trim())return { ok:false, text:v2SafeFallback() };
    // Roster-name check runs on EVERY path, including empty composition.
    if(v2RosterNameViolation(t))return { ok:false, text:v2RosterFallback() };
    // FEE FIGURES never render (item 5), on EVERY path (before the composition
    // early-return): a $ or % adjacent to a fee/commission word. Fees change.
    if(/(?:\$\s?\d[\d,]*|\d+(?:\.\d+)?\s?%)[^.]{0,24}\b(fee|fees|commission|commissions|cut|charge|charges|rate|rates)\b/i.test(t)
       ||/\b(fee|fees|commission|commissions|cut|charges?|rate|rates|takes?|charging)\b[^.]{0,24}(?:\$\s?\d[\d,]*|\d+(?:\.\d+)?\s?%)/i.test(t))
      return { ok:false, text:v2SafeFallback() };
    var c=v2Composition(); if(!c||!c.pick)return { ok:true, text:t };
    var f=v2PickFacts(c.pick);
    // 1. internal jargon a seller must never see.
    if(/\b(value gate|threshold|the gate\b|gate (passed|closed|outcome)|gated|composition|landed rung|\brung\b|evidence basis|leadonvalue|segment match|secondary card)\b/i.test(t))return { ok:false, text:v2SafeFallback() };
    // 2. hedged numbers ("around 17%", "~18").
    if(/\b(around|about|roughly|approximately)\s+~?\d|~\s*\d/i.test(t))return { ok:false, text:v2SafeFallback() };
    // 3. re-derived percentages: any N% that is not one of the card's own numbers.
    var allowed={};
    if(f){ if(f.pricePremium)allowed[f.pricePremium.delta]=1; if(f.weekday&&f.weekday.pct!=null)allowed[f.weekday.pct]=1; if(f.reserve&&f.reserve.pct!=null)allowed[f.reserve.pct]=1; }
    var pcts=t.match(/\b(\d{1,3})\s*%/g)||[];
    for(var i=0;i<pcts.length;i++){ var n=Number(String(pcts[i]).replace(/[^\d]/g,"")); if(!allowed[n])return { ok:false, text:v2SafeFallback() }; }
    // 4. an unshown tracked auction platform named as a place to sell/list.
    var pickNm=f?f.platform:platformDisplayName(c.pick.name||c.pick.platformSlug);
    var shown=[pickNm]; if(c.secondaryRendered&&c.alt)shown.push(platformDisplayName(c.alt.name||c.alt.platformSlug));
    for(var j=0;j<V2_TRACKED_PLATFORMS.length;j++){ var p=V2_TRACKED_PLATFORMS[j];
      if(shown.indexOf(p)>=0)continue;
      var pRe=p.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/&/g,"&(?:amp;)?");
      if(new RegExp("\\b(sell|list|go with|use|recommend|pick|choose|start (?:it |the listing )?(?:on|with)|better on)\\b[^.]{0,40}"+pRe,"i").test(t))return { ok:false, text:v2SafeFallback() };
    }
    // 5. wrong lead: PS leads the page but the answer says the recommendation is
    // just the platform / a PowerSeller is only secondary or not recommended.
    if(c.psLead&&/\b(not a powerseller|no powerseller|just (?:the )?platform|only a secondary|isn'?t a powerseller|platform is (?:the|my) recommendation|recommend (?:the )?platform)\b/i.test(t))return { ok:false, text:v2SafeFallback() };
    // 6. an action or data-flow outside the real vocabulary (submit, forward,
    // blast, details-go-to, the platform contacting you) -> the actions fallback.
    if(v2ActionViolation(t))return { ok:false, text:v2ActionFallback() };
    return { ok:true, text:t };
  }catch(e){ return { ok:true, text:String(text||"") }; }
}

// ---- FULL PAGE COMPOSER ----
function renderResultV2Page(){
  try{
    var c=v2Composition();
    var opts=c.opts;
    var pick=c.pick; if(!pick)return null;
    var pickHTML=renderPickCardV2(pick); if(!pickHTML)return null;
    var referral=c.referral;
    var pref=c.pref;
    // PowerSeller composition (value-aware) + hard US gate live in v2Composition.
    var psLead=c.psLead;
    var psHTML="";
    if(c.psRendered){
      var valueLed=(pref==="unsure"&&referral.leadOnValue===true);
      psHTML=renderPowerSellerCardV2({lead:psLead,valueLed:valueLed});
    }
    // Secondary platform only when the alt genuinely competes AND the PS block is
    // not leading (keep one clear axis when the handled door leads).
    var secHTML=psLead?"":renderSecondaryPlatformV2(opts[1],pick);
    var esc=escapeHtml;
    // No heading above the card (approved mockup is the card alone).
    var caveatText=(typeof unverifiedModelNote==="function"&&unverifiedModelNote())||(typeof adverseConditionCaveat==="function"&&adverseConditionCaveat())||"";
    var caveat=caveatText?'<div class="pv2-caveat">'+esc(caveatText)+'</div>':"";
    // Bridge line between the two cards (locked, order-aware): only when BOTH render.
    var bridge="";
    if(psHTML&&pickHTML){
      bridge=psLead
        ? '<div class="pv2-bridge">If you\'d rather run the sale yourself, here\'s where I\'d go.</div>'
        : '<div class="pv2-bridge">Want it handled end to end instead? Here\'s who I\'d trust with it.</div>';
    }
    var body=psLead?(psHTML+bridge+pickHTML+secHTML):(pickHTML+secHTML+bridge+psHTML);
    var after=c.psRendered
      ?'<div class="pv2-after">Both are real options and the choice is yours. Ask me to compare the tradeoffs, or how I\'d run the listing.</div>'
      :'<div class="pv2-after">Ask me anything about the pick, or how I\'d run the listing.</div>';
    return '<div class="pv2-page">'+body+caveat+after+'</div>';
  }catch(e){ if(typeof console!=="undefined")console.warn("renderResultV2Page failed",e); return null; }
}
