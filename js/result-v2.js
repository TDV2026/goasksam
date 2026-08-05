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
    var m=/[?&]cardv2=([01])/.exec(s);
    if(m){ if(m[1]==="1")localStorage.setItem("gas_cardv2","1"); else localStorage.removeItem("gas_cardv2"); }
    // realgate: makes a crew device run the REAL free-first/quota gate on demand,
    // overriding the crew bypass server-side (sent as body.forceGate).
    var g=/[?&]realgate=([01])/.exec(s);
    if(g){ if(g[1]==="1")localStorage.setItem("gas_realgate","1"); else localStorage.removeItem("gas_realgate"); }
  }catch(e){}
})();
function cardV2Active(){ try{ return localStorage.getItem("gas_cardv2")==="1"; }catch(e){ return false; } }
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
function v2RungRef(v){
  var kind=v2RungKind(), gen=v2GenCode();
  if(kind==="exact")return "this exact car";
  if(kind==="generation"&&gen)return "the "+String(gen).toUpperCase()+" generation";
  if(kind==="make")return "this make";
  return "the "+[v&&v.make,v&&v.model].filter(Boolean).join(" ")||"model";
}
function v2RungNoun(){ var kind=v2RungKind(); return kind==="generation"?"generation":kind==="segment"?"segment":kind==="make"?"make":"model"; }
function v2Window(ev){ var p=ev&&ev.pricePremium; return (p&&isFinite(p.windowDays))?Number(p.windowDays):(sellState.sellDecision&&sellState.sellDecision.evidence&&sellState.sellDecision.evidence.windowDays)||90; }

// ---------- mode ----------
function v2Mode(ev){
  var p=ev&&ev.pricePremium; if(!p)return null;
  if(p.type==="premium"&&p.gateType==="symmetric"&&isFinite(p.percent)&&p.percent>=10&&Math.abs(p.percent)<=150)return "modeA";
  if(p.gateType==="symmetric"&&isFinite(p.percent)&&Math.abs(p.percent)<10)return "modeB";
  if(p.type==="market_dominance")return "concentration";
  return null;
}

// ---------- canonical clauses (locked) ----------
function CLAUSE_A(s){ return v2Fill("{scope} have closed {delta}% higher on {platform} than the other platforms I track over the past {window} days",s); }
function CLAUSE_B(s){ return v2Fill("prices for {scope} have run close across the platforms I track over the past {window} days",s); }
function CLAUSE_C(s){ return v2Fill("recent {scope} sales have concentrated on {platform}, with too few on other platforms to compare prices over the past {window} days",s); }

// ---------- FAMILY A: because line ----------
function v2Because(mode,s){
  var pools={
    modeA:["Because {scope} have closed higher there than anywhere else I track.","Because {platform} is where {scope} have been fetching the strongest prices.","Because, of everywhere I track, {scope} have closed highest on {platform}."],
    modeB:["Because {scope} prices run close across platforms, and this is where they've been trading.","Because prices are close everywhere, so recent sales decide, and {platform} has the most.","Because {platform} has the most recent {scope} sales when prices are this close."],
    concentration:["Because recent {scope} activity has concentrated on {platform}.","Because {platform} is where the {scope} market actually trades right now.","Because the {scope} market has gathered on {platform}, where buyers are looking."],
    thin:["Because for a car this uncommon, {platform} reaches the buyers who actually want one.","Because {platform} is where buyers for something this rare tend to look.","Because a car this uncommon needs {platform}'s reach to find its buyer."]
  };
  return v2Fill(v2Pick(pools[mode||"thin"],"because"),s);
}

