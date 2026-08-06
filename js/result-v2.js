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
    : '<div class="pv2-empty">'+v2Svg("info")+'<p><b>No standout timing, audience, or reserve signal for '+esc(name)+' yet.</b> This pick stands on the platform match. Those signals are platform-specific, so a thin one here is about '+esc(name)+', not your car.</p></div>';
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

// ========================= STAGE 4: FULL V2 RESULT PAGE =========================
// When cardv2 is on, the result page renders ONLY V2 components: the pick hero, an
// optional compact V2 secondary (when the alt genuinely competes), and the V2
// PowerSeller dossier positioned by preference + value. No old alt card, no old
// howS strip, no "Send my details", no "around". Curated strings only.

// ---- PowerSeller field extraction (real data only, never invented) ----
function psvPartner(){ try{ return (sellState.partnerReferral&&sellState.partnerReferral.partner)||null; }catch(e){ return null; } }
function psvName(p){ var d=String(p.displayName||p.name||"this consignor"); return d.split(" / ")[0].trim()||d; }
function psvFirst(p){ return psvName(p).split(/\s+/)[0]; }
function psvHandle(p){ return String(p.name||psvName(p)); }
function psvPoss(n){ return n+(/s$/i.test(n)?"'":"'s"); }
function psvMakePlural(make){ try{ return (typeof pluralizeMake==="function")?pluralizeMake(make):(v2Pl(make)); }catch(e){ return v2Pl(make||"cars"); } }
function psvTrophy(p){
  var pool=[].concat((p.specialties&&p.specialties.profile_stats||[]).map(function(s){return s&&s.text;}),
                     (p.serviceClaims||[]).map(function(s){return s&&s.text;})).filter(Boolean);
  for(var i=0;i<pool.length;i++){ var m=/(\d[\d,]*)\s*\+?\s*(?:listings|auctions)/i.exec(pool[i]); if(m)return m[1].replace(/,/g,"")+"+"; }
  return null;
}
function psvSpecialtyShort(p){
  var notes=String((p.specialties&&p.specialties.notes)||"").replace(/\s*\(per[^)]*\)\s*$/i,"").trim();
  if(notes)return notes.split(",")[0].trim();
  return "";
}
function psvLocation(p){
  var pool=(p.serviceClaims||[]).map(function(s){return s&&s.text;}).filter(Boolean);
  for(var i=0;i<pool.length;i++){ var m=/Based in ([^,.;]+)/i.exec(pool[i]); if(m)return m[1].trim(); }
  return "";
}
function psvCoverage(p){
  var regions=(p.regions||[]).map(function(r){return String(r).toLowerCase();});
  if(regions.indexOf("nationwide")>=0)return "Works nationwide";
  var first=(p.regions||[]).find(function(r){return String(r).toLowerCase()!=="nationwide";});
  return first?("Serves "+first):"";
}

