// DESK V2, THE OPEN CASE (Lane S, Nov 15 2026): the centre column's browser half. STAGE 2: the compact header, the vehicle summary, the market summary and the Closest sales.
// It draws what the server sent and computes nothing: no median, no sum of money, no sort of prices. The chart's positions are scale only (a dot's place on the axis); every printed figure is a field the server sent.
export const DESK_V2_CASE_JS = String.raw`
var C=D.case,K=C&&C.kase;
if(C){
function g(n){return K&&K.desk&&K.desk[n]}
function ev(){return g("evidence")||{}}
function say(t){var m=$("msg");if(m){m.textContent=t||"";m.hidden=!t}}
var chain=Promise.resolve();
function send(action,x){x=x||{};x.action=action;x.id=D.active;var run=chain.then(function(){return post(x)}).then(function(r){if(r&&r.ok){if(r.case){K=r.case;C.kase=K}say("");return r}say((r&&(r.why||r.line))||"That did not save.");return r},function(){say("That did not save. The connection dropped.");return {ok:false}});chain=run.catch(function(){});return run}
function edit(op,x){x=x||{};x.op=op;return send("case_edit",x)}
function tagOf(f){if(!f||f.value==null||f.value===""||f.source==="missing"||f.source==="conflicting")return["needs",C.tags.needs];if(f.verified===true||f.source==="analyst_verified"||f.source==="vin_decoded"||f.source==="records")return["verified",C.tags.verified];return["seller",C.tags.seller]}
// ---------- the compact header ----------
function head(){var h=$("s-head");h.textContent="";
 var top=el("div",{class:"hd"},[el("h1",{class:"ct",id:"ct",text:C.title||""}),el("span",{class:"pill big","data-st":C.statusKey,id:"hpill",text:C.statusLabel||""})]);
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
 if(key){v.setAttribute("tabindex","0");v.setAttribute("role","button");v.setAttribute("title","Edit");function go(){if(r.querySelector("input"))return;var f=(K.fields||{})[key],inp=el("input",{class:"txt",type:"text",value:f&&f.value!=null?String(f.value):""});v.textContent="";v.appendChild(inp);inp.focus();inp.select();var done=false;function fin(save){if(done)return;done=true;if(save&&inp.value.trim()!==(f&&f.value!=null?String(f.value):"")){edit("field",{field:key,value:inp.value.trim()}).then(function(){vehicle()})}else vehicle()}inp.addEventListener("blur",function(){fin(true)});inp.addEventListener("keydown",function(e){if(e.key==="Enter")fin(true);if(e.key==="Escape")fin(false)})}v.addEventListener("click",go);v.addEventListener("keydown",function(e){if(e.key==="Enter")go()})}
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
function lens(){var seg=el("span",{class:"seg",id:"lens",role:"group","aria-label":"Period"}),e=ev();(g("windows")||[]).forEach(function(w){var b=el("button",{type:"button","data-m":w.months,class:Number(e.windowMonths)===Number(w.months)?"on":"",text:w.label});b.addEventListener("click",function(){if(b.classList.contains("on"))return;c0().classList.add("busy");edit("window",{months:w.months}).then(function(){c0().classList.remove("busy");market();closest()})});seg.appendChild(b)});return seg}
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
 if(ex){body.appendChild(el("p",{class:"sx",text:"Excluded: "+(ex.reason||"")}));var rb=el("button",{type:"button",class:"btn sm","data-restore":c.id,text:"Restore"});rb.addEventListener("click",function(){edit("restore",{saleId:String(c.id)}).then(function(){market();closest()})});body.appendChild(rb)}
 else{var act=el("div",{class:"sa"}),lab=el("label",{class:"inr"}),cb=el("input",{type:"checkbox","data-tick":c.id});cb.checked=inRep(c);cb.addEventListener("change",function(){var ids=(K.selectedComparables||[]).map(String),i=ids.indexOf(String(c.id));if(cb.checked&&i<0)ids.push(String(c.id));else if(!cb.checked&&i>=0)ids.splice(i,1);K.selectedComparables=ids;edit("comparables",{ids:ids}).then(function(){closest()})});lab.appendChild(cb);lab.appendChild(el("span",{text:"In report"}));act.appendChild(lab);
  var xb=el("button",{type:"button",class:"btn sm","data-exclude":c.id,text:"Exclude"}),form=el("div",{class:"xf",hidden:""},[el("input",{class:"txt","data-reason":c.id,type:"text",placeholder:"Why exclude this sale",autocomplete:"off","aria-label":"Reason"}),el("button",{type:"button",class:"btn sm pri","data-confirm":c.id,text:"Exclude"})]);
  function sub(){var inp=form.querySelector("input"),why2=inp.value.trim();if(!why2){inp.placeholder="Say why first";inp.focus();return}edit("exclude",{saleId:String(c.id),scope:"market_calc",reason:why2}).then(function(r){if(r&&r.ok){market();closest()}})}
  xb.addEventListener("click",function(){form.hidden=!form.hidden;if(!form.hidden)form.querySelector("input").focus()});form.querySelector("button").addEventListener("click",sub);form.querySelector("input").addEventListener("keydown",function(e){if(e.key==="Enter")sub()});
  act.appendChild(xb);body.appendChild(act);body.appendChild(form)}
 box.appendChild(body);return box}
function closest(){var c=$("s-closest");c.textContent="";var list=g("comparables")||[],ordered=list.filter(isH).concat(list.filter(function(x){return !isH(x)})),n=g("comparablesCount")!=null?g("comparablesCount"):list.length;
 var h=el("div",{class:"sec-h"},[el("h3",{text:"Closest sales"})]);
 if(n>4){var all=el("button",{type:"button",class:"link",id:"viewall","aria-expanded":showAll?"true":"false",text:showAll?"Show fewer":"View all "+n+" sales"});all.addEventListener("click",function(){showAll=!showAll;closest()});h.appendChild(all)}c.appendChild(h);
 if(!ordered.length){if(g("comparablesNote"))c.appendChild(el("p",{class:"mute",text:g("comparablesNote")}));return}
 var grid=el("div",{class:"sgrid",id:"sgrid"});(showAll?ordered:ordered.slice(0,4)).forEach(function(x){grid.appendChild(card(x))});c.appendChild(grid)}
head();vehicle();market();closest();
}
`;