// ---------- FAMILY B: why prose ----------
function v2Why(mode,s){
  var a=CLAUSE_A(s), b=CLAUSE_B(s), c=CLAUSE_C(s);
  var pools={
    modeA:[a+".","Here's the read: "+a+".",a+". That gap is why I'd start there."],
    modeB:[b+", so the room decides, and {platform} has the most recent {scope} sales.","Since "+b+", the room decides, and {platform} has the most recent {scope} sales.",b+". With little to separate them on price, {platform} has the most recent {scope} sales."],
    concentration:[c+". It's where the market for {rungRef} is actually trading.","Right now, "+c+", so that's where buyers are looking.",c+", which makes it the honest place to meet the market for {rungRef}."],
    thin:["recent sales for {rungRef} are limited, so I ran this at the {rungWord} level. {platform} is where the few that trade tend to surface, and it reaches the buyers who want something this uncommon.","recent sales for {rungRef} are limited, so I ran this at the {rungWord} level. For a car this rare, {platform} is where the patient buyers tend to look.","recent sales for {rungRef} are limited, so I ran this at the {rungWord} level. {platform} reaches the patient buyers who actually want one; treat this as directional."]
  };
  var t=v2Pick(pools[mode||"thin"],"why");
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
    if(N>=5&&N<=40){ s.N=N; return { headline:d.weekday, body:v2Fill(v2Pick(["{scope} have closed strongest on {day}s, {N}% above other days over the past 180 days.","If timing's flexible, {scope} have closed strongest on {day}s, {N}% above other days over the past 180 days.","For when to list, {scope} have closed strongest on {day}s, {N}% above other days over the past 180 days."],"weekday"),s) }; }
  }
  // Tier 2: direction only
  var t2=(total==null||total>=12)&&(day==null||day>=3);
  if((t2||d.scope==="make")&&lift>=5&&lift<=60){
    return { headline:d.weekday, body:v2Fill(v2Pick(["{scope} have tended to close strongest on {day}s over the past 180 days.","If timing's flexible, {scope} have tended to close strongest on {day}s over the past 180 days."],"weekday"),s) };
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
  var month=(typeof reserveMonthName==="function")?reserveMonthName(rc.data_month):"recent months";
  var platform=platformDisplayName(ev.label||ev.platform);
  var pct=Number(rc.delta_pct);
  if(Math.abs(pct)<3){
    return { headline:"Within a few points", body:"In "+month+", "+platform+" auctions with and without a reserve in your price band averaged within three points of each other.", note:"Whether a reserve suits your car is your call." };
  }
  var dir=pct>=0?"higher":"lower", N=Math.round(Math.abs(pct));
  return { headline:N+"% "+dir, body:"In "+month+", "+platform+" auctions with a reserve in your price band averaged "+N+"% "+dir+" than those without.", note:"Whether a reserve suits your car is your call." };
}