// ---- PowerSeller curated copy, match-reason variants (he/him locked) ----
function psvReasonNote(matchType,make,first){
  var m={
    specialty:"Recommended because this "+make+" closely matches "+psvPoss(first)+" strongest area of expertise.",
    region:"Recommended because "+first+" covers your region and takes the whole sale off your plate.",
    generalist:"Recommended because "+psvPoss(first)+" track record spans exactly this kind of car."
  };
  return m[matchType]||m.generalist;
}
function psvPara(matchType,make,first){
  var opener={
    specialty:psvMakePlural(make)+" are one of "+psvPoss(first)+" strongest areas.",
    region:first+" covers your area and takes on the entire sale himself.",
    generalist:first+" has represented a deep bench of enthusiast cars over his career."
  }[matchType]||"";
  return opener+" For this "+make+", I'd trust him to choose the right platform, present it professionally and manage the process from start to finish if you'd like experienced representation.";
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
    var carLabel=[v.year,v.make,v.model].filter(Boolean).join(" ")||"car";
    var name=psvName(p), first=psvFirst(p), handle=psvHandle(p);
    var matchType=referral.matchType||"generalist";
    var esc=escapeHtml;
    var trophy=psvTrophy(p), spec=psvSpecialtyShort(p), loc=psvLocation(p), cov=psvCoverage(p);
    // trust blocks (partner_provided -> attributed "per {handle}")
    var trust="";
    if(trophy)trust+='<div class="psv2-tblk"><span class="psv2-tic">'+psvSvg("trophy")+'</span><div><div class="psv2-tp big">'+esc(trophy)+'</div><div class="psv2-ts">enthusiast auctions, per '+esc(handle)+'</div></div></div>';
    if(spec)trust+='<div class="psv2-tblk"><span class="psv2-tic">'+psvSvg("car")+'</span><div><div class="psv2-tp">Specialises in '+esc(spec)+'</div><div class="psv2-ts">his stated focus</div></div></div>';
    if(loc)trust+='<div class="psv2-tblk"><span class="psv2-tic">'+psvSvg("pin")+'</span><div><div class="psv2-tp">Based in '+esc(loc)+'</div>'+(cov?'<div class="psv2-ts">'+esc(cov)+'</div>':'')+'</div></div>';
    var whyB=psvWhyBullets(matchType,make,first).map(function(b){ return '<div class="psv2-wb">'+psvSvg("check")+'<p>'+esc(b)+'</p></div>'; }).join("");
    var svc=[["cam","Photography"],["chat","Buyer communication"],["target","Platform strategy"],["doc","Paperwork and logistics"]]
      .map(function(s){ return '<div class="psv2-sc">'+psvSvg(s[0])+'<span>'+esc(s[1])+'</span></div>'; }).join("");
    var valueLine=(lead&&valueLed)?'<p class="psv2-valline">'+psvSvg("star","psv2-vlic")+esc(psvValueLine(first))+'</p>':"";
    return '<div class="psv2-card" onclick="choosePowerSeller(\''+esc(p.slug||"partner")+'\')">'
      + '<div class="psv2-rowtop"><span class="psv2-badge">'+psvSvg("person")+"Sam's Recommendation</span>"+(handle&&handle!==name?'<span class="psv2-known">Known online as <b>'+esc(handle)+'</b></span>':'')+'</div>'
      + '<div class="psv2-top">'
        + '<div class="psv2-hero">'
          + '<span class="psv2-script">If this were my car</span>'
          + '<h2 class="psv2-name">I\'d ask '+esc(name)+' to represent my '+esc(carLabel)+'.</h2>'
          + '<p class="psv2-para">'+esc(psvPara(matchType,make,first))+'</p>'
          + valueLine
          + '<p class="psv2-recnote">'+esc(psvReasonNote(matchType,make,first))+'</p>'
        + '</div>'
        + (trust?'<div class="psv2-trust">'+trust+'</div>':'')
      + '</div>'
      + '<div class="psv2-why"><div class="psv2-whyh"><span class="psv2-whystar">'+psvSvg("star")+'</span><span class="psv2-whyl">Why '+esc(first)+' is a good match for this '+esc(make)+'</span></div>'+whyB+'</div>'
      + '<div class="psv2-svc"><div class="psv2-svch"><span class="psv2-svcic">'+psvSvg("clip")+'</span><span class="psv2-svcl">What '+esc(first)+' takes care of</span></div><div class="psv2-svcrow">'+svc+'</div></div>'
      + '<button class="psv2-cta" onclick="event.stopPropagation();choosePowerSeller(\''+esc(p.slug||"partner")+'\')"><span class="psv2-mid">'+psvSvg("hand","psv2-hs")+'Request an introduction to '+esc(name)+'</span><span class="psv2-end">'+psvSvg("arrow","psv2-ar")+'</span></button>'
      + '<div class="psv2-foot">'+psvSvg("shield")+'<div><div class="psv2-f1">You\'ll speak directly with '+esc(first)+' before deciding whether you\'d like to move forward.</div><div class="psv2-f2">No obligation. You\'re always in control.</div></div></div>'
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
    if(!v2AltCompetes(alt,pick))return "";
    var slug=alt.platformSlug||""; var name=platformDisplayName(alt.name||slug); var esc=escapeHtml;
    var ev=alt.marketEvidence||{}; var mode=v2Mode(ev);
    var line=mode==="modeB"
      ?"Prices run close, so this is a genuine alternative if you'd rather list here."
      :"A real second option: recent sales here have stayed competitive.";
    var outbound=slug&&typeof hasOutboundSubmission==="function"&&hasOutboundSubmission(slug);
    var onclick=outbound?("event.stopPropagation();openOutboundModal('"+esc(slug)+"','alt')"):("event.stopPropagation();chooseSellOption('"+esc(alt.key)+"')");
    return '<div class="pv2-sec" style="--pa:'+v2Accent(slug)+'">'
      + '<div class="pv2-sec-main"><div class="pv2-sec-l">Also worth a look</div><div class="pv2-sec-name">'+esc(name)+'</div><div class="pv2-sec-copy">'+esc(line)+'</div></div>'
      + '<button class="pv2-sec-cta" onclick="'+onclick+'">Continue with '+esc(name)+' '+v2Svg("arrow","pv2-sar")+'</button>'
      + '</div>';
  }catch(e){ return ""; }
}

