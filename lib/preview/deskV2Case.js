// DESK V2, THE OPEN CASE (Lane S, Nov 15 2026): the centre column's browser half. STAGE 2: the compact header, the vehicle summary, the market summary and the Closest sales.
// It draws what the server sent and computes nothing: no median, no sum of money, no sort of prices. The chart's positions are scale only (a dot's place on the axis); every printed figure is a field the server sent.
export const DESK_V2_CASE_JS = String.raw`
var C=D.case,K=C&&C.kase;
if(C){
function g(n){return K&&K.desk&&K.desk[n]}
function ev(){return g("evidence")||{}}
function say(t){var m=$("msg");if(m){m.textContent=t||"";m.hidden=!t}}
var chain=Promise.resolve();
function send(action,x){x=x||{};x.action=action;x.id=D.active;var run=chain.then(function(){return post(x)}).then(function(r){if(r&&r.ok){if(r.case){K=r.case;C.kase=K}if(r.readiness)C.readiness=r.readiness;say("");return r}say((r&&(r.why||r.line))||"That did not save.");return r},function(){say("That did not save. The connection dropped.");return {ok:false}});chain=run.catch(function(){});return run}
function edit(op,x){x=x||{};x.op=op;return send("case_edit",x)}
function tagOf(f){if(!f||f.value==null||f.value===""||f.source==="missing"||f.source==="conflicting")return["needs",C.tags.needs];if(f.verified===true||f.source==="analyst_verified"||f.source==="vin_decoded"||f.source==="records")return["verified",C.tags.verified];return["seller",C.tags.seller]}
// ---------- active time: from the model's activeSeconds, ticking only while this case is open and the tab is showing; the new seconds go to the server in small batches ----------
var clock={base:0,run:0,sent:0,t:null,id:null};
function activeWords(n){n=Math.max(0,Math.floor(n));var h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return "Active "+(h?h+"h "+(m<10?"0":"")+m+"m":m?m+"m "+s+"s":s+"s")}
function clockShow(){var e=$("active");if(e)e.textContent=activeWords(clock.base+clock.run)}
function clockFlush(){var d=clock.run-clock.sent;if(d<1||!clock.id)return;clock.sent=clock.run;post({action:"case_active",id:clock.id,seconds:d}).catch(function(){})}
function clockStop(){if(clock.t){clearInterval(clock.t);clock.t=null}clockFlush()}
function clockStart(){if(clock.id===D.active&&clock.t){clockShow();return}clockStop();clock.id=D.active;clock.base=Number(C.activeSeconds)||0;clock.run=0;clock.sent=0;clockShow();clock.t=setInterval(function(){if(document.visibilityState==="hidden"||D.active!==clock.id)return;clock.run++;clockShow();if(clock.run-clock.sent>=30)clockFlush()},1000)}
window.addEventListener("pagehide",clockFlush);document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")clockFlush()});
// ---------- the compact header ----------
function head(){var h=$("s-head");h.textContent="";
 var top=el("div",{class:"hd"},[el("h1",{class:"ct",id:"ct",text:C.title||""}),el("span",{class:"pill big","data-st":C.statusKey,id:"hpill",text:C.statusLabel||""}),el("span",{class:"act",id:"active",text:activeWords(clock.id===D.active?clock.base+clock.run:(Number(C.activeSeconds)||0))})]);clockStart();
 var meta=el("p",{class:"hm",id:"hmeta"});var bits=[];if(C.seller)bits.push(C.seller);if(C.receivedLine)bits.push(C.receivedLine);if(C.analyst)bits.push(C.analyst);meta.textContent=bits.join(" · ");
 h.appendChild(top);h.appendChild(meta);
 var se=K.sourceEmail,docs=K.documents||[];
 if(se||docs.length){var open=el("button",{type:"button",class:"link",id:"enqlink","aria-expanded":"false",text:"Original enquiry"}),box=el("div",{class:"enq",id:"enq",hidden:""});
  if(se){box.appendChild(se.url?el("a",{href:se.url,target:"_blank",rel:"noopener",text:se.name||""}):el("span",{text:se.name||""}));if(se.line)box.appendChild(el("p",{class:"mute",text:se.line}))}
  if(docs.length){var ul=el("ul",{class:"enqdocs"});docs.forEach(function(d){ul.appendChild(el("li",{text:d.name+(d.kindLabel?" ("+d.kindLabel+")":"")}))});box.appendChild(ul)}
  open.addEventListener("click",function(){var on=box.hidden;box.hidden=!on;open.setAttribute("aria-expanded",on?"true":"false")});h.appendChild(open);h.appendChild(box)}
 var pc=K.priorCases;if(pc&&pc.line){var pr=el("div",{class:"prior",id:"prior"},[el("p",{text:pc.line})]);if(pc.count>0&&(pc.items||[]).length){var ul2=el("ul");pc.items.forEach(function(x){ul2.appendChild(el("li",{},[el("a",{href:D.caseBase+x.id,text:x.title||x.id}),x.status?el("span",{class:"mute",text:" "+x.status}):null]))});pr.appendChild(ul2)}h.appendChild(pr)}}
// ---------- the vehicle summary: the photo, the strip and the fields ----------
function gallery(){var items=(K.photos&&K.photos.items)||[],cover=items.filter(function(p){return p.id===(K.photos&&K.photos.coverId)})[0]||items[0];
 var box=el("div",{class:"gal",id:"gal"});if(!cover){box.appendChild(el("div",{class:"cover none",id:"cover"}));return box}
 var im=el("img",{class:"cover",id:"cover",src:cover.url,alt:""});box.appendChild(im);
 var st=el("div",{class:"strip",id:"pstrip"});items.slice(0,5).forEach(function(p){var t=el("button",{type:"button",class:"pt"+(p.id===cover.id?" on":""),"aria-label":p.name||"Photo"},[el("img",{src:p.url,alt:""})]);t.addEventListener("click",function(){im.src=p.url;[].forEach.call(st.querySelectorAll(".pt"),function(x){x.classList.remove("on")});t.classList.add("on")});st.appendChild(t)});
 if(C.photoMore>0)st.appendChild(el("span",{class:"pt more",id:"pmore",text:"+"+C.photoMore}));box.appendChild(st);return box}
function frow(label,val,tag,key){var r=el("div",{class:"fr","data-field":key||label.toLowerCase()});r.appendChild(el("span",{class:"fl2",text:label}));var v=el("span",{class:"fv",text:val});r.appendChild(v);if(tag)r.appendChild(el("em",{class:"tg","data-tag":tag[0],text:tag[1]}));
 if(key){v.setAttribute("tabindex","0");v.setAttribute("role","button");v.setAttribute("title","Edit");function go(){if(r.querySelector("input"))return;var f=(K.fields||{})[key],inp=el("input",{class:"txt",type:"text",value:f&&f.value!=null?String(f.value):""});v.textContent="";v.appendChild(inp);inp.focus();inp.select();var done=false;function fin(save){if(done)return;done=true;if(save&&inp.value.trim()!==(f&&f.value!=null?String(f.value):"")){edit("field",{field:key,value:inp.value.trim()}).then(function(){redraw()})}else vehicle()}inp.addEventListener("blur",function(){fin(true)});inp.addEventListener("keydown",function(e){if(e.key==="Enter")fin(true);if(e.key==="Escape")fin(false)})}v.addEventListener("click",go);v.addEventListener("keydown",function(e){if(e.key==="Enter")go()})}
 return r}
function vehicle(){var c=$("s-vehicle");c.textContent="";var F=K.fields||{},v=K.vehicle||{},rows=el("div",{class:"frs",id:"frs"});
 function has(x){return x!=null&&x!==""}
 if(F.vin)rows.appendChild(frow("VIN",has(F.vin.value)?String(F.vin.value):"Not given",tagOf(F.vin),"vin"));
 if(g("titleLine"))rows.appendChild(frow("Year, make, model",g("titleLine"),tagOf(F.model||F.make)));
 if(F.generation&&has(F.generation.value))rows.appendChild(frow("Generation",String(F.generation.value),tagOf(F.generation),"generation"));
 if(F.mileage)rows.appendChild(frow("Mileage",has(F.mileage.value)?(v.mileageLine||String(F.mileage.value)):"Not given",tagOf(F.mileage),"mileage"));
 if(F.transmission)rows.appendChild(frow("Transmission",has(F.transmission.value)?String(F.transmission.value):"Not given",tagOf(F.transmission),"transmission"));
 if(g("specLine"))rows.appendChild(frow("Specification",g("specLine"),tagOf(F.trim||F.body)));
 var loc=K.lead&&K.lead.locationLine;if(loc)rows.appendChild(frow("Location",loc,[ "seller",C.tags.seller]));
 if(C.askLine)rows.appendChild(frow("Asking price",C.askLine,["seller",C.tags.seller]));
 if(K.documentsLine)rows.appendChild(frow("Documents",K.documentsLine,null));
 var ob=v.ownBlock;if(ob&&ob.rows&&ob.rows.length){var pr=el("div",{class:"fr","data-field":"auction"},[el("span",{class:"fl2",text:ob.heading||"Prior auction history"})]);var vv=el("span",{class:"fv"});ob.rows.forEach(function(x){vv.appendChild(el("span",{class:"ow",text:typeof x==="string"?x:(x.line||x.text||"")}))});pr.appendChild(vv);rows.appendChild(pr)}
 c.appendChild(el("div",{class:"vs"},[gallery(),rows]))}
// ---------- the market summary: the strip, the lens, the thin line, the chart at half height ----------
var SVGNS="http://www.w3.org/2000/svg";function sv(t,a){var e=document.createElementNS(SVGNS,t);for(var x in a||{})e.setAttribute(x,a[x]);return e}
function cssv(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||"#888"}
function market(){var c=$("s-market");c.textContent="";var e=ev();c.appendChild(el("div",{class:"sec-h"},[el("h3",{text:"What the market paid"}),lens()]));
 var cells=e.strip||[];var strip=el("div",{class:"mstrip",id:"mstrip"});cells.forEach(function(x){strip.appendChild(el("div",{class:"mc"+(x.emphasis?" em":""),"data-cell":x.key},[el("span",{class:"mcl",text:x.label}),el("b",{class:"mcv",text:x.value}),x.note?el("small",{text:x.note}):null]))});c.appendChild(strip);
 [e.sameLine,e.startLine].forEach(function(t){if(t)c.appendChild(el("p",{class:"mline",text:t}))});
 var rl=g("reserveLadder"),tl=rl&&rl.thin===true&&rl.thinLine?rl.thinLine:"";if(tl)c.appendChild(el("p",{class:"thinline",id:"thinline",text:tl}));
 var holder=el("div",{class:"plotw"});c.appendChild(holder);plot(holder)}
function lens(){var seg=el("span",{class:"seg",id:"lens",role:"group","aria-label":"Period"}),e=ev();(g("windows")||[]).forEach(function(w){var b=el("button",{type:"button","data-m":w.months,class:Number(e.windowMonths)===Number(w.months)?"on":"",text:w.label});b.addEventListener("click",function(){if(b.classList.contains("on"))return;c0().classList.add("busy");edit("window",{months:w.months}).then(function(){c0().classList.remove("busy");redraw()})});seg.appendChild(b)});return seg}
function c0(){return $("s-market")}
function isH(x){return !!x&&(x.hagerty===true||String(x.venue||"").toLowerCase()==="hagerty"||x.platform==="Hagerty")}
var H=84,BASE=52;
function plot(holder){var e=ev(),sales=(g("sales")||[]).filter(function(s){return s.price>0});if(!sales.length||e.insufficient){return}
 var W=holder.clientWidth||760,lo=Infinity,hi=-Infinity;sales.forEach(function(s){if(s.price<lo)lo=s.price;if(s.price>hi)hi=s.price});[e.q1,e.q3].forEach(function(v){if(v!=null){if(v<lo)lo=v;if(v>hi)hi=v}});var pad=(hi-lo)*.05||1;lo-=pad;hi+=pad;
 function X(v){return 12+(v-lo)/(hi-lo)*(W-24)}
 var svg=sv("svg",{id:"plot",width:"100%",height:H,viewBox:"0 0 "+W+" "+H,role:"img","aria-label":"Completed sales"});
 if(e.q1!=null&&e.q3!=null)svg.appendChild(sv("rect",{id:"band",x:X(e.q1),y:8,width:X(e.q3)-X(e.q1),height:BASE-4,rx:5,fill:cssv("--ev-soft")}));
 svg.appendChild(sv("line",{x1:12,x2:W-12,y1:BASE+8,y2:BASE+8,stroke:cssv("--line")}));
 if(e.median!=null)svg.appendChild(sv("line",{id:"mline",x1:X(e.median),x2:X(e.median),y1:6,y2:BASE+8,stroke:cssv("--ev"),"stroke-width":1.5}));
 sales.forEach(function(s,i){var d=sv("circle",{cx:X(s.price),cy:BASE-6-((i*7)%22),r:3.4,fill:isH(s)?cssv("--an"):cssv("--ev-dot"),"data-sale":s.id});if(isH(s))d.setAttribute("data-hagerty","1");svg.appendChild(d)});
 holder.appendChild(svg);
 if(e.typicalLine||e.medianLine){holder.appendChild(el("p",{class:"axis",text:[e.typicalLine&&("Typical range "+e.typicalLine),e.medianLine&&("Median "+e.medianLine)].filter(Boolean).join(" · ")}))}}
// ---------- Closest sales: the first four as compact cards, View all for the rest ----------
var showAll=false;
function exclOf(c){var x=(K.exclusions||[]).filter(function(e){return String(e.saleId)===String(c.id)})[0];return c.exclusion||x||null}
function inRep(c){return (K.selectedComparables||[]).map(String).indexOf(String(c.id))>=0}
function card(c){var ex=exclOf(c),why=c.whyLine||c.why,box=el("article",{class:"sc"+(ex?" ex":"")+(isH(c)?" hag":""),"data-sale":c.id});
 var ph=c.photo?el("img",{class:"sph",src:c.photo,alt:""}):el("div",{class:"sph none"});box.appendChild(ph);
 var body=el("div",{class:"sb"});body.appendChild(el("div",{class:"sp"},[el("b",{class:"spr",text:c.priceLine||""}),c.url?el("a",{class:"slink",href:c.url,target:"_blank",rel:"noopener","aria-label":"Open the listing",text:"Listing"}):null]));
 body.appendChild(el("div",{class:"stt",text:c.title||""}));
 body.appendChild(el("div",{class:"sm",text:[c.milesLine,[c.platform,c.dateLine].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}));
 if(isH(c))body.appendChild(el("span",{class:"hmark",text:"Hagerty"}));
 if(why)body.appendChild(el("p",{class:"sw",text:why}));
 if(ex){body.appendChild(el("p",{class:"sx",text:"Excluded: "+(ex.reason||"")}));var rb=el("button",{type:"button",class:"btn sm","data-restore":c.id,text:"Restore"});rb.addEventListener("click",function(){edit("restore",{saleId:String(c.id)}).then(function(){redraw()})});body.appendChild(rb)}
 else{var act=el("div",{class:"sa"}),lab=el("label",{class:"inr"}),cb=el("input",{type:"checkbox","data-tick":c.id});cb.checked=inRep(c);cb.addEventListener("change",function(){var ids=(K.selectedComparables||[]).map(String),i=ids.indexOf(String(c.id));if(cb.checked&&i<0)ids.push(String(c.id));else if(!cb.checked&&i>=0)ids.splice(i,1);K.selectedComparables=ids;edit("comparables",{ids:ids}).then(function(){redraw()})});lab.appendChild(cb);lab.appendChild(el("span",{text:"In report"}));act.appendChild(lab);
  var xb=el("button",{type:"button",class:"btn sm","data-exclude":c.id,text:"Exclude"}),form=el("div",{class:"xf",hidden:""},[el("input",{class:"txt","data-reason":c.id,type:"text",placeholder:"Why exclude this sale",autocomplete:"off","aria-label":"Reason"}),el("button",{type:"button",class:"btn sm pri","data-confirm":c.id,text:"Exclude"})]);
  function sub(){var inp=form.querySelector("input"),why2=inp.value.trim();if(!why2){inp.placeholder="Say why first";inp.focus();return}edit("exclude",{saleId:String(c.id),scope:"market_calc",reason:why2}).then(function(r){if(r&&r.ok){redraw()}})}
  xb.addEventListener("click",function(){form.hidden=!form.hidden;if(!form.hidden)form.querySelector("input").focus()});form.querySelector("button").addEventListener("click",sub);form.querySelector("input").addEventListener("keydown",function(e){if(e.key==="Enter")sub()});
  act.appendChild(xb);body.appendChild(act);body.appendChild(form)}
 box.appendChild(body);return box}
function closest(){var c=$("s-closest");c.textContent="";var list=g("comparables")||[],ordered=list.filter(isH).concat(list.filter(function(x){return !isH(x)})),n=g("comparablesCount")!=null?g("comparablesCount"):list.length;
 var h=el("div",{class:"sec-h"},[el("h3",{text:"Closest sales"})]);
 if(n>4){var all=el("button",{type:"button",class:"link",id:"viewall","aria-expanded":showAll?"true":"false",text:showAll?"Show fewer":"View all "+n+" sales"});all.addEventListener("click",function(){showAll=!showAll;closest()});h.appendChild(all)}c.appendChild(h);
 if(!ordered.length){if(g("comparablesNote"))c.appendChild(el("p",{class:"mute",text:g("comparablesNote")}));return}
 var grid=el("div",{class:"sgrid",id:"sgrid"});(showAll?ordered:ordered.slice(0,4)).forEach(function(x){grid.appendChild(card(x))});c.appendChild(grid)}
head();vehicle();market();closest();
// ---------- STAGE 3, the right rail (sticky): condition, the market's range, the reserve, the ladder, the why, outstanding checks, then the three buttons ----------
var CONDS=["Concours","Excellent","Good","Fair"],pickedCond=null,SAID={mileage_unconfirmed:"mileage",accident_unclear:"accident_history",service_documents:"service_history"};
function same(a,b){return String(a).toLowerCase()===String(b).toLowerCase()}
function cname(v){return v==null?"":typeof v==="string"?v:(v.name||"")}
function carCond(){var c=K.condition;return c?cname(c.chosen):""}
function tierOf(n){var r=(g("rungs")||[]).filter(function(x){return same(x.name,n)})[0];return r?r.tier:CONDS.indexOf(n)+1}
function sect(id,cls){var d=el("section",{class:"rs "+(cls||""),id:id});return d}
function condP(){var b=$("rcond");b.textContent="";var c=K.condition||{},cur=carCond();
 b.appendChild(el("div",{class:"rh"},[el("h3",{text:"Condition of this car"}),el("span",{class:"cfig"+(cur?"":" unset"),id:"cfig",text:cur||"Not yet set"})]));
 if(c.line)b.appendChild(el("p",{class:"rn",id:"cline",text:c.line}));
 var bx=el("div",{class:"cbtns",id:"cbtns",role:"group","aria-label":"Condition"});CONDS.forEach(function(n){var on=same(n,cur);var bt=el("button",{type:"button","data-cond":n,"aria-pressed":on?"true":"false",class:on?"on":(pickedCond&&same(n,pickedCond)?"pick":""),text:n});bt.addEventListener("click",function(){pickedCond=same(n,cur)?null:n;condP()});bx.appendChild(bt)});b.appendChild(bx);
 var ni=el("input",{class:"txt",id:"cnoteIn",type:"text",autocomplete:"off",placeholder:"Why this condition","aria-label":"Condition note",value:c.source==="analyst"&&c.note?c.note:""});b.appendChild(ni);
 var sv2=el("button",{type:"button",class:"btn sm pri",id:"csave",text:"Save"});sv2.disabled=true;function sync(){sv2.disabled=!(pickedCond&&ni.value.trim())}ni.addEventListener("input",sync);sync();
 var msg=el("p",{class:"msg",id:"cmsg",hidden:""});
 sv2.addEventListener("click",function(){var t=ni.value.trim();if(!pickedCond||!t)return;sv2.disabled=true;send("condition_set",{condition:tierOf(pickedCond),note:t}).then(function(r){if(r&&r.ok){pickedCond=null;redraw()}else{msg.textContent=(r&&(r.why||r.line))||"That did not save.";msg.hidden=false;sync()}})});
 b.appendChild(sv2);b.appendChild(msg);if(c.effectLine)b.appendChild(el("p",{class:"thinline",id:"ceffect",text:c.effectLine}))}
function rangeP(){var b=$("rrange");b.textContent="";var e=ev();if(!e.typicalLine||e.insufficient)return;b.appendChild(el("span",{class:"rl",text:"Market range"+(e.countLine?", "+e.countLine:"")}));b.appendChild(el("b",{class:"rv num",id:"rrv",text:e.typicalLine}))}
function lstate(){var lad=g("reserveLadder");lad=lad&&Array.isArray(lad.rungs)&&lad.rungs.length?lad:null;var key=lad?((K.reserveChoice&&K.reserveChoice.key)||lad.recommended||null):null,rung=lad&&key?lad.rungs.filter(function(r){return r.key===key})[0]||null:null;return{lad:lad,key:rung?key:null,rung:rung,on:!!rung}}
function reserveP(){var b=$("rres");b.textContent="";var r=K.reserve||{},ls=lstate();
 var fig=ls.on?(ls.key==="noReserve"?"No reserve":(ls.rung.figureLine||r.figureLine||"")):(r.figureLine||"");
 b.appendChild(el("span",{class:"rl",text:"Recommended reserve"}));if(fig)b.appendChild(el("b",{class:"rfig num",id:"rfig",text:fig}));
 var why=ls.on&&ls.lad.reason?ls.lad.reason:[r.reachedLine,r.positionLine].filter(Boolean).join(" ");if(why)b.appendChild(el("p",{class:"rn",id:"lreason",text:why}));
 var nl=g("likely")&&g("likely").nearestLine;if(nl)b.appendChild(el("p",{class:"rn",id:"nearestLine",text:nl}))}
function ladderP(){var b=$("rlad");b.textContent="";var ls=lstate();if(!ls.lad)return;var keys=((K.report&&K.report.rungs&&K.report.rungs.keys)||[]).map(String);
 ls.lad.rungs.forEach(function(r){var avail=r.available!==false,use=ls.key===r.key,row=el("div",{class:"lrow"+(use?" use":"")+(avail?"":" off"),"data-rung":r.key});
  if(avail){var cb=el("input",{type:"checkbox","data-tick":r.key,"aria-label":"Include in the report"});cb.checked=use||keys.indexOf(r.key)>=0;cb.disabled=use;cb.addEventListener("change",function(){var ks=[].filter.call(b.querySelectorAll("[data-tick]"),function(c){return c.checked}).map(function(c){return c.getAttribute("data-tick")});send("report_rungs_set",{keys:ks})});row.appendChild(cb)}else row.appendChild(el("span"));
  row.appendChild(el("b",{class:"lfg num",text:r.key==="noReserve"?"No reserve":(r.figureLine||"")}));row.appendChild(el("span",{class:"lln",text:r.line||""}));
  if(avail){if(use)row.appendChild(el("span",{class:"luse on",text:"In use"}));else{var ub=el("button",{type:"button",class:"link luse","data-use":r.key,text:"Use"});ub.addEventListener("click",function(){send("reserve_use",{key:r.key}).then(function(x){if(x&&x.ok)redraw()})});row.appendChild(ub)}}
  b.appendChild(row)})}
var whyT=null;
function whyP(){var b=$("rwhy");var ta=b.querySelector("textarea");var r=K.reserve||{};if(ta){if(document.activeElement!==ta)ta.value=r.why||"";return}
 b.appendChild(el("label",{for:"why",class:"rl",text:"Printed in the report"}));ta=el("textarea",{id:"why",rows:"3","aria-label":"Why, printed in the report"});ta.value=r.why||"";
 ta.addEventListener("input",function(){var t=ta.value;clearTimeout(whyT);whyT=setTimeout(function(){edit("reserve",{patch:{why:t}}).then(function(){footP()})},500)});b.appendChild(ta)}
function readFile(f){return new Promise(function(res){var r=new FileReader();r.onload=function(){res(String(r.result).split(",").pop())};r.readAsDataURL(f)})}
function needsP(){var b=$("rneeds");b.textContent="";var list=K.needs_review||[],open=list.filter(function(n){return n.state==="open"});if(!list.length)return;
 b.appendChild(el("h3",{class:"rh2",text:"Outstanding checks"+(open.length?" ("+open.length+")":"")}));
 list.forEach(function(n){var row=el("div",{class:"nd"+(n.state==="open"?" need":" done"),"data-need":n.id});
  if(n.state!=="open"){row.appendChild(el("span",{text:n.label+(n.state==="waived"&&n.reason?" (waived: "+n.reason+")":"")}));b.appendChild(row);return}
  row.appendChild(el("span",{class:"nl",text:n.label}));
  var sf=SAID[n.id],held=sf?((K.fields||{})[sf]||{}).value:null,empty=!!sf&&(held==null||held===""),st=el("input",{class:"txt nstate","data-statement":n.id,autocomplete:"off",placeholder:empty?"What the seller said, or why you proceed":"Why you proceed without it","aria-label":"Statement for "+n.label}),nm=el("p",{class:"msg nmsg","data-nmsg":n.id,role:"alert",hidden:""}),bt=el("div",{class:"nb"});
  function say2(action,more,btn){var body={item:n.id,words:st.value.trim()};for(var k in more||{})body[k]=more[k];nm.hidden=true;nm.textContent="";send(action,body).then(function(r){if(r&&r.ok===false){nm.textContent=r.why||r.line||"That did not save.";nm.hidden=!nm.textContent;return}redraw()})}
  function add(label,act,fn){var x=el("button",{type:"button",class:"btn sm","data-act":act,text:label});x.addEventListener("click",fn);bt.appendChild(x)}
  if(n.id==="mileage_unconfirmed")add("Verify from photo","verify",function(){say2("mark_verified",{field:"mileage"})});
  if(n.id==="accident_unclear")add("Mark verified","verify",function(){say2("mark_verified",{field:"accident_history"})});
  if(n.id==="service_documents")add("Received","doc",function(){var pk=document.createElement("input");pk.type="file";pk.accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic";pk.onchange=function(){var f=pk.files[0];if(!f)return;readFile(f).then(function(d){return edit("doc_add",{kind:"invoice",title:f.name.replace(/\.[^.]+$/,""),name:f.name,data:d})}).then(function(r){if(r&&r.ok===false){nm.textContent=r.why||r.line||"";nm.hidden=!nm.textContent}else redraw()})};pk.click()});
  if(empty)add("Seller states","state",function(){say2("seller_said",{field:sf})});
  add("Proceed without","waive",function(){say2("proceed_without")});
  row.appendChild(st);row.appendChild(bt);row.appendChild(nm);b.appendChild(row)})}
function readyNow(){var R=C.readiness||{ready:false};return R.ready===true}
function footP(){var b=$("rfoot");b.textContent="";var R=C.readiness||{ready:false,blockers:[]},fin=K.status==="finalized",lines=(R.checks&&R.checks.length?R.checks:K.checks)||[];
 var row=el("div",{class:"btns"});var pv=el("button",{type:"button",class:"btn",id:"bPrev",text:"Preview report"}),sd=el("button",{type:"button",class:"btn",id:"bDraft",text:"Save draft"}),fz=el("button",{type:"button",class:"btn pri",id:"bFin",text:"Finalize and send"});
 fz.disabled=!R.ready&&!fin;row.appendChild(pv);row.appendChild(sd);row.appendChild(fz);b.appendChild(row);
 var hint=fin?"":(R.hint||K.finalizeHint||"");if(!R.ready&&!fin){(lines.filter(function(l){return l.ok===false}).length?lines.filter(function(l){return l.ok===false}):[]).forEach(function(l){b.appendChild(el("p",{class:"fhint","data-key":l.key,text:l.line||""}))});if(hint)b.appendChild(el("small",{id:"finHint",text:hint}))}
 if(fin)b.appendChild(el("p",{class:"fhint ok",id:"finBox",text:"Finalized as version "+K.version+". Locked."}));
 var h=K.handling||{},sent=(h.sentLines&&h.sentLines.length?h.sentLines:(h.sentLine?[h.sentLine]:[]));sent.forEach(function(t){b.appendChild(el("p",{class:"fhint ok","data-sent":"1",text:t}))});
 pv.addEventListener("click",preview);
 sd.addEventListener("click",function(){clearTimeout(whyT);var ta=$("why"),t=ta?ta.value:null;var p=t!=null?edit("reserve",{patch:{why:t}}):Promise.resolve({ok:true});p.then(function(r){if(r&&r.ok){sd.textContent="Draft saved";setTimeout(function(){sd.textContent="Save draft"},1600)}})});
 fz.addEventListener("click",function(){if(fz.disabled)return;if(K.status==="finalized"){openSend();return}fz.disabled=true;post({action:"case_finalize",id:D.active}).then(function(r){if(r&&r.ok){if(r.case){K=r.case;C.kase=K}C.readiness={ready:true,blockers:[]};redraw();openSend()}else{say((r&&(r.why||r.line))||"That did not finalize.");if(r&&r.blockers)C.readiness={ready:false,blockers:r.blockers};footP()}},function(){footP()})})}
// ---------- Preview report: the PDF as the case stands ----------
function dlg(id,title){var scrim=el("div",{class:"scrim",id:id+"Scrim"});var d=el("div",{class:"dlg",id:id,role:"dialog","aria-modal":"true","aria-label":title});scrim.appendChild(d);scrim.addEventListener("click",function(e){if(e.target===scrim)scrim.remove()});document.addEventListener("keydown",function(e){if(e.key==="Escape")scrim.remove()});document.body.appendChild(scrim);return{scrim:scrim,d:d}}
function preview(){var x=dlg("pvDlg","Preview report");x.d.appendChild(el("p",{class:"mute",id:"pdfmsg",text:"Building the report from the case as it stands."}));
 clearTimeout(whyT);post({action:"case_pdf",id:D.active,draft:K.status!=="finalized"}).then(function(r){x.d.textContent="";
  if(!r||!r.ok){x.d.appendChild(el("p",{class:"msg",id:"pdfmsg",text:(r&&(r.why||r.line))||"The report could not be built."}));return}
  var bin=atob(r.pdf_b64),u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);var url=URL.createObjectURL(new Blob([u],{type:"application/pdf"}));
  x.d.appendChild(el("div",{class:"pdfbar"},[el("span",{id:"pdfmsg",text:r.draft?"Draft, as the case stands now.":(r.reportNumber||"Finalized report")}),el("a",{class:"btn sm",id:"pdfopen",href:url,target:"_blank",rel:"noopener",text:"Open in a new tab"}),el("button",{type:"button",class:"btn sm",id:"pdfclose",text:"Close"})]));
  x.d.querySelector("#pdfclose").addEventListener("click",function(){x.scrim.remove()});x.d.appendChild(el("iframe",{id:"pdfframe",class:"pdfframe",title:"Report",src:url}))},function(){x.d.textContent="The report could not be built. The connection dropped."})}
// ---------- Send: nothing is sent until the recipient is confirmed in this step ----------
var sending=false;
function openSend(){if(sending)return;post({action:"case_send_preview",id:D.active}).then(function(r){
  if(!r||!r.ok){say((r&&(r.why||r.line))||"");return}
  var x=dlg("sendDlg","Send to seller");x.d.appendChild(el("h3",{id:"sendT",text:"Send to seller"}));
  function ro(l,t,id){var f=el("div",{class:"fld"},[el("span",{class:"rl",text:l}),el("div",{class:"ro",id:id,text:t||""})]);x.d.appendChild(f)}
  ro("From",[r.fromName,r.from].filter(Boolean).join(" "),"sendFrom");
  var to=el("input",{class:"txt",id:"sendTo",type:"email",autocomplete:"off","aria-label":"To",value:r.to||""});x.d.appendChild(el("div",{class:"fld"},[el("span",{class:"rl",text:"To"}),to]));
  ro("Subject",r.subject,"sendSubject");ro("Message",r.message,"sendMsg");ro("Attachment",(r.attachmentName||"")+(r.version!=null?"  Version "+r.version:""),"sendAtt");
  var earlier=r.alreadySent||[];if(earlier.length){var ea=el("div",{class:"fld",id:"sendEarlierBox"},[el("span",{class:"rl",text:"Earlier sends"})]);earlier.forEach(function(e){ea.appendChild(el("div",{class:"ro",text:(e.to||"")+(e.version!=null?" Version "+e.version:"")}))});x.d.appendChild(ea)}
  var err=el("p",{class:"msg",id:"sendErr",role:"alert",hidden:""}),go=el("button",{type:"button",class:"btn pri",id:"sendGo",text:"Send"}),no=el("button",{type:"button",class:"btn",id:"sendNo",text:"Cancel"});x.d.appendChild(err);x.d.appendChild(el("div",{class:"btns"},[go,no]));
  no.addEventListener("click",function(){x.scrim.remove()});to.focus();
  go.addEventListener("click",function(){if(sending)return;sending=true;go.disabled=true;no.disabled=true;err.hidden=true;var body={action:"case_send",id:D.active,version:r.version!=null?r.version:K.version,to:to.value.trim()};if(earlier.length)body.again=true;
   post(body).then(function(q){if(q&&q.ok){return(q.case?Promise.resolve(q.case):post({action:"case_get",id:D.active}).then(function(g2){return g2&&g2.case})).then(function(k){if(k){K=k;C.kase=k}sending=false;x.scrim.remove();redraw()})}sending=false;go.disabled=false;no.disabled=false;err.textContent=(q&&q.why)||"";err.hidden=!err.textContent},function(){sending=false;go.disabled=false;no.disabled=false})})})}
function rail(){var v=$("val");if(!v||v.firstChild)return;var rb=el("div",{class:"rb",id:"rb"});["rcond","rrange","rres","rlad","rwhy","rneeds"].forEach(function(i){rb.appendChild(sect(i))});v.appendChild(rb);v.appendChild(sect("rfoot","foot"))}
function railP(){condP();rangeP();reserveP();ladderP();whyP();needsP();footP()}
function redraw(){head();vehicle();market();closest();railP()}
rail();railP();
}
`;