// ---------- 9-platform muted accent map ----------
var V2_ACCENT={ bringatrailer:"#2F7A40", carsandbids:"#2C6E72", pcarmarket:"#464C57", hemmings:"#7E3A44", hagerty:"#A65A3C", sothebysmotorsport:"#33406A", autohunter:"#96702E", carandclassic:"#5E6B39", collectingcars:"#6E4A6B" };
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
    var slots={ scope:v2ScopePlural(v), rungRef:v2RungRef(v), rungWord:v2RungNoun(), platform:name, make:v.make||"car", delta:(p&&isFinite(p.percent))?Math.abs(Math.round(p.percent)):"", window:win };
    var esc=escapeHtml;
    // metadata
    var loc=[sellState.state,sellState.region].filter(Boolean)[0]||"US";
    var genCode=v2GenCode();
    var cohort=(v2RungKind()==="generation"&&genCode)?String(genCode).toUpperCase()+" generation":(v2RungKind()==="make"?"Make level":(v.model?v.model+" level":"Model level"));
    var winLbl=win<=45?"Last 45 days":win<=90?"Last 90 days":"Last 180 days";
    // chip
    var chip=mode==="modeA"?'<span class="pv2-mode">'+v2Svg("win")+'Clear price winner</span>':mode==="modeB"?'<span class="pv2-mode">'+v2Svg("close")+'Prices close across platforms</span>':"";
    // evidence sub-cards
    var subs=[];
    var wk=v2Weekday(ev,v); if(wk)subs.push({ic:"cal",l:"Best day to sell",h:wk.headline,b:wk.body});
    var au=v2Audience(ev); if(au)subs.push({ic:"people",l:"Strong audience",h:au.headline,b:au.body});
    var rv=v2Reserve(ev); if(rv)subs.push({ic:"reserve",l:"Reserve position",h:rv.headline,b:rv.body,note:rv.note});
    subs=subs.slice(0,3);
    var evHTML=subs.length?('<div class="pv2-ev pv2-n'+subs.length+'">'+subs.map(function(s){
      return '<div class="pv2-ecard"><span class="pv2-eic">'+v2Svg(s.ic)+'</span><span class="pv2-el">'+esc(s.l)+'</span><span class="pv2-eh">'+esc(s.h)+'</span><span class="pv2-eb">'+esc(s.b)+'</span>'+(s.note?'<span class="pv2-en">'+esc(s.note)+'</span>':'')+'</div>';
    }).join("")+'</div>')
    : '<div class="pv2-empty">'+v2Svg("info")+'<p><b>Not enough recent data for timing, audience, or reserve signals yet.</b> This read stands on the platform match alone.</p></div>';
    var because=v2Because(mode,slots);
    var why=v2Why(mode,slots);
    var outbound=slug&&typeof hasOutboundSubmission==="function"&&hasOutboundSubmission(slug);
    var ctaOnClick=outbound?("event.stopPropagation();openOutboundModal('"+esc(slug)+"','pick')"):("event.stopPropagation();chooseSellOption('"+esc(option.key)+"')");
    return '<div class="pv2-card" style="--pa:'+v2Accent(slug)+'" onclick="chooseSellOption(\''+esc(option.key)+'\')">'
      + '<div class="pv2-top"><span class="pv2-badge">'+v2Svg("spark")+"Sam's Pick</span><span class=\"pv2-mark\">"+esc(name)+'</span></div>'
      + '<div class="pv2-script">I\'d sell your '+esc(v.make||"car")+' on</div>'
      + '<h1 class="pv2-name">'+esc(name)+'</h1>'
      + '<p class="pv2-reason">'+esc(because)+'</p>'
      + chip
      + '<div class="pv2-meta">'
        + '<div class="pv2-mcol">'+v2Svg("car","pv2-mi")+'<div><div class="pv2-mp">'+esc(carDisplayLabel("Car"))+'</div><div class="pv2-ms">'+esc(loc)+'</div></div></div>'
        + '<div class="pv2-mcol">'+v2Svg("bars","pv2-mi")+'<div><div class="pv2-mp">'+esc(cohort)+'</div><div class="pv2-ms">Data analysis</div></div></div>'
        + '<div class="pv2-mcol">'+v2Svg("cal","pv2-mi")+'<div><div class="pv2-mp">'+esc(winLbl)+'</div><div class="pv2-ms">Analysis window</div></div></div>'
      + '</div>'
      + '<div class="pv2-whyh"><span class="pv2-whyic">'+v2Svg("trend")+'</span><span class="pv2-whyl">Why I picked this</span></div>'
      + '<p class="pv2-whyb">'+esc(why)+'</p>'
      + evHTML
      + '<button class="pv2-cta" onclick="'+ctaOnClick+'"><span class="pv2-mid">'+v2Svg("send","pv2-pp")+'Continue with '+esc(name)+'</span><span class="pv2-end">'+v2Svg("arrow","pv2-ar")+'</span></button>'
      + '<div class="pv2-foot">'+v2Svg("shield")+'<div><div class="pv2-f1">This takes you to '+esc(name)+' to complete your listing.</div><div class="pv2-f2">Nothing is committed, and you stay in control.</div></div></div>'
      + '</div>';
  }catch(e){ if(typeof console!=="undefined")console.warn("pickCardV2 failed, falling back",e); return null; }
}