// ---- FULL PAGE COMPOSER ----
function renderResultV2Page(){
  try{
    var opts=(sellState.sellOptions||[]).filter(function(o){return o.key!=="specialist";});
    var pick=opts[0]; if(!pick)return null;
    var pickHTML=renderPickCardV2(pick); if(!pickHTML)return null;
    var referral=sellState.partnerReferral||{};
    var pref=sellState.sellerPreference;
    // PowerSeller composition (value-aware). diy: never. else render iff a partner
    // cleared server-side (never stretch a match). Lead when preference is
    // powerseller, or unsure AND value clears the dial.
    var psHTML="", psLead=false;
    if(pref!=="diy"&&referral.partner){
      psLead=(pref==="powerseller")||(pref==="unsure"&&referral.leadOnValue===true);
      var valueLed=(pref==="unsure"&&referral.leadOnValue===true);
      psHTML=renderPowerSellerCardV2({lead:psLead,valueLed:valueLed});
    }
    // Secondary platform only when the alt genuinely competes AND the PS block is
    // not leading (keep one clear axis when the handled door leads).
    var secHTML=psLead?"":renderSecondaryPlatformV2(opts[1],pick);
    var esc=escapeHtml;
    var carLbl=(typeof carDisplayLabel==="function")?carDisplayLabel("your car"):(sellState.carName||"your car");
    var header='<div class="pv2-page-head"><span class="pv2-kicker">Seller Intelligence</span><span class="pv2-cartitle">'+esc(carLbl)+'</span></div>';
    var caveatText=(typeof unverifiedModelNote==="function"&&unverifiedModelNote())||(typeof adverseConditionCaveat==="function"&&adverseConditionCaveat())||"";
    var caveat=caveatText?'<div class="pv2-caveat">'+esc(caveatText)+'</div>':"";
    var body=psLead?(psHTML+pickHTML+secHTML):(pickHTML+secHTML+psHTML);
    var after=referral.partner&&pref!=="diy"
      ?'<div class="pv2-after">Both are real options and the choice is yours. Ask me to compare the tradeoffs, or how I\'d run the listing.</div>'
      :'<div class="pv2-after">Ask me anything about the pick, or how I\'d run the listing.</div>';
    return '<div class="pv2-page">'+header+body+caveat+after+'</div>';
  }catch(e){ if(typeof console!=="undefined")console.warn("renderResultV2Page failed",e); return null; }
}
